# Morning digest — last updated 2026-05-25 UTC (Cycle 188)

## New since yesterday

- **[/dream/160-kids-paint-loop](https://getresonance.vercel.app/dream/160-kids-paint-loop)** —
  Loop Garden (kids). **Why open this**: draw any glowing stroke on the screen — it
  immediately starts looping as a melody. Draw up to four strokes in different parts of
  the canvas; each gets its own color and timbre (violet=piano, amber=bells, teal=chime,
  rose=pads). Tap any stroke to erase it in a sparkle burst. The canvas accumulates
  overlapping loops, building from silence to a layered musical garden in under a minute.
  Hit "Watch the demo" to see three loops already playing before you draw.
  **First kids prototype that combines freehand drawing + multi-timbral loop station** —
  extends your loved prototypes `100-kids-paint-song` and `111-kids-shape-loop` into
  a simultaneous layered experience. For kids 3+. Zero permissions · Zero API · Zero deps.

- **[/dream/159-synesthetic-sketch](https://getresonance.vercel.app/dream/159-synesthetic-sketch)** —
  Synesthetic Sketch (adult, Cycle 187). Spectral spread → shape type; centroid → hue;
  richness → inner rings. First prototype mapping audio to morphological shape.

## In progress / partial

- Nothing in-progress. Cycle 189 is next (adult cycle, 189%2=1).

## Research findings worth a look

- **Multi-timbral zones without visible UI**: the Loop Garden teaches color = timbre
  through pure discovery — no labels, no borders. A child who draws in different screen
  regions finds different sounds. By the third stroke they're deliberately choosing regions.
  This design pattern (invisible zones that reward exploration) is worth applying to adult
  prototypes too (e.g., `3-fluid` could have invisible parameter zones by canvas region).

## Open questions for Karel

- **`160-kids-paint-loop` loop density**: currently note duration is 0.32 s, so a 12-note
  loop takes ~3.8 s to complete. Does this feel right, or should short strokes loop faster
  (0.20 s notes)? Easy to tune.
- **`160-kids-paint-loop` max loops**: capped at 4. Could raise to 6 for a richer garden
  experience on iPad. Let me know.
- **`154-kids-clap-back` pattern dots**: deferred again (chose new build over polish).
  Can land in Cycle 190 (next kids cycle). Confirm if still wanted.
- **Cycle 189 adult candidates**: `diatonic-harmony` (detect your key live, generate
  diatonic 3rd + 5th harmony voices alongside your melody, zero deps) or `tap-rhythm`
  (clap a rhythm, get a circular step sequencer). Any preference?
