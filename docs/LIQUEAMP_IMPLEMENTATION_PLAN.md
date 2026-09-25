# LIQUEAMP SOCIAL — IMPLEMENTATION PLAN

**Status:** Implementation planning  
**Project:** LiqueAmp  
**Source documents:**
- `LIQUEAMP_SOCIAL_ARCHITECTURE.md`
- `LIQUEAMP_SOCIAL_IMPLEMENTATION_ANALYSIS.md`
- `LIQUEAMP_PROFILE_SPEC.md`
- `LIQUEAMP_FRIEND_LIQUES_SPEC.md`


> **This is the primary implementation plan for the LiqueAmp social,
> profile and account work** (decision log §30, checkpoint log §31). The
> root-level `LIQUEAMP_IMPLEMENTATION_PLAN.md` is the older app planning
> document (Phase 1 audit, phases 2–15); it is kept, not merged.
---

# 1. Goal

Implement Accounts, LiqueAmp Profiles, Friend Liques, profile switching, cloud synchronization and the supporting privacy/security architecture without breaking LiqueAmp's existing local-first behavior.

The implementation must extend the existing architecture rather than create a parallel application state system.

The existing backup/import system is the starting point for the canonical profile representation.

---

# 2. Non-Negotiable Principles

## 2.1 Local-first remains true

LiqueAmp must remain fully usable without:

- an account
- authentication
- internet access
- the social backend

Existing local functionality must continue working.

---

## 2.2 One canonical profile model

Do not create separate incompatible representations for:

- account profile
- Friend Lique
- snapshot
- backup
- Pack

They should share the same profile data model.

---

## 2.3 Friend profiles are read-only

A Friend Lique can be activated and used, but never written back to the friend's cloud profile.

---

## 2.4 Own data must be isolated

Activating a Friend Lique must never write friend data into the user's own profile.

This is the highest-priority correctness requirement.

---

## 2.5 Server permissions are authoritative

The client must never be trusted to enforce:

- profile ownership
- friendship
- blocking
- visibility
- write permissions

The backend must enforce these.

---

## 2.6 Do not remove Quick Actions prematurely

All unique Quick Actions functionality must have a new home before `QuickActionsPanel` is removed.

---

# 3. Implementation Strategy

Implementation should happen in independently testable phases.

Do not implement all social functionality in one pass.

Recommended sequence:

```text
PHASE 0
Architecture preparation

PHASE 1
Profile foundation

PHASE 2
Profile-scoped storage

PHASE 3
Quick Actions migration

PHASE 4
Backend + Account

PHASE 5
Own profile cloud sync

PHASE 6
Friends

PHASE 7
Friend Liques

PHASE 8
Activation + restoration

PHASE 9
Privacy/security hardening

PHASE 10
Snapshots / Packs / future social features
```

---

# 4. PHASE 0 — Architecture Preparation

## Objective

Prepare the existing local architecture without introducing accounts yet.

## Tasks

1. Read all four specification documents.
2. Inspect the current storage layer.
3. Inspect all Zustand stores.
4. Inspect backup/import/validation.
5. Identify all profile-related state.
6. Identify all device/session state.
7. Confirm all Quick Actions functionality.
8. Add/update tests before major refactoring.

## Deliverable

A clean baseline where existing LiqueAmp behavior remains unchanged.

---

# 5. PHASE 1 — Profile Foundation

## Objective

Create the canonical serializable profile model.

## Primary reuse

Reuse:

```text
BackupData
```

and the existing:

```text
validate.ts
planImport()
applyImport()
mediaIdentity()
```

Do not duplicate these systems.

## Tasks

Create the minimum required profile types.

Conceptually:

```text
LiqueAmpProfile
├── metadata
│   ├── schemaVersion
│   ├── ownerUserId
│   ├── revision
│   ├── updatedAt
│   └── visibility
│
└── data
    └── BackupData-like content
```

Exact TypeScript shape must follow the existing repository.

## Settings split

Separate:

```text
PROFILE SETTINGS
```

from:

```text
DEVICE SETTINGS
```

before implementing Friend Liques.

This prevents a friend's profile from overriding device-specific preferences.

## Initial profile content

Profile:

- profile settings
- themes
- categories
- media
- playlists
- favorites
- stations

Not profile:

- history
- queue
- runtime playback state
- UI transient state
- AudioContext
- device performance state

## Tests

Verify:

- create profile
- serialize
- validate
- restore
- preserve custom themes
- preserve playlists
- preserve categories
- preserve media

---

# 6. PHASE 2 — Profile-Scoped Storage

## Objective

Make it possible to have multiple logically isolated LiqueAmp profiles.

This is the foundation for Friend Liques.

## Required behavior

At minimum the storage system must understand:

```text
OWN
FRIEND:<userId>
```

The exact physical IndexedDB design remains an implementation decision.

Do not prematurely commit to separate databases if a single scoped database is cleaner.

## Requirements

Every profile-scoped repository operation must resolve against the current profile scope.

Stores must not silently write to the own scope when another scope is active.

## Critical protection

When a Friend scope is active:

```text
friend profile writes = forbidden
```

or explicitly routed to viewer-owned/session state.

## Stores requiring review

At minimum:

```text
settingsStore
themeStore
libraryStore
playlistStore
favoritesStore
historyStore
queueStore
```

and bootstrap/hydration.

## Personal state

Queue and history remain user-owned and must not follow Friend Lique scope.

## Tests

The critical test:

```text
Own Profile A
    ↓
Activate Friend
    ↓
Perform every relevant write action
    ↓
Return to Own
```

Expected:

```text
Own Profile A == byte-for-byte unchanged
```

where byte-level comparison is practical, otherwise deep structural equality.

---

# 7. PHASE 3 — Quick Actions Migration

## Objective

Replace Quick Actions without losing functionality.

## Existing unique functionality

The implementation analysis identifies Quick Actions as the current UI location for:

- Add to queue
- Add to playlist
- Share
- Copy stream URL
- Open homepage

These actions must move first.

## Possible destinations

Use existing UI patterns such as:

- StationRow menu
- MediaRow menu
- StationInfoPanel
- Now Playing menu
- context/overflow menu

Choose based on current component architecture.

## Tests

Existing acceptance test coverage must be updated.

Do not remove `QuickActionsPanel` until its unique actions have verified replacements.

---

# 8. PHASE 4 — Backend + Account

## Objective

Introduce optional accounts without making them mandatory for local LiqueAmp.

## Backend

The implementation analysis identifies a hosted Postgres + Auth service such as Supabase as a possible fit for the current static GitHub Pages deployment.

The exact provider remains a decision that must be confirmed before implementation.

