**For**: kids (4+) and patient adults — inhabit a presence, not solve a puzzle.

**What if** a 4-year-old had a single small living "ember" / glowing field-creature that is simply HERE with them — never won, never lost, no goal — that they keep company by humming, and over many minutes it slowly BECOMES something new, carrying a trace of everything they gave it, never returning to where it started?

---

## Subsystems

1. **Voice / mic analysis** (`page.tsx` + Web Audio `AnalyserNode`)  
   `getUserMedia({audio:true})` feeds a raw `AnalyserNode`; per-frame RMS from the time-domain buffer drives the ember. Any humming counts — no pitch matching required. If the mic is denied, an auto-demo envelope (`memory.ts:autoDemoRms`) generates a soft oscillating RMS so the ember breathes and evolves hands-free.

2. **Long-form memory + evolution engine** (`memory.ts`)  
   Two slow drift functions — each a sum of 4 incommensurate LFOs at irrational-ratio frequencies (π, e, √2, φ relative to a 300-second base period) — traverse the Gray-Scott parameter space continuously. Accumulated child hum energy (`cumulativeHum`, monotonically increasing, never decremented) biases the feed/kill rates permanently. The state at minute 5 is demonstrably different from second 30; the system never loops back.

3. **WebGPU compute renderer** (`gpu.ts`)  
   A 512×512 Gray-Scott reaction-diffusion field running as a WGSL compute shader on the GPU. Ping-pong storage textures (`r32float`) are stepped 3× per render frame. A full-screen WGSL render pipeline maps inhibitor (V) concentration to warm ember colors: deep crimson → amber → gold → soft white core. Humming raises the feed rate in the shader and deposits V-seeds, triggering warm Turing fingers that bloom outward.

4. **Evolving lullaby synth** (`audio.ts`)  
   Pentatonic / just-intonation pad (C3 major pentatonic, just-ratio intervals) through a slowly-sweeping warm filter. A detuned drift-layer oscillator glides between scale degrees as the drift state changes. A sub-bass C2 sine provides warmth that is felt rather than heard. Soft bell/pluck tones fire on each hum burst. A `DynamicsCompressor` brick-wall limiter and an 8 kHz lowpass ceiling protect kids from sudden-loud or harsh sounds. All audio parameters are updated ~4×/s from CPU-side drift state — no GPU readback.

---

## Degradation

- **WebGPU absent or refused**: `buildEmberGpu()` returns `null`; the page shows a CSS radial-gradient breathing ember (`#ember-fallback`) with `@keyframes ember-breathe` and `pulse-outer`. Audio and memory/evolution continue normally — the CSS ember's scale and hue-rotate are updated every rAF from the same drift state, so it still evolves.
- **No mic / permission denied**: Sets `micError` message in `text-rose-300`; auto-demo RMS takes over so the ember always breathes and evolves.
- **Both absent**: Auto-demo + CSS ember — a complete hands-free experience always available.

---

## References

- **teamLab** *Sketch Aquarium / Future Park* — a creature you inhabit and keep company, not a puzzle to solve.
- **Brian Eno** *Ambient 1: Music for Airports* (1978) — long-form, non-repeating, no cadence, no arrival.
- **Pearson, J.E. (1993)** "Complex Patterns in a Simple System." *Science* 261, 189–192 — the Gray-Scott model producing Turing-class spots, stripes, and worms.
- **Gray & Scott (1983, 1984)** — the original U/V autocatalytic reaction-diffusion equations.
- **490-disintegration** (this lab) — predecessor: same "no solve button" courage, made warm instead of entropic.

---

## Next-cycle deepening (cycle 1 of a kids "Companion / Presence" spine)

- **Embodied seeding**: track approximate touch/tap position on the canvas and drop V-seeds exactly where the child touches, so their hand leaves glowing fingerprints in the ember.
- **Long-term persistence**: serialize `cumulativeHum` and `lastT` to `localStorage` so the ember greets the child exactly where it was when they left.
- **Richer morphology traversal**: expand the LFO bank to also modulate Du/Dv (diffusion coefficients) so the field traverses spots → stripes → worms over a full 20-minute arc.
- **Spatial audio**: when the child taps different parts of the screen, bell tones pan to match (Web Audio panner node).
