// Streams audio rendered in the page (the retro emulators) into a Web Audio
// graph: blocks are rendered a little ahead and scheduled back to back as
// AudioBufferSourceNodes. Pausing keeps the rendered-but-unheard audio, so
// resuming continues exactly where it stopped; seeking re-renders from the
// start of the tune (emulation is deterministic), in slices so the page
// stays responsive.

/** What a chip emulator provides (e.g. NsfPlayer bound to one song). */
export interface ChipRenderer {
  readonly sampleRate: number;
  /** (Re)starts the tune at 0 s. */
  restart(): void;
  render(out: Float32Array): void;
  /** Advances without producing audio (faster than rendering); optional. */
  skip?(samples: number): void;
  /** The emulator's state, to seek back to without replaying from 0; optional (with restore). */
  snapshot?(): unknown;
  restore?(state: unknown): void;
  /** A second, independent renderer of the same tune (scans ahead for snapshots in the background); optional. */
  fork?(): ChipRenderer;
  /** The raw output level now (constant while silent), so the scan can find where a tune ends; optional. */
  level?(): number;
}

export interface ChipStreamEvents {
  onStatus(status: 'playing' | 'paused' | 'buffering'): void;
  onClock(position: number, duration: number, bufferedAhead: number): void;
  /** The duration changed (the tune fell silent before its nominal length). */
  onDuration(duration: number): void;
  onEnded(): void;
}

/** Seconds rendered ahead of what is heard. */
const LOOKAHEAD = 0.75;
const BLOCK = 2048;
const TICK_MS = 40;
/** Fade-out at the end of a tune's play length, in seconds. */
const FADE = 5;
/** A tune this silent for this long has ended (jingles, one-shot songs). */
const SILENCE_SECONDS = 3;
const SILENCE_LEVEL = 1e-3;
/** Seeking advances this much audio per slice before yielding to the page. */
const SEEK_SLICE_SECONDS = 2;
/** The emulator's state is kept this often, so a seek replays at most this much. */
const SNAPSHOT_EVERY_SECONDS = 10;
/** The background scan advances this much audio per slice (a few tens of ms of work). */
const SCAN_SLICE_SECONDS = 1.5;

interface Scheduled {
  node: AudioBufferSourceNode;
  /** Context time the block starts. */
  at: number;
  data: Float32Array;
}

export class ChipStream {
  private readonly gain: GainNode;
  private timer: ReturnType<typeof setInterval> | null = null;
  private scheduled: Scheduled[] = [];
  /** Rendered, not yet scheduled (kept over a pause). */
  private pending: Float32Array[] = [];
  /** Samples rendered since the start of the tune. */
  private rendered = 0;
  /** Samples of the tune scheduled so far (the next block starts here). */
  private scheduledSamples = 0;
  /** Context time at which scheduledSamples is heard. */
  private scheduledUntil = 0;
  private silentRun = 0;
  private playing = false;
  private ended = false;
  private seekToken = 0;
  private pausedAt = 0;
  /** Emulator snapshots by sample position (ascending), from rendering and the background scan. */
  private snapshots: { at: number; state: unknown }[] = [];
  private scanning = false;
  private disposed = false;
  duration: number;

  constructor(
    private readonly ctx: BaseAudioContext,
    destination: AudioNode,
    private readonly renderer: ChipRenderer,
    duration: number,
    private readonly events: ChipStreamEvents,
  ) {
    this.duration = duration;
    this.gain = ctx.createGain();
    this.gain.connect(destination);
    renderer.restart();
  }

  private get rate() {
    return this.renderer.sampleRate;
  }

  /** Seconds into the tune that are being heard now. */
  get position(): number {
    if (!this.playing) return this.pausedAt;
    const heard = this.scheduledSamples / this.rate - Math.max(0, this.scheduledUntil - this.ctx.currentTime);
    return Math.max(0, Math.min(this.duration, heard));
  }

  play() {
    this.scanAhead();
    if (this.playing || this.ended) return;
    this.playing = true;
    this.scheduledUntil = this.ctx.currentTime + 0.05;
    this.scheduledSamples = Math.round(this.pausedAt * this.rate);
    this.tick();
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.events.onStatus('playing');
  }

