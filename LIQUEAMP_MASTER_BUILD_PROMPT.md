# LIQUEAMP — MASTER BUILD PROMPT

Version: 1.0
Status: Build Specification
Project: LIQUEAMP

---

# 1. ROLE

You are Claude Code working directly inside the LIQUEAMP project repository.

Your task is to inspect the existing project, understand its current architecture, and then build LIQUEAMP according to the project's documented specifications.

You are not being asked to create a mockup.

You are being asked to build the actual functional application.

The result must be a working, maintainable, responsive music/radio web application and PWA.

---

# 2. SOURCE OF TRUTH

Before changing any code, read all of these files:

```text
LIQUEAMP_SPEC.md
LIQUEAMP_ARCHITECTURE.md
LIQUEAMP_DESIGN.md
LIQUEAMP_PROVIDERS.md
LIQUEAMP_THEMING.md
LIQUEAMP_VISUALIZERS.md
```

Also inspect:

```text
liqueampui.png
```

The documents and image together form the primary specification.

Do not begin implementation before reading them.

---

# 3. IMPORTANT: INSPECT FIRST

Before modifying the project:

1. Inspect the repository structure.
2. Identify the framework.
3. Identify the package manager.
4. Identify the current routing system.
5. Identify the current component architecture.
6. Identify the current state management.
7. Identify the current CSS/styling system.
8. Identify existing audio/playback code.
9. Identify existing persistence/storage.
10. Identify existing PWA configuration.
11. Identify existing dependencies.
12. Identify whether provider integrations already exist.
13. Identify what is already functional.
14. Identify what is placeholder/mock functionality.
15. Identify build and runtime commands.

Do not blindly replace the existing project.

Reuse good existing architecture where appropriate.

---

# 4. DO NOT MAKE A MOCKUP

This is a functional application.

Do not stop after creating:

```text
static UI
fake buttons
fake player
fake playlists
fake radio data
fake metrics
fake visualizers
fake provider integrations
```

Buttons must perform their actual intended actions.

If functionality cannot yet be implemented because an external provider requires authentication or does not expose the necessary browser capability, implement the correct capability-aware state rather than pretending it works.

---

# 5. PRODUCT

The product is called:

```text
LIQUEAMP
```

Do not use:

```text
CLIAMP
```

The provided image may contain the old name "CLIAMP" as part of the visual reference.

The actual application name must be:

```text
LIQUEAMP
```

---

# 6. PRODUCT CONCEPT

LIQUEAMP is a personal web-based music and radio application.

It should combine:

```text
Music player
Internet radio
Direct streams
Playlists
Favorites
History
Queue
Search
Provider integrations
Theme system
Visualizers
PWA functionality
Control panel
```

into one coherent application.

The application should feel like specialized music/radio software rather than a generic SaaS dashboard.

---

# 7. DESIGN REFERENCE

The file:

```text
liqueampui.png
```

is the primary visual reference.

Inspect it carefully.

Use it to understand:

```text
information density
panel structure
navigation
typography
terminal aesthetic
visual hierarchy
player layout
radio browser
status areas
technical metadata
```

Do not blindly copy every literal value from the image.

The image is a design reference.

The written specifications define the actual product behavior.

---

# 8. VISUAL DIRECTION

The final interface must have:

```text
dark charcoal
deep forest green
warm orange / peach
muted mint / green
terminal-like typography
precise grid
technical metadata
thin borders
controlled glow
dense information
```

The visual language should feel:

```text
technical
retro-futuristic
terminal-inspired
specialized
professional
dense
precise
```

It should not feel like:

```text
generic SaaS
generic admin dashboard
Spotify clone
glassmorphism
mobile banking app
generic rounded-card UI
```

---

# 9. CRITICAL LAYOUT RULE

All windows/panels must be properly contained.

Never allow:

```text
panel overlap
floating accidental windows
elements covering other elements
broken grid
horizontal overflow
unexpected clipping
```

The layout must use:

```text
CSS Grid
Flexbox
responsive constraints
```

rather than arbitrary absolute positioning.

Panels should be:

```text
straight
aligned
contained
structured
```

---

# 10. DESKTOP APPLICATION

