# 983 · Tension Journey

A self-composing, long-form (4–5 min) piece whose **form is a quantitative
target**. You choose an emotional *tension arc* (a shape); a transparent
engine searches harmony with Elaine Chew's **Spiral Array** model so that
the music's **measured tonal tension** tracks that exact curve. Every chord
is placed for a stated numeric reason ("chose Ger+6 — tensile strain pushed
tension toward target"), so the whole composition is explainable, not opaque.

## The question it answers

> What if a 4–5 minute piece could **compose itself to follow a chosen
> emotional tension arc** — you pick a shape (slow arch, build-and-drop,
> double wave, ritual rise, calm plateau), and a transparent engine searches
> harmony to realize that exact tension curve, every chord chosen because it
> moves the music's measured tonal tension toward the target — with minute 5
> genuinely different from minute 1?

This is the **explainable, deterministic counterpart** to 2026's opaque
neural full-song generators. The instrument is the autonomous engine, not a
finger on glass: input is the **computer keyboard + preset arc buttons**.

## What it is

- **Input:** keyboard + a row of preset arc buttons (non-pointer primary).
- **Output:** Canvas2D — a scrolling tension-ribbon timeline (the bulletproof,
  score-like renderer). No three.js / WebGPU.
- **Core technique:** the Spiral Array tonal-tension model used as a **search
  target** — a per-step beam search over chord candidates scored by how well
  their tension matches the target arc value.
- **Sound:** a look-ahead Web Audio sequencer voicing the planned chords;
  timbre reflects tension so the arc is *audible*, not only visible.
- **Vibe:** architectural / ink-on-parchment, graphite + amber + a violet
  accent. Deliberately not a dark cosmic nebula or glow-bloom field.

## Subsystems

| File           | Responsibility |
| -------------- | -------------- |
| `spiral.ts`    | The Spiral Array geometry + the three tension measures (cloud diameter, cloud momentum, tensile strain) and their normalised blend into one scalar tension. |
| `engine.ts`    | The composer: arc-shape target functions, chord vocabulary, the candidate search/scoring, modulation/long-form state, seeded PRNG, and the per-chord "why" explanation. |
| `audio.ts`     | Web Audio realisation: ADSR FM-ish voices, bass root, sparse melody, tension-driven brightness/roughness; `gain → lowpass → compressor → destination`, voice cap. |
| `canvas2d.ts`  | The tension-ribbon timeline: faint target guide, filled achieved ribbon, playhead, live chord annotation, three live measure meters. |
| `page.tsx`     | UI, keyboard/preset controls, the look-ahead scheduler, rAF render loop, auto-start, teardown. |

## The Spiral Array tension model (the heart)

**Geometry.** Pitch classes sit on a 3D helix ordered by perfect fifths. For a
position `k` along the line of fifths (C=0, G=1, D=2, A=3, …):

```
P(k) = ( r·sin(k·π/2),  r·cos(k·π/2),  k·h )      with r = 1, h = 0.4
```

Four fifths = one full turn (π/2 each) plus `4h` vertical rise — which is
exactly what makes fifth-neighbours spatially close and tritones far. We map
the 12 pitch classes by their line-of-fifths index and **centre the line of
fifths on C** (indices > 6 are shifted to negative) so that, e.g., F is the
near neighbour below C rather than 11 steps away.

**Center of Effect (CE).** A chord (or key) is the weighted average of its
pitch points on the helix.

**The three measures (Herremans & Chew, "Tension ribbons", TENOR 2016):**

1. **Cloud diameter** — max pairwise Euclidean distance among the chord's
   pitch points. Spread / dissonance.
2. **Cloud momentum** — distance from the *previous* CE to the current CE.
   Tonal movement.
3. **Tensile strain** — distance from the chord's CE to the **key's CE**.
   Distance from home.

**Key CE.** The key reference is the weighted centroid of its tonic (0.5),
dominant (0.3), and subdominant (0.2) triads on the helix — a faithful-enough
proxy of Chew's key representation for a fixed-key strain reference.

**Blend.** Each measure is normalised by an observed maximum
(`diameter/3.2`, `momentum/2.4`, `strain/2.6`, each clamped to ≤1) and blended:

```
tension = 0.34·diameter + 0.18·momentum + 0.48·strain      (≈ 0..1)
```

Strain dominates (distance from home is the strongest felt-tension cue);
diameter adds local dissonance; momentum rewards motion. All constants are in
`spiral.ts` (`NORM`, `TENSION_WEIGHTS`) and documented there.

**Reachable band.** A single key plus this (musical, not pathological) chord
vocabulary realises blended tension in roughly `[0.22, 0.70]`, not the full
`[0, 1]` — reaching 1.0 needs piled-up chromaticism we avoid for musicality.
So the arc's `[0,1]` *shape* is mapped into that reachable band
(`REACHABLE_LO/HI` in `engine.ts`) **before** both scoring and drawing the
guide. The drawn guide and the achieved ribbon therefore share one scale, so
"the ribbon hugs the guide" is an honest, like-for-like claim.

## The search

At each chord step the engine knows the **target tension** = `arc(t)` for the
current normalised time `t`.

- **Candidate set** (`templatesFor` in `engine.ts`): all diatonic triads/7ths
  of the current key **plus** a chromatic palette — Neapolitan 6, German
  augmented 6th, fully-diminished 7th, secondary dominants (V7/V, V7/vi),
  tritone substitution, and modal mixture (♭VI, borrowed minor iv). The
  chromatic palette is what lets the engine *reach* high target values.
- **Scoring:** `cost = |tension(candidate) − target|·1.0 + voiceLeading·0.22 +
  repeatPenalty·0.15`. The dominant term is the tension error (hit the arc);
  voice-leading smoothness (average minimal pitch-class motion) connects
  successive chords; the repeat penalty discourages stalling on one chord.
- **Lookahead / beam:** candidates are ranked by cost; with `beam = 3` the
  engine usually takes the best but occasionally (seeded) samples the shortlist
  for variety without abandoning the target. This is a 1-step beam — honest
  about that; a wider multi-step beam is listed under next-cycle work.
- **Determinism / seed:** all stochastic choices (beam sampling, modulation)
  go through a seeded **mulberry32** PRNG. The documented default seed is
  `DEFAULT_SEED = 0x7e551042`. A given arc + key + length therefore reproduces
  exactly.
- **The "why" tag:** for each placed chord the engine reports the dominant
  tension measure and the signed distance of achieved tension from target
  (e.g. `tensile strain 0.61 · tension +0.04 (slightly over)`), shown both on
  the canvas near the playhead and in the readout below.

## Why minute 5 ≠ minute 1 (long-form state)

The engine is stateful: it remembers the running **key**, the **previous CE**,
the previous chord (for voice-leading), and where it is in the arc. At phrase
boundaries (every 8 chords, away from the very start/end) it may **modulate**
— pivot up or down a fifth, or flip mode — with a seeded probability. So as the
piece progresses it drifts through related keys, the tensile-strain reference
moves, and the harmonic surface evolves. Combined with the rising/falling
target arc and the tension-driven timbre (brighter and rougher as tension
climbs, warm and narrow on resolution), the late piece is materially different
from the opening rather than a loop.

## Controls legend

| Key                    | Action |
| ---------------------- | ------ |
| `1`–`5`                | Pick the target arc shape (also clickable buttons) |
| `Space`                | Start / pause |
| `↑` / `↓`              | Transpose the key up / down a fifth |
| `m`                    | Toggle major / minor |
| `←` / `→`              | Slower / faster (seconds per chord) |
| `[` / `]`              | Shorter / longer piece (4 / 4.5 / 5 min) |
| `p`                    | Perturb — nudge the key chromatically and re-plan forward |

It **auto-starts ~1.2 s after load** with the default "Slow Arch" so a quick
reviewer hears and sees the arc develop with zero setup. Changing any control
re-plans the piece deterministically and (while playing) re-aims the scheduler
at the current playhead so it continues forward rather than restarting.

## The visual

The full target arc is drawn as a faint dashed guide across the width; the
**achieved tension** is a filled amber ribbon that should hug it (the visible
proof the engine is tracking). The ribbon's top line turns rose where it
overshoots the target. A violet playhead sweeps left→right; modulations are
marked with vertical violet ticks. The live chord is annotated near the
playhead (name + Roman numeral + "why" tag), and the three tension measures
are shown as labeled meters at the bottom.

## Named references

- **Elaine Chew — _The Spiral Array_** in *Mathematical and Computational
  Modeling of Tonality* (Springer, 2014). Pitches on a 3D helix ordered by
  fifths; chords/keys as weighted centroids ("center of effect").
- **Dorien Herremans & Elaine Chew — "Tension ribbons: Quantifying and
  visualising tonal tension"** (TENOR 2016). The tension-ribbon paradigm and
  the three measures used here.
- **Herremans & Chew — _MorpheuS_** (IEEE Trans. Affective Computing).
  Tension-guided music generation — the inspiration for treating tension as a
  compositional target.

## Honest limitations & next-cycle deepening

- **Constants are hand-tuned, not fitted.** The normalisation maxima and blend
  weights are reasonable and documented but not validated against a corpus or a
  listening study. "Tension" here means *this model's* tension.
- **1-step greedy/beam search.** It optimises each chord locally. A genuine
  multi-step beam (lookahead over several chords) would produce smoother
  functional progressions and better cadential shaping.
- **Voice-leading is a pitch-class heuristic**, not real SATB voice-leading
  with register, doubling, and spacing rules. The melody is a sparse top-note
  tracer, not a composed line.
- **Modulation is coarse** (fifth pivots / mode flips on phrase boundaries),
  not a planned key scheme tied to the arc.
- **Audio is synth-grade** FM-ish voices; the brief was tension-as-form and
  legibility, not instrument realism.
- **What is verified:** `npx tsc --noEmit` (0 errors) and `next lint`
  (0 warnings) pass. The engine was run headless across all five arcs at
  110 chords: **mean tension-vs-target error ≈ 0.026–0.033** (max ≈ 0.11–0.15)
  on the 0..1 scale, and **5 distinct keys** per piece — so the ribbon really
  does track the guide and the late piece really does differ from the opening.
  The *audible* brightness/roughness change with tension was reasoned from the
  audio code, not formally measured in a listening test.

Next cycle: wider multi-step beam, a learned/rule-based voice-leading layer, a
true melodic line atop the harmony, and an arc-aware modulation plan.
