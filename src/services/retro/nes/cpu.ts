// MOS 6502 core (the NES's Ricoh 2A03 without decimal mode) for NSF playback.
// Cycle counts follow the published opcode tables, including the extra cycle
// for page crossings on indexed reads and taken branches. All official
// opcodes are implemented, plus the stable unofficial ones some NSF drivers
// use (LAX, SAX, DCP, ISC, SLO, RLA, SRE, RRA, the NOP family, …).

export interface Bus {
  read(addr: number): number;
  write(addr: number, value: number): void;
}

const FLAG_C = 0x01;
const FLAG_Z = 0x02;
const FLAG_I = 0x04;
const FLAG_D = 0x08;
const FLAG_B = 0x10;
const FLAG_U = 0x20;
const FLAG_V = 0x40;
const FLAG_N = 0x80;

type Mode = 'imp' | 'acc' | 'imm' | 'zp' | 'zpx' | 'zpy' | 'abs' | 'abx' | 'aby' | 'ind' | 'izx' | 'izy' | 'rel';

/** [mnemonic, addressing mode, base cycles, +1 on page cross (reads)] per opcode. */
const OPS: Array<[string, Mode, number, boolean] | undefined> = new Array(256);

function def(list: string) {
  // "op:MNE:mode:cycles[:p]" entries separated by spaces
  for (const e of list.trim().split(/\s+/)) {
    const [op, mne, mode, cyc, p] = e.split(':');
    OPS[parseInt(op!, 16)] = [mne!, mode as Mode, Number(cyc), p === 'p'];
  }
}

// ---- official opcodes ----
def(`
69:ADC:imm:2 65:ADC:zp:3 75:ADC:zpx:4 6D:ADC:abs:4 7D:ADC:abx:4:p 79:ADC:aby:4:p 61:ADC:izx:6 71:ADC:izy:5:p
29:AND:imm:2 25:AND:zp:3 35:AND:zpx:4 2D:AND:abs:4 3D:AND:abx:4:p 39:AND:aby:4:p 21:AND:izx:6 31:AND:izy:5:p
0A:ASL:acc:2 06:ASL:zp:5 16:ASL:zpx:6 0E:ASL:abs:6 1E:ASL:abx:7
90:BCC:rel:2 B0:BCS:rel:2 F0:BEQ:rel:2 30:BMI:rel:2 D0:BNE:rel:2 10:BPL:rel:2 50:BVC:rel:2 70:BVS:rel:2
24:BIT:zp:3 2C:BIT:abs:4
00:BRK:imp:7
18:CLC:imp:2 D8:CLD:imp:2 58:CLI:imp:2 B8:CLV:imp:2
C9:CMP:imm:2 C5:CMP:zp:3 D5:CMP:zpx:4 CD:CMP:abs:4 DD:CMP:abx:4:p D9:CMP:aby:4:p C1:CMP:izx:6 D1:CMP:izy:5:p
E0:CPX:imm:2 E4:CPX:zp:3 EC:CPX:abs:4 C0:CPY:imm:2 C4:CPY:zp:3 CC:CPY:abs:4
C6:DEC:zp:5 D6:DEC:zpx:6 CE:DEC:abs:6 DE:DEC:abx:7 CA:DEX:imp:2 88:DEY:imp:2
49:EOR:imm:2 45:EOR:zp:3 55:EOR:zpx:4 4D:EOR:abs:4 5D:EOR:abx:4:p 59:EOR:aby:4:p 41:EOR:izx:6 51:EOR:izy:5:p
E6:INC:zp:5 F6:INC:zpx:6 EE:INC:abs:6 FE:INC:abx:7 E8:INX:imp:2 C8:INY:imp:2
4C:JMP:abs:3 6C:JMP:ind:5 20:JSR:abs:6
A9:LDA:imm:2 A5:LDA:zp:3 B5:LDA:zpx:4 AD:LDA:abs:4 BD:LDA:abx:4:p B9:LDA:aby:4:p A1:LDA:izx:6 B1:LDA:izy:5:p
A2:LDX:imm:2 A6:LDX:zp:3 B6:LDX:zpy:4 AE:LDX:abs:4 BE:LDX:aby:4:p
A0:LDY:imm:2 A4:LDY:zp:3 B4:LDY:zpx:4 AC:LDY:abs:4 BC:LDY:abx:4:p
4A:LSR:acc:2 46:LSR:zp:5 56:LSR:zpx:6 4E:LSR:abs:6 5E:LSR:abx:7
EA:NOP:imp:2
09:ORA:imm:2 05:ORA:zp:3 15:ORA:zpx:4 0D:ORA:abs:4 1D:ORA:abx:4:p 19:ORA:aby:4:p 01:ORA:izx:6 11:ORA:izy:5:p
48:PHA:imp:3 08:PHP:imp:3 68:PLA:imp:4 28:PLP:imp:4
2A:ROL:acc:2 26:ROL:zp:5 36:ROL:zpx:6 2E:ROL:abs:6 3E:ROL:abx:7
6A:ROR:acc:2 66:ROR:zp:5 76:ROR:zpx:6 6E:ROR:abs:6 7E:ROR:abx:7
40:RTI:imp:6 60:RTS:imp:6
E9:SBC:imm:2 E5:SBC:zp:3 F5:SBC:zpx:4 ED:SBC:abs:4 FD:SBC:abx:4:p F9:SBC:aby:4:p E1:SBC:izx:6 F1:SBC:izy:5:p
38:SEC:imp:2 F8:SED:imp:2 78:SEI:imp:2
85:STA:zp:3 95:STA:zpx:4 8D:STA:abs:4 9D:STA:abx:5 99:STA:aby:5 81:STA:izx:6 91:STA:izy:6
86:STX:zp:3 96:STX:zpy:4 8E:STX:abs:4 84:STY:zp:3 94:STY:zpx:4 8C:STY:abs:4
AA:TAX:imp:2 A8:TAY:imp:2 BA:TSX:imp:2 8A:TXA:imp:2 9A:TXS:imp:2 98:TYA:imp:2
`);

