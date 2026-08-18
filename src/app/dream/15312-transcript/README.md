# 15312 · transcript — the catalog talking to itself

## The ONE question

**What if you could READ his catalog talking to itself — a living transcript of
a real two-way conversation, each line a real recorded phrase answering the one
before it?**

A deep extension of `14656 · answerback`. Answerback was a single call→response:
you play a phrase, the machine answers with the closest real phrase sliced from
the catalog. This turns that ONE exchange into a **self-continuing, evolving
conversation** rendered as a scrolling **typographic transcript** — a chat log
whose speakers are Karel's own recordings. After Start it runs on its own: each
answer's melodic shape AND implied harmony seed the NEXT retrieval, so the
catalog answers, then answers its own answer, walking take to take. Every turn is
a REAL time-slice of a real decoded recording — **zero synthesis, ever**.

## The retrieval + memory-chain + harmonic-scoring approach (the core)

1. **Bank (precomputed at Start).** `buildBank` loads a varied subset of the
   verified catalog — Interplay, Bath, Welcome Home, 2019, Rebound, Snowflake,
   Ghost — decoding each track's audio buffer and its note/chord analysis. From
   each track's time-sorted `notes[]` it slides windows of 4 / 6 / 8 consecutive
   notes and stores, per candidate: the melodic **contour** (interval sequence),
   a 12-bin **pitch-class histogram**, the candidate's local **chord context**
   (a chord-tone histogram + dominant root read from the `chords[]` overlapping
   its time span), the raw MIDI sequence (for the sparkline), and the exact
   **start/end time** inside the source recording. Windows under 0.35 s or over
   5.5 s are dropped; the bank is capped (per-track and total) for load/memory.
2. **The self-continuing chain (the new verb).** After Start the conversation
   self-propels turn by turn (`nextTurn`):
   - The CURRENT phrase (`queryFromCandidate`) — its contour, pitch-class
     histogram, and chord context — becomes the query for the NEXT turn. This is
     the **memory**: the difference between one exchange and a real conversation.
   - Every candidate is scored (`scorePhrase`): contour similarity (interval
     sequences resampled to a fixed length, cosine) + pitch-class similarity
     (cosine on histograms) + **harmonic fit** + length affinity. Harmonic fit
     (`harmonicFit`) blends chord-histogram cosine with circle-of-fifths
     closeness of the two roots — does the candidate's chord context relate to /
     resolve the current phrase's implied harmony? This is **new** over
     answerback, which scored melody only.
   - `pickAnswer` draws from the top-N weighted by score, **excluding** the phrase
     just heard and **biasing toward tracks the conversation has visited least**
     (anti-latch, via per-track visit counts) so the whole catalog gets pulled in.
   - The chosen phrase's slice is played from the REAL `AudioBuffer` via
     `AudioBufferSourceNode.start(when, offset, duration)` with a short fade
     envelope (no clicks), routed through `createSafeMaster().input`. A brief
     musical rest between turns gives it turn-taking.
3. **The stage — a living transcript (DOM / type).** Each turn appends a
   typographic row to a scrolling log: the **track title** + **timestamp**
   (`Bath · 1:24`) in mono, a one-glance **contour sparkline** (a tiny grayscale
   line drawn on a small `<canvas>` — Canvas2D compute only, never inline-SVG),
   a small harmony/match meta, and an indentation + thin `border-border` thread
   showing that the row answered the previous one. The currently-sounding row is
   emphasized (`text-foreground`, `bg-muted`) and its thread **pulses with the
   live answer audio** via `safeMaster.analyser`. A header strip shows which
   loaded tracks have "spoken" so far — the catalog getting drawn in. The log
   auto-scrolls to the newest turn and is capped at the last 40 rows so the DOM
   stays bounded. Achromatic throughout: silver/gray on near-black.

## Steer controls (secondary, live)

- **Echo ↔ Wander** — a temperature/closeness slider. Low = each turn tightly
  echoes the last (small top-N, sharply favoring the best match); high = it
  wanders further (wider pool, flatter weighting).
- **Harmonic weight** — how much chord-fit matters vs pure melody.
- **Spread** — anti-latch strength: how hard retrieval pulls toward unheard
  tracks.
- **nudge** — a button that leaps to a more distant answer than usual (skips the
  closest half of the pool for one turn).
- **Optional inject** — play a phrase on the computer keyboard
  (`a s d f g h j k l`, Web MIDI too when present); it becomes the next query and
  is rendered as a distinct italic "you" row. This is optional — the piece fully
  self-propels and demos with no input device.

## Hard-constraint compliance

- **Real audio only.** Every sounding turn is a slice of a real decoded take
  (`SlicePlayer`). No oscillators / synthesis anywhere. The human "you" turn is
  typographic-only (never voiced). All audio routes through `createSafeMaster`,
  never to `ctx.destination` directly.
- **SSR-safe.** `"use client"`; the AudioContext is created only inside the Start
  handler; all browser APIs are guarded.
- **Graceful degradation.** A track that fails to load or lacks analysis is
  skipped; windows with no overlapping chords derive implied harmony from the
  melody's own pitch-classes; if a canvas 2D context can't be obtained the
  sparkline is simply omitted and the text row still reads.
- **Full teardown.** On unmount: running flag cleared, all timers + rAF
  cancelled, player stopped/disposed, `safeMaster.disconnect()`, `ctx.close()`,
  input listeners removed.
- **Achromatic + house style.** Semantic tokens for all chrome; grayscale in the
  canvas art only; transcript text ≥ `text-base`, mono titles/timestamps at
  `text-sm`, hero `text-2xl font-semibold`.

## Named references

- **Query-by-humming / query-by-contour** MIR retrieval — matching by melodic
  shape rather than exact pitch.
- **Infinite Jukebox** (Paul Lamere, 2012) — navigating a single recording by
  self-similarity; this retrieves an answer _across a catalog_ and chains those
  answers into a conversation.
- **Cross-catalog version identification "in the wild"** (arXiv:2608.04543,
  Aug 2026) — matching musical works across a catalog despite surface
  differences; this piece is the artistic, real-audio, self-continuing take on
  that verb.
- Contrast with LLM/RL music-jamming (**RL-Duet**, 2020; **Real-Time Language
  Model Jamming**, arXiv:2606.11886, 2026), which _synthesizes_ the partner — this
  conversation is anti-synthesis: every turn is a real recorded phrase.

## Next-cycle ideas

- **DTW contour matching** instead of resampled cosine, to reward local alignment
  of ornamented phrases.
- **Voice-leading harmonic fit** — score functional resolution (V→I, ii→V), not
  just root closeness + chord-tone overlap.
- **Lazy-widen the bank** — stream more of the 16 tracks in the background after
  the first few turns so the pool grows without slowing the opening.
- **Branching transcripts** — let a nudge fork the conversation and render two
  columns diverging from the same phrase.
- **Export the transcript** — a shareable text log of which takes answered which,
  with timestamps, as a found "score" of the catalog in dialogue with itself.
