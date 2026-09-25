# LIQUEAMP PROFILE SPECIFICATION

**Status:** Planning / Architecture  
**Project:** LiqueAmp  
**Depends on:** `LIQUEAMP_SOCIAL_ARCHITECTURE.md` and `LIQUEAMP_SOCIAL_IMPLEMENTATION_ANALYSIS.md`


> **Status (2026-09-25):** implemented locally in Checkpoints 1–2 (profile
> model, settings split, scoped storage) and extended in Checkpoint 4 (sync
> metadata, sharing safety, summaries). Decisions D2, D9, D12 and D13 in
> `docs/LIQUEAMP_IMPLEMENTATION_PLAN.md` §30 refine this specification;
> affected sections are marked.

---

## 1. Purpose

This document defines the canonical `LiqueAmpProfile` model.

The goal is to avoid creating a second, parallel representation of LiqueAmp state.

The existing LiqueAmp backup/import system already serializes most of the user-created application state. The new profile model should build on that existing representation rather than duplicating it.

A `LiqueAmpProfile` must be usable for:

- The user's own cloud profile
- Friend Liques
- Profile switching
- Snapshots
- Backup/restore
- Import/export
- LiqueAmp Packs

The profile must be versioned and serializable.

---

# 2. Core Principle

There must be **one canonical profile representation**.

Conceptually:

```text
LiqueAmpProfile
      │
      ├── Own Profile
      ├── Friend Lique
      ├── Snapshot
      ├── Backup
      ├── Export
      └── LiqueAmp Pack
```

Do not create separate incompatible data models for each feature.

---

# 3. Existing Foundation

The current repository already contains:

```text
BackupData
```

with:

- settings
- custom themes
- categories
- media
- playlists
- favorites
- stations
- optional history

The existing backup system also has:

- versioning
- validation
- import planning
- ID remapping
- transactional import
- rollback

The implementation should reuse these mechanisms wherever appropriate.

Do not replace the existing backup system simply to introduce profiles.

---

# 4. Profile Envelope

The proposed conceptual model is:

```text
LiqueAmpProfile
│
├── schemaVersion
├── ownerUserId
├── revision
├── updatedAt
├── visibility
│
└── data
    └── BackupData-like payload
```

The exact TypeScript structure should be determined from the existing types during implementation.

The important requirement is that profile metadata and profile content remain logically distinct.

---

# 5. Profile Metadata

A profile should contain metadata sufficient to identify and synchronize it.

Required concepts:

```text
schemaVersion
ownerUserId
revision
updatedAt
visibility
```

### schemaVersion

Identifies the profile schema version.

This is independent from the existing backup file version.

### ownerUserId

The stable account ID of the profile owner.

This must never be the username.

### revision

A monotonically increasing or otherwise comparable revision identifier used for synchronization and conflict detection.

### updatedAt

Timestamp of the latest profile modification.

### visibility

Initial supported values:

```text
PRIVATE
FRIENDS
PUBLIC
```

---

# 6. Profile Data

The profile data should be based on the existing `BackupData` structure.

Initial profile candidates:

```text
settings
themes
categories
media
playlists
favorites
stations
```

History should NOT be included in the shared profile by default.

Queue should NOT be included in the shared profile.

---

# 7. Settings: Profile vs Device

> **Decided (D2, 2026-09-25):** shuffle and repeat are DEVICE settings (they only steer the personal queue). Profile: activeThemeId, glowLevel, visualizer, eq, artwork. Device: volume, muted, shuffle, repeat, motion, shortcuts, providers, analysis, render.

This is one of the most important architectural separations.

The current `Settings` object mixes profile-related preferences with device/session preferences.

The implementation must separate these concepts.

## 7.1 Profile Settings

Settings that describe how the user's LiqueAmp should look or behave as part of their personal LiqueAmp environment.

Candidate profile settings identified from the current repository:

```text
activeThemeId
glowLevel
visualizer
eq
artwork
shuffle
repeat
```

