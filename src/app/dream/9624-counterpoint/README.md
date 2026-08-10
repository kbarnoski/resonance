# 9624 · counterpoint — "the answering voice"

Cycle 2 of `9080-mnemonic` ("the memory ribbon").

## The one question

Cycle 1 listened to you play, captured your phrases as motifs, and in your
silent gaps quoted **one** motif back transformed (transpose / invert / augment
/ retrograde), inking the variation on a second staff. Its weakness: the answer
was a single one-off echo on the same staff — no genuine dialogue, no
counterpoint, no self-accompaniment.

**This cycle asks:** *what if the machine answered your line in real
COUNTERPOINT — so a phrase you play returns as a canon against itself, the
subject inverted underneath it, building into a small living fugue-exposition
that you conduct just by playing?*

You play a phrase; the partner captures it as a **subject** and answers it with
imitative counterpoint. The more you return to a shape, the stronger its theme
grows, and the more voices enter — you watch a fugue-exposition assemble on
stacked, metered staves.

## The load-bearing new subsystem — a contrapuntal development engine + long‑horizon theme memory

Everything below lives in `engine.ts` (pure, deterministic, dependency-free) and
is driven by the listener in `page.tsx`.

### Long-horizon theme memory (the new "long window")

`reinforceTheme()` maintains a bank of **themes**, each a recurring melodic shape
tracked by its **interval contour** (`contourOf`). When a fresh subject arrives:

1. every existing theme's strength first **decays** toward the present
   (`THEME_HALF_LIFE = 120 s` — a horizon measured in *minutes*, not frames);
2. the closest-matching contour (`contourDistance` under a threshold) is
   **reinforced** — its strength climbs and its tracked shape eases toward the
   fresh reading;
3. if nothing matches, a **new theme** is born at strength 1.

So returning to an idea over time makes its theme strong; wandering away lets it
fade. This is the piece's long memory horizon, sitting above mnemonic's existing
**fine** scale (per-frame pitch/onset/energy) and **phrase** scale (the rest-based
segmenter).

### The contrapuntal engine

`developSubject()` turns a captured subject + its current theme strength into an
**Answer** — a fugue-exposition of stacked voices, all re-quantized into the
working key (`quantizeToKey`) so consonance holds:

- **Canon** (`canonVoice`) — the classical dominant answer: the subject
  re-entering a beat or two later, transposed **up a 5th** (a consonant
  interval). Delay is expressed in beats and multiplied by the tracked beat.
- **Inversion** (`inversionVoice`) — the subject **mirror-inverted** about its
  first note, sounding underneath the original.
- **Octave canon** — a further entry an **octave below**, completing a four-voice
  texture.
- **Stretto** — `voiceCountForStrength` grows the texture **2 → 3 → 4** voices as
  the theme strengthens, and the entry `spacing` (in beats) **shrinks** with
  strength, so entries crowd closer as the fugue intensifies.

### Metered manuscript

`estimateBeat` takes a robust central value (median inter-onset interval) as the
beat; `quantizeTime` snaps every onset and duration to an eighth-note grid. Voice
entries are beat multiples, so the stacked staves line up to **barlines** — this
reads as engraved manuscript, not free scrawl.

### Notation

Each answering voice gets **its own 5-line staff below the subject**, and the
number of staves grows with theme strength — you literally watch the exposition
assemble. The **imitation offset is drawn**: a violet dashed guide + arrow from
the subject's downbeat to each voice's entry, captioned "*enters N beats later ·
up a 5th*" / "*inverted (mirror)*", with a dashed axis line for inverted voices.
A **theme-memory strip** below the score shows every tracked theme as a strength
bar (the long window made visible), the active theme in brand violet.

## Output & technique

- **Pure inline-SVG living notation** — stacked staves, noteheads as `<circle>`,
  contours as `<path>`, entry arrows as `<line>`/`<path>`, animated with CSS
  keyframes. **Zero GPU, zero canvas, zero particle field.** Proving depth with
  SVG alone is deliberate.
- **Input:** mic (`getUserMedia({audio})`) → an `AnalyserNode` running
  autocorrelation pitch, spectral-flux onset (with a refractory window), RMS
  energy, and a decaying 12-bin chroma fed to Krumhansl–Schmuckler key finding.
- **Audio out:** one soft synth voice per contrapuntal line — sine for the
  subject, triangle+FM for the canon/inversion, each with a distinct
  timbre and stereo pan so the polyphony is audible — summed through a master
  gain (≤ 0.18) and a `DynamicsCompressor` before `destination`.

## Palette / vibe

Clinical **ink-on-high-key manuscript**: a pale ground, thin dark ink staves and
noteheads, and **one** restrained accent — the brand violet (`--primary` token)
used only for the *entering* voice (its first notehead and its entry arrow). No
warm amber/gold/ember, no cosmic glow, no particle field. It is meant to look
like a score, deliberately wrong next to the lab's warm pieces.

## Determinism & muted-read behavior

The only randomness is a single `mulberry32(0x9624)` PRNG — never `Math.random`,
never `Date.now`/argless `new Date()`. Timing comes from `performance.now()` and
`AudioContext.currentTime`.

On load the page **auto-runs a seeded fallback**: a fixed A-minor subject is
re-stated four times through the *same* capture → theme → counterpoint → notate
pipeline the mic uses. The first canon enters within ~1 s; because each
re-statement reinforces the same theme, the exposition thickens 2 → 3 → 4 voices
over the next few seconds. A muted or mic-less reviewer sees the whole fugue
assemble silently — **audio is additive, never required for the visual payoff.**

## How it degrades

- **Mic denied / unavailable** → a `text-destructive` note + automatic seeded
  fallback.
- **No `AudioContext` / muted** → notation still assembles; audio only schedules
  when the context is `running`.
- **`prefers-reduced-motion: reduce`** → draw/enter animations are disabled and
  the score renders static; nothing scrolls, no flicker.

## References

- **Carol Krumhansl**, *Cognitive Foundations of Musical Pitch* (1990) — the
  Krumhansl–Schmuckler key-finding profiles used for `estimateKey`.
- **George Lewis**, *Voyager* — the machine as a co-improvising contrapuntal
  partner, answering rather than accompanying.
- **Robert Rowe**, *Machine Musicianship* / *Cypher* — listening front-ends and
  interactive transformation of captured material.
- **J. J. Fux**, *Gradus ad Parnassum* / **J. S. Bach** — species counterpoint and
  fugal imitation (subject, dominant answer, inversion, stretto).
- **David Cope**, *Experiments in Musical Intelligence (EMI)* — recombinant
  development of remembered material.
- **DSMR — "Depth-Structured Music Recurrence"**, arXiv:2602.19816 (Feb 2026) —
  the **distributed-memory-horizon** chain this cycle is built on: a long history
  window carries "motif repetition and developmental variation" while short
  windows stay local. Here that long window is the theme-strength memory bolted
  onto mnemonic's fine/phrase scales, and it drives how many contrapuntal voices
  enter.

## Next-cycle deepening

- **Invertible counterpoint under a harmonic clock:** answer not just in canon but
  with a moving bass that keeps the vertical intervals consonant on the beat
  (species-counterpoint rules applied to the *stack*, not each line alone).
- **Episodes & modulation:** between expositions, spin fragments of the subject
  through a sequence that modulates to the dominant and returns — a real fugal
  arc, not only an exposition.
- **Theme rivalry:** when two themes are both strong, let them enter as a **double
  fugue**, each subject answering the other.
