# 216 · kids-band-builder

**For**: kids (3+) · **Cycle**: 250 · **Status**: demoable  
**Interaction**: tap · **Permissions**: none · **API**: none · **Deps**: none

---

## What it is

Five glowing circles on a dark canvas. Each circle is one instrument voice in a phase-locked band at 80 BPM. Tap any circle to add its sound; tap again to remove it.

| Circle  | Color  | Pitch | Pattern |
|---------|--------|-------|---------|
| Bass    | violet | C3    | Two slow warm pulses per loop (beats 0, 2) |
| Mid     | teal   | G3    | C3→E3→G3→E3 arpeggio, quarter notes |
| Melody  | cyan   | C4    | 8-note pentatonic rise+fall (C4 D#4 G4 A4 G4 D#4 C4 G3) |
| Rhythm  | amber  | A4    | Short triangle clicks on every 8th note |
| Shimmer | rose   | C5    | 4 high twinkles per loop (every other beat, offbeat) |

All loops are 4 beats (3.0 seconds) long. Phase-lock via `AudioContext.currentTime`: when a layer activates, its scheduling immediately picks up from the shared beat clock (`t0`), so new voices enter on beat rather than mid-measure.

BANDIMAL sizing rule: bigger circle = lower pitch. Bass is biggest (r=76), Shimmer is smallest (r=30).

---

## What makes it new

**First kids prototype about muting/unmuting independent tracks.** All prior sequencer prototypes (dot-seq, lego-sequencer, spin-wheel, beat-builder) have the child add notes to a pattern that plays back. Band Builder inverts this: five loops are always running, and the child decides which ones to hear. The musical interaction is REMOVAL and ADDITION of existing voices — the same paradigm as a DJ or music producer working with stems.

Visual feedback loop:
- Dim + faint glow = "I'm ready but silent"
- Bright glow + pulsing = "I'm playing"
- When all five are on: full-band flash + "✨ Full Band! ✨" at center
- Thin colored lines connect all active circles (the band is literally connected)

---

## How the phase-lock works

```
startTime (t0) = actx.currentTime when first tap
loopPhase = (actx.currentTime - t0) % LDUR     // where we are in the 3s loop
```

Every animation frame, `scheduleActive()` looks ahead `LOOK = 0.12s` and fires any notes not yet scheduled. Key: `iter` (loop iteration number) + `beat` + layer index form a unique key in the `scheduled: Set<string>`. A note is only ever scheduled once.

When the user taps to activate a layer, the note immediately queues for the NEXT upcoming beat in the shared clock — not from time=0.

---

## Audio design

- All synthesis: triangle oscillator + linear attack + exponential decay
- Bass: 1.75-beat sustain (heavy, warm)
- Mid: 0.55-beat arpeggio notes (bouncy)
- Melody: 0.33-beat (short, clear melodic line)
- Rhythm: 0.06-beat duration at 440 Hz — sounds like a bright metallic click
- Shimmer: 0.28-beat at C5/E5/G5/C5 (airy twinkle)
- Gains: [0.30, 0.22, 0.30, 0.14, 0.13] (bass + melody slightly louder to balance)

All notes are C pentatonic major (C, E, G, A, C). Any combination of layers sounds musically coherent.

---

## Design decisions

**Why 80 BPM?** Fast enough to feel rhythmically active, slow enough that a 4-year-old can easily hear each beat. 80 BPM = 750ms per beat — the "medium tempo" that feels energetic but not rushed.

**Why triangle waves?** Warmer than sawtooth, richer than sine. Kid-safe: no harsh transients or metallic distortion at any volume. Consistent with other kids prototypes in the sandbox (dance-avatar, echo-drum, harmonic-piano).

**Why not a drum layer?** The "Rhythm" layer (short 60ms triangle click at 440 Hz) is the rhythm — not a noise burst. Reason: noise-burst drums require AudioBuffer allocation per hit (expensive at 8 hits × ~3/s), and the triangle click is equally effective at providing rhythmic pulse for kids. Future polish could swap Rhythm for a proper hi-hat noise burst.

**Connection lines between active circles**: thin colored lines connect all active layers, making the "band is playing together" concept visual. They're subtle enough not to clutter when only 2 layers are active, but the web becomes prominent and colorful with 4-5 layers.

---

## Polish ideas

- **Mic mode**: RMS amplitude from mic → scale all active layer gains live (play louder → band gets louder)
- **Tempo slider**: ± buttons for BPM 60/80/100/120 (same pattern as `199-kids-spin-wheel`)
- **Layer solo**: long-press a circle to solo it (everything else mutes for 2s then comes back)
- **Drum layer swap**: replace Rhythm (triangle click) with proper kick/hihat noise synthesis for a richer percussion voice
- **Panning**: Bass pan slightly left, Shimmer slightly right, Mid and Melody center — stereo spread makes the band feel 3D
- **"Add a voice" hint**: after 10s of inactivity, one circle pulses more brightly as an invitation to tap it
