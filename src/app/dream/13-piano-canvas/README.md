# Piano Canvas — design notes

**Question**: what if a musical improvisation left a visual record of itself?

## What it does

Mic input → real-time pitch detection → each note leaves a glowing brush stroke on a persistent canvas. The painting accumulates across the session. Download as PNG when done.

**Stroke encoding**:
- Pitch → hue (A4=0°, each octave rotates ~60°; the full piano keyboard spans ~4 octave-widths of hue, so bass notes are one color family and treble another)
- Amplitude/velocity → stroke weight (1.5–8 px)
- Duration → stroke length (longer held notes travel further across the canvas)
- The stroke path drifts: rising pitch deflects the cursor upward, falling pitch downward — so a melodic line traces an arc rather than a flat horizontal band

**Pitch detection**: autocorrelation on 4096-sample FFT time-domain buffer. First-trough/first-peak algorithm with normalized autocorrelation (NSDF), parabolic interpolation for sub-bin precision. Works well for monophonic piano/voice/single instrument. For chords, it picks the dominant partial (usually the lowest or loudest). Confidence gate at 0.82 normalized correlation; amplitude gate at ~0.012 RMS.

**Demo mode**: plays a wandering two-hand melody via Web Audio `OscillatorNode` (sine wave, mix of treble and occasional bass notes). The oscillators connect to the analyser but NOT to the speakers — pitch detection runs on the internal signal. Silent but visually active.

**Compositing**: completed strokes land on a hidden off-screen canvas (`paintRef`) using `globalCompositeOperation: 'lighter'` — colors add, so dense passages bloom bright. The active (in-progress) stroke is drawn on top on the display canvas with extra glow and a cursor dot at the tip. Both layers are dark-background-optimized.

## Open questions / polish ideas

1. **Polyphony**: the autocorrelation picks one pitch per frame. A chord gives interesting behavior (tends to lock onto the lowest strong partial) but isn't "correct." Could try running YIN or pYIN for better pitch confidence, or split into bass/treble bands and track two simultaneous strokes.

2. **Stroke layout**: current left-to-right with line-wrapping is piano-roll-inspired. Alternative: scatter mode (each note at a random position driven by pitch height), or spiral mode (time as angle, pitch as radius — makes a mandala).

3. **Persistence**: strokes never fade. Could add a slow global luminosity decay so old passages fade to near-black, giving a "window of recent memory" feel. Would require re-rendering all strokes each frame (expensive) or a timed composite pass.

4. **Export**: current export is a PNG snapshot. Could export as animated GIF (stroke-by-stroke replay) or a timed sequence of stroke draws.

5. **Resonance integration angle**: this is fundamentally a "visual journal of a session" — every Resonance journey leaves a painting. Could display it at the end of a journey as a souvenir. Each user's practice session becomes a unique artwork.
