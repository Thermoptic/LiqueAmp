
# LIQUEAMP — Product Specification

Version: 1.0  
Status: Active Development

---

# 1. Product Overview

LIQUEAMP is a personal web-based music and streaming application designed
primarily as a mobile-first Progressive Web App (PWA), while also providing
a complete desktop dashboard experience.

LIQUEAMP combines:

- Music playback
- Internet radio
- Personal media sources
- Playlists
- Favorites
- History
- Queue management
- Search
- Categories
- Tags
- Provider integrations
- Audio controls
- Audio visualization
- Theme customization
- Administrative configuration

LIQUEAMP should feel like a dedicated music terminal and media dashboard,
not like a generic SaaS application.

The application should feel dense, useful, technical and alive.

---

# 2. Product Name

The official product name is:

```text
LIQUEAMP
````

Version:

```text
v1.0
```

The name LIQUEAMP must be used consistently throughout the application.

Do not use CLIAMP as the application name.

---

# 3. Core Product Philosophy

LIQUEAMP is intended to be a real, functional music application.

It must NOT be treated as a static UI mockup.

Every visible interactive feature should either:

1. Work completely.
2. Have a real underlying implementation.
3. Or clearly indicate that configuration, authentication or provider support
   is required.

Never create fake functionality simply to make the interface appear
complete.

Never generate fake data and present it as real data.

When a feature is technically unavailable, explain the limitation clearly.

---

# 4. Primary Platform

LIQUEAMP is primarily designed for:

```text
Mobile Web
Mobile PWA
```

Desktop web is also an important platform.

The same application should adapt between:

```text
Mobile
Tablet
Desktop
```

The mobile version should feel like a native music application.

The desktop version should feel like a dedicated music terminal/dashboard.

---

# 5. PWA

LIQUEAMP should be installable as a Progressive Web App.

The application should support:

* Web App Manifest
* Service Worker
* Offline application shell
* Standalone mode
* Application icons
* Mobile safe areas
* Persistent playback where browser capabilities permit
* Media Session API

External streams should not be assumed to work offline.

Offline functionality should focus on the application itself and locally
stored configuration/data.

---

# 6. Main Application Concept

The main application should be a unified music dashboard.

The user should be able to access most important functionality without
constantly navigating between separate pages.

Core areas include:

```text
NOW PLAYING
BROWSE
RADIO
LIBRARY
PLAYLISTS
FAVOURITES
HISTORY
QUEUE
SEARCH
SETTINGS
```

The dashboard should feel like one coherent system.

Avoid unnecessary page transitions.

The player should remain persistent while the user navigates through the
application.

---

# 7. Main Desktop Layout

The desktop application should use a structured grid.

Conceptually:

```text
+--------------------------------------------------------------------+
¦ HEADER                                                             ¦
+--------------------------------------------------------------------¦
¦               ¦                                 ¦                  ¦
¦ NAVIGATION    ¦          NOW PLAYING            ¦ RADIO / BROWSE   ¦
¦               ¦                                 ¦                  ¦
¦ LIBRARY       ¦          PLAYER                 ¦ SEARCH           ¦
¦               ¦          VISUALIZER             ¦ STATIONS         ¦
¦               ¦                                 ¦                  ¦
+--------------------------------------------------------------------¦
¦ PLAYLISTS / FAVOURITES / HISTORY / QUEUE / STATION INFORMATION     ¦
+--------------------------------------------------------------------¦
¦ AUDIO / PLAYER / APPEARANCE / VISUALIZER CONTROLS                 ¦
+--------------------------------------------------------------------¦
¦ STATUS                                                             ¦
+--------------------------------------------------------------------+
```

This is a conceptual structure.

The final exact dimensions and proportions are defined in:

```text
LIQUEAMP_DESIGN.md
```

---

# 8. No Overlapping Windows

All application panels must be properly contained inside the layout.

Panels must NOT:

* overlap each other
* randomly float above other panels
* cover important controls
* extend outside their containers
* collide at responsive breakpoints

Use:

```text
CSS Grid
Flexbox
Responsive layout systems
```

Avoid arbitrary absolute positioning for major interface sections.

The interface should have:

* clean alignment
* consistent gutters
* predictable spacing
* straight panel boundaries
* clear hierarchy

---

# 9. Mobile Layout

Mobile is a primary platform, not an afterthought.

The desktop dashboard should transform into a mobile-optimized interface.

Mobile should preserve the same conceptual areas:

```text
Now Playing
Queue
Browse
Radio
Library
Playlists
Favorites
History
Settings
```

but may use:

* stacked sections
* collapsible panels
* drawers
* bottom navigation
* expandable sections
* mobile-specific player controls

The mobile interface should feel like a native music app rather than a
desktop website squeezed into a phone screen.

---

# 10. Visual Design Direction

The visual identity is based on the supplied reference image:

```text
liqueampui.png
```

This image is a primary visual reference for the application.

It is not intended to be inserted into the application as a static image.

The application must recreate the design language using real HTML/CSS/UI
components.

The visual direction should combine:

* retro terminal aesthetics
* music player interface
* technical dashboard
* dense information layout
* dark charcoal
* deep forest green
* warm orange/peach
* muted mint/green
* subtle glow
* monospaced/technical typography
* precise grid layout
* strong borders
* compact information panels

The interface should feel like a piece of specialized software.

It should NOT resemble a generic modern SaaS dashboard.

---

# 11. Visual Reference

The file:

```text
liqueampui.png
```

must be treated as the primary visual reference.

Claude Code should inspect the image before implementing the UI.

The image defines the intended visual language, hierarchy and density.

It does not necessarily define exact pixel dimensions.

The implementation must adapt the visual language into a responsive,
functional application.

---

# 12. Typography

The interface should use a technical/terminal-oriented typeface.

The primary visual direction uses:

```text
Doto
```

where technically appropriate.

Typography should support:

* technical labels
* metadata
* timestamps
* bitrate
* status information
* station information
* navigation
* player controls
* headings

Typography should remain readable.

Do not sacrifice usability purely for visual styling.

---

# 13. Color Philosophy

The initial visual direction uses:

```text
Dark charcoal
Deep forest green
Warm orange
Peach
Muted mint
Dark neutral surfaces
```

Orange/peach should be used for:

* active states
* important controls
* playback indicators
* highlights
* selected elements

Green/mint should be used for:

* active/online states
* secondary accents
* technical information
* status indicators

The application should avoid excessive pure white.

The application should avoid excessive gradients.

The application should avoid excessive glassmorphism.

The application should avoid giant shadows.

---

# 14. Theme System

Themes must be configurable.

Users should eventually be able to change:

* Background
* Surface colors
* Text colors
* Accent colors
* Border colors
* Glow colors
* Visualizer colors
* Typography
* Interface accents

Theme configuration is described in:

```text
LIQUEAMP_THEMING.md
```

LIQUEAMP should use semantic design tokens rather than hard-coded colors.

---

# 15. Tinted Theming

LIQUEAMP should support Tinted Theming.

The application should preferably support official Tinted Theming scheme
formats rather than scraping the rendered Tinted Gallery website.

Supported formats should be designed around:

```text
Base16
Base24
Tinted8
```

where technically applicable.

The importer should:

1. Accept a theme file.
2. Detect its format.
3. Parse the palette.
4. Validate the scheme.
5. Map palette colors to LIQUEAMP semantic tokens.
6. Preview the theme.
7. Allow the user to save it.
8. Allow activation.
9. Allow editing.
10. Allow duplication.
11. Allow renaming.
12. Allow deletion.
13. Allow exporting.

Detailed implementation belongs in:

```text
LIQUEAMP_THEMING.md
```

---

# 16. Main Navigation

The primary navigation should include concepts such as:

```text
NOW PLAYING
BROWSE
PLAYLISTS
FAVOURITES
HISTORY
SETTINGS
```

The navigation should also expose the user's library/categories.

Example:

```text
LIBRARY

