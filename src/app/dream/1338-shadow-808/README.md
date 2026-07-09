# Shadow 808

## The one question

**What if you DANCED a drum pattern into an 808 — your silhouette stepping through a grid in camera-space to arm each step — so the groove is literally choreographed by your body?**

This is the dream lab's first real generative-groove instrument. The point is rhythm and time: a real, danceable, quantized, **looping** beat with swing and a build/drop — not a drone or a struck chord.

## How the body writes the pattern

The screen is a **TR-808 step sequencer**: 8 steps (columns) × 5 voices (rows), kick / snare / hat / clap / tom from the floor up. A bright **playhead column sweeps left→right in time** with the beat.

Your webcam (`getUserMedia({ video })`) is mirrored, downscaled to a tiny 64×40 canvas, and turned into a **presence field** — the max of frame-difference motion and deviation from a captured background, with a decaying memory so a still-but-present body keeps glowing. That field is folded into the 8×5 cells to decide which cells your silhouette **occupies**.

When the playhead advances to a new step, every voice whose cell you are occupying at that moment is **armed**. So you dance/wave through the grid to *write* the pattern, and it loops straight back at you. The armed pattern is persistent state that **accretes** — the groove after a minute of dancing is denser and different from where it started.

## The engine

- **Look-ahead scheduler** — the "Tale of Two Clocks" pattern: a `setInterval` wakes every 25 ms and schedules any notes falling in the next ~120 ms against `AudioContext.currentTime`. Rock-solid timing independent of the render loop. 100–132 BPM (default 120 → a 2-second loop of eighth notes).
- **Swing** — odd (off-beat) steps are delayed by a fraction of the step duration; adjustable live.
- **Per-step probability** — armed steps carry a probability, so some hits **ghost / drop out** (after BeatState's probability engine). The auto-demo seeds ghosted hats so the groove breathes.
- **808 drum synthesis** (all Web Audio, no samples):
  - **Kick** — sine pitched 160→45 Hz with a fast drop and long decay, plus a 50 Hz sub for weight on phones.
  - **Snare** — highpassed noise + a 185 Hz triangle body.
  - **Hat** — highpassed noise, short (closed) or longer (open) decay.
  - **Clap** — four quick bandpassed noise taps + a short tail (the 808 smear).
  - **Tom** — sine pitched 190→95 Hz.
  - **Acid stab** — a resonant sawtooth with a filter envelope that only surfaces once the pattern gets dense, so busy grooves get an acid-ish edge instead of turning sterile.
- **Build → drop** — when your overall motion intensity stays high (you dance hard), or you tap **Build → Drop**, a filtered-noise **riser** sweeps up over two bars, driving hats ramp underneath, the groove **strips to silence for a beat**, then **slams back at full density** (probability forced to 1, four-on-the-floor kick, off-beat claps). Time-based drama, not just a filter sweep.

## Memory / persistence

The `armed` and `prob` grids are long-lived state inside the sequencer. Dancing only ever adds; nothing decays on its own. **Clear** resets. This is what makes it an instrument you *build up* rather than a momentary reaction.

## Graceful degradation + auto-demo

The engine runs and is **audible with no camera**:

- On **Begin**, an `loadAutoDemo()` groove (kick + backbeat snare + ghosted hats + a clap) starts immediately — the piece is never silent or dead, and the core groove lands on a headless reviewer's phone.
- If the camera is denied/unavailable, a readable notice appears (`text-rose-300`, `text-base`) and the grid becomes a normal **touch step-sequencer**: tap any cell to toggle its step.
- With a camera, you get all of that *plus* dancing steps in.

## Living references

- **Sergi Jordà — _reactable_**: a tangible, embodied sequencer where physical presence writes the music.
- **Jono Brandel — _Patatap_**: playful, immediate audio-visual performance.
- **BeatState (beatstate.net)**: the per-step probability / ghost-note engine this borrows.

## Safety & craft

- **No strobe / flicker.** Beat pulses are a single exponential luminance decay (smooth drift), brightness-capped, well under 3 Hz. `prefers-reduced-motion` further halves pulse and silhouette-glow amplitude.
- Audio starts only after the **Begin** gesture. Master gain ≤ 0.28 through a `DynamicsCompressor` limiter with a 0.4 s fade-in.
- SSR-safe: `"use client"`, no browser globals at module scope or during render — everything behind the Begin gate / in effects.
- Full teardown on unmount: `cancelAnimationFrame`, stop camera tracks, clear the scheduler timer, close the `AudioContext`.
- No new dependencies, no MediaPipe, no CDN — pure `getUserMedia` + Canvas 2D + Web Audio.

## Files

- `page.tsx` — client component: Begin gate, camera/touch/auto-demo wiring, render loop, HUD, controls, notes overlay.
- `sequencer.ts` — look-ahead scheduler, 808 synthesis, swing, probability, build/drop, persistent pattern state.
- `silhouette.ts` — camera motion / background subtraction → per-cell occupancy + presence field.
- `draw.ts` — retro-808 renderer (glowing buttons, sweeping playhead, silhouette glow) + grid layout / hit-testing.