Desktop should present LIQUEAMP as a unified dashboard.

Major areas:

```text
Header
Sidebar
Now Playing
Radio Browser
Playlists/Favorites/History
Queue
Station Info
Quick Actions
Audio Controls
Crossfade
Player
Appearance
Visualizer
Status Bar
```

Do not turn these into unrelated pages unless navigation requires it.

The user should be able to understand the application as one connected workspace.

---

# 11. MOBILE APPLICATION

The application must be responsive.

Mobile is not a separate application.

It is the same application adapted to a narrow viewport.

Target:

```text
9:16
```

The mobile interface should feel like a native music application.

Use:

```text
touch-friendly controls
safe-area support
bottom navigation where appropriate
stacked panels
compact metadata
large artwork
mobile player
```

Avoid simply shrinking the desktop UI.

---

# 12. NAVIGATION

Main navigation should include:

```text
NOW PLAYING
BROWSE
PLAYLISTS
FAVOURITES
HISTORY
SETTINGS
```

Additional library categories may appear below.

The exact implementation should follow the existing architecture and design document.

---

# 13. GLOBAL PLAYBACK

This is one of the most important requirements.

There must be exactly one logical global playback session.

Do not create independent audio players for:

```text
radio
YouTube
Spotify
SoundCloud
direct streams
```

The architecture must be:

```text
UI
 ↓
Application State
 ↓
Central Playback Engine
 ↓
Provider Adapter
 ↓
Playback mechanism
```

Changing screens must not unnecessarily stop playback.

Changing visualizers must not stop playback.

Changing themes must not stop playback.

---

# 14. PLAYER

The player must support where technically available:

```text
Play
Pause
Previous
Next
Seek
Volume
Mute
Shuffle
Repeat
Queue
Favorite
```

Controls must reflect actual provider capabilities.

Never show a control that appears functional when the underlying provider does not support it.

---

# 15. MEDIA MODEL

All media must be normalized into a common internal model.

Conceptually:

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

Adapt this to the existing architecture if an equivalent model already exists.

---

# 16. PROVIDERS

Initial providers:

```text
Direct Stream
Internet Radio
YouTube
YouTube Music
Spotify
SoundCloud
```

Use provider adapters.

The rest of the application must not contain provider-specific playback logic.

---

# 17. PROVIDER RULES

Providers must use:

```text
official APIs
official SDKs
official embeds
supported browser mechanisms
documented integration mechanisms
```

Do not implement:

```text
DRM bypass
protected audio extraction
authentication bypass
credential theft
cookie theft
unofficial protected-media downloading
```

If a provider cannot provide direct playback:

```text
show metadata if available
show the limitation
provide an official external/open action where appropriate
```

Never fake direct playback.

---

# 18. URL IMPORT

The application must support pasting URLs.

Pipeline:

```text
URL
 ↓
Normalize
 ↓
Detect provider
 ↓
Validate
 ↓
Resolve
 ↓
Metadata
 ↓
Artwork
 ↓
Playback capability
 ↓
Preview
 ↓
Import
```

Examples:

```text
YouTube URL
Spotify URL
SoundCloud URL
Direct MP3
M3U
M3U8
PLS
Radio stream
```

---

# 19. DIRECT STREAMS

Support browser-compatible direct streams where technically possible.

Potential formats:

```text
MP3
AAC
OGG
Opus
M3U
M3U8
PLS
```

Do not assume every URL is playable.

Check actual browser/network capability.

Handle:

```text
CORS
codec support
network failure
buffering
seekability
live state
```

---

# 20. INTERNET RADIO

Radio is a first-class source.

Support:

```text
Radio
Genres
Locations
Mood
Search
Filter
Sort
Favorites
```

Station information may include:

```text
name
stream URL
homepage
favicon
artwork
genre
country
language
codec
bitrate
listeners
tags
description
status
```

Only display values that are actually available.

Never invent listener counts or stream metrics.

---

# 21. RADIO METADATA

When available, support live metadata such as:

```text
Artist
Title
Now Playing
ICY metadata
```

Metadata updates must not restart the stream.

---

# 22. QUEUE

Implement a functional queue.

