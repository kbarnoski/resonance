**For**: kids (4+)

## Aurora Sky — Tilt to Bend the Light

A tablet you hold becomes a window onto a living aurora borealis. Tilt it forward, back, or sideways and the northern lights respond: gentle tilts keep the curtains wide, soft, warm-green and slow; steep tilts pull the folds tight, shift the palette toward electric violet and magenta, and set the music shimmering with unresolved harmonics. Level the device flat and everything glides back to calm — the aurora widens, the colours warm, and the chord resolves home. The child holds all the tension in their hands and can choose, at any moment, to let it go.

## Tilt → Tension Mapping

`tension = clamp(√(β² + γ²) / 45°, 0, 1)`

where `β` (front/back tilt) and `γ` (left/right tilt) come from the `deviceorientation` event, one-pole smoothed (α = 0.08 per frame). Tension 0 = flat/calm; tension 1 = ≥45° tilt in any direction.

- **Visual**: flow speed `mix(0.08, 0.32, tension)` s⁻¹; fold scale `mix(1.6, 3.4, tension)`; fBm octave count `mix(3, 6, tension)`; lacunarity `mix(1.85, 2.3, tension)`; curtain half-width `mix(0.36, 0.22, tension)`; palette blends from warm-green/teal to electric violet/magenta.
- **Audio**: four-voice chord voice-leads from open-fifth + octave home (C3 G3 C4 G4) to sus4/add9 tense voicing (C3 F3 D4 B♭4); upper-voice tremolo depth `tension × gain × 0.55`; tremolo rate `mix(2.5, 7.0, tension)` Hz; master gain `mix(0.62, 0.80, tension)`.

## Subsystems

1. **Device tilt / gyro input** — `deviceorientation` event (`beta`, `gamma`); `DeviceOrientationEvent.requestPermission()` called inside Start click handler for iOS 13+; denied/missing → pointer-drag fallback (drag sets virtual β/γ).
2. **WebGL2 domain-warp aurora shader** — GLSL ES 3.00 full-screen fragment shader; three-layer domain-warped fBm aurora plus wisps; IQ `fbm(p + fbm(p + fbm(p)))` technique; deep indigo sky + deterministic stars; rendered at 65% DPR for performance. Falls back to `text-rose-300` notice if WebGL2 unavailable.
3. **Evolving modal pad synth** — four sine+triangle voice pairs; DynamicsCompressor brick-wall limiter (threshold −6 dB, ratio 20:1); lowpass filter at 8.8 kHz; slow tremolo LFOs on upper voices; AudioContext created inside user gesture.
4. **Tilt-tension engine** — one-pole smoother; tension magnitude from 2D tilt vector; continuous voice-leading with `setTargetAtTime`; visual uniforms and audio parameters updated every frame.
5. **Auto-demo** — hands-free Lissajous wander (`sin(t×0.31)×28°`, `sin(t×0.19+1.2)×22°`) drives aurora and music until real tilt/drag input cancels it.

## Named Reference

**Iñigo Quilez, "Domain Warping"** (iquilezles.org/articles/warp) — the recursive `fbm(p + fbm(p + fbm(p)))` technique that produces organic curtain and cloud structure. Applied here to generate the layered aurora folds whose sharpness, scale, and colour respond to tilt tension.

The visual metaphor echoes real aurora borealis physics: charged particles spiralling along magnetic field lines create folded, flowing curtains of light — the "tension" of our solar-wind-driven version is held in the child's tilting hands.

## Ambition Criteria

- **#2 — ≥3 Subsystems**: deviceorientation/drag input + WebGL2 domain-warp aurora shader + evolving modal pad synth + tilt-tension engine + auto-demo = 5 subsystems.
- **#3 — Named Reference**: Iñigo Quilez "Domain Warping" (`fbm(p + fbm(p + fbm(p)))`), cited above and in `shader.ts`.
