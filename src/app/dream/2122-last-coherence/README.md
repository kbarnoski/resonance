# 2122 — The Last Coherence

**Tags:** input: audio-file (optional) / autonomous · output: WebGPU compute (particle sim) · technique: gamma-surge coherence-binding of a memory-mote field · palette: cosmic-ambient (deep void → violet/warm-gold light) · pole: **cosmic-ambient** (calm, boundless — not intense/strobing).

## What it is

A near-death experience rendered **not** as a tunnel-to-light you travel down, but as the dying brain's own memory-material igniting into a single **coherence surge** — your whole life binding together at once, then releasing into light. The visual is the **inverse of dissolution**: a scattered, dis-connected field undergoing a coherence *phase-transition* into hyper-connection.

A cloud of ~200,000 "memory-motes" drifts scattered and dim. One scalar **C** (coherence, 0→1→0) drives everything across a ~6-minute autonomous, looping arc:

1. **FADING (~0–60s)** — the field is dispersed; senses withdrawing. Thin drone, sparsest piano fragments.
2. **THE SURGE / BINDING (~60–180s)** — `C` rises as a **slow luminance ramp** (the gamma surge; ≪3 Hz, never a strobe). Motes are pulled toward 24 cluster centroids and snap into brilliant connected constellations; each surfacing cluster is a piano memory fragment growing louder and overlapping. *Everything connected at once* — the life review made literal.
3. **BOUNDLESS LIGHT (~180–300s)** — all clusters converge toward one radiant point; the field becomes a single breathing luminous whole; fragments overlap into a sustained chord of a whole life.
4. **RETURN (~300–360s)** — `C` releases, the light recedes, motes disperse back to drift. Loop.

## The technique

- **Tier 1 — WebGPU compute.** A compute shader (`shaders.ts`) integrates every mote each frame into a storage buffer: a weak dispersal force toward a scattered home when `C` is low; centroid attraction + a binding term scaled by `C` as it rises; the 24 centroids themselves converge toward one point (`converge`) at the boundless peak. Rendered as instanced soft **additive** points reading the same buffer, colour walking deep-void violet → warm gold → white-gold with `C`. Velocity is hard-clamped in-shader so it cannot blow up.
- **Tier 2 — Canvas2D fallback** (`runCanvas2D`). The same arc and binding read with ~3,200 motes, additive `lighter` compositing over a void-fade trail. This is the solid, review-by-default path on non-WebGPU browsers.
- **Tier 3** — on-brand `text-destructive` notice if neither renders. Audio plays regardless.
- **Arc** (`arc.ts`) is a pure function of loop time, so audio and visuals derive `C`/`converge`/phase from their own clocks. `C` is additionally slew-limited in each renderer.
- **Audio** (`audio.ts`) — the carrier is Karel's piano *as the memory material*: a deterministic **seeded generative-piano** voice (warm 3:1 FM), mulberry32 seeded with the fixed constant `0x2122`, scheduled sparse → dense → overlapping → thinning across the arc. A slow just-intonation drone (`_shared/psych/droneBank`) + a code-generated void reverb (`_shared/psych/convolutionVoid`) sit under it, everything through a `DynamicsCompressor` limiter. **Optional "Drop a piano track"** decodes a file **locally** (no network/fetch) and grain-samples windowed fragments from its buffer as the memory material; if absent, the seeded carrier plays. AudioContext is gated behind Begin and the whole graph tears down on unmount. No struck-bell events; the banned Chladni ratios `1, 2.76, 5.40, 8.93` are never used.

## Grounding (2026 neuroscience)

- **Borjigin et al., "Surge of neurophysiological coupling and connectivity of gamma oscillations in the dying human brain," PNAS 120 (2023)** — at death, gamma power spikes up to ~300× baseline in the temporo-parieto-occipital junction with long-range coupling to prefrontal cortex: a sudden hyper-*coherence* of the kind that could bind and encode memory. This is the piece's central mechanic, rendered as the `C` surge.
- **"Near-death visions as a final internally-generated simulation," Frontiers in Psychology (March 2026)** — the dying brain replays its *own* stores (memory, emotion, belief, imagery) as a last simulation, not an external realm. Hence memory-*motes*, not a portal.
- **Raymond Moody, *Life After Life* (1975)** — the phenomenology anchor: the panoramic life review ("everything connected at once").

## Safety

Cosmic-ambient pole: boundless and calm. The coherence/gamma surge is a **slow luminance ramp** (a 120-second `smoothstep`, ≪3 Hz), slew-limited, honoring `prefers-reduced-motion` (calmer swirl, smaller breath, slower slew). No strobing. A limiter guards audio level.

## Honest headless-unverified flags

Authored without a GPU or audio device — **not run**:

- **The WebGPU path is unverified.** Pipeline compile/validation, the storage-buffer bind layouts, the instanced additive-blend look, and overall performance at 200k motes have not executed. All fallible setup (`requestAdapter`/`requestDevice`/shader modules/pipelines) is wrapped in a validation error scope and try/catch, and the canvas `webgpu` context is only configured **after** every pipeline validates — so any failure should fall through cleanly to Canvas2D without a blank screen or a consumed context. This fall-through logic is itself unverified.
- **Force/damping tuning is by-feel.** The binding may collapse too hard or too softly; velocity is clamped so it cannot diverge, but the aesthetic of the "snap" is untested.
- **Audio balance is unverified** — grain windowing, FM brightness, drone/reverb/limiter gain staging were set by ear-on-paper only.
- The Canvas2D + Web Audio fallback is the safer, verified-by-design path.
