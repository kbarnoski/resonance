# 13328 · Vocabulary Graph

**The one question:** *What if listening to Karel's ENTIRE catalog grew a living MAP
of his harmonic vocabulary — a force-directed constellation where every distinct
chord becomes a persistent node, every chord-to-chord move thickens an edge, and node
size grows with how CENTRAL that chord is to his whole body of work (PageRank on the
transition graph) — so over an hour you watch the shape of how HE thinks harmonically
self-organize out of his real recordings?*

This is a long-form, **memory** piece. It plays all 16 verified tracks (13 *Welcome
Home* + 3 *Snowflake*) back-to-back with a gapless equal-power crossfade, and as his
real chords stream by it accretes a chord-transition graph that is **never reset**. The
minute-20 network is denser and re-centered versus minute-1 — the memory *is* the whole
accreted graph.

## What you see

- **Nodes** = distinct chords in his analyzed catalog. A chord symbol is normalized by
  stripping the slash-bass inversion (`A#maj9/F` and `A#maj9` share one node), so the
  map is keyed by harmonic identity rather than voicing.
- **Edges** = observed directed transitions between consecutive chords. Weight = count;
  edge thickness and opacity both grow with weight. Self-repeats (a chord held across
  several analysis frames) do not create self-loops.
- **Node size** = running **PageRank centrality** — the chords he leans on and keeps
  returning to swell largest.
- **Color** = each chord's pitch-class hue (`pitchClassHue(chordRoot)`), desaturated for
  minor/diminished — restrained, ink-on-graphite, not cosmic.
- **The live chord pulses** — its node brightens toward the violet brand accent, driven
  by the master-bus analyser energy.
- **Readout:** `track 5/16 · "2019" · 3:10 · 47 chords · 112 transitions`, plus the
  currently-sounding chord and the three most-central chords so far.

## The method — PageRank on his chord-transition network

The intellectual core is deliberately *real math*, not counts dressed up as centrality:

1. As chords stream from playback, each consecutive pair increments a directed edge in a
   transition matrix `T` and bumps node occurrence counts. Never reset across tracks.
2. Roughly once a second we run **8 power iterations of PageRank** over the current
   matrix with damping `d = 0.85`:
   `PR(v) = (1−d)/N + d·(danglingMass/N) + d · Σ_{u→v} PR(u) · w(u→v) / outWeight(u)`.
   Dangling (sink) mass is redistributed uniformly so the vector stays a proper
   distribution. Node radius ∝ `sqrt(PR / max PR)`.
3. Layout is **Fruchterman–Reingold-lite**: all-pairs repulsion `k²/d` (his vocabulary is
   well under 100 chords, so O(n²) is fine), attraction along edges `d²/k` scaled by
   `1 + 0.35·log₂(weight+1)`, mild gravity to center, velocity damping, and seeded
   jitter to break symmetry. The view auto-fits and re-centers smoothly as the graph
   grows.

This is exactly the harmonic-graph construction described by **vega-mir, "An
information-theoretic toolkit for symbolic music, with applications to harmonic graphs
and rubato spectra" (arXiv:2605.16539, submitted 15 May 2026)**, which builds harmonic
graphs by computing PageRank centrality on chord-transition networks — implemented here
live, from Karel's own recordings. It sits in the lineage of the **Tonnetz / Euler tonal
network** (Euler, *Tentamen novae theoriae musicae*, 1739) and uses the force-directed
layout of **Fruchterman & Reingold, "Graph Drawing by Force-Directed Placement"
(1991)**.

## Audio & data

- **Audio source:** Karel's real catalog only, via `loadRealTrackBuffer` over
  `REAL_TRACKS` (the 16 verified IDs). No oscillators or synth beds. A track that fails
  to load is skipped; playback continues gaplessly to the next playable track.
- **Chord data:** `loadTrackAnalysis(id).chords`, walked against playback position. If a
  track has no analysis it still plays — it just contributes no graph updates (noted).
