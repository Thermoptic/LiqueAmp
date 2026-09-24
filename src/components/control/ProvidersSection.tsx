import { useEffect, useState } from 'react';
import { getScriptStatus, type ScriptStatus } from '../../lib/loadScript';
import { useProviderStatus } from '../../services/providers/status';
import { radioBrowser } from '../../services/radio/radioBrowser';
import { useFavorites } from '../../stores/favoritesStore';
import { useLibrary } from '../../stores/libraryStore';
import { useSettings } from '../../stores/settingsStore';
import { PROVIDER_IDS } from '../../types/advanced';
import type { ProviderId } from '../../types/media';
import { Status, Toggle } from '../ui/controls';

/**
 * What each provider does in LIQUEAMP — taken from how the engine actually
 * plays it (engine.ts: resolvePlaybackMode / embedKindFor), not aspirations.
 */
const FACTS: Record<ProviderId, { name: string; playback: string; analysis: string; metadata: string; account: string; script?: string }> = {
  direct: {
    name: 'Direct streams',
    playback: 'Native audio (browser audio element), HLS via hls.js',
    analysis: 'Real analysis, visualizer and EQ — when the server allows browser access (CORS)',
    metadata: 'Declared by the source (HTTP headers, Icecast, HLS manifest)',
    account: 'Not needed',
  },
  radio: {
    name: 'Radio',
    playback: 'Native audio (browser audio element), HLS via hls.js',
    analysis: 'Real analysis, visualizer and EQ — when the station allows browser access (CORS)',
    metadata: 'radio-browser.info community directory',
    account: 'Not needed',
  },
  youtube: {
    name: 'YouTube',
    playback: 'Official YouTube embedded player (IFrame Player API) for videos; playlists open on YouTube',
    analysis: 'None — the provider player does not expose audio to the page',
    metadata: 'YouTube oEmbed',
    account: 'Not needed',
    script: 'https://www.youtube.com/iframe_api',
  },
  'youtube-music': {
    name: 'YouTube Music',
    playback: 'Official YouTube embedded player — music.youtube.com tracks play as YouTube videos; playlists open on YouTube Music',
    analysis: 'None — the provider player does not expose audio to the page',
    metadata: 'YouTube oEmbed',
    account: 'Not needed',
    script: 'https://www.youtube.com/iframe_api',
  },
  spotify: {
    name: 'Spotify',
    playback: 'Official Spotify embed (iFrame API). Without a Spotify login in this browser Spotify plays 30-second previews; volume is set in the Spotify player',
    analysis: 'None — the provider player does not expose audio to the page',
    metadata: 'Spotify oEmbed',
    account: 'Managed by Spotify’s own player — LIQUEAMP never sees or stores a login',
    script: 'https://open.spotify.com/embed/iframe-api/v1',
  },
  soundcloud: {
    name: 'SoundCloud',
    playback: 'Official SoundCloud widget (Widget API)',
    analysis: 'None — the provider player does not expose audio to the page',
    metadata: 'SoundCloud oEmbed',
    account: 'Not needed',
    script: 'https://w.soundcloud.com/player/api.js',
  },
};

const SCRIPT_TEXT: Record<ScriptStatus, string> = {
  'not-loaded': 'Not loaded this session (loads only when you play this provider)',
  loading: 'Loading…',
  loaded: 'Loaded',
  failed: 'Failed to load',
};

const time = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString() : null);

/** Technical provider overview with enable/disable (PROVIDERS §27, §43, §80). */
export function ProvidersSection() {
  const providers = useSettings((s) => s.providers);
  const update = useSettings((s) => s.update);
  const runtime = useProviderStatus();
  const media = useLibrary((s) => s.media);
  const stationFavourites = useFavorites((s) => s.favorites.filter((f) => f.type === 'station').length);
  // Script/directory state lives outside React; refresh the view every few seconds.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 3000);
    return () => window.clearInterval(id);
  }, []);

  const counts = new Map<ProviderId, number>();
  for (const m of media) counts.set(m.provider, (counts.get(m.provider) ?? 0) + 1);

  return (
    <div className="control-stack">
      <section className="panel">
        <header className="panel__header">
          <h2 className="panel__title">Providers</h2>
        </header>
        <div className="panel__body">
          <p className="muted control-note">
            Switching a provider off stops LIQUEAMP from importing or playing it (and, for Radio, from contacting the directory). Library items are kept. No provider
            needs an API key, and none is stored.
          </p>
        </div>
      </section>
      {PROVIDER_IDS.map((id) => {
        const facts = FACTS[id];
        const enabled = providers[id].enabled;
        const run = runtime[id];
        const rows: Array<[string, string]> = [
          ['Playback', facts.playback],
          ['Audio analysis', facts.analysis],
          ['Metadata', facts.metadata],
          ['Account', facts.account],
          ['In library', id === 'radio' ? `${counts.get(id) ?? 0} items · ${stationFavourites} favourite stations` : `${counts.get(id) ?? 0} items`],
        ];
        if (facts.script) rows.push(['Player script', SCRIPT_TEXT[getScriptStatus(facts.script)]]);
        if (id === 'radio') rows.push(['Directory server', radioBrowser.serverInUse ?? 'Not contacted yet this session']);
        rows.push(['Last played', time(run?.lastPlayingAt) ?? '— (not this session)']);
        if (run?.lastError) rows.push(['Last error', `${time(run.lastError.at)} · ${run.lastError.title} — ${run.lastError.message}`]);
        return (
          <section key={id} className="panel provider-card" aria-labelledby={`provider-${id}`}>
            <header className="panel__header">
              <h3 className="panel__title panel__title--small" id={`provider-${id}`}>
                {facts.name}
              </h3>
              <div className="panel__actions">
                <Status tone={enabled ? 'ok' : 'idle'}>{enabled ? 'ENABLED' : 'DISABLED'}</Status>
                <Toggle
                  checked={enabled}
                  showState={false}
                  label={`${facts.name} enabled`}
                  onChange={(v) => update({ providers: { ...providers, [id]: { enabled: v } } })}
                />
              </div>
            </header>
            <div className="panel__body">
              <dl className="kv-list">
                {rows.map(([k, v]) => (
                  <div key={k} className="kv-list__row">
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>
        );
      })}
    </div>
  );
}
