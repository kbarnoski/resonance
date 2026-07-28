# 3248 — crowd

**The one question:** What if memory had a hard capacity — so every new note you
played pushed an older one toward being forgotten? A zero-sum attention economy
you steer. You can't keep everything; adding a note is choosing what to lose.

## Thesis

Working memory is not a tape you keep appending to. It holds only a handful of
things at once, and new material does not simply pile on top of the old — it
*competes* with it. This prototype makes that competition audible and visible:
attention is a small, near-conserved pool, and the act of adding is inseparable
from the act of losing.

## The mechanic

- **Capacity.** The memory holds a budget of ~5 active notes (`BUDGET = 5`).
  Each note carries an **activation** in `[0,1]`.
- **Continuous pitch.** You tap notes onto a ring: angle = position in the
  looping phrase, distance from center = pitch, mapped **directly** to frequency
  across three octaves (A2–A5). There is **no scale / pentatonic snapping** — a
  hard rule of this build.
- **Retroactive interference (the core).** Encoding a new note injects
  activation for it *and subtracts* activation from the notes already held. The
  theft is **similarity-weighted** — more is stolen from notes close in pitch
  and near in the phrase — **recency-weighted** — recently-touched traces are
  more vulnerable — and **vulnerability-weighted** — already-weak traces bleed
  fastest (winner-take-all competition, `VULN_GAMMA = 2.2`). The drain scales
  with memory *load* (`saturation = Σactivation / BUDGET`): a near-empty memory
  does not compete, a near-full one competes hard. So the pool is near-conserved
  and bounded around the capacity budget.
- **Eviction.** When a note falls below `EVICT_THRESHOLD = 0.2` it is forgotten:
  it drops out of the loop, goes silent, its glyph crumbles and leaves a faint
  **gravestone** that persists dim. Tap 8 notes into a capacity-5 memory and ~3
  *must* be forgotten — you steer which by what you add and what you rehearse.
- **Rehearsal.** Re-tapping a held note re-injects its activation toward 1.0
  (only rehearsal reaches 1.0; a single-exposure trace tops out at
  `FRESH_ACT = 0.92`, so a rehearsed favourite is *strictly* the strongest). It
  too steals from the others — though a re-activated trace competes less than
  fresh encoding (`REHEARSE_INTERFERE = 0.35`) — so you feel the trade-off of
  fighting to keep a favourite.

The update is written as **pure functions** in `memory.ts` (`applyTap`,
`applyRehearse`). The live page and the headless self-check drive the *same*
reducers, so what a silent reviewer watches on screen is exactly what the numbers
below prove.

## Audio

A proper **AudioContext lookahead scheduler** (`audio.ts`, Chris Wilson pattern):
a `setInterval` wakes every 25 ms and schedules any note-events falling within
the next ~120 ms against absolute `ctx.currentTime` — never one
oscillator-per-timer. The phrase loops at 110 BPM. Per note: 2 detuned
oscillators → lowpass → per-note gain → shared bus → `DynamicsCompressor`
(≈20:1 limiter) → master (~0.15). Activation drives **loudness + brightness
(lowpass cutoff) + presence**: a strongly-held note is loud and bright, a
near-evicted one quiet and dull, an evicted one silent. The AudioContext is
created only after the Start gesture; if Web Audio is unavailable the page shows
an on-brand notice.

## Visuals (Canvas2D)

Notes are nodes on the ring; node size + opacity = activation. A radial
**capacity meter** at the center shows summed activation vs the budget. On each
tap the interference is drawn as arrows/ripples pushing activation away from
neighbours — boldest toward the notes that lose most. Evicted notes crumble to a
persistent faint gravestone. A `font-mono` readout shows `held N / capacity 5`,
Σ activation, evicted count, and a per-note activation bar list.

## Self-demo

On first Start a seeded `mulberry32(99)` PRNG auto-taps **8 notes over ~13 s**
into the capacity-5 memory, then auto-rehearses the **2 strongest survivors**
(the "favourites") 3× each over ~5 s. With zero interaction a reviewer sees the
pool fill, interference evict the weakest ~3 (gravestones appear), and the 2
rehearsed notes stay largest and loudest — all within ~20 s — then can take over
by tapping (empty space encodes, clicking a held note rehearses).

