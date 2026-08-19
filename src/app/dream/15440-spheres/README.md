# 15440 · spheres

## The one question

**What if the real, current sky conducted Karel's own piano — the true positions
of the planets right now layering his recordings into an ever-different music of
the spheres?**

## What it is

An immersive 3D heliocentric orrery in raw three.js. You float in a slow, hands-off
cosmic drift around a glowing sun. The six classical planets orbit at their **true
current heliocentric ecliptic longitudes**, computed from the clock (no network),
using the JPL / E. M. Standish low-precision Keplerian formulae (valid 1800–2050).

Each planet is a **voice** made of one of Karel's real recordings, always faintly
present. When two planets fall within a ±6° orb of a real aspect, a luminous
**harmony line** brightens between them and their two piano voices **swell
together**. The geometry of the heavens is literally what you hear.

A secondary **time-flow** slider advances a simulated clock so the sky visibly
drifts and aspects form within seconds (default ≈ a few days per real second, up to
years per second); a **now** button snaps back to the real moment. This makes the
piece both long-form/evolving and demoable immediately.

## The celestial → audio mapping

| Celestial quantity | Computed how | Drives |
| --- | --- | --- |
| Heliocentric ecliptic longitude λ (per planet) | Solve Kepler's equation from Standish elements + per-century rates at the simulated time | The planet's true angle on its orbit ring |
| Heliocentric distance r (AU) | `a·(1 − e·cosE)` | Compressed screen radius `3 + 9·log₂(1+r)` (keeps Saturn on-screen, true angle) |
| Pair separation Δ (0–180°) | Folded angular difference of two λ | Which aspect, if any, is active |
| Aspect (0/60/90/120/180°, ±6° orb) | `|Δ − angle| ≤ 6` | A harmony line + a voice swell |
| Aspect tightness (1 exact → 0 at orb edge) | `1 − |Δ − angle|/6` | Line opacity; added gain `tightness·0.5` to **both** planets |
| Consonant aspect (0/60/120) | table lookup | Warm/bright line; voices swell **in tune** |
| Tense aspect (90/180) | table lookup | Dimmer cooler-tinted line; voices swell with a **subtle detune** (~±0.03 playbackRate) |
| Low-band audio energy | `master.analyser` FFT | Sun radius/glow pulse + point-light intensity |

**Gain law per voice:** base ≈ 0.06 (always faintly present) + Σ over every aspect
the planet is in of `tightness·0.5`, clamped ≤ 0.9, smoothed with
`setTargetAtTime(target, now, 0.4)` so it is glacial and never zippers. Sun bed
holds a steady ≈ 0.18. Everything routes through the shared ear-safety master; the
master alone touches `ctx.destination`.

### Voices (Karel's catalog only — zero synthesis)

| Body | Recording |
| --- | --- |
| Sun (bed) | Welcome Home |
| Mercury | Interplay |
| Venus | Bath |
| Earth | 2019 |
| Mars | The Knife |
| Jupiter | Rolling |
| Saturn | Isolation |

All IDs are verified anon-servable in `_shared/welcomeHome.ts`. Loaded up front with
`Promise.allSettled`; any track that fails to load is skipped and the rest continue.
If none load, an on-brand error (destructive token) is shown.

## Named references

- **Kepler, _Harmonices Mundi_ (1619)** — the planets' angular-velocity extremes
  form musical ratios; the founding claim that the heavens' geometry is music.
- **Holst, _The Planets_ (1914–16)** — each planet as a distinct orchestral voice.
- **JPL / E. M. Standish low-precision planetary formulae** — the Keplerian
  elements and per-century rates used by `ephemeris.ts`.

## House-style / safety notes

- three.js (already a dependency), imperative renderer in a gesture-gated,
  SSR-safe `"use client"` component. Full teardown on unmount: sources stopped,
  nodes disconnected, `master.disconnect()`, RAF cancelled, geometries/materials/
  textures/renderer disposed, `ctx.close()`.
- Degrades gracefully: if WebGL fails, an on-brand notice shows while the audio
  keeps playing.
- Full-chromatic warm planetary palette inside the art (raw hex only in three.js);
  semantic tokens only for all chrome. Respects `prefers-reduced-motion` (slower
  drift). Only slow luminance drift — no flicker.

## Honest limitations

- **Not verified with sound or a GPU.** This environment is headless: I could not
  hear the voices swell, confirm the WebGL scene renders, or watch a real aspect
  form. `tsc --noEmit` and ESLint both pass on these files; the audio graph,
  ephemeris math, and teardown are written to the shared contracts but the
  audible/visual result is unverified end-to-end.
- Inclination is intentionally ignored for the art (planets drawn on a flat
  ecliptic plane); longitudes are the low-precision Standish solution, not JPL
  DE-ephemeris grade — accurate to well within the ±6° aspect orb for the art's
  purpose, not for actual astrology or navigation.
- Screen radii are compressed (log map), so distances are expressive, not to scale;
  angles are true.
