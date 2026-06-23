# 886 · Kids Marble Music Machine

**Route:** `/dream/886-kids-marble-music`

## The one question

> What if a 4-year-old could play a self-playing marble music machine where the
> SOUND of every collision is determined by the object's MATERIAL (wood thuds,
> glass rings, metal shimmers, drum booms) and how hard the marble hit it —
> tapping to drop marbles and tilting the board to steer them?

This is **Approach B** of three parallel takes on the concept: a **Canvas2D
2D side-view marble run** — the robust, no-permission-required approach. It runs
on any device with zero GPU or sensor dependency; tilt is a bonus, not a
requirement.

## How it works

### Material-based modal impact synthesis (`synth.ts`)

The heart of the piece. Each material is a small **modal synthesizer**: a bank
of 3–6 decaying damped sinusoids ("resonant modes") built from native
`OscillatorNode` + `GainNode`, summed through a master gain → limiter →
destination. An impact spawns the whole bank for that object.

| Material | Decay | Partial ratios | Character |
|----------|-------|----------------|-----------|
| **Wood** | ~0.16 s | 1, 2.02, 3.01, 4.05 (near-harmonic, slightly stretched) | dull warm "tok" |
| **Glass** | ~1.5 s | 1, 2, 3, 4, 5.4 (clean bright partials) | bell-like "ting" |
| **Metal** | ~2 s | 1, 2.76, 5.40, 8.93 (inharmonic bar/plate ratios) | shimmery "clang" |
| **Drum** | ~0.4 s | 1, 1.59, 2.14, 2.30, 2.65 (circular-membrane modes) | boomy "boom" |

**Impact velocity** (the marble's normal speed at contact) scales both overall
amplitude *and* brightness — faster hits inject more energy into the high modes
(`bright^i` per partial), so a soft graze and a hard slam on the *same* object
sound clearly different.

Each object has a **fixed fundamental** drawn from a **C-major pentatonic** scale
(`level.ts`), so the machine always sounds consonant no matter where marbles
fall. Material sets the timbre; the object sets the pitch.

### 2D physics (`physics.ts`)

Self-contained, no libraries. Marbles are circles with position/velocity under a
gravity vector that is **rotated by the tilt angle**. Obstacles are circles
(pegs, bells, drum pads) or capsules (line-segment + radius for ramps and chime
bars). Collisions resolve with restitution along the contact normal plus
tangential friction, sub-stepped per frame with clamped velocity and a clamped
timestep for stability. Each collision returns its **normal impact speed**,
which drives the modal strike.

### Tilt — degrades gracefully (`page.tsx`)

- Optional **device tilt** via `DeviceOrientationEvent` (`gamma`). On iOS 13+
  `requestPermission()` is called from the Start-button gesture.
- If unavailable, denied, or unresponsive, the piece falls back to **two big
  on-screen tilt buttons** (hold to lean the board) plus a **+ Marble** button.
  Status is shown in `text-emerald-300` (sensor live) or `text-rose-300`
  (sensor unavailable — use buttons).
- The machine is **fully playable and audible with just taps and the buttons** —
  never a dead screen.

### Stakes

One **sticky-mud** blob (`zzz`) near the bottom traps a marble until the child
taps it free — a gentle bit of consequence, secondary to the core machine.

## Design notes

- Up to 10 marbles alive at once (oldest recycled). Glowing radial-gradient
  marbles with motion trails; obstacles are colour-coded by material and pulse
  on hit.
- Warm, playful, glowing kids palette on a dark theme. Tap targets ≥ 64px.
- Reference board is 1000×1400, scaled to fit the canvas; all input is mapped
  back to board space.

## Research & cultural anchors

- **RESEARCH §530 (2026-06-24)** — material-based modal impact sonification
  (Schütz et al., *Material-Based Sonification*, IEEE ISMAR 2025;
  *Real-Time Non-linear Modal Synthesis*, arXiv 2603.10240, 2026). Modal
  synthesis of struck objects follows the IRCAM **Modalys** lineage; impact
  velocity maps to excitation energy.
- **Wintergatan Marble Machine** — hand-cranked marble instrument where marbles
  strike real materials.
- **Jem Finer's self-generative marble machine** — slow, never-repeating marble
  music as an ongoing process.
