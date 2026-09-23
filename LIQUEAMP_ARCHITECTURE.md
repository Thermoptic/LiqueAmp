
# LIQUEAMP — Architecture Specification

Version: 1.0  
Status: Active Development

This document defines the technical architecture of LIQUEAMP.

`LIQUEAMP_SPEC.md` defines what LIQUEAMP is and what the product should do.

This document defines how the application should be structured internally.

The architecture MUST be designed so that LIQUEAMP can grow without requiring
the entire application to be rewritten when new providers, visualizers,
storage methods or features are introduced.

---

# 1. Architecture Principles

LIQUEAMP MUST follow these principles:

1. Separation of concerns
2. Strong typing
3. Modular architecture
4. Provider independence
5. Persistent application state
6. Centralized playback
7. UI independent of provider implementation
8. Configuration-driven content where appropriate
9. No fake functionality
10. Future extensibility

The UI must never contain provider-specific playback logic directly.

The UI communicates with application services and state.

Application services communicate with provider adapters.

Provider adapters communicate with external services or browser playback
mechanisms.

---

# 2. High-Level Architecture

The application should follow this general architecture:

```text
                         LIQUEAMP
                            ¦
             +-----------------------------+
             ¦                             ¦
          MAIN UI                       /control
             ¦                             ¦
             +-----------------------------+
                            ¦
                       APPLICATION
                          STATE
                            ¦
        +-------------------+-------------------+
        ¦                   ¦                   ¦
   PLAYBACK ENGINE      CONTENT STORE       SETTINGS
        ¦                   ¦                   ¦
        ¦             +-----------+             ¦
        ¦             ¦           ¦             ¦
        ¦          Library     Playlists       Themes
        ¦          Favorites   History         Visualizers
        ¦          Categories  Queue           Preferences
        ¦
   PROVIDER LAYER
        ¦
   +----+---------------------------------+
   ¦    ¦    ¦        ¦        ¦          ¦
 Direct Radio YouTube YouTube  Spotify  SoundCloud
 Stream        Music
````

The exact implementation may differ where technically necessary, but the
separation of responsibilities must remain intact.

---

# 3. Application Layers

LIQUEAMP should be divided into the following conceptual layers:

```text
Presentation Layer
        ?
Application State / Stores
        ?
Application Services
        ?
Playback Engine / Provider Layer
        ?
External APIs / Browser APIs / Streams
```

Each layer has a defined responsibility.

---

# 4. Presentation Layer

The presentation layer contains:

* Dashboard
* Navigation
* Now Playing
* Radio Browser
* Library
* Playlists
* Favorites
* History
* Queue
* Search
* Station Information
* Quick Actions
* Audio Controls
* Visualizer
* Appearance Controls
* Settings
* Control Panel UI

The presentation layer MUST NOT directly implement:

* Spotify playback logic
* YouTube extraction
* radio stream parsing
* persistence logic
* playlist database logic
* provider authentication
* audio decoding
* theme file parsing

Those responsibilities belong elsewhere.

Components should consume application state and call application actions.

---

# 5. Application State

LIQUEAMP requires centralized application state.

The exact state-management library may be selected based on the existing
project architecture, but the state model should remain conceptually
similar to the following:

```ts
interface AppState {
  playback: PlaybackState;
  library: LibraryState;
  queue: QueueState;
  playlists: PlaylistState;
  favorites: FavoritesState;
  history: HistoryState;
  radio: RadioState;
  settings: SettingsState;
  themes: ThemeState;
  visualizers: VisualizerState;
  providers: ProviderState;
}
```

The UI should subscribe only to the state it needs.

A change to playback time should NOT cause the entire application to
re-render unnecessarily.

---

# 6. Playback State

Playback is one of the most important parts of the architecture.

A conceptual playback state:

```ts
interface PlaybackState {
  currentItem: MediaItem | null;

  queueIndex: number;

  isPlaying: boolean;
  isLoading: boolean;

