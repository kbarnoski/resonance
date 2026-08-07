# 8024 · Oneirogen

**"What if you could FEEL the moment your perception flips into hallucination — the point where the mind stops SEEING your sound and starts DREAMING it?"**

A 3D point field (three.js `Points` + a custom `ShaderMaterial`) driven by your microphone, governed by one hidden dial **α ∈ [0,1]** — the *oneirogen dial*.

## The α reality-monitoring crossfade

The whole piece is a blend between two regimes, mixed by α in a single vertex shader:

- **α low — PERCEPTION (bottom-up).** The field faithfully mirrors your live mic spectrum: loud/bright sound pushes, sculpts and colours the particles in real time, and the six harmonic "band voices" you hear are a sonification of your actual spectrum. *What you hear is what you see.*
- **α high — HALLUCINATION (top-down).** The field ignores new input and regenerates autonomously from a **learned running-statistics prior** — an exponential moving average of your last ~8 s of per-band spectral energy. The particles swirl into a Klüver-ish spiral/cobweb form-constant, and the audio is now **synthesized from the prior**, not your live sound. You literally hear your own sound-world being dreamed back at you.

This models the **C×G×D** framework: a *Classifier* reads real input, a *Generator* synthesizes internal content, and a *Discriminator* decides external-vs-internal. The altered state is the Discriminator failing — generated content mistaken for real.

## The verb — a tug-of-war, not a slider

- α **drifts upward on its own** (~22 s) — the pull toward the dream.
- **Feeding novel sound** (fresh, changing, loud spectrum measured as flux vs. the prior) pulls α back **down** — holding onto reality. Silence or repetitive input lets it climb.
- The pull-back grip is scaled by **(1−α)^1.5**, so past a threshold the Discriminator has failed and *no sound you make brings the field back*. You discover that exact crossing point by fighting it.
- A **reality-monitor meter** shows the Discriminator's confidence, collapsing toward **50%** as α → 1.
- Secondary controls: **Pull back** (a manual jolt of "novel sound") and **Surrender** (let go — ramp α up). The core loop is the audio tug-of-war.

## Self-demo (zero sensors)

On load, with no mic and no audio (autoplay policy), a seeded `mulberry32(0x8024)` **virtual voice** drives the full perception → drift → hallucination → pull-back arc silently in ~10 s, then auto-wakes and replays, so the concept reads purely visually on a muted phone. Real audio + mic attach on the first gesture ("Enable mic & enter"). Mic denied → the virtual voice keeps playing, now with sound.

## Named references

- **eLife 2026** computational psychedelic / *oneirogen* model: raising α shifts perception from bottom-up sensory inference to top-down generative replay.
- **Frontiers in Psychology 2026**, *Beyond the reducing valve: computational neurophenomenology of altered states* — the C×G×D (Classifier / Generator / Discriminator) framework; reality-monitoring is the Discriminator's job.
- **Klüver form constants** (the universal geometry of hallucination) — an aesthetic nod (spiral/cobweb), deliberately **not** a log-polar tunnel.

## Tags

- **state:** reality-monitoring crossfade (perception ↔ hallucination)
- **pole:** dream
- **vibe:** cosmic-ambient boundless drift at low α → intense, the dream overtakes at high α
- **refs:** eLife 2026 oneirogen model · Frontiers 2026 C×G×D neurophenomenology · Klüver form constants
- **INPUT:** microphone (`getUserMedia` + `AnalyserNode`; graceful virtual-voice fallback)
- **OUTPUT:** three.js GPU point field (`BufferGeometry` + custom `ShaderMaterial`, additive)
- **TECHNIQUE:** perception↔generation reality-monitoring crossfade over a learned running-statistics prior

## Honest limitations

- The "prior" is a per-band EMA (+ a fast EMA for novelty), not a full histogram/generative model — it captures spectral *shape* over ~8 s, not temporal structure, so the "dream" is a stylized replay, not a literal reconstruction of your phrases.
- Novelty is spectral flux + amplitude; steady loud tones read as low-novelty (correctly — repetition lets α climb), but a very noisy room can keep α artificially low.
- The mic path sonifies the spectrum rather than routing the mic to the speakers (that would feed back), so at low α you hear a *representation* of your sound, not the raw signal.
- Determinism holds for the visual/state layer (frame-counted, seeded PRNG); the audio layer's LFOs use `AudioContext.currentTime`, which is monotonic but not frame-locked.
- The silent-demo auto-wake reset applies **only** before the first gesture; once you start, α never auto-resets — the failure past the threshold is real.

## Determinism / safety

No `Math.random`, `Date.now`, or argless `new Date()` anywhere — randomness is `mulberry32(0x8024)`, time is frame counting + `AudioContext.currentTime`. Luminance drift is capped ≤ ~1.65 Hz through the shared `SafeFlicker` engine (no full-screen strobe), and `prefers-reduced-motion` slows the motion and drift. Full teardown stops the rAF, oscillators, mic tracks, disposes the three.js geometry/material/renderer, and closes the AudioContext.
