# Trap (2530)

**The question.** What if an AI musician were trying to *win* — playing a phrase
ahead to lead the shared melody into a harmonic trap you can't resolve — and you
could see the trap coming and try to escape it?

Trap is a zero-sum musical tug-of-war. You and a planning AI alternately extend
**one shared chromatic melodic line**, one note per beat. The AI's objective is
to **maximise unresolved harmonic tension**; yours is to **resolve** it. A single
tension meter is the rope: the AI pulls it up, a good resolving move pulls it
down. You score each time you snap a high-tension situation back to consonance;
the AI scores when it strands you in dissonance you cannot answer.

## The adversarial planner (`planner.ts`)

The AI runs a genuine depth-limited **minimax with alpha–beta pruning** — the
sign-flipped game-tree search of Shannon's *Programming a Computer for Playing
Chess* (1950). Tension is a single scalar both sides fight over: the AI is the
maximiser, you are the minimiser.

Two things make it a *trap-setter* rather than a note-by-note dissonance grabber:

1. **It values a move by your best reply, one phrase ahead.** A candidate note is
   scored not by how bad it sounds now but by how tense the line still is after
   *you* have played your calmest possible answer to it — and the AI's answer to
   that, and so on, `PLAN_DEPTH` plies deep. So it will happily play a merely
   tense note if that note builds the sonority into a cluster you cannot escape.
2. **Tension on your turn is worth more to it than tension on its own turn**
   (`PLAYER_W` 1.3 vs `AI_W` 0.7). The search actively hunts positions where
   *your* hands are tied, not just loud positions.

The search exposes its **node count** and **per-candidate evaluation** (surfaced
in the UI) so the planning is visible, not asserted.

## The tension model (`tension.ts`)

Each candidate note's tension is a weighted sum, all terms in `[0, 1]`:

- **Context dissonance** (0.65) — dissonance against a **rolling window** of the
  last `ECHO` = 5 pitches (an implied, monophonic sonority, after Bregman's
  *implied polyphony*), the newest note weighted most and older ones decaying.
  This one term carries both the interval against the prior note *and* the
  lingering rolling tonal centre. It blends a decayed **average** with the decayed
  **worst single clash** — see the chromatic note below.
- **Voice-leading strain** (0.10) — steps are free, leaps cost.
- **Corner strain** (0.25) — how cornered the *next* mover is: the minimum
  context dissonance the best reply to this note can still reach. High corner =
  even the calmest answer stays tense = a trap.

Interval roughness follows the sensory-dissonance ordering (semitone and tritone
bite hardest, thirds sit calmest). At or below 30% the line is **resolved**; at
or above 50% the mover is **stranded**.

## Why chromatic, not pentatonic

The pitch space is fully **chromatic (12-TET)**. Snapping to a pentatonic or
just-intonation "always sounds nice" lattice would make dissonance unreachable —
and dissonance is the AI's *weapon*, so it has to be able to sound genuinely bad
on purpose. Chromatic freedom created one real design problem: in 12-TET there is
almost always a pitch consonant to any *two* anchors (the last note and a tonal
centre), so a naive average-dissonance model is trivially escapable near a minor
third, and no real trap exists. The fix is the **worst-clash** half of the
context term: a note that clashes hard (semitone / tritone) with *any* strongly
weighted recent note cannot resolve. That lets the AI plant a cluster — e.g. a
tritone plus a semitone in the rolling window — that no single next note answers.
(Parameters were tuned by headless self-play so that a *perfect* escaping player
still mostly only "holds" the line, and a fallible one gets stranded.)

## The trap-reveal mechanic

Because the AI plans a phrase ahead, it **reveals** the trap it is setting. When
it commits a note, the search's **principal variation** is stored, and on your
turn the line shows:

- a faint dashed circle where the AI **expects your reply** (`pv[1]`), and
- a magenta dashed **"trap"** note it **plans to play next** (`pv[2]`) to spring it.

You get one beat's warning to play a note that makes that planned answer no longer
hurt. This reveal-the-plan idea is drawn from **ReaLJam (CHI 2026)** and its
anticipation waterfall. The revealed threat is literally the AI's own search PV —
not a decoration.

The lineage of the machine improviser here is **George Lewis's *Voyager* (1987)**,
an interactive computer improviser that responds to and asserts against a human
player — except *Voyager* collaborates, and Trap's AI is trying to beat you.

## Files

- `page.tsx` — SVG piano roll, tension meter, keyboard control surface, the
  trap reveal, scores, verdict, auto-demo, Web Audio wiring. `"use client"`.
- `planner.ts` — the alpha–beta minimax trap-setter and PV extraction.
- `tension.ts` — the pure tension model and the deterministic `mulberry32(0x2530)`.
- `synth.ts` — two-timbre Web Audio; lets high-tension intervals actually clash.

## Controls

On load the piece **self-plays a full round** (visual only — audio needs a
gesture) so a silent glance shows the whole idea: AI sets a trap → it is revealed
→ a scripted player either escapes or is caught → the meter swings → the score
moves. Press **Play — take over** to start audio and play it yourself: answer with
the labeled **keyboard row** (A W S E D F T G Y H U J K → C4…C5) or by clicking
the highlighted column / a key.

## Honest caveats

- Tension is a **hand-built psychoacoustic proxy**, not perception. The interval
  roughness table, the window length, decay, blend, and weights are all tuned
  choices; a different listener's "resolved" is not exactly 30%.
- The AI's principal variation shows a **horizon effect** — the tail of the PV
  often converges to the same couple of notes because the search treats the game
  as neutral past its depth. The revealed threat (`pv[2]`) is well within the
  horizon and reliable; the notes after it are the search's best guess, not gospel.
- Because monophonic melody only *implies* harmony, the "sonority" you are
  answering is a modelled echo, not literally sounding chords — though the
  synth's overlapping tails let neighbouring notes beat so the clash is audible.
- Search is exact minimax over 13 chromatic candidates at `PLAN_DEPTH` plies; it
  runs once per turn (tens of milliseconds), not per frame.

## Constraints honoured

Audio-visual (SVG + Web Audio, no Canvas2D/WebGL). Self-contained but for the
shared palette import. Deterministic via `mulberry32(0x2530)`; no `Math.random`,
`Date.now`, or argless `new Date()`. Auto-demo for silent review; audio only on
gesture; graceful `text-destructive` notice if `AudioContext` fails. Full teardown
on unmount (oscillators stopped, context closed, rAF cancelled, listeners
removed). No luminance pulse above ~3 Hz.
