# 803 · Body Chimes (Struck Room)

> "What if your whole moving body played an invisible, room-sized instrument of
> STRUCK RESONANT BODIES — bars, bowls and bells suspended in 3D — each limb
> striking the ones it sweeps through, which ring with real MODAL physical-
> modeling synthesis and slowly accrete into an evolving resonant cloud?"

An adult / installation piece: calm, meditative, immersive. You step in front of
the camera and your wrists, ankles and head become luminous strikers projected
into a dark volumetric room full of glowing metal bodies. Sweep a limb through
one and it rings — for real, with modal physical-modeling synthesis — and the
room slowly fills with a sustained shimmering cloud.

## Tags

- **INPUT** — body / camera (MediaPipe Pose, loaded from CDN at runtime, never in `package.json`).
- **OUTPUT** — three.js WebGL 3D, dark volumetric room, warm-metallic amber/violet glow.
- **TECHNIQUE** — MODAL physical-modeling synthesis: additive damped-sine mode banks (bank of high-Q bandpass resonators) with INHARMONIC partials, excited by 3D spatial collision.
- **PALETTE / VIBE** — adult / installation / meditative / warm-metallic glow.

## References (and why)

- **Vrengt: A Shared Body-Machine Instrument for Music–Dance Performance**
  (Erdem, Jensenius et al., NIME 2019 / arXiv:2010.03779). The conceptual core:
  the *moving body itself is the instrument*, dance treated as musicianship.
  Body Chimes takes that framing literally — the whole body, not a controller,
  excites the sound, and the strikers are limbs swept through space.
- **Modal synthesis** of struck bars, plates and bells — the resonant-mode-bank
  physical-modeling tradition (cf. Cadoz / ACROE **CORDIS-ANIMA** mass-spring &
  modal physical modeling). This is the actual synthesis method used here: each
  body is a bank of damped resonant modes with inharmonic partial ratios, struck
  by an impulse. Higher modes are excited less and decay faster, as in real
  metal.
- **Bernhard Leitner** (sound-sculpture / *Ton-Raum* installations). The
  room-as-instrument, sound-placed-in-space sensibility behind suspending the
  resonant bodies in a 3D volume the visitor moves through.

## Modal synthesis method (the real technique)

Each struck body = a parallel **bank of high-Q BiquadFilter bandpass
resonators** fed one short noise/impulse burst. A bandpass driven at its centre
frequency with a tall Q rings as an exponentially-decaying sinusoid — that ring
*is* a physical mode. This is genuine modal synthesis and CPU-friendly, letting
us cap polyphony at 16 active rings (steal oldest).

Inharmonic partial ratios per body type (relative to the fundamental):

| Body | Partial ratios | Character |
|------|----------------|-----------|
| Bell | `1, 2.0, 2.4, 3.0, 4.5, 5.33` | clangorous, stretched |
| Bar (free-free) | `1, 2.76, 5.40, 8.93, 13.34` | bright, sparse overtones |
| Bowl (singing) | `1, 2.01, 2.83, 4.22, 5.0` | near-harmonic, sustaining |

Per mode:

- frequency = `fundamental × ratio` (modes above ~0.45·sampleRate are skipped).
- Q rises with mode index (`(40 + 30·m)·profileQ`) so partials read as discrete.
- excitation gain ∝ `profileGain × velocity`; higher modes excited less.
- decay = `baseDecay / ratio^0.65 × velocity` — fundamental rings longest.
- a fast attack + long natural exponential tail on a master gain per strike.

Fundamentals come from a **just-intonation** scale over a low ~110 Hz root
(`1, 9/8, 5/4, 3/2, 5/3, 2, 9/4, 5/2, 3`) across two octaves, so any combination
of struck bodies is consonant. Strikes bloom through a synthesised convolution
reverb so the room sounds large.

## Long-form accretion (the ceiling build)

This is what makes the piece evolve over minutes rather than loop:

