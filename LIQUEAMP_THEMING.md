
# LIQUEAMP — THEMING

Version: 1.0  
Status: Active Development  
Document Type: Theme & Color System Specification

---

# 1. PURPOSE

This document defines the complete theming system for LIQUEAMP.

The theming system must make it possible to change the visual identity of the entire application without modifying individual components.

Themes must control:

- background colors
- surfaces
- borders
- text
- accents
- active states
- hover states
- focus states
- error states
- live states
- visualizer colors
- glow effects
- buttons
- sliders
- progress bars
- terminal elements
- charts
- status indicators
- artwork surroundings
- navigation
- dialogs
- control panel
- mobile interface

The goal is:

> One interface architecture.  
> Many visual identities.

---

# 2. CORE PRINCIPLE

LIQUEAMP must never depend on hard-coded visual colors inside components.

Bad:

```css
background: #111111;
color: #ffffff;
border: 1px solid #ff6600;
````

Preferred:

```css
background: var(--la-bg);
color: var(--la-text);
border-color: var(--la-border);
```

Components should consume semantic theme variables.

The theme system owns the actual colors.

---

# 3. THEME ARCHITECTURE

The architecture should conceptually be:

```text
Theme Source
     ?
Theme Parser
     ?
Theme Validator
     ?
Theme Normalizer
     ?
Semantic Theme Tokens
     ?
CSS Variables
     ?
LIQUEAMP Components
```

For imported external themes:

```text
Tinted Theme
     ?
Base16 / Base24 / Tinted8
     ?
Parser
     ?
Palette
     ?
Semantic Mapping
     ?
LIQUEAMP Theme
```

---

# 4. TINTED THEMING

LIQUEAMP should support themes inspired by the Tinted Theming ecosystem.

Relevant formats include:

```text
Base16
Base24
Tinted8
```

The implementation should prioritize compatibility with documented theme formats rather than attempting to scrape or reproduce an online gallery.

Official resources:

* Tinted Studio
* Tinted Terminal
* Base24 styling specification

The implementation should support importing theme definitions in documented YAML/JSON forms where practical.

---

# 5. BASE16

Base16 is the primary compatibility target.

A Base16 palette generally provides:

```text
base00
base01
base02
base03
base04
base05
base06
base07
base08
base09
base0A
base0B
base0C
base0D
base0E
base0F
```

LIQUEAMP should normalize these into semantic tokens.

Initial mapping:

```text
base00 ? background
base01 ? surface
base02 ? elevated surface
base03 ? muted text / subtle borders
base04 ? secondary text
base05 ? primary text
base06 ? bright text
base07 ? strongest text / highlight

base08 ? red / danger
base09 ? orange
base0A ? yellow
base0B ? green
base0C ? cyan / mint
base0D ? blue
base0E ? purple
base0F ? special accent
```

This mapping must be configurable.

---

# 6. BASE24

Base24 may provide additional palette slots compared with Base16.

When a Base24 theme is imported:

1. Detect the format.
2. Parse all available palette values.
3. Preserve the complete palette.
4. Map the palette into LIQUEAMP semantic tokens.
5. Preserve unmapped colors for future use.
6. Allow manual remapping.

Do not discard useful Base24 colors simply because LIQUEAMP currently uses fewer semantic tokens.

---

# 7. TINTED8

Tinted8 themes may contain a smaller or differently structured palette.

When supported:

```text
Tinted8
 ?
Detect
 ?
Parse
 ?
Normalize
 ?
Map to LIQUEAMP semantic tokens
```

If a format cannot be fully mapped:

```text
Import successful
Some colors require manual mapping.
```

Do not silently produce an incorrect theme.

---

# 8. SEMANTIC THEME TOKENS

The application must use semantic tokens.

Core tokens:

```css
--la-bg
--la-surface
--la-surface-2
--la-surface-3

--la-border
--la-border-subtle
--la-border-strong

--la-text
--la-text-secondary
--la-text-muted
--la-text-disabled

--la-primary
--la-secondary

--la-accent
--la-accent-bright

--la-danger
--la-warning
--la-success
--la-info

--la-live

--la-visualizer
--la-visualizer-secondary

