import type { ReactNode } from 'react';
import { BarChart3, Blend, Headphones, Palette, SlidersHorizontal } from 'lucide-react';
import { useSettings } from '../../stores/settingsStore';
import { useThemes } from '../../stores/themeStore';
import type { RepeatMode } from '../../types/settings';
import { Field, PendingTag, Segmented, Toggle } from '../ui/controls';
import { VolumeControl } from '../player/VolumeControl';

function Module({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="panel control-module" aria-label={title}>
      <header className="control-module__header">
        {icon}
        <h3 className="panel__title panel__title--small">{title}</h3>
      </header>
      <div className="control-module__body">{children}</div>
    </section>
  );
}

export function AudioModule() {
  return (
    <Module title="Audio" icon={<Headphones size={15} aria-hidden="true" />}>
      <VolumeControl compact />
      <div className="field">
        <span className="field__label">Equalizer</span>
        <PendingTag>Needs audio engine</PendingTag>
      </div>
    </Module>
  );
}

export function CrossfadeModule() {
  return (
    <Module title="Crossfade" icon={<Blend size={15} aria-hidden="true" />}>
      <p className="control-module__note">Crossfade between tracks is not implemented yet. It will only be possible for direct and radio streams.</p>
      <PendingTag />
    </Module>
  );
}

const REPEAT_OPTIONS = [
  { value: 'off', label: 'Off' },
  { value: 'all', label: 'All' },
  { value: 'one', label: 'One' },
] as const satisfies ReadonlyArray<{ value: RepeatMode; label: string }>;

export function PlayerModule() {
  const shuffle = useSettings((s) => s.shuffle);
  const repeat = useSettings((s) => s.repeat);
  const update = useSettings((s) => s.update);
  return (
    <Module title="Player" icon={<SlidersHorizontal size={15} aria-hidden="true" />}>
      <div className="field">
        <span className="field__label">Shuffle</span>
        <Toggle checked={shuffle} onChange={(v) => update({ shuffle: v })} label="Shuffle" />
      </div>
      <div className="field">
        <span className="field__label">Repeat</span>
        <Segmented label="Repeat" value={repeat} options={REPEAT_OPTIONS} onChange={(v) => update({ repeat: v })} />
      </div>
    </Module>
  );
}

const GLOW_OPTIONS = [
  { value: '0', label: 'Off' },
  { value: '0.5', label: 'Low' },
  { value: '1', label: 'Med' },
  { value: '1.5', label: 'High' },
] as const;

export function AppearanceModule() {
  const themes = useThemes((s) => s.themes);
  const activeThemeId = useSettings((s) => s.activeThemeId);
  const glowLevel = useSettings((s) => s.glowLevel);
  const update = useSettings((s) => s.update);
  const glowValue = GLOW_OPTIONS.reduce((best, o) =>
    Math.abs(Number(o.value) - glowLevel) < Math.abs(Number(best.value) - glowLevel) ? o : best,
  ).value;

  return (
    <Module title="Appearance" icon={<Palette size={15} aria-hidden="true" />}>
      <Field label="Theme">
        {(id) => (
          <select id={id} className="select" value={activeThemeId} onChange={(e) => update({ activeThemeId: e.currentTarget.value })}>
            {themes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <div className="field">
        <span className="field__label">Glow</span>
        <Segmented label="Glow intensity" value={glowValue} options={GLOW_OPTIONS} onChange={(v) => update({ glowLevel: Number(v) })} />
      </div>
    </Module>
  );
}

export function VisualizerModule() {
  return (
    <Module title="Visualizer" icon={<BarChart3 size={15} aria-hidden="true" />}>
      <p className="control-module__note">Visualizers need the audio analysis engine, which is not built yet.</p>
      <PendingTag />
    </Module>
  );
}

export function ControlStrip() {
  return (
    <div className="control-strip area-controls">
      <AudioModule />
      <CrossfadeModule />
      <PlayerModule />
      <AppearanceModule />
      <VisualizerModule />
    </div>
  );
}
