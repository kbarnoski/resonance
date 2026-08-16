# 14048 · Rhyme Loom — play your song by its own echoes

**The one question:** What if you could improvise a never-ending, always-coherent
path through one of Karel's own recordings by leaping between the moments that
*rhyme* with each other — turning his fixed take into an infinite, playable
instrument?

## How it works: chroma → similarity → jump

1. **Segment.** One real recording is decoded to an `AudioBuffer` and sliced into
   short segments. When the track's analysis exposes a real tempo, each segment
   is one beat long; otherwise it degrades to fixed ~0.42s frames. The segment
   count is capped (≤ 320) so the matrix computes in a second or two.
2. **Chroma.** Each segment is reduced to a 12-D **chroma** vector — pitch-class
   energy — using a hand-rolled bank of **Goertzel filters**, one per semitone
   across octaves C2–B6, run over a decimated mono signal and folded into the 12
   pitch classes. Vectors are log-compressed and L2-normalized, so two bars in the
   same harmony point the same direction regardless of loudness.
3. **Self-similarity matrix.** `S[i][j] = cosine(chroma_i, chroma_j)` for every
   pair of segments. Rendered as a luminous woven heat-map, its bright diagonal
   stripes are exactly the passages Karel repeats — the structure becomes visible
   architecture.
4. **Rhyme table.** For each segment we precompute its **top-K most-similar other
   segments** (its "rhymes"), excluding trivially-adjacent bars.
5. **Playable instrument.** Audio plays segment-by-segment on a gapless look-ahead
   scheduler with tiny **equal-power crossfades** at every join, so leaps never
   click. It advances linearly, but at any moment you can leap to a rhyming
   segment: click a matrix cell, press `J`, or flip on **auto-wander**, which keeps
   taking musically-similar branches forever. Because every leap lands on a bar
   whose chroma matches, it always sounds intentional. A **coherence** slider sets
   how similar a leap must be — high = only the closest match (smooth), low = a
   wider pool of rhymes (surprising).

Everything you hear is a slice of Karel's own take — no oscillators, no synth
tones, no generated audio. The whole mix routes through the shared `safeMaster`
bus, and the analyser drives subtle bloom in the visual.

Degrades gracefully: no tempo in the analysis → fixed frames; no WebGL2 →
a Canvas2D render of the same matrix.

## Named references

- **Jonathan Foote**, "Visualizing Music and Audio using Self-Similarity" (ACM
  Multimedia, 1999) — the self-similarity matrix for audio structure.
- **Paul Lamere**, "The Infinite Jukebox" (2012) — play a song forever by jumping
  between beats that sound alike.
- Recent MIR context: barwise music-structure-analysis / self-similarity
  segmentation (arXiv, 2025–2026).

## Tags

`INPUT: catalog + click/keyboard structural-navigation · OUTPUT: WebGL2 similarity-matrix · TECHNIQUE: chroma self-similarity / recurrence + rhyme-jump playback · VIBE: cartographic/architectural · pole: cosmic-ambient`

## Next-cycle deepening

- **Better boundaries.** Replace fixed/beat frames with true novelty-curve
  segmentation (Foote's checkerboard-kernel on the SSM) so segments start on real
  musical events, and quantize leaps to phrase boundaries.
- **Richer features.** Fold loudness / spectral-centroid / an MFCC-lite timbre
  term into the similarity so leaps match texture as well as harmony; expose a
  weight between "harmony" and "timbre".
- **Path memory & scoring.** Keep a visible thread of the wandered path across the
  matrix, and bias auto-wander toward long-range recurrences to compose satisfying
  A–B–A returns rather than local shimmer.
- **Beat-locked crossfades.** Sync join crossfades to the tempo grid and add a
  short lookahead beat-match so even low-coherence leaps stay rhythmically tight.
