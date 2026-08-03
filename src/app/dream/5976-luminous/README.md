# 5976 · Luminous

**What if you could travel, wordlessly, through a near-death experience as a real 3D space** — flying forward out of a dark void, up a luminous tunnel, into an enveloping being of light, and gently back? No words, no meters, no explanation. It plays itself. You watch, and listen.

## The piece

A single self-playing ~4.5-minute passage. One eased `progress ∈ [0,1]` drives everything — where the camera is along the tunnel, how tightly the mote-field organizes, how warm the light is, how dense the fog, and which just-intoned overtones are sounding. The world is genuinely in a different state at minute 4 than at minute 1; it is an arc, not a loop.

The only interface is a centered **Begin** button (audio needs a user gesture; it fades away after start) and a quiet corner **Design notes** link. Before you press Begin the 3D field is already alive and drifting, so the piece reads silent-but-living.

## The arc — the canonical NDE stages

The structure follows the near-death stages reported in **Raymond Moody, _Life After Life_ (1975)**: darkness → tunnel → being of light → boundary → return.

| progress | stage | look | sound |
|---|---|---|---|
| 0.00–0.15 | **The void / darkness** | near-black indigo, a few faint drifting motes, camera nearly still | one low drone (root + octave) |
| 0.15–0.45 | **The tunnel** | motes and rings draw into a shell of light the camera flies up; a warm point appears far ahead and grows | a just fifth (3/2) enters |
| 0.45–0.75 | **The being of light** | the radiance blooms to fill the field; the field warms from violet toward gold | major third (5/4), then 7/4 emerge |
| 0.75–0.90 | **The boundary / peak stillness** | camera slows almost to rest inside a boundless, edgeless field of light | maximal warmth, minimal motion |
| 0.90–1.00 | **The gentle return** | the light recedes and cools back to indigo | overtones withdraw to the root; ends calm and holds |

## Technique — a genuine 3D embodied traversal (three.js)

This is not a diagram of a journey; it is a journey. A `THREE.PerspectiveCamera` physically moves **forward** along the tunnel axis through staged 3D volumes — you are inside the space.

- **Additive-glow, no post-processing.** Thousands of `THREE.Points` share one in-code radial-gradient sprite texture (built as a pure-math `DataTexture` — no canvas) and render with `THREE.AdditiveBlending`. Overlapping additive halos _are_ the bloom. The "being of light" is a nested stack of warm additive sprites that grows ahead and finally floods the field. No `EffectComposer`, no bloom pass, no external shader library.
- **A morphing field.** Each mote carries a diffuse "void" radius and a tight "tunnel-wall" radius; the shared `tunnelStrength` lerps between them, so the formless cloud collapses into a tunnel you fly up and relaxes again on the return.
- **Rings as rungs.** Concentric point-rings are pinned along the axis; as the camera passes one it fires a soft bell. Per-vertex colour is written every frame — cool violet in the void, warming to gold toward the light.
- **Depth from fog.** `THREE.FogExp2`, with the renderer clear-colour taken from the same fog colour, gives real atmospheric depth — near-black indigo that turns to enveloping gold at the peak.

The camera always gazes toward the light, which sits above the axis, so the forward glide reads as an ascent.

## Sound (Web Audio, wordless)

A just-intonation drone over a low root (A1, 55 Hz) built from `OscillatorNode`s. It starts as root + octave and **adds** tuned overtones — perfect fifth (3/2), major third (5/4), harmonic seventh (7/4) — as the camera nears the light, then withdraws them on the return, so the harmony literally comes home. A slow amplitude "breath" LFO (~0.035 Hz) modulates the master. Passing a tunnel ring rings a soft bell (additive partials, long decay, just pentatonic). Everything runs through a short generated-impulse `ConvolverNode` reverb, a low master gain (≤ 0.16), and a `DynamicsCompressorNode` acting as a limiter. Audio is built only on the Begin gesture.

## Lineage

- **Raymond Moody, _Life After Life_ (1975)** — the coined term "near-death experience" and the canonical stage sequence (darkness → tunnel → being of light → boundary → return) this arc is built on.
- **James Turrell** — perceptual light spaces where light itself becomes a boundless, edgeless medium; especially _As Seen Below – The Dome_ (ARoS, Aarhus, opened June 2026), a corridor leading into a domed chamber of enveloping light — a direct model for the "boundary" stage where the field loses its edges.
- **Karolina Halatek, _Terminal_ (2024, Tirana)** — a walk-through white-light NDE tunnel — and **_Echo_ (Digital Art Festival Istanbul, June 2026)** — light as a threshold you cross.

## Safety & determinism

- **Strobe-safe.** No flicker or strobe above 3 Hz — only slow, continuous luminance drift. `prefers-reduced-motion` further damps the camera sway and roll.
- **Deterministic.** No `Math.random()`, `Date.now()`, or `new Date()`. A seeded `mulberry32` (seed `0x5976`) supplies every stochastic choice; time comes only from `performance.now()` / rAF deltas.
- **Degrades gracefully.** Renderer creation is guarded (capability probe + try/catch + context null-check); if 3D fails, an on-brand notice appears and the drone still carries the journey.
- **Cleans up.** Geometries, materials, textures, the renderer, the audio graph, and the animation frame are all disposed on unmount.

## Files

- `page.tsx` — UI + lifecycle (Begin gesture, render loop, cleanup)
- `journey.ts` — the NDE arc: progress → camera path + colours + parameters
- `scene.ts` — three.js scene / camera / renderer / fog / being-of-light sprites
- `motes.ts` — the point-field and tunnel rings + per-frame update
- `audio.ts` — drone + reverb + bells + limiter
- `rng.ts` — deterministic mulberry32 PRNG
