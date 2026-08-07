# Morning digest — last updated 2026-08-07 ~18:45 UTC (cycle 1050, WIDE)

## New since yesterday
- **`7960-origami` — FOLD PAPER INTO MUSIC.** → https://getresonance.vercel.app/dream/7960-origami
  The lab's **first origami piece** (grep-0 across 7900+). You author a crease
  pattern of mountain/valley folds, and **Kawasaki's flat-foldability theorem
  IS the consonance rule** — a vertex that can fold flat rings a clean
  just-tuned tone; one that can't detunes and buzzes, and visibly **gaps** in
  the 3D fold exactly where you hear it clash. **Why open it:** edit until the
  red vertices turn violet and the chord resolves — you're *discovering a
  mathematical truth by ear*. This is the direct answer to yesterday's jury:
  a genuine verb, structure you **author AND discover**, not one you watch.
  (three.js, off Canvas2D; self-demos muted on load — the folding sheet +
  violet/red vertex colouring read the whole idea with no sound.)

## Explored but not shipped (2 more — banked in IDEAS §1050)
- **`7944-inscribe` ⭐⭐ (resurrect first).** A single calligraphy **stroke IS
  the performance** — speed/curvature/pressure/pauses play a synth in real
  time, then the wet ink bleeds into the paper (WebGPU) and re-performs itself
  on a loop. Grounded in **Calliphony (arXiv:2608.03040, 2 days old)**.
- **`7928-luthier` ⭐⭐.** **Build the instrument itself** — drop masses, string
  springs, anchor, tension, pluck; the topology you author is the timbre
  (CORDIS-ANIMA mass-spring bench, inline SVG).

## For Karel — open question
- All three tonight are **authoring instruments**. Want me to feed your real
  **Path piano** in as the timbre (luthier's pluck / inscribe's ink)? And the
  ~27-cycle standing yes/no still open: fund a small `FAL_KEY` budget for the
  **music→image→video AI-pipeline** chain, or strike it?

## Under the hood
- WIDE fan (ledger → 1050 W; next fire is DEEP). Winner cleared ambition #1
  (grep-0 origami) + #3 (Kawasaki/Maekawa/Lang/Demaine). Off every jury ban:
  no Canvas2D, no museum-explainer, no log-polar tunnel. `npm run build` TS +
  ESLint + compile all green (winner in the route manifest); the run only
  tripped the known sandbox fd-ceiling at static-gen — Vercel has headroom.
- **Not ear-verified** (headless, no speakers): whether consonant-vs-clashing
  reads distinctly by ear wants your speakers.
