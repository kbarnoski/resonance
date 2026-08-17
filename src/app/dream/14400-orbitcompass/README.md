# 14400 · Orbit Compass

## The one question
**"What if your whole catalog were arranged in a 360° ring around you in 3D space, and you turned — with your phone's compass or the arrow keys — to face and draw forward each recording?"**

A spatial-audio *compass instrument*. You stand at the centre of a warm dawn
horizon. Every one of Karel's real recordings hangs as a glowing amber orb on a
horizontal ring around you, equally spaced in azimuth (16 tracks → 22.5° apart).
Your **heading** chooses which recording you face: the nearest one is loudest,
brightest and fully open; the others fall off along a cosine (equal-power) curve
as they slide off-axis, and get progressively lowpassed the further they sit
behind you. Turning your body live-mixes the whole catalog.

## How to use it
1. Press **Enter the ring**. This unlocks audio, asks iOS for compass permission,
   and starts loading the catalog *nearest-your-heading first* — the first sound
   arrives a second or two later and the rest fade in as you turn.
2. **Turn to steer:**
   - **Phone** — the device-orientation compass turns the world as you physically
     turn your body.
   - **Desktop / no sensor** — `A` / `D` or `←` / `→` rotate the view. If the
     compass is denied or unavailable, keys just work and the input readout says
     so.
   - **Idle** — after a few seconds with no input the view drifts slowly on its
     own so the mix keeps evolving (respects `prefers-reduced-motion`).
3. The chrome shows the live input mode, how many recordings have loaded, and the
   title of the recording you're currently **facing**.
4. **Read the design notes** opens an in-page modal mirroring this file.

## Tags (why this brief was chosen)
- **INPUT** — device-orientation heading (compass), with `A`/`D` + `←`/`→`
  keyboard fallback and a gentle idle auto-turn. Not pointer-drag/click.
- **OUTPUT** — three.js 3D geometry: a ring of orbs + halos, a gold orbit line,
  and a shader sky dome. Not Canvas2D, not a full-screen fragment shader.
- **TECHNIQUE** — Web Audio spatial panning of the whole catalog. Each track:
  `BufferSource (loop) → StereoPanner (pan = sin Δazimuth) → gain (cosine
  equal-power focus) → lowpass (cutoff rises with focus) → shared safe master`.
- **PALETTE** — warm dawn/horizon: a deep indigo-to-amber-gold gradient sky and
  warm amber orbs (all as hex/HSL inside the three.js art; UI chrome stays on
  brand-neutral semantic tokens).

## Reference
Cheng Wang et al., **"A Scene Representation for Online Spatial Sonification"**,
arXiv:2412.05486 — a 360° circular rasterisation that projects a 3D scene onto a
ring where each angular position maps to a sound cue. Orbit Compass implements the
musical **inverse**: each recording is a *fixed* point on the ring, and the
listener's heading rasterises the ring into a live binaural mix.

## Audio source
Karel's real catalog **only**, via `_shared/welcomeHome`:
`REAL_TRACKS` (13 *Welcome Home* + 3 *Snowflake* = 16 verified tracks) loaded with
`loadRealTrackBuffer`. Zero oscillators / synths / generated tones. Every node
routes through the shared `createSafeMaster` ear-safety bus — nothing touches
`ctx.destination` directly.

All 16 tracks are spatialised. They decode **sequentially, nearest-heading
first**, and each fades in on arrival so peak decode memory stays bounded and the
first sound is quick. On a slow connection the far side of the ring can take a
little while to fill in; failed decodes are skipped with a notice and the rest
keep singing.

## Not yet verified
- Built to demoable quality but **not yet run in a live browser** — no on-device
  check of the iOS compass path (`webkitCompassHeading`) or the Android `alpha`
  fallback, and no measurement of how heavy 16 simultaneous full-track decodes
  are on a real phone. If 16 proves too heavy in practice, spatialising a subset
  (e.g. 8–12) is a one-line change to the ring size.
- Compass heading is treated as *relative* (turning rotates the ring); it is not
  calibrated to true north, which is fine for an instrument you play by feel.
- `tsc --noEmit` and `eslint` both pass clean for this file; the authoritative
  build is run by the orchestrator.
