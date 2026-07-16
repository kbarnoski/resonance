# 1792 · Replay

`state: Wake-Sleep sleep-phase memory replay · pole: dream`

## What it is

An audio-visual dream built **entirely from SVG DOM vector art** (no `<canvas>`,
no WebGL, no three.js). A single parameter **α ∈ [0,1]** runs 0→1 on a slow
auto-arc and trades cortical control between **bottom-up sensory inference**
(WAKE) and **top-down generative replay** (SLEEP). It self-runs with no input.

## The one question

> What if a psychedelic/dream visual weren't noise turned into geometry, but your
> own cortex closing the sensory gate and **replaying what it just saw** —
> recombined into dream-logic?

## The arc

1. **WAKE (α≈0, first ~14 s).** A sharp, legible "day scene": seven distinct
   luminous warm glyphs (orb, prism, star, crescent, hexagon, eye, rhombus), each
   at a stable position with a stable colour and shape — the veridical sensory
   input the cortex is "seeing." A short seeded **melodic motif** plays faithfully.
2. **α 0→1 rises** on a slow auto-arc (~52 s). The **sensory gate closes**: the
   veridical scene fades and a **top-down generative pathway** takes over. It
   replays the *exact same* glyphs — via SVG `<use>` duplication — but recombined:
   fragmented, superimposed, drifting, scaled/rotated wrong, two glyphs condensing
   into one at shared attractors, melted by an α-driven SVG filter graph. By α≈1
   it is a full dream-recombination of its own memory, still visibly made out of
   the day's elements (same seed, same palette, same source shapes).
3. The **motif is replayed the same way**: fragments in the wrong order,
   pitch-shifted (octaves & a fifth), time-stretched, overlapping loops — a warm
   pad under warm plucks, wet with a code-synthesised void reverb. Cross-modal
   memory replay, calm and dream-pole (never harsh).
4. A **WAKE ↔ SLEEP α meter** is always visible so cause→effect is legible. After
   α≈1 the arc gently **returns** toward 0 and loops — never a dead end.

## The SVG-substrate thesis

This leg is deliberately the anti-canvas substrate. The day-scene forms are real
`<g>`/`<path>`/`<polygon>`/`<circle>` elements defined once in `<defs>`. The dream
is those **same elements** recombined via `<use href="#…">` + SVG transforms
(translate/rotate/scale) + opacity, all riding through an **SVG filter graph**:

- `feTurbulence` → `feDisplacementMap` whose `scale` rises with α (the field melts),
- `feColorMatrix` `hueRotate` (slow ~0.06 Hz hue drift),
- `feGaussianBlur` (the top-down softening).

A **single `requestAnimationFrame` loop** mutates attributes / filter parameters
each frame; the DOM subtree is built once, never rebuilt. This leans into what SVG
does that canvas cannot: resolution-independent crisp vector line-art plus a
declarative, animatable filter pipeline.

## Determinism / headless

Fixed-seed `mulberry32` (seed `0x1792`) for all layout, recombination and audio
choices; the arc and all motion are driven by an **integer frame counter** (60fps
assumption). No `Math.random`, `Date.now`, `new Date`, or `performance.now` in any
state/audio/visual path. `AudioContext.currentTime` is used only for Web-Audio
envelope timing. The piece animates fully with no user input.

## Safety

No strobe, no flicker in the 8–12 Hz alpha band. All luminance change is slow
drift (turbulence breathing < 0.15 Hz, hue drift ~0.06 Hz). Peak fills stay warm
and below pure white over a near-black ground. The dream intensity comes from
recombination density + blur, never from flashing. `prefersReducedMotion()` is
honored: motion is slowed (0.6×) and the melt/blur are damped.

## References

- **Bredenberg C, et al.** "Modeling the hallucinatory effects of classical
  psychedelics in terms of replay-dependent plasticity mechanisms." *eLife*
  2026;14:RP105968. — the α∈[0,1] basal/apical Wake-Sleep mapping onto cortex;
  α→1 = sleep-phase, top-down generative replay of learned memory.
- **Hinton GE, Dayan P, Frey BJ, Neal RM.** "The wake-sleep algorithm for
  unsupervised neural networks." *Science* 1995;268(5214):1158–1161.
- **Carhart-Harris RL, Friston KJ.** "REBUS and the Anarchic Brain: Toward a
  Unified Model of the Brain Action of Psychedelics." *Pharmacol Rev*
  2019;71(3):316–344. — contrasted: relaxed priors vs. active generative replay.

## Honest limitations

- The "memory" is a designed, fixed day scene, not learned online — the replay is
  a hand-authored recombination that *evokes* replay-dependent plasticity, not a
  trained wake-sleep network.
- Determinism assumes ~60fps; on a slower display the wall-clock pace of the arc
  stretches (the sequence itself stays identical since it is frame-indexed).
- `feDisplacementMap` melt cost scales with the number of `<use>` fragments (28
  here) and filter region; it is tuned for a smooth mid-range laptop.
- The optional soft input (mic-stillness / tilt) was intentionally omitted to keep
  a clean, permission-free, self-demoing review.

## Files

- `page.tsx` — the client component: SVG scene, the single rAF mutation loop, UI.
- `scene.ts` — PRNG, the day-scene layout, the dream-recombination instances, the
  α arc.
- `audio.ts` — Web Audio: pad + faithful motif + recombined replay voices.
