# 1396 · Apophenia Field

**The one question:** *What if the psychedelic act of finding meaning in noise
were an instrument — where your directed ATTENTION crystallizes latent pattern
out of a field of pure noise, and sounds it?*

This stages **apophenia** — the mind's seeing of structure in randomness, the
core cognition of the hypnagogic/psychedelic state under the REBUS /
predictive-processing model (relaxed priors → the brain's generative model finds
pattern everywhere). There is **no pre-authored constellation.** The field is
pure seeded noise; every sign you hear was co-authored the moment you looked.

## How to play

- **Aim your attention** with the pointer or a touch-drag, or with the keyboard:
  the home-row keys `A S D F G H J K L ;` sweep the locus across the field (each
  press also steps it down a vertical band), the **arrow keys** nudge it, and
  it works with no pointer at all.
- **Dwell** (~0.65 s) near a cluster of points. The ring around your locus fills
  only when real latent geometry is present; when it completes the points snap
  bright, **link** into a constellation, and **ring** a just-intonation chord.
- Press **space** to recognize immediately; press **X** (or Backspace) to let go
  of the oldest sign. Signs also fade on their own after ~20 s so they never
  pile up forever.
- **Leave it alone** for ~5 s and it hunts for you — recognizing a fresh sign
  every ~5–6 s so a cold visitor sees + hears the concept at a glance. It stops
  the instant you take over.

## The four+ subsystems

1. **The noise field** (`field.ts`) — ~190 faint points on a jittered grid,
   each drifting on slow independent sines and twinkling on a slow luminance
   drift (never a strobe). Seeded with `mulberry32` — identical every run, no
   `Math.random` / `Date.now`.
2. **The latent-pattern detector** (`field.ts`, `detectSign`) — a generous
   search over the ~12 nearest points for near-collinearity of ≥3 points, plus a
   local mirror-symmetry search. Tuned so that almost anywhere you dwell
   *something* is waiting — the self-fulfilling "it was always there" quality
   that IS the apophenia.
3. **JI sonification** (`field.ts` `makeSign` + `audio.ts`) — each sign's
   geometry becomes a 5-limit just-intonation chord: inter-point **spacing**
   picks intervals from a just major pentatonic (always consonant), the **number
   of points** sets the voicing thickness, and the constellation's **height**
   sets the register.
4. **The growing soundscape** (`audio.ts`) — a faint filtered-noise bed and a
   low just drone (shared `droneBank`) sit under a chord that grows as signs
   accumulate; each sign strikes (fast attack through the shared `convolutionVoid`
   reverb) then holds a sustained pad until it fades or is let go. Master ≤ 0.22,
   ramped from silence → `DynamicsCompressor` limiter → out; sustained voices
   capped at six pads (oldest stolen). AudioContext is gesture-gated in **Begin**
   and fully torn down on unmount.
5. **Idle self-demo + keyboard/pointer input** (`page.tsx`) — the animation loop
   that ties drift, dwell, recognition, fade, and the untouched auto-hunt
   together.

## Tags

- **input:** pointer + keyboard (not pointer-only)
- **output:** inline SVG line-art (deterministic + headless-verifiable — no
  Canvas2D / WebGL)
- **technique:** geometric pattern-detection → JI sonification
- **pole:** hypnagogic-cosmic

## References

- **Klaus Conrad**, who coined *Apophänie* (1958) for the unmotivated seeing of
  connectedness with a sense of abnormal meaningfulness.
- **Carl Sagan**, *The Demon-Haunted World* (1995) — faces and patterns in noise
  as a signature of a pattern-seeking mind.
- **Anil Seth**, *Being You* (2021) — "perception is a controlled hallucination",
  the brain's best guess projected onto the world.

## Honest caveat

Each sub-mechanic — drifting seeded points, geometric pattern detection, JI
chords — has distant lab prior art. The fresh axis is the **apophenia
interaction model**: attention as the instrument that crystallizes latent
pattern out of noise, with the meaning genuinely co-created rather than
pre-placed and merely revealed.

## Known gaps

- The detector favours collinear chains; mirror signs surface less often, so the
  *visual* vocabulary of constellations is line-dominated.
- Sign→chord voicing is deterministic but coarse (spacing quantized to pentatonic
  steps); very dense clusters can pick similar registers, so distinct signs
  sometimes sound close in pitch.
- Idle self-demo picks loci via a seeded stream, not by "most striking" pattern,
  so its choices are representative rather than curated.
