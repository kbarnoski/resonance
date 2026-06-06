# 355 — Kids Glass Armonica

**Route:** `/dream/355-kids-glass-armonica`  
**Audience:** Kids 4 +  
**The question:** What if a kid could tune singing glasses by filling them with water, then play them like Benjamin Franklin's glass armonica — by swiping a wet finger across the rims for long, continuous, glowing tones?

---

## Named Reference

**Benjamin Franklin's glass armonica (1761)** — a mechanical instrument in which nested glass bowls of descending size were mounted on a rotating spindle and played by touching wet fingers to the spinning rims. The continuous friction produced a sustained, breathy, ethereal tone quite unlike the struck bell of a glockenspiel or marimba. Mozart wrote his *Adagio for Glass Harmonica* (K. 617a) for it; Beethoven included it in *Leonore Prolog*. The armonica was famously said to produce an "otherworldly" quality that unsettled audiences — it was banned in some German towns. Folk predecessor: **musical glasses / glass harp** — wine glasses filled with water and rubbed with a wet finger.

---

## Two Phases

### Phase 1 — TUNE

Drag **up or down** on any glass to change its water level. The water fill height is the visible pitch dial.

**Physics:** More water = heavier glass = slower resonant frequency = **lower pitch**. This is physically correct: the added mass of water shifts the fundamental resonance downward. Formula used:

```
freq = baseHz / (1 + waterLevel × 0.65)
```

At `waterLevel = 0` (empty glass): plays the base D-Dorian scale note.  
At `waterLevel = 1` (full): pitch is ≈ 1.65× lower than the base note.  
The default row pre-tunes to D-Dorian (D3 E3 F3 G3 A3 B3 C4 D4) with increasing fill left-to-right.

### Phase 2 — PLAY

Swipe a finger **continuously across the glass rims** (a horizontal drag that passes over multiple glasses). Each glass the finger crosses begins to **sing** — a sustained, breathy tone that:

- Swells in over ~200ms when the finger arrives  
- Fades out over ~900ms after the finger leaves  
- Multiple glasses can sing simultaneously → overlapping, chord-like washes (the signature armonica sound)

You can also press and hold a single glass rim to sustain that note alone.

---

## Audio Synthesis

Each glass voice is a continuously-running oscillator bank gated by an amplitude envelope:

| Component | Type | Gain | Purpose |
|-----------|------|------|---------|
| Fundamental | Sine | 0.55 | Core glass tone |
| 3rd partial | Triangle | 0.07 | Glass body warmth |
| 7th shimmer | Sine | 0.015 | Ethereal high overtone |
| LFO (≈5 Hz) | → frequency | 0.8% of freq | Wet-rim wavering / vibrato |

**Envelope:** `setTargetAtTime` with τ=0.2s (attack) / τ=0.9s (release). The slow attack/release is the signature of the rubbed-glass sustained tone — very different from a struck instrument.

**Scale:** D-Dorian (MIDI 50 52 53 55 57 59 60 62). The lab is saturated with C-major pentatonic; D-Dorian gives a modal character appropriate to the armonica's historical association with mystery.

**Master chain:** voices → `GainNode` (master 0.82) → `DynamicsCompressor` (threshold −12 dB, ratio 20:1, attack 3ms) → destination. Brick-wall limiter ensures a full 8-glass sweep never blasts.

**Ambient pad:** D3/F3/A3 (D-minor triad) at gain ≈ 0.018, always on, fades in over 2.5s. Ensures the space is never silent.

---

## Interaction Details

- Pointer events (`onPointerDown/Move/Up/Cancel`) on a container div + `setPointerCapture` so the drag tracks reliably across all glasses.
- Hit-testing uses **bounding rect geometry** rather than native pointer-enter events, because `setPointerCapture` suppresses enter/leave events on child elements.
- Tune gesture is detected by **vertical motion > 10px on the same glass**; swipe is detected by horizontal motion over different glasses.
- While tuning, the voice is silenced to avoid a confusing tone-shift mid-drag.

---

## Auto-Demo

On load, an invisible ghost finger sweeps back and forth across the pre-tuned glasses at 0.38 row-widths/second for ≈12 seconds, activating glasses within 0.6 index-units of its position. This creates a gentle armonica wash with zero interaction. The demo stops immediately on the first user touch.

---

## Subsystems

| File | Purpose |
|------|---------|
| `audio.ts` | `AudioRig` struct, `buildRig` (voice bank + pad + compressor), `retuneVoice`, `activateVoice`, `deactivateVoice`, `teardownRig` |
| `page.tsx` | React component: water-level state, pointer capture + bounding-rect hit-test, rAF amplitude envelope tracker, CSS box-shadow/opacity glow driven by live amplitude, ghost-finger auto-demo |

---

## Design Notes

- **DOM/CSS only** — no Canvas, no SVG, no WebGL. Glasses are styled `div` elements; water is a child `div` whose height animates; glow is CSS `box-shadow` + `opacity` driven by amplitude.
- **Palette:** soft violet/teal/pearl/amber spectrum on a near-black ground. The glow colour per glass tracks its spectrum colour for the "luminous glass" look.
- **Kids-first:** Tap/drag targets ≥ 44–64px. No reading required to play. No score, no timer, no failure state.
- **Graceful degradation:** If `new AudioContext()` throws, a `text-rose-300` notice appears; visuals (water fill, CSS glow driven by the rAF amplitude tracker) still animate from the ghost-finger demo.

---

## Unverified Surface

The water-level → pitch ratio (max 1.65×) is a musical approximation chosen to give a comfortable playable range across one octave of D-Dorian. It is not derived from a calibrated acoustic physics model.
