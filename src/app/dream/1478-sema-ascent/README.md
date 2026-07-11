# 1478 · Sema Ascent

**One-line pitch:** A drug-free Sufi *sema* rendered as a self-evolving six-minute climb — nested rings of light spin at locked polyrhythmic ratios, accelerate, phase-lock into a white-hot peak, then set you gently down. An **ascent**, not a dissolve.

Route: `/dream/1478-sema-ascent`

---

## How it works

### The whirl — a real three.js scene-graph
Nine **nested shells of light**, each an `InstancedMesh` of flame-shard "petals" plus an additive glow halo, stacked and tilted like a gyroscope / orrery. This is legible 3D geometry with perspective and depth — **not** a full-screen fragment shader and **not** a point cloud. A camera-facing `Sprite` core swells white-hot at the peak. All glow is additive emissive (`MeshBasicMaterial` + `THREE.AdditiveBlending`); no post-processing pass, so it stays fast and robust. Draw calls are kept modest (~2 instanced meshes per shell + backdrop + core).

### The polyrhythm — one shared conductor
A single `Conductor` owns time. Each shell spins at an angular velocity in integer ratio **2:3:4:5:6:7:8:9:11**. Because the ratios are coprime-ish, the composite pattern is always shifting and only *momentarily* aligns — it never repeats on a short loop. Shells counter-rotate (alternating direction) so the whole reads as one breathing gyroscope. At the **Fana** peak the effective ratios blend toward one shared velocity, so the shells **phase-lock** into a brief blazing alignment.

### The arc — ~6 minutes, stateful, non-repeating
`evalArc(elapsed, energy, reduced)` drives five distinct movements that evolve **monotonically** (not on a short loop):

| Movement | ~Window | Character |
|---|---|---|
| I Invocation | 0–40 s | one slow shell, sparse pulse |
| II Gathering | 40–130 s | shells ignite one by one, tempo creeps up |
| III Acceleration | 130–250 s | polyrhythms tighten, gold warms toward white |
| IV Fana — the lock | 250–300 s | shells converge, core swells white-hot (one-time peak) |
| V Descent | 300–360 s | slows, cools to amber embers, comes to rest |

**Memory:** accumulated *trance energy* from user surges is retained and biases the climb (tempo, ignition, flare), so no two runs are identical, and minute 6 (embers) genuinely differs from minute 1 (a single slow ring). After 360 s it loops gently back to Invocation (cycle counter increments) — it never freezes into a dead screen.

### Audio-visual coupling — Web Audio, pure synth (no files)
- A **continuous inharmonic drone** ground glides underneath (detuned saw/triangle oscillators through a lowpass whose cutoff rises with intensity, plus a shimmer that brightens at the peak). Pitch glides continuously — **never** snapped to a just/pentatonic scale.
- Every **bell hit is fired by a ring rotation crossing a phase gate** on the same conductor: *what you see spin is what you hear pulse.* Bells are inharmonic (two partials at a 1 : 2.76 ratio, fast decay), panned by shell.
- Density and brightness rise to the peak and thin out in the descent.
- **Master chain:** sources → `DynamicsCompressor` (limiter) → master gain that ramps from silence (peak ≤ 0.2) → destination. Concurrent voices capped at **14** with a per-shell cooldown.

### Input
- **Primary — device orientation (tilt):** lean the phone to tilt the whirl axis. iOS permission is requested from the Begin tap (`DeviceOrientationEvent.requestPermission()`).
- **Tap / click / Space = surge:** boosts trance energy and speeds the climb.
- **Desktop / no-tilt fallback:** pointer position gives a gentle lean, Space surges. The piece fully self-runs with **no input at all**.

### Safety & determinism
Gesture-gated `AudioContext`; ramp from silence (no click); limiter; ≤14 voices; **full teardown on unmount** (cancel RAF, stop audio, dispose all geometries/materials/textures, `renderer.dispose()`, close context, remove listeners). The white-hot peak is a slow gaussian swell-and-fade — well under 3 Hz, **no strobe**. `prefers-reduced-motion` damps rotation and suppresses the bright flare for a calm version. Fully deterministic: seeded **mulberry32** PRNG and `performance.now()` timing — no `Math.random` / `Date`.

---

## Named references
- **The Mevlevi Order / whirling dervishes** and the *sema* ceremony — rotational ecstatic trance toward *fana* (self-annihilation-in-union).
- **Gilbert Rouget, _Music and Trance_ (1985)** — music as the driver of trance across cultures.
- **Aparicio-Terrés et al., "The neurobiology of altered states of consciousness induced by drumming and other rhythmic sound patterns," _Annals of the New York Academy of Sciences_ (2025)** — rhythmic sound → absorption/entrainment → altered states.
- **ASTRODITHER (Robert Borghesi)** — an audio-reactive three.js WebGPU/TSL experiment released **2026-07-01**, cited as the fresh 2026 momentum for audio-reactive three.js scene-graphs.

## Known limitations
- Additive glow approximates bloom; a real bloom pass would deepen the peak (deliberately avoided for build robustness).
- The phase-lock is expressed via shared velocity + color flare rather than a literal petal-perfect grid snap.
- At maximum density the voice cap drops some polyrhythm gates to protect the ear.

## Next-cycle deepening
1. **Literal geometric alignment at Fana** — ease every petal onto a shared radial grid so the lock is visually unmistakable.
2. **A slower macro-arc across multiple cycles** (a "night") with real long-form memory, so cycle 3 differs from cycle 1.
3. **Breath / heart-rate input** (mic or sensor) to entrain the tempo to the body and close the trance loop.
