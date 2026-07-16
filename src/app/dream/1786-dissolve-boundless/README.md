# 1786 · Dissolve / Boundless

## The one question
**What if slowing your breath could literally dissolve the boundary of your
"self" — a tight luminous sphere of half-a-million GPU particles unravelling into
a boundless, all-filling glow (drug-free ego-dissolution / meditative
boundlessness), then re-cohering the moment you move?**

## State / pole
Ego-dissolution / meditative boundlessness · pole: **cosmic-ambient** (calm,
slow, awe — no intense strobing).

## Tags
- **INPUT** — breath / stillness via mic RMS. An `AnalyserNode` reads ambient
  loudness; quieter & stiller = deeper dissolution. When no mic permission is
  granted, an always-on autonomous **ghost breath cycle** drives the piece, and
  a graceful "no mic" notice is shown in the `text-destructive` token.
- **OUTPUT** — a **WebGPU compute shader** (WGSL `createComputePipeline`, storage
  buffers, ping-pong). Particle position + velocity are stepped on the GPU each
  frame and rendered as additive point billboards by a WebGPU render pipeline.
  No Canvas2D, no fragment-shader-as-sim.
- **CORE TECHNIQUE** — a cohesion↔diffusion field. Every particle feels
  (a) a spring pull toward a shared sphere-shell scaled by `cohesion`, and
  (b) a curl/noise diffusion + gentle outward drift scaled by `(1 - cohesion)`.
  `cohesion` is driven 1→0 as stillness holds: at 1 the swarm is a tight bright
  sphere ("the ego"); at 0 it spreads into a vast, even, viewport-filling glow
  ("boundless awareness"). Movement / loud sound pushes `cohesion` back up.
- **PALETTE / VIBE** — cosmic-ambient, cool violet→white glow on near-black.

## How it works

### 1. WebGPU compute simulation (`compute.ts`)
- `PARTICLE_COUNT = 2^19 = 524,288` particles. Position (`vec4`, xyz + per-particle
  seed) and velocity (`vec4`) live in **four storage buffers** — two position, two
  velocity — **ping-ponged** each frame.
- Initial state: a Fibonacci-sphere shell at radius `r0` with slight radial jitter
  — the coherent "ego" sphere (written via `mappedAtCreation`).
- A `@compute @workgroup_size(64)` pass reads the current buffers and writes the
  other. Per particle, per frame:
  - `spring = -kSpring · (r − r0) · dir · cohesion` — the cohesion pull toward the
    shell (plus a small tangential swirl so the coherent sphere stays alive);
  - `diffusion = curl(p, t) · diffuse · (1 − cohesion)` plus an outward drift
    `dir · expand · (1 − cohesion)` — the unravelling;
  - integrate in real seconds, `v *= exp(−drag·dt)` (frame-rate-independent
    damping), then a **toroidal wrap** into `[−bound, bound)` so the diffused
    swarm distributes evenly and fills space. When cohesive the swarm sits at
    `r0 ≪ bound` and never touches the wrap.
- A render pipeline draws each particle as an **instanced additive soft-disc
  billboard** (`draw(6, count)`), reading positions from a read-only storage
  buffer in the vertex stage, orthographically projected with a slow Y-tumble.
  Additive blending does the aesthetics for free: dense overlap in the tight
  sphere blooms toward white-hot; the thin dispersed field reads as a dim, even
  violet luminescence.

### 2. Breath / stillness detector (`page.tsx`)
- An `AnalyserNode` (`fftSize 1024`) over the mic stream; each frame we compute
  **RMS** of the time-domain buffer and map it to an "arousal" via `smoothstep`.
- `cohesion` chases arousal **asymmetrically**: dissolving is *slow*
  (`~0.16 s⁻¹` — you must hold stillness for several seconds), re-cohering is
  *fast* (`~2.6 s⁻¹` — any movement/sound snaps the self back).
- No mic → an autonomous **ghost breath**: `cohesion` follows
  `pow(0.5 + 0.5·cos(2π t / 46s), 2.6)` — long troughs in boundlessness, brief
  returns to the sphere — demonstrating both poles hands-free.

### 3. Audio (`audio.ts`)
- Real Web Audio, created inside the "Begin" gesture. The shared
  **`startDroneBank`** (just-intonation, cool root) and **`startShepard`**
  (endless Risset drift) feed a gentle master bus.
- Both track the same scalar: as `cohesion` falls (dissolution deepens) the
  drone's `drive` rises — its lowpass opens and it detunes wider — and the
  Shepard `drive` brightens; as the swarm re-coheres both pull back to a calm
  narrow sub. `shepard.step(dt)` is called every frame.

### 4. Fallback & safety
- No `navigator.gpu` / no adapter → a typed `WebGPUUnsupportedError` is caught and
  a lightweight **CSS/DOM bloom** stands in (a central glow that tightens/brightens
  with cohesion under a full-bleed violet wash) — audio and the dissolution logic
  still respond. Never throws unhandled.
- **No alpha-band flicker.** The only luminance motion is a ~0.08 Hz breath drift,
  far below the danger band. `prefers-reduced-motion` slows the tumble/drift.
- Clean teardown: rAF cancelled, `AudioContext` closed, mic tracks stopped, all
  GPU buffers/pipelines destroyed on unmount.

## Named reference
Nour, Evans, Nutt & Carhart-Harris, **"Ego-Dissolution Inventory (EDI)"**
(*Frontiers in Human Neuroscience*, 2016); and Millière / Letheby on the
phenomenology of **drug-free ego-dissolution** — the dissolving of the felt
boundary between self and world. The sphere is the bounded self; the boundless
glow is its dissolution.

## Honest limitations
- The "curl" flow is a cheap trig field, not true divergence-free curl noise, so
  the diffused distribution is only approximately uniform; even fill relies partly
  on the toroidal wrap.
- Additive-emission brightness and the RMS→arousal thresholds were tuned by eye
  (no live GPU/mic was available at build time); very loud or very quiet rooms may
  want the `smoothstep(0.01, 0.075, rms)` bounds or the `0.03` emission base
  adjusted.
- One compute substep per displayed frame — at very low frame rates the elastic
  re-coherence can look a touch springy (bounded by the `exp(−drag·dt)` damping).
- Orthographic projection with ~1.18× overscan fills most of the viewport at full
  dissolution; extreme aspect ratios leave faint margins.
- The mic path needs user permission and a reasonably quiet room to reach full
  boundlessness; the ghost cycle is the guaranteed-working demo path.
