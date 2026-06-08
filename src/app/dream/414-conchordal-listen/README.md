# 414 — Conchordal Listen

**Cycle 3 of the Conchordal thread.**  
*What if a living chord could listen to your piano and grow a pure-intonation harmony around what you play?*

---

## What it is

A population of 28–40 microtonal sound-organisms forage a continuous Plomp–Levelt consonance landscape that is *shaped by real audio* — a synthesised piano phrase, your live microphone, or a loaded recording. No scale is ever specified. Just-intonation harmony emerges as organisms drift toward frequency positions that minimise roughness and maximise harmonicity with what they hear.

The piece is self-running: tap **Self-play demo** and within a few seconds organisms orient toward the heard phrase's pitches, assembling pure intervals around them without any further interaction.

---

## How to use

1. **Self-play demo (default, hands-free):** tap "▶ Self-play demo". After ~2 s the internal piano phrase begins; organisms immediately start foraging around its partials. Watch the amber sunlight wells appear at heard pitches, and watch blooms drift toward them.
2. **Live microphone ("🎹 Play piano"):** tap that button; allow microphone access when prompted. Play anything on a piano or hum a note. The piece adapts in real time. If mic access is denied, a `text-rose-300` notice appears and the demo continues automatically.
3. **Karel's recording:** paste a Resonance recording UUID, click Load, then "▶ Play recording". The existing `/api/audio/{id}` route is used (try/catch wrapped; failure shows a readable error, demo remains available).

---

## Engine

### 1. Consonance landscape (Plomp–Levelt 1965)

Roughness between two partials at frequencies *f₁*, *f₂* with amplitudes *a₁*, *a₂*:

```
s = 0.24 / (0.0207 · min(f₁, f₂) + 18.96)
x = |f₂ − f₁|
rough = a₁ · a₂ · (e^{-3.5sx} − e^{-5.75sx})
```

Total roughness of a candidate pitch = sum over all partial pairs against (a) the heard spectrum's partials and (b) every other organism's partials. Lower roughness + a harmonicity bonus = higher fitness. Organisms forage this landscape continuously via Metropolis–Hastings pitch moves.

### 2. A-life organisms

Each organism is an additive Web Audio voice at a continuous microtonal pitch. Each simulation tick (20 Hz):
- Propose a Gaussian pitch step (σ ≈ 18 cents)
- Accept if fitness improves; accept worse with probability `exp(−ΔF / T)` (Metropolis rule, T cooling slowly)
- Health rises with consonance, falls with chronic roughness
- Chronically dissonant organisms die; healthy ones reproduce near heard partials
- Re-seeding after population crashes is biased toward heard partial frequencies

### 3. Heard-partial extraction (listen subsystem — cycle-3 addition)

At each sim tick, two methods run in parallel on the shared `AnalyserNode`:

- **FFT spectral peaks:** `extractFftPeaks()` — finds up to 4 local maxima above −60 dBFS. Robust for polyphonic piano. (Following guidance from musicalboard.com 2026-05-05: no in-browser full transcription.)
- **Monophonic fundamental:** `detectFundamental()` — autocorrelation with parabolic-interpolation refinement (MPM-style; McLeod & Wyvill 2005). Covers humming, singing, monophonic lines.

The resulting `HeardPartial[]` list is amplitude-smoothed across frames and injected into the fitness function, creating "attractor wells" in the consonance landscape.

### 4. Kuramoto phase coupling

```
θᵢ += dt · (ωᵢ + K · Σⱼ sin(θⱼ − θᵢ))
```
over consonant neighbours (K = 1.5). Mutually consonant organisms synchronise breathing phase — discovered chords breathe together. (Consonance–interpersonal phase sync: PMC11534602, 2024.)

### 5. Audio chain

```
Organism oscillators → per-voice gain → master gain
    ↓                                      ↓
  dryGain → DynamicsCompressor(-6 dB, ratio 12) → destination
  reverbSend → ConvolverNode (1.6 s IR) → reverbOut → destination
```

Brick-wall DynamicsCompressor (`threshold -6, ratio 12`) prevents any clipping or output blast.

---

## Renderer: inline SVG

- **Amber radial wells** (`drawHeardWells`) — full-width ellipses at each heard pitch; brightness ∝ amplitude. Legible even before organisms orient.
- **Blooms** (`drawBloom`) — 5–8 petals open proportionally to health; size pulses with Kuramoto phase; red ring for dissonant voices.
- **Stems** (`drawStem`) — Bézier curves from ground to bloom; sway gently with Kuramoto phase.
- **Threads** (`drawConnectionThreads`) — Quadratic arcs between top consonant pairs, opacity ∝ consonance.
- **HUD** — heard pitches (note names), mean-consonance bar (violet/sky/rose), population count, elapsed time.

---

## Lineage

| Cycle | Folder | Addition |
|-------|--------|----------|
| 1 | `410-conchordal-garden` | Base A-life consonance landscape, no external input |
| 2 | *(skipped)* | — |
| 3 | `414-conchordal-listen` | Listen subsystem: mic / demo / recording; heard-partial attractor wells |

---

## Named references

- **Conchordal** — arXiv:2603.25637 (emergent harmonic structure via consonance optimization)
- **Plomp–Levelt 1965** — "Tonal Consonance and Critical Bandwidth", *JASA* — the roughness model used here verbatim
- **McLeod Pitch Method (MPM)** — McLeod & Wyvill 2005, autocorrelation-based monophonic f₀ detection with parabolic interpolation
- **Consonance–phase sync** — PMC11534602 (2024) — empirical backing for Kuramoto coupling among consonant voices
