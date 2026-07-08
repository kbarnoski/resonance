# 1280 · Earth Bell

`INPUT tap-strike + orbit-drag · OUTPUT three.js struck & orbited deforming globe-object · TECH Earth free-oscillation normal modes + spherical-harmonic mode-shape deformation + modal synthesis · PALETTE basalt/ocean-abyss · state cosmic-boundless/planetary-awe · pole cosmic-ambient`

## The one question

**What if you could STRIKE the whole planet like a bell and watch it ring?** —
excite the Earth's real free-oscillation normal modes, see the globe breathe in
the true spherical-harmonic mode shapes, and hear those enormous ~hour-long
resonances scaled up into an audible chord.

After a great earthquake the entire Earth rings for weeks in its **free
oscillations** — discrete standing waves of the whole body of the planet. The
spheroidal modes ₙSₗ are the "bell tones." This piece makes them playable.

## How to use

- Press **Begin** to start the audio (browsers require a gesture). Begin also
  delivers a first "great earthquake" at a southern mid-latitude — an echo of the
  1960 Chile event — so the planet rings immediately.
- **Tap / click anywhere on the globe** to strike it there: a virtual great
  earthquake at that lat/long. Where you strike decides which modes ring (see the
  strike model below).
- **Drag** to orbit the planet.
- The row of **mode buttons** (₀S₂ … ₁S₃) solo/mute each normal mode; each shows
  its scaled audible frequency.
- **Swell** keeps a soft, very low planetary drone bed alive under everything.

## The normal-mode frequencies used

Real spheroidal-mode eigenfrequencies (approximate PREM values), in mHz, and the
single fixed factor that scales them into the audible band. The scaling is a pure
multiply, so **every interval ratio is preserved** — the chord you hear *is* the
Earth's true free-oscillation spectrum, transposed up roughly six octaves.

`audible Hz = mHz × 315`  (AUDIO_SCALE)
`visible Hz = mHz × 0.42` (VIS_SCALE — the real ~hour periods are far too slow to watch)

| mode | l | real freq (mHz) | real period | audible Hz | visible Hz |
|------|---|-----------------|-------------|------------|------------|
| ₀S₂ (football) | 2 | 0.30928 | ~53.9 min | 97.4 | 0.130 |
| ₀S₀ (radial breathing) | 0 | 0.81433 | ~20.5 min | 256.5 | 0.342 |
| ₀S₃ | 3 | 0.46856 | ~35.6 min | 147.6 | 0.197 |
| ₀S₄ | 4 | 0.64698 | ~25.8 min | 203.8 | 0.272 |
| ₀S₅ | 5 | 0.84042 | ~19.8 min | 264.7 | 0.353 |
| ₀S₆ | 6 | 1.03824 | ~16.1 min | 327.0 | 0.436 |
| ₁S₂ (overtone n=1) | 2 | 0.67998 | ~24.5 min | 214.2 | 0.286 |
| ₁S₃ (overtone n=1) | 3 | 0.93980 | ~17.7 min | 296.0 | 0.395 |

All land in ~97–327 Hz, a rich, close-voiced planetary chord. Values are
approximate/standard PREM numbers (see refs); being approximately faithful is the
goal, not sub-µHz precision.

## The spherical-harmonic mode shapes

Each spheroidal mode of angular degree *l* has a surface displacement pattern
proportional to a **real spherical harmonic Yₗᵐ**. We compute Yₗᵐ analytically
(associated Legendre recurrence, `realSH` in `modes.ts`) and normalise each mode
to peak ±1 (`MODE_MAX_ABS`). The three.js globe is an icosphere whose radius at
each vertex is

```
r(x̂,t) = R · ( 1 + DISP · Σ_modes  env_mode(t) · sin(2π·visHz_mode·t) · Yₗᵐ(x̂) )
```

Vertex normals are recomputed every frame, so the ridges genuinely rise and catch
raking light: you see the **l=2 football** slowly go prolate↔oblate, the l=4/l=6
sectoral crowns pulse, and ₀S₀ breathe as a whole-sphere expansion.

