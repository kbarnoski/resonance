# 1092 · Filament Lattice

*cycle-3 of `1089-cosmic-connectome` — the raw-WebGL2 variant, where the graph EDGES sing*

**Status**: demoable

Hear not just how many filaments touch each cosmic node (degree → chord), but WHICH nodes are connected — the graph edges — as interval dyads, and how tightly-woven each neighbourhood is (the clustering coefficient) as chord density, with the whole living slime-mold web running in raw WebGL2 fragment shaders.

`state: cosmic-web accretion · pole: cosmic-ambient → cosmic-awe`

## The one question

**1089 counted HOW MANY filaments touch each node (degree → chord). But what if we could also hear WHICH nodes are connected — the actual graph edges — as interval dyads, and hear how tightly-woven each neighbourhood is (the clustering coefficient) as chord density — AND run the whole living web in raw WebGL2 fragment shaders instead of WebGPU compute?**

## Tags

- **INPUT** — discrete **tap-to-seed** a node / nutrient well (single clicks/taps, *not* drag) + **autonomous accretion** (the web evolves itself over minutes with zero input).
- **OUTPUT** — **raw WebGL2** (fragment-shader Physarum + a shared 2D edge/graph overlay), with a true CPU / Canvas2D fallback.
- **CORE TECHNIQUE** — (1) agent-based Physarum in hand-written GLSL; (2) **adjacency-edge graph extraction** (segment coverage) voiced as interval dyads + a "connection formed" chime; (3) **clustering-coefficient sonification** (chord density); (4) **gravitational accretion** into super-clusters.
- **PALETTE / VIBE** — cosmic-web / deep-space; cosmic-ambient calm opening into an **awe swell** as total connectivity peaks.

## How to play it

- **Tap** anywhere to seed a cosmic node / nutrient well (discrete, not painting). The web is already alive and, once you tap **▶ begin — sound on**, already singing.
- A **two-species** Physarum grows luminous filaments between wells. Cyan/teal = species A (tight sense angle); violet/magenta = species B (wide) — panned L/R.
- **Degree** (kept from 1089): ~30 radial rays per node count distinct filament ridges → an integer degree → a just-intonation chord (root / +fifth / +third / +ninth / full stack).
- **Edges** (new): every node pair in range samples the trail *along the segment*; a sustained bridge (coverage ≥ 60%) is an **edge**. Edges are drawn as glowing lines (new ones flash ~1s) and each sings an **interval dyad** between its two endpoints' pitches; a bright FM chime rings once per new edge (rising-edge memory + hysteresis so flicker doesn't spam it).
- **Clustering** (new): each node's local **clustering coefficient** — the fraction of its neighbours that are themselves connected — sets its chord **density/brightness**. A woven neighbourhood is full; a lonely bridge node stays thin.
- **Gravity** merges nodes into super-clusters (a bell per merge); as total connectivity peaks the master brightness, reverb and drone drive open into an **awe swell**.

## Technique

1. **Raw WebGL2 fragment-shader Physarum** (`gl.ts`, the point of this variant). Agent state `(x, y, heading)` lives in an **RGBA32F** texture; a fragment shader senses the trail + nutrient wells three ways, steers to the strongest, steps and wraps, and writes new state to a ping-pong target. Agents **deposit** via `GL_POINTS` (one vertex per agent, `gl_VertexID` → `texelFetch` the position) with additive, **channel-masked** blending into an **RGBA16F** trail. A box-blur + decay fragment pass diffuses both channels. ~0.52M agents at 512² (two species).
2. **Graph extraction** (`graph.ts`) on a normalised readback: degree (radial ray-count), adjacency edges (segment coverage), clustering coefficient (local triangle density). The **same code** runs on the WebGL2 readback and on the CPU-fallback field, so the sonified graph is path-independent.
3. **Gravitational accretion** (`physarum.ts`): persistent node mass, softened inverse-square drift, merge-on-contact → super-clusters over a session.

## Output & fallback chain

