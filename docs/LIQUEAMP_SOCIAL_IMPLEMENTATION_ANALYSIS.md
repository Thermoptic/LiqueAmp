# LIQUEAMP SOCIAL — IMPLEMENTATION ANALYSIS

**Status:** Analysis only. No code has been changed for this document.
**Input:** `docs/LIQUEAMP_SOCIAL_ARCHITECTURE.md` (the "spec"), compared against the repository at commit `327805a` (2026-09-25).
**Method:** Every statement below was checked in the source. Where something could not be established, it says **UNKNOWN** or **DECISION NEEDED**.


> **Addendum (2026-09-25).** This analysis was written at commit `327805a`,
> before Checkpoints 1–4. Since then the profile model, the settings split,
> scoped storage (D1: one database per profile), the Quick Actions migration
> and the account/sync foundation are implemented. Several proposals here
> were decided differently (see `docs/LIQUEAMP_IMPLEMENTATION_PLAN.md` §30):
> friendships are one-way without requests (D17, replacing the
> PENDING/ACCEPTED/DECLINED/BLOCKED model in §4), there are no avatars (D10),
> presence is only "LiqueAmp is open" (D11), and Supabase is selected (D16).

---

## 0. Short answers

| Question | Answer |
|---|---|
| Where is Quick Actions implemented? | `src/components/player/QuickActionsPanel.tsx` (component `QuickActionsPanel`, line 16), mounted in `src/app/Dashboard.tsx:53` inside `.lower.area-lower`. Grid slot `.area-actions` in `src/styles/layout.css:124` and the mobile rules in `layout.css` (~205–215). Styles `.quick-actions*` in `src/styles/components.css` (649, 655, 1382, 1604). E2E check 15 in `e2e/acceptance.mjs:270–280` uses it. |
| How is LiqueAmp state stored? | Only in the browser. One IndexedDB database `liqueamp`, version 1 (`src/services/storage/db.ts:12–14`), accessed through `src/services/storage/repository.ts`. In-memory state lives in Zustand stores in `src/stores/`. |
| How are Base16 themes stored? | Built-ins are code (`src/services/themes/builtin.ts:75`, generated `base16Schemes.ts`). User/imported themes are records in the IndexedDB object store `themes` (keyPath `id`), shape `LiqueAmpTheme` (`src/types/theme.ts:91`): a 16-color `palette` plus derived `colors` and `effects`. |
| How are theme/UI settings stored? | One record under key `settings` in the IndexedDB `kv` store (`src/stores/settingsStore.ts:7`), type `Settings` (`src/types/settings.ts:21`). The active theme is `settings.activeThemeId`. |
| How are visualizer settings stored? | Inside the same `settings` record: `settings.visualizer` (`VisualizerSettings`, `src/types/visualizer.ts`), plus engine settings `settings.analysis` and `settings.render` (`src/types/advanced.ts`). |
| How are playlists and categories stored? | IndexedDB stores `playlists` and `categories` (keyPath `id`), via `usePlaylists` (`src/stores/playlistStore.ts`) and `useLibrary` (`src/stores/libraryStore.ts`). |
| How are stream URLs stored? | As `MediaItem` records in the `media` store (`sourceUrl`, `streamUrl`; `src/types/media.ts`). Radio stations are **not** stored unless favourited: the `stations` store holds only favourited station records (`favoritesStore.toggleStation`, line 56). |
| How does local persistence work? | Write-through: each store action updates memory and then writes to IndexedDB immediately. On start, `bootstrap()` (`src/app/bootstrap.ts:41`) calls `hydrateAll()` (line 32), which loads every store from IndexedDB, with a 2 s timeout. If IndexedDB is unavailable, the app runs in memory. |
| Backend / cloud / auth? | **None.** No server code, no auth, no Supabase/Firebase or other SDK, no account concept. The only network services are third parties: the Radio Browser directory (`src/services/radio/radioBrowser.ts`), provider oEmbed/CORS probes and embedded players. The site is static on GitHub Pages (`.github/workflows/`). |