Do not hard-code a provider into the architecture until selected.

## Server concepts

Initial tables/entities:

```text
users
profiles
friendships
```

Future:

```text
snapshots
packs
```

## users

Conceptually:

```text
user_id
username
display_name
avatar_url
created_at
```

Username must be unique case-insensitively.

User identity must be based on stable `user_id`.

## Client

Create an account/session layer conceptually under:

```text
services/account/
```

and an account store.

It should handle:

- session
- current user
- sign in
- sign out
- authentication callback

## Static deployment

Authentication must work under:

```text
/LiqueAmp/
```

and account for:

- GitHub Pages
- `404.html`
- SPA deep links
- service worker behavior

## Local behavior

Signed-out users continue using LiqueAmp exactly as before.

---

# 9. PHASE 5 — Own Profile Cloud Sync

## Objective

Synchronize the user's own profile.

Flow:

```text
Local Own Profile
       ↕
Cloud Profile
```

## Requirements

Use:

```text
revision
updatedAt
dirty/outbox state
```

or an equivalent mechanism.

Never silently overwrite newer data.

Example:

```text
LOCAL 12
CLOUD 14
```

must trigger conflict/staleness handling.

## First sign-in

If a local profile exists:

```text
Local Profile
    ↓
First sign-in
    ↓
Upload local profile
```

Do not discard local data.

If a cloud profile already exists, present a deliberate choice:

- keep local
- use cloud
- merge

Use existing import planning where possible.

---

# 10. PHASE 6 — Friends

> **Superseded by D17 (2026-09-25):** no requests, no PENDING/ACCEPTED/DECLINED. Friends are one-way: Add Friend (immediate), Remove Friend, Block.

## Objective

Implement friend relationships independently from Friend Lique activation.

## Required operations

- Search username
- Send request
- Accept
- Decline
- Remove
- Block

## Relationship model

```text
PENDING
ACCEPTED
DECLINED
BLOCKED
```

## Server rules

The server must enforce:

- valid users
- ownership
- relationship state
- block restrictions

## UI

Detailed friend management can live in `/control`.

Home remains focused on Friend Liques.

---

# 11. PHASE 7 — Friend Liques

> **Refined by D10–D12, D17:** Add Friend icon top-right in the panel; rows `● @alice Online [ ▶ ]`; ▶ activates; no avatars; see §30.

## Objective

Replace Quick Actions on Home with Friend Liques.

Create:

```text
FriendLiquesPanel
```

using the existing:

```text
.area-actions
```

layout slot where appropriate.

## Panel states

### Normal

```text
FRIEND LIQUES

● THERMOPTIC
  ONLINE

● PELLE
  OFFLINE
```

### Empty

```text
FRIEND LIQUES

NO FRIEND LIQUES YET

[ ADD FRIEND ]
```

### Loading

```text
FRIEND LIQUES

LOADING...
```

### Error

Show an unobtrusive server/connectivity error while keeping the rest of LiqueAmp functional.

## Friend selection

Selecting a friend opens a preview containing information such as:

- theme
- visualizer
- playlist count
- category count
- stream count

Use a lightweight summary where possible.

---

# 12. PHASE 8 — Friend Profile Fetching and Cache

## Objective

Safely retrieve and locally cache Friend Liques.

## Flow

```text
Friend Summary
      ↓
Request Profile
      ↓
Server authorization
      ↓
Receive profile
      ↓
Validate
      ↓
Sanitize
      ↓
Cache
```

## Cache metadata

At minimum:

```text
friend user_id
profile revision
last fetched
profile data
```

## Offline

If a valid cached profile exists:

```text
Offline
   ↓
Use cached Friend Lique
```

If no cache exists:

```text
Offline
   ↓
Friend Lique unavailable
```

Do not block the main application.

---

# 13. PHASE 9 — Friend Lique Activation

## Objective

Allow the user to temporarily use a friend's profile.

## Flow

```text
Own Profile
    ↓
Flush pending writes
    ↓
Fetch/use cached Friend Profile
    ↓
Validate
    ↓
Switch profile scope
    ↓
Hydrate profile stores
    ↓
Apply appearance
    ↓
Friend Lique active
```

## Active state

Conceptually:

```text
activeProfile:
  kind: own
```

or:

```text
activeProfile:
  kind: friend
  userId
  revision
```

## UI

Clearly show:

```text
FRIEND LIQUE ACTIVE
THERMOPTIC
```

and provide:

```text
RETURN TO MY LIQUE
```

---

# 14. PHASE 10 — Restoration

## Objective

Restore the user's exact own profile.

Flow:

```text
Friend Lique
    ↓
Return to My Lique
    ↓
Discard friend-scoped changes
    ↓
Switch own scope
    ↓
Hydrate own profile
    ↓
Apply own appearance
```

## Required tests

```text
Own
→ Friend A
→ Own

Own
→ Friend A
→ Friend B
→ Own
```

The own profile must remain unchanged.

---

# 15. Profile Actions While in Friend Mode

Friend profile data is read-only.

However, user-owned/session actions can still be allowed.

Example:

```text
Friend stream
    ↓
Add to my queue
```

must affect:

```text
Johan's queue
```

not:

```text
Pelle's profile
```

Similarly:

```text
Favourite Pelle's station
```

should become:

```text
Johan's favourite
```

if that behavior is supported by the final store architecture.

---

# 16. PHASE 11 — Privacy and Security

## Objective

Make remote profile sharing safe.

## Validation

All remote data must pass existing validation.

## URL sanitization

Before cloud sharing:

```text
Profile
 ↓
sanitizeForSharing()
 ↓
upload
```

Remove credential-like data such as:

```text
user:password@
token=
key=
sig=
auth=
```

The exact implementation should use a carefully defined allow/deny strategy rather than blindly deleting arbitrary query parameters.

## Server permissions

Enforce:

- owner writes
- friend reads
- public reads
- private denial
- block denial

on the server.

## Presence

Presence must be separate from profile synchronization.

---

# 17. PHASE 12 — Snapshots

Implement only after the core profile system is stable.

Reuse:

```text
LiqueAmpProfile
validation
applyImport()
```

Snapshot operations:

- save
- rename
- restore
- delete

A snapshot is a profile state, not a new data format.

---

# 18. PHASE 13 — LiqueAmp Packs

Implement after snapshots.

A Pack is a selected subset of profile data.

Possible contents:

```text
theme
visualizer
selected playlists
selected categories
selected shareable streams
```

Use existing:

```text
planImport()
applyImport()
mediaIdentity()
```

for installation/merge.

---

# 19. PHASE 14 — Public Profiles

Optional later feature.

