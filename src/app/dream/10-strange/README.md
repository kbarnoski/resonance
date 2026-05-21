# Strange Attractor — design notes

**Route**: `/dream/10-strange`  
**Cycle**: 10  
**Question**: what if you could hear chaos, not just see it?

## What it is

The Lorenz attractor is a system of three coupled differential equations:

```
dx/dt = σ(y − x)
dy/dt = x(ρ − z) − y
dz/dt = xy − βz
```

With σ=10, ρ=28, β=8/3, the system never repeats — it traces an infinite
non-periodic path shaped like a butterfly. Two trajectories starting a hair
apart diverge exponentially: the definition of chaos.

This prototype renders that trajectory in real time and simultaneously maps
xyz to FM synthesis parameters so you **see and hear** the same chaos.

## Audio mapping

| Attractor | FM parameter | Range |
|-----------|-------------|-------|
| x ∈ [-25, 25] | carrier freq | 110–880 Hz |
| z ∈ [0, 50] | modulation index | 0–8 |
| \|y\| ∈ [0, 30] | modulator ratio | 0.5–3.5× |

FM synthesis: `f_out(t) = sin(2π·f_c·t + I·sin(2π·f_m·t))`

- **x drives pitch**: the attractor spends time in two "wings" — right (x > 0,
  warm orange) and left (x < 0, cool blue). Wing transitions flip pitch across
  A4 (440 Hz). You hear these as jumps every 1–5 seconds.
- **z drives timbre**: near z=0 (bottom), I≈0 — pure sine, almost no harmonics.
  Near z=50 (top), I≈8 — rich, buzzy spectral spread. The attractor mostly
  stays between z=5 and z=45, so you hear the timbre breathe.
- **y drives harmonic ratio**: |y| changes how the modulator frequency relates
  to the carrier. Low |y| = simple integer-ish ratio (smoother sound); high
  |y| = non-integer ratio (beating, rougher texture).

## Mic feedback loop

In mic mode, your RMS amplitude feeds back into σ:

```
σ = 10 + amplitude × 8   →   range [10, 18]
```

At σ=10 (classical), wing transitions happen every 1–5 seconds.  
At σ=18 (loud input), transitions accelerate to every 0.3–1 second.  
The attractor gets "hotter" under loud input — more turbulent pitch jumps.

This is bidirectional: the attractor's behavior changes the sound, and the
sound (your mic input) changes the attractor's behavior.

## Visual design

- **Trail rendering**: last 3000 points, oldest dim, newest bright. Color by
  wing membership (right = warm orange-yellow, left = cool blue-cyan).
- **Projection**: isometric — 35° y-rotation, 15° x-rotation. Shows the
  butterfly shape clearly while maintaining depth.
- **Fade background**: `rgba(6,6,14, 0.2)` per frame — trail persists for
  ~0.8 seconds before fading, giving the figure its ghostly depth.
- **Current position**: white glow dot with soft shadow.

## What to listen for

1. **Wing transitions** — the characteristic pitch jump from low to high (or
   back). These sound like random melody notes — because they are: chaos is
   deterministic but unpredictable.
2. **Timbre breathing** — as z oscillates between the two lobe heights, the
   sound shifts from pure to complex and back. Watch the z readout.
3. **Mic mode**: sing loudly to increase σ and accelerate the chaos. Whisper
   to slow it down. You become part of the dynamical system.

## What's hard / limitations

- At high modulation index (I > 6), aliasing can appear at high carrier
  frequencies. This is the FM "character" — it sounds electronic and chaotic,
  which fits.
- Sub-150 Hz carrier produces FM bass tones that are hard to hear on laptop
  speakers. Headphones or monitors show the full range.
- The attractor occasionally passes close to the unstable fixed point at
  origin (before σ has drawn it away). The ~1000-step warmup before display
  avoids showing the initial transient — the trail starts already chaotic.

## Prototype questions for Karel

- Should the carrier frequency range be narrowed to a single octave (more
  musical) or kept at 3 octaves (more dramatic)?
- Could the attractor parameters (σ/ρ/β) be live-draggable sliders to let
  Karel move between chaotic and non-chaotic regimes?
- Next evolution: route the FM output through the existing fluid sim as the
  audio source — the fluid responds to the attractor's own sound.
