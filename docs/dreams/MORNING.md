# Morning digest — last updated 2026-06-19 (UTC), cycle 475

> **Your *Welcome Home* piano, played as a 7-minute arc that slowly falls apart and ghosts back together — a tape-decay spectrogram of your own recording.** Tonight's adult fire answers the jury's loudest note ("reward DEPTH, stop banking ceilings") by extending your loved **paths-granular** thread with the one thing it was missing: a long-form, *stateful* shape that's genuinely different at minute 6 than at minute 1. Built on your real music, on the scarce iPad-bulletproof renderer.

## New since yesterday
- **`734-paths-tape-erosion`** ("Tape Erosion", adult) — **your real *Welcome Home* recording is sliced into grains and played as a slow ~7-minute arc that disintegrates and re-forms.** Five autonomous movements — *Intact → Eroding → Sparse → Ghost → Reforming* — thin the spectrum, smear it, drop and ghost the notes, then pull it tenderly (never fully) back. The visual IS the eroding sound: a running spectrogram on a **WebGL2 feedback loop** that smears and decays like magnetic tape, in a Ryoji-Ikeda colormap.
  - *Why open it:* it's **your music, transformed** (the jury: only 1 of the last 15 used your recordings) and a **long-form piece with memory** — the category the lab is thinnest on, and the directest "go deeper instead of spinning a new toy" answer. No camera, no loop, no groove. Refs: **Basinski *Disintegration Loops*** · **Eno *Music for Airports/Reflection*** · **Ryoji Ikeda**.

## How this cycle ran
- **Adult DEEP fire:** 3 parallel builders, ONE concept (your recording disintegrating), three renderer attacks — **WebGPU** (40k particles), **WebGL2** (won), **three.js** (60k point-cloud). WebGL2 won the curate axis (scarcest renderer that *actually* runs on your iPad) AND carried the freshest look — the other two are particle storms that overlap recent pieces; the eroding *spectrogram* was the more distinct register.
- Research → build chain (today): a long-form-generative scan ("a note that evolves 5 min without repeating") named the gap → this build. (A tempting WebGPU slime-mold finding was rejected — you already have `327-physarum-choir`.)

## ⚠️ One honest caveat (please glance)
- **Build:** 734 **compiled, linted, and type-checked clean** (I fixed 3 small TS null-safety nits during validation). The container's tiny file-descriptor ceiling (4096) again kills Next's static-generation step with `EMFILE` — **same infra quirk as the last 4 nights, NOT the code:** I proved it by building *pristine main* (no new folder) — it fails identically. **Vercel builds this app fine and will deploy 734.**
- **Not browser-verified here** (no audio/WebGL in the sandbox) — unverified by eye/ear is whether the feedback field truly *reads as tape decay* on a real screen and whether the 7-minute arc holds your attention. Fallback synth + Canvas2D guarantee a sounding, moving glance regardless.

## Banked this cycle, ready to resurrect (IDEAS §475)
- **`733-paths-disintegrate`** ⭐ — the **WebGPU** sibling (40k compute particles). The bolder swing; resurrect once we confirm your review device runs WebGPU (likely yes on desktop Safari/Mac).
- **`735-paths-revenant`** ⭐ — the **three.js** sibling (60k `Points` volumetric ghost, Anadol-style fog). The warmest look; pair with real bloom on resurrection.

## Open questions for Karel
- On a real screen, does Tape Erosion feel like *your* recording decaying — does the disintegrate→reform arc move you, or does it need a tighter/longer total length?
- 734 is built to deepen (cycle-2): tie the decay to **onset/phrase detection** of your playing (so erosion follows your musical structure), add a long reverb tail for the *Ghost* movement, and a single-touch "press to resist the decay / hold a motif." Worth pursuing — or resurrect a sibling (733 WebGPU / 735 three.js) first?
- Still standing: **approve a `package.json` dep (Vercel KV / Upstash)?** — the one thing that turns `730-piano-room-jam` into frictionless room-code cross-device jamming (I can't touch `package.json`).
