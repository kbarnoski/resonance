# Morning digest — updated 2026-07-08 (cycle 698, DEEP)

## Open this first
- **`1278-faraday-relief`** → https://getresonance.vercel.app/dream/1278-faraday-relief
  A vibrating fluid membrane you **play as tactile 3D liquid metal.** Drag to
  drive it and watch real displaced geometry rise into stripes → squares →
  hexagons → a **12-fold quasicrystal** — the same geometry your visual cortex
  hallucinates on closed eyes — with copper speculars sliding along the ridges
  as they lock. Each symmetry answers at the subharmonic **f/2** (the real
  Faraday signature) with its own chord; drop the drive below threshold and the
  surface goes flat and silent. Drag horizontally = frequency (which symmetry),
  vertically = drive strength, tap = drop a ripple. Best on a laptop/GPU.

## Why this one (the fire was DEEP — 1 concept, 3 built, 1 shipped)
- **Parametric Faraday-wave instability is grep-0× in the lab** — every prior
  cymatics/plate piece drives modes straight at the audio frequency; this is the
  first *parametric/subharmonic* one, and its emergent symmetries ARE the Klüver
  form-constants, so one engine is both a fluid instrument and a psychedelic-
  geometry engine. That cashes the concept jury's single loudest standing
  complaint — "criterion #1, a never-used technique, keeps getting declined" —
  for the **second fire running** (697 did it with the swarmalator).
- I built the same engine three ways and shipped the one that (a) escapes the
  still-banned "shader-field you stare at" via real 3D relief and (b) keeps the
  four symmetries genuinely distinct. The most beautiful sibling (a WebGL fluid)
  IS the banned form; the sand-plate sibling had a physics bug where a held
  hexagon slowly rots to stripes — so the relief won on correctness + surprise.

## Also explored — banked, ready to resurrect (see IDEAS §698)
- **⭐⭐ `1276-faraday-pool`** — the same idea as an oil-on-water WebGL fluid, and
  actually the **best engine of the three** (it solves the pattern-selection math
  the others ducked). Banked only because a full-screen shader field is the form
  the jury banned; its coupling model should get promoted into the winner next.
- **⭐ `1277-faraday-sand`** — a **cymatic sand plate**: thousands of grains flee
  the antinodes and pile onto the nodal lines, drawing each figure like the real
  cymatics photographs. The most one-glance-legible of the three — ship it once
  its held-pattern drift is fixed.

## Open questions for Karel
- The one genuinely-0× top rung still unbuilt is an **AI pipeline chain**
  (audio→image→video, 2 models in series). It needs a per-prototype paid-API
  budget I won't spend unattended — say the word and I'll build it.
- Housekeeping: the container's **file-descriptor build ceiling** is still only
  worked around (I build the winner in isolation each cycle). Raising `ulimit -n`
  on the runner — or capping Next's static-gen concurrency — would retire the
  dance.
