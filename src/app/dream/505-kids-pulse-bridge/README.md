**For**: kids (4+)

# Pulse Bridge

## The one question

What if music can only resolve home when two children tap *together* — when their two separate pulses lock into the same shared rhythm — and a bridge of light between them completes only when they truly play in time?

## How to play (no words needed)

The screen splits into two halves: warm **gold** on the left, cool **teal** on the right. Each child owns one half. Tap your side in a steady beat — any tempo you like. A glowing ring blooms on every tap. Between the two halves, a bridge of light slowly comes alive. When both players lock into the same rhythm, the bridge completes, fireflies stream across it, and the music blooms warm and full. When they drift apart, the bridge softens into separate sparks — not broken, just *not yet together*.

There is no wrong. Out of sync is "not yet." In sync is "together ✨."

## Technique: Synchrony index via Kuramoto order parameter

Each player's tap stream is treated as a **phase oscillator**. For player L at time *t*, the instantaneous phase is:

```
φ_L(t) = 2π × ((t − lastTap_L) mod ITV_L) / ITV_L
```

where `ITV_L` is the mean inter-tap interval over the last 8 taps (clamped to 200–4000 ms). The same formula applies for player R.

The **order parameter** R is the magnitude of the mean complex phasor over a sliding window of N shared samples:

```
R = |Σ exp(i · (φ_L(t_k) − φ_R(t_k)))| / N    for k = 0..N-1
```

This is the Kuramoto synchrony measure: R = 0 when phases are uniformly distributed (maximum disorder); R = 1 when all phase differences are identical (perfect lock). A **tempo similarity factor** (ratio of the two ITVs, penalised above 1.25×) gates the result so large tempo mismatches don't accidentally read as "in sync."

The raw order parameter is raised to the power 0.65 (a mild compressive curve) so moderate synchrony still looks and sounds beautiful rather than feeling like failure.

The scalar R is smoothed with an asymmetric first-order filter: τ_rise = 1.8 s, τ_fall = 3.2 s — so sync has to be sustained to fully light the bridge, but doesn't collapse the moment one tap is slightly late.

## Audio design

| State | Left voice | Right voice | Voicing |
|-------|-----------|-------------|---------|
| Tense (sync → 0) | A3 (220 Hz) | B3 (247 Hz) | Major 2nd — yearning, never ugly |
| Resolved (sync → 1) | C4 (262 Hz) | G4 (392 Hz) | Open fifth → warm |

Voice-leading is continuous via `setTargetAtTime` with τ = 1.2 s — the chord shifts while both players play, earned by synchrony alone. A soft arrival shimmer (arpeggio of C4–E4–G4) fires on the lock threshold crossing. An always-on ambient pad (C2 + G2 sine drones) ensures the experience never feels silent or broken.

Signal path: oscillators → per-voice GainNode → master GainNode → LowpassFilter (≤ 9 kHz) → DynamicsCompressor (threshold −12 dBFS, ratio 8:1) → output. Pluck attack: 10 ms; decay to near-zero: 0.9 s.

## Auto-demo

On load, two simulated tappers follow a 26-second arc (apart → converging → locked → drifting) that drives all audio and visual subsystems without any touch input. The demo cancels on the first real tap.

Demo phase schedule:
- 0–8 s: different tempos (~72 BPM and ~88 BPM), large phase offset — bridge dim/broken
- 8–16 s: tempos converge toward 76 BPM, phase offset shrinks — bridge begins forming
- 16–20 s: locked at 76 BPM, near-zero phase offset — bridge complete, fireflies flowing
- 20–26 s: tempos drift apart again — bridge softens back to sparks

## Subsystems

| Subsystem | File / location | Notes |
|---|---|---|
| Synchrony index | `computeSyncIndex()` ~line 99 | Kuramoto order parameter + tempo gating |
| Audio graph | `buildAudioGraph()` + `applyOstinatoSync()` ~line 540 | LPF + compressor chain, continuous voice-leading |
| Auto-demo | `stepDemo()` ~line 626 | Phase-oscillator simulation of two tappers |
| Bridge renderer | `drawBridge()` ~line 318 | Cubic bezier arc, break segments at low sync |
| Fireflies | `drawFireflies()` + `spawnFirefly()` ~line 56 | Particles flow along the bezier path |
| Tap rings | `drawRings()` ~line 299 | Expanding glow circles on each tap |
| Shimmer bloom | inline in rAF frame ~line 863 | Warm radial flash on lock event |
| Pointer input | `onPointerDown` in useEffect | pointerId-tracked, pointer capture, demo cancel |

## Named references

- **The Moving Mandala** — Carreras et al., *International Journal of Clinical and Health Psychology* 2025–26: rhythmic music as a temporal scaffold for child interpersonal synchrony and prosocial closeness. The core finding that *shared rhythmic entrainment promotes felt closeness* between children directly motivates making lock-in the resolution mechanic here — not a score, not a reward, but a sonic and visual "coming home together."

- **"Finding Our Tempo: Exploring Embodied Synchrony Through Full-Body Play in Children"** — TEI 2026: embodied, full-body play as the primary mode for children to discover and inhabit shared rhythmic synchrony. This prototype applies the same principle at smaller scale (finger taps instead of whole-body movement) but preserves the key design insight: the synchrony experience must be *felt*, not read.

## What's unverified

- **By-ear balance**: the major-2nd voicing (A3/B3) has been chosen for "yearning but not ugly" quality, but actual children aged 4–6 have not been tested — a real session might find the tension too mild or too dissonant. The resolved open-fifth (C4/G4) is very safe but may feel underwhelming without A/B testing against a fuller major triad at lock.

- **Phone multi-touch ergonomics**: two children sharing one phone screen is cramped; this prototype is designed for iPad or large tablet. On a 6-inch phone the split-halves will be ≈ 45 mm wide each, which may make it feel crowded for four-year-old fingers.

- **Sync index legibility for a 4-year-old's loose timing**: the Kuramoto order parameter is theoretically correct, but real 4-year-old tapping is highly irregular (high timing jitter, tempo drift). The 0.65 compressive exponent and the 1.8 s rise time are tuned by hand rather than by experiment — a child with ±300 ms timing jitter at ~80 BPM may never cross the 0.82 lock threshold. The forgiveness window (ITV tolerance up to 25%, order-parameter compressive curve) may need to be loosened further in practice.

- **Demo tempo vs. child tempo**: the demo runs at 76 BPM. Children aged 4–6 often prefer spontaneous tempos of 100–130 BPM; a parent helping a 4-year-old will likely tap faster than the demo. The sync algorithm works at any tempo pair, but the demo aesthetic was tuned for 76 BPM.
