
# LIQUEAMP — Design Specification

Version: 1.0
Status: Active Development

This document defines the visual design, layout system, interaction design,
responsive behavior and visual language of LIQUEAMP.

`LIQUEAMP_SPEC.md` defines what LIQUEAMP is.

`LIQUEAMP_ARCHITECTURE.md` defines how LIQUEAMP works internally.

This document defines how LIQUEAMP should LOOK and FEEL.

The supplied image:

    liqueampui.png

is the primary visual reference for this document.

Claude Code MUST inspect the image before implementing or substantially
modifying the LIQUEAMP interface.

---

# 1. Design Mission

LIQUEAMP should look like a real piece of specialized music software.

It should feel like:

- A music terminal
- A radio workstation
- A personal media console
- A retro-futuristic software interface
- A technical dashboard
- A piece of software built for someone who actually uses it every day

It should NOT look like:

- A generic SaaS dashboard
- A modern corporate admin panel
- A Spotify clone
- A glassmorphism application
- A generic Tailwind component library
- A collection of floating cards

The design should have personality.

The interface should feel dense, deliberate and functional.

---

# 2. Primary Visual Reference

The file:

    liqueampui.png

is the primary visual reference.

The image should be interpreted as a visual system rather than a screenshot
that must be copied literally.

Claude Code should extract the following principles from the image:

- Information density
- Grid structure
- Panel hierarchy
- Typography
- Borders
- Technical labels
- Status information
- Dark interface
- Warm accent colors
- Compact controls
- Terminal-like language
- Structured alignment

The final implementation must use actual HTML/CSS/UI components.

Do NOT simply place the image inside the application.

---

# 3. Core Visual Principles

The interface must follow these principles:

1. Everything belongs to a grid.
2. Panels must align.
3. Panels must not overlap.
4. Major interface elements should not float arbitrarily.
5. Important information should remain visible.
6. Controls should feel physical and deliberate.
7. Typography should reinforce the terminal aesthetic.
8. Color should communicate state.
9. Empty space should be intentional.
10. The interface should feel dense without becoming chaotic.

---

# 4. No Overlapping Panels

This is a strict design requirement.

Major windows/panels MUST NOT overlap each other.

Do not use arbitrary absolute positioning to create the primary dashboard.

Avoid layouts where:

- one panel covers another
- a card floats over another card
- text is hidden underneath another element
- controls overlap
- artwork extends into unrelated panels
- responsive layouts cause collisions

Use:

- CSS Grid
- Flexbox
- CSS container queries where useful
- responsive grid areas
- predictable padding
- consistent gaps

Absolute positioning may be used for small decorative elements or indicators,
but NOT for the primary layout structure.

---

# 5. Straight and Aligned Panels

Panels should have clean geometric boundaries.

Prefer:

- rectangular panels
- consistent widths
- aligned top/bottom edges
- consistent borders
- predictable padding
- repeated spacing values

Avoid:

- random card sizes
- randomly offset panels
- irregular floating boxes
- excessive rounded corners
- unnecessarily organic layouts

The interface should feel engineered.

---

# 6. Visual Density

LIQUEAMP should use screen space efficiently.

The desktop interface should expose a large amount of useful information
without requiring excessive scrolling.

Information can be displayed using:

- compact metadata
- labels
- small status indicators
- tables/lists
- compact controls
- small badges
- technical readouts

However, density must remain readable.

Do not turn every pixel into text.

---

# 7. Color System

The default LIQUEAMP design should use a dark palette.

Primary visual direction:

```text
Deep charcoal
Dark forest green
Warm orange
Peach
Muted mint
Dark neutral surfaces
````

The exact colors should be implemented through semantic CSS variables.

Suggested tokens:

```css
--la-bg
--la-surface
--la-surface-2
--la-surface-3
--la-border
--la-border-strong

--la-text
--la-text-muted
--la-text-dim

--la-primary
--la-secondary
--la-accent
--la-accent-bright

