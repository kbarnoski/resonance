# Morning digest — last updated 2026-07-15 ~14:40 UTC (cycle 786)

> **You said "leave the workshop, get off Canvas2D, go back to the psychedelic core on the cosmic-ambient/dream pole" — this fire does all three at once.** A WIDE fan of 3 altered-states pieces, none on Canvas2D, re-injecting the two thin poles. Shipped the WebGPU-compute one.

**Open this first:** https://getresonance.vercel.app/dream/1740-breath-nebula

## New since yesterday
- **1740-breath-nebula** (WIDE-winner) — **breathe toward the mic and a living cosmic nebula breathes with you: inhale blooms a cloud of ~hundreds-of-thousands of GPU points outward into warm-white light, exhale collapses it into cold violet filaments.** The lab's **first real WebGPU-compute piece in ages** — a WGSL `compute` shader advecting a persistent GPU particle buffer through a 3-D **curl-noise** flow field + a signed breath force. This is the literal answer to today's jury **#3** ("get off Canvas2D — force a WebGPU-compute piece, still near-0×") **and #2** (back to the cosmic-ambient pole).
- **Why it matters:** the jury's biggest structural note was the Canvas2D monoculture (7 of 15). This doesn't dodge it with three.js — it opens the *hardest* substrate the lab keeps not building. No mic? It breathes on its own (~0.1 Hz), alive at your 06:30 glance. Sound is an inharmonic breathing pad + wind + bells — deliberately **not** a pretty JI drone.
- **Fresh anchor (finally sub-14-day):** built on **ASTRODITHER** (Robert Borghesi, webgpu.com, **2026-07-01 — 14 days old**), the first research find under the <14-day bar in **27 cycles**. WebGPU compute is now a mainstream artist tool, not a research toy.

## Also explored this fire (WIDE — 2 more built, banked to IDEAS §786)
- **⭐⭐ 1742-drift-lattice** — a hypnagogic sleep-onset lattice that **sinks deeper the quieter/stiller your room gets** (silence is the reward). The §780 banked dream-seed, now **off Canvas2D** (three.js shader) and with its old "takes 15 s to feel the causal link" flaw **fixed** (a fast stillness channel reads in <5 s). **Fills the DREAM pole you named empty. Top ship-next.**
- **⭐ 1744-void-bath** — close your eyes: a boundless NDE void built **entirely of sound** placed around your head (6 HRTF-spatialized drones, turn with device tilt). Cashes the **audio-only** menu item that's been empty for months + the HRTF research. Made speaker-safe, best on headphones.

## Research findings worth a look
- **ASTRODITHER** (webgpu.com, 2026-07-01): WebGPU + Three.js + TSL audio-reactive fluid/particle sim — "all signal until the music pushes it around." Seeded 1740 directly. (RESEARCH.md §786.)

## Open questions for Karel
- **The rhythm/grit turn (784–785) is paused; this fire pivots back to psychedelic cosmic-ambient/dream per your jury.** Good call, or keep alternating grit ↔ cosmic? Say the word.
- **The ≥2-model AI-pipeline chain (audio→image→video) is STILL 0×** — the jury's #4, the oldest unmet menu item, blocked only on your per-prototype paid-budget go (rule #6). Want a cycle on it? One yes unblocks it.
- **Two housekeeping items (nothing broke — flagging so you know the guard held):** (1) the full `npm run build` can no longer finish in the cloud sandbox — ~1700 routes now exhaust its 4096 open-file cap during page-data collection (I proved the *untouched* repo fails identically; **Vercel is unaffected, production builds fine**). I validated 1740 via `tsc --noEmit` + folder eslint (both clean) instead. Might be time to archive very old dream routes, or raise the sandbox fd cap. (2) `npm ci` here now needs `--ignore-scripts` (a `sharp`/libvips download 403s through the proxy).
