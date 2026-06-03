**For**: kids (4+)

# 280 · Echo Canyon

*Sing across the canyon — a little paper creature catches your song and sings it back, then adds a friend.*

Open `/dream/280-kids-echo-canyon`, press **start singing**, and sing, hum, or
call out. On the far cliff, **Echo** listens; when you stop, it sings your phrase
back across the canyon as a flight of colored paper birds, then layers a gentle
harmony underneath. It's the oldest musical game there is — **call and
response** — turned into a toy a four-year-old can play alone.

This is the lab's **first call-and-response / canon piece**. Everything else in
the lab either reacts to sound or generates it; this one *listens to you, waits,
and answers*. It's also built squarely against the 2026-06-02 jury's three
demands — **ban the glow, ban the pentatonic, audit the sound**:

- **Sound**: the scale is **C-Lydian** (C D E F♯ G A B) — the raised 4th gives
  it a floating, dreamlike color that is deliberately *not* the C-major
  pentatonic the lab had been defaulting to. There are no wrong notes: anything
  you sing is snapped into the mode.
- **Look**: pure matte **cut-paper on Canvas2D** — flat dusk sky, paper cliffs
  with drop-shadow lips, a paper moon, and birds that are just colored ovals.
  Pure `source-over`, drop-shadows only, **no glow, no additive, no WebGL**.

## How it works (four subsystems)

1. **Mic + pitch detection.** `getUserMedia` → `AnalyserNode` (analysis only —
   your voice is never played back, never recorded, never sent anywhere). Each
   ~130 ms a frame of time-domain samples is run through a normalized
   **autocorrelation** pitch detector (Chris Wilson's canonical Web Audio
   method, the YIN family) with parabolic-interpolation refinement.
2. **Phrase segmentation.** An RMS gate decides when you're singing; degrees are
   captured as you go (de-duplicating sustained notes), and ~620 ms of quiet
   ends the phrase. Octave-collapsing means a high voice and a low voice both
   map into the same comfortable register, so the toy works for any child.
3. **Echo + harmony scheduler.** When your phrase ends, Echo replays it note by
   note (a soft triangle "mallet"), and 150 ms behind each note adds a diatonic
   **third** in-mode for a round-like shimmer. An always-on C+G drone (slow LFO)
   keeps the canyon from ever going silent; a `DynamicsCompressor` limiter keeps
   it from ever getting loud or harsh — safe-sounds rule.
4. **Cut-paper canyon render.** rAF, refs-only, zero per-frame allocation. Birds
   fly a sine-arc bezier from cliff to cliff; the singing creature bobs and
   opens its beak; color = pitch (one bold hue per scale degree).

## Degrades gracefully

No mic, or permission denied → a **self-playing demo**: the two creatures sing
call-and-response to each other on a timer, so the piece is always alive and
demoable (with a readable `text-rose-300` note inviting you to allow the mic).
No reading required, no fail states, ≥64 px start button, ~14-min calm session.

## Why it matters for Resonance

KIDS.md explicitly calls out **vocalization** as hugely valuable for 4-year-old
language + music development, and stakes out the *calm, contemplative,
piano-rooted* corner of the kids market. A call-and-response singing game is the
purest vocalization prompt there is, and Lydian + paper-birds keeps it gentle
rather than the usual high-energy kids-app noise. For grown-up Resonance, the
same pitch-detect → quantize → answer loop is the seed of a **duet companion**
that sings harmony with a live vocalist.

## References

- **YIN** — A. de Cheveigné & H. Kawahara, *YIN, a fundamental frequency
  estimator for speech and music*, JASA 2002 (the autocorrelation-difference
  family this detector belongs to).
- **Chris Wilson, PitchDetect** — the canonical Web Audio autocorrelation
  implementation (`github.com/cwilso/PitchDetect`); the lab already builds on
  Wilson's two-clocks scheduling in `256`.
- **Pauline Oliveros, *Deep Listening: A Composer's Sound Practice*** (2005) —
  listening as an active, answering practice; the spirit of the whole piece.
- Freshness anchor: browser pitch-detection is actively tooled in 2026
  (MusicalBoard, "How Browser-Based Pitch Detection Works", 2026-05-05; the
  "Voice Composer" Show HN). RESEARCH §290.

## Deepening path

- A "round" mode where Echo answers *while* you're still singing (a true canon).
- Multiple creatures, each answering in a different inversion → a paper choir.
- Map the captured contour to a drawn melody line you can replay (ties into the
  loved `158-kids-hum-paint` paint-from-voice vein).
- A grown-up companion: real-time harmony for a live vocalist (mic → chord).

*Kids 4+ · mic input (demo fallback) · matte cut-paper Canvas2D · Lydian ·
no recording · zero deps · zero API · no guard needed (no server route).*
