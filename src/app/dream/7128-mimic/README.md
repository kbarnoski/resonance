# 7128 · mimic

**"What if the synthesizer had to LISTEN to you and evolve itself to become your voice?"**

You make a sound with your voice (mic) and a synth engine chases it in real
time. A small **population** of candidate synth-parameter vectors competes; each
generation the ones whose spectrum best matches the target survive and mutate,
so within a few seconds you **hear** the synth converge on your timbre and
**see** the population climb toward you.

## The one question it answers

Can a synthesizer invert its own parameters to reproduce a sound it is hearing —
live, in the browser, with no model, just evolution?

## Research anchor & the honest departure

Inspired by **DDSynth-RL: Audio Synthesizer Inversion via Discrete Diffusion
with Reinforcement Learning** (Wu, Chin et al., arXiv 2608.03032, Aug 2026) —
_"given a target sound, recover the synth parameters that reproduce it."_

This prototype is an **honest departure**: **no ML.** Instead of a diffusion
model it runs a lightweight, browser-native **differential-evolution /
hill-climbing search** in plain JS —

- a population of **24** parameter vectors,
- **fitness = negative log-spectral distance** between each candidate's rendered
  spectrum and the live target, over **48 log-spaced frequency bands**,
- **rank-biased selection + DE/rand/1 breeding (`child = a + F·(b − c)`) +
  Gaussian mutation** each generation,
- **elitism** so the best is never lost.

This is **real-time evolutionary parameter inversion** — new to the lab, and (as
far as we know) its first use of an evolutionary searcher driving a synth.

## How it works

- **Analytic renderer** (`engine.ts`): each candidate is 8 floats — base
  frequency, two partial ratios, two partial amplitudes, spectral tilt, a
  formant centre, and a noise mix. Its magnitude spectrum is computed
  _analytically_ (three Gaussian partials → a formant band-pass hump → spectral
  tilt + noise floor), so thousands of evaluations per second stay cheap. No
  offline audio render needed.
- **The audible voice** (`MimicVoice`): the single best candidate each
  generation drives three real oscillators through a band-pass formant filter
  plus a touch of seeded noise, eased with `setTargetAtTime` so you hear it
  glide toward the target.
- **Determinism**: every random number comes from `mulberry32(0x7128)`. There is
  **no `Math.random`, `Date.now`, or `new Date`** anywhere — the run replays
  identically. Timing uses `requestAnimationFrame` and the AudioContext clock.

## Tags

- **INPUT** — microphone (`getUserMedia` → `AnalyserNode` → FFT → 48 log bands as
  the live target). Also **alive on load**: a seeded formant-chord target runs
  from mount, so with zero mic permission the evolution is already converging.
- **OUTPUT** — **Canvas 2D only** (no WebGL/WebGPU/three.js). Draws the target
  spectrum vs. the current-best candidate overlaid, the whole population as a
  faint cloud, a best-fitness sparkline, and a live readout of generation #,
  best fitness, and the best parameter values.
- **TECHNIQUE** — differential-evolution / evolutionary parameter inversion
  driving a synth.
- **VIBE** — mimetic / uncanny: the machine trying to become you. Restrained.

## How it degrades

- **No mic / permission denied** → a `text-destructive` notice appears **and**
  the seeded chord keeps running, so the evolution and audio never stop.
- **Audio blocked until a gesture** (browser policy) → the visual search runs
  immediately on mount; a click on any button unlocks sound.
- **No Canvas 2D context** → a readable notice overlays the canvas; the search
  and audio still run. Never a white screen.
- **Full teardown on unmount**: rAF cancelled, mic tracks stopped, nodes
  released, `AudioContext.close()`.

## Next-cycle deepening

Add **island populations with periodic migration** and let the user "pin" a
found timbre as a new elite seed — then morph between two captured voices by
interpolating their winning parameter vectors, turning inversion into a
playable, evolving instrument.
