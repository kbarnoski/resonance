// notes.ts — the design notes rendered inline in the in-page modal. Kept as a
// plain string (NOT fetched from README.md at runtime) so the overlay works with
// no network. The README.md file mirrors this prose for readers browsing files.

export const DESIGN_NOTES = `COSMIC CONNECTOME · dream 1089
cycle-2 of 1066 "cosmic web"

THE ONE QUESTION
What if the actual graph-connectivity of a living cosmic-web filament
network — the number of filaments linked to each node — were the thing
you hear, so a richly-connected super-cluster rings a full chord and a
lonely node a single tone, and the web thickens into music as it
accretes over minutes?

STATE
cosmic-web accretion · pole: cosmic-ambient → cosmic-awe

HOW TO PLAY IT
• Tap (single clicks/taps) to seed a cosmic node / nutrient well. Each
  tap places one point — this is discrete seeding, not drag-painting.
• A two-species slime-mold (Physarum) simulation grows luminous filaments
  between the wells. Cyan/teal is species A (tight sensing); violet/magenta
  is species B (wide sensing) — the two channels are panned L/R for stereo.
• Each node's CONNECTIVITY is measured live: from every node we cast ~30
  radial rays and count how many distinct filament ridges cross them. That
  integer is the node's degree, and it selects a just-intonation chord:
     degree 0–1  → root drone only
     degree 2    → root + just fifth (3:2)
     degree 3    → + just major third (pentatonic triad)
     degree 4    → + a ninth (9:8)
     degree 5+   → a full luminous stack (octave + major-seventh shimmer)
  So the more filaments touch a node, the fuller its chord.
• GRAVITY: nodes carry mass and drift toward one another; close pairs MERGE
  into super-clusters. A bell rings at each coalescence. Surviving super-
  nodes reach high degree, and as TOTAL connectivity peaks the piece opens
  its master brightness + reverb into an awe swell. Minute 5 sounds unlike
  minute 1.
• It runs itself. With zero interaction the web keeps drifting, merging and
  re-voicing — a hands-off autonomous demo.

TECHNIQUE
1. Physarum agent transport (Jones 2010): {x,y,heading} agents sense 3 points
   ahead, steer toward the strongest trail, step, wrap, deposit; a diffuse+decay
   pass re-routes the network. Nutrient wells add an attractive Gaussian halo.
2. Graph-degree connectivity extraction (approach A, radial ray-count) — the
   new part. Degree → just-intonation voicing. This is the Euclid Q1 (2026)
   statistic turned into sound.
3. Gravitational accretion: persistent node mass, softened inverse-square drift,
   merge-on-contact → super-clusters over a long session.

OUTPUT / FALLBACK CHAIN
• Primary: WebGPU compute (WGSL, atomic i32 ping-pong trail buffers, two species,
  one GPU reduce + async readback for the connectivity field). ~220k agents ×2.
• Fallback: if navigator.gpu is absent or the adapter fails, a REAL CPU Physarum
  on a 256² grid drawn via Canvas2D ImageData — SAME model, SAME connectivity
  extraction, SAME audio coupling. ~22k agents ×2.
• If audio can't start (headless), the sim still renders and accretion keeps the
  web moving; a status badge shows which compute path is live.

NAMED REFERENCES
• Jeff Jones, "Characteristics of pattern formation and evolution in
  approximations of Physarum transport networks" (2010) — the agent model
  (sense/steer/deposit/diffuse) at the core of both the GPU and CPU paths.
• Euclid Quick Data Release (Q1) DR XXXV, "The role of cosmic connectivity in
  shaping galaxy clusters" (A&A, July 2026) — defines connectivity as "the number
  of filaments linked to a cosmic node" (~1–6, massive clusters ~4–5). Our
  degree→chord mapping IS that statistic sonified.
• Oskar Elek / Burchett et al., "Monte Carlo Physarum Machine / Revealing the
  Dark Threads of the Cosmic Web" (UC Santa Cruz, 2020) — the conceptual core:
  a slime-mold transport model reconstructs the cosmic web's dark-matter
  filaments. Our nutrient-wells → filaments → hear-the-connectivity loop is that
  result turned into an instrument.

NEXT-CYCLE DEEPENING
• Weighted degree: voice filament STRENGTH (ridge integral), not just presence,
  so a thick bright bridge sounds richer than a thread.
• True edge graph: track WHICH nodes a filament connects (flood-fill along
  ridges) → a real adjacency matrix; voice shared edges as interval dyads
  between the two endpoints' pitches.
• GPU-side connectivity: run the ray-count in WGSL so degree is per-frame exact
  even at 512² without the coarse readback.
• Session arc: a slow global "cosmic time" that biases gravity so the web
  inevitably collapses toward a few dominant super-clusters, giving the piece a
  clear long-form crescendo and resolution.`;