  currentTime: number;
  duration: number;

  volume: number;
  muted: boolean;

  shuffle: boolean;

  repeatMode: "off" | "all" | "one";

  playbackStatus:
    | "idle"
    | "loading"
    | "playing"
    | "paused"
    | "buffering"
    | "error";

  provider: string | null;

  visualizer: string | null;

  error: PlaybackError | null;
}
```

The actual implementation may expand this model.

---

# 7. Playback Engine

LIQUEAMP MUST have one centralized playback engine.

The playback engine is responsible for:

* Loading media
* Starting playback
* Pausing
* Resuming
* Stopping
* Seeking
* Volume
* Muting
* Previous
* Next
* Shuffle
* Repeat
* Queue transitions
* Playback errors
* Buffering state
* Provider lifecycle
* Media Session integration

The UI must never create independent audio players for different components.

There should be one logical global playback session.

---

# 8. Persistent Playback

Changing sections of the application must NOT restart playback.

For example:

```text
User plays radio
        ?
Opens Library
        ?
Opens Playlist
        ?
Opens Settings
        ?
Playback continues
```

The playback engine must exist independently from individual UI views.

The audio element or provider session must not be unnecessarily destroyed and
recreated when React components mount or unmount.

---

# 9. MediaItem

All playable content should use a normalized media representation.

Example:

```ts
interface MediaItem {
  id: string;

  title: string;
  artist?: string;
  album?: string;

  artwork?: string;

  provider: MediaProviderType;

  sourceUrl: string;

  playbackType:
    | "audio"
    | "radio"
    | "youtube"
    | "youtube-music"
    | "spotify"
    | "soundcloud"
    | "embed";

  streamUrl?: string;

  description?: string;

  duration?: number;

  categoryId?: string;

  tags: string[];

  favorite: boolean;

  enabled: boolean;

  metadata?: Record<string, unknown>;

  createdAt: string;
  updatedAt: string;
}
```

The model may be extended when required.

Provider-specific metadata should not pollute the common model unnecessarily.

Provider-specific information should live inside `metadata` or a dedicated
provider data structure.

---

# 10. Media Provider Architecture

LIQUEAMP must use an adapter-based provider architecture.

Conceptually:

```ts
interface MediaProvider {
  id: string;

  name: string;

  validate(url: string): Promise<ValidationResult>;

  resolve(url: string): Promise<MediaItem | MediaItem[]>;

  getMetadata(
    item: MediaItem
  ): Promise<MediaMetadata>;

  getArtwork(
    item: MediaItem
  ): Promise<string | undefined>;

  getPlaybackMode(
    item: MediaItem
  ): PlaybackMode;

  getCapabilities(): ProviderCapabilities;
}
```

Providers should be replaceable.

The application should not need to know the internal implementation of a
provider.

---

# 11. Initial Providers

The architecture should support:

```text
DirectStreamProvider
RadioProvider
YouTubeProvider
YouTubeMusicProvider
SpotifyProvider
SoundCloudProvider
```

Additional providers should be possible later without modifying the core
playback architecture.

---

# 12. Provider Capabilities

Providers do not necessarily support the same functionality.

Capabilities should be explicitly represented.

Example:

```ts
interface ProviderCapabilities {
  playback: boolean;
  seeking: boolean;
  volumeControl: boolean;
  metadata: boolean;
  artwork: boolean;
  queue: boolean;
  favorites: boolean;
  rawAudioAccess: boolean;
  visualizerCompatible: boolean;
}
```

This prevents the UI from pretending that every provider supports every
feature.

For example, if a provider does not expose raw audio data to the browser,
LIQUEAMP must not pretend that full Web Audio processing is available.

---

# 13. Provider Restrictions

LIQUEAMP must respect provider rules and technical limitations.

The application MUST NOT:

* bypass DRM
* bypass authentication
* scrape protected streams
* extract protected audio from services that prohibit it
* circumvent provider restrictions
* pretend that unsupported playback works

Official APIs, SDKs, embeds and supported browser playback mechanisms should
be used where applicable.

If a provider requires authentication, the UI should clearly communicate:

```text
AUTHENTICATION REQUIRED
```

rather than presenting a fake working player.

---

# 14. Direct Streams

Direct streams are a first-class media type.

Where supported by the browser, LIQUEAMP should handle common formats such as:

```text
MP3
AAC
OGG
Opus
M3U
M3U8
PLS
```

The implementation must detect whether a URL is:

* direct audio
* radio stream
* playlist
* provider URL
* unsupported URL

The URL importer should attempt to determine the correct provider
automatically.

---

# 15. URL Import Pipeline

When the user adds a URL, the application should follow this conceptual
pipeline:

```text
URL entered
    ?