Support:

```text
add
remove
play next
reorder
drag/reorder
clear
shuffle
```

The queue must work with all normalized `MediaItem` objects.

---

# 23. PLAYLISTS

Implement:

```text
create
rename
delete
add media
remove media
reorder
play
shuffle
```

Persist playlists.

Do not store provider-specific UI objects in playlists.

---

# 24. FAVORITES

Favorites should support:

```text
tracks
stations
media sources
playlists
```

Persist favorites.

---

# 25. HISTORY

History should record actual playback activity.

Possible fields:

```text
mediaId
startedAt
endedAt
durationPlayed
completionPercentage
```

Provide a way to clear history.

Do not create fake history entries in production.

---

# 26. SEARCH

Search should support relevant local/application data:

```text
title
artist
album
station
genre
category
tags
playlist
```

Provider search should only be used where officially supported.

Normalize provider results before displaying them.

---

# 27. QUICK ACTIONS

Provide capability-aware actions:

```text
Play Now
Add to Queue
Add to Favourites
Add to Playlist
Share
Open Source
More
```

Do not display actions that cannot actually work.

---

# 28. SHARING

Prefer Web Share API where available.

Fallback:

```text
copy source URL
```

Do not invent fake sharing endpoints.

---

# 29. NOW PLAYING

The Now Playing area should include relevant metadata such as:

```text
provider
media type
quality
artwork
artist
title
album
tags
live status
station
bitrate
codec
progress
visualizer
controls
```

Only display values that are real.

---

# 30. TECHNICAL METADATA

Where available:

```text
bitrate
codec
sample rate
listeners
buffer
latency
stream state
```

may be displayed.

Do not fabricate values.

If unavailable:

```text
—
```

or omit the field.

---

# 31. STATUS BAR

The status bar may show actual measurable information such as:

```text
connection state
buffering state
latency
uptime
network state
```

Only show metrics that are actually measured.

Never invent:

```text
CPU
RAM
network speed
latency
buffer
uptime
```

for visual effect.

---

# 32. SETTINGS

User-facing Settings should contain normal user preferences.

Examples:

```text
Playback
Audio
Appearance
Visualizer
Behavior
Keyboard
Accessibility
PWA
```

Do not put technical provider administration here unless appropriate.

---

# 33. CONTROL PANEL

Create/maintain:

```text
/control
```

as the advanced/private configuration area.

It should handle things such as:

```text
provider configuration
theme management
theme import/export
media management
categories
stream sources
application configuration
diagnostics
```

Do not confuse `/control` with normal user Settings.

---

# 34. PERSISTENCE

Use the architecture specified in:

```text
LIQUEAMP_ARCHITECTURE.md
```

Prefer local-first storage.

Likely data:

```text
settings
themes
playlists
favorites
history
categories
media library
provider configuration
visualizer settings
```

Use IndexedDB or the existing persistence architecture.

---

# 35. IMPORT / EXPORT

Support exporting/importing user data where appropriate.

Data should include:

```text
playlists
favorites
history
categories
themes
settings
library metadata
```

Do not export secrets or authentication tokens.

---

# 36. THEMING

Implement the theme system from:

```text
LIQUEAMP_THEMING.md
```

The application must use semantic CSS variables.

Avoid hard-coded colors in reusable components.

Core variables include:

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

---

# 37. DEFAULT THEME

The default visual identity:

```text
dark charcoal
deep forest green
warm orange / peach
muted mint
terminal typography
controlled glow
```

Use:

```text
Doto
```

where appropriate according to the design specification.

---

# 38. TINTED THEMING

Implement the architecture for importing compatible:

```text
Base16
Base24
Tinted8
```

themes where practical.

Support:

```text
import
preview
semantic mapping
save
activate
edit
duplicate
rename
delete
export
```

The semantic mapping must remain configurable.

---

# 39. VISUALIZERS

Implement the visualizer system from:

```text
LIQUEAMP_VISUALIZERS.md
```

Initial visualizers:

```text
Spectrum Bars
Waveform
Terminal Spectrum
Minimal Meter
Oscilloscope
```

Potential later visualizers:

