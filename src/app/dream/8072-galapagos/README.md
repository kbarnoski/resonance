# 8072 · galápagos — "Breed a living sound-organism"

**Route:** `/dream/8072-galapagos`
**Cycle:** 1053 (DEEP) · **Status:** demoable
**state:** artificial-life / interactive-evolution · **pole:** organic

## The question

_What if you could breed a melody the way Dawkins bred biomorphs — by picking the
offspring you like and letting them mate, generation after generation?_

## The verb (author, don't watch)

This is **aesthetic selection**, not parameter-tuning. You never touch a slider.
You **choose which creatures live and mate**, and selection over generations does
the composing:

- **Pick 1–2 organisms** as parents — press number keys **1–9** (or tap a cell).
  Two parents → sexual **crossover** (each gene inherited from either parent); one
  parent → an asexual clone.
- **Evolve** (**Space** / **Enter**, or the button) breeds a new generation of 9
  offspring = crossover + a small per-gene **mutation**.
- **Keep ★** (**k**) banks a favourite; its chip can start a fresh lineage.
- **New pool** reseeds the founding population; **⌫** clears your selection.

Over generations the grid — and the chord it plays — drifts toward whatever you
keep breeding for. The population you keep *is* the music you keep.

## One genome → both the picture and the sound

A genome is 10 genes in `[0,1]` (`genome.ts`). The **same** genome is read two ways:

- **`biomorph.ts` → the creature.** A recursive branching line-drawing in the
  spirit of Dawkins' Biomorphs: branch angle, depth (3–6), length falloff,
  2-or-3-way splits, curl (asymmetry), thickness, and a violet-ramp shade.
  Rendered as inline **SVG** — no canvas, no WebGL.
- **`audio.ts` → the voice.** A gentle two-operator **FM** tone: fundamental on a
  just-intonation scale (pitch gene), brightness from branch depth + curl,
  modulator ratio from the branch count (so it stays consonant), and an
  **ostinato** pulse from the rhythm gene. The whole grid breathes as a soft chord
  over a shared JI drone (`_shared/psych/droneBank`); selected organisms sing
  louder. The **same pulse envelope** drives each creature's visual breathing, so
  what you see and what you hear are the one thing.

Voice budget: 9 organisms × (carrier + modulator) = 18 oscillators + the drone
bed. Bounded and calm by design.

## Self-demo (muted-phone fitness)

Leave it idle ~4.5 s and a seeded `mulberry32(0x8072)` **auto-curator** picks
parents (they glow briefly) and breeds on a ~5 s loop, so a 06:30 phone glance
sees + hears it evolving with zero input. Any keypress or tap hands control back.
Everything is deterministic — no `Math.random` / `Date.now` / `new Date`; each
generation is bred by a generation-seeded PRNG and timing comes from
`performance.now` / `AudioContext.currentTime`.

## References

- Richard Dawkins, **Biomorphs**, *The Blind Watchmaker* (1986) — the original
  "breed a form by selecting offspring" interaction.
- Karl Sims, **"Artificial Evolution for Computer Graphics"** (SIGGRAPH 1991) and
  the **Galápagos** interactive-evolution installation (1997).
- Grown from the 2026 SIGGRAPH self-organizing-life line — *Neural Particle
  Automata* (arXiv:2601.16096) — reclaiming the verb that line under-uses: not
  watching a lifeform, but **breeding** one by taste.

## Honest state / what's rough

- The FM voice mapping is a musically-plausible projection, not a designed
  instrument — some genomes land on duller tones than others; that's part of the
  selection game, but a future pass could bias the mapping toward livelier timbres.
- Prior art in the lab: `71-shader-evolve` (cycle 89) evolves *shader uniforms* by
  mutation only, on one lineage. This is **not** a first-interactive-evolution
  claim — the delta is living organisms + **sexual crossover** + a **per-organism
  voice** + generational memory (the grid is a chord you cultivate).
- Next-cycle deepening: a "fossil record" you can replay to hear a lineage's sound
  drift; feed Karel's Path-piano grain as each creature's timbre so you breed *his*
  sound; a two-player version where two people breed a shared population (a natural
  multi-user forcing function).
- **Not runtime-verified here** (headless — no speakers/display): whether the
  breeding reads as legibly as intended and the chord balance across 9 FM voices on
  one phone speaker want a real device.
