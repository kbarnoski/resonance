# 199 — Kids Spin Wheel

**For**: kids (4+)  
**Route**: `/dream/199-kids-spin-wheel`  
**Status**: demoable  
**Cycle**: 232  

## What it is

A large spinning color wheel divided into 8 segments. Each segment is a different color and plays a pentatonic bell tone. A glowing ✦ triangle sits at the top (12 o'clock); as the wheel rotates, any lit segment that passes the ✦ plays its note.

Tap any segment to toggle it on (bright peg appears) or off. Tap more segments to build up a looping melody. Adjust BPM to speed up or slow down the spin. Clear resets all segments.

## Design notes

- **8 segments = 8 pentatonic notes** (C3 E3 G3 A3 / C4 E4 G4 A4). Every combination sounds consonant — no wrong choices for a 4-year-old.
- **1 revolution = 8 beats** at the current BPM. At 80 BPM, the wheel completes one revolution every 6 seconds. All 8 lit segments fire at 80 BPM effective.
- **Tap to start** — first tap anywhere on the wheel initializes audio and begins spinning. AudioContext creation is gated on user gesture (iOS requirement).
- **Glowing pegs** glow bright when active; a flash animation flares the peg and needle each time a note fires.
- **Ambient pad** (C3 + G3, sine, gain 0.009) starts on first tap — canvas never feels silent.

## Sound

Additive bell synthesis: triangle oscillator at the fundamental + inharmonic partials at ×2.756 (gain 0.22) and ×5.404 (gain 0.06). These specific multipliers are characteristic of glass/metal bell resonance — slightly metallic, clearly harmonic. Decay ~1.3 seconds. Same technique as `196-kids-wind-chimes` and `182-kids-crystal-song`.

## What's new

First circular step sequencer in the kids zone. Previous sequencers (`145-kids-dot-seq`, `150-kids-beat-builder`, `177-kids-lego-sequencer`) use linear or grid layouts. The wheel is qualitatively different:
- The "spinning toy" metaphor is universal for kids (prize wheel, pinwheel, music box)
- The circular geometry makes the loop explicit — the child sees the sequence wrap around
- BPM slider changes the physical speed of the spin, making tempo visceral

## Polish ideas

- Add a small musical note emoji (♩ ♪) inside each lit segment so the child sees which ones are "active" at a glance
- Tap the center hole → randomize pegs (surprise roll)
- Two-finger drag on wheel rim → manual spin override (tactile)
- Gentle sparkle trail behind the needle as it rotates
