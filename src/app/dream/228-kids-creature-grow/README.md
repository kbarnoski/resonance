# 228-kids-creature-grow — design notes

**For**: kids (4+) · Zero permissions · Zero API · Zero deps · Pure Web Audio + Canvas

## What is this?

A glowing creature hatches from an egg and grows as you feed it musical notes. Six taps = fully grown. When complete, the creature sings back all six notes with each body part glowing on its note.

## How to play

1. Tap anywhere — the egg hatches and the creature's eyes appear
2. Tap again — ears grow
3. Tap again — a smile appears
4. Tap again — arms stretch out
5. Tap again — legs appear
6. Tap again — wings unfurl → ✨ celebration → creature sings your notes back
7. Tap again any time to hear it sing once more

## Notes and body parts

| Tap | Note | Hz | Body part | Color |
|-----|------|----|-----------|-------|
| 1 | C4 | 261.63 | Eyes | Cyan |
| 2 | D4 | 293.66 | Ears | Emerald |
| 3 | E4 | 329.63 | Smile | Amber |
| 4 | G4 | 392.00 | Arms | Blue |
| 5 | A4 | 440.00 | Legs | Rose |
| 6 | C5 | 523.25 | Wings | Gold |

C pentatonic — every combination sounds musical.

## Audio

Triangle-wave oscillators with 30ms attack + exponential decay (no clicks). Sing-back plays each note at 580ms intervals so the creature sounds like it's breathing between notes.

## Visual mechanics

- **Painter's algorithm**: wings drawn first (behind body and head), legs and arms last (in front).
- **Glow decay**: each body part glows at 1.0 when first added OR when the creature sings its note. Decays at 0.012/frame (~5 seconds full decay at 60fps).
- **Progress dots**: 6 dots at canvas bottom fill with each part's color as you tap.
- **Sparkles**: 18 on each tap (part color), 60-sparkle burst (6 colors, all directions) at completion, 24 gold on re-sing.

## What this explores

"What if the musical instrument was a creature you grew?"

Every prior kids prototype either shows a pre-drawn body (face-song, dance-avatar) or a blob that reacts to input (voice-monster uses mic). Creature Grow is different: the body only exists because you tapped. The egg has no eyes yet. You gave it eyes. The act of growing IS the act of composing — each tap is simultaneously a note and an anatomical addition.

The sing-back "memory" mechanic lets the child hear their sequence of actions replayed as a song. The creature remembers.

## Kids design compliance

- ✅ No reading required (creature state is self-evident)
- ✅ Tap anywhere = giant target (full canvas, no aim required)
- ✅ Immediate response every tap (<50ms)
- ✅ No fail state (every tap grows the creature forward)
- ✅ Clear arc: egg → celebration → song → tap to sing again
- ✅ Zero permissions (no mic, camera, gyroscope)
- ✅ Safe sounds (pentatonic, triangle wave, no sudden transients)

## Polish ideas

- **Mic mode**: hum a note to feed the creature instead of tapping
- **Dancing**: creature bounces rhythmically when fully grown (120 BPM idle dance)
- **Multiple creatures**: tap different screen quadrants to grow different creatures simultaneously
- **Creature personalities**: different pentatonic modes (Dorian, Phrygian) give different character
- **Egg variety**: different egg colors → different creature color palettes
