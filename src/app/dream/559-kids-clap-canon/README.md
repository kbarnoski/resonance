# Clap Canon

**Slug:** `559-kids-clap-canon`

## What it is

A 4-year-old-friendly introduction to Steve Reich's gradual phase shifting. The child claps a short rhythm into the microphone; two friendly blob characters loop it back. A second character plays the *same* rhythm but drifts very slightly faster, so over 20–40 seconds the two patterns slide from unison → shimmering interlocked groove → back to unison — exactly the technique Reich used in *Clapping Music* (1972) and *It's Gonna Rain* (1965).

A large circular **phase wheel** in the center of the screen shows two colored dots orbiting at slightly different speeds. When the dots align = unison. When the dots are apart = the patterns are offset. The drift is visible, not just heard.

## How to use

1. Open the page — the phase wheel and characters animate immediately with a built-in demo pattern (no click needed; audio waits for interaction).
2. Press **Start Clapping!** — this creates the AudioContext (iOS unlock) and requests the microphone.
3. Clap 2–6 times near the mic. Each detected clap lights up Clapper A and fills a dot in the counter. After ~2s of silence the rhythm is captured and both characters start looping.
4. Watch the phase wheel — dot A (violet) holds steady; dot B (amber) drifts slightly ahead each loop cycle.
5. Press **Clap a New Rhythm** at any time to record a fresh pattern.

**No mic?** A `text-rose-300` banner appears and tap-anywhere becomes the clap input.

## Named reference

- **Steve Reich** — *Clapping Music* (1972): two performers clap the same 12-note pattern; one shifts by one eighth-note every 12 bars until back in unison.
- **Steve Reich** — *It's Gonna Rain* (1965): tape phasing — two identical tape loops play simultaneously at slightly different speeds, slowly drifting and realigning.

This prototype distills that concept to ~18% drift (`PHASE_DRIFT = 0.018`) so one full phase cycle takes roughly 30–40 seconds with a 2.5s loop.

## Subsystems

### 1. Mic onset detection
`getUserMedia({ audio })` → `AnalyserNode` (fftSize 2048, smoothing 0). Each rAF frame computes time-domain RMS; a fast-attack / slow-decay EMA tracks background energy. An onset fires when `rms > max(0.015, ema * 2.5)` with a 120ms refractory period. Detected onset times are stored as `performance.now()` timestamps.

### 2. Phase-canon scheduler
Two voices (`voice A` and `voice B`) share the same inter-onset-interval (IOI) array. Voice B's interval is multiplied by `1 - PHASE_DRIFT` (= 0.982), making its loop ~1.8% shorter. A 25ms `setInterval` polls `audioCtx.currentTime` and schedules sample-accurate `BufferSource.start(t)` / `OscillatorNode.start(t)` events 120ms ahead (look-ahead scheduling). No `setTimeout`-per-note.

### 3. SVG render + rAF attribute mutation
All animation is pure SVG DOM attribute mutation via `requestAnimationFrame` — no per-frame React `setState`. The phase wheel dots, character body scale, glow halo opacity, and hand positions are all written directly with `element.setAttribute(...)` each frame. React state is updated only for discrete UI events (clap count, phase transitions).

### 4. Character animation
Two blob characters (SVG ellipses + eyes + hands) flash and scale on each scheduled clap via `vs.flashA / vs.flashB` values that decay at 6×/s. Hands move inward on the flash peak. A soft `feGaussianBlur` glow filter pulses in intensity.

## Audio chain

```
MicSource ──→ AnalyserNode (onset detection, not in output path)

OscillatorNode / BufferSourceNode
  └──→ GainNode (per-note envelope)
         └──→ masterGain (0.75)
                └──→ DynamicsCompressor (threshold: -10dBFS, ratio: 20:1) ← brick-wall limiter
                       └──→ AudioContext.destination
```

Voice A: warm bandpass-filtered noise clap + low sine body sweep (650 Hz BP, 200→80 Hz sine).
Voice B: bright highpass noise woodblock + 880→440 Hz triangle tone + 1320 Hz partial.

## Ambition / diversity framing

This prototype demonstrates that a profound concept from 20th-century minimalist music (gradual phase shifting) is accessible to the youngest players — not as an abstract lesson but as joyful discovery. A child clapping and watching two friendly blobs slowly drift apart and come back together is the same aesthetic insight Reich describes: "I was looking for a way to make music that was about process, that would make the process perceptible." The phase wheel makes that process visible at a glance.

**Input modality:** Off-glass microphone (clap/onset detection), not a touch gesture — the child performs physically in space.
**Output modality:** SVG animated via direct rAF DOM mutation (not CSS transitions, not React re-render, not Canvas).
**Audience:** 3–6 year olds + curious adults.