```text
Circular Spectrum
Particles
Dot Matrix
Spectrogram
```

---

# 40. REAL AUDIO ANALYSIS

Where raw audio is available:

```text
Audio
 ↓
Web Audio API
 ↓
AnalyserNode
 ↓
real frequency/waveform data
 ↓
visualizer
```

Do not generate fake audio-reactive data.

If raw audio is unavailable because of provider restrictions:

```text
say so
disable real analysis
or use clearly labeled ambient animation
```

---

# 41. VISUALIZER PERFORMANCE

Do not put frame-by-frame audio data into React state.

Prefer:

```text
Canvas
requestAnimationFrame
mutable renderer state
reusable buffers
```

The visualizer must not cause the entire application to rerender at 60 FPS.

---

# 42. VISUALIZER FAILURE

If visualizer initialization fails:

```text
disable visualizer
continue playback
```

The visualizer must never stop or break the player.

---

# 43. MEDIA SESSION

Use Media Session API where supported.

Support:

```text
play
pause
previous
next
seek
```

and expose:

```text
title
artist
album
artwork
```

where available.

---

# 44. KEYBOARD SHORTCUTS

Implement where appropriate:

```text
Space       Play/Pause
N           Next
P           Previous
M           Mute
←           Seek backward
→           Seek forward
↑           Volume up
↓           Volume down
```

Do not trigger global shortcuts while the user is typing in:

```text
input
textarea
select
contenteditable
```

---

# 45. ACCESSIBILITY

Implement:

```text
ARIA
keyboard navigation
visible focus
screen reader labels
accessible sliders
adequate contrast
reduced motion
semantic HTML
```

Do not rely on color alone to communicate state.

---

# 46. RESPONSIVE DESIGN

Desktop and mobile must use the same architecture.

Desktop:

```text
multi-panel dashboard
```

Mobile:

```text
stacked / reorganized dashboard
mobile player
touch controls
bottom navigation where appropriate
```

No horizontal page overflow.

---

# 47. GRID REQUIREMENT

All desktop panels must align to a coherent grid.

Do not solve layout problems by randomly adding:

```css
position: absolute;
top: ...
left: ...
```

unless there is a deliberate, contained reason.

Use:

```text
CSS Grid
Flexbox
responsive sizing
min/max constraints
```

---

# 48. NO OVERLAPPING WINDOWS

This requirement is strict.

Never allow:

```text
window A
over
window B
```

unless the element is intentionally an overlay such as:

```text
dialog
popover
dropdown
context menu
toast
```

Normal dashboard panels must never overlap.

---

# 49. TYPOGRAPHY

Use the typography defined in the design document.

The interface should prioritize:

```text
technical readability
monospace metadata
compact labels
strong hierarchy
```

Avoid excessive oversized headings.

---

# 50. INFORMATION DENSITY

LIQUEAMP should intentionally contain a lot of useful information.

Do not simplify it into a sparse generic dashboard.

However:

```text
dense ≠ cluttered
```

Use:

```text
alignment
spacing
hierarchy
borders
typography
```

to maintain readability.

---

# 51. ANTI-GENERIC-SaaS RULE

Do not introduce:

```text
glassmorphism
huge rounded cards
massive gradients
floating dashboard cards
excessive shadows
huge whitespace
generic purple AI gradients
```

unless specifically required by a future design change.

---

# 52. ERROR HANDLING

Errors must be meaningful.

Bad:

```text
Something went wrong.
```

Preferred:

```text
STREAM ERROR

The browser could not access this stream.
The source may require CORS support.

[OPEN SOURCE]
```

The exact wording should depend on the actual error.

---

# 53. LOADING STATES

Loading states should be honest.

Examples:

```text
DETECTING SOURCE...
RESOLVING...
LOADING METADATA...
CONNECTING...
BUFFERING...
```

Do not display fake progress percentages unless actual progress is known.

---

# 54. EMPTY STATES

Every important list should have a useful empty state.

Examples:

```text
NO FAVOURITES

Add a station or track to your favourites.
```

```text
QUEUE EMPTY

Add something to start building the queue.
```

Avoid meaningless empty cards.

---

# 55. DEMO DATA

