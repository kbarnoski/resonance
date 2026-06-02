# 259 · Paths Generative

**The question it answers:** What if Resonance turned your own piano recording into an endless, never-repeating Brian-Eno generative ambient piece — a living tape-loop room that's audibly different at minute 10 than at minute 1?

---

## Concept

This prototype implements the core idea behind Brian Eno's *Music for Airports* (1978) and *Discreet Music* (1975): multiple tape loops of different, mutually incommensurate lengths played simultaneously. Because no two loops share an integer ratio, their combinations never exactly repeat. At any given moment the texture is determined by where each loop happens to be in its cycle, which changes continuously.

The piece is genuinely long-form: with six loops ranging from ~11 to ~38 seconds, the approximate time before any exact repeat is astronomically large (product of the periods ≈ 29 hours). In practice the ear never hears repetition within a session.

The approach also echoes Steve Reich's phase music (*Piano Phase*, *It's Gonna Rain*): loops drifting gradually in and out of alignment create emergent rhythmic and harmonic patterns that were never explicitly programmed.

---

## How It Works

### Loop-Voice Scheme

**Six loop voices** are derived from the source AudioBuffer. Each voice uses a different slice of the buffer:

| Voice | Loop length | Playback rate | Pan  | LFO freq |
|-------|-------------|---------------|------|----------|
| 0     | 11.3 s      | 1.00 (unison) | −0.8 | 0.023 Hz |
| 1     | 14.7 s      | 0.50 (−8va)   | −0.4 | 0.031 Hz |
| 2     | 18.1 s      | 0.667 (−5th)  | −0.1 | 0.041 Hz |
| 3     | 23.9 s      | 0.75 (−4th)   | +0.2 | 0.053 Hz |
| 4     | 29.3 s      | 1.25 (M3 up)  | +0.5 | 0.061 Hz |
| 5     | 37.7 s      | 1.50 (P5 up)  | +0.9 | 0.071 Hz |

**Why these lengths?** They were chosen to avoid integer ratios with each other (e.g. 11.3 / 14.7 ≈ 0.769, not rational in simple form). The same care applies to the LFO frequencies — also incommensurate — so the amplitude envelope on each voice drifts independently and endlessly.

**Why these playback rates?** They correspond to musically consonant intervals (octave, fifth, fourth, major third) so the six-voice wash forms a harmonic cloud rather than a dissonant smear. Different transposition sets are introduced during later movements to shift the overall register.

**Voice offsets** are spread evenly across the source buffer so each voice samples a different region, maximising timbral variety from a short piano phrase.

### Signal Chain

```
AudioBufferSourceNode (loop)
  → GainNode (LFO-modulated per voice)
    → StereoPannerNode (fixed position)
      ├─→ DryGainNode ──→ BiquadFilter (lowpass) → MasterGain → destination
      └─→ ConvolverNode (impulse reverb)
            → WetGainNode ──↗
```

The **impulse reverb** is synthesised on the fly from exponentially-decayed noise (4.5 s tail). This avoids any external assets. Wet/dry mix and filter cutoff are both smoothly ramped on movement transitions.

### Generative State Machine

Every 90–150 seconds (divided by the "drift" slider multiplier), the piece enters a new **movement**. Each movement randomises:

- **Active voice subset** (3–5 of 6 voices) — some voices fade in, others fade out slowly (6-second fade)
- **Filter cutoff** — low-pass randomly walks between 200–4000 Hz, shaping brightness
- **Reverb wet level** — randomly walks 0.2–0.9, controlling room size
- **Transposition set** — occasionally (30% chance after movement 2) shifts to an alternate set [0.5, 0.667, 0.75, 1.0, 1.25], moving the register lower
- **Visual palette** — HSL hue walks ±20° per movement, saturation and brightness drift
- **Density multiplier** — scales overall voice loudness 0.6–1.4×