Possible route:

```text
/u/<username>
```

or another suitable architecture.

Do not implement public profiles as part of the first Friends release unless required.

---

# 20. Database / Server Model

> **Updated (D16, D17):** Supabase is the selected backend. Conceptual entities are now `users`, `profiles`, `profile_summaries`, `friendships` (one-way: who added whom) and `blocks`; see §30 D16/D17. The `requester_id/addressee_id/status` model below is superseded.

Initial conceptual server model:

```text
users
────────────────────
user_id
username
display_name
avatar_url
created_at


profiles
────────────────────
owner_user_id
schema_version
revision
updated_at
visibility
payload


friendships
────────────────────
requester_id
addressee_id
status
created_at
updated_at
```

Future:

```text
snapshots
packs
```

The backend provider and exact SQL/schema remain a decision before implementation.

---

# 21. Testing Strategy

> **Obsolete E2E steps (D17):** "Add friend → request works" and "Accept friend → Friend Lique appears" become: "Add friend (username) → Friend Lique appears at once".

Testing must be added alongside each phase.

## Unit tests

Test:

- profile serialization
- profile validation
- settings split
- migrations
- storage scopes
- read-only guards
- URL sanitization
- revision comparison

## Integration tests

Test:

- switching scopes
- hydration
- cloud sync
- friend profile cache
- profile restoration

## E2E tests

Test:

```text
Sign out
→ local LiqueAmp works

Sign in
→ own profile loads

Add friend
→ request works

Accept friend
→ Friend Lique appears

Open friend
→ summary works

Activate
→ friend profile appears

Return
→ own profile restored
```

---

# 22. Critical Regression Tests

These must exist before declaring the project complete.

### R1 — Existing local data

Existing users retain:

- themes
- playlists
- categories
- media
- favorites
- stations
- settings

### R2 — Existing backup

Existing `liqueamp-backup` files remain importable.

### R3 — No-account mode

LiqueAmp works without authentication.

### R4 — Friend isolation

Friend activation cannot modify own profile.

### R5 — Friend read-only

Friend activation cannot modify friend's cloud profile.

### R6 — Quick Actions replacement

Every unique Quick Actions feature remains accessible.

### R7 — Offline

Backend outage does not prevent LiqueAmp startup.

### R8 — Profile switching

Multiple friend switches do not corrupt state.

---

# 23. Migration Plan

## Existing IndexedDB

Keep the existing:

```text
liqueamp
```

database and migrate it rather than deleting/recreating it.

If schema changes are required:

```text
DB_VERSION
```

is incremented using the existing migration mechanism.

## Settings migration

Existing single `settings` data must be migrated into the profile/device split without losing values.

Migration must be idempotent.

## Backup compatibility

Continue accepting existing backup version 1.

Only introduce a new profile/backup version when the format genuinely changes.

---

# 24. Rollout Order

The implementation should be committed in logical checkpoints.

Recommended checkpoint sequence:

```text
CHECKPOINT 1
Profile model + settings split


CHECKPOINT 2
Profile-scoped storage + isolation tests


CHECKPOINT 3
Quick Actions functionality relocated


CHECKPOINT 4
Backend + authentication


CHECKPOINT 5
Own cloud profile sync


CHECKPOINT 6
Friend relationships


CHECKPOINT 7
Friend Liques panel


CHECKPOINT 8
Friend profile cache + viewing


CHECKPOINT 9
Profile activation/restoration


CHECKPOINT 10
Privacy/security hardening


CHECKPOINT 11
Snapshots/Packs
```

Each checkpoint should leave the application buildable and testable.

---

# 25. Implementation Rules for Claude

When implementing:

1. Read all four specification documents first.
2. Inspect existing code before modifying it.
3. Reuse existing abstractions wherever possible.
4. Do not create duplicate state systems.
5. Do not rewrite unrelated parts of LiqueAmp.
6. Keep local-first behavior intact.
7. Add tests before or alongside risky migrations.
8. Keep migrations backward compatible.
9. Do not remove Quick Actions before moving its unique functionality.
10. Do not implement future features early merely because the architecture supports them.
11. After each checkpoint, run the relevant test/build suite.
12. Report exactly what changed and which tests passed.

---

# 26. Decision Gates

> **Resolved (2026-09-25):** backend provider = Supabase (D16), authentication = Google + GitHub OAuth (D5), region = EU preferred (D16); see §30.

Claude must stop and ask for a decision before implementation if the repository requires a choice that the specifications intentionally leave open.

Important decisions include:

### Backend provider

The current analysis suggests a hosted Postgres/Auth service such as Supabase may fit the static GitHub Pages deployment.

Confirm provider before implementation.

### Settings split

Confirm final profile/device classification after inspecting actual setting behavior.

### IndexedDB scope architecture

Choose the cleanest implementation after inspecting the storage code.

### Authentication method

Choose supported sign-in methods.

### Data region / account ownership

Confirm infrastructure requirements before storing user data server-side.

---

# 27. First Implementation Prompt

After all planning documents are present, Claude should receive the following instruction:

---

READ FIRST:

```text
docs/LIQUEAMP_SOCIAL_ARCHITECTURE.md
docs/LIQUEAMP_SOCIAL_IMPLEMENTATION_ANALYSIS.md
docs/LIQUEAMP_PROFILE_SPEC.md
docs/LIQUEAMP_FRIEND_LIQUES_SPEC.md
docs/LIQUEAMP_IMPLEMENTATION_PLAN.md
```

These documents are the current source of truth for the LiqueAmp social/profile project.

Do not skip them.

Before changing code:

1. Inspect the current repository.
2. Verify that the analysis still matches the current code.
3. Identify any changes since the analysis commit.
4. Resolve only factual discrepancies automatically.
5. Stop and ask if a real architectural decision is required.

Then implement the project in the defined phases and checkpoints.

Do not implement everything in one uncontrolled pass.

Start with:

```text
CHECKPOINT 1
Profile model + settings split
```

Before changing Quick Actions, backend, authentication or Friends, make sure the profile foundation is working and tested.

At the end of each checkpoint:

- run tests
- run build
- report changed files
- report migration impact
- report tests
- report any remaining risks

Do not proceed to a later checkpoint if an earlier checkpoint has unresolved data-integrity problems.

---

# 28. Definition of Done

> **Obsolete item (D17):** "Friend requests work" → "Add Friend (one-way, immediate), Remove Friend and Block work".

The project is complete when:

