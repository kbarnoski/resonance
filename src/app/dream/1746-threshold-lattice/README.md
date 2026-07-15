# 1746-threshold-lattice

**state:** hypnagogic sleep-onset descent · **pole:** dream

_The stillness of your room is the interface to a sleep-onset descent — the quieter and stiller you keep your space, the deeper you sink through phosphene form-constants toward the threshold of dream imagery._

This fills the lab's empty dream / hypnagogic pole.

## What it is

A single fullscreen quad rendered by a three.js fragment `ShaderMaterial`. It draws
**Klüver's honeycomb lattice form-constant** in cortical space and views it through the
**inverse log-polar (retina → V1) warp**, so the lattice appears to stream inward as you
sink. A dim violet phosphene tint (clamped ≤ 0.7 — never a white flash), a radial vignette
that deepens with depth, and faint **peripheral spirals** that surface as "fragmentary
half-images" near the threshold.

The input is **ambient room loudness from the microphone, mapped inversely** — the piece
rewards stillness. The mic is routed to an `AnalyserNode` only (never to `destination`, so
there is no feedback). Room RMS drives two channels:

- **Fast `uStill` channel** (sub-second attack/release) → an immediately-visible
  center-sink glow plus an always-on stillness meter that tracks the room in real time.
  This makes the cause→effect link legible in under 5 seconds (otherwise "quiet → deeper"
  takes ~15 s to read).
- **Slow `depth` reward channel** with an **asymmetric envelope** — a ~13 s rise while the
  room stays quiet, a fast (~0.4 s) fall on any sound. `depth` drives lattice density, warp
  strength, tint, and vignette: the actual "how deep am I" state.

A **myoclonic-jerk (sleep-start) state machine** fires, at a depth-modulated cadence, a
single gentle **damped spring-back shear** of the whole field in a golden-angle direction,
plus a soft startle "thud" in audio. It is a smooth lurch that settles, not a strobe.
`prefers-reduced-motion` softens and shortens it.

## How to use it

1. Press **Enter the descent** (a user gesture — required to open audio + mic).
2. Allow the microphone. Then keep your room quiet and still.
3. Watch the **stillness** meter track the room instantly, and the **descent** meter climb
   over ~12–15 s of quiet. Make any sound and you rise fast.
4. Near full depth, the lattice tightens, spirals flicker at the edges, and gentle hypnic
   jerks lurch the field.
5. **Mute** silences the bed; **Design notes** opens the concept + references; **Rise** stops.

### Ghost / self-demo

The review box has no mic, speakers, or display. With no microphone (denied or absent) the
piece runs a **deterministic autonomous ghost**: a slow synthetic descent that rises and
falls on its own, with scheduled disturbances and jerks, so it is alive and audible with
zero input. The audio bed + bells + thuds play from a fixed integer-frame schedule, so it
self-demos even silently and headless.

## Audio

A deliberately gentle, warm, consonant bed (this is the calm dream pole, not a grit cycle):
a low pad + dark filtered-noise wash that **darkens and softens as `depth` rises**, sparse
gentle bells on a deterministic schedule, and low startle thuds fired by the jerk machine.
Master → `DynamicsCompressor` → gain 0.12 → destination.

## Determinism & safety

- Every state, audio, and visual decision is driven by an **integer frame counter**; all
  "randomness" comes from fixed-seed **mulberry32** PRNGs. No `Math.random`, `Date.now`,
  `new Date`, or `performance.now` in any state/audio/visual path. `audioCtx.currentTime`
  is used only for Web-Audio scheduling / ramps.
- No strobe or flicker; slow luminance drift only; phosphene tint clamped ≤ 0.7; mic never
  reaches `destination`; master through a compressor at low gain.
- Fully client-side: no network, no fetch, no API routes. Zero new npm dependencies
  (`three` is already installed).
- Graceful degrade: no mic → `text-destructive` notice + ghost persists; no WebGL → readable
  notice, audio + state keep running.

## See = hear mapping

| you do / room state        | you see                                             | you hear                                  |
| -------------------------- | --------------------------------------------------- | ----------------------------------------- |
| quiet, still (high still)  | center-sink glow brightens; stillness meter fills   | bed softens/warms, cutoff lowers          |
| stay quiet ~12–15 s        | descent rises; honeycomb densifies + streams inward | pad darkens, bells a touch more frequent  |
| any sound                  | descent falls fast; lattice loosens                 | bed opens/brightens back up               |
| near the threshold (deep)  | peripheral spirals / fragmentary half-images appear | more frequent bells                       |
| myoclonic jerk fires       | a single smooth spring-back lurch of the whole field| a soft low "thud"                         |

## Named references

- **Heinrich Klüver, form constants (1926)** — the four recurring geometries of visual
  cortex (lattices/honeycombs, cobwebs, tunnels/funnels, spirals); this piece uses the
  honeycomb lattice.
- **Andreas Mavromatis, _Hypnagogia_ (1987)** — the phenomenology of sleep-onset imagery:
  phosphene form-constants and fragmentary half-images.
- **Sleep-start / hypnic-jerk myoclonus literature** — the involuntary lurch at sleep onset,
  modelled here as a depth-modulated damped-spring state machine.
- **MIT Media Lab _Dormio_ / Targeted Dream Incubation** — a sleep-onset audio interface.
  This piece **inverts** it: the _room_ is the sensor, not a wearable.

## Ambition floor

- **#2 (≥ 3 subsystems):** four — mic RMS analysis · GPU form-constant shader (log-polar
  honeycomb) · myoclonic-jerk state machine · seeded deterministic audio bed.
- **#3 (named references):** the four above.

## Files

- `page.tsx` — three.js fullscreen-quad `ShaderMaterial` scene, mic RMS, the `uStill` + `depth`
  channels, the myoclonic-jerk state machine, the deterministic ghost, UI chrome.
- `shader.ts` — GLSL vertex + fragment strings (composes the shared `LOGPOLAR_GLSL`).
- `audio.ts` — the seeded warm hypnagogic bed, bells, and thuds.
- `README.md` — this file.
