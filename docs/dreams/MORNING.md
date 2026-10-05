# Morning digest — last updated 2026-10-05T~01:30Z

> **Jury verdict today**: Rigorous and productive, but we've shipped 15 straight variations of "one body, one webcam, one piano take on a screen" — the memory lane is the real gold; tomorrow, get off the webcam or out of the single take. See `docs/dreams/JURY.md`.

> **MEMORY is now a lineage.** Three fires, three memory mechanisms: `sediment` (accretion — deposit permanent strata) → `rerise` (retrieval — descend to re-audition, dwelling reconsolidates) → today `emberfield` (**forgetting** — embers fade unless you look at them). That's the parallel to the two cycle-3 DSP finishes: a brand-new category proven it can *sustain*, not stall as a one-off.

## New since yesterday
- **[18888-emberfield](https://getresonance.vercel.app/dream/18888-emberfield) — your memory of one of your recordings as a field of embers that fade unless you look at them.** Why open this: it's the first memory piece where **doing nothing erases.** Up to 9 embers, each a looped slice of one of your real takes; every one cools every frame (`warmth *= exp(-dt/7)`, gone in ~25s). A **coarse** attention blob from your face keeps the embers you look at warm (and quiet the decay); a nod or a lean-in throws a stronger pulse; look at the dark for ~1s and a new ember is born. So by minute 5 the surviving constellation is a **self-portrait of where you looked.** Canvas2D additive spark swarms, bone-gold→ash on black.
- **Needs your 30-sec webcam check.** The face→attention→warmth→audio chain is traced in code, QA-PASS, builds clean, and the demo + pointer fallbacks run headless — but I can't point a camera at myself up here. The nod/lean thresholds are the thing most likely to want feel-tuning.

## How this cycle was run
- **DEEP ×2** on ONE concept (`afterglow`, the attention-decay sibling banked back on §1277), raced via two render paths: **Canvas2D** (shipped) vs **SVG** (`18880-afterglow`, also QA-PASS, dropped). Canvas2D won on your jury's own terms — it's the **freshest render lane (1×)**, and it resolved the two reasons afterglow was benched in the first place (coarse attention instead of finicky gaze-aim; off the rested SVG path).
- **Banked nothing** — this draws the backlog down (~7 → ~6) instead of re-growing it, exactly as the jury asked after two DEEP fires.
- **Hit the hard two-axis swing:** rested three.js + WebGPU (both banned this fire) and two-hand (6–7×). This piece is Canvas2D + face/head attention + a fresh mnemonic palette.

## Open questions for you
- Does **forgetting-by-neglect** feel like memory when you move — i.e. is it legible that the embers you keep looking at survive and the ones you ignore visibly cool, shrink and die?
- Memory now has three cycles. Want a **cycle-4** (e.g. two attention signals competing for a shared pool, or embers you can *merge* into a denser composite memory), or is the lineage complete and the next fire should mint a fresh category off the menu?
- Backlog still ~6 deep (`reservoir` — a journey-engine arc, is the standout). Worth a low-risk burn-down fire next?
