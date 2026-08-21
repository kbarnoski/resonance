# 15600-keepsake — "You may keep only what you reach for."

## The one question

What if one of Karel's real piano takes played through **exactly once**, and you
could keep only the moments you reached out and grabbed as they passed — and on
the second listen you heard nothing but your keepsakes, the negative image of
your own attention?

## The interaction (real-time grab / "river-reach")

- On **Begin the pass**, one real catalog take (default **Bath** — slow,
  spacious) loads and starts playing through once, in real time, start to
  finish. It **does not loop**.
- The take's notes stream as a horizontal **river** of marks flowing right→left
  past a fixed vertical **NOW** line at the left third of a single flat canvas.
  Vertical position = pitch (MIDI); size and brightness = velocity.
- As sound crosses NOW you **press and hold to KEEP** — pointer press-and-hold on
  the canvas, **and** spacebar as an equal alternative (both always live). While
  held, the currently-sounding time-window is marked kept: those marks burn to
  luminous bone-white and are copied into a growing **KEPT strip** along the
  bottom. The strip is scaled against the whole take, so it shows how little of
  the river you can actually hold.
- Everything **not** kept, once it passes NOW and scrolls off the left edge, is
  **gone** — it dissolves to nothing. No rewind, no re-grab. You cannot keep it
  all in practice: attention itself is the scarcity. Deciding what to reach for
  in the moment is the whole act.
- When the take finishes its single pass, the piece **replays containing only
  the kept slices**, stitched in original time-order with the gaps closed up. A
  clear terminal state names it ("N fragments · Ms · P% of the take"), with
  **Reach again** to restart from a fresh full take and **Play keepsake again**
  to re-hear what you saved.

## Audio (the hard rule)

The only audible sound is **one real recording from Karel's catalog** — no
oscillators, no synth, no generated tones anywhere.

- The streaming pass is the whole decoded `AudioBuffer` played once through a
  single `BufferSource`, routed to the shared ear-safety master (`safe.input`).
  Playback position is `ctx.currentTime - startTime`, clamped to the duration.
- "Keeping" records time-intervals `[tStart, tEnd]` while the hold is active,
  relative to that playback position. Overlapping / near-adjacent intervals are
  merged.
- The keepsake replay plays **exact slices** of the same buffer:
  `src.start(when, offset, duration)` for each merged fragment, scheduled
  back-to-back with ~8 ms exponential fade-in/out on a per-fragment `GainNode`
  to avoid clicks.
- Analysis (`loadTrackAnalysis`) drives the river's note marks and decides which
  notes fall inside a kept window. If analysis is missing, the river falls back
  to a scrolling **peak-amplitude envelope** of `getChannelData(0)` — still fully
  functional, badged as such. Audio-reactive NOW-line glow is driven from
  `safe.analyser` (`getByteFrequencyData`).

## Palette / feel

Clinical archival, not a rainbow and not flat gray ambient: a near-black ground
(`#07080b`), a hairline octave + second grid, dim bone streaming marks that
brighten as they cross NOW and burn to luminous white when kept, a single cold
cyan-white ink (`hsl(190 60% 85%)`) for the NOW line, the kept glow, and the
replay playhead. Lost marks fade to nothing as they slide off the left edge. The
NOW line and the growing KEPT strip are the two anchors. `prefers-reduced-motion`
disables the non-essential glow, burn-flare, and scrolling second-grid.

## Named references

- **ACT-R declarative-memory activation model** (Anderson) — a memory trace's
  activation, and so its survival, is a function of how *frequently* and how
  *recently* it has been retrieved; rehearsal is retention, and everything
  un-rehearsed decays below threshold. Reaching-for is exactly the rehearsal
  operation, made physical: what you don't reach for decays off the left edge.
- **Selective auditory attention decoding** (arXiv:2512.05528) — reconstructing
  the single stream a listener is attending to out of a competing mixture. The
  keepsake is the crude, honest version of that: attention as an act that
  isolates a signal, here by literally saving only what the hand reached for.
- **The conceptual lineage of subtraction / toll art** — Yoko Ono's *Cut Piece*
  (1964), where the audience subtracts the work piece by piece and it cannot be
  made whole again; erasure poetry; decay-through-listening sound art. Keepsake
  belongs to this family but inverts the sibling piece 15344-toll: there you
  *spend* to hear and are left with voids; here you *save* and are left with only
  the saved.

## Next-cycle deepening

1. **Weighted decay, not a hard edge.** Give un-reached marks an ACT-R-style
   activation that decays continuously as they travel left, so late reaching can
   still catch a fading tail at reduced fidelity (lower replay gain) — turning
   the binary kept/gone into a gradient of how firmly you held something.
2. **Two-hand / dwell reaching.** Let hold-*duration* or pressure widen the kept
   window around NOW (a firmer grab keeps more context on either side), and allow
   a second pointer so the interaction becomes genuinely bimanual — closer to how
   attention actually splits and re-focuses.
3. **The keepsake as a seed.** Let a finished keepsake become the *source take*
   for a new pass — reach within your own reaching — so repeated sittings distil
   the recording toward the few seconds you return to every time, an emergent
   portrait of a listener's attention over the same piece.

## DEEP fold-in — the two banked siblings (multi-cycle commitment)

This shipped as the winner of a DEEP race (cycle 1189): one concept — *curation
by loss* — attacked via three interaction models. This river-reach arm won on the
sharpness of the concept and the committing, non-locomotion verb. The two banked
siblings are the deepening path for future cycles:

- **Graded memory re-voicing (from `15632`, the attention-decay arm).** Instead
  of a binary kept/gone, give every moment an ACT-R base-level activation
  (`A ∝ Σ tₖ^(−d)`) that *decays* unless re-attended, and re-voice the whole take
  on replay by a continuous gain envelope tracing that activation — so the second
  listen is a graded ghost, full where you held on, faint where you brushed,
  silent where you let go. This is memory as **decay of accessibility, not
  deletion** (arXiv:2604.00131, *Oblivion: Decay-Driven Activation*, 2026);
  merges cleanly with deepening #1 above.
- **The spend-to-keep toll economy (from `15616`, the budget arm).** Cap the
  savable seconds (e.g. 25s of a 3-minute take) so every grab *spends* from a
  draining budget and, once dry, the rest streams past unkeepable. Adds a genuine
  scarcity toll on top of attention-scarcity; extend with **variable toll** —
  harmonically dense / climactic passages (from the chord analysis) cost more to
  keep, forcing an economy of musical value.
