# Morning digest — last updated 2026-06-27 ~02:30 UTC (cycle 568, kids · WIDE)

> **The jury's hardest KIDS ask** (provocation #1): *"pentatonic-no-wrong-notes is the new kids crutch — ban it; give them a real mode, a functional progression, or genuine tension/resolution."* Plus #3: *"force a non-pointer input — drag-on-glass is back to 7×; embodied, not a finger."* This kids cycle answers both, three different ways. See `docs/dreams/JURY.md`.

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **[/dream/978-kids-cloud-weather](/dream/978-kids-cloud-weather) — Conduct the Sky** ⭐ (cycle 568, kids). **A 4-year-old conducts a bright musical sky with their whole body — and it's the *quality* of the movement, not where they tap, that makes the music.** Reach up = higher notes; a big sweep = a loud bloom of flowers; a sudden burst = a sparkly pluck + shooting star; smooth motion = a long sung tone. Real **C-Lydian** mode (the dreamy raised-4th color), never a no-wrong-notes pentatonic. **Why open it:** it's the freshest input in the kids lab (whole-body camera, 0× recently) and the clearest "off the glass" answer yet — front camera, no app, no ML download. *Best propped up with a webcam; without one, a ghost auto-conductor paints and plays the sky on its own.*

## This was a WIDE fire — 2 more kids explorers built + banked (IDEAS §568)
- **979-kids-happy-sad-tree ⭐** — the most *robust* one (no permissions, plays instantly anywhere): tap glowing fruit, then flip one big ☀️/🌙 switch and the SAME song turns happy↔tender as the world flips **major↔minor**. The single most literal "feel real harmony" toy. Worth resurrecting.
- **980-kids-shake-bells** — SHAKE the tablet (accelerometer, off-glass) to ring WebGPU handbells that build a real **I–IV–V–I** cadence and resolve home.

## Research that drove it (RESEARCH §568)
- **BeSound / Rudolf Laban's Theory of Effort** — embodied music education that maps *movement quality* (weight, time, space, flow), not just position, to sound. 978 turns that into the kids instrument: the *kind* of movement is the expression.

## Open questions for Karel — verification debt (the jury's #1 liability, 3+ juries running)
- All recent ships (978 included) are **compile/lint/type-clean but never run** — no GPU/camera/audio/accelerometer in the build container, and Next static-gen dies on the container's locked ~4096 file-descriptor ceiling (`EMFILE`), so I can't self-verify at runtime. **Two real fixes, both need you:** (a) raise the container fd ceiling so static-gen runs locally, or (b) a 2-minute hand-verify on a real device. **979 is the easiest kids piece to verify** (zero permissions, any phone/laptop); **970-tension-gong** remains the easiest overall (keyboard-only). I keep every build glance-safe via auto-demos regardless.
