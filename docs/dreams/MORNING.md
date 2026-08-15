# Morning digest — last updated 2026-08-15T07:40Z (cycle 1140, DEEP)

## New since yesterday
- **[13328-vocabularygraph](https://getresonance.vercel.app/dream/13328-vocabularygraph)** — **a living map of how you think harmonically.** It plays your *whole* catalog — all 16 verified tracks back-to-back, gaplessly — and as your real chords stream by it grows a constellation: every distinct chord becomes a node, every chord→chord move thickens an edge, and each node **swells with its PageRank centrality** — so the chords you structurally lean on end up biggest. Nothing ever resets, so after an hour the network is denser and re-centered — the graph *is* the memory of everything you've played. **Why open this (headphones, give it a few minutes):** every other catalog piece reads your harmony as color or reverb — a *texture*. This one draws its **structure**: which chords are central to your writing, which transitions are your spine. It's the deepest "reads your actual music, not an FFT" piece yet, and a genuinely new shape for the lab — a self-organizing network, not another field of light. On a muted phone it's already self-organizing track-1's chords on the first frame.

## Explored this fire (DEEP — one big concept, 3 approaches; 2 banked, not shipped)
- One concept — **your whole catalog as a single long-form organism with memory** — built three ways. Shipped the harmonic-graph because the *math is the insight*.
- **catalogsediment** (⭐⭐⭐ resurrect-strong) — your catalog grows one continuous **reaction-diffusion sediment** on the GPU (real WebGPU compute), fed by your chord roots, major/minor, and key, never resetting. The technically biggest of the three. IDEAS §1140.
- **corebloom** (⭐⭐) — an hour of listening leaves a scrollable **geological core sample**: every chord deposits a colored strata band, so you can scroll back through the whole catalog's harmonic history as sediment. IDEAS §1140.
- Both fold into vocabularygraph's planned **cycle-2** (an RD ground under the graph + a scrubber that replays how the graph grew).

## Research finding worth a look
- **Symbolic-music analysis is moving from sequence to network** — a 2026 toolkit (*vega-mir*, arXiv:2605.16539) builds a composer's "harmonic graph" by running PageRank centrality on their chord-transition network. That's exactly the engine under vocabularygraph, run live from your recordings — the first time the lab has drawn the *shape* of your harmony instead of its texture. RESEARCH §1140.

## Open questions for Karel
- **Sound-on / real-device review is the biggest lever** — vocabularygraph really wants your ears + your machine: does the centrality ranking match how you *hear* your own harmony, and does the WebGL render on your hardware? Same standing ask: rubatoline (onsets), resonantrooms (headphones), dreammedley (5-min arc).
- **vocabularygraph is a declared multi-cycle build** — want me to take it to cycle-2 next (RD ground + history scrubber), resurrect the WebGPU **catalogsediment**, or finally chase the AI-pipeline chain (music → image → video, needs a FAL_KEY budget + your go-ahead)?
