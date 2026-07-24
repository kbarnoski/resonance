# Morning digest — last updated 2026-07-24 (cycle 887)

## New since yesterday
- **[2482-collide](https://getresonance.vercel.app/dream/2482-collide)** — *A bowl that
  composes its own music by colliding.* Drop or throw objects made of four **materials** —
  glass, wood, metal, stone — into a 3D bowl. They fall, collide, and **ring by what
  they're made of**: glass rings long and bright, stone thunks short, metal shimmers for
  seconds, wood is a warm fast bar. The bowl funnels the pile back to the centre so it
  keeps colliding on its own — a self-playing generative percussion sculpture. Shake to
  keep it ringing; keep dropping objects to thicken the texture. **Why open it:** it's the
  first piece in the lab where objects actually *hit each other and sound their material* —
  real modal synthesis driven by a real physics loop (the FoleyAutomatic idea), not a
  synthesized abstraction. It plays itself; you just stir it.
- **2 more built & explored, banked to IDEAS §887** (not shipped):
  - ⭐⭐ **2478-mallets** — a **morphing lithophone**: a row of tuned struck bars; one slider
    crossfades the *whole set* glass→wood→metal→stone so the same melody changes what it's
    made of. The most immediately *playable* of the three — **strong next ship** (extract a
    shared `modal.ts` first).
  - ⭐ **2486-resonator** — **sculpt a material by ear**: five physical sliders
    (size/stiffness/density/damping/inharmonicity) reshape one struck object's modal
    spectrum live, with a spectrum-bar display + strike/scrape/bow. A precise little tool.

## In progress / partial
- All three share a modal-synthesis engine each reimplemented independently → the clean
  next move is a `_shared/modal.ts` primitive, then ship **2478-mallets** on it.
- Still standing: **2470-trio** (banked §886, reactive jazz rhythm section, near-ready);
  merge **2462-skyclock** into **2466-horizon** as a dome/ground toggle.

## Research findings worth a look
- **Material-identity sonification** (RESEARCH §887) — *Sonify Anything* (arXiv:2508.01789)
  + the classic van den Doel/Pai *FoleyAutomatic* modal work. The gap it exposed: the lab
  had lots of physics AND lots of synthesis but had never joined them — a collision that
  *excites a material ring*. That join is tonight's ship.

## Open questions for Karel
- **Needs your eyes/ears** (headless can't verify): do the four materials read as clearly
  *different* when they collide, and does the bowl stay musical without turning to mush as
  the pile grows? It falls back to a top-down 2D view if WebGL is missing, and a seeded
  auto-demo drops objects on load so it always shows something.
- **AI-pipeline chains (music→image→video) and a true cross-machine WebRTC room are still
  0×** — the jury's two biggest untouched lanes. Both need your budget/go-ahead (FAL_KEY)
  or are hard for me to verify headless. Say the word.
