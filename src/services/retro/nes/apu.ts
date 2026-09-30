// NES 2A03 audio (APU), NTSC timing, clocked once per CPU cycle: two pulse
// channels, triangle, noise and DMC, the frame sequencer, and the hardware's
// non-linear mixer. Behaviour and tables follow the NESdev wiki's APU pages.

const LENGTH_TABLE = [10, 254, 20, 2, 40, 4, 80, 6, 160, 8, 60, 10, 14, 12, 26, 14, 12, 16, 24, 18, 48, 20, 96, 22, 192, 24, 72, 26, 16, 28, 32, 30];
const DUTY = [
  [0, 1, 0, 0, 0, 0, 0, 0],
  [0, 1, 1, 0, 0, 0, 0, 0],
  [0, 1, 1, 1, 1, 0, 0, 0],
  [1, 0, 0, 1, 1, 1, 1, 1],
];
const TRIANGLE = [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
/** Noise periods in CPU cycles (NTSC). */
const NOISE_PERIOD = [4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068];
/** DMC rates in CPU cycles (NTSC). */
const DMC_RATE = [428, 380, 340, 320, 286, 254, 226, 214, 190, 160, 142, 128, 106, 84, 72, 54];

/** Frame sequencer steps in CPU cycles (NTSC). */
const STEP4 = [7457, 14913, 22371, 29829];
const STEP5 = [7457, 14913, 22371, 29829, 37281];

class Envelope {
  start = false;
  loop = false;
  constant = false;
  period = 0;
  divider = 0;
  decay = 0;
  clock() {
    if (this.start) {
      this.start = false;
      this.decay = 15;
      this.divider = this.period;
    } else if (this.divider === 0) {
      this.divider = this.period;
      if (this.decay > 0) this.decay--;
      else if (this.loop) this.decay = 15;
    } else this.divider--;
  }
  get volume() {
    return this.constant ? this.period : this.decay;
  }
}

class Pulse {
  enabled = false;
  length = 0;
  duty = 0;
  step = 0;
  timer = 0;
  period = 0;
  readonly env = new Envelope();
  sweepEnabled = false;
  sweepPeriod = 0;
  sweepNegate = false;
  sweepShift = 0;
  sweepDivider = 0;
  sweepReload = false;

  constructor(private readonly ones: boolean) {}

  write(reg: number, v: number) {
    switch (reg) {
      case 0:
        this.duty = v >> 6;
        this.env.loop = (v & 0x20) !== 0;
        this.env.constant = (v & 0x10) !== 0;
        this.env.period = v & 0x0f;
        break;
      case 1:
        this.sweepEnabled = (v & 0x80) !== 0;
        this.sweepPeriod = (v >> 4) & 7;
        this.sweepNegate = (v & 0x08) !== 0;
        this.sweepShift = v & 7;
        this.sweepReload = true;
        break;
      case 2:
        this.period = (this.period & 0x700) | v;
        break;
      case 3:
        this.period = (this.period & 0xff) | ((v & 7) << 8);
        if (this.enabled) this.length = LENGTH_TABLE[v >> 3]!;
        this.step = 0;
        this.env.start = true;
        break;
    }
  }
  /** Clocked every APU cycle (every second CPU cycle). */
  clockTimer() {
    if (this.timer === 0) {
      this.timer = this.period;
      this.step = (this.step + 1) & 7;
    } else this.timer--;
  }
  private target() {
    const change = this.period >> this.sweepShift;
    return this.sweepNegate ? this.period - change - (this.ones ? 1 : 0) : this.period + change;
  }
  private muted() {
    return this.period < 8 || this.target() > 0x7ff;
  }
  clockSweep() {
    if (this.sweepDivider === 0 && this.sweepEnabled && this.sweepShift > 0 && !this.muted()) this.period = Math.max(0, this.target());
    if (this.sweepDivider === 0 || this.sweepReload) {
      this.sweepDivider = this.sweepPeriod;
      this.sweepReload = false;
    } else this.sweepDivider--;
  }
  clockLength() {
    if (this.length > 0 && !this.env.loop) this.length--;
  }
  output() {
    if (this.length === 0 || this.muted() || !DUTY[this.duty]![this.step]) return 0;
    return this.env.volume;
  }
}

class Triangle {
  enabled = false;
  length = 0;
  control = false;
  linearReload = 0;
  linear = 0;
  reloadFlag = false;
  period = 0;
  timer = 0;
  step = 0;
  write(reg: number, v: number) {
    switch (reg) {
      case 0:
        this.control = (v & 0x80) !== 0;
        this.linearReload = v & 0x7f;
        break;
      case 2:
        this.period = (this.period & 0x700) | v;
        break;
      case 3:
        this.period = (this.period & 0xff) | ((v & 7) << 8);
        if (this.enabled) this.length = LENGTH_TABLE[v >> 3]!;
        this.reloadFlag = true;
        break;
    }
  }
  /** Clocked every CPU cycle. */
  clockTimer() {
    if (this.timer === 0) {
      this.timer = this.period;
      if (this.length > 0 && this.linear > 0) this.step = (this.step + 1) & 31;
    } else this.timer--;
  }
  clockLinear() {
    if (this.reloadFlag) this.linear = this.linearReload;
    else if (this.linear > 0) this.linear--;
    if (!this.control) this.reloadFlag = false;
  }
  clockLength() {
    if (this.length > 0 && !this.control) this.length--;
  }
  output() {
    // Ultrasonic periods (< 2) are inaudible on hardware but pop in a
    // resampler; hold the mid level instead, as most players do.
    if (this.period < 2) return 7.5;
    return TRIANGLE[this.step]!;
  }
}

class Noise {
  enabled = false;
  length = 0;
  readonly env = new Envelope();
  mode = false;
  period = NOISE_PERIOD[0]!;
  timer = 0;
  shift = 1;
  write(reg: number, v: number) {
    switch (reg) {
      case 0:
        this.env.loop = (v & 0x20) !== 0;
        this.env.constant = (v & 0x10) !== 0;
        this.env.period = v & 0x0f;
        break;
      case 2:
        this.mode = (v & 0x80) !== 0;
        this.period = NOISE_PERIOD[v & 0x0f]!;
        break;
      case 3:
        if (this.enabled) this.length = LENGTH_TABLE[v >> 3]!;
        this.env.start = true;
        break;
    }
  }
  /** Clocked every CPU cycle (the period table is in CPU cycles). */
  clockTimer() {
    if (this.timer === 0) {
      this.timer = this.period - 1;
      const feedback = (this.shift & 1) ^ ((this.shift >> (this.mode ? 6 : 1)) & 1);
      this.shift = (this.shift >> 1) | (feedback << 14);
    } else this.timer--;
  }
  clockLength() {
    if (this.length > 0 && !this.env.loop) this.length--;
  }
  output() {
    return this.length === 0 || this.shift & 1 ? 0 : this.env.volume;
  }
}

class Dmc {
  irqEnabled = false;
  loop = false;
  rate = DMC_RATE[0]!;
  timer = 0;
  level = 0;
  sampleAddr = 0xc000;
  sampleLength = 1;
  addr = 0xc000;
  remaining = 0;
  buffer: number | null = null;
  shift = 0;
  bits = 8;
  silence = true;
  constructor(private readonly read: (addr: number) => number) {}
  write(reg: number, v: number) {
    switch (reg) {
      case 0:
        this.irqEnabled = (v & 0x80) !== 0;
        this.loop = (v & 0x40) !== 0;
        this.rate = DMC_RATE[v & 0x0f]!;
        break;
      case 1:
        this.level = v & 0x7f;
        break;
      case 2:
        this.sampleAddr = 0xc000 | (v << 6);
        break;
      case 3:
        this.sampleLength = (v << 4) | 1;
        break;
    }
  }
  restart() {
    this.addr = this.sampleAddr;
    this.remaining = this.sampleLength;
  }
  private fill() {
    if (this.buffer !== null || this.remaining === 0) return;
    this.buffer = this.read(this.addr);
    this.addr = this.addr === 0xffff ? 0x8000 : this.addr + 1;
    if (--this.remaining === 0 && this.loop) this.restart();
  }
  /** Clocked every CPU cycle. */
  clockTimer() {
    this.fill();
    if (this.timer > 0) {
      this.timer--;
      return;
    }
    this.timer = this.rate - 1;
    if (!this.silence) {
      if (this.shift & 1) {
        if (this.level <= 125) this.level += 2;
      } else if (this.level >= 2) this.level -= 2;
    }
    this.shift >>= 1;
    if (--this.bits === 0) {
      this.bits = 8;
      if (this.buffer === null) this.silence = true;
      else {
        this.silence = false;
        this.shift = this.buffer;
        this.buffer = null;
      }
    }
  }
  output() {
    return this.level;
  }
}

type State = Record<string, unknown>;

/** The data fields of an object (not functions), nested one level for the envelopes. */
function save(o: object): State {
  const s: State = {};
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === 'function') continue;
    s[k] = v instanceof Envelope ? { ...v } : v;
  }
  return s;
}
function restore(o: object, s: State) {
  for (const [k, v] of Object.entries(s)) {
    const cur = (o as State)[k];
    if (cur instanceof Envelope) Object.assign(cur, v);
    else (o as State)[k] = v;
  }
}