- LiqueAmp still works without an account.
- Existing local data survives migration.
- Existing backups remain usable.
- A canonical LiqueAmpProfile exists.
- Profile/device state is separated.
- Profile-scoped storage is isolated.
- Friend profiles are read-only.
- Account/auth works.
- Own profile cloud sync works.
- Friend requests work.
- Friend Liques replaces Quick Actions.
- Online/offline status works.
- Friend profiles can be viewed.
- Friend Liques can be activated.
- Own profile can be restored.
- Friend activation cannot overwrite own data.
- Friend activation cannot modify friend cloud data.
- Privacy rules are enforced server-side.
- Shared stream data is sanitized.
- Offline behavior remains functional.
- Automated tests cover profile isolation and switching.
- Future Snapshots and Packs can reuse the same profile model.

---

# 29. Final Architectural Principle

The feature should feel like an extension of LiqueAmp, not a separate social application bolted onto it.

The core model is:

```text
LIQUEAMP
   │
   ├── OWN LIQUE
   │
   ├── FRIEND LIQUES
   │      ├── Friend A
   │      ├── Friend B
   │      └── Friend C
   │
   └── PROFILE SYSTEM
          ├── Cloud
          ├── Local
          ├── Snapshots
          ├── Backups
          └── Packs
```

The user should be able to move between these environments without losing or overwriting their own LiqueAmp.

The profile model is the foundation.

Friend Liques are a read-only window into another user's profile.

The user's own Lique remains the authoritative personal environment.

---

# 30. Decision Log

## D1 — Physical profile storage strategy

**Decided:** 2026-09-25, Checkpoint 2.
**Choice:** Option B — **one IndexedDB database per profile.**

### Why

| Criterion | A: one database, scope in every record | B: one database per profile (chosen) |
|---|---|---|
| Migration risk | Every existing record's key would have to be rewritten to include a scope (keyPath `id` → `[scope, id]`) in a `DB_VERSION` 2 upgrade. | **None.** `MY_LIQUE` is the existing `liqueamp` database, unchanged; no record is touched. |
| Accidental cross-profile writes | Possible with any query that forgets the scope filter. | **Impossible at the connection level:** a friend database connection cannot reach the own database, and vice versa. |
| Personal data in a friend profile | Needs a rule. | **Impossible by schema:** friend databases have no `history` store; the queue lives in the own `kv`. |
| Deleting a cached friend | Delete every record of that scope in every store. | **One `indexedDB.deleteDatabase()`.** |
| Offline / no backend | Yes | Yes |
| Duplicated implementation | — | The existing repository code is reused unchanged; only the database it opens differs. |

### How scopes are represented

- `ProfileScope` (`src/services/storage/scope.ts`): `{ kind: 'own' }` (`MY_LIQUE`) or `{ kind: 'friend', userId }`; text id `own` / `friend:<userId>`.
- The active scope is session state only (never stored): a reload always starts in `MY_LIQUE`.
- Databases (`src/services/storage/db.ts`):
  - `MY_LIQUE` → `liqueamp` (version 1, all stores: profile data, `history`, `kv` with device settings, queue and `profile.settings`).
  - `FRIEND:<userId>` → `liqueamp-friend:<userId>` (own version counter, profile stores + `kv` only). User ids are restricted to `[A-Za-z0-9_-]{1,128}` because they become part of a database name.

### How isolation is enforced

1. **Scope-bound repositories.** `repositoriesFor(scope)` / `profileKvFor(scope)` are bound to one scope for their whole life. A friend scope reads only its own database; there is no fallback to `MY_LIQUE`.
2. **Not available is explicit.** Opening a friend database that does not exist aborts the open (so no empty database is created) and throws `ProfileNotAvailableError`.
3. **Friend scopes are read-only.** Every write through a friend-bound repository or `profileKvFor(friend)` throws `ProfileScopeError`. Writes are never redirected.
4. **Stores bind to the scope they were hydrated from** (`scope` / `profileScope` in the settings, theme, library, playlist and favourites stores). Data read from one profile can only be written back to that profile — even if the active scope changes before the store is rehydrated. A hydrate that finishes after the active scope changed is discarded.
5. **"My data" is explicit.** `repositories` = `MY_LIQUE` + personal history; backup export and import planning use it. `createBackup` never exports a friend's profile settings. `applyImport` writes `MY_LIQUE` only and is refused while a friend scope is active.
6. **Personal data never follows the scope:** `personalRepositories.history` and `kv` (device settings, queue) always open the own database.
7. **One writer for friend databases:** `writeFriendProfileCache()` (`src/services/profile/profileCache.ts`). It accepts only a `ParsedProfile` (i.e. output of `parseProfile` validation), refuses a profile owned by someone else, and replaces the copy in one transaction (a failure keeps the previous copy).

### How friend profiles will be cached later

Fetch (later checkpoint) → `parseProfile` (validate, drop history and device settings) → `writeFriendProfileCache(userId, parsed)`. The copy stores the profile metadata (`revision`, `ownerUserId`, `updatedAt`, `visibility`) plus `cachedAt` under `profile.meta`, so staleness can be detected by comparing revisions (`readFriendProfileCacheMeta`). A newer revision replaces the copy completely.

### Deletion / cleanup

`deleteFriendProfileCache(userId)` deletes the friend's database. It is refused while that friend's scope is active (return to `MY_LIQUE` first, as required by FRIEND_LIQUES_SPEC §27). Open connections are closed first; another tab holding the database is asked to let go (`blocking`).

### Migration implications

None for existing installations: the `liqueamp` database, its schema version and its records are unchanged. Checkpoint 1's settings migration still runs, only in `MY_LIQUE`, never in a friend scope. A future schema change to friend databases uses their own version counter (`FRIEND_DB_VERSION`), independent of `DB_VERSION`.


## D2 — Profile vs device settings

**Decided 2026-09-25 (Checkpoint 1).** Recorded in the root `LIQUEAMP_IMPLEMENTATION_PLAN.md` §3.10. Profile: `activeThemeId`, `glowLevel`, `visualizer`, `eq`, `artwork`. Device: `volume`, `muted`, `shuffle`, `repeat`, `motion`, `shortcuts`, `providers`, `analysis`, `render`. Queue and history are personal.

## D3 — Favourites/playlists while a Friend Lique is active

**Open.** PROFILE_SPEC §20 prefers "apply to the viewer's own favourites"; today such writes are refused in a friend scope. To be decided with Friend Lique activation.

## D4 — Backend

See D16.

## D5 — Authentication: Google + GitHub OAuth; account UI

> **Extended 2026-09-26:** email + password (Supabase Email auth, which stays enabled) is the third sign-in method, next to Google and GitHub. It leads to the same kind of account (auth user, `public.users`, username, profile, Friend Liques). No magic links. The status line reads `Logged in with Email`. See §31, "Email authentication".

