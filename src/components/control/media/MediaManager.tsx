import { useId, useMemo, useState } from 'react';
import { FlaskConical, Pencil, Trash2 } from 'lucide-react';
import { testSource, type SourceTestResult } from '../../../services/providers/testSource';
import { useLibrary } from '../../../stores/libraryStore';
import { useUi } from '../../../stores/uiStore';
import { PROVIDER_IDS } from '../../../types/advanced';
import type { MediaItem, ProviderId } from '../../../types/media';
import { PROVIDER_LABEL } from '../../player/NowPlayingPanel';
import { Dialog } from '../../ui/Dialog';
import { RowList } from '../../ui/RowList';
import { EmptyState, Status, Toggle } from '../../ui/controls';
import { MediaEditDialog } from './MediaEditDialog';

type StateFilter = 'all' | 'enabled' | 'disabled';

/**
 * Media management (SPEC §35): search, edit metadata, enable/disable, test
 * and remove library items. Adding media is the import panel above.
 */
export function MediaManager() {
  const media = useLibrary((s) => s.media);
  const categories = useLibrary((s) => s.categories);
  const updateMedia = useLibrary((s) => s.updateMedia);
  const removeMedia = useLibrary((s) => s.removeMedia);
  const toast = useUi((s) => s.toast);
  const [query, setQuery] = useState('');
  const [provider, setProvider] = useState<ProviderId | 'all'>('all');
  const [state, setState] = useState<StateFilter>('all');
  const [editing, setEditing] = useState<MediaItem | null>(null);
  const [removing, setRemoving] = useState<MediaItem | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, SourceTestResult>>({});
  const ids = { search: useId(), provider: useId(), state: useId() };

  const categoryName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const q = query.trim().toLowerCase();
  const shown = media
    .filter((m) => provider === 'all' || m.provider === provider)
    .filter((m) => state === 'all' || (state === 'disabled') === (m.enabled === false))
    .filter((m) => !q || [m.title, m.artist, m.album, ...(m.tags ?? [])].some((v) => v?.toLowerCase().includes(q)))
    .sort((a, b) => a.title.localeCompare(b.title));

  async function runTest(item: MediaItem) {
    setTesting(item.id);
    try {
      const result = await testSource(item);
      setResults((r) => ({ ...r, [item.id]: result }));
    } finally {
      setTesting(null);
    }
  }

  return (
    <section className="panel" aria-labelledby="media-manage">
      <header className="panel__header">
        <h2 className="panel__title" id="media-manage">
          Library media
        </h2>
        <div className="panel__actions muted">
          {shown.length} of {media.length}
        </div>
      </header>
      <div className="panel__body media-manager">
        <div className="media-manager__filters">
          <label className="sr-only" htmlFor={ids.search}>
            Search media
          </label>
          <input id={ids.search} type="search" className="input" placeholder="Search title, artist, album, tag…" value={query} onChange={(e) => setQuery(e.currentTarget.value)} />
          <label className="sr-only" htmlFor={ids.provider}>
            Provider
          </label>
          <select id={ids.provider} className="select" value={provider} onChange={(e) => setProvider(e.currentTarget.value as ProviderId | 'all')}>
            <option value="all">All providers</option>
            {PROVIDER_IDS.map((p) => (
              <option key={p} value={p}>
                {PROVIDER_LABEL[p] ?? p}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor={ids.state}>
            State
          </label>
          <select id={ids.state} className="select" value={state} onChange={(e) => setState(e.currentTarget.value as StateFilter)}>
            <option value="all">Enabled and disabled</option>
            <option value="enabled">Enabled only</option>
            <option value="disabled">Disabled only</option>
          </select>
        </div>

        {media.length === 0 ? (
          <EmptyState title="LIBRARY EMPTY">Import a source above to add media.</EmptyState>
        ) : shown.length === 0 ? (
          <EmptyState title="NO MATCHES">Nothing matches these filters.</EmptyState>
        ) : (
          <RowList aria-label="Library media" className="media-manager__list">
            {shown.map((m) => {
              const result = results[m.id];
              const meta = [m.artist, PROVIDER_LABEL[m.provider] ?? m.provider, m.categoryId ? categoryName.get(m.categoryId) : null].filter(Boolean).join(' · ');
              return (
                <li key={m.id} className="media-manager__row" data-disabled={m.enabled === false || undefined}>
                  <div className="media-manager__main">
                    <span className="media-manager__title truncate">{m.title}</span>
                    <span className="media-manager__meta truncate">
                      {meta}
                      {m.enabled === false && <span className="station-row__flag station-row__flag--off">DISABLED</span>}
                    </span>
                  </div>
                  <div className="media-manager__actions">
                    <Toggle
                      checked={m.enabled !== false}
                      showState={false}
                      label={`${m.title} enabled`}
                      onChange={(v) => void updateMedia(m.id, { enabled: v })}
                    />
                    <button type="button" className="btn btn--ghost btn--icon" aria-label={`Test ${m.title}`} title="Test source" disabled={testing !== null} onClick={() => void runTest(m)}>
                      <FlaskConical size={14} aria-hidden="true" />
                    </button>
                    <button type="button" className="btn btn--ghost btn--icon" aria-label={`Edit ${m.title}`} title="Edit" onClick={() => setEditing(m)}>
                      <Pencil size={14} aria-hidden="true" />
                    </button>
                    <button type="button" className="btn btn--ghost btn--icon" aria-label={`Remove ${m.title}`} title="Remove" onClick={() => setRemoving(m)}>
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                  {(testing === m.id || result) && (
                    <div className="media-manager__test" role="status">
                      {testing === m.id ? (
                        <Status tone="warn">TESTING…</Status>
                      ) : (
                        result && (
                          <dl className="kv-list">
                            {result.lines.map((l) => (
                              <div key={l.label} className="kv-list__row">
                                <dt>{l.label}</dt>
                                <dd>
                                  <Status tone={l.tone}>{l.value}</Status>
                                </dd>
                              </div>
                            ))}
                          </dl>
                        )
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </RowList>
        )}
      </div>

      <MediaEditDialog item={editing} onClose={() => setEditing(null)} />
      <Dialog
        open={removing !== null}
        title="Remove from library?"
        onClose={() => setRemoving(null)}
        onSubmit={() => {
          const item = removing;
          setRemoving(null);
          if (item) void removeMedia(item.id).then(() => toast('Removed from library', 'success'));
        }}
        submitLabel="Remove"
        danger
      >
        <p>
          Remove <strong>{removing?.title}</strong> from the library? Playlists that contain it will skip it. History is kept. The source itself is not affected.
        </p>
      </Dialog>
    </section>
  );
}
