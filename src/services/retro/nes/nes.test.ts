// The NES core: 6502 instructions and timing, the APU's channels, and an NSF
// driven end to end (a hand-assembled file whose tone is measured).
import { describe, expect, it } from 'vitest';
import { CPU_FLAGS, Cpu6502 } from './cpu';
import { Apu } from './apu';
import { NsfError, NsfPlayer, parseNsf } from './nsf';

function machine(program: number[], at = 0x0600) {
  const mem = new Uint8Array(0x10000);
  mem.set(program, at);
  const cpu = new Cpu6502({ read: (a) => mem[a]!, write: (a, v) => (mem[a] = v) });
  cpu.pc = at;
  return { cpu, mem, run: (n: number) => Array.from({ length: n }, () => cpu.step()) };
}

describe('6502 core', () => {
  it('ADC/SBC set carry and overflow like the hardware', () => {
    const { cpu, run } = machine([0x18, 0xa9, 0x50, 0x69, 0x50, 0x38, 0xa9, 0x50, 0xe9, 0xb0]); // CLC; LDA #$50; ADC #$50; SEC; LDA #$50; SBC #$B0
    run(3);
    expect(cpu.a).toBe(0xa0);
    expect(cpu.p & CPU_FLAGS.V).toBeTruthy(); // 80 + 80 overflows signed
    expect(cpu.p & CPU_FLAGS.C).toBe(0);
    expect(cpu.p & CPU_FLAGS.N).toBeTruthy();
    run(3);
    expect(cpu.a).toBe(0xa0); // 80 - (-80) = 160: overflow, borrow
    expect(cpu.p & CPU_FLAGS.V).toBeTruthy();
    expect(cpu.p & CPU_FLAGS.C).toBe(0);
  });

  it('JSR/RTS, stack and zero-page wrap', () => {
    // JSR $0610; LDX #$FF; ... at $0610: LDA $FF,X (wraps to $FE); RTS
    const { cpu, mem, run } = machine([0x20, 0x10, 0x06, 0xa2, 0x01]);
    mem.set([0xa2, 0xff, 0xb5, 0xff, 0x60], 0x0610);
    mem[0xfe] = 0x42;
    run(4); // JSR, LDX, LDA, RTS
    expect(cpu.a).toBe(0x42);
    expect(cpu.pc).toBe(0x0603);
    expect(cpu.sp).toBe(0xfd);
  });

  it('JMP ($xxFF) wraps within the page (6502 quirk)', () => {
    const { cpu, mem, run } = machine([0x6c, 0xff, 0x02]);
    mem[0x02ff] = 0x34;
    mem[0x0200] = 0x12; // not $0300
    run(1);
    expect(cpu.pc).toBe(0x1234);
  });

  it('counts cycles, with the extra cycle on page crossings and taken branches', () => {
    const { cpu, mem, run } = machine([0xa2, 0x01, 0xbd, 0xff, 0x10, 0xd0, 0x00, 0xf0, 0x02]); // LDX #1; LDA $10FF,X; BNE +0; BEQ +2
    mem[0x1100] = 5;
    expect(run(4)).toEqual([2, 5, 3, 2]); // LDA crosses a page; BNE taken; BEQ not taken
    expect(cpu.cycles).toBe(12);
  });

  it('runs the stable unofficial opcodes NSF drivers use', () => {
    const { cpu, mem, run } = machine([0xa7, 0x10, 0xe7, 0x11]); // LAX $10; ISC $11
    mem[0x10] = 0x33;
    mem[0x11] = 0x02;
    cpu.p |= CPU_FLAGS.C;
    run(2);
    expect(cpu.x).toBe(0x33);
    expect(mem[0x11]).toBe(0x03);
    expect(cpu.a).toBe(0x30); // 0x33 - 0x03
    expect(cpu.unknownOpcodes).toBe(0);
  });
});

describe('2A03 APU', () => {
  const apu = () => new Apu(() => 0);

  it('the length counter silences a pulse channel unless halted', () => {
    const a = apu();
    a.write(0x4015, 0x01);
    a.write(0x4000, 0x9f); // duty 2, no halt, constant volume 15
    a.write(0x4002, 0x80);
    a.write(0x4003, 0x18); // length index 3 → 2 half-frames
    expect(a.read(0x4015) & 1).toBe(1);
    for (let i = 0; i < 29830 * 2; i++) a.clock();
    expect(a.read(0x4015) & 1).toBe(0);
  });

  it('disabling a channel in $4015 clears its length', () => {
    const a = apu();
    a.write(0x4015, 0x0f);
    a.write(0x400b, 0xf8);
    expect(a.read(0x4015) & 4).toBe(4);
    a.write(0x4015, 0x00);
    expect(a.read(0x4015)).toBe(0);
  });

  it('holds a constant level when silent (DC, removed by the output filters) and stays within the DAC range', () => {
    const a = apu();
    const idle = new Set(Array.from({ length: 1000 }, () => (a.clock(), a.output())));
    expect(idle.size).toBe(1);
    a.write(0x4015, 0x0f);
    a.write(0x4000, 0xbf);
    a.write(0x4004, 0xbf);
    a.write(0x4002, 0x80);
    a.write(0x4006, 0x80);
    a.write(0x4003, 0x08);
    a.write(0x4007, 0x08);
    let max = 0;
    for (let i = 0; i < 20000; i++) {
      a.clock();
      max = Math.max(max, a.output());
    }
    expect(max).toBeGreaterThan(0.2);
    expect(max).toBeLessThan(1);
  });
});

