# 387 · Drop Engine

**Generative EDM Build-and-Drop Arc Engine** — the Resonance dream lab's first EDM/club journey-engine alternative.

## What it is

Drop Engine procedurally composes a continuous club track that cycles through the canonical EDM tension structure:

> **GROOVE → BUILD → DROP → RELEASE → loop**

Each phase is 16 bars at a fixed **126 BPM**. A single **tension scalar [0 → 1]** is the central "knob": it ramps during BUILD, peaks on the DROP impact, then decays — and that number simultaneously drives both sound and visuals, making the arc *legible* in both domains.

Every loop picks new variation seeds (which riser type, which lead motif transposition, which snare-fill pattern) so no two arcs are identical.

### Contrast with the existing journey engine

The lab's pre-existing journey engine (psychedelic 6-phase arc) is slow, introspective, and ambient — it fades through states over minutes with gentle pads. Drop Engine is its energetic counterpart: beat-locked at club tempo, with hard transients, a building riser, a four-on-the-floor grid, and a visceral impact moment on the DROP beat. Both are "journey engines" in the sense of a parametric arc that self-drives; they differ in genre, timescale, and intention.

## How to use

1. Open the prototype and tap **START** — audio + visuals begin immediately after the gesture.
2. Let it run hands-free: it plays the full arc automatically (auto-demo mode).
3. **HOLD → CHARGE**: press and hold to charge the intensity bias for the next drop (the bar shows charge building over ~3 seconds). Release to commit. Higher charge → harder drop hit + more energetic motif.
4. **DROP NOW**: press during BUILD to trigger the DROP early (works from bar 4 onward in BUILD).
5. Watch the **GROOVE / BUILD / DROP / RELEASE** phase label and the **TENSION** meter top-right — these are the same scalar driving the audio.

## Named references

- **Canonical EDM build/drop tension-and-release arrangement** — standard club structure: groove → riser+filter sweep → impact drop → breakdown/release. This engine formalises that as a state machine with parametric per-beat scheduling.
- **Procedural Music Generation** — real-time, state-driven, non-repeating: the tension knob is a designer-accessible parameter that simultaneously steers multiple synthesis layers. Loops regenerate variation seeds so the macro arc repeats but micro details differ.

## Subsystems

| Subsystem | File | Description |
|---|---|---|
| Arc state machine | `arc.ts` | Clock-driven phases, tension computation, variation seeds, phase transitions |
| Multi-layer synth+drum engine | `synth.ts` | Kick (sine+click), snare (noise), hat, bass (saw+sub through LP), supersaw lead, riser; all routed through DynamicsCompressor |
| Look-ahead scheduler | `scheduler.ts` | setInterval poll at 25ms, schedules beats ~100ms ahead of audioCtx.currentTime; per-phase beat patterns; phase-entry hooks |
| GPU visualiser | `viz.ts` | WebGL2: tension ring, frequency bars (spring-physics), particle bloom on DROP, beat flash; additive blending; DPR-aware |
| Steering controls + HUD | `page.tsx` | HOLD→CHARGE button, DROP NOW, phase/tension HUD, design-notes affordance |

## Build verified, not browser verified

This prototype was built and type-checked in the repo build pipeline. It has **not** been verified in a live browser. Unverified surface areas:

- **Whether the build→drop *feels* like real tension/release** — the tension scalar ramps and the riser/filter/snare-roll are wired correctly, but "feel" is subjective and can only be confirmed with ears.
- **Scheduler timing tightness** — the look-ahead scheduler follows the standard Web Audio pattern (setInterval + audioCtx.currentTime), but actual jitter on mobile or under CPU load is not measured.
- **Limiter feel on the drop** — DynamicsCompressor is configured (threshold −6, ratio 12) but actual headroom and punch on the DROP transient depend on browser's audio pipeline behaviour.
- **WebGL2 availability** — the code degrades gracefully (audio still runs with a notice), but the visual layer itself is not rendered-verified.
- **iOS Safari autoplay** — AudioContext creation is inside the Start pointer handler which should satisfy the user-gesture requirement, but iOS behaviour can be idiosyncratic.