1. **Sympathetic mode-bed.** A set of always-on, very-high-Q (Q≈90) bandpass
   resonators tuned to every scale frequency in the field, fed a faint
   continuous noise excitation. Each strike *charges* the resonator nearest its
   pitch; that charge then bleeds back down over ~25 s — so a struck body keeps
   faintly ringing sympathetically long after the strike.
2. **Slow growth.** A `bedMaster` gain ramps from 0 toward ~0.5 over ~4 minutes,
   plus an activity boost from total strike count. The room is near-silent at
   start and a sustained cloud by minute 4–5.
3. **Struck-body memory.** A per-body strike counter biases the bed: frequently
   struck bodies pull their sympathetic resonator slightly sharper, so the
   timbre of the cloud reflects *how you have been playing*.
4. **Root drift.** A ±0.35% global detune breathes across the bed on a ~90 s
   cycle, so the cloud is never harmonically static.

Net effect: minute 5 is fuller, warmer and subtly detuned versus minute 1. The
central warm point-light brightens and the dust haze thickens in lockstep with
the audio cloud level (`engine.cloudLevel()`), so the accretion is visible too.

## Visuals

three.js WebGL. ~24 metal bodies (varied geometry: cylinders/bars, partial-
sphere bowls, open cone bells) on a loose double-ring shell in a fog-darkened
volume, `MeshStandardMaterial` with high metalness lit by a warm key, a violet
fill, and the accretion light. Struck bodies bloom (scale wobble + emissive
pulse, decaying each frame). Strikers are additive-blended light-orbs that
brighten with speed. Drifting dust particles give volumetric depth. The camera
slowly breathes/orbits. ACES tone mapping for a warm filmic glow.

## Controls / UX

- **Start** (gated user gesture → AudioContext + getUserMedia for iOS): enter
  the room and begin.
- Then just **move**. Faster sweeps ring louder and brighter.
- **Read the design notes** (bottom-right) scrolls to the in-page `#notes`
  section.

## Fallback behavior (graceful degradation)

- **Camera denied / MediaPipe fails to load** → a synthetic **ghost body**
  whose strikers drift through the field on slow Lissajous orbits takes over
  within ~2 s, so the piece plays hands-free. A visible notice in
  `text-rose-300` reads *"Camera unavailable — the room plays itself."* and a
  status line shows *"ghost body — the room is playing itself"*.
- **WebGL unavailable** → a friendly `text-rose-300` notice; modal synthesis
  still rings on Start.
- **Audio cannot start** → a `text-rose-300` notice.
- The scene previews (ghost body) before Start so the field is alive immediately.

## Teardown

On unmount: cancel rAF, close the MediaPipe landmarker, stop all camera tracks,
close the AudioContext, dispose all geometries/materials, `renderer.dispose()` +
`forceContextLoss()`, and remove the canvas.

## Ambition-criteria self-assessment

- **Audio-visual, no static page** — yes; sound (modal synthesis + accreting
  bed) and 3D visuals are both core and coupled.
- **Named technique done for real** — yes; modal synthesis via banks of high-Q
  bandpass resonators with documented inharmonic partial ratios, velocity-scaled
  excitation, and per-mode decay laws.
- **3D spatial collision excitation** — yes; strikers projected into world space
  collide with bodies via proximity + speed gating + refractory windows.
- **Long-form accretion** — yes; a sympathetic mode-bed with lingering charge,
  multi-minute growth, struck-body memory and root drift — real evolving state
  over minutes.
- **Installation palette / depth** — yes; warm-metallic amber/violet, fog,
  particles, breathing camera, ACES tone mapping. Not a flat gradient.
- **Graceful degradation** — yes; ghost body, WebGL/audio notices, iOS gesture
  gating.

## Known rough edges

- Modal voices are bandpass-resonator rings rather than explicit per-mode
  oscillator banks; this is intentional (CPU-friendly, genuinely modal) but the
  highest bell partials can sound slightly soft versus pure additive sines.
- Pose depth (`z`) from a single camera is coarse, so collisions are driven
  mostly by the x/y sweep with a soft depth term; it reads well but is not
  metrically accurate.
- The accretion is tuned for a ~5-minute arc; very long sessions plateau rather
  than keep growing (by design, to avoid mud).
