# 134 — Anemone

**Route**: `/dream/134-anemone-av`  
**Cycle**: 159 (adult build)  
**Status**: demoable  
**Deps**: three@0.182, @react-three/fiber, @react-three/postprocessing (all pre-installed)

---

## What it is

A bioluminescent sea anemone rendered in Three.js R3F, living in the dark and
responding to audio. Eight tentacle arms radiate from a glowing central stalk,
each animated by independent sinusoidal LFOs modulated by the incoming audio
bands.

The creature never stops moving — even in demo mode it breathes slowly, its
tentacles swaying, its crown ring flickering with simulated high-frequency
content. Plug in a mic (or play near the device speaker) and it wakes up fully:
bass frequencies sway the trunk in large arcs, low-mid spreads the tentacles
outward, high-mid sets the tips flickering, and onsets trigger a brief
whole-body pulse.

---

## Audio → form mapping

| Band | What changes |
|------|-------------|
| Sub-bass (20–60 Hz) | Macro sway amplitude of the entire organism |
| Low-mid (250–500 Hz) | Tentacle spread: arms scale outward on XZ |
| High-mid (2–4 kHz) | Tip flicker: emissive intensity of the tip spheres oscillates rapidly |
| Onset (transient) | Global scale pulse: +9% for ~80ms then decays |

---

## Geometry

- **Central stalk**: tapered cylinder, white/violet emissive, height 1.8 units
- **8 tentacle arms**: each a `TubeGeometry` built from a `CatmullRomCurve3`
  (4 control points, gentle lean). Different heights (1.6–1.96 units). Radius
  tapers from 0.035 to 0.025 by index.
- **Tips**: small sphere at the end of each arm, white with colored emissive
- **Crown ring**: 6 small spheres at the top of the stalk, sky-blue emissive
- **Basal bulb**: sphere at the stalk base, violet emissive

## Color palette

- Core stalk: `#ede9fe` / emissive `#8b5cf6` (violet)
- Arms: alternating `#4dd8ff` (cyan) and `#a78bfa` (violet)
- Crown: `#38bdf8` (sky blue)
- Tips: white body + arm color emissive

---

## Bloom

`@react-three/postprocessing`'s `Bloom` pass at:
- `luminanceThreshold: 0.18` — picks up all emissive materials
- `intensity: 1.8` — noticeable glow without washing out the form
- `radius: 0.85` — wide soft corona

---

## Resonance connection

The anemone is a live performance instrument. The relationship between audio
and form is direct but not literal — you hear bass and see the whole creature
lean, not an equalizer bar move. The organic geometry means there is always
something happening at every scale: the tips flicker on breath while the trunk
sways on low rumble. At a venue, projected large against a wall, this reads as
a living presence responding to the music — which is exactly the Resonance thesis.

---

## Polish ideas

- Add sub-branches: 2-3 shorter tubes spawning from each main arm (Houdini
  branching pattern, `branch → sub-branch → sub-sub-branch`)
- Particle halo: a slow cloud of ~200 additive-blended point particles drifting
  outward from the crown — bioluminescent "glow plankton"
- OrbitControls: let the user orbit with mouse/touch
- Color themes: map to Karel's journey palettes (Cosmic = violet/white, Ocean =
  cyan/teal, Ghost = purple/grey, etc.)