Development/demo data may be used during implementation.

Clearly distinguish:

```text
demo/development data
```

from:

```text
real provider data
```

Demo data must not be presented as real-world live information.

---

# 56. PERFORMANCE

Prioritize:

```text
fast initial render
stable playback
stable UI
low memory usage
efficient visualizers
minimal unnecessary rerenders
```

Do not optimize by removing core functionality.

---

# 57. PLAYBACK PERFORMANCE

The audio element/player must not be recreated unnecessarily.

Do not cause:

```text
audio restart
lost position
lost metadata
buffer reset
```

when unrelated UI state changes.

---

# 58. STATE ARCHITECTURE

Separate:

```text
persistent state
session state
ephemeral UI state
```

Examples:

Persistent:

```text
themes
playlists
favorites
settings
history
```

Session:

```text
current media
queue
playback state
```

Ephemeral:

```text
dialogs
hover
temporary notifications
loading states
```

---

# 59. COMPONENT ARCHITECTURE

Keep components modular.

Likely areas:

```text
components/
player/
radio/
library/
playlists/
queue/
settings/
control/
themes/
visualizers/
providers/
```

Adapt to existing project architecture.

Do not create a single giant component containing the entire application.

---

# 60. PROVIDER ARCHITECTURE

Use:

```text
providers/
```

or the equivalent existing structure.

Each provider should be isolated.

Examples:

```text
DirectStreamProvider
RadioProvider
YouTubeProvider
YouTubeMusicProvider
SpotifyProvider
SoundCloudProvider
```

---

# 61. SERVICE ARCHITECTURE

Use services for:

```text
playback
storage
providers
theme management
audio analysis
media session
URL detection
import/export
```

Do not put all application logic into React components.

---

# 62. TYPES

Use strong TypeScript types.

Avoid:

```ts
any
```

unless unavoidable due to an external dependency.

External data should be validated and normalized before entering the application.

---

# 63. SECURITY

Do not expose:

```text
private API keys
client secrets
refresh tokens
passwords
private credentials
```

in frontend source code.

Use appropriate server-side boundaries where required.

---

# 64. AUTHENTICATION

Where a provider requires authentication:

```text
not connected
 ↓
connect
 ↓
official auth flow
 ↓
connected
```

Authentication state should be explicit.

Never silently assume the user is authenticated.

---

# 65. CORS

Do not blindly proxy every external request.

If a source cannot be accessed because of browser security:

```text
report the limitation
```

rather than creating an unsafe workaround.

---

# 66. TESTING

Create tests for important logic.

At minimum:

```text
URL detection
provider detection
URL normalization
theme parsing
theme mapping
theme persistence
playlist operations
queue operations
favorites
history
player state
visualizer state
```

Provider-specific tests should exist where practical.

---

# 67. BUILD VERIFICATION

After implementation:

1. Run the development server.
2. Run TypeScript checks.
3. Run linting if configured.
4. Run production build.
5. Fix build errors.
6. Fix runtime errors.
7. Inspect the actual rendered application.
8. Test desktop layout.
9. Test mobile layout.
10. Test playback.
11. Test persistence.
12. Test theme switching.
13. Test visualizers.
14. Test PWA behavior.

Do not declare success merely because the code compiles.

---

# 68. VISUAL VERIFICATION

Inspect the actual application visually.

Look specifically for:

```text
panel overlap
misaligned borders
overflow
cropped text
broken buttons
bad spacing
incorrect hierarchy
mobile overflow
visualizer clipping
broken dialogs
theme inconsistencies
```

Fix these before finishing.

---

# 69. BROWSER TESTING

Test where possible in:

```text
Chrome
Firefox
Safari
```

and at least:

```text
desktop viewport
mobile viewport
```

Test actual interaction, not only screenshots.

---

# 70. MOBILE TESTING

Check:

```text
touch targets
safe areas
bottom navigation
scrolling
player controls
volume
queue
dialogs
theme editor
visualizer
PWA standalone mode
```

No critical control should be inaccessible on mobile.

---

# 71. PWA

Implement/maintain:

```text
manifest
service worker
offline shell
installability
standalone mode
icons
```

