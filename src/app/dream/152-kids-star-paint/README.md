# Star Song — `/dream/152-kids-star-paint`

**For**: kids (3+)  
**Cycle**: 180 (kids build)  
**Status**: demoable  
**Permissions**: none  
**API**: none  
**Deps**: none  

---

## What it is

Drag a finger across the dark night sky. Every ~46 px of travel, a new star appears at your fingertip and plays a **Karplus-Strong pluck** — the physics of a plucked string, realised in 40 lines of DSP. Stars connect by glowing lines as you draw. Lift your finger to crystallize the constellation into the sky.

After 16 seconds, the constellation **arpeggios itself** — the unique set of pitches replay from high to low — then fades over 3.5 seconds. Up to 6 constellations coexist simultaneously. A soft C3/E3/G3 ambient pad keeps the sky from going silent.

---

## Interaction

| Gesture | Effect |
|---------|--------|
| Drag anywhere | New stars + Karplus-Strong plucks as you move |
| High on screen | Higher pitch |
| Low on screen | Lower pitch |
| Lift finger | Constellation locked into sky |
| Wait 16 s | Constellation plays an auto-arpeggio then fades |

---

## Design choices

**Why Karplus-Strong?** The KS string model produces a bell-like resonant decay — the sound "stays in the air" longer than a triangle-wave piano tone. For a star-painting metaphor, the long sustain feels more magical: the sky rings with the notes long after you've drawn them.

**Why 46 px between stars?** At 46 px, a slow careful drag produces widely-spaced stars (sparse, elegant). A fast energetic sweep produces dense clusters (busy, glittery). The spacing naturally scales to the gesture's energy without any UI control.

**Why Y = pitch?** "Higher = higher" is the most intuitive spatial-musical mapping, demonstrated in `100-kids-paint-song` and `104-kids-mirror-draw` (both Karel-loved ❤). A child who draws a high arc hears high notes; a child who swoops from bottom to top hears a scale. Self-discovering in under 10 seconds.

**Why not KS in real time?** Pre-computing 9 buffers (one per pitch) at startup costs ~12 ms and avoids rAF stalls during the frame. Each pluck then just creates a `BufferSourceNode` (near-zero cost). The 2.5 s buffer captures the full KS decay before it's inaudible.

**The auto-arpeggio** is the reward for patience. After 16 seconds of lingering in the sky, the constellation plays back all of its unique pitches, highest first. A child who drew a swooping arc across the full height of the screen hears a full descending scale. A child who drew a flat path hears fewer, closer-pitched notes. The playback is always consonant (C-major pentatonic) and always surprising.

**Pulse during arpeggio**: star size and glow expand with a slow sine wave while the arpeggio plays — the constellation "breathes" as it sings. A child can watch the stars pulse in sync with the sounds.

---

## Audio palette

9 pitches from C-major pentatonic, 2 octaves:

```
C3 · E3 · G3 · A3 · C4 · E4 · G4 · A4 · C5
```

All intervals are pentatonic-consonant — any combination of pitches in any constellation sounds musical. The arpeggio (high → low) always ends on C3, the deepest and most resolved note.

---

## What to try next (polish ideas)

- **Demo constellation**: spawn a pre-drawn constellation on start (a simple 5-pointed arc) so the canvas is never blank. Demonstrates the interaction before first touch.  
- **Constellation names**: after arpeggio, display a faint procedurally-generated constellation name ("The Swan", "The Harp") in `text-xs text-white/50` that fades with the constellation. Adds narrative texture.  
- **Mic mode**: instead of drag-to-draw, hum into the mic — each onset draws a new star at a random position with the hum's detected pitch. The constellation traces your voice.  
- **Touch-based spiral**: a circular drag (closed loop) produces a circular constellation — a special shape that auto-plays its notes in loop (indefinitely, like `111-kids-shape-loop`). Hybrid of star-paint and shape-loop.
