# Frost Garden (874-kids-frost-garden)

## The question
What if a 4-year-old could grow a glowing magic coral / frost-tree just by
touching the dark screen — luminous branches creep outward on their own, and
every new sparkle-tip rings a soft chime — a calm, endless bedtime garden of
light?

## How it works
The novelty is a **genuine Diffusion-Limited Aggregation (DLA)** simulation, not
a faked branching tree.

- Many "walker" particles random-walk across a coarse 256×256 CPU lattice
  (`dla.ts`). A pool of ~420 walkers is kept alive each frame.
- When a walker steps adjacent to the frozen aggregate, it **sticks
  irreversibly**, becoming part of the structure, and a fresh walker respawns
  from a lattice edge or near a seed.
- This local-sticking rule is the whole trick: it spontaneously produces a
  branched, scale-invariant, dendritic / coral / frost shape — the same growth
  family as frost-on-glass, coral, and lightning.
- On Start, one seed sits at the bottom-center and begins growing immediately —
  the screen is never dead.
- A child **taps/drags** anywhere to plant a new glowing seed (a new sticking
  site) AND bias nearby walkers to drift toward the finger, so branches reach
  toward where the child touches. Multiple seeds grow multiple colonies that can
  merge.
- Aggregate points are capped at 6000 and the oldest are auto-thinned so it
  never stalls; a slow idle "drip" keeps the garden changing during inactivity,
  so minute 5 ≠ minute 1.

### Rendering (`gl.ts`)
Raw **WebGL2 / GLSL ES 3.00**, no libraries, no Canvas2D as the primary surface.
The aggregate tips and the free walkers are drawn as additive `gl.POINTS`
(`SRC_ALPHA, ONE` blending, soft exponential falloff in the fragment shader)
over a deep-dusk gradient. Tip color is chosen by height: deep indigo → teal →
soft gold on near-black. Freshly-stuck tips briefly flash brighter.

### Audio (`audio.ts`)
Web Audio synth only — no samples, no network.
- Each newly-stuck tip fires a soft bell/marimba chime; pitch comes from a warm
  **C-major pentatonic** chosen by the tip's height (higher tips = higher
  notes), so there are no wrong notes. Chimes are rate-limited via a token
  bucket (~8/sec) and the highest few new tips are picked, so dense growth stays
  gentle.
- A warm sustained drone (C2 + G2 + C3) is on from Start and gently opens up as
  the garden fills (busier garden = fuller pad). It is never silent.

#### Kids-safe output chain (exact shape)
```
every voice -> masterGain (0.26)
            -> BiquadFilter lowpass (6000 Hz, <= 6500)
            -> DynamicsCompressor(threshold -10, ratio 20:1)
            -> destination
```
Soft attacks (>= 45 ms), peaks well under master. The AnalyserNode is tapped
OFF the master and is never routed to destination.

## Degradation & robustness
- **No WebGL2:** a `text-rose-300` notice appears and audio keeps playing.
- **Hands-free auto-demo:** if untouched for ~1.5 s after Start, the garden
  plants seeds on its own, so it visibly grows and chimes within ~1 s with zero
  interaction (a glance both sees and hears it).
- **iOS gesture gate:** the AudioContext is created/resumed only inside the
  first Start tap (a 72px button).
- **Full teardown** on unmount: cancels rAF, stops oscillators, closes the
  AudioContext, deletes the GL program/buffers/VAOs and calls
  `WEBGL_lose_context`.

## Named reference
Witten, T. A., & Sander, L. M. (1981). "Diffusion-Limited Aggregation, a
Kinetic Critical Phenomenon." *Physical Review Letters*, 47(19), 1400–1403.
Visual lineage: frost-on-glass, coral, and lightning growth.

## Ambition-floor self-assessment
- **DLA realness:** High. This is a true walker/sticking lattice DLA, producing
  emergent dendritic structure; growth, branching, and merging arise from the
  rule, not from scripted geometry.
- **Calm-bedtime feel:** High. Pentatonic-only chimes, rate-limiting, a
  low-passed compressed chain at modest gain, and an always-on drone keep it
  gentle and endless.
- **Auto-demo / fallback robustness:** High. Auto-seeding guarantees motion +
  sound hands-free within ~1 s, and the WebGL2 fallback preserves audio with a
  clear notice.
