
# LIQUEAMP — VISUALIZERS

Version: 1.0  
Status: Active Development  
Document Type: Visualizer & Audio Analysis Specification

---

# 1. PURPOSE

This document defines the visualizer system for LIQUEAMP.

The visualizer system is responsible for turning available audio information into visual feedback while maintaining the LIQUEAMP visual identity.

Visualizers should feel like an integrated part of the music player rather than a decorative animation placed on top of the interface.

The system must support:

- real-time audio analysis
- frequency visualization
- waveform visualization
- spectrum visualization
- bars
- particles
- terminal-style visualizers
- minimal visualizers
- theme-aware visualizers
- fullscreen visualizer modes
- mobile-friendly visualizers
- performance-aware rendering
- reduced-motion behavior
- provider capability differences

The core principle is:

> When real audio data is available, visualize the actual audio.  
> When it is not available, never pretend that generated data is real audio analysis.

---

# 2. CORE PRINCIPLE

The visualizer system must remain separate from:

```text
Playback UI
Provider adapters
Library
Queue
Playlists
Theme storage
Navigation
````

Conceptually:

```text
Audio Source
     ↓
Playback Engine
     ↓
Audio Analysis
     ↓
Visualizer Engine
     ↓
Visualizer Renderer
     ↓
Canvas / DOM
```

The visualizer must consume normalized analysis data.

It should not directly understand whether the audio originated from:

```text
Direct Stream
Radio
YouTube
Spotify
SoundCloud
```

---

# 3. IMPORTANT DISTINCTION

LIQUEAMP must distinguish between:

```text
REAL AUDIO ANALYSIS
```

and:

```text
DECORATIVE / SIMULATED VISUALIZATION
```

If the browser can access the audio signal:

```text
Audio
 ↓
AnalyserNode
 ↓
Real frequency/waveform data
 ↓
Visualizer
```

If the provider does not expose raw audio:

```text
Provider playback
 ↓
No raw audio access
 ↓
Visualizer unavailable
```

or, if explicitly designed:

```text
Provider playback
 ↓
Non-audio decorative animation
```

The latter must not be presented as real audio-reactive visualization.

---

# 4. VISUALIZER ARCHITECTURE

The architecture should conceptually be:

```text
                 PLAYBACK ENGINE
                        │
                        ▼
                AUDIO ANALYSIS
                        │
                        ▼
              VISUALIZER ENGINE
                        │
             ┌──────────┴──────────┐
             │                     │
             ▼                     ▼
       Analysis State        Visualizer State
             │                     │
             └──────────┬──────────┘
                        ▼
                VISUALIZER RENDERER
                        │
             ┌──────────┼──────────┐
             ▼          ▼          ▼
           Bars      Waveform   Spectrum
```

The exact implementation may differ.

The important requirement is separation of:

```text
audio data
visualizer logic
rendering
UI configuration
```

---

# 5. VISUALIZER INTERFACE

Visualizers should implement a common interface.

Conceptually:

```ts
interface Visualizer {
  id: string;
  name: string;

  initialize(
    container: HTMLElement
  ): void;

  resize(
    width: number,
    height: number,
    devicePixelRatio: number
  ): void;

  render(
    frame: VisualizerFrame
  ): void;

  destroy(): void;

  getCapabilities(): VisualizerCapabilities;
}
```

The exact implementation may differ.

Do not force every visualizer to use identical internal rendering techniques.

---

# 6. VISUALIZER FRAME

The renderer should receive normalized analysis data.

Example:

```ts
interface VisualizerFrame {
  timestamp: number;

  waveform?: Float32Array;

  frequency?: Uint8Array;

  frequencyFloat?: Float32Array;

  rms?: number;

  peak?: number;

  bass?: number;

  mid?: number;

  treble?: number;

  sampleRate?: number;

  isPlaying: boolean;

  isLive: boolean;
}
```

Only values that are actually available should be populated.

---

# 7. ANALYSIS ENGINE

The analysis engine should use Web Audio API where possible.

Typical architecture:

```text
HTMLAudioElement
       ↓
AudioContext
       ↓
MediaElementAudioSourceNode
       ↓
AnalyserNode
       ↓
Visualizer
       ↓
