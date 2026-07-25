# 2672 — Somnus

**The question:** _What if a piece of music slept to remember — structured as a
night's sleep architecture, so it consolidates its own motifs across NREM/REM
cycles and is a genuinely different (yet connected) piece at minute 8 than at
second 0?_

Somnus is a long-form generative organism, not an instrument. Press **Begin the
night** once (to unlock the AudioContext) and it runs itself for ~8 minutes,
sleeping through five cycles, with no further input. A **Jump ahead 4 min**
control lets a reviewer hear late-night material fast; a **Mute** toggle keeps
the visuals running silently.

## How the sleep / consolidation engine works

### 1. Hypnogram walker (`engine.ts` → `buildSchedule`)
A state machine descends **Wake → N1 → N2 → N3 → REM** in a realistic
descending-then-REM-lengthening architecture. Five ~90-minute cycles are
compressed to ~90 seconds each (a ~496 s night ≈ 8 min ≈ 5 cycles). Early cycles
are **slow-wave-heavy** (N3 = 46 s → 6 s across the night); late cycles are
**REM-heavy** (REM = 8 s → 52 s). The night clock maps the run onto 23:00 → 07:00.

### 2. Memory bank (`Memory[]`)
Each motif is a short free-chromatic pitch/rhythm contour with a mutable
`strength` (salience). Stage-specific operations consolidate the bank:

- **Wake / N1 — admit.** New motifs enter the bank (the "day's experiences").
  The opening 20 s "day" seeds five motifs (M1–M5); brief inter-cycle arousals
  occasionally admit one more.
- **N2 — spindles.** The most-recently-active motifs are tagged (a small
  strength bump) and a fast, high, shimmering **spindle burst** fires.
- **N3 (slow-wave) — the consolidation core.** Every ~4 s it **replays** the
  top-k (3) strongest motifs an octave down in the delta register, slightly
  **varied** each time (reconsolidation drift), **strengthens** them (+0.18),
  **decays** every motif (×0.90), and **forgets** the weakest below threshold
  (dropping them from the bank). The single strongest wake-motif and any
  currently-replayed motif are protected, and ≥3 motifs always survive.
- **REM — splice.** Two surviving motifs are recombined into a wild **dream**
  motif: half of A's contour + half of B's, bent by non-integer ratios into
  clashing intervals, admitted at moderate strength. Dreams start faint, so most
  fade before morning; the ones born in the long late-night REM survive to dawn.

A motif born in the first wake period returns near dawn: because N3 keeps
replaying and strengthening the strongest survivor, the same contour is
**recapitulated** in the dawn wake — recognisable in shape but transformed by a
night of accumulated replay drift (~100–130 cents mean pitch drift in testing).

### 3. Synth (`audio.ts`)
Per-stage register, **free-chromatic** (raw continuous Hz — **no** just-
intonation / pentatonic / diatonic snapping, so N3 can grind and REM can clash):

- **N3** — deep delta sub (~46 Hz) with two close, beating sawtooth oscillators
  (deliberate grind).
- **N2** — quiet high theta shimmer + sine spindle bursts.
- **REM** — mid, wide-detuned airy pad; dream voices detuned ±35 cents.
- **Wake** — soft pad under clearer triangle motif statements.

A persistent oscillator "bed" carries the stage atmosphere; one-shot voices
carry statements, replays, splices and spindles. A seeded convolver gives the
whole night a nocturnal room.

### 4. Renderer (`viz.ts` + `page.tsx`, SVG only)
Two stacked panels: a **hypnogram ribbon** (the stage descending/rising across
the night, played portion lit in violet, a moon riding the current stage) and a
**memory-strata** diagram — every motif a horizontal thread whose thickness and
brightness track its current strength, marked with **birth** nodes, **replay**
ticks, **forget** ✕, dream-splice **parent links**, and a bright **recapitulation**
diamond near dawn. It reads as a story with the sound muted.

## Determinism
All randomness flows from one `mulberry32` stream seeded from `0x2672`. No
`Math.random`, `Date.now`, or `new Date`. `performance.now()` drives only
animation timing. Two loads dream the same night; Jump-ahead fast-forwards the
same deterministic sequence, so the jumped state equals the played-through state.

## Named references
- Wilson & McNaughton 1994 — hippocampal ensemble replay during sleep.
- Diekelmann & Born 2010 — _The memory function of sleep_ (Nat. Rev. Neurosci.).
- Rasch & Born 2013 — _About sleep's role in memory_ (Physiol. Rev.).
- arXiv:2603.14517 — _Learning to Forget: Sleep-Inspired Memory Consolidation_
  (the ML anchor for replay-and-prune consolidation).

## Diversity tags
`sleep-architecture` · `memory-consolidation` · `long-form-generative` ·
`hypnogram` · `free-chromatic` · `dissonance-capable` · `svg-nocturne` ·
`state-machine` · `deterministic` · `self-evolving`

## What's rough / honest limitations
- **Forgetting is modest (~4 motifs/night).** Because REM lengthens toward
  morning, most dream splices are born too late to accrue enough N3 decay — so
  they survive to dawn. This is faithful to sleep architecture but means the
  "watch it be forgotten" beat is quieter than the "watch it be strengthened"
  beat. Early dreams and weak wake motifs do get pruned (visible ✕ marks).
- The **audio bed** re-targets on stage change with a long ramp; transitions are
  smooth but the grind of N3 is intentionally unpretty and may read as "off" on
  first listen — that is the point.
- Memory-strata **lanes** are fixed by birth order and compress if ~>16 motifs
  are alive; a very busy night packs the threads tightly.
- No spatial reverb per-voice beyond a single shared impulse; panning is the
  only width cue.
- Motif **rhythm** is quantised to a small beat set (only *pitch* is free-
  chromatic); rhythmic drift over the night is not modelled.
