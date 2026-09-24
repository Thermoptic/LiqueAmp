import { useId, useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import {
  applyImport,
  backupFileName,
  createBackup,
  parseBackup,
  planImport,
  type ExistingData,
  type ImportMode,
  type ImportPlan,
  type ParsedBackup,
} from '../../services/backup/backup';
import { repositories } from '../../services/storage/repository';
import { useFavorites } from '../../stores/favoritesStore';
import { useHistory } from '../../stores/historyStore';
import { useLibrary } from '../../stores/libraryStore';
import { usePlaylists } from '../../stores/playlistStore';
import { useSettings } from '../../stores/settingsStore';
import { useThemes } from '../../stores/themeStore';
import { useUi } from '../../stores/uiStore';
import { Dialog } from '../ui/Dialog';
import { Segmented, Status } from '../ui/controls';

const LABELS = {
  media: 'Library media',
  categories: 'Categories',
  playlists: 'Playlists',
  favorites: 'Favourites',
  stations: 'Saved stations',
  themes: 'Custom themes',
  history: 'History',
} as const;
type Key = keyof typeof LABELS;
const KEYS = Object.keys(LABELS) as Key[];

const MODE_OPTIONS = [
  { value: 'merge', label: 'Merge' },
  { value: 'replace', label: 'Replace' },
] as const satisfies ReadonlyArray<{ value: ImportMode; label: string }>;

/** Everything currently stored (read from storage, the source of truth). */
async function readExisting(): Promise<ExistingData> {
  const [themes, categories, media, playlists, favorites, stations, history] = await Promise.all([
    repositories.themes.getAll(),
    repositories.categories.getAll(),
    repositories.media.getAll(),
    repositories.playlists.getAll(),
    repositories.favorites.getAll(),
    repositories.stations.getAll(),
    repositories.history.getAll(),
  ]);
  return { themes, categories, media, playlists, favorites, stations, history };
}

async function reloadStores(settings: boolean) {
  await Promise.all([
    useLibrary.getState().hydrate(),
    usePlaylists.getState().hydrate(),
    useFavorites.getState().hydrate(),
    useHistory.getState().hydrate(),
    useThemes.getState().hydrate(),
    settings ? useSettings.getState().hydrate() : Promise.resolve(),
  ]);
}

function ExportPanel() {
  const [includeHistory, setIncludeHistory] = useState(true);
  const [busy, setBusy] = useState(false);
  const toast = useUi((s) => s.toast);
  const counts = {
    media: useLibrary((s) => s.media.length),
    categories: useLibrary((s) => s.categories.length),
    playlists: usePlaylists((s) => s.playlists.length),
    favorites: useFavorites((s) => s.favorites.length),
    themes: useThemes((s) => s.themes.filter((t) => t.source !== 'builtin').length),
    history: useHistory((s) => s.entries.length),
  };
  const checkboxId = useId();

  async function download() {
    setBusy(true);
    try {
      const backup = await createBackup(useSettings.getState(), { includeHistory });
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = backupFileName();
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Backup downloaded', 'success');
    } catch (err) {
      toast(`Export failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="export-heading">
      <header className="panel__header">
        <h2 className="panel__title" id="export-heading">
          Export
        </h2>
      </header>
      <div className="panel__body backup">
        <p className="muted control-note">
          A JSON file with your library, categories, playlists, favourites, saved stations, custom themes and settings
          {includeHistory ? ', and your listening history' : ''}. LIQUEAMP stores no passwords or tokens, so there are none in the file. The queue is not included.
        </p>
        <p className="backup__summary">
          {counts.media} media · {counts.categories} categories · {counts.playlists} playlists · {counts.favorites} favourites · {counts.themes} custom themes
          {includeHistory ? ` · ${counts.history} history entries` : ''}
        </p>
        <label className="checkbox" htmlFor={checkboxId}>
          <input id={checkboxId} type="checkbox" checked={includeHistory} onChange={(e) => setIncludeHistory(e.currentTarget.checked)} />
          Include listening history
        </label>
        <div>
          <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void download()}>
            <Download size={14} aria-hidden="true" /> {busy ? 'Preparing…' : 'Download backup'}
          </button>
        </div>
      </div>
    </section>
  );
}

function ImportPanel() {
  const [backup, setBackup] = useState<ParsedBackup | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<ExistingData | null>(null);
  const [mode, setMode] = useState<ImportMode>('merge');
  const [withSettings, setWithSettings] = useState(true);
  const [withHistory, setWithHistory] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useUi((s) => s.toast);
  const fileRef = useRef<HTMLInputElement>(null);
  const ids = { file: useId(), settings: useId(), history: useId() };

  const options = { mode, settings: withSettings && !!backup?.settings, history: withHistory && !!backup?.history };
  const plan: ImportPlan | null = backup && existing ? planImport(backup, existing, options) : null;

  function reset() {
    setBackup(null);
    setExisting(null);
    setFileName('');
    setError(null);
    setMode('merge');
    if (fileRef.current) fileRef.current.value = '';
  }

  async function onFile(file: File | undefined) {
    reset();
    if (!file) return;
    setFileName(file.name);
    const result = parseBackup(await file.text());
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setExisting(await readExisting());
    setBackup(result.backup);
  }

  async function run() {
    if (!plan) return;
    setConfirming(false);
    setBusy(true);
    try {
      await applyImport(plan, mode);
      await reloadStores(options.settings);
      const added = KEYS.reduce((n, k) => n + plan.counts[k].added + plan.counts[k].updated, 0);
      toast(`Import complete — ${added} records written`, 'success');
      reset();
    } catch (err) {
      // the transaction rolled back: nothing changed
      setError(`Import failed and nothing was changed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  const invalidTotal = backup ? KEYS.reduce((n, k) => n + (k === 'history' ? (backup.history?.invalid ?? 0) : backup[k].invalid), 0) : 0;
  const removedTotal = plan ? KEYS.reduce((n, k) => n + plan.removed[k], 0) : 0;

  return (
    <section className="panel" aria-labelledby="import-heading">
      <header className="panel__header">
        <h2 className="panel__title" id="import-heading">
          Import
        </h2>
      </header>
      <div className="panel__body backup">
        <p className="muted control-note">Choose a LIQUEAMP backup. It is checked first and nothing changes until you confirm.</p>
        <div className="backup__file">
          <label htmlFor={ids.file} className="btn">
            <Upload size={14} aria-hidden="true" /> Choose backup file…
          </label>
          <input
            ref={fileRef}
            id={ids.file}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            onChange={(e) => void onFile(e.currentTarget.files?.[0])}
          />
          {fileName && <span className="muted truncate">{fileName}</span>}
        </div>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        {backup && plan && (
          <>
            <p>
              <Status tone="ok">VALID BACKUP</Status>{' '}
              <span className="muted">{backup.exportedAt ? `exported ${new Date(backup.exportedAt).toLocaleString()}` : 'export date unknown'}</span>
            </p>
            <div className="field">
              <span className="field__label">Mode</span>
              <Segmented<ImportMode> label="Import mode" value={mode} options={MODE_OPTIONS} onChange={setMode} />
            </div>
            <p className="control-note muted">
              {mode === 'merge'
                ? 'Merge adds what is new and updates records with the same id. Sources already in your library are merged, not duplicated.'
                : 'Replace removes your current library, playlists, favourites, saved stations and custom themes first, then restores the backup.'}
            </p>
            <table className="backup__table">
              <caption className="sr-only">What the import will do</caption>
              <thead>
                <tr>
                  <th scope="col">Data</th>
                  <th scope="col">In file</th>
                  <th scope="col">New</th>
                  <th scope="col">Updated</th>
                  {mode === 'replace' && <th scope="col">Removed first</th>}
                  <th scope="col">Skipped (invalid)</th>
                </tr>
              </thead>
              <tbody>
                {KEYS.map((k) => {
                  const checked = k === 'history' ? backup.history : backup[k];
                  if (k === 'history' && (!backup.history || !options.history)) return null;
                  const c = plan.counts[k];
                  return (
                    <tr key={k}>
                      <th scope="row">{LABELS[k]}</th>
                      <td>{checked ? checked.items.length : 0}</td>
                      <td>{c.added}</td>
                      <td>
                        {c.updated}
                        {c.merged ? ` + ${c.merged} merged` : ''}
                      </td>
                      {mode === 'replace' && <td>{plan.removed[k]}</td>}
                      <td>{checked?.invalid ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {invalidTotal > 0 && <p className="notice">{invalidTotal} record(s) failed validation and will be skipped. Everything else is imported.</p>}
            {backup.settings && (
              <label className="checkbox" htmlFor={ids.settings}>
                <input id={ids.settings} type="checkbox" checked={withSettings} onChange={(e) => setWithSettings(e.currentTarget.checked)} />
                Also restore settings (theme, audio, visualizer, providers)
              </label>
            )}
            {backup.history && (
              <label className="checkbox" htmlFor={ids.history}>
                <input id={ids.history} type="checkbox" checked={withHistory} onChange={(e) => setWithHistory(e.currentTarget.checked)} />
                Import listening history
              </label>
            )}
            <div className="backup__actions">
              <button type="button" className={`btn ${mode === 'replace' ? 'btn--danger' : 'btn--primary'}`} disabled={busy} onClick={() => (mode === 'replace' ? setConfirming(true) : void run())}>
                {busy ? 'Importing…' : mode === 'replace' ? 'Replace my data…' : 'Import'}
              </button>
              <button type="button" className="btn" disabled={busy} onClick={reset}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
      <Dialog open={confirming} title="Replace local data?" onClose={() => setConfirming(false)} onSubmit={() => void run()} submitLabel="Replace" danger>
        <p>
          This removes {removedTotal} existing record(s) and restores the backup instead. It cannot be undone — export a backup of the current data first if you might
          need it.
        </p>
      </Dialog>
    </section>
  );
}

/** Structured export and validated import of local data (ARCH §28, SPEC §38). */
export function ImportExportSection() {
  return (
    <div className="control-stack">
      <ExportPanel />
      <ImportPanel />
    </div>
  );
}