--la-glow
--la-glow-strong
```

Additional tokens may be added where the interface requires them.

---

# 9. THEME TOKEN CATEGORIES

Tokens should be grouped logically.

## Background

```text
--la-bg
```

Main application background.

## Surfaces

```text
--la-surface
--la-surface-2
--la-surface-3
```

Used for increasingly elevated panels.

## Borders

```text
--la-border
--la-border-subtle
--la-border-strong
```

## Typography

```text
--la-text
--la-text-secondary
--la-text-muted
--la-text-disabled
```

## Accent

```text
--la-primary
--la-secondary
--la-accent
--la-accent-bright
```

## Status

```text
--la-success
--la-warning
--la-danger
--la-info
--la-live
```

## Visualizer

```text
--la-visualizer
--la-visualizer-secondary
```

## Glow

```text
--la-glow
--la-glow-strong
```

---

# 10. INITIAL LIQUEAMP THEME

The default LIQUEAMP theme should follow the established visual direction.

Primary characteristics:

```text
Dark charcoal
Deep forest green
Warm orange / peach
Muted mint green
Terminal typography
Subtle glow
High information density
Precise grid
```

The default theme should feel like:

> A specialized piece of music/radio software from an alternate timeline.

It should not look like:

```text
generic SaaS
generic dashboard
generic Spotify clone
glassmorphism UI
modern banking interface
```

---

# 11. DEFAULT COLOR PHILOSOPHY

The default theme should prioritize:

### Background

Very dark charcoal / green-black.

### Surfaces

Slightly lighter forest-charcoal tones.

### Primary accent

Warm orange / peach.

### Secondary accent

Muted mint/green.

### Status

Green for healthy/connected.

Orange for active/warning.

Red for errors.

The exact values should be stored as theme tokens and remain configurable.

---

# 12. COLOR HIERARCHY

Not every element should glow.

Use the accent color selectively.

High emphasis:

```text
active navigation
play button
progress
LIVE
selected item
focused control
important status
```

Medium emphasis:

```text
hover
secondary buttons
metadata tags
provider badges
```

Low emphasis:

```text
borders
muted text
background decorations
```

The interface should remain readable without every element competing for attention.

---

# 13. GLOW SYSTEM

Glow is part of the LIQUEAMP identity but must remain restrained.

Use:

```css
box-shadow
text-shadow
filter
```

only where appropriate.

Example:

```css
box-shadow:
  0 0 8px color-mix(
    in srgb,
    var(--la-glow) 35%,
    transparent
  );
```

The exact implementation may vary.

Do not create huge neon halos around every panel.

---

# 14. GLOW TOKENS

Glow intensity should be configurable.

Conceptually:

```text
--la-glow
--la-glow-strong
```

Optional intensity variables:

```text
--la-glow-opacity
--la-glow-radius
```

If implemented, they should be controlled globally.

---

# 15. TINTED THEME IMPORT

The control panel should provide:

```text
IMPORT TINTED THEME
```

Possible input:

```text
YAML
JSON
```

The importer should:

1. Read the file.
2. Detect the format.
3. Validate required values.
4. Parse the palette.
5. Normalize colors.
6. Map semantic tokens.
7. Generate a preview.
8. Allow editing.
9. Save the theme.
10. Allow activation.

---

# 16. IMPORT UX

Example:

```text
+--------------------------------------------+
¦ IMPORT TINTED THEME                        ¦
+--------------------------------------------¦
¦                                            ¦
¦ Drop YAML / JSON here                      ¦
¦                                            ¦
¦ or                                         ¦
¦                                            ¦
¦ [ CHOOSE FILE ]                            ¦
¦                                            ¦
+--------------------------------------------¦
¦ DETECTED FORMAT                            ¦
¦ Base16                                     ¦
¦                                            ¦
¦ COLORS                                     ¦
¦ ? ? ? ? ? ? ? ?                            ¦
¦                                            ¦
¦ [ PREVIEW ] [ IMPORT ] [ CANCEL ]          ¦
+--------------------------------------------+
```

---

# 17. THEME PREVIEW

Before activating an imported theme, display a miniature LIQUEAMP interface.

The preview should contain:

```text
header
sidebar
now playing
buttons
progress
radio list
status indicators
visualizer
text hierarchy
```

This lets the user see whether the palette works before applying it.

---

# 18. SEMANTIC MAPPING EDITOR

Imported themes should not be forced into one fixed mapping.

Provide a mapping interface.

Example:

```text
BASE16 MAPPING

