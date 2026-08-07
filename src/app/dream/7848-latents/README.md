# 7848-latents — "Latents"

## The one question

**What if you don't play notes — you DISCOVER the hidden axes of a sound-world by ear, then compose by moving along the ones you found?**

## The mechanic: discover → mark → path → loop

1. **Discover.** The piece is a continuous 2D *latent field*. Every position `(x,y)` in the unit square maps — through smooth basis functions — to five synth qualities: **brightness** (filter cutoff + visual lightness), **tension** (chord character: major → minor → cluster), **pulse** (tremolo rate), **density** (pad thickness + visual saturation), and **pitch** (quantised root). The two spatial axes are deliberately **unlabelled**. You drag a token across the field and the sound morphs continuously, so you find the bright regions, consonant valleys and pulsing zones *by ear* — not by reading a diagram.
2. **Mark.** When a spot sings, you click to drop a marker there (or hit **Drop marker** to mark the token's current spot).
3. **Path.** Your markers, in order, trace a closed polyline through the field.
4. **Loop.** Press **Play** (or space): the token travels the closed loop at the loop tempo, reading the field continuously and firing a plucked note as it crosses each marker. The loop *is* a repeating musical phrase — a structure **you authored by exploring**, not one shown to you.

A seeded **self-demo** runs on load with zero input: a deterministic explorer (`mulberry32(0x7848)`) wanders the field, discovers ~5 good spots by scanning, drops a marker at each, and then hands off to the sequencer to loop the discovered path — all within ~8 s, entirely silently on a sensor-less phone. Real audio starts on the first tap (autoplay policy); the visual demo runs immediately. The instant you touch the field, the demo is abandoned and you take over.

## Subsystems

- **`field.ts`** — the hand-built latent field: `mulberry32` PRNG, a sum-of-seeded-2D-Gaussians parameter map (`makeField` / `sample`), a `singScore` heuristic, and `discoverFeatures` (grid scan + non-max suppression + nearest-neighbour ordering) that finds the good spots *by scanning*, nothing printed on a label.
- **`path.ts`** — path/loop geometry: `buildLoop`, `pointAtPhase`, and `crossedVertices` (marker-crossing detection for note triggers).
- **`audio.ts`** — the continuous morphing Web-Audio synth: a three-voice detuned pad through a lowpass filter and a tremolo VCA, with chord intervals, cutoff, tremolo rate/depth and root pitch all read continuously from the field, plus an enveloped `pluck` fired at each marker.
- **`demo.ts`** — the seeded explorer: a meandering roam route that visits each discovered feature and reveals markers on arrival.
- **`page.tsx`** — inline-SVG renderer (blurred field mesh of `<rect>` cells on the violet ramp, token, markers, authored path) + a single rAF loop that drives demo → playback → manual, plus all interaction and teardown.

## Substrate

**Inline `<svg>` only.** The field is a 24×24 grid of translucent `<rect>` cells coloured by the field value (violet hue fixed at 270; brightness → lightness, density → saturation), softened by one `feGaussianBlur` filter into a smooth mesh. The token, markers and traced path are SVG `<circle>` / `<polyline>` / `<text>`. **No `<canvas>`, no WebGL, no three.js.**

## Research anchor

This is a hand-built, **no-ML** realisation of the core idea in:

> **"Discovering and Steering Interpretable Concepts in Large Generative Music Models"**, arXiv:**2505.18186** (updated Mar 2026),

together with the ICLR-2026 steering work, arXiv:**2510.19127**. Those papers control a generative sound-space by *discovering interpretable concept directions* in a model's latent space and *steering along the ones you found*, rather than typing notes. Here the smooth `(x,y) → params` Gaussian map is the hand-built stand-in for those latent concept directions: the "concepts" (a bright region, a consonant valley, a pulsing zone) are real features of the field that you discover by ear and then steer along. This directly implements today's discover-then-steer research frontier — no ML, deterministic, seeded.

## Why this answers the "player-discovered structure" gate

The fresh jury demanded pieces where *the structure is discovered/authored by the player, not pre-given* — a "what can I DO here that isn't watch or steer-a-descent?" gate. Here the axes are never labelled and the phrase is never shown: you literally author it by exploring the field, marking spots that sing, and closing them into a loop. The musical structure is your discovery, not the piece's diagram. What you DO is *find latent structure by ear and compose with it.*

## Next-cycle deepening

- **Real timbre field.** Feed a real audio sample (or a small grain bank) as the field's timbre so position selects grains/spectral frames — the latent map becomes a corpus map.
- **N-D field projected to 2D.** Give the field more than two underlying dimensions and expose a learnable/rotatable 2D projection, so "discovering the axes" becomes literally choosing which latent directions to steer.
- **Share a discovered path.** Serialise markers + tempo into a URL so a discovered phrase (and the exact seeded field) can be shared and replayed.
- **Consonance shading.** Overlay a faint "singing" contour derived from `singScore` that only appears *after* you mark, confirming by sight what you found by ear.