The application should continue to provide its local interface when offline.

External provider playback may naturally be unavailable offline.

---

# 72. OFFLINE-FIRST

Local functionality should remain useful without network access.

For example:

```text
settings
themes
playlists
favorites
history
library metadata
```

should remain available.

---

# 73. MEDIA SESSION

Verify that Media Session actions map to the same centralized playback engine.

Do not create separate playback behavior for Media Session.

---

# 74. NO DUPLICATE SYSTEMS

Before adding any new system, check whether the repository already contains:

```text
audio service
storage service
theme system
provider system
state store
router
PWA setup
```

If one exists and is sound:

```text
reuse it
```

Do not create a duplicate implementation.

---

# 75. DOCUMENTATION

If implementation decisions materially change the architecture:

Update the relevant documentation.

Do not allow:

```text
documentation says A
code does B
```

without documenting the reason.

---

# 76. DEVELOPMENT ORDER

Implement in sensible phases.

Recommended order:

```text
PHASE 1
Repository inspection
Architecture audit

PHASE 2
Core application shell
Grid
Navigation
Theme tokens

PHASE 3
Central playback engine

PHASE 4
Direct streams

PHASE 5
Radio

PHASE 6
Library
Favorites
History
Playlists
Queue

PHASE 7
URL import

PHASE 8
Provider adapters

PHASE 9
Theme editor
Tinted/Base16 support

PHASE 10
Audio analysis

PHASE 11
Visualizers

PHASE 12
Media Session
Keyboard
Accessibility

PHASE 13
PWA
Offline behavior

PHASE 14
Control panel

PHASE 15
Testing
Performance
Visual refinement
```

Do not implement everything as one giant uncontrolled change.

---

# 77. INCREMENTAL DEVELOPMENT

After each major phase:

```text
build
run
test
inspect
fix
```

Do not accumulate hundreds of changes and only test at the end.

---

# 78. GIT SAFETY

Before making large architectural changes:

Inspect the repository state.

Do not destroy existing work.

Do not reset or delete user code unless explicitly required.

Do not overwrite existing functionality merely because it differs from the document.

---

# 79. EXISTING REPO TAKES PRIORITY

If the existing repository contains a working feature that is not described perfectly in these documents:

Determine whether it should be preserved.

The goal is:

```text
functional existing system
+
documented LIQUEAMP architecture
```

not:

```text
delete everything
rebuild blindly
```

---

# 80. IMAGE REFERENCE

The uploaded:

```text
liqueampui.png
```

must be inspected visually.

Pay particular attention to:

```text
panel proportions
spacing
navigation
header
Now Playing
radio list
queue
station information
status bar
terminal typography
visual density
```

Use the image as the visual anchor.

---

# 81. IMPORTANT VISUAL CORRECTION

The reference image may contain:

```text
CLIAMP
```

but the application must display:

```text
LIQUEAMP
```

Do not copy the old product name into the implementation.

---

# 82. FINAL UI CHARACTER

The finished interface should feel like:

```text
a real specialized music/radio workstation
```

rather than:

```text
a website pretending to be a terminal
```

The terminal aesthetic should emerge from:

```text
typography
information density
grid
borders
technical labels
color
glow
status information
```

not from unnecessary fake terminal animations.

---

# 83. NO FAKE FUNCTIONALITY

This rule applies everywhere.

Never implement:

```text
fake loading
fake stream status
fake listener counts
fake CPU usage
fake memory usage
fake bitrate
fake latency
fake visualizer data
fake provider connection
fake authentication
fake playback
```

If something is unavailable:

```text
show unavailable
```

---

# 84. REAL METRICS ONLY

If the interface displays:

```text
CPU
memory
latency
buffer
network
FPS
```

the value must come from an actual measurement.

If browser APIs do not provide the metric reliably:

```text
omit it
```

or show:

```text
N/A
```

---

# 85. NO OVERENGINEERING

Build the system in a maintainable way.

Avoid creating unnecessary:

```text
frameworks
abstraction layers
generic engines
configuration systems
```

that the application does not need.

The architecture should be:

```text
modular
typed
understandable
testable
extensible
```

---

# 86. NO UNDERENGINEERING

