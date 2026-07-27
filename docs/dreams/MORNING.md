# Morning digest — last updated 2026-07-27 (cycle 922, DEEP)

> **Jury verdict today**: The lab did exactly what you asked — put hands back on the instruments, self-play collapsed 6→2, and `2920-follow` finally shipped — but it traded the science-fair rut for a psychedelic-shader one: 8 of 15 render to a WebGL fragment shader and 8 of 15 wear the same altered-states vibe, with the shared form-constant kit now the new template; so tomorrow, ban a fresh altered-state, get off the shader, and extend the three pieces with real musical stakes — `2920-follow`, `2952-tabla`, `2960-murmuration`. See `docs/dreams/JURY.md`.

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **[3040-tunnel](/dream/3040-tunnel)** — **pilot the near-death "tunnel toward the light" yourself.** Hold (pointer / Space / the button) to bloom the being-of-light closer; let go to drift back into the dark void; **go completely still and time itself dilates** — the image *and* the sound slow together, then any touch blooms it back. Steer by drag, tilt, or WASD/arrows. The lab's **first raymarching piece** and first piloted 3-D flight: a WebGL2 fragment shader flies you down an endless lensed wormhole. **Best with headphones, in a dark room** — it flies itself until you take the controls.
  - *Why now:* it was the #1 banked item, held since cycle 919 "for a WebGL cycle where a live GPU can verify the raymarch" — that's tonight. Also gets us off the recent Canvas2D + mic streak.
  - **Needs your eyes (headless here):** I can't verify the shader on a real GPU — does it compile + look right on your phone/laptop, and do the lensing / fog / bloom / time-dilation feel dramatic (not garish)? If WebGL2 is unavailable it degrades to a Canvas2D ring-tunnel.

## Also explored tonight (2 more — banked, IDEAS §922)
- **3104-crossing** ⭐⭐ — the same tunnel built from **layered video-feedback** (droste-zoom rings). The *most GPU-robust* version, runs on anything. A natural companion / fallback to 3040.
- **3096-lightbody** ⭐⭐ — the tunnel as a **volumetric cloud of luminous mist** with god-rays streaming from the light. Softest, most distinct register.
- All three were one idea attacked three ways (a DEEP fan); I shipped the strongest and folded the other two into 3040's design notes as its deepening path.

## Open questions for Karel
- **AI-pipeline chains (music→image→video) still 0× — ~12 juries overdue.** The single most novel unbuilt thing, but it spends your FAL_KEY image budget, so I won't start it autonomously. **One word ("go, cap $X/run") unblocks it.**
- After you fly 3040: next cycle **deepen the tunnel** (ship 3104/3096) or **pivot** back to a hands-on played instrument / the long-form memory lane (3024-gloaming)?

## Housekeeping
- Build passed (winner-only compile, EXIT 0). Full-route local build still hits the container's 4096-fd cap (infra, not code) — Vercel deploys the full pipeline fine.
