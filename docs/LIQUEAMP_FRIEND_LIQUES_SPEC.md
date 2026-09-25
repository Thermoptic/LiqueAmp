# LIQUEAMP FRIEND LIQUES SPECIFICATION

**Status:** Planning / Architecture  
**Project:** LiqueAmp  
**Depends on:**  
- `LIQUEAMP_SOCIAL_ARCHITECTURE.md`
- `LIQUEAMP_SOCIAL_IMPLEMENTATION_ANALYSIS.md`
- `LIQUEAMP_PROFILE_SPEC.md`


> **Locked product behaviour (2026-09-25, after the Checkpoint 4 analysis).**
> Where this specification differs, the decisions D10–D12 and D17 in
> `docs/LIQUEAMP_IMPLEMENTATION_PLAN.md` §30 apply:
> - FRIEND LIQUES replaces Quick Actions on Home (Checkpoint 3 freed the `.area-actions` slot).
> - An **Add Friend icon sits in the top-right** of the Friend Liques panel. The user enters a username; the person is added **immediately**: no request, no accept/decline (D17).
> - Relationships are **one-way**: when A adds B, A gains read-only access to B's Lique; B does not gain access to A's (D12). Remove Friend removes the person from the viewer's list only. Block is stronger and prevents the blocked user from accessing the blocker's Lique; blocking overrides normal access.
> - List rows: `● @alice  Online  [ ▶ ]` / `○ @bob  Offline  [ ▶ ]`; the ▶ button activates that person's Lique. Only one Friend Lique is active at a time; while one is active: `[ RETURN TO MY LIQUE ]`.
> - No avatars; the username is the visual identity (D10). Online = LiqueAmp is open, offline = not (D11). Offline friends' cached Liques can still be activated.
> - A Friend Lique is read-only; queue and history stay personal (unchanged).

---

# 1. Purpose

This document defines the user-facing and technical behavior of **Friend Liques**.

Friend Liques replace the existing **Quick Actions** section on the LiqueAmp Home screen.

A Friend Lique represents a friend's LiqueAmp environment and provides a controlled way to:

- Discover friends
- See online/offline status
- View a friend's LiqueAmp profile
- Activate a friend's Lique
- Temporarily use their profile
- Return to the user's own Lique
- Cache friend profiles safely
- Respect friendship and privacy permissions

The Friend Liques system must never overwrite the user's own profile or modify a friend's cloud profile.

---

# 2. Naming

The Home section must be called:

```text
FRIEND LIQUES
```

Do not call the Home section:

```text
Friends
Friend List
Friend Profiles
Social
Quick Actions
```

The term **Friend Lique** refers specifically to the LiqueAmp environment/profile belonging to a friend.

---

# 3. Quick Actions Replacement

The existing:

```text
QUICK ACTIONS
```

section must be removed from the Home layout and replaced by:

```text
FRIEND LIQUES
```

However, Quick Actions must not simply be deleted before its unique functionality has been relocated.

The current analysis shows that Quick Actions is currently the only UI location for several radio actions.

Before removing it, move or expose these actions elsewhere:

- Add to queue
- Add to playlist
- Share
- Copy stream URL
- Open homepage
- Any other action that currently has no equivalent UI

The new locations may include:

- Station row menus
- Media row menus
- Station information panel
- Now Playing menu
- Context menus

The implementation should choose the most natural location based on the existing UI.

After those actions are safely relocated, the Quick Actions panel can be removed.

---

# 4. Home Layout

The existing `.area-actions` layout slot may be reused for Friend Liques.

Conceptually:

```text
CURRENT

.area-actions
    ↓
QuickActionsPanel


NEW

.area-actions
    ↓
FriendLiquesPanel
```

The existing LiqueAmp visual language must be preserved.

Do not redesign the entire Home screen solely for Friends.

---

# 5. Friend Liques Panel

Create a dedicated component conceptually called:

```text
FriendLiquesPanel
```

It should occupy the same general Home-screen role previously occupied by Quick Actions.

The panel should provide:

- Friend list
- Online/offline status
- Active Friend Lique indication
- Friend selection
- Friend profile preview
- Activate action
- Return-to-own action when applicable
- Empty state
- Add Friend entry point

---

# 6. Friend List

> **Obsolete wording (D17):** there is no "accepted" state. Everyone the user has added appears in the list. When A adds B, A gains read-only access to B's Lique; B gains nothing automatically (one-way, D12). There are no requests (D17).

Each accepted friend should appear in the Friend Liques list.

Example:

```text
FRIEND LIQUES

● THERMOPTIC
  ONLINE

● PELLE
  OFFLINE

● ANDERS
  ONLINE
```

