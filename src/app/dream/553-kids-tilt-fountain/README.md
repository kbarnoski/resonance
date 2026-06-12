# 553 · Kids Tilt Fountain

## The One Question
**What if a 4-year-old could tip the whole tablet to pour a stream of glowing orbs down through a 3D vertical garden of chimes, bells, and strings — building a singing waterfall whose melody they compose by where they aim the flow?**

---

## How Tilt Drives It

The device's `DeviceOrientationEvent` fires continuously with `gamma` (left/right lean, ±90°) and `beta` (front/back tilt, ±180°). These map directly to a 2D gravity vector applied to every live orb:

- `gamma → gx` (lateral gravity, pulls orbs left or right)
- `beta (offset from 45°) → gz` (depth gravity, helps aim into/out of zones)
- `gy` stays at 9.8 m/s² downward — gravity is never reversed

The vector is smoothed with an exponential moving average (α ≈ 0.08 per frame) to eliminate jitter and give the flowing, liquid feel appropriate for a 4-year-old's imprecise grip.

The emitter (glowing white sphere at top) tracks the lateral gravity lean, so the stream pours from where the device is tilted toward.

---

## Subsystems

### 1 · Tilt Input + Gravity Model (`page.tsx` + `physics.ts`)
- Reads `deviceorientation` (gamma/beta)
- iOS 13+ permission via `DeviceOrientationEvent.requestPermission()` on the Start button gesture
- Smooth EMA gravity vector (α = 0.08)
- Desktop fallbacks: pointer X/Y → gravity; arrow keys → incremental steering
- If permission denied or event absent: `text-rose-300` notice, pointer fallback auto-activated

### 2 · Orb Physics + Emitter (`physics.ts`)
- Continuous emitter drips one orb every 100ms from the top of the scene
- Euler integration under tilt-gravity vector
- Per-orb AABB collision against 5 instrument zones
- Hard cap: 180 live orbs; orbs beyond 12s or past the world floor are retired
- Orb pool recycled each frame — no unbounded growth
- Slight drag (0.985 per frame) prevents runaway acceleration

### 3 · Zone-Based Spatial Pentatonic Synthesis (`audio.ts`)
Five zones, each a distinct timbre:
| Zone | Timbre | Character |
|------|--------|-----------|
| Top-left | Bell | Sine + partials, slow decay |
| Mid-right | String | Karplus-ish noise burst + resonant bandpass |
| Mid-left | Chime | Triangle × 1.5 + high overtone |
| Low-right | Marimba | Lowpass-softened square, sharp attack |
| Bottom-left | Bell (low) | Same as bell, lower register |

All notes drawn from C-major pentatonic (C3–C5). Horizontal position within a zone selects the specific pitch (left = lower, right = higher), so the melody literally depends on where the orbs land.

Signal chain: each voice → shared `GainNode` (master 0.75) → 8kHz `BiquadFilter` (lowpass) → `DynamicsCompressor` (threshold −10 dBFS, ratio 20:1) → `destination`. This is the brick-wall safety limiter that protects young ears from harsh transient spikes.

`AudioContext` is built inside the Start-button gesture, unlocking it on iOS.

### 4 · Three.js Render (`page.tsx`)
- `THREE.WebGLRenderer` with additive blending for orbs and zones — natural luminous glow without a postprocessing pass
- Orb spheres: `MeshStandardMaterial` with `emissive` matching base color, `emissiveIntensity` boosted on hit
- Zone boxes: semi-transparent additive planes that flash bright on strike
- Emitter glow: bright additive sphere that follows the gravity lean
- Ambient + point light give subtle depth
- All geometries/materials/renderer disposed on unmount

### 5 · Hands-Free Auto-Demo
Before any tilt or pointer input, a ghost gravity oscillates in a slow figure-8 (`sin(t)` × `sin(0.7t)`). Orbs pour and the waterfall sings from frame 1 — zero taps, zero permission. Ghost input resumes after 4s of human idle.

---

## References

- **Toshio Iwai** — *Electroplankton* (Nintendo DS, 2005) and *SimTunes* (1996): the clearest lineage for "touch/motion makes music by moving objects through space." Iwai showed that musical play needs no score, no wrong move, and no language.
- **Pythagoras' monochord**: pitch varies by horizontal position within each zone — left = lower frequency, right = higher — echoing the ancient insight that spatial position encodes pitch.
- **Rube Goldberg machines**: the cascade aesthetic. Orbs pour, bounce off platforms, and each platform rings as they pass — a chain reaction composed by the child's lean.
- **Harry Partch's "cloud chamber bowls"**: physically large resonant objects at different heights that ring when struck — the spatial sound-garden mental model.

---

## Graceful Degradation

| Condition | Behaviour |
|-----------|-----------|
| iOS, permission granted | Full tilt control |
| iOS, permission denied | `text-rose-300` notice, pointer fallback, auto-demo always running |
| Android | Tilt fires without permission — works immediately |
| Desktop | Pointer X/Y controls gravity vector; arrow keys also work |
| No gesture at all | Auto-demo ghost tilt runs forever; full sound and visuals |

---

## What's Unverified

This prototype was built without a runtime sandbox, so the following were reasoned about but not empirically tested:

- **iOS DeviceOrientationEvent** permission flow: the `requestPermission()` async call should work per Apple's spec, but interaction with Next.js hydration timing is untested
- **AudioContext unlock on iOS**: built inside the pointer-down gesture on the Start button — this is the canonical pattern but Safari WebKit occasionally needs the context `.resume()` too
- **Additive blending z-fighting**: with many orbs overlapping at shallow angles, additive materials can occasionally produce unexpected bright spots — a depth sort or `depthTest: false` tweak might be needed
- **Performance on older iPads**: 180 orbs × sphere geometry at 60fps is the target; older A-series chips may need `MAX_ORBS` reduced to ~80
- **Arrow-key gravity accumulation**: the per-frame step approach works well in tests but may feel slightly stiff at exactly 60fps vs. 30fps — a time-normalized version would be more robust
