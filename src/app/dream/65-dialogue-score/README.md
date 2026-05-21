# Dialogue Score — design notes

**Route**: `/dream/65-dialogue-score`  
**Cycle**: 81  
**Status**: demoable  
**Deps**: zero (Web Audio + Canvas2D)

## What it does

Extends `33-aria-companion` and `39-anticipate` with one new idea: **contour mirroring**.

After you play a phrase (2s silence → trigger), the system:
1. Detects the **melodic contour** of your phrase: ascending (↗), descending (↘), arch (∧), valley (∨), or neutral (—).
2. Generates Aria's response using **contour-constrained generation**: Markov chain transition probabilities guide note selection, but each step is additionally filtered to enforce the target direction.
3. Shows all response notes as **ghost bars** (dashed blue outlines) before playing — same anticipation system as `39-anticipate`.

## Contour detection

Average inter-note pitch delta:
- > +0.9 semitones/step → ascending
- < −0.9 semitones/step → descending
- Else: compare first-half delta vs second-half delta
  - First half rising, second half falling → arch (∧)
  - First half falling, second half rising → valley (∨)
  - Otherwise → neutral

## Constrained generation

For each response note:
1. Try Markov: filter transition table to candidates matching direction (ascending → delta > 0, etc.)
2. If no Markov candidate fits, fall back to a pentatonic step in the correct direction

The result: Markov preserves the user's stylistic intervals; contour constraint enforces the phrase shape. The two work together rather than against each other.

## What to try

**Demo**: C major scale ascending (C4→C5) → Aria responds ascending from the last note.

**Mic**:
- Play a descending scale → Aria descends
- Play a phrase that rises then falls → Aria mirrors the arch
- Alternate ascending and descending phrases → Aria mirrors each one

**Watch**: The header shows `your phrase ↗ ascending → aria mirrors → aria responds ↗ ascending`. The contour indicator updates every exchange.

## What's different from the parents

- `33-aria-companion`: pure Markov, no contour awareness, no ghost preview
- `39-anticipate`: Markov + ghost preview, no contour constraint
- `65-dialogue-score`: Markov + ghost preview + contour mirroring

The new thing is that Aria's response has **musical logic** — not just statistical probability but a structural intention (mirror the shape). This is the core idea from "Dialogue in Resonance" (arxiv 2505.16259): the computer's response follows score-derived constraints rather than pure improvisation.

## Polish ideas for later cycles

- Contour shapes drawn as mini curve icons on the canvas (alongside the note bars)
- "Invert mode": Aria responds with the opposite contour (you go up → Aria goes down)
- Arch detection with tighter thresholds for shorter phrases (currently needs ≥3 notes)
- BPM-synced response timing (currently fixed at 0.47s/note = ~128 BPM quarter notes)
