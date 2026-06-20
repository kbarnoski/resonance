# 781 — Kids Paint Conductor

**What if a 4-year-old's freehand drawing IS a musical score?**

A glowing vertical playhead sweeps continuously left→right across a bright, warm canvas (8-second loop). Every stroke the child paints becomes a melodic line: **x = when it sounds**, **y = pitch** (top = high, bottom = low), **color = voice/timbre**, **stroke thickness = loudness**. The composition grows richer the more they draw — there is no wrong note and no reset.

---

## Concept & Heritage

This prototype is a direct child of **Iannis Xenakis's UPIC (Unité Polyagogique Informatique du CEMAMu)**, conceived at CEMAMu, Paris, in 1977. UPIC was a graphic music-composition system where a stylus drawn on a digitising tablet became a waveform or melodic contour, rendered as sound in real time. Xenakis wrote: *"With UPIC, music becomes a game for children: they draw, they hear."*

Modern descendants of the same idea include **UPISketch** (Kontogeorgakopoulos & Alcorn, 2012) and **SonicSketch** (2017+), which explored touch-screen realisations for casual and young audiences. This prototype answers the question: **what would UPIC feel like in a child's hands today, on an iPad, with no technical literacy required?**

The key design difference from UPIC: the playhead loops *continuously and forever* — the score never needs to be "played back" as a separate step. The child is always already composing, always already hearing.

---

## How It Works

### Drawing surface
- Full-screen Canvas2D on a warm cream (`#fefce8`) background — bright daylight register, joyful and active.
- A seed curve is planted on load so the canvas is never silent or static on first glance.

### Playhead
- A glowing yellow-white vertical bar sweeps left→right on an 8-second loop, never pausing.
- At each rendered frame, every painted stroke-point whose X coordinate falls within ±4 px of the playhead fires its pitch.

### Y → Pitch mapping (pentatonic-quantized)
- Canvas height is divided into 15 steps of the **C major pentatonic scale** across 2.5 octaves (C3 = 130.8 Hz → A5 = 880 Hz).
- Every Y coordinate snaps to the nearest pentatonic step — **nothing can ever sound wrong**.

### Voice timbres (5 color swatches)
| Swatch | Voice | Synthesis |
|--------|-------|-----------|
| 🔔 Amber | Bell | Sine + inharmonic partial, bell-like decay |
| 🪈 Green | Flute | Triangle oscillator, soft attack/sustain |
| 🎺 Red | Horn | Sawtooth → lowpass filter, warm brass |
| 🎶 Purple | Music Box | FM synthesis (carrier + modulator), tinkly |
| 🎸 Blue | Pluck | Triangle + octave sine, short pluck decay |

### Audio safety chain
All synthesis routes through: **master GainNode (≤ 0.28)** → **lowpass BiquadFilter (7 kHz)** → **DynamicsCompressor (−10 dB threshold, 20:1 ratio)** → destination. A very soft ambient pad drone (three sine oscillators at C3/G3/C4, gain 0.018) keeps the experience alive and non-silent.

### Clear
The broom button wipes all strokes with a sparkle burst explosion, then replants the seed curve after ~1.2 s.

---

## Tags

- **INPUT**: touch/draw (no microphone, no camera)
- **OUTPUT**: Canvas2D (no WebGL/WebGPU/shaders)
- **TECHNIQUE**: drawn-curve-as-continuous-score / playhead sonification (not granular synthesis)
- **VIBE**: bright daylight, playful/active (not dark luminous-glow)

---

## Limitations (honest)

1. **Polyphony cap**: At any playhead column, at most 4 simultaneous notes are played to avoid audio mud. Densely painted canvases may drop some voices — the per-column throttle (NOTE_COOLDOWN_MS) also skips rapidly-repeated columns, so very fast sweeps can feel sparse.
2. **Pitch resolution**: The 15-step pentatonic grid means strokes that are very close vertically will sound the same pitch — intentional for child-safety, but limits melodic granularity.
3. **No stroke persistence across page reloads**: Strokes live in component state; a refresh clears them. Long-term accumulation would require localStorage serialisation (not implemented).
4. **iOS Safari AudioContext**: The Web Audio API is gated behind the "Let's Paint!" start button to satisfy iOS autoplay policy. Before that tap, the playhead animates visually but is silent.
5. **DPI scaling**: On high-DPR screens, `devicePixelRatio` scaling is applied but a resize event can cause a single-frame flash. The canvas re-draws from the stroke list immediately, so the flash is imperceptible in practice.