## Headless numbers (`runSelfCheck`, seed 99)

Measured after the full auto-demo (8 taps + 6 rehearsals), from the same pure
reducers the UI uses:

| quantity | value | target |
| --- | --- | --- |
| survivors | **5** | ≈5, ≤ budget (5) |
| evicted (gravestones) | **3** | ≥3 |
| rehearsed notes (ids) | 7, 8 | the 2 favourites |
| rehearsed activations | **1.00 / 1.00** | strictly highest |
| highest non-rehearsed | 0.58 | < rehearsed |
| other survivors | 0.58, 0.427, 0.282 | above evict 0.2 |
| `capacityEnforced` (survivors ≤ 5) | **true** | true |
| `rehearsedAreHighest` | **true** | true |
| `atLeast3Evicted` | **true** | true |

So: capacity is enforced (5 survivors ≤ budget 5), 3 notes reached activation 0
and were evicted, and the 2 rehearsed notes hold the highest activation (1.00,
strictly above every other survivor). Rehearsed ≠ evicted, as numbers.

Sweeping other seeds (42, 7, 1337, 2024) keeps survivors in 4–5 (≤ budget),
evicted in 3–4, and the 2 rehearsed notes always strictly highest — the outcome
is a property of the model, not the seed.

## References

- George A. Miller, "The Magical Number Seven, Plus or Minus Two: Some Limits on
  Our Capacity for Processing Information," *Psychological Review* 63 (1956).
- Nelson Cowan, "The magical number 4 in short-term memory: A reconsideration of
  mental storage capacity," *Behavioral and Brain Sciences* 24 (2001) — capacity
  ≈ 4 chunks.
- John A. McGeoch, "Forgetting and the law of disuse" (1932) — retroactive
  interference / the classic interference theory of forgetting.
- arXiv:2606.15088, "When the Same Musical Knowledge Forgets Differently"
  (June 2026) — forgetting is heterogeneous; here it is driven by competition
  between traces, not mere neglect.

## Files

- `memory.ts` — pure model: `mulberry32`, activation/interference reducers
  (`applyTap`, `applyRehearse`), continuous pitch mapping, the deterministic
  demo schedule, and `runSelfCheck`.
- `audio.ts` — `MemoryAudio`: lookahead scheduler + per-note voice + limiter.
- `page.tsx` — `"use client"` route: Canvas2D visualization, pointer
  interaction, the self-demo runner, HUD, and the Design-notes modal.

## Next-cycle deepening (folded from the two sibling explorations, cycle 929 DEEP)

This piece was the winner of a three-way DEEP fan on one north star — *an
instrument whose sound survives only if you keep it in mind* — where each sibling
attacked a different memory phenomenology. The other two are banked in
`docs/dreams/IDEAS.md §929`; their best ideas graft directly onto this pool:

- **From `3232-fade` (Ebbinghaus + SM-2):** overlay a **per-note decay curve** on
  the held pool so that even a *survivor* dims with neglect — not only when it
  loses an interference fight, but on the clock. Rehearsal would then boost both
  activation (against eviction) *and* SM-2 stability (against time), making the
  capacity budget and the forgetting curve two coupled pressures.
- **From `3256-recall` (reconsolidation):** make **rehearsal lossy**. Right now
  defending a favourite (re-tapping to re-inject activation) is free of identity
  cost. Fold in reconsolidation so a heavily-rehearsed note slowly drifts toward
  the phrase centroid and simplifies — so the note you fight hardest to keep is
  the one that deforms most. "You can't keep everything" (this piece) would meet
  "you can't keep it *unchanged*" (recall) in a single instrument.
- **Own next steps:** live pitch-recompute of the centroid; a second capacity
  "chunk" tier (Cowan chunking) where nearby notes fuse into one trace; MIDI-in
  so a keyboard player feels eviction under their hands.