These are candidates and must be verified against actual behavior before implementation.

---

## 7.2 Device Settings

Settings that should remain tied to the user's device rather than following a Friend Lique.

Candidate device settings:

```text
volume
muted
motion
shortcuts
providers
analysis
render
```

These are candidates based on the implementation analysis and must be verified before implementation.

For example:

- A friend's profile should NOT suddenly change the physical playback volume of the user's device.
- A friend's profile should NOT override device-specific rendering/performance settings.
- A friend's profile should NOT force a different reduced-motion preference.

---

# 8. Playback State

Playback/session state should not automatically become part of a shared profile.

The following should remain user/device session state unless a later feature explicitly changes this:

```text
current playback
queue
playback clock
temporary selection
UI selection
toasts
open dialogs
```

A Friend Lique should describe the friend's LiqueAmp environment, not take over the viewer's temporary application session.

---

# 9. History

Listening history is personal data.

It should not be included in a Friend Lique by default.

Therefore:

```text
Friend Lique
    ✗ history
```

History should remain associated with the user's own account/device.

If a future feature explicitly allows sharing listening history, that should be a separate opt-in feature with its own privacy rules.

---

# 10. Queue

The play queue is temporary session state.

It should not be part of a Friend Lique.

Therefore:

```text
Friend Lique
    ✗ queue
```

Activating a Friend Lique must not replace the viewer's current queue unless a future explicit feature is introduced.

---

# 11. Themes

Themes are profile data.

A Friend Lique may contain:

```text
activeThemeId
custom themes
```

Built-in themes should continue to use their stable built-in IDs.

For example:

```text
base16-nord
base16-catppuccin-mocha
```

If a friend uses a custom theme, that custom theme must be included in the shared profile payload.

The existing theme normalization/versioning system should continue to be used.

---

# 12. Base16

Base16 support is part of the LiqueAmp profile appearance.

The profile must preserve enough information to reproduce the friend's theme exactly.

For built-in themes:

```text
activeThemeId
```

is normally sufficient.

For imported/user-created themes:

```text
theme record
palette
derived colors
effects
metadata
```

must be preserved according to the existing theme model.

Do not duplicate Base16 parsing logic in the profile system.

---

# 13. UI Appearance

The profile should include appearance configuration that is already represented by the existing theme/settings system.

This includes, where applicable:

- Colors
- Glow
- Border radius
- Theme
- Visualizer appearance
- Other existing configurable appearance settings

Do not invent new appearance properties merely for the profile system.

If typography configuration is desired later, it should be added as a separate explicit feature because the current application does not currently expose typography as a user setting.

---

# 14. Visualizer

Visualizer configuration is profile data.

The profile should preserve the user's visualizer configuration so that activating a Friend Lique reproduces the friend's visualizer setup.

This includes the existing visualizer settings that are actually intended to be user/profile configuration.

Device-specific rendering/performance settings must remain device state where appropriate.

The implementation must distinguish:

```text
Visualizer appearance/behavior
```

from:

```text
Device rendering/performance configuration
```

---

# 15. Playlists

Playlists are profile data.

A Friend Lique should be able to contain the friend's playlists.

The existing playlist structure should be reused.

Playlist references to media must continue to work when a Friend Lique is loaded.

The implementation must account for the fact that media IDs are currently local IDs.

Existing `mediaIdentity()` and `planImport()` logic should be reused for copying/merging data between scopes.

---

# 16. Categories

Categories are profile data.

A Friend Lique should contain the friend's categories.

Categories must remain associated with the friend's profile while the Friend Lique is active.

They must not be written into the user's own profile.

---

# 17. Media and Stream URLs

User-added media/stream records are profile data.

A Friend Lique should be able to contain the friend's shareable stream sources.

The profile may contain:

```text
sourceUrl
streamUrl
provider
title
metadata
category
```

according to the existing `MediaItem` structure.

---

# 18. Stream Privacy

