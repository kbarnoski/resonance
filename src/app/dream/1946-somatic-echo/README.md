# 1946 · Somatic Echo

**What if your MOVEMENT were the music, and STILLNESS were the reward?**

A drug-free somatic-meditation instrument. Slow, deliberate, present movement is
met with a calm, coherent, luminous field and a warm consonant drone; agitation
makes the world scatter and detune. Over a session it trains you, gently, toward
bodily presence.

## Input — webcam optical flow (no ML / no MediaPipe / no network)

The video is drawn to a hidden 96×72 canvas, downsampled to an 8×6 grid, and
frame-differenced each frame to yield:

- **energy** — total motion, normalised 0..1
- **centroidX / centroidY** — the motion centre of mass
- **per-cell energy** — for the visual field
- **smoothness** — the spine of the piece: an inverse-jerk measure that tracks
  how much the motion *accelerates* frame to frame. Slow, continuous, present
  motion reads as smooth (→1); jerky, fast, agitated motion reads as unsmooth
  (→0). Stillness and smoothness are what the instrument rewards.

### Graceful degrade + headless self-demo

No camera, or permission denied, or `getUserMedia` throws → a **seeded ghost
mover** takes over: a Lissajous "body" that moves agitatedly for ~14 s, then
decelerates over ~8 s to a barely-breathing residual — so the piece self-demos
the entire **agitation → calm → reward** arc on a phone with no camera and no
input. A **"Use demo motion (no camera)"** button forces the same ghost. An
on-screen note (in the `text-destructive` token) makes the fallback explicit.

Everything is deterministic — a `mulberry32` PRNG plus `performance.now()`; no
`Math.random`, no `Date.now`, no argless `new Date()`.

## Audio — additive just-intonation drone (non-pentatonic)

A sustained bed: fundamental ~58 Hz plus JI partials
`[1, 9/8, 5/4, 3/2, 5/3, 15/8, 2]` through a master gain (capped ≤ 0.18,
gesture-gated on Start).

- **smoothness HIGH** → partials lock to their pure JI ratios: a warm,
  sustained, consonant chord.
- **smoothness LOW** → partials detune into roughness / beating and a
  band-passed noise edge fades in — the drone gets anxious.
- **energy** → fades the upper partials in (more voices when you move, but they
  only sound *good* when you are smooth).
- **centroidY** → spectral tilt / filter cutoff (register).
- **centroidX** → stereo pan.
- **reward bloom** → when energy drops low and *stays* low, the master gain
  lifts, the filter opens and the consonant partials brighten — the sound
  resolves. Stillness is audibly the reward.

## Output — THREE.Points body-aura

~3,300 additive `THREE.Points` form a body-aura mandala (deep indigo → violet →
warm gold on near-black). Motion and per-cell energy scatter the points outward
and spin the mandala faster; smoothness and the reward bloom gather them back
into a tight, coherent, slowly-rotating mandala that warms and brightens. Point
size, opacity and luminance all rise as you settle — stillness is visibly the
reward too.

**Safety:** all luminance change is slow drift, never a strobe (well under
3 Hz), and `prefers-reduced-motion` calms the whole field.

## References

- Kantan, Dahl & Spaich, *The Self-Aware Body*, arXiv:2606.14664 (2026) —
  movement→sound biofeedback heightens bodily self-awareness as a gateway to
  somatic / meditative states.
- *Gesture2Music*, arXiv:2511.00793.
- Anna Halprin (movement / presence); Éliane Radigue (sustained JI drone).

## Files

- `page.tsx` — orchestration, UI chrome, RAF loop, full teardown
- `flow.ts` — optical-flow tracker, camera capture, seeded ghost mover
- `audio.ts` — additive JI drone engine
- `field.ts` — three.js `THREE.Points` aura substrate
- `readme-text.ts` — design-notes prose for the in-app overlay
