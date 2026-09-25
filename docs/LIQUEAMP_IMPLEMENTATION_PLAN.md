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

## D5 — Account UI; authentication method

**Decided 2026-09-25:** accounts are optional. Settings gets an ACCOUNT section — logged out: `Not logged in  [ CREATE ACCOUNT ] [ LOG IN ]`; logged in: `● Logged in  @username  [ LOG OUT ]`. The status bar shows `@username` (or `Not logged in`) to the right of `STORAGE: LOCAL`. No avatars.
**Still open:** the authentication method itself (email/password, magic link, OAuth, passkeys …). The app uses a provider-neutral account interface (`src/services/account/account.ts`) so nothing depends on that choice.

## D6 — Username

**Decided:** the username (`@johan`) is the human-facing identity of the account and of its whole Lique (settings, theme, Base16, visualizer, EQ, artwork, playlists, categories, streams/stations, favourites). It is what a person gives someone so they can add their Lique. Unique case-insensitively. It is never a database key: the opaque, stable `user_id` from the backend is used for ownership, relationships and cache naming.
**Still open:** exact character set, length limits, reserved names, and the rename/release policy.

## D7 — Create Account adopts the local Lique

**Decided:** creating an account turns the existing local MY_LIQUE into the account's initial profile — the user never starts over: local MY_LIQUE → create account → username assigned → local profile linked (`profile.meta.ownerUserId`) → initial cloud upload (after the D13 check). Queue, history and device settings stay local. Refused if the account already has a cloud profile (resolved explicitly, later UI).

## D8 — Signing in on another device

**Decided:** on a device without a local Lique, the cloud profile is downloaded, validated (`parseProfile`) and installed into MY_LIQUE with the existing safe replace import: profile data replaced; queue, history and device settings kept. A device that already has a local Lique never mixes it with the account profile: `profile.meta.ownerUserId` tells whether the local Lique belongs to no account, this account or another account, and anything but "this account" (or an empty device) needs an explicit decision (UI later). **A local Lique of Account A is never uploaded to, overwritten by, or merged with Account B.**

## D9 — Revisions and conflicts

**Decided:** `profile.meta` = `ownerUserId`, `baseRevision`, `dirty`, `lastSyncedAt`. The server owns the revision and `updatedAt`. Local edits only set `dirty` (every own-profile write; never device settings, queue, history or friend caches). Upload succeeds only while the cloud revision still equals `baseRevision` (compare-and-swap; the server increments). Download replaces the local profile automatically only when it is not dirty. Conflict = dirty and cloud revision > `baseRevision` (or cloud behind the base): nothing is overwritten; resolution is explicit and user-driven. No automatic full merge yet.

## D10 — Avatars

**Decided:** none. The username is the visual identity.

## D11 — Online / offline

**Decided:** online = the person currently has LiqueAmp open; offline = not. No last-seen, activity history, detailed presence or availability. Presence is never required to activate a (cached) Friend Lique.

## D12 — Privacy

**Decided:** a Lique is private by default. Access comes from the one-way Friend Liques relationship, is read-only (never write access) and is immediate — there is no request/accept step. Block overrides access. No per-item privacy in the first implementation; no public profiles yet.
**Open clarification (must be answered before the server access rules are written):** the decision text contains both directions. The Friend Liques behaviour says *"@alice adds @johan → Alice can access Johan's Lique"* (the person who adds gains access; Block is then the owner's protection). The privacy text says *"a user can access another user's Lique if that user has added them"* (the person who is added gains access). These give opposite authorization rules.

## D13 — Stream URLs before sharing

**Decided / implemented (Checkpoint 4):** before a profile is uploaded or shared, `sanitizeForSharing()` detects credentials in every URL (user:password@, token/key/api_key/access_token/auth/sig/signature-style parameters, signed cloud-storage and CDN URLs such as X-Amz-*, JWTs). The local original is never modified. For each suspicious item the user chooses: exclude it from the cloud copy, keep/share it, or cancel the sync. The upload does not happen until every finding has a decision.

## D14 — Log out

**Decided:** logging out only disconnects the account session. LiqueAmp continues exactly as it was: theme, Base16 theme, playlists, streams, settings, queue, history, volume, shuffle, repeat — all local data remain; `profile.meta` still records the owning account. The UI shows `Not logged in`. Logging in again identifies the account, checks the local/cloud sync state and restores/synchronises its profile, keeping device state per D2. Log out is never a reset to a guest mode.

## D15 — Delete account

**Decided:** separate from Log out, and requires explicit confirmation. Permanently deletes the cloud account and profile, removes its cloud friendships and blocks, and makes the username available according to the (open) username policy; others can no longer access the profile. The local MY_LIQUE on the current device is **not** deleted: LiqueAmp continues as a local app, and the local Lique is no longer linked to any account.

## D16 — Backend

**Decided:** Supabase is the selected backend direction. EU region preferred; Stockholm is the first choice if available. Local-first stays mandatory. Conceptual entities: `users` (user_id, username, created_at), `profiles` (owner_user_id, schema_version, revision, updated_at, payload), `profile_summaries` (owner_user_id, summary, revision), `friendships` (one-way, D17), `blocks` (blocker, blocked). Server-side ownership and authorization (row-level security) are authoritative; the client is never trusted to decide who may read or write a profile. Only the project URL and the publishable key may be in `VITE_*` variables (public); the build refuses a secret key. Auth callbacks include the `/LiqueAmp/` base path. SQL schema and migrations are not written until D5 and the D12 clarification are settled.

## D17 — Friends

**Decided:** no friend requests. Add Friend (username) is immediate; relationships are one-way; Remove Friend removes the person from the viewer's list only and does not affect the other account; Block is stronger than Remove and prevents the blocked user from accessing the blocker's Lique, overriding normal access. Home: FRIEND LIQUES (replaces Quick Actions), Add Friend icon top-right, rows `● @alice Online [ ▶ ]`, ▶ activates, only one Friend Lique active at a time, `[ RETURN TO MY LIQUE ]` while active.

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
