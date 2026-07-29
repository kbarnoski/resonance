# Morning digest — last updated 2026-07-29 (cycle 948, DEEP)

> **The jury named two peaks worth extending — `3608-atlas` and `3552-forage` — and its provocation #2 was "spend a cycle DEEPENING, not minting: criterion-4 multi-cycle is 0-for-6 windows, the missing discipline." Atlas got its v2 (`3648-songlines`, cycle 946). Tonight took the un-done half: forage's exact words, "let two swarms on two food-fields duet."** See `docs/dreams/JURY.md`.

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **[3704-membrane](https://getresonance.vercel.app/dream/3704-membrane)** — **two slime-mould swarms in two separate fields, and the permeable MEMBRANE between them is the instrument.** `3552-forage` was one swarm singing its own network; this makes the **coupling between two networks** the played object. Press **`←`/`→`** to sweep membrane permeability: turn it **up** and both swarms grow to the boundary, meet, and their two hard-panned voices (left swarm = left ear, right = right) **lock into call-and-response**; turn it **down** and each forages alone, the voices **drift into independent counterpoint**. The lock isn't the knob — cross-membrane *connectivity* is measured each frame, so it takes a few seconds of real growth before they sing together. `1–8` drop food; a seeded autopilot sweeps permeability 0→1→0 over 48 s so it plays itself before you touch it.

## Why this one
It's the **deepening the jury asked for** — the lab's **first coupled multi-body emergent system**, and its first deliberate criterion-4 v2 of a named peak. The interface *is* the coupling: one legible knob moves the whole piece between two soloists and one locked duet. Non-pointer keyboard (clears the touch ban), biological emergence (not a physics-model — clears the second ban), WebGPU compute + Canvas2D fallback.

## Also explored this DEEP cycle (built + banked, not shipped — IDEAS §948)
- **`3696-antiphon`** (⭐⭐) — two rival slime-mould **species on one shared field** fighting over regrowing food, and **you HUM to feed one of them** (mic-pitch input). The fan's boldest input; held for a mic/embodied window.
- **`3712-canon`** (⭐⭐) — a **WebGL2** port (runs on any GPU, no WebGPU) with a literal **lagged canon** (swarm B imitates A's past). Designated the **next-cycle deepening** of Membrane — fold its canon channel in so permeability morphs imitation→canon→counterpoint.

## Research (RESEARCH §948)
- Two fresh 2026 statements of one thesis — music as the **emergent by-product of coupled agents**: *The Agentic Symphony* (Meera Sundar, ADCx India 2026) and *MusicSwarm* (Buehler 2026). Forage had one body; the coupling was the unbuilt move. Chain: today's research → today's build.

## Open questions for Karel
- **Does the membrane lock read as two voices *finding each other*, or just as an EQ sweep?** Built headless — it needs your ears (stereo/headphones) to know if the couple-locking lands. This is the one to actually *play* with the `←/→` knob.
- **Keep deepening, or go wide again?** Criterion-4 is the jury's stated frontier; `3712-canon` is teed up as Membrane's v2 — say the word and next cycle deepens instead of minting.
- **Unblock the AI-pipeline chain (music→image→video)?** Still 0× — needs your explicit go-ahead + a per-run `FAL_KEY` $ cap.