---

## 1. EXISTING

### 1.1 Persistence layer

- **Database:** `src/services/storage/db.ts`.
  - `DB_NAME = 'liqueamp'` (line 12), `DB_VERSION = 1` (line 14).
  - Schema `LiqueAmpDB` (line 16) has these object stores:
    - `kv`: key/value singletons.
    - `media`, with indexes `byCategory` and `byProvider`.
    - `stations`, `categories`, `playlists` and `themes`.
    - `favorites`, with index `byType`.
    - `history`, with index `byStartedAt`.
  - `migrate()` (line 29) is a versioned upgrade switch; only case 0 exists.
  - `getDb()` (line 65) caches **one** connection for the whole app and resolves to `null` when IndexedDB is blocked. The status is exposed via `getStorageStatus()` and `onStorageStatus()`.
- **Repository:** `src/services/storage/repository.ts`.
  - `createRepository(store)` (line 19) provides `getAll/get/put/putMany/delete/clear` per object store.
  - `kv` (line 51) provides `get/set/delete` on the `kv` store.
  - `repositories` (line 66) has one repository per store.
  - Every function calls the global `getDb()`, so there is no notion of *which* database or profile it writes to.
- **kv keys in use:** `settings` (`settingsStore.ts:7`) and `queue` (`queueStore.ts:7`). There is no other use of `localStorage`, `sessionStorage` or cookies in `src/`.

### 1.2 State stores (`src/stores/`)

| Store | Persisted where | What it holds |
|---|---|---|
| `useSettings` (`settingsStore.ts`) | `kv['settings']` | All `Settings`. `update()` (line 31) writes the whole record on every change. `sanitizeSettings()` (line 39) validates stored and imported data. |
| `useThemes` (`themeStore.ts`) | `themes` store | `BUILTIN_THEMES` + stored themes. `hydrate()` (line 24) migrates v1 themes and writes them back. Built-ins are read-only (`saveTheme`, line 38). |
| `useLibrary` (`libraryStore.ts`) | `media`, `categories` | Library items and categories. `mediaIdentity()` (line 29) is the duplicate key: `providerItemId`, or `provider:streamUrl/sourceUrl`. |
| `usePlaylists` (`playlistStore.ts`) | `playlists` | Playlists. Items reference `MediaItem.id` (`PlaylistItem.mediaId`). |
| `useFavorites` (`favoritesStore.ts`) | `favorites`, `stations` | Favourites (`id = type:refId`) and the station records behind favourite stations. `rememberStation()` keeps seen stations in memory only. |
| `useHistory` (`historyStore.ts`) | `history` | Listening log, each entry with a `MediaItem` snapshot. Written by `startHistoryRecorder()` (`services/playback/historyRecorder.ts:29`). |
| `useQueue` (`queueStore.ts`) | `kv['queue']` | The play queue, persisted by `persist()` (line 25). |
| `usePlayback`, `usePlaybackClock` | not persisted | Engine state. |
| `useUi` | not persisted | Selection, toasts, open playlist, library view. |
| `useSystem` | not persisted | Online/offline and storage status. |
| `useRadio` | not persisted | Radio directory browsing state. |

### 1.3 `Settings` today (`src/types/settings.ts:21`, defaults at line 46)

`activeThemeId`, `motion`, `glowLevel`, `volume`, `muted`, `shuffle`, `repeat`, `eq`, `visualizer`, `shortcuts`, `artwork`, `providers`, `analysis`, `render`.

The comment on `providers` says **"No secrets are stored"** (`src/types/advanced.ts`). The only per-provider setting is `enabled`.

### 1.4 Theme / Base16 system

- **Model:** `LiqueAmpTheme` (`src/types/theme.ts:91`).
  - `id`, `name`, `version: 2`, `source: builtin|imported|user`.
  - `palette` (16 Base16 slots), derived `colors` (42 roles), and `effects` (glow, radius).
  - Optional `author`, `variant`, `origin`, `createdAt`, `updatedAt`.
