# 15392 · recur

**What if Karel's catalog composed a NEW, never-repeating piece of ITSELF — and
you could SEE its form as a shape: the whole movement laid out as nested
time-scales, with every thematic return drawn as an arc back to where the theme
was first heard?**

`recur` is a **self-composing engine**, not a mixer, a shuffle, or a
call-and-response. Press **Start** and it through-composes a coherent movement
out of **real decoded slices of Karel's own recordings** — forever, with no
further input. Every sound is a `AudioBufferSourceNode.start(when, offset, dur)`
quote of one of his takes, routed through `createSafeMaster`. **Zero
synthesis** — no oscillators, ever. The machine only re-arranges his own playing.

## The three time-scales

The engine works the way Scott H. Hawley argues a music co-creation agent must —
*listening across scales at once* ("Helping Music Co-Creation Agents 'Listen'
Well", arXiv:2608.04378, 2026-08-05):

- **FORM (coarse).** A slow, cycling arc — *settle → gather → peak → return →
  rest*. Each stage carries a **tension target**, and that target steers *what
  kind* of material the engine reaches for (busy/loud vs sparse/quiet). The
  `Form bias · tension` slider raises or lowers the whole arc.
- **PHRASE (mid).** For each step the engine scores every real phrase-slice in
  the corpus and draws the next one by **musical fit**:
  - **voice-leading** — circle-of-fifths root closeness + chord-quality
    (major/minor) match + chord-tone-histogram similarity to the previous slice;
  - **melodic-contour continuity** — cosine similarity of the resampled interval
    contour plus how small the melodic leap is at the join (previous last note →
    candidate first note);
  - **form fit** — how well the slice's energy matches the current stage tension;
  - **anti-repetition** — a per-track visit penalty so the whole 16-track catalog
    gets pulled in, never latching on one take.
  `Harmonic smoothness` trades voice-leading against pure contour continuity.
- **NOTE / MOTIF (fine).** The engine **remembers** a few distinctive early
  phrases as **themes** (α, β, γ, …). At **return points** in the form arc (the
  *peak* and *return* stages) it brings a remembered theme **back**, optionally
  **transposed** by a few semitones (via `playbackRate`). Thematic return is what
  makes this a composition rather than a chain. `Motif-return rate` sets how
  often that happens.

## The recurrence map (the surface)

Everything is drawn in **Canvas2D** as a living structural map, so the three
scales and the recurrence are spatially visible:

- **FORM** is the **violet tension ribbon** across the top — filled from the real
  history of every phrase's stage tension, so minute 5 shows a whole landscape of
  swells the first minute didn't have.
- **PHRASE** marks sit along a spine of **track lanes** — each of Karel's tracks
  keeps a stable vertical lane, so you can see the same recording recur. Mark
  brightness/size encodes loudness/energy; major reads brighter, minor darker.
- **NOTE** contour is the fine polyline drawn inside/around each mark — the
  actual shape of that phrase's melody.
- **THE signature move — recurrence arcs.** When a theme returns, a violet arc is
  drawn from the returning mark **back to the mark where the theme was first
  heard**, labelled with the theme letter (and its transposition). Theme-origin
  marks are **pinned** (never culled), so over minutes the accumulating arcs
  literally draw the movement's form — an arch, a rondo, a spiral — as a picture.

The live audio level (`safeMaster.analyser`) drives the glow on the currently
sounding mark.

## Corpus construction

On Start the engine loads all of Karel's **verified** catalog (`REAL_TRACKS` —
Welcome Home + Snowflake) via `loadRealTrackBuffer` + `loadTrackAnalysis`. Each
track is sliced on `chords[]` onsets, merging slivers to ≥ ~0.9 s and capping at
~4.2 s; a track with no chords falls back to even ~2 s windows. Every slice is
tagged with its source track + time, a chord/harmony identity (root + quality +
chord-tone histogram), a melodic contour, and an energy value. Any track whose
audio or analysis fails to load is **skipped** — never fatal.

## Steering (secondary, optional)

The piece runs start-to-finish untouched (fully headless — no mic, camera, or
pointer). The three sliders (*Form bias · tension*, *Harmonic smoothness*,
*Motif-return rate*) and the **nudge** button ("reach further" — widens the
selection pool once) are a secondary layer only.

## How it goes beyond `15312 · transcript`

`transcript` is a **flat** contour+harmony retrieval *chain* — each phrase seeds
the next, rendered as a scrolling text transcript. `recur` adds a **form
controller** steering material over a slow arc, **motif memory + thematic
return** (the fine scale), and **multi-time-scale selection**. Its whole reason
to exist is that the **recurrence is drawn as spatial structure** — the returning
arcs accumulate into the visible shape of a composed movement.

## Extending

- **Real cadence detection** — end the *rest* stage on an actual authentic
  cadence in the harmony rather than a phrase count.
- **Motif development** — return themes fragmented, inverted, or rhythmically
  augmented, not just transposed; draw the transformation on the arc.
- **Section rhyme** — detect when two spans of the map are self-similar and draw
  a second class of arc (form-level rhyme, not just motif return).
- **Voice-leading by actual top-line** — score the join on the melody's outer
  voice rather than the last/first note.
- **Export the score** — write the chosen (trackId, start, end, transpose)
  sequence out so a rendered movement can be replayed deterministically.

## References

- Scott H. Hawley, *Helping Music Co-Creation Agents "Listen" Well*
  (arXiv:2608.04378, 2026-08-05) — the time-scale hierarchy.
- David Cope — **EMI** / recombinant composition: reassembling a composer's voice
  from fragments of their own work.
- Paul Lamere — **The Infinite Jukebox** (2012): navigating a real recording by
  self-similarity.

## Constraints honored

- Audio = Karel's **real verified catalog only**, via the shared helpers; **zero
  synthesis**; all audio routed through `createSafeMaster` (never
  `ctx.destination`).
- Self-contained in this folder; the only cross-folder imports are from
  `../_shared/`.
- Canvas2D only (no SVG/WebGL/three.js). Dark, minimal, Scandinavian house style
  with semantic tokens; achromatic ink + the violet brand ramp for the three
  scales and the recurrence arcs.
- Graceful degrade (skip failed tracks; `text-destructive` notice if Web Audio is
  blocked); full teardown on unmount (cancel timers + rAF, dispose player,
  disconnect master, close context).
