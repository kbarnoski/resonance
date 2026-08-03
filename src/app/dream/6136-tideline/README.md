# Tideline — breathe the sea in and out

**Status**: demoable

A drug-free meditative entrainment instrument: your own slow breath, sensed through the mic as a broadband swell, lifts a luminous indigo-to-violet horizon and opens a warm tidal drone — the sea rises as you inhale and recedes as you exhale. A soft pace ring guides you, its breath period lengthening over a couple of minutes from about five seconds toward ten, easing you down toward the calm of coherent breathing.

## What it is

Press **Begin** to start the AudioContext and request the mic. The horizon, the glow, and a filtered-noise "surf" all follow your breath envelope; a pace ring expands on the target inhale and contracts on the exhale. If you decline the mic, it runs in **auto-breathe** mode — a synthetic breath LFO paces the whole piece so it is still beautiful and complete. No microphone audio is ever routed to the speakers; the mic feeds an analyser only.

## Breath-envelope extraction

This uses the mic in a way that is neither pitch nor onset detection. Each frame we compute broadband RMS from the time-domain buffer, then run it through a one-pole envelope follower with a ~0.7 s time constant so we ride the slow rise and fall of a breath, not the transients of speech. The envelope is normalised against an **adaptive floor and ceiling** (fast-attack ceiling, slow-decay; the inverse for the floor) so any mic gain self-calibrates to a clean 0..1 tide within a couple of breaths, followed by a gentle gamma lift and a final ~0.4 s smoother for a liquid, non-jittery sea line. See `breath.ts`.

## Entrainment / pacing

A guided target LFO produces the pace ring's radius and the "breathe in / breathe out" cue. Its **period lengthens over the session** via a smootherstep from ~5 s toward ~10 s across ~2.5 minutes, gently entraining the breather toward the ~6-breaths-per-minute (0.1 Hz) resonance frequency. The phase is skewed so the exhale runs slightly longer than the inhale, which reads as calmer. The pacer is stateful — the piece is measurably slower at minute 3 than at minute 0.

## Tidal audio coupling

The sound (`audio.ts`) is two coupled layers. A low **just-intonation pad** over a 55 Hz root (unison, octave, fifth, major tenth, plus a two-octave shimmer, with a ~20 s detune LFO) is the durational bed. A **filtered-noise surf** — pink-ish noise through a lowpass — swells with the breath: inhale opens the cutoff from ~260 Hz toward ~2000 Hz and lifts its level; exhale closes and recedes it. The pad also breathes subtly, so the whole sea lifts on the inhale. All coupling uses `setTargetAtTime` ramps, so it is always a swell, never a stutter.

## Rendering

Primary path is a WebGL2 fullscreen fragment shader (`render.ts`): a deep indigo-to-violet sea and sky, a swell-displaced water line whose height tracks the breath, a warm horizon glow that blooms with it, shimmer streaks on the water, and the luminous pace ring — all on slow luminance drift, no flash. A **Canvas2D fallback** draws the same idea more simply when WebGL2 is unavailable, and audio keeps working regardless.

## Safety

No fast flicker or strobe. Every motion — sea height, glow, filter, ring — drifts on the multi-second breath timescale.

## References

- **Coherent breathing / HRV resonance-frequency literature** (the ~6 breaths-per-minute / 0.1 Hz "resonance frequency" of the baroreflex) — the basis for the guided-pace lengthening.
- **Durational / ambient drone lineage** — Éliane Radigue's slow evolving drones and Max Richter's *Sleep* — the sonic register the tidal pad reaches for.