// ---- stable unofficial opcodes ----
def(`
1A:NOP:imp:2 3A:NOP:imp:2 5A:NOP:imp:2 7A:NOP:imp:2 DA:NOP:imp:2 FA:NOP:imp:2
80:NOP:imm:2 82:NOP:imm:2 89:NOP:imm:2 C2:NOP:imm:2 E2:NOP:imm:2
04:NOP:zp:3 44:NOP:zp:3 64:NOP:zp:3
14:NOP:zpx:4 34:NOP:zpx:4 54:NOP:zpx:4 74:NOP:zpx:4 D4:NOP:zpx:4 F4:NOP:zpx:4
0C:NOP:abs:4 1C:NOP:abx:4:p 3C:NOP:abx:4:p 5C:NOP:abx:4:p 7C:NOP:abx:4:p DC:NOP:abx:4:p FC:NOP:abx:4:p
A7:LAX:zp:3 B7:LAX:zpy:4 AF:LAX:abs:4 BF:LAX:aby:4:p A3:LAX:izx:6 B3:LAX:izy:5:p
87:SAX:zp:3 97:SAX:zpy:4 8F:SAX:abs:4 83:SAX:izx:6
EB:SBC:imm:2
C7:DCP:zp:5 D7:DCP:zpx:6 CF:DCP:abs:6 DF:DCP:abx:7 DB:DCP:aby:7 C3:DCP:izx:8 D3:DCP:izy:8
E7:ISC:zp:5 F7:ISC:zpx:6 EF:ISC:abs:6 FF:ISC:abx:7 FB:ISC:aby:7 E3:ISC:izx:8 F3:ISC:izy:8
07:SLO:zp:5 17:SLO:zpx:6 0F:SLO:abs:6 1F:SLO:abx:7 1B:SLO:aby:7 03:SLO:izx:8 13:SLO:izy:8
27:RLA:zp:5 37:RLA:zpx:6 2F:RLA:abs:6 3F:RLA:abx:7 3B:RLA:aby:7 23:RLA:izx:8 33:RLA:izy:8
47:SRE:zp:5 57:SRE:zpx:6 4F:SRE:abs:6 5F:SRE:abx:7 5B:SRE:aby:7 43:SRE:izx:8 53:SRE:izy:8
67:RRA:zp:5 77:RRA:zpx:6 6F:RRA:abs:6 7F:RRA:abx:7 7B:RRA:aby:7 63:RRA:izx:8 73:RRA:izy:8
0B:ANC:imm:2 2B:ANC:imm:2 4B:ALR:imm:2 6B:ARR:imm:2 CB:AXS:imm:2
`);

export class Cpu6502 {
  a = 0;
  x = 0;
  y = 0;
  sp = 0xfd;
  pc = 0;
  p = FLAG_I | FLAG_U;
  /** Total cycles executed. */
  cycles = 0;
  /** Opcodes met that are not implemented (executed as 2-cycle NOPs). */
  unknownOpcodes = 0;

  constructor(private readonly bus: Bus) {}