  pause() {
    if (!this.playing) return;
    this.pausedAt = this.position;
    this.playing = false;
    this.stopTimer();
    // what was scheduled but not heard yet goes back in front of the pending audio
    const now = this.ctx.currentTime;
    const unheard: Float32Array[] = [];
    for (const s of this.scheduled) {
      const end = s.at + s.data.length / this.rate;
      if (end > now) unheard.push(s.at >= now ? s.data : s.data.subarray(Math.floor((now - s.at) * this.rate)));
      s.node.onended = null;
      s.node.stop();
      s.node.disconnect();
    }
    this.scheduled = [];
    this.pending = [...unheard, ...this.pending];
    this.events.onStatus('paused');
  }

  /** Jumps to `seconds`: re-renders the tune up to there (in slices), then continues. */
  seek(seconds: number) {
    const target = Math.max(0, Math.min(this.duration - 0.1, seconds));
    const resume = this.playing || this.seekToken > 0;
    this.pause();
    this.pending = [];
    this.ended = false;
    this.silentRun = 0;
    this.pausedAt = target;
    const token = ++this.seekToken;
    this.events.onStatus('buffering');
    this.events.onClock(target, this.duration, 0);
    const targetSamples = Math.round(target * this.rate);
    // continue from the latest snapshot at or before the target; without one, from the start
    const from = [...this.snapshots].reverse().find((s) => s.at <= targetSamples);
    if (from && this.renderer.restore) {
      this.renderer.restore(from.state);
      this.rendered = from.at;
    } else {
      this.renderer.restart();
      this.rendered = 0;
    }
    const scratch = new Float32Array(BLOCK);
    const step = () => {
      if (token !== this.seekToken) return; // superseded
      const sliceEnd = Math.min(targetSamples, this.rendered + SEEK_SLICE_SECONDS * this.rate);
      while (this.rendered < sliceEnd) {
        const n = Math.min(BLOCK, sliceEnd - this.rendered);
        if (this.renderer.skip) this.renderer.skip(n);
        else this.renderer.render(scratch.subarray(0, n));
        this.rendered += n;
        this.takeSnapshot();
      }
      if (this.rendered < targetSamples) {
        setTimeout(step, 0);
        return;
      }
      this.seekToken = 0;
      if (resume) this.play();
      else this.events.onStatus('paused');
    };
    step();
  }

