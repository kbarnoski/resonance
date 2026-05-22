# 91 — Kids: Character Band

**For**: kids (4+)  
**Status**: demoable  
**Cycle**: 102  

## What it is

Five animal characters — Frog, Owl, Cat, Fish, Bear — each with their own short melodic phrase. Tap any character to hear them play. Tap multiple characters at once to have them harmonize. Inspired by Toca Band's multitouch jam model, but tuned to Resonance's calmer, piano-rooted aesthetic.

## How it works

### Sound design

Each character plays a 4-note phrase built from the C-major pentatonic scale (no wrong notes). The phrases are designed to harmonize naturally when layered:

| Character | Notes     | Character       | Timbre    |
|-----------|-----------|-----------------|-----------|
| 🐸 Frog   | C4 E4 G4 C5 | Rising arpeggio  | Triangle wave, quick pluck |
| 🦉 Owl    | G4 E4 D4 C4 | Descending, calm | Sine, slow legato |
| 🐱 Cat    | E5 G5 E5 D5 | Playful trill    | Triangle, staccato |
| 🐟 Fish   | C4 A3 G3 C4 | Wavy pattern     | Sine, smooth |
| 🐻 Bear   | C3 G3 E3 C3 | Deep, slow       | Sine, slow attack |

Soft ambient pad (C3/E3/G3) runs from first tap to keep the world alive between presses.

### Visuals

Each tap spawns 18 sparkle particles that radiate outward with gentle gravity and fade. The tapped character scales up and glows while its phrase plays, then returns to rest when the phrase ends.

### Layout

Five characters in a flex row — fills the available width with a 68px minimum and 140px maximum per character. Works on narrow phones (≥320px) to large iPads. `pointer-events: none` canvas overlay handles sparkles without interfering with touch targets.

## Design rules applied

- Zero permissions required (no mic, no motion sensor, no consent dialog)
- No reading required to use (emoji + visual affordance is enough)
- Tap targets: flexible width, minimum 68px, aspect-ratio 1:1
- Immediate response: AudioContext boots on first `pointerDown`, phrase starts in <15ms
- No fail states, no wrong answers — all phrases harmonize by construction
- Soft ambient pad prevents the "broken/silent" feel between taps
- Multi-touch native: each finger fires a separate `pointerdown` event

## Polish ideas (future cycles)

- Character wobble animation (CSS keyframes) while phrase plays
- Longer / evolving phrases after repeated taps (call-and-response)
- Color trail that follows the tap point to the character circle
- Parent mode (long-press corner): change key, add a 6th character
- Fade-to-lullaby after 12-minute session (KIDS.md principle #10)