--la-success
--la-warning
--la-danger
--la-live

--la-visualizer
--la-glow
```

Do not scatter hard-coded colors throughout components.

---

# 8. Default Color Philosophy

The default theme should roughly communicate:

```text
BACKGROUND
Very dark charcoal / green-black

SURFACES
Deep forest green / charcoal

PRIMARY TEXT
Warm light neutral

SECONDARY TEXT
Muted green / muted warm neutral

PRIMARY ACCENT
Orange / peach

SECONDARY ACCENT
Mint / green

LIVE
Green

WARNING
Warm yellow/orange

ERROR
Red
```

The exact values should be configurable.

---

# 9. Orange / Peach Accent

Warm orange/peach is an important part of the LIQUEAMP identity.

Use it for:

* active navigation
* selected tabs
* primary playback controls
* progress indicators
* important labels
* active states
* highlights
* selected items
* visualizer accents

Do not make every element orange.

Orange should communicate importance.

---

# 10. Green / Mint Accent

Green and muted mint should communicate:

* online
* connected
* active
* available
* secondary information
* system state
* radio status

Example:

```text
? ONLINE
? CONNECTED
? PLAYING
```

The green should remain muted enough that the orange active state retains
visual importance.

---

# 11. Glow

Glow effects should be used selectively.

The interface may use:

* subtle text glow
* border glow
* active control glow
* visualizer glow
* live indicator glow

Glow should reinforce the terminal/electronic aesthetic.

Avoid:

* huge neon halos
* excessive blur
* glowing everything
* heavy bloom around every panel

The default UI should remain sharp.

---

# 12. Borders

Borders are an important part of the design.

Panels should generally have visible borders.

Borders should communicate hierarchy.

Example:

```text
Main panel
    ?
Strong border

Secondary panel
    ?
Normal border

Inactive element
    ?
Muted border
```

Avoid excessive border thickness.

The interface should look precise rather than heavy.

---

# 13. Corner Radius

Corners should generally remain fairly restrained.

Prefer:

* square corners
* very small radius
* subtle radius where appropriate

Avoid:

* large pill-shaped cards
* giant rounded containers
* excessive modern SaaS styling

Buttons may use modest rounding if it improves usability.

The overall interface should remain geometric.

---

# 14. Typography

The visual direction should use a technical/terminal-inspired typeface.

Primary font:

```text
Doto
```

where supported and practical.

Fallbacks should remain readable and monospaced/technical where appropriate.

Typography should distinguish:

```text
HEADINGS
LABELS
DATA
STATUS
METADATA
CONTROLS
```

---

# 15. Typography Hierarchy

The interface should use several text levels.

Example:

```text
LEVEL 1
NOW PLAYING

LEVEL 2
THE HIGH ROAD

LEVEL 3
Broken Bells

LEVEL 4
AFTER THE DISCO · 2010

LEVEL 5
RADIO // STREAM // 320 KBPS
```

Do not make every piece of text the same size.

Do not use enormous hero typography.

LIQUEAMP is information-dense.

---

# 16. Terminal Language

The interface may use terminal-like terminology.

Examples:

```text
NOW PLAYING
STREAM
RADIO
ONLINE
BUFFER
BITRATE
CONNECTED
QUEUE
LIBRARY
AUDIO ENGINE
VISUALIZER
SYSTEM
```

Decorative symbols may be used sparingly:

```text
>
//
::
[]
?
```

Do not turn every label into ASCII art.

The interface should remain functional.

---

# 17. Header

The desktop header should be a strong horizontal system.

It may contain:

```text
LEFT
LIQUEAMP branding

CENTER
System/player status or contextual information

