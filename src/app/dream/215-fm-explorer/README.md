# 215 — FM Explorer

**Route**: `/dream/215-fm-explorer`  
**Cycle**: 249 · adult build  
**Status**: demoable

## What it answers

> "What if you could navigate the entire space of FM synthesized timbres by moving a single point?"

FM synthesis underlies the Yamaha DX7 (1983, best-selling synthesizer), the Rhodes electric piano,
808 bass, bell tones, and metallic percussion — all from one equation and three Web Audio nodes.

## How to play

1. Click **Start FM** — a continuous tone begins.
2. **Move** (or drag on mobile) across the canvas:
   - **X axis** = carrier pitch (C2 left → C7 right, log-spaced)
   - **Y axis** = modulator-to-carrier ratio (8× top → 0.5× bottom)
3. **Index slider** = FM depth (0 = pure sine; 15 = extreme metallic complexity)
4. **Preset buttons** jump to classic timbres: Bell, Rhodes, Clangy, Sub, Metallic
5. **Mic button** routes your mic's RMS amplitude to the FM index — play louder for more metallic texture

## Audio architecture

```
OscillatorNode (modulator, freq = carrier × ratio)
  → GainNode (modGain, gain = index × mod_freq)   ← FM deviation
    → carrier.frequency (AudioParam)
OscillatorNode (carrier) → GainNode (master) → AnalyserNode → destination
```

The key line is `modGain.connect(carrier.frequency)` — connecting an audio node to an AudioParam
rather than another node. This is standard FM synthesis; the modulator's audio signal becomes an
offset added to the carrier's frequency parameter at audio rate.

**FM equation**: `carrier_output_freq(t) = F_c + sin(2π·F_m·t) × I × F_m`  
where F_c = carrier frequency, F_m = modulator frequency, I = FM index.

## Background color field

The canvas background encodes timbral complexity as a color gradient:
- **Emerald** (green): harmonic ratios (1:1, 2:1, 3:1) → pure tones, organ-like
- **Amber**: slightly inharmonic (ratio ≈ √2 = 1.414) → bell-like partials
- **Violet**: highly inharmonic (ratio 5-8, non-integer) → metallic, noise-like

The color field updates when the index slider changes — at index=0 everything is uniformly dim
(no modulation = pure sine everywhere); at index=15 the colors pop to their full saturation.

## Presets

| Name     | Pitch | Ratio | Index | Timbre                          |
|----------|-------|-------|-------|---------------------------------|
| Bell     | E4    | √2    | 8     | Bright harmonic bell, sustains  |
| Rhodes   | C3    | 2:1   | 3.5   | Electric piano warmth           |
| Clangy   | G3    | 3.5:1 | 12    | Industrial clang, non-harmonic  |
| Sub      | A1    | 1:1   | 2     | Deep sub-bass organ             |
| Metallic | D3    | 5:3   | 15    | Cymbal/gong metallic texture    |

## Polish ideas

- **Lissajous mode**: toggle the scope to show a Bowditch figure (carrier vs. modulator phase)
  instead of time-domain waveform. Simple integer ratios (2:1, 3:2) produce clean closed curves.
- **Multi-operator FM**: add operator B modulating operator A which modulates carrier — DX7-style
  2-operator algorithm. Adds "algorithm" selector (4 standard DX7 topologies).
- **Note trigger**: click/tap fires a loud decaying strike (ADSR envelope) at the current position
  instead of a continuous drone — more piano-like interaction.
- **Path record**: record a cursor trajectory as a loop (30s) → replay it → audio animation.
- **Onset from mic**: in mic mode, percussive onset triggers a brief increase in FM index (attack)
  that decays back, creating "timbre envelope" driven by rhythm.
