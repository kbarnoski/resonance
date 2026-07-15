# 1762-nde-void

**One question:** *What if you could tilt your phone to gaze around a vast, cold, sparse architectural VOID — the ketamine k-hole / near-death "in-between" — where each distant luminous structure is HRTF-spatialised so it sings from its true 3-D position, sweeping front → across-your-head → behind as you drift past it?*

- **State:** ketamine k-hole / near-death "in-between" (dissociative)
- **Pole:** dissociative (the cosmic-ambient family's colder, more architectural cousin)
- **Input:** device tilt / gyro (`deviceorientation`, permission requested inside the Begin gesture on iOS) → gaze, with a desktop `pointermove` fallback and an always-on autonomous drift/orbit ghost
- **Output:** three.js full-viewport `ShaderMaterial`, a raymarched sparse-SDF scene
- **Technique:** raymarched glow-accumulated SDF architecture + per-structure `PannerNode` (HRTF, inverse distance) spatial audio + convolution void reverb, all reading **one** shared geometry table

## The concept

You take nothing. Tilt and sound do the work. Your body drifts forward on rails through a cold, near-empty architectural space; your **gaze roams independently** of that fall. That split — a body dropping while attention floats free — is the dissociative core. Seven sparse luminous structures (portal tori, box-frame mullions, hyperbolic-paraboloid saddles, arches) hang in the black. As the drift carries you past one, it sweeps from ahead of you, across your head, to behind — and because its **sound** is bound to the same position as its **light**, you hear it relocate exactly as you see it pass.

## The defining move: one geometry, two senses

`scene.ts` is the single source of truth. `relPositions(drift, out)` returns each structure's camera-relative position every frame. That **same array** feeds:

1. the shader — written into the `uStructPos[]` uniform the fragment shader sphere-traces; and
2. the audio — written into one `PannerNode.position` per structure, with the `AudioListener` forward/up set from the same gaze basis the shader uses for its ray directions.

There is no second copy of the scene, so sight and sound cannot drift apart. Passing a structure genuinely moves its HRTF bell to wherever its glow now is.

## Subsystems (≥4 real ones)

1. **Gaze input** — tilt/gyro (`gamma`→yaw, `beta`→pitch) with weightless inertia, a desktop pointer fallback, and an always-on autonomous ghost sweep so it is alive with zero interaction.
2. **Raymarched SDF void** — a three.js `ShaderMaterial` full-viewport quad; volumetric sphere tracing (≤80 steps at ~0.6× resolution) accumulating glow `exp(−d·k)` with no lighting model, over seven sparse structures with four SDF vocabularies.
3. **HRTF spatial audio** — one `PannerNode` (`panningModel:"HRTF"`, `distanceModel:"inverse"`) per structure, positions + listener orientation written from the shared geometry every frame; each structure sings a cold, **inharmonic** bell (Risset partial ratios 1.0 / 2.76 / 5.40, tiny detune → shimmer/beat, never clean just intonation).
4. **Void ambience** — `createVoidReverb` cavern tail (wet-heavy) plus a dark, near-silent sub; master chain ends `DynamicsCompressor → gain ≤ 0.14 → destination` so nothing clips.

## Named references

- **Pim van Lommel** — NDE tunnel / "in-between" phenomenology (*Consciousness Beyond Life*).
- **Ketamine k-hole / ego-dissolution literature** — e.g. Frontiers, "ketamine ego dissolution"; the dissociative-anaesthetic altered-state work.
- **Heinrich Klüver (1926)** — the tunnel/cone form-constant of visual hallucination.
- **Web Audio HRTF / KEMAR binaural rendering** and the **2025–26 spatial-audio surge** — e.g. the ASAudio survey (arXiv:2508.10924) and HRTFformer (arXiv:2510.01891).
- **Inigo Quilez / Shadertoy** — volumetric-SDF sphere-tracing technique.

## Honest limitations

- **Not a new technique.** Raymarching and HRTF both already appear in the lab. The novelty is the *combination* — a **steerable spatial dissociative void** where one geometry table welds a marched scene to its binaural rendering.
- **Headphones.** The binaural payoff needs headphones; on laptop speakers HRTF collapses toward stereo (still audibly directional — the UI and this doc say so).
- **Not a medical claim.** This *evokes* a phenomenology reported around NDE and ketamine states. It says nothing scientific about what those states are.

## Safety

No strobe. Luminance changes are slow drifts (well under 0.3 Hz); rendered brightness is tone-mapped and hard-clamped ≤ 0.7 (no white-out). `prefers-reduced-motion` slows the forward drift, per-structure rotation, and gaze-ghost.

## Determinism (headless verification)

The instant it starts, a self-driving deterministic ghost gaze-sweep + forward drift runs, so it is never blank or silent without a GPU, speakers, or a gyro. Every visual/audio/state decision is driven by an integer frame counter (`uTime = frame / 60`); all placement noise is a seeded mulberry32. No `Math.random`, `Date.now`, `new Date`, or `performance.now` appears in the render/audio/state path.

## Graceful degradation

- **WebGL/three fails** → on-brand notice, audio keeps playing (the void is never silent).
- **Gyro denied** → `text-destructive` note, falls back to pointer + ghost drift.
- **No gyroscope (desktop)** → `text-muted-foreground` note, pointer + ghost drift.

## Files

- `page.tsx` — client component: UI, three.js setup, gaze input wiring, render loop, teardown.
- `scene.ts` — the shared geometry table; `relPositions()` consumed by both shader and audio (pure/deterministic).
- `shader.ts` — vertex + fragment GLSL (raymarched glow-accumulated SDF; prepends `PALETTE_GLSL`).
- `audio.ts` — the spatial audio engine (per-structure HRTF panners, listener from gaze, void reverb, sub, master compressor).

## Next-cycle deepening

A richer SDF vocabulary (vaults, colonnades, interference lattices); a true head-tracked listener driven from the camera transform; per-structure timbre keyed to its form; and depth-of-field / parallax cues to deepen the sense of scale in the void.