base00 ? Background
base01 ? Surface
base02 ? Surface 2
base03 ? Muted Text
base04 ? Secondary Text
base05 ? Primary Text
base08 ? Danger
base09 ? Accent
base0A ? Warning
base0B ? Success
base0C ? Secondary
base0D ? Info
base0E ? Secondary Accent
base0F ? Special
```

Each mapping should be editable.

---

# 19. THEME EDITOR

LIQUEAMP should provide a theme editor in `/control`.

Possible layout:

```text
THEME EDITOR
----------------------------------------

THEME NAME
[ LiqueAmp Default ]

BACKGROUND
[ color ]

SURFACE
[ color ]

SURFACE 2
[ color ]

TEXT
[ color ]

MUTED TEXT
[ color ]

PRIMARY
[ color ]

ACCENT
[ color ]

SUCCESS
[ color ]

WARNING
[ color ]

DANGER
[ color ]

GLOW
[ color ]
```

A live preview should update as the values change.

---

# 20. COLOR INPUT

Color inputs should support:

```text
HEX
RGB
HSL
```

HEX is sufficient for imported/exported theme compatibility.

The internal representation should remain consistent.

---

# 21. THEME VALIDATION

Before saving a theme:

Check:

```text
valid color syntax
required tokens
contrast
duplicate/missing values
```

The system should not reject a theme merely because it is unconventional.

However, it should warn when readability is likely to be poor.

Example:

```text
WARNING

Primary text has low contrast
against the selected background.

[ KEEP ANYWAY ]
[ ADJUST ]
```

---

# 22. ACCESSIBILITY

Theme switching must not destroy accessibility.

Themes should be checked for:

```text
text contrast
focus visibility
button visibility
disabled-state visibility
status-state distinction
```

Do not rely on color alone.

For example:

```text
LIVE
?
```

should preferably also have text such as:

```text
LIVE
```

rather than only a green dot.

---

# 23. FOCUS COLORS

Keyboard focus must remain visible in every theme.

Use a dedicated token:

```text
--la-focus
```

if necessary.

A theme should never make focus outlines invisible.

---

# 24. STATUS COLORS

Semantic status colors must remain distinguishable.

Suggested roles:

```text
Success ? green
Warning ? yellow/orange
Danger ? red
Info ? cyan/blue
Live ? accent/green
```

Imported themes may map these differently.

The semantic role matters more than the exact hue.

---

# 25. ACTIVE STATES

Active controls should use:

```text
accent
accent-bright
glow
```

Examples:

```text
selected navigation
active tab
playing station
selected playlist
active visualizer
current queue item
```

Do not change the entire component color unnecessarily.

---

# 26. HOVER STATES

Hover should be a subtle transformation of the base theme.

Possible changes:

```text
surface brightness
border brightness
accent intensity
glow
```

Avoid hard-coded hover colors.

---

# 27. DISABLED STATES

Disabled controls should use:

```text
--la-text-disabled
```

and reduced border/accent visibility.

Disabled elements must still be distinguishable from missing elements.

---

# 28. ERROR STATES

Errors should use:

```text
--la-danger
```

but must remain readable in every theme.

Example:

```text
STREAM ERROR
Unable to connect to source.
```

Do not rely exclusively on red background.

---

# 29. LIVE STATE

Live streams should have a distinct visual state.

Example:

```text
? LIVE
```

using:

```text
--la-live
```

The color should be configurable.

---

# 30. PROVIDER COLORS

Provider branding should not override the entire LIQUEAMP theme.

If provider-specific colors are used, they should be isolated.

Example:

```text
--provider-spotify
--provider-youtube
--provider-soundcloud
```

These should only be used where provider identification is useful.

The main application remains theme-controlled.

---

# 31. ARTWORK

Artwork is external visual content and should not be recolored automatically.

However, its surrounding UI should use the active theme.

Example:

```text
Artwork
?
theme-controlled frame
theme-controlled metadata
theme-controlled controls
```

Do not apply aggressive global filters to album artwork.

---

# 32. VISUALIZER COLORS

The visualizer should use theme variables.

Example:

```text
--la-visualizer
--la-visualizer-secondary
```

A visualizer may derive additional shades algorithmically.

However, it should remain within the active theme unless the user explicitly selects a separate visualizer palette.

---

# 33. VISUALIZER PALETTE MODES

Possible options:

```text
THEME
MONO
ACCENT
DUAL
CUSTOM
```

### THEME

Uses the current application theme.

### MONO

Uses one color.

### ACCENT

Uses the primary accent.

### DUAL

Uses two theme colors.

### CUSTOM

User selects colors.

---

# 34. TINTED THEME EXPORT

Users should be able to export their themes.

Possible formats:

```text
Base16
Base24
LIQUEAMP JSON
```

Where the target format cannot represent every LIQUEAMP semantic token, the exporter should preserve the closest valid representation.

---

# 35. LIQUEAMP THEME FORMAT

Internally, LIQUEAMP should have its own normalized theme representation.

Example:

```ts
interface LiqueAmpTheme {
  id: string;
  name: string;

