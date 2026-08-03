# 5624 · Redlines

**The one question:** *What if you and a musical partner composed not by PLAYING
notes, but by EDITING a shared draft — every gesture an explicit edit operation
(transpose a bar, delete a note, insert a rest, stretch, invert a phrase) — and
an agent counter-edited with its own competing intention, so the music you hear
is the running DIFF between two composers' rewrites?*

## What it is

A short diatonic loop is rendered as a piano-roll on an inline SVG (pitch = y,
time = x) and looped through the Web Audio API. You never play notes. Instead you
issue **discrete edit operations** on the current draft, and a **rule-based
agent** — sharing the very same draft — counter-edits with its own competing
intention. The piece you hear is whatever the draft currently is; the score shows
the running **diff** of who changed what.

## The technique, in plain language

- **A symbolic edit-op sequencer.** The music is data: a list of notes, each with
  an onset step, a diatonic degree, a duration, and an *owner* (`seed`, `you`, or
  `agent`). A 16-step loop plays this data back, quantized to tempo. Editing the
  data changes the loop on its next pass.
- **Explicit edit operations** (not performance): transpose a selected bar ±1
  scale step, insert a note, delete a note, nudge an onset ←/→, invert the phrase
  about its own pitch centroid, and stretch (augment) a bar's note lengths. Each
  is a pure function that returns the new draft plus a *diff* (pre-images to
  strike through, post-images to glow).
- **A rule-based counter-editing agent** with its own intention: pull the phrase
  *downward toward a lower home*, thin dense passages, and reshape upward leaps
  into descents. After you edit (or on an idle timer), it evaluates the draft and
  applies the single edit that best serves that goal — sometimes undoing your
  climb, sometimes building on it. Its notes carry a cooler timbre and a cooler
  colour so the ear and eye can tell your material from its material.
- **A diff renderer.** Freshly added / edited notes glow (violet halo); removed
  notes linger for a moment struck-through and dashed. A small ledger lists who
  edited and which op, newest first.

## Self-demo

Within ~0.6 s of pressing **Start**, a deterministic scripted **edit-war** runs
on its own: you-edit, agent-counter-edit, six rounds. A silent headless reviewer
sees the whole concept purely visually — the score animates and evolves with no
input. When the script finishes it hands you the pen ("You're driving now"), and
the agent keeps answering your moves.

## How to interact

- **Bar A / B** buttons pick which half of the loop bar-level ops act on.
- **Transpose ▲/▼** (↑/↓) — shift the selected bar up/down a scale step.
- **Insert** (`n`, or click empty grid) — add a note.
- **Delete** (⌫) — remove the selected note.
- **Nudge ◄/►** (←/→) — slide the selected note's onset.
- **Invert** (`i`) — mirror the phrase's contour.
- **Stretch** (`s`) — augment the selected bar's note lengths.
- **Click a note** to select it; **Mute** silences audio (the score still runs).

## Design notes

- **Reference:** *BeatEdit: Symbolic Music Generation as Explicit Editing*
  (arXiv:2607.11124, July 2026), which recasts music generation as producing new
  content by *editing a draft* rather than synthesizing from scratch. Redlines
  inverts/embodies it: two composers apply discrete edits to one shared symbolic
  loop, and the audible piece is the diff between their rewrites.
- **House style:** minimal, dark, Scandinavian. Sans typography; violet is the
  only brand accent. Semantic colour tokens for all UI chrome; raw hex only
  inside the SVG art layer (a warm lavender for you, a cooler periwinkle for the
  agent, neutral for the seed).
- **Determinism & safety:** a seeded `mulberry32` PRNG only — no `Math.random`,
  no `Date`, no clock; `performance.now()` drives all timing. Web Audio + inline
  SVG only (no canvas/WebGL/three.js, no new dependencies). Master output is
  compressed to a gain ceiling of 0.14. If audio can't start (no gesture /
  headless), the score still renders, animates, and runs the scripted edit-war
  silently.

## Next-cycle deepening (folded in from the WIDE fan's runners-up + jury asks)

- **Make Karel's REAL Path piano the seed you both edit** (`/api/audio/[id]`) — his recorded phrase becomes the draft; you and the agent redline *his* music, not a synthetic seed. Directly answers jury-2026-08-02 provocation #5 ("if you touch Karel's piano, change the verb" — editing IS a fresh verb vs. the lab's flow-field paintings).
- **Issue edit-ops from a starved sensor** — borrow `5640-plumbline`'s tilt path (or MIDI) so a phone tilt = transpose / a MIDI note = insert-at-degree. Cashes the jury's "cash a starved input" ask while keeping the discrete-edit core.
- **An accumulating "agreement" meter** — borrow `5656-scriptorium`'s decaying-pressure memory: track how far your intention and the agent's have converged vs. deadlocked over the last N edits, and add a real resolution/standoff end-state (you either reach a shared draft or the argument locks). Turns the edit-war into a piece with a stake, in the `4680-concord` lineage.
- **Per-op audible "diff stinger"** so an edit is legible by ear alone (a rising blip for add, a muted thunk for delete), and a scrub-the-history timeline to replay the rewrite.