> **Decided (D13) / implemented (Checkpoint 4):** `sanitizeForSharing()` (`src/services/profile/sharing.ts`) detects credentials in URLs (user:password@, token/key/auth/sig-style parameters, signed cloud-storage and CDN URLs, JWTs). Nothing is modified silently: the user chooses per item to exclude it from the shared copy, share it anyway, or cancel. The local original is never changed.

A stream URL must never be assumed safe simply because it is an HTTP(S) URL.

Before a profile is uploaded or shared, the system must sanitize data that may contain credentials.

Potential sensitive URL components include:

```text
username/password in URL authority
token
key
sig
auth
access token
other credential-like query parameters
```

The sharing pipeline should therefore conceptually be:

```text
Local Profile
      ↓
Sharing Sanitizer
      ↓
Validated Shareable Profile
      ↓
Cloud / Friend / Pack
```

Never rely solely on the UI to hide secrets.

---

# 19. Per-Item Visibility

> **Decided (D12):** not part of the first implementation.

The architecture should allow individual stream/media items to eventually have visibility such as:

```text
PUBLIC
FRIENDS
PRIVATE
```

This should be implemented only where supported by the existing media model.

The initial profile implementation may establish the data model without exposing every visibility control in the UI immediately.

---

# 20. Favorites

Favorites are currently user state and may be useful as part of a Friend Lique.

However, the exact behavior needs to be defined carefully.

Initial proposal:

```text
Friend Lique
    ✓ favorites
```

When a Friend Lique is active, the viewer may see the friend's favorite items as part of the friend's environment.

The viewer must not be able to modify the friend's cloud profile.

If the viewer favorites/unfavorites something while the Friend Lique is active, that action must either:

1. Be disabled for friend-owned profile data, or
2. Apply only to the viewer's own favorites.

The implementation should prefer option 2 where it can be made intuitive.

---

# 21. Stations

The current application stores favorited radio station records separately from the general radio directory.

Friend Lique support should preserve the station data required to reproduce the friend's profile.

The existing station/favorites relationship must be inspected during implementation.

Do not duplicate the Radio Browser directory into user profiles.

A profile should contain only the user's relevant saved/favorited station information.

---

# 22. Friend Profiles Are Read-Only

When a Friend Lique is active:

```text
OWN PROFILE
    = writable

FRIEND PROFILE
    = read-only
```

The viewer must never accidentally write modifications into the friend's profile.

This applies to:

- settings
- themes
- playlists
- categories
- media
- favorites
- stations
- other profile data

The storage layer should enforce this rather than relying only on UI disabling.

---

# 23. Active Profile

The application should have an explicit active-profile state.

Conceptually:

```text
activeProfile:
    kind: "own"
```

or:

```text
activeProfile:
    kind: "friend"
    userId: "..."
    revision: "..."
```

This state is NOT part of the profile itself.

It belongs to the current user's device/session state.

---

# 24. Profile Switching

Activating a Friend Lique should work conceptually like:

```text
Own Profile
    ↓
Flush pending local writes
    ↓
Load / validate friend profile
    ↓
Cache friend profile locally
    ↓
Switch active profile
    ↓
Hydrate profile-scoped stores
    ↓
Apply appearance
    ↓
Render Friend Lique
```

Returning:

```text
Friend Profile
    ↓
Discard friend-scoped modifications
    ↓
Switch to own profile
    ↓
Hydrate own profile
    ↓
Apply own appearance
    ↓
Restore own LiqueAmp
```

The user's own profile must remain untouched.

---

# 25. Profile Storage Scope

The existing application currently uses one IndexedDB database and global repositories.

The new architecture requires a concept of profile scope.

The exact physical IndexedDB implementation should be decided during implementation after reviewing the current storage layer.

Possible approaches include:

```text
ONE DATABASE
    profiles/scopes inside the database
```

or:

```text
SEPARATE DATABASES
    own database
    friend cache databases
```

Do NOT lock the implementation to either approach in this document.