RIGHT
Time
Date
Location
Network status
Window/application controls
```

The exact content may adapt to available space.

The header should not become excessively tall.

---

# 18. LIQUEAMP Branding

The application name should appear as:

```text
LIQUEAMP
```

The branding should feel like software branding rather than a corporate
logo.

A compact logo/mark may be used.

The branding should work at:

* desktop size
* mobile size
* PWA icon size

---

# 19. Sidebar / Navigation

The desktop left side should contain navigation and library information.

Conceptually:

```text
NOW PLAYING
BROWSE
PLAYLISTS
FAVOURITES
HISTORY
SETTINGS

LIBRARY

CATEGORY
CATEGORY
CATEGORY
CATEGORY

+ ADD CATEGORY
```

Navigation should communicate the currently selected area clearly.

---

# 20. Active Navigation

The active navigation item should have a clear state.

Possible visual cues:

* orange accent
* border
* background change
* small indicator
* glow

Do not rely solely on color.

The active item should remain obvious at a glance.

---

# 21. Library Categories

Library categories should be displayed compactly.

Each category may show:

```text
CATEGORY NAME
ITEM COUNT
```

Example:

```text
LOFI / CHILLHOP     24
SYNTHWAVE           18
AMBIENT             31
```

Counts must reflect actual data.

Do not display fake counts in production.

---

# 22. Main Now Playing Panel

The Now Playing panel is one of the most important areas.

It should contain:

```text
Provider information
Artwork
Track title
Artist
Album
Tags
Playback information
Progress
Visualizer
Controls
Audio controls
```

Artwork should be visually prominent but should not consume the entire
dashboard.

---

# 23. Artwork

Artwork should generally be square.

It should have:

* clean containment
* clear border
* subtle shadow/glow where appropriate
* consistent aspect ratio

Avoid excessive rounded artwork if it conflicts with the terminal aesthetic.

Artwork must never overlap other panels.

---

# 24. Track Metadata

The Now Playing area should prioritize:

```text
Track title
Artist
Album
Provider
Playback state
```

Secondary information may include:

```text
Year
Genre
Tags
Bitrate
Codec
Station
Listeners
Location
```

Only show metadata when it exists.

Do not create fake metadata.

---

# 25. Provider Badges

Provider/source information may appear as compact badges.

Examples:

```text
[STREAM]
[RADIO]
[SPOTIFY]
[YOUTUBE]
[DIRECT]
```

Provider labels should reflect the actual provider.

---

# 26. Playback Progress

The progress bar should be visually prominent but compact.

It should support:

* current position
* total duration where available
* seeking where supported

For live radio streams where duration/seek is unavailable, the UI should
adapt rather than showing a fake progress bar.

Example:

```text
LIVE
?  128 LISTENERS
?  320 KBPS
```

---

# 27. Playback Controls

Controls should be arranged in an obvious hierarchy.

Primary controls:

```text
Previous
Play/Pause
Next
```

Secondary controls:

```text
Shuffle
Repeat
Queue
Favorite
```

Additional controls:

```text
Volume
Mute
EQ
```

The primary Play/Pause control should be visually dominant.

---

# 28. Radio Browser

The right side of the desktop interface should provide a radio/browser
area.

Primary tabs:

```text
RADIO
GENRES
LOCATIONS
MOOD
```

The browser should contain:

* Search
* Filters
* Station list
* Online indicator
* Station artwork/favicon
* Station name
* Genre
* Listener information
* Favorite control

---

# 29. Radio Station List

Station rows should be compact and information-rich.

Conceptually:

```text
01  ? STATION NAME
       GENRE · COUNTRY
       12,482 LISTENERS                  ?

02  ? ANOTHER STATION
       ELECTRONIC · UK
       4,821 LISTENERS                   ?
