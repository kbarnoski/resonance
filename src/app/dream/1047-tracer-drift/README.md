# 1047 — Tracer Drift

**The one question:** What if a screen could evoke the *LSD* drift — surfaces
breathing and slowly drifting, motion leaving lagging colour **trails/tracers**
(positive afterimages), persistent **visual snow**, gentle moiré — the long
weightless plateau of an acid come-up, drug-free?

`state: LSD · pole: cosmic-ambient (drifting)`

## Tags

- **INPUT** — microphone breath/energy as a slow swell, **analysis only**
  (`AnalyserNode`; the mic is **never** routed to `destination`). Graceful no-mic
  fallback: a self-driven LFO breath swell plus a `text-rose-300` notice, so the
  piece drifts and sounds on a phone glance with zero permissions.
- **OUTPUT** — WebGL2 with a **ping-pong feedback buffer** (two FBOs/textures;
  the previous frame is rendered back with a slight transform + decay).
- **CORE TECHNIQUE** — **ping-pong feedback colour-trails / tracers.** Each frame
  composites the decayed, slightly warped previous frame *under* fresh content,
  producing the lagging positive-afterimage look. Layered on: slow fBm
  "breathing" surface warp, faint animated grain (visual snow) at low alpha, and
  subtle moiré from two slightly-detuned dot lattices. No raymarching, no
  reaction-diffusion.
- **PALETTE / VIBE** — **pastel-drift**: soft lilac, peach, mint, rose, pale
  cyan; low-to-mid saturation, luminous but gentle. Not neon, not dark-void.

## Named references

- **Memo Akten** — feedback / optical-flow image work; the practice of feeding a
  frame back through a warped, decayed transform to make motion smear and bloom.
- **LSD tracer / positive-afterimage / visual-snow phenomenology** — the lagging
  colour trails behind moving objects, the persistent fine grain, the breathing
  of static surfaces reported on classic psychedelics.
- **Carhart-Harris entropic-brain / REBUS framing** — relaxed priors → drifting
  reorganisation; here mapped to an arc that loosens (longer trails, wider colour
  spread, more warp) into a long plateau, then re-converges.

## Audio → visual mapping

The audible bed is a slow, drifting ambient drone (master gain ≈ 0.13,
click-free fades):

- a soft low chord of detuned sine/triangle oscillators, each with a very slow
  per-voice detune LFO (the beating/"melt"), plus one shared slow pitch-bend
  portamento (~67 s cycle) that drifts the whole chord a few cents;
- a gentle filtered-noise wash (pink-ish noise → lowpass slowly swept ~41 s).

Nothing rhythmic — it should feel weightless and endless. The bed feeds both the
speakers **and** the analyser, so the visuals drift even with no mic.

| audio control                       | visual target                                        |
| ----------------------------------- | ---------------------------------------------------- |
| low-band energy (breath swell)      | feedback **decay + zoom** (trail length) + warp amp  |
| overall loudness (`level`)          | **saturation** in the present pass                    |
| arc `intensity` (timeline)          | colour spread, moiré amount, decay/warp scaling       |

`read()` smooths very slowly (α ≈ 0.035) — this is a drift, not a VU meter.

## How the ping-pong feedback buffer is wired

Two RGBA textures **A** and **B**, each on its own framebuffer. Half-float
(`RGBA16F`) targets when `EXT_color_buffer_float` + `OES_texture_float_linear`
are present (smooth low-alpha trails), else 8-bit. Linear filtering makes the
warped feedback fetch melt.

Each frame (`FeedbackRenderer.runFrame`):

1. **Feedback pass** → bind FBO[dst], sample texture[src] (the previous frame)
   with a slight zoom + rotation + fBm warp, multiply by a gentle decay
   (0.80–0.978 — never a hard strobe), nudge its hue (chromatic lag), then
   composite the breathing surface + moiré + visual snow over it.
2. **Swap** src/dst (ping-pong).
3. **Present pass** → bind the canvas, sample the just-written texture, tone-map
   gently (luminous not clipped), apply loudness→saturation, soft vignette, and
   lift blacks toward a pale dusk (not a void).

`dispose()` deletes every GL object (both textures, both FBOs, both programs,
VBO, VAO) and calls `WEBGL_lose_context`. Audio teardown stops/disconnects all
oscillators, LFOs, the noise source and the mic stream after a short click-free
fade, then closes the `AudioContext`. The RAF is cancelled on unmount.

## Arc (~4 min, loops)

onset (clear, faint snow, short trails) → come-up (trails lengthen, breathing
warp grows, colour drifts apart) → **plateau** (long luminous tracers, slow
moiré, the weightless middle — deliberately wide, ~0.40–0.78 of the loop) →
return (trails shorten, snow fades, colour re-converges). All keyframes blend
with smoothstep; nothing switches abruptly.

## Safety

Not a flicker/strobe piece. Only slow luminance drift; the feedback decay is
gentle and the buffer is never rapidly cleared/flashed. No full-screen
high-contrast flashing in the 3–30 Hz band.

## Honest unverified note

Built without a GPU or audio device in the container, so this has **not** been
run live. The shaders compile-check by inspection only; uniform names, the
ping-pong attachment dance, the half-float fallback path, and the exact feel of
trail length / decay / audio balance are unverified and may need tuning on real
hardware. ESLint/TypeScript were the only automated checks applied.