A real mode is a **(2l+1)-fold degenerate multiplet** (all orders m for a given
l). For visual legibility we render one representative order m per mode (e.g. ₀S₂
as the zonal m=0 football; ₀S₆ as the m=6 sectoral crown). This is a deliberate
simplification, noted honestly.

## The strike → mode-excitation model

A tap raycasts to a unit direction on the globe. Each **enabled** mode gains
envelope energy in proportion to the magnitude of its mode shape at the strike
point:

```
env_mode += STRIKE_STRENGTH · |Yₗᵐ(strike point)|      (clamped)
```

So striking near a **node** of a mode (|Y|≈0) barely excites it, and striking an
**antinode** (|Y|≈1) rings it fully — the physically correct behaviour that a
point source couples to a mode by its local amplitude. Striking a pole, for
instance, excites only the zonal (m=0) modes and leaves the sectoral crowns
silent.

Between strikes each envelope decays exponentially with a per-mode time-constant
τ (gravest modes ring longest — a stand-in for the real modes' very high Q), a
bell-like long tail.

## Audio mapping (modal synthesis)

- One sine oscillator per mode at its scaled audible frequency, lightly detuned
  for a slow beat. Its level is driven every frame by that mode's decaying
  envelope — struck modes bloom and ring down. Higher modes are gently rolled off
  so the chord isn't top-heavy.
- A soft sub **impact** thump retriggers on each strike for a satisfying "you hit
  it" transient.
- The shared `startDroneBank` provides a very low (~C1) planetary bed — the swell.
- The shared `createVoidReverb` (7.5 s tail) gives the resonance cavernous,
  planetary scale.
- Bus: voices + bed → void → `DynamicsCompressor` limiter → master gain
  (peak ≤ 0.3, 2 s fade-in) → destination. Full teardown on unmount.

## Distinct from 463-terra-gamelan

`463-terra-gamelan` is a **passive readout**: real earthquake *data* triggering
bells on a globe. **Earth Bell is the opposite** — a **played, perturbable
physical MODEL** of the Earth's eigenmodes. There is no data feed; you *are* the
earthquake. It runs fully offline with zero network.

## Safety

No strobe. All luminance and geometry changes are slow, smooth, continuous
sinusoids (well below 1 Hz for the mode oscillation, and the faint emissive glow
tracks ringing energy gently). `prefersReducedMotion()` coarsens the mesh and
slows the idle spin/camera drift. Master audio is limited and fades in.

## Not verified / next-cycle deepening

- **Not verified on a real GPU or real ears** — the per-frame vertex displacement
  + normal recompute at icosphere detail 5 (~10k verts) should be comfortable but
  is untested on low-end hardware; the chord balance and reverb wetness are tuned
  by eye/reason, not by listening.
- The mode-shape rendering uses one representative m per mode; a next pass could
  render the full (2l+1) multiplet and let a strike excite the correct m-mixture
  by the addition theorem (a point source excites the zonal harmonic *centered on
  the strike*, i.e. Pₗ(cos γ) radiating from the tap) — visually gorgeous and more
  faithful than the fixed-axis harmonics used here.
- Eigenfrequencies are approximate PREM fundamentals + two overtones; a deeper
  build could load a fuller mode catalogue and model splitting/attenuation (Q per
  mode) properly.
- **Future hook (not shipped):** the same instrument could be fed live great-
  earthquake catalogues to *auto-strike* — but the shipped piece is a
  self-contained physical model with no network dependency.

## References

- **Free oscillations of the Earth** (whole-Earth normal modes / standing waves).
- **Benioff, Press & Smith**, "Excitation of the free oscillations of the Earth by
  earthquakes," *J. Geophys. Res.* **66** (1961).
- The **1960 Valdivia M9.5 Chile earthquake** — the event that first rang ₀S₂
  measurably and launched observational normal-mode seismology.
- **Dahlen & Tromp**, *Theoretical Global Seismology* (standard normal-mode
  seismology; PREM eigenfrequencies).
