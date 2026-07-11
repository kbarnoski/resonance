# 1458 — The Room of You

## The one question
**What if your own body WAS the acoustic space?** You stand before the camera and
your silhouette becomes the shape of a resonant room — so moving your body
re-tunes the reverb and a soft tone rings out through the you-shaped cathedral.

This is an embodied, **cross-modal** piece: the camera does not paint pixels or
warp a face — your body geometry continuously re-tunes the **sound of a space**.
Cosmic-ambient → contemplative: a slow, spacious cathedral you inhabit.

## References
- **Alvin Lucier — _I Am Sitting in a Room_ (1969).** A body/voice iteratively
  played back into a room until only the room's resonances remain — the room's
  geometry becomes the instrument. Here the mapping is inverted and made live:
  *your* geometry becomes the room.
- **Pauline Oliveros — Deep Listening / Sonic Meditations.** The contemplative,
  attentional stance: stand, breathe, listen to a space respond to your presence.

## What it does
- **Input:** `getUserMedia({ video: true })`. Each frame is drawn (mirrored) to a
  hidden 80×60 canvas and reduced to cheap features with **hand-rolled pixel
  math — no ML library**:
  - **motion energy** — frame-difference `Σ|cur − prev|` over the presence map →
    excites the resonator (movement rings the room).
  - **silhouette** — camera mode uses a slow-adapting background subtraction
    `|luma − bg|`; from the thresholded map we take centroid, vertical spread,
    height, width and fill → the room's size / decay / brightness.
- **Output:** a **WebGL2** fullscreen fragment shader renders the room as a
  luminous **standing-wave volume** in the shape of your blurred silhouette, with
  an expanding ring on every strike. Canvas2D fallback if WebGL2 is missing.
- **Audio:** a self-built **Feedback-Delay-Network reverb** (4 delay lines,
  normalised 4×4 Hadamard feedback matrix, a lowpass damper inside each loop),
  excited by soft inharmonic **bell/mallet** hits. Body geometry continuously
  re-tunes the delay lengths, feedback and damping. A very quiet just-intonation
  drone bed (shared `droneBank`) tracks how much of the frame you fill.

## Body-feature → acoustic-parameter mapping
| Body feature (0..1) | Acoustic parameter |
| --- | --- |
| **motion energy** | strike triggering + strike intensity (movement re-strikes the room) |
| **height + vertical spread** → *size* | FDN delay-line lengths (room size) **and** feedback gain (decay time) |
| **centroid Y** (how high you stand) → *bright* | damping-lowpass cutoff (space brightness) **and** bell pitch (higher = brighter) |
| **fill** (how much space you occupy) | drone-bed richness **and** reverb wet level |
| **width** (horizontal extent) | inharmonic detune spread across the bell's partials |

The mapping is smoothed (per-frame EMA) so the space *breathes* rather than
snaps, matching the contemplative pole.

## Camera + synthetic-presence fallback (never blank/silent)
- **Camera granted:** status line reads *"camera: your body is the room"*
  (emerald). Your motion-silhouette drives everything.
- **Camera denied / unavailable / headless:** a deterministic **synthetic
  presence** (a seeded, slowly-breathing body-blob that drifts and sways on its
  own) drives the *same* feature path. Status reads *"synthetic presence (no
  camera)"* (amber), with a rose note on the reason. The piece self-demos.
- **Idle self-demo (even with camera):** if motion stays near zero, a gentle
  auto-excitation ring fires every ~6.5 s (~9 s under reduced-motion), so the
  cathedral is never silent and a headless review always sees + hears it.

## Safety
- **No strobe / no flicker:** all motion is sub-Hz. The only luminance
  modulation is a slow `sin(t·0.32)` breathing — far below the 3 Hz safety
  ceiling. `prefersReducedMotion()` damps motion sensitivity, slows the standing
  waves and the ring, and lowers the master ceiling.
- **No runaway feedback:** the FDN mixes through `0.5·H` (an *orthogonal* matrix,
  all singular values = 1), so the loop's spectral radius equals the scalar
  feedback gain, which is clamped to **≤ 0.9 (< 1)**. A `DynamicsCompressor`
  limiter sits before `destination`; master gain ramps from ~0.0001 to ≤ 0.2.
- **Lifecycle:** AudioContext is created/resumed only after the *Begin* gesture.
  Stop / unmount tears everything down: camera tracks stopped
  (`stream.getTracks().forEach(t => t.stop())`), rAF cancelled, resize listener
  removed, all audio nodes disconnected, context closed.
- **Determinism:** no `Math.random` / `Date` affects rendering. The synthetic
  presence uses **mulberry32**; the shared void/drone IRs are LCG-seeded.

## Files
- `page.tsx` — hero, Begin (prompts camera), status line, HUD, lifecycle + the
  per-frame loop that maps features → room and triggers strikes.
- `vision.ts` — camera capture, background-subtraction silhouette, synthetic
  presence, and the shared feature extractor.
- `fdn.ts` — the hand-built Feedback-Delay-Network reverb + bell excitation.
- `renderer.ts` — the WebGL2 standing-wave shader (+ Canvas2D fallback).

## Rough edges / tuning knobs
- **Background subtraction is a *motion*-silhouette:** you're brightest when you
  move and slowly fade if you hold perfectly still (the background re-learns you
  over ~seconds). This is intentional and pairs with the idle auto-ring, but a
  truly static pose eventually dims. `bg` EMA rate (`0.01`) trades stability vs.
  responsiveness.
- **Motion normalisation** (`×12`) and `MOTION_TH` are tuned for a typical
  webcam at arm's length; a very dark or very busy room may want them adjusted.
- **`decay` / `sizeFactor` in `fdn.ts`** set how much the room grows with your
  body — raise for a more dramatic cathedral, lower for a tighter chamber.
- The FDN is deliberately small (4 lines) for frame-rate headroom; 8 lines with a
  Householder matrix would smooth the tail further.
