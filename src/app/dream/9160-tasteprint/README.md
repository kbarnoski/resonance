# 9160 · tasteprint

**The one question:** *What if an instrument LEARNED your musical taste from a
single Keep/Pass bit — and then REMEMBERED you across visits, greeting you back
with a legible portrait of your own ear?*

A spiritual successor to the lab's `8488-secondear` (which it does **not** import
or touch). The machine proposes a short phrase; you give exactly one bit
(Keep / Pass). From that stream it builds an online preference model of *your*
ear and composes toward it. tasteprint adds the two things secondear lacks:

1. **Cross-session persistence** — it serializes your taste model to
   `localStorage` and greets you back knowing your leanings.
2. **A legible self-portrait** rendered in **inline SVG** (secondear used
   Canvas2D, banned this cycle).

## How the model works

Each proposed phrase is grown from a small latent of style knobs (register,
density, syncopation, step-size, contour, dissonance) into 8–16 notes on an
eighth-note grid, played as a clean 2-op FM / mallet voice in strict 12-TET
(`440·2^((m−69)/12)`), note-gated, no drone bed → master gain `0.18` →
`DynamicsCompressor` → destination.

Every realized phrase is read into an **8-D feature vector** (register, range,
density, syncopation, contour ratio, mean interval, dissonance/interval-class,
leaps), each normalized to ~[0,1]. The taste model is a plain **online logistic
regression** over that vector, updated one bit at a time by the perceptron-style
rule `w += lr·(y − p)·x` (see `taste.ts`). No ML library, no physics, no genetic
crossover: each round generates a **seeded batch of ~24 diverse candidates**,
scores each by the model logit, and proposes the single top-scoring one — so
proposals drift toward your ear by *selection pressure* alone. (This deliberately
inverts the crossover-breeding lineage of interactive evolution.)

**Knows-your-ear meter:** before you decide, the model predicts Keep/Pass; the
gauge shows its running windowed accuracy climbing — visible proof it is learning
you.

## How persistence works

The weight vector, bias, running mean of *kept* phrases, keep/pass counts and a
session counter are serialized to `localStorage` under the versioned key
`resonance.dream.9160.taste.v1`, saved after every bit. On mount, a saved model
is restored, the session counter bumped, and a **"Welcome back — you lean toward
{top-2 leanings}"** line is shown with the portrait pre-filled. A visible **Reset**
clears the key. Private-mode / blocked storage is caught and the piece runs
without persistence, noting it in `text-destructive`.

## How the portrait works (the headline addition)

An inline-SVG **8-axis radar** draws the current learned "ideal ear" (one axis per
feature; the polygon = a blend of the weight direction and the running kept-mean),
morphing smoothly as weights update. Beside it, a **taste-space scatter**
(density × register) plots recent phrase-glyphs: kept = ember and solid, passed =
faded and hollow, with the learned centroid ringed in ember. Each SVG paints its
own parchment background so the art reads consistently in either page theme, and
on a muted phone the filling polygon + climbing gauge are self-evidently "it's
learning me."

## Seeded self-demo

For a brand-new visitor, a `mulberry32(0x9160)`-seeded synthetic listener with a
**hidden taste** (likes dense + syncopated + high) runs the propose → keep/pass →
learn loop with no clicks and no audio, so the portrait fills and the accuracy
meter climbs within ~1s. The instant a real Keep/Pass (or Enable-sound) arrives,
it hands over to the human. The demo drives a **separate model** and can never
pollute your saved human taste. A *returning* visitor skips the demo entirely and
sees their own restored portrait immediately.

## Tags

- **INPUT** = keyboard (K = Keep · J / P = Pass · Space = next/skip · R = reset),
  plus equal-size ≥44px on-screen buttons as a tap fallback.
- **OUTPUT** = inline SVG only (`circle` / `polygon` / `path` / `line` / `text`).
  No Canvas2D, no WebGL/WebGPU, no three.js.
- **CORE TECHNIQUE** = online personal-preference learning (logistic-regression
  preference vector, `w += lr·(y − p)·x`) + a persistent taste model
  (localStorage, versioned key, greet-back).
- **VIBE** = warm bone/parchment + ink + a single ember accent for "kept". Raw
  hex lives only inside the SVG art layer; all chrome uses semantic tokens.

## References

- Dawkins' *Biomorphs* and Karl Sims' interactive evolution — the aesthetic-
  selection lineage this piece **inverts** (selection pressure, no crossover).
- *TuneJury* — human pairwise-preference evaluation of generated music.
- Queen Mary 2026 music-preference benchmark.
- "Aligning Generative Music AI with Human Preferences" (arXiv:2511.15038).

## Honest weaknesses

- Eight hand-designed features are a coarse basis; two ears with genuinely
  different tastes can collapse onto the same portrait, and anything the features
  don't measure (timbre nuance, phrasing, harmony) is invisible to the model.
- Logistic regression is linear in feature space — it can't capture "I like dense
  *unless* it's also high," only monotone per-axis leanings.
- Top-logit selection with L2 decay can settle into a narrow comfort zone; there
  is no explicit novelty/exploration term, so long sessions may feel samey.
- The radar polygon blends weights with the kept-mean for stability, so it reads
  as a leaning *portrait*, not a literal decision boundary.
- Persistence is per-browser and unsynced; clearing site data forgets your ear.
- Judging with sound disabled means rating phrases from the glyph alone, which is
  a weaker signal than actually hearing them.
