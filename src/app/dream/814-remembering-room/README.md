# 814 · Remembering Room

**The one question:** *What if Karel's real recorded "Welcome Home" piano plays
as the soloist, a machine live-music agent accompanies it AND answers in his
gaps — but now the agent REMEMBERS: it keeps a growing bank of motifs (both ones
it lifts from his recurring gestures and its own best answering phrases), and
over minutes it develops them — transposing into the current key, augmenting or
diminishing rhythm, fragmenting, inverting — so the piece is genuinely different
at minute 5 than at minute 1?*

This is a **cycle-2** of `770 · answering room`. In 770 the agent had **no
long-form memory** — every answer was improvised fresh and forgotten. Here the
agent remembers, quotes itself, and develops material over time.

You press **Begin**. His recording plays whole, as the lead voice. A warm pad
voices the chord under his hands; a soft bell answers in the silences. Early on
the answers are short and freshly invented. As the minutes pass, the agent
increasingly recalls a banked motif and *develops* it — and the **memory shelf**
below fills with glyphs, each glyph a motif's contour, flaring when it is
recalled and varied.

## How it works

Four roles, one room.

### The soloist — his recording, whole (`audio.ts`)

Fetches the real recording (a read-only public GET to
`/api/audio/549fc519-…`, with a 4s abort timeout, handling both a JSON `{url}`
response and a direct audio body) and plays it through a single
`AudioBufferSourceNode`. It is **never** chopped, granulated, or resynthesized —
it is the human in the room. If the fetch fails, a warm ~16s lyrical piano-ish
phrase is rendered offline (`OfflineAudioContext`) and played instead, with an
honest emerald "synthesized fallback" badge — the room is never silent, and the
piece runs fully offline. (Lifted from 770's soloist; the contract is identical.)

### The listener — machine listening / score-following (`listener.ts`)

Taps the soloist with an `AnalyserNode` (fftSize 2048). Each frame it:

- folds the FFT magnitudes into a **12-bin chroma vector**, smooths it, and
  correlates against all 24 major/minor triad templates → the **chord under his
  hands** + a tension estimate;
- tracks **energy** (band RMS) and **spectral flux** to sense when he is playing;
- runs a small state machine that detects **phrase gaps** (sustained activity
  then a short quiet window = "his phrase just ended — my turn");
- **new for cycle-2:** while he plays, it samples his dominant pitch-class
  ~9×/sec and, when a phrase ends, freezes that into a key-independent
  **degree-step contour** so the agent can lift his recurring gesture.

### The agent + memory engine (`agent.ts`) — the new part

Two sounding layers, as in 770:

1. a **warm harmonizing pad** (four detuned sine/triangle voices, lowpassed,
   slow attack) retuned to the detected chord, swelling gently with his energy —
   it sits *under* him and never fights;
2. a **sparse answering voice** (a soft FM bell) firing **only in his gaps**.

The novelty is the **Adaptive Phrase Bank**:

- A motif is stored **symbolically and key-independently** as
  `{ degrees, durs }` — scale-degree steps relative to the tonic plus relative
  durations — so it can be replayed in *any* later key.
- Motifs enter the bank two ways: **(a)** when the agent invents a good
  answering phrase, it banks it; **(b)** it **lifts** a salient contour from his
  playing (from the listener's degree-step trace).
- A global **memory pressure** rises over minutes (≈150s time constant, scaled
  by the memory slider). On each gap the agent rolls against this pressure:
  early on it usually **invents** fresh and banks it; later it usually
  **recalls** a banked motif and applies a **symbolic development** —
  **transpose** into the current detected key (implicit in rendering), rhythmic
  **augmentation / diminution**, **fragmentation** to the head, **inversion**
  about the first degree, or diatonic **sequence**. A weighted pick favours
  under-used motifs so the whole bank gets explored. The bank caps at 10 and
  evicts the least-developed, oldest material.

The result: the agent audibly **re-uses and varies its own earlier phrases**, so
the texture accretes coherence and minute 5 is a development of minute 1.

### The visual — minimal, warm, legible (`page.tsx`)

DOM/CSS hearth plus two **small** `<canvas>` elements — deliberately *not* a
fullscreen scene. The restraint is the point.

- A **hearth** canvas: two facing warm glows — *him* (breathing, scaled by his
  energy) and *the answer* (lit only while answering) — joined by a faint duet
  thread, with the detected chord name shown large.
- A **memory shelf** canvas: each banked motif is a small glowing **sparkline**
  of its contour; **amber** glyphs are *his gestures lifted*, **rose** glyphs are
  *the agent's own answers*. A glyph **flares** when it is recalled and being
  developed, and dots beneath it count how many times it has been reused. The
  shelf visibly fills over minutes, and a readout shows the bank size and the
  current recall pressure — making the long-form memory legible.

Two sliders: **company** (shy ↔ talkative — answer frequency/density) and
**memory** (invent ↔ recall — how hard it leans on the bank).

## Lineage / named references

- **CHI 2026, "A Design Space for Live Music Agents"** (arXiv 2602.05064) —
  codes agent roles (accompanist / leader) and an "Adaptation" dimension where
  only ~11% of systems do online adaptation, and notes that **sustained motif
  development across a long performance is not even a coded dimension** — i.e.
  long-term motif memory is a *gap*. Its proposed **Adaptive Phrase Bank** (store
  recent phrases; recombine / transform via transposition + rhythmic variation
  for coherence through material reuse) is the direct seed for this build.
- **Christopher Raphael, *Music Plus One*** — score-following / automatic
  accompaniment that follows a live soloist.
- **770 · answering room** (this lab) — the cycle-1 lineage: a live music agent
  that listened and answered but had **no** long-form memory.

## How this differs from 770

770's agent improvised each answer fresh from his last gesture and forgot it —
no two minutes were *related*. This agent keeps a symbolic, key-independent
phrase bank, banks both its own answers and lifted fragments of his playing, and
develops that material with classical operations under a rising memory pressure.
The difference is structural memory: 814 quotes and varies itself.

## Honest self-assessment

- **What's real:** the symbolic motif store, the five developments (transpose /
  augment / diminish / fragment / invert / sequence), the rising memory pressure,
  the lift of his contours, and the legible shelf are all genuinely implemented.
  Because answers fire only in his gaps and recall probability climbs with age,
  minute 5 *does* sound like a reworking of minute 1 rather than fresh
  improvisation — the bank's glyphs and their recall-dots make this visible.
- **What's rough:** the contour lift relies on chroma's dominant-pitch estimate,
  which is coarse on polyphonic piano, so lifted motifs are approximations of his
  shape rather than transcriptions. Answers are *after* him, not *in time* with
  him (no beat tracking). Development is chosen randomly among the transforms
  rather than by a sense of where the piece "should" go next.

## Next-cycle deepening

- **Tempo / beat tracking** so developed motifs land *in time* with him, and so
  augmentation/diminution snaps to a real beat grid.
- **Goal-directed development** — choose the next transform by a small grammar
  (e.g. fragment → sequence → augment toward a cadence) instead of at random, so
  the long arc has shape.
- **Voice-leading the recall** into the current chord so quoted material always
  resolves, and seventh chords in the fit for richer harmony.
- **Motif similarity clustering** so the bank de-duplicates his recurring
  gestures into a few strong "themes" it returns to, rather than many near-copies.