The movement history is stored in memory so it can be examined; the state machine avoids repeating the immediately previous movement's exact configuration by nature of the random walk. The result: minute 1 might have 3 bright, close voices; minute 5 a deep reverberant wash with 5 voices; minute 10 an airy register shift with different transpositions.

---

## Audio Source Priority

1. **File input** — drag-and-drop or choose any audio file. `file.arrayBuffer()` → `decodeAudioData`.
2. **Track ID** — enter a Resonance track ID; fetches `/api/audio/:id`. Handles both direct audio responses and JSON `{ url }` redirect; falls back to demo on failure.
3. **Synthesised demo** — a Cmaj7 → Fmaj7 → Am7 → G arpeggiated phrase built entirely in `OfflineAudioContext` using triangle/sine partials with piano-like envelopes. Starts immediately with zero user input.

---

## Visual Mapping

**Canvas 2D, calm and meditative:**

- **Six concentric rings**, one per voice, at radii proportional to voice index.
- Each ring **rotates** at a rate of `1 / loopLength` radians per second — shorter loops rotate faster. You can literally watch them drift out of phase over time, exactly as you hear it.
- A **playhead dot** orbits each ring at the same rate. Active voices have a glowing trail arc behind their playhead, scaled by current gain.
- Ring **brightness/opacity** = current LFO-modulated gain of that voice.
- **Radial gradient background** shifts hue smoothly with each movement.

The visuals are designed to be calm and slow — nothing pulses aggressively. The animation is purely observational: a clock you can watch and hear simultaneously.

---

## Degradation Behaviour

| Situation | Behaviour |
|-----------|-----------|
| No file + no ID | Demo plays automatically; white/75 notice shown |
| Track ID fetch fails | `text-rose-300` error shown; demo starts |
| Audio decode fails | `text-rose-300` error shown; demo starts |
| File decode fails | `text-rose-300` error shown; no auto-fallback (user can press Start Demo) |

---

## Named References

- **Brian Eno**, *Music for Airports* (1978) and *Discreet Music* (1975) — the defining examples of tape-loop ambience where the system produces music without a performer deciding each note.
- **Steve Reich**, *Piano Phase* (1967) and *It's Gonna Rain* (1965) — phase music demonstrates how two identical loops at slightly different speeds generate complex emerging patterns. This prototype applies the same principle to many loops of incommensurate length.

---

## Honest Limitations

- **Looping artefacts**: `AudioBufferSourceNode` loop points can produce clicks if the buffer waveform has a discontinuity at `loopStart`/`loopEnd`. A production version would zero-cross-detect or crossfade the loop boundary.
- **Synthesised demo is simple**: The arpeggiated phrase is pleasant but does not approach a real piano recording's complexity. Its brevity (~14 s) means the looped slices are very repetitive at fast playback rates.
- **No spectral processing**: A richer version would apply per-voice pitch-shifting via `PitchShifterNode` or offline grain processing rather than `playbackRate` (which also changes duration, altering the loop rhythm).
- **State machine memory**: Recent movements are tracked but the random walk could still re-visit similar states by chance. A Markov chain with explicit distance constraints would be more rigorous.
- **`setElapsedDisplay` called every animation frame**: This triggers React renders at 60 fps. A production version would throttle to once per second using a timestamp comparison.

---

## Next-Cycle Deepening Ideas

1. **Granular re-synthesis**: Slice the uploaded buffer into grains, scatter them with pitch and time variation — closer to Eno's actual studio techniques than buffer looping.
2. **Cross-synthesis**: Blend the spectral envelope of a pad/drone with the piano's excitation via convolution, creating new timbres from one recording.
3. **Adaptive harmony detection**: Analyse the input recording's pitch content and constrain playback rates to tuned intervals relative to the detected key.
4. **Persistent session**: Save movement history and current state to `localStorage` so a multi-hour piece can survive page refresh.
5. **Export**: Render N minutes to a WAV file via `OfflineAudioContext` so the generated piece can be shared.
