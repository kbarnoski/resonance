**For**: kids (4+)

# Marble Bells — a Galton board that plays a chord

**What if a 4-year-old could drop a glowing marble into a peg field and watch
chance itself play music?** Marbles cascade through a triangular peg lattice,
bounce left or right at every row, and land in one of nine tuned bins. Each
landing rings that bin's warm bell. Because more marbles end up in the middle
(the binomial bell curve), the chord that emerges is rooted and warm — richest
at the center. Tap anywhere up top to drop a marble; leave it alone and it
auto-rains so a silent glance is already alive.

## How it works

Input → physics → emergent histogram → just-intonation bell chord → render.

- **Input** (`page.tsx`): tap anywhere near the top to release a little cluster
  of marbles (release-and-watch, not a finger drag). When no one has touched it
  for a few seconds it auto-rains a marble every ~750ms.
- **Physics** (`physics.ts`): a triangular **quincunx** lattice of ~12 rows.
  Marbles fall under gravity; at each peg collision they deflect left or right
  with a slight pull toward center plus real collision jitter, so the binomial
  → normal distribution emerges and no two runs look identical.
- **Emergent histogram**: landings accumulate per bin; bar heights are the live
  histogram. Counts slowly bleed off so it can play forever without becoming a
  wall of bars.
- **Just-intonation bell chord** (`audio.ts`): each bin is a struck bell —
  additive sines at ~1, 2.0, 3.0, 4.2× the bin frequency, a soft ~4ms attack
  and exponential decay (higher partials decay faster). An always-on pad
  (root + fifth + octave) keeps it never silent.
- **Render** (`gl.ts`): raw hand-written **GLSL ES 3.00** on **WebGL2** —
  instanced glowing marbles, pegs, and bins drawn as additive glow discs. A
  **Canvas2D** fallback draws the same scene if WebGL2 is unavailable. A badge
  in the corner shows which backend is live.

## Just-intonation bin mapping

Nine bins over a warm root **F3 ≈ 174.6 Hz**, symmetric so the center bins (where
the binomial peaks) are the strong chord tones and the edges are gentle color:

| bin | ratio | role |
|-----|-------|------|
| 0 | 1/2 | sub-octave root (deep, rare edge) |
| 1 | 2/3 | sub-fifth color |
| 2 | 3/4 | sub-fourth color |
| 3 | 5/6 | gentle third |
| 4 | 1/1 | **root** — center, fills fastest |
| 5 | 5/4 | major third |
| 6 | 3/2 | perfect fifth |
| 7 | 5/3 | major sixth |
| 8 | 2/1 | octave (bright high edge) |

Everything is just-intonation and always consonant, so there is no "wrong" note —
every landing is musically valid. Each bin also owns one bold saturated hue;
color is the language, not text.

## Kid-safety

- First tap creates/resumes the AudioContext inside the gesture (iOS unlock).
- Master chain: `masterGain → lowpass (7.5 kHz) → DynamicsCompressor
  (−16 / knee 6 / ratio 12 / 3ms / 250ms) → destination`, with all gains capped
  so simultaneous bells never clip or hurt. Bells are micro-rate-limited.
- No reading required to play, big tap targets, every tap makes sound + light
  within a frame, looping pad so it is never silent.

## References

- **Sir Francis Galton's quincunx / "bean machine" (1894)** — the original
  physical demonstration of the central limit theorem (binomial → normal). This
  drives the whole design: chance, made audible.
- **Wintergatan's Marble Machine** — visual nod to marbles-as-instrument.
- **Insook Choi, "Interactive Sonification Exploring Emergent Behavior" (2018)**
  — the lineage of sonifying emergent/stochastic systems.

## Fallbacks

- No WebGL2 → Canvas2D renderer (same peg field, marbles, bins).
- No 2D context / shader failure / render error → visible `text-rose-300` notice,
  never a blank screen.
- Audio start failure → notice asking to tap again or reload.
