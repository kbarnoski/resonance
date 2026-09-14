# 17200-hall — Hall

**Status:** Demoable. Plays Karel's real take room-scale on a WebGL2 wall field; camera optical-flow layer is live and optional; deliberately-neutral palette (per the 2026-09-14 jury); graceful fallbacks in place.

## The question

_What if Resonance were a venue installation — Karel's take projected room-scale on a wall, and the room's own movement rippled the light?_

`Hall` treats the entire viewport as a projection wall. Karel's real piano take
plays looped and fills the wall as a neutral, slowly-advecting field of light. The
music drives the field's base drift, brightness and intensity. When a visitor grants
the camera, the room's own movement — read as a coarse optical-flow field — is
injected as velocity, so a wave of the hand pushes and ripples the light. The
visitor becomes a co-creator of the wall. Go still and the field settles back to
its own gentle drift.

## Design notes

- **Installation-mode framing.** Full-viewport, ambient-dark aesthetic. A
  fullscreen toggle, an "Installation" mode that hides all chrome (chrome wakes on
  mouse-move, Esc exits), and a small operator/calibration panel (source-take
  picker, brightness, field-scale, camera on/off). Primary action is simply to
  play the take — everything else is secondary.
- **Deliberately-neutral palette.** Graphite → slate → stone → silver → bone,
  with violet sparking only at the brightest peaks, tonemapped in-shader. This is
  the "third temperature" the 2026-09-14 jury asked for — neither the warm run
  (5×) nor cool-luminous (4×). No film grain / noise overlay. Violet stays the
  only accent used for UI chrome; the neutral ramp lives only inside the art layer.
- **The field.** A WebGL2 ping-pong advection field (RGBA8, R = intensity,
  G = palette-position). Each frame: advect the previous frame along a velocity
  made of curl-noise drift (energised by the music) plus the injected room-flow;
  dissipate; deposit new light from three audio emitters pulsed by bass / mid /
  treble and from wherever the room is moving; colorise + tonemap for projection.
- **The room.** The webcam is downscaled to 64×48 and turned into a flow field
  using a single-point optical-flow-constraint estimate (spatial + temporal image
  gradients), temporally smoothed, encoded to an RGBA8 data texture, and sampled
  as velocity in the advection pass. The webcam image itself is **never drawn** —
  only its motion drives the art. The 2D canvas is used solely to read webcam
  pixels for this computation, never as a rendering surface.
- **Audio safety.** Every audio path runs bufferSource → gentle lowpass →
  `createSafeMaster` (never `ctx.destination` directly), and all visuals are
  driven from `master.analyser`. No oscillators/synths; camera `getUserMedia` is
  video-only.
- **Non-chord enrichment.** `loadTrackAnalysis` onset density near the playback
  position raises field turbulence — harmony/chords are never mapped to hue.

## Ambition criteria hit

- **#2 — ≥3 subsystems:** catalog loader/decoder + audio analyser bus + webcam
  optical-flow field + GPU wall renderer (four).
- **#3 — named real installation reference:** Refik Anadol's data-driven wall
  works, where a projected field is fed by live signal and the audience's
  presence becomes part of the piece; and Ryoji Ikeda's neutral, near-monochrome
  large-format data-walls, which the palette here echoes (the 2026
  spatial-installation trend of "viewers become co-creators; their motion
  influences the field").
- **#5 — recent research (bonus):** the Codrops study "Run Rob Run:
  Music-Reactive Goo, Three.js + WebGPU" (2026-08-20) — a GPU music-reactive
  field deformed by the audio — informs the advection/deformation approach here.

## How it degrades

- **No camera / permission denied:** the field keeps its autonomous neutral drift;
  a quiet note explains the camera is unavailable. Camera is never required.
- **No WebGL2:** the take still plays and the wall holds a still neutral glow
  (a CSS radial graphite gradient, no Canvas2D), with an on-brand notice.
- **Audio load fails:** a visible `text-destructive` error on the pre-roll; the
  previous take keeps playing on a failed mid-session switch. Never a synth
  fallback.
- **Still motion:** with the camera on but the room quiet, injected flow decays
  toward zero and the field relaxes to its base drift.
