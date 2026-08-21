# 15696 · Lean In

**One sentence:** Karel's recording plays continuously, but its *presence* is governed by how physically close you are to the screen — lean in and the take blooms to full, intimate presence; sit back and it recedes to a bare, distant whisper.

## What it is

A proximity instrument. One of Karel's real solo-piano takes loops as an ambient
bed, but you only ever hear it *fully* when you hold yourself close to the
screen. Closeness is the whole control surface — a committing bodily posture,
not a click, and not locomotion through any virtual space. The moment you sit
back, the piece muffles, quiets, and drifts far away.

- **Lean in / hold close → it blooms:** the lowpass sweeps open (320 Hz → 15 kHz),
  gain swells from a bare whisper to full, the distant wash tightens to an
  intimate dry room, and the Canvas2D ember field draws inward and warms from
  cold oxblood to gold.
- **Sit back / drift away → it recedes:** muffled, quiet, roomy and far, the
  visual field collapsing to a single cold distant point.

## How to use

1. Pick a take (Welcome Home and Snowflake collections; defaults to *Welcome
   Home*) and press **Enable camera · begin**.
2. **Camera mode (preferred):** allow the camera. Lean your face toward the
   screen to bloom the take; sit back to let it recede. The webcam runs only in
   your browser to measure how large your face is in frame — nothing is
   recorded or sent anywhere.
3. **Pointer mode (fallback, always works):** if you decline the camera, have no
   camera, or the model fails to load, a pointer **"hearth"** at the canvas
   centre takes over. Move the pointer to the centre and hold to lean in; drift
   toward the edges to recede. A clear `text-destructive` notice states which
   mode is active and why.
4. Use headphones. Blooming is deliberately *earned* — the proximity signal
   rises slowly (~1.4 s) and recedes a little faster (~0.9 s), so intimacy has
   to be sustained.

## Dual proximity sensing

Both paths are implemented so the piece is **always demoable**, including with
no camera:

- **Camera — MediaPipe Tasks-Vision `FaceDetector`.** Loaded at *runtime* from
  the jsDelivr CDN via an indirect `new Function("return import(...)")` so the
  bundler never resolves the remote URL and **no npm dependency is added**
  (pattern studied from `1103-strange-face/face.ts` and copied, not imported).
  The face **bounding-box area** as a fraction of the frame is the proximity
  signal (bigger face = closer), mapped from ~3 % (far) to ~32 % (near).
- **Pointer — focal hearth.** Nearness of the pointer to the canvas centre is
  the signal; leaving the field reads as "far". Pointer events cover touch.

The raw signal (noisy either way) is heavily, asymmetrically smoothed in the
render loop, and every audio parameter glides with `setTargetAtTime`.

## Technique

**Proximity-envelope mapping.** A single smoothed proximity scalar `p` (0 far →
1 near) drives everything:

| target | far (p→0) | near (p→1) |
| --- | --- | --- |
| lowpass cutoff | 320 Hz | 15 kHz (log-lerp) |
| dry gain | 0.10 | 1.0 |
| delay wet (space) | 0.55 | 0.05 |
| delay feedback | 0.55 | 0.19 |
| visual field scale | 0.12 (point) | 1.0 (fills) |
| ember hue / brightness | oxblood, dim | gold, bright |

The same `p` scales and warms the Canvas2D bloom (core radial glow + five
concentric rings of embers pulsing on the master spectrum).

## Audio integrity

Every audible sound is Karel's real decoded `AudioBuffer` — **zero synthesis**:
no oscillator, no constant source, no generated tone or noise. The take is
loaded through the shared `loadRealTrackBuffer` helper and routed
`BufferSource → lowpass → gain → createSafeMaster().input`, never to
`ctx.destination` directly. The looping buffer is still 100 % his audio. The
sense of "space" is **a short feedback delay of his own filtered signal** — no
convolver, no impulse — so distance is a genuine wash of his playing rather than
any artificial reverb.

## Palette

Warm **ember duotone** — deep oxblood/ember (`hsl(12 70% 22%)`) → warm gold
(`hsl(38 85% 62%)`) on near-black. Not full-chromatic, not grayscale. Raw hsl
lives only inside the Canvas2D art; all chrome uses semantic tokens
(`text-foreground`, `bg-background`, `border-border`, `bg-primary`, and
`text-destructive` for the camera-denied / no-camera notice).

## Named reference

**Proxemics / peripersonal space.** Edward T. Hall's *intimate-distance* zone
(*The Hidden Dimension*, 1966) and the "webcam intimate-distance paradox" —
video-call faces sit at intimate distance while peripersonal space stays a
flexible, multisensory zone around the body. This piece makes physical closeness
the instrument: the recording is only fully *there* when you are. It also nods
to **Janet Cardiff's** intimacy-of-presence installations, where sound is staged
to feel breathed right at your ear.

## Tags

`input:` webcam face-proximity (camera as secondary control over catalog audio)
with pointer fallback — committing, non-locomotion ·
`output:` Canvas2D breathing bloom field ·
`technique:` proximity-envelope mapping (face-area / pointer-distance → lowpass +
gain + feedback-delay space + visual bloom) ·
`palette:` warm ember duotone (oxblood → gold on near-black).

## Degradation & teardown

- No camera / denied permission → seamless pointer hearth + visible
  `text-destructive` notice. Honors `prefers-reduced-motion` (hard clear each
  frame, no breathing or spin).
- Full unmount teardown: stops the buffer source, disconnects all nodes,
  `master.disconnect()`, cancels the `requestAnimationFrame`, **stops every
  webcam `MediaStream` track**, closes the MediaPipe `FaceDetector`, and guards
  `ctx.close()`. No camera light left on, no audio after leaving.

## Next-cycle deepening

- **Lateral intimacy:** use the face's horizontal position, not just its area,
  so leaning in from the left vs. the right pans the take or opens different
  registers — turning the screen into a directional listening spot.
- **Breath-locked bloom:** detect the slow rise/fall of face area as breathing
  and gate a sympathetic swell, so the piece appears to breathe with the
  listener rather than merely with proximity.
- **Two-face duet:** when the detector finds a second face, split the delay into
  a stereo pair keyed to each person's distance — a shared-intimacy mode for two
  people leaning in together.
- **Threshold memory:** remember the closest the visitor ever leaned and let a
  faint "high-water" ring linger, rewarding a return to that exact intimate
  distance.
