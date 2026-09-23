
# LIQUEAMP — PROVIDERS

Version: 1.0  
Status: Active Development  
Document Type: Technical Provider Specification

---

# 1. PURPOSE

This document defines how LIQUEAMP integrates external media sources and providers.

The provider system must allow LIQUEAMP to support multiple media sources through a unified architecture without coupling the main player, UI, queue, playlists, history, or library directly to any individual provider.

Providers are adapters.

The rest of LIQUEAMP should not need to know the implementation details of YouTube, Spotify, SoundCloud, Internet radio, direct streams, or future providers.

The application should communicate with providers through a common provider interface and normalized media model.

The goal is:

> One LIQUEAMP player.  
> Many possible media sources.

---

# 2. CORE PRINCIPLE

LIQUEAMP must have one centralized playback system.

Providers must NOT create independent playback systems.

The architecture should look conceptually like:

```text
                    +---------------------+
                    ¦       LIQUEAMP      ¦
                    ¦        UI           ¦
                    +---------------------+
                               ¦
                               ?
                    +---------------------+
                    ¦  Application State  ¦
                    +---------------------+
                               ¦
                               ?
                    +---------------------+
                    ¦   Playback Engine   ¦
                    +---------------------+
                               ¦
                       Provider Adapter
                               ¦
             +-----------------+-----------------+
             ?                 ?                 ?
       Direct Stream         Radio          External Provider
             ¦                 ¦                 ¦
             ?                 ?                 ?
          Audio              Audio         Provider mechanism
````

The UI must never directly call provider-specific playback code.

For example:

```text
UI
 ?
playMedia(mediaItem)
 ?
Playback Engine
 ?
Provider Registry
 ?
SpotifyProvider / RadioProvider / DirectStreamProvider
```

Never:

```text
SpotifyButton
 ?
Spotify-specific player
```

or:

```text
RadioButton
 ?
new Audio(...)
```

Every playback source must ultimately be controlled through the centralized playback engine.

---

# 3. PROVIDER CONCEPT

A provider represents a source of media.

Examples:

```text
Direct Stream
Internet Radio
YouTube
YouTube Music
Spotify
SoundCloud
```

Future providers may include:

```text
Apple Music
Bandcamp
Mixcloud
Podcast providers
Local files
Network streams
Other official APIs
```

The provider architecture must allow new providers to be added without rewriting the core player.

---

# 4. PROVIDER IDENTIFIERS

Every provider must have a stable identifier.

Example:

```ts
type ProviderId =
  | "direct"
  | "radio"
  | "youtube"
  | "youtube-music"
  | "spotify"
  | "soundcloud";
```

Future providers should be added through the provider registry rather than hard-coded throughout the application.

Example:

```ts
const providerRegistry = {
  direct: DirectStreamProvider,
  radio: RadioProvider,
  youtube: YouTubeProvider,
  "youtube-music": YouTubeMusicProvider,
  spotify: SpotifyProvider,
  soundcloud: SoundCloudProvider,
};
```

The exact implementation may differ, but the architectural principle must remain.

---

# 5. MEDIA PROVIDER INTERFACE

Providers should expose a common interface.

Conceptually:

```ts
interface MediaProvider {
  id: ProviderId;
  name: string;

  validate(input: string): Promise<ProviderValidationResult>;

  resolve(input: string): Promise<MediaItem | MediaItem[]>;

  getMetadata(input: string): Promise<MediaMetadata>;

  getArtwork(input: string): Promise<Artwork | null>;

  getPlaybackMode(
    media: MediaItem
  ): Promise<PlaybackMode>;

  play(media: MediaItem): Promise<void>;

  pause(): Promise<void>;

  stop(): Promise<void>;

  getCapabilities(): ProviderCapabilities;
}
```

The exact interface may be adapted to the existing project architecture.

Do not create unnecessary abstractions simply to satisfy this document.

The important requirement is that providers expose a predictable contract to the rest of the application.

---

# 6. PROVIDER CAPABILITIES

Every provider should describe what it supports.

Example:

```ts
interface ProviderCapabilities {
  search: boolean;
  metadata: boolean;
  artwork: boolean;

  directPlayback: boolean;
  embeddedPlayback: boolean;

  queue: boolean;
  playlists: boolean;
  favorites: boolean;

  authentication: boolean;

  seek: boolean;
  volume: boolean;

  next: boolean;
  previous: boolean;

  liveStreams: boolean;

  audioAnalysis: boolean;
}
```

Capabilities must be used by the UI and playback engine.

Do not assume that every provider supports every operation.

For example:

```text
Spotify
 +-- metadata
 +-- artwork
 +-- authentication
 +-- official playback mechanisms
 +-- provider-dependent playback limitations

Direct Stream
 +-- direct playback
 +-- seek
 +-- volume
 +-- Web Audio analysis where technically possible
 +-- no provider authentication required

Radio
 +-- live playback
 +-- station metadata
 +-- stream metadata
 +-- usually no meaningful duration
