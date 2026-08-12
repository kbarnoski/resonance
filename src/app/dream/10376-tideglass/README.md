# 10376 · Tideglass

**The one question:** *What if you could TILT your device to steer a luminous
drop across a shallow iridescent tide-pool, and the pool RECORDED your whole
gesture as a standing wake you can REPLAY, scrub, and LAYER a second pass over —
a canon of your own hand's motion?*

Tideglass is a **record-a-trajectory / replay-a-phrase instrument**. You tilt a
bright droplet through a shallow nacreous tide-pool; as it moves it sheds an
expanding iridescent wake and strikes struck-glass bells. The pool captures your
gesture deterministically and plays it back — the *same* path re-draws the *same*
wake and re-strikes the *same* sound, every time — and you can overdub a second
pass on top so your drops answer each other in a canon.

---

## Named reference

**Golan Levin — _Yellowtail_ / _Audiovisual Environment Suite_ (MIT, 2000).**
In Yellowtail you draw a gesture and it loops back as an animated, sounding
stroke — the mark becomes a living, replaying audiovisual phrase. Tideglass
borrows that verb (trace → loop → layer) and re-casts the stroke as a tilt-steered
droplet leaving a standing water-wake.

---

## How it works (subsystems)

- **Input — device tilt.** A `deviceorientation` listener maps `gamma`
  (left/right) and `beta` (front/back, calibrated to a neutral captured on the
  first reading) to *acceleration* on the droplet, which integrates like a marble
  in a shallow tray with soft walls. On iOS 13+, `DeviceOrientationEvent.request`
  `Permission()` is called **inside the Start tap** (feature-detected); elsewhere
  the listener is simply added.

- **Output — WebGL2 (`webgl.ts`).** A single `#version 300 es` fragment shader
  over a fullscreen triangle. The **wake is analytic**: a sum of expanding,
  decaying cosine ring-waves, one "stamp" shed each time the droplet travels a
  little. The shader finite-differences that height field for a normal and shades
  it as **nacreous oil-on-water** — a deep aqua-teal pool floor with thin-film
  iridescence (a cosine palette kept in the mother-of-pearl green/teal/violet
  range) riding the surface slope and a Fresnel term, plus a crisp crest specular.
  Each active droplet is a bright caustic bloom on top. No float render targets
  are required, so it survives hostile GPUs.

- **Record / replay / layer.** The recorder stores a trajectory as a time-stamped
  list of `{t, x, y, speed}` keyed to a 12 s loop clock. When the loop wraps, the
  pass is frozen into a **take** and immediately begins replaying. Replayed takes
  re-drive their own droplets, which shed the identical wake and strike the
  identical bells — *deterministic replay is the whole point*. **Layer** overdubs
  a fresh pass while existing takes keep looping underneath (the canon); **Clear**
  wipes every take back to a fresh recording.

- **Audio — Web Audio, inharmonic (`audio.ts`).** Everything routes through the
  shared `createSafeMaster(ctx, { gain: 0.16 })` limiter. **Ripple-bells** are
  banks of decaying sine partials in the ratio **1 : 2.41 : 3.83 : 5.17**
  (deliberately non-integer, non-just — struck glass, never a consonant chord),
  struck when a drop moves fast or crosses its own older wake. Their fundamental
  slides continuously with the drop's x-position; there is no scale and no tonal
  centre. A **noise wake wash** (band-pass brightness + gain tracking droplet
  speed) is the quiet water bed. The `AudioContext` is created only after the
  Start tap.

---

## Ambition-floor criteria hit

- **INPUT = device-tilt** via `DeviceOrientation`, iOS permission requested inside
  the tap.
- **OUTPUT = WebGL2** (fragment-shader tide-pool + wake field), not Canvas2D.
- **TECHNIQUE = gesture record/replay** over a shallow-water wake field, with
  **Layer** (overdub / canon) and **Clear**.
- **PALETTE = nacreous oil-on-water / aqua-teal iridescence** — cool and alive,
  not warm, not an empty void.
- **Sound is inharmonic** ripple-bells + a speed-tracked noise wash — no
  just-intonation, no consonance lattice, no pitched drone.
- **Deterministic** — one seed (`0x10376`, `rng.ts`), `performance.now()` for
  time, zero `Math.random` / `Date.now` / argless `new Date()`.

---

## Degrade ladder (for the muted-phone morning review)

1. **No tilt within ~1 s, permission denied, or no sensor** → a **seeded
   "ghost hand"** (mulberry32 @ `0x10376`) traces a slow looping gesture that
   records and replays itself, so the entire record → replay → layer verb demos
   with **zero input**. It runs **muted** and the UI shows an **`auto`** badge
   until the first real tilt gesture unmutes the master gate.
2. **First real tilt** → the ghost yields, the `auto` badge clears, and the audio
   gate opens.
3. **No WebGL2** → an on-brand `text-destructive` notice explains the pool can't
   render, but the audio engine and gesture recorder keep running.
4. **No AudioContext** → a notice; visuals continue.