Normalize URL
    ?
Detect provider
    ?
Validate source
    ?
Resolve metadata
    ?
Determine playback mode
    ?
Create normalized MediaItem
    ?
Preview
    ?
User confirms
    ?
Save to library
```

Errors should be explicit.

Example:

```text
UNSUPPORTED SOURCE

This URL could not be resolved as a playable LIQUEAMP source.
```

Do not silently create broken library entries.

---

# 16. Library Architecture

The library should be based on normalized media objects.

Conceptually:

```text
Library
 +-- Categories
 ¦    +-- Lofi
 ¦    +-- Synthwave
 ¦    +-- Ambient
 ¦    +-- ...
 ¦
 +-- Media Items
 ¦
 +-- Radio Stations
 ¦
 +-- Favorites
 ¦
 +-- Playlists
```

A media item may belong to:

* one category
* multiple tags
* multiple playlists
* favorites
* history

These relationships should not require duplicating the media item itself.

---

# 17. Categories

Categories should be user-configurable.

A category should contain:

```ts
interface Category {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  sortOrder: number;
  enabled: boolean;
}
```

The user should be able to:

* Create
* Rename
* Delete
* Reorder
* Enable/disable
* Assign media

Categories should not be hard-coded into the UI.

---

# 18. Playlists

Playlists should be persistent entities.

```ts
interface Playlist {
  id: string;
  name: string;
  description?: string;
  artwork?: string;

  itemIds: string[];

  createdAt: string;
  updatedAt: string;
}
```

Required operations:

* Create
* Rename
* Delete
* Add media
* Remove media
* Reorder media
* Play
* Shuffle
* Add to queue

---

# 19. Queue

The queue is separate from playlists.

The queue represents the current playback session.

Required operations:

```text
Add to queue
Play next
Remove
Reorder
Clear
Shuffle
Play item
```

Queue state should survive UI navigation.

---

# 20. Favorites

Favorites should support more than one type of entity.

Possible favorite types:

```text
Track
Media source
Radio station
Playlist
```

The implementation should avoid duplicating the underlying object.

Favorites should reference entities by ID where practical.

---

# 21. History

Playback history should record meaningful playback events.

Example:

```ts
interface HistoryEntry {
  id: string;

  mediaItemId: string;

  playedAt: string;

  durationPlayed: number;

  completionPercentage?: number;
}
```

History should support:

* chronological browsing
* replay
* clear history
* automatic recording

The application should avoid generating excessive duplicate entries from
minor playback state changes.

---

# 22. Radio Architecture

Radio is a first-class feature.

Radio stations should have a normalized representation:

```ts
interface RadioStation {
  id: string;

  name: string;

  streamUrl: string;

  homepage?: string;

  artwork?: string;

  favicon?: string;

  genre?: string;

  country?: string;

  language?: string;

  codec?: string;

  bitrate?: number;

  listeners?: number;

  tags: string[];

  description?: string;

  online?: boolean;

