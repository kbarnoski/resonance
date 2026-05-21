# 82 — Color Piano

**For**: kids (4+) · iPad / mobile · zero reading required

Eight pentatonic circles. Tap any circle to play its note. Hold to sustain. Slide across circles for a glissando. Multiple fingers play chords.

## Design decisions

**No wrong notes.** C-major pentatonic across two octaves — every circle, every combination, always consonant. Like a toy piano where all the white keys are safe.

**Circles, not keys.** Keyboard layout forces left-to-right reading. Circles have no inherent order; the child discovers pitch-height by play rather than being told.

**Color IS the note.** Each circle has a distinct saturated hue (red → orange → yellow → teal → blue → purple → deep orange → cyan). A 4-year-old remembers "the blue one" before they can say "A4."

**Glissando by default.** Drag a finger from circle to circle — each new circle triggers its note and the previous stops cleanly. This produces natural sweeping phrases without requiring multi-tap skill.

## Audio

- **Synthesis**: triangle-wave fundamental + sine 2nd harmonic (gain 0.18). Triangle is warm; the partial adds presence without harshness. Peak gain 0.52 — moderate, not startling.
- **Attack**: 12ms linear ramp (fast but not click-y)
- **Release**: 850ms exponential ramp to 0.001 (natural decay)
- **Background pad**: C3/E3/G3 sine oscillators, 0.04 master gain, each with a slow LFO (0.08–0.13 Hz, ±7%). Keeps the silence "alive" without competing with the notes.
- **Multi-voice**: each circle has independent gain + oscillators; simultaneous notes mix cleanly.

## Touch handling

Uses `pointer` events (works for mouse + touch + stylus) rather than `touch` events. `pointerdown` on the container boots the AudioContext (required by browser policy on first gesture). `pointermove` tracks which circle each pointer ID is currently over, enabling single-finger glissando. `pointercancel` matches `pointerup` for reliability on iOS.

## Compliance with KIDS.md

| Rule | Implementation |
|------|---------------|
| No reading required | No text on circles; "tap · hold · slide" hint is invisible at play distance |
| Tap target ≥ 64×64px | 20vmin circles: ≥78px on 390px phone, ≥153px on 768px iPad |
| Immediate response | Audio starts 12ms after pointer contact |
| No "wrong" moves | Pentatonic scale — every note and every combination is musical |
| No fail states | No scoring, no timer, no game over |
| Safe sounds | Triangle + sine, moderate gain, 850ms release — no sudden transients |
| Ambient always on | C-major pad plays continuously from first touch |
