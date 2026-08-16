# 14336 · Tidalstrata

**What if your whole catalog became a ~10-minute geological drift — three or four
of your recordings held as simultaneous STRATA, slowly spectrally reshaped and
swapped, so the piece is a single evolving landmass that remembers every layer it
has passed through?**

Tidalstrata is the lab's first true long-form flagship, and the **spectral-layer**
answer to it (there is no granular synthesis anywhere here). It is not a loop and
not a scrub toy: it slowly composes an evolving landmass out of Karel's real
recordings played simultaneously, and it is genuinely, audibly different at minute
five than at minute one while staying coherent throughout. It plays itself.

## The two-timescale engine (`strata.ts`)

The research spine is a hybrid **slow-scaffold + fast-detail** generator: a global
process holds long-range structure while a local process keeps everything
continuous — the fix for the memory/attention tradeoff (arXiv:2603.21282, *Fusing
Memory and Attention*, 2026; arXiv:2603.00576, SSM global scaffold + local
refinement), in the lineage of Brian Eno's generative long-form music
(*Reflection*).

- **SLOW process — form scaffold (one move every ~30–75 s).** A Markov-ish state
  walk decides *which* of the 16 verified tracks are foregrounded as strata (up to
  4 at once), driving equal-power fades as tracks enter and leave. A global **sea
  level** rises toward the middle of the arc and resolves near the end, shaping the
  ten minutes. Each active stratum carries a **spectral prism** — a peaking filter
  whose center is slowly re-targeted — so the harmonic emphasis of the whole mass
  migrates over minutes even while the underlying recordings simply loop. This is
  the global-structure layer.
- **FAST process — local detail (per frame).** Every gain and every filter center
  is glided with `setTargetAtTime` (long time constants for the geological fades,
  a fast LFO around each prism's slowly-drifting base). Nothing clicks or jumps;
  the mass is liquid at the sample scale. This is the local-continuity layer.
- **MEMORY — sediment residue.** When a stratum is retired it is **not stopped**.
  Its source keeps looping, but it drops to a faint, heavily lowpassed **residue**
  that lingers in the background. The slow walk recalls a residue roughly 45% of
  the time it recruits, pulling a buried layer back up to the surface minutes
  later. So the piece literally remembers layers it passed through and can bring
  them back. An on-screen `sediment memory` log records every surface / bury /
  resurface / lost event with its timestamp.

Each recording loops seamlessly (`AudioBufferSourceNode`, `loop = true`, started at
a random offset so simultaneous strata don't phase-lock), so a single track can
sustain as a stratum for minutes. The evolution comes entirely from the slow
selection / filter / gain changes on top — never from a source restarting.

## The catalog, and only the catalog

Every sound is one of Karel's **real recordings** (Welcome Home + Snowflake, via
`REAL_TRACKS` / `loadRealTrackBuffer`), looped and shaped only by a biquad filter
and a gain. There are **zero oscillators and zero generated tones**. Buffers are
lazy-loaded and cached as strata are recruited; the drift begins on the first two
and grows, so start never blocks on all sixteen. If a track's buffer fails to
load it is dropped from the pool and the piece continues on the rest. Every chain
terminates at one shared `createSafeMaster` input — nothing touches
`ctx.destination` directly.

## What you see (`render.ts`)

A Canvas2D geological cross-section that **accretes** over the ten minutes, in an
earthy sediment palette (ochre / umber / sand / clay on bone — raw color is
allowed here because it is canvas art, not UI chrome; all chrome uses semantic
tokens).

- **Live surface (top):** the strata sounding now, each a horizontal band whose
  thickness is its gain and whose internal roughness is its live spectral energy —
  every stratum has its own `AnalyserNode` tap, so the bands react to their own
  audio. Residues drift across as faint buried threads.
- **The record (below, scrolling down):** each moment deposits new sediment
  proportional to the mass's total energy, so a long-held loud stratum lays a
  thick band and a quiet passage a thin one. Old sediment compresses toward a
  dimmed "memory" zone at the bottom. When a buried layer resurfaces, its hue
  reappears in fresh deposits — you can read where you are, what came before, and
  when a layer returns.
- A slim elapsed / total (~10 min) marker runs along the bottom; a right-edge tick
  column shows the current sea level.

## Playing it (mostly autonomous)

Press **Begin the drift** (this resumes the AudioContext on your gesture) and it
runs on its own with zero further input. Light keyboard nudges:

- **↑ / ↓** — raise / lower the sea level (more / fewer active strata)
- **← / →** (or **[** / **]**) — shift the whole prism warm / cool (lower / raise
  the filter centers)
- **Space** — pause / resume

## What's rough / next-cycle deepening

- The record's vertical band positions are stacked by recruitment order, so when
  the active count changes the boundaries can jog — geologically it reads as
  faulting, but a stable per-track depth lane would be calmer.
- Strata reshaping is currently just prism re-targeting + selection; a next pass
  could cross-modulate strata (one layer's energy driving another's filter) for
  true interdependence rather than parallel independence.
- The arc is a fixed sine swell; a longer-memory controller could shape the ten
  minutes from what has actually been deposited (denser return of long-buried
  layers as a genuine recapitulation).
- Deposition rate is tied to loudness, not spectral novelty; weighting by how
  *different* the current mass is from recent sediment would make the visual form
  track the musical form more tightly.
