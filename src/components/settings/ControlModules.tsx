import type { ReactNode } from 'react';
import { BarChart3, Headphones, Palette, Settings2, SlidersHorizontal } from 'lucide-react';
import { useSettings } from '../../stores/settingsStore';
import { groupThemes } from '../../services/themes/builtin';
import { useThemes } from '../../stores/themeStore';
import type { RepeatMode } from '../../types/settings';
import { Field, Segmented, Toggle } from '../ui/controls';
import { VolumeControl } from '../player/VolumeControl';
import { EqControls } from '../audio/EqControls';
import { Link } from 'react-router';
import { VisualizerQuickControls } from '../visualizer/VisualizerControls';

interface ModuleProps {
  title: string;
  icon: ReactNode;
  /** Grid placement class (area-audio, area-player, …); area-controls marks it as a settings module on mobile. */
  area: string;
  action?: ReactNode;
  children: ReactNode;
}

function Module({ title, icon, area, action, children }: ModuleProps) {
  return (
    <section className={`panel control-module area-controls ${area}`} aria-label={title}>
      <header className="control-module__header">
        {icon}
        <h3 className="panel__title panel__title--small">{title}</h3>
        {action}
      </header>
      <div className="control-module__body">{children}</div>
    </section>
  );
}

export function AudioModule() {
  return (
    <Module title="Audio" area="area-audio" icon={<Headphones size={15} aria-hidden="true" />}>
      <VolumeControl compact />
      <EqControls compact />
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
    <Module title="Player" area="area-player" icon={<SlidersHorizontal size={15} aria-hidden="true" />}>
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
    <Module title="Appearance" area="area-appearance" icon={<Palette size={15} aria-hidden="true" />}>
      <Field label="Theme">
        {(id) => (
          <select id={id} className="select" value={activeThemeId} onChange={(e) => update({ activeThemeId: e.currentTarget.value })}>
            {groupThemes(themes).map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.themes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
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
    <Module
      title="Visualizer"
      area="area-visualizer"
      icon={<BarChart3 size={15} aria-hidden="true" />}
      action={
        // icon only: the module sits in a narrow column, a text link would wrap the header
        <Link to="/control/visualizers" className="control-module__link control-module__action" aria-label="More visualizer settings" title="More visualizer settings">
          <Settings2 size={14} aria-hidden="true" />
        </Link>
      }
    >
      <VisualizerQuickControls />
    </Module>
  );
}