Destination
```

The analyser must not interfere with normal playback.

---

# 8. AUDIO CONTEXT

Do not create unnecessary `AudioContext` instances.

Prefer one reusable audio analysis context where the architecture permits.

The application should correctly handle:

```text
suspended
running
closed
```

states.

Browser autoplay restrictions must be respected.

---

# 9. AUDIO ANALYSER

Where supported, use:

```text
AnalyserNode
```

for:

```text
frequency data
time-domain data
```

Typical values:

```text
fftSize
frequencyBinCount
smoothingTimeConstant
```

should be configurable internally.

Do not use unnecessarily large FFT sizes.

---

# 10. FFT SIZE

The FFT size should balance:

```text
frequency resolution
CPU usage
visual smoothness
```

A reasonable starting range may be:

```text
1024
2048
4096
```

The exact value should be selected based on visualizer requirements.

Do not default to an unnecessarily expensive FFT configuration.

---

# 11. SMOOTHING

Audio data can be noisy.

Use analyser smoothing where appropriate.

The visualizer may also implement its own interpolation.

Avoid visualizer movement that looks:

```text
jittery
unstable
random
```

unless that behavior is intentionally part of the visualizer design.

---

# 12. AUDIO FEATURES

The analysis layer may expose:

```text
RMS
Peak
Bass
Mid
Treble
Waveform
Frequency spectrum
```

These values can be derived from analyser data.

Example:

```text
Frequency bins
     ↓
Low frequency range
     ↓
Bass energy

Mid frequency range
     ↓
Mid energy

High frequency range
     ↓
Treble energy
```

These values should be normalized before being consumed by visualizers.

---

# 13. NORMALIZED VALUES

Visualizer parameters should generally use normalized values.

Example:

```text
0.0 → no energy
1.0 → maximum normalized energy
```

For example:

```ts
bass: 0.0 - 1.0
mid: 0.0 - 1.0
treble: 0.0 - 1.0
rms: 0.0 - 1.0
```

This prevents visualizers from becoming dependent on provider-specific raw values.

---

# 14. WAVEFORM

The waveform visualizer uses time-domain audio data.

Conceptually:

```text
Audio
 ↓
AnalyserNode
 ↓
Time Domain Data
 ↓
Waveform Renderer
```

Possible rendering:

```text
────────────────────────
──────╱╲────╱╲──────────
────╱──╲──╱──╲──────────
──╱────╲╱────╲──────────
────────────────────────
```

The waveform should represent actual audio data when available.

---

# 15. SPECTRUM

The spectrum visualizer displays frequency energy.

Conceptually:

```text
LOW                         HIGH
│                            │
█                            ▂
██                           ▃
████        ███              ▅
██████    ███████            ▇
```

The spectrum may use:

```text
linear frequency scale
logarithmic frequency scale
```

A logarithmic scale is generally more musically useful.

---

# 16. FREQUENCY BANDS

Visualizers may group frequency bins into perceptual bands.

Example:

```text
Bass
Low Mid
Mid
High Mid
Treble
```

or a larger number of bands.

The number of displayed bars does not have to equal the number of FFT bins.

---

# 17. BAR VISUALIZER

The bar visualizer should be one of the primary LIQUEAMP visualizers.

Characteristics:

```text
dense
technical
precise
responsive
```

Example:

```text
▂ ▃ ▅ ▇ █ ▇ ▅ ▃ ▂ ▄ ▆ █ ▆ ▄ ▂
```

Bars should react to actual frequency energy.

---

# 18. TERMINAL SPECTRUM

A terminal-style spectrum may use characters instead of traditional graphical bars.

Example:

```text
00:00  ▂▃▅▇████▇▅▃▂
00:01  ▃▅▇██████▇▅▃
00:02  ▂▃▆████▆▃▂
```

Possible characters:

```text
▁ ▂ ▃ ▄ ▅ ▆ ▇ █
```

This visualizer should fit the LIQUEAMP terminal aesthetic.

---

# 19. WAVEFORM TERMINAL

A character-based waveform may render:

```text
────╲╱╲────╱╲╱────
```

or:

```text
▁▂▄▆█▇▄▂▁▃▅█▆▃▁
```

It should still be based on actual waveform data.

---

# 20. DOT MATRIX VISUALIZER

A grid-based visualizer may use a matrix:

```text
· · · ▪ ▪ · ·
· · ▪ █ ▪ · ·
· ▪ █ █ █ ▪ ·
▪ █ █ █ █ █ ▪
```

This fits the terminal/software aesthetic well.

It should remain lightweight enough for mobile devices.

---

# 21. PARTICLE VISUALIZER

A particle visualizer may map audio energy to:

```text
particle velocity
particle count
particle size
particle brightness
```

However:

```text
audio → deterministic behavior
```

should be preferred over arbitrary random movement.

Particles may use controlled pseudo-randomness for visual variation.

---

# 22. PARTICLE PERFORMANCE

Do not create thousands of DOM elements for particles.

Prefer:

```text
Canvas
```

for particle visualizers.

Particle count should scale according to:

```text
device capability
viewport size
performance
```

---

# 23. CIRCULAR VISUALIZER

A circular spectrum may map frequency bins around a circle.

Conceptually:

```text
          █ █
       █       █
     █           █
     █    ●      █
       █       █
          █ █