**Decided 2026-09-25 (final):** authentication is **Google OAuth and GitHub OAuth through Supabase Auth**. No email/password, no magic links, no avatars. Accounts are optional. Settings › ACCOUNT — logged out: `Not logged in  [ CONTINUE WITH GOOGLE ] [ CONTINUE WITH GITHUB ]`; logged in: `@johan  Logged in with Google (or GitHub)  [ LOG OUT ]` (plus Delete account, D15). The status bar shows `NOT LOGGED IN` or `@johan` to the right of `STORAGE: LOCAL`. The app talks to accounts only through `AccountProvider` (`src/services/account/account.ts`); the Supabase implementation is `src/services/cloud/supabaseAccount.ts`.

## D6 — Username

**Decided (final):** the username (`@johan`) is the user's LiqueAmp identity and the visible identity of their Lique — what they give other people so those people can add them. No separate display name, no avatar. Rules, kept simple: **3–20 letters (A–Z, a–z) or digits (0–9); no spaces or symbols**; the typed case is kept but comparison is case-insensitive (`Johan` = `johan`); a short reserved list (admin, liqueamp, support, system, root, moderator, official, …). Uniqueness is enforced by the database (unique index on `lower(username)`), not by a check before insert; the client check (`src/services/account/username.ts`) only gives immediate feedback. `user_id` (the Supabase auth UUID) is the permanent technical identity and the only key; the username is never a primary key. Renaming is not offered yet.

## D7 — Create Account adopts the local Lique

**Decided (final):** the first time a user logs in (and chooses a username), **their current local MY_LIQUE becomes their first cloud profile** — they never start over. Preserved and uploaded: profile settings (theme, Base16 theme, glow, visualizer, EQ, artwork), custom themes, playlists, categories, streams/media, stations, favourites. Not uploaded: queue, history, device/session state. After the upload `profile.meta` = `{ ownerUserId, baseRevision: <cloud revision>, dirty: false }`; the local database stays the working copy and is not changed. If that first upload did not complete, the next login finishes it (an account without a cloud profile always adopts the local Lique).

## D8 — Device and session state stay local; other devices

**Decided (final): device and session state stay local.** `volume`, `muted`, `shuffle`, `repeat`, `motion`, `shortcuts`, `providers`, `analysis`, `render`, the queue and history are never uploaded and are never overwritten by logging in. On another device: with no local Lique, the account's cloud profile is downloaded, validated and installed into MY_LIQUE through the safe replace import (profile data only). A device that already has a local Lique never mixes it with the account profile: `profile.meta.ownerUserId` says whether the local Lique belongs to no account, this account or another account; an unrelated local Lique needs the explicit choice *Keep local profile* / *Use cloud profile*, and **another account's local Lique is never uploaded, replaced or merged — not even by an explicit choice** (sync shows "belongs to another account").

## D9 — Revisions and conflicts

**Decided (final):** revision-based sync. `profile.meta` = `ownerUserId`, `baseRevision`, `dirty`, `lastSyncedAt`. The server owns the revision (database trigger: 1 on insert, +1 on every update; client values are ignored). Local edits only set `dirty`. Upload only when the local profile belongs to the logged-in account, is dirty, and the cloud revision still equals `baseRevision` (compare-and-swap: `update … where revision = baseRevision`); on success `baseRevision` = new revision, `dirty` = false, `lastSyncedAt` updated. Download replaces the local profile only when the account matches, the local profile is not dirty and the cloud profile validates. **Conflict** = dirty and cloud revision > `baseRevision`: a typed `conflict` result, nothing overwritten; the user chooses **Keep local** (this device's Lique replaces the cloud profile, still compare-and-swap) or **Use cloud** (the cloud profile replaces this device's profile data; queue/history/device state stay). No automatic merge.

## D10 — Avatars

**Decided:** none. The username is the visual identity.

## D11 — Online / offline

**Decided:** online = the person currently has LiqueAmp open; offline = not. No last-seen, activity history, detailed presence or availability. Presence is never required to activate a (cached) Friend Lique.

## D12 — Privacy: one-way access

**Decided (final, 2026-09-25): one-way access.** When user A adds user B, **A gains read-only access to B's Lique**; B does **not** automatically gain access to A's Lique. Example: Johan adds Alice → Johan can see and activate Alice's Lique; Alice cannot see Johan's unless she adds him. A Lique is private by default (nothing is public); Friend Liques never grant write access; Block (by B) removes A's access and overrides everything. No friend requests, no accept/decline (D17). No per-item privacy in the first implementation. (Checkpoint 5 RLS: users read only their own rows; the friend read policy is added in the Friend Liques checkpoint — done in checkpoint 6, §31.)

## D13 — Stream URLs before sharing

**Decided / implemented (Checkpoint 4):** before a profile is uploaded or shared, `sanitizeForSharing()` detects credentials in every URL (user:password@, token/key/api_key/access_token/auth/sig/signature-style parameters, signed cloud-storage and CDN URLs such as X-Amz-*, JWTs). The local original is never modified. For each suspicious item the user chooses: exclude it from the cloud copy, keep/share it, or cancel the sync. The upload does not happen until every finding has a decision.

## D14 — Log out

**Decided:** logging out only disconnects the account session. LiqueAmp continues exactly as it was: theme, Base16 theme, playlists, streams, settings, queue, history, volume, shuffle, repeat — all local data remain; `profile.meta` still records the owning account. The UI shows `Not logged in`. Logging in again identifies the account, checks the local/cloud sync state and restores/synchronises its profile, keeping device state per D2. Log out is never a reset to a guest mode.

## D15 — Delete account

**Decided:** separate from Log out, and requires explicit confirmation. Permanently deletes the cloud account and profile, removes its cloud friendships and blocks, and makes the username available according to the (open) username policy; others can no longer access the profile. The local MY_LIQUE on the current device is **not** deleted: LiqueAmp continues as a local app, and the local Lique is no longer linked to any account.

## D16 — Backend

**Decided (final):** Supabase for auth and the cloud; the frontend stays on GitHub Pages; EU region preferred (Stockholm first choice if offered). **Local-first is non-negotiable:** IndexedDB stays the runtime database; Supabase is only the account/cloud layer; if Supabase is unreachable (or not configured) LiqueAmp starts, plays and edits normally and syncs later. Schema (`supabase/migrations/20260925120000_liqueamp_accounts.sql`): `public.users (id = auth.users.id, username, created_at, updated_at)` with a unique index on `lower(username)`; `public.profiles (user_id, revision, schema_version, visibility, data, summary, created_at, updated_at)`; triggers own `revision`/`visibility`/timestamps and check the profile's format and owner; RLS: a user reads/creates their own `users` row and reads/creates/updates/deletes their own `profiles` row; `delete_my_account()` removes the auth user (cascade). Later: `friendships` (one-way) and `blocks`. Only the project URL and the publishable key are public (`VITE_*`); the build refuses a secret key; no service-role key anywhere in the frontend.

