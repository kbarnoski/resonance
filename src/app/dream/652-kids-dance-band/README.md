# 652 — Kids Dance Band

> **What if a 4-year-old could make a band play by DANCING?**

The child dances in front of the webcam. The app measures *how much* they are
moving (motion energy, via pure pixel frame-differencing — **no ML model**), and
a groovy, always-in-key band responds: more movement stacks more layers and the
lights get brighter; stillness eases it back to a gentle pad. This is the
explicit **ECSTATIC / DANCEABLE "missing middle"** for kids — not warm-glow,
not silly-creature, but a dance party you drive with your whole body.

## How it works

**Input — webcam whole-body motion energy (frame-differencing).**
The webcam frame is drawn (mirrored) into a tiny offscreen `32×24` canvas. Each
animation frame we read that grid, convert to grayscale, and take the
per-cell **absolute difference** from the previous frame. A small noise floor
(`<14`) is zeroed so a still room reads as silence. We sum the diffs into one
**global energy** value `0..1` and compute a diff-weighted **spatial centroid**
`(cx, cy)`. No body model, no landmarks — just pixels.

**Smoothing & tiers (anti-flicker).**
Raw energy is fed through an asymmetric running-average low-pass (fast attack
`k≈0.28`, slow release `k≈0.06`) so the band leans in quickly but lets go
gracefully. The smoothed value selects one of **5 discrete intensity tiers**
with **hysteresis** (separate `TIER_UP` / `TIER_DOWN` thresholds) so layers
don't chatter on/off at a boundary:

| tier | what plays |
|------|------------|
| 0 | soft sustained pad (always on — never silent) |
| 1 | + four-on-the-floor kick |
| 2 | + bass line + hi-hats |
| 3 | + snare backbeat + melody shimmer |
| 4 | FULL PARTY — busy hats, syncopated kick, pentatonic melody |

**Clocked, layered groove engine (look-ahead scheduler).**
A `112 BPM`, 16-step bar runs on a **Chris Wilson look-ahead scheduler**: a
`setInterval(25ms)` pump schedules notes ~120 ms ahead against
`audioCtx.currentTime` — **never** from `requestAnimationFrame`. Layer
add/remove and all hits land on the step grid, so intensity changes feel
**musical, not twitchy**. Everything is in A minor pentatonic, so all movement
is harmonically valid — there is no "wrong". The horizontal centroid pans the
melody left/right; energy raises filter/voice gains and brightness.

**Output — glowing particle/energy field (Canvas2D).**
A trailing particle field erupts from the motion centroid; spark count, speed,
and hue scale with energy (violet when calm → warm gold at full party). A coarse
**motion-heat overlay** lights up exactly where the body moved, and a ring
**flashes on every downbeat**. Canvas2D was chosen over three.js for a light,
dependable glow field (the brief permits this); it is NOT WebGPU.

**Privacy / safety.** The camera stream is used only on-device via
`getUserMedia`; **no frames are stored or sent anywhere** (no network calls).
A small reassuring note says so. Sounds use soft attack envelopes and a 1.2 s
master fade-in — no sudden loud transients or harsh ringing.

**Graceful degradation.** Audio starts first, so the band is *never* broken. If
the camera is denied/unavailable, a `text-rose-300` message appears plus large
(≥64 px) fallback controls — 🌙 calm / **DANCE!** / 🔥 more — and Arrow Up/Down
keys, all driving the same energy signal so the piece fully demos with audio +
visuals.

## Tags
- **INPUT:** webcam / whole-body motion energy (frame-differencing). No touch as primary input.
- **OUTPUT:** Canvas2D glowing particle/energy field — trails, pulses with movement, flashes on the beat. Not WebGPU.
- **TECHNIQUE:** motion-energy estimation on a 32×24 grid → global energy + coarse centroid → groove tiers (hysteresis) → clocked, layered, in-key groove engine.
- **PALETTE / VIBE:** ecstatic, vivid, danceable, joyful — a dance party.

## Named reference
- **Golan Levin & Zachary Lieberman** — *Messa di Voce* / *Manual Input Sessions*: body/voice as continuous, reactive AV input.
- **IRCAM ISMM** line of research on sonifying movement *qualities* (energy / fluidity / impulsivity), and research on **children's spontaneous-movement sonification** (cross-modal body-quality → sound). This prototype targets the "energy" quality specifically.

## What's unverified
- Could not run `npm run build` in this sandbox — `node_modules` is not installed and `npx next` pulled a mismatched Next version that choked on the repo's webpack config. Validated instead by isolated `tsc --noEmit` (clean) and manual review against the brief's ESLint pitfalls (no `use*` helpers, no unused vars, escaped JSX entities, ref-only effect deps, look-ahead scheduling not in rAF). A real `npm run build` should still be run.
- Motion-energy thresholds (`TIER_UP`/`TIER_DOWN`) and the `6×` energy normalization are tuned by reasoning, not on a real child in a real room — lighting, camera FOV, and distance will shift them. Needs live calibration, ideally an auto-gain that adapts to the room's baseline.
- Frame-difference reacts to *any* pixel change (lighting flicker, a passing sibling, camera auto-exposure), not specifically the dancer. A next cycle could add a slow background model or per-cell adaptive baseline.
- Untested on iOS Safari specifically (AudioContext-in-tap + `playsInline` are in place but unverified on device).

## What a next cycle would deepen
- Auto-calibrating energy gain so it works the same in a bright vs. dim room.
- Sonify *more* movement qualities (jerky vs. flowing → staccato vs. legato; up vs. down → register), per the ISMM body-quality line, not just gross energy.
- A three.js / instanced-particle upgrade for a denser, bloom-lit field once the Canvas2D version proves the interaction.
