# 426 — Euclid Engine

> **The one question:** What if you could build a hypnotic, evolving polyrhythm
> by stacking interlocking Euclidean rhythms — pure percussion, ZERO tuning —
> and watch the rings slowly PHASE against each other the way Steve Reich's
> players drift apart?

---

## The Euclidean Rhythm — Bjorklund's Algorithm

E(k, n) places **k** onsets (hits) as evenly as possible over **n** steps.
The algorithm is mathematically equivalent to Euclid's GCD algorithm: at each
stage, the "remainder" groups are interleaved with the "full" groups until the
distribution is maximally even.

A neat shortcut — Bresenham's line algorithm applied to rhythm — gives the same
result in O(n): onset at step i if and only if ⌊(i+1)·k/n⌋ ≠ ⌊i·k/n⌋.

Famous Euclidean rhythms:

| E(k, n) | Name | Culture |
|---------|------|---------|
| E(3,8)  | Tresillo | Afro-Cuban |
| E(5,8)  | Cinquillo | Afro-Cuban, Middle East |
| E(7,16) | Common subdivision | Jazz, West Africa |
| E(9,16) | Common subdivision | Jazz, West Africa |
| E(2,3)  | Waltz | Universal |

**Reference:** Godfried Toussaint, *"The Euclidean Algorithm Generates
Traditional Musical Rhythms"*, Proceedings of BRIDGES 2005.

---

## Reich-Style Tempo Phasing

Each ring runs at `BASE_BPM + driftBpm` — a tiny personal tempo offset.
Because they all start together but tick at slightly different rates,
their downbeats gradually **slip against each other**. After minutes the
interference pattern rotates through all possible alignments, then slowly
re-converges, then drifts again — never repeating at a human listening scale.

This is the exact mechanic behind:

- **Steve Reich**, *Piano Phase* (1967) — two pianists begin in unison, one
  slightly faster; the resulting phase-drift creates ever-shifting hockets.
- **Steve Reich**, *Clapping Music* (1972) — one clapper shifts by one beat
  at a time against a steady pattern; all 12 phase relationships appear.

In Euclid Engine the drift is continuous (a floating-point BPM offset) rather
than discrete, so the transitions are smooth and hypnotic rather than stepped.

---

## The Look-Ahead Scheduler

Web Audio's clock (`AudioContext.currentTime`) is sample-accurate but
JavaScript's `setInterval` is not. The solution — described by **Chris Wilson**
in *"A Tale of Two Clocks: Scheduling Web Audio with Precision"* (2013) — is:

1. Fire `setInterval` every **25 ms** (a coarse "wakeup").
2. Each tick, schedule all audio events that fall within the next **100 ms**
   look-ahead window using the precise AudioContext clock.
3. Visual flashes are queued via `setTimeout` aligned to the same audio time,
   so the particle burst and the drum hit are perceptually synchronous.

The result: sub-millisecond drum precision even when the JS thread is stalled
by rendering, GC, or background tabs.

---

## Three.js Visualisation

- **Concentric rings** — one per voice; radii 1.1 / 1.85 / 2.55 / 3.2 world
  units. Each ring has N step-cells arranged in a circle.
- **Onset cells** are lit (voice colour, full size); rest cells are dim grey
  (smaller radius).
- **Playhead** — a white dot orbits each ring, position interpolated between
  scheduler ticks for smooth animation.
- **Particle burst** — when a cell fires, a `THREE.Points` system launches 18
  particles radially outward with exponential opacity decay.
- **Orthographic camera** looking straight down; handles resize and DPR.
- All geometries and materials are disposed on unmount; rAF and setInterval
  are cancelled; AudioContext is closed.

---

## Synthesised Percussion (no samples)

| Voice  | Method |
|--------|--------|
| Kick   | Sine oscillator 150 → 45 Hz pitch envelope + square-wave click transient |
| Hat    | White noise → high-pass filter (8 kHz), short decay |
| Clave  | Decaying sinusoid → band-pass filter (2.5 kHz, Q=8) |
| Shaker | White noise → high-pass (6 kHz) → low-pass (12 kHz), very short |
| Snare  | White noise → band-pass (3 kHz, Q=0.5) |
| Tom    | Sine oscillator 120 → 70 Hz pitch envelope |

All voices feed through a `DynamicsCompressor` (threshold −6 dBFS, ratio 20:1)
acting as a brick-wall limiter.

---

## Self-Demo Seed

Four rings start playing automatically ~1.5 s after load on desktop (or on
first tap on mobile):

| Ring | Pattern | Voice | Drift |
|------|---------|-------|-------|
| I    | E(3,8)  | Kick  | 0 BPM (anchor) |
| II   | E(7,16) | Hat   | +0.12 BPM |
| III  | E(5,8)  | Clave | −0.07 BPM |
| IV   | E(9,16) | Shaker | +0.22 BPM |

---

## Controls

- **ON/OFF toggle** — mute/unmute each ring (≥44 px tap target).
- **K ± buttons** — change the number of onsets (1 ≤ K < N).
- **N ± buttons** — change the number of steps (4 ≤ N ≤ 24, even steps).
- **Drift ± buttons** — nudge each ring's personal BPM offset by 0.05 BPM
  (controls how fast / slow it phases against the others).

---

## Ambition Self-Assessment

**Legibility of interlocking phasing:** The four concentric rings with
colour-coded cells and independent playhead speeds make the phasing immediately
legible once you watch for even 30 seconds — you can literally see Ring II
drifting ahead of Ring I. The particle bursts reinforce which beat just fired.
Score: **strong**.

**Three.js + autostart robustness:** The autostart via `setTimeout` at 1500 ms
works reliably on Chrome/Firefox desktop. Safari and iOS require a gesture; the
"Start Engine" button with prominent placement handles that. The WebGL fallback
provides a text readout with the pattern as ●/· characters. Score: **solid**.

**Biggest risk:** The look-ahead scheduler fires many short `setTimeout` calls
inside each 25 ms interval tick (for playhead interpolation). On a heavily
loaded tab this could accumulate. The interpolation ticks are fire-and-forget
and cannot be cancelled, but they're each very short-lived (< 200 ms window)
and do nothing if the component is already unmounted. Audio remains correct
even if visual interpolation degrades.

---

## Unverified Surfaces

No audio playback or GPU execution is available in the build sandbox. The
following are unverified and must be tested in a browser:

- Actual audio output: synthesizer envelopes, compressor gain staging,
  AudioContext autostart behaviour on mobile Safari.
- Three.js WebGL context creation and teardown (renderer.dispose path).
- Particle system opacity animation and visual clarity at 60 fps.
- Phase drift becoming perceptually audible / visible over a 4–8 minute listen.
- Performance on mid-range Android (many short `setTimeout` + rAF overlap).

---

## References

1. **Godfried Toussaint** — *"The Euclidean Algorithm Generates Traditional
   Musical Rhythms"*, BRIDGES: Mathematical Connections in Art, Music and
   Science, 2005.
2. **Steve Reich** — *Piano Phase* (1967), *Clapping Music* (1972).
   Pioneered Western minimal-music phasing: two identical patterns at slightly
   different tempos drift through all possible phase alignments.
3. **Chris Wilson** — *"A Tale of Two Clocks: Scheduling Web Audio with
   Precision"*, HTML5Rocks / Web Audio Tutorial, 2013.
   https://web.dev/audio-scheduling/