  version: number;

  colors: {
    bg: string;

    surface: string;
    surface2: string;
    surface3: string;

    border: string;
    borderSubtle: string;
    borderStrong: string;

    text: string;
    textSecondary: string;
    textMuted: string;
    textDisabled: string;

    primary: string;
    secondary: string;

    accent: string;
    accentBright: string;

    success: string;
    warning: string;
    danger: string;
    info: string;
    live: string;

    visualizer: string;
    visualizerSecondary: string;

    glow: string;
    glowStrong: string;
  };

  typography?: {
    fontFamily?: string;
    monoFamily?: string;
  };

  effects?: {
    glowEnabled?: boolean;
    glowIntensity?: number;
    borderRadius?: number;
  };
}
```

The exact type may evolve with the application.

---

# 36. THEME STORAGE

Themes should be stored persistently.

Preferred:

```text
IndexedDB
```

or the application's established persistence layer.

Do not hard-code user-created themes into source files.

---

# 37. THEME IDENTIFIERS

Each theme should have a stable ID.

Example:

```text
liqueamp-default
forest-terminal
amber-night
base16-gruvbox
custom-001
```

The user-facing name may change without breaking references.

---

# 38. ACTIVE THEME

Only one main theme should be active at a time unless the application later introduces advanced per-component themes.

Example:

```text
activeThemeId
```

Changing the theme should update the application globally.

---

# 39. THEME SWITCHING

Theme switching should not reload the entire application.

Preferred:

```text
Theme state
 ?
CSS variables update
 ?
UI updates
```

Do not force a full page reload merely to change colors.

---

# 40. THEME PERSISTENCE

After selecting a theme:

```text
close app
reopen app
```

the selected theme should remain active.

The setting must be persisted.

---

# 41. SYSTEM THEME

LIQUEAMP may support:

```text
System
Dark
Light
Custom
```

However, the application is primarily designed around a dark terminal aesthetic.

A light theme should only be used if intentionally designed rather than generated by simply inverting the dark theme.

---

# 42. DARK THEME

The default dark theme should remain the primary visual identity.

Characteristics:

```text
deep background
dark surfaces
strong borders
warm accent
muted green secondary
terminal typography
controlled glow
```

---

# 43. LIGHT THEME

If implemented, the light theme must be designed as a coherent theme.

Do not simply perform:

```text
color: invert()
```

A light LIQUEAMP theme should still retain:

```text
terminal character
dense information hierarchy
grid structure
accent identity
```

---

# 44. THEME CATEGORIES

The theme browser may categorize themes:

```text
LIQUEAMP
TINTED
CUSTOM
IMPORTED
```

Optional:

```text
DARK
LIGHT
HIGH CONTRAST
```

---

# 45. THEME LIBRARY

The control panel should provide:

```text
THEMES

ACTIVE
------------

LIQUEAMP DEFAULT

AVAILABLE
------------

Forest Terminal
Amber Night
Base16 Theme
Custom Theme
```

Each theme may show:

```text
name
preview
source
format
date added
```

---

# 46. DUPLICATING THEMES

Users should be able to duplicate a theme.

Example:

```text
Forest Terminal
      ?
Duplicate
      ?
Forest Terminal — Custom
```

The duplicate becomes independently editable.

---

# 47. RENAMING THEMES

User-created themes should be renameable.

Renaming must not change the internal theme ID.

---

# 48. DELETING THEMES

User-created themes may be deleted.

The currently active theme cannot be deleted without selecting another theme first.

Built-in themes may be protected.

---

# 49. BUILT-IN VS USER THEMES

Themes should have a source:

```ts
type ThemeSource =
  | "builtin"
  | "imported"
  | "user";
