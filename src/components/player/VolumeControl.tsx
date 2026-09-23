import { Volume2, VolumeX } from 'lucide-react';
import { usePlayback } from '../../stores/playbackStore';
import { useSettings } from '../../stores/settingsStore';
import { Slider } from '../ui/controls';

export function VolumeControl({ compact = false }: { compact?: boolean }) {
  const volume = useSettings((s) => s.volume);
  const muted = useSettings((s) => s.muted);
  const update = useSettings((s) => s.update);
  const pct = Math.round(volume * 100);
  // Some provider players (Spotify) do not let LIQUEAMP set volume (PROVIDERS §50).
  const canSetVolume = usePlayback((s) => s.canSetVolume);
  if (!canSetVolume) {
    return (
      <div className={`volume ${compact ? 'volume--compact' : ''}`}>
        {!compact && <span className="volume__label">VOL</span>}
        <span className="volume__note muted">Set in the provider player</span>
      </div>
    );
  }

  return (
    <div className={`volume ${compact ? 'volume--compact' : ''}`}>
      {!compact && <span className="volume__label">VOL</span>}
      <Slider
        value={muted ? 0 : volume}
        onChange={(v) => update({ volume: v, muted: v === 0 ? muted : false })}
        label="Volume"
        valueText={muted ? 'Muted' : `${pct}%`}
      />
      <span className="volume__value">{muted ? 'MUTE' : `${pct}%`}</span>
      <button
        type="button"
        className="btn btn--ghost btn--icon"
        aria-label={muted ? 'Unmute' : 'Mute'}
        aria-pressed={muted}
        onClick={() => update({ muted: !muted })}
      >
        {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>
    </div>
  );
}
