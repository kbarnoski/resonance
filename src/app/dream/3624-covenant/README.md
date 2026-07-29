# 3624 · Covenant

**The one question:** *What if your musical accompanist only commits to you when
you play with intention — a partner whose trust you have to earn, not a
fail-buzzer you avoid?*

You play a melody on your computer keyboard (used as a piano). An anticipatory
heuristic accompanist listens and answers with harmony — but **how much it gives
back is gated by a confidence state it maintains about you.** Play with
coherence and it commits: a lone drone thickens into a fifth, a triad, a voiced
seventh, and finally a moving bassline with rhythmic comping. Wander or fall
silent and it retreats to the cautious drone. The richer partner is *earned*.

## Keyboard

- White keys: `A S D F G H J K` = C D E F G A B C
- Black keys: `W E T Y U` = C# D# F# G# A#
- `Z` / `X` = octave down / up
- `Start` unlocks the AudioContext (browsers require a user gesture). Before you
  touch a key, a **seeded autopilot** plays for you so a reviewer with no
  interaction still hears the accompanist earn its way up and back down. Your
  first keypress hands control over.

## How the confidence / anticipation heuristic works

The accompanist keeps a small model of your **last eight notes** and derives a
`confidence` scalar in `[0,1]`:

1. **Diatonic fit** — it infers your key with a Krumhansl-Schmuckler-style tonal
   weight profile (best-correlating tonic + major/minor mode over the recent
   pitch-class histogram) and measures what fraction of your notes fit that
   scale.
2. **Rhythmic steadiness** — the coefficient of variation of your inter-onset
   intervals. Steady pulse → high; ragged → low.
3. **Contour coherence** — rewards stepwise / small melodic motion, punishes a
   random-leap walk.

`target = 0.4·diatonic + 0.35·rhythm + 0.25·contour`, and confidence eases
toward that target on every note. Silence and wandering **decay** it (faster the
longer you stay quiet).

**Confidence gates commitment** in five tiers:

| tier | confidence | what the accompanist gives |
|------|-----------|----------------------------|
| 0 | `< 0.20` | withholding — a single cautious root drone (the "safe output") |
| 1 | `< 0.42` | offering a fifth |
| 2 | `< 0.62` | full triad |
| 3 | `< 0.80` | voiced — adds the 7th |
| 4 | `≥ 0.80` | comping — moving bassline + rhythmic stabs on a beat clock |

**Anticipation.** After each note the accompanist *bets* on your likely next
chord using the inferred key and a tiny functional-harmony automaton
(I→{IV,V,vi}, V→I, IV→{V,I}, …). The bet is pre-voiced as a faint **ghost note**
by the accompanist's presence. If your next note confirms the bet, confidence
jumps ("read you right") and the ghost solidifies; if you defy it, confidence
dips and it re-keys.

## Visualization (inline SVG / DOM, no canvas)

Two soft glowing violet presences — you (left) and the accompanist (right) —
joined by a **filament bond**. Its number of woven strands, thickness, and
brightness scale with confidence: one thin dim thread when it withholds, a thick
braid when it fully commits. Your notes ripple outward from you; the
accompanist's chord tones bloom from it; the anticipation bet appears as a ghost
note that flashes when you confirm it. A readout shows confidence %, the current
key, and the commitment tier. All art color is raw HSL in the violet range
(hue ~266–288), animated with `requestAnimationFrame`; the SVG elements are
mutated imperatively via refs for smoothness while the text readout updates on a
throttle.

## Named references

- **arXiv:2511.17879** — *"Generative Adversarial Post-Training Mitigates Reward
  Hacking in Live Human-AI Music Interaction"* (May 2026). The insight this
  prototype builds on: an accompanist's characteristic failure is *retreating to
  a cautious safe output*. Here that retreat is not a bug to hide — it is the
  legible substance. Commit-vs-withhold is the whole interface.
- **ReaLchords — arXiv:2506.14723** — online melody→chord accompaniment that
  learns *anticipation and adaptation*. This prototype implements the *social
  substrate* of that idea by hand.

## What is real vs. faked

- **Real:** live Web Audio synthesis (ADSR sine/triangle voices, sustained chord
  voicing, a beat-clock comping layer), the key inference, the confidence math,
  the tiered commitment, the anticipation bet, and the reactive SVG — all
  running client-side, deterministically seeded.
- **Faked / hand-rolled:** there is **no ML and no server**. ReaLchords is a
  learned model; here the "learning" is heuristic music theory. The key profiles
  are fixed tables, the harmonic automaton is a hand-written lookup, and the
  "adaptation" is just re-inference over the sliding note window. No external API
  is called; nothing leaves the browser.
- **Determinism:** the self-demo uses a `mulberry32` PRNG seeded `0x3624` and
  `performance.now()` for timing — never `Math.random()` or `Date.now()` — so a
  headless reviewer sees the same performance every load.

## What a next cycle would deepen

- Replace the fixed key profiles + automaton with an actually-trained tiny
  online model (the ReaLchords direction) while keeping the confidence gate as
  the honest, legible control surface.
- Voice-leading between chords instead of independent re-voicing (smoother
  commitment transitions, fewer audible chord "cuts").
- Let the accompanist express *doubt* melodically — hesitant, sparse answers at
  mid-confidence rather than a purely additive tier stack.
- Sustain-based note-off so held keys shape phrasing and the rhythm metric can
  read articulation, not just onsets.