- **Derivation and application:**
  - `deriveColors()` (`src/services/themes/base16.ts:40`) derives the colors.
  - `normalizeTheme()` (`src/services/themes/theme.ts:65`) upgrades v1 themes.
  - `applyTheme()` (`theme.ts:105`) sets the `--la-*` CSS variables.
- **Built-ins:** 22 themes in `BUILTIN_THEMES` (`builtin.ts:75`).
  - Ids: `liqueamp-default`, `amber-night` and `base16-<slug>`.
  - They are never stored in IndexedDB and never exported.
- **Import/export:** `src/services/themes/tinted.ts` handles Base16/Base24/Tinted8 YAML and LiqueAmp theme JSON. The UI is in `components/control/ThemesSection.tsx` and `components/control/themes/`.
- **Applying on change:** `bootstrap.ts` subscribes `syncAppearance` to `useSettings` and `useThemes` (line 57), so any change to `activeThemeId` or themes re-applies immediately.

### 1.5 Backup / import / export — already a full "profile serializer"

`src/services/backup/backup.ts`:
- **File format:** `BackupFile` with `format: 'liqueamp-backup'` and `version: 1` (line 15).
- **Contents:** `BackupData` (line 19) contains `settings`, `themes` (non-builtin), `categories`, `media`, `playlists`, `favorites`, `stations` and an optional `history`.
- **Functions:**
  - `createBackup()` (line 43) reads everything.
  - `parseBackup()` (line 108) validates untrusted JSON with the per-record validators in `validate.ts`, such as `validMedia` (line 39) and `validTheme` (line 187).
  - `planImport()` (line 202) computes a merge/replace plan. It remaps duplicate media by `mediaIdentity` and repoints playlists, favourites and history.
  - `applyImport()` (line 267) writes the plan in **one** IndexedDB transaction with rollback.
- **UI:** `components/control/ImportExportSection.tsx`. It includes `reloadStores()` (line 56), which re-hydrates all stores after an import. This is the existing "swap the active data and re-render" mechanism.

### 1.6 Content system / Content Pack

**Does not exist in LiqueAmp.** Spec §22 asks to inspect a "content system / Content Pack". That concept belongs to a different project (PONGORE). The nearest LiqueAmp equivalents are the backup format (§1.5) and the theme import/export (§1.4).

### 1.7 Home screen and Quick Actions

- **Layout:** `src/app/Dashboard.tsx` renders one layout for all sizes.
  - The lower area (`.lower.area-lower`) contains `LibraryPanel`, `QueuePanel`, `StationInfoPanel`, **`QuickActionsPanel`**, `PlayerModule`, `AppearanceModule` and `VisualizerModule`.
  - The grid columns are in `src/styles/layout.css` (`.area-lower`, `.area-actions` at line 124).
- **What `QuickActionsPanel` does** (`src/components/player/QuickActionsPanel.tsx`): it acts on the current selection (`useUi.selection`), or on the playing item when nothing is selected. Its actions are:
  - Play now
  - Add to queue (`queueStation` / `getEngine().enqueue`)
  - Add to / remove from favourites
  - Add to playlist (`AddToPlaylistDialog`)
  - Share (`services/share.ts`)
  - A "more" menu with Copy stream URL and Open homepage
- **Where else these actions exist:**
  - **Play** and **favourite** also exist on station rows (`components/radio/StationRow.tsx`).
  - **Add to queue** exists for library items (`MediaLibraryView.tsx:77`) and imports (`ImportPanel.tsx:236`).
  - For **radio stations**, the only UI for *Add to queue*, *Add to playlist*, *Share*, *Copy stream URL* and *Open homepage* is Quick Actions.
- **Mobile:** on narrow screens `.area-actions` is shown with the Now Playing and Browse sections (`layout.css` ~209–215).

