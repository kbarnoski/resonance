# 1273 — Swarm Choir

## The one question
**What if a swarm of particles were also a choir — each dot simultaneously a *position* AND an *oscillator phase*, so that spatial order and musical synchrony are the same thing you steer?**

This is a *grep-0×* piece for the lab: a real **swarmalator** simulation, not a decorative particle field.

## How the model works
Every agent *i* carries a 2D position **xᵢ** and a phase **θᵢ**. Both evolve under coupled ODEs, integrated with forward Euler each frame (N ≈ 420, O(N²), a few substeps per frame for stability):

```
dxᵢ/dt = (1/N) Σⱼ [ (xⱼ−xᵢ)/|xⱼ−xᵢ| · (A + J·cos(θⱼ−θᵢ)) − B·(xⱼ−xᵢ)/|xⱼ−xᵢ|² ]
dθᵢ/dt = ωᵢ + (K/N) Σⱼ sin(θⱼ−θᵢ)/|xⱼ−xᵢ|
```

- **A** = long-range spatial attraction, **B** = short-range repulsion (both fixed at 1).
- **J** couples *phase to space*: like phases attract, unlike phases repel.
- **K** is the Kuramoto *phase-sync* strength, weighted by inverse distance.

Dots are drawn as a **spectral phase wheel** (hue = θ) on a deep-slate ground, so synchrony is visible as colour-order and space-order at once. A corner ring shows the mean-phase vector, its length = phase coherence *R*.

## The five states, and how to steer into each
The classifier reads the global order parameters each frame: Kuramoto **R = |⟨e^{iθ}⟩|**, the rainbow parameters **S± = |⟨e^{i(φ±θ)}⟩|** (φ = spatial angle), and mean angular **spin**.

| State | Steer | Look / sound |
|---|---|---|
| **Static sync** | K high (~1), J ~0 | one frozen colour → a single held chord |
| **Static async** | K low/negative, J ~0 | disc of all hues, no order → diffuse cluster |
| **Static phase wave** | J high (~1), K ~0 | rainbow ring, still → a rolled chord that holds |
| **Splintered phase wave** | J high, K slightly negative | ring breaks into coloured clumps → broken arpeggio |
| **Active phase wave** | J high, K more negative (~−0.6) | clumps rotate, hue cycles → shimmering moving arpeggio |

Steer by dragging the **K** and **J** sliders, by tapping a preset button, or by dragging across the field (pointer-x → K, pointer-y → J) — which *also* injects an attractor (or repulsor with Shift/right-drag) so you stir the swarm as you set the knobs. Double-tap spawns a burst of agents.

## Phase → sound
No 400-oscillator forest. The phase circle is split into **12 bins**, one voice per bin:

- **phase θ → pitch**, quantised to a just-intonation pentatonic (always consonant).
- **spatial angle → stereo pan** (each bin pans to its mean position angle).
- **phase coherence R → brightness** (master lowpass) and **drone swell**.
- **spatial coherence S → detune shimmer** between each voice's two partials.

Synced → a few bins dominate → unison / stacked chord. Active phase wave → bins cycle the circle → a shimmering, moving arpeggiated cluster. Master gain stays ≤ 0.32 and routes through a `DynamicsCompressor` limiter. Audio is gesture-gated behind **Begin**; visuals run with or without audio.

## Safety & accessibility
No strobe/flashing; luminance changes are slow drift only. `prefers-reduced-motion` damps the integration step. Body text ≥ 16px, error text in `text-rose-300`.

## References
- K. P. O'Keeffe, H. Hong & S. H. Strogatz, "**Oscillators that sync and swarm**," *Nature Communications* **8**, 1504 (2017).
- "**Interplay of synchronization and swarming**," *Physics Reports* review (2026).

## Next-cycle deepening
Add **chirality** (two counter-rotating sub-populations) to reach the double-mill and vortex states; **spatial-hash** the force sums to push N toward ~2000; and let the scale degrees themselves slowly rotate through modes so a long listen never quite loops.
