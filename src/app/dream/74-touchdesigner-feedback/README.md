# TD Feedback — `/dream/74-touchdesigner-feedback`

**TouchDesigner TOP feedback loop, ported to WebGPU.**

In TouchDesigner, the canonical feedback patch is: one TOP reads from a feedback-delayed
copy of itself, applies a slight geometric transform (rotate, zoom-toward-center), and
writes back. Audio drives the transform parameters. After 2–3 seconds the texture reaches
a dynamic equilibrium: an ever-evolving mandala that never repeats.

This prototype ports that exact pattern to the browser via WebGPU ping-pong render targets.

---

## Architecture

Two `rgba8unorm` GPU textures: `ping` and `pong`.

**Each frame (two render passes):**

1. **Feedback pass** — reads from `ping`, renders to `pong`:
   - UV transform: scale toward center by `zoomFactor`, rotate by `rotSpeed`
   - HSV hue-shift by `hueDrift`
   - Multiply by `decay` (< 1.0 = gradual fade toward black)
   - Add audio bloom layer (bass = violet center, mid = cyan ring, treble = orange halo, onset = white flash)

2. **Present pass** — blits `pong` to the canvas swapchain.

3. **Swap** `ping ↔ pong` pointers for the next frame.

The UV transform is the key. A zoom factor of 1.004× per frame means each sampled point
comes from slightly farther out — equivalent to the whole texture contracting toward the
center by 0.4% per frame. Combined with a small rotation, this creates the spiral
inward-pull characteristic of TD feedback patches.

---

## Controls

| Control | Range | Effect |
|---------|-------|--------|
| ROTATION | −15‰ to +15‰ rad/frame | Clockwise/counterclockwise spiral direction |
| ZOOM | 0.992× to 1.012× | Inward pull (>1) or outward push (<1). 1.000 = no zoom |
| HUE DRIFT | 0 to 8‰ /frame | Rainbow cycling speed. 0 = fixed colors |
| DECAY | 92% to 99.8% /frame | Fade rate. High = long trails. Low = snappy |

Audio adds on top of the base sliders:
- `bass × 0.009` → extra rotation
- `mid × 0.004` → extra zoom
- `treble × 0.003` → extra hue drift

---

## Interesting parameter regions

- **Slow meditative**: rotation ≈ 2‰, zoom ≈ 1.002, hue drift ≈ 0.5‰, decay ≈ 98.5%
- **EDM build**: rotation ≈ 8‰, zoom ≈ 1.006, hue drift ≈ 3‰, decay ≈ 97%
- **Explosion + collapse**: zoom < 1.000 (outward push) + high onset sensitivity
- **Stacked rings**: rotation ≈ 0, zoom ≈ 1.003 — concentric halos that pulse with bass

**Reset** clears both textures to black. The next audio input re-seeds the feedback.

---

## TouchDesigner reference

The pattern is described in tutorials by Bileam Tschepe (elekktronaut) and others:
- TOP Feedback → Transform TOP (rotate + scale) → back to Feedback
- Audio analysis → CHOP → TOP to CHOP → drives transform parameters

The browser equivalent:
- WebGPU render pass → fragment shader (rotate + scale UV) → ping-pong texture
- Web Audio AnalyserNode → uniform buffer → drives shader parameters

The key difference: TD's Feedback TOP uses multi-buffer delay with configurable frame count.
This prototype uses single-frame ping-pong (1-frame delay). Multi-frame delay would require
storing N textures — a future polish idea.

---

## Polish ideas

- Variable feedback delay (N-frame buffer, configurable from 1–8)
- Inject a Ghost LoRA image into the feedback stream (AI image inside an AV experiment)
- MIDI CC → rotation / zoom mapping for live performance
- Edge-wrap mode (mirror vs. clamp vs. torus UV addressing)
- Vorticity: add a curl force to the UV transform for more organic motion