  lastChecked?: string;
}
```

The UI should support:

```text
RADIO
GENRES
LOCATIONS
MOOD
```

with:

* search
* filtering
* sorting
* favorites
* station playback
* station information

---

# 23. Search Architecture

Search should be global.

Search should be capable of finding:

```text
Tracks
Artists
Albums
Radio stations
Genres
Categories
Tags
Playlists
```

Search should operate on normalized local library data.

Provider-specific remote search can be implemented separately where
supported.

---

# 24. Settings

User settings should be centralized.

Conceptually:

```ts
interface SettingsState {
  appearance: AppearanceSettings;
  audio: AudioSettings;
  playback: PlaybackSettings;
  interface: InterfaceSettings;
  privacy: PrivacySettings;
  pwa: PWASettings;
}
```

Settings should be persistent.

Examples:

```text
Volume
Theme
Visualizer
Accent
Font
Animation level
Reduced motion
Crossfade
Autoplay
Shuffle
Repeat
```

---

# 25. Control Panel

`/control` is separate from normal user-facing settings.

The main player should remain focused on playback.

The control panel is intended for configuration and administration of the
personal LIQUEAMP installation.

It should eventually contain:

```text
Media Management
Provider Configuration
Categories
Themes
Visualizers
Player Configuration
Import / Export
System Information
PWA Configuration
```

The control panel should not duplicate the entire main player.

---

# 26. Storage Architecture

LIQUEAMP should use persistent browser storage.

The architecture should be storage-agnostic.

A repository/service layer should sit between application logic and the
actual storage implementation.

Conceptually:

```text
Application
    ?
Repository
    ?
Storage Adapter
    ?
IndexedDB
```

IndexedDB should be the primary local persistence mechanism for the browser
application.

Possible future backends should be possible without rewriting application
logic.

---

# 27. Local-First Architecture

LIQUEAMP should be local-first.

The application should remain useful without a remote backend for core
personal functionality.

Local data may include:

* Library
* Categories
* Playlists
* Favorites
* History
* Settings
* Themes
* Visualizers
* Queue state

Network access is required when accessing external streams, APIs or providers.

---

# 28. Import / Export

The application should support exporting personal configuration/data.

The architecture should allow a structured export containing things such as:

```text
Library
Categories
Playlists
Favorites
Settings
Themes
Visualizer configurations
```

Import should validate the data before modifying existing state.

Malformed or incompatible imports must not corrupt the current library.

---

# 29. Theme Architecture

Themes must be data-driven.

The UI should consume semantic design tokens rather than hard-coded colors.

Example:

```text
--la-bg
--la-surface
--la-surface-2
--la-border
--la-text
--la-text-muted
--la-primary
--la-secondary
--la-accent
--la-accent-bright
--la-danger
--la-live
--la-visualizer
--la-glow
```

The detailed theme implementation is defined in:

```text
LIQUEAMP_THEMING.md
```

---

# 30. Visualizer Architecture

Visualizers must be independent modules.

Conceptually:

```ts
interface Visualizer {
  id: string;
  name: string;

  initialize(context: VisualizerContext): void;

  update(
    audioData: AudioAnalysisData,
    deltaTime: number
  ): void;

  resize(width: number, height: number): void;

  render(): void;

