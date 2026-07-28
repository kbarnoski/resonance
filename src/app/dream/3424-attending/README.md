# 3424 — attending

**The one question:** *What if attention were a gift that grows things — and nothing you ever noticed could be lost?*

A living field of ~37 soft voice-glyphs, seated on a golden-angle **phyllotaxis spiral** and rendered as **inline SVG**. Each glyph is a small breathing bloom that hums a continuous-pitch tone. Wherever the visitor's attention settles, nearby glyphs brighten, unfurl their petals, and rise from a resting hum-floor into a fuller voice that thickens a slow drone. **Moving your attention away subtracts nothing** — every glyph keeps everything it was ever given and holds at its earned brightness, humming on.

The governing scalar per glyph is a **monotonic, non-decreasing `bloom` value in [0,1]**. Every code path in `field.ts` can only ever *add* to it. There is no score, no decay, no eviction, no timer, no wrong move, no win or lose. This is the deliberate emotional **inverse** of a working-memory piece where adding steals from what is already held.

## How it works

- **The field** (`field.ts`) — `makeField()` seats `GLYPH_COUNT` glyphs at `angle = i · 137.507°`, `radius = c · √i` (Vogel's model), each with a continuous, un-snapped frequency spanning ~2.4 octaves. `applyBloom()` is the only mutator: it deposits a Gaussian well of attention at a focus point, and bloom rises asymptotically toward 1. It never subtracts.
- **Attention, in priority order** (degrades gracefully):
  1. **Mic-presence** (preferred) — via the shared `useMicAnalyser` hook. `amplitude` (RMS, "is the room present") sets how strongly the focused region blooms; `centroid` (Hz, log-scaled) chooses *which* region (low → inner/low glyphs, high → outer/high glyphs). Continuous — no pitch snapping.
  2. **Pointer/touch** fallback if the mic is denied — moving over the field lends attention where you point.
  3. **Seeded autopilot** — a deterministic `mulberry32(0x3424)` wander that biases toward the **least-bloomed** region, so the field fills itself over ~60s with zero input. A weak baseline trickle also runs under live input, so the field is always, gently, being tended.
- **Constellation memory** (the deepening) — faint SVG lines connect glyphs in the order they were first noticed, so the *shape of the visitor's attention* accretes visibly as a growing constellation. Still no-stakes.
- **Audio** (`audio.ts`) — one 2-partial additive sine voice per glyph (fundamental + a gently detuned twin for slow beating warmth). Each voice's gain is a quiet floor plus `bloom · fuller`, ramped with `setTargetAtTime` so there are never clicks. A slow (0.05 Hz) LFO drifts a master lowpass for an evolving pad; a limiter guarantees the summed field never clips harshly.

## Safety & determinism

- No strobe/flicker: all brightness change is slow luminance drift. Breathing runs at 0.12 Hz; blooms ramp gradually.
- No `Math.random`, `Date.now`, or argless `new Date()` — randomness is `mulberry32(0x3424)`, timing is `performance.now()`.
- Output is **inline SVG** (a deliberate diversity requirement — not Canvas2D, not WebGL).
- Clean teardown: oscillators stopped, `AudioContext` closed, `requestAnimationFrame` cancelled on unmount; `<AudioCleanup />` mounted as a backstop.

## Named references

- **Weiser & Brown, "The Coming Age of Calm Technology" (1996)** — information in the *attentional periphery*, at low cognitive load. Recently restated by Hubenschmid et al., *"Ambient Analytics: Calm Technology…"* (arXiv:2602.19809, Feb 2026).
- **Brian Eno** — generative ambient, "music that makes itself."
- **Phyllotaxis / golden-angle packing** — Vogel's model of sunflower seed arrangement.
- Framed as the positive inverse of **retroactive interference** (Miller, "The Magical Number Seven," 1956): here, adding is *never* subtracting.

## Tags

input: mic-presence · output: inline-SVG · technique: monotonic attention-bloom / phyllotaxis field · vibe: no-stakes / calm / care.

## What's rough

- The mic → region mapping keys on spectral centroid alone, so a bright hum and a bright consonant land on similar regions; it reads more as "where the energy is" than fine pitch control. Good enough for presence, not an instrument.
- With ~37 continuous, densely-packed frequencies the drone is intentionally a soft cluster; on cheap speakers the sub-audible beating can feel a touch muddy. Levels are kept low and lowpassed to compensate.
- Autopilot fill time depends on frame rate and retarget jitter; ~60s is typical, not guaranteed.
- Constellation lines are a single flat polyline in notice-order; a per-segment fade would read even better but wasn't needed for demoable.