```

The UI should adapt to capabilities rather than displaying controls that cannot work.

---

# 7. NORMALIZED MEDIA MODEL

All providers must eventually produce a normalized `MediaItem`.

Example:

```ts
interface MediaItem {
  id: string;

  provider: ProviderId;

  title: string;
  artist?: string;
  album?: string;

  artwork?: string | null;

  sourceUrl: string;

  playbackType:
    | "direct"
    | "radio"
    | "embed"
    | "external";

  streamUrl?: string | null;

  duration?: number | null;

  description?: string;

  categoryId?: string | null;

  tags?: string[];

  favorite?: boolean;
  enabled?: boolean;

  metadata?: Record<string, unknown>;

  createdAt: string;
  updatedAt: string;
}
```

Provider-specific information may exist inside:

```ts
metadata
```

but the common player must primarily operate against the normalized model.

---

# 8. SOURCE URL

Every imported provider item should retain its original source URL.

Example:

```text
sourceUrl:
https://www.youtube.com/watch?v=...
```

or:

```text
sourceUrl:
https://open.spotify.com/track/...
```

or:

```text
sourceUrl:
https://example.com/radio/stream.mp3
```

The original URL should not be discarded after resolution.

This is important for:

* debugging
* re-resolving
* sharing
* provider identification
* displaying source information
* repairing broken imports
* future migrations

---

# 9. URL DETECTION

LIQUEAMP should automatically detect known provider URLs.

Example:

```text
https://www.youtube.com/watch?v=...
? YouTubeProvider

https://music.youtube.com/watch?v=...
? YouTubeMusicProvider

https://open.spotify.com/track/...
? SpotifyProvider

https://soundcloud.com/...
? SoundCloudProvider

https://example.com/stream.mp3
? DirectStreamProvider

https://example.com/playlist.m3u
? DirectStreamProvider
```

URL detection should be centralized.

Do not scatter provider detection throughout individual UI components.

Conceptually:

```ts
detectProvider(url)
```

should return:

```ts
{
  provider: "spotify",
  confidence: "high"
}
```

or:

```ts
{
  provider: "direct",
  confidence: "high"
}
```

---

# 10. URL IMPORT PIPELINE

When a user pastes a URL into LIQUEAMP, use the following conceptual pipeline:

```text
User enters URL
       ?
Normalize URL
       ?
Detect provider
       ?
Validate URL
       ?
Resolve provider
       ?
Retrieve metadata
       ?
Retrieve artwork
       ?
Determine playback mode
       ?
Create normalized MediaItem
       ?
Show preview
       ?
User confirms
       ?
Add to library / playlist / queue
```

The UI should show meaningful progress when resolution takes time.

For example:

```text
DETECTING SOURCE...
RESOLVING MEDIA...
FETCHING METADATA...
READY
```

Errors should explain what actually failed.

---

# 11. DIRECT STREAM PROVIDER

The Direct Stream provider handles URLs that point directly to playable media.

Examples may include:

```text
.mp3
.aac
.ogg
.opus
.m3u
.m3u8
.pls
```

Support must depend on browser capabilities, CORS, codec support, and actual server behavior.

Do not assume every URL is playable simply because the extension looks correct.

---

# 12. DIRECT AUDIO

For directly playable audio:

```text
DirectStreamProvider
        ?
Playback Engine
        ?
HTMLAudioElement
        ?
Web Audio API when appropriate
```

The player should retain the source URL and normalized metadata.

The system should detect:

* MIME type when available
* codec
* bitrate when available
* live/VOD behavior
* duration
* seekability
* CORS restrictions
* network errors
* buffering state

---

# 13. M3U / M3U8

LIQUEAMP may support playlist/stream-list URLs.

Example:

```text
https://example.com/stations.m3u
```

or:

```text
https://example.com/stream.m3u8
```

These must not automatically be treated as identical things.

The application should determine whether the resource represents:

1. a playlist containing multiple sources
2. an HLS media stream
3. another stream format

M3U playlists should be parsed into normalized items where possible.

Example:

```text
M3U
 ?
Parse entries
 ?
Extract title
Extract URL
Extract metadata where available
 ?
Create MediaItems
```

---

# 14. PLS

PLS files may contain radio stream entries.

Example structure:

```text
File1=http://example.com/stream
Title1=Example Radio
Length1=-1
```

The parser should extract supported fields and create normalized radio/media items.

Malformed playlists should produce a readable error rather than crashing the application.

---

# 15. INTERNET RADIO PROVIDER

Radio should be treated as a specialized media source.

A station can contain:

```ts
interface RadioStation {
  id: string;

  name: string;

  streamUrl: string;

  homepage?: string;

  favicon?: string;

  artwork?: string;

  genre?: string[];
  country?: string;
  language?: string;

  codec?: string;
  bitrate?: number;

  listeners?: number;

  tags?: string[];

  description?: string;

