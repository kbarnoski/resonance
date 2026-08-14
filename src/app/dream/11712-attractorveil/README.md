# 11712-attractorveil

**What if a piece of music slowly reshaped a vast breathing cloud of light-points
flowing along a strange attractor — a cosmic nebula that is genuinely _different_
at minute 5 than at minute 1?**

Tens of thousands of glowing points, advanced entirely on the GPU, stream along a
**Peter de Jong strange-attractor flow field**. A bank of **Voss–McCartney 1/f
(pink-noise)** generators slowly walks the attractor's shape, the veil's density
and palette, and a self-driving ambient drone's harmony over minutes — genuine
long-form with state and memory, never a loop. The nebula at minute five is a
visibly different shape, density, colour balance, and chord than at minute one.

## How to use it

- **On load**, with no sound at all, the nebula is _already_ flowing and slowly
  evolving. This is the muted-phone contract: the visuals run off the seeded 1/f
  swell (`evolution.ts`) against a zero audio envelope, from `performance.now()`
  alone. The living cosmic cloud reads within a second, no tap.
- **Sound the nebula** creates the `AudioContext` (on your click — autoplay-safe)
  and blooms in a self-driving ambient pad. Now the pad's live amplitude and
  spectral brightness feed the veil's glow and flow speed.
- **Design notes** opens a summary of the technique.

All audio is routed through the shared safe master bus (`createSafeMaster`, gain
0.8 before its internal limiter/trims) with a `createVoidReverb` tail for cosmic
depth — never straight to `ctx.destination`. The visuals read `master.analyser`.

## The technique (the reason this piece exists)

### GPU particle system via transform feedback (`gl.ts`)

~80,000 points live in two ping-ponging vertex buffers. Each frame:

1. **Update pass.** An UPDATE vertex program reads buffer A, advances every point
   one step of the flow field, and writes the new state (`position`, `age`, seed)
   into buffer B via `transformFeedbackVaryings` + `beginTransformFeedback`, with
   `RASTERIZER_DISCARD` on (no fragments). Positions accumulate on the GPU; the
   CPU never touches a particle after the initial seeded upload.
2. **Fade pass.** The default framebuffer is `preserveDrawingBuffer`, so a
   translucent deep-indigo quad drawn over it each frame dims the previous frame
   toward the void — leaving glowing streaks where points moved fast.
3. **Render pass.** A RENDER program draws buffer B as small additive glowing
   sprites (`blendFunc(SRC_ALPHA, ONE)`), soft round point sprites.
4. **Swap** the buffers and repeat.

### The strange-attractor flow field

Each point `p` is pushed toward the image of the **Peter de Jong** attractor map:

```
deJong(p) = ( sin(a·p.y) − cos(b·p.x),  sin(c·p.x) − cos(d·p.y) )
```

Taking `v = deJong(p) − p` as a velocity field and integrating
`p += v · flow · dt` traces the attractor's filigree as streaming light — the
**strange-attractor flow-field** technique of tracing particles through an
attractor's vector field. Points fade in on spawn and are **recycled** on a
per-point life (seeded, 2–6.5 s) into a fresh position, so the veil keeps flowing
rather than collapsing onto the fixed manifold. Local flow _speed_ drives each
point's brightness — the streams ignite where the field moves fastest.

### Long-form 1/f evolution — why minute 5 ≠ minute 1 (`evolution.ts`)

A bank of **Voss–McCartney** 1/f generators (one per drifting quantity) walks:

- the four de Jong parameters `a,b,c,d` (the nebula's shape),
- the veil's flow speed, density/exposure, and jade↔rose palette balance,
- the drone's root (a slow, meditative register) and chord (crossfading between
  consonant, hymn-like voicings).

Pink noise has equal energy per octave — its spectrum is dominated by low
frequencies — so every parameter drifts **slowly and organically**, and because
it is a random walk it **never returns** to the same configuration. The walk is
stepped on a **fixed time grid** (0.14 s of the age clock), not per animation
frame, and smootherstep-interpolated between grid samples — so the entire
evolution is a **pure, reproducible function of `age` in seconds**, identical on
any machine at any frame rate. Over five minutes the attractor visibly re-shapes,
the cloud thins and thickens, the palette shifts jade↔rose, and the underlying
chord wanders — with no loop point anywhere.

### Audio → light

The self-driving pad (`audio.ts`) is a bank of continuous oscillator voices whose
frequencies **glide** (never re-trigger) toward the evolving chord, breathing with
the same 1/f swell. Its live amplitude lifts the point brightness and quickens the
flow; its spectral centroid nudges the jade↔rose balance. Palette lives only
inside `gl.ts`: **cool pale-aurora — jade + rose-quartz over deep indigo.** No
violet, no cyan/teal, no warm-gold, no magenta.

### References

- **Peter de Jong** attractor map; **Clifford Pickover**, _Computers, Pattern,
  Chaos and Beauty_ — the lineage of strange-attractor imagery this draws on.
- The **strange-attractor flow-field** technique — tracing particles through an
  attractor's vector field to render it as streaming light (as popularised by
  Keith Peters / BIT-101).
- The **Voss–McCartney** algorithm for 1/f "pink" noise (Richard F. Voss;
  popularised by James McCartney) — a sum of white-noise sources refreshed at
  octave-spaced rates, giving equal energy per octave.

## Determinism & safety

- No `Math.random()`, no `Date.now()`, no argless `new Date()` anywhere — all
  randomness is `mulberry32(SEED)` (`prng.ts`); all time is `performance.now()`
  (the age clock). Every visit grows the same nebula through the same evolution.
- **Photosensitive safety:** cosmic-ambient by nature — no strobe or flicker;
  luminance drifts slowly via the 1/f swell, far below the danger band.
  `prefersReducedMotion()` slows the stream and removes fast brightness change.
- Full teardown on unmount: cancel rAF, stop + disconnect the voice bank,
  `master.disconnect()`, `ctx.close()`, and delete every GL program, buffer, VAO,
  and the transform-feedback object.
- Degrades gracefully: no WebGL2 / no transform feedback → an on-brand notice, no
  throw; blocked audio → the nebula keeps evolving silently. No network calls, no
  new dependencies, no API route.

## Files

- `page.tsx` — React glue, chrome, the always-on evolving render loop, gesture
  handling, the muted-phone self-demo wiring.
- `gl.ts` — the WebGL2 transform-feedback particle system: de Jong attractor flow
  field, ping-pong update, fade-trail + additive aurora render.
- `audio.ts` — `VeilAudio`: safe-master + void-reverb routing, the gliding
  continuous drone pad, analyser features (amplitude + spectral centroid),
  teardown.
- `evolution.ts` — the Voss–McCartney 1/f generators and the long-form driver
  that walks the attractor params + harmony as a pure function of the age clock.
- `prng.ts` — `mulberry32`, seed, math helpers.

## What a next cycle could deepen

- **3D projection** — swap the 2D de Jong map for a Lorenz or Thomas system
  integrated in 3D and projected, with depth cueing the glow.
- **Curl-warped field** — add a slow curl-noise perturbation to the flow so the
  filaments braid as well as stream.
- **Harmony-locked shape drift** — bias the attractor parameter walk toward the
  current chord's tension so shape and sound move as one gesture.
- **Multi-scale trails** — a second, dimmer long-decay accumulation buffer for
  ghost trails minutes deep, making the memory of the evolution visible.
