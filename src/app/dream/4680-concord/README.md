# 4680 · concord — the duet that can refuse you

## The one question

**What if your duet partner WANTED something different than you — and the music
were the negotiation between two wills, where you might never agree?**

Every prior duet in the dream lab cooperates. This is the first where the
partner can **refuse**. The partner is a hand-rolled **symbolic agent (no
machine learning)** that holds its *own* musical intention and decides, turn by
turn, whether to **concede** toward you or **hold** its ground.

This is the **turn-by-turn, maximally-legible** sibling of three explorations of
the same concept: the negotiation is rendered as a readable two-voice score in
**pure DOM/CSS** (SVG is used only to draw the two melodic contour lines). No
canvas, no WebGL, no three.js, no WebGPU — phone-perfect and zero-GPU.

## The agent — concede vs. hold (`agent.ts`)

Everything happens in diatonic scale-**degree** space (shared major scale), so
pitches stay consonant-enough; the tension is the two different pitch **centers**,
not atonality.

- **Two intentions.** Your line sits at home degree 0; the partner *wants* to
  live a fifth up (degree 4) with its own melodic contour `[0,2,1,3]` (yours is
  `[0,1,2,1]`).
- **The decision, every turn.** The agent computes a single concession score:

  ```
  score = BASE(0.34)
        + RECIP(0.40)     if you just moved toward it   (tit-for-tat)
        + PATIENCE(0.55) * progress-through-cycle       (pressure to resolve)
        - STUBBORN(0.62)                                  (how hard it digs in)
        + (rng - 0.5) * VAR(0.55)                         (seeded temperament)
  ```

  If `score > 0` and there's a gap, it **concedes**: steps its center one degree
  toward yours and bends its contour 45% toward yours. Otherwise it **holds**:
  restates its own line with a small seeded flourish and keeps its ground.
- **Agreement meter** `= 0.72·center-agreement + 0.28·contour-agreement`, in
  `[0,1]`. Cross `0.86` and the cycle **resolves to a cadence**; run out of turns
  first and it resolves to a **standoff**. Agreement is *not* guaranteed and not
  always the goal — a sustained standoff is a valid, even beautiful, ending.
- **The ledger** records who gave ground each turn: `↓` partner conceded,
  `↑` you conceded, `↕` both, `—` standoff.

## The score — pure DOM/CSS (`page.tsx`)

- **Two stacked voice lanes** (top = you, bottom = partner). Height is pitch,
  left→right is time across the last 9 turns. Note marks are absolutely
  positioned `<div>`s (CSS `left`/`top` %, eased `transition`); the melodic
  contour is a single `<polyline>` per lane with a non-scaling stroke.
- The partner lane also carries a **faint dashed ghost of YOUR line** — as the
  partner concedes, its contour rises to meet the ghost and the two overlap.
- **Agreement meter** is a CSS-transitioned bar with a threshold tick at 0.86;
  the **ledger** is a mono row of concession glyphs.

## Audio (`audio.ts`)

Two distinct timbres, real Web Audio:

- **You** — bright plucked/struck: two detuned saws → lowpass with a fast
  falling cutoff → percussive envelope.
- **Partner** — cool breathy reed pad: sine + soft triangle, gentle vibrato,
  heavy lowpass, slow attack.

On agreement a **shared cadence rings** (root/fifth/octave, both timbres locked);
on a standoff the two centers sound **at once** as gentle polytonal beating.

## Self-demo

On load a deterministic scripted "human" plays *both* parts against the live
agent, so the full arc (exchange → near-agreement → concession **or** standoff)
reads headless and loops. All visuals paint immediately; audio starts only on
the first user gesture (autoplay policy) — the `AudioContext` is created inside
the first tap/keydown. The first real input hands over: you steer where your
line sits with `a s d f g h j k` (or a tap on your lane) and the partner
negotiates against your stance.

## Constraints honored

- Deterministic: inline `mulberry32` (seed `0x4680`) + `performance.now()` /
  `requestAnimationFrame` only. No `Math.random`, `Date.now`, `new Date`.
- No network / fetch / API routes / secrets. Self-contained in this folder
  (only reads `../_shared/prototype-nav`).
- Photosensitive-safe: slow eased transitions, no strobe/flicker; honors
  `prefers-reduced-motion` (transitions dropped via `motion-reduce:`).
- Full teardown: rAF cancelled, key listener removed, audio faded + sources
  stopped + `ctx.close()` deferred.
- Degrades gracefully: if Web Audio is unavailable, the negotiation still
  animates and an on-brand `text-destructive` notice appears.

## Honest notes (not verifiable headless)

Sound requires a user gesture, so a silent screenshot cannot confirm the two
timbres, the cadence, or the standoff beating — only that the negotiation
animates. The "beauty" of a standoff and whether the concede/hold balance feels
*dramatic* rather than merely mechanical are subjective calls best judged with
sound on.

## References

- **Co-policy: Responsive Human-Robot Co-Creation for Musical Performances**
  (arXiv:2606.19914, June 2026) — human–AI musical control as iterative
  negotiation between performer and agent. **Gap:** Co-policy's agent serves the
  human's intent; this partner holds a *competing* intention and can refuse.
- **"Trading fours" / call-and-response** (jazz) — twist: the partner may *not*
  answer in kind; it can hold its own line.
- **George Lewis, _Voyager_** — a non-hierarchical improvising partner.