  lastStatus?: string;
}
```

Radio stations should support:

```text
Play
Pause
Stop
Favorite
Add to Queue
Share
Station Info
```

Where technically meaningful.

---

# 16. RADIO BROWSER

The Radio Browser interface should provide:

```text
RADIO
GENRES
LOCATIONS
MOOD
```

with:

```text
Search
Filter
Sort
Favorites
```

The UI should allow users to discover stations without leaving LIQUEAMP.

Station metadata should be normalized into the same general media system.

---

# 17. RADIO LIVE METADATA

Where the stream exposes metadata such as:

```text
ICY
Now Playing
Artist
Title
```

LIQUEAMP should attempt to display it.

Example:

```text
STATION
? NTS Radio

NOW PLAYING
? Artist — Track
```

Live metadata may change without the user changing stations.

The playback engine should therefore support metadata updates independently from playback state.

Do not rebuild the player when metadata changes.

---

# 18. RADIO LISTENER COUNTS

Listener counts may be displayed if provided by the relevant radio service.

They must be treated as external metadata.

Never invent listener numbers.

If the value is unavailable:

```text
LISTENERS —
```

rather than:

```text
LISTENERS 12,482
```

---

# 19. YOUTUBE PROVIDER

YouTube integration must use supported official mechanisms.

The application must not attempt to bypass:

* DRM
* authentication
* access controls
* protected media mechanisms
* provider restrictions

Do not implement unofficial protected-audio extraction.

If direct audio playback is not available through a supported browser/API mechanism, use an official embedded playback mechanism or represent the item as externally playable.

---

# 20. YOUTUBE PLAYBACK MODES

A YouTube item may have different playback modes depending on the supported integration.

Example:

```text
PlaybackMode:
"direct"
"embed"
"external"
```

The UI must understand the distinction.

If the provider requires an embedded player, LIQUEAMP should not pretend that the application owns a raw audio stream.

---

# 21. YOUTUBE MUSIC

YouTube Music should be treated separately from ordinary YouTube at the provider layer even when some URLs overlap.

Example:

```text
YouTubeProvider
YouTubeMusicProvider
```

The provider detector should distinguish:

```text
youtube.com
music.youtube.com
```

where possible.

Playback and metadata must follow supported provider mechanisms.

---

# 22. SPOTIFY

Spotify integration must use supported Spotify APIs, SDKs, embeds, or other officially supported mechanisms available to the application.

Do not attempt to extract protected Spotify audio.

A Spotify media item may provide:

```text
title
artist
album
artwork
duration
source URL
```

without providing raw audio access.

The player must distinguish metadata access from audio playback access.

---

# 23. SPOTIFY AUTHENTICATION

If Spotify functionality requires authentication:

```text
Not connected
     ?
Connect Spotify
     ?
OAuth / official authorization
     ?
Authenticated provider
```

Credentials/tokens must not be hard-coded into the application.

Authentication state should be managed separately from normal library data.

The UI should clearly indicate:

```text
SPOTIFY
CONNECTED
```

or:

```text
SPOTIFY
NOT CONNECTED
```

Do not silently fail.

---

# 24. SOUNDCLOUD

SoundCloud must use supported official mechanisms.

Do not attempt unofficial protected audio extraction.

SoundCloud items should expose normalized metadata such as:

```text
title
artist
artwork
sourceUrl
duration
```

when available.

Playback should depend on the officially supported integration mechanism and browser limitations.

---

# 25. PROVIDER RESTRICTIONS

LIQUEAMP must never implement:

```text
DRM bypass
Protected media extraction
Authentication bypass
Cookie theft
Token theft
Credential scraping
Provider security circumvention
Unofficial protected audio download
```

Do not build functionality whose purpose is to circumvent provider restrictions.

When a provider does not permit direct playback:

```text
do not fake it
```

Instead show a truthful provider-specific state.

Example:

```text
SPOTIFY

Metadata available.

Direct browser playback is not available
through the current integration.

OPEN IN SPOTIFY
```

---

# 26. PROVIDER ERROR MODEL

Providers should return normalized errors.

Example:

```ts
type ProviderErrorCode =
  | "INVALID_URL"
  | "NOT_FOUND"
  | "AUTH_REQUIRED"
  | "AUTH_EXPIRED"
  | "PLAYBACK_UNAVAILABLE"
  | "EMBED_REQUIRED"
  | "CORS_ERROR"
  | "NETWORK_ERROR"
  | "RATE_LIMITED"
  | "UNSUPPORTED"
  | "UNKNOWN";
```

The UI should convert these into human-readable messages.

Example:

```text
PLAYBACK UNAVAILABLE

This source cannot be played directly
in the current browser integration.

[OPEN SOURCE]
```

Not:

```text
Something went wrong.
```

when the actual reason is known.

---

# 27. PROVIDER STATUS

Each provider should have a runtime status.

Example:

```ts
interface ProviderStatus {
  provider: ProviderId;

  enabled: boolean;

  configured: boolean;

  authenticated: boolean;

  available: boolean;

  lastError?: string;

  checkedAt?: string;
}
```

This can be used by `/control`.

Example:

```text
PROVIDERS

DIRECT STREAM     ENABLED
RADIO             ENABLED
YOUTUBE           ENABLED
YOUTUBE MUSIC     ENABLED
SPOTIFY           NOT CONNECTED
SOUNDCLOUD        ENABLED
```

---

# 28. PROVIDER REGISTRY

Providers should be registered centrally.

Conceptually:

```ts
interface ProviderRegistry {
  register(provider: MediaProvider): void;

