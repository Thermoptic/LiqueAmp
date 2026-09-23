import { getEngine } from '../playback/engine';
import { AudioAnalysis } from './analysis';

let shared: AudioAnalysis | null = null;

/** The app-wide analysis reader, bound to the playback engine's analyser. */
export function getAnalysis(): AudioAnalysis {
  shared ??= new AudioAnalysis(() => getEngine().getAnalyser());
  return shared;
}
