# 370 — Tonal Map

**Route:** `/dream/370-tonal-map`

**The question it answers:** Can I read my music's modulations like a MAP — watch a comet of tonal gravity glide across labeled key territories and see exactly which key region it's in?

---

## What it is

A top-down, labeled tonal map rendered with three.js (orthographic camera). The 12 major key territories are laid out as named discs around the circle of fifths. The music's **center of effect** (Chew, 2000) — the weighted centroid of currently sounding pitch-class points — glides across the map as a bright **comet with a decaying trail**. A modulation is literally the comet crossing from the "C" disc into the "G" disc. The comet's **halo ring** grows wide and diffuse when tonal focus drops (modulation onset) and tightens back to a sharp bright ring as the new key settles.

---

## Subsystems

| File | Responsibility |
|------|---------------|
| `page.tsx` | React shell: Begin button (iOS-safe AudioContext), rAF loop, HUD overlay (key name, chord + Roman numeral, modulation banner, focus meter), WebGL fallback notice |
| `tonal-map.ts` | Circle-of-fifths layout, `centerOfEffect()`, `computeTonalFocus()`, `identifyChord()`, `toRoman()`, `buildChordInfo()`, key territory definitions |
| `key-finder.ts` | `KeyFinder` class: decaying pitch-class histogram, Krumhansl–Kessler Pearson-correlation key estimation, hysteresis guard, `isModulating()` flag |
| `audio.ts` | `TonalAudio` class: sawtooth+triangle pad voices, ADSR via `setTargetAtTime`, always-on sine root drone, `DynamicsCompressorNode` brick-wall limiter, internal 19-chord modulating demo progression (C→G→D→Em→C), optional Web MIDI |
| `scene.ts` | `TonalMapScene` class: THREE.WebGLRenderer with OrthographicCamera, territory discs + ring borders + `CanvasTexture` label sprites, comet mesh, halo `RingGeometry` (dynamically rebuilt per focus), trail `BufferGeometry` line, background starfield, resize handler |

---

## The tonal model

**Center of effect (Chew, 2000):** Each of the 12 pitch classes occupies a position on a circle ordered by fifths (C at top, then G, D, A, …). The center of effect is the weighted centroid (x, y) of the currently sounding pitch-class points, weighted by note velocity/duration. In Chew's original 3-D spiral the full helix captures register; here we project to the top-down 2-D plane for maximum map legibility.

**Tonal focus (arXiv:2603.27035):** A scalar in [0, 1] measuring how concentrated recent pitch content is around the current center of effect. Computed as 1 minus the normalized RMS distance of recent pitch-class points from the CoE. HIGH = all notes cluster tightly in one key; LOW = notes spread across many keys (modulation onset). Drives the comet's halo radius: tight bright ring at high focus, wide diffuse ring while modulating.

**Key estimation (Krumhansl & Kessler, 1982):** A decaying pitch-class histogram is correlated against K–K major and minor profiles for all 24 transpositions. The best-correlating key wins, with a hysteresis guard (new key must beat the current by ≥ 0.12 Pearson correlation) to suppress flickering. The `isModulating()` flag fires for ~1.5 s after each key change.

---

## The demo progression

The internal demo plays ~19 chords at ~80 bpm through a clear modulating journey:
- **C major** (I IV V I)
- **G major** (I IV V I — comet crosses right across the map)
- **D major** (I V I — further clockwise)
- **E minor** (vi IV V i — pulls toward E/B side)
- **Return to C major** (vi IV V I — comet arcs back home)

This is deliberately dramatic so the comet clearly travels from disc to disc. Each modulation also triggers the key-change banner (e.g. "C → G").

---

## Degradation

| Condition | Behavior |
|-----------|----------|
| No WebGL | Rose notice shown in canvas area; audio still plays; key / chord HUD still updates |
| No Web MIDI | Demo progression runs uninterrupted |
| iOS Safari | AudioContext created inside the Begin tap (iOS gesture requirement) |

---

## Named references

- **Elaine Chew**, *Towards a Mathematical Model of Tonality* (MIT, 2000) — Spiral Array, center of effect
- **Krumhansl & Kessler** (1982), "Tracing the dynamic changes in perceived tonal organization in a spatial representation of musical keys" — key-profile correlation
- **arXiv:2603.27035** (March 2026), "Tonal Coherence as Gravitational Centering" — tonal-focus scalar as inverse normalized spread of pitch-class gravity

---

## Tags

- **INPUT:** internal-demo · Web MIDI
- **OUTPUT:** three.js (top-down orthographic)
- **TECHNIQUE:** Chew Spiral Array center-of-effect · Krumhansl-Schmuckler key estimation · tonal-focus (gravitational centering)
- **VIBE:** instructional · legible · spatial-tonality · cartographic

---

## Honest "unverified surface" note

The `arXiv:2603.27035` tonal-focus scalar is the specific implementation described there, but the formula (inverse normalized RMS distance of pitch-class points from the center of effect) is a reasonable operationalization of the gravitational-centering concept. The exact paper should be consulted if you need a rigorous match. Krumhansl–Kessler profiles are the canonical 1982 values. Chew's center-of-effect math is faithfully reproduced in the 2-D projection.