The required behavior is more important than the physical representation:

> Every read/write operation must know which profile scope it belongs to.

---

# 26. Own Profile Scope

The current user's existing local LiqueAmp data should become the user's own profile scope.

Migration must preserve all existing data.

The current IndexedDB database should not be discarded or rebuilt from scratch.

---

# 27. Friend Profile Cache

Friend profiles should be cached locally after being fetched and validated.

The cache should:

- Be read-only
- Be associated with the friend's stable user ID
- Include profile revision information
- Be replaceable when a newer profile is fetched
- Be removable when friendship/access is removed

Cached friend profiles should never become the user's own profile.

---

# 28. Profile Revision

Every cloud profile should have a revision/version concept.

Example:

```text
revision: 42
```

When a friend updates their profile:

```text
revision 42
      ↓
revision 43
```

The client should know which revision it currently has cached.

This supports:

- stale-cache detection
- synchronization
- conflict handling
- future "updated" indicators

---

# 29. Cloud Sync

> **Decided (D9) / foundation implemented (Checkpoint 4):** `profile.meta` in MY_LIQUE holds `ownerUserId`, `baseRevision`, `dirty`, `lastSyncedAt`. The server owns the revision; local edits only set `dirty`. An upload only succeeds while the cloud is still at `baseRevision`; a download only replaces a local profile without unsynced changes; both changed = conflict, resolved explicitly by the user. No automatic full merge.

The own profile should eventually synchronize:

```text
Local Own Profile
        ↕
Cloud Own Profile
```

The system must not silently overwrite newer data.

If:

```text
LOCAL revision = 12
CLOUD revision = 14
```

the application must detect the conflict/staleness rather than blindly uploading revision 12 over revision 14.

---

# 30. Profile Serialization

The profile must be serializable to JSON-compatible data.

This enables:

```text
Cloud storage
Backup
Export
Import
Snapshots
Friend cache
Packs
```

Do not store functions, live browser objects, AudioNodes, DOM references, or other runtime-only objects in the profile.

---

# 31. Runtime State Must Stay Outside the Profile

Examples of data that should NOT be serialized into `LiqueAmpProfile`:

```text
AudioContext
AudioNodes
HTMLMediaElement
DOM references
React state
Zustand transient UI state
Timers
AbortControllers
Network connections
Presence sockets
```

Only persistent user configuration/content belongs in the profile.

---

# 32. Migration Requirements

Existing users must not lose data.

On upgrade:

```text
Existing IndexedDB
       ↓
Migration
       ↓
Own Profile
```

The application must continue to open existing LiqueAmp installations.

Existing backups must remain importable.

Existing theme versions must remain compatible with the current normalization system.

---

# 33. Backward Compatibility

Existing backup files must continue to be accepted.

The new profile model should not unnecessarily invalidate:

```text
liqueamp-backup
version 1
```

If the profile envelope requires a new format, maintain a migration/parser path for the existing backup format.

---

# 34. Profile Validation

All profile data received from:

- Cloud
- Friends
- Imports
- Packs

must be treated as untrusted input.

Use the existing validation infrastructure.

Validation must happen before data enters active application state.

Conceptually:

```text
External Profile
      ↓
Parse
      ↓
Validate
      ↓
Sanitize
      ↓
Store
      ↓
Hydrate
```

Never:

```text
External Profile
      ↓
Directly into Zustand/UI
```

---

# 35. Profile Size

Friend profiles will eventually be fetched automatically or semi-automatically.

The implementation should establish a reasonable profile-size limit.

Do not automatically use the existing 50 MB backup limit as the friend-profile limit.

Friend profile payloads should be significantly smaller and predictable.

---

# 36. Profile Ownership

Every cloud profile belongs to exactly one account.

Example:

```text
Pelle
  owns
    ↓
Pelle Profile
```

Johan may have read access because Pelle has accepted Johan as a friend.

Johan does not become the owner.

---

# 37. Username Is Not Profile Identity

Never use:

