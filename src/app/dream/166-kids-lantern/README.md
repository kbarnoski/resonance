# Night Garden — design notes

**For**: kids (3+) · **Slug**: `166-kids-lantern` · **Cycle**: 194

## The idea

Sixteen pentatonic stars are hidden in a near-black canvas — barely visible as faint twinkling dots.
Hold your finger anywhere and a warm amber lantern follows your touch. Stars within the lantern's radius
glow fully and play their notes (triangle waves, C-major pentatonic C3–A4). Move slowly: you hear
individual notes rise as the lantern approaches them. Move broadly: you sweep across several stars
and hear an arpeggiated chord.

**First kids prototype about exploration and revelation.** All 165 prior prototypes respond to
explicit gesture: tap, draw, drag, hold a target. Night Garden has no tap targets — the whole canvas
is one continuous gesture field. The child doesn't "play" the stars; the lantern finds them. A 3yo
holding their finger still discovers that moving it slightly left reveals a new sound. An older child
purposefully hunts for the next star. Same mechanics, different intent levels.

## Interaction modes

- **Hold still** → hear the notes of nearby stars as a sustained chord
- **Slow sweep** → arpeggiate stars one by one as the lantern passes
- **Full-canvas drag** → a musical journey through all 16 notes in sequence
- **Lift finger** → stars fade back to near-invisible twinkle; ambient pad continues

## Audio design

- 16 `OscillatorNode(triangle)` instances, one per star, started at gain=0
- Master `GainNode(0.12)` prevents clipping when many stars are lit simultaneously
- Proximity-to-lantern → quadratic gain ramp via `setTargetAtTime(τ=0.06s)` → silky smooth
- Ambient pad: C3 + G3 sine at gain 0.04 each — the "nighttime hum" that keeps the canvas
  from feeling silent before first touch
- All pentatonic: C3 E3 G3 A3 C4 E4 G4 A4 cycling across 16 stars → no dissonance possible

## Visual design

- Near-black background (#020208)
- Stars: 5-pointed path, outer radius 5–19px (CSS), inner 40% of outer
- Each star color from the standard hue palette (violet=C3, emerald=E3, amber=G3, rose=A3, cyan=C4...)
- At full glow: `shadowBlur=34`, very bright halo
- At rest: `alpha≈0.03–0.045`, barely visible but present — the canvas isn't all-black
- Lantern: radial gradient from `rgba(255,210,90,0.28)` center to transparent edge + inner hot core
- Quadratic falloff (t²) for both glow and audio: feels like true light physics

## Polish ideas

- **Multi-touch**: each finger gets its own lantern (up to 3 simultaneous light sources)
- **Star drift**: stars very slowly drift (0.01 px/frame) so their positions shift across long sessions
- **Breath pulse**: while star is at full glow, add ±0.5px radius oscillation at its pitch frequency
- **Note name flash**: brief text label appears at the star center when it first reaches full glow
- **Darker variant**: `LANTERN_FRAC = 0.20` for a more challenging "narrow beam" mode for older kids
