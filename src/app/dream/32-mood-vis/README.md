# Mood Viz — design notes

Route: `/dream/32-mood-vis`

## What it answers

"What if the visualizer chose its own aesthetic based on what you're playing?"

Every other prototype in the sandbox is a fixed aesthetic — fluid, particles, terrain — applied
to all audio equally. Mood Viz reverses that: the audio drives a classifier that picks one of six
visual modes automatically. The visualizer listens and adapts.

## How the classifier works

Three audio features drive classification (all derived from `useMicAnalyser`):

1. **Energy** (`amplitude`): total signal level, 0–1.
2. **Brightness** (`centroid`): spectral centroid in Hz — the "center of gravity" of the spectrum.
   A piano playing in the high register is bright (>2 kHz); a bass note or low drum is dark (<500 Hz).
3. **Spread** (coefficient of variation of 6-band energies): measures how evenly distributed the
   energy is across bands. A single clean note concentrates energy in 1–2 bands → low CV. A chord
   with noise/percussion spreads energy across many bands → high CV.

Decision tree:
```
amplitude < 0.08                     → minimal (near-silence)
CV > 1.1 AND amplitude > 0.15        → complex  (spectrally irregular)
amplitude > 0.35 AND centroid > 1500 → energetic_bright
amplitude > 0.35                     → energetic_dark
centroid > 1500                      → calm_bright
else                                 → calm_dark
```

No ML. No training data. The thresholds were tuned by reasoning about what piano/voice/drums would
produce: a bass note at moderate volume should be calm_dark; a forte chord in the high register
should be energetic_bright; a drumbeat with broad spectrum should be complex.

## Visual modes

**minimal** — Lissajous figure (ratio 2:3). Two sine waves plotted against each other trace a
  Bowditch curve that slowly rotates. Used for silence: the pure geometry of a ratio.

**calm · bright** — Ink rings. Four concentric circles expand outward from the center, each fading
  as it grows. New rings emerge from the center continuously. Cool blue-cyan. Like ripples in
  clear water.

**calm · dark** — Orbital drift. 110 particles orbit the center on parametric elliptical paths, each
  with a slightly different angular velocity (irrational multiples of base speed). No two particles
  stay in phase forever. Deep violet. Like a slowly breathing star field.

**energetic · bright** — Radial bloom. 72 spokes radiate outward from the center, each colored by
  one of the 6 frequency bands cycling around. Length = band energy. Also a warm central glow.
  Like a sunburst or frequency analyser pointing outward.

**energetic · dark** — Pulse field. Thick concentric rings pulse in and out with bass energy. Vertical
  bars oscillate with mid-range energy. Deep red/crimson. Heavy, rhythmic, low-pitched aesthetic.

**complex** — Spectral mandala. 6 arms rotate at slightly different speeds, each representing one
  frequency band. Arm length = band energy; arm width = thick with gradient. Both forward and
  short backward petals. Additive blending creates overlapping glow where arms cross.

## Natural crossfades

Mode transitions don't require a crossfade mechanism. The canvas uses 7% opacity persistence
each frame (trail decay of ~1 second). When the mode changes, the old mode's visuals fade
naturally in about 14 frames (~0.25s) while the new mode's visuals grow in simultaneously.
The result looks like a smooth 0.5–1s crossfade with no extra code.

## Demo mode

Auto-cycles through synthetic MicFrame data, one mood per 5 seconds. The last 800ms of each
phase blends toward the next frame's features for smooth transitions. This lets Karel see all
six modes without a microphone.

## Polish ideas for future cycles

- **Hysteresis**: add a 300ms dwell timer before changing mood (prevents flicker on edge cases).
- **Manual override**: click a mood name in the sidebar to force-lock it.
- **Tempo mode**: add a 7th mode "rhythmic" that triggers on high BPM (>100) — cymatics-style
  pattern that pulses on the beat.
- **Color temperature tie-in**: the whole scene's color temperature could shift with brightness —
  cool whites for calm_bright, warm oranges for energetic_bright — making the aesthetic more coherent.
- **ZCR axis**: add actual zero-crossing rate from `getFloatTimeDomainData` for a finer-grained
  "noisy vs tonal" axis beyond the band-energy CV approximation.