## D17 — Friends

**Decided (final):** no friend requests, no accept/decline. Add Friend (by username) is immediate and one-way (D12). Remove Friend removes the person from the viewer's list only. Block is stronger: it prevents the blocked user from accessing the blocker's Lique and overrides normal access. Home: FRIEND LIQUES (replaces Quick Actions), Add Friend icon top-right, rows `● @alice Online [ ▶ ]`, ▶ activates, one Friend Lique active at a time, `[ RETURN TO MY LIQUE ]` while active.

---

# 31. Checkpoint Log

## Checkpoint 3 — Quick Actions migration (2026-09-25)

**Status:** implemented; `QuickActionsPanel` removed from Home. Friend Liques is **not** implemented.

### Audit: what Quick Actions offered

Quick Actions acted on the current selection (a station selected in a station list, or a media item clicked in a library list), or on the playing item when nothing was selected.

| Action | Stations | Media items (Library, Playlists, Favourites, History lists) | Playing item |
|---|---|---|---|
| Play now | already on every station row (▶) | already: clicking the row plays it | already: transport |
| Add to queue | **only in Quick Actions** | only in the Library list; **only in Quick Actions** elsewhere | **only in Quick Actions** |
| Add/remove favourite | already on every station row (♥) | **only in Quick Actions** | already: Now Playing favourite button |
| Add to playlist | **only in Quick Actions** | **only in Quick Actions** | **only in Quick Actions** |
| Share | **only in Quick Actions** | **only in Quick Actions** | **only in Quick Actions** |
| Copy stream URL | **only in Quick Actions** (Station Info showed the URL as text) | **only in Quick Actions** | **only in Quick Actions** |
| Open website | already: Station Info "Website" link | n/a | already: Station Info shows the playing station |

### Migration map

```text
Station: Add to queue / Add to playlist / Share / Copy stream URL
    → Station Info action row (StationActions), under the station name
Station: Open website
    → unchanged: the Website link in Station Info (also in the ⋯ menus for stations)
Media item (every list): Add to queue / Add to playlist / Favourite / Share / Copy stream URL
    → "⋯" menu at the end of every media row (MediaRow, so all lists get it)
Playing item: Add to queue / Add to playlist / Share / Copy stream URL (/ Open website for stations)
    → "⋯" menu next to the Now Playing favourite button
Play now / station favourite / playing-item favourite
    → already existed; nothing moved
```

All locations use one implementation, `useItemActions()` in `src/components/actions/ItemActions.tsx`: the Quick Actions logic moved unchanged, with the same services (`queueStation`, `getEngine().enqueue`, `shareOrCopy`, the clipboard, `AddToPlaylistDialog`, the favourites store) and the same toasts. There is no replacement generic action panel.

### Removal and the Friend Liques slot

- `src/components/player/QuickActionsPanel.tsx` is deleted and no longer mounted in `src/app/Dashboard.tsx`.
- Quick-Actions-only state is removed: the `media` kind of `useUi.selection` (only Quick Actions read it); `MediaRow` no longer sets a selection. Station selection (Station Info) is unchanged.
- Quick-Actions-only CSS is removed (`.quick-actions`, `.quick-actions__hint`, `.quick-actions__more`); `.quick-actions__target` is now the neutral `.panel__target`.
- **The `.area-actions` grid slot is kept** (desktop column 4 of the lower row; the mobile section rules too). Until a panel with `.area-actions` exists, Station Info spans columns 3–4 on desktop (`.area-lower:not(:has(> .area-actions)) > .area-station`). A future `FriendLiquesPanel` with `className="panel area-actions"` takes the slot back automatically; no Dashboard layout rewrite is needed.

### UI architecture decisions

- Row actions go in a compact "⋯" menu, not more row buttons, so lists stay scannable. The menu is rendered in a portal with fixed positioning (scrolling panels cannot clip it), follows its button on scroll, and supports keyboard use (focus first item, ↑/↓, Esc returns focus).
- Station Info gets visible buttons: it is the station's details view and has room.
- Ownership: "Add to queue" always goes to the viewer's personal queue (engine → queue store). Favourites and playlists go through their stores, which write to the profile they hold (Checkpoint 2). When Friend Liques exist, routing "favourite this for myself" to `MY_LIQUE` (decision D3) is a change in `useItemActions` and the favourites store only.

### Tests

- `src/components/actions/ItemActions.test.tsx` (12 tests): queue, playlist, favourite, share (Web Share and clipboard fallback), copy stream URL (station, stream, embed source), clipboard failure, website link, per-type menu contents, keyboard.
- `e2e/acceptance.mjs`: check 15 (playlist) uses the Now Playing ⋯ menu; new check 32 verifies Quick Actions is gone and exercises every moved action in the browser.

---

## Checkpoint 4 — Account + cloud profile foundation (2026-09-25)

**Status:** implemented and verified; no backend connected yet (authentication method open, D5).

