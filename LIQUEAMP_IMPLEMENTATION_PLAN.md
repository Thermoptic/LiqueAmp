# LIQUEAMP — Implementation Plan (Phase 1 audit)

Status: Approved 2026-09-23. All phases (2–15) complete 2026-09-24 — see §7.
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
| Fonts | JetBrains Mono for everything, bundled locally (`@fontsource`); display role = weight 800 (was Doto until 2026-09-24, see §3.6) | Works offline; no remote font dependency. |
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
   **Changed 2026-09-24 (user decision):** Doto is no longer used. The display
   role (branding, headings, track title) is JetBrains Mono at weight 800, so
   the whole app uses one typeface. SPEC §12 / DESIGN / THEMING still mention
   Doto; this entry records the deviation.
8. **History snapshots.** ARCH §21 stores only `mediaItemId`. Radio stations
   and resolved URLs are not necessarily in the library, so a bare id could
   not be shown or replayed. → `HistoryEntry` also stores a snapshot of the
   played `MediaItem`.
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
| YouTube / YT Music | Official IFrame Player API (embedded); YouTube playlists open externally | Play/pause/seek/volume via API (verified) | oEmbed — CORS verified 2026-09-23 | **Never** (no raw audio) |
| Spotify | Official iFrame API (embedded) | Play/pause/seek; **no volume** (verified). Full tracks only when logged in to Spotify in the browser, otherwise previews (verified: 30 s preview) | oEmbed — CORS verified; no artist field | **Never** |
| SoundCloud | Official Widget API (embedded) | Play/pause/seek/volume via API (verified) | oEmbed — CORS verified | **Never** |

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
- **Moods.** Radio Browser has no mood field; the MOOD tab is a curated set of
  real directory tags per mood, and shows those tags. Directory "clicks" are
  shown as clicks, never as listeners.
- **Verified 2026-09-23:** Radio Paradise (Radio Browser entry, https AAC)
  plays with real Web Audio analysis in the in-app browser.
- **ICY "now playing".** Browsers generally cannot read ICY metadata from an
  audio stream. It is shown only where a source actually provides it; otherwise `—`.
- **Referrer.** The page sends no `Referer` (`<meta name="referrer" content="no-referrer">`).
  Verified 2026-09-23: SomaFM's Icecast servers answer 403 to a `localhost`
  referrer (hotlink protection) but play without one. Phase 8: the YouTube
  IFrame player requires a referrer, so its iframe must set
  `referrerpolicy="strict-origin-when-cross-origin"` explicitly.
- **Embedded players never move.** Moving an iframe reloads it, so provider
  players live in one fixed host positioned over the Now Playing slot, or
  docked (220×220) when the slot is not on screen. Provider terms require a
  visible player (YouTube: at least 200×200), so it is never hidden.
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

As built (updated in phase 15; the phase-1 proposal differed in detail):

```text
src/
  app/            bootstrap (hydration, engine, media session, keyboard, PWA),
                  router (base-path aware), dashboard, sections
  components/     audio/ control/ import/ layout/ library/ navigation/ player/
                  pwa/ queue/ radio/ settings/ ui/ visualizer/
  services/
    playback/     PlaybackEngine (the one engine), native audio + Web Audio
                  graph, embedded provider players, queue, history recorder,
                  media session
    providers/    detection, direct/playlist resolution, oEmbed, runtime
                  status, source testing
    analysis/     AnalyserNode reader, features, EQ
    visualizers/  registry, renderer, one module per visualizer
    radio/        radio-browser.info client, stations, moods
    themes/       theme model, Base16/Base24/Tinted8 import/export
    import/       URL import pipeline
    backup/       JSON backup export, validation, transactional import
    storage/      IndexedDB (idb) + repositories
    input/        keyboard layer          a11y/  live-region announcer
    pwa/          service worker registration, install, updates
  stores/         zustand stores (settings, playback, queue, library, …)
  types/          media, settings, advanced (/control), theme, visualizer
  lib/            small helpers (format, ids, script loading, fields)
  styles/         tokens.css, base, ui, layout, components, control
pwa/              service-worker template + Vite plugin (precache, 404.html)
e2e/              acceptance test (MASTER §88) and performance measurements
scripts/          icon generation
```

---

## 6. Phases

Each phase ends with typecheck, tests, build and a look at the running app
(desktop and mobile widths), then a git commit.

