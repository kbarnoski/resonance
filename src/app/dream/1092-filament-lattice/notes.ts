// notes.ts — the design notes rendered inline in the in-page modal (NOT a
// window.alert, NOT fetched at runtime). README.md mirrors this prose.

export const DESIGN_NOTES = `FILAMENT LATTICE · dream 1092
cycle-3 of 1089 "cosmic connectome" — the RAW-WEBGL2 variant

THE ONE QUESTION
1089 counted HOW MANY filaments touch each node (degree -> chord). But
what if we could also hear WHICH nodes are connected — the actual graph
edges — as interval DYADS, and hear how tightly-woven each neighbourhood
is (the clustering coefficient) as chord DENSITY — and run the whole
living web in raw WebGL2 fragment shaders instead of WebGPU compute?

STATE
cosmic-web accretion · pole: cosmic-ambient -> cosmic-awe

HOW TO PLAY IT
• Tap (single clicks/taps) to seed a cosmic node / nutrient well. Discrete
  seeding, not drag-painting. It is already alive when you arrive.
• A two-species slime-mold (Physarum) grows luminous filaments between the
  wells. Cyan/teal = species A (tight sensing); violet/magenta = species B
  (wide sensing) — panned L/R for stereo.
• DEGREE: from each node we cast ~30 radial rays and count distinct filament
  ridges. That integer picks a just-intonation chord (root / +fifth / +third
  / +ninth / full stack). More filaments -> fuller chord.
• EDGES: for every node pair in range we sample the trail ALONG the segment;
  a sustained bridge (coverage >= 60%) is an EDGE. Edges are drawn as glowing
  lines (new ones flash ~1s) and each sings an interval DYAD between its two
  endpoints' pitches. A bright FM chime rings once when a new edge forms.
• CLUSTERING: each node's local clustering coefficient — the fraction of its
  neighbours that are ALSO connected — sets its chord density. A tightly-woven
  neighbourhood sounds full and bright; a lonely bridge node stays thin.
• GRAVITY: nodes carry mass, drift together and MERGE into super-clusters (a
  bell at each coalescence). As total connectivity peaks the master brightness,
  reverb and drone drive open into an awe swell — minute 5 sounds unlike minute 1.
• It runs itself with zero interaction.

TECHNIQUE
1. RAW WEBGL2 fragment-shader Physarum (the point of this variant). Agent state
   (x, y, heading) lives in an RGBA32F texture; a fragment shader senses the
   trail + nutrient wells three ways, steers to the strongest, steps and wraps,
   and writes new state to a ping-pong target. Agents deposit via GL_POINTS
   (one vertex per agent, gl_VertexID -> texelFetch position) with additive,
   channel-masked blending into an RGBA16F trail. A box-blur+decay fragment
   pass diffuses both channels. ~0.5M agents at 512^2 (two species).
2. GRAPH extraction on a normalised readback: degree (radial ray-count),
   adjacency edges (segment coverage), and the clustering coefficient. The exact
   same code runs on the WebGL2 readback and on the CPU-fallback field.
3. Gravitational accretion: persistent node mass, softened inverse-square drift,
   merge-on-contact -> super-clusters over a long session.

OUTPUT / FALLBACK CHAIN
• Primary: raw WebGL2 (EXT_color_buffer_float float targets). Fragment-shader
  Physarum field + a shared 2D overlay for the edge/node graph.
• Fallback: if WebGL2 or float render targets are unavailable, a REAL CPU
  Physarum on a 256^2 grid via Canvas2D ImageData — SAME sense/steer rule, SAME
  graph extraction, SAME audio. ~9k agents x2. A badge shows which path is live:
  green "WebGL2" vs amber "CPU fallback".
• Audio needs a user gesture (Web Audio); before it, the visuals already run.

NAMED REFERENCES
• Jones et al. (2010), "Characteristics of pattern formation and evolution in
  approximations of Physarum transport networks" — the agent transport model.
• Jeff Jones / Sage Jenson / Maximilian Klein ("Fast Physarum in the Browser
  with WebGL2") — the raw-WebGL2 fragment-shader Physarum technique lineage.
• Codis, Pogosyan & Pichon (2018), "On the connectivity of the cosmic web"
  (arXiv:1803.11477) — connectivity (degree kappa), clustering coefficient and
  path length as cosmic-web graph statistics.
• "AI-Assisted Geometric Analysis of Cultured Neuronal Networks: Parallels with
  the Cosmic Web" (arXiv:2510.10286, Oct 2025) — neuronal nets share the cosmic
  web's graph statistics: the same web in the skull and the sky.
• Euclid Q1 DR XXXV (A&A, 2026/07; arXiv:2503.15332) — connectivity = number of
  filaments linked to a cosmic node.`;
