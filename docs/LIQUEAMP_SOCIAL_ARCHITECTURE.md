# LIQUEAMP SOCIAL ARCHITECTURE

**Status:** Planning / Architecture
**Project:** LiqueAmp
**Purpose:** Account, Profiles, Friend Liques, Profile Switching, Sharing and Cloud Architecture

---

## 1. Overview

LiqueAmp should gain a user/profile system that allows users to have their own complete LiqueAmp environment and optionally share that environment with friends.

The core concept is that a user's LiqueAmp configuration should be treated as a **portable profile**.

A profile contains the complete user-created LiqueAmp experience, including configuration, appearance, visualizer configuration, playlists, categories and user-added stream sources.

The system should allow one user to add another user as a friend and temporarily activate that friend's LiqueAmp profile.

When a Friend Lique is activated, LiqueAmp should behave as if the user had loaded that person's complete LiqueAmp configuration.

When the Friend Lique is deactivated, the user's own profile should be restored exactly as it was before activation.

The user's own data must never be overwritten by activating another user's profile.

---

# 2. Terminology

## 2.1 User

A LiqueAmp account.

Each user has:

* A stable internal `user_id`
* A unique `username`
* An optional display name
* An optional avatar
* A personal LiqueAmp profile

The username is a human-readable identifier and should not be used as the permanent database identity.

---

## 2.2 LiqueAmp Profile

The complete state of a user's LiqueAmp environment.

A profile may contain:

* UI settings
* Theme
* Base16 theme
* Typography configuration
* Colors
* Glow effects
* Border radius / UI shape configuration
* Visualizer configuration
* Audio/player settings
* Playlists
* Categories
* User-added stream URLs
* Stream metadata
* Other user-customizable LiqueAmp configuration

The profile must be serializable.

The exact contents of the profile should be determined after inspecting the existing LiqueAmp architecture.

Do not duplicate existing configuration systems unnecessarily.

If LiqueAmp already has a content/configuration/state system capable of representing a piece of data, the new profile architecture should reuse it.

---

# 3. User Identity

Users should have a structure conceptually similar to:

```text
User
├── user_id
├── username
├── display_name
├── avatar
├── created_at
└── profile
```

### user_id

A stable internal identifier.

It must remain unchanged if the user changes their username.

### username

A unique human-readable identifier.

Example:

```text
thermoptic
```

Username changes must not require moving or renaming the user's underlying profile data.

---

# 4. Friend Liques

The existing **Quick Actions** section on the LiqueAmp Home screen should be removed and replaced by a new section called:

# FRIEND LIQUES

This is the primary Home-screen entry point for the user's friends.

Quick Actions should no longer exist as a separate Home section.

---

## 4.1 Purpose

Friend Liques is a list of people the current user has added as friends.

Each entry should communicate at minimum:

* Friend username/display name
* Online/offline status
* Whether their Friend Lique is currently active

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

The exact visual design should follow the existing LiqueAmp design language.

---

# 5. Friend vs Friend Lique

These concepts must remain separate.

## Friend

Represents the relationship between two users.

Example:

```text
Johan
  ↕
Pelle
```

## Friend Lique

Represents the LiqueAmp profile belonging to that friend.

Example:

```text
Pelle
  │
  └── Friend Lique
       ├── Theme
       ├── Visualizer
       ├── Playlists
       ├── Categories
       ├── Streams
       └── UI configuration
```

This distinction is important for future functionality.

---

# 6. Friend Relationships

Friends should not simply be stored as an array of usernames.

The architecture should support relationship states such as:

```text
PENDING
ACCEPTED
DECLINED
BLOCKED
```

At minimum the system should support:

* Search users by username
* Send friend request
* Accept friend request
* Decline friend request
* Remove friend
* Block user

The relationship should use stable `user_id` values rather than usernames.

---

# 7. Friend Lique Activation

The central feature of this system is Friend Lique activation.

A user should be able to select a friend and activate that friend's LiqueAmp profile.

Example:

```text
THERMOPTIC'S LIQUE

Theme        Catppuccin Mocha
Visualizer   Spectrum
Playlists    14
Streams      37

[ ACTIVATE LIQUE ]
```

When activated:

```text
CURRENT PROFILE
      ↓
SAVE LOCAL USER STATE
      ↓
LOAD FRIEND PROFILE
      ↓
FRIEND PROFILE BECOMES ACTIVE
```

LiqueAmp should now use the friend's profile as the active environment.

---

# 8. Profile Switching

Profile switching must NOT overwrite the user's profile.

The system should conceptually maintain:

```text
OWN PROFILE
FRIEND PROFILE
ACTIVE PROFILE
```

