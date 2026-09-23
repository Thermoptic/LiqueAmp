# LIQUEAMP — Implementation Plan (Phase 1 audit)

Status: Proposed, not yet approved
Date: 2026-09-22

This file records the Phase 1 audit required by `LIQUEAMP_MASTER_BUILD_PROMPT.md`
§3/§91: what exists, the chosen stack, conflicts between the spec documents
and how they are resolved, what the providers can honestly do, and the
phase plan. Items marked `NOT VERIFIED` must be checked against the real
provider/browser before being relied on.

---

## 1. Repository audit

| Item | Finding |
|---|---|
| Source code | None. The folder contains only the 7 spec documents and `liqueampui.png`. |
| Framework / build | None yet. |
| Package manager | None yet. Installed: Node 24.19, npm 11.17, bun 1.4. |
| Routing, state, styling, storage, audio, PWA | None yet. |
| Git | Initialised; first commit is blocked because no git author identity is configured on this machine. |

The "reuse the existing system" rules therefore have nothing to reuse yet:
this is a new build, and they will start to apply from Phase 2 onwards.

### Document health

All documents were converted from Windows-1252 to UTF-8 on 2026-09-22.
`LIQUEAMP_VISUALIZERS.md` was fully restored from the original text. In the
other five documents, the box-drawing characters, arrows (`↓ → ▼`) and
status glyphs (`●`) inside code blocks were irreversibly replaced by `?`,
`¦` or `+` before conversion. All prose, headings and type definitions are intact.
Where a `?` appears alone in a flow diagram it means `↓`/`→`; in DESIGN
§10/§26/§29/§30/§83/§100, the `?` in front of a status label is a status dot.

---

## 2. Proposed stack

| Concern | Choice | Reason |
|---|---|---|
| Language | TypeScript, `strict` | Required (ARCH §56). |
| UI | React 19 | All docs assume React (VIS §71, ARCH §8). |
| Build | Vite | Fast, simple static SPA; no server needed (local-first, SPEC §37). |
| Package manager | npm | Already installed, standard. |
| Routing | React Router | Only `/` and `/control` are needed; the SPA fallback matters for PWA deep links. |
| App state | Zustand | Selector subscriptions, so components re-render only for the slices they read (ARCH §5, §41). Small, no boilerplate. |
| Persistence | IndexedDB via `idb`, behind a repository layer with schema versions | ARCH §26, §51. |
| PWA | `vite-plugin-pwa` (Workbox) | Manifest, service worker, offline shell (ARCH §34). |
| Fonts | Doto + a monospace body font, both bundled locally (`@fontsource`) | Works offline; no remote font dependency. |
| Icons | `lucide-react` | One coherent stroke family (DESIGN §62). |
| HLS (`.m3u8`) | `hls.js` where the browser lacks native HLS | Phase 4. |
| Theme files | `yaml` parser | Base16/Base24 schemes are YAML (THEMING §15). |
| Tests | Vitest + Testing Library + `fake-indexeddb` | Unit tests for logic, per ARCH §50. |

No backend. Spotify/SoundCloud features that would need a server-side secret
are out of scope unless a backend is explicitly requested later (see §4).

---

## 3. Conflicts between the documents, and resolutions

ARCH §59 requires conflicts to be resolved explicitly. Proposed resolutions:

1. **`MediaItem.playbackType`.** ARCH §9 uses provider names
   (`audio | radio | youtube | …`); PROVIDERS §7 and MASTER §15 use
   `direct | radio | embed | external`. → Use PROVIDERS/MASTER. The provider is
   already in `MediaItem.provider`, so duplicating it in `playbackType` adds nothing.
   The runtime `PlaybackMode` (`native-audio | embedded | external | unsupported`,
   PROVIDERS §33) is kept as a separate, computed value.
2. **Visualizer interface.** ARCH §30 has `update(audioData, dt)` + `render()`;
   VIS §5 has `render(frame)`. → Use VIS §5 (the dedicated, more detailed document).
3. **`HistoryEntry`.** ARCH §21 has `playedAt`; PROVIDERS §39 has
   `startedAt/endedAt`. → Use the union: `mediaId, startedAt, endedAt?,
   durationPlayed, completionPercentage?`.
4. **`RadioStation.genre`.** ARCH §22 uses `string`; PROVIDERS §15 uses `string[]`. → `string[]`.
   `online?: boolean` (ARCH) plus `lastChecked?` is kept; `lastStatus` (PROVIDERS) is dropped as redundant.
5. **Navigation.** SPEC §6 lists 10 core areas; SPEC §16, DESIGN §19 and MASTER §12
   list 6 sidebar items. → Sidebar = the 6 items + LIBRARY categories. RADIO,
   QUEUE and SEARCH are dashboard panels, not sidebar pages.
6. **Doto.** Doto is a dot-matrix display face and is hard to read at small sizes.
   SPEC §12 allows "where technically appropriate" → Doto for branding, panel
   headings, the track title and numeric readouts; a monospace face for body
   text and metadata (this matches the body text in `liqueampui.png`).
7. **Primary platform.** SPEC §4 says mobile-first; MASTER §10 describes the
   desktop dashboard. → One responsive layout, built mobile-first from Phase 2 rather than adapted at the end.

