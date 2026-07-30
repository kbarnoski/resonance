# Morning digest — last updated 2026-07-30 (cycle 952, DEEP)

> **Last night went DEEP on your #1 peak. The jury's loudest structural note has been "you never *deepen* — every fire mints a new one-off." So this cycle took `3608-atlas` and built the one subsystem atlas's own notes confess it's missing: temporal coherence. The result is a recording that sings *your voice* back to you.**

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **[3808-mosaic](/dream/3808-mosaic)** — **a recording that sings back another sound.** Atlas let you *wander* a recording's timbre-map with a cursor. Mosaic flips it: **hum a melody into the mic (or drop a second recording), and the corpus's own grains reassemble to reconstruct it** — you hear the recording "sing" your line. The magic knob is **coherence** (a slider / ←→): at 0 you get atlas's scattered timbre-texture; slide toward 1 and the grains march in sequence so the *phrase* rebuilds, not just a wash. **Why open it:** it's the most literal cash of your "use my real piano" ask — make a Path track the corpus, sing, and the piano plays your melody back. It also gets us off touch (input is your *voice*, not a pointer) and fixes the exact flaw atlas documented about itself. It self-demos with a seeded auto-target the moment it loads — no mic needed to see it work. Reference: *The Concatenator* (arXiv:2411.04366) — real-time Bayesian audio musaicing.

## In progress / partial
- DEEP cycle: one concept (*a recording that resynthesizes another sound*), three approaches built in parallel, shipped the strongest. Two banked runners-up are rebuild-ready (IDEAS §952):
  - **3824-palimpsest** ⭐⭐ HIGH — load **two** recordings, morph the timbre-space between them so you navigate a hybrid that's in neither; record a path and replay it as a composition. (The other half of the jury's "atlas v2" hook.)
  - **3840-echoes** ⭐⭐ — draw a gesture and it becomes a looping voice; overdub several with unequal loop lengths so they phase forever (Eno / Riley). A long-form piece that's different at minute 5.

## Research findings worth a look
- **§952:** the dive found the algorithm that fixes atlas's own confessed flaw — **The Concatenator** (arXiv:2411.04366): corpus grains as hidden states, your target as an observation, a *tunable transition prior* that decides how strongly to prefer sequential grains. That prior became Mosaic's coherence slider directly. Frontier confirm: neural-codec latent granular resynthesis (arXiv:2507.19202) + FXplorer's "the map is the instrument" (Jun 2026).

## Open questions for Karel
- **This is the 2nd deliberate deepening of atlas** (after 946's songlines). The jury wanted exactly this discipline — worth me continuing to spend cycles turning strong pieces into real v2s rather than minting new ones? Next obvious v3: swap Mosaic's simple matcher for the paper's full particle filter + time-warp to *your* tempo.
- Want me to wire a **real Path track as the corpus** (a read-only audio fetch, no side effects) so you can sing to your own piano directly? Small next step.
- Still needs your go-ahead: the **AI-pipeline chain** (music→image→video) — an explicit **FAL_KEY OK + per-run $ cap** before I can build it.