The exact layout should follow the current LiqueAmp component system.

Use existing status-dot and row/list components where appropriate.

---

# 7. Friend Identity

> **Decided (D6, D10):** `@username` is shown; no avatars.

A Friend Lique entry should display enough information to distinguish users.

At minimum:

```text
display_name or username
online/offline status
```

Optional future information:

```text
avatar
currently active Lique
last updated
```

Do not display private account information.

---

# 8. Online / Offline Status

> **Decided (D11):** online = LiqueAmp is open right now; nothing else (no last-seen, no AWAY).

The initial presence model is:

```text
ONLINE
OFFLINE
```

Presence is separate from profile synchronization.

Presence must not be stored as part of `LiqueAmpProfile`.

Conceptually:

```text
Profile
    = persistent configuration

Presence
    = temporary account state
```

Future states such as:

```text
AWAY
```

may be added later but are not required for the first implementation.

---

# 9. Friend Requests

> **Superseded by D17:** there are no friend requests. Adding someone is immediate and one-way.

The Friends system must support:

```text
Search user
    ↓
Send friend request
    ↓
Pending
    ↓
Accept / Decline
```

Supported relationship states:

```text
PENDING
ACCEPTED
DECLINED
BLOCKED
```

A Friend Lique should only appear in the main Friend Liques list when the relationship is accepted.

---

# 10. Adding a Friend

> **Decided (D17):** the Add Friend icon is in the top-right of the panel. Entering a username and pressing Add Friend adds that person to the list at once; there is no "REQUEST SENT" state.

The user should be able to search by username.

Example:

```text
ADD FRIEND

[ Search username... ]

THERMOPTIC

[ ADD FRIEND ]
```

After sending:

```text
REQUEST SENT
```

The user should not immediately receive access to the friend's private profile.

Access begins only when the friendship and visibility rules permit it.

---

# 11. Incoming Requests

> **Superseded by D17:** there are no incoming requests.

The user should be able to see pending requests.

Example:

```text
FRIEND REQUESTS

Pelle
wants to add you

[ ACCEPT ] [ DECLINE ]
```

This functionality may live in `/control`, an Account section, a dialog, or another appropriate existing LiqueAmp control surface.

The Home Friend Liques panel should remain focused on actual friends and their Liques.

---

# 12. Friend Profile Preview

> **Foundation implemented (Checkpoint 4):** `summarizeProfile()` (`src/services/profile/summary.ts`) derives this preview: username, theme, visualizer, playlist/category/stream/station counts, revision.

Selecting a friend should show a compact preview.

Example:

```text
THERMOPTIC'S LIQUE

Theme
Catppuccin Mocha

Visualizer
Spectrum

Playlists
14

Categories
8

Streams
37

[ ACTIVATE LIQUE ]
```

The counts are informational.

They should be derived from the actual profile data.

Do not fetch the entire profile merely to display information that can safely be included in a lightweight profile summary.

---

# 13. Friend Lique Activation

The main Friend Lique action is:

```text
ACTIVATE LIQUE
```

When activated, the user's own profile must be protected.

Conceptually:

```text
OWN LIQUE
   │
   │ save/flush
   ▼
OWN PROFILE REMAINS SAFE
   │
   ▼
LOAD FRIEND PROFILE
   │
   ▼
VALIDATE
   │
   ▼
ACTIVATE FRIEND LIQUE
```

The friend profile becomes the active profile for profile-scoped content.

---

# 14. What Activation Changes

Activating a Friend Lique should change profile-scoped LiqueAmp content such as:

- Theme
- Custom theme
- Visualizer configuration
- Profile UI configuration
- Playlists
- Categories
- Shareable media/streams
- Profile favorites where supported
- Other explicitly profile-scoped content

The exact fields are defined by `LIQUEAMP_PROFILE_SPEC.md`.

---

# 15. What Activation Does NOT Change

Activating a Friend Lique must NOT replace the user's personal/device session state.

At minimum:

```text
Queue
History
AudioContext
Current runtime engine state
Device performance configuration
Device-specific rendering settings
Temporary UI state
```

must remain outside the Friend Lique.

The user should not suddenly lose their own listening history because they activated a friend's Lique.

---

# 16. Device Settings

Device-specific settings must remain tied to the user's device.

For example, activating a friend should not automatically:

```text
change device volume
enable/disable reduced motion
change hardware rendering configuration
change device performance limits
```

This separation must be enforced by the profile/device state architecture.

---

# 17. Read-Only Friend Mode

While a Friend Lique is active:

```text
FRIEND PROFILE
    = READ ONLY
```

The UI should communicate this when appropriate.

The viewer may use the friend's environment but does not own it.

The viewer must never be able to accidentally save changes to the friend's cloud profile.

---

# 18. User Actions While Friend Lique Is Active

Some actions may still be meaningful to the viewer.

For example:

```text
Play a stream
Add a stream to my queue
Listen to a playlist
Favourite something for myself
```

These should affect the viewer's personal/session state where appropriate.

They must not mutate the friend's profile.

Therefore the implementation should distinguish:

```text
READ FRIEND DATA
```

from:

```text
WRITE OWN DATA
```

even while the Friend Lique is active.

---

# 19. Example: Favourite

If the viewer activates Pelle's Lique and favourites a station:

```text
Pelle's station
      ↓
Johan favourites it
      ↓
Johan's favourites
```

NOT:

```text
Pelle's station
      ↓
Pelle's favourites
```

This behavior should be consistent and intuitive.

---

# 20. Active Friend Indicator

When a Friend Lique is active, LiqueAmp should clearly indicate that the user is viewing another person's Lique.

Example:

```text
ACTIVE LIQUE
THERMOPTIC
```

or:

```text
FRIEND LIQUE
THERMOPTIC
```

A persistent but unobtrusive indicator should exist.

The user should never be unsure whether they are currently using their own profile or a Friend Lique.

---

# 21. Return to Own Lique

When a Friend Lique is active, the primary exit action should be something similar to:

```text
RETURN TO MY LIQUE
```

This should:

1. Stop using the friend profile scope.
2. Discard any friend-scoped changes.
3. Restore the user's own profile scope.
4. Rehydrate the user's own profile state.
5. Reapply the user's own theme.
6. Restore the user's own playlists/categories/media environment.
7. Leave personal session state intact where specified.

---

# 22. Switching Multiple Friends

The system should support:

```text
Own
 ↓
Friend A
 ↓
Friend B
 ↓
Own
```

It must NOT require:

```text
Own
 ↓
Friend A
 ↓
Own
 ↓
Friend B
```

as a prerequisite.

Switching directly between friends should be possible if the architecture permits it.

Each friend remains isolated.

---

# 23. Profile Scope Model

The Friend Lique system depends on the profile scope defined in:

`LIQUEAMP_PROFILE_SPEC.md`

The exact physical storage strategy remains open.

The important requirement is:

```text
Own Scope
Friend A Scope
Friend B Scope
Friend C Scope
```

must be logically isolated.

A write intended for one scope must never modify another.

---

# 24. Friend Profile Cache

Once a friend profile is retrieved and validated, it may be cached locally.

The cache should contain:

```text
friend user_id
profile revision
profile data
last fetched timestamp
```

The cache must be read-only from the perspective of the viewer.

---

# 25. Cache Updates

If the friend's cloud profile has a newer revision:

```text
Cached revision 12
Cloud revision 13
```

the client should fetch and validate revision 13.

It should then replace the cached friend profile.

The system should not silently use stale data when a newer profile is available and reachable.

Offline behavior may use the last validated cached revision.

---

# 26. Offline Friend Liques

LiqueAmp remains local-first.

If the user is offline:

```text
Previously cached Friend Lique
        ↓
May remain viewable
```

subject to privacy/access rules.

A friend profile that has never been fetched cannot be loaded while offline.

The UI should distinguish:

```text
AVAILABLE FROM CACHE
```

from:

```text
NOT AVAILABLE OFFLINE
```

where useful.

---

# 27. Friend Removal

When a friendship is removed:

```text
Friendship
    ↓
REMOVED
```

The friend's local cached profile should eventually be removed.

The application must also ensure that the user can no longer access new versions of that friend's profile.

If the friend is currently active:

```text
Friend removed
     ↓
Return to My Lique
```

The user's own profile should become active automatically.

---

# 28. Blocking

Blocking a user must remove their access to the user's profile and remove their Friend Lique from the blocker's friend experience.

Server-side permissions must enforce blocking.

Client-side UI hiding is not sufficient.

---

# 29. Privacy

> **Decided (D12):** private by default; access through the one-way Friend Liques relationship only, read-only; Block overrides. No per-item visibility in the first implementation. Direction (D12, locked 2026-09-25): the person who adds gains read-only access to the person they add.

Friend Liques must respect:

```text
Profile visibility
Friendship status
Block status
Per-item visibility
```

A friend does not automatically have unrestricted access to everything.

The server must be authoritative.

---

# 30. Profile Preview vs Full Profile

The architecture should distinguish between:

```text
Friend Summary
```

and:

```text
Full Friend Profile
```

A summary can contain:

```text
username
display name
avatar
online state
theme name
visualizer name
playlist count
category count
stream count
profile revision
```

The full profile contains the actual profile data needed to activate the Lique.

This reduces unnecessary data transfer.

---

# 31. Friend Lique Activation UX

Suggested flow:

```text
FRIEND LIQUES

● THERMOPTIC
  ONLINE

● PELLE
  OFFLINE
```

Click friend:

```text
PELLE'S LIQUE

Theme        Tokyo Night
Visualizer   Waveform
Playlists    12
Streams      41

[ ACTIVATE LIQUE ]
```

After activation:

```text
FRIEND LIQUE ACTIVE

PELLE

[ RETURN TO MY LIQUE ]
```

The exact UI is flexible, but the flow should remain simple.

---

# 32. Empty State

If the user has no friends:

```text
FRIEND LIQUES

NO FRIEND LIQUES YET

Add friends to explore their
LiqueAmp environments.

[ ADD FRIEND ]
```

Do not leave an empty blank panel.

---

# 33. Loading State

When Friend Liques are being retrieved:

```text
FRIEND LIQUES

LOADING...
```

The UI should avoid blocking the entire LiqueAmp application.

Friend functionality is an enhancement, not a requirement for local playback.

---

# 34. Error State

If the cloud cannot be reached:

```text
FRIEND LIQUES

Unable to reach LiqueAmp server.

Cached Friend Liques may still be available.
```

The main application must continue working.

---

# 35. Friend Lique Data Security

All remote profile data is untrusted.

Before activation:

```text
Cloud Friend Profile
        ↓
Parse
        ↓
Validate
        ↓
Sanitize
        ↓
Cache
        ↓
Activate
```

Do not bypass the existing validation system.

---

# 36. Stream URL Security

Friend Liques may contain user-provided URLs.

Before displaying or loading them, use the sharing/security rules from `LIQUEAMP_PROFILE_SPEC.md`.

Do not expose or propagate:

- passwords
- tokens
- private keys
- authentication credentials

---

# 37. Presence Security

Online status is a form of presence information.

The implementation should respect privacy settings for presence.

A future setting may allow:

```text
Show me as online
```

or:

```text
Appear offline
```

The initial system may keep presence simple, but the architecture must not assume that presence is always public.

---

# 38. Friend Lique and Playlists

A Friend Lique should make the friend's playlists available for browsing.

The viewer should be able to listen to them.

If the viewer wants to keep a playlist permanently, a future feature may allow:

```text
SAVE TO MY LIQUE
```

This should create a copy in the viewer's profile.

It must never convert the friend-owned playlist into viewer-owned data silently.

---

# 39. Future Copy Actions

Future Friend Lique actions may include:

```text
Copy Playlist to My Lique
Copy Theme to My Lique
Copy Category to My Lique
Save Stream to My Lique
Install LiqueAmp Pack
```

These are explicitly copy/import operations.

They are different from activating a Friend Lique.

---

# 40. Activation vs Import

This distinction is critical.

### Activate Friend Lique

Temporarily views/uses the friend's profile.

```text
Friend Profile
    ↓
Active Profile
```

No ownership changes.

### Import / Copy

Copies selected data into the user's own profile.

```text
Friend Profile
    ↓
Validate
    ↓
Merge
    ↓
Own Profile
```

The existing `planImport()` and `applyImport()` mechanisms should be reused.

---

# 41. Friend Lique Does Not Duplicate Ownership

The friend remains the owner.

Example:

```text
Pelle
  owns
    ↓
Pelle Profile

Johan
  views/activates
    ↓
Pelle Profile
```

Activation is not cloning.

---

# 42. Control Panel Integration

The `/control` area should eventually contain account/friend management.

Possible sections:

```text
ACCOUNT
FRIENDS
PRIVACY
SYNC
```

Friend Liques on the Home screen should remain lightweight.

Detailed friend management belongs in Control.

---

# 43. Friend Management

> **Superseded in part by D17:** no accept/decline; management is Add Friend, Remove Friend and Block.

The Control interface should eventually allow:

- Search
- Add friend
- Accept request
- Decline request
- Remove friend
- Block user
- View friendship status
- View privacy/access status

---

# 44. Friend Liques Sorting

Initial sorting can use:

```text
Online first
then offline
```

Within each group:

```text
Display name / username alphabetically
```

Do not introduce complex social ranking.

Future options may include recently active or manually pinned friends.

---

# 45. Friend Pinning

A future enhancement may allow:

```text
PIN FRIEND
```