  get(id: ProviderId): MediaProvider | undefined;

  getAll(): MediaProvider[];

  detect(url: string): MediaProvider | undefined;
}
```

The rest of the application should depend on the registry rather than importing individual providers everywhere.

---

# 29. PROVIDER PRIORITY

Some URLs may technically match multiple providers.

The detection system should use explicit matching rules.

Example:

```text
music.youtube.com
     ?
YouTube Music
```

before a generic:

```text
youtube.com
     ?
YouTube
```

Direct stream detection should only be selected when no more specific provider matches.

---

# 30. PROVIDER RESOLUTION

Resolution should be asynchronous.

Example:

```ts
const media = await provider.resolve(url);
```

Resolution may return:

```text
one MediaItem
```

or:

```text
multiple MediaItems
```

For example:

```text
M3U playlist
     ?
multiple stations
```

while:

```text
Spotify track URL
     ?
one MediaItem
```

---

# 31. METADATA RESOLUTION

Metadata should be separated from playback.

For example:

```text
resolve URL
      ?
metadata
      ?
artwork
      ?
playback capability
```

A provider may successfully resolve metadata while playback is unavailable.

That is a valid state.

The application should preserve useful metadata instead of treating the entire item as invalid.

---

# 32. ARTWORK

Artwork should be normalized.

Possible sources:

```text
Provider artwork
Station favicon
Station artwork
Album artwork
User-provided artwork
Fallback artwork
```

Fallback order should be deterministic.

Example:

```text
Provider artwork
?
Album artwork
?
Station artwork
?
Favicon
?
LIQUEAMP fallback artwork
```

Never fabricate artwork metadata.

---

# 33. PLAYBACK MODES

The core playback engine should understand provider playback modes.

Example:

```ts
type PlaybackMode =
  | "native-audio"
  | "embedded"
  | "external"
  | "unsupported";
```

Possible behavior:

### native-audio

LIQUEAMP controls an actual audio source.

Supports, where technically possible:

```text
play
pause
seek
volume
mute
Web Audio analysis
EQ
```

### embedded

An official provider player controls playback.

LIQUEAMP may have reduced control depending on the provider.

### external

The source opens in its official application/site.

### unsupported

The item can remain in the library as metadata, but cannot currently be played.

---

# 34. CENTRAL PLAYBACK ENGINE

The provider layer must not become the playback engine.

Correct:

```text
Provider
   ?
Playback descriptor
   ?
Playback Engine
   ?
Audio / Embed / External
```

The playback engine owns:

```text
currentMedia
isPlaying
currentTime
duration
volume
muted
shuffle
repeat
buffering
error
```

Providers provide the mechanism.

The central engine owns the player state.

---

# 35. PLAYBACK PERSISTENCE

The active media item should survive navigation.

For example:

```text
RADIO
 ?
PLAYLISTS
 ?
SETTINGS
 ?
CONTROL
```

The audio must not automatically stop because the user changed UI sections.

The provider integration must therefore be independent from page/component lifecycle.

---

# 36. QUEUE INTEGRATION

Providers should return normalized `MediaItem` objects.

The queue should not care whether an item came from:

```text
Spotify
YouTube
Radio
SoundCloud
Direct Stream
```

Example:

```text
QUEUE

01  Artist — Track       Spotify
02  Station Name         Radio
03  Artist — Track       Direct
04  Artist — Track       SoundCloud
```

The queue works against the normalized model.

---

# 37. PLAYLIST INTEGRATION

Playlists should store normalized media references.

A playlist must not contain provider-specific UI objects.

Example:

```ts
interface PlaylistItem {
  mediaId: string;
  addedAt: string;
  position: number;
}
```

The provider is resolved when needed.

---

# 38. FAVORITES

Favorites may include:

```text
tracks
stations
playlists
sources
```

The provider should not control favorite state.

Favorite state belongs to LIQUEAMP's application/library layer.

---

# 39. HISTORY

Playback history also belongs to LIQUEAMP.

Providers should not maintain independent histories.

Example:

```ts
interface HistoryEntry {
  mediaId: string;
  startedAt: string;
  endedAt?: string;

  durationPlayed?: number;
  completionPercentage?: number;
}
```

---

# 40. SEARCH

Search should be provider-aware.

Conceptually:

```text
Global Search
       ?
Provider Registry
       ?
Search supported providers
       ?
Normalize results
       ?
Merge results
       ?
Display provider badges
```

The UI should make the provider visible.

Example:

```text
BROKEN BELLS
The High Road

[SPOTIFY]
```

or:

```text
KEXP 90.3

