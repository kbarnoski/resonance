# BODYCAST — your body is the spatial mixing stage for Karel's piano

**Status:** demoable

Route: `/dream/17408-bodycast`

## The one question

_What if your whole body became the spatial mixing stage for one of Karel's solo
piano takes — where each register of the music (bass / low-mid / high-mid /
treble) casts a visible **beam of light** from a part of your body out into the
room, and you physically sculpt **where** his music comes from by reaching,
spreading and lifting?_

This is an embodied full-body instrument. A webcam tracks your pose (MediaPipe
Pose, loaded from CDN at runtime) and that motion drives both the visuals and the
spatialization of the audio as close to real-time as the control path allows. The
sound is **always Karel's real catalog take** — never synthesized. Your body only
decides where in the room each voice of it radiates from.

## Audio architecture

One looping `AudioBufferSourceNode` of the chosen take (default: Welcome Home —
"Bath") is the single source, so every register voice stays phase-aligned. It is
split into four parallel register voices:

- **bass** — lowpass ~180 Hz
- **low-mid** — bandpass ~380 Hz, Q 1
- **high-mid** — bandpass ~1100 Hz, Q 1
- **treble** — highpass ~2200 Hz

Each voice runs `source → BiquadFilter → GainNode → PannerNode (HRTF, inverse
distance, refDistance 1) → safeMaster.input`. A passive `AnalyserNode` tap off
each gain node reads that voice's live level for the visuals. The listener sits at
the origin; every voice's PannerNode is positioned in 3D from its body region.
All gain and position changes are smoothed with `setTargetAtTime(…, 0.12)` —
latency is the craft, so the detect → map → audio path stays synchronous with no
async hops. Nothing touches `ctx.destination` directly; the whole graph terminates
at `createSafeMaster`.

## Pose → spatial mapping (the instrument)

Few, legible, immediate:

1. **Arm span** (wrist-to-wrist distance) → spatial **width**. Arms in ⇒ all four
   panners collapse toward x ≈ 0, an intimate near-mono in front of you. Arms wide
   ⇒ voices fan out across x, treble farthest out, bass nearest centre.
2. **Each wrist height** → lifts and swells the voices on that side. Left wrist up
   raises + swells bass and low-mid; right wrist up raises + swells high-mid and
   treble.
3. **Torso lean** (shoulder-mid minus hip-mid) → rotates the whole field's azimuth
   as a pan bias added to every voice.
4. **Body presence** (shoulder width / nearness) → the master trim, so leaning in
   fills the room and stepping back softens it.

There is no forced "resolve" or chord-lock mechanic — the reward is the physical
act of sculpting his sound in space.

## Visual

A charcoal stage. The body is a thin **luminous line-figure** (glowing amber bone
segments + joint sparks). From four body anchors — hips (bass), left wrist
(low-mid), right wrist (high-mid), head (treble) — a volumetric, additively
blended **beam** is cast out toward that voice's 3D position in the room, ending in
a glowing orb. Each beam's **length and brightness is that register's live level**,
its **direction is where you've placed the voice** — theatrical stage lighting,
the sound made visible in space. Palette is warm/neutral: charcoal stage, amber and
gold beams, near-white cores at peaks. No cool-blue field, no film grain.

When there is no camera (or tracking/permission fails), an autonomous **ghost
body** sways and breathes through the same mapping so the piece looks alive on a
muted glance, with a notice that it's the demo body. Camera playback is the
secondary layer, offered after Play; the webcam stays on-device.

## Named reference

Inverts **"Sounding Bodies: Modeling 3D Spatial Sound of Humans Using Body Pose
and Audio" (arXiv:2311.06285)** — that work models the 3D spatial sound a human
radiates _from their body pose_; here the performer's pose instead determines
where each voice of Karel's take radiates from. It also nods to **Myron Krueger's
_Videoplace_ (1974)** for full-body interaction, and to stage-lighting design.

## What I'd deepen next

- A short predictive lead on the panner positions (extrapolate wrist velocity) to
  shave perceived latency further.
- Per-voice reverb sends scaled by beam distance, so a voice thrown to the far wall
  also sounds farther, not just quieter.
- A subtle floor reflection of each beam to strengthen the "room" read.
- Elbow-driven beam curvature so the beam bends through the arm, not just a
  straight cast from the anchor.

### Folded from the sibling exploration (`limbchoir`, banked cycle 1246)

Bodycast's parallel approach rendered the same instrument as a **volumetric
particle body** with four glowing voice-orbs instead of cast beams. Two of its
ideas are worth pulling in on a later cycle:

- **A convolution reverb whose room size follows arm span** — spreading the arms
  doesn't just fan the panners wider, it physically enlarges the space, so the
  take breathes into a bigger room as you open up.
- **A warm particle aura around each beam's origin joint** (ember→amber→gold→
  near-white ramp) so the body reads as light-made, not a bare stick-figure —
  the particle-body aesthetic as a texture layer under the beams, not instead of
  them.
