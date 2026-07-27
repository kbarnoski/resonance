# 3048 · Chrysanthemum

**Sing the DMT chrysanthemum into being.** Hum a sustained tone and the classic
serotonergic-psychedelic form-constants — spirals, tunnels, spokes, honeycombs —
bloom, unfold and saturate in exact response to your voice, then collapse back to
a faint threshold the instant you go silent.

This is a drug-free altered-states instrument at the **intense** pole (high
entropy, high saturation, ornate fractal). The differentiator: **your voice
drives the geometry live.** The flower is silent and still until *you* sound. A
human is fully responsible for it, moment to moment — sustain a pitch and the
chrysanthemum (the dense unfolding fractal flower of the DMT come-up) grows. It is
not a self-playing screensaver.

## The phenomenology: Klüver's form constants + Bressloff–Cowan

Heinrich Klüver catalogued the geometric hallucinations that recur across DMT,
LSD, psilocybin, mescaline, migraine aura, hypnagogia and flicker into four
**form constants**:

1. lattices / honeycombs
2. cobwebs
3. tunnels / funnels / cones
4. spirals

Bressloff, Cowan and colleagues showed these are a property of **visual cortex**,
not of any drug. The retina→V1 cortical map is (approximately) a complex
logarithm: concentric circles map to vertical cortical stripes, radial spokes to
horizontal stripes, spirals to diagonals, and hex lattices to hex lattices. So
**one** stripe/hexagon pattern, generated in cortical (log-polar) space and viewed
through the inverse `exp()` warp, produces *all four* constants. That single
insight is the engine.

## Composes the shared `logpolar.ts` engine

The geometry is **not** re-derived here. The fragment shader inlines
`src/app/dream/_shared/psych/logpolar.ts` — its `LOGPOLAR_GLSL` helpers
(`screenToCortex`, `formConstant`, `honeycomb`) and its coordinate conventions —
and colours it with the shared violet `PALETTE_GLSL`. This prototype only decides
*which* constant and *how dense*, driven by your voice.

## Voice → geometry mapping (`voice.ts`)

`getUserMedia({audio})` → `AnalyserNode`. Every frame a lightweight **YIN**
detector estimates the fundamental (with parabolic interpolation) and the **RMS**
loudness. Both are one-pole smoothed with an asymmetric envelope (fast ~70 ms
attack, gentle ~340 ms release) so the bloom responds to a fresh note and then
collapses cleanly — no jitter, no snap.

- **Pitch → form + frequency + hue.** The pitch sweeps a continuous form axis:
  low → wide **tunnels**, rising through **spirals** and radial **spokes**, up to
  fine **honeycomb** lattices. Adjacent constants crossfade as you glide. Pitch
  also rotates the hue along the violet→magenta arc.
- **Loudness / sustain → bloom depth.** One master control grows the kaleidoscope
  **fold count**, the log-polar **warp amplitude**, the **fractal octave** detail,
  the **saturation/gain**, the **feedback-trail persistence** and the **chromatic
  aberration**. A sustained loud tone = full chrysanthemum bloom; silence decays
  to a faint, nearly-still threshold pattern.

## Output (`bloom-gl.ts`)

A single full-screen quad and a WebGL2 fragment shader with **ping-pong
feedback**:

- N-fold **kaleidoscope** symmetry fold (fold count grows with loudness),
- **log-polar form-constant** field from the shared engine, with a loudness-driven
  domain warp for the unfolding,
- fractal octaves for ornate, saturating detail,
- **chromatic aberration** (per-channel radial offset) + **thin-film iridescence**
  for jeweled, shimmering colour,
- **feedback trails** (slow zoom + tiny rotation of the previous frame, tonemapped
  so it glows rather than clips).

A subtle **overtone halo** synth (sub-octave + perfect fifth + octave partials
through a warm low-pass, master gain ≤ 0.1) glides with the detected pitch and is
gated by loudness, so the instrument always sings back — your own voice stays the
star.

## Photosensitive-epilepsy safety

This is the intense pole, so safety is explicit and non-negotiable. Intensity is
expressed through **slow luminance drift, saturation, warp depth and feedback
persistence — never full-field high-contrast flicker.** All animation rates sit
well below the 3–30 Hz danger band; the feedback is tonemapped so it can never run
away to a strobing white field. When in doubt: **drift, not flicker.**
`prefers-reduced-motion` slows the visual clock, reduces contrast/saturation and
caps the fold count and warp.

## Graceful degradation

- **No WebGL2** → an on-brand Canvas2D threshold pattern (concentric rings) and a
  muted-token notice.
- **Mic denied / unavailable** → a `text-destructive` notice **and** a fallback to
  a deterministic seeded **autopilot voice** (`mulberry32` seeded `0x3048` — no
  `Math.random` / `Date.now`) that hums slow rising/falling sustained tones so the
  piece self-demos headlessly. A real mic takes over the moment it's granted.
- **Before Start** the flower idles as a faint, nearly-still threshold — waiting to
  be sung into being.

All audio starts only after the Start gesture (the `AudioContext` is resumed
there). Audio nodes, the rAF loop, the WebGL context and the mic `MediaStream`
tracks are torn down on unmount.