  // ---- flags ----
  private setZN(v: number) {
    this.p = (this.p & ~(FLAG_Z | FLAG_N)) | (v === 0 ? FLAG_Z : 0) | (v & FLAG_N);
  }
  private flag(f: number, on: boolean) {
    this.p = on ? this.p | f : this.p & ~f;
  }
  private get carry(): number {
    return this.p & FLAG_C;
  }

  // ---- memory helpers ----
  private read(addr: number): number {
    return this.bus.read(addr & 0xffff) & 0xff;
  }
  private write(addr: number, v: number) {
    this.bus.write(addr & 0xffff, v & 0xff);
  }
  private read16(addr: number): number {
    return this.read(addr) | (this.read(addr + 1) << 8);
  }
  /** 16-bit read that wraps within the page (JMP ($xxFF) and zero-page pointers). */
  private read16Wrap(addr: number): number {
    const hi = (addr & 0xff00) | ((addr + 1) & 0xff);
    return this.read(addr) | (this.read(hi) << 8);
  }
  push(v: number) {
    this.write(0x100 | this.sp, v);
    this.sp = (this.sp - 1) & 0xff;
  }
  pull(): number {
    this.sp = (this.sp + 1) & 0xff;
    return this.read(0x100 | this.sp);
  }

  // ---- ALU helpers (methods, so the hot loop allocates nothing) ----
  private adc(v: number) {
    const sum = this.a + v + this.carry;
    this.flag(FLAG_C, sum > 0xff);
    this.flag(FLAG_V, (~(this.a ^ v) & (this.a ^ sum) & 0x80) !== 0);
    this.a = sum & 0xff;
    this.setZN(this.a);
  }
  private compare(r: number, v: number) {
    this.flag(FLAG_C, r >= v);
    this.setZN((r - v) & 0xff);
  }
  private asl(v: number) {
    this.flag(FLAG_C, (v & 0x80) !== 0);
    const r = (v << 1) & 0xff;
    this.setZN(r);
    return r;
  }
  private lsr(v: number) {
    this.flag(FLAG_C, (v & 1) !== 0);
    const r = v >> 1;
    this.setZN(r);
    return r;
  }
  private rol(v: number) {
    const r = ((v << 1) | this.carry) & 0xff;
    this.flag(FLAG_C, (v & 0x80) !== 0);
    this.setZN(r);
    return r;
  }
  private ror(v: number) {
    const r = (v >> 1) | (this.carry ? 0x80 : 0);
    this.flag(FLAG_C, (v & 1) !== 0);
    this.setZN(r);
    return r;
  }
  /** Taken branch: 1 extra cycle, 2 when it crosses a page. */
  private branch(cond: boolean, addr: number): number {
    if (!cond) return 0;
    const extra = (this.pc & 0xff00) !== (addr & 0xff00) ? 2 : 1;
    this.pc = addr;
    return extra;
  }

