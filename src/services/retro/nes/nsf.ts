// NSF (NES Sound Format) files and their playback: the file's own music
// driver runs on the 6502 core against the 2A03 APU, as on the console.
// Format: NESdev wiki "NSF". Expansion audio (VRC6, VRC7, FDS, MMC5, N163,
// Sunsoft 5B) is not emulated: such tunes play their 2A03 part only.

import { Apu } from './apu';
import { Cpu6502 } from './cpu';

export const NTSC_CPU_HZ = 1789773;

/** NSF songs loop forever; each plays this long (then fades out), unless it falls silent first. */
export const NSF_TRACK_SECONDS = 150;

export interface NsfFile {
  version: number;
  /** Number of songs (tunes), 1…256. */
  songs: number;
  /** 1-based song the file starts with. */
  startSong: number;
  loadAddr: number;
  initAddr: number;
  playAddr: number;
  name: string;
  artist: string;
  copyright: string;
  /** Play routine period in microseconds (NTSC). */
  speedNtsc: number;
  /** Initial bank per 4 KB page $8000–$FFFF, or null when the file is not bank-switched. */
  banks: number[] | null;
  pal: boolean;
  /** Expansion sound chips this file uses (not emulated). */
  expansion: string[];
  data: Uint8Array;
}

export class NsfError extends Error {}

const EXPANSION = ['VRC6', 'VRC7', 'FDS', 'MMC5', 'N163', 'Sunsoft 5B'];

function text(bytes: Uint8Array, start: number): string {
  let s = '';
  for (let i = start; i < start + 32 && bytes[i]; i++) s += String.fromCharCode(bytes[i]!);
  const t = s.trim();
  return t === '<?>' || t === '?' ? '' : t;
}

export function parseNsf(buffer: ArrayBuffer | Uint8Array): NsfFile {
  const b = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (b.length < 0x80 || b[0] !== 0x4e || b[1] !== 0x45 || b[2] !== 0x53 || b[3] !== 0x4d || b[4] !== 0x1a) {
    throw new NsfError('Not an NSF file.');
  }
  const u16 = (o: number) => b[o]! | (b[o + 1]! << 8);
  const bankBytes = Array.from(b.subarray(0x70, 0x78));
  const flags = b[0x7b]!;
  const loadAddr = u16(0x08);
  const songs = Math.max(1, b[0x06]!);
  const nsf: NsfFile = {
    version: b[0x05]!,
    songs,
    startSong: Math.min(songs, Math.max(1, b[0x07]!)),
    loadAddr,
    initAddr: u16(0x0a),
    playAddr: u16(0x0c),
    name: text(b, 0x0e),
    artist: text(b, 0x2e),
    copyright: text(b, 0x4e),
    speedNtsc: u16(0x6e) || 16639,
    banks: bankBytes.some((x) => x !== 0) ? bankBytes : null,
    pal: (b[0x7a]! & 3) === 1,
    expansion: EXPANSION.filter((_, i) => flags & (1 << i)),
    data: b.subarray(0x80),
  };
  if (!nsf.banks && loadAddr < 0x8000) throw new NsfError('The NSF load address is outside the cartridge area.');
  return nsf;
}

/** Brings the 2A03's level (about −20 dBFS RMS) near other music; peaks are softly limited. */
const OUTPUT_GAIN = 2.8;
function softClip(x: number): number {
  const a = Math.abs(x);
  if (a <= 0.8) return x;
  // above 0.8, approach ±1 smoothly instead of clipping
  return Math.sign(x) * (0.8 + 0.2 * Math.tanh((a - 0.8) / 0.2));
}

/** An NsfPlayer's complete state at one moment. */
export interface NsfSnapshot {
  cpu: { a: number; x: number; y: number; sp: number; pc: number; p: number; cycles: number };
  ram: Uint8Array;
  wram: Uint8Array;
  banks: Uint8Array;
  apu: Record<string, unknown>;
  player: { cycleInSample: number; nextPlay: number; cycle: number; inRoutine: boolean; filters: number[]; position: number };
}

/** Address the play/init routines return to; never mapped, so reaching it ends the call. */
const RETURN_ADDR = 0x4ff0;
/** A routine that runs longer than this is cut off (some INITs loop forever). */
const INIT_CYCLE_LIMIT = NTSC_CPU_HZ * 2;

/**
 * Renders one song of an NSF file to audio samples. Deterministic: the same
 * file, song and sample rate always give the same samples.
 */