/** Pre-computed mixer tables (NESdev "APU Mixer", lookup-table form). */
const PULSE_TABLE = Array.from({ length: 31 }, (_, n) => (n === 0 ? 0 : 95.52 / (8128 / n + 100)));
const TND_TABLE = Array.from({ length: 203 }, (_, n) => (n === 0 ? 0 : 163.67 / (24329 / n + 100)));

export class Apu {
  readonly pulse1 = new Pulse(true);
  readonly pulse2 = new Pulse(false);
  readonly triangle = new Triangle();
  readonly noise = new Noise();
  readonly dmc: Dmc;
  private frameCycle = 0;
  private fiveStep = false;
  private cycle = 0;

  /** `read` is the CPU bus, for the DMC's sample fetches. */
  constructor(read: (addr: number) => number) {
    this.dmc = new Dmc(read);
  }

  write(addr: number, v: number) {
    if (addr >= 0x4000 && addr <= 0x4003) this.pulse1.write(addr - 0x4000, v);
    else if (addr <= 0x4007) this.pulse2.write(addr - 0x4004, v);
    else if (addr <= 0x400b) this.triangle.write(addr - 0x4008, v);
    else if (addr <= 0x400f) this.noise.write(addr - 0x400c, v);
    else if (addr <= 0x4013) this.dmc.write(addr - 0x4010, v);
    else if (addr === 0x4015) {
      for (const [ch, bit] of [
        [this.pulse1, 1],
        [this.pulse2, 2],
        [this.triangle, 4],
        [this.noise, 8],
      ] as const) {
        ch.enabled = (v & bit) !== 0;
        if (!ch.enabled) ch.length = 0;
      }
      if (v & 0x10) {
        if (this.dmc.remaining === 0) this.dmc.restart();
      } else this.dmc.remaining = 0;
    } else if (addr === 0x4017) {
      this.fiveStep = (v & 0x80) !== 0;
      this.frameCycle = 0;
      if (this.fiveStep) {
        this.quarterFrame();
        this.halfFrame();
      }
    }
  }

