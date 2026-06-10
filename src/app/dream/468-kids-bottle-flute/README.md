**For: kids (4+)**

# Bottle Flute — digital waveguide wind instrument

> "What if a 4-year-old could BLOW into a real flute made of glowing bottles?"

A row of five glowing glass bottles of graduated size (big = low, small = high)
that a child can tap and blow into. The sound is a **digital waveguide flute
physical model** — the lab's first *breath-excited* bore waveguide. Any
combination of notes is consonant (C D E G A — pentatonic subset of C Lydian).

---

## One-line pitch

Tap a glowing bottle and blow (or just blow into the mic) — a real
physically-modeled flute bore breathes, resonates, and overblows to the octave.

---

## How it works

### Input path
- **Microphone RMS envelope** — browser `getUserMedia`, `AnalyserNode`,
  `getFloatTimeDomainData`, smoothed RMS. The envelope value (0–1) drives
  the `breath` AudioParam on the waveguide node. The mic is analysis-only —
  no recording, no storage, no transmission.
- **Touch** — `onPointerDown/Up` on each SVG bottle. Without mic, a preset
  attack/sustain/release envelope is played via `setInterval`.
- **Auto-demo** — starts 3 s after page load if no interaction. Walks through
  a gentle 15-note melody using the same touch-envelope path.

### Audio subsystem
1. **Digital waveguide flute** (AudioWorklet, ScriptProcessor fallback):
   - Circular delay line of length `N = round(sampleRate / freq)` — the bore.
   - One-pole lowpass reflection filter at the open end: `y = g·y_prev + (1−g)·x`.
   - Excitation: `pressure(t) = env·0.52 + breathNoise·env·0.30`  
     `jetInput = pressure + boreOutput · 0.40`  
     Soft-clip jet: `jet = jetInput − jetInput³ / 3`  (tanh Taylor approx)
   - New bore sample: `bore[ptr] = jet − reflected`
   - At high `env` values the cubic term shifts the operating point → the
     second harmonic (octave) grows: **natural overblow**, same physics as a
     real flute.
   - Stability guards: feedback gain < 1, hard clamp ±1.15, NaN → 0.
2. **Reverb** — four-comb Schroeder network + two allpass filters (no extra deps).
3. **DynamicsCompressor** brick-wall limiter (threshold −3 dB, ratio 20:1) — all
   audio routes through this, so nothing is ever harsh for small ears.
4. **Ambient pad** — three triangle oscillators (C3 E3 G3) with slow LFOs,
   gain 0.008, always on so the space is never silent.

### Visual subsystem (SVG only — no Canvas, no WebGL)
- Five inline SVG bottles, proportional to note: biggest bottle = C4 (lowest),
  smallest = A4 (highest).
- `feGaussianBlur` drop-shadow / glow filter; `linearGradient` warm glass fill.
- `requestAnimationFrame` loop updates DOM attributes directly via `useRef` —
  bypasses React diffing for smooth 60fps animation.
- Per-bottle shimmer ellipse rises from the mouth and grows with breath level.
- Tiny bubbles float up from the mouth when breath > 0.05.
- Glow halo pulses and wobbles when active.

### Scale
C D E G A (pentatonic over C Lydian): any simultaneous combination is consonant.
"Bigger = deeper" — universally understood, no reading required.

---

## Named references

1. **Julius O. Smith III** — *Physical Audio Signal Processing*  
   https://ccrma.stanford.edu/~jos/pasp/  
   Waveguide synthesis, bore modeling, reflection filters, open-end termination.

2. **Perry R. Cook** — *Real Sound Synthesis for Interactive Applications*  
   A K Peters, 2002. Also the **STK (Synthesis ToolKit) Flute** model  
   (`src/Flute.cpp`) — the jet delay, embouchure coupling, and breath noise  
   architecture follow Cook's formulation closely.

3. **McIntyre, Schumacher & Woodhouse** — "On the oscillations of musical  
   instruments", *Journal of the Acoustical Society of America* 74(5), 1983.  
   The excitation+resonator framing (nonlinear exciter driving a linear bore  
   resonator) that underpins all waveguide wind synthesis.

### Relationship to Karplus–Strong (prototype 105-pluck-field)
Karplus–Strong is the simplest *plucked-string* waveguide: a single delay line
with a one-pole lowpass and decaying feedback, excited by a burst of noise.
This prototype is a **different physical regime** — a *breath-excited bore*:
the excitation is continuous (not a one-shot burst), there is a nonlinear jet
term, and the model supports sustained tone and overblow. The physics are those
of air columns rather than strings.

---

## Subsystem summary

| Subsystem | Technology |
|---|---|
| Bore resonator | Circular delay line (AudioWorklet / ScriptProcessor) |
| Reflection filter | One-pole lowpass |
| Jet excitation | Soft-clip cubic nonlinearity |
| Breath input | Mic RMS envelope OR preset touch envelope |
| Reverb | 4-comb Schroeder + 2 allpass (Web Audio, no deps) |
| Hard limiter | DynamicsCompressor (threshold −3 dB, ratio 20:1) |
| Visuals | Inline SVG, feGaussianBlur, linearGradient, rAF DOM updates |
| Ambient pad | Triangle oscillators × 3 with LFO |

---

## Self-assessment — what is unverified

- **Real-mic breath envelope on real hardware**: the RMS threshold (0.004–0.055)
  was tuned by ear on a typical laptop mic. Quiet rooms / phone mics may need
  recalibration. The fallback touch-only path always works.
- **AudioWorklet support**: supported in all modern browsers. Safari ≥ 14.1.
  The ScriptProcessor fallback fires if `addModule()` throws. ScriptProcessor
  is deprecated but functional in all browsers as of 2025.
- **Overblow on real hardware**: the octave jump emerges from the cubic jet term
  at `env ≈ 0.75–0.85`. Whether a 4-year-old's breath produces that RMS level
  depends on mic gain and distance. Strong testers (adults) reliably overblow.
- **Waveguide stability**: feedback is clamped < 1, output hard-limited, NaN
  guarded at every step. Tested across all 5 pitches — no runaway observed.
  Very low frequencies (< 80 Hz) are not used here (minimum is C4 = 261 Hz).
- **iOS AudioContext unlock**: the Start button creates the AudioContext inside
  a user gesture, which satisfies the autoplay policy. `getUserMedia` is also
  called inside the same gesture handler.
- **Performance on low-end devices**: the AudioWorklet processes 128 samples
  per block at 44100 Hz — well within budget. The ScriptProcessor uses 512-
  sample blocks. SVG rAF animation is lightweight (DOM attribute writes only).

---

*Built for Resonance Dream Lab — prototype 468*