export class NsfPlayer {
  private readonly ram = new Uint8Array(0x800);
  private readonly wram = new Uint8Array(0x2000);
  private readonly bankRegs = new Uint8Array(8);
  private readonly rom: Uint8Array;
  private readonly cpu: Cpu6502;
  private readonly apu: Apu;
  private readonly cyclesPerSample: number;
  private readonly frameCycles: number;
  private cycleInSample = 0;
  private nextPlay = 0;
  private cycle = 0;
  private inRoutine = false;
  // output filters (NESdev "APU Mixer": 90 Hz and 440 Hz high-pass, 14 kHz low-pass)
  private readonly hp1: number;
  private readonly hp2: number;
  private readonly lp: number;
  private hp1Prev = 0;
  private hp1Out = 0;
  private hp2Prev = 0;
  private hp2Out = 0;
  private lpOut = 0;
  /** Samples rendered since the song started. */
  position = 0;

  constructor(
    readonly nsf: NsfFile,
    readonly sampleRate: number,
  ) {
    // bank-switched data starts at (loadAddr & $FFF) inside its first 4 KB bank
    const pad = nsf.banks ? nsf.loadAddr & 0x0fff : 0;
    const rom = new Uint8Array(Math.ceil((pad + nsf.data.length) / 0x1000) * 0x1000 || 0x1000);
    rom.set(nsf.data, pad);
    this.rom = rom;
    const bus = { read: (a: number) => this.read(a), write: (a: number, v: number) => this.write(a, v) };
    this.cpu = new Cpu6502(bus);
    this.apu = new Apu((a) => this.read(a));
    this.cyclesPerSample = NTSC_CPU_HZ / sampleRate;
    this.frameCycles = (nsf.speedNtsc * NTSC_CPU_HZ) / 1_000_000;
    const rc = (hz: number) => 1 / (2 * Math.PI * hz);
    const dt = 1 / sampleRate;
    this.hp1 = rc(90) / (rc(90) + dt);
    this.hp2 = rc(440) / (rc(440) + dt);
    this.lp = dt / (rc(14000) + dt);
  }

  // ---- memory map ----
  private read(a: number): number {
    if (a < 0x2000) return this.ram[a & 0x7ff]!;
    if (a >= 0x4000 && a <= 0x4017) return this.apu.read(a);
    if (a >= 0x6000 && a < 0x8000) return this.wram[a - 0x6000]!;
    if (a >= 0x8000) {
      if (this.nsf.banks) {
        const bank = this.bankRegs[(a - 0x8000) >> 12]!;
        const off = bank * 0x1000 + (a & 0x0fff);
        return off < this.rom.length ? this.rom[off]! : 0;
      }
      const off = a - this.nsf.loadAddr;
      return off >= 0 && off < this.rom.length ? this.rom[off]! : 0;
    }
    return 0;
  }
  private write(a: number, v: number) {
    if (a < 0x2000) this.ram[a & 0x7ff] = v;
    else if (a >= 0x4000 && a <= 0x4017) this.apu.write(a, v);
    else if (a >= 0x5ff8 && a <= 0x5fff) this.bankRegs[a - 0x5ff8] = v;
    else if (a >= 0x6000 && a < 0x8000) this.wram[a - 0x6000] = v;
  }

  /** Calls a routine as JSR would; it returns to RETURN_ADDR. */
  private call(addr: number) {
    const ret = RETURN_ADDR - 1;
    this.cpu.push(ret >> 8);
    this.cpu.push(ret & 0xff);
    this.cpu.pc = addr;
    this.inRoutine = true;
  }

  /** Stops the current song and starts `song` (1-based), as an NSF player's INIT. */
  start(song: number) {
    this.ram.fill(0);
    this.wram.fill(0);
    if (this.nsf.banks) this.bankRegs.set(this.nsf.banks);
    for (let a = 0x4000; a <= 0x4013; a++) this.apu.write(a, 0);
    this.apu.write(0x4015, 0);
    this.apu.write(0x4015, 0x0f);
    this.apu.write(0x4017, 0x40);
    const cpu = this.cpu;
    cpu.sp = 0xff;
    cpu.a = Math.min(this.nsf.songs, Math.max(1, song)) - 1;
    cpu.x = this.nsf.pal ? 1 : 0;
    cpu.y = 0;
    this.call(this.nsf.initAddr);
    // INIT runs to completion before the first PLAY
    const until = cpu.cycles + INIT_CYCLE_LIMIT;
    while (this.inRoutine && cpu.cycles < until) {
      if (cpu.pc === RETURN_ADDR) this.inRoutine = false;
      else cpu.step();
    }
    this.inRoutine = false;
    this.cycle = 0;
    this.nextPlay = 0;
    this.cycleInSample = 0;
    this.position = 0;
    this.hp1Prev = this.hp1Out = this.hp2Prev = this.hp2Out = this.lpOut = 0;
  }