```

The style should remain restrained and technical rather than becoming a generic music visualizer.

---

# 24. MINIMAL VISUALIZER

A minimal mode should use very little visual information.

Example:

```text
BASS     ███████░░░
MID      █████░░░░░
TREBLE   ████████░░
```

This is useful in dense dashboard layouts.

---

# 25. OSCILLOSCOPE

An oscilloscope visualizer displays the waveform across the screen.

Requirements:

```text
smooth rendering
stable centerline
actual waveform data
low latency
```

Avoid excessive glow.

---

# 26. SPECTROGRAM

A spectrogram may display frequency over time.

Conceptually:

```text
TIME →
┌──────────────────────────────┐
│ ░░▒▒▓▓████▓▓▒▒░░             │
│ ░▒▓██████████▓▒░             │
│ ░░▒▓████▓▓▒▒░░               │
└──────────────────────────────┘
```

A spectrogram is more computationally expensive and should be treated as an advanced visualizer.

---

# 27. SPECTROGRAM PERFORMANCE

Use Canvas rather than large DOM structures.

Prefer updating only the necessary region rather than recreating the entire image.

If performance becomes problematic:

```text
reduce resolution
reduce update frequency
reduce FFT size
```

before disabling the visualizer entirely.

---

# 28. VISUALIZER REGISTRY

Visualizers should be registered centrally.

Conceptually:

```ts
interface VisualizerRegistry {
  register(visualizer: Visualizer): void;

  get(id: string): Visualizer | undefined;

  getAll(): Visualizer[];
}
```

Example:

```text
bars
spectrum
waveform
terminal-spectrum
terminal-waveform
dots
particles
circular
oscilloscope
spectrogram
minimal
```

---

# 29. VISUALIZER SETTINGS

The user should be able to select:

```text
Visualizer
Intensity
Sensitivity
Smoothing
Scale
Color mode
Glow
Mirror
```

Not every visualizer needs every setting.

Only display settings supported by the selected visualizer.

---

# 30. VISUALIZER INTENSITY

Intensity controls the visual response.

Conceptually:

```text
0.0
 ↓
low
 ↓
medium
 ↓
high
 ↓
1.0
```

This should modify visual amplification rather than inventing audio data.

---

# 31. VISUALIZER SENSITIVITY

Sensitivity determines how strongly the visualizer reacts to audio.

Low sensitivity:

```text
subtle movement
```

High sensitivity:

```text
strong movement
```

The underlying audio data remains unchanged.

---

# 32. VISUALIZER SMOOTHING

Smoothing should control temporal response.

Low smoothing:

```text
fast
sharp
reactive
```

High smoothing:

```text
slow
fluid
soft
```

Avoid excessive smoothing that makes the visualizer feel disconnected from the audio.

---

# 33. VISUALIZER SCALE

Frequency scale may support:

```text
linear
logarithmic
musical
```

The default should generally favor a musically useful logarithmic distribution.

---

# 34. MIRROR MODE

Some visualizers may support mirrored output.

Example:

```text
        █
      ███
    █████
  ███████
    █████
      ███
        █
```

This should be an optional visual treatment.

---

# 35. COLOR MODES

Visualizers should support:

```text
THEME
ACCENT
DUAL
MONO
CUSTOM
```

These modes must use the theme system defined in:

```text
LIQUEAMP_THEMING.md
```

---

# 36. THEME COLOR INTEGRATION

Default visualizer colors should derive from:

```text
--la-visualizer
--la-visualizer-secondary
--la-accent
--la-accent-bright
```

Do not hard-code:

```text
#00ff00
#ff0000
#00ffff
```

inside visualizer components.

---

# 37. GLOW

Glow may be enabled for selected visualizers.

However:

```text
more glow ≠ better
```

Use glow as a controlled visual effect.

Example:

```text
bars
→ subtle glow