- **Account service** (`src/services/account/account.ts`): provider-neutral `AccountProvider` (`getSession`, `getCurrentUser`, `signUp`, `signIn`, `signOut`, `deleteAccount`, `onChange`); credentials are opaque (D5 open). `createLocalAccountProvider()` is used when no backend is configured: always signed out, sign-in explains accounts are unavailable. `useAccount` store (`src/stores/accountStore.ts`): Log out only disconnects; Delete account needs `{ confirmed: true }`, removes the cloud profile, deletes the account and unlinks the local Lique without touching its data.
- **Cloud port** (`src/services/sync/cloudProfile.ts`): `head`, `download`, `upload` (compare-and-swap on the expected revision; server increments), `remove`. The Supabase implementation plugs in here.
- **Sync** (`src/services/sync/`): `profile.meta` (`ownProfileMeta.ts`) with dirty tracking through a write notification in the storage layer (`onOwnProfileWrite`; own-profile repositories, `profileKvFor(MY_LIQUE)` and `applyImport`); the ownership guard (`localOwnership`, `assertLocalProfileOwner`); `decideSync`, `uploadOwnProfile`, `adoptLocalProfile` (D7), `downloadOwnProfile` (D8), `syncOwnProfile`, `unlinkLocalProfile` (D15) in `profileSync.ts`. Edits made during an upload keep the profile dirty.
- **Sharing safety** (`src/services/profile/sharing.ts`): `inspectUrl`, `sanitizeForSharing`, `undecided`, `applySharingDecisions` (pure; D13).
- **Summary** (`src/services/profile/summary.ts`): `summarizeProfile()` for future Friend Lique previews.
- **Configuration** (`src/services/account/config.ts`, `.env.example`): `readCloudConfig()` (public URL + publishable key only; a secret key is refused) and `authCallbackUrl()` (includes the base path).
- **CSP** (`security/cspPlugin.ts`): a meta Content-Security-Policy added to the built `index.html`/`404.html` (not in dev). No inline scripts; scripts only from the app and the official player APIs (YouTube, SoundCloud, Spotify incl. `embed-cdn.spotifycdn.com`). **`'unsafe-eval'` is allowed because the Spotify iFrame API does not start without it** (verified in Chrome and Edge); revisit if Spotify changes or if its API is isolated in a frame. Media, images and connections allow any http(s) (streams, artwork, directory, backend), frames any https, workers `self` + `blob:` (hls.js).
- **UI:** Settings › Account (`src/components/settings/AccountSection.tsx`; logged out without a backend: `Not logged in` with the two buttons disabled and an explanation); status bar shows `@username` or `NOT LOGGED IN` right of `STORAGE: LOCAL`.
- **Not in this checkpoint:** Friend Liques panel, Add Friend, activation, presence, public profiles, Packs, snapshots, per-item visibility, automatic merge, avatars, authentication-method UI, the Supabase SDK and SQL schema, conflict/"resolve local Lique" UI.

---

## Checkpoint 5 — Supabase account and profile sync (2026-09-25)

**Status:** implemented and tested against an in-memory stand-in that enforces the migration's rules, and in Chrome/Edge (unconfigured build + configured build with an unreachable Supabase). **Not yet verified against a real Supabase project** — that needs the manual setup below.