```

Built-in themes should not be accidentally destroyed.

---

# 50. THEME RESET

Provide:

```text
RESET TO DEFAULT
```

This should restore the built-in LIQUEAMP theme.

It should not delete user-created themes.

---

# 51. CSS VARIABLE ARCHITECTURE

The application should expose theme variables globally.

Example:

```css
:root {
  --la-bg: ...;
  --la-surface: ...;
  --la-surface-2: ...;

  --la-border: ...;

  --la-text: ...;
  --la-text-muted: ...;

  --la-primary: ...;
  --la-accent: ...;

  --la-danger: ...;
  --la-live: ...;
}
```

Components should consume these variables.

---

# 52. NO HARD-CODED COLORS

Avoid:

```css
color: white;
color: black;
background: #000;
border-color: #333;
```

inside reusable UI components.

Instead:

```css
color: var(--la-text);
background: var(--la-bg);
border-color: var(--la-border);
```

Exceptions are allowed for:

* image content
* provider-specific brand assets
* browser-required values
* technical visual effects where appropriate

but these should remain isolated.

---

# 53. COMPONENT TOKEN USAGE

Example:

```css
.panel {
  background: var(--la-surface);
  border: 1px solid var(--la-border);
  color: var(--la-text);
}

.panel:hover {
  border-color: var(--la-border-strong);
}
```

A button:

```css
.button-primary {
  background: var(--la-primary);
  color: var(--la-bg);
}
```

The exact styling can vary.

---

# 54. BORDER SYSTEM

Borders are an important part of the LIQUEAMP terminal aesthetic.

Use:

```text
subtle
normal
strong
```

rather than random opacity values throughout the application.

Example:

```text
--la-border-subtle
--la-border
--la-border-strong
```

---

# 55. GRID AND THEME

The theme system must not alter the structural layout.

Changing a theme should not cause:

```text
panel overlap
grid breakage
different component sizes
unexpected layout shifts
```

Colors and effects should be independent from structural layout.

---

# 56. TYPOGRAPHY THEMING

The theme system may optionally control typography.

Potential variables:

```text
--la-font-ui
--la-font-mono
--la-font-display
```

The default design uses a terminal/technical aesthetic and should use the project's selected Doto/monospace typography where appropriate.

Do not let imported themes replace typography unless the user explicitly enables that behavior.

---

# 57. THEME-BASED DENSITY

Theme should primarily control visual appearance, not information density.

Do not let importing a theme suddenly:

```text
increase panel padding
remove information
change navigation
change grid
```

Those are layout/design settings.

---

# 58. BORDER RADIUS

Border radius should be a design token if needed:

```text
--la-radius-sm
--la-radius-md
--la-radius-lg
```

The default LIQUEAMP aesthetic should remain restrained.

Avoid excessive rounded cards.

The interface should continue to look like structured software rather than a generic modern SaaS dashboard.

---

# 59. SHADOW SYSTEM

Shadows should remain subtle.

Possible semantic tokens:

```text
--la-shadow-panel
--la-shadow-floating
```

The default visual language should favor:

```text
borders
contrast
glow
```

over heavy shadows.

---

# 60. GLASSMORPHISM

Do not introduce:

```text
glassmorphism
frosted glass panels
huge backdrop blur
floating translucent cards
```

as a default theme behavior.

Themes should preserve the LIQUEAMP structural identity.

---

# 61. GRADIENTS

Gradients should be used sparingly.

Do not make gradients the primary way of differentiating panels.

The interface should remain:

```text
flat
structured
terminal-like
precise
```

with selective glow.

---

# 62. ANIMATION

Theme switching may animate subtly.

Example:

```css
transition:
  background-color 120ms ease,
  border-color 120ms ease,
  color 120ms ease;
```

Avoid long transitions.

Respect:

```text
prefers-reduced-motion
```

---

# 63. REDUCED MOTION

If the user enables reduced motion:

```text
disable animated glow
reduce theme transition
disable decorative color pulsing
```

Functional feedback must remain.

---

# 64. MOBILE THEMING

The same theme system must apply to mobile.

Do not create a completely separate color system for mobile.

Desktop:

```text
same theme
```

Mobile:

```text
same theme
```

Only layout and component presentation change.

---

# 65. CONTROL PANEL THEMING

`/control` must use the same active LIQUEAMP theme.

However, it may expose additional technical indicators.

The control panel should feel like part of the same application.

---

# 66. THEME PREVIEW COMPONENT

Build a reusable preview component.

Conceptually:

```text
ThemePreview
 +-- Header
 +-- Navigation
 +-- Panel
 +-- Button
 +-- Input
 +-- Progress
 +-- Status
 +-- Visualizer
