# /dream/9-reaction-diffusion — Gray-Scott Reaction Diffusion

**Question**: what if the visualizer grew like coral or fingerprints in response to sound?

## What it is

A GPU-accelerated Gray-Scott reaction-diffusion simulation. Two virtual chemicals
interact across a 256×256 grid:

- **U** (substrate): replenished continuously by the feed rate `f`
- **V** (activator): consumes U via an autocatalytic reaction (UV² → 3V), killed by rate `k`

The equations:
```
dU/dt = Du∇²U - UV² + f(1-U)
dV/dt = Dv∇²V + UV² - (f+k)V
```

Where Du=0.21, Dv=0.105 (U diffuses twice as fast as V — this asymmetry drives instability).

Different `(f, k)` values produce qualitatively different pattern families:
- **Coral** (f=0.0545, k=0.062): branching tree-like structures
- **Fingerprint** (f=0.037, k=0.060): whorls and print-like ridges
- **Spots** (f=0.035, k=0.065): isolated circular colonies
- **Stripes** (f=0.060, k=0.062): labyrinthine Turing stripes
- **Mitosis** (f=0.028, k=0.053): dividing spots that split like cells
- **Maze** (f=0.030, k=0.0565): connected maze-like walls

## Audio integration

- **Bass** (sub-bass + bass bands) → raises feed rate `f` by up to +0.012
  → more activation energy → denser, more energetic patterns
- **Treble** (high-mid + high bands) → raises kill rate `k` by up to +0.008
  → patterns erode faster, structures become more isolated
- **Onset** (percussive hit) → injects a V-blob at a random position (1.5s refractory)
  → watch a new colony seed and grow from nothing mid-song
- **Click canvas** → manual injection at cursor position

The audio modulation is subtle by design. Too much `f` shift can collapse the pattern
to a uniform state; too much `k` can erase it entirely. The sweet spot is exactly at
the edge of instability — which is where music lives too.

## Demo mode

6 sine oscillators at 40/125/350/1k/3k/10kHz play softly. Parameters drift sinusoidally.
An auto-injection fires every ~6 seconds so the pattern never fully stagnates.

## Technical notes

- WebGL2 + EXT_color_buffer_float (Chrome 56+, Firefox 51+, Safari 15+)
- 256×256 RGBA32F ping-pong textures. 8 RD steps per animation frame → ~480 steps/sec at 60fps
- 9-point Laplacian (center=-1, cardinal=0.2, diagonal=0.05) for isotropy
- REPEAT wrapping → toroidal boundary (no edge artifacts)
- 600 warmup steps on init so pattern is visible immediately
- Display shader: deep indigo → teal → white-hot mapped to V concentration

## What surprised me

Switching presets mid-run produces dramatic transitions — the existing structure
either dissolves toward the new attractor or accelerates toward it. Coral → Spots
dissolves the branches into isolated colonies. Stripes → Mitosis is particularly
striking: stripes start pinching off into dividing spots in real time.

The audio connection is real but requires a track with clear dynamic range to feel it.
Try a track with distinct bass drops and high-hat patterns — the feed/kill interplay
creates different textures for heavy vs. bright passages.