terminal spectrum
→ very subtle glow

particle mode
→ optional glow

minimal
→ no glow
```

---

# 38. MOBILE VISUALIZERS

Mobile visualizers must be designed for:

```text
9:16
touch interfaces
smaller GPU budgets
smaller viewport
battery constraints
```

Do not simply scale a desktop visualizer down.

---

# 39. MOBILE PERFORMANCE

On mobile:

```text
reduce particle count
reduce canvas resolution when necessary
avoid excessive blur
avoid unnecessary redraws
```

Use device pixel ratio intelligently.

Do not automatically render a huge 4K canvas on a small phone.

---

# 40. DEVICE PIXEL RATIO

Canvas rendering should account for:

```text
devicePixelRatio
```

but should cap the effective resolution when appropriate.

Example concept:

```text
effective DPR =
min(devicePixelRatio, configured maximum)
```

This prevents excessive GPU load on high-density screens.

---

# 41. RESPONSIVE VISUALIZER SIZE

The visualizer should respond to its container.

It should not assume:

```text
1920 × 1080
```

or another fixed size.

When the container changes:

```text
ResizeObserver
 ↓
Visualizer.resize()
```

should update the rendering dimensions.

---

# 42. NO LAYOUT SHIFT

The visualizer must have a stable container.

It must not cause:

```text
panel expansion
grid movement
content jumping
```

when activated.

---

# 43. CANVAS

Canvas is preferred for:

```text
waveform
spectrum
particles
circular visualizer
spectrogram
oscilloscope
```

Canvas avoids large numbers of DOM elements.

---

# 44. DOM VISUALIZERS

DOM/CSS visualizers may be used for very simple effects.

Examples:

```text
terminal bars
status indicators
minimal meters
```

Avoid creating hundreds of animated DOM elements.

---

# 45. REQUESTANIMATIONFRAME

Visualizers should use:

```text
requestAnimationFrame
```

for animation.

Do not use:

```text
setInterval
```

as the primary rendering loop.

---

# 46. FRAME RATE

Visualizers should generally target the browser's natural rendering rate.

However, the visualizer may intentionally render at a lower rate if:

```text
device is weak
battery saver is active
visualizer is low priority
```

The application should avoid wasting CPU/GPU resources.

---

# 47. VISUALIZER UPDATE RATE

Audio analysis and visual rendering do not necessarily need to run at the same rate.

Possible architecture:

```text
Audio analysis
60 Hz
      ↓
Visualizer
60 FPS

or

Audio analysis
30 Hz
      ↓
Visualizer
30 FPS
```

The system should remain flexible.

---

# 48. VISUALIZER LIFECYCLE

Visualizers must properly implement:

```text
initialize
resize
render
destroy
```

When switching visualizers:

```text
old visualizer
 ↓
destroy
 ↓
new visualizer
 ↓
initialize
```

Do not leave animation loops running after the visualizer has been removed.

---

# 49. MEMORY MANAGEMENT

Clean up:

```text
requestAnimationFrame
event listeners
canvas references
audio analysis subscriptions
temporary buffers
```

when a visualizer is destroyed.

Memory leaks are especially important for a persistent music application that may remain open for hours.

---

# 50. PLAYBACK CONTINUITY

Changing visualizers must never interrupt audio playback.

Example:

```text
Music playing
 ↓
Change Spectrum → Waveform
 ↓
Audio continues uninterrupted
```

The visualizer is a consumer of the audio analysis system.

It does not own playback.

---

# 51. VISUALIZER SETTINGS PERSISTENCE

The selected visualizer and its settings should persist.

Example:

```text
visualizer:
  type: spectrum
  intensity: 0.72
  smoothing: 0.55
  colorMode: theme
  glow: true
```

The exact schema may evolve.

---

# 52. PER-DEVICE SETTINGS

If useful, visualizer preferences may later be separated by:

```text
desktop
mobile
```

but this should not be implemented unless there is a practical reason.

Keep the first implementation simple.

---

# 53. REDUCED MOTION

If:

```text
prefers-reduced-motion: reduce
```

is active:

```text
reduce animation
reduce particle movement
disable unnecessary pulsing
reduce glow animation
```

The visualizer may remain active if it is useful and lightweight.

Alternatively provide:

```text
VISUALIZER
OFF
```

---

# 54. VISUALIZER OFF

Users must be able to disable visualizers.

Example:

```text
VISUALIZER
[ OFF ]
```

When disabled:

```text
destroy renderer
stop render loop
release unnecessary resources
```

Audio playback must continue normally.

---

# 55. PROVIDER CAPABILITIES

Visualizer availability depends on provider playback mode.

### Native audio

Potentially:

```text
waveform
spectrum
bars
particles
spectrogram
oscilloscope
```

### Embedded playback

Potentially:

```text
provider-dependent
```

If raw audio is unavailable:

```text
real audio visualizer = unavailable
```

### External playback

LIQUEAMP cannot analyze the external application's audio.

Display:

```text
VISUALIZER
NOT AVAILABLE