[RADIO]
```

---

# 41. SEARCH CAPABILITIES

Providers may implement:

```ts
search(query: string): Promise<MediaItem[]>
```

but only if the provider officially supports searching.

If a provider does not support search:

```text
search: false
```

Do not emulate search through scraping.

---

# 42. PROVIDER BADGES

Provider identity should be visible but visually restrained.

Examples:

```text
[DIRECT]
[RADIO]
[YOUTUBE]
[YTM]
[SPOTIFY]
[SOUNDCLOUD]
```

Provider badges should use LIQUEAMP's theme tokens rather than hard-coded colors.

---

# 43. CONTROL PANEL

`/control` should expose provider management.

Possible sections:

```text
PROVIDERS
--------------

DIRECT STREAM
[ ENABLED ]

RADIO
[ ENABLED ]

YOUTUBE
[ ENABLED ]

YOUTUBE MUSIC
[ ENABLED ]

SPOTIFY
[ CONNECT ]

SOUNDCLOUD
[ ENABLED ]
```

Provider-specific configuration should appear only when relevant.

---

# 44. PROVIDER CONFIGURATION

Configuration should be stored separately from provider code.

Example:

```ts
interface ProviderConfig {
  enabled: boolean;

  settings?: Record<string, unknown>;
}
```

Secrets must never be stored in public source code.

If a provider requires a server-side secret, the architecture must account for a secure server-side boundary rather than exposing the secret in the browser.

---

# 45. API KEYS

Never place private API keys directly into frontend source code.

Bad:

```ts
const API_KEY = "secret-key";
```

Correct architecture depends on the provider.

Possible approaches:

```text
Official public client configuration
```

or:

```text
Frontend
 ?
Backend/serverless function
 ?
Provider API
```

Never expose private credentials to the browser merely for convenience.

---

# 46. CORS

Browser playback may be affected by CORS.

The application must distinguish:

```text
URL exists
```

from:

```text
Browser is allowed to access the resource
```

A stream that works in VLC does not necessarily work in a browser.

If browser playback is blocked by CORS:

```text
CORS BLOCKED

The stream exists but the browser
does not permit direct access.

[OPEN SOURCE]
```

Do not automatically attempt unsafe proxy workarounds.

---

# 47. NETWORK CONDITIONS

Provider playback must handle:

```text
online
offline
slow network
connection lost
reconnecting
buffering
stream ended
provider unavailable
```

The playback engine should expose these states consistently.

Example:

```text
BUFFERING...
RECONNECTING...
OFFLINE
```

---

# 48. LIVE VS ON-DEMAND

Providers should identify whether media is live.

Example:

```ts
type MediaKind =
  | "track"
  | "radio"
  | "live"
  | "playlist";
```

For live media:

```text
duration = null
```

or an equivalent non-seekable state.

Do not display:

```text
03:42 / 03:42
```

for a live radio station.

Instead display:

```text
LIVE
```

---

# 49. SEEK SUPPORT

Seek controls should depend on provider capabilities.

If seek is unsupported:

```text
Seek disabled
```

Do not display an apparently functional seek bar that does nothing.

For live radio:

```text
LIVE ???????????????
```

may be used as a visual live indicator rather than a seekable timeline.

---

# 50. VOLUME

LIQUEAMP's global volume control should remain consistent.

However, embedded provider playback may have provider-specific volume behavior.

The UI should reflect actual capability.

Do not claim that LIQUEAMP controls volume when the provider does not expose that control.

---

# 51. EQUALIZER

The EQ system belongs to the audio/playback layer rather than the provider.

For native audio where Web Audio access is possible:

```text
Source
 ?
AudioContext
 ?
EQ
 ?
Gain
 ?
Output
```

For embedded or protected provider playback where raw audio is inaccessible:

```text
EQ cannot be applied to provider audio
```

The UI must distinguish actual DSP from settings that cannot affect the provider stream.

Never pretend an EQ is active when it is not.

---

# 52. VISUALIZER

Visualizers may use actual audio analysis only where the browser/provider architecture permits it.

Native direct audio:

```text
Audio
 ?
AnalyserNode
 ?
Visualizer
```

Embedded/provider-restricted audio:

```text
No raw audio access
 ?
Visualizer unavailable or limited
```

Do not generate fake waveform data and present it as real audio analysis.

---

# 53. MEDIA SESSION

When browser Media Session API is available, LIQUEAMP should expose provider-neutral metadata.

Example:

```text
title
artist
album
artwork
```

Supported actions should map back to the centralized playback engine:

```text
play
pause
previoustrack
nexttrack
seekbackward
seekforward
```

Provider limitations must still be respected.

---

# 54. SHARING

Sharing a provider item should preserve the original source.

Preferred:

```text
Web Share API
```

Fallback:

```text
copy source URL
```

Do not generate fake LIQUEAMP URLs unless such a sharing system actually exists.

---

# 55. PROVIDER FALLBACK

A provider may fail.

Example:

```text
Spotify
 ?
Playback unavailable
 ?
Show metadata
 ?
Offer:
[OPEN SPOTIFY]
```

If the same content exists as another legitimate source, LIQUEAMP may allow the user to manually choose another source.

Do not silently substitute content.

---

# 56. PROVIDER AVAILABILITY

Providers should not be assumed to be available forever.

The UI should support:

```text
AVAILABLE
UNAVAILABLE
AUTH REQUIRED
DISABLED
LIMITED
```

Provider-specific errors should be visible in `/control`.

---

# 57. RATE LIMITING

Provider APIs may impose rate limits.

The provider adapter should handle rate-limit responses gracefully.

Possible behavior:

```text
RATE LIMITED