### 1.8 Identity, network, deployment

- **No user identity:** there is no user id, account, login or session. Ids are random UUIDs from `createId()` (`src/lib/id.ts`) with a type prefix.
- **Deployment:** static hosting on GitHub Pages under base path `/LiqueAmp/` (`vite.config.ts`, `.github/workflows/`). A `404.html` app shell handles deep links.
- **Service worker** (`pwa/service-worker.js`): it ignores other origins (line ~50), so a future API on another origin is neither cached nor intercepted. Navigation falls back to the precached app shell.
- **No Content-Security-Policy** meta tag in `index.html`.
- **Existing specs:**
  - `LIQUEAMP_ARCHITECTURE.md` §26–27: local-first, "possible future backends should be possible without rewriting application logic".
  - `LIQUEAMP_SPEC.md` (~978): no backend required "unless a specific feature requires one".
  - `LIQUEAMP_IMPLEMENTATION_PLAN.md` §2: "No backend … unless a backend is explicitly requested later".

### 1.9 Profile model: what already exists

| Spec item (§2.2) | Exists as |
|---|---|
| UI settings | `Settings` (`activeThemeId`, `glowLevel`, `motion`, `artwork`, `shortcuts`) |
| Theme / Base16 theme / colors | `activeThemeId` + `themes` store (`LiqueAmpTheme.palette`) |
| Typography configuration | **Does not exist.** Fonts are fixed in `src/styles/tokens.css` (`--la-font-*`). |
| Glow effects | `settings.glowLevel` × `theme.effects.glowIntensity` |
| Border radius / UI shape | `theme.effects.borderRadius` |
| Visualizer configuration | `settings.visualizer` (+ `analysis`, `render`) |
| Audio/player settings | `volume`, `muted`, `shuffle`, `repeat`, `eq` |
| Playlists | `playlists` store |
| Categories | `categories` store |
| User-added stream URLs + metadata | `media` store (`MediaItem`) |
| Favourites (not in spec §2.2, but user state) | `favorites` + `stations` stores |
| History (not in spec) | `history` store |
| Queue (not in spec) | `kv['queue']` |

---

## 2. REUSABLE

1. **`BackupData` as the payload of `LiqueAmpProfile`.** It already serializes every piece of user state the spec lists. It has a versioned envelope and a complete validator set.
   - The profile model (spec §21, "ONE PROFILE MODEL") should be this format plus profile metadata, **not** a new parallel structure.
   - The same format then serves Backup, Export/Import, Snapshot, Friend Lique and Pack.
2. **`validate.ts` validators** (`validMedia`, `validPlaylist`, `validCategory`, `validFavorite`, `validStation`, `validTheme`, `validHistory`, `httpUrl`). A friend's profile is untrusted input and must pass exactly these checks before it touches the UI.
3. **`planImport()` + `mediaIdentity()`.** The id-remapping merge logic is what "Install Pack" and "copy this playlist from a friend" need, so no new merge engine is required.
4. **`applyImport()`**: the transactional write with rollback. Reusable for "restore snapshot" and for writing a friend-profile cache.
5. **`reloadStores()` (`ImportExportSection.tsx:56`)** + every store's `hydrate()`. This is the existing way to switch what the UI shows. Profile switching can be "point storage at another profile, then re-hydrate" if the storage layer gets a profile scope (see REFACTOR).
6. **`sanitizeSettings`, `sanitizeVisualizer`, `sanitizeProviders/Analysis/Render`, `normalizeTheme`**: they already tolerate partial, old and hostile data.
7. **Theme system:**
   - Activating a friend's theme works through `activeThemeId` + `useThemes`.
   - Built-in ids are stable across users.
   - `normalizeTheme` accepts theme versions 1 and 2.
