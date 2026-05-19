# 38 — Mood XY

**Question**: what if Resonance let you navigate musical mood as a 2D coordinate?

**Route**: `/dream/38-mood-xy`

---

## The model

Russell circumplex model of emotion: two orthogonal axes define any emotional state.

- **X axis — valence** (sad ←→ happy): the pleasantness/positivity of the mood
- **Y axis — arousal** (calm ↕ energetic): the energy / activation level

Every possible emotional state is a point in this 2D space. Four prototypical quadrants:

| | Happy (valence+) | Sad (valence−) |
|---|---|---|
| **Energetic (arousal+)** | bright arpeggios, 120 BPM, major | dark runs, 110 BPM, diminished |
| **Calm (arousal−)** | sustained pads, 55 BPM, major | sparse chords, 40 BPM, minor |

---

## Audio mappings

### Valence → harmony and brightness
- **Chord quality**: major (vl > 0.33), minor (−0.33 < vl < 0.33), diminished (vl < −0.33)
- **Filter cutoff**: 400 Hz (sad/dull) → 5000 Hz (happy/bright). Exponential ramp on position change.
- **Note duration modifier**: sad adds 40% more sustain on top of the arousal-derived duration.

### Arousal → rhythm and texture
- **BPM**: 40 (calm) → 140 (energetic). Scheduler adapts on each beat.
- **Voice count**: 1 (calm) → 4 (energetic). More voices = denser texture.
- **Base register**: C3 (calm) → C5 (energetic). Two-octave sweep.
- **Attack time**: 0.8s (slow pad swell) → 0.04s (staccato pluck).
- **Arpeggio vs chord**: when arousal > 0.2, voices are staggered by `beat_duration / voices` for an arpeggio pattern. Below 0.2, all voices fire simultaneously (chord).
- **Note duration**: `beat_duration × (0.9 − 0.65 × arousal_normalized) × valence_modifier`. Calm = 90% of beat; energetic = 25% of beat.

### Background
Bilinear blend of four quadrant colors as position changes:
- Excited+happy: amber
- Excited+sad: purple
- Calm+happy: teal
- Calm+sad: navy

---

## Implementation

Pure Web Audio API. No external dependencies.

**Synthesis chain**: `OscillatorNode (triangle)` → `GainNode (ADSR)` → `BiquadFilter (lowpass)` → `GainNode (master)` → output.

**Scheduler**: `setTimeout`-based recursive tick. Each tick reads current position from a ref (not state), so the synthesizer always responds to the latest drag position even mid-note. BPM adapts on every beat.

**Attack safety**: attack time is clamped to `dur × 0.4` to prevent the attack envelope from outlasting the note duration (would happen in calm+happy: attack=0.8s but a happy-valence note could be short).

**Gain normalization**: each voice's peak gain is `0.18 / √(voices)` — RMS-correct sum for multiple simultaneously playing oscillators.

---

## Polish ideas for future cycles

1. **Chord progressions**: instead of always playing the same root, walk a I → IV → V → I cycle at the current chord quality. The root changes every 4 beats. Adds harmonic motion without losing position-responsiveness.

2. **Pitch drift**: as the dot moves, slide the base frequency to the nearest scale degree (pentatonic if happy, chromatic if sad). Continuous glide rather than hard octave jumps.

3. **Mic input feedback**: mic amplitude drives the arousal value upward. Loud playing = energetic. Silence = drift toward calm. The user's energy literally shapes the mood.

4. **Preset dots**: pre-placed labeled dots at the four quadrant centers. Click a preset to snap the position. Good for first-time users who aren't sure where to drag.

5. **Trail color**: currently white; could tint each trail point by the bgRgb of its recorded position, so the path glows in the colors of the moods it passed through.

6. **Export path**: save the trail as an SVG or JSON time-series of (vl, ar, t) — a "mood journey" artifact.
