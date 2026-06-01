# 253 · Kids Tilt Pour

**Route:** `/dream/253-kids-tilt-pour`  
**Tags:** INPUT=device-tilt · OUTPUT=raw-WebGL fragment shader · TECHNIQUE=metaball/SDF + smooth-min + tiny CPU physics · PALETTE=candy/playful

---

## Concept

A fullscreen lava-lamp of 8 candy-colored jelly blobs rendered in a raw WebGL fragment shader. A 4-year-old tilts the iPad to pour the glowing mass around; blobs ring pentatonic notes when they merge, so music is impossible to get wrong.

---

## Metaball / SDF Math

### Hermite smoothstep falloff (Van Der Merwe, Apr 2026)

Each blob contributes a scalar field:

```
f(p, center, r) = t²(3 − 2t)   where t = 1 − |p − center| / r
                = 0              when |p − center| ≥ r
```

This is the classic Hermite/smoothstep polynomial — C¹ continuous, zero derivative at t=0 and t=1, producing smooth "melting" edges without the tail of an exponential. Critically, it is **much cheaper** than `exp(-d²)` on mobile GPUs. (Van Der Merwe explicitly benchmarks this choice and recommends it for interactive mobile work.)

The total field at a fragment is the sum of all 8 blobs' contributions:

```
F(p) = Σ f(p, center_i, r_i)
```

Threshold at F ≥ 1.0 to define "inside" the metaball mass. `smoothstep(0.9, 1.1, F)` gives the anti-aliased interior.

### Smooth-min / gooey fusion (Inigo Quilez)

Rather than a hard threshold, the interior/rim/halo bands are blended using `smoothstep` ranges over F:
- `inside` = `smoothstep(0.9, 1.1, F)` — solid interior
- `rim`    = `smoothstep(0.5, 0.9, F) * (1 − inside)` — bright rim glow
- `halo`   = `smoothstep(0.2, 0.6, F) * (1 − inside) * 0.45` — soft additive halo

This mirrors the IQ smin polynomial approach: at the merge zone between two blobs, F rises smoothly above 1 and the rim band appears as a bright glowing seam — the "smooth-min fusion" effect.

Color is blended by field weight:

```
fusedColor = Σ (color_i * f_i) / Σ f_i
```

### Reinhard tonemap

All light contributions are tonemapped before output:
```glsl
color = color / (color + vec3(1.0));
```
This prevents any specular or additive halo from clipping to white.

### Performance choices (Van Der Merwe, Apr 2026)

| Choice | Why |
|---|---|
| Hermite smoothstep falloff | ~3× faster than exp() on Mali/Adreno |
| Fixed 8 blobs | Unrolled loop, no dynamic branch |
| 2-octave noise cap | Halves noise ALU cost; imperceptible above 2 |
| DPR capped at 2 | 3× screens run at 4.5 MP otherwise; cap saves ~55% fragments |

---

## Tilt → Gravity → Physics → Sound

### Device tilt pipeline

1. `DeviceOrientationEvent` fires on each gyro frame.
2. `gamma` (−90..90°, left-right tilt) → `rawGravX = gamma / 90`
3. `beta` (−180..180°, forward-back tilt) → `rawGravY = beta/90 * 0.7 + 0.3` (biased slightly downward so blobs pool at the bottom at rest)
4. A low-pass smooth: `gravX += (rawGravX − gravX) * 0.07` each frame — removes jitter, keeps the motion feeling fluid.

### Physics step (per frame, ~8 blobs)

```
vx += gravX * G * dt
vy += gravY * G * dt
vx *= DAMPING (0.985)
vy *= DAMPING (0.985)
// soft blob-blob repulsion within 16% radius
// cap |v| ≤ 0.5
x += vx * dt * 0.016
y += vy * dt * 0.016
// edge restitution: reflect + scale by 0.55
```

All positions in 0..1 normalized units; aspect ratio applied in the fragment shader by scaling the x-axis.

### Merge detection & sound

Each frame, every blob pair (i, j) is checked. If their normalized distance < `MERGE_DIST` (0.13), the pair fires:
- Two `buildSineTriVoice()` calls — one per blob's pentatonic note (sine + octave-up triangle, 0.9s envelope)
- Per-pair refractory timer of 260 ms prevents machine-gun repeats
- Voices route through a feedback delay (22% mix, 220 ms) then a DynamicsCompressor limiter (threshold −18 dB, ratio 6:1)

**C-major pentatonic assignments (color ↔ pitch):**

| Blob | Color | Note |
|---|---|---|
| 0 | Hot pink | C4 (261 Hz) |
| 1 | Orange | D4 (294 Hz) |
| 2 | Yellow | E4 (330 Hz) |
| 3 | Green | G4 (392 Hz) |
| 4 | Cyan | A4 (440 Hz) |
| 5 | Violet | C5 (523 Hz) |
| 6 | Magenta | D5 (587 Hz) |
| 7 | Mint | E5 (659 Hz) |

### Ambient pad

A low C3–E3–G3 triad of sine oscillators always plays. Its gain tracks the **slosh metric** (mean blob speed, EMA smoothed) — the more vigorous the pouring, the louder the pad swells. Range: 0.04–0.16 (very quiet).

---

## Degradation Paths

| Condition | Behavior |
|---|---|
| iOS 13+ deviceorientation | `DeviceOrientationEvent.requestPermission()` called inside start-button tap (same user-gesture that unlocks AudioContext) |
| Permission denied | `noTiltFallback = true` — pointer-drag fallback activated, `text-rose-300` notice shown |
| No tilt events within 1.8s | Same fallback auto-triggers |
| Pointer fallback | Dragging on the canvas steers the gravity vector toward the pointer relative to center; releasing resets to gentle downward gravity |
| WebGL unavailable | Canvas hidden, `text-rose-300` notice shown, ambient pad still plays |

---

## References

- **Damian Van Der Merwe**, "Painting with Math: Building an Interactive Lava Lamp Shader from Scratch" (damianvandermerwe.com, April 3, 2026). Hermite smoothstep metaball falloff, fixed blob count, 2-octave noise cap, DPR cap at 2 — all four mobile-perf choices adopted verbatim.
- **Inigo Quilez**, smooth-min / SDF field techniques (iquilezles.org). The `smin` polynomial concept underlies the rim/halo blending on the total metaball field.
- Related prototypes: **83-kids-tilt-rain** (deviceorientation + pentatonic pattern), **169-kids-marble-run** (physics + Karplus-Strong), **84-wave-fluid** (WebGL fragment shader pipeline).

---

## Honest Limitations

- **No true fluid dynamics** — Euler integration only; no pressure, no surface tension, no viscosity.
- **Blobs don't visually split** — the metaball field only shows merging, not separation by shape.
- **No 3-axis gyro** — only gamma/beta; alpha (compass yaw) is ignored.
- **Pointer fallback gravity is coarse** — linear mapping, not simulated physical tilt angle.
- **Audio latency on first note** — AudioContext may warm up 20–60 ms after first merge.

---

## Next-Cycle Deepening

- True signed-distance field per blob for crisp outlines and per-blob split animations
- Gyroscope-based 3-axis tilt (DeviceMotionEvent) for more natural pouring
- Karplus-Strong string pluck voices instead of sine+triangle
- Record a "melody" from blob collision sequence and replay it
- Verlet integration for smoother physics at variable frame rates
- Add a "pour target" shape that cheers when filled with a matching color
