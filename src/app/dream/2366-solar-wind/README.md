# 2366 · Solar Wind

*A drone you stand inside, tuned right now to the real solar wind and geomagnetic
field between the Sun and the Earth. A live geomagnetic storm makes the aurora
overhead ignite and the harmony turn tense; a calm Sun leaves you in a quiet
cosmic void. The visitor takes nothing — the real sky does the work.*

This is a **cosmic-ambient**, not intense, altered-state piece. It is *about* the
actual current state of the Sun–Earth connection, not about the visitor's own
nervous system.

---

## The one question it answers

> *What if the drone were tuned, this minute, to the genuine Sun→Earth plasma and
> magnetic field — so you could **hear** whether a storm is coupling into the
> planet, and **see** the aurora respond honestly?*

---

## Real data (fetched client-side, CORS-open, no auth)

All endpoints serve `Access-Control-Allow-Origin: *` and are fetched directly in
the browser — no server route, no proxy. Verified live 2026-07-23. (The older
`/products/solar-wind/*-5-minute.json` and `plasma-1-day.json` paths now 404;
these RTSW/summary feeds replace them.)

| Feed | URL | Used for |
|------|-----|----------|
| RTSW wind (1-min, ~24h) | `…/json/rtsw/rtsw_wind_1m.json` | speed, density, temp + scrub history (filter `active:true`) |
| RTSW mag (1-min, ~24h) | `…/json/rtsw/rtsw_mag_1m.json` | Bz (`bz_gsm`), Bt + scrub history (filter `active:true`) |
| Planetary K-index (1-min) | `…/json/planetary_k_index_1m.json` | Kp (prefers fractional `estimated_kp`) |
| Wind-speed summary | `…/products/summary/solar-wind-speed.json` | lightweight "now" fallback |
| Mag-field summary | `…/products/summary/solar-wind-mag-field.json` | lightweight "now" fallback |
| Ovation aurora oval | `…/json/ovation_aurora_latest.json` | peak oval probability → curtain vigor |

**Robustness.** A hardcoded `FALLBACK_SNAPSHOT` (speed 450 km/s, density 5 p/cc,
Bz −2 nT, Bt 6 nT, Kp 3) is bundled, so the piece renders and *sounds* complete
with **zero network**. On success it upgrades to live values and shows a
`● LIVE · <UTC>` badge; on failure it shows a muted *"recent snapshot — live feed
unavailable"* note (never a red error — it still works). Polls every 60 s. The
"as-of" time comes from the data's own `time_tag`, not `Date.now()`.

---

## Mapping — five INDEPENDENT channels (no single master knob)

**This is a hard design rule.** There is deliberately no single 0→1 "calm→peak"
scalar. Each physical quantity drives its own axis, and the axes genuinely
**conflict**: the wind can be fast while Bz is northward and quiet, or slow while
a storm rages. So the piece can be **bright-but-tense** or **dim-but-calm** — a
state a single knob could never express. The readout line ("*the sky is: bright ·
tense · restless*") is assembled from three of these axes independently to make
the conflict audible and legible.

| Physical channel | Range | → Sound | → Visual |
|------------------|-------|---------|----------|
| **Solar-wind speed** | 250–800 km/s | drone base pitch (42–66 Hz) + lowpass cutoff (brightness) | overall curtain brightness |
| **Proton density** | 0–20 p/cc | number of active partials (2→7): thicker plasma = fuller chord | — |
| **Bz sign & magnitude** ⟵ the crux | ±12 nT | northward = open fifths/octaves; southward morphs the fifth → tritone and detunes upper partials into a beating minor-second shimmer | red-tip storm energy |
| **Bt (total field)** | 0–25 nT | sub-bass oscillator weight | low-horizon airglow thickness |
| **Kp index** | 0–9 | top-voice tremolo rate (0.2–3 Hz) | aurora agitation + colour shift toward red / magenta |

Bz-tension, speed-brightness and Kp-agitation are computed on separate axes and
never multiplied into one number — that independence is the whole instrument.

All audio parameter changes are slewed with `setTargetAtTime` (~2–3 s), so
retuning (live update *or* time-scrub) is smooth and never clicky.

---

## Visual — WebGL fragment shader

A full-viewport `three.js` `ShaderMaterial` on a fullscreen quad renders a
volumetric **auroral curtain** (domain-warped fBm noise, vertical fringed
striations, slow horizontal drift) over a twinkling **starfield**. Slow and
meditative — drift, not strobe. Any luminance shimmer is hard-clamped to **≤ 3 Hz**
in the shader, following `_shared/psych/safeFlicker.ts`. `prefers-reduced-motion`
slows the drift further.

**Palette = real auroral emission lines**, not jeweled violet-gold:

- **Oxygen green, O I 557.7 nm** — the calm base, faint and low on the horizon.
- **Oxygen red, O I 630.0 nm** — high-altitude red tips, appearing only with
  storm energy (Kp + southward Bz).
- **N₂⁺ blue/violet ~427–470 nm** — magenta fringes, only at high Kp.

Calm sky = a faint green band low down. Storm = tall, bright, red-tipped,
restless curtains climbing high with magenta fringes.

**Degradation:** if WebGL is unavailable the canvas is replaced by an animated
CSS auroral gradient (still moving, colours still driven by the live channels)
plus an on-brand note — never a blank screen.

---

## Interaction

- **Begin** — resumes the (until-then suspended) `AudioContext`, 1 s master
  fade-in, master gain 0.2. Silent until this gesture; clean teardown on unmount.
- **Time-scrub (24h)** — a slider that replays the last ~24 h of solar-wind data
  from the RTSW window; dragging it re-tunes both aurora and drone to that past
  moment, so you can *hear the Sun's last day*. Snapping to the right edge (or the
  "→ now" button) returns to the live front.
- Otherwise it runs untouched as an ambient piece once begun.

---

## Named references (ground truth)

- **Auroral emission-line physics** — the green/red/violet palette is anchored on
  the real forbidden and allowed transitions: **O I 557.7 nm** (green) and
  **630.0 nm** (red) atomic oxygen lines, and the **N₂⁺ First Negative band**
  (~427.8 nm) blue-violet emission. See Chamberlain, *Physics of the Aurora and
  Airglow* (1961), the standard reference for these line identifications.
- **Real-data sonification lineage** — NASA Heliophysics' *"Sounds of Space"*
  sonifications of Van Allen Probes / heliophysics data, and **Ryoji Ikeda's**
  *datamatics* ethos of raw data as sonic and visual material, are the tradition
  this piece works in: the data is not illustrated, it *is* the instrument.

---

## Files

- `page.tsx` — the client component: WebGL shader, Web Audio drone, fetch/poll,
  time-scrub, Begin gesture, teardown.
- `solarWind.ts` — NOAA fetch + parse + robust fallback, and the pure
  `deriveChannels()` mapping to the five independent axes.
- `README.md` — this file.
