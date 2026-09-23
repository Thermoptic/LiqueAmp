import type { RadioStation } from '../../types/media';
import { getEngine } from '../playback/engine';
import { radioBrowser, stationUuid } from './radioBrowser';
import { stationToMediaItem } from './stations';

/** Plays a station through the central engine and credits the directory. */
export function playStation(station: RadioStation): Promise<void> {
  const uuid = stationUuid(station);
  if (uuid) radioBrowser.reportClick(uuid);
  return getEngine().playNow(stationToMediaItem(station));
}

export function queueStation(station: RadioStation): void {
  getEngine().enqueue([stationToMediaItem(station)]);
}