8. **Repository abstraction (`createRepository`).** It was designed so another backend can be added (ARCH §26). It is the right seam for a profile-scoped database.
9. **UI pieces for the Friend Liques panel:**
   - `.panel` / `area-actions` grid slot.
   - `Status` dots (`components/ui/controls.tsx`, used for ONLINE/OFFLINE in the header).
   - `RowList` roving focus, `Dialog` and `NameDialog`, `EmptyState`.
   - Toasts.
10. **`useSystem`** (online/offline): the base for "cloud reachable" vs "offline, local only".
11. **Test infrastructure:**
    - Vitest + `fake-indexeddb` for store and storage tests.
    - `e2e/` CDP scripts (acceptance, axe, theme probe) for UI and a11y checks of the new panel.

---

## 3. REFACTOR

### 3.1 Conflicts between the current architecture and the spec

| # | Conflict | Where | Why it matters |
|---|---|---|---|
| C1 | **Single global database, write-through stores.** Every store writes straight to the one `liqueamp` database via the global `getDb()`. | `db.ts:65`, `repository.ts`, all stores | If a friend profile were loaded into the stores, any action would write the friend's data **into the user's own database**. That includes a volume change, a favourite toggle, the history recorder and a theme migration in `themeStore.hydrate()`. This violates spec §8/§20. |
| C2 | **Settings mix profile state with device state.** One `settings` record holds both look/feel (theme, visualizer, EQ) and device preferences (volume, motion, shortcuts, render DPR cap, provider switches). | `types/settings.ts:21` | Activating a friend's Lique should not change the user's volume or reduced-motion choice, or the performance settings tuned for their device. |
| C3 | **Queue and history are persisted with the profile data.** | `queueStore.ts`, `historyStore.ts`, `historyRecorder.ts` | A listening log is private. It should not be part of a shared profile, and listening while a Friend Lique is active must not write into the friend's data. |
| C4 | **Ids are only unique per browser.** Media, playlists and categories use local random ids. | `lib/id.ts` | Harmless for viewing a friend profile in its own scope. It matters as soon as data is copied between profiles, which `planImport` already handles for media. |
| C5 | **Stream URLs may contain credentials.** `httpUrl()` accepts any http(s) URL, including `https://user:pass@host/…` and `?token=…` query parameters. The backup comment says there are no secrets, but nothing enforces that for URLs. | `validate.ts:20`, `createBackup()` | Spec §14 requires credentials never to be shared. |
| C6 | **Quick Actions is the only UI for several station actions** (§1.7). | `QuickActionsPanel.tsx` | Spec §4 removes it. Removing it as-is would remove features, so those actions need a new home first. |
| C7 | **Static hosting only.** GitHub Pages cannot run server code. | deployment | Accounts, relationships, visibility and presence need a server that enforces permissions (spec §19). |
| C8 | **Previous specs say "no backend".** | `LIQUEAMP_IMPLEMENTATION_PLAN.md` §2, SPEC, ARCH §27 | Not a blocker, since they allow a backend "if a feature requires one". The plan document must record the new decision. Local-first must stay true: the app must remain fully usable without an account. |
| C9 | **Typography configuration is in the spec's profile list but not in the app.** | `tokens.css` | Either leave it out of profile v1 or build it as a separate feature. |

### 3.2 Changes needed

1. **Profile-scoped storage (resolves C1).**
   - Give `db.ts` a notion of *which* database is active instead of one module-level `dbPromise`. For example, `own` → `liqueamp` (unchanged name, so no data moves) and a friend → `liqueamp-friend-<userId>`.
   - `repository.ts`/`kv` resolve the active database on each call.
   - Stores hydrate from whichever scope is active.
   - Switching means: flush pending writes, change scope, run `hydrateAll()`, re-apply appearance.
   - Friend scopes are **read-only for profile content**: store write actions must refuse, or route to a session layer, while a friend profile is active. That needs a guard in each store's write path (library, playlists, favourites, themes, settings).