For example:

```text
Own Profile
    ↓
Johan

Friend Profile
    ↓
Pelle

Active Profile
    ↓
Pelle
```

When Pelle's Friend Lique is deactivated:

```text
Active Profile
    ↓
Johan
```

The user's original profile must be restored.

---

# 9. Active Profile State

LiqueAmp should have a clear concept of:

```text
activeProfile
```

Possible states:

```text
OWN
FRIEND
```

Potentially later:

```text
SNAPSHOT
PACK
```

The active profile should determine which configuration LiqueAmp currently renders and uses.

---

# 10. Local and Cloud State

LiqueAmp should remain capable of functioning offline.

The architecture should therefore distinguish between:

```text
LOCAL STATE
CLOUD STATE
```

Conceptually:

```text
                 LIQUEAMP
                    │
          ┌─────────┴─────────┐
          │                   │
     LOCAL STATE          CLOUD STATE
          │                   │
      IndexedDB          User Profile
          │              Friend Profiles
          │              Relationships
          │
          └────── Active Profile
```

The exact storage technology should be determined after inspecting the current project.

Do not introduce a new storage layer if an existing system can safely be extended.

---

# 11. Cloud Synchronization

A user's own profile should eventually be synchronized to the server.

Conceptually:

```text
Local Profile
      ↕
Cloud Profile
```

The cloud profile becomes the user's persistent source of truth for cross-device access.

The local copy should allow LiqueAmp to continue functioning when offline.

Synchronization conflicts must be considered during implementation.

Do not silently overwrite newer user data.

---

# 12. Friend Profile Loading

When activating a Friend Lique:

```text
Friend Lique
      ↓
Cloud Profile
      ↓
Local Cache
      ↓
Active Profile
```

The system should cache friend profiles where appropriate so that previously loaded profiles can potentially be viewed even when temporarily offline.

However, privacy rules must still be respected.

---

# 13. Profile Visibility

The architecture should support profile visibility.

Possible values:

```text
PRIVATE
FRIENDS
PUBLIC
```

### PRIVATE

The profile is not accessible to other users.

### FRIENDS

Accepted friends may access the profile.

### PUBLIC

The profile may be exposed through public profile functionality.

The exact permissions should be implemented explicitly rather than assuming that every friend automatically receives access to every piece of data.

---

# 14. Stream Privacy

User-added stream URLs need individual consideration.

Normal shareable stream information may include:

```text
URL
SOURCE
TITLE
CATEGORY
ICON
METADATA
```

However, the system must never expose:

* Passwords
* OAuth tokens
* Refresh tokens
* Private API keys
* Authentication credentials
* Other secrets

A stream/source should eventually be able to specify visibility such as:

```text
PUBLIC
FRIENDS
PRIVATE
```

The profile system must never accidentally expose credentials simply because a profile is shared.

---

# 15. Profile Snapshots

The architecture should support profile snapshots.

A snapshot is a saved version of a user's LiqueAmp profile.

Example:

```text
THERMOPTIC

CURRENT

SNAPSHOTS
├── Main Setup
├── Night Setup
├── Party Setup
└── Retro Setup
```

Snapshots should allow:

* Save
* Restore
* Rename
* Delete
* Export

This functionality should be designed so that it can reuse the same serializable profile structure.

---

# 16. LiqueAmp Packs

The architecture should also allow a profile or selected subset of a profile to eventually be packaged as a shareable LiqueAmp Pack.

Example:

```text
LIQUEAMP PACK

PELLE'S NIGHT DRIVE

Theme       Tokyo Night
Visualizer  Waveform
Playlists   6
Streams     21

[ INSTALL ]
```

This should be considered a future extension of the Profile architecture.

The Profile system should therefore avoid creating a structure that only works for cloud accounts.

The same serializable representation should ideally support:

```text
Account Profile
Friend Lique
Snapshot
Backup
Export
Import
LiqueAmp Pack
```

---

# 17. Public Profiles

Future public profiles may have URLs such as:

```text
liqueamp.app/u/thermoptic
```

A public profile could expose:

* Username
* Display name
* Avatar
* Selected profile information
* Selected playlists
* Selected themes
* Selected visualizer
* Public LiqueAmp Packs

Public visibility must respect the user's privacy settings.

---

# 18. Online / Offline Status

Friend Liques should eventually display whether a friend is:

```text
ONLINE
OFFLINE
```

The architecture should not require constant communication merely to display basic profile information.

Presence should be designed separately from profile synchronization.

Potential future states:

```text
ONLINE
OFFLINE
AWAY
```

But the initial implementation should remain simple.

---

# 19. Security Principles

