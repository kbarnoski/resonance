# 1900 · Tended Lenia — a garden you must keep, or it dies

**The one question.** What if a piece of music were a living *garden* whose species you keep
alive by shaping their environment — and the moment you stop tending, the music flatlines?

This is the HERO build of **FLOW-EDEN II**: a tended, speciating, multi-kernel Flow-Lenia ecology
in which **sound and image are two views of ONE mass-conserving simulation**. It runs on the proven
WebGL2 RGBA16F substrate (adapted from `1836-flow-eden`, re-implemented in this folder — no
cross-prototype imports).

## Subsystems

- **`sim.ts`** — the ecology on the GPU. One RGBA16F *field* texture (R = mass `m`, G = mass-weighted
  genome `q = m·s`) ping-pongs through passes each tick:
  - **E environment** — diffuse + decay the soil texture toward a dull baseline.
  - **A perceive** — MULTI-KERNEL convolution → per-kernel potentials `U_k`, growth bumps `G_k`,
    a genome-weighted blended affinity `A`, biased by the soil.
  - **B flow** — `F = kA·∇A − kM·∇m`, clamped to < 1 cell.
  - **C transport** — reintegration tracking (1-D box overlaps sum to 1 → **mass conserved exactly**),
    plus a tiny genome mutation from a static noise texture.
  - **D downsample** — 48² RGBA8 `readPixels` for cheap per-species stats + the complexity scalar.
  - Guarded: if `webgl2` / `EXT_color_buffer_float` is missing, a light herbarium-wash fallback
    shader (no float RTT) runs so the screen is never blank.
- **`audio.ts`** — Web Audio sonification. One pad voice per species band + a tonic drone, through a
  `DynamicsCompressor` limiter into a master gain capped at **0.18**. Silent until the Start gesture.
- **`page.tsx`** — `"use client"` page: full-bleed canvas, a floating readable panel, the pointer
  tending model, the complexity meter, an idle prompt, and clean teardown of audio + GL on unmount.

## The four mandatory extensions

1. **Multi-kernel Lenia.** Every genome `s` blends **two** radial ring kernels (inner peak `≈0.26+0.12s`,
   outer peak `≈0.62+0.16s`), each with its own width and its own Gaussian growth centre `μ_k`/width
   `σ_k`. Growth `G = kb·G₀ + (1−kb)·G₁` with the inner-ring weight `kb` itself a function of `s`, so
   different genomes are genuinely different rules → richer morphology + speciation. (Chan,
   *Lenia: Biology of Artificial Life*, arXiv:1812.05433; Leniabreeder, arXiv:2406.04235.)

2. **The human is load-bearing.** A second texture is the **soil** (R = resource, G = soil-genome).
   The pointer paints it (Tend), drops species (Seed), or erases mass (Cull). Pass A amplifies growth
   only where a cell's genome *matches* the local enriched soil and suppresses it toward a net-negative
   baseline elsewhere:
   `A = G·(0.28 + 1.75·boost) − 0.11·(1−boost)`, `boost = norm(res−base)·exp(−(s−soil)²/2·0.09)`.
   The soil **diffuses and decays** toward `base = 0.12` with a ~7 s time constant. Untended, the
   affinity gradient collapses, only `−kM·∇m` survives, and the conserved mass diffuses to a flat,
   near-uniform, quiet equilibrium in ~30 s. A subtle idle prompt appears after 9 s without tending.
   Different soil → different matched genome dominant → genuinely different music. Autonomous drift
   alone is *not* enough to keep it alive.

3. **Harmony is just intonation (not pentatonic).** Genome maps to a 7-limit ratio set
   `{1/1, 9/8, 6/5, 5/4, 4/3, 3/2, 5/3, 7/4, 15/8}`. The **dominant species sets the drone tonic**;
   every other living species sounds its own ratio against that tonic, so co-existing populations
   produce real consonance and beating and mixed zones (e.g. a 7/4 voice over a 5/4) BITE. Mappings:
   population mass → amplitude; center-of-mass x → pan, y → octave register; bloom → bright bell,
   takeover → JI chime (the key shifts), death → low pluck.

4. **Fresh palette — herbarium.** Sepia ink & wash on warm rag paper: a cream/oatmeal ground, species
   rendered as botanical-plate inks (deep botanical green → ochre/sepia → oxblood/madder) with soft
   ink-wash edges, a faint paper grain, and a warm wash where the soil is enriched. A LIGHT palette;
   chrome tokens are overridden to dark-on-cream via inline CSS custom properties on `<main>`, peak
   brightness capped at 0.96, slow luminance drift only (no strobe/flicker).

## Complexity meter (MSPD-lite, arXiv:2606.17091)

A cheap scalar = fine-scale structure the coarse blur misses, amplified by temporal change:
`raw = clamp(22·max(0, var₄₈ − var₁₂) + 14·motion, 0, 1)` (per-cell mass variance at the 48² readback
vs its 12² blur), smoothed. Shown as a live meter *and* mapped to the music (filter brightness + event
density) so you can hunt for — and hear — a colony becoming interesting.

## Honest self-assessment

- **Is the human genuinely load-bearing / does it flatline untended?** Structurally, yes: mass is
  strictly conserved, growth is net-negative wherever the soil is at baseline, and the soil actively
  decays toward that baseline. With no tending the affinity gradient dies and diffusion smooths the
  field to a flat, quiet hum within roughly half a minute — the drone/voice gains follow the vanishing
  living mass, so the music really does settle to near-silence. The ~7 s soil time-constant and the
  `0.11` baseline suppression are the two knobs that decide *how* dead; they are tuned toward "clearly
  dies but gives you a few seconds of grace," not "instantly collapses."
- **Multi-kernel & speciation** land as designed — two kernels with genome-dependent balance give
  distinct species that read differently in both image and JI voice. Speciation here is genome *drift*
  under mutation + competition + your soil selection, not reproduction of discrete agents.
- **Caveats.** Field is 160² (128² under reduced-motion) for a <1 s first paint and smooth 60 fps; at
  that resolution organisms are washes/colonies rather than crisp Lenia gliders. Tuning was done by
  reasoning about the dynamics, not exhaustive in-browser sweeps, so the exact "time-to-flatline" and
  bloom cadence may want a pass on real hardware. Deterministic from PRNG seed `0x1900`.