2. **Split `Settings` into profile settings and device settings (C2).**
   - Proposed split, **DECISION NEEDED**:
     - *profile*: `activeThemeId`, `glowLevel`, `visualizer`, `eq`, `artwork`, `shuffle`, `repeat`.
     - *device*: `volume`, `muted`, `motion`, `shortcuts`, `providers`, `analysis`, `render`.
   - Implementation: keep the one `kv['settings']` record for device settings and add `kv['profileSettings']`, or split the type and migrate the key. `sanitizeSettings` and `pickSettings` must be split accordingly.
3. **Separate personal session data from the profile (C3).**
   - Queue and history should always belong to the *user*, never to the active profile. They then stay in the own database even while a friend scope is active.
   - Alternatively, history recording could be paused during Friend Lique mode. **DECISION NEEDED.**
4. **Profile envelope around `BackupData`.**
   - Add `LiqueAmpProfile` metadata: `schemaVersion`, `ownerUserId`, `revision`/`updatedAt`, `visibility`, and optional per-section visibility.
   - Keep `BACKUP_FORMAT` readable. Bump `BACKUP_VERSION` only if the file layout changes, and keep reading v1.
5. **Credential stripping for sharing (C5).**
   - Add a `sanitizeForSharing()` step that removes userinfo from URLs and drops or flags query parameters that look like tokens (`token`, `key`, `sig`, `auth`, …).
   - Use it in cloud upload and Pack export, and optionally in backup with a warning.
   - Add a per-item `visibility` to `MediaItem` later (spec §14). It fits in `MediaItem` next to `enabled`, and `validMedia` must learn it.
6. **Move Quick Actions' unique actions before replacing it (C6).** Candidates:
   - a row menu on `StationRow`/`MediaRow`;
   - the actions inside `StationInfoPanel` (which already shows the selected station);
   - a "…" menu in Now Playing.
   - Then replace the `.area-actions` slot with `FriendLiquesPanel`. The e2e check 15 (`acceptance.mjs:270`) must move to the new location of "Add to playlist".
7. **Bootstrap:** `hydrateAll()` must first resolve the session: signed in or not, own or friend scope. It must still render within the existing 2 s timeout when offline or when the backend is slow.

---

## 4. NEW

1. **Backend (C7).** Needs to provide auth, a database with row-level permissions, and ideally presence/realtime.
   - A hosted Postgres + Auth service (for example Supabase) fits a static GitHub Pages client: the client uses a public key, and row-level security enforces access (spec §19).
   - **DECISION NEEDED:** which provider, the region, email/OAuth sign-in, cost and account ownership.
   - It must stay optional. Without sign-in, LiqueAmp works exactly as today.
2. **Server data model** (all keyed by `user_id`, never by username):
   - `users`: `user_id` (auth uid), `username` (unique, case-insensitive), `display_name`, `avatar_url`, `created_at`.
   - `profiles`: `owner_user_id`, `schema_version`, `revision`, `updated_at`, `visibility` (`PRIVATE|FRIENDS|PUBLIC`), `payload` (the `LiqueAmpProfile` JSON).
   - `friendships`: `requester_id`, `addressee_id`, `status` (`PENDING|ACCEPTED|DECLINED|BLOCKED`), timestamps; unique per pair.
   - Later: `snapshots` (same payload shape), `packs`.
   - Permission rules for owner/friend/public reads and owner-only writes, plus blocked-user exclusion.
3. **Client auth/session layer:** `services/account/` + `useAccount` store holding session, current user and sign-in state.
   - Handles sign in and sign out, and the OAuth/magic-link callback on GitHub Pages under `/LiqueAmp/`.
   - The callback route must work with the `404.html` deep-link shell and the service-worker navigation fallback.
4. **Username handling:** availability check, reserved names, and rename without moving data (spec §3).
5. **Cloud sync** (spec §11): upload/download of the own profile with `revision`-based conflict detection.
   - It never silently overwrites newer data: show a "cloud is newer / local is newer" choice.
   - It needs an outbox or dirty flag, because the stores write locally first.