```

The preview should use actual LIQUEAMP components or their styling primitives where practical.

This prevents the preview from becoming disconnected from the real application.

---

# 67. THEME IMPORT VALIDATION

Imported theme files should be validated before persistence.

Reject malformed files with an understandable message.

Example:

```text
INVALID THEME

The imported file does not contain
a recognized Base16/Base24/Tinted8 palette.
```

Do not crash.

---

# 68. UNKNOWN FIELDS

Imported theme formats may contain fields LIQUEAMP does not understand.

Unknown fields should generally be ignored safely.

Do not fail an otherwise valid theme merely because it contains extra metadata.

---

# 69. THEME VERSIONING

LIQUEAMP themes should have a version.

Example:

```text
version: 1
```

Future migrations may transform:

```text
version 1
 ?
migration
 ?
version 2
```

Do not assume the theme schema will never change.

---

# 70. THEME EXPORT FORMAT

LIQUEAMP JSON export should preserve:

```text
theme ID
name
version
semantic colors
effects
optional typography
metadata
```

Example:

```json
{
  "name": "Forest Terminal",
  "version": 1,
  "colors": {
    "bg": "#...",
    "surface": "#...",
    "primary": "#...",
    "accent": "#..."
  }
}
```

The exact schema should follow the TypeScript type used by the application.

---

# 71. THEME IMPORT/EXPORT SAFETY

Theme files are data.

Do not execute arbitrary code contained in a theme file.

Theme imports must only contain declarative values.

Never use imported theme content as executable JavaScript.

---

# 72. THEME DATA VALIDATION

Validate:

```text
string types
color formats
numeric ranges
enum values
version
required fields
```

Clamp numeric values where appropriate.

---

# 73. CONTRAST WARNINGS

The theme editor may calculate approximate contrast ratios.

Useful warnings:

```text
GOOD
AA
AAA
LOW CONTRAST
```

These should be presented as accessibility information rather than automatically rejecting artistic themes.

---

# 74. COLOR BLINDNESS

Important semantic states should not depend solely on color.

For example:

```text
green = connected
red = error
```

should also use:

```text
CONNECTED
ERROR
```

or appropriate icons.

This makes imported themes safer across different color perception.

---

# 75. THEME AND STATUS BAR

The bottom status bar must use theme variables.

Example:

```text
CONNECTED
BUFFER 0.42s
LATENCY 84ms
```

Colors:

```text
connected ? success
warning ? warning
error ? danger
live ? live
```

Only actual metrics should be displayed.

The theme must never imply that a fake metric is real.

---

# 76. THEME AND TERMINAL AESTHETIC

The theme system should reinforce the terminal identity.

Possible details:

```text
thin borders
monospace labels
small uppercase headings
technical metadata
subtle scanline-like decoration if used
small accent indicators
restrained glow
```

Do not overdo terminal effects.

The goal is a believable specialized application, not a terminal simulator.

---

# 77. THEME AND INFORMATION HIERARCHY

Theme colors should communicate hierarchy.

Example:

```text
Primary text
 ?
Secondary text
 ?
Muted metadata
```

and:

```text
Primary action
 ?
Secondary action
 ?
Disabled action
```

Avoid making all text equally bright.

---

# 78. THEME AND ARTWORK CONTRAST

When artwork contains very bright colors, surrounding UI should remain stable.

Do not dynamically recolor the entire application based on album artwork by default.

An optional future feature may derive an artwork accent theme, but that should remain separate from the core Tinted Theme system.

---

# 79. FUTURE ARTWORK-BASED THEMES

Potential future feature:

```text
ARTWORK ACCENT
```

Conceptually:

```text
Artwork
 ?
Color extraction
 ?
Accent suggestion
 ?
Preview
 ?
