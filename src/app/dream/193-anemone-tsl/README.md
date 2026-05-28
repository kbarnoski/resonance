# 193 — Anemone TSL

**Cycle 225 · Adult build**

A `TorusKnotGeometry(1.0, 0.22, 300, 36, 2, 3)` organism skinned with a custom GLSL `ShaderMaterial`. The knot is qualitatively different from both the icosahedron blob (21-three-mesh-av) and the FK-tube tentacles (49/134-anemone-av).

## How it works

`uv.x` (0→1 along the tube path) is the key variable — it lets us run travelling waves around the entire surface rather than the uniform radial displacement used on a sphere:

```glsl
float wave1   = sin(t * 18.85 + u_time * 2.2)  * u_bass    * 0.14;
float wave2   = sin(t * 37.70 + u_time * 4.1)   * u_mid     * 0.09;
float flutter = sin(t * 94.25 + u_time * 12.0)  * u_highMid * 0.05;
```

Each band drives a different spatial frequency: bass = slow roll, mid = medium wrinkle, high-mid = fine flutter.

## Audio mapping

| Band | Effect |
|------|--------|
| Sub-bass | Whole-body breathe (uniform scale of displacement) |
| Bass | Slow travelling wave (f = 18.85 cycles/tube) |
| Mid | Medium wave (f = 37.70) |
| High-mid | Fast flutter (f = 94.25) |
| Onset | Radial burst that decays per-frame at ×0.88 |
| Centroid | Hue shift violet → cyan |

## Fragment shader

HSL colour space: hue ∈ [0.50, 0.74] (cyan–violet) driven by spectral centroid; brightness driven by displacement amount; rim light adds bright cyan at silhouette edges; filmic `col/(col+0.28)` tonemap.

## Sources

- Demo: incommensurable LFO set (0.30, 0.45, 0.70, 3.10, 7.00 Hz)
- Mic: `useMicAnalyser` bands mapped to sub-bass/bass/mid/high-mid/high