6. **Friends UI:** search by username, request/accept/decline/remove/block, a pending-requests list, and a new `/control` section or dialog.
7. **`FriendLiquesPanel`**: replaces Quick Actions in `.area-actions`. It shows friends with online/offline state and an "active" marker, plus a friend-profile preview (theme, visualizer, playlist and stream counts, per spec §7) and **Activate / Return to my Lique**.
8. **Active-profile state:** `activeProfile: { kind: 'own' } | { kind: 'friend', userId, revision }`.
   - It is kept in device state (not in the profile) so a reload can restore or cancel it.
   - A persistent banner or indicator shows while a Friend Lique is active.
9. **Friend profile cache:** a separate IndexedDB per friend (C1). It is written via `applyImport` after validation and cleared when a friend is removed or access is revoked.
10. **Presence** (spec §18): a separate lightweight channel, not part of profile sync.
11. **Later phases:** snapshots UI (reusing backup + profile scope), Packs (export of a subset + `planImport` merge on install), public profile pages (need a public route or a separate server-rendered page, since the app is an SPA on Pages).
12. **Typography configuration** (if wanted in profiles): a new setting. It does not exist today (C9).

---

## 5. RISKS

1. **Own data overwritten while a Friend Lique is active.** This is the biggest risk, caused by write-through stores (C1). Mitigations:
   - scope switching in the storage layer;
   - read-only guards in store actions;
   - tests that activate a friend scope, perform every write action, and assert the own database is byte-for-byte unchanged.
2. **Hidden writes on hydrate.** `themeStore.hydrate()` writes migrated v1 themes back to storage, and `favoritesStore` and `historyRecorder` write during playback. Every automatic write path must respect the scope. Some are easy to miss.
3. **Secrets in shared stream URLs (C5).** Users paste URLs with tokens. Stripping must happen before upload, not only on display.
4. **Untrusted friend data.**
   - Must pass `validate.ts`. The limits (sizes, counts, string lengths) are there today.
   - Artwork and favicon URLs from a friend's profile are loaded by the browser. That reveals the viewer's IP to hosts the friend chose, which is acceptable but should be noted in privacy text.
   - Oversized profiles need a size cap. `MAX_BACKUP_BYTES` is 50 MB, which is too large for automatic friend loading.
5. **Sync conflicts.** Offline edits on two devices. Without revision checks, the last writer silently wins, which violates spec §11.
6. **Local-first regression.** Sign-in, backend outages or a slow API must never block start-up. The 2 s bootstrap race must stay, and the "not signed in" path must be the default and fully tested.
7. **Auth on a static SPA under a sub-path:** OAuth redirect URLs, the `404.html` shell, and the service worker serving cached shells for callback URLs.
8. **Losing Quick Actions features (C6)** if the panel is replaced before its unique actions are moved.
9. **Scope creep in `Settings`.** If the profile/device split is not done first, every later phase inherits the ambiguity.
10. **Privacy of history and presence.** Showing "online" leaks activity. Visibility settings should cover presence too.
11. **Cost, operations and account ownership** of a hosted backend, and data-protection obligations (GDPR: data export and account deletion) once personal data is stored server-side.
12. **Tests:** the e2e acceptance test (check 15) depends on Quick Actions, and `backup.test.ts` fixes the backup format. Both need updating in step with the changes.

---

## 6. DEPENDENCIES

Order in which things must exist (aligned with spec §24, adjusted for what the code needs first):