```

The exact content depends on available metadata.

Rows should align cleanly.

---

# 30. Station Online Indicator

Online state should be visually clear.

Example:

```text
? ONLINE
? OFFLINE
```

The indicator may use green for online.

Do not show ONLINE unless the application has actual information supporting
that state.

---

# 31. Lower Dashboard

The lower part of the desktop dashboard may contain several structured
areas.

Possible sections:

```text
PLAYLISTS
FAVOURITES
HISTORY
QUEUE
STATION INFO
QUICK ACTIONS
```

These should use a consistent grid.

No panel should float above another.

---

# 32. Queue Panel

The Queue panel should show:

```text
QUEUE
5 ITEMS
```

and list the current queue.

Each row may contain:

```text
Track
Artist
Duration
Position
```

Controls may include:

```text
Play
Remove
Reorder
```

The queue should be compact.

---

# 33. Station Information Panel

Station information should show useful metadata.

Possible fields:

```text
STATION
COUNTRY
GENRE
CODEC
BITRATE
LISTENERS
HOMEPAGE
STATUS
```

The panel should not become a large text block.

Use compact structured information.

---

# 34. Quick Actions

Quick Actions should provide frequently used commands.

Examples:

```text
PLAY NOW
ADD TO QUEUE
ADD TO FAVOURITES
SHARE
MORE
```

Buttons should remain visually consistent with the rest of the application.

---

# 35. Bottom Control Area

The desktop interface should include a lower control region.

Possible sections:

```text
AUDIO
CROSSFADE
PLAYER
APPEARANCE
VISUALIZER
```

These should feel like technical control modules.

They should not resemble generic settings cards.

---

# 36. Audio Panel

The Audio section may contain:

```text
VOLUME
EQ
BASS
MID
TREBLE
```

Sliders should be compact and precise.

The user should be able to see current values where useful.

---

# 37. Crossfade

If crossfade is supported, provide:

```text
CROSSFADE
OFF / ON
DURATION
```

The UI must reflect whether the feature is actually implemented.

---

# 38. Appearance Panel

The Appearance section may contain:

```text
THEME
ACCENT
FONT
DENSITY
MOTION
```

Theme controls should connect to the real theme system.

---

# 39. Visualizer Panel

The Visualizer section should allow:

```text
Visualizer selection
Visualizer settings
Enable/disable
```

The actual visualizer system is defined in:

```text
LIQUEAMP_VISUALIZERS.md
```

---

# 40. Status Bar

The bottom status bar should be compact.

Possible real information:

```text
AUDIO ENGINE: ACTIVE
NETWORK: ONLINE
BUFFER: 3.2s
VISUALIZER: ACTIVE
PLAYBACK: PLAYING
```

Do not fabricate:

```text
CPU
RAM
NETWORK SPEED
LATENCY
UPTIME
```

unless those values are actually measured.

---

# 41. Mobile Navigation

Mobile should not simply shrink the desktop sidebar.

A mobile navigation solution may use:

* bottom navigation
* drawer
* compact menu
* expandable navigation

The exact solution should preserve fast access to:

```text
Home / Now Playing
Browse
Radio
Library
Queue
```

---

# 42. Mobile Now Playing

The mobile Now Playing interface should be the most important mobile view.

It should prioritize:

```text
Artwork
Track
Artist
Playback controls
Progress
Volume
Queue
Favorite
```

Secondary metadata can be collapsed or placed lower.

---

# 43. Mobile 9:16 Composition

The mobile design should work naturally within a 9:16 viewport.

The application should not assume a specific physical device size.

The interface should use:

```text
100dvh
safe-area-inset
responsive spacing
responsive typography
```

where appropriate.

Avoid fixed pixel heights that cause clipping on modern mobile browsers.

---

# 44. Mobile Touch Targets

Interactive controls should have sufficiently large touch targets.

Avoid tiny buttons simply because the desktop interface uses dense controls.

Mobile should retain the visual density but increase interaction comfort.

---

# 45. Mobile Panels

Panels may become:

```text
Stacked
Collapsible
Scrollable
Drawer-based
```

but they should remain visually connected to the desktop design language.

Do not redesign mobile as an unrelated application.

---

# 46. Responsive Breakpoints

Breakpoints should be based on layout requirements rather than arbitrary
device names.

The design should support at least:

```text
Small mobile
Large mobile
Tablet
Desktop
Large desktop
```

Components should adapt based on available width.

---

# 47. Grid System

The main desktop dashboard should use CSS Grid.

A conceptual structure:

```css
.dashboard {
  display: grid;

  grid-template-columns:
    minmax(180px, 240px)
    minmax(0, 1fr)
    minmax(280px, 360px);

  grid-template-rows:
    auto
    minmax(0, 1fr)
    auto
    auto;

  gap: var(--la-gap);
}
```

The exact values should be determined during implementation.

The important requirement is that the layout remains:

* aligned
* contained
* predictable
* responsive

---

# 48. Grid Overflow

Every major grid region must handle overflow deliberately.

Use:

```text
min-width: 0
min-height: 0
overflow: auto
```

where appropriate.

Never allow long text or large artwork to unexpectedly push the entire
dashboard outside the viewport.

---

# 49. Text Overflow

Long track names, station names and playlists should not destroy the layout.

Use appropriate:

```text
ellipsis
wrapping
tooltips
scrolling
```

depending on context.

Important metadata should remain accessible.

---

# 50. Scroll Philosophy

Desktop should minimize unnecessary page-level scrolling.

Prefer scrolling inside content areas where appropriate.

Mobile may use natural vertical page scrolling.

Do not create nested scrolling everywhere.

Nested scrolling should be used only when it improves usability.

---

# 51. Hover States

Desktop interactive elements should have subtle hover states.

Examples:

* border brightens
* background changes
* accent appears
* text becomes brighter
* glow increases slightly

Avoid huge animated transformations.

---

# 52. Active States

Active states should be stronger than hover states.

Examples:

```text
Selected navigation
Playing track
Active tab
Active visualizer
Enabled setting
Current station
```

Use the orange/peach accent where appropriate.

---

# 53. Focus States

Keyboard focus must be visible.

Do not remove browser focus indicators without replacing them with an
accessible equivalent.

Focus styling should fit the LIQUEAMP visual language.

---

# 54. Disabled States

Disabled controls should be visibly disabled.

Possible visual treatment:

* reduced contrast
* muted border
* reduced glow
* lower opacity

Do not make disabled controls look clickable.

---

# 55. Loading States

Loading states should feel like part of the terminal aesthetic.

Possible indicators:

```text
LOADING...
CONNECTING...
RESOLVING...
BUFFERING...
```

Use subtle animation.

Do not use generic giant spinners unless appropriate.

---

# 56. Error States

Errors should be integrated into the visual system.

Example:

```text
[ ERROR ]

