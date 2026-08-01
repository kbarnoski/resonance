# 4472 · Reef — an irreversible garden you can only add to

**The one question:** what if planting were permanent — if a branching organism
grew from every seed you dropped, rang a note at every birth, and could *never*
be pruned — so that a wisely-spaced garden stayed luminous and consonant while a
greedy, overcrowded one audibly and visibly choked, and you had to live with
what you made?

Press **Start sound** (earbuds help). A movable reticle sits over a dark field.
Move it with the **arrow keys / WASD** and press **Space** to plant a seed. Each
seed sprouts an organism that grows by *space colonization* — branch tips reach
toward a local cloud of attractor points and fork where the pull divides. Every
new branch node **rings a note**. Space your seeds out and the garden stays
bright violet and the notes land on clean just intervals; crowd them and the
branches gray out, the notes sour and shorten, and the whole sound-bed chokes.
There is no delete and no undo. Restraint is the only tool you have.

## What it is

- **INPUT** — keyboard-primary. `← ↑ → ↓` / `WASD` move the planting reticle,
  `Space` plants, `1–5` / `[` `]` pick a species (seed-cloud size / greed),
  `R` starts a fresh empty garden. Tapping the field plants too, as a secondary
  convenience.
- **OUTPUT** — inline **SVG** DOM: branches as `<path>` segments bucketed by
  local crowding (luminous violet → gray), a bright leading-tip path, faint
  attractor dots (the space still to colonise), haloed permanent seeds, and the
  reticle. Redrawn by direct attribute writes in the rAF loop.
- **AUDIO** — a small poly, voice-capped Web-Audio synth: a warm bell/pluck per
  branch birth over a biomass-tracking drone, all through a chokedness-driven
  master lowpass + a beating detuned drone + an airy bleach of noise, into a
  `DynamicsCompressor` limiter at master 0.25.
- **TECHNIQUE** — Space Colonization Algorithm (Runions et al.) **plus a
  consequence engine**: local density at each birth deterministically maps to a
  harmonic + visual penalty.
- **VIBE** — slow, contemplative, long-form; a piece about restraint.

## How the growth works (space colonization)

`growth.ts` implements the algorithm honestly:

1. Each **attractor** finds its nearest **node** within `attractionRadius` and
   adds a unit pull toward itself.
2. Every influenced node steps `segmentLength` along the **average** of its
   pulls (plus a little seeded jitter) and spawns a child. Bifurcation emerges
   wherever a node is tugged in divergent directions.
3. Attractors within `killRadius` of any node are **consumed**.

Planting a seed drops one root node **and** scatters a local disc of attractors
around it. Nodes are **never deleted** (irreversibility) up to a hard
`maxNodes` cap, at which the garden simply holds — so geometry is persistent,
accumulating memory: minute five ≠ minute one.

## The consequence engine (the part that is actually new)

Each birth measures the **local node density** it was born into (via a coarse
spatial grid, so it stays O(1) as the tree reaches thousands of nodes), normalised
to a `crowd ∈ [0,1]`:

- **Pitch** — branch **angle** selects one of five just major-pentatonic degrees
  (`C · D(9/8) · E(5/4) · G(3/2) · A(5/3)` from C3), branch **depth** selects the
  octave. A sparse garden therefore lands on clean just intervals and rings a
  slowly-evolving chord.
- **Detune** — a crowded birth is pushed up to **±58 cents** sour.
- **Dulling** — brightness `= 1 − 0.82·crowd` shortens the note (0.5–2.2 s
  decay) and closes its per-voice lowpass and partial.
- **Global bleach** — a smoothed **chokedness** (EMA of recent crowding) closes
  the master lowpass (6.2 kHz → 0.8 kHz), opens a slightly-sharp drone that
  *beats* against the true root, and raises a band-passed noise bed. Colour
  desaturates from violet to gray in lock-step.

So greed is not merely scored — it is **heard and seen** across the whole garden
at once. A luminous chord becomes muddy beating noise; you cannot take it back.

## Determinism & safety

Everything random comes from `mulberry32(0x4472)` — never `Math.random`,
`Date.now`, or argless `new Date`; elapsed time uses `performance.now()`. On load
a seeded auto-gardener plants a few well-spaced, consonant seeds hands-free so a
cold reviewer sees and hears the piece immediately; the first real keypress hands
over control. Growth is slow and continuous (one step ≈ every 55 ms) — no strobe,
no flashing; photosensitive-safe. AudioContext is created only inside the Start
gesture and fully torn down on unmount (rAF cancelled, oscillators stopped,
`ctx.close()`, listeners removed). No mic, camera, WebGL, network, or secrets.

## References

- **Adam Runions, Brendan Lane, Przemysław Prusinkiewicz**, *"Modeling Trees with
  a Space Colonization Algorithm"* (Eurographics Workshop on Natural Phenomena,
  2007); and **Runions et al.**, *"Modeling and visualization of leaf venation
  patterns"* (ACM SIGGRAPH, 2005) — the growth algorithm.
- **Research anchor (2026):** *"Artificial morphogenesis of curved surface
  structures inspired by differential growth in biology,"* J. R. Soc. Interface
  **23(239)**, 2026 (rsif.2025.1094) — the current morphogenesis frontier of
  grown, differential-growth form.
- **Andy Lomas** (developmental morphogenetic art) and **Nervous System / Jessica
  Rosenkrantz** — the AV-art lineage of *grown* rather than *drawn* structure.
- Just intonation / the small-integer-ratio account of consonance (Pythagorean).

## Honest novelty note

Broad *generative growth* is well represented in the lab, and **space
colonization specifically is not new here** — a grep turns up at least
`3080-mycelium`, `1050-mycelial-grow`, `322-kids-voice-garden`, and
`1490-slow-cathedral`, all of which implement the same Runions algorithm and cite
it. This piece does **not** claim the growth technique as novel.

What is not otherwise present is the **irreversibility + crowding-penalty
coupling**: a garden framed as a one-way commitment (add only, never prune) whose
*local density* deterministically detunes, dulls, and bleaches both the sound and
the image — a consequence/restraint mechanic rather than a bloom-and-fade
visualiser. That coupling, and the keyboard-primary planting-reticle input, are
the intended contributions.

## Limits / next

Not ear-verified from the headless build box: whether the sparse→choked audio
transition reads as clearly *by ear* as it does by eye wants real speakers. The
node cap holds rather than recycles (correct for irreversibility, but a very long
session with many briar seeds will fill and freeze growth). Next-cycle deepening:
subtree-weight branch thickening (Murray's law, per the venation paper) so trunks
read as load-bearing; a per-seed "age" hue so old growth reads as elder wood; and
voice-leading so successive births resolve as progressions rather than isolated
tones.

*No API route, no network, no secrets — pure client Web Audio + SVG.*