LOFI / CHILLHOP
SYNTHWAVE
ELECTRONIC
AMBIENT
DRUM & BASS
JAZZHOP
CHIPTUNES
AMIGA
HIP HOP
DOWNTEMPO
```

These are example categories only.

The user must be able to create and modify their own categories.

---

# 17. Now Playing

The Now Playing area is the primary focus of the application.

It should provide:

* Artwork
* Provider indicator
* Track title
* Artist
* Album
* Tags
* Playback status
* Duration
* Current position
* Progress bar
* Play/pause
* Previous
* Next
* Seek
* Volume
* Mute
* Shuffle
* Repeat
* Favorite
* Queue access
* Visualizer

Example metadata:

```text
[STREAM]
[RADIO]
[320 kbps]
```

The actual values must come from real media/provider information where
available.

Do not fabricate bitrate or provider metadata.

---

# 18. Playback Controls

The player should support:

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

The playback engine must be global.

Changing UI sections must not interrupt playback.

---

# 19. Queue

The queue should be a first-class feature.

Users should be able to:

* Add to queue
* Play next
* Remove
* Reorder
* Clear
* Shuffle
* Start playback from an item

The queue should be independent from playlists.

---

# 20. Playlists

Users should be able to:

* Create playlists
* Rename playlists
* Delete playlists
* Add media
* Remove media
* Reorder media
* Play playlists
* Shuffle playlists

Playlists should persist between sessions.

---

# 21. Favorites

Users should be able to favorite:

* Tracks
* Media sources
* Radio stations
* Playlists

Favorites should be accessible from the main navigation.

---

# 22. History

LIQUEAMP should maintain playback history.

History should contain meaningful playback events.

Example information:

```text
Track
Artist
Provider
Played at
Duration played
Completion percentage
```

Users should be able to:

* Browse history
* Replay an item
* Clear history

---

# 23. Radio

Internet radio is a first-class feature.

The radio browser should support:

```text
RADIO
GENRES
LOCATIONS
MOOD
```

Users should be able to:

* Search stations
* Filter stations
* Sort stations
* Play stations
* Favorite stations
* View station information
* Add stations to the library
* Add stations to the queue where applicable

Station information may include:

```text
Name
Artwork
Country
Language
Genre
Codec
Bitrate
Listeners
Homepage
Tags
Description
Online status
```

Only real data should be displayed as real data.

---

# 24. Direct Audio Streams

LIQUEAMP should support browser-playable direct audio sources where
technically possible.

Examples include:

```text
MP3
AAC
OGG
Opus
M3U
M3U8
PLS
```

The application should automatically detect direct streams where possible.

The browser's actual format support must be respected.

---

# 25. Media Providers

The application should be designed around a provider architecture.

Initial provider categories include:

```text
Direct Streams
Internet Radio
YouTube
YouTube Music
Spotify
SoundCloud
```

The architecture must allow additional providers to be added later.

Provider implementation details belong in:

```text
LIQUEAMP_PROVIDERS.md
```

---

# 26. Provider Restrictions

LIQUEAMP must respect provider terms, authentication systems, DRM and
technical restrictions.

The application must NOT:

* bypass DRM
* bypass authentication
* scrape protected content
* extract protected audio where prohibited
* circumvent provider restrictions

Use official APIs, SDKs, embeds and supported browser playback mechanisms
where applicable.

If a provider cannot provide a particular function, the application should
clearly explain the limitation.

---

# 27. URL Import

The user should be able to add a media source using a URL.

The system should:

```text
Detect URL
    ?
