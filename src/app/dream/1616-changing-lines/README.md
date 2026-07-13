# 1616 · Changing Lines

**The one question:** What does the I-Ching sound like when it plays itself — a
hexagram cast as a chord, its *changing lines* pulling the music forward through
the King Wen sequence as a slow, self-evolving canon?

A hexagram is cast, sounded as a six-note guqin chord, held, and then its
changing lines slowly morph it — in ink and in sound — into its transformed
hexagram. That transformed hexagram becomes the new present, fresh changing lines
are cast on it, and the piece walks the space of the 64 hexagrams forever. It is
fully self-playing from load and never hard-loops.

## Line → voice mapping

Each of the six lines is one voice in a six-note **gong pentatonic** chord
(宫商角徵羽 ≈ do re mi sol la), spread across registers, bottom line lowest:

| Line (bottom→top) | Note | Frequency |
| --- | --- | --- |
| 1 | C2 | 65.41 Hz |
| 2 | G2 | 98.00 Hz |
| 3 | D3 | 146.83 Hz |
| 4 | A3 | 220.00 Hz |
| 5 | E4 | 329.63 Hz |
| 6 | C5 | 523.25 Hz |

- **Yang** (solid) lines sound present and bright — an open lowpass, more octave
  and twelfth shimmer, steady amplitude, a longer pluck decay.
- **Yin** (broken) lines sound hollow and dim — a closed lowpass, little
  shimmer, and a slow amplitude notch (a shared ~0.7 Hz tremolo dipping the gain)
  that is the sonic analogue of the *gap* in a broken line.
- Each voice is a plucked, soft-attack / long-decay guqin-like tone (triangle
  fundamental + two sine partials through a lowpass), re-plucked on each cast.
- A **changing line** audibly moves: during the 8–20 s transition its timbre
  glides from its present character to its transformed character, its pitch
  bends (~45 cents, rising into yang / falling into yin, then settling), and it
  is softly re-plucked partway through so the movement reads as an *arrival*.

Visually the same line is drawn in sumi ink on warm rice paper: a solid bar for
yang, two segments with a gap for yin, morphed by animating the opacity of the
center "bridge" segment. Changing lines carry a single cinnabar-red circle at the
pivot — the one warm accent — that pulses and then fades as the morph completes.

## Cast → changing-lines → transform logic (`iching.ts`)

- **Cast** uses the classic yarrow-stalk four-probabilities: old-yin 1/16,
  young-yang 5/16, young-yin 7/16, old-yang 3/16. Old lines are the changing
  lines.
- **King Wen number/name** is resolved from the six-bit line pattern via its
  lower and upper trigrams (the standard 8×8 King Wen table), yielding number +
  Chinese name + pinyin + English gloss.
- **Transform**: flip the changing lines to get the transformed hexagram. The
  pair (present → transformed) is the engine of motion.
- **The walk (a Markov canon)**: after arriving on a hexagram, fresh changing
  lines are cast *on it* using the conditional yarrow statistics (a yang line
  changes with p = 3/8, a yin line with p = 1/8), guaranteeing at least one line
  moves. Each hexagram is thus a state whose transition to the next is a
  probabilistic step through hexagram space — a generative Markov walk that never
  settles into a fixed loop.

## References

- The **I-Ching** (*Yijing*, the Book of Changes) and its yarrow-stalk casting of
  changing lines.
- The **King Wen sequence** — the received ordering of the 64 hexagrams, used
  here as the space the canon walks.
- **Guqin** tuning and the **Chinese pentatonic** (gong-diao, 宫商角徵羽 =
  gong / shang / jue / zhi / yu) that voices the six lines.
- arXiv **2605.20386**, *"Music of Changing Lines: Toward a Culturally Situated
  Approach to the I-Ching"* (May 2026) — the direct inspiration for mapping
  changing lines to musical motion.

## Determinism

No `Math.random`, no `Date.now`, no `new Date`. Every cast is driven by a seeded
`mulberry32` PRNG, seeded once from `performance.now()` at Start; the reverb
impulse response is likewise generated from a fixed PRNG seed. The piece is
headless-safe and reproducible. Audio routes voices → bus → dry + convolver
reverb → `DynamicsCompressor` → master gain (ceiling 0.14) → destination, and
`AudioContext.close()` runs on Stop and on unmount. Morph animations respect
`prefers-reduced-motion` (longer, linear settle; no pulsing marker).

## Cycle-2 deepening idea

Voice the six **line positions** with their classical meanings (ruler line, the
"correct/incorrect place" of a line) so that a changing line in the 5th (ruler)
place gets a longer, more prominent gesture than one in the 1st place; and let the
*nuclear hexagram* (the trigrams formed by lines 2–4 and 3–5) sound as a faint
inner drone under the chord — the hidden hexagram within the hexagram.
