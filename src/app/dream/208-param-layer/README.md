# 208 · Param Layer — harmonic ring synthesizer

**Route**: `/dream/208-param-layer`  
**Cycle**: 241 (adult build) · 2026-05-29 UTC  
**Status**: demoable

---

## What it is

Four concentric draggable rings, each controlling one dimension of a harmonic bell tone:

| Ring | Color | Parameter | Range |
|------|-------|-----------|-------|
| Outer | Violet | **Pitch** (fundamental frequency) | C2 (65 Hz) → A5 (880 Hz) |
| 2 | Teal | **Harmonics** (partial count) | 1 (pure sine) → 16 (rich overtone stack) |
| 3 | Amber | **Spread** (inharmonicity stretch) | 0% (perfect harmonics) → 22% (metallic/bell stretch) |
| Inner | Rose | **Decay** (envelope time) | 0.15 s (sharp click) → 5.0 s (slow gong) |

Drag any ring's handle to reshape the timbre in real time. A quiet drone plays continuously
so you hear the effect of each change immediately. Tap the center circle (▶) to strike a
full-amplitude bell chord that decays with the current Decay setting.

---

## Design rationale

The core insight from **DEMON** (arXiv:2605.28657, May 2026) is that hierarchical parameter
propagation — where a single outer gesture reshapes all inner dimensions — gives synthesizers
a qualitatively different "feel" than independent sliders. You grab the outer ring and it acts
like you're adjusting the instrument's "mass"; the inner rings set the color and detail.

In this prototype, the hierarchy is simpler than DEMON's full diffusion-model version (we
don't have a trained model mapping gesture → spectrum), but the spatial metaphor is preserved:
outer = coarse (pitch), inner = fine (envelope shape). The drone lets you confirm parameter
intent before committing to a strike — a departure from the usual "every control is triggered"
synthesizer design.

The circular waveform in the center shows the actual summed additive synthesis output,
so the visual changes in response to parameter changes (more partials = more complex waveform
shape; high inharmonicity = slight wave distortion that's visually readable).

---

## Audio architecture

```
16 × OscillatorNode (sine, freq = f₀ × n × (1 + ih × (n-1)))
  ↓
16 × GainNode (drone: 0.036/√n when active, 0 when muted by partial-count)
  ↓
master GainNode (0.72)
  ↓
AnalyserNode (fftSize=2048)
  ↓
AudioContext.destination
```

Strike path: creates temporary OscillatorNode+GainNode pairs per partial,
starting at full amplitude and exponentially decaying to silence. These are
self-cleaning (osc.stop() scheduled).

### Inharmonicity formula
`f_n = f₀ × n × (1 + ih × (n − 1))`

At ih=0: perfect integer harmonics (bell-like but artificially pure).  
At ih=0.22: n=16 partial is ~58% sharper than pure harmonic — sounds metallic, piano-like.  
Real pianos have ih ≈ 0.0001–0.003 per string (much smaller); this prototype exaggerates
for perceptual clarity.

---

## Polish ideas for future cycles

- **Preset buttons** below the rings: "Bell", "Flute", "Piano", "Marimba", "Glass" — snap
  all four rings to instrument-appropriate positions.
- **Mic mode**: autocorrelation pitch detection → auto-tune the Pitch ring to the detected
  fundamental. You play a note; the rings tune to it and you hear the harmonic structure.
- **Attack ring** (5th ring, outermost): control note attack time independently from decay.
- **Velocity from tap position**: tap near the edge of the center circle = softer strike;
  dead center = loudest. Distance from center → velocity curve.
- **Visual ring glow pulse on strike**: all rings briefly bloom outward with a radial
  gradient wash when the center is tapped.
- **Paths integration**: fetch one of Karel's piano tracks, run FFT, set Pitch ring to the
  track's dominant fundamental in real time — the bell chords track his playing.