- **Cloud layer** (`src/services/cloud/`): `supabaseClient.ts` (lazy `import()` of `@supabase/supabase-js`, PKCE, session in `localStorage` under `liqueamp-auth`), `supabaseAccount.ts` (Google/GitHub OAuth, username claim, sign-out on this device, `delete_my_account()`), `supabaseProfiles.ts` (profile head/download/compare-and-swap upload/delete), `errors.ts` (timeouts; every failure becomes a plain LiqueAmp message), `index.ts` (Supabase when configured, otherwise the local no-account provider).
- **Account store** (`src/stores/accountStore.ts`): loading/error/needs-username/signed-in states, sync view (synced, needs review, conflict, resolve-local, other account, error), explicit Keep local / Use cloud, sharing review (D13), expired-session message, OAuth callback errors; uploads local changes a few seconds after they happen and when the browser comes back online.
- **Sync** (`src/services/sync/profileSync.ts`): D7 adoption at any login of an account without a cloud profile; `keepLocalProfile` / `useCloudProfile` (explicit, never for another account's Lique); stores are reloaded after a download (`src/stores/reloadProfileStores.ts`).
- **UI:** `UsernameSetupDialog` (first login: live validation, "already taken" from the database, Cancel logs out), Settings › Account (Continue with Google/GitHub, @username, Logged in with …, Log out, Delete account with confirmation), OAuth callback route `<base>/auth/callback` that returns to where sign-in started.
- **Deploy:** the GitHub Pages workflow passes `vars.VITE_SUPABASE_URL` and `vars.VITE_SUPABASE_PUBLISHABLE_KEY` to the build (unset = local-only build).

### Manual setup required (cannot be done from the code)

1. Create a Supabase project (EU region — Stockholm/`eu-north-1` if offered, otherwise another EU region).
2. Run `supabase/migrations/20260925120000_liqueamp_accounts.sql` (SQL editor, or `supabase db push`).
3. Authentication › URL configuration: Site URL `https://thermoptic.github.io/LiqueAmp/`; Redirect URLs `https://thermoptic.github.io/LiqueAmp/auth/callback` and, for development, `http://localhost:5173/LiqueAmp/auth/callback`.
4. Google: create an OAuth client (Web) in Google Cloud Console with the authorized redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`; enable the Google provider in Supabase with its client ID/secret.
5. GitHub: create an OAuth App (github.com › Settings › Developer settings) with the callback URL `https://<project-ref>.supabase.co/auth/v1/callback`; enable the GitHub provider in Supabase with its client ID/secret.
6. GitHub repository › Settings › Secrets and variables › Actions › **Variables**: `VITE_SUPABASE_URL` = `https://<project-ref>.supabase.co`, `VITE_SUPABASE_PUBLISHABLE_KEY` = the project's publishable (anon) key. For local development put the same two values in `.env.local` (ignored by git).
7. Never use the secret/service-role key in any of these places.

---

## Checkpoint 6 — Friend access foundation (2026-09-26)

**Status:** database model, RLS and client service implemented and verified against the real Supabase project. **No UI, no Friend Lique activation, no blocks yet.** The existing profile schema, the account/OAuth flow and MY_LIQUE behaviour are unchanged.

- **Migration** `supabase/migrations/20260926100000_liqueamp_friends.sql` (applied with `supabase db push`; the checkpoint 5 migration is untouched):
  - `public.friendships (user_id, friend_id, created_at)`, "user_id added friend_id": primary key `(user_id, friend_id)` (no duplicates), check `user_id <> friend_id`, both columns `→ public.users on delete cascade` (deleting an account removes relationships in both directions), index on `friend_id`.
  - RLS on `friendships`: select/insert/delete only where `user_id = auth.uid()`; **no update** policy or grant (a relationship is added or removed, never rewritten). `anon` has no access; `authenticated` has only select/insert/delete.
  - `users: read people I added` and `profiles: read Liques I added`: extra **select-only** policies. If A added B, A reads B's `users` row (username) and `profiles` row; B gains nothing (D12). Insert/update/delete on `profiles` stay own-only, so a friend's Lique is read-only.
  - `public.lookup_username(p_username)`: security definer, `search_path = ''`, signed-in users only (`anon` revoked); exact, case-insensitive match; returns only `user_id` and `username`.
- **Client** (not wired to the UI): `src/services/friends/friends.ts` (provider-neutral `FriendDirectory`: `add(username)`, `list()`, `remove(friendUserId)`, `readProfile(friendUserId)`; `FriendError` codes `not-signed-in`, `username-invalid`, `not-found`, `self`, `already-added`; backend failures stay `AccountError`s), `src/services/cloud/supabaseFriends.ts` (Supabase implementation), `CloudServices.friends` (`null` without a backend).
- **Tests:**
  - `supabase/tests/friends_rls.test.sql`: pgTAP, 34 assertions. It covers the one-way add, read-only access, removal, impersonation, other users' rows, unrelated users, the lookup's columns, anon, own-profile rules and account deletion. Run it with `npm run db:test:remote -- friends` (`scripts/db-test-remote.mjs`: runs the file on the linked project inside a subtransaction that is always rolled back; no Docker) or with `npx supabase test db --linked` where Docker is available. Result on the real project: 34/34, and no fixtures or pgtap extension are left behind.
  - `src/services/friends/friends.test.ts` runs the adapter against `src/test/fakeSupabase.ts`, which now enforces the friendships rules.
- **Next:** Block (D17: `blocks` table; must override the two read policies), Friends UI (Add Friend, list, Remove), Friend Lique activation (the `friend:<userId>` scope from checkpoint 2, filled from `readProfile`).
- **Open questions:**
  - `lookup_username` confirms whether a username exists and returns its opaque id to any signed-in user. This is inherent to adding by exact username; rate limiting is not implemented.
  - D5 still says "no email/password"; Supabase Email auth is kept enabled by decision of 2026-09-25 but is not used by the app.

---

## Checkpoint 7 — Friend Liques UI (2026-09-26)

**Status:** implemented; no activation, no profile switching, no schema/RLS/OAuth changes, MY_LIQUE data untouched.

- **Panel** `src/components/friends/FriendLiquesPanel.tsx` fills the `.area-actions` slot next to Station Info (the layout's fallback rule for an empty slot no longer applies). Title FRIEND LIQUES; the Add Friend icon is top-right (D17).
  - **States:** checking account (LOADING…), no accounts in this build, signed out (ACCOUNT REQUIRED, link to Settings › Account), needs a username, loading, list error with Try again, empty (NO FRIEND LIQUES YET + Add Friend), and the list.
  - **Rows** show `@username` and a Remove button. **Online/offline is not shown:** there is no presence source yet (D11), so nothing is invented.
  - **Add Friend** is a dialog. Errors from the service appear in the dialog: invalid, not found, yourself, already added, not signed in, offline/session. A toast confirms success.
  - **Remove** asks for confirmation in a danger dialog.
- **Preview (read-only, not activation).** Selecting a friend replaces the list inside the panel (drill-down; the panel is about 180 px tall on desktop). Back returns to the list, and focus moves to the preview heading and back to the row.
  - Shows: READ ONLY, theme, visualizer, and counts of playlists, categories, streams and stations.
  - Shows `ACTIVATE LIQUE`, disabled, marked "Coming later".
  - **Source:** the `summary` column (spec §12: not the full profile for a preview), read with `FriendDirectory.readSummary()` and validated (`src/services/friends/friendSummary.ts`: bounded strings, non-negative integer counts; built-in theme names come from this app). If the stored summary is unusable, the full profile goes through `parseProfile()` and is summarized. Revision and time come from the server row. No history, queue, device settings or account data are read or shown.
- **State:** `src/stores/friendsStore.ts` (not persisted). The directory is set in `bootstrap.ts` from `createCloudServices()`. The list is reloaded per signed-in user and cleared on sign-out.
- **Styles:** `src/styles/friends.css`, built on the existing panel, row, kv-list, status, pending-tag and dialog styles.
- **Tests:**
  - `src/components/friends/FriendLiquesPanel.test.tsx` runs against the fake Supabase.
  - `src/app/Dashboard.test.tsx` covers the Home regions, which are intact without an account.
  - Summary validation and `readSummary` are covered in `src/services/friends/friends.test.ts`.
- **Next:** Friend Lique activation/restoration (spec §13–§21, §47), presence (D11), Block (D17).

---

## Email authentication (2026-09-26)

**Status:** implemented. No database, RLS, migration, OAuth or Friend Liques changes.

- **Supabase project settings**, read from the public `/auth/v1/settings` endpoint on 2026-09-26:
  - `external.email: true`, `disable_signup: false`;
  - `mailer_autoconfirm: false`: **email confirmation is required**, so a new email account has no session until the link in the email is opened.
- **UI**, Settings › Account when logged out:
  - `[ Continue with Google ] [ Continue with GitHub ]` and `[ Log in with Email ] [ Create account with Email ]`.
  - **One dialog, `EmailAuthDialog`,** has three modes:
    - log in: Email, Password, "Forgot password?", "Create an account";
    - create account: Email, Password, Confirm password;
    - reset password: Email.
    - Its client checks are only an email format, a password being present and the confirmation matching. Password rules are Supabase's, and its message is shown.
  - After sign-up: "Check your email" (not logged in). The link returns to `<base>/auth/callback`, then the existing username onboarding runs. If confirmation is off, onboarding starts at once.
  - After a reset link: Supabase signs the user in (`PASSWORD_RECOVERY`), and `SetNewPasswordDialog` asks for the new password (`updateUser`). "Not now" leaves the old password.
- **Provider label:**
  - An email login is recorded when it succeeds.
  - Confirmation and reset links use the existing pending record, with the link lifetime (24 h / 1 h instead of 15 min).
  - The Google/GitHub mechanism is unchanged, and logout clears everything.
  - Only the method name is stored, never an address or a password.
- **Errors:** invalid email, weak/same password (Supabase's text), already registered (Supabase answers with a user without identities and sends no email), wrong email or password, email not confirmed, rate limit, offline.
- **Security:** passwords go straight to Supabase Auth. They exist only in the open form's state and are never stored in localStorage or IndexedDB or logged. Tests check that browser storage holds neither the password nor the address.
- **Files:**
  - `src/services/account/account.ts`: `AUTH_METHODS` gains `email`; `OAUTH_METHODS`; email credentials; `SignUpResult`; `checkEmail`; `requestPasswordReset`; `updatePassword`; `onPasswordRecovery`; new error codes.
  - `src/services/cloud/supabaseAccount.ts`, `supabaseClient.ts`, `errors.ts` (`toEmailAuthError`).
  - `src/stores/accountStore.ts`.
  - `src/components/settings/EmailAuthDialog.tsx`, `AccountSection.tsx`, `src/app/Dashboard.tsx`.
  - `src/test/fakeSupabase.ts`, which now simulates email auth.
- **Tests:** `src/services/account/emailAuth.test.tsx`.
- **Limitations:**
  - The confirmation/reset link must be opened **in the same browser** (PKCE keeps the code verifier there). Opened elsewhere, the address is still confirmed, and the user logs in with email and password; the dialog says so.
  - Supabase's default email sender is rate-limited and meant for testing. A custom SMTP server (Authentication › Emails) is recommended before real use.
  - The same address with email and with Google/GitHub is whatever Supabase does (no custom linking).
