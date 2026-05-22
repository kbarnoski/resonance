# 93 — Kids: Share the Screen

**For**: kids (4+)  
**Status**: demoable  
**Cycle**: 106

---

## What it does

Two fingers on the screen — each gets its own glowing colored voice. Move your finger up for a higher note, down for a lower one. Two voices playing simultaneously always sound good together because both draw from the same C-major pentatonic scale (no dissonant intervals possible).

Ideal interaction: parent and child each place one finger anywhere on the screen and explore the full range by sliding up and down.

---

## Design decisions

### Harmony guarantee
Both voices draw from the same 11-note pentatonic scale (C3–C5). The pentatonic scale has no tritones and no minor seconds — any combination of two simultaneously active notes sounds consonant. No explicit harmonization logic is required; the scale does the work.

### Pitch mapping
Y position → pentatonic pitch. Low on screen = low note, high on screen = high note. Drag from bottom to top = ascending glissando across 11 notes (~2 octaves). Even a 4yo swiping randomly produces pleasant melodic fragments.

### Voice identity via color
- **Slot 0 (first finger)**: violet (hue 270°) — warm, introspective
- **Slot 1 (second finger)**: rose (hue 340°) — bright, lively

Each voice has its own glowing orb that follows the finger. When two voices are active, a dashed gradient line connects them (animated, flowing from violet toward rose).

### Audio design
- Triangle wave + sine 2nd harmonic (10% relative gain) → warm, piano-adjacent timbre
- Smooth pitch glide: `setTargetAtTime` with τ = 40ms — feels like a fretless instrument, not a stepped keyboard
- Fade in: 50ms linear ramp to 0.22 gain
- Fade out: exponential decay, τ = 80ms, osc stopped at +500ms
- Ambient pad: C3/E3/G3 triangle waves at 0.018 gain — just enough to fill silence without competing

### Pointer capture
`setPointerCapture` is called on `pointerdown` so each finger's `pointermove` events keep firing even if the finger slides to the edge of the canvas. Without this, a finger near the screen edge stops tracking on mobile.

### Tap targets
No explicit tap targets — the entire screen is the instrument. Any touch anywhere makes sound within 50ms.

### Idle hint
When no voices are active, two softly pulsing orbs (violet left, rose right) suggest "put a finger here" without any text. They disappear immediately on first touch.

### Session duration
No forced timeout. This prototype is designed for open-ended play rather than the guided session model of `92-kids-ghost-lullaby`.

---

## Kids rules compliance

| Rule | Implemented |
|------|-------------|
| No reading required | ✓ (all affordances visual) |
| Tap targets ≥ 64px | ✓ (full screen) |
| Immediate response < 50ms | ✓ |
| No fail states | ✓ (pentatonic = no wrong notes) |
| Color is the language | ✓ (violet/rose voice identities) |
| Looping ambient soundtrack | ✓ (C/E/G pad) |
| Safe sounds | ✓ (triangle wave, soft gain) |
| No AI-voice gen | ✓ |
| No data collection | ✓ |

---

## Connection to existing prototypes

- Same Y-to-pentatonic mapping as `92-kids-ghost-lullaby`
- Same sparkle particle trail as `91-kids-character-band` / `92-kids-ghost-lullaby`
- Triangle+sine harmonic synth shared with `82-kids-color-piano`
- Extending the "social bonding via shared music" theme from KIDS.md research