STREAM UNAVAILABLE

The source could not be reached.
```

Use the error accent consistently.

Do not hide important errors in console logs only.

---

# 57. Empty States

Empty states should be informative.

Examples:

```text
NO PLAYLISTS

Create your first playlist to begin.
```

or:

```text
QUEUE EMPTY

Add media to the queue.
```

Avoid decorative empty-state illustrations that conflict with the terminal
aesthetic.

---

# 58. Dialogs

Dialogs should be used for:

* confirmations
* editing
* importing
* provider authentication
* destructive actions

Dialogs should remain contained.

Do not create large floating windows unnecessarily.

---

# 59. Forms

Forms should be compact and technical.

Inputs should have:

* clear labels
* visible borders
* clear focus states
* readable values
* useful validation

Avoid overly rounded modern form styling.

---

# 60. Tables and Lists

Lists are important in LIQUEAMP.

Rows should align vertically.

Columns should remain consistent.

Example:

```text
TITLE               ARTIST           PROVIDER       STATUS
----------------------------------------------------------------
The High Road       Broken Bells     RADIO          ?
Midnight City       M83              STREAM         ?
...
```

Do not use tables where cards would be more appropriate on mobile.

---

# 61. Icons

Icons should be simple and functional.

Use icons for:

* playback
* navigation
* favorites
* queue
* settings
* search
* volume
* radio
* visualizer

Icons should not become decorative clutter.

---

# 62. Icon Consistency

Use one coherent icon family.

Do not mix unrelated visual styles.

Icons should have consistent:

* stroke weight
* proportions
* size
* alignment

---

# 63. Animation Philosophy

Animation should communicate state.

Good uses:

```text
Play/pause transition
Visualizer
Progress
Loading
Buffering
Active glow
Panel transitions
```

Avoid:

* unnecessary bouncing
* excessive scaling
* constant movement
* distracting background animation

---

# 64. Reduced Motion

Respect:

```text
prefers-reduced-motion
```

When reduced motion is enabled:

* minimize transitions
* disable unnecessary animated effects
* preserve functionality

Visualizer animation may be reduced or disabled.

---

# 65. Visualizer Performance

Visualizers should not degrade normal UI performance.

Visualizer rendering should be isolated where possible.

Do not make the entire React tree update every animation frame.

---

# 66. Artwork and Image Handling

Artwork should be:

* lazy loaded where appropriate
* constrained to its container
* given sensible fallbacks
* prevented from breaking layout

If artwork is unavailable, use a designed LIQUEAMP fallback.

Do not display broken image icons.

---

# 67. Missing Metadata

If metadata is unavailable:

Do not invent it.

Instead use appropriate alternatives:

```text
UNKNOWN ARTIST
UNTITLED
LIVE STREAM
UNKNOWN STATION
```

or omit the field where that is more appropriate.

---

# 68. Technical Metadata

Technical metadata may be displayed in compact form.

Examples:

```text
320 KBPS
MP3
44.1 KHZ
STEREO
LIVE
ONLINE
```

Only display values that are actually known.

---

# 69. Data Density vs Readability

The goal is:

```text
HIGH INFORMATION DENSITY
+
HIGH READABILITY
```

Not:

```text
MAXIMUM INFORMATION DENSITY
```

The user should be able to scan the dashboard quickly.

---

# 70. Desktop Window Behavior

The application should assume that the browser viewport can change size.

When resized:

* panels should reflow
* text should adapt
* controls should remain accessible
* no panels should overlap
* no content should become unreachable

---

# 71. Large Desktop

On very large screens, do not simply stretch every panel indefinitely.

Use sensible maximum widths where appropriate.

Maintain a coherent central composition.

Avoid enormous empty regions.

---

# 72. Small Desktop

On smaller desktop widths:

* reduce sidebar width
* reduce secondary metadata
* collapse lower panels if necessary
* reduce spacing
* preserve Now Playing and core controls

Do not allow the interface to break.

---

# 73. Tablet

Tablet layouts may use a hybrid arrangement.

For example:

```text
Navigation
Now Playing
Radio
Queue
```

may be reorganized into fewer columns.

The same visual language must remain.

---

# 74. Mobile Priority

When space is limited, prioritize:

1. Current media
2. Play/pause
3. Previous/next
4. Progress/seek
5. Queue
6. Volume
7. Favorite
8. Browse
9. Secondary metadata
10. Technical metadata

Do not remove core playback functionality.

---

# 75. Desktop Priority

Desktop can expose more information simultaneously.

Prioritize:

```text
Now Playing
Radio Browser
Library
Queue
Station Information
Quick Actions
Audio
Visualizer
```

---

# 76. Interaction Consistency

The same action should behave consistently throughout the application.

For example:

```text
Play
```

should always mean:

```text
Start playback of this item.
```

while:

```text
Add to Queue
```

should never immediately start playback.

---

# 77. Context Menus

Context menus may provide secondary actions.

Possible actions:

```text
Play Now
Play Next
Add to Queue
Add to Playlist
Favorite
Edit
Share
Remove
```

Do not hide essential functionality exclusively inside context menus.

---

# 78. Drag and Drop

Where appropriate, support drag and drop for:

* Queue reordering
* Playlist reordering
* Category ordering

Mobile alternatives must exist.

Do not make drag-and-drop the only way to reorder content.

---

# 79. Toast Notifications

Toast notifications may be used for brief confirmations.

Examples:

```text
ADDED TO QUEUE
ADDED TO FAVOURITES
PLAYLIST UPDATED
THEME ACTIVATED
```

Toasts should be:

* compact
* non-blocking
* readable
* dismissible where appropriate

---

# 80. Notifications vs Errors

Use toasts for successful minor actions.

Use persistent UI for important errors.

Do not hide serious errors inside a toast that disappears immediately.

---

# 81. Player Persistence

The player should remain visually and functionally persistent across
navigation.

The user should always be able to understand:

```text
What is playing
Whether it is playing
What provider is being used
```

---

# 82. Current Item Highlight

The currently playing item should be visually identifiable in:

* library
* playlists
* history
* queue
* radio lists

Use a consistent active state.

---

# 83. Live Content

Live radio should have a distinct visual state.

Possible indicator:

```text
? LIVE
```

The live state should use the designated live/green accent.

Do not use a fake duration/progress bar for streams where it is not available.

---

# 84. Player State

The interface should visually distinguish:

```text
IDLE
LOADING
PLAYING
PAUSED
BUFFERING
ERROR
```

The player should never look like it is playing when playback is actually
paused or failed.

---

# 85. Theme Switching

Changing themes should update the interface consistently.

All major interface surfaces should use semantic theme tokens.

Avoid components that retain old hard-coded colors after theme changes.

---

# 86. Theme Preview

When selecting a theme, the user should be able to see a preview before
activation where appropriate.

Preview should show representative:

* panels
* text
* buttons
* player controls
* accents
* visualizer

---

# 87. Design Tokens

The design should use centralized tokens for:

```text
Colors
Spacing
Typography
Borders
Radii
Glow
Transitions
Panel sizes
```

Example:

```css
--la-space-1
--la-space-2
--la-space-3
--la-space-4