  setVolume(volume: number, muted: boolean) {
    const v = muted ? 0 : Math.max(0, Math.min(1, volume));
    this.gain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.015);
  }

  /** Stops and disconnects; the stream cannot be used afterwards. */
  dispose() {
    this.disposed = true;
    this.seekToken++;
    this.pause();
    this.pending = [];
    this.gain.disconnect();
  }

  private stopTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** The next block of the tune, with the end fade applied; null after the end. */
  private nextBlock(): Float32Array | null {
    const queued = this.pending.shift();
    if (queued) return queued;
    const total = Math.round(this.duration * this.rate);
    if (this.rendered >= total) return null;
    const out = new Float32Array(Math.min(BLOCK, total - this.rendered));
    this.renderer.render(out);
    const fadeStart = total - FADE * this.rate;
    let silent = true;
    for (let i = 0; i < out.length; i++) {
      const at = this.rendered + i;
      if (at > fadeStart) out[i]! *= Math.max(0, (total - at) / (FADE * this.rate));
      if (Math.abs(out[i]!) > SILENCE_LEVEL) silent = false;
    }
    this.rendered += out.length;
    this.takeSnapshot();
    this.silentRun = silent ? this.silentRun + out.length : 0;
    // a tune that has fallen silent (after a moment of sound) ends there
    if (this.silentRun >= SILENCE_SECONDS * this.rate && this.rendered > this.silentRun) {
      this.duration = (this.rendered - this.silentRun) / this.rate + 0.5;
      this.events.onDuration(this.duration);
    }
    return out;
  }

  /** Keeps the emulator's state each time another SNAPSHOT_EVERY_SECONDS has been advanced past the last one. */
  private takeSnapshot() {
    if (!this.renderer.snapshot) return;
    const last = this.snapshots.at(-1)?.at ?? 0;
    if (this.rendered - last >= SNAPSHOT_EVERY_SECONDS * this.rate) this.addSnapshot(this.rendered, this.renderer.snapshot());
  }

  private addSnapshot(at: number, state: unknown) {
    if (this.snapshots.some((s) => s.at === at)) return;
    this.snapshots.push({ at, state });
    this.snapshots.sort((a, b) => a.at - b.at);
  }

  /**
   * Runs a second renderer through the whole tune in small slices, keeping a
   * snapshot at every SNAPSHOT_EVERY_SECONDS, so any seek later replays at
   * most that much (instead of everything from the start).
   */
  private scanAhead() {
    if (this.scanning || !this.renderer.fork || !this.renderer.snapshot) return;
    const scan = this.renderer.fork();
    if (!scan.skip || !scan.snapshot) return;
    this.scanning = true;
    scan.restart();
    const every = SNAPSHOT_EVERY_SECONDS * this.rate;
    // the level is looked at about every 10 ms, at uneven steps so a held tone
    // cannot alias to a steady value: a tune that holds one level this long has ended
    const probes = [Math.round(this.rate * 0.009), Math.round(this.rate * 0.0117)];
    let probeIndex = 0;
    const silentFor = SILENCE_SECONDS * this.rate;
    let pos = 0;
    let lastLevel = Number.NaN;
    let steadySince = 0;
    let sounded = false;
    const step = () => {
      if (this.disposed) return;
      const total = Math.round(this.duration * this.rate);
      const sliceEnd = Math.min(total, pos + SCAN_SLICE_SECONDS * this.rate);
      while (pos < sliceEnd) {
        const boundary = (Math.floor(pos / every) + 1) * every;
        const next = Math.min(boundary, sliceEnd, pos + probes[probeIndex++ & 1]!);
        scan.skip!(next - pos);
        pos = next;
        if (pos === boundary) this.addSnapshot(pos, scan.snapshot!());
        if (scan.level) {
          const level = scan.level();
          if (Number.isNaN(lastLevel) || Math.abs(level - lastLevel) > 1e-9) {
            if (!Number.isNaN(lastLevel)) sounded = true;
            lastLevel = level;
            steadySince = pos;
          } else if (sounded && pos - steadySince >= silentFor) {
            // the tune ended where the level stopped changing (a short tail is kept)
            const end = steadySince / this.rate + 0.5;
            if (end < this.duration) {
              this.duration = end;
              this.events.onDuration(end);
            }
            return;
          }
        }
      }
      if (pos < total) setTimeout(step, 0);
    };
    setTimeout(step, 0);
  }

  private tick() {
    if (!this.playing) return;
    const now = this.ctx.currentTime;
    // a stall (hidden tab, busy page) must not schedule blocks in the past
    if (this.scheduledUntil < now) this.scheduledUntil = now + 0.02;
    this.scheduled = this.scheduled.filter((s) => s.at + s.data.length / this.rate > now);
    while (this.scheduledUntil - now < LOOKAHEAD) {
      const block = this.nextBlock();
      if (!block) break;
      const buffer = this.ctx.createBuffer(1, block.length, this.rate);
      buffer.copyToChannel(block as Float32Array<ArrayBuffer>, 0);
      const node = this.ctx.createBufferSource();
      node.buffer = buffer;
      node.connect(this.gain);
      node.start(this.scheduledUntil);
      this.scheduled.push({ node, at: this.scheduledUntil, data: block });
      this.scheduledUntil += block.length / this.rate;
      this.scheduledSamples += block.length;
    }
    const position = this.position;
    this.events.onClock(position, this.duration, Math.max(0, this.scheduledUntil - now));
    if (!this.ended && position >= this.duration - 0.02 && this.scheduled.length === 0) {
      this.ended = true;
      this.playing = false;
      this.pausedAt = this.duration;
      this.stopTimer();
      this.events.onEnded();
    }
  }
}
