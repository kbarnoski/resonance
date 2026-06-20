# Morning digest — last updated 2026-06-20 ~02:20 UTC · cycle 487

**Open first:** https://getresonance.vercel.app/dream

## New since yesterday
- **[766-sky-orrery](https://getresonance.vercel.app/dream/766-sky-orrery)** 🌌🎹 (adult) — **Sky Orrery.** Stand under a real 3D dome of the sky: the sun, the moon (correct phase tonight), and eight bright stars/planets (Sirius, Vega, Jupiter, Venus…) sit at their **actual computed altitude/azimuth** for your time & place, the dome turns with sidereal time, and **whichever bodies ride highest conduct a long-form, never-repeating arrangement of whole *phrases* of your real *Welcome Home* piano** — each body a voice, altitude→loudness, azimuth→pan. *Atlas Eclipticalis* made literal: **sky position = score position.** Zero interaction — it plays itself; drag the time slider to flip noon→midnight and hear the arrangement change. **Why open it:** your real recording used a *new* way — not shattered into grains, but **conducted by the sky** (the jury's #1 ask), and a deepening of `347-the-place` (which only used synthesis).
- *2 more renderers of the same idea built + banked — an SVG sun-arc dial (`764`) and a Canvas2D sky-color field (`765`). See IDEAS §487.*

## In progress / partial
- Nothing mid-build. DEEP fire: one concept (the sky conducts your piano) built 3 ways in parallel, shipped the strongest renderer, banked 2 as text seeds.

## Research findings worth a look
- **Astronomy is going multimodal/sonified in 2026** (Trayford, "Unseen Astronomy," arXiv Apr 2026; NASA's "A Universe of Sound"). The lab already sonifies the sky (`347`) — the open move was letting the **real sky conduct your real recorded piano**, which is exactly what `766` does. (RESEARCH §487.)

## Open questions for Karel
- **Renderer rotation is genuinely tight now.** SVG/DOM and Canvas2D are *both* at 3× in the last 10 (each one ship from the audit ban), three.js sits at 2×, GPU-shader-fields are jury-banned. `766` used three.js precisely to dodge that. Worth a call: lift the GPU-shader ban soon, or push hard into the thin **audio-only / projection / installation** registers next?
- **Two strong banks from this fire:** `764-sky-almanac` ⭐ (the calm SVG sun-dial version — the safest unattended daylight glance) is the adult resurrect-first once SVG cools; `765-sky-spectra` (the painterly Canvas2D sky-*color* version) for an atmospheric slot.
- Standing: the dream build can't run Next static-gen in this container (4096 fd ceiling — pristine main fails identically). Compile + lint + types verified green every fire; Vercel deploys fine. The fix is infra (raise the container ulimit), not code.
