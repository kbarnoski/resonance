# 275 · Memory Loom

## The one question
**What if a piece LISTENED to you play, captured verbatim phrases of what you played, and wove them into an endless, ever-changing Brian-Eno / Robert-Fripp tape-loop room built entirely from YOUR own sound — audibly different at minute 10 than at minute 1?**

This is the *verbatim-capture* approach to a long-form generative listener. The machine records the actual phrases you play and replays / recombines them: a living Frippertronics looper with a 10-minute generative state machine layered on top. The memory bank *is* the instrument.

## What's novel
Most "listening" pieces extract pitch/features and re-synthesize. Memory Loom does the opposite — it keeps the **raw audio**. Phrases you play are sliced verbatim out of a rolling ring buffer and become tape loops that re-enter the texture at incommensurate lengths, slowly displacing older memories. The piece never repeats because (a) the loops are mutually incommensurate and never phase-align, and (b) a generative state machine reweaves which memories sing every 60–130 s. It is also *never silent*: a synthesized D-dorian pad plays from the first instant and is gradually replaced by your own captured sound.

## Subsystems

### 1. Capture (the listener)
- Live mic via `getUserMedia({ audio: { echoCancellation:false, noiseSuppression:false, autoGainControl:false } })`.
- A `ScriptProcessor` (4096) computes a smoothed short-time **RMS** and writes every block into an 8-second rolling **ring buffer**.
- A two-threshold onset/release detector marks phrase boundaries: RMS crossing `ONSET_THRESH` (rising) opens a phrase; falling below `RELEASE_THRESH` (or hitting the 4.5 s cap) closes it.
- On phrase-end, the most-recent N samples are sliced out of the ring, gently peak-normalized, given short fade-in/out (loopability), and added to the bank. Blips under 0.6 s are ignored.
- The raw input is **not** monitored — the ScriptProcessor is routed through a muted sink so only the woven loops are heard.

### 2. The incommensurate loop bank (the memory)
- Up to **7** captured phrases. Each becomes a looping `AudioBufferSourceNode` started at a random offset.
- Per voice: a consonant transposition via `playbackRate` (octave / fifth / fourth / major-third / unison, ratios `[1, 0.5, 1.5, 0.75, 1.25, 2]`), a stereo pan, and a slow **per-voice gain LFO** at an incommensurate rate (`0.041 … 0.127 Hz`).
- A separate incommensurate **playhead rate** (`0.131 … 0.257`) drives only the visual sweep.
- When the bank is full, the **oldest** phrase (demo seeds first, then by capture time) is stopped and removed — a decaying memory.

### 3. The state machine (rewrite its own structure)
- Every **60–130 s** the piece enters a new *movement* and random-walks:
  - the **active set** (3–5 of the bank, the rest fade out over multi-second crossfades),
  - each newly-activated voice's **transposition** (re-rolled, glided over ~1.2 s),
  - **target levels** (density),
  - master **lowpass cutoff** (900–4100 Hz, 4 s glide),
  - **reverb wetness** and **dry level** (5 s glides).
- Crossfades use `setTargetAtTime` so movement changes are seamless. Because the active set walks and new captures keep arriving, the texture at minute 10 is genuinely unlike minute 1.

### 4. Visualization (make the memory legible)
- Canvas2D at ~60 fps, near zero per-frame allocation (peaks precomputed once per phrase).
- Each phrase is a horizontal **lane**: its waveform drawn in, a **playhead** sweeping at its own incommensurate rate, **brightness = current gain**, hue warm (captures) vs amber (demo seeds), label `captured 2m ago`.
- A capture **flash** animates a new phrase entering the loom; a live input meter shows RMS and whether a phrase is currently being captured.
- HUD: elapsed clock, movement number, active/total voice count, current input source.

## Audio signal chain
```
[ mic / file loop / track loop ]
        │  (tap, muted) → ScriptProcessor → ring buffer → phrase slices
        ▼
   per phrase: BufferSource(loop, playbackRate) → Gain(LFO+crossfade) → StereoPanner
        ▼
   shared Lowpass ──┬──→ Dry Gain ─────────────┐
                    └──→ Convolver(procedural IR) → Wet Gain ─┤
                                                              ▼
                                            DynamicsCompressor (limiter) → destination
```
The convolution impulse response is built procedurally (exponential-decay stereo noise) in-context — no asset files. The `DynamicsCompressor` acts as a master limiter so the sum never clips and never drops to silence.

## State-machine spec (summary)
| Param | Range | Walk cadence | Glide |
|---|---|---|---|
| active voices | 3–5 of bank | every movement | 2.5 s in / 4.5 s out |
| transposition | octave/5th/4th/M3/unison | on re-activation | 1.2 s |
| lowpass cutoff | 900–4100 Hz | every movement | 4 s |
| reverb wet | 0.30–0.75 | every movement | 5 s |
| dry | 0.45–0.80 | every movement | 5 s |
| movement length | 60–130 s | — | — |
| per-voice gain LFO | 0.041–0.127 Hz | continuous | — |

## Degradation table
| Condition | Behavior |
|---|---|
| No Web Audio API | `text-rose-300` notice; nothing starts |
| Mic permission denied | `text-rose-300` notice; synth demo pad keeps playing; file / track still available |
| File fails to decode | `text-rose-300` notice; demo continues |
| Welcome Home track load/decode fails | `text-rose-300` notice; demo continues |
| No input yet | D-dorian demo pad fills the room until captures arrive |
| Unmount | all sources stopped, RAF cancelled, mic tracks stopped, `audioCtx.close()` |

## Named references
- **Brian Eno & Robert Fripp** — *Frippertronics* / *(No Pussyfooting)* (1973) and Eno's *Music for Airports* (1978): two tape machines feeding one another so captured phrases re-enter the texture and slowly decay. Memory Loom's incommensurate loop bank + decaying-memory displacement is a digital Frippertronics.
- **Pauline Oliveros** — *Deep Listening*: the instrument is what it hears. Here that is literal — the bank of captured audio is the only instrument once your sound takes over.

## Honest limitations
- Capture uses `ScriptProcessor`, which is deprecated and runs on the main thread; an `AudioWorklet` would be lower-latency and glitch-free under load. (Chosen deliberately to avoid worklet build complexity.)
- Onset detection is RMS-only (no spectral flux), so it favors clear note attacks over legato/soft material and can mis-segment very reverberant input.
- Peak normalization is naive; loud transients can still sound hot before the limiter catches them.
- Loops are time-domain `playbackRate` transpositions, so large intervals shift duration/timbre (a feature here, but not pitch-faithful).
- File / track sources are looped and captured but not directly monitored; you hear only the woven loops, which can feel sparse until a few phrases are banked.

## Next-cycle deepening ideas
- AudioWorklet capture + spectral-flux onset detection for cleaner phrase boundaries.
- Pitch-preserving transposition (granular or phase-vocoder) so wider intervals stay musical.
- Per-phrase micro-granulation / reverse / time-stretch as additional reweave operators.
- A second reverb send and a feedback-delay "tape" path for true regenerative Frippertronics decay.
- Persist the memory bank so a session can be resumed, and export the evolving mix.
- Save/recall "movements" so a performer can steer the long-form arc rather than only random-walking it.
