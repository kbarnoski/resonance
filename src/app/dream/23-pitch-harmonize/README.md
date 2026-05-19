# 23-pitch-harmonize — design notes

**Route**: `/dream/23-pitch-harmonize`

**Question**: what if Resonance could make you your own accompanist — your harmony floating in 3D space beside you?

---

## What it does

Mic input → AudioWorklet ring-buffer pitch shifter → HRTF PannerNode.

Simultaneously draws a dual phase-portrait vectorscope on a single canvas:
- **Orange trail** = raw (dry) mic signal
- **Blue trail** = pitch-shifted harmony signal

The phase portrait plots `signal[t]` vs `signal[t+delay]`. A pure sustained pitch traces an ellipse; a chord draws overlapping loops; percussion sprays outward then contracts. With two overlapping trails at different pitches, you see two different ellipses (or loop families) sharing the same space — the visual difference IS the interval.

---

## Pitch shifter algorithm

Two-grain ring-buffer pitch shift ("Jungle" algorithm by Chris Wilson, 2012):

- Ring buffer of N=4096 samples (~93ms at 44.1kHz)
- Two read pointers, offset by N/2
- Each advances at `ratio = 2^(semitones/12)` per input sample (instead of 1.0)
- Cross-fade weight = `distance from write pointer / N`
  - The grain furthest from the write head gets the highest weight (it has the most "settled" audio)
  - No explicit Hann window — the distance-based weight approximates a linear fade

Quality: excellent for sustained notes (piano, voice, organ). Audible metallic artifacts on sharp transients (drum hits, staccato attacks). This is inherent to the grain-based approach without phase locking.

**AudioWorklet inline**: no separate `.js` file needed. The worklet string is loaded via `createObjectURL(new Blob([...]))` and revoked immediately after `addModule()`. Works in all browsers with AudioWorklet support (Chrome 66+, Firefox 76+, Safari 14.1+).

---

## HRTF positioning

The harmony signal routes through a Web Audio `PannerNode` with `panningModel = "HRTF"`. Position mapped from azimuth angle:

```
x = sin(azimuth_rad), y = 0, z = -cos(azimuth_rad)
```

This places the source on a horizontal circle at ear height. Azimuth 0° = front-center; ±90° = hard left/right. With headphones, the spatial separation is convincing above ~2kHz (where HRTF cues are strongest).

The dry signal routes through a center-front panner (0, 0, -1).

---

## Signal routing

```
Mic source
 ├→ dryAnalyser → dryPanner(center) → destination
 └→ AudioWorklet(pitch) → harmGainNode → harmAnalyser → harmPanner(azimuth) → destination
```

Both analysers read `getFloatTimeDomainData()` at 4096-sample resolution. The delay for the phase portrait is 20ms (≈882 samples at 44.1kHz) — near the quarter-period of 10–15Hz LFO-range signals and gives clear ellipse structure for piano/voice fundamentals.

---

## Intervals

| Label | Semitones | Ratio    | Character |
|-------|-----------|----------|-----------|
| +4th  | +5        | 1.335    | Open, folk parallel |
| +5th  | +7        | 1.498    | Classic harmony, bright |
| +8va  | +12       | 2.000    | Octave doubling |
| -8va  | -12       | 0.500    | Sub-octave, bass doubling |

---

## Polish ideas

1. **Phase locking**: add FFT phase vocoder analysis in the worklet to eliminate metallic transient artifacts. Doubles the worklet code but dramatically improves staccato quality.
2. **Elevation control**: add Y-axis slider so harmony can be placed above/below (spatial height cues are conveaker but still perceptible with HRTF).
3. **Dual interval**: spawn two worklets for two simultaneous harmonies (e.g., a triad from a single melody note).
4. **Scope delay slider**: let user tune the phase portrait delay from 5–80ms (as in `20-scope`) to find the clearest ellipse for their pitch.
5. **Harmony reverb**: add a `ConvolverNode` on the harmony chain only — your echo has a different room than you.

---

*Built Cycle 26, 2026-05-19*
