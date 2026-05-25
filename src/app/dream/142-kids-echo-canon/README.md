# Echo Canon — design notes

**Prototype**: `/dream/142-kids-echo-canon`  
**Status**: demoable  
**For**: kids 3+ · zero permissions · zero API · zero deps

## What it does

Tap out a little melody anywhere on the canvas. After 1.5 seconds of silence, the same melody echoes back as a three-voice canon:

- **Voice 1 (amber)**: original pitches, dots at original tap positions
- **Voice 2 (blue)**: melody transposed up a perfect fifth (+7 semitones) — dots appear 27% higher on screen
- **Voice 3 (violet)**: melody transposed up an octave (+12 semitones) — dots appear 54% higher

All three voices start 550ms apart — a true canon: the same phrase played three times simultaneously, each a beat later and a pitch higher. The harmonic richness builds as all voices sound together in the second half.

## Musical details

The canvas divides into 5 vertical columns: **C3 · E3 · G3 · A3 · C4** (left → right). Every tap snaps to the nearest column's pitch. The perfect-fifth transposition (×2^(7/12) ≈ ×1.498) produces G3, B3, D4, E4, G4 — all consonant with C-major. The octave transposition (×2) gives C4, E4, G4, A4, C5 — same pitches an octave up. No combination produces a dissonance the ear rejects. You cannot play wrong.

## Visual design

Each note event spawns a glowing dot at the tap position (amber during recording; amber/blue/violet during canon playback). Voice 2 dots appear 27% above the original tap Y; Voice 3 dots appear 54% above. The upward spatial shift communicates "higher pitch" without any text explanation — children see the echo "rise." Dots fade over ~1.6s with additive shadowBlur glow. Column backgrounds alternate at very low opacity (1.4% / 0%) to help children discover the pitch zones.

## Interaction mechanics

- Tap anywhere → note plays immediately (X column = pitch)
- Up to 8 notes per phrase; taps beyond 8 are ignored
- 1.5s of no taps → canon fires automatically
- During playback, taps are ignored (prevents disrupting the echo)
- After all echoes finish (~3.5–5s depending on phrase length) → idle, ready for new phrase

## Timing precision

Audio is scheduled using Web Audio API absolute times (`osc.start(when)`), giving sub-millisecond accuracy. Visual sparks are triggered by the rAF loop checking `actx.currentTime >= note.when - 0.008`, so dots appear within one frame (~16ms) of their audio counterpart. The slight look-ahead (8ms) compensates for rAF jitter so visuals never lag behind audio.

## Why this prototype

Of the 37 kids prototypes (cycles 92–166), most produce immediate audio feedback per tap. Two involve temporal echo: `102-kids-echo-song` (bird sings → child echoes) and `95-kids-breath-bubbles` (blow → bubbles). This is the first where the *child's own phrase* comes back to them harmonized in multiple voices simultaneously.

The canon format (Row Your Boat, Frère Jacques, medieval rondellus, Bach inventions) is the oldest polyphony tradition in Western music. Using it as a zero-permission kids prototype connects Resonance's experimental zone to 800 years of compositional heritage. A 3-year-old discovers it by accident; a musical adult recognizes it immediately.

Loved prototypes that influenced this direction: `100-kids-paint-song` ❤️ (tap → delayed playback of what you created), `104-kids-mirror-draw` ❤️ (your gesture becomes a second voice).

## Polish ideas

- Add a pulsing ring at canvas center during the 1.5s silence gap ("waiting for echo")
- Mic mode: detect hummed pitches via autocorrelation; echo back the melody with a 5th and octave
- 4-voice variant: add a +4th voice for denser polyphony
- Visual: draw faint arcs connecting voice 1 → voice 2 → voice 3 dots (showing the pitch-rise trajectory)
- Reverb: add a ConvolverNode impulse for a warmer tail on each note
