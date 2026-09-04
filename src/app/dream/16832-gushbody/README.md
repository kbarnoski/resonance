# 16832-gushbody — Karel's piano as a fluid you stir with your hands

**Status:** demoable

## The one question

*What if you could stir the visual body of Karel's recording with your own motion — his piano as a luminous fluid you push around with your hands, in front of the webcam?*

## How it works

Karel's real piano recording is the **primary** voice. The webcam is a **secondary** control layer. Every frame:

1. **Catalog loader** — `_shared/welcomeHome` fetches and decodes one of Karel's real tracks (Welcome Home / Snowflake) into an `AudioBuffer`. A track picker is built from `COLLECTIONS`, defaulting to the first track. The buffer plays through a `BufferSource → lowpass BiquadFilter → safeMaster.input` chain; nothing ever reaches `ctx.destination` directly.
2. **safeMaster + FFT** — `createSafeMaster(ctx)` is the required ear-safety master bus. Its `AnalyserNode` (fftSize 1024) is read each frame with `getByteFrequencyData`: the mean level becomes the ink brightness, the bass bins drive the fallback stir, and the spectrum itself is uploaded to the GPU as a 256×1 texture that his music paints into the field.
3. **Chord tracker** — `loadTrackAnalysis` supplies the time-sorted chord progression. A cursor walks the chords against playback position (`ctx.currentTime − startTime`) to find the sounding chord; its root pitch-class picks a warm ember hue (deep red → gold, ordered around the circle of fifths, minor chords running deeper). If analysis is null, the ink tint falls back to the spectral centroid.
4. **Camera optical-flow** — the webcam is drawn into a small 160×120 canvas, uploaded as a WebGL2 texture, and kept as current + previous frames. In the fragment shader, flow is estimated Horn–Schunck-style: a brightness gradient (Ix, Iy) plus a temporal difference (It), giving `flow ≈ −It · normalize(∇I)`, clamped and scaled. A coarse CPU motion magnitude is also computed for the audio coupling.
5. **WebGL2 feedback renderer** — raw WebGL2 (`webgl2` context, no three.js, no Canvas2D). Two ping-pong RGBA8 FBOs hold the fluid. Each frame a feedback pass advects the previous field by sampling it at `uv − flow`, decays it (trail memory), and injects the audio spectrum as a drifting luminous ribbon tinted by the chord. A display pass tone-maps the field to warm embers on a deep ground with a soft vignette.

Vigorous motion also gently lifts the lowpass filter on the recording, so moving your hands "opens" the sound as well as the light. It stays subtle and always audible.

## Named reference

Ported from **Adam Ferriss' *Gush*** (Experiments with Google), which wraps **Andrew Benson's GLSL Horn–Schunck optical-flow shader** in a WebGL feedback loop so a webcam feed smears into accumulating motion trails. Here the same motion → feedback-advection technique is driven by Karel's audio (injected light + chord tint) instead of the raw camera image.

## Controls

- **Recording** — pick any track from Welcome Home or Snowflake before playing.
- **Play & stir** — starts audio (after the gesture) and requests the camera.
- Move your hands / body in front of the camera to push and smear the glowing fluid.
- **Stop** — halts playback, releases the camera, and closes the audio context.
- **Read the design notes** — opens these notes in a modal overlay.

## How it degrades

- **Camera denied / unavailable** — a clear notice appears and the advection is driven by a procedural rotating flow whose strength follows the beat, so Karel's music still plays and still stirs the fluid. Never a dead screen.
- **WebGL2 unavailable** — a semantic-token error notice is shown instead of a blank canvas; audio is not started.
- **Analysis missing** — the ink tint falls back from chord-root to spectral centroid.

## Honest limitations

- The optical flow is a cheap single-tap gradient estimate, not a full multi-iteration Horn–Schunck solve — it reads convincingly as "motion pushes the ink" but is noisy on low-contrast or dark scenes.
- The feedback field is RGBA8 (no float render target assumed), so very long trails eventually clip at the tone-mapped ceiling rather than accumulating with full HDR precision.
- The injected ribbon maps the raw FFT across the horizontal axis; it responds to loudness and chord colour, but it is an impression of the music's energy, not a literal per-note visualization.
- The camera and feedback fields share UV space at different aspect ratios, so the flow is stretched slightly — fine for stirring, not geometrically exact.
