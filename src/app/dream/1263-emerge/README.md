# 1263 · Emerge

**A drug-free psychedelic _journey_ — one ~6-minute stateful arc from stillness,
through ego-dissolution, and softly back — rendered as a vast cloud of GPU
particles that condenses into a "body," dissolves its own boundary into
boundless light at the peak, and re-condenses on the return.**

Press **Begin the journey** and surrender. It runs itself. This is the
**GPU particle / point-cloud** member of a three-builder deep fire: three
prototypes build the same >5-minute stateful psychedelic-journey engine through
three different WebGL rendering approaches. This one is the volumetric one —
~90,000 additive points drawn in a single `gl.POINTS` call, whose FORM most
distinctly escapes flat shader fields.

## The journey arc (the heart — genuinely stateful, >5 min, with memory)

One ~6-minute timeline, five phases. A single global `journey` scalar (0..1 over
the whole run) plus a phase name drives **both** the particle field and the
audio, via eased keyframe tracks — so minute 5 genuinely differs from minute 1;
it evolves, it does not loop.

1. **Onset** (0–15%) — a few sparse teal/indigo motes in a dark void, near-still,
   low entropy. A quiet drone.
2. **Come-up** (15–35%) — particles gather and **condense** into a bounded
   luminous body; color warms; gentle orbital drift; the boundary is crisp.
3. **Peak · breakthrough** (35–60%) — the boundary **dissolves**: the cloud
   expands outward, curl-noise turbulence rises, a second noise octave kicks in,
   particles flow to white-gold light and a center-out radial bloom fills the
   frame (figure/ground merge = non-dual boundary loss). The Shepard ascent and
   entropy climax here.
4. **Plateau** (60–80%) — the dispersed cloud drifts as a warm luminous haze,
   slow emotionally-toned swells.
5. **Return** (80–100%) — particles softly **re-condense** toward a calm centered
   glow; saturation and motion decay; a still luminous hold. Never abrupt.

The current phase name and elapsed/total are always on screen. A **phase
scrubber** and a **Jump to the peak** control let the morning reviewer leap
straight to the dissolution without waiting — the default is the full arc from
the top. The canvas shows a forming luminous body immediately on load (never
blank).

## Subsystems (four integrated)

1. **5-phase stateful arc controller** (`arc.ts`) — one global `journey` + phase
   + eased sub-params (condense, expansion, flowAmp/scale/speed, dissolve,
   warmth, brightness, population, intensity) driving particles _and_ audio.
2. **WebGL2 GPU particle renderer** (`renderer.ts`) — a single additive
   `gl.POINTS` draw of 90k points. Each point carries two persistent,
   deterministically-seeded homes (a tight "body" orb + a wide cloud); the vertex
   shader blends them by `condense`, advects them with **analytic 3D curl-noise
   flow** (robust, no ping-pong textures), pushes them outward on `expansion`,
   gates visibility by `population`, and evolves color teal → neon → white-gold.
   A full-screen radial-glow triangle blooms with the dissolution.
3. **Audio bed slaved to the arc** (`audio.ts`) — built from the shared psych
   toolkit: **Shepard–Risset** ascent intensifying to the peak + **drone bank**
   whose filter opens with intensity + **convolution "void" reverb** whose wet
   mix opens as the boundary dissolves. `(shepard + drone) → bus → voidReverb →
   master(0.35) → DynamicsCompressor limiter → destination`. The music is the
   carrier; it peaks at the visual breakthrough.
4. **Optional mic "neural-gain"** — a louder room/voice deepens the dissolution
   (more turbulence, expansion, glow) once the boundary is soft enough to
   disturb. Degrades gracefully: denied/absent mic → fully self-running.

## Inputs / outputs (tags)

- **INPUT** — self-running long-form (press begin and surrender) + optional mic
  neural-gain. Runs fully without a mic.
- **OUTPUT** — full-screen WebGL2 GPU particle system / point-cloud: a volumetric
  drifting cloud of ~90k additive points. Not a flat 2D fragment-shader pattern.
- **CORE TECHNIQUE** — curl-noise flow-field particle advection with a boundary
  that condenses then dissolves (self-boundary dissolution = ego-dissolution),
  driven by a global 5-phase stateful arc over >5 minutes.
- **PALETTE** — an evolving luminous spectrum: deep teal/indigo → warm saturated
  neon → luminous white-gold → soft return. Additive blending for glow.

## Named references

- **Refik Anadol, _DATALAND — Machine Dreams_** (opened 2026-06-20, The Grand LA)
  — real-time, continuously-evolving, never-looping point-cloud / latent
  immersive field; the reference for both the point-cloud form and the long-form
  stateful quality. Only the formal quality is borrowed — no external/paid AI
  models; the field here is pure seeded curl-noise.
- **Memo Akten** — point-cloud / latent-flow dissolution.
- **Non-dual boundary-dissolution phenomenology** — self/other collapse; a
  particle cloud whose boundary fades to white.

## Safety

- **Photosensitive-epilepsy safe.** No strobe. Luminance changes are smooth and
  slow (≪3 Hz). The optional "breath" toggle routes through the shared
  `SafeFlicker` (default OFF, hard-capped ≤0.6 Hz here, soft sine with a floor),
  and `prefersReducedMotion()` slows all motion and the flow field.
- **Audio** is gesture-gated (Begin), master gain 0.35, behind a
  `DynamicsCompressor` limiter. Mute and an instant **stop** are always available.
- **Full teardown on unmount** — `cancelAnimationFrame`, audio stop + context
  close, GL context lost via `WEBGL_lose_context`, all buffers/programs/VAOs
  deleted.
- **Degrades gracefully** — no WebGL2 → a readable notice; no mic → self-running;
  never blank. DPR capped at 1.6; 90k points hold ~60fps with headroom.

## Files

- `page.tsx` — client component: master loop, controls, HUD, scrubber, mic wiring.
- `arc.ts` — the 5-phase stateful arc controller (pure functions).
- `renderer.ts` — the WebGL2 point-cloud renderer (curl-noise vertex advection).
- `audio.ts` — the arc-slaved Shepard + drone + void-reverb bed.
