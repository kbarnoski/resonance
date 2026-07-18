# 1944 · Vestibular Dissolve

**The one question:** *What if tilting your device dissolved your sense of "down" — a weightless, boundless drift like the ketamine / NDE loss of the body?*

A psychedelic / altered-states piece on the **INTENSE → cosmic** pole: the phenomenology of **vestibular / proprioceptive dissolution**. We normally never feel our gravity vector — it is the silent "down" the inner ear reports. Here, tilting the device *melts* it. The felt "down" reorients and comes apart, the horizon of a boundless field dissolves, and the boundary between viewer and cosmos loosens (K-hole depersonalisation, NDE weightlessness, ego-dissolution).

## How it works

- **Input — device tilt (+ keys / ghost).** `DeviceOrientationEvent` beta/gamma drive a 3D gravity vector. The first reading **calibrates a resting baseline**, so however you comfortably hold the phone becomes "level". No sensor → **arrow keys** nudge the vector and a **seeded auto-drift ghost** always slowly wanders it, so the dissolve self-demos with zero input (critical for a phone reviewer who won't tilt). On iOS the Begin button calls `DeviceOrientationEvent.requestPermission`; denial/unavailability falls back to keys + ghost with an on-brand `text-destructive` note. **No pointer / mouse-drag input.**
- **Output — WebGPU raymarch (+ honest fallback).** A raymarched volumetric nebula / infinite membrane whose **"up" is the current gravity vector**. Tilting smoothly reorients the whole cosmos; the membrane slab thickens toward uniform boundless fog as "down" melts (the horizon dissolves). Warm-cool cosmic gradient **teal → magenta → gold** runs along the up axis. Backend chain: **WebGPU → WebGL2 → Canvas2D**, feature-detected, never blank.
- **Audio — spatial dissolution drone.** A low **anchor** tone (fundamental + just fifth, centre-panned) is loud when down is settled and **thins as orientation is lost**, returning as you settle level. High **just-intonation spectral partials** (non-pentatonic: 3, 4, 5, 6, 7, 9, 11 × f0) **bloom and spread across the stereo field** as down melts. Master `StereoPanner` follows left-right tilt; everything glides.

## Safety & house rules

- Motion is **slow and drifty** — dissolution, not a game, no strobe. Any luminance breathing is a soft, high-floor multiplier routed through the shared **`safeFlicker`** engine (≤ 3 Hz, off-danger-band).
- **`prefers-reduced-motion`** freezes the ghost drift and slows field advection.
- Deterministic: seeded PRNG + `performance.now()` only — no `Math.random` / `Date.now`.
- Full teardown on unmount: RAF cancelled, audio ramped down + `AudioContext` closed, `deviceorientation` / `keydown` / `keyup` listeners removed, GPU device / renderer disposed.

## Files

- `page.tsx` — phase machine (idle → loading → running), Begin + motion permission, HUD, design-notes modal, RAF loop, cleanup.
- `orientation.ts` — tilt + keys + seeded ghost → smoothed gravity vector + dissolve scalar.
- `audio.ts` — spatial anchor/shimmer drone engine.
- `render.ts` — WebGPU / WebGL2 / Canvas2D field backends with detection.
- `readme-text.ts` — `README_TEXT` for the in-app notes.

## References

- **Ketamine "K-hole" / NDE ego-dissolution phenomenology** — loss of body schema, floating / out-of-body, time dilation, cosmic oneness (see `docs/dreams/PSYCHEDELIC.md`, Cluster 2). *DMT-as-NDE-mechanism claims are speculative; we evoke phenomenology, not medical fact.*
- **James Turrell** — Ganzfeld works: a uniform, edgeless luminous field where the boundary of vision dissolves.
- **Vestibular / gravity perception** — the otolith / proprioceptive "down" vector we never consciously notice, here made meltable.

---

`input=device-tilt(+keys/ghost) · output=WebGPU-raymarch(+fallback) · technique=vestibular-gravity-dissolve · palette=cosmic-teal-magenta · pole=intense/cosmic`