  read(addr: number): number {
    if (addr !== 0x4015) return 0;
    return (
      (this.pulse1.length > 0 ? 1 : 0) |
      (this.pulse2.length > 0 ? 2 : 0) |
      (this.triangle.length > 0 ? 4 : 0) |
      (this.noise.length > 0 ? 8 : 0) |
      (this.dmc.remaining > 0 ? 16 : 0)
    );
  }

  private quarterFrame() {
    this.pulse1.env.clock();
    this.pulse2.env.clock();
    this.noise.env.clock();
    this.triangle.clockLinear();
  }
  private halfFrame() {
    this.pulse1.clockLength();
    this.pulse2.clockLength();
    this.triangle.clockLength();
    this.noise.clockLength();
    this.pulse1.clockSweep();
    this.pulse2.clockSweep();
  }

  /** Advances one CPU cycle. */
  clock() {
    this.triangle.clockTimer();
    this.noise.clockTimer();
    this.dmc.clockTimer();
    if ((this.cycle++ & 1) === 1) {
      this.pulse1.clockTimer();
      this.pulse2.clockTimer();
    }
    this.frameCycle++;
    // the next sequencer step is at least 7457 cycles away most of the time
    if (this.frameCycle < STEP4[0]!) return;
    const steps = this.fiveStep ? STEP5 : STEP4;
    const i = steps.indexOf(this.frameCycle);
    if (i >= 0) {
      if (this.fiveStep) {
        if (i !== 3) this.quarterFrame();
        if (i === 1 || i === 4) this.halfFrame();
        if (i === 4) this.frameCycle = 0;
      } else {
        this.quarterFrame();
        if (i === 1 || i === 3) this.halfFrame();
        if (i === 3) this.frameCycle = 0;
      }
    }
  }

  /** Everything that changes while playing, for seeking by snapshot. */
  saveState(): State {
    return {
      frameCycle: this.frameCycle,
      fiveStep: this.fiveStep,
      cycle: this.cycle,
      channels: [this.pulse1, this.pulse2, this.triangle, this.noise, this.dmc].map(save),
    };
  }
  loadState(s: State) {
    this.frameCycle = s.frameCycle as number;
    this.fiveStep = s.fiveStep as boolean;
    this.cycle = s.cycle as number;
    [this.pulse1, this.pulse2, this.triangle, this.noise, this.dmc].forEach((ch, i) => restore(ch, (s.channels as State[])[i]!));
  }

  /** The mixed output, 0…~1, as the hardware's non-linear DAC. */
  output(): number {
    const p = this.pulse1.output() + this.pulse2.output();
    const tnd = 3 * this.triangle.output() + 2 * this.noise.output() + this.dmc.output();
    return PULSE_TABLE[p]! + TND_TABLE[Math.round(tnd)]!;
  }
}