Pinned friends could appear first.

This is not required for the initial implementation.

---

# 46. Active Friend

Only one Friend Lique should be active at a time.

Possible states:

```text
No Friend Lique active
Friend A active
```

not:

```text
Friend A + Friend B simultaneously active
```

The active profile model should have one authoritative current value.

---

# 47. Reload Behavior

If the application reloads while a Friend Lique is active, the implementation must choose a safe deterministic behavior.

Recommended initial behavior:

```text
Reload
  ↓
Restore Own Lique
```

This avoids accidental long-lived friend mode.

If the implementation later persists Friend mode across reloads, it must explicitly validate that access is still permitted.

---

# 48. Account-less Mode

LiqueAmp must continue to work without an account.

Without authentication:

```text
Own local LiqueAmp
    ✓
Themes
    ✓
Playlists
    ✓
Streams
    ✓
Visualizer
    ✓
Backup
    ✓
Friend Liques
    ✗
Cloud sync
    ✗
```

The account/social system must not make basic LiqueAmp functionality dependent on a server.

---

# 49. Implementation Requirements

Before implementation:

1. Inspect current Home layout.
2. Identify every unique Quick Actions function.
3. Relocate those functions.
4. Implement profile-scoped storage.
5. Implement read-only friend scopes.
6. Implement account/auth.
7. Implement friendship relationships.
8. Implement Friend Liques panel.
9. Implement friend profile summary.
10. Implement full profile retrieval.
11. Implement activation.
12. Implement restoration.
13. Add isolation tests.
14. Remove Quick Actions only after replacement functionality is verified.

---

# 50. Acceptance Tests

The implementation should eventually pass scenarios such as:

## Test A — Own profile remains intact

```text
Johan owns Profile A
Activate Pelle
Return to Johan
```

Expected:

```text
Johan Profile A == unchanged
```

---

## Test B — Friend changes cannot write to friend

```text
Activate Pelle
Change profile-related UI setting
```

Expected:

```text
Pelle cloud profile == unchanged
```

The setting should either be disabled in friend mode or be treated as a viewer-local/device setting according to the profile/device split.

---

## Test C — Personal queue remains personal

```text
Johan queue = A
Activate Pelle
```

Expected:

```text
Johan queue = A
```

---

## Test D — Personal history remains personal

```text
Johan history = H
Activate Pelle
Listen to Pelle stream
Return to Johan
```

Expected:

```text
Johan history remains Johan-owned
```

---

## Test E — Friend switching

```text
Johan
→ Pelle
→ Anders
→ Johan
```

Expected:

```text
No profile corruption
No cross-profile writes
Johan restored exactly
```

---

## Test F — Offline cache

```text
Fetch Pelle profile
Go offline
Activate cached Pelle profile
```

Expected:

```text
Works if cache and permissions permit.
```

---

## Test G — Friend removal

```text
Activate Pelle
Remove Pelle
```

Expected:

```text
Return to Johan
Pelle removed from Friend Liques
Pelle cache invalidated/removed
```

---

## Test H — Unauthorized profile

Attempt to access a private/non-authorized profile.

Expected:

```text
Server denies access.
Client cannot bypass permission checks.
```

---

# 51. Definition of Done

> **Obsolete items (D17):** items 4–5 (friend requests, accepted friends) no longer apply. Instead: Add Friend by username adds immediately and one-way; Remove Friend and Block work.

Friend Liques are considered complete when:

1. Quick Actions has been safely replaced.
2. Friend Liques appears in the same Home role.
3. Users can search and add friends.
4. Friend requests work.
5. Accepted friends appear in Friend Liques.
6. Online/offline status is displayed.
7. Friend profile summaries work.
8. Friend profiles are validated before activation.
9. Friend profiles are read-only.
10. Friend Liques can be activated.
11. Users can return to their own Lique.
12. Own profile data is never overwritten.
13. Queue and history remain personal.
14. Offline cached Friend Liques behave safely.
15. Privacy and blocking rules are enforced server-side.
16. Existing Quick Actions functionality remains available elsewhere.
17. Existing LiqueAmp functionality continues to work without an account.
18. Automated tests verify profile isolation and switching.

---

# 52. Future Extensions

The architecture should leave room for:

- Public profiles
- Profile sharing
- LiqueAmp Packs
- Snapshots
- Copy playlist
- Copy theme
- Copy streams
- Pinned friends
- Presence privacy
- "Currently listening"
- Friend activity
- Shared playlists
- Collaborative LiqueAmp environments

These should not be implemented merely because the architecture supports them.

Build the core Friend Lique experience first.
