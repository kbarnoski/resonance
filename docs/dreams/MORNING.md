# Morning digest — last updated 2026-06-20 ~10:20 UTC · cycle 491

**Open first:** https://getresonance.vercel.app/dream

## New since yesterday
- **[777-song-architecture](https://getresonance.vercel.app/dream/777-song-architecture)** 🎹🔬 (adult) — **See the architecture of your own piece — then hear it.** Your real *Welcome Home* recording plays whole while the browser computes a **Self-Similarity Matrix** of it and paints it as a bright violet→amber→white heatmap. The glowing **off-diagonal stripes are where your phrases RECUR** — the picture is literally the form of the song. A playhead crosshair sweeps it as you play, and **clicking a bright cell plays the two similar moments back-to-back** so you confirm the repeat with your ears. **Why open it:** it uses your music a way the lab never has — not chopped into grains, not a glow field, but *read* for its structure (Foote's 1999 SSM, in a 2026 ML revival). It's the directest answer to the jury's two loudest asks at once: use his music a new non-grain way, and get off the GPU shaders onto the scarce Canvas2D surface.
- *2 more adult directions built + banked — an SVG **Markov Mirror** (`778`: teach a little keyboard your melodic style, watch a live transition-graph improvise back in it — Cope's *EMI*) and an SVG **Ink Score** (`779`: a machine slowly draws an abstract Cardew-*Treatise* graphic score and plays the marks it inks, evolving for minutes with motif memory). See IDEAS §491.*

## In progress / partial
- Nothing mid-build. Adult **WIDE** fire: 3 orthogonal directions in parallel (chroma-SSM of his piano / live Markov style-mirror / autonomous graphic score), shipped the one using your real music + bound to today's research; banked 2 as seeds.

## Research findings worth a look
- **The self-similarity matrix (Foote, 1999)** draws a whole song's form as one image — and it's having a 2026 ML revival (SSM-Net; "self-similarity as attention" for structure-aware generation). The grep that anchored it: the lab has used self-similarity only as 1-D autocorrelation for tempo (`545`) and read harmony as a moving comet (`370`) — **none ever drew the full 2-D structure map of your recording.** That gap became `777`. (RESEARCH §491.)

## Open questions for Karel
- **⚠️ Heads-up — sync anomaly this fire (no work lost).** The container woke with local `main` on an *unrelated orphaned history* (an old cycle-305 snapshot with **no common ancestor** with the real `origin/main` at cycle 490). I treated origin as truth, hard-reset onto it, and continued — nothing was lost. But if the clone keeps coming up orphaned, the loop burns its first minutes re-deriving the real HEAD; a fresh clone per fire would fix it.
- **Renderer/depth tension is still the standing constraint.** The jury wants both "protect depth — return to extend a ceiling" *and* "rotate off GPU shaders." The named depth-targets are gate-blocked: `734-tape-erosion`'s natural cycle-2 re-uses grain+WebGL2+mic (3 current bans), and `729-portal`→3-players needs a KV store. If you want the multi-user thread to advance, un-blocking `729` with an Upstash/KV dep is the move.
- **Adult resurrect-first:** **`778-markov-mirror`** ⭐ — the freshest interaction of the three; next step is to feed it *your* recording's notes so it learns and improvises in *your* style.
- Standing infra: the dream build still can't finish Next static-gen in this container (~4096 fd ceiling — pristine main fails identically at the same `next-font-manifest.json` open). Compile + lint + types verified green this fire; Vercel deploys fine. The fix is raising the container ulimit, not code.
