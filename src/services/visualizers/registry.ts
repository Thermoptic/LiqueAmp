import type { VisualizerId } from '../../types/visualizer';
import { MINIMAL_METER_CAPS, MinimalMeter } from './minimalMeter';
import { OSCILLOSCOPE_CAPS, Oscilloscope } from './oscilloscope';
import { SPECTRUM_BARS_CAPS, SpectrumBars } from './spectrumBars';
import { TERMINAL_SPECTRUM_CAPS, TerminalSpectrum } from './terminalSpectrum';
import type { VisualizerDefinition } from './types';
import { WAVEFORM_CAPS, Waveform } from './waveform';

/** Central visualizer registry (VIS §28), in the VIS §98 order. */
const DEFINITIONS: VisualizerDefinition[] = [
  { id: 'spectrum-bars', name: 'Spectrum Bars', description: 'Frequency bands as dense bars.', capabilities: SPECTRUM_BARS_CAPS, create: () => new SpectrumBars() },
  { id: 'waveform', name: 'Waveform', description: 'Signal level over the last seconds.', capabilities: WAVEFORM_CAPS, create: () => new Waveform() },
  { id: 'terminal-spectrum', name: 'Terminal Spectrum', description: 'Spectrum as a character grid.', capabilities: TERMINAL_SPECTRUM_CAPS, create: () => new TerminalSpectrum() },
  { id: 'minimal-meter', name: 'Minimal Meter', description: 'Bass, mid and treble meters.', capabilities: MINIMAL_METER_CAPS, create: () => new MinimalMeter() },
  { id: 'oscilloscope', name: 'Oscilloscope', description: 'The live waveform.', capabilities: OSCILLOSCOPE_CAPS, create: () => new Oscilloscope() },
];

const byId = new Map(DEFINITIONS.map((d) => [d.id, d]));

export const visualizerRegistry = {
  get: (id: VisualizerId): VisualizerDefinition | undefined => byId.get(id),
  getAll: (): readonly VisualizerDefinition[] => DEFINITIONS,
};