Audio is playing outside LIQUEAMP.
```

---

# 56. RADIO

Radio streams are excellent candidates for live analysis when the browser has access to the stream.

Visualizer behavior:

```text
radio stream
 ↓
native audio
 ↓
AnalyserNode
 ↓
visualizer
```

Live metadata updates must not interrupt the visualizer.

---

# 57. DIRECT STREAMS

Direct streams should provide the clearest path to real-time analysis.

Where browser CORS and audio routing permit:

```text
stream
 ↓
HTMLAudioElement
 ↓
AudioContext
 ↓
AnalyserNode
```

The visualizer should react to actual audio.

---

# 58. PROVIDER RESTRICTIONS

If an external provider prevents raw audio analysis:

Do not:

```text
guess the spectrum
invent waveform
pretend generated particles are audio-reactive
```

Instead:

```text
VISUALIZER
──────────
Provider does not expose raw audio
for browser analysis.
```

If decorative animation is available:

```text
AMBIENT MODE
```

should be clearly distinguished from:

```text
AUDIO REACTIVE
```

---

# 59. AMBIENT MODE

Optional ambient mode may provide visual motion without claiming to represent audio.

Example:

```text
slow gradient movement
subtle terminal activity
gentle particle drift
```

This can be used when raw audio is unavailable.

Label internally as:

```text
ambient
```

not:

```text
audio-reactive
```

---

# 60. AUDIO-REACTIVE MODE

When actual audio analysis exists:

```text
mode = audio-reactive
```

The visualizer may respond to:

```text
bass
mid
treble
rms
peak
frequency bins
waveform
```

---

# 61. VISUALIZER STATE

Visualizer state should remain separate from player state.

Example:

```ts
interface VisualizerState {
  enabled: boolean;

  visualizerId: string;

  intensity: number;
  sensitivity: number;
  smoothing: number;

  colorMode: VisualizerColorMode;

  glow: boolean;
}
```

The visualizer state should not contain:

```text
currentTrack
queue
volume
playlist
```

Those belong elsewhere.

---

# 62. VISUALIZER EVENTS

The visualizer may subscribe to:

```text
playback started
playback paused
playback stopped
media changed
provider changed
analysis available
analysis unavailable
theme changed
container resized
```

It should not directly control those systems.

---

# 63. VISUALIZER AND THEME CHANGES

When the user changes theme:

```text
Theme
 ↓
CSS variables
 ↓
Visualizer color configuration
```

The visualizer should update without restarting audio.

If possible, the current visualizer should remain active.

---

# 64. VISUALIZER SETTINGS PANEL

The UI may contain:

```text
VISUALIZER

MODE
[ SPECTRUM ]

INTENSITY
███████░░░

SENSITIVITY
██████░░░░

SMOOTHING
█████░░░░░

COLOR
[ THEME ]

GLOW
[ ON ]

[ FULLSCREEN ]
```

Controls should only appear if supported by the selected visualizer.

---

# 65. FULLSCREEN VISUALIZER

A fullscreen visualizer mode may be provided.

Conceptually:

```text
┌───────────────────────────────────────┐
│                                       │
│                                       │
│             VISUALIZER                │
│                                       │
│                                       │
│         ARTIST — TITLE                │
│                                       │
│                                       │
└───────────────────────────────────────┘
```

The mode should remain lightweight and allow the user to exit easily.

---

# 66. FULLSCREEN CONTROLS

Controls may auto-hide.

However, the user must always have an obvious way to exit.

Possible:

```text
ESC
tap
click
back button
```

depending on device.

---

# 67. MOBILE FULLSCREEN

On mobile, fullscreen visualizer should respect:

```text
safe areas
notches
home indicators
browser UI
orientation
```

Do not place critical controls beneath system UI.

---

# 68. VISUALIZER + NOW PLAYING

The main Now Playing panel may contain a compact visualizer.

Possible layout:

```text
ARTWORK