/** A tiny NSF: INIT sets pulse 1 to a steady tone with timer period `period`; PLAY does nothing. */
function toneNsf(period: number, songs = 1): Uint8Array {
  const header = new Uint8Array(0x80);
  header.set([0x4e, 0x45, 0x53, 0x4d, 0x1a, 1, songs, 1]);
  const put16 = (o: number, v: number) => header.set([v & 0xff, v >> 8], o);
  put16(0x08, 0x8000); // load
  put16(0x0a, 0x8000); // init
  put16(0x0c, 0x8020); // play
  header.set([...'Test Tune'].map((c) => c.charCodeAt(0)), 0x0e);
  header.set([...'LIQUEAMP'].map((c) => c.charCodeAt(0)), 0x2e);
  put16(0x6e, 16639);
  const code = new Uint8Array(0x30);
  code.set([
    0xa9, 0xbf, 0x8d, 0x00, 0x40, // LDA #$BF ; STA $4000  duty 2, halt, constant volume 15
    0xa9, period & 0xff, 0x8d, 0x02, 0x40, // LDA #lo ; STA $4002
    0xa9, (period >> 8) & 7, 0x8d, 0x03, 0x40, // LDA #hi ; STA $4003
    0x60, // RTS
  ]);
  code[0x20] = 0x60; // PLAY: RTS
  const file = new Uint8Array(0x80 + code.length);
  file.set(header);
  file.set(code, 0x80);
  return file;
}

function frequency(samples: Float32Array, rate: number): number {
  let crossings = 0;
  for (let i = 1; i < samples.length; i++) if (samples[i - 1]! < 0 && samples[i]! >= 0) crossings++;
  return crossings / (samples.length / rate);
}

describe('NSF', () => {
  it('reads the header', () => {
    const nsf = parseNsf(toneNsf(253, 3));
    expect(nsf).toMatchObject({ songs: 3, startSong: 1, loadAddr: 0x8000, initAddr: 0x8000, playAddr: 0x8020, name: 'Test Tune', artist: 'LIQUEAMP', banks: null, expansion: [] });
    expect(() => parseNsf(new Uint8Array(200))).toThrow(NsfError);
  });

  it('plays the file’s own driver: a 440 Hz pulse, at any sample rate', () => {
    // pulse frequency = CPU / (16 × (period + 1)) → period 253 ≈ 440.4 Hz
    for (const rate of [44100, 48000]) {
      const player = new NsfPlayer(parseNsf(toneNsf(253)), rate);
      player.start(1);
      const out = new Float32Array(rate);
      player.render(out);
      expect(frequency(out.subarray(rate / 10), rate)).toBeGreaterThan(436);
      expect(frequency(out.subarray(rate / 10), rate)).toBeLessThan(445);
      expect(Math.max(...out)).toBeGreaterThan(0.1);
      expect(Math.max(...out.map(Math.abs))).toBeLessThanOrEqual(1);
      expect(player.unknownOpcodes).toBe(0);
    }
  });

  it('is deterministic; skipping forward lands on the same audio once the output filters settle', () => {
    const file = parseNsf(toneNsf(400));
    const a = new NsfPlayer(file, 48000);
    a.start(1);
    const whole = new Float32Array(48000);
    a.render(whole);
    const again = new NsfPlayer(file, 48000);
    again.start(1);
    const same = new Float32Array(48000);
    again.render(same);
    expect(Array.from(same)).toEqual(Array.from(whole));

    const b = new NsfPlayer(file, 48000);
    b.start(1);
    b.skipTo(0.5); // no audio produced: the mixer and filters are skipped
    expect(b.position).toBe(24000);
    const tail = new Float32Array(24000);
    b.render(tail);
    // after 0.1 s the filters have settled: the same samples
    const settled = Array.from(tail.subarray(4800));
    Array.from(whole.subarray(24000 + 4800)).forEach((v, i) => expect(settled[i]).toBeCloseTo(v, 6));
  });

  it('a snapshot restores the exact state: the audio continues sample for sample', () => {
    const file = parseNsf(toneNsf(300));
    const p = new NsfPlayer(file, 44100);
    p.start(1);
    p.render(new Float32Array(10000));
    const snap = p.snapshot();
    const first = new Float32Array(8000);
    p.render(first);
    p.render(new Float32Array(30000)); // move on
    p.restore(snap);
    expect(p.position).toBe(10000);
    const second = new Float32Array(8000);
    p.render(second);
    expect(Array.from(second)).toEqual(Array.from(first));
  });
});
