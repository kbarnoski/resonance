# 3328 · Mirror Hall

## The one question

**What if you could sculpt a room's SHAPE with your hands and hear your piano
rendered through the exact early reflections that geometry actually produces —
and hear a flutter echo appear the instant two walls go parallel?**

Mirror Hall is a physically-grounded acoustic sandbox, not a visionary shader.
The screen is a calm top-down architect's plan (a radar); the *piece* is the
sound. You drag the corners of a room, drag the source **S** and listener **L**,
and hear a dry Karplus-Strong piano phrase re-rendered through the room's real
early-reflection field. Make the walls parallel and hard and it rings with a
metallic flutter echo — the sound of a mistake you can hear.

## The acoustics are real: the image-source method

The reverberation is computed with the **image-source method** — the small-room
acoustics technique introduced by **Allen & Berkley (1979), "Image method for
efficiently simulating small-room acoustics"** (*JASA* 65(4)) — implemented here
in 2D:

1. The room is a polygon (a draggable quadrilateral). A source **S** and
   listener **L** sit inside.
2. **Mirror the source across every wall** to get first-order image sources —
   virtual sources sitting "behind" each wall. Recurse: mirror those images
   across the other walls for 2nd- and 3rd-order images. This is the *hall of
   mirrors*, drawn on the radar as ghost dots outside the walls.
3. **Validity test (the part that makes it correct, not a naive echo grid):**
   for each candidate image we reconstruct its specular ray path by walking from
   the listener back through the reflecting walls in reverse order. The image is
   kept **only if** every reflection point actually lands on its wall *segment*
   and no other wall blocks the path. Invalid images are pruned.
4. Each surviving image contributes **one impulse-response tap**:
   `delay = pathLength / c` with `c = 343 m/s`, and
   `gain = (per-wall reflection coefficient)^order / pathLength`. The direct
   sound (order 0) is the straight S→L path.
5. The taps are assembled into a short mono **AudioBuffer** (≈0.6 s) — the
   room's impulse response — which drives a Web Audio **ConvolverNode**. The IR
   is rebuilt (debounced) whenever the geometry, S, L, or absorption changes, so
   the sound morphs live while a looped phrase plays.

`computeAcoustics()` in `acoustics.ts` is the whole DSP core; it is hand-rolled
(no Tone.js, no reverb library) and unit-sane (validated taps, sane delays: a
5.4 m direct path → 15.7 ms, first reflection → 22 ms).

## How the flutter echo emerges

A flutter echo is the buzzy metallic ring you get between two **parallel,
reflective** walls: the source and its higher-order images line up into an
equally-spaced train of reflections whose period is `2·d / c` (d = wall
separation). That periodicity *is* the flutter.

Because it comes straight from parallelism, the risk read-out is grounded in the
geometry you drag: for each opposing wall pair we measure how parallel the walls
are, scaled by how reflective they are (the absorption slider) and how far apart
they sit. A plain rectangle has two perfectly parallel pairs, so it flutters —
which is exactly why real studios splay their walls. Splay the walls or soften
them and the train breaks up; the read-out drops from **flutter → coloration →
clean bloom**, and the reported flutter frequency (`1000 / periodMs` Hz) is the
pitch of the ring. Stakes = geometry you can get wrong.

## Subsystems

| File | Role |
|------|------|
| `acoustics.ts` | Image-source engine: mirroring, path reconstruction/validation, IR taps, flutter diagnosis. |
| `synth.ts` | IR builder (taps → AudioBuffer, fractional-delay deposit + peak normalise) and the dry **Karplus-Strong** plucked-string phrase. |
| `viz.ts` | Canvas2D radar: room polygon, corner handles, S/L, ghost image sources, reflection ray paths, travelling energy pips. |
| `page.tsx` | React orchestration: geometry state, pointer dragging, audio graph (source → convolver → master), animation loop, readouts, design-notes modal. |

**Energy pips:** when the phrase plays, a pip travels along each reflection ray,
arriving at its tap's delay — so you *see* the reflections arrive as you *hear*
them. Real early-reflection delays are only milliseconds, so the pips are slowed
by a fixed visual factor (proportional to the true delays) purely for
legibility.

Everything is client-side. No API route, no mic requirement, degrades
gracefully (no WebGL, no external deps).

## Next-cycle deepening

1. **Frequency-dependent walls.** Give each wall a material (its own absorption
   spectrum) and filter each tap accordingly — carpet kills highs, glass keeps
   them — so the room has a *timbre*, not just a decay time.
2. **Diffusion & a late tail.** The image-source method is exact for early
   specular reflections but explodes past order 3; hand off to a
   feedback-delay-network late reverb seeded by the room volume, for a full RT60
   tail that blends with the physical early field.
3. **A "tune the room" goal loop.** Score the room on flutter risk + early-
   reflection evenness and challenge the visitor to hit a target (a vocal booth,
   a live chamber, a diffuse hall), turning the sandbox into a small puzzle.
