import { applyFloor, bandEdges, bandLevels, frameDelta, PeakHold, smooth } from './common';
import type { RenderConfig, Visualizer, VisualizerCapabilities, VisualizerFrame } from './types';

const CELL_W = 8;
const CELL_H = 10;
const COL_GAP = 2;
const ROW_GAP = 1;
/** Partial top cells are quantized to eighths, like ▁▂▃▄▅▆▇█ (VIS §18, §82). */
const STEPS = 8;

export const TERMINAL_SPECTRUM_CAPS: VisualizerCapabilities = { smoothing: true, mirror: false, scale: true, peakHold: true, glow: true };

/**
 * Terminal-style spectrum: a character grid where each column is a
 * frequency band built from block cells. Cells are drawn as rectangles
 * rather than font glyphs, so the result never depends on which block
 * characters the installed font has (VIS §83).
 */
export class TerminalSpectrum implements Visualizer {
  readonly id = 'terminal-spectrum' as const;
  readonly name = 'Terminal Spectrum';
  readonly capabilities = TERMINAL_SPECTRUM_CAPS;

  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private cols = 0;
  private rows = 0;
  private edges: Uint16Array = new Uint16Array(0);
  private edgesKey = '';
  private raw = new Float32Array(0);
  private levels = new Float32Array(0);
  private peaks = new PeakHold(0);
  private last = 0;

  initialize(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    const cols = Math.max(4, Math.floor((width + COL_GAP) / (CELL_W + COL_GAP)));
    this.rows = Math.max(2, Math.floor((height + ROW_GAP) / (CELL_H + ROW_GAP)));
    if (cols !== this.cols) {
      this.cols = cols;
      this.raw = new Float32Array(cols);
      this.levels = new Float32Array(cols);
      this.peaks = new PeakHold(cols);
      this.edgesKey = '';
    }
  }

  render(frame: VisualizerFrame, config: RenderConfig) {
    const ctx = this.ctx;
    if (!ctx || !this.cols || this.width <= 0 || this.height <= 0) return;
    const dt = frameDelta(this.last, frame.timestamp);
    this.last = frame.timestamp;

    const key = `${this.cols}:${frame.frequency.length}:${frame.sampleRate}:${config.scale}`;
    if (key !== this.edgesKey) {
      this.edges = bandEdges(this.cols, frame.frequency.length, frame.sampleRate, config.scale, this.edges);
      this.edgesKey = key;
    }
    bandLevels(frame.frequency, this.edges, this.raw);

    const { cols, rows } = this;
    const gridW = cols * CELL_W + (cols - 1) * COL_GAP;
    const gridH = rows * CELL_H + (rows - 1) * ROW_GAP;
    const x0 = Math.floor((this.width - gridW) / 2);
    const y0 = Math.floor((this.height - gridH) / 2);
    const p = config.palette;
    const rowY = (r: number) => y0 + gridH - (r + 1) * CELL_H - r * ROW_GAP; // r = 0 is the bottom row

    ctx.clearRect(0, 0, this.width, this.height);
    ctx.globalAlpha = config.alpha;

    // unlit cells: a faint dot per cell, the terminal "·"
    ctx.fillStyle = p.dim;
    for (let c = 0; c < cols; c++) {
      const x = x0 + c * (CELL_W + COL_GAP) + CELL_W / 2 - 1;
      for (let r = 0; r < rows; r++) ctx.fillRect(x, rowY(r) + CELL_H / 2 - 1, 2, 2);
    }

    const dtFrames = dt / 16.7;
    const lit = (color: string | CanvasGradient, top: boolean) => {
      ctx.beginPath();
      for (let c = 0; c < cols; c++) {
        const cells = this.levels[c]! * rows;
        const full = Math.floor(cells);
        const part = Math.round((cells - full) * STEPS) / STEPS;
        const x = x0 + c * (CELL_W + COL_GAP);
        const topRow = part > 0 ? full : full - 1;
        for (let r = 0; r < full && r < rows; r++) {
          if ((r === topRow) === top) ctx.rect(x, rowY(r), CELL_W, CELL_H);
        }
        if (part > 0 && full < rows && top) {
          const ph = Math.max(1, Math.round(part * CELL_H));
          ctx.rect(x, rowY(full) + CELL_H - ph, CELL_W, ph);
        }
      }
      ctx.fillStyle = color;
      ctx.fill();
    };

    for (let c = 0; c < cols; c++) {
      this.levels[c] = smooth(this.levels[c]!, applyFloor(this.raw[c]!, config.spectrumFloor), config.release, dtFrames);
      this.peaks.update(c, this.levels[c]!, dt);
    }

    if (config.glow > 0) {
      ctx.shadowColor = p.glow;
      ctx.shadowBlur = config.glow * 0.5; // very subtle (VIS §37)
    }
    // body cells in the primary color, the topmost cell of each column in
    // the secondary color — hotter at the top, like a warm terminal meter
    if (p.acrossFrequency && p.primary !== p.secondary) {
      const g = ctx.createLinearGradient(x0, 0, x0 + gridW, 0);
      g.addColorStop(0, p.primary);
      g.addColorStop(1, p.secondary);
      lit(g, false);
      lit(g, true);
    } else {
      lit(p.primary, false);
      lit(p.secondary, true);
    }
    ctx.shadowBlur = 0;

    if (config.peakHold) {
      ctx.fillStyle = p.secondary;
      for (let c = 0; c < cols; c++) {
        const peakCells = this.peaks.values[c]! * rows;
        if (peakCells < 0.5) continue;
        const r = Math.min(rows - 1, Math.floor(peakCells));
        ctx.fillRect(x0 + c * (CELL_W + COL_GAP), rowY(r), CELL_W, 1);
      }
    }
    ctx.globalAlpha = 1;
  }

  destroy() {
    this.ctx = null;
    this.cols = 0;
  }
}
