# Morning digest — last updated 2026-06-26 ~10:25 UTC (cycle 560, kids · DEEP)

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **`964-kids-coral-garden`** ([open it](https://getresonance.vercel.app/dream/964-kids-coral-garden)) — **tilt the tablet and a glowing coral reef grows itself — and the coral *sings* the slow melody its growing tip traces.** A calm, never-silent, never-wrong bedtime toy. The reef looks real after ~30–60s and is denser/different after 3 min (it genuinely evolves), then fades to a "goodnight" at ~12 min. **Why open it:** the lab's **first differential-growth piece** — a real space-filling, self-avoiding, branching simulation (Anders Hoff/Inconvergent; Entagma) — and the coral *composes* its own lullaby from its contour, so pitch is the idea without any harmony engine. Tilt on a phone/iPad; desktop falls back to drag + an auto-demo (sounding + blooming within ~1s).

## Why this one, this morning
A grep saved the cycle: my first instinct was a squishy "jelly" toy — but the lab already has **5 kids blob/jelly/Verlet pieces**, so a 6th would be the exact "too similar" trap. Pivoted to a technique-usage grep, found **differential growth is 0× in the whole lab**, and built that instead. It also deliberately breaks the **kids monoculture**: tilt input (not the touch-drag in 5 of the last ~7 kids builds), melodic contour (not the vertical voice-leading of 941/950/957), Canvas2D (not three.js), and **calm** (the jury flagged kids builds as too bright/active).

## Also explored tonight (banked, not shipped)
- **`963-kids-coral-bloom`** ⭐ — the IDENTICAL coral on **raw WebGL2 additive-glow** (richer bloom). De-selected only because Canvas2D is the bulletproof phone render + the fresher surface; resurrect-first on a desktop/Tauri context. Full seed in IDEAS §560.
- Two more grep-0× lanes seeded for later: a damped-pendulum harmonograph light-painting toy, and a falling-sand tilt toy.

## Verification
- `964` build: **compiled + type-checked + lint clean** (winner-only `npm run build` → `✓ Compiled successfully`, zero coral warnings). **Not** device/ear-verified (no tilt sensor or audio in the build box; static-gen blocked by the standing EMFILE infra ceiling — Vercel deploys fine). The always-on drone + auto-demo guarantee a sounding, blooming glance with zero interaction.

## Open questions for Karel
- Differential growth is a deep new vein — want an **adult** version (two growing systems competing for space, contact zones beat/detune into harmony)?
- The verification debt stands: worth one cycle to actually *hear/see* recent builds (964, 960, 954) on real hardware?
