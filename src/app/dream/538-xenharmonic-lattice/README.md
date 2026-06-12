# Xenharmonic Lattice — design notes

**Route**: `/dream/538-xenharmonic-lattice`  
**Status**: demoable  
**Zero deps · Zero API · Zero permissions**

---

## The question it answers

> "What if Resonance let you wander a tuning system the piano can't play — a navigable harmonic lattice in just intonation / Bohlen–Pierce, where the tension you feel lives in the TUNING itself, not in beating dissonance?"

---

## Concept

A **harmonic lattice** (Tonnetz-style 2-D grid) rendered in SVG. Each node is a pitch derived by stacking pure just-intonation ratios: one axis = perfect fifth 3/2, the other = major third 5/4 (in 5-limit JI), or the non-octave Bohlen–Pierce ratios (3/1 tritave and 5/3 sixth). Clicking or hovering nodes plays the pitch with a pure sine + harmonic-partial synthesiser tuned to EXACT rational frequency ratios — not 12-TET approximations.

The "tension" is the strangeness of the tuning: BP notes refuse to resolve in any Western sense; JI chords are eerily pure but "misaligned" from keyboard expectations; 19-EDO lives in the uncanny valley — almost familiar, but subtly wrong.

---

## The three tuning systems

### 1. 5-Limit Just Intonation (Euler's Tonnetz)

```
Base: C4 = 261.63 Hz
U axis: 3/2 = 1.500 (perfect fifth, 701.96¢ — 12-TET gives 700¢)
V axis: 5/4 = 1.250 (major third,  386.31¢ — 12-TET gives 400¢)

Frequency at (u, v) = 261.63 × (3/2)^u × (5/4)^v
```

Examples:
- (1, 0): G4 = 392.44 Hz — pure fifth, no beating against C4
- (0, 1): E4 = 327.04 Hz — pure major third, 14¢ flatter than 12-TET E
- (1, 1): B4 = 490.55 Hz — pure major seventh
- (-1, 1): A4 = 436.05 Hz — pure major sixth (not 440 Hz!)
- (2, 0): D5 = 588.66 Hz — pure major second (9/8)
- (0, -1): Ab3 = 209.30 Hz — pure minor third below C (6/5 ratio)

The "comma pump" is immediately audible: moving in a loop like (0,0) → (1,0) → (2,0) → (2,1) → (1,1) → (0,0) does NOT return to the exact starting pitch frequency — the syntonic comma (81/80 = 21.5¢) accumulates. This is why the piano switched to equal temperament in the first place.

### 2. Bohlen–Pierce

```
Base: A3 = 220 Hz
U axis: 7/3 = 2.333 (BP "fifth"  — ~968¢, beyond any piano interval)
V axis: 5/3 = 1.667 (BP "third"  — 884¢, close to 12-TET major 6th but pure)

Frequency at (u, v) = 220 × (7/3)^u × (5/3)^v
```

Heinz Bohlen (1972) and John R. Pierce (1984) independently derived this scale from the 3:1 tritave (an octave plus a fifth) rather than the 2:1 octave. The BP scale uses only odd-harmonic overtones (1:3:5:7:9) and has 13 equal steps per tritave in its tempered version. The just-intonation version used here is a pure-ratio lattice.

Key properties:
- No octave equivalence — the period is 3:1 (≈1902¢), not 2:1 (1200¢)
- Intervals feel alien: the closest thing to a "tonic" sounds more like an ambiguous suspension
- The "resolution" sensation Westerners expect simply does not occur
- Pure against odd-harmonic timbres (clarinet, human voice in falsetto)

### 3. 19-EDO (19 Equal Divisions of the Octave)

```
Base: C4 = 261.63 Hz
U axis: 2^(3/19) ≈ 1.116 (3 steps = ~189¢, close to 12-TET whole tone 200¢)
V axis: 2^(5/19) ≈ 1.196 (5 steps = ~316¢, close to minor third 300¢)

Frequency at (u, v) = 261.63 × 2^(3u/19) × 2^(5v/19)
```

19-EDO major thirds are much purer than 12-TET (311¢ vs 386¢ just; 400¢ 12-TET — wait: 19-EDO third = 5 steps = 5×63.16¢ = 315.8¢, which is close to the just minor third 315.6¢). The scale has a "whole tone + half tone" that splits the 12-TET major third into two unequal parts. Familiar enough to recognise melodies; alien enough to disorient.

---

## Audio synthesis

Each node plays a **luminous partial-series tone**:

```
Partials: [1×, 2×, 3×, 5×] at relative gains [0.60, 0.25, 0.12, 0.05]
Attack: 25ms linear ramp
Release: 350ms linear ramp
Per-note gain: 0.18

Master chain:
  note gainNode → masterGain (0.85) → DynamicsCompressor → destination
  Compressor: threshold −6 dB, knee 2 dB, ratio 16:1
              attack 3ms, release 100ms
```

The fundamental sine dominates, with 2nd and 3rd partials adding warmth. The 5th partial is barely audible but helps the tone "sit" in the lattice. All frequencies are computed as:

```
freq = tuning.baseHz × uRatio^u × vRatio^v
```

No rounding, no 12-TET approximation. The exact-ratio computation is what makes held chords sound "locked in" (no amplitude beating) rather than "alive with vibrato" — the hallmark of just intonation.

---

## Visual design

- **SVG Tonnetz grid** — 9×7 nodes (5-JI), 7×5 (BP), 9×5 (19-EDO)
- **Edges**: horizontal edges (same axis) in indigo; vertical edges (cross-axis) in violet with dashes
- **Node colour**: base hue per tuning (violet = 5-JI, emerald = BP, amber = 19-EDO), shifted slightly by position
- **Active nodes**: scale 1.45×, glow ring, higher saturation/luminance
- **Ghost finger**: pulsing ripple ring + dot, no pointer events
- **Pan**: drag the SVG background to explore beyond the default viewport
- **Axis labels**: faint monospace text at edges of viewport

---

## Ghost-finger auto-demo

On load (after "Begin"), a ghost finger walks a curated path across the lattice and sounds each node for 1.4 seconds. The path for 5-JI traces a circle of major thirds then returns through the minor third axis, demonstrating the comma pump. The BP path wanders alien consonances. The demo restarts after 4 seconds of user idle.

---

## Named references

- **Heinz Bohlen & John R. Pierce** — the Bohlen–Pierce scale (1972/1984): a non-octave scale built on the tritave 3:1 using odd harmonics 3, 5, 7, 9. BP is the archetypal "alien tuning" — internally consistent, no relationship to Western practice.
- **Erv Wilson** — pitch lattices / "Wilson lattice": Wilson's lattice diagrams (1960s–2000s) map harmonic space in 2-D and higher dimensions. The Tonnetz is a special case.
- **Harry Partch** — *Genesis of a Music* (1949/1974): 43-tone just intonation, the tonality diamond, otonality/utonality. Partch demonstrated that extended JI is performable and expressively rich; his instruments were tuned to exact ratios.
- **Leonhard Euler** — the original Tonnetz (*Tentamen novae theoriae musicae*, 1739): Euler mapped tonal space as a 2-D lattice of fifths and thirds, the first harmonic lattice.
- **(2026 context)** — Microtonal Fabric WebAudio framework, Entonal Studio, the Xenharmonic Wiki. The microtonal-tooling wave of 2025–2026 has made browser-based JI synthesis practical; this prototype follows in that lineage.

---

## Tags

- **INPUT**: pointer / drag on the SVG lattice
- **OUTPUT**: SVG (vector lattice; animated node glow on play)
- **CORE TECHNIQUE**: xenharmonic / just-intonation / Bohlen–Pierce tuning with exact-ratio Web Audio synthesis
- **VIBE**: cerebral, microtonal, exploratory, luminous-but-restrained

---

## Self-assessment: what's unverified

1. **Comma pump perception**: the path I chose for the 5-JI demo is geometrically a comma loop, but whether a browser listener can *hear* the ~21.5¢ drift depends on sustained listening. Unverified in user testing.

2. **BP "alien" quality**: BP's alien feel is well-documented in academic literature; the exact-ratio lattice version used here (7/3 and 5/3 axes) is a reasonable approximation of BP harmony, but it's not the canonical 13-step equal-tempered BP scale. The ratios are correct odd-harmonic BP intervals, but the full BP scale has many more tones.

3. **19-EDO characterisation**: I described the V axis as "minor third" flavoured (5 × 63.16¢ = 315.8¢) which is indeed very close to the just minor third (315.6¢). However the U axis (3 steps = 189.5¢) is flatter than a whole tone (200¢) and closer to a neutral second — the lattice may not feel like a "familiar" grid.

4. **Polyphony**: the engine supports unlimited simultaneous voices; in a browser under stress, this could cause clicks. A voice-limiter (max 8 simultaneous nodes) would be a production hardening.

5. **iOS AudioContext resumption**: the architecture follows the brief's recommendation (AudioContext created in "Begin" tap handler), but iOS Safari sometimes requires a second gesture to resume a suspended context. The `_shared/audio-cleanup.tsx` global gesture listener should handle this, but it's untested here.