  destroy(): void;
}
```

A visualizer must not own the playback engine.

The visualizer consumes audio information supplied by the application.

Detailed visualizer architecture belongs in:

```text
LIQUEAMP_VISUALIZERS.md
```

---

# 31. Audio Analysis

When browser security and provider capabilities allow access to audio data,
LIQUEAMP may use the Web Audio API for:

* frequency analysis
* waveform data
* visualizers
* equalization
* audio effects

However, provider restrictions must be respected.

The visualizer system must gracefully fall back when audio analysis is not
available.

Never fabricate audio-reactive behavior when no audio data exists.

---

# 32. Equalizer

The application should support:

```text
EQ
Bass
Mid
Treble
Presets
```

Where technically possible, this should use actual Web Audio processing.

If the current provider does not permit processing of the audio stream,
the UI must distinguish between:

```text
DSP ACTIVE
```

and

```text
VISUAL CONTROL ONLY
```

rather than pretending the audio is being processed.

---

# 33. Media Session API

Where supported, LIQUEAMP should integrate with the browser Media Session
API.

The application should expose:

```text
Play
Pause
Previous
Next
Seek
```

and metadata such as:

```text
Title
Artist
Album
Artwork
```

This is particularly important for mobile PWA usage.

---

# 34. PWA Architecture

LIQUEAMP should be installable as a Progressive Web App.

Required architectural components:

```text
Web App Manifest
Service Worker
Offline Application Shell
Icons
Standalone Display Mode
```

The service worker should cache the application shell appropriately.

External media streams should NOT automatically be assumed to be available
offline.

---

# 35. Keyboard Architecture

Global keyboard commands should be handled by a dedicated keyboard/input
layer.

Initial shortcuts:

```text
Space       Play / Pause
N           Next
P           Previous
M           Mute
?           Seek backward
?           Seek forward
?           Volume up
?           Volume down
```

Shortcuts must NOT trigger while the user is typing into an input, textarea,
search field or editable control.

---

# 36. Mobile Interaction

Mobile is a primary platform.

The architecture must support:

* touch controls
* swipe gestures where useful
* responsive panels
* drawers
* collapsible sections
* mobile playback controls
* Media Session API
* PWA installation
* safe-area handling

The mobile implementation should be a responsive adaptation of the same
application architecture.

It should NOT be a completely separate application.

---

# 37. Responsive Architecture

The application should have one logical UI system.

Desktop:

```text
+--------------------------------------------------------------+
¦ HEADER                                                       ¦
+-------------------------------------------------------------¦
¦            ¦                              ¦                 ¦
¦ NAV/LIB    ¦       NOW PLAYING            ¦ RADIO           ¦
¦            ¦                              ¦                 ¦
+-------------------------------------------------------------¦
¦ PLAYLISTS / HISTORY / FAVORITES / QUEUE / STATION INFO       ¦
+--------------------------------------------------------------¦
¦ AUDIO / PLAYER / APPEARANCE / VISUALIZER                    ¦
+--------------------------------------------------------------¦
¦ STATUS                                                       ¦
+--------------------------------------------------------------+
```

Mobile should transform these regions into a structured vertical system
without changing their underlying responsibilities.

---

# 38. UI State vs Persistent State

Not all state should be persisted.

## Persistent state

Examples:

```text
Library
Playlists
Favorites
History
Settings
Themes
Visualizer configurations
Categories
```

## Session state

Examples:

```text
Current queue
Current playback position
Current provider session
```

## Ephemeral UI state

Examples:

```text
Open panel
Hovered item
Focused control
Temporary dialog
Search input
Context menu
```

Do not persist ephemeral UI state unless there is a clear reason.

---

# 39. Error Handling

Errors must be explicit and structured.

Example:

```ts
interface PlaybackError {
  code: string;
  message: string;
  provider?: string;
  recoverable: boolean;
}
```

The UI should present useful error information.

Examples:

```text
STREAM UNAVAILABLE
AUTHENTICATION REQUIRED
PROVIDER NOT SUPPORTED
NETWORK ERROR
MEDIA FORMAT NOT SUPPORTED
PLAYBACK BLOCKED
```

Avoid generic:

```text
Something went wrong.
```

when a more useful explanation is available.

---

# 40. Network State

LIQUEAMP should be aware of browser network state.

Possible states:

```text
ONLINE
OFFLINE
RECONNECTING
```

The application should distinguish between:

```text
Application available offline
```

and:

```text
External media unavailable because network access is required
```

---

# 41. Performance Architecture

Performance is particularly important for mobile.

The architecture should prevent unnecessary global re-renders.

High-frequency values such as:

```text
currentTime
audio analysis
visualizer frames
buffer position
```

should not cause the entire dashboard to render every frame.

Visualizer rendering should use:

```text
requestAnimationFrame
```

and remain isolated from normal React/UI rendering where practical.

---

# 42. Component Boundaries

Components should generally follow responsibility boundaries.

Example:

```text
components/
+-- layout/
+-- navigation/
+-- player/
+-- radio/
+-- library/
+-- playlists/
+-- queue/
+-- history/
+-- favorites/
+-- search/
+-- audio/
+-- visualizer/
+-- settings/
+-- control/
```

The exact folder structure may adapt to the existing project.

Do not reorganize an existing project unnecessarily if a sound architecture
already exists.

---

# 43. Services

Application logic should be separated into services where appropriate.

Possible services:

```text
PlaybackService
MediaResolver
ProviderRegistry
RadioService
PlaylistService
HistoryService
FavoritesService
ThemeService
VisualizerService
StorageService
ImportExportService
PWAService
```

Services should not become giant catch-all classes.

Each service should have one clear responsibility.

---

# 44. Provider Registry

Providers should be registered centrally.

Conceptually:

```ts
providerRegistry.register(
  new DirectStreamProvider()
);

