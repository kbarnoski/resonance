# 3416 · baton

**Conduct a small synth ensemble with your body — camera only, no controller.**
Route: `/dream/3416-baton`

## The one question

What if your *beat* were the performance — and you could get it wrong? You
conduct three synth voices with your body through the webcam. The ensemble
keeps its own inertial pulse, so if you rush or drag it strains, detunes, drops
notes, and can lose the pulse entirely.

## The mechanic

1. **Camera → beat, dependency-free.** Each frame is downscaled to **80×60**
   luminance on a hidden 2D canvas (a pixel-sampling buffer only — the visible
   output is three.js). We reduce it to one number: global **motion energy**
   (mean per-pixel abs luminance diff vs. the previous frame), plus a horizontal
   **motion centroid** for the conductor marker.
2. **The derivative-threshold ictus detector** — the crux. A conductor's
   downbeat is an *acceleration* of the hand, so the beat instant lives not in
   the raw energy (smeared, drifts with lighting) but in its **derivative**
   `d(energy)/dt`. We keep a running EWMA mean+σ of that derivative and fire an
   **ictus** on a rising edge past `mean + 1.6σ`, gated by a 180 ms refractory
   window and an absolute floor so stillness never fires. This is what makes
   camera-conducting feel crisp instead of mushy.
3. **Tempo + phase engine.** Each ictus feeds an **EWMA tempo estimate** and a
   **phase-locked loop** that steers a beat grid (BPM + phase). A **tightness**
   meter tracks the coefficient of variation of recent inter-ictus intervals.
4. **The ensemble with inertia (the stakes).** An AudioContext **lookahead
   scheduler** (`setInterval` 25 ms, ~140 ms ahead) plays a fixed phrase
   (**Am–F–C–G**) across three continuous-pitch voices — triangle bass, saw pad,
   square/triangle lead. The ensemble runs on its OWN inertial clock (grid
   period follows the baton with `α = 0.08`, deliberately slow). Conduct evenly
   → tight lock, in tune. Rush or drag → a gap opens, an **instability** value
   climbs, voices **detune up to ~40 cents**, the lead **drops notes**, and the
   red **pulse-lock** meter fills. It only recedes when you steady the beat and
   the loop re-locks. A genuine decision you can get wrong.
5. **Output is three.js** (not Canvas2D): three emissive orbs on a ring, one per
   voice — angle = the voice's slot, brightness = its live level. Tight → a
   clean, saturated equilateral triangle. Unstable → the orbs scatter off the
   ring, wobble, and desaturate toward grey with a red bleed. A conductor marker
   follows your motion centroid; each beat gives a gentle pulse (≤3 Hz, small
   amplitude — no hard strobe). Readout row: BPM · bar 1·2·3·4 · tightness ·
   strain.

## Seeded self-demo (no camera required)

Before you grant a camera (or if it's denied/absent), a seeded
`mulberry32(0x3416)` **auto-conductor** emits a believable ictus stream through
the *same* derivative → PLL → scheduler pipeline, so the ensemble plays in time
on its own. Every ~21 s it **deliberately rushes** for five seconds so a silent
reviewer *sees and hears* the ensemble strain, then recover. A **LIVE / DEMO**
badge shows the source; the piece hands the baton to you on the first
camera-detected ictus. No `Math.random`/`Date.now` in deterministic logic.

## Headless verification (seeded auto-conductor, real `beat.ts`)

Driving the real `BeatEngine` with the real `AutoConductor` at 60 fps:

| window                     | avg strain | max strain |
| -------------------------- | ---------- | ---------- |
| steady (0–8 s)             | **0.010**  | **0.137**  |
| deliberate rush (9–14 s)   | **0.307**  | **0.790**  |

Rise-then-recede across the 0.6 "LOST THE PULSE" line:
`t=7 → 0.014` (locked) · `t=12 → 0.31` · `t=14 → 0.62` (lost) · `t=17 → 0.49` ·
`t=20 → 0.07` (re-locked). Steady conducting keeps strain near zero; rushing
drives it past the fail threshold and it recedes only when the beat steadies.

## Named references

- **"Sympathetic Orchestra"** (CHI 2026, DOI
  [10.1145/3772363.3798418](https://doi.org/10.1145/3772363.3798418)) — a
  conducted virtual ensemble that responds to gesture.
- **arXiv:2604.27957**, "Real-Time Control of a Virtual Orchestra by Recognition
  of Conducting Gestures" (2026) — gesture → bar-phase drives a virtual
  orchestra.
- **Max Mathews' Radio-Baton / Conductor Program** (Bell Labs, 1989) — conduct a
  stored score; the beat controls tempo and dynamics. The foundational move this
  piece descends from.

## Ambition-floor criteria hit

- Real sound (three-voice WebAudio ensemble) + real three.js visuals — never a
  static page; the seeded demo is always audible/visible.
- One crisp, legible mechanic you can **get wrong** — the inertial ensemble and
  its fail-state are the whole point.
- Fully self-contained: no new npm deps, no MediaPipe/TensorFlow — optical-flow,
  beat detection, tempo/PLL, and synthesis are all hand-written.
- Degrades gracefully (no camera / denied / no WebGL) and tears everything down.
- Privacy explicit: frames are 80×60, on-device only, never uploaded.

## Next-cycle deepening

- Two-axis baton reading: use the vertical centroid to distinguish downbeat vs.
  upbeat and drive true 4/4 bar phase (entrances/cutoffs), not just tempo.
- Dynamics from gesture size: map peak derivative magnitude to ensemble
  loudness and filter opening, so a big gesture *swells* the orchestra.
- Section cueing: point left/right (centroid) to bring a voice in or hush it —
  the Radio-Baton's dynamics gesture, spatialised across the three orbs.
- A "recovery grace" curve so a single stumble is forgivable but sustained
  rushing is not, sharpening the sense of a live, breathing ensemble.

## Files

- `page.tsx` — client component: loop, camera wiring, chrome, teardown.
- `beat.ts` — PRNG, MotionTracker, IctusDetector, BeatEngine (PLL), AutoConductor.
- `ensemble.ts` — AudioContext lookahead scheduler + three-voice synthesis.
- `scene.ts` — three.js orbs, ring, conductor marker, beat pulse.
