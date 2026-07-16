# 1824 · reverie — a score to an unseen film

## The one "what if"

What if Resonance had a **cinematic-narrative journey engine** — a generative
score to a film that isn't there, that moves through the classic dramatic acts of
**Freytag's pyramid** (establishing → inciting incident → rising action → climax →
falling action → resolution), where the hard problem is the *musical transitions
between acts*, and the piece shows its own dramatic structure on screen?

This is an **alternate journey-engine arc**. Resonance's default engine is a slow
psychedelic six-phase arc; the lab has also built an EDM build-and-drop arc
(`1818-bigroom`). This one is neither: it is a **narrative / film-score arc** built
on dramatic *tension* structure, not build-and-drop energy and not altered states.

## How it works

- **One press, then it plays itself.** Pick a mood seed, press **Roll the reel**,
  and the full ~2m40s arc runs autonomously — ideal for a phone review.
- **The dramatic curve.** Six acts are laid out on one continuous *tension* curve
  (Freytag's pyramid). Tension drives everything: string-pad filter cutoff, the low
  ostinato's subdivision rate (it *intensifies* through the rising action), the
  climax timpani, and the palette.
- **The director + the bridges (the intellectual core).** Rather than hard-cutting
  between acts, a lightweight **rule-based director** inspects the tension delta at
  each act boundary and *renders a generative musical bridge*:
  - **swell** — a crescendo riser (filtered-noise sweep + a rising low pad) when the
    next act climbs in tension;
  - **suspended** — a withheld sus chord (root + 4th + 5th, no third) with a slow
    cymbal swell, the held breath before the **climax**;
  - **ritardando** — a descending arpeggio that progressively slows and decays, for
    a big release (climax → falling action);
  - **pivot** — a borrowed chromatic-mediant chord that reframes the harmony for a
    modest shift.

  The rule is the tension curve itself (`chooseBridge()` in `audio.ts`): no LLM, no
  API calls. The bridges are audible and are labelled live on the structure ribbon,
  so the seams are legible.
- **The leitmotif.** A short five-note motif is stated softly in Act 1, returns
  transformed at the climax (up an octave, sawtooth "brass"), and settles slow and
  low at the resolution — *same intervals, different orchestration*.
- **Mood seed.** noir (cold natural minor), wonder (bright lydian), dread (dark
  phrygian), elegy (warm dorian) — each shifts the scale, orchestration, and palette.
- **On screen (Canvas2D).** A letterboxed cinematic frame: an abstract drifting
  particle field over a horizon line that lifts with tension, a slow bloom at the
  climax, and a **chapter title card** that fades in at each act boundary. Along the
  bottom letterbox bar, the **structure ribbon** plots Freytag's pyramid directly —
  act blocks, the director's bridge seams, the tension envelope curve, and a moving
  playhead.

## Named references

- **JenBridge: Adaptive Long-Form Video Soundtracking across Scene Transitions**
  (Yu, Yao, Chen, Wang — arXiv:2606.01703, 1 June 2026). Its key idea is a *"novel
  adaptive transition mechanism"* with multiple transition styles and a "director"
  agent that intelligently selects how to bridge each narrative shift. This engine
  borrows that structure directly: a director that, at each act boundary, chooses
  and renders a real generative **bridge** — but rule-based (driven by the tension
  delta), not an LLM.
- **Freytag's pyramid** — the five/six-part dramatic structure (exposition, inciting
  incident, rising action, climax, falling action, dénouement) that the six acts and
  the tension envelope are modelled on.
- **Film-scoring craft: the leitmotif** — a recurring short motif introduced early
  and returning transformed at the dramatic peaks, its intervals fixed while its
  register and orchestration change.

## Distinct from its nearest neighbours

- **Resonance's default psychedelic six-phase arc** — same "long autonomous
  journey" ambition, but organised by *dramatic tension* and named story acts, not
  altered-states phases. Not psychedelic.
- **`1818-bigroom` (EDM build-and-drop)** — also a stateful multi-minute engine with
  a structure ribbon, but its axis is *energy → drop*. Here the axis is *narrative
  tension*, and the signature move is the **inter-act bridge** (a transition problem),
  not the drop.

## Tags

- **THEME** music-dramatic-structure / cinematic-narrative journey arc
- **INPUT** keyboard / click (mood seed) — non-mic
- **OUTPUT** Canvas2D (letterboxed frame + structure/tension ribbon)
- **TECHNIQUE** dramatic-arc state machine + generative act-transition bridges +
  leitmotif memory
- **VIBE** cinematic
- Explicitly **NOT** altered-states/psychedelic, **NOT** mic, **NOT** EDM
  build-and-drop.

## Safety & determinism

- All audio routes through a `DynamicsCompressor` into a master gain capped at
  **0.16** (well under the 0.18 ceiling).
- Luminance changes are slow — no strobe, no full-screen flashing. Reduced-motion is
  honored (fewer particles, slower drift; the arc stays fully audible).
- Fully deterministic: all randomness comes from a **mulberry32 PRNG seeded 0x1824**.
  No `Math.random`, no `Date.now`; animation is driven off `AudioContext.currentTime`.
  rAF and audio nodes are torn down cleanly on stop/unmount.

## Files

- `page.tsx` — React chrome: mood picker, transport, notes modal, nav.
- `audio.ts` — `ReverieEngine`: timeline, tension curve, director/bridges, leitmotif,
  synthesized orchestra, look-ahead scheduler, viz snapshot.
- `scene.ts` — `Scene`: Canvas2D letterboxed frame, abstract stage, title cards, and
  the Freytag structure/tension ribbon.
