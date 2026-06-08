# Conchordal Garden

**Prototype 410 — emergent-harmony ecosystem**

An artificial-life garden where ~24–36 sound-organisms drift through continuous log-frequency space (130–780 Hz), hunting consonance with their neighbours. There is no predefined scale. The surviving population self-composes an ever-shifting just-intonation-like drone that is genuinely different at minute 3 than at minute 0.

---

## How to Use

1. Open the page at `/dream/410-conchordal-garden`.
2. Press **Start Garden** — the garden springs to life immediately (no further interaction required).
3. Watch the blooms open as organisms find consonance; wilting flowers with a red ring are in distress.
4. **Click anywhere on the garden** to plant a seed at that pitch (vertical = log-frequency axis).
5. Press **Stop** to halt audio and simulation cleanly.

---

## What You Are Seeing

| Visual element | Meaning |
|---|---|
| Flowering bloom (large, bright) | High health, strongly consonant with neighbours |
| Wilting bud (small, dim, red ring) | Dissonant — losing health, may die |
| Curved threads / vines | Consonant pairs; brightness and weight ∝ shared consonance |
| Thread pulse | Kuramoto phase synchrony — clusters breathe together |
| Vertical position | Pitch on a log scale (low = bottom, high = top) |
| Colour | Stable per organism — inherited identity |

---

## Sim Mechanics

### Organisms
Each organism has `{ freq, health, phase, omega }`:

- **`freq`** — fundamental Hz, drifts via a Gaussian random walk (±15 cents std dev) with Greedy / Metropolis acceptance.
- **`health`** — updated each tick: `health += k * (consonance_score + 0.5) − cost`. Consonant organisms bloom; persistent dissonance causes death.
- **`phase` / `omega`** — Kuramoto oscillator (natural freq 0.1–0.4 Hz). Drives amplitude tremolo and visual "breathing".

### Plomp–Levelt Roughness
Each voice produces 5 harmonic partials (amplitudes 1/n). Roughness between two partials at (f1, a1) and (f2, a2):

```
x = 0.24 * |f1 − f2| / (0.0207 * min(f1,f2) + 18.96)
roughness = a1 * a2 * (exp(−3.5x) − exp(−5.75x))
```

Total roughness = sum over all cross-voice partial pairs.

### Harmonicity Bonus
Fitness gets a bonus when the frequency ratio of two organisms is within ~30 cents of a small-integer ratio: 1/1, 9/8, 8/7, 7/6, 6/5, 5/4, 4/3, 7/5, 3/2, 8/5, 5/3, 7/4, 2/1. This rewards just-intonation-like intervals without specifying a scale.

### Crowding Penalty
Organisms within 60 cents of each other are penalised, preventing the whole population collapsing onto one pitch.

### Kuramoto Phase Coupling
```
dθ_i/dt = ω_i + K * mean_j∈consonant_neighbours( sin(θ_j − θ_i) )
```
Consonant clusters synchronise their phases → visible and audible breathing together.

### Metabolism and Lifecycle
- Consonant organisms gain health, dissonant lose it.
- Healthy organisms (health ≥ 0.78) occasionally reproduce — a seed sprouts at ±200 cents from the parent.
- Organisms below the death threshold (health < 0.04) after a 2-second protected period die and fade out.
- Population is always re-seeded if it falls below 6.

---

## Audio Engine

- **Web Audio API**, constructed inside the Start button gesture.
- Each organism = 4 additive sine oscillators (partials 1–4 at 1/n amplitude).
- Frequency glides smoothly via `setTargetAtTime` (τ ≈ 120 ms).
- Gain = `health × 0.5 × (0.75 + 0.25 sin(phase))` — Kuramoto tremolo.
- Master chain: voices → `GainNode` → `ConvolverNode` (short synthetic reverb ~1.5s) + dry path → `DynamicsCompressor` → destination.
- Full teardown on Stop and component unmount: all oscillators stopped, AudioContext closed, rAF and interval cancelled.
- If Web Audio is unavailable, a `text-rose-300` notice is shown and the visual simulation continues.

---

## Rendering

Pure inline **SVG DOM**, updated each `requestAnimationFrame`:

- Organism `<ellipse>` petals, `<radialGradient>` core, `<feGaussianBlur>` aura glow.
- Curved vine threads `<path>` between consonant pairs, opacity and weight ∝ consonance.
- Stem `<path>` with cubic Bézier from ground to bloom head.
- Subtle frequency guide lines for orientation.
- All SVG is rebuilt via `innerHTML` each frame (no per-node patching) — fast for ≤ 40 organisms, avoids accumulating stale `<defs>`.

---

## References

1. **Conchordal: Emergent Harmony via Direct Cognitive Coupling in a Psychoacoustic Landscape**  
   arXiv:2603.25637, March 2026. *(Inspiration for the emergent-harmony framing and the consonance-as-fitness approach.)*

2. **Plomp, R. & Levelt, W. J. M.** — "Tonal Consonance and Critical Bandwidth", *Journal of the Acoustical Society of America* 38(4), 1965.  
   *(Foundation of the roughness formula implemented here.)*

3. **Kuramoto, Y.** — *Chemical Oscillations, Waves, and Turbulence*, Springer, 1984.  
   *(Source of the phase-coupling model used for tremolo synchrony.)*

---

## Design Notes

- The system never specifies a scale. What harmony emerges is strictly a product of the Plomp–Levelt landscape and the just-intonation bonus — often settling near 5-limit or 7-limit chords, but never the same twice.
- The "tangled chaos → blooming chord" arc is fastest to observe in the first 30–60 seconds: early population is noisy and dissonant (many wilting red-ringed buds); as unfit organisms die and consonant ones reproduce, the mean consonance score rises and the garden fills with open blooms.
- Clicking to plant a seed at a specific frequency is an intentional manual intervention — you can try to steer the ecosystem toward a harmony or destabilise it.

---

## Unverified Surface

- The specific arXiv paper cited (2603.25637) was referenced in the brief; its full content has not been verified against this implementation.
- The Plomp–Levelt constants (3.5, 5.75, 0.24, 0.0207, 18.96) are from the canonical 1965 paper and widely reproduced in psychoacoustic literature; their precise optimality for this sim has not been separately validated.
- Reproductive dynamics (thresholds, rates) are tuned by hand for demo aesthetics rather than derived from ecological first principles.
