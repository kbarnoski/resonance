# 7816 · MET (renderer A — WebGL2 instanced)

## The one question
**What if the DMT-breakthrough sense of being MET — attended to by autonomous
entities that turn to face you — could be evoked drug-free, on a screen?**

A field of ~2000 autonomous agents lives as a diffuse drifting shimmer. Every
few seconds a moving focus point enters some agents' fields of view; those agents
swing to face it and cohere into a transient symmetric gaze-figure — an
iris/mandala with a bright pupil-cluster on the focus — that holds for ~1.3 s
(the *being-met*), then dissolves back to shimmer.

## The mechanic — a non-reciprocal vision-cone perception swarm
Each agent has a **forward vision cone** (half-angle θ ≈ 112°, radius R). It
perceives *only* the neighbours — and the moving focus point — that fall inside
that cone. Separation / alignment / cohesion are computed over the **visible set
only** (Reynolds-style desired-velocity steering restricted by the cone), plus a
**one-way attraction** toward the focus that fires only when the focus lies
inside the cone.

The asymmetry is the whole point. The agents attend to the focus (the viewer);
the focus cannot attend back. That non-reciprocity is exactly the phenomenology
of *being observed by beings* — you are seen by things that turn toward you, and
your looking does not reach them. This is the Barberis/Peruani-lineage
**vision-cone active matter** (arXiv:2412.19297), not isotropic Reynolds
averaging: perception itself is directional and one-sided, which is what makes
the swarm feel like a population of attending minds rather than a flock.

## The coherence coupling
One **coherence scalar** in `[0,1]` is measured from the actual simulation each
frame — the fraction of agents facing the focus, plus how tightly they cluster on
the pupil — smoothed over time. That single scalar drives **everything at once**:

- the JI drone bed's `setDrive` (it swells as the figure forms),
- the per-event JI **choir voice-swell** (fired on the rising edge through 0.5),
- the sprite brightness/size (agents brighten violet→gold as attention rises),
- the WebGL kaleidoscopic **mandala fold** and pupil glow strength.

So the *sound* of being met and the *sight* of it are literally the same event —
there is no separate audio timeline.

## Technique (renderer A)
- **WebGL2 instanced rendering** — the 2000 agents are additive instanced
  point-sprites (`drawArraysInstanced`) with one dynamic `[x, y, attention]`
  instance buffer uploaded per frame. Positions/headings are stepped on the CPU
  (plain JS sim with a spatial-hash grid; no compute shader required).
- **Ping-pong FBO feedback trail** — the previous frame is sampled and faded,
  agents are drawn on top, buffers swap → the psychedelic smear.
- **Tonemapped bloom + mandala fold** — a composite pass adds a multi-tap bloom,
  a coherence-scaled kaleidoscopic fold around the focus (the symmetric
  gaze-figure), a bright pupil glow, a filmic tonemap, and the SafeFlicker
  luminance multiplier.
- **Canvas2D fallback** — if WebGL2 is unavailable, the same sim renders with
  `globalCompositeOperation = "lighter"`, a translucent-veil trail, and mirrored
  copies around the focus for the figure. A small on-brand notice appears.

## How to use it
- **Autonomous (default):** nothing to touch. A `mulberry32(0x7816)`-seeded focus
  walks a smooth path and the event scheduler cycles gather → met → release →
  drift (~3.6 s), so several "met" events land within the first ~10 seconds on a
  plain desktop with no sensors.
- **Tilt (mobile):** tap **Enable tilt** (iOS `DeviceOrientationEvent`
  permission flow) and lean — your lean becomes the focus the beings turn toward.
- **Begin:** audio is unlocked on the first gesture (Web Audio autoplay policy);
  visuals animate silently before that.

## Safety
Any luminance flicker goes through the shared **SafeFlicker**: OFF by default,
opt-in, hard-capped at 3 Hz, a soft sine drift (never a hard 0↔1 strobe) with a
luminance floor, and an instant **Stop flicker** control. `prefers-reduced-motion`
is honoured — motion is slowed and flicker is forced to a sub-perceptual drift.

## References
- Reynolds 1987 — boids / separation-alignment-cohesion.
- Vision-cone active matter — arXiv:2412.19297 & 2512.18749 (non-reciprocal
  directional perception, spontaneous chiral/gathering states).
- Klüver form constants; Bressloff–Cowan cortical geometry — why a symmetric
  fold around a bright pupil reads as a mandala/iris "being."

## Next-cycle deepening
1. **Per-being independent micro-headings** — give each agent a slow, seeded
   head-scan so cones sweep independently; the field would ripple with attention
   before the figure forms, reading as many separate minds noticing you.
2. **True head-orientation so the figure reads off-axis** — render each sprite as
   an oriented eye/wedge pointing along its heading, so a gaze-figure formed to
   the side still visibly *looks at* the focus rather than merely clustering.
3. **Two-body merge** — introduce a second focus (a second viewer, or a mirrored
   self) and let two gaze-figures form and then merge, coupling their coherence
   scalars into a single louder swell — the meeting of two attentions.
4. **Form-constant fusion (from the `oculus` sibling, cycle 1047)** — feed this
   swarm's REAL per-agent coherence into a Klüver honeycomb log-polar warp
   (`_shared/visionary/logpolar`): as agents cluster they seed cortical-hex cells that
   *bloom into eyes*, so a genuine "hall of eyes" form constant emerges from the
   simulation instead of being scripted onto a fixed grid — being-met-by-MANY,
   honestly.
5. **The blink (from the `witnessed` sibling, cycle 1047)** — render the pupil
   core as a true eyelid-almond that *closes* on release; a legible blink sharpens
   the "it looked at me, then it was gone" read on a 2-second phone glance.
