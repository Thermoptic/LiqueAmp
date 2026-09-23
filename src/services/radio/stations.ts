import { nowIso } from '../../lib/id';
import type { MediaItem, RadioStation } from '../../types/media';
import { detectSource } from '../providers/detect';
import type { DirectFormat } from '../providers/direct';

/** How the engine should treat the station's stream URL. */
function streamFormat(station: RadioStation): DirectFormat {
  if (station.hls) return 'hls';
  try {
    const kind = detectSource(station.streamUrl).kind;
    return kind === 'hls' || kind === 'playlist' ? kind : 'stream';
  } catch {
    return 'stream';
  }
}

/**
 * A station as a normalized MediaItem. The id equals the station id, so
 * favourites, history and "currently playing" highlighting all line up.
 */
export function stationToMediaItem(station: RadioStation): MediaItem {
  const now = nowIso();
  return {
    id: station.id,
    provider: 'radio',
    title: station.name,
    artwork: station.artwork ?? station.favicon ?? null,
    sourceUrl: station.sourceUrl ?? station.streamUrl,
    streamUrl: station.streamUrl,
    playbackType: 'radio',
    duration: null,
    tags: station.tags.slice(0, 6),
    createdAt: now,
    updatedAt: now,
    metadata: {
      format: streamFormat(station),
      stationId: station.id,
      country: station.country,
      directoryCodec: station.codec,
      directoryBitrate: station.bitrate,
    },
  };
}

/** http:// streams cannot play on an https:// page (mixed content). */
export function isInsecureForPage(url: string, pageProtocol = typeof location === 'undefined' ? 'https:' : location.protocol): boolean {
  return pageProtocol === 'https:' && url.startsWith('http:');
}