1. **Decisions:** backend provider, the settings split (profile vs device), what a friend profile includes (history and queue excluded?), and the sign-in methods.
2. **Profile model** (spec phase 2, but needed before phase 1 can store anything useful): the `LiqueAmpProfile` envelope over `BackupData`, sharing sanitizer, settings split with migration. Local only, with no backend.
3. **Profile-scoped storage + read-only guards** (C1). This is the foundation for activation, restore, snapshots and Packs, and it can be built and tested fully offline.
4. **Move Quick Actions' unique actions** to their new places (C6). Independent of the backend.
5. **Backend + auth + user identity** (spec phase 1): users table, usernames, session in the client.
6. **Cloud persistence of the own profile** (phase 3), which needs 2 + 5.
7. **Friend relationships** (phase 4), which needs 5.
8. **Friend Liques panel** replacing Quick Actions (phase 5), which needs 4 + 7.
9. **Friend profile viewing → activation → restoration** (phases 6–8), which needs 3 + 6 + 7.
10. **Visibility and stream privacy** (phase 9). The server rules come with 5–7; the per-item visibility UI comes here.
11. **Snapshots / Packs / public profiles** (phases 10–12), which reuse 2 + 3.

---

## 7. MIGRATION

Goal: no existing user loses or has to re-enter anything, and signing in stays optional.

1. **Database name stays `liqueamp`.** The existing database becomes the "own" profile scope as-is. Friend caches get new database names, so nothing is moved or rewritten.
2. **IndexedDB schema:** if new stores or fields are needed (for example a `syncState` record or a per-item `visibility`), bump `DB_VERSION` to 2 and add `case 1:` to `migrate()` (`db.ts:29`). The switch was written for this. Existing records stay valid because every new field is optional.
3. **Settings split:** on first start after the change, read `kv['settings']`, write the profile part to the new record and the device part back, idempotently. `sanitizeSettings` already drops unknown fields, and defaults fill anything missing. Keep reading the old single record for one version so a downgrade does not lose data.
4. **Backups:**
   - `parseBackup` keeps accepting `version: 1` files.
   - New exports can carry the profile envelope. The version is bumped only if needed, and v1 import stays supported, as it already does for v1 themes via `normalizeTheme`.
5. **First sign-in:** the local profile is uploaded as the user's first cloud profile. Nothing is replaced locally.
   - If a cloud profile already exists (second device), show a choice: keep local, use cloud, or merge. The merge is `planImport` in merge mode, which already avoids duplicates by `mediaIdentity`.
   - Never overwrite without asking.
6. **Themes:** custom themes are already migrated to v2 (Base16 palette) by `themeStore.hydrate()`. Built-in ids are identical for all users, so a friend's `activeThemeId` like `base16-nord` resolves without shipping the theme. A friend's custom themes travel in the profile payload.
7. **Queue and history** stay local and personal. They are never uploaded as part of the shared profile unless the user explicitly chooses it later.
8. **Quick Actions removal:** the actions move first (§3.2 item 6), then the panel is replaced. No stored data depends on Quick Actions; it only uses `useUi.selection` and the playback state.

---

### Appendix: files most affected by the planned work

- Storage: `src/services/storage/db.ts`, `src/services/storage/repository.ts`
- Bootstrap: `src/app/bootstrap.ts`
- Stores: `src/stores/settingsStore.ts`, `themeStore.ts`, `libraryStore.ts`, `playlistStore.ts`, `favoritesStore.ts`, `historyStore.ts`, `queueStore.ts`, `uiStore.ts` (+ new `accountStore`, `profileStore`)
- Types: `src/types/settings.ts`, `src/types/media.ts` (visibility), new `src/types/profile.ts`
- Backup/profile: `src/services/backup/backup.ts`, `validate.ts`, `components/control/ImportExportSection.tsx`
- Home: `src/app/Dashboard.tsx`, `src/components/player/QuickActionsPanel.tsx` (replaced), `components/radio/StationRow.tsx`, `StationInfoPanel.tsx`, `components/library/MediaRow.tsx` (receive moved actions), `src/styles/layout.css` (`.area-actions`)
- Control: `src/components/control/ControlPage.tsx` (Account/Friends sections)
- PWA/deploy: `pwa/service-worker.js` (auth callback navigation), `.github/workflows/` (backend config as build-time env)
- Tests: `src/services/backup/backup.test.ts`, `src/stores/stores.test.ts`, `e2e/acceptance.mjs` (check 15)