Do not solve everything with:

```text
one component
one state object
one audio element per screen
hard-coded arrays
hard-coded colors
hard-coded provider logic
```

The application is intended to grow.

Build the core boundaries correctly.

---

# 87. FINAL INTEGRATION

At the end, all systems must work together:

```text
                    LIQUEAMP
                       │
       ┌───────────────┼────────────────┐
       │               │                │
       ▼               ▼                ▼
   Navigation      Library          Settings
       │               │                │
       └───────┬───────┴────────┬───────┘
               │                │
               ▼                ▼
             Queue          Theme System
               │                │
               └───────┬────────┘
                       ▼
                Playback Engine
                       │
                       ▼
                Provider Registry
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
     Direct          Radio        External
     Streams                        Providers
                                      │
                              ┌───────┼───────┐
                              ▼       ▼       ▼
                            YouTube Spotify SoundCloud


Playback Engine
       │
       ├── Media Session
       │
       ├── Audio Analysis
       │
       └── Visualizer
```

---

# 88. ACCEPTANCE TEST

Before declaring the project complete, verify the following scenario:

```text
1. Start LIQUEAMP.

2. Application loads without errors.

3. Default theme is applied.

4. Desktop layout is aligned.

5. No normal panels overlap.

6. Mobile layout works.

7. Navigation works.

8. A direct stream can be imported.

9. Metadata is displayed.

10. Playback starts.

11. Pause works.

12. Volume works.

13. Seek works where supported.

14. Queue works.

15. Playlist works.

16. Favorite works.

17. History is recorded.

18. Theme can be changed.

19. Theme persists after reload.

20. Visualizer responds to real audio where available.

21. Changing visualizer does not stop audio.

22. Disabling visualizer does not stop audio.

23. Provider limitations are communicated honestly.

24. Media Session works where supported.

25. Keyboard shortcuts work.

26. PWA can install where supported.

27. Offline shell works.

28. Control panel works.

29. No fake metrics are shown.

30. Production build succeeds.
```

---

# 89. FINAL QUALITY CHECK

Before finishing, ask:

```text
Does this feel like LIQUEAMP?

Does the interface match liqueampui.png?

Are all panels aligned?

Are there accidental overlaps?

Does the player actually work?

Does the queue actually work?

Do playlists actually persist?

Does the theme system actually work?

Does the visualizer actually use real audio when possible?

Are provider limitations honest?

Is the application still usable on mobile?

Are there fake values anywhere?

Did I accidentally create duplicate playback systems?

Did I preserve existing functionality?

Did I introduce unnecessary complexity?
```

Fix any issue discovered.

---

# 90. FINAL PRINCIPLE

LIQUEAMP should ultimately be:

```text
A real music and radio application
with a distinctive terminal-inspired interface,
a centralized playback engine,
multiple provider adapters,
persistent local data,
a powerful theme system,
real audio visualizers,
responsive desktop/mobile layouts,
and an extensible architecture.
```

It should not be:

```text
a static mockup
a fake dashboard
a collection of disconnected provider widgets
a generic SaaS template
```

Build the actual product.

---

# 91. START NOW

Begin by:

```text
1. Inspecting the repository.
2. Reading all LIQUEAMP documentation.
3. Inspecting liqueampui.png.
4. Auditing the current architecture.
5. Reporting the existing architecture briefly.
6. Identifying what can be reused.
7. Identifying missing systems.
8. Creating an implementation plan.
9. Implementing incrementally.
10. Testing after every major phase.
```

Do not ask for confirmation merely because implementation contains multiple steps.

Proceed autonomously where the specifications are clear.

Only stop and ask for clarification when an essential product decision genuinely cannot be determined from:

```text
LIQUEAMP_SPEC.md
LIQUEAMP_ARCHITECTURE.md
LIQUEAMP_DESIGN.md
LIQUEAMP_PROVIDERS.md
LIQUEAMP_THEMING.md
LIQUEAMP_VISUALIZERS.md
liqueampui.png
```

Otherwise make the implementation decision that best preserves the documented architecture and product philosophy.

---

# END OF LIQUEAMP MASTER BUILD PROMPT