Optional application
```

This should not replace the user's active theme automatically.

---

# 80. THEME PERFORMANCE

Theme changes should be lightweight.

Prefer:

```text
CSS variable updates
```

over:

```text
rerender entire application
```

Do not recreate expensive visualizers or audio components just because the theme changed.

---

# 81. THEME PERSISTENCE PERFORMANCE

Theme changes should be saved asynchronously where practical.

The interface should update immediately.

Persistence should happen without blocking the UI.

---

# 82. THEME TESTING

Test:

```text
default theme
custom theme
imported Base16
imported Base24
imported Tinted8
invalid theme
missing colors
low contrast
theme switching
theme persistence
theme export
theme import
mobile theme
control panel theme
visualizer theme
```

---

# 83. VISUAL REGRESSION TESTING

Important screens should be checked after theme changes:

```text
desktop dashboard
mobile dashboard
now playing
radio browser
playlist view
settings
control panel
dialogs
queue
visualizer
status bar
```

Verify:

```text
no overlap
no unreadable text
no invisible borders
no invisible controls
no broken grid
no unexpected layout shifts
```

---

# 84. THEME DESIGN RULES

Every new theme should preserve:

```text
LIQUEAMP information density
LIQUEAMP grid structure
LIQUEAMP navigation
LIQUEAMP typography hierarchy
LIQUEAMP interaction model
```

A theme changes visual identity.

It does not redesign the product.

---

# 85. DEFAULT THEME REFERENCE

The default theme must remain faithful to the established LIQUEAMP direction:

```text
DARK CHARCOAL
DEEP FOREST GREEN
WARM ORANGE / PEACH
MUTED MINT
TERMINAL TYPOGRAPHY
CONTROLLED GLOW
PRECISE GRID
DENSE INFORMATION
```

The provided:

```text
liqueampui.png
```

remains the primary visual reference for the default visual language.

---

# 86. IMPORTANT IMPLEMENTATION RULE

Before implementing the theme system, Claude Code must:

1. Inspect the existing repository.
2. Read:

```text
LIQUEAMP_SPEC.md
LIQUEAMP_ARCHITECTURE.md
LIQUEAMP_DESIGN.md
LIQUEAMP_PROVIDERS.md
LIQUEAMP_THEMING.md
```

3. Inspect:

```text
liqueampui.png
```

4. Identify the existing CSS architecture.
5. Identify existing design tokens.
6. Reuse existing theme infrastructure if it is sound.
7. Remove hard-coded colors from reusable components where practical.
8. Introduce semantic CSS variables.
9. Implement theme persistence.
10. Implement the default LIQUEAMP theme.
11. Implement theme switching.
12. Implement the control-panel theme editor.
13. Implement Tinted/Base16 import where supported.
14. Implement export.
15. Test all major screens.

Do not blindly rewrite the application's styling architecture.

---

# 87. NO GENERIC THEME ENGINE

Do not build an enormous generic design-system framework simply for the sake of abstraction.

The theme system exists to support LIQUEAMP.

Prefer:

```text
simple
typed
semantic
maintainable
extensible
```

over:

```text
massively abstract
over-engineered
difficult to understand
```

---

# 88. FINAL THEME PRINCIPLE

LIQUEAMP should be able to change from:

```text
FOREST TERMINAL
```

to:

```text
AMBER NIGHT
```

or:

```text
BASE16-INSPIRED THEME
```

without changing what the application is.

The user should still see:

```text
the same player
the same library
the same queue
the same radio browser
the same playlists
the same controls
```

Only the visual identity changes.

---

# 89. FINAL SUCCESS CRITERIA

The theming system is successful when:

```text
A user selects a theme
        ?
LIQUEAMP updates immediately
        ?
All major components use the new semantic colors
        ?
No page reload is required
        ?
Playback continues uninterrupted
        ?
The theme persists after restarting the application
        ?
The user can edit the theme
        ?
The user can import a Tinted/Base16-style theme
        ?
The user can export their theme
        ?
The interface remains readable and structurally intact
```

The final result should make LIQUEAMP feel like a genuinely themeable piece of specialized software rather than a web application with a few color presets.

---

# END OF LIQUEAMP_THEMING.md

````

Nu har vi:

```text
LIQUEAMP_SPEC.md
LIQUEAMP_ARCHITECTURE.md
LIQUEAMP_DESIGN.md
LIQUEAMP_PROVIDERS.md
LIQUEAMP_THEMING.md
````

Nästa och sista större tekniska dokumentet innan själva **Master Build Prompt** är då **`LIQUEAMP_VISUALIZERS.md`**. Där kan vi specificera visualizers, Web Audio-analysering, olika visualizerlägen, performance, färgkoppling till temat och framför allt skillnaden mellan **riktig audio analysis och provider-källor där ljuddata inte är åtkomlig**.
