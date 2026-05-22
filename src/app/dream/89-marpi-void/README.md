# Void Organism — /dream/89-marpi-void

**Question**: what if sound could grow a living colony in the void?

A single organism breathes at the center of a black void. Feed it with audio and it
blossoms: arms extend on bass energy, curl on treble jitter, spawn children on percussive
onsets. After minutes of music, a drifting colony fills the space. Starve an organism for
15 seconds and it slowly dissolves.

Inspired by Marpi Studio's *New Nature* installation (ARTECHOUSE 2026).

---

## Organism anatomy

**Nucleus**: glowing radial gradient. Radius = f(band energy + amplitude). Pulsates with
amplitude envelope — loud hit = nucleus flares outward.

**Arms**: 8–16 Bézier curves radiating from nucleus. Extension driven globally by bass
energy (band 1, 60–250 Hz) — the physical pulse of the music stretches all arms. Curvature
jitter driven globally by treble energy (bands 4–5, 2–20 kHz) via smooth noise.

**Tips**: small radial glow at each arm endpoint, colored by organism type.

**Color types** (assigned at birth, determines survival band):

| Type | Nucleus | Arms | Fed by |
|------|---------|------|--------|
| `bass` | violet (148, 60, 255) | ice blue (100, 200, 255) | band[1] 60–250 Hz |
| `mid` | cyan (60, 220, 220) | lavender (180, 120, 255) | avg(band[2,3]) 250–2k Hz |
| `treble` | rose (255, 80, 150) | amber (255, 200, 120) | avg(band[4,5]) 2k–20k Hz |

---

## Lifecycle

1. **Born** — alpha fades in over 1.5s.
2. **Fed** — if its driver band has energy > 0.06, `lastFedAt` is updated.
3. **Starved** — if unfed for 15s, alpha decays over 8s and organism dissolves.
4. **Spawn** — on an audio onset (transient), a new organism buds from a random parent,
   offset by 0.7–1.2 × parent arm length. Refractory: 2s between spawns. Colony cap: 18.
5. **Drift** — each organism has random Brownian velocity (±0.12 px/frame base). Soft
   bounce off canvas edges.

---

## Smooth noise (no deps)

Sum of 4 sines at irrational-ish frequencies approximates Perlin-like continuity:

```
sNoise(x, y, t) =
  sin(2.3x + 0.6t) × 0.50
  sin(1.7y + 0.9t) × 0.25
  sin(3.1(x+y) + 0.4t) × 0.15
  sin(1.9(x−y) + 1.1t) × 0.10
```

Each arm uses two unique noise samples (arm index × irrational offset) so arms wave
independently without synchronized flicker.

---

## Rendering

Canvas2D only. `globalCompositeOperation = "lighter"` — co-located arms additively blend
toward white, like bioluminescent glow. Background trail: `rgba(0,0,0,0.13)` per frame
(~7.7 frame half-life) preserves persistent ghost trails of past positions.

---

## Demo mode

LFO-driven bass/mid/treble oscillating at 0.65/1.05/1.80 Hz (slightly incommensurable,
so the beat pattern never repeats). Auto-onset fires every 7–13s.

---

## Polish ideas

- **Inter-organism tendrils**: when two organisms drift closer than `armLen/2`, draw a thin
  connecting Bézier — the colony starts networking.
- **Bloom pass**: downsample canvas 4×, Gaussian blur, re-overlay with `lighter` blend for
  soft-focus glow.
- **Organ memory trails**: color arm tips based on a short history of recent peaks —
  the organism "remembers" what it heard.
- **Swarm mode**: 50+ micro-organisms, each driven by a single FFT bin — a true spectral zoo.
- **Tap attractor**: click/tap creates a gravity well pulling organism drift toward the cursor.
