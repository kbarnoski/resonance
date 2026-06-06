# 365 — Cadence Ladder

**The question:** What if Resonance could name the key you're in and the harmonic
function of every chord you play — live — and make the pull and resolve of harmony
visible as a literal vertical ladder of tension?

---

## The concept

Harmony has three fundamental forces:

| Zone | Function | Chords | Feel |
|------|----------|--------|------|
| **Tonic** (bottom) | Rest, home | I, iii, vi | Settled |
| **Subdominant** (middle) | Departure | IV, ii | Moving |
| **Dominant** (top) | Maximum tension | V, vii° | Pulling |

Music is largely the story of how chords move between these zones — departure and
return. The Cadence Ladder renders this as a literal visual: each chord drops into
its zone as a glowing block; when tension resolves, an arc flashes across the
ladder showing the direction and type of resolution.

---

## Algorithm

### 1. Pitch-class profile (12-bin)

Every note event (from the internal demo or Web MIDI) increments the corresponding
bin in a 12-element pitch-class profile. Each frame the profile decays exponentially
so that recent notes weigh more than old ones. This is the "what notes have been
active recently" signal.

### 2. Key estimation — Krumhansl–Schmuckler

The 12-bin profile is Pearson-correlated against all 24 rotated versions of the
Krumhansl–Kessler tonal hierarchy profiles:

**Major:**
```
[6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
```

**Minor:**
```
[6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
```

These profiles were derived empirically by Krumhansl and Kessler (1982) from
listener ratings of how well each pitch fits in a given key context. The Pearson
correlation (r) measures how closely the active pitch distribution matches each
candidate key profile.

**Hysteresis:** the key only switches when a new key wins by a margin ≥ 0.08 for
at least 30 consecutive frames (~0.5 s at 60 fps). This prevents jittery key
flipping on ambiguous passages and produces clean, perceptible modulation events.

### 3. Chord quality identification

Active pitch classes are template-matched against six chord templates (major,
minor, diminished, major 7th, dominant 7th, minor 7th). The best-scoring root +
quality wins if coverage ≥ 50%.

### 4. Roman-numeral + harmonic function labeling

Given the chord root and quality relative to the estimated key tonic, a lookup
table assigns:
- The Roman numeral (I, ii, iii, IV, V, vi, vii°, secondary dominants where
  detectable: V/V, V/ii)
- The Riemann function class: **Tonic** (I, iii, vi), **Subdominant** (IV, ii),
  or **Dominant** (V, vii°)
- A tension score 0–1 (Tonic ≈ 0.05–0.20, Subdominant ≈ 0.35–0.50,
  Dominant ≈ 0.80–0.95)

This follows Hugo Riemann's tripartite functional harmony framework as modernised
in Diether de la Motte's *Harmonielehre* and the Anglo-American Roman-numeral
tradition codified in Aldwell & Schachter's *Harmony and Voice Leading*.

### 5. Cadence detection

Cadences are identified from consecutive function-class transitions:

| Transition | Type | Arc colour |
|------------|------|------------|
| Dominant → Tonic | **Authentic** | Emerald |
| Subdominant → Tonic | **Plagal** ("Amen") | Violet |
| Dominant → vi (deceptive Tonic) | **Deceptive** | Amber |

A deceptive cadence is distinguished from a plain authentic cadence by checking
whether the chord landing on "Tonic" function is the relative minor (vi) rather
than the tonic I.

### 6. Modulation detection

When the key finder commits to a new key (hysteresis satisfied), a ripple plane
sweeps the scene and all Roman-numeral labels re-contextualise automatically —
the same chord can change function as the key shifts.

---

## Internal known-progression (verification posture)

The prototype auto-plays a hand-authored chord progression whose correct key,
Roman numerals, functions, and cadences are **ground truth** — they were
deliberated at authorship time, not inferred:

**Section A — C major**
```
C  → I   (Tonic)
F  → IV  (Subdominant)
G  → V   (Dominant)
C  → I   ← authentic cadence  V→I
G7 → V7  (Dominant, build)
Am → vi  ← deceptive cadence  V→vi
F  → IV  (Subdominant)
C  → I   ← plagal cadence  IV→I
```

**Section B — G major** (modulation to the dominant)
```
G  → I   ← modulation event, key banner updates
C  → IV
D  → V   (Dominant)
G  → I   ← authentic cadence
```

Then it loops. When the ladder correctly names every function, arc, and cadence
in this sequence, the algorithm is proven correct — no keyboard or mic needed.

---

## Input modalities

1. **Internal demo** (primary): The `LadderAudio` scheduler plays the known
   progression using warm FM-flavoured triangle-wave pad voices through a brick-wall
   `DynamicsCompressor` limiter. Every note-on/off event is directly injected into
   the analysis pipeline.

2. **Web MIDI** (secondary, optional): If `navigator.requestMIDIAccess()` succeeds
   and a keyboard is connected, note-on/off messages feed the identical pipeline.
   If MIDI is unavailable, the demo keeps running with no error shown.

---

## References

- Krumhansl, C.L. & Kessler, E.J. (1982). Tracing the dynamic changes in
  perceived tonal organization in a spatial representation of musical keys.
  *Psychological Review*, 89(4), 334–368.
- Krumhansl, C.L. (1990). *Cognitive Foundations of Musical Pitch*. Oxford
  University Press.
- Temperley, D. (2001). *The Cognition of Basic Musical Structures*. MIT Press.
  (Chapter 4: Key-Finding.)
- Riemann, H. (1893). *Vereinfachte Harmonielehre*. [Functional harmony
  Tonic / Subdominant / Dominant tripartite.]
- Aldwell, E. & Schachter, C. (2003). *Harmony and Voice Leading* (3rd ed.).
  (Roman-numeral cadence tradition: authentic, plagal, deceptive.)
- de la Motte, D. (1976). *Harmonielehre*. (Modern functional synthesis.)

---

## Verification posture

**Build-verified, not browser-verified.** The TypeScript compiles cleanly under
Next.js 15 strict mode. The Krumhansl–Kessler profile numbers and Pearson
correlation formula are taken directly from the 1982 paper. The known-progression
authorship means that — given a working Web Audio + three.js stack — the visual
output can be compared against the hand-computed ground truth listed above without
any external tool or internet connection. Whether the three.js scene renders
exactly as designed on a particular phone browser is not browser-verified.