providerRegistry.register(
  new RadioProvider()
);

providerRegistry.register(
  new YouTubeProvider()
);
```

URL detection can then query the registry.

This allows new providers to be added without changing the core application.

---

# 45. Dependency Direction

Dependencies should flow inward toward stable application abstractions.

Prefer:

```text
UI
 ?
Application interfaces
 ?
Services
 ?
Adapters
```

Avoid:

```text
UI
 ?
Spotify SDK
 ?
random component state
```

Provider SDKs should be isolated behind adapters.

---

# 46. Security

Never expose secrets in client-side code.

API keys or secrets that must remain private must not be placed in:

```text
React components
public files
client-side environment variables
localStorage
```

when those credentials require server-side secrecy.

Provider integrations must follow the authentication model supported by the
provider.

---

# 47. Configuration

Configuration should be separated from application logic.

Examples:

```text
Provider configuration
Theme configuration
Visualizer configuration
Default settings
Feature configuration
```

Do not hard-code large amounts of editable content into components.

---

# 48. Demo Data

Development may include demo data.

Demo data must be clearly separated from production/user data.

Example demo categories:

```text
Lofi / Chillhop
Synthwave
Electronic
Ambient
Drum & Bass
Jazzhop
Chiptunes
Amiga
Hip Hop
Downtempo
```

Example playlists:

```text
Lofi / Chillhop
Synthwave Vibes
Late Night
Focus
Retro Wave
Electronic
Chiptunes
Ambient Moods
```

Demo data should be removable or replaceable.

---

# 49. No Fake Metrics

The architecture must never generate fake system metrics.

Do not display fabricated:

```text
CPU %
Memory %
Network speed
Latency
Uptime
Listeners
Bitrate
```

unless the value is actually measured or supplied by a real source.

If a metric is unavailable, display a truthful alternative.

For example:

```text
AUDIO ENGINE: ACTIVE
NETWORK: ONLINE
BUFFER: 3.2s
VISUALIZER: ACTIVE
```

is preferable to inventing CPU usage.

---

# 50. Testing Architecture

Important logic should be testable independently from the UI.

Tests should cover at minimum:

## Provider

* URL detection
* provider detection
* validation
* unsupported URLs
* metadata normalization

## Playback

* play
* pause
* next
* previous
* queue transitions
* repeat
* shuffle
* error states

## Library

* create
* update
* delete
* categories
* favorites

## Playlists

* create
* rename
* delete
* add/remove
* reorder

## Storage

* persistence
* loading
* migration
* invalid data

## Themes

* parsing
* validation
* token mapping
* activation
* export

## Responsive UI

* desktop
* tablet
* mobile
* touch

---

# 51. Data Migration

Persistent data structures will evolve.

The storage layer should therefore support schema versions.

Example:

```ts
interface StoredData {
  version: number;
  data: unknown;
}
```

When the application changes its data model, migration functions should
upgrade older data instead of silently breaking it.

---

# 52. Logging and Diagnostics

Development builds should provide useful diagnostics.

Possible categories:

```text
PLAYBACK
PROVIDER
STORAGE
NETWORK
VISUALIZER
PWA
THEME
```

Production UI should not expose unnecessary technical logs to users.

---

# 53. Architecture Rule: No Monolith

Avoid creating a single enormous component such as:

```text
App.tsx
```

containing all:

* playback
* radio
* playlists
* themes
* settings
* provider logic
* storage
* visualizers

The application should be composed of smaller modules with explicit
responsibilities.

---

# 54. Architecture Rule: No Premature Complexity

The architecture should be extensible but should not introduce unnecessary
infrastructure.

Do not add:

* unnecessary backend services
* unnecessary databases
* unnecessary dependencies
* unnecessary state-management abstractions
* unnecessary microservices

The first implementation should remain simple enough to understand and
maintain.

---

# 55. Existing Repository Rule

Before modifying the application, inspect the existing repository.

Determine:

* framework
* build system
* package manager
* existing routing
* existing state management
* existing components
* existing storage
* existing styling
* existing dependencies
* existing audio implementation

Do NOT replace an existing architecture merely because a different
architecture could be used.

Extend and improve what already exists when appropriate.

---

# 56. TypeScript

The application should use TypeScript wherever the existing project supports
it.

Avoid:

```ts
any
```

unless there is a documented technical reason.

Prefer explicit interfaces and discriminated unions.

Provider-specific data should be strongly typed where practical.

---

# 57. Build and Runtime Requirements

The application must remain buildable during development.

After significant changes:

1. Run the development server.
2. Check TypeScript errors.
3. Check build errors.
4. Inspect the rendered application.
5. Test important interactions.
6. Fix regressions before continuing.

Do not accumulate known build errors.

---

# 58. Architecture Acceptance Criteria

The architecture is considered acceptable when:

* Playback is centralized.
* UI does not own provider-specific playback logic.
* Providers are replaceable.
* Media items use a normalized model.
* Library data is persistent.
* Playlists are persistent.
* Favorites are persistent.
* History is persistent.
* Queue is independent from playlists.
* Themes are data-driven.
* Visualizers are modular.
* `/control` is separated from normal player settings.
* PWA functionality is architecturally supported.
* Media Session can integrate with the playback engine.
* External provider limitations are represented honestly.
* No protected provider functionality is bypassed.
* No fake system metrics are generated.
* The application remains extensible.

---

# 59. Relationship to Other Documentation

This document is part of the LIQUEAMP documentation system.

```text
LIQUEAMP_SPEC.md
        ¦
        +-- What LIQUEAMP is
        ¦
        ?
