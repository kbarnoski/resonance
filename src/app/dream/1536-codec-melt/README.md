# 1536 · Codec Melt

**Route:** `/dream/1536-codec-melt`
**Input:** keyboard · **Output:** Canvas2D + **WebCodecs** (`VideoEncoder` / `VideoDecoder`) · **Technique:** bitrate-starve DCT-block melt · **Palette:** iridescent jeweled violet, LSD-tracer · **Pole:** intense / kinetic — a *played* melt, not a passive drift.

## What it is

Play the melt of a dying video codec. A slowly-drifting Canvas2D field of violet blobs is fed frame-by-frame into a **real hardware `VideoEncoder`** (VP8) running at a deliberately *starved* bitrate, decoded straight back with `VideoDecoder`, and upscaled nearest-neighbour onto the visible canvas — so the codec's own compression artifacts (blooming DCT macroblocks, color-banded slabs) *are* the render substrate. Datamosh as an instrument.

Every key is simultaneously a **synth voice** and a **burst of visual motion**: it launches a bright, high-contrast comet across the source scene. Because motion is exactly what a starved codec cannot encode, that comet detonates the macroblocks around it — and then the picture heals as the note decays.

This is the lab's **first-ever use of the WebCodecs API**.

## The WebCodecs mechanic (and why fixed bitrate)

Pipeline, once per frame:

1. Draw the source scene to a small (384×216) offscreen canvas — small on purpose, so 16px macroblocks read as *big chunky slabs* when upscaled.
2. `const vf = new VideoFrame(sourceCanvas, { timestamp })` → `encoder.encode(vf, { keyFrame })` → `vf.close()`.
3. Encoder `output` callback → `decoder.decode(chunk)`.
4. Decoder `output` callback → present the `VideoFrame` (through the tracer feedback loop) → `videoFrame.close()`.

**Choice: a fixed encoder config, melt driven by motion — not by mutating `bitrate`.** WebCodecs has no per-`encode` bitrate parameter; the only way to change bitrate at runtime is `encoder.configure()`, which forces the *next* frame to be a keyframe — an instant, full-frame *heal*, the exact opposite of a melt. So instead:

- The encoder is pinned at a **starved 55 kbps VP8** for the whole session.
- **Melt depth** (from attack) drives the amount of high-contrast **motion** injected: harder play → bigger, faster, brighter comets. The fixed low bitrate's delta (P-)frames can't keep up with that motion, so the DCT blocks bloom and smear. This is the phenomenology of "drop the bitrate toward the floor" achieved without the keyframe-heal side effect — and it is the most render-robust of the three melt mechanics.
- **Keyframes are the heal**, requested only when calm: the first frame (decoder init), a light heal when melt < 0.08, and a safety heal at least every 5 s so smear never runs unbounded.

Keyboards give no velocity, so **hammering a key** (repeated attacks) accumulates melt toward the floor and then eases back — "play the melt, watch it heal."

## The see = hear weld

- **Attack / hammering → melt depth** → comet size + speed + brightness → how hard the codec blooms, *and* the synth filter cutoff + release length + drone drive. Harder play = more melt **and** louder, brighter voice. Legible in both channels at once.
- **Pitch → melt direction + hue.** Each note's launch angle (golden-angle spread) and iridescent violet hue set where the comet flies and what color the codec then smears.

## Audio

Gesture-gated `AudioContext`. Each key = a detuned saw+triangle voice through a lowpass with a short ADSR; a continuous just-intonation drone bed (shared `droneBank`) sits underneath. **Master chain: every voice + drone → one master `GainNode` (0.18, ≤0.2) → `DynamicsCompressor` → destination.** Polyphony capped at 14 (oldest stolen); all gains ramped, no clicks.

## Idle auto-demo

Untouched for ~2.5 s, an internal seeded sequencer walks a slow melodic phrase across the scale, so the piece melts and (once Started) sings on its own. Any real key press takes over instantly.

## Safety

No strobing. Melt is a smoothly-eased scalar (exponential attack/decay, tau ≈ 0.85 s) — it modulates comet motion and trail persistence, never a per-frame full-screen luminance flip. Trail zoom/rotate/hue-nudge are small and continuous. `prefersReducedMotion()` caps comet speed and melt add, slows the idle tempo, shortens trails, and lengthens the heal. All transitions ease over well beyond 150 ms; nothing flashes in the 3–30 Hz danger band.

## Fallback

If `VideoEncoder` is undefined, `isConfigSupported({ codec: 'vp8', … })` reports unsupported, or the codec throws mid-stream, the piece drops to a hand-rolled Canvas2D **feedback datamosh**: the same tracer ping-pong (previous frame drawn back with a slight zoom + rotate + hue nudge + decay) with the raw source composited over it each frame. It still plays, melts, and sounds. A small `text-destructive` line notes the fallback is active. (The presentation ping-pong is shared by both paths; only the "fresh" layer differs — decoded `VideoFrame` vs. raw source.)

## Named references

- **Takeshi Murata — _Monster Movie_ (2005)** — canonical datamosh; melting, blooming compression artifacts as form.
- **Rosa Menkman — _The Glitch Moment(um)_** — the aesthetics/theory of compression & glitch.
- **Nino Filiu — SuperMosh** — real-time datamosh in the browser via WebCodecs; direct technical lineage for this piece.
- **Sven König — _aPpRoPiRaTe!_** — codec/keyframe manipulation as live performance.
- Phenomenology: LSD positive-afterimage "tracers" + surface-melt.

## Ambition-floor self-assessment

Meets the floor: it is a genuinely *played* instrument where the melt is controllable (attack → depth) and legible (harder play visibly blooms more blocks and sounds louder), pitch steers direction+hue, and it is audio-visual on the first gesture and in idle demo. The real `VideoEncoder`/`VideoDecoder` path is the primary render, with a fully working software fallback. Honest caveat: it can only be exercised in a real browser — see the build report for which path actually ran.
