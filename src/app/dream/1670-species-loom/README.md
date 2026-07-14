# 1670 · Species Loom

**The one question:** *What if you could PLAY a subject, then watch a machine
grow it into a three-voice fugue whose every note is chosen to obey real
species-counterpoint rules — the illegal moves flashing red and being rejected
on the score in front of you?*

This is the *species-lawful* cycle-2 of the earlier `1660-fugue-loom`. Where
1660 was a convincing but not academically-lawful self-playing fugue, this
piece makes the voice-leading **genuinely rule-lawful via a constraint search
that shows its work**, and hands the visitor real agency: you play the subject
on the computer keyboard, and a second, independent verifier proves the result
is clean.

## Play it

- The **home row** `a s d f g h j k l` is a D-dorian scale (D4 → E5). The row
  above (`e t u o`) adds accidentals including the C# leading tone.
- Play 4–10 notes, then press **Compose fugue** (or **Ghost subject** to load a
  default). **Play / Stop** replays. **Clear** starts over.
- On load, if no key is pressed within ~3 s, a deterministic **ghost** plays the
  default subject, composes, and performs it — so the piece is never blank or
  silent. The instant you press a mapped key the ghost yields and the subject
  becomes yours (badge: *ghost is composing* → *you have the subject*).

## How the rule engine works (`engine.ts`)

1. **Cantus firmus.** The played subject becomes the CF; a short stepwise tail
   is appended so it walks to the supertonic E and lands on the tonic D.
2. **Backtracking legal-set search.** Two voices are grown note-by-note. At each
   bar the search enumerates the in-scale candidate pitches and keeps only those
   that pass every rule; it scores the survivors (favouring contrary and
   stepwise motion and fuller imperfect consonances), tries them in seeded order,
   and **backtracks** when a bar has no legal continuation.
   - **Consonance on downbeats** — perfect (unison/5th/8ve) and imperfect
     (3rds/6ths) only; 2nds, the 4th-against-the-bass, tritones and 7ths are
     dissonances and are rejected.
   - **No parallel or hidden perfects** — a perfect consonance may never be
     reached by similar motion. Parallels are forbidden between every voice pair;
     hidden/direct perfects are policed between the outer pair (the standard
     3-voice relaxation, so inner voices aren't over-constrained).
   - **Melody** — mostly stepwise, consonant leaps up to an octave, no
     augmented/diminished (tritone) leaps, no two large leaps in a row.
   - **Second species (2:1)** in the lower voice — a weak-beat dissonance is
     licensed *only* as a passing tone (stepwise in, stepwise out, same
     direction). These are tagged `pt` on the score.
   - **Cadence** — a fixed clausula vera / authentic cadence: dominant frame
     (A–C#–E) resolving with the leading tone C#→D into the final D octave.
3. **Vetoes you can see.** When a candidate is rejected for a parallel or hidden
   perfect it is recorded and drawn on the staff as a **red, struck-through ghost
   notehead** (`∥5`, `∥8`, `→5`…) exactly as the playhead reaches that bar.
4. **Independent verification.** After composing, `verify()` — a *separate* code
   path from the search — re-scans every vertical (downbeats, the parallel/hidden
   checks, and every second-species weak beat) and counts violations. The live
   readout `verticals checked: N · violations: 0` is that real check, not a
   restatement of the search.

Determinism: every stochastic choice comes from a seeded **mulberry32** PRNG
(constant seed), so the ghost demo and every composition are byte-reproducible.
No `Math.random`, no wall-clock. Visuals are **SVG/DOM only** (off-GPU). Audio is
three panned per-voice organ-ish synth lines through a master gain ≤ 0.13 into a
`DynamicsCompressor`, with smoothed ramps and full teardown on unmount.

## Named references

- J. J. Fux, *Gradus ad Parnassum* (1725) — the species-counterpoint method.
- G. Mazzola et al., "Three-voice first-species counterpoint," arXiv 2606.01102
  (2026).
- **FuxCP** — a constraint-programming counterpoint solver (the legal-set /
  backtracking approach used here).
- "Formulating First Species Counterpoint With Integer Programming."

## Honest self-assessment

The rule engine is real: an independent verifier confirms 0 violations across a
dozen hand-checked subjects (including ones using accidentals) at the fixed
seed, and the constraint search visibly rejects parallel/hidden perfects on the
score, so the "shows its work" claim holds. It is a deliberately scoped species
model — I check downbeat-to-downbeat for parallels, apply the hidden-perfect ban
only to the outer pair, and license weak-beat dissonance as passing tones only
(no accented passing/neighbour figures, no invertible-counterpoint niceties) —
so it is *lawful within that ruleset*, not a full stylistic fugue with real
subject/answer entries. What I could **not** verify headless: the actual audio
output and whether browser autoplay policy lets the unattended ghost make sound
without a gesture (the visual manuscript is decoupled from the audio clock so it
always animates, but I could not confirm loudness/timbre or click-freeness by
ear in this environment).