Never trust client-side user IDs, usernames or permissions.

The server must verify:

* User identity
* Friend relationships
* Profile access
* Profile visibility
* Ownership
* Write permissions

A client must never be able to simply request another user's private profile by changing a username or ID.

---

# 20. Ownership

A user owns their own profile.

A Friend Lique is a view/access mechanism, not a copy of ownership.

Example:

```text
Pelle
  owns
    ↓
Pelle Profile

Johan
  has permission to view
    ↓
Pelle Profile
```

Johan activating Pelle's Lique should never make Johan the owner of Pelle's data.

---

# 21. Important Architectural Principle

The Friend Lique system should NOT duplicate the entire LiqueAmp application state into unrelated structures.

Instead:

```text
ONE PROFILE MODEL
```

should be reusable everywhere.

Conceptually:

```text
LiqueAmpProfile
      │
      ├── Own Profile
      ├── Friend Lique
      ├── Snapshot
      ├── Backup
      ├── Import/Export
      └── LiqueAmp Pack
```

This is one of the most important architectural requirements.

---

# 22. Existing LiqueAmp Systems

Before implementation, inspect the current LiqueAmp codebase and identify all existing systems that contribute to the user's LiqueAmp state.

At minimum inspect:

* Existing settings system
* Existing local storage / IndexedDB
* Existing content system
* Content Pack
* Base16 implementation
* Theme system
* Visualizer settings
* Player settings
* Playlist system
* Category system
* Stream URL system
* Control Panel
* Import/export functionality
* Any existing authentication
* Any existing backend/cloud functionality
* Any existing Supabase integration

The new architecture should integrate with these systems rather than unnecessarily replacing them.

---

# 23. Do Not Implement Yet

This document is an architectural specification.

Before implementation:

1. Inspect the existing codebase.
2. Identify current state/configuration systems.
3. Identify conflicts with this architecture.
4. Identify systems that can be reused.
5. Identify systems that require refactoring.
6. Produce an implementation plan.
7. Only then begin implementation.

Do not immediately implement the entire system based solely on this document.

---

# 24. Required Initial Implementation Order

The eventual implementation should be approached in stages.

### Phase 1

Account and User Identity

```text
User
user_id
username
display_name
avatar
```

### Phase 2

LiqueAmp Profile Model

```text
LiqueAmpProfile
```

Convert/reuse existing LiqueAmp state so it can be serialized and restored.

### Phase 3

Cloud Persistence

```text
Local Profile
↕
Cloud Profile
```

### Phase 4

Friend Relationships

```text
Search
Add
Accept
Decline
Remove
Block
```

### Phase 5

Friend Liques

Replace:

```text
QUICK ACTIONS
```

with:

```text
FRIEND LIQUES
```

on the Home screen.

### Phase 6

Friend Profile Viewing

Allow users to inspect a friend's LiqueAmp profile.

### Phase 7

Friend Lique Activation

Allow users to temporarily activate a friend's complete LiqueAmp profile.

### Phase 8

Profile Restoration

Restore the user's own profile exactly as it was before activation.

### Phase 9

Privacy and Sharing

Implement profile and stream visibility.

### Phase 10

Snapshots / Backup / Import / Export

Reuse the profile model.

### Phase 11

LiqueAmp Packs

Create shareable profile/configuration packages.

### Phase 12

Public Profiles

Optional future social functionality.

---

# 25. First Claude Task

After this document has been added to the repository, Claude should NOT immediately implement the system.

The first task is analysis.

Claude should:

1. Read this document completely.
2. Inspect the entire current LiqueAmp architecture relevant to user state.
3. Locate the existing Quick Actions Home section.
4. Locate all existing settings/configuration/state systems.
5. Locate the Base16 implementation.
6. Locate playlists and categories.
7. Locate stream URL storage.
8. Locate visualizer configuration.
9. Locate local persistence.
10. Locate any existing backend/cloud functionality.
11. Determine whether an authentication system already exists.
12. Determine which parts of the proposed Profile model already exist.
13. Identify architectural conflicts.
14. Identify code that can be reused.
15. Identify code that should be refactored.
16. Do not implement the new Account/Friends system yet.

Claude should produce a concrete implementation plan based on the actual repository.

The implementation plan should explicitly state:

```text
EXISTING
What already exists.

REUSABLE
What can be reused directly.

REFACTOR
What needs restructuring.

NEW
What needs to be built.

RISKS
Potential problems.

DEPENDENCIES
What must be implemented first.

MIGRATION
How existing user data will be preserved.
```

The goal is to make the new social/profile architecture fit naturally into the existing LiqueAmp codebase rather than building a parallel system beside it.
