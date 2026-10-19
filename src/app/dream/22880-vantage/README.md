# 22880-vantage

**Status**: demoable

## What this is

Karel's one piano take, exploded into a **swarm of sound-bodies** orbiting you
in 3-D. His single recording loops pitch-clean and is split into five parallel
band voices (sub, low-mid, mid, high-mid, air); each voice is pinned to a fixed
point on a ring/shell around you and panned binaurally with an HRTF
`PannerNode`. Your **head position** — tracked by the webcam, or steered by the
mouse — is your **vantage point** inside the swarm. As you lean and turn, every
voice sweeps from one ear to the other and near-to-far, and the same motion
re-projects a raw-WebGL2 GPU particle field so the thing you hear move is the
thing you see move.

## Control mapping (head / pointer → vantage → HRTF + particles)

The listener's vantage is three numbers, driven identically by face landmarks or
by the pointer, then smoothed (~0.12s) and used for **both** the Web Audio
`AudioListener` and the WebGL view matrix:

| Vantage | Head (FaceLandmarker) | Pointer / keys | Audible consequence | Visible consequence |
| --- | --- | --- | --- | --- |
| **strafe x** | nose-tip x (mirrored) | mouse x / drag | field pans ear-to-ear (HRTF azimuth) | swarm slides across your view |
| **depth** | inter-ocular distance (lean in = bigger) | mouse y (up = in) / ↑ ↓ | lean in → voices pull near (distance gain up) + hall dries; lean back → wide hall | clusters grow / recede as you move into the field |
| **yaw** | nose offset between eye corners | ← → arrows | field rotates around you (voices swing between ears) | whole swarm revolves |

- **INPUT**: MediaPipe `FaceLandmarker` (VIDEO mode, 468 landmarks) via the
  shared `cameraTracking` loader — a different sensor than hand-over-cursor.
  Landmarks used: 1 (nose tip) for strafe, 33/263 (outer eye corners) for the
  inter-ocular depth proxy and yaw. Pointer-first fallback drives the exact same
  vantage.
- **OUTPUT**: raw WebGL2 GPGPU particle swarm — ~30k points whose position +
  velocity are advanced on the GPU each frame by **transform feedback**
  (ping-ponged `SEPARATE_ATTRIBS` buffers), drawn as additive `gl.POINTS`,
  sized by distance, coloured by voice, brightened by per-voice level. No
  three.js, no Canvas2D.
- **TECHNIQUE**: HRTF binaural spatialization (`PannerNode`,
  `panningModel:"HRTF"`, `distanceModel:"inverse"`) of his real take split into
  five spatial voices; the `AudioListener` position/orientation is the tracked
  vantage (`positionX`/`forwardX` `setTargetAtTime`, legacy `setPosition`
  fallback).
- **PALETTE**: warm-dark vantage register — near-black with a stone → bronze →
  pale-gold particle glow, in the GLSL art layer only. No film grain, no noise
  overlay.

## See == hear

One smoothed vantage drives the listener and the camera in lockstep, and each
voice's particle cluster glows from its **own** `AnalyserNode`, tapped on the
voice's gain node *before* the panner. So when a voice swells it both gets louder
in that ear and agitates/brightens its cluster at the matching point in space;
when you lean past a voice it sweeps across your ears and across your view
together. The hall is a `ConvolverNode` whose impulse is a decayed slice of
Karel's own recording, so even the reverb is made of his sound.

## Audio rules compliance

- Source is Karel's real catalog (`loadRealTrackBuffer`, default "Bath"); never
  synthesis. Zero oscillators, zero noise nodes.
- Voices are band-split copies of the one decoded buffer (parallel
  `BiquadFilter`s), transformed and placed — never generated.
- Every path terminates at `createSafeMaster(ctx).input`; zero `ctx.destination`.

## Degradation behavior

- **No camera / denied / model-fail**: the mouse + arrow keys fully drive the
  vantage, so the whole binaural + visual piece is audible and visible with no
  webcam. The status line shows `camera off — mouse steers` or a
  `text-destructive` camera-failed notice — never mistaken for live tracking.
- **Face lost while tracking**: `text-destructive` "no face" hint with an
  actionable distance cue; last vantage holds until the face returns.
- **WebGL2 unavailable**: a designed `text-destructive` notice, not a crash.
- **Audio load throws**: a designed `text-destructive` notice, no synth fallback.

## Design notes

The swarm is stateful on the GPU: a transform-feedback update program springs
each particle toward an orbiting target around its voice's world center, adds
agitation proportional to that voice's live level, damps, and integrates — then
the buffers flip and a second program renders the just-written positions through
a perspective × look-at matrix built from the vantage. Because the listener and
the camera read the same smoothed vantage, moving your head is literally moving
the one eye/ear through a fixed constellation of his piano.

## References

- **SPARO — "HRTF Upsampling and Personalization via Neural Operators,"
  Krishnan, Zhang, Duraiswami & Brown, arXiv:2610.20400 (14 Oct 2026)** — fresh
  neural-HRTF context motivating head-tracked binaural rendering.
- **Durand R. Begault, "3-D Sound for Virtual Reality and Multimedia"
  (foundational)** — the HRTF model this piece leans on.

## Verification note

Head-tracking path untested headless — needs a ~30s webcam check; fully playable
with the mouse.
