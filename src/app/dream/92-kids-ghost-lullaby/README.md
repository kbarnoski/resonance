# 92 · Kids Ghost Lullaby

**For**: kids (4+)  
**Status**: demoable  
**Route**: `/dream/92-kids-ghost-lullaby`  
**Cycle**: 104

---

## What it is

The Ghost — Karel's published Ghost journey character — floats gently across a starry night sky.

- **Tap her** → she glows brighter, plays a pentatonic piano note (pitch varies by where you tap on screen)
- **Drag her** → she follows your finger with a violet sparkle trail, playing a glissando as her position changes vertically
- **After 2 minutes** → she fades softly and a gentle lullaby melody plays (3 repeats, ~20 s). "Sweet dreams 🌙" appears

Zero permissions required. No mic, no DeviceOrientation, no camera.

---

## Design decisions

### Why Ghost?

Ghost is Karel's published live-performance character from the Ghost journey. Bringing her into the Kids zone ties the two worlds together — a child who loves the game can later discover the grown-up Ghost journey on Resonance proper.

### Pentatonic Y-mapping

Dragging the ghost upward plays higher notes (10 notes, C3–A4 pentatonic); dragging downward plays lower notes. There are no "wrong" notes — every position is in key. Moving 24 px triggers a new note to prevent note-flooding while still feeling responsive.

### Ghost shape

Drawn in Canvas2D: a classic rounded dome (arc, counterclockwise) with three wavy bottom bumps (quadratic curves), two ellipse eyes with shine highlights, and a radial glow (shadowBlur 34px). No image assets, no SVG — fully procedural and resizes cleanly.

### Lissajous drift

The ghost's autonomous path uses two incommensurable sine periods (0.55 rad/s × 0.38 rad/s), creating an infinite non-repeating Lissajous figure that fills the center 54% × 42% of the screen without hitting edges.

### Lullaby melody

Original 8-note motif descending through C-major pentatonic then resolving upward, played at 72 BPM with soft attack/release:

| # | Note | Hz |
|---|------|----|
| 1 | E4 | 329.63 |
| 2 | D4 | 293.66 |
| 3 | C4 | 261.63 |
| 4 | A3 | 220.00 |
| 5 | G3 | 196.00 |
| 6 | A3 | 220.00 |
| 7 | C4 | 261.63 |
| 8 | C3 | 130.81 |

Played 3× ≈ 20 s total, then stops. Ghost fades to 14% alpha during lullaby.

### Kids design rules applied

| Rule | Applied |
|------|---------|
| No reading required | Hint text only ("Tap the ghost") — not gating |
| Tap target ≥ 64px | Hit radius = 2.5 × 32 = 80 px |
| Immediate response | AudioContext created on first tap; note plays in same gesture |
| No "wrong" | Pentatonic scale — all Y positions are in key |
| Looping ambient | C3/E3/G3 pad at gain 0.015 from first tap |
| Safe sounds | Sine + octave-2nd (gain 0.12); no harsh transients |
| No data collection | No API calls, no logging |

---

## Polish ideas (future cycles)

- Ghost trails a faint ghost-shaped echo (slightly scaled + delayed)
- Tap anywhere else (not ghost) → a small star appears at that position and plays a faint note
- Parent mode (long-press corner): change the ghost's color / the key
- After the lullaby, ghost reappears smaller and floats off the top of the screen