- **Ear safety:** every source routes through `createSafeMaster` (shelf + low-pass cap +
  limiter). Nothing connects to `ctx.destination` directly; the visual pulse reads the
  master analyser.
- **Determinism:** all randomness (spawn positions, layout jitter) comes from a seeded
  mulberry32 PRNG (seed `0x13328`). No `Math.random`, `Date.now`, or `new Date()`.
- **Instant life:** on mount, before any audio, the first track's analysis is fetched and
  its chords are streamed into the graph on a seeded timer — so the constellation is
  visibly self-organizing, muted and click-free, before you press Play. Play hands off to
  real audio and chord-timed updates; the same graph continues to grow (it pre-warmed it).

## Renderer + fallback

- **Primary:** raw **WebGL2**. Nodes are drawn as `gl.POINTS` with a soft-disc fragment
  shader (size from PageRank); edges as thin two-triangle quads with per-edge alpha and
  pixel-uniform thickness. All geometry/color math lives in the shaders and the draw
  routine — the framebuffer is cleared each frame but the graph state never is.
- **Fallback:** if WebGL2 is unavailable, the identical node-link graph renders to
  Canvas2D (arcs + lines) with a small notice. It never blanks.
- **Teardown:** on unmount, the rAF loop is cancelled, all voices stopped and
  disconnected, the master bus disconnected, the `AudioContext` closed, and all GL
  programs/buffers/VAOs deleted (plus `WEBGL_lose_context`).

## Honest limitations

- **Chords are only as good as the analysis.** Node identity depends on the analyzer's
  chord symbols; genuinely different harmonies that the analyzer labels the same collapse
  together, and enharmonic spellings that differ (e.g. `Db` vs `C#`) do not.
- **Inversions are collapsed.** Stripping the slash-bass is a deliberate choice for a
  cleaner vocabulary map, but it discards bass-motion information that matters to how the
  harmony actually moves.
- **The demo pre-warm double-counts track 1.** The muted demo streams track 1's chords,
  and Play then re-streams them from real audio, so track 1's occurrence/transition
  counts start slightly inflated. Faithful to "never reset," but worth naming.
- **Chord streaming during a crossfade is simplified.** Only the incoming (newer) track
  advances its chord pointer during the 2 s overlap; the outgoing track stops
  contributing. Over a full catalog this is a handful of missed transitions at seams.
- **PageRank on a still-growing graph is a moving target** — early in a track the
  centrality ranking is noisy and reshuffles; it stabilizes as the network fills in.
- **Layout constants are hand-tuned**, not adaptive; a much larger vocabulary than
  expected could crowd the view before the auto-fit compensates.

## Next-cycle deepening (DEEP §1140 — this was a raced-approaches winner)

This shipped as the strongest of three approaches to one DEEP concept ("Karel's whole
catalog as a long-form organism with memory"). The two banked runners-up point at the
multi-cycle deepening path for this piece:

- **Fold in the never-reset chemistry (from `catalogsediment`, the WebGPU-compute
  Gray-Scott approach):** render the graph *over* a slow reaction-diffusion substrate
  whose feed/kill is driven by the live PageRank distribution — so the field visibly
  thickens around the harmonic centers, giving the network a living ground rather than a
  flat background.
- **Add a stratigraphic time-ruler (from `corebloom`, the core-sample approach):** a
  scrubber along the bottom that replays how the graph grew — drag back and watch nodes
  shrink and edges thin to their state at minute-5. The graph holds the memory; the
  ruler lets you *read* it.
- **Make the layout history-aware:** persist node positions so a chord that reappears
  after 40 minutes returns to roughly where it lived before — reinforcing that the map
  is one accreted structure, not a re-layout each frame.

Cycle-1 (this ship) = the live PageRank graph + long-form playback. Cycle-2 = the RD
ground + the history scrubber. Cycle-3 = polish + a real-device pass (does the centrality
ranking match how Karel hears his own harmony?).
