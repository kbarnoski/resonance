# 8488 · Second Ear

## What it is

A gallery prototype where the machine is the **second taste in the room**: a
co-composer that never asks you to tune a single parameter. It **proposes** a
short 2-bar melodic phrase; you give exactly **one bit** — **Keep** or **Pass** —
and from that stream of bits it silently builds a live model of *your* musical
ear and composes toward it. Over a couple of minutes its proposals audibly
converge on what you keep.

## The one question

> **What if the machine were the second taste in the room — a co-composer that
> never asks you to tune anything, only to KEEP or PASS the phrases it proposes,
> and from that one bit of feedback silently infers YOUR ear and composes toward
> it?**

This is **aesthetic selection, inverted**. In classic interactive evolution
(Dawkins' Biomorphs, Karl Sims) the human hand-picks parents and the machine
executes crossover. Here it flips: the machine proposes and builds a model of the
*human's* taste, then biases its next proposals toward that inferred ear.

## How the taste model works (no ML library — pure TypeScript)

1. **Genome → sound.** Each phrase is grown from a small latent of style knobs
   (register, density, syncopation, step size, contour, dissonance) into notes on
   an eighth-note grid, played as a clean 2-op FM / mallet voice in strict
   **12-TET** (`440·2^((m−69)/12)`), no drone bed. (`compose.ts`, `audio.ts`)
2. **Feature vector.** Every realized phrase is read into an **8-D feature
   vector**: register, range, density, syncopation, contour (up:down), mean
   interval, dissonance (interval-class), and leaps. (`taste.ts`)
3. **Online preference model.** A plain **online logistic regression** holds a
   preference-weight vector, updated one keep(+1)/pass(0) bit at a time by the
   perceptron-style rule `w += lr·(y − p)·x`. No libraries, no tensors.
4. **Propose the top of your ear.** Each round it generates a **seeded batch of
   ~24 diverse candidates**, scores every one by the model's logit, and proposes
   the **single top-scoring** candidate — so proposals drift toward your taste.
5. **Knows-your-ear meter.** *Before* you decide, the model predicts whether
   you'll keep it; the running (windowed) accuracy of that prediction is shown
   climbing — the visible payoff that it's learning you.
6. **Bold move.** Every few keeps it composes a longer **4-bar** passage sampled
   purely from the top of your inferred taste and asks **"Is this you?"** — a
   small Turing moment.
7. **Seeded self-demo.** On load, a `mulberry32`-seeded **synthetic listener**
   with a *hidden* taste (it likes dense, syncopated, high phrases) runs the
   propose → keep/pass → learn loop with no clicks and no audio, so the map is
   alive and the meter climbs within a few seconds. The instant you make a real
   Keep/Pass it hands over to you.

## The visual

A **taste-space map**, not a dot-cloud: a 2-D **rhythmic-density × register**
plane. A soft **inferred taste field** (the model's predicted keep-probability
sliced through the running feature mean) fills the plane; each phrase is a
labeled **glyph** at its feature coordinates — **kept** phrases anchor and glow
in amber, **passed** ones fade; a thin **drift trail** shows proposals migrating
toward the taste region; the current proposal is a highlighted crosshair. Warm
**graphite-ink + amber-ledger** palette, deliberately off the lab's violet
default. Canvas-2D as diagram (`draw.ts`).

## Controls

`K` = Keep · `J` or `P` = Pass · `Space` = next. Equal-size ≥44 px tap buttons
are the fallback. Audio starts only on a real gesture; the self-demo needs no
permission.

## References

- **TuneJury — "Improving Text-to-Music Generation with Human Preference
  Rewards"** (arXiv:2606.21670, June 2026): a learned *pairwise* preference
  ranker used at inference to *select* which generated samples to keep. Second
  Ear runs the same mechanism **live, per-player, in seconds**, with no ML lib.
- **Interactive evolutionary computation / aesthetic selection (inverted)** —
  Dawkins' Biomorphs, Karl Sims' evolved images.
- **"The Shape of Surprise: Structured Uncertainty and Co-Creativity in AI Music
  Tools"** (arXiv:2509.25028).

## Honest self-assessment (what's rough)

- The taste model is an 8-D **linear** logistic model. It captures monotone
  preferences (higher/denser/more-syncopated) well, but cannot represent a
  "sweet-spot" taste (likes *medium* density, dislikes both extremes) — that's a
  non-linear boundary a linear model can't draw. The synthetic listener's ideal
  is deliberately mostly-monotone so convergence reads clearly.
- The **taste field** is a 2-D slice through the running feature mean, so the
  other six dimensions are held fixed while you read the plane; it's an honest
  projection, not the full 8-D story.
- **Convergence** is measured as windowed *prediction* accuracy (last 16 bits).
  Because the synthetic keeps stochastically, accuracy realistically caps below
  100% — good, but it makes the meter jiggle a little.
- The FM voice is intentionally plain; phrases are legible rather than lush.
- Candidate batches are re-seeded from one stream, so proposal diversity is
  bounded by the latent ranges in `compose.ts` — a wider generator would give
  the model more room to surprise you.
