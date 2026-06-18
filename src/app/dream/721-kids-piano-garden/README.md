**For**: kids (4+)

# Papa's Piano Garden

## The one question

What if a 4-year-old could **grow a glowing garden of light by humming into the
tablet** — and every petal that blooms is made from Karel's OWN real recorded
piano?

A near-dark deep field of luminous motes. The child hums or blows softly into
the mic (analysis-only — **never recorded, never sent**). Their breath energy
and pitch stir thousands of glowing particles that drift, gather, and bloom
into soft flower-like clusters. The sound each bloom makes is **concatenative
grains of Karel's real solo-piano "Welcome Home" recording**: a louder hum
scatters more, brighter seeds from busier parts of his piece; a low gentle hum
settles dark, warm grains low in the field. No beat, no loop, no sequencer —
just a calm, breathing texture of growing light and warmth. Nothing is ever
"wrong"; every hum makes the garden more beautiful.

## Tags

- **Input** — microphone (breath / hum, analysis-only). Embodied vocalization,
  NOT finger-on-glass. `getUserMedia` runs with echoCancellation /
  noiseSuppression / autoGainControl all **off** for clean breath onsets, and
  the stream is only ever read by an `AnalyserNode`.
- **Output** — **WebGPU compute-shader particle field** (PRIMARY): 8192
  particles advected on the GPU in a WGSL compute pass, drawn additively as
  soft glowing petals. A **first-class Canvas2D particle fallback** (~2400
  motes) reproduces the exact same gather-and-bloom behaviour when WebGPU is
  absent. A kid deserves the scarce renderer when it's there.
- **Core technique** — **concatenative grain resynthesis** of Karel's real
  recording (CataRT-style descriptor navigation). Voice ENERGY (RMS from the
  analyser) maps to the number of grains triggered and the scatter radius;
  voice PITCH (a cheap zero-crossing estimate) maps to the `ny` / brightness
  axis of the descriptor space, so a high hum blooms bright high seeds and a
  low hum blooms dark warm low seeds. `selectNearest` picks grains near the
  (time, brightness) point; each plays as a Hann-windowed
  `AudioBufferSourceNode` slice. This is a texture, NOT a groove or a cadence.
- **Vibe** — tender / luminous / contemplative. Deliberately not silly-comedy.

## Named references borrowed

- **Diemo Schwarz — CataRT** concatenative synthesis: the idea of shattering a
  recording into a cloud of analyzed grains and *navigating* it by descriptor
  position (here: time-through-the-piece × brightness) rather than playing it
  back in order. The corpus analysis in `audio.ts` (RMS + zero-crossing-rate
  brightness proxy → 2D descriptor space) and the `selectNearest` retrieval are
  the CataRT "selection by location" step.
- **Refik Anadol** — luminous, data-driven particle fields: the aesthetic of
  thousands of soft motes drifting and accreting into living light.
- **WebGPU on iOS Safari 26 (2026)** — the enabling fact. WebGPU now ships on
  iPad/iPhone Safari, so the compute-shader particle field is a *real* primary
  target on the tablets a 4-year-old actually holds, not a desktop-only luxury.

## Graceful-degradation chain

- **Renderer:** WebGPU compute particles → Canvas2D particle field (same
  gather-and-bloom physics, additive glow with a soft trailing fade).
- **Mic:** live breath/hum analysis → if denied OR idle > 2.5s, a scripted
  **ghost breath** auto-stirs the garden and blooms grains on its own, so the
  view is ALWAYS live, sounding, and moving with zero permission. Mic denied
  shows a friendly `text-rose-300` notice and keeps the ghost demo running.
- **Sound source:** Karel's real "Welcome Home" recording (fetched via the
  existing public `/api/audio/:id` GET, read-only) → on ANY failure, an
  offline-rendered soft harmonic fallback tone, so the grain corpus is never
  empty. A small `text-rose-300` notice surfaces when the demo tone is playing.

## Kids-safety

Everything routes through `grain bus → master gain → lowpass(7.5kHz) →
DynamicsCompressor(threshold -10, ratio 20:1) → destination`, so no transient
can ever blast. An always-on soft ambient drone pad means the garden is never
silent. The Start button holds the iOS audio-unlock + `getUserMedia` inside the
first user gesture. Full teardown of the mic stream, AudioContext, oscillators,
and rAF happens on unmount.

## Unverified

The build sandbox has **no GPU, no microphone, and no audio device**, so the
WebGPU compute path, the live mic analysis, and the real-piano fetch/decode are
type-checked and ESLint-clean but **not runtime-verified here**. The WGSL
shaders, the descriptor-navigation grain triggering, and the ghost-demo timing
are written against the documented APIs and the proven `audio.ts` loader copied
from `720-paths-grainfield`, and should be confirmed on a real WebGPU-capable
tablet with a microphone.
