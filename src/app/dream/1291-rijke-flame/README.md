# 1291 · Rijke Flame

**The one question:** What if you could *play* a singing flame — a thermoacoustic
Rijke tube that spontaneously sings when you place heat inside it?

A tall vertical open-ended pipe fills the screen. You drag the glowing gauze/flame
up and down the tube with pointer or touch, and drag the top handle to set the
tube's length (and pitch). Place the heat in the lower half and the pipe swells
into a loud standing-wave tone; slide it up and the song dies. This is a genuine
limit-cycle instrument, not a signal readout.

## The physics I modeled

A **Rijke tube** (P.L. Rijke, 1859) is an open–open pipe with a heat source inside
it. Treated as an acoustic resonator, its mode *n* standing wave is

```
pressure   p_n(x) ∝ sin(nπx/L)      → antinode at the centre (n=1)
velocity   u_n(x) ∝ cos(nπx/L)      → antinodes at the two open ends
```

**Lord Rayleigh's criterion** (1878): if heat is added to the gas at the moment
its acoustic pressure is *rising*, energy is fed into the oscillation; add it while
pressure falls and the oscillation is damped. For a compact heater whose heat
release lags the local acoustic *velocity*, the linear growth rate of mode *n*
comes out proportional to the product `p_n(x)·u_n(x) ∝ sin(2nπx/L)`.

For the fundamental (n=1) that is `sin(2πh)` where `h ∈ [0,1]` is the heat's
fractional height:

- **Positive (driving) in the lower half**, peaking at `h = 1/4`.
- **Zero at the centre** (`h = 1/2`).
- **Negative (damping) in the upper half**, worst at `h = 3/4`.

This is exactly the textbook Rijke behaviour: heat low → it sings, heat high → it
falls silent. The second mode grows as `sin(4πh)`, which leaves a **pure-octave
pocket near `h ≈ 0.62`** where the fundamental is being damped but the octave is
driven — a reward for exploring.

### Mapping physics → sound + hand (`model.ts`, `audio.ts`)

- Each mode's **target amplitude** = the positive part of its Rayleigh gain
  (`max(0, sin(2πh))` and `max(0, sin(4πh))`), lightly sharpened so the sweet
  spot is worth hunting for.
- A **limit-cycle integrator** (`TubeModel.runStep`) relaxes the amplitude toward
  that target — deliberately **slow on the way up** (the satisfying onset swell as
  the tube breaks into song) and quicker on the way down (heat moved into the
  damping zone → it decays). No sound is possible with the heat at the open ends.
- **Timbre:** the tone is a fundamental + a harmonic stack (2f, 3f, 4f) whose
  upper partials brighten with drive, plus a **breath-noise band** (bandpass-tuned
  to the fundamental) that is loud during onset and fades as the tone purifies —
  breathy at the start, pure at full song. A body lowpass opens with drive so the
  pipe brightens as it drives. A soft sub and a low ember rumble give it a floor.
- **Pitch from length:** longer tube = lower pitch (`f ∝ 1/L`). Length is
  quantised to a just-intonation scale (`SCALE_RATIOS`) so dragging is always
  musical, and lower notes render as physically taller tubes.
- **Idle auto-demo:** ~3s untouched and the flame drifts toward `h = 1/4` and the
  length slowly sweeps the scale — it plays itself until you grab it.

### Visuals (`render.ts`, Canvas2D)

Brushed-copper rails and open-end rings on deep charcoal; a luminous **pressure
standing wave** inside whose lobes track the live audio amplitude (the fundamental
antinode swells at the centre, the octave adds a second lobe); a glowing gauze
with **flame tongues** that lick higher and flicker harder as drive rises; and
**heat-shimmer** streaks rising above the flame. An ember pool warms the tube base.

## Palette

Brushed copper / brass highlights and ember heat-shimmer on deep charcoal —
industrial and warm, deliberately not cosmic-glow-on-black and not
parchment/vellum. State: a meditative fire-drone at the cosmic-ambient pole.

## Safety

No strobe. All fast on-screen motion is *shape* motion (flame-tongue wobble,
shimmer), never a full-screen luminance flip. The only macro-brightness
modulation — the ember glow — is routed through `_shared/psych/safeFlicker`
clamped to ≤3 Hz with a high luminance floor, and it honours
`prefers-reduced-motion` (which also calms the flame/shimmer motion).

## Named references

- **P.L. Rijke** (1859) — the original "singing tube" that spontaneously tones
  when a heated gauze sits in its lower half.
- **Lord Rayleigh** (1878) — the criterion for thermoacoustic instability (heat
  added in phase with rising pressure sustains the vibration), the basis of the
  `sin(2nπh)` driving curve modelled here.

## Honest limitations

- The acoustics are a **phenomenological reduction**, not a CFD/thermoacoustic
  network solve: a two-mode Rayleigh gain curve driving a hand-tuned limit-cycle
  envelope. Real Rijke tubes have nonlinear saturation, hysteresis (the onset and
  extinction heat positions differ), and mode competition that this does not
  simulate. Amplitude saturation here is a fixed ceiling, not an energy balance.
- Pitch is quantised to a scale for playability rather than derived from a true
  `c/2L` with end corrections; the visual tube length is illustrative.
- The standing-wave glow shows the *mode shape* scaled by amplitude; it does not
  render the (inaudibly fast) real oscillation cycle.
- Not verified on real speakers/ears or across browsers — Web Audio node timing
  and the Canvas2D look are unconfirmed on hardware.
