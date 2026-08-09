# 4808 · Effigy

**The one question:** *What if your whole moving body were the resonator — 33
full-body pose landmarks tuning a live chord and igniting a visionary
particle-body, a drug-free embodiment toward an ecstatic / altered state?*

Effigy makes the whole dancing figure the instrument. Not a hand, not a face —
your entire body. MediaPipe **PoseLandmarker** reads 33 landmarks; those drive
**both** a continuous resonant chord (Web Audio) and a **three.js particle-body**
of ~15,000 additive points that gather to your skeleton when you're still and
melt into liquid light when you move. Motion energy is the master intensity that
drives the swell of the sound and the melt of the light together.

## How to use it

1. Open the piece. The **seeded dancer** is already moving and sculpting the
   particle-body — nothing is static.
2. Press **Start sound** (required by browser autoplay policy) to bring the
   chord in.
3. Press **Enable camera — become the effigy** (a separate, explicit opt-in) to
   let your own body take over. The badge flips from *seeded dancer* to *you*.
4. Stand in view of the camera and **move**:
   - **Raise your arms / stand tall** → the chord's root climbs and its third
     slides minor → major (brighter).
   - **Spread your limbs wide** → the upper chord extensions bloom in.
   - **Dance / build motion energy** → the FM timbre ignites, the whole mix
     swells, a sub reinforces underneath, an ecstatic "breath" band opens, and
     the particle-body scatters into smeared trails of light.
   - **Lean side to side** → the chord pans.
   - **Go still** → the cloud gathers back into a luminous effigy of your body.

No camera, denied permission, offline model, or no WebGL? It **degrades
gracefully**: a deterministic seeded dancer keeps driving the exact same synth +
particle pipeline (a calm sway sweeping into an overhead ecstatic peak and back),
so the whole idea reads — sound and vision — with zero devices. If WebGL is
missing the skeleton is drawn full-bleed on a 2D canvas and the chord still plays.

## How it works

**Input — pose features.** Each frame the 33 landmarks are reduced to continuous
scalars in `pose.ts`: `posture` (raised arms + tall stance), `spread` (wrist +
ankle span, torso-normalised), `verticality`, `tilt` (lateral lean / shoulder
slope), and the master `motion` — smoothed mean frame-to-frame joint velocity,
normalised by torso length so it's scale-free.

**Output A — the resonant chord (`synth.ts`).** A 6-partial voicing (root · 3rd ·
5th · octave · 10th · 12th), each partial a 2-operator FM pair, through a soft
lowpass and limiter. `posture` maps to the root frequency by a plain exponential
glide (never quantised to a scale — protected). `verticality` slides the third
minor → major and opens the lowpass. `spread` blooms the upper extensions.
`motion` is the intensity: it climbs the FM index, swells the master gain,
reinforces a sub oscillator and opens a band-passed "breath". `tilt` pans.

**Output B — the particle-body (`particles.ts`).** ~15k additive `THREE.Points`.
Each point is permanently bound (seeded) to one bone of the skeleton, sampling a
fraction along its length, or is free ambient dust. Every frame it springs toward
its bone target with a stiffness that **falls** as motion rises, while a cheap
curl-ish flow field pushes it out with a force that **rises** with motion — so
stillness gathers the effigy and motion melts it. Afterimage trails are produced
by not clearing the frame buffer: a translucent violet fade quad dims the
previous frame, and the trail lengthens as motion rises. Colour is a
violet → magenta vertical ramp (legs deep, hands bright), drawn only from the
shared `_shared/palette` violet ramp.

**Graceful degrade / determinism.** `demo.ts` is a deterministic articulated
dancer built on `mulberry32(0x4808)` + `performance.now()` — no `Math.random`,
no `Date.now`. It emits the same 33-landmark shape as the camera path, so one
pipeline serves both. The first real detected body takes over automatically.

**Safety (photosensitive epilepsy).** Luminance drift is slow and smooth — a
~0.22 Hz breath plus the already-smoothed motion energy — never a strobe.
`prefers-reduced-motion` lowers the particle count, the turbulence and the trail
length.

## Files

- `page.tsx` — client component: three.js renderer + fade-trail scenes, the main
  loop, camera/audio start gestures, HUD skeleton, controls, design-notes modal,
  full teardown.
- `pose.ts` — CDN PoseLandmarker loader, landmark indices, bone list, and the
  feature tracker (landmarks → `PoseFrame` + world points).
- `synth.ts` — the continuous resonant FM chord synth.
- `particles.ts` — the three.js particle-body.
- `demo.ts` — the seeded synthetic dancer (headless self-demo).
- `rng.ts`, `noise.ts` — deterministic PRNG + phase-seeded pseudo-noise.

## Design notes

The whole moving body as a resonator: 33 full-body pose landmarks tune a live
chord and ignite a visionary particle-body — a drug-free route toward an
ecstatic, altered state. Posture picks the root and the chord's quality; limb
spread and verticality open extensions, brightness and FM index; motion energy is
the master intensity that both melts the visuals and swells the sound. The
particle-body gathers to the skeleton in stillness and scatters into afterimage
trails with motion. Everything degrades to a deterministic seeded dancer so the
idea reads with no camera and no WebGL.

## References

- **DiscoForcing** (arXiv:2605.28491, May 2026) — real-time **audio→body** motion
  synthesis. Effigy **inverts** it: the mapping runs **body→audio**, the moving
  body writing the chord instead of the audio driving the body.
- **Marco Donnarumma, *Corpus Nil*** — the body as instrument; a violent,
  intimate human-machine ritual where physiology becomes sound.
- **Daniel Rozin's mechanical mirrors** — your silhouette becomes the medium; the
  viewer's own body is the image and the material.
