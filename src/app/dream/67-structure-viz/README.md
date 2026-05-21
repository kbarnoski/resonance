# Structure Viz — design notes

**Route**: `/dream/67-structure-viz`  
**Cycle**: 84  
**Status**: demoable

## What question does this answer?

"What if Resonance could show you when you've returned to a theme?"

Every other prototype in the sandbox visualizes audio signal properties — amplitude, frequency, timbre, pitch. This one visualizes **musical structure**: the relationship between sections of music across time. An ABA form creates a distinctly different visual than through-composed material, and a performer can see it in real time.

## How the SSM works

Every 1.5 seconds (a "bar"), the prototype captures the current FFT spectrum from the AnalyserNode and computes a 32-element feature vector:

1. **Log-spaced binning**: The 1024 FFT bins are collapsed into 32 bins covering 30–16,000 Hz on a logarithmic scale (mimicking perceptual pitch perception).
2. **Linear magnitude**: Each bin value is converted from dB to linear amplitude (`10^(dB/20)`), so absolute spectral shape matters — not just relative peaks.
3. **L2 normalization**: The vector is normalized to unit length, so cosine similarity = dot product. Two silent frames are similar; a C-major chord and an A-major chord are moderately similar; a C-major chord and a noise burst are dissimilar.

The N×N self-similarity matrix stores the cosine similarity between every pair of bars. The diagonal is always 1.0 (each bar is identical to itself). Off-diagonal bright squares indicate sections that sounded alike.

**Colormap**: dark purple (sim ≈ 0) → blue-violet (sim ≈ 0.5) → bright white (sim ≈ 1.0).

## Section boundary detection

The classic **checkerboard kernel** novelty function is applied to the diagonal:

For each bar position `i`, a 2×2 checkerboard kernel centered at `(i,i)` computes:
```
score = sum(within-section blocks) − sum(cross-section blocks)
```

Where "within-section" means same-side neighbors on the diagonal, and "cross-section" means opposite-side neighbors. At a true section boundary, the within-section values are high (similar bars on each side) and the cross-section values are low (the two sides are dissimilar). The score peaks at boundaries and is near zero within uniform sections.

Threshold: 1.5 (experimentally reliable for clean musical material; reduces false positives from small spectral variations).

## Section label assignment

After detecting boundaries, each section gets a mean prototype vector (average of its bar features, normalized). A greedy matching pass assigns labels:

- First section: A
- Each subsequent section: if cosine similarity to any prior section prototype > 0.82, reuse that letter with a prime (A, A′, A′′…); otherwise assign next letter (B, C, D…)

The threshold 0.82 is calibrated so the C3-chord A-section and the C3-chord A′-section match, but the A4-chord B-section doesn't match either of them.

## Demo mode: ABA pattern

Three oscillator phases, 16 seconds each:
- **A (0–16s)**: triangle-wave chord C3 (130 Hz) + E3 (165 Hz) + G3 (196 Hz) — warm, low
- **B (16–32s)**: triangle-wave chord A4 (440 Hz) + C5 (523 Hz) + E5 (659 Hz) — bright, contrasting
- **A′ (32–48s)**: same as A — returns

At 1.5s/bar, this produces ~10-11 bars per section. By bar 22 (≈33s), the SSM shows the classic three-block diagonal pattern with bright off-diagonal corners confirming A = A′.

## Limitations

- **Monaural**: feature vector from mono FFT. No spatial or timbral detail beyond spectral shape.
- **1.5s resolution**: a 0.5-second phrase change won't register until the next bar boundary.
- **No transient sensitivity**: quiet sections between loud ones may appear similar (both near-silent).
- **32 log bins**: sufficient for detecting broad spectral changes (chord color, register, texture), not for subtle tonal differences within a key.
- **Cosine similarity**: invariant to overall loudness level. Playing the same chord softly or loudly produces the same similarity value — by design.

## What to try

- Play an ABAB pattern (alternating verse/chorus) — watch a striped checkerboard emerge
- Play continuous chromatic glissandos — expect gradual off-diagonal fade with no hard boundaries
- Play something complex (jazz improv with varied registers) — expect weak structure, mostly diagonal
- Use the SSM to check whether a long rehearsal session is truly through-composed or has hidden repetition

## Research basis

Self-similarity matrix structure analysis: arxiv 2603.27218 (Mar 2026), unsupervised section detection via SSM + CBM. RESEARCH.md §143 (Cycle 82 research sweep).

The SSM is a standard MIR technique (Foote 2000, "Automatic audio segmentation using a measure of audio novelty") — no ML required. FFT feature vectors are sufficient for detecting broad repetition structure in music.
