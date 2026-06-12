# Dream House 552 — The Drone Pilgrimage

**Route:** `/dream/552-dream-house/`
**Status:** Demoable
**Cycle:** 2 of `538-xenharmonic-lattice`

---

## The Question

*What if Resonance had a room you could leave running for twenty minutes — a self-composing La Monte Young "Dream House" that slowly walks a just-intonation lattice, never repeats, never returns to its starting pitch, and is audibly a different piece at minute 12 than at minute 1?*

---

## Concept

This prototype is the lab's first deliberate **long-form generative piece**. It takes direct inspiration from La Monte Young and Marian Zazeela's *Dream House* installations — sustained, pure-ratio drone fields experienced over extended time. Where 538 was a static Tonnetz you *tap*, 552 is a room you *leave running*: the music composes itself, evolves over a 14-minute arc, and requires zero interaction.

The central thesis: **harmonic drift over time is itself a compositional form**. The syntonic comma (81/80 ≈ 21.5¢) means that stepping around the lattice does not return you to where you started — pitch accumulates, the piece spirals away from its origin into genuinely new harmonic territory.

---

## How It Works

### 1. The Walker (Autonomous Lattice Traversal)

A point wanders the 2-D harmonic lattice where `u` indexes fifths (×3/2) and `v` indexes thirds (×5/4). Every 4–8 seconds it steps to a neighboring node, preferring unvisited territory. Because the lattice is infinite and the syntonic comma prevents exact returns, the drone never revisits the same pitch class with the same frequency — it drifts permanently.

The **comet trail** makes this journey visible: a polyline of the last 80 positions accumulates in the SVG, showing the pilgrimage path. Ghost dots mark every node ever visited, fading in age.

### 2. Sustained Pure-Ratio Drone (Dream House)

The walker's current node plus its 2–5 nearest neighbors form a simultaneous chord. Each voice is a **sine fundamental + 3rd and 5th odd harmonics** — warm, luminous, recognizably "drone." A slow LFO (≈0.07 Hz) on frequency detune adds organic shimmer.

All voice attacks and releases use `setTargetAtTime` with 3–4 second time constants, so transitions between chords are multi-second crossfades — the classic Dream House "chord never begins or ends" quality.

### 3. The Long-Form Arc (14-Minute Cycle)

The headline feature. The piece maintains eight named phases across the 14-minute period:

| Phase | t | Density | Filter cutoff | Register |
|-------|---|---------|---------------|----------|
| gathering | 0% | 2 voices | 900 Hz | low |
| ascending | 12% | 3 | 1800 Hz | mid-up |
| flowering | 28% | 5 | 3200 Hz | high |
| tritave | 42% | 4 | 2400 Hz | mid-high |
| radiance | 56% | 6 | 4800 Hz | mid |
| dissolving | 68% | 4 | 2000 Hz | mid-low |
| receding | 80% | 3 | 1200 Hz | low |
| stillness | 92% | 2 | 700 Hz | deep-low |

All values interpolate smoothly via smoothstep. The phase word and elapsed clock are shown in the HUD so a viewer can verify the arc is moving.

**Tuning migration** happens at 4 section boundaries within the arc:
- t=0%: 5-Limit Just Intonation
- t=33%: Bohlen–Pierce (tritave-based, prime ratios 7/3 and 5/3)
- t=55%: back to 5-JI
- t=72%: 19-EDO (equal temperament that approximates 5-limit ratios)
- t=90%: return to 5-JI

When tuning switches, the chord is rebuilt immediately with new ratios — the drone harmonic world shifts character.

**Register arc:** a slow ±0.4-octave shift on the octave-folding center makes the drone breathe up then down over the long period — identical pitch-class material sounds lighter at minute 6 and darker at minute 12.

**Brightness:** the master lowpass filter drifts from 700 Hz (veiled) through 4800 Hz (brilliant) and back, changing the color of the drone independently of pitch.

### 4. The Optional Exhale

Tapping anywhere on the lattice view triggers an "exhale": all current voices fade out over ~1.5 seconds, then a new chord blooms from a fresh region of the lattice. This is the only user input. Doing nothing is the intended default.

### 5. Audio Safety

Master chain: `voiceGain → masterGain → lowpass (≤6 kHz) → DynamicsCompressor (20:1, −10 dBFS threshold) → destination`. Each voice's per-voice gain is `0.55 / max(1, voiceCount)`, so 6 simultaneous voices each receive ~0.09 — total roughly 0.55 before compression, well within safety. Hard cap of 8 simultaneous voices. AudioContext is created inside the Start-button click handler for iOS unlock.

---

## Does Minute 12 Truly Differ from Minute 1?

**Honest assessment:** yes, in three independent dimensions:
- **Register** is audibly lower (the arc has passed through its peak at ~minute 8 and begun descending)
- **Density** has thinned from ~6 voices back toward 3
- **Tuning** has migrated through Bohlen–Pierce and 19-EDO, so the harmonic intervals sound different in character
- **Filter brightness** has closed significantly (cutoff ~1200 Hz vs 900 Hz at start)
- **Walker position** has drifted far from (0,0) via the comma pump — the absolute frequencies are genuinely different

The comet trail at minute 12 visually demonstrates a long journey made.

---

## Named References

- **La Monte Young & Marian Zazeela**, *Dream House: Seven+ Years of Sound and Light* (sustained just-intonation drone installation, 1993–present, MELA Foundation, New York City) — primary reference
- **Éliane Radigue** — long-form drone composition, ARP 2500 works (1970s–2000s)
- **Leonhard Euler**, *Tentamen novae theoriae musicae* (1739) — the Tonnetz lattice
- **Syntonic comma / comma pump** — 81/80 ≈ 21.5¢; the reason the lattice does not close; basis for the "never returns home" property
- **Heinz Bohlen** (1972) / **John R. Pierce** (1984) — Bohlen–Pierce scale; tritave-based tuning system
- **Harry Partch**, *Genesis of a Music* (1949/1974) — 43-tone just intonation; extended JI theory
- **LIMITER** (arXiv 2507.08675, 2025) — recent gamified JI interface reference

---

## Unverified Surface (Known Risks)

- **Long-run gain accumulation:** voice gain is mathematically capped but the DynamicsCompressor's release curve means very long sustained notes may interact with the limiter in unexpected ways over 20+ minutes. Not stress-tested at full duration.
- **iOS AudioContext unlock:** implemented via the Start button gesture, but iOS Safari's policy may still suspend the context after screen lock. The `ctx.resume()` pattern is not currently wired — adding a tap-to-resume guard would improve reliability.
- **Drone balance over 20 min:** the 14-minute arc loops back gracefully, but the cumulative walker drift may lead to very high or low folded frequencies after many loops. The octave-folding clamps to 80–520 Hz × regShift, which prevents extreme values, but the perceptual balance of these frequency relationships at extreme lattice positions (e.g., u=4, v=2) has not been exhaustively auditioned.
- **SVG DOM churn:** the visited-ghost group is mutated every frame. On low-end devices with >150 visited nodes this may cause jank; the VISIT_MAX=300 cap limits the worst case.