--la-radius-sm

--la-border-width

--la-transition-fast
--la-transition-normal
```

Exact token values can evolve during implementation.

---

# 88. Spacing

Spacing should be consistent.

Use a small spacing scale rather than arbitrary values everywhere.

Example conceptual scale:

```text
4
8
12
16
24
32
```

Exact values may adapt to the final responsive design.

---

# 89. Panel Padding

Panels should generally have consistent internal padding.

Avoid:

* text touching borders
* inconsistent spacing
* excessive empty padding

Compact technical layouts should remain visually tight.

---

# 90. Visual Hierarchy Through Borders

Panel importance can be communicated through:

* border strength
* accent line
* background contrast
* typography
* active indicator

Do not rely entirely on shadows.

---

# 91. Shadows

Shadows should be subtle.

Use shadows primarily to establish separation when necessary.

Avoid:

```text
Huge soft shadows
Heavy floating-card shadows
```

The interface should rely more heavily on:

```text
Borders
Contrast
Color
Spacing
```

---

# 92. Background

The primary background should be dark.

Subtle texture may be used if it improves the terminal aesthetic.

Do not use distracting animated backgrounds.

Do not sacrifice text readability.

---

# 93. Decorative Elements

Decorative details may include:

```text
Small technical labels
Status dots
Thin lines
Grid details
Subtle scanline-inspired elements
Tiny system indicators
```

These should remain secondary to functionality.

---

# 94. Terminal Feeling

The terminal feeling should come from:

* Typography
* Labels
* Dense information
* Borders
* Technical metadata
* Color palette
* Status indicators
* Compact controls
* Grid structure

Do not rely exclusively on green text on black backgrounds.

LIQUEAMP should feel inspired by terminal software while remaining a modern
usable music application.

---

# 95. No Retro Gimmick

The interface should not become a parody of a terminal.

Avoid:

* excessive ASCII art
* fake command prompts everywhere
* unnecessary blinking text
* random CRT effects
* excessive scanlines
* fake system logs

The terminal aesthetic should support the product.

---

# 96. No Generic Music App Clone

Do not reproduce the standard layout of mainstream streaming applications.

LIQUEAMP should have its own information architecture.

The combination of:

```text
Music player
Radio browser
Technical dashboard
Terminal aesthetic
Personal library
```

is central to the identity.

---

# 97. Mobile Bottom Player

A compact mobile playback bar may be used when the full Now Playing view is
not open.

It should show:

```text
Artwork
Track
Play/Pause
Next
```

and allow access to the full player.

It must not cover navigation or content.

---

# 98. Safe Areas

Mobile UI should respect:

```css
env(safe-area-inset-top)
env(safe-area-inset-bottom)
```

where appropriate.

Controls must not be hidden behind:

* browser UI
* device notches
* home indicators
* rounded screen corners

---

# 99. Browser Compatibility

The visual system should be tested in:

```text
Chrome
Firefox
Safari
Mobile Safari
Android Chrome
```

Where a visual feature is unsupported, use a graceful fallback.

---

# 100. Accessibility and Contrast

The dark visual design must still provide sufficient contrast.

Do not use muted text that becomes unreadable.

Important status indicators should not rely on color alone.

Examples:

```text
? ONLINE
[PLAYING]
[PAUSED]
[ERROR]
```

---

# 101. Design Implementation Rule

Claude Code MUST NOT simplify the interface into a generic dashboard simply
because a simpler design is easier to implement.

If a design element appears complex, implement the underlying structure
properly using reusable components and layout systems.

Do not remove important UI regions without a technical reason.

---

# 102. Design Adaptation Rule

The reference image is authoritative for the visual language but not for
literal pixel dimensions.

The implementation should adapt to:

* different screen sizes
* real data
* variable text lengths
* missing metadata
* accessibility
* touch input
* browser limitations

The design should remain recognizable even when the content changes.

---

# 103. Component Reuse

Visual components should be reusable.

Examples:

```text
Panel
PanelHeader
StatusBadge
MediaRow
StationRow
Artwork
PlaybackButton
Slider
Tab
MetadataLabel
SectionHeader
```

Do not duplicate styling unnecessarily.

---

# 104. Design States

Every important interactive component should consider:

```text
Default
Hover
Focus
Active
Selected
Playing
Disabled
Loading
Error
```

Not every component needs every state, but the relevant states must be
designed intentionally.

---

# 105. Final Design Acceptance Criteria

The LIQUEAMP interface should be considered visually successful when:

* The application clearly looks like LIQUEAMP.
* The `liqueampui.png` visual language is recognizable.
* The dashboard has a strong grid.
* Panels align cleanly.
* No major panels overlap.
* The interface does not look like generic SaaS.
* The terminal/music workstation feeling is present.
* Orange/peach and green/mint accents communicate state.
* Typography feels technical.
* Information density is high but readable.
* Desktop uses space efficiently.
* Mobile feels like a real music application.
* The interface remains usable with real data.
* Long names do not break layouts.
* Missing metadata does not produce fake information.
* Loading/error/playing states are visually clear.
* Themes can change without breaking the design.
* Accessibility is preserved.
* Visualizers integrate naturally.
* Playback controls remain obvious.

---

# 106. Final Design Principle

LIQUEAMP should look like software someone deliberately designed for
listening to music, radio and personal media.

It should feel:

```text
TECHNICAL
DENSE
DARK
WARM
RETRO
MODERN
FUNCTIONAL
PERSONAL
```

It should not feel:

```text
GENERIC
CORPORATE
EMPTY
GLASSY
OVERLY ROUNDED
OVERLY MINIMAL
```

The design should balance retro terminal aesthetics with modern usability.

The goal is not to imitate an old computer.

The goal is to make a modern music application that feels like a highly
specialized piece of software from an alternate technological timeline.

---

# END OF LIQUEAMP DESIGN SPECIFICATION

```
```
