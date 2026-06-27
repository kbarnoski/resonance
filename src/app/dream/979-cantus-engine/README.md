# 979 · Cantus Engine

**The one question:** *What if Resonance could compose a 5-minute,
self-developing fugue in front of you — a deterministic, explainable
counterpoint machine where you watch each of Bach's and Fux's
transformations enter the score in real time?*

This is the deliberate, human-legible inverse of 2026's black-box neural
Bach-imitators: no trained weights, no sampling from a distribution. Every
note is produced by a **named contrapuntal operation** you can see fire on
screen, and a **Fux voice-leading scorer** decides the exact pitch of each
voice. Pass it a seed and it plays the same piece every time.

`INPUT=Web-MIDI+keyboard · OUTPUT=raw-WebGL2 piano-roll · TECHNIQUE=deterministic long-form motivic-development counterpoint engine + Fux voice-leading scorer · VIBE=engraved manuscript`

## How to use it

- **Just look:** it auto-starts a built-in subject (the B-A-C-H cell) within
  ~2 seconds, so a passing glance both *hears* counterpoint and *sees* the
  score scroll with transform labels flashing as they enter.
- **Seed your own subject (non-pointer input):**
  - Press **Set subject**, then play **5 notes**.
  - On a **MIDI keyboard**: press **Connect MIDI** first, then play.
  - With **no MIDI device**: use your **computer keyboard** —
    `A S D F G H J K` = scale degrees 1–8.
- **Built-in subjects:** B-A-C-H cell, ascending fourth, royal-theme sigh —
  one click each.
- **Watch it develop:** the HUD shows the live **section**, **key**, **cycle**,
  and a running log of the transforms (INVERSION, STRETTO, → G major, …) as
  the engine narrates them.

## What it actually does

- **Long-form arc (~310 s/cycle):** Exposition → Episode → Modulation →
  Stretto → Coda, then it loops **with a perfect-fifth key drift and a mode
  flip each cycle**, so minute 5 is in a different key/character than minute 1.
  It is not a short loop.
- **Stateful:** an `EngineState` object tracks current key, active voice
  queues, fired transforms, section, and elapsed beats.
- **Named operations** (`engine.ts` / `theory.ts`): diatonic transposition,
  real and tonal answers at the fifth, inversion, retrograde, augmentation,
  diminution, stretto (overlapping entries), and modulation to related keys
  (dominant / subdominant / relative). A seeded **mulberry32 PRNG** chooses
  which fires next, **weighted by the current section**.
- **3 independent voices** realized by the **Fux scorer** (`scorer.ts`):
  rewards stepwise motion, consonance on strong beats, and contrary motion;
  penalizes parallel fifths/octaves, voice crossing, and large leaps. Pitches
  are chosen greedily over diatonic candidates around the motif's contour.
- **Audio** (`audio.ts`): FM-triangle tones with ADSR, scheduled with a
  **look-ahead scheduler** (`setInterval` ~25 ms tick, ~100 ms lookahead
  against `AudioContext.currentTime`) — not one pre-rendered buffer. Master
  chain: `gain (0.26) → lowpass 9 kHz → DynamicsCompressor → destination`,
  with polyphony capped at 14 (oldest voices stolen).
- **Visual** (`gl.ts` + `canvas2d.ts`): a scrolling piano-roll / manuscript
  score in **raw WebGL2** (no three.js), color-coded per voice on a warm
  paper-dark field with octave hairlines; transform labels flash as they
  enter. Falls back to **Canvas2D** if WebGL2 is unavailable.

## Files

- `page.tsx` — UI, MIDI + keyboard input, scheduler & rAF loops, HUD.
- `theory.ts` — PRNG, scale/degree math, the contrapuntal operations, subjects.
- `scorer.ts` — the Fux voice-leading scorer.
- `engine.ts` — stateful long-form generator (arc, key drift, transform firing).
- `audio.ts` — Web Audio synth voices + master chain.
- `gl.ts` — raw WebGL2 piano-roll renderer.
- `canvas2d.ts` — Canvas2D fallback renderer.

## References

- **J. J. Fux, _Gradus ad Parnassum_ (1725)** — the species-counterpoint rules
  the scorer encodes.
- **J. S. Bach, _The Art of Fugue_ / _Two-Part Inventions_** — the motivic
  transformations (answer, inversion, retrograde, augmentation, stretto) the
  engine names and applies.
- **arXiv 2606.13626, "Generative Modeling of Bach-Style Symbolic Music"
  (June 2026)** — the neural Bach-imitator this prototype is the explainable
  inverse of: same goal (convincing Bach-style counterpoint), opposite method
  (every note traceable to a named rule instead of learned weights).

## What's rough / what to deepen next cycle

- **Voice-leading is greedy, not search.** The scorer picks the best single
  candidate per voice each beat; it has no real lookahead, so it can paint
  itself into a corner (e.g. a forced repeated note). A small beam search over
  2–3 beats would make cadences and suspensions much more convincing.
- **No true cadential logic.** Sections change by a beat counter, not by
  harmonic arrival. Real fugues cadence into modulations; here the modulation
  is announced and the material simply re-enters. Adding authentic-cadence
  detection before each section change would tighten the form.
- **Rhythm is motif-driven only.** Voices inherit the subject's durations;
  there's no independent rhythmic counterpoint (suspensions, syncopation
  against the bar). Species-style rhythmic species per voice would help.
- **Subject capture is fixed at 5 notes, untimed.** It captures pitch (degree)
  only, not the rhythm you play. Capturing inter-onset timing would let a user
  seed a genuinely rhythmic subject.
- **Tonal answer is approximate.** The classic tonic↔dominant mutation is
  modeled as a simple "first note up a fourth, rest up a fifth"; a real
  tonal-answer algorithm inspects where the dominant occurs in the head.
