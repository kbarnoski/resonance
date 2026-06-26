# Morning digest — last updated 2026-06-26 ~18:20 UTC (cycle 564, kids · WIDE)

> **Yesterday's jury** made its hardest KIDS ask ban #1: *"pentatonic-no-wrong-notes is the new kids crutch — ban it for a week. Give them a real mode, a functional progression, or genuine tension/resolution — not the can't-be-wrong scale."* It also said #3 *force a non-pointer input* (drag-on-glass is back to 7×). This kids cycle answers both — three explorers, each a **non-pointer input into REAL functional harmony**. See `docs/dreams/JURY.md`.

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **`972-kids-sing-garden`** ([open it](https://getresonance.vercel.app/dream/972-kids-sing-garden)) — **a child SINGS any note and a real harmonic garden grows a chord that genuinely SUPPORTS it — no wrong notes, but REAL functional harmony underneath, not a safe pentatonic.** **Why open it:** it's the directest answer to the jury's hardest kids ask. The child's voice is the melody (snapped to C-major so it's always in tune), but underneath, each sung scale-degree drives its real diatonic triad and **three inner voices + a bass voice-lead** to the nearest chord tones (Aldwell & Schachter) — and landing on 5→1 or holding the leading-tone 7→1 fires a true **V→I cadence** with a warm gold "home" halo. So a 4-year-old holds *real harmony*, not a safety scale. **Input = the microphone** (live YIN pitch detection, never recorded/sent — the non-pointer input the jury wanted); **output = Canvas2D watercolor** (the jury blessed Canvas2D as "fresh-again"): sing higher → a tall plant, each chord blooms a flower whose color = its harmonic function. Grounded in today's dive (RESEARCH §564 → arXiv:2602.06917, Feb 2026, *inverted*: a singing-mistake detector turned into a thing that refuses to mark a child wrong).

## Why this one, this morning
Of three kids explorers — all non-pointer inputs into real functional harmony — the sing-garden shipped because it makes harmony *from the child's own voice* (971-tilt = 3 fixed wells, 973-parade = a fixed loop the child only energizes), it's the directest hit on ban #1, it uses the jury-blessed Canvas2D, and it has the freshest research→build chain (the singing-mistake-paper inversion). The two others are banked, fully built — see below.

## Also explored tonight (banked, not shipped — full seeds in IDEAS §564)
- **`971-kids-tilt-cadence`** ⭐ — **feel a V7→I cadence in your hands**: TILT the tablet to roll a glowing marble from the orange "Tense" Dominant well home into the gold "Home" Tonic well, and the resolution blooms. Tilt-physics + Riemann T/S/D. The strongest kids hook banked — resurrect-first.
- **`973-kids-step-parade`** — **whole-body dancing** (front-camera motion) drives the tempo of a real I–vi–IV–V parade; stand still → it slows to a lullaby on home. The camera-sensor / embodied answer.

## Open questions for Karel
- **Verification debt is now the jury's #1 standing liability** (18 builds green-by-compile, ~0 actually heard/run — no audio/mic/camera/GPU in my sandbox; Vercel deploys fine). 972 needs a real mic to hear; `970-tension-gong` (keyboard-only) is the easiest to hand-verify. **Want me to spend the next cycle hand-verifying the strongest recent builds (970, 942, 952, 960) on a real device instead of shipping a 19th unheard one?**
- Build-infra FYI (non-blocking): `npm ci` kept failing this fire on `sharp`'s libvips download through the proxy; I built with `npm ci --ignore-scripts` (next build doesn't need sharp). No package files touched. Flag if you want this looked at.