ARTIST
TITLE

━━━━━━━━━━━━━━━━
VISUALIZER
━━━━━━━━━━━━━━━━

PLAYBACK CONTROLS
```

The visualizer should not dominate the artwork or metadata.

---

# 69. VISUALIZER + RADIO

For radio:

```text
STATION
NOW PLAYING
VISUALIZER
```

The visualizer can provide continuous movement even when the station's metadata does not change.

---

# 70. VISUALIZER + QUEUE

The queue should not rerender continuously because the visualizer updates.

Visualizer rendering must remain isolated from application state updates.

---

# 71. REACT / UI PERFORMANCE

If the application uses React:

Do not place rapidly changing analyser data directly into React state at frame rate.

Avoid:

```ts
setState(frequencyData)
```

60 times per second.

Prefer:

```text
Canvas renderer
requestAnimationFrame
mutable rendering state
```

React should control configuration, not individual animation frames.

---

# 72. STATE SEPARATION

Use:

```text
React/application state
```

for:

```text
selected visualizer
settings
enabled state
```

Use:

```text
renderer-local state
```

for:

```text
frame buffers
canvas context
animation frame
interpolation
temporary arrays
```

This prevents unnecessary application rerenders.

---

# 73. AUDIO BUFFER MANAGEMENT

Avoid allocating new arrays every frame.

Prefer reusable buffers:

```text
Uint8Array
Float32Array
```

where possible.

Example:

```text
Analyzer buffer
      ↓
reuse every frame
```

This reduces garbage collection pressure.

---

# 74. VISUALIZER OPTIMIZATION

Prioritize:

```text
stable frame rate
low allocations
small DOM footprint
GPU-friendly rendering
```

Avoid expensive operations such as:

```text
huge blur filters
thousands of shadows
massive particle counts
large DOM animations
```

---

# 75. VISUALIZER QUALITY

The visualizer should feel responsive.

Avoid:

```text
random jitter
laggy movement
delayed reaction
unrelated animation
```

when audio analysis is available.

A user should be able to recognize that the visualization follows the music.

---

# 76. AUDIO NORMALIZATION

Different streams can have dramatically different loudness.

The visualizer should normalize its response enough to remain visible across sources.

However, avoid aggressive normalization that causes quiet music and loud music to look identical.

A configurable sensitivity/gain stage is preferable.

---

# 77. PEAK HOLD

Some meters may support peak hold.

Example:

```text
█████████
       ▲
       peak
```

The peak indicator should decay over time.

This is useful for:

```text
VU meter
spectrum
terminal meters
```

---

# 78. VU METER

Optional visualizer:

```text
LEFT  ████████░░
RIGHT ██████░░░░
```

It may display:

```text
RMS
peak
```

where actual channel data is available.

Do not fabricate stereo separation if only a mono signal is available.

---

# 79. STEREO VISUALIZATION

If the audio system exposes channel information, visualizers may represent:

```text
LEFT
RIGHT
```

separately.

If not:

```text
do not pretend
```

Use a single combined visualization.

---

# 80. FREQUENCY COLOR MAPPING

A visualizer may map:

```text
bass → primary
mid → secondary
treble → accent
```

but the exact mapping should derive from the active theme.

Do not hard-code a rainbow spectrum unless the user explicitly chooses such a visualizer style.

---

# 81. RAINBOW MODE

A rainbow color mode may exist as an optional future/custom visualizer.

It should not be the default.

The default LIQUEAMP visual identity is based on a restrained theme palette.

---

# 82. TERMINAL CHARACTER SET

Terminal visualizers may use:

```text
▁
▂
▃
▄
▅
▆
▇
█
```

or:

```text
·
▪
■
```

The exact characters should be tested across supported browsers and fonts.

Fallback characters should exist if necessary.

---

# 83. FONT DEPENDENCE

Visualizers must not depend on a specific font for correctness.

Terminal visualizers should remain readable if the selected font lacks a particular glyph.

---

# 84. VISUALIZER ACCESSIBILITY

Visualizers are decorative/informational.

They must not be the only way to understand player state.

For example:

```text
visualizer movement
```

must not be the only indication that playback is active.

The player should still expose:

```text
Playing
Paused
Buffering
Live
```

as text/ARIA information where appropriate.

---

# 85. SCREEN READERS

Canvas content should not be treated as the only source of information.

Provide accessible labels for:

```text
Visualizer type
Playback state
```

Example:

```text
"Audio spectrum visualizer. Playback active."
```

The exact implementation may use ARIA labels or hidden descriptive text.

---

# 86. VISUALIZER ERROR HANDLING

If visualizer initialization fails:

```text
VISUALIZER ERROR