Identify provider
    ?
Validate
    ?
Resolve metadata
    ?
Determine playback method
    ?
Preview
    ?
Save
```

If the source is unsupported, the application should explain why.

Do not create a broken library entry simply because a URL was entered.

---

# 28. Search

Search should work across the user's local library.

Search should be able to find:

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

Search should be fast and suitable for mobile.

Provider-specific remote search can be added where supported.

---

# 29. Quick Actions

Media items should expose useful quick actions.

Examples:

```text
PLAY NOW
ADD TO QUEUE
ADD TO FAVOURITES
SHARE
MORE
```

Sharing should use the Web Share API where supported.

A fallback should exist where Web Share is unavailable.

---

# 30. Station Information

When a radio station or media source is selected, LIQUEAMP should provide
a station/media information panel.

Information may include:

```text
Artwork
Station name
Description
Genre
Country
Language
Codec
Bitrate
Listeners
Homepage
Provider
Tags
Online status
```

Again, only actual available information should be displayed.

---

# 31. Audio Controls

The interface should provide audio controls including:

```text
Volume
Mute
EQ
Bass
Mid
Treble
Crossfade
```

Where technically possible, audio controls should use real audio processing.

Provider limitations must be respected.

---

# 32. Visualizers

LIQUEAMP should support multiple visualizers.

Visualizers should be:

* switchable
* configurable
* performant
* modular
* theme-aware
* responsive

The user should eventually be able to create and save custom visualizer
configurations from `/control`.

Detailed visualizer architecture belongs in:

```text
LIQUEAMP_VISUALIZERS.md
```

---

# 33. Visualizer Generator

The `/control` area should eventually contain a visualizer generator.

The user should be able to:

* Create a visualizer
* Configure it
* Preview it
* Save it
* Rename it
* Duplicate it
* Edit it
* Delete it
* Set it as default

The system should support reusable visualizer configurations rather than
requiring the user to modify application source code.

---

# 34. Control Panel

The private administration/configuration area is:

```text
/control
```

The control panel is different from normal player settings.

It should eventually allow the user to manage:

```text
Media
Providers
Categories
Themes
Visualizers
Application Settings
Player Settings
Import / Export
PWA Settings
```

The control panel should be designed as a real functional administration
interface.

---

# 35. Media Management

The control panel should allow the user to:

* Add media
* Edit media
* Remove media
* Enable/disable media
* Assign categories
* Assign tags
* Change artwork
* Edit metadata
* Test sources
* Organize library items

---

# 36. Persistent Data

The following should persist between sessions:

```text
Library
Categories
Playlists
Favorites
History
Settings
Themes
Visualizer configurations
```

IndexedDB should be considered the primary browser persistence mechanism.

---

# 37. Local-First Philosophy

LIQUEAMP should work primarily as a local-first application.

A remote backend should NOT be required for basic personal use unless a
specific feature requires one.

The application should remain functional with:

```text
Local library
Local playlists
Local settings
Local themes
Local visualizers
```

Network access is required for external media and online services.

---

# 38. Import / Export

LIQUEAMP should support data export/import.

Possible exported data:

```text
Library
Categories
Playlists
Favorites
History
Settings
Themes
Visualizer configurations
```

Imports must be validated before changing existing data.

Invalid imports must not corrupt existing data.

---

# 39. Media Session API

LIQUEAMP should use the browser Media Session API where supported.

It should provide:

```text
Play
Pause
Previous
Next
Seek
```

and metadata:

```text
Title
Artist
Album
Artwork
```

This is particularly important for mobile devices and installed PWAs.

---

# 40. Keyboard Shortcuts

Initial desktop keyboard shortcuts:

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

Shortcuts must not trigger while the user is typing into an input or
editable field.

---

# 41. Accessibility

LIQUEAMP should support:

* Keyboard navigation
* Focus states
* ARIA labels
* Screen readers
* Accessible sliders
* Accessible buttons
* Sufficient contrast
* Reduced motion preferences
* Touch-friendly controls

Visual styling must not compromise basic usability.

---

# 42. Responsive Design

The application must support:

```text
Mobile
Tablet
Desktop
```

The same underlying application architecture should be used across all
screen sizes.

The layout may change substantially between desktop and mobile, but the
underlying functionality must remain consistent.

---

# 43. Performance

LIQUEAMP should be optimized for mobile devices.

Avoid unnecessary re-rendering.

High-frequency data such as:

```text
Current playback time
Audio analysis
Visualizer frames
Buffer position
```

must not cause the entire interface to re-render unnecessarily.

Visualizers should use:

```text
requestAnimationFrame
```

where appropriate.

---

# 44. Status Bar

The bottom status area may display real system/application information.

Examples:

```text
STREAM CONNECTED
BUFFER
NETWORK
PLAYBACK
VISUALIZER
AUDIO ENGINE
```

Do NOT invent system metrics.

Never fabricate:

```text
CPU %
Memory %
Network speed
Latency
Listeners
Bitrate
Uptime
```

unless the information is actually measured or provided by a real source.

If a metric is unavailable, show a truthful alternative.

---

# 45. Error Handling

Errors should be understandable.

Examples:

```text
STREAM UNAVAILABLE
AUTHENTICATION REQUIRED
PROVIDER NOT SUPPORTED
NETWORK ERROR
MEDIA FORMAT NOT SUPPORTED
PLAYBACK BLOCKED
```

Avoid generic error messages when a more useful explanation is available.

---

# 46. Demo Content

Development may include demo content to make the UI usable during
development.

Example categories:

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

Demo content must be clearly separated from actual user data.

---

# 47. Technical Philosophy

LIQUEAMP should be:

```text
Modular
Typed
Persistent
Responsive
Local-first
Provider-independent
Extensible
Performant
Accessible
```

The application should avoid unnecessary complexity.

Do not introduce infrastructure simply because it is technically possible.

Use the simplest architecture that supports the required functionality and
future expansion.

---

# 48. No Generic SaaS Design

LIQUEAMP must not drift into a generic SaaS dashboard.

Avoid:

* excessive rounded cards
* glassmorphism
* huge gradients
* excessive shadows
* oversized empty spaces
* generic analytics-dashboard styling
* unnecessary floating windows
* overlapping panels

The interface should retain its:

```text
terminal
music player
technical dashboard
retro software
```

identity.

---

# 49. UI Density

The interface should use screen space efficiently.

Information should be visible without creating excessive scrolling on desktop.

The desktop dashboard should feel like a real workstation.

The mobile interface should remain dense enough to feel useful while still
being touch-friendly.

---

# 50. Information Hierarchy

Important information should be visually prioritized.

Priority generally follows:

```text
Current playback
Playback controls
Track/station identity
Queue
Browse/library
Secondary metadata
Technical information
Configuration
```

The exact hierarchy may adapt to context.

---

# 51. Architecture Independence

The product specification describes the desired behavior and experience.

The technical architecture is described separately in:

```text
LIQUEAMP_ARCHITECTURE.md
```

The visual system is described separately in:

```text
LIQUEAMP_DESIGN.md
```

Provider implementation is described separately in:

```text
LIQUEAMP_PROVIDERS.md
```

Theme implementation is described separately in:

```text
LIQUEAMP_THEMING.md
```

Visualizer implementation is described separately in:

```text
LIQUEAMP_VISUALIZERS.md
```

These documents should complement each other.

---

# 52. Development Rule

Before changing an existing repository, inspect it first.

Determine:

* Framework
* Build system
* Package manager
* Existing routing
* Existing components
* Existing styling
* Existing state management
* Existing storage
* Existing audio implementation
* Existing dependencies

Do not replace an existing working architecture unnecessarily.

Extend it when appropriate.

---

# 53. No Premature Implementation

The documentation should be completed before large-scale implementation begins.

The intended documentation structure is:

```text
LIQUEAMP_SPEC.md
LIQUEAMP_ARCHITECTURE.md
LIQUEAMP_DESIGN.md
LIQUEAMP_PROVIDERS.md
LIQUEAMP_THEMING.md
LIQUEAMP_VISUALIZERS.md
```

These documents together should provide the project's source of truth.

---

# 54. Product Success Criteria

LIQUEAMP should ultimately feel like a complete personal music system.

A user should be able to:

1. Open LIQUEAMP.
2. Browse their library.
3. Search for media.
4. Play a track or radio station.
5. Control playback.
6. Add items to a queue.
7. Create playlists.
8. Favorite media.
9. View history.
10. Browse radio stations.
11. Change themes.
12. Use visualizers.
13. Install LIQUEAMP as a PWA.
14. Continue playback while navigating the application.
15. Configure the system from `/control`.

The system should feel coherent rather than like a collection of unrelated
features.

---

# 55. Final Product Principle

LIQUEAMP should be built as a real application, not as a visual prototype.

The most important product principles are:

```text
REAL FUNCTIONALITY
REAL DATA
REAL PLAYBACK
REAL STATE
REAL PERSISTENCE
REAL PROVIDER INTEGRATION
```

When something cannot technically be implemented, the application should
communicate that honestly rather than simulate functionality.

The final result should feel like a dedicated personal music terminal that
could realistically be used every day.

---

# 56. Primary Visual Reference

The following file is part of the LIQUEAMP project:

```text
liqueampui.png
```

It is the primary visual reference for the application's interface.

Claude Code MUST inspect this file before implementing the main UI.

The image should be interpreted as a design system reference rather than a
single screen that must be copied literally.

The final interface should preserve its visual language while adapting it
into a fully functional responsive application.

---

# 57. Current Project Structure

At this stage, the project documentation begins with:

```text
LIQUEAMP/
+-- LIQUEAMP_SPEC.md
+-- liqueampui.png
```

Additional documentation files will be added as the project specification
develops.

---

# 58. Final Requirement

LIQUEAMP must remain recognizable as LIQUEAMP throughout development.

New functionality must not gradually turn the application into a generic
music streaming clone or SaaS dashboard.

The combination of:

```text
Music player
+
Terminal interface
+
Technical dashboard
+
Retro aesthetic
+
Dense information
+
Personal media library
+
Extensible provider system
```

is fundamental to the identity of LIQUEAMP.

The application should be functional first, visually distinctive second,
and architecturally extensible throughout development.

---

# END OF LIQUEAMP PRODUCT SPECIFICATION

```
```