  /** Executes one instruction and returns the cycles it took. */
  step(): number {
    const opcode = this.read(this.pc);
    this.pc = (this.pc + 1) & 0xffff;
    const op = OPS[opcode];
    if (!op) {
      this.unknownOpcodes++;
      this.cycles += 2;
      return 2;
    }
    const [mne, mode, base, pageExtra] = op;
    let cycles = base;
    let addr = 0;
    let crossed = false;

    switch (mode) {
      case 'imp':
      case 'acc':
        break;
      case 'imm':
        addr = this.pc;
        this.pc = (this.pc + 1) & 0xffff;
        break;
      case 'zp':
        addr = this.read(this.pc);
        this.pc = (this.pc + 1) & 0xffff;
        break;
      case 'zpx':
        addr = (this.read(this.pc) + this.x) & 0xff;
        this.pc = (this.pc + 1) & 0xffff;
        break;
      case 'zpy':
        addr = (this.read(this.pc) + this.y) & 0xff;
        this.pc = (this.pc + 1) & 0xffff;
        break;
      case 'abs':
        addr = this.read16(this.pc);
        this.pc = (this.pc + 2) & 0xffff;
        break;
      case 'abx': {
        const b = this.read16(this.pc);
        this.pc = (this.pc + 2) & 0xffff;
        addr = (b + this.x) & 0xffff;
        crossed = (b & 0xff00) !== (addr & 0xff00);
        break;
      }
      case 'aby': {
        const b = this.read16(this.pc);
        this.pc = (this.pc + 2) & 0xffff;
        addr = (b + this.y) & 0xffff;
        crossed = (b & 0xff00) !== (addr & 0xff00);
        break;
      }
      case 'ind':
        addr = this.read16Wrap(this.read16(this.pc));
        this.pc = (this.pc + 2) & 0xffff;
        break;
      case 'izx':
        addr = this.read16Wrap((this.read(this.pc) + this.x) & 0xff);
        this.pc = (this.pc + 1) & 0xffff;
        break;
      case 'izy': {
        const b = this.read16Wrap(this.read(this.pc));
        this.pc = (this.pc + 1) & 0xffff;
        addr = (b + this.y) & 0xffff;
        crossed = (b & 0xff00) !== (addr & 0xff00);
        break;
      }
      case 'rel': {
        const off = this.read(this.pc);
        this.pc = (this.pc + 1) & 0xffff;
        addr = (this.pc + (off < 0x80 ? off : off - 0x100)) & 0xffff;
        break;
      }
    }
    if (pageExtra && crossed) cycles++;

    switch (mne) {
      case 'ADC':
        this.adc(this.read(addr));
        break;
      case 'SBC':
        this.adc(this.read(addr) ^ 0xff);
        break;
      case 'AND':
        this.a &= this.read(addr);
        this.setZN(this.a);
        break;
      case 'ORA':
        this.a |= this.read(addr);
        this.setZN(this.a);
        break;
      case 'EOR':
        this.a ^= this.read(addr);
        this.setZN(this.a);
        break;
      case 'ASL':
        if (mode === 'acc') this.a = this.asl(this.a);
        else this.write(addr, this.asl(this.read(addr)));
        break;
      case 'LSR':
        if (mode === 'acc') this.a = this.lsr(this.a);
        else this.write(addr, this.lsr(this.read(addr)));
        break;
      case 'ROL':
        if (mode === 'acc') this.a = this.rol(this.a);
        else this.write(addr, this.rol(this.read(addr)));
        break;
      case 'ROR':
        if (mode === 'acc') this.a = this.ror(this.a);
        else this.write(addr, this.ror(this.read(addr)));
        break;
      case 'BCC':
        cycles += this.branch(!(this.p & FLAG_C), addr);
        break;
      case 'BCS':
        cycles += this.branch(!!(this.p & FLAG_C), addr);
        break;
      case 'BEQ':
        cycles += this.branch(!!(this.p & FLAG_Z), addr);
        break;
      case 'BNE':
        cycles += this.branch(!(this.p & FLAG_Z), addr);
        break;
      case 'BMI':
        cycles += this.branch(!!(this.p & FLAG_N), addr);
        break;
      case 'BPL':
        cycles += this.branch(!(this.p & FLAG_N), addr);
        break;
      case 'BVC':
        cycles += this.branch(!(this.p & FLAG_V), addr);
        break;
      case 'BVS':
        cycles += this.branch(!!(this.p & FLAG_V), addr);
        break;
      case 'BIT': {
        const v = this.read(addr);
        this.p = (this.p & ~(FLAG_Z | FLAG_V | FLAG_N)) | ((this.a & v) === 0 ? FLAG_Z : 0) | (v & (FLAG_V | FLAG_N));
        break;
      }
      case 'BRK':
        this.pc = (this.pc + 1) & 0xffff;
        this.push(this.pc >> 8);
        this.push(this.pc & 0xff);
        this.push(this.p | FLAG_B | FLAG_U);
        this.p |= FLAG_I;
        this.pc = this.read16(0xfffe);
        break;
      case 'CLC':
        this.p &= ~FLAG_C;
        break;
      case 'CLD':
        this.p &= ~FLAG_D;
        break;
      case 'CLI':
        this.p &= ~FLAG_I;
        break;
      case 'CLV':
        this.p &= ~FLAG_V;
        break;
      case 'SEC':
        this.p |= FLAG_C;
        break;
      case 'SED':
        this.p |= FLAG_D;
        break;
      case 'SEI':
        this.p |= FLAG_I;
        break;
      case 'CMP':
        this.compare(this.a, this.read(addr));
        break;
      case 'CPX':
        this.compare(this.x, this.read(addr));
        break;
      case 'CPY':
        this.compare(this.y, this.read(addr));
        break;
      case 'DEC': {
        const v = (this.read(addr) - 1) & 0xff;
        this.write(addr, v);
        this.setZN(v);
        break;
      }
      case 'INC': {
        const v = (this.read(addr) + 1) & 0xff;
        this.write(addr, v);
        this.setZN(v);
        break;
      }
      case 'DEX':
        this.x = (this.x - 1) & 0xff;
        this.setZN(this.x);
        break;
      case 'DEY':
        this.y = (this.y - 1) & 0xff;
        this.setZN(this.y);
        break;
      case 'INX':
        this.x = (this.x + 1) & 0xff;
        this.setZN(this.x);
        break;
      case 'INY':
        this.y = (this.y + 1) & 0xff;
        this.setZN(this.y);
        break;
      case 'JMP':
        this.pc = addr;
        break;
      case 'JSR': {
        const ret = (this.pc - 1) & 0xffff;
        this.push(ret >> 8);
        this.push(ret & 0xff);
        this.pc = addr;
        break;
      }
      case 'RTS':
        this.pc = ((this.pull() | (this.pull() << 8)) + 1) & 0xffff;
        break;
      case 'RTI':
        this.p = (this.pull() & ~FLAG_B) | FLAG_U;
        this.pc = this.pull() | (this.pull() << 8);
        break;
      case 'LDA':
        this.a = this.read(addr);
        this.setZN(this.a);
        break;
      case 'LDX':
        this.x = this.read(addr);
        this.setZN(this.x);
        break;
      case 'LDY':
        this.y = this.read(addr);
        this.setZN(this.y);
        break;
      case 'STA':
        this.write(addr, this.a);
        break;
      case 'STX':
        this.write(addr, this.x);
        break;
      case 'STY':
        this.write(addr, this.y);
        break;
      case 'NOP':
        if (mode !== 'imp') this.read(addr); // the dummy read of the multi-byte NOPs
        break;
      case 'PHA':
        this.push(this.a);
        break;
      case 'PHP':
        this.push(this.p | FLAG_B | FLAG_U);
        break;
      case 'PLA':
        this.a = this.pull();
        this.setZN(this.a);
        break;
      case 'PLP':
        this.p = (this.pull() & ~FLAG_B) | FLAG_U;
        break;
      case 'TAX':
        this.x = this.a;
        this.setZN(this.x);
        break;
      case 'TAY':
        this.y = this.a;
        this.setZN(this.y);
        break;
      case 'TSX':
        this.x = this.sp;
        this.setZN(this.x);
        break;
      case 'TXA':
        this.a = this.x;
        this.setZN(this.a);
        break;
      case 'TXS':
        this.sp = this.x;
        break;
      case 'TYA':
        this.a = this.y;
        this.setZN(this.a);
        break;
      // ---- unofficial ----
      case 'LAX':
        this.a = this.x = this.read(addr);
        this.setZN(this.a);
        break;
      case 'SAX':
        this.write(addr, this.a & this.x);
        break;
      case 'DCP': {
        const v = (this.read(addr) - 1) & 0xff;
        this.write(addr, v);
        this.compare(this.a, v);
        break;
      }
      case 'ISC': {
        const v = (this.read(addr) + 1) & 0xff;
        this.write(addr, v);
        this.adc(v ^ 0xff);
        break;
      }
      case 'SLO': {
        const v = this.asl(this.read(addr));
        this.write(addr, v);
        this.a |= v;
        this.setZN(this.a);
        break;
      }
      case 'RLA': {
        const v = this.rol(this.read(addr));
        this.write(addr, v);
        this.a &= v;
        this.setZN(this.a);
        break;
      }
      case 'SRE': {
        const v = this.lsr(this.read(addr));
        this.write(addr, v);
        this.a ^= v;
        this.setZN(this.a);
        break;
      }
      case 'RRA': {
        const v = this.ror(this.read(addr));
        this.write(addr, v);
        this.adc(v);
        break;
      }
      case 'ANC':
        this.a &= this.read(addr);
        this.setZN(this.a);
        this.flag(FLAG_C, (this.a & 0x80) !== 0);
        break;
      case 'ALR':
        this.a = this.lsr(this.a & this.read(addr));
        break;
      case 'ARR': {
        this.a = ((this.a & this.read(addr)) >> 1) | (this.carry ? 0x80 : 0);
        this.setZN(this.a);
        this.flag(FLAG_C, (this.a & 0x40) !== 0);
        this.flag(FLAG_V, (((this.a >> 6) ^ (this.a >> 5)) & 1) !== 0);
        break;
      }
      case 'AXS': {
        const v = this.read(addr);
        const r = (this.a & this.x) - v;
        this.flag(FLAG_C, r >= 0);
        this.x = r & 0xff;
        this.setZN(this.x);
        break;
      }
    }
    this.cycles += cycles;
    return cycles;
  }
}

export const CPU_FLAGS = { C: FLAG_C, Z: FLAG_Z, I: FLAG_I, D: FLAG_D, B: FLAG_B, U: FLAG_U, V: FLAG_V, N: FLAG_N } as const;