Audio analysis is unavailable.

[ DISABLE VISUALIZER ]
```

Playback should continue.

Visualizer failure must never stop the music.

---

# 87. BROWSER COMPATIBILITY

The implementation should account for differences in:

```text
AudioContext
MediaElementAudioSourceNode
AnalyserNode
Canvas
Media Session
autoplay restrictions
```

The visualizer should degrade gracefully.

---

# 88. SAFARI / MOBILE AUDIO

Mobile Safari and other browsers may impose stricter audio lifecycle rules.

Do not assume:

```text
AudioContext
```

can start before a user interaction.

Initialize/resume audio processing when browser policies allow it.

---

# 89. AUTOPLAY

Visualizer initialization must not accidentally trigger audio playback.

The visualizer observes playback.

It does not initiate playback unless explicitly requested by the playback engine.

---

# 90. VISUALIZER SETTINGS IN `/CONTROL`

`/control` may expose technical settings:

```text
VISUALIZER ENGINE

FFT SIZE
[ 2048 ]

FRAME LIMIT
[ AUTO ]

DPR CAP
[ 2 ]

ANALYSIS SMOOTHING
[ 0.70 ]

DEBUG
[ OFF ]
```

These settings should be intended for advanced configuration.

Do not expose unnecessary technical options in normal user settings.

---

# 91. DEBUG VISUALIZER

Development mode may show:

```text
FPS
FFT SIZE
FRAME TIME
CANVAS SIZE
DPR
ANALYSIS AVAILABLE
```

These are diagnostic metrics.

They must not be presented as normal user-facing status information unless useful.

---

# 92. NO FAKE METRICS

Never display fake:

```text
FPS
audio levels
CPU usage
GPU usage
latency
buffer
```

If a metric is shown, it must be measured.

If it cannot be measured:

```text
—
```

or omit it.

---

# 93. VISUALIZER PRESETS

The application may provide presets:

```text
DEFAULT
TERMINAL
MINIMAL
RADIO
SPECTRUM
AMBIENT
```

Presets should configure existing visualizer settings rather than creating entirely separate systems.

---

# 94. CUSTOM PRESETS

Users may eventually save visualizer presets.

Example:

```text
TERMINAL GREEN
AMBER SPECTRUM
MINIMAL RADIO
FULLSCREEN BARS
```

These should be stored separately from themes.

A visualizer preset may reference a theme but should not duplicate the entire theme.

---

# 95. THEME VS VISUALIZER

Keep these concepts separate.

Theme:

```text
whole application visual identity
```

Visualizer preset:

```text
visualizer behavior and presentation
```

Example:

```text
Theme:
Forest Terminal

Visualizer:
Spectrum

Preset:
Heavy Bass
```

---

# 96. VISUALIZER DATA FLOW

Final intended data flow:

```text
                    AUDIO SOURCE
                         │
                         ▼
                  PLAYBACK ENGINE
                         │
                         ▼
                    AUDIO NODE
                         │
                         ▼
                   ANALYSER NODE
                         │
              ┌──────────┴──────────┐
              │                     │
              ▼                     ▼
       Frequency Data          Waveform Data
              │                     │
              └──────────┬──────────┘
                         ▼
                 ANALYSIS ENGINE
                         │
                         ▼
                NORMALIZED FRAME
                         │
                         ▼
                VISUALIZER ENGINE
                         │
                         ▼
                    CANVAS / DOM
```

---

# 97. PROVIDER-AWARE DATA FLOW

For native audio:

```text
Provider
 ↓
Native Audio
 ↓
Analyser
 ↓
Real Visualizer
```

For embedded provider playback:

```text
Provider
 ↓
Official Embed
 ↓
Raw audio unavailable
 ↓
No real audio analysis
```

For external playback:

```text
Provider
 ↓
External application
 ↓