Please wait before searching this provider again.
```

Do not create aggressive retry loops.

Use sensible backoff where appropriate.

---

# 58. CACHING

Metadata may be cached where appropriate.

Good candidates:

```text
station metadata
album artwork
provider search results
static metadata
```

Avoid caching sensitive authentication data unnecessarily.

Playback itself should remain controlled by the playback engine.

---

# 59. OFFLINE BEHAVIOR

LIQUEAMP should remain usable offline for locally stored application data.

Examples:

```text
Playlists
Favorites
History
Categories
Settings
Imported provider metadata
```

However, external provider playback may naturally fail while offline.

The UI should clearly distinguish:

```text
LOCAL DATA AVAILABLE
```

from:

```text
EXTERNAL SOURCE OFFLINE
```

---

# 60. PROVIDER IMPORT

When importing an item, the user should receive a preview before committing it.

Example:

```text
IMPORT SOURCE

URL:
https://...

PROVIDER:
Spotify

TITLE:
The High Road

ARTIST:
Broken Bells

ARTWORK:
[preview]

PLAYBACK:
Provider playback

[IMPORT]
[CANCEL]
```

---

# 61. DUPLICATES

Provider imports should attempt to detect duplicates.

Possible identity:

```text
provider + provider-specific ID
```

Example:

```text
spotify:track:123456
```

should not create multiple copies simply because the URL format differs.

URL normalization should occur before duplicate checking.

---

# 62. PROVIDER-SPECIFIC IDs

Where available, preserve the original provider ID.

Example:

```ts
metadata: {
  providerId: "spotify:track:..."
}
```

or:

```ts
providerItemId: string;
```

This makes re-resolution and future provider operations easier.

---

# 63. PROVIDER MIGRATION

Provider-specific data should be isolated enough that provider implementation can change without destroying user library data.

Example:

```text
MediaItem
 +-- normalized metadata
 +-- source URL
 +-- provider
 +-- provider metadata
```

If a provider adapter is replaced, the stored media should remain identifiable.

---

# 64. TESTING

Every provider should have tests for:

### Detection

```text
Valid provider URL
Invalid URL
Similar URL
Unknown URL
```

### Resolution

```text
Valid item
Missing item
Malformed response
Network failure
```

### Metadata

```text
Complete metadata
Partial metadata
Missing artwork
Missing artist
Missing duration
```

### Playback

```text
Supported
Unsupported
CORS failure
Network failure
Authentication required
```

### Provider restrictions

Ensure that unsupported operations fail safely rather than attempting circumvention.

---

# 65. PROVIDER MOCKS

Development should support mock provider responses where external services are unavailable.

Example:

```text
MockRadioProvider
MockDirectStreamProvider
```

Mocks are for development/testing only.

Do not allow mock data to appear as real provider data in production.

---

# 66. NO FAKE PROVIDER DATA

The production application must never pretend that provider data is real when it is not.

Do not invent:

```text
listener counts
bitrate
stream status
album metadata
provider availability
CPU usage
network statistics
```

If unavailable:

```text
—
Unknown
Not available
```

depending on context.

---

# 67. DEBUGGING

Provider debugging should be centralized.

Development mode may expose:

```text
Provider
URL
Detection result
Resolution time
Playback mode
HTTP status
Error code
```

Do not expose secrets or authentication tokens.

---

# 68. LOGGING

Provider logs should be useful but restrained.

Example:

```text
[LIQUEAMP][PROVIDER]
Detected: spotify

[LIQUEAMP][PROVIDER]
Resolved: spotify track

