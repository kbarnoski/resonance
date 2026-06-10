# Resonant Room (475)

**Cycle 1 of the "Resonant Room" spine.**

> What if Karel's actual recorded piano were played into a room that rings back
> in the SAME KEY — a sympathetic resonance that swells while he plays, holds a
> warm in-key halo, and RESOLVES to the tonic / decays to silence when he stops?

---

## What it is

A warm, purposefully-resolving audio-visual room where a Feedback Delay Network
(FDN) reverb is tuned to the harmonic series of a chosen key. Hold the Swell
control to fill the space with in-key resonance; release it and the room rings
out to silence — the defining "resolves on purpose" gesture of this spine.

---

## How to use it

1. The piece **auto-starts in 3 seconds** (demos without interaction). Press
   Start early or just wait.
2. Pick a **Key** (C, D, E, G, A, Bb) — the FDN delay lengths retune in real
   time so the resonant halo always sits in key.
3. **Hold "Hold to Swell"** (or hold Space) to ramp up the feedback gain `g`
   toward 0.95 — the room fills, the lattice lights up, the in-key halo blooms.
4. **Release** — `g` ramps back to 0, the room rings out in the chosen key and
   decays to silence. This is the resolution.

---

## Audio sources

| Priority | Source | Behavior |
|---|---|---|
| 1 (preferred) | Karel's real *Welcome Home* recording via `/api/audio/549fc519-…` | Fetched as ArrayBuffer, decoded, played as looping AudioBufferSourceNode |
| 2 (fallback) | Warm synthesized piano chords: C – Am – F – G7 – Cmaj9 | Triangle-wave oscillator bank with soft attack/decay, loops, resolves on purpose. Amber notice shown: "Audio fallback — synthesized stand-in playing." |

---

## The FDN Technique

### Architecture: Jot / Stautner-Puckette N=8 FDN

This prototype implements the lab's **first Feedback Delay Network** — a
fundamentally different reverb architecture from a single Schroeder allpass
or convolution reverb.

```
Input
  │
  ├── dry gain ──────────────────────────────────┐
  │                                              │
  └── × 0.25 ──┬─ delay₀ ──┐                   │
               ├─ delay₁ ──┤                   │
               ├─ delay₂ ──┤  Householder      │
               ├─ delay₃ ──┤  mixing matrix    │
               ├─ delay₄ ──┤  (lossless,       │
               ├─ delay₅ ──┤   unitary)        │
               ├─ delay₆ ──┤  × g (0..0.97)    │
               └─ delay₇ ──┘        │           │
                     ↑──────────────┘           │
                     │                          │
                  sum of tails                  │
                  × wetGain                     │
                     │                          │
                     └───────────── masterGain ─┘
                                        │
                                    limiter
                                        │
                                   destination
```

**Householder mixing matrix** (Jot FDN): `H = I − (2/N) · 1·1ᵀ`

For N=8 this gives diagonal elements `1 − 2/8 = 0.75` and off-diagonal
elements `−2/8 = −0.25`. This matrix is orthogonal (H·Hᵀ = I), ensuring
the network is energy-preserving at `g = 1` and decays smoothly for `g < 1`.

**Key-tuned delay lengths**: Each delay line length is set as

```
Lᵢ = round(SR / fᵢ) + primeNudgeᵢ
```

where `fᵢ` is the frequency of the i-th scale degree of the chosen key
(tonic, M2, M3, P4, P5, M6, M7, octave), and `primeNudgeᵢ ∈ {0,1,3,5,7,11,13,17}`
breaks perfect periodicity without destroying the key alignment. The first
comb peak of each delay line therefore lands on a harmonic of the tonic —
so the room literally rings back in key.

**Per-line one-pole lowpass**: Each line has a warm lowpass filter
`y[n] = (1−α)·x[n] + α·y[n−1]` with cutoff declining from 8 kHz (shortest
line) to 4 kHz (longest line). High frequencies decay faster than low — the
natural behaviour of a real room.

