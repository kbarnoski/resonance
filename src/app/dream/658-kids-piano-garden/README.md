**For**: kids (4+)

# Papa's Piano Garden

> What if a 4-year-old rolled a glowing seed across a dark garden by tilting the
> tablet — and wherever it rolls, PAPA'S actual recorded piano blooms into
> singing flowers of light?

This is the lab's first kids piece built on **Karel Barnoski's real recorded
solo piano** (his *Welcome Home* album). It granular-resynthesizes that real
recording into blooming, singing flowers of light, steered by a tilt-rolled
glowing seed. Every grain is pitch-quantized to a C-major pentatonic, so there
are **no wrong notes** — only blooming. Over minutes the garden fills up: minute
three is fuller and richer than minute zero. It never loops; it grows.

Route: `/dream/658-kids-piano-garden`

## How it plays

1. Tap **Begin**. This single gesture unlocks audio (iOS) and asks for the tilt
   sensor (iOS 13+ `DeviceOrientationEvent.requestPermission()`).
2. **Tilt** the tablet — the glowing seed rolls under gravity like a marble in a
   tilt-labyrinth, leaving a soft glowing trail.
3. Let the seed **rest** (dwell ~0.4s) and a **flower blooms** there: a burst of
   light that lingers and keeps softly **singing** a held grain-cloud of Papa's
   piano at that pitch.
4. Roll on. The garden accumulates blooming, singing flowers.

No fail states, no scary or sudden loud sounds. An always-on gentle grain-cloud
pad means it is **never silent**.

## The granular engine (`granular.ts`)

- On Start we call `fetchPianoBuffer()` to load Karel's real recording into an
  `AudioBuffer` (read-only of an existing public route — nothing is recorded or
  sent). If it fails, `renderFallbackBuffer()` synthesizes a gentle ~12s
  piano-like buffer so the engine always has real harmonic + percussive content
  to scan.
- We schedule overlapping **short grains** (20–120 ms) read from positions in
  that buffer. Each grain has a raised-cosine (Hann-like) amplitude envelope via
  a per-grain `GainNode` for soft attacks and no harsh transients.
- Each grain's `playbackRate` is **quantized** to a C-major pentatonic ratio set
  (semitone offsets `{0,2,4,7,9}` across ±2 octaves → `2^(semi/12)`), so
  everything is always in key and consonant.
- Total grains are **rate-limited** (≤ 25 voices, steal oldest). An always-on
  pad grain-cloud follows the seed; each singing flower contributes its own
  sustained cloud at its own pitch + read position.
- Kid-safe master chain:
  `masterGain (≤0.5) → BiquadFilter lowpass (≤7 kHz) → DynamicsCompressor → destination`,
  with a gentle 3.5s fade-in and an optional ~13-minute lullaby fade-down.

## The seed (tilt-as-gravity physics, in `page.tsx`)

A single glowing seed rolls under a gravity vector derived from device tilt:
semi-implicit Euler integration with friction, soft wall bounce, and a clamped
top speed. Tilt is smoothed with an EMA and a neutral hold is zeroed on the
first reading. The seed's **x-position** selects both the granular read-position
in the recording (left = earlier, right = later) and the pentatonic pitch
degree, and sets stereo pan. Where it **dwells** (~0.4s in a small region) a
flower blooms.

## Fallbacks (degrade gracefully)

- **No tilt sensor / permission denied:** drag anywhere (drag direction = tilt
  vector) and Arrow keys nudge the gravity. A `text-rose-300` notice explains
  it. Fully playable on a desktop with no sensor.
- **No WebGL2:** a Canvas2D renderer draws the same near-black garden, glowing
  seed + trail, and blooming/pulsing singing flowers.
- **Audio fetch fails:** the offline synthesized piano voice (handled inside
  `audio.ts`).

## Auto-demo

~2.5s after load with no interaction, an autonomous gentle synthetic tilt
oscillation rolls the seed, blooms flowers, and lets the piano breathe
hands-free — a silent glance shows it fully alive with zero hardware. The
auto-demo stops on the first real interaction.

## Files

- `page.tsx` — `"use client"` React page: start gate / iOS unlock, tilt + drag +
  arrow input, seed physics, dwell→bloom logic, auto-demo, HUD, design notes.
- `granular.ts` — pentatonic-quantized granular resynthesis engine + kid-safe
  master chain + singing-flower voices.
- `renderer.ts` — WebGL2 additive-glow renderer (+ Canvas2D fallback).
- `audio.ts` — Karel's recording loader + synthesized fallback (provided
  verbatim).

## References

- **Curtis Roads, *Microsound*** — granular synthesis theory and grain windows.
- **Iannis Xenakis** — origins of granular/stochastic sound.
- **Brian Eno** — generative / ambient music as a slowly-evolving system.
- **Karel Barnoski, *Welcome Home*** — the source recording that blooms here.

With gratitude to the lab pieces that form this tilt-roll + granular lineage:
`227-paths-granular`, `169-kids-marble-run`, and `83-kids-tilt-rain`.