---

## 4. What each provider can honestly do

This is the most important constraint on the whole build. `NOT VERIFIED`
items are based on current knowledge of the official APIs and must be tested.

| Provider | Playback | Control | Metadata | Audio analysis / EQ |
|---|---|---|---|---|
| Direct stream | `<audio>` | Full (seek only if not live) | Title from URL/playlist file; codec/bitrate usually unknown | **Only if the server sends CORS headers** |
| Internet radio | `<audio>` | Play/pause/volume; no seek | Station data from the Radio Browser directory (radio-browser.info) | Only if the stream sends CORS headers |
| YouTube / YT Music | Official IFrame Player API (embedded) | Play/pause/seek/volume via API | Title via player API after load (oEmbed has no CORS — NOT VERIFIED) | **Never** (no raw audio) |
| Spotify | Official Embed / iFrame API; external "Open in Spotify" | Limited (NOT VERIFIED) | oEmbed (NOT VERIFIED for CORS) | **Never** |
| SoundCloud | Official Widget API (embedded) | Play/pause/seek/volume via API | oEmbed (NOT VERIFIED for CORS) | **Never** |

Consequences that shape the design:

- **CORS decides whether visualizers and EQ work.** A stream without CORS
  headers can still play, but once it is routed through Web Audio the browser
  outputs silence. The engine therefore uses two `<audio>` elements:
  - an *analysed* element that plays CORS streams through the Web Audio graph (EQ + analyser);
  - a *plain* element used when CORS is missing, with the visualizer shown as unavailable and the EQ marked "VISUAL CONTROL ONLY" (ARCH §32).

  This is still one playback engine and one playback session (MASTER §13).
- **Radio "listeners".** Radio Browser exposes click counts and votes, not
  live listener counts. The LISTENERS field will show `—`; click counts will
  not be relabelled as listeners.
- **ICY "now playing".** Browsers generally cannot read ICY metadata from an
  audio stream. It is shown only where a source actually provides it; otherwise `—`.
- **Spotify full-track playback** (Web Playback SDK) requires Premium and
  OAuth. PKCE works without a server, but this is deferred to Phase 8 and only built on request.

### Values in `liqueampui.png` that must not be copied

The reference image shows values the specs forbid unless they are measured:
`CPU: 12%`, `MEM: 48%`, `Latency: 282ms`, `Uptime`, `Buffer: 100%`, the
listener counts, and the weather/location in the header. The status bar will show
only real values: playback state, buffered seconds ahead (measured), network
online/offline, audio engine state and visualizer state. Header weather and
location are omitted because they would need an external service. The
`CLIAMP` name is replaced by `LIQUEAMP`.

---

## 5. Source layout

```text
src/
  app/            routes, providers, app shell
  components/     layout/, navigation/, player/, radio/, library/,
                  playlists/, queue/, history/, favorites/, search/,
                  audio/, visualizer/, settings/, control/, ui/
  services/
    playback/     PlaybackEngine, audio graph, media session
    providers/    registry, detectProvider, one adapter per provider
    storage/      idb repositories, migrations
    themes/       parser (base16/24/tinted8), mapping, apply
    analysis/     AnalyserNode → normalized VisualizerFrame
  visualizers/    registry + one module per visualizer
  stores/         zustand slices (playback, library, queue, …)
  types/          MediaItem, RadioStation, Playlist, Theme, …
  styles/         tokens.css, base.css
```

---

## 6. Phases

Each phase ends with typecheck, tests, build and a look at the running app
(desktop and mobile widths), then a git commit.

| # | Phase | Main deliverable |
|---|---|---|
| 1 | Audit | This document. |
| 2 | Shell | Vite/React/TS scaffold, theme tokens + default theme, responsive grid shell with all panels (empty states), navigation, `/control` route, storage layer. |
| 3 | Playback engine | Central engine and store, queue transitions, error model, dual audio element + Web Audio graph. |
| 4 | Direct streams | URL detection/normalization, M3U/PLS parsing, HLS, live vs seekable. |
| 5 | Radio | Radio Browser client, tabs (radio/genres/locations/mood), search/filter/sort, station info. |
| 6 | Library | Categories, favorites, history recording, playlists, queue UI incl. reorder. |
| 7 | URL import | Import pipeline with preview + duplicate detection. |
| 8 | Providers | YouTube, YT Music, SoundCloud, Spotify adapters (embedded/external modes). |
| 9 | Themes | Theme editor, Base16/Base24/Tinted8 import, mapping editor, export. |
| 10 | Audio analysis | Analyser service, normalized frames, EQ/bass/mid/treble DSP. |
| 11 | Visualizers | Spectrum Bars, Waveform, Terminal Spectrum, Minimal Meter, Oscilloscope. |
| 12 | Integration | Media Session, keyboard shortcuts, accessibility pass. |
| 13 | PWA | Manifest, icons, service worker, offline shell. |
| 14 | Control panel | Media/provider/category management, import/export, diagnostics. |
| 15 | Hardening | Acceptance test (MASTER §88), performance, visual refinement. |

Deferred unless requested: crossfade (needs two simultaneous native sources;
possible only for direct/radio), visualizer generator (SPEC §33), light theme,
Spotify Web Playback SDK.
