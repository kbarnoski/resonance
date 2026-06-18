**For**: kids (4+)

## The one question

What if a kid talks into the phone and a googly cartoon monster repeats it back in the silliest possible voice?

## What it does

A full-screen Canvas2D cartoon monster with googly rolling eyes.

1. A big **▶️ Start** button creates and resumes the AudioContext inside the tap gesture (required for iOS) and starts a gentle ambient pad so the toy is never silent.
2. The monster idles, eyes wiggling, while a big animated **⬇️ arrow** points at a giant **🎤 mic button**.
3. Press-and-hold (or tap) the mic to record ~1.8s of the kid's voice into an `AudioBuffer` via `getUserMedia` + `MediaRecorder`. A rose "listening" pulse plays while recording, and it auto-stops so a kid never gets stuck.
4. After recording, five BIG color-coded icon-only buttons appear. Each press instantly replays the **last** recording transformed comically. The monster's mouth lip-syncs to playback loudness and its eyes do a googly wiggle on every press.

No reading is required: icons + color only, tap targets are 64–80px and well spaced, every press responds immediately, there are no fail states and no scary sounds.

## The voice → monster mapping

| Button | Mode | Transformation |
| --- | --- | --- |
| 🐿️ | **chipmunk** | `playbackRate = 1.85` — high & fast (varispeed) |
| 👹 | **monster** | `playbackRate = 0.62` — low & slow (varispeed) |
| 🔁 | **backwards** | Float32 channel data reversed into a new buffer, normal rate |
| 🤖 | **robot** | ring modulation: voice routed through a `GainNode` whose gain is driven by a ~30Hz square oscillator |
| 🌊 | **wobble** | vibrato: voice through a `DelayNode` whose `delayTime` is modulated by a 6.5Hz sine LFO (warble) |

This is a pure comedy voice-changer. It does **not** snap pitch to a scale, does **not** play a melody, and has no key/harmony/cadence — just silly sample manipulation (think Talking Tom).

## Audio architecture

Kid-safe master chain, every sound passes through it:

```
sources → master GainNode (0.32, capped ≤0.35)
        → BiquadFilter lowpass 7500Hz
        → DynamicsCompressor
        → destination
```

- The **master** is also tapped by an `AnalyserNode`. The render loop reads the time-domain data, computes an RMS envelope, and drives the monster's mouth opening in real time (fast attack, gentle release).
- The **ambient pad** is three detuned triangle oscillators with slow tremolo LFOs at low gain, so the monster is never fully silent.
- **Recording**: `MediaRecorder` captures the mic stream; on stop the blob is decoded with `decodeAudioData` into the reusable `AudioBuffer`. There is an instant chipmunk auto-preview after recording so there's immediate payoff.
- **Playback** builds a fresh `AudioBufferSourceNode` (plus mode-specific nodes) each press and stops any in-flight playback first, so presses feel instant (<50ms). All transform nodes (oscillators, LFOs) are stopped via `onended`.

### Graceful degradation

- If the mic is denied/unavailable, a friendly `text-rose-300` message shows and the same five big buttons play **pre-baked synthesized silly sounds** (boing, honk, pop, wobble whistle, raspberry) so the monster still performs.
- If Canvas2D is unavailable, a `text-rose-300` notice replaces the monster.

### Cleanup

On unmount: cancel `requestAnimationFrame`, clear the record timer, stop in-flight playback and the `MediaRecorder`, stop all mic tracks, and close the `AudioContext`.

## References

- **Outfit7 "Talking Tom"** — the canonical record-and-replay-in-a-silly-voice talking-character toy this riffs on.
- **Toca Boca** — kid-first, no-reading, no-fail, tap-anything design language (big icons, immediate joy).
- Technical nod: **varispeed** playback (pitch/speed coupled via `playbackRate`) and **granular / buffer playback** sample manipulation, the classic primitives behind cartoon voice changers; reverse-buffer and ring-modulation round out the comedy toolkit.