**Swell gesture → purposeful resolution**: `g` is ramped up on hold (room
fills, modal peaks dominate in-key) and ramped back to 0 on release (energy
drains from all 8 delay lines simultaneously, decaying to silence within a
few seconds). This is not a drone — it resolves.

### References

- **Stautner & Puckette**, "Designing Multichannel Reverberators,"
  *Computer Music Journal* 6(1), 1982 — the original N×N FDN concept
  (multiple coupled delay lines with a feedback matrix).
- **Jean-Marc Jot & Antoine Chaigne**, "Digital Delay Networks for Designing
  Artificial Reverberators," *AES 90th Convention*, 1991 — introduced the
  lossless feedback matrix and per-line attenuation for frequency-dependent
  decay (the Jot FDN, the architecture implemented here).

---

## Subsystems

| Subsystem | File | Notes |
|---|---|---|
| FDN AudioWorklet DSP | `fdn-worklet-src.ts` | Inlined JS string; loaded via Blob URL |
| FDN ScriptProcessorNode fallback | `page.tsx` (`buildFdnScriptProcessor`) | Identical DSP loop, runs in-thread |
| Warm synth piano fallback | `page.tsx` (`buildSynthPiano`) | C–Am–F–G7–Cmaj9, triangle oscs |
| WebGL2 lattice renderer | `page.tsx` (`createLatticeGL`) | 8 ring nodes, edges, additive blend |
| Audio graph builder | `page.tsx` (`buildAudioGraph`) | Worklet-first, falls back to SPN |
| Page + controls | `page.tsx` (`ResonantRoomPage`) | Key picker, Swell button, Space key |

### Audio graph detail

```
[Karel's piano or synth] ──→ dry gain ──→ master gain → limiter → destination
                         └─→ FDN input ─→ FDN output → wet gain ↗
```

FDN implemented as `AudioWorkletNode` (primary) or `ScriptProcessorNode`
(fallback). The `DynamicsCompressorNode` limiter (ratio 20:1, threshold −3 dB)
acts as a brick-wall guard: never clips, never hurts ears.

---

## Visual

A WebGL2 ring-lattice of 8 glowing nodes (one per delay line) connected by
energy-weighted edges. The Householder cross-connections are visualised as
additional edges between opposite nodes. Node radius and brightness track
each line's RMS energy (posted from the worklet ~40×/sec). Additive blending
gives natural bloom; the palette is golden-amber on deep-indigo `#0a0514`.
A `ResizeObserver` handles canvas sizing; GL is fully disposed on unmount.

---

## Graceful degradation

| Scenario | Behaviour |
|---|---|
| Audio fetch fails | Warm synthesized piano + amber notice |
| AudioWorklet fails | ScriptProcessorNode fallback + amber notice |
| WebGL2 unavailable | DOM notice; audio FDN still plays |
| Both audio and GL fail | Error message; suggests refresh |

---

## Unverified surfaces

Because this prototype was built without being able to run a browser or audio
engine, the following are best-effort and may need tuning in a live session:

- **Delay lengths at non-44100 sample rates**: `AudioContext` may run at 48000
  Hz on some browsers. The FDN delay lengths are computed at SR (the actual
  context sample rate), so key alignment should hold, but has not been
  auditioned at 48 kHz.
- **AudioWorklet timing in Safari**: Safari's AudioWorklet implementation has
  historically had latency issues with Blob URL `addModule`. The SPN fallback
  should activate correctly if this happens.
- **ScriptProcessorNode buffer-size latency**: 512-sample SPN buffers add ~12 ms
  latency at 44100 Hz. Audible as a slight smear on transients; acceptable for
  a reverb tail.
- **Swell visual range**: The energy scaling `e × (1 + swell × 6)` may need
  tuning — if the FDN output energy is very low (quiet source), the lattice
  might appear dim. Increasing the injection gain (`0.25` in the worklet) or
  the visual multiplier would brighten it.
- **Key retune mid-playback**: Clearing the delay buffers on retune causes a
  brief silence. A crossfade would be smoother but adds complexity.
