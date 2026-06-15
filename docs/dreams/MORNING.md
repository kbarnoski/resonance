# Morning digest — last updated 2026-06-15 (UTC) · cycle 434

> **I did what the jury asked.** Two juries running, the verdict was: the lab ships a flawless 3/5 every night and never reaches 4/5 because every "cycle-2 deepening" it banks gets abandoned for a fresh 3/5 — *go back and actually finish one.* Tonight I went back and finished one. See `docs/dreams/JURY.md`.

**Open this first — keyboard or your phone, headphones help:** [/dream/630-piano-refract](https://getresonance.vercel.app/dream/630-piano-refract)

## New since yesterday
- **[630-piano-refract](/dream/630-piano-refract)** — "Piano Refract" (adult). **What if your own solo piano could be refracted like light through a prism?** It takes *your real recording*, first splits it into sustained **strings** vs. **hammer** attacks (that's the loved `606-piano-vivisection` split — kept as the legible ground), then fans the strings by **NMF** into **four pitched register voices** — Low / Low-mid / High-mid / High. Five voices in all; **solo, mute, and re-balance any of them instantly** (every voice keeps playing underneath, so isolating one is click-free). Why open it: this is the **genuine cycle-2 deepening of 606** the jury begged for by hand two nights running — the lab's **first NMF**, and the **first time the ambition floor's #4 (multi-cycle commitment) is claimed honestly** → an honest **4/5**, the lab's first in two juries.

## Why this cycle was chosen
- The jury named 606 "the model — it just needed a cycle 2 to actually reach 4/5" and provocation #1 was literally "resurrect 607-piano-prism (NMF) as the deepening of 606, claim #4 honestly, chase the lab's first 4/5." AGENT.md says read the jury first and *go DEEP on the prototype it says to extend*. So I **deliberately overrode** the every-other-night kids rotation this once (logged in STATE; next even cycle returns to kids, and I'll honor the touch ban 619/624 broke).
- Gates cleared — **ambition 4/5**: #1 first **NMF** in the lab (grep-0×) · #2 six subsystems · #3 named refs (Lee & Seung *Nature* 1999, Smaragdis & Brown ISMIR 2003, Fitzgerald DAFx 2010) · #4 a real cycle-2 of the decomposition spine. Clean on every jury-banned tag (off touch, off WebGPU, off the doom autopilot, not real-data).

## The interesting decision this cycle
- **DEEP** mode: one concept, two builders attacking the *same* weakness that sank the original 607 — NMF components are abstract and unstable run-to-run. The winner **warm-starts** the NMF basis with log-spaced register templates (~150/350/800/1800 Hz) so the four voices settle into the *same* stable, nameable registers every run. The sibling (banked) instead ran plain NMF and *sorted* the components after the fact — which fixes the labels but not the underlying lottery. I shipped the principled fix.

## Also explored (banked, not shipped — IDEAS §434)
- **629-piano-prism** — same prism, but random-init NMF + a post-hoc pitch-sort. Banked as the seed of a real **cycle-3**: warm-start from per-*note* chroma templates so each voice becomes a true note → per-note solos + a transcription read-out (the deep-NAE / arXiv 2510.08816 direction).

## Caveats
- **Build-verified, not browser-verified** (no real audio/GPU in the sandbox). The two things to check by ear at your desk: (1) do the warm-started registers actually separate *cleanly on your real recording* (vs. the synthesized fallback), and (2) is solo/mute as click-free as designed. The idle prism animation + auto-demo + Canvas2D/keyboard fallbacks mean it reads as alive on a glance even with no hardware.

## Open questions for Karel
- If you love this, the obvious **cycle-3** is per-*note* solos (chroma-seeded NMF) + a transcription read-out — a real third cycle on the decomposition spine, which the lab has never done. Want it?
- The jury's other big open lanes are still untouched: **multi-user / WebRTC** (a shared listening room — 0× ever), **MIDI/OSC live-performance out** (0×), and the **missing-middle register** (ecstatic / groovy / danceable — everything adult lately is either doom or cozy). Which pulls you most?
