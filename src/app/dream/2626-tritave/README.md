# Tritave — a Bohlen–Pierce instrument with no octaves

**Brief:** *What does it feel like to play an instrument with no octaves?*

Tritave is a genuinely playable microtonal keyboard in the **Bohlen–Pierce (BP)**
tuning — the most famous non-octave temperament. Its interval of equivalence is
the **tritave**, the **3:1 ratio** (a perfect twelfth), divided into **13 equal
steps**. It answers this week's mandate to kill the just-intonation safety net:
BP is built on odd harmonics, so it has an alien consonance/dissonance you cannot
fake into "always pretty." It is allowed to sound dangerous.

## The math (`bp.ts`)

- Equal-tempered BP: `freq(base, step) = base * Math.pow(3, step / 13)`.
- Step ratio = `3^(1/13) ≈ 1.088182`, i.e. **≈ 146.30 cents** per step.
- **Verified numerically** (`node -e` during build):
  - `Math.pow(3, 13/13) === 3` → **step 13 is exactly 3× base** (one tritave).
  - The ordinary octave **2:1 lands at step 8.202** — it coincides with *no*
    step and does not close the spiral turn. This is the whole point.
  - `5/3 → step 6.045`, `7/3 → step 10.026` ⇒ the **3:5:7 "BP major" triad**
    ≈ steps **[0, 6, 10]**.
  - `7/5 → step 3.982`, `9/5 → step 6.955` ⇒ **5:7:9** ≈ steps **[0, 4, 7]**.
- Chromatic = all 13 steps; the classic 9-note **Lambda** mode = steps
  `0,1,3,4,6,7,9,10,12` (per the Xenharmonic Wiki).
- **Timbre:** an additive, clarinet-like `PeriodicWave` with strong **odd**
  partials (1, 3, 5, 7, 9, 11) and only vestigial even ones, so BP's real
  consonances can lock and its clusters bite.

## Input (not pointer-only)

- **QWERTY keyboard (primary, headless-testable):** two rows map the 13 BP steps
  across a tritave-and-a-bit — bottom row `A S D F G H J K L ;` = steps 0‥9,
  top row `Q W E R T Y` = steps 10‥15.
- **Web MIDI (bonus):** `navigator.requestMIDIAccess()` remaps incoming MIDI note
  numbers onto the BP lattice (note 60 = tonic, step 0). Degrades silently when
  Web MIDI is unavailable; the panel shows whether it is live. First MIDI
  integration in the lab.
- **Tap (secondary):** SVG keys are tappable.

## Visual (SVG)

A **tritave spiral** where one full turn equals one tritave (13 steps). Because
of that, the 2:1 octave marker (amber, dashed) points mid-turn and visibly never
closes, while the 3:1 tritave marker (violet) completes exactly one turn. Big
nodes are the Lambda mode, small nodes the chromatic infill; played keys light
violet with a glow, and the held chord's ratio (e.g. `3:5:7`) is named in the
readout.

## Degradation / autopilot

Immediate **Start** (the Web Audio gesture). After ~4s with no input, a
**deterministic** idle autopilot plays a Lambda-scale run followed by the 3:5:7
chord, so it self-demos silently on a phone. Any human input cancels it and
resets the countdown. Cleanup on unmount cancels timers, removes keyboard/MIDI/
pointer listeners, and closes the AudioContext behind a `disposed` guard.

## Named references

Heinz Bohlen (1978); Max Mathews & John Pierce; Xenharmonic Wiki,
"Bohlen–Pierce scale" (en.xen.wiki/w/Bohlen–Pierce_scale).

## Unverified headless

- Whether the odd-harmonic timbre makes the 3:5:7 triad *audibly* ring as a
  consonance (and the clusters audibly bite) — this is a perceptual claim that
  needs ears; the synthesis math and partial weighting are in place but not
  confirmed by listening in this environment.
- Web MIDI with a real hardware controller (no device available headless);
  the code path degrades silently and is exercised only when access is granted.

## Files

- `bp.ts` — tuning engine (steps, cents, Lambda mode, chords, chord ID) + the
  odd-harmonic `PeriodicWave` and the `BpSynth` voice/engine.
- `page.tsx` — client component: SVG spiral, keyboard + MIDI + tap input,
  chord presets, idle autopilot, readouts.
