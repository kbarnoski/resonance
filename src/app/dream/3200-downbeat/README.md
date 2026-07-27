# 3200-downbeat

Conduct a small ensemble — your beat *is* the performance. The players follow
the pulse you give: keep steady, clear time and they lock into a tight groove;
rush and they crowd behind you, drag and they run ahead. Your timing is a
musical decision you can get wrong.

Route: `/dream/3200-downbeat`

## The one question

What if the tempo of a real ensemble was yours to hold — and holding it badly
had audible consequences?

## How to use

- **Start** creates the audio and begins a **seeded auto-conductor** demo: it
  holds steady time (the ensemble locks), then deliberately **rushes** and
  **drags** so you can hear the groove slip with no human involved.
- **Take the baton** (or just press **Space**) hands you the beat. Tap Space on
  every beat. On a phone, press **Enable tilt** and swing the device like a
  baton — a down-stroke past a threshold is one beat. If tilt is unavailable or
  denied, the space bar conducts fully.
- **Demo** returns control to the auto-conductor. **Tap beat** is an on-screen
  fallback for the space bar.
- Watch the **phase-wheel**: the filled marker is the ensemble's beat, the
  hollow marker is yours. When they meet, you are locked; when they split, the
  arc between them (your timing error, in ms) opens and colours toward magenta.

## The technique

**PLL tempo tracking + AudioContext lookahead scheduling.**

1. **Phase-locked loop** (`pll.ts`). Each beat you give updates a running tempo
   estimate. The *period* (seconds per beat) follows your inter-tap interval
   with a low gain, and the beat *phase* (a continuous grid, `gridTimeOf(index)`)
   is nudged toward where your tap actually landed. The gentle gains mean the
   grid **smooths** — a sudden rush or drag makes the ensemble's grid lag your
   hand, which is exactly the feeling of fighting the groove.

2. **Lookahead scheduler** (`scheduler.ts`). The ensemble is never a fixed
   metronome. Every animation frame the scheduler looks ~150 ms ahead, finds
   each note of a two-bar A-minor phrase (walking bass · chord stabs · a
   pentatonic melody) whose position falls on the current grid, and hands it to
   the synth to `osc.start(when)` at a precise `AudioContext.currentTime`
   offset. Steady conducting produces a tight, even onset grid; rushing makes
   the ensemble notes flam against the conductor's tick.

3. **Synth** (`synth.ts`). Three synthesised voices — a plucked triangle bass, a
   few detuned saws through a lowpass for chord stabs, and a 2:1 FM sine for the
   melody — plus a short bandpass "tick" on every conductor beat so the pulse is
   audible against the ensemble downbeat. Master gain ≤ 0.14 through a
   compressor; the context is created only on the Start gesture and torn down on
   unmount.

4. **SVG display** (`wheel.tsx`). A phase-wheel (ensemble vs conductor markers,
   error arc, confidence arc, live BPM) and three scrolling note-lanes that show
   upcoming scheduled notes landing on the grid at the "now" line. SVG only —
   no canvas, no WebGL. All colour is drawn from the shared violet art ramp.

Determinism: all randomness is a seeded `mulberry32(0x3200)` (auto-conductor
humanising jitter only); time comes from `AudioContext.currentTime` /
`performance.now`, never `Date.now` / `Math.random`.

## Named reference

**Max Mathews — "The Radio-Baton and Conductor Program" (Stanford CCRMA,
~1989/1991).** Mathews built a physical baton whose beat and gesture drove the
tempo and dynamics of a scored computer ensemble — the performer conducted the
machine rather than triggering fixed notes. Downbeat is the browser descendant:
you conduct with a keyboard tap or a phone tilt instead of a radio baton, and a
PLL + lookahead scheduler stands in for the Conductor Program's score follower.

## What's unverified / honest notes

- The tempo tracker does **not** fold octaves: tapping double- or half-time is
  read as a genuine tempo change, not a phase relationship.
- Tilt onset detection (a single beta-axis threshold crossing) is coarse and
  varies by device; it is a mobile enhancement, not the primary input.
- Mathews' baton also carried a **dynamics** axis (how hard you beat → loudness).
  Downbeat models only **tempo and phase**, not dynamics.
- The "tight vs loose" claim was checked headlessly by simulating steady vs
  rushed tap streams through `pll.ts` + `scheduler.ts` and measuring the phase
  error between the conductor and the ensemble grid (steady stays within a few
  ms; a rush opens a large systematic lag). Perceived tightness in a real
  browser still depends on output latency, which is not compensated.

## Next-cycle deepening (DEEP mode — folded from the two sibling approaches)

Downbeat won a 3-way DEEP fan (cycle 927) exploring "conduct an ensemble" three
ways. The two banked siblings are the roadmap for extending this piece:

- **Elastic ensemble (`3208-elastic`, banked).** Replace the single smoothed
  grid with **N coupled phase-springs** — one damped oscillator per player, each
  with its own stiffness/damping — so the ensemble doesn't just *lag* your hand,
  it *smears* (the nimble players arrive early, the heavy ones late) and
  re-coheres as you steady. Headless it separated 0.19 ms (steady) → 209 ms
  (rushed). Fold in as a "loose ensemble" mode: the note-lanes gain per-voice
  jitter and the wheel shows a *spread* arc, not one marker. (three.js orbs there;
  here it stays SVG.)
- **Anticipatory upbeat (`3216-upbeat`, banked).** Model the **preparatory beat**:
  let the ensemble commit each downbeat by extrapolating from the *up-gesture*
  before it, so a clean prep nails the entrance and a mushy prep drags/scatters
  it (arXiv:2605.20356, May 2026 — anticipatory state predicts turn-taking ahead
  of time). Fold in as an entrance-quality readout and a two-phase (prep→down)
  tap model layered over the PLL.

Plus the standing extensions: add Mathews' missing **dynamics** axis (beat
vigor → loudness), octave-fold the tempo tracker, and let the conductor drive a
Resonance journey voice instead of the built-in A-minor phrase.