| # | Phase | Main deliverable |
|---|---|---|
| 1 | Audit | This document. |
| 2 ✅ | Shell | Vite/React/TS scaffold, theme tokens + default theme, responsive grid shell with all panels (empty states), navigation, `/control` route, storage layer. |
| 3 ✅ | Playback engine | Central engine and store, queue transitions, error model, dual audio element + Web Audio graph. |
| 4 ✅ | Direct streams | URL detection/normalization, M3U/PLS parsing, HLS, live vs seekable. |
| 5 ✅ | Radio | Radio Browser client, tabs (radio/genres/locations/mood), search/filter/sort, station info. |
| 6 ✅ | Library | Categories, favorites, history recording, playlists, queue UI incl. reorder. |
| 7 ✅ | URL import | Import pipeline with preview + duplicate detection. |
| 8 ✅ | Providers | YouTube, YT Music, SoundCloud, Spotify adapters (embedded/external modes). |
| 9 ✅ | Themes | Theme editor, Base16/Base24/Tinted8 import, mapping editor, export. |
| 10 ✅ | Audio analysis | Analyser service, normalized frames, EQ/bass/mid/treble DSP. |
| 11 ✅ | Visualizers | Spectrum Bars, Waveform, Terminal Spectrum, Minimal Meter, Oscilloscope. |
| 12 ✅ | Integration | Media Session, keyboard shortcuts, accessibility pass. |
| 13 ✅ | PWA | Manifest, icons, service worker, offline shell. |
| 14 ✅ | Control panel | Media/provider/category management, import/export, diagnostics. |
| 15 ✅ | Hardening | Acceptance test (MASTER §88), performance, visual refinement. |

Deferred unless requested: crossfade (needs two simultaneous native sources;
possible only for direct/radio), visualizer generator (SPEC §33), light theme,
Spotify Web Playback SDK.

---

## 7. Completion (phase 15)

### Acceptance test (MASTER §88)

`npm run e2e` builds the app and runs the 30 acceptance checks — plus an
axe-core accessibility audit — in every installed Chrome/Edge, headless, in a
throwaway profile. It serves the build like GitHub Pages (base path, 404.html
fallback), plays generated audio from two local servers (one with CORS, one
without) and drives the real UI with mouse and keyboard input. Reports:
`e2e/output/report-<browser>.md`.

Result on 2026-09-24: **31/31 in Chrome and 31/31 in Edge.**

NOT VERIFIED (not available on the test machine or not scriptable):
Firefox, Safari/iOS, installing on a real phone, lock-screen / notification
media controls on a device (handlers are verified; the OS UI is not),
Spotify playback while logged in to Spotify.

### Performance (measured, `npm run perf`)

- Steady playback with the spectrum visualizer: ~18 ms script per second
  (~0.3 ms per frame), ~5 layouts/s, DOM updates only in Now Playing (clock)
  and the status bar; without visualizer ~2 ms/s.
- Memory: JS heap flat over a minute of playback (6.1 → 6.0 MB after GC).
- A warm full relayout of the dashboard takes < 1 ms; the one-off cost at a
  cold start (first text shaping with the web fonts) is not a CSS problem.
- First contentful paint, cold / warm (service worker): desktop 352 / 44 ms;
  simulated phone (4× CPU, 4G) 808 / 76 ms. The cold figure is the static
  "LIQUEAMP · STARTING…" line in index.html; the dashboard itself follows once
  local data is loaded (deliberate, so the saved theme never flashes).
- Build: React + router in their own chunk (~60% of the code), so an update
  re-downloads only the app chunk (~195 kB, ~59 kB gzip). The remaining
  >500 kB warning is hls.js, loaded only when an HLS stream plays.

### Decisions made after the phase plan

- **GitHub Pages** (`base: '/LiqueAmp/'`): router basename, service worker
  scope/precache under the base path, relative manifest, 404.html app shell for
  deep links. The app also still works when served from `/`.
- **EQ in the player**: BASS / MID / TREBLE in Now Playing are ±12 dB
  selectors (as in the reference); the control strip shows volume, preset and
  status; the full sliders live in Settings › Equalizer. This keeps the control
  strip compact so the dashboard fits a 1920×1080 viewport.
- **Dashboard lower area** (user request, 2026-09-24): the Crossfade
  placeholder is gone; Audio sits under the sidebar with the same width as
  Library; the Playlists / Favourites / History panel runs down both lower
  rows; Player, Appearance and Visualizer sit under Queue, Station Info and
  Quick Actions (CSS subgrid keeps them aligned with Audio).
- **Now Playing artwork** can be switched off (Settings › Now Playing); provider
  players then dock in the corner, because they must stay visible to play.
- **Station Info** shows the playing station when nothing is selected
  (marked NOW PLAYING), as Quick Actions already did.
- **/control** holds provider enable/disable, media enable/disable, backup
  import/export (format `liqueamp-backup` v1) and analyser/render settings;
  none of it stores secrets.
- **Unchanged by design**: no listener counts, CPU/memory/latency or weather
  (not measurable in a browser); crossfade still deferred.