[LIQUEAMP][PLAYBACK]
Mode: external
```

Do not log:

```text
access tokens
refresh tokens
passwords
cookies
private credentials
```

---

# 69. PERFORMANCE

Provider operations should not block the UI.

Use asynchronous operations.

Search should support:

```text
debouncing
cancellation
pagination where supported
```

Artwork loading should not block playback.

Metadata resolution should not freeze the main interface.

---

# 70. PROVIDER UI STATES

Provider-dependent UI must support:

```text
idle
loading
ready
playing
paused
buffering
authentication-required
unavailable
error
offline
```

Do not create separate visual systems for every provider.

Use common LIQUEAMP components with provider-specific metadata.

---

# 71. PROVIDER COMPONENTS

Provider-specific UI should be kept minimal.

Good:

```text
<ProviderBadge />
<ProviderStatus />
<ProviderSettings />
```

Avoid creating entire duplicate application interfaces for each provider.

LIQUEAMP remains one application.

---

# 72. ADDING A NEW PROVIDER

Adding a provider should conceptually require:

```text
1. Create provider adapter
2. Define ProviderId
3. Define capabilities
4. Implement URL detection
5. Implement validation
6. Implement resolution
7. Implement metadata
8. Implement artwork
9. Define playback mode
10. Register provider
11. Add tests
12. Add control-panel configuration if necessary
```

The existing player should not need to be rewritten.

---

# 73. PROVIDER DEVELOPMENT CHECKLIST

Before considering a provider complete:

```text
[ ] Provider ID defined
[ ] URL detection works
[ ] URL normalization works
[ ] Validation works
[ ] Metadata resolution works
[ ] Artwork resolution works
[ ] Playback mode defined
[ ] Capabilities defined
[ ] Authentication handled if required
[ ] Errors normalized
[ ] CORS limitations handled
[ ] Rate limits handled
[ ] Queue integration works
[ ] Playlist integration works
[ ] Favorites integration works
[ ] History integration works
[ ] Search implemented if supported
[ ] Control panel status implemented
[ ] No protected-media bypass
[ ] No secrets exposed
[ ] Tests implemented
```

---

# 74. CURRENT PROVIDER PRIORITY

Initial provider support should be implemented in this conceptual order:

```text
1. Direct Streams
2. Internet Radio
3. YouTube
4. YouTube Music
5. Spotify
6. SoundCloud
```

This is an implementation sequence, not a statement about product importance.

The architecture must remain provider-neutral.

---

# 75. DIRECT STREAMS AS FOUNDATION

Direct streams should provide the strongest native browser integration because they can use standard browser audio mechanisms when the source permits it.

This makes them particularly useful for validating:

```text
Playback Engine
Queue
Volume
Seek
EQ
Visualizer
Media Session
Buffering
Error handling
```

The provider system should therefore be tested thoroughly against direct streams early in development.

---

# 76. RADIO AS A FIRST-CLASS SOURCE

Internet radio is not simply a special playlist.

Radio has unique properties:

```text
Live
No fixed duration
Dynamic metadata
Station identity
Stream bitrate
Codec
Listener count
Location
Genre
```

These properties should be represented explicitly.

---

# 77. PROVIDER-NEUTRAL PLAYER

The player should display a common interface:

```text
+-----------------------------------------+
¦ NOW PLAYING                             ¦
¦                                         ¦
¦ Artwork                                 ¦
¦                                         ¦
¦ Artist                                  ¦
¦ Title                                   ¦
¦                                         ¦
¦ [PROVIDER] [TYPE] [QUALITY]             ¦
¦                                         ¦
¦ ---------------?--------------           ¦
¦                                         ¦
¦ ?   ?   ??   ??                         ¦
+-----------------------------------------+
```

Provider-specific differences should appear through metadata and capability-aware controls.

---

# 78. PROVIDER-AWARE QUICK ACTIONS

Quick actions should adapt to provider capability.

Example:

```text
PLAY NOW
ADD TO QUEUE
ADD TO FAVOURITES
SHARE
OPEN SOURCE
MORE
```

If a provider supports direct playback:

```text
PLAY NOW
```

If it only supports external playback:

```text
OPEN SOURCE
```

should be emphasized instead.

---

# 79. PROVIDER-AWARE CONTEXT MENU

The More Actions menu may contain:

```text
Play Now
Add to Queue
Add to Playlist
Add to Favourites
Share
Open Source
View Provider
View Metadata
Remove
```

Only actions supported by the media/provider should be displayed.

---

# 80. PROVIDER CONFIGURATION IN `/CONTROL`

The control panel should provide a technical provider overview.

Example:

```text
LIQUEAMP CONTROL
--------------------------------

PROVIDERS

DIRECT STREAM
Status       ENABLED
Playback     NATIVE AUDIO

RADIO
Status       ENABLED
Playback     NATIVE AUDIO

YOUTUBE
Status       ENABLED
Playback     EMBED / SUPPORTED MODE

SPOTIFY
Status       NOT CONNECTED
Playback     PROVIDER DEPENDENT
```

This is intentionally more technical than the normal user-facing settings page.

---

# 81. SECURITY PRINCIPLES

Provider integrations must follow least privilege.

Do not request more permissions than required.

Do not store unnecessary credentials.

Do not expose secrets to client-side code.

Do not store authentication tokens in arbitrary local storage unless the provider's documented mechanism explicitly permits it and the security implications are understood.

Use secure browser authentication flows where required.

---

# 82. PRIVACY

Provider integrations should collect as little user data as possible.

The local library should remain local-first where possible.

The application should clearly distinguish:

```text
LOCAL LIQUEAMP DATA
```

from:

```text
EXTERNAL PROVIDER DATA
```

Users should be able to understand what information is stored locally and what is sent to an external provider.

---

# 83. ARCHITECTURAL BOUNDARIES

The provider layer may depend on:

```text
provider APIs
network layer
normalization utilities
provider types
```

The provider layer should not directly own:

```text
UI state
playlist state
favorite state
history state
theme state
global navigation
```

Those belong to other application layers.

---

# 84. DEPENDENCY DIRECTION

Preferred dependency direction:

```text
UI
 ?
Application State
 ?
Playback / Library Services
 ?
Provider Registry
 ?
Provider Adapters
 ?
External Provider APIs
```

Avoid:

```text
Provider
 ?
React component
 ?
