# Anemone AV — design notes

A bioluminescent sea anemone that dances to audio. 14 tentacles, each a
forward-kinematics chain of 4 tapered segments, react to six frequency
bands. No static pages — every frame the geometry is alive.

## Audio mapping

| Band | Frequency | Effect |
|------|-----------|--------|
| Sub-bass (0–60 Hz) | The room's fundamental | Whole-trunk sway rate and amplitude |
| Bass (60–250 Hz) | Piano bass notes, kick drum | Multiplied into sway amplitude |
| Low-mid (250–500 Hz) | Cello body, piano mid | Secondary ripple on branch angle |
| High-mid (2–4 kHz) | Piano attack, snare body | Tip-bead flicker frequency and scale |
| High (4–20 kHz) | Cymbal shimmer, breath | Tip-bead scale shimmer |
| Onset | Amplitude spike detection | Full-body pulse: all tips scale 1.4× for ~200ms |

## Forward kinematics chain

Each tentacle is a chain of nested `THREE.Group` objects:
```
tentRoot (positioned at base radius)
  seg[0] (rotation driven by sway)
    cylinder mesh (at y=segLen/2)
    seg[1] (at y=segLen, inherits parent rotation)
      cylinder mesh
      seg[2]
        cylinder mesh
        seg[3]
          cylinder mesh
          tip bead (sphere at y=segLen)
```

Rotations accumulate down the chain — the tip deflects 1+3×0.60 = 2.8× the
root deflection. This is how real tentacles work: base movement is small, tip
movement is large. The 14 tentacles have staggered phases so they never move
in perfect lockstep.

## Visual design

- **Color**: cyan at the base (`HSL 0.50`) grading to violet at the tips
  (`HSL 0.30`). The tip beads are bright violet (`emissiveIntensity 5.0`).
- **Glow**: `@react-three/postprocessing` Bloom with `intensity=2.4` and
  `luminanceThreshold=0.04`. Low threshold means even the dim tentacle bases
  glow. Strong intensity means the tips bloom hard.
- **Body disc**: flattened sphere at the base (scale 1,0.55,1 — typical
  anemone proportions). Emissive cyan at 2.4× intensity.
- **Background**: pure black. The form reads as light against void.

## Demo mode oscillators

Six sine oscillators at sub-bass, bass, low-mid, mid, high-mid, and high
frequencies, each amplitude-modulated by a slow LFO (7–28 Hz). Without mic
permissions the anemone still dances in a slow organic pattern — the LFO
rates are slightly incommensurable so the motion never fully repeats.

## Architecture notes

The scene is built imperatively in `useMemo` (one allocation at mount, never
rebuilt). `sceneRef` holds the FK chain groups and configs for `useFrame`
access. All `BufferGeometry` and `Material` objects are collected in `disp[]`
and disposed via `useEffect` cleanup — no GPU leaks on unmount.

## Polish ideas

- **GLSL displacement on cylinder vertices**: instead of FK rotation, add a
  vertex shader that displaces each cylinder's vertices along a noise wave.
  More organic bending (not piecewise-linear).
- **Additional tentacle ring**: inner short tentacles at 0.15× radius, outer
  tall ones at current radius — layered depth.
- **Particle spawn on onset**: small point particles emitted from tip beads
  on each onset hit, drifting upward and fading.
- **Iridescence material**: thin-film shader on tentacle surface — incidence-
  angle-dependent hue shift from cyan through magenta.
- **Audio-reactive emissive intensity**: modulate `emissiveIntensity` on the
  body disc with sub-bass energy — the core pulses with the bass.
