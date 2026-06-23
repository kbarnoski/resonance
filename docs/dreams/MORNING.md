# Morning digest — last updated 2026-06-23 (cycle 527, adult · DEEP)

> **Yesterday's jury**: most obedient window yet — but every fix grew a new rut: **WebGL2 is the new 6-of-15 monoculture** and the **data lane already cloned itself** (842→864, "roughness fouls the harmony" twice). This cycle answers both directly. See `docs/dreams/JURY.md`.

## New since yesterday
- **[/dream/877-biosphere-score](/dream/877-biosphere-score)** — **Biosphere Score.** Every bird, mammal, insect and fungus *just observed on Earth* (live **GBIF** feed) becomes an orchestra — the data decides which taxonomic **section** plays when. Birds sing high, mammals low, fungi drone beneath; it plays itself. **Why open it:** it's the jury's requested fix for the data lane — a **structural** sonification, not the banned "data → detune" move. The data drives *who-plays-when, the density, and the long-form arc* (minute 5 is fuller than minute 1); pitch is **always** quantized to a slowly-modulating modal scale, so it's harmonic by construction. Each taxonomic class gets its own **register band** — Bernie Krause's *acoustic-niche hypothesis* used as orchestration. **For your 06:30 glance:** fully hands-free — if GBIF is unreachable it runs a curated sample and starts singing within ~1s. Hover/tap a section in the legend to solo it.

## How this cycle was run
- **ADULT night, DEEP mode** — alternated off three WIDE cycles. ONE big concept, **2 parallel renderer approaches**, curated 1.
- **Diversity:** raw-WebGL2 hit 4× + your jury HARD-banned it → avoided. **Canvas2D** (0× recently, and you re-legitimized it as "scarce + fair game") was the freshest legit surface → that's the winner's renderer. WebGPU sibling banked.
- **Research→build chain, and #5 finally landed:** today's dive found *Data Melodification FM* (arXiv 2510.00222) — a paper arguing sonification should map data to musical *rhetoric* (form/harmony), not just pitch/volume, almost verbatim your #3 note. For the first time the dated finding is **cited in the prototype's own README** (your provocation #5, 0-for-15 until now).

## Banked explorer (see IDEAS §527) — built complete + clean
- `878-biosphere-globe` ⭐ — the **WebGPU** twin: the same biodiversity→orchestra engine on a rotating WGSL-compute particle globe (drag to rotate). De-selected only on Canvas2D-diversity + glance-robustness (its globe degrades on a non-WebGPU device), not quality. Resurrect-first when WebGPU is scarce — or we fold both into one "Biosphere" piece with a **map/globe toggle**.

## Open questions for Karel
- **Honesty:** `877` is compile/type/lint-clean but the container has no audio, so it's **not ear-verified** — worth a listen to confirm the 8 sections actually de-mask (the acoustic-niche claim) and the balance feels calm, not crowded, in a dense burst.
- The data lane now has a fresh mapping (structure, not detune). Want me to keep mining real-world feeds for *structure* (transit headways → phrasing, seismic → arc shape), or is biodiversity the one to deepen?
- Your jury's **#2** (the 847/872 feedback-Lorenz thread needs a new capability or close) is still open — I skipped it this fire to avoid the "too similar" trap. Should next adult night add the capability (record/export the drone? a second system that *listens*?) or formally close it?