Global application state
```

Providers should remain replaceable.

---

# 85. NO PROVIDER LOCK-IN

The LIQUEAMP data model should not become dependent on a single provider.

Users should be able to:

```text
import
organize
favorite
queue
playlist
share
remove
re-resolve
```

media regardless of source.

---

# 86. FUTURE PROVIDERS

The system should make future providers possible without redesigning the application.

Potential future examples:

```text
Apple Music
Bandcamp
Mixcloud
Podcast providers
Local files
NAS/network streams
Other radio directories
```

Do not implement these unless explicitly requested.

Build the architecture so that they can be added later.

---

# 87. IMPORTANT IMPLEMENTATION RULE

Before implementing provider functionality, Claude Code must inspect the existing repository.

Do not assume:

```text
React structure
router
state library
audio architecture
CSS system
database
storage
```

already match this document.

First inspect.

Then integrate into the existing architecture.

Do not blindly replace working project structure.

---

# 88. EXISTING CODE TAKES PRECEDENCE WHEN SAFE

If the existing codebase already contains a functional abstraction that satisfies this specification, reuse it.

Do not rewrite functioning systems merely to make file names match this document.

The purpose of this document is architectural guidance, not unnecessary refactoring.

---

# 89. TYPESCRIPT

Provider code should be strongly typed.

Avoid:

```ts
any
```

unless there is a compelling external-library reason.

External provider responses should be validated and transformed into internal types.

Do not allow raw external API response shapes to spread throughout the application.

---

# 90. NORMALIZATION BOUNDARY

External provider data should be transformed immediately.

Conceptually:

```text
External API response
        ?
Provider adapter
        ?
Validation
        ?
Normalization
        ?
LIQUEAMP MediaItem
        ?
Application
```

The rest of LIQUEAMP should not need to understand provider-specific response schemas.

---

# 91. FINAL PROVIDER ARCHITECTURE

The intended architecture is:

```text
                         LIQUEAMP
                            ¦
                            ?
                    +---------------+
                    ¦ Application   ¦
                    ¦ State         ¦
                    +---------------+
                            ¦
               +-------------------------+
               ¦                         ¦
               ?                         ?
        +--------------+         +--------------+
        ¦ Library      ¦         ¦ Playback     ¦
        ¦ / Queue      ¦         ¦ Engine       ¦
        +--------------+         +--------------+
               ¦                        ¦
               +------------------------+
                           ?
                  +------------------+
                  ¦ Provider Registry¦
                  +------------------+
                           ¦
          +----------------+-----------------+
          ¦                ¦                 ¦
          ?                ?                 ?
     DirectStream       Radio           External
     Provider           Provider        Providers
                                          ¦
                         +----------------+---------------+
                         ?                ?               ?
                      YouTube          Spotify       SoundCloud
                         ¦
                         ?
                   Official APIs /
                   embeds / SDKs /
                   supported browser
                   mechanisms
```

---

# 92. FINAL RULES FOR CLAUDE CODE

When implementing LIQUEAMP providers:

1. Read this entire document before implementing provider code.

2. Read:

```text
LIQUEAMP_SPEC.md
LIQUEAMP_ARCHITECTURE.md
LIQUEAMP_DESIGN.md
LIQUEAMP_PROVIDERS.md
```

3. Inspect the existing repository before making architectural changes.

4. Do not create independent players for different providers.

5. Maintain one centralized playback engine.

6. Normalize all provider content into the LIQUEAMP media model.

7. Keep provider-specific code inside provider adapters.

8. Do not leak provider API response structures into the UI.

9. Respect browser CORS and codec limitations.

10. Respect provider authentication and access requirements.

11. Use official APIs, SDKs, embeds, and documented mechanisms where applicable.

12. Never implement DRM bypass, protected-media extraction, authentication bypass, or similar circumvention.

13. Never fake provider metadata.

14. Never fake playback capability.

15. Never fake technical metrics.

16. Make provider limitations visible to the user.

17. Keep authentication and secrets secure.

18. Make provider errors understandable.

19. Ensure providers integrate with:

```text
Queue
Playlists
Favorites
History
Search
Quick Actions
Media Session
Settings
/control
```

20. Test each provider independently and through the centralized playback engine.

21. Do not allow provider-specific failures to crash the main application.

22. Preserve the user's library even if a provider becomes unavailable.

23. Build the provider layer so new providers can be added later.

24. Keep the application modular.

25. Do not turn LIQUEAMP into a collection of separate provider applications.

The final result should feel like one coherent music application whose media can originate from many different sources.

---

# 93. SUCCESS CRITERIA

The provider architecture is successful when:

```text
A user can paste a supported URL
        ?
LIQUEAMP detects the provider
        ?
LIQUEAMP resolves the source
        ?
LIQUEAMP normalizes the metadata
        ?
LIQUEAMP determines playback capability
        ?
The item enters the normal LIQUEAMP system
        ?
Queue / playlist / favorites / history work normally
        ?
The centralized player controls playback
```

The user should not need to understand the internal provider architecture.

The provider system should disappear behind the LIQUEAMP experience.