LIQUEAMP cannot analyze audio
```

This distinction must remain explicit.

---

# 98. INITIAL VISUALIZER SET

The first implementation should prioritize:

```text
1. Spectrum Bars
2. Waveform
3. Terminal Spectrum
4. Minimal Meter
5. Oscilloscope
```

Additional visualizers can follow:

```text
6. Circular Spectrum
7. Particles
8. Dot Matrix
9. Spectrogram
```

The implementation order is about development scope, not product importance.

---

# 99. INITIAL DEFAULT

The default LIQUEAMP visualizer should be:

```text
Spectrum Bars
```

with:

```text
theme colors
moderate smoothing
moderate sensitivity
subtle glow
```

The exact values should be configurable.

---

# 100. MOBILE DEFAULT

Mobile may use:

```text
Minimal Meter
```

or:

```text
Spectrum Bars
```

depending on available performance.

Do not force a separate mobile visualizer architecture.

---

# 101. VISUALIZER DEVELOPMENT CHECKLIST

Before considering the visualizer system complete:

```text
[ ] Central visualizer registry
[ ] Common visualizer interface
[ ] Audio analysis service
[ ] AnalyserNode integration
[ ] Waveform data
[ ] Frequency data
[ ] Normalized analysis frame
[ ] Spectrum bars
[ ] Waveform
[ ] Terminal spectrum
[ ] Minimal meter
[ ] Oscilloscope
[ ] Theme integration
[ ] Visualizer settings
[ ] Persistence
[ ] Resize handling
[ ] DPR handling
[ ] Mobile optimization
[ ] Reduced motion
[ ] Visualizer off state
[ ] Provider capability handling
[ ] Cleanup/destroy
[ ] No playback interruption
[ ] No fake audio data
[ ] No memory leaks
[ ] Performance testing
```

---

# 102. IMPORTANT IMPLEMENTATION RULE

Before implementing the visualizer system, Claude Code must:

1. Inspect the existing repository.

2. Read:

```text
LIQUEAMP_SPEC.md
LIQUEAMP_ARCHITECTURE.md
LIQUEAMP_DESIGN.md
LIQUEAMP_PROVIDERS.md
LIQUEAMP_THEMING.md
LIQUEAMP_VISUALIZERS.md
```

3. Inspect:

```text
liqueampui.png
```

4. Identify the existing audio/playback implementation.

5. Reuse the centralized playback engine if one already exists.

6. Do not create a second audio engine merely for visualization.

7. Determine which current providers expose audio that can actually be analyzed.

8. Implement the analysis layer independently from individual visualizers.

9. Implement visualizers through a common registry/interface.

10. Verify that changing visualizers never interrupts playback.

11. Verify that disabling visualizers releases unnecessary resources.

12. Verify mobile performance.

13. Verify reduced-motion behavior.

14. Verify theme switching.

15. Verify that no fake audio-reactive data is displayed.

---

# 103. NO FAKE VISUALIZATION

This is one of the most important rules in this document.

Do not generate random values such as:

```ts
Math.random()
```

and present them as audio analysis.

Do not create:

```text
fake waveform
fake spectrum
fake BPM response
fake frequency data
```

when real audio analysis is unavailable.

If a decorative animation is desired, explicitly call it:

```text
AMBIENT
```

rather than:

```text
AUDIO REACTIVE
```

---

# 104. VISUALIZER FAILURE MUST NOT BREAK PLAYBACK

The following should always be true:

```text
Visualizer crashes
        ↓
Music keeps playing
```

```text
Canvas fails
        ↓
Music keeps playing
```

```text
Audio analysis unavailable
        ↓
Music keeps playing
```

```text
Visualizer switched
        ↓
Music keeps playing
```

The visualizer is optional.

The player is not.

---

# 105. FINAL VISUALIZER PRINCIPLE

The LIQUEAMP visualizer system should feel like part of the machine.

It should communicate:

```text
audio is moving
frequency is changing
the stream is alive
```

without becoming visual noise.

The visualizer should reinforce the established LIQUEAMP aesthetic:

```text
terminal
technical
dense
precise
dark
warm
green
orange
controlled glow
```

It should not turn LIQUEAMP into a generic neon music visualizer.

---

# 106. FINAL SUCCESS CRITERIA

The visualizer system is successful when:

```text
Audio starts
    ↓
Analysis becomes available
    ↓
Visualizer receives real data
    ↓
Visualization responds smoothly
    ↓
Theme colors are applied
    ↓
Playback remains uninterrupted
```

and when:

```text
Audio analysis is unavailable
    ↓
LIQUEAMP clearly communicates the limitation
    ↓
Playback still works normally
    ↓
No fake audio visualization is presented
```

The final result should make the player feel alive while remaining technically honest about what the browser can and cannot analyze.

---

# END OF LIQUEAMP_VISUALIZERS.md
