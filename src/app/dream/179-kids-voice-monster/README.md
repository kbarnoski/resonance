# Voice Monster 🎤

**For**: kids (3+)  
**Route**: `/dream/179-kids-voice-monster`  
**Built**: Cycle 210  
**Status**: `demoable`

## The question

What if singing fed a hungry character that sang back what it ate?

## What it does

A glowing blob-monster lives on a dark starry canvas. Hum or sing into the mic — the monster grows with your amplitude and its color shifts with your pitch (low voice = violet/blue, mid = teal/emerald, high = amber/rose). A hunger progress bar shows how full it is.

After **30 accumulated seconds of voice**, the monster is full. It bounces happily, then **sings back a short melody** drawn from the distinct pitches it detected — up to 8 notes played as sine tones in the order it first heard them.

After singing, it shrinks back to resting size and the cycle begins again.

**Tap the monster** at any time for a surprised "boop" — a quick harmonic arpeggio (C4, C5, C6, C7 in rapid succession) and a wobbling eye animation.

After **5 seconds of silence**, the monster's eyes drift in a Lissajous pattern as if searching for sound.

**Demo mode** (no mic needed): a LFO simulates a humming child. The monster fills on its own and demonstrates the full sing-back cycle.

## Audio design

- **Monster body**: direct AudioContext synthesis, no samples
- **Pitch tracking**: spectral centroid from `useMicAnalyser` → quantized to nearest C-major pentatonic note (C3–A4 range)
- **Sing-back**: sine oscillators, one per detected pitch, 0.56s per note, 0.20 gain
- **Boop**: 4 harmonics (261.63 Hz × 1–4), staggered by 65ms, fast attack/decay
- **Ambient pad**: C2 + G2 sine waves at gain 0.010/0.007, 3s fade-in
- **Voice threshold**: 0.033 RMS — low enough to catch quiet humming

## Why this interaction is new

158-kids-hum-paint ❤️ uses voice to paint a visual trail — reactive in real time. Voice Monster is the first prototype where voice accumulates over time and the CHARACTER responds with its own song. The child isn't "performing" — they're "feeding." The monster mediates between the child and the sound, removing performance anxiety: you're not singing TO anyone, you're feeding someone.

The 30-second fill is intentional: long enough that the child understands it's an accumulation (not an instant trigger), short enough to hold a 4yo's attention. The hunger bar makes progress visible.

The sing-back melody is built from the child's actual vocal pitches (quantized to pentatonic). A child who hums C3 and G3 hears exactly those two notes back. A child who wanders across many pitches hears a longer melody. The monster's "memory" of the feeding session is literal.

## Design lineage

- `158-kids-hum-paint` ❤️ — voice as instrument (this extends to character narrative)
- `133-kids-ripple-pond` ❤️ — delayed reward (accumulate → full → sing)
- `169-kids-marble-run` ❤️ — cause-effect chain with satisfying payoff

## Polish ideas

- Add a full/satisfied visual particle burst (sparkles radiating from center) when the monster reaches full before the bounce
- "Burp" mode: if the child sings a pitch the monster already ate, it briefly shudders and plays the stored pitch immediately
- Color trail for accumulated pitches: small colored dots near the progress bar showing which notes have been captured
- Lullaby ending: after the 12-minute session cap (KIDS.md rule), the monster yawns and the ambient pad fades to a lullaby chord
- Mic sensitivity slider for quiet rooms (expose `useMicAnalyser` gain)