LIQUEAMP_ARCHITECTURE.md
        ¦
        +-- How LIQUEAMP works internally
        ¦
        ?
LIQUEAMP_DESIGN.md
        ¦
        +-- How LIQUEAMP looks and behaves visually
        ¦
        ?
LIQUEAMP_PROVIDERS.md
        ¦
        +-- External media providers
        ¦
        ?
LIQUEAMP_THEMING.md
        ¦
        +-- Theme system and Tinted Theming
        ¦
        ?
LIQUEAMP_VISUALIZERS.md
        ¦
        +-- Visualizer system
```

These documents should complement one another.

If two documents conflict, the conflict must be resolved explicitly rather
than silently choosing one implementation.

---

# 60. Final Architecture Principle

LIQUEAMP should be built as a real application, not as a visual prototype.

The architecture must allow the application to evolve from a personal
browser-based music player into a complete, extensible media dashboard
without requiring a rewrite of the core playback, content or UI systems.

The most important architectural rule is:

```text
KEEP THE CORE STABLE.
KEEP PROVIDERS REPLACEABLE.
KEEP CONTENT DATA-DRIVEN.
KEEP PLAYBACK CENTRALIZED.
KEEP THE UI DECOUPLED FROM IMPLEMENTATION DETAILS.
```

The final implementation should remain understandable, modular, testable,
performant and extensible.

```
```
