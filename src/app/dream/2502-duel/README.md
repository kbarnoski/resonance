# 2502 · Counterpoint Duel

**The one question:** *What if counterpoint were a turn-based strategy game you play against an AI that actually thinks ahead?*

Counterpoint is usually taught as solitaire — you, a cantus firmus, and a rulebook. But the rules are a scoring function, and a scoring function is a game. So make it one: a fixed lower voice is given, and you and an AI alternately place notes in the upper voice, left to right, each note scored the instant it lands. Highest total when the line is full wins. The tension is real because the AI isn't decorating — it's competing.

## How it plays

- A fixed **cantus firmus** (8 notes, diatonic C major, opens and closes on the tonic) sits in the lower lane.
- You place **even beats**, the AI places **odd beats**, filling the upper voice one note at a time.
- Click a cell to place — hover first to preview exactly what it will score and why.
- Fill all 8 beats → cumulative **You vs AI** → higher score wins, with a one-line verdict naming your best move.
- **Play the duel** sounds the finished two-voice line back with a moving playhead.

## The scoring (Fux, *Gradus ad Parnassum*, 1725)

First-species rules, each move returning signed reasons so the UI can show the *why*:

- **Vertical consonance** vs the note below — 3rds/5ths/6ths/8ves reward, 2nds/4ths/7ths/tritones penalise. Imperfect consonances score a touch higher than perfect ones (too many perfects is dull).
- **No parallel perfect fifths or octaves** between consecutive beats — heavy penalty.
- **Contrary / oblique motion** beats similar; a direct move *into* a perfect consonance is docked.
- **Stepwise** counterpoint rewarded; leaps larger than a sixth penalised; the opening and closing beats must be a perfect consonance.

## The AI — real adversarial search

`ai.ts` is a genuine **negamax** game-tree search (`AI_DEPTH = 3` plies), the sign-flipped minimax of **Shannon's 1950 paper** *Programming a Computer for Playing Chess*. A move's value to the mover is its immediate rule score **minus** the best the opponent can then extract from the resulting position, recursively. The AI therefore doesn't grab the locally tastiest note — it plays the note that leaves *your* best reply as weak as possible. The node count under the scoreboard is the tree it actually walked (thousands of positions per move). Ties break deterministically toward the more stepwise, lower pitch, so replays are exact.

## Determinism & graceful degradation

No `Math.random`, no `Date.now`. A hand-written `mulberry32(0x2502)` picks the cantus firmus, so **New duel** cycles deterministically and the load-time **auto-demo** — the two sides self-playing a full duel, notes appearing and the score ticking — replays exactly, visual-only (browsers forbid a gesture-less `AudioContext`; audio unlocks on the first click). No audio at all? The board still plays silently behind a `text-destructive` notice. Everything tears down on unmount (oscillators stopped, `ctx.close()`, `cancelAnimationFrame`).

## Files

- `counterpoint.ts` — interval/rule scoring, cantus firmi, seeded PRNG
- `ai.ts` — the negamax search + deterministic move selection
- `synth.ts` — two-timbre Web Audio voices + playback with playhead
- `page.tsx` — the game UI, SVG staff/piano-roll, auto-demo driver

## Next-cycle deepening

- **Second- and third-species rules** (2:1 and 4:1 against the cantus firmus) — passing tones, weak-beat dissonance, cambiata — which explode the branching factor and make the lookahead matter far more.
- **Pass-and-play** human-vs-human, and a **teaching mode** that pauses after every docked move to name the rule you broke ("that's parallel fifths — Fux would fail you") instead of only showing the number.
