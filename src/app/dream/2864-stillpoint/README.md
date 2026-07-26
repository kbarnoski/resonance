# 2864 · Stillpoint

## The question

What if a psychedelic hallucination opened not by dragging a slider, but by
**holding your body still** — the way meditation, not a knob, dissolves the
boundary of perception?

## How the reducing valve / stillness mapping works

Aldous Huxley's "reducing valve": normal perception is a filter that keeps the
brain's top-down geometric priors suppressed under high-precision sensory
evidence. Drop that precision and the priors — Klüver's four form constants —
bleed through and overwrite what you see.

Here the **valve parameter is your stillness**, measured by a real sensor:

1. **Optical-flow-lite** (`flow.ts`): the webcam is downscaled to 64×48 and each
   frame's per-pixel absolute luminance difference is summed into a single
   global **motion energy** signal.
2. That signal is smoothed (EMA) and mapped to a valve **target** = `1 − motion`.
   Stillness targets the valve open (1); movement targets it closed (0).
3. The valve integrates toward its target **asymmetrically**: it *opens slowly*
   (τ ≈ 3.2 s — stillness has to be earned) and *closes fast* (τ ≈ 0.32 s — a
   sudden movement snaps you back to reality within ~0.5 s).
4. The valve drives the shader (`gl.ts`). At valve 0 you see the near-literal,
   mirrored camera image. As it opens, the live texture is warped through the
   retina→V1 **log-polar (cortical) map** (`LOGPOLAR_GLSL` from the shared psych
   engine) and progressively replaced by animated **form-constant geometry** —
   tunnels, spokes, spirals, honeycombs — the camera's own luminance still
   faintly driving the geometry, so it *overwrites* rather than erases.
5. The valve drives the audio (`audio.ts`): a warm, continuous **inharmonic**
   drone bloom. As the valve opens, more partials fade in, detune/beating
   deepens, a feedback-delay tail lengthens, and a lowpass opens. It is
   deliberately **not** scale-snapped to a pretty pentatonic/just chord — it is a
   continuous inharmonic bloom driven only by the valve.

**Degrades gracefully:** no camera / blocked permission / insecure context →
an on-brand notice plus a self-playing synthetic stillness rhythm (long stretches
of stillness punctuated by movement bursts), and the shader synthesises a calm
nebula to warp so the piece still demos. No WebGL2 → a notice.

**Safety:** any luminance drift is routed through the shared `SafeFlicker`
(≤ 3 Hz soft sine, `prefers-reduced-motion` honored) and only appears as the
geometry opens — never a strobe over the literal camera image.

## References

- Frontiers in Psychology 2026 — *"Beyond the reducing valve: towards a
  computational neurophenomenology of altered states via deep neural networks"*
  (fpsyg.2026.1819038).
- Aldous Huxley — the "reducing valve" of consciousness (*The Doors of
  Perception*).
- Heinrich Klüver — the four **form constants** (lattices/honeycombs, cobwebs,
  tunnels/funnels, spirals).
- Bressloff & Cowan — the retina→V1 cortical map as a complex logarithm
  (log-polar), the basis of the shared `_shared/psych/logpolar` engine.

## Diversity tags

- **input:** camera (optical-flow / frame-difference stillness) — a real sensor,
  not a fader.
- **output:** WebGL2 fragment shader over the live camera texture.
- **technique:** frame-difference optical flow → precision parameter →
  predictive-precision blend + log-polar (retina→V1) warp + Klüver form-constant
  synthesis; Web Audio inharmonic additive drone with feedback-delay tail.
- **palette:** dark, violet-leaning IQ-cosine iridescence inside the canvas;
  minimal Scandinavian dark chrome outside it.
- **state:** meditation → geometric · **pole:** cosmic-ambient → intense.

## Next-cycle deepening

- Replace the global scalar motion energy with a coarse **dense flow field** so
  stillness can open the valve *locally* — the periphery dissolving into
  geometry first while the fovea stays lucid (mirrors how peripheral precision
  drops first).
- Drive the form-constant morph from *where* the residual motion is (radial vs
  tangential) rather than a time drift, so the geometry that blooms is shaped by
  how you were last moving.
- Add an optional breath-rate estimator (slow luminance oscillation of the chest
  region) to couple the drone's beating to the breath at full stillness.
