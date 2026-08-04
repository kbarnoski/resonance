# 6296 · Flowbody

An embodied camera instrument. You conduct a live violet soundscape with the raw
**motion** of your body in front of the webcam — no keys, no touch, no
pose/hand model. Dense optical flow is the only input, and that motion field
drives both the audio and the light in real time.

## The question

> What if you conducted a live spatial soundscape with the raw MOTION of your
> body in front of the webcam — no keys, no touch, no pose-model, just the flow
> of movement itself becoming sound and light?

This is a *played instrument* for live performance: quick, low-latency,
gestural. Deliberately **not** a calm transcendent meditation world, and
deliberately **not** a fullscreen cosmic tunnel — it is an instrument mirror
whose glowing wakes read as "my movement paints light and sound."

## How the optical flow works

Every frame:

1. The webcam feed (`getUserMedia({ video })`) is drawn — **mirrored** for a
   selfie view — into a tiny `64×48` offscreen canvas.
2. For each cell we read grayscale luminance and compute a **Lucas-Kanade-lite**
   optical flow: the temporal difference `It` (this frame minus last) against
   the local spatial gradient `(Ix, Iy)`, giving a coarse motion **vector**
   `v ≈ -It · (Ix, Iy) / (Ix² + Iy² + ε)` plus a magnitude from `|It|`. This is
   cheap, believable, and responsive — not textbook Horn–Schunck, but it reads
   clearly as "where and how fast pixels are moving."
3. The field is packed into an `RGBA` byte texture (`RG` = velocity centred at
   0.5, `B` = magnitude) and uploaded to the GPU each frame.
4. From the field we derive three scalars the audio uses: the **horizontal
   motion centroid**, the **vertical position** of motion, and the **total
   energy**.

### No-camera fallback (first-class)

If permission is denied or there is no camera, three **drifting flow-blobs**
wander the same grid — each contributes a Gaussian magnitude and its own
velocity direction — so the piece is fully musical and gorgeous on load with
zero permission. A visible **Use camera** button (re)requests the real sensor at
any time; a failed request surfaces a `text-destructive` notice and keeps
performing on the synthetic field.

## Audio mapping (Web Audio, fully synthesized — no samples)

Borrowing the I3D 2026 finding that optical-flow motion reads as movement when
encoded as **stereo position + temporal pattern**, applied here as an
instrument rather than a comfort cue:

- **Left/right motion centroid → stereo pan** (`StereoPannerNode`) of a warm,
  detuned three-oscillator pad (unison saws + a sub sine).
- **Vertical position → pitch**, quantised to an **A-minor pentatonic** scale so
  it is always consonant — top of frame is high, bottom is low.
- **Total motion energy → brightness + swell**: it opens the pad and master
  lowpass filters and raises the gain.
- **Fast gestures → plucked grains**: bright triangle plucks with a quick
  decay envelope, panned to the motion centroid, their density scaling with
  energy — slow drifts sustain the pad, fast swipes scatter transients.
- A **feedback delay** (delay → lowpass → feedback) adds warm space. No harsh
  noise anywhere; the instrument is always musical.

## Visual output (WebGL2 primary, Canvas2D fallback)

A GPU **feedback / echo buffer** (two ping-ponged `RGBA8` textures at `512×384`)
**advects** a luminance field along the motion vectors each frame, with gentle
diffusion and decay, so gestures leave glowing wakes that trail and bloom. A
display pass maps the accumulated glow onto a **violet ramp** (deep violet-black
→ violet-500 brand → violet highlight) with a soft vignette. If WebGL2 is
unavailable, a Canvas2D path draws the same motion field as fading, additive
glowing cells smeared along their vectors, with a `text-muted-foreground`
notice.

## Named references

- **Myron Krueger, *Videoplace* (1985)** — the seminal full-body
  camera-as-instrument work. Flowbody is its browser descendant.
- **Bao, Wang, Wen & Wünsche, "Optical Flow-Based Anticipatory Audio Cues for
  Cybersickness Mitigation," I3D 2026** (13–15 May 2026),
  DOI [10.1145/3804502](https://doi.org/10.1145/3804502) — the finding that
  optical-flow motion, encoded as **stereo position + temporal pattern**, reads
  clearly as movement in sound. Flowbody applies that mapping as an instrument.

## What I'd deepen next cycle

- **Multi-scale flow** (an image pyramid) so large slow sweeps and small fast
  flicks are both captured well, instead of one fixed grid.
- **Directional harmony**: let horizontal vs. vertical flow choose chord colour
  or voicing, not just pan and single-note pitch.
- **Curl / divergence** of the flow field to distinguish swirling from
  approaching motion, driving reverb size or a shimmer voice.
- **Per-region voices** so the left and right halves of the body play different
  timbres — closer to *Videoplace*'s spatial call-and-response.
- **RGBA16F feedback** (behind an `EXT_color_buffer_float` check) for smoother,
  higher-dynamic-range trails where supported.