- **Primary — raw WebGL2.** Needs `EXT_color_buffer_float` (float render targets). If present: the fragment-shader Physarum field + a shared Canvas2D overlay for the edge/node graph. Badge: green `● WebGL2`.
- **Fallback — CPU Physarum.** If WebGL2 or float targets are unavailable, a **real** CPU Physarum on a 256² grid via Canvas2D `ImageData` — **same** sense/steer rule, **same** graph extraction, **same** audio. ~9k agents ×2. Badge: amber `● CPU fallback`.
- **Audio-optional.** Web Audio needs a user gesture; before it the visuals already run. If the device has no audio (headless review) the sim runs silently.

## Named references

- **Jones et al. (2010),** *"Characteristics of pattern formation and evolution in approximations of Physarum transport networks."* The agent transport model (sense-3-ahead / steer / step / wrap / deposit + diffuse-decay) used verbatim in both the GLSL and CPU paths.
- **Jeff Jones / Sage Jenson / Maximilian Klein** — Sage Jenson's "physarum" model and Maximilian Klein's *"Fast Physarum in the Browser with WebGL2"* (hayden.gg/physarum lineage). The raw-WebGL2 fragment-shader technique: agent state in a float texture, `gl_VertexID` point-splat deposit, ping-pong diffuse.
- **Codis, Pogosyan & Pichon (2018),** *"On the connectivity of the cosmic web"* (arXiv:1803.11477). Connectivity (degree κ), the clustering coefficient and path length as cosmic-web graph statistics — the frame for voicing edges + clustering, not just degree.
- **"AI-Assisted Geometric Analysis of Cultured Neuronal Networks: Parallels with the Cosmic Web"** (arXiv:2510.10286, Oct 2025). Cultured neuronal nets share the cosmic web's graph statistics — the conceptual frame: **the same web in the skull and the sky.**
- **Euclid Q1 DR XXXV** (A&A, 2026/07; arXiv:2503.15332). Connectivity = the number of filaments linked to a cosmic node — the degree→chord mapping kept from 1089.

## Lineage

Cycle-3 of the cosmic-web thread. **1066** ("cosmic web") → **1089** ("cosmic connectome", cycle-2, WebGPU compute, degree→chord) → **1092** (this, cycle-3): the deliberately *different rendering technology* (raw WebGL2 fragment shaders instead of WebGPU compute) and the deepened sonification 1089's own notes flagged as "next-cycle" — a **true edge graph** voiced as dyads, plus the **clustering coefficient**.

## Honest limitations

- **GPU-only vs headless-verifiable.** The raw-WebGL2 field (float textures, `gl_VertexID` deposit, ping-pong) needs a real GPU + `EXT_color_buffer_float` and can't be exercised in a headless/software context that lacks them — there it takes the **CPU fallback**, which renders the identical model and, crucially, runs the **identical graph extraction + audio**. So the *headline* 0.5M-agent GPU field is only visible with a GPU, but the **edge dyads, clustering, edge overlay and full audio are all demoable headless** through the CPU path.
- The graph is extracted from a **downsampled** normalised field (128² on GPU, 256² on CPU), so very thin or very close filaments can be under-resolved; degree/edges are smoothed and hysteresis-gated to keep the voicing from chattering.
- Edge detection is a **segment-coverage** heuristic (is there a sustained bright bridge between the two nodes?), not a flood-fill of a single connected ridge; two nodes with an unrelated filament crossing the segment could read as connected. Adequate for a musical instrument, not a science pipeline.
- Node count is capped at 24 (uniform-array + audio-voice budget); taps beyond that strengthen the weakest existing well instead of adding nodes.

## Files

- `page.tsx` — client component: canvas + overlay, lifecycle, tap-to-seed, autonomous accretion, graph analysis + hysteresis, HUD, notes modal.
- `gl.ts` — raw WebGL2 fragment-shader Physarum (agent update, `gl_VertexID` deposit, diffuse, render, reduce+readback).
- `physarum.ts` — Jones agent model, CPU fallback sim (two species), gravitational accretion + merge, field normalisation.
- `graph.ts` — degree (ray-count), adjacency edges (segment coverage), clustering coefficient — shared by both paths.
- `audio.ts` — self-contained Web Audio on the shared `_shared/psych` drone + void-reverb: per-node degree→chord + clustering→density voices, edge dyads, FM connection chime, coalescence bell, awe swell.
- `notes.ts` — design-notes string rendered in the in-page modal.
