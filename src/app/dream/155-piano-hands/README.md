# Piano Hands

**Route**: `/dream/155-piano-hands`  
**Cycle**: 183  
**Status**: demoable

## What it does

A canvas piano keyboard (C3–B4, two octaves). As notes are played, semi-transparent ghost fingers descend from above and press the corresponding keys — each one colored by pitch class, with a light trail rising behind it.

Two modes:
- **Mic mode**: autocorrelation pitch detection runs at 60fps; detected MIDI note spawns a finger on that key. Silence for >320ms lifts all fingers.
- **Demo mode**: *Für Elise* plays via triangle-wave oscillators, scheduled with AudioContext precision. Fingers are spawned in sync with the audio scheduler (16ms look-ahead).

## Design decisions

**Ghost finger appearance**: Each finger is a capsule shape (~48px tall, colored by pitch class hue) with a gradient from a bright tip to a warm base. The color wheel maps pitch class to hue — C=violet, E=warm green, A=amber, B=magenta — the same mapping as the 6-band viz in `1-live` but rotated to 12 chromatic classes. A light trail glows upward above each finger while it's in the press phase.

**Finger lifecycle**: descend (220ms, ease-out quad) → press (stays while note active) → lift (400ms fade). The descend animation uses ease-out to match the feel of a real finger approaching a key — fast initially, settling gently.

**Key illumination**: When a finger is pressed, the key's fill color shifts to the finger's hue (white keys tinted, black keys brightened). Shadow blur gives each key a glow proportional to the finger's alpha. This creates a visual connection between the floating finger and the key beneath it.

**No piano audio passthrough**: Mic mode detects pitch but doesn't route the mic to the output — no feedback risk. Demo mode generates clean triangle-wave tones.

## What surprised me

The color-per-finger makes simultaneous notes immediately readable: when a C4 (violet) and E4 (green) finger are both pressed, the chord quality is visible in the color pair before you've read the key labels. The visual is the music theory.

Autocorrelation for piano is reliable for single notes (monophonic) but will pick the dominant partial for chords. That's expected behavior — the finger shows what pitch "wins" in the harmonic content, which is musically meaningful.

## Limitations / next steps

- Mic mode is monophonic (one finger at a time). A chroma-based polyphonic detector could show multiple fingers simultaneously — closer to the PianoFlow paper's approach (which uses full AMT).
- The 2-octave range (C3–B4) covers middle-register piano well but misses the extreme registers. Could extend to C2–C6 with a scrollable keyboard.
- Finger descent speed is fixed at 220ms. A BPM-synced descent (arriving on the beat) would add rhythmic interest for demo mode.