  /** Fills `out` with the next samples (mono, about −1…1). */
  render(out: Float32Array) {
    const cpu = this.cpu;
    const apu = this.apu;
    for (let i = 0; i < out.length; i++) {
      this.cycleInSample += this.cyclesPerSample;
      let sum = 0;
      let n = 0;
      while (this.cycleInSample >= 1) {
        if (!this.inRoutine && this.cycle >= this.nextPlay) {
          this.call(this.nsf.playAddr);
          this.nextPlay += this.frameCycles;
        }
        let c = 1;
        if (this.inRoutine) {
          if (cpu.pc === RETURN_ADDR) this.inRoutine = false;
          else c = cpu.step();
        }
        for (let k = 0; k < c; k++) {
          apu.clock();
          sum += apu.output();
          n++;
        }
        this.cycle += c;
        this.cycleInSample -= c;
      }
      const x = n ? sum / n : 0;
      // high-pass 90 Hz, high-pass 440 Hz, low-pass 14 kHz
      this.hp1Out = this.hp1 * (this.hp1Out + x - this.hp1Prev);
      this.hp1Prev = x;
      this.hp2Out = this.hp2 * (this.hp2Out + this.hp1Out - this.hp2Prev);
      this.hp2Prev = this.hp1Out;
      this.lpOut += this.lp * (this.hp2Out - this.lpOut);
      out[i] = softClip(this.lpOut * OUTPUT_GAIN);
    }
    this.position += out.length;
  }

  /** Renders and discards audio up to `seconds` into the song (seeking forward). */
  skipTo(seconds: number) {
    this.skip(Math.max(0, Math.floor(seconds * this.sampleRate) - this.position));
  }

  /**
   * Advances `samples` without producing audio (for seeking): the driver and
   * the APU run as when rendering, only the mixer and filters are skipped,
   * so the audio afterwards is the same as if it had been rendered.
   */
  skip(samples: number) {
    const cpu = this.cpu;
    const apu = this.apu;
    for (let i = 0; i < samples; i++) {
      this.cycleInSample += this.cyclesPerSample;
      while (this.cycleInSample >= 1) {
        if (!this.inRoutine && this.cycle >= this.nextPlay) {
          this.call(this.nsf.playAddr);
          this.nextPlay += this.frameCycles;
        }
        let c = 1;
        if (this.inRoutine) {
          if (cpu.pc === RETURN_ADDR) this.inRoutine = false;
          else c = cpu.step();
        }
        for (let k = 0; k < c; k++) apu.clock();
        this.cycle += c;
        this.cycleInSample -= c;
      }
    }
    // the filters start again from the level they will see next
    this.position += samples;
  }

  /** The complete playing state, to return to later (seeking by snapshot). */
  snapshot(): NsfSnapshot {
    const c = this.cpu;
    return {
      cpu: { a: c.a, x: c.x, y: c.y, sp: c.sp, pc: c.pc, p: c.p, cycles: c.cycles },
      ram: this.ram.slice(),
      wram: this.wram.slice(),
      banks: this.bankRegs.slice(),
      apu: this.apu.saveState(),
      player: {
        cycleInSample: this.cycleInSample,
        nextPlay: this.nextPlay,
        cycle: this.cycle,
        inRoutine: this.inRoutine,
        filters: [this.hp1Prev, this.hp1Out, this.hp2Prev, this.hp2Out, this.lpOut],
        position: this.position,
      },
    };
  }

  restore(state: unknown) {
    const s = state as NsfSnapshot;
    Object.assign(this.cpu, s.cpu);
    this.ram.set(s.ram);
    this.wram.set(s.wram);
    this.bankRegs.set(s.banks);
    this.apu.loadState(s.apu);
    const p = s.player;
    this.cycleInSample = p.cycleInSample;
    this.nextPlay = p.nextPlay;
    this.cycle = p.cycle;
    this.inRoutine = p.inRoutine;
    [this.hp1Prev, this.hp1Out, this.hp2Prev, this.hp2Out, this.lpOut] = p.filters as [number, number, number, number, number];
    this.position = p.position;
  }


  /** The APU's output level right now (before the filters); constant while the tune is silent. */
  get level(): number {
    return this.apu.output();
  }

  /** Opcodes the file's driver used that the core does not implement. */
  get unknownOpcodes(): number {
    return this.cpu.unknownOpcodes;
  }
}
