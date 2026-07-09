# 1316 — Moiré Drift

**The one question:** *What if you could TUNE a psychedelic trance by hand —
sliding and rotating one layer of a fine op-art grating against another until
their interference beats out living Klüver form-constants (tunnels, spirals,
honeycombs) AND you hear the same beat-frequency in the sound?*

Drug-free LSD-moiré / op-art trance, pole = INTENSE.

## What it is

Two (really three) high-frequency gratings are summed in a WebGL2 fragment
shader in **cortical (log r, θ) space**. Overlaid gratings physically add, and
when two nearly-equal spatial frequencies add you get a low-frequency **beat**
term. That slow emergent envelope *is* a Klüver form constant:

- concentric rings (vary with log r) → **tunnels / funnels**
- radial rays (vary with θ) → **spokes / cobwebs**
- diagonals in cortical space → **spirals**
- a hex term that wakes near the peak → **honeycomb lattice**

This is the Bressloff–Cowan insight made playable: all psychedelic geometry is
one stripe/hexagon pattern seen through the retina→V1 complex-log (`exp()`)
warp.

## The core surprise — one number, seen and heard

The **detune** (how far the movable layer is from alignment) sets a single beat
frequency. That number does two things at once:

1. it advances the temporal phase of the movable grating so the whole **visual
   moiré envelope drifts at that rate**, and
2. it sets the frequency gap of a **detuned oscillator pair** (osc1 at 138 Hz,
   osc2 at 138 Hz + beat), so the audio **amplitude-beats at the same rate**.

Tune the moiré tighter and you watch the fringes settle *and* hear the acoustic
beats slow toward alignment. Loosen it and both speed into roughness. The seen
pulse and the heard beat are the same number.

## How to play it

- Press **Begin** (browsers gate audio behind a gesture).
- **Drag anywhere on the field:**
  - horizontal (←→) = **rotation offset Δθ** between the layers (blooms spokes /
    spirals),
  - vertical (↕) = **spatial-frequency detune Δk** (top = aligned/slow beats,
    bottom = detuned/fast beats),
  - **drag speed / hold** = entropy energy — pushes the arc forward (more
    grating octaves, faster drift, looser symmetry; the REBUS "priors relax"
    idea).
- **Release** and it keeps drifting gently on its own.
- Before Begin, the field is already alive on an idle auto-drift.
- The live HUD shows the current beat in Hz (seen & heard).

## The entropy arc

A slow ~3-minute parameter ramp (onset → come-up → peak → settle) grows grating
octaves, drift speed and symmetry looseness, and shifts the palette from stark
near-black + bone-white with an electric-cyan accent toward **saturated neon /
iridescent** at the peak. Pointer energy can push the arc forward faster.

## Audio

- **Detuned oscillator pair** (+ a quieter octave pair for body) — the beat is
  the star and tracks the visual detune.
- **Soft low pulse / transport** at 0.7–2 Hz, tempo tightening toward the peak,
  so there is rhythm rather than a flat pad.
- **Faint Shepard undertow** (shared `_shared/psych/shepard`), gliding downward.
- Master gain ≤ 0.28, exponential ~1.2 s fade-in, routed through a
  `DynamicsCompressor` limiter; fixed small voice count.

## Technique

Raw WebGL2, a single full-screen triangle (positions from `gl_VertexID`, no
vertex buffer), one fragment shader (`shader.ts`) that sums the gratings and
renders near-binary black/bone op-art ink via `smoothstep` with an `fwidth()`
anti-alias edge. Audio is Web Audio API (`audio.ts`). Everything browser-touching
lives behind the Begin gate and inside effects; SSR-safe. A `text-rose-300`
notice appears if WebGL2 is unavailable.

## Safety (photosensitive epilepsy)

**No strobe.** Moiré drift is inherently slow and spatial — different radii are
at different phase, so luminance never flips full-field in sync. Contrast is
moderate, edges are vignetted against blowout, and the temporal beat is capped
around 5–6 Hz as a smooth continuous drift, never a hard on/off flash.
`prefers-reduced-motion` is honoured: contrast is pulled toward mid-grey and the
beat rate is slowed.

## References (named, per the brief)

- **Bridget Riley** (b. 1931, living British Op artist) — kinetic
  black-and-white paintings (*Fall*, *Blaze*, *Movement in Squares*) whose fine
  gratings interfere on the retina to produce shimmer and illusory motion. This
  piece is squarely in her lineage.
- **Paul Bressloff & Jack Cowan** et al., *"Geometric visual hallucinations,
  Euclidean symmetry and the functional architecture of striate cortex"* (Phil.
  Trans. R. Soc. B, 2001) — the cortical model showing Klüver's four form
  constants are the natural patterns of V1 under the log-polar retinotopic map.
- **Heinrich Klüver**, *Mescal and Mechanisms of Hallucinations* (1966) — the
  original taxonomy of form constants (lattices/honeycombs, cobwebs,
  tunnels/funnels, spirals).
- **Shepard–Risset** endless glissando (via the shared psych kit) for the audio
  undertow.

## Files

- `page.tsx` — component, Begin gate, pointer play, render loop, entropy arc, HUD.
- `shader.ts` — GLSL ES 3.00 vertex + fragment (the interference field).
- `audio.ts` — `MoireAudio`: detuned beat pair, pulse transport, Shepard undertow.
- `README.md` — this file.