```text
username
```

as the internal profile ownership key.

Use:

```text
user_id
```

instead.

This allows:

```text
Pelle
↓
changes username
↓
Pelle2
```

without moving or recreating the profile.

---

# 38. Profile Visibility

> **Decided (D12):** private by default; the one-way Friend Liques relationship grants read-only access; Block overrides; no PUBLIC profiles yet.

The profile-level visibility model should support:

```text
PRIVATE
FRIENDS
PUBLIC
```

Friend access must additionally respect the friendship relationship.

Blocked users must never receive profile access even if another rule would otherwise allow it.

---

# 39. Future LiqueAmp Packs

A LiqueAmp Pack should eventually be a serialized subset of a profile.

Example:

```text
LiqueAmp Pack
├── theme
├── visualizer settings
├── selected playlists
├── selected categories
└── selected shareable streams
```

Packs should reuse the same profile data structures and existing import planning.

Do not build Packs as a completely separate serialization format unless a real requirement appears.

---

# 40. Future Snapshots

Snapshots should store a version of the user's profile at a point in time.

A snapshot should be restorable using the same validation/import machinery as profile restoration.

---

# 41. Decision Log

The following decisions remain intentionally open until implementation planning:

### D1 — Physical IndexedDB scope model

Choose between:

- One database with profile scopes
- Separate databases per scope
- Another implementation that provides equivalent isolation

### D2 — Exact profile settings

Confirm which existing `Settings` fields are profile state versus device state.

### D3 — Favorites behavior while viewing Friend Lique

Determine whether actions apply to the viewer's own favorites or are disabled.

### D4 — Station representation

Determine the minimum station data required to reproduce a friend's saved station environment without duplicating the Radio Browser directory.

### D5 — Per-item visibility

Determine whether media visibility belongs in the first implementation or a later privacy phase.

### D6 — History

Keep history out of Friend Liques in the initial implementation.

### D7 — Queue

Keep queue out of Friend Liques in the initial implementation.

### D8 — Typography

Do not add typography configuration solely for this project. Revisit separately if LiqueAmp later gains user-configurable fonts.

---

# 42. Required Implementation Checks

Before implementation is considered complete, verify:

## Profile integrity

- Existing local data survives migration.
- A profile can be serialized and restored.
- Existing backups still import.
- Custom themes survive profile switching.
- Playlists retain their media references.
- Categories survive switching.
- Stream URLs survive switching.

## Friend isolation

- Activating a friend never modifies the own profile.
- Theme changes while viewing a friend do not modify the own profile.
- Playlist changes cannot modify the friend's cloud profile.
- Favorites cannot modify the friend's cloud profile.
- History remains personal.
- Queue remains personal.

## Switching

Test:

```text
Own
→ Friend A
→ Own
→ Friend B
→ Own
```

and verify the own profile is unchanged after every cycle.

## Offline

Verify:

```text
No account
→ LiqueAmp still works

Signed in
→ LiqueAmp still works offline

Friend previously cached
→ cached Friend Lique can be opened where privacy/access permits
```

## Security

Verify:

- Friend profiles are validated.
- Private profiles cannot be fetched by unauthorized users.
- Blocked users cannot access profiles.
- Credential-like URL data is removed before sharing.
- Client-side IDs cannot bypass server permissions.

---

# 43. Definition of Done for the Profile Foundation

The profile foundation is ready for the Friends implementation when:

1. Existing LiqueAmp state has a canonical serializable profile representation.
2. Profile and device settings are separated.
3. Profile-scoped storage exists.
4. Friend/profile data can be loaded read-only.
5. Own data cannot be modified by friend-scoped writes.
6. Existing backups remain compatible.
7. Profile validation is enforced.
8. Profile switching works locally without a backend.
9. Tests prove that switching to a friend and returning to the own profile preserves the own profile.
10. The architecture is ready for cloud synchronization.

Only after these conditions are satisfied should Account, Friends and Friend Liques be connected to the backend.
