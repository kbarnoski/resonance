# 7192 · Tidefield

**A living tide.** A 7+ minute generative audio-visual piece that never repeats,
breathes with expressive micro-timing, evolves through emergent sections, and
always returns home. You conduct it with your breath (or device tilt, or a
slider); the tide reabsorbs your energy back toward home over ~30 seconds.

- **INPUT**: device-tilt / mic-breath (→ on-screen energy slider)
- **OUTPUT**: Canvas 2D (oceanic — layered tide bands, moon-glimmer on water,
  drifting oscillator phase-points)
- **TECHNIQUE**: coupled phase oscillators (Kuramoto) as long-form emergent
  structure
- **VIBE**: ambient-oceanic

Audio is Web Audio API only (no files, no npm deps). Visuals are Canvas 2D only
(no WebGL/WebGPU/three.js). Deterministic: a seeded `mulberry32(0x7192)` PRNG is
the only source of randomness — no `Math.random`, `Date.now`, or `new Date`.

---

## The one question

> What if a Resonance journey were a **living tide** — a 7+ minute piece that
> never repeats, breathes with micro-timing, evolves with memory, and always
> returns home — and you conduct it with your breath, but the tide reabsorbs
> your energy over minutes?

## The engine: a network of slow coupled oscillators (Kuramoto)

The long form is not scripted. It is the trajectory of a small dynamical system:
**6 slow phase oscillators**, each with its own natural period (≈23–96 s, seeded
with ±15% jitter) and a coupling term pulling their phases together. The update
is the Kuramoto model:

```
dθ_i/dt = ω_i + (K/N) Σ_j sin(θ_j − θ_i) + H·sin(θ_home − θ_i) + energy·pert_i
```

The **synchronization order parameter** is the collective conductor:

```
r · e^{iψ} = (1/N) Σ_j e^{iθ_j}
```

- `r` (0–1) measures how in-phase the field is. **High r = crest/climax, low r =
  calm/dispersed.**
- `ψ` (the mean phase) picks harmonic motion through a gentle D-Dorian
  progression `[G, Am, Dm, Em, F]`, with **Dm (home) mid-bin** so a converged
  field resolves onto it.

Oscillator phases map to musical parameters: `θ₀ → tideLevel`, order → tension /
brightness, `θ₂ → density`, `ψ → chord`. **Sections emerge** from sync↔desync
transitions of a continuous system (Dispersal → Gathering → Swell → Crest →
Homecoming) — memory is the live state vector, not a discrete script, so the
piece has clear long arcs yet never exactly repeats.

**Homecoming, not a loop.** Baseline coupling hovers near-critical for the bulk
of the arc (metastable partial sync — clusters form and break, so `r` wanders and
sections arise on their own), gently breathed by a slow coupling tide. In the
final ~30% of the arc the coupling and a **home-pull** term `H` ramp hard, so the
field resolves toward *sync-at-home* (D Dorian, low tension) by the end.

## Agogic micro-timing (arXiv 2608.03999)

Following **"Agogic: Performance-Timed Music Tokens for LLM-Native
Text-to-Symbolic-Music Generation" (arXiv 2608.03999, Aug 2026)**, expressive
*timing* — agogic accents, which emphasize by **duration / rubato**, not volume —
is what makes generated music feel alive instead of metronomic. Here timing is a
**first-class engine primitive, not a fixed grid**:

- **Rubato from phase velocity.** Each voice's instantaneous phase velocity
  (`dθ_i/dt`) is compared to its natural rate `ω_i`. When an oscillator *speeds*
  through its cycle its events **lean early**; when it *slows*, they **lag**. The
  field breathes on its own.
- **Agogic accent = a held event.** When the order parameter crosses a sync
  threshold, that transition event is marked by **lengthening** the note (a held
  bell), never by making it louder.

**Honesty note.** Expressive rubato / performance-timing already exists in the
lab — this prototype does **not** claim it as novel. The contribution here is
applying the *Agogic* framing (timing as a token-level, performance-driven
primitive) to a **coupled-oscillator long-form engine**, deriving rubato directly
from the oscillator dynamics rather than from a separate groove model.

## Audio graph (Web Audio only)

Fully generated, no external assets:

- **Pad** — 3 detuned oscillators (2 saw + 1 triangle) → lowpass (opened by
  brightness) → LFO chorus delay → dry + reverb. Plays the current chord tones,
  ramped smoothly on change.
- **Sub** — a sine on the chord root, one octave down.
- **Drone** — a very quiet constant low D bed.
- **Bells/plucks** — sparse FM plucks (sine carrier + sine modulator with a
  decaying index), pitched to D-Dorian chord/scale tones. Event *rate* follows
  density; each event's *timing* is bent by agogic rubato and *lengthened* on a
  sync transition.
- **Reverb** — a `ConvolverNode` fed a **procedurally generated impulse** (seeded
  noise × exponential decay, built in code — no fetch).

## Conduct / degrade ladder

Energy is injected by whichever source is live, and the field reabsorbs it toward
home over ~30 s:

1. **Device tilt** (`deviceorientation`, with the iOS `requestPermission()`
   gate) — tilt away from flat = energy.
2. **Microphone breath** — RMS above an adaptive noise floor via `getUserMedia` +
   `AnalyserNode` (never routed to output — no feedback).
3. **On-screen energy slider** — always available fallback.

The active source is shown in the readout. A breath transiently **weakens
coupling** (disperses the field); as the energy reabsorbs, the field re-coheres
and returns home.

## Alive on load & safety

- On mount, before any click or permission, the oscillator field evolves and the
  canvas drifts **silently** — a zero-interaction reviewer sees it living. Audio
  starts on the first gesture (autoplay policy), stated in the UI.
- **Strobe-safe:** slow luminance drift only, no flicker above ~3 Hz.
- **Full teardown** on unmount: rAF cancelled, listeners removed, mic tracks
  stopped, nodes disconnected, `AudioContext.close()`.

## Long-form self-verification

`engine.ts` exposes pure `stepField` / `runSimulation` / `verifyLongForm`. A
headless ~7-minute simulation (`verifyLongForm(420)`, dt = 1/60, sampled every
2 s → 211 samples) confirms:

| Guarantee | Result |
|---|---|
| (a) zero exact-duplicate state vectors | **0 duplicates** / 211 samples |
| (b) minute-1 measurably differs from minute-5 | **L2 phase distance ≈ 5.07** |
| (c) returned home by the end | **order ≈ 0.999, tension ≈ 0.10, chord = Dm (home)** |

## Next-cycle deepening

This is a declared multi-cycle arc. Planned next passes:

- **Cluster-aware orchestration** — detect partial sync *clusters* (not just
  global `r`) and give each cluster its own timbral voice, so a "two-tide" state
  is audible as two choirs, not one blur.
- **Learned agogic profile** — replace the linear rubato-from-velocity map with a
  small per-voice expressive curve (swing/breath shaping) still driven by phase
  velocity, closer to the token-level performance timing of arXiv 2608.03999.
- **Adaptive arc length** — let sustained conduct *extend* the arc (delay
  homecoming) and stillness *pull* it forward, so the listener negotiates the
  7-minute form rather than riding a fixed clock.
- **Spatialization** — pan the oscillator phase-points into a stereo/ambisonic
  field so sync literally converges in space.
