# 10984 · Echofold

`state: dreaming · pole: fading-memory`

## The one question

**What if you played a short phrase to a living mind — a real echo-state
reservoir — and it dreamed the phrase back to you, transformed a little more each
time, so your melody and its memory of your melody slowly drift apart and never
quite return?**

You trace a contour on the upper staff. A genuine reservoir computer holds a
fading, mutating trace of that gesture and sings it back on the lower staff, in a
darker register — recognizable at first, then drifting under its own dynamics.
Threads connect your marks to their echoes and **stretch and fray** as the two
lines diverge. It is different at minute five than at minute one.

## The technique (real, not faked)

This is a genuine **Echo-State Network / reservoir computer** (Jaeger, 2001), not
a scripted effect. `esn.ts` implements it in plain TypeScript — trivial at
N ≈ 220, no ML libraries:

- **State** `x ∈ R^N`, N = 220.
- **Recurrent matrix** `W`: sparse random (density 15%), entries uniform[−1, 1],
  stored CSR-style. On construction it is rescaled to **unit spectral radius** by
  **power iteration**, so the ρ slider is a single cheap scalar multiply at step
  time: the effective recurrent matrix is `ρ · W`.
- **Input** `Win`, `WinImpulse`: your traced phrase enters as `u = [impulse,
  pitch]` — an onset kick that decays across steps, plus a sample-and-held pitch.
- **Leaky update**: `x ← (1−α)·x + α·tanh(ρ·W·x + Wᵢₙ·u + W_fb·z + bias)`.
- **Readouts**: six **fixed random linear projections** `Wout·x` — *no training*.
  Two are onset triggers, two are pitch channels, and a light **output-feedback**
  term `W_fb·z` feeds a couple of readouts back in so the reservoir keeps dreaming
  after your phrase (a classic Jaeger ESN variant). Onsets fire on **upward
  threshold-crossings** (with hysteresis + a refractory window), so the melody is
  the reservoir's own dynamics, never a sequencer.

The defining property — the **echo-state / fading-memory property** — *is* the
concept. `x` is a decaying, nonlinearly-mixed trace of your recent input, so what
the readouts emit is your recent gesture transformed by the reservoir's recurrent
nonlinear dynamics. Near the edge of chaos (ρ → 1) tiny state differences amplify,
so the echo never settles — it drifts and never quite returns.

The **effective memory length** shown in the HUD is
`τ = −dt / ln((1−α) + α·ρ)` seconds — the decay time of the linearized map near
the origin. Push ρ up and τ grows toward infinity; the drift bar tracks it.

**Frontier:** 2026 edge-of-chaos reservoir design (arXiv:2605.26848) frames
reservoir behavior along three control axes — reservoir dynamics, input–reservoir
coupling, and interconnectivity/integration. Those are the three sliders below.

## How the sliders map

- **Spectral radius ρ** (0.80–1.05) — reservoir dynamics. Low ρ: short, crisp,
  faithful echo. High ρ (near 1.0): long, dissolving memory that wanders far from
  your line. This is the key knob; the HUD reports the resulting memory length.
- **Input coupling** (0.2–2.0) — input–reservoir coupling. How hard your gesture
  drives the state. Low: the reservoir's own dream dominates; high: it clings to
  your phrase.
- **Leak α** (0.08–0.70) — integration / interconnectivity. Low α: slow,
  smeared, dreamlike onsets; high α: crisp, reactive articulation.

Plus **Sing a phrase** (trace a contour on the upper staff), **Clear** (restore
the seeded phrase), and **Unlock sound**.

## Sound & light

- **Your voice**: clean glassy sine + a soft octave partial, a **whole-tone**
  scale (D4 up) — boundless, no tonic pull, deliberately not a default pentatonic.
- **Its memory**: a detuned triangle/sine bell an octave lower with a long
  release, so "you" and "its memory of you" are audibly distinct.
- A slow two-note pad drones underneath; everything passes through a
  `DynamicsCompressor` limiter; polyphony is bounded.
- The loom is **inline SVG** (never canvas/WebGL): a scrolling two-staff score,
  luminous violet marks for you, cool teal/cyan diamonds for the echo, gradient
  threads that fray with drift. A reservoir-energy aura breathes behind it.
- Silent until you unlock the AudioContext; on mount it auto-plays a seeded
  phrase (muted) so the loom is alive immediately. Strobe-safe and respects
  `prefers-reduced-motion` (slower, transition-free updates).

## Honest what-works / what's-rough

- **Works**: the ESN is real and audibly does what the brief asks — feed it a
  phrase and the lower staff is a recognizable-then-diverging transform of it,
  genuinely different minutes apart, with the drift legible in the fraying
  threads and the live memory readout. ρ near 1.0 gives the most dramatic drift.
- **Rough**: readouts are *fixed random* (no trained inverse), so pitch fidelity
  is impressionistic rather than exact transposition — the echo captures the
  *shape and rhythm* of your gesture more than precise intervals. Thread pairing
  is nearest-preceding-input heuristic, not a solved correspondence. At very low
  input coupling with high leak the reservoir can go quiet for a bar or two before
  its feedback re-excites it. Timing is RAF/step-accumulator driven, fine for
  ambient but not sample-accurate.
