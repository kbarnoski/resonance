# 1089 · Cosmic Connectome

*cycle-2 of `1066-cosmic-web` — the connectivity, not the energy, is the instrument*

## The one question

**What if the actual graph-connectivity of a living cosmic-web filament network — the number of filaments linked to each node — were the thing you hear, so a richly-connected super-cluster rings a full chord and a lonely node a single tone, and the web thickens into music as it accretes over minutes?**

`state: cosmic-web accretion · pole: cosmic-ambient → cosmic-awe`

## Tags

- **INPUT** — discrete **tap-to-seed** a node / nutrient well (single clicks/taps that place one point, *not* continuous drag-painting) + **autonomous accretion** (the web evolves itself over minutes with zero input).
- **OUTPUT** — **WebGPU compute** as primary (WGSL, atomic i32 ping-pong trail buffers), with a true CPU / Canvas2D fallback.
- **CORE TECHNIQUE** — (1) a real **Physarum** agent-transport simulation (Jones 2010); (2) **graph-degree connectivity extraction** — measure each node's real connectivity (how many distinct filaments radiate from it) and voice it; (3) **gravitational accretion** — nodes carry persistent mass, drift together, and **merge into super-clusters**, so connectivity climbs and minute-5 sounds unlike minute-1.
- **PALETTE / VIBE** — cosmic-web / deep-space; cosmic-ambient calm that opens into an **awe swell** as total connectivity peaks.

## How to play it

- **Tap** anywhere to seed a cosmic node / nutrient well. Each tap places one point (discrete, not painting).
- A **two-species** slime-mold simulation grows luminous filaments between the wells. Cyan/teal = species A (tight sense angle); violet/magenta = species B (wide sense angle). The two trail channels are panned **L/R** for stereo width.
- Each node's **connectivity** is measured live (approach A, radial ray-count): cast ~30 rays outward, count how many distinct filament ridges they cross → an integer **degree**, which selects a **just-intonation chord**:
  - degree 0–1 → root drone only
  - degree 2 → root + just fifth (3:2)
  - degree 3 → + just major third (pentatonic triad)
  - degree 4 → + a ninth (9:8)
  - degree 5+ → a full luminous stack (octave + major-seventh shimmer)
- **Gravity** drifts nodes together; close pairs **merge** into super-clusters (a bell rings at each coalescence). As **total connectivity** peaks, the master brightness + reverb open into an **awe swell**.
- It runs itself — with zero interaction the web keeps drifting, merging and re-voicing (autonomous demo).

## Technique

1. **Physarum agent transport (Jones 2010).** `{x, y, heading}` agents sense three points ahead (forward / fwd-left / fwd-right at a sense angle & distance), rotate toward the strongest trail reading, step forward at constant speed, wrap at edges, and deposit trail. A diffuse+decay pass (3×3 box blur × decay) re-routes the network. Nutrient wells add an attractive Gaussian halo to the sensed value, so filaments form *between* seeds.
2. **Graph-degree connectivity extraction (the new part).** For each node, cast radial rays on the summed trail field; a ray "links" a filament if the trail exceeds a threshold across a sustained contiguous arc. Adjacent hitting rays collapse into one filament, so the count is the node's **degree**. Degree → JI chord voicing (above). This is the Euclid Q1 (2026) connectivity statistic turned into sound.
3. **Gravitational accretion.** Nodes carry persistent mass, drift under a softened inverse-square pairwise force, and merge on contact into mass-weighted super-clusters whose degree (and chord) climbs over the session.

Secondary flourish: **two agent species** with different sense angles deposit into two trail channels, rendered as two filament colours and panned L/R.

## Output & fallback chain

- **Primary — WebGPU compute.** WGSL with atomic `i32` ping-pong trail buffers, two species (each senses the summed field, deposits into its own channel), a diffuse+decay pass per channel, a render pass colourising both channels + gold node cores whose heat scales with degree, and a GPU reduce → async `mapAsync` readback of a 96² summed field. Connectivity extraction runs on that readback on the CPU (identical logic to the pure-CPU path). ~220k agents per species.
- **Fallback — CPU Physarum.** If `navigator.gpu` is absent or the adapter request fails, a **real** CPU Physarum on a 256² grid drawn via Canvas2D `ImageData` — **same** model, **same** connectivity extraction, **same** audio coupling. ~22k agents per species.
- **Audio-optional.** If the audio device can't start (headless review machine), the simulation still renders and autonomous accretion keeps the web moving. A status badge shows `● WebGPU compute` (emerald) vs `● CPU fallback` (amber).

## Named references

- **Jeff Jones, "Characteristics of pattern formation and evolution in approximations of Physarum transport networks" (2010).** Contributed the agent model — sense-3-ahead / rotate-toward-strongest / step / wrap / deposit, plus the diffuse+decay re-routing pass — used verbatim in both the GPU (`gpu.ts` WGSL) and CPU (`physarum.ts`) paths.
- **Euclid Quick Data Release (Q1) DR XXXV, "The role of cosmic connectivity in shaping galaxy clusters" (Astronomy & Astrophysics, July 2026).** Contributed the fresh scientific anchor: it defines **connectivity as "the number of filaments linked to a cosmic node"** (typically ~1–6, massive clusters ~4–5). Our degree→voicing mapping *is* that statistic turned into sound.
- **Oskar Elek / Burchett et al., "Monte Carlo Physarum Machine / Revealing the Dark Threads of the Cosmic Web" (UC Santa Cruz, 2020).** Contributed the conceptual core: a slime-mold transport model reconstructs the cosmic web's dark-matter filaments. Our nutrient-wells → filaments-between-them → hear-the-connectivity loop is that result turned into an instrument.

## Next-cycle deepening

- **Weighted degree** — voice filament *strength* (ridge integral), not just presence, so a thick bright bridge sounds richer than a thread.
- **True edge graph** — flood-fill along ridges to learn *which* nodes each filament connects → a real adjacency matrix; voice shared edges as interval dyads between endpoint pitches.
- **GPU-side connectivity** — run the ray-count in WGSL so degree is per-frame exact at 512² without the coarse readback.
- **Session arc** — a slow global "cosmic time" biasing gravity so the web inevitably collapses toward a few dominant super-clusters, giving a clear long-form crescendo and resolution.

## Files

- `page.tsx` — client component: UI, canvas, lifecycle, tap-to-seed, autonomous accretion, notes modal.
- `physarum.ts` — Jones agent model, CPU fallback sim (two species), connectivity extraction, gravitational accretion + merge.
- `gpu.ts` — WebGPU device / pipelines / WGSL (two-species compute, render, reduce + readback), minimal local WebGPU typings.
- `audio.ts` — self-contained Web Audio: JI drone bed, per-node degree→chord voices, coalescence bells, awe swell.
- `notes.ts` — design-notes string rendered in the in-page modal.
