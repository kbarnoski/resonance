# Sympathetic Strings

> "What if you play or sing into your mic and exactly the right strings ring back — your sound waking an illusory bank of tuned strings that vibrate sympathetically, the way a grand piano's strings ring when you hold the sustain pedal?"

## Tags

- **INPUT:** Mic via getUserMedia (echoCancellation:false, noiseSuppression:false, autoGainControl:false) → AudioWorklet; click-to-pluck on SVG strings; spacebar / on-screen button as sustain pedal
- **OUTPUT:** 48 vertical SVG lines with feGaussianBlur glow, wobble, and per-string brightness tracking real delay-line energy; stereo audio via Web Audio API
- **TECHNIQUE:** Karplus-Strong tuned-delay-line sympathetic resonator bank (AudioWorklet, Blob URL), one-pole lowpass loop filter, per-string spectral excitation scaling from FFT analysis
- **VIBE:** Dark, warm, nocturnal. Adult / live-performance / intimate. Like holding the sustain pedal on a grand piano and singing into the open strings.

## Concept

The piece models 48 tuned sympathetic strings — the kind found inside a sitar (where they're called *tarab*) or a viola d'amore, and evoked by Henry Cowell's string-piano preparations. When you hold the sustain pedal on a grand piano and sing into it, the strings tuned to your pitch vibrate without being struck: the air pressure alone excites them. This is that experience, made tangible in browser audio.

The implementation is a direct homage to the Electronic Audio Experiments **Prismatic Wall** pedal (2026): a bank of tuned delay lines each receiving the same input signal, ringing according to their natural resonant frequency. Strings tuned to what you play ring loudly; strings tuned to other pitches stay quiet.

## Engine

### AudioWorklet (Blob URL)

The Karplus-Strong processor is defined as a string literal in `worklet-source.ts`, converted to a Blob URL, and loaded via `audioWorklet.addModule(URL.createObjectURL(blob))` — no separate file or public directory needed.

Each string is implemented as:

```
delay line: circular buffer of length L = round(sampleRate / freq)
loop filter: filtered = (delayed + lastOut) * 0.5  // one-pole lowpass
feedback: looped = filtered * feedbackCoeff         // feedbackCoeff < 1
write: buf[writePos] = looped + excitation * exciteScale
```

The worklet posts a `levels` array message at ~15 fps so the SVG visualizer can update without polling.

### Spectral Excitation Scaling

An `AnalyserNode` (FFT size 2048, smoothing 0.7) taps the mic signal and is sampled every 80ms. For each of the 48 strings, the FFT bins within ±half a semitone of that string's frequency are averaged and mapped to an excitation scale (0.05–1.85). This is what makes strings "tuned to what you play" ring loudly — they receive proportionally more excitation energy.

### Tuning Modes

| Mode | Description |
|------|-------------|
| **Chromatic** | 48 evenly-spaced semitones across A0–C8 (piano range) |
| **Stacked Fifths** | 48 pure 3:2 ratio fifths from C2, wrapped into range (Pythagorean spiral) |
| **Overtone Series** | Harmonic series of A0 + octaves, emphasizing brass-natural intervals |

Switching modes reissues a `retune` message to the worklet, retuning the delay line lengths live while preserving any energy already in the bank.

### Long-form Accretion

- **Pedal off:** feedback = 0.92 — strings decay in ~1–2 seconds
- **Pedal on:** feedback = 0.997 — energy persists for many seconds; new energy from the mic stacks on top
- With the pedal held, the bank builds a genuinely fuller sustained bed at minute 3 than at second 10 — state is real delay-line energy, not a loop

## Audio Safety Chain

```
Mic → AnalyserNode (tap only) → GainNode (exciteGain, 0.6)
    → AudioWorkletNode (KS resonator bank, feedback ≤ 0.999)
    → DynamicsCompressorNode (ratio 20:1, threshold −18 dB, attack 1ms)
    → AudioContext.destination
```

**Critical:** The mic source (`MediaStreamAudioSourceNode`) is **never** connected to `destination`. Only the worklet output reaches the speakers. This prevents acoustic feedback howl even at high sustain settings.

The worklet clamps feedback to `[0, 0.999]`. The DynamicsCompressor acts as a hard limiter for any runaway build-up.

## Fallbacks

- **No mic / permission denied:** A ghost exciter runs inside the worklet — periodic `pluck` messages inject noise bursts into groups of strings every ~320ms, creating an autonomous shimmer within ~2 seconds. A `text-rose-300` notice informs the user. Click any SVG string to pluck it manually.
- **No AudioContext:** Friendly `text-rose-300` message; no crash.
- **AudioWorklet failure:** Caught and surfaced as an error notice.

## Visualization

48 vertical SVG `<line>` elements span the full screen height. Each string has two layers:
1. **Sharp layer:** thin (0.8–4.3px), high opacity when ringing
2. **Glow layer:** wide (3–20px), low opacity, with `feGaussianBlur` filter (dynamic stdDeviation 1.5–10)

Color maps: low strings = amber/orange (~35°), mid strings = violet (~280°), high strings = cool blue (~220°). The wobble displacement tracks `sin(phase)` where phase advances faster for ringing strings.

String elements are updated imperatively (DOM refs) inside `requestAnimationFrame` — not React state — for smooth 60fps rendering without re-renders.

## Teardown

On unmount, the `useEffect` cleanup:
- Cancels `requestAnimationFrame`
- Calls `engine.stop()` which:
  - Clears all `setInterval` handles (ghost exciter, spectral analysis, level reporting)
  - Disconnects all AudioNodes in order
  - Stops all MediaStream tracks
  - Calls `AudioContext.close()`

No leaks. No dangling intervals or audio nodes.

## References

- Electronic Audio Experiments **Prismatic Wall** (sympathetic string resonator, tuned-delay-line Karplus-Strong, 2026)
- Kevin Karplus & Alex Strong; David A. Jaffe & Julius O. Smith, "Extensions of the Karplus-Strong Plucked-String Algorithm," *Computer Music Journal* 7(2), 1983
- Sitar *tarab* sympathetic strings; viola d'amore sympathetic strings
- Henry Cowell string-piano preparations

## Files

```
808-sympathetic-strings/
├── page.tsx           — Client component, SVG visualization, UI controls
├── audio.ts           — SympathyEngine class, tuning helpers, frequency builders
├── worklet-source.ts  — AudioWorklet source as string literal (Blob URL loading)
└── README.md          — This file
```
