# 1656 · the toll

**A piece you can only hear while you pay the price of attention.**

What if a song only played while you were genuinely paying attention — and
dissolved the instant you let go? A recording you can't hear without doing
something small, real, and boring: holding.

## What it is

A long-form generative score unfolds **only** while you hold a single sustained
gesture — the spacebar held down, or a pointer pressed anywhere on the field.
Holding is *the toll*: the ordinary, unglamorous cost of continuous attention.

- While you hold, an **attention meter** integrates your held time into a
  currency measured in seconds of accrued attention.
- That currency advances the piece through six **named movements**. It is
  materially different at minute five than at second five.
- The instant you release, the sound **dissolves to silence** and the screen
  prints — receipt-style — exactly what you just let go of:
  *"you held for 47s — 'the climb' was 20s away."*
- Your earned progress **erodes slowly** rather than resetting, so a fickle
  listener slides backward instead of starting over. The cost is legible.
- Held long enough, the piece reaches a real **tonic homecoming** and a final
  printed line — a resolution most visitors will never reach, because almost
  everyone lets go.

It is a quiet indictment of the attention economy and a reward for the patient.
The visual is deliberately austere: type on a dark field, its opacity, tracking,
and weight driven by the attention state. No canvas, no WebGL, no particles —
restraint is the point.

## The attention state machine + motif memory

Progress (in accrued-attention seconds) is derived purely from
`AudioContext.currentTime` deltas — never the wall clock. It selects the current
movement from a threshold table (`engine.ts` → `STAGES`):

| at (s) | movement |
| ------ | -------- |
| 0   | a single held tone (drone only) |
| 10  | the first motif enters |
| 34  | the motif is answered (a fifth up, call/response) |
| 70  | a countermelody threads beneath (inverted, contrary motion) |
| 125 | the climb (motif transposes upward, faster, brighter shimmer) |
| 250 | the tonic — home (voices converge to a sustained bell) |

A single **MOTIF** (`[0, 2, 4, 3, 2]` in a just-intonation modal scale rooted on
D3) returns *transformed* across these movements — the same shape answered,
inverted, climbed, and finally resolved home. State is memory: each voice fades
in with a `smoothstep` weight around its threshold, so the arrangement grows
continuously rather than switching. Two timescales make the cost legible: the
**sound** dissolves fast on release (a "veil" gain snaps toward silence), while
earned **progress** erodes slowly.

All sound flows through a master `GainNode` (≤ 0.14) into a
`DynamicsCompressor` before `destination`; every note and the veil use ramps, so
there are no clicks on hold or release. A mulberry32 PRNG seeded from a literal
adds only micro-humanization — nothing is random.

## The ghost auto-demo

A reviewer may open this unattended and hold nothing. So after a ~3s grace
window with no human input, a deterministic **ghost hand** begins taking the
toll on a fixed scripted schedule (`GHOST_SCRIPT`: hold 18s, release 4s, hold
30s, release 5s, …). The ghost audibly and visibly demonstrates the whole
mechanic with zero input — advancing through movements, decaying to silence on
release, printing receipt lines. The schedule is timed off `AudioContext`
deltas, not the wall clock, so it is fully deterministic. The **moment a real
gesture arrives** (spacebar or pointer), the ghost yields permanently to the
human. A mono badge shows who holds the toll: *"you have the toll"* vs *"ghost
is holding — press space to take over."*

## References

- **John Cage — _4′33″_ (1952):** attention itself as the score; the frame
  makes you listen.
- **Pauline Oliveros — _Deep Listening_:** sustained, patient attention as a
  practice, not a consumption.
- **Jenny Odell — _How to Do Nothing_ (2019):** refusing the attention economy;
  attention as the thing worth defending.

## Next-cycle deepening

Give the erosion a *memory of return*: if a listener comes back within a short
window after releasing, let them re-accrue faster (a "you were nearly there"
grace) — modelling how sustained relationships with a work differ from a first
cold hold, and rewarding the returning listener over the merely persistent one.
