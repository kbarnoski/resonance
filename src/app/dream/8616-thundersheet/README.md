# 8616 — Thunder Sheet

## What it is

An audio-visual prototype of a hanging sheet of thin metal — a *thunder sheet* —
that you **shake** rather than strike. A subdivided quad mesh (raw WebGL2, hand-written
GLSL) buckles and ripples in real time as a nonlinear modal synth turns your driving
into sound: a low inharmonic rumble when you nudge it gently, and a bright, shimmering
crack when you drive it hard enough to cross a threshold. Let go and it rings down and
settles.

## The one question

> What if you could SHAKE a sheet of thin metal and drive it PAST linearity — so a
> gentle wobble is a distant rumble, but a hard shake pumps energy up the mode ladder
> until it CRACKS into a bright shimmering bloom, with a real, discoverable threshold
> between calm and storm?

## The nonlinear-synthesis mechanism (the heart of it)

- **Mode bank.** A set of `NM = 14` **inharmonic** partials — a stretched, seed-jittered
  series (`f = 44·(i+1)^1.52`), the kind of non-integer ratio spread that reads as a
  stiff metal plate, not a string. Each is realized as a high-Q bandpass resonator fed
  a constant seeded-noise excitation.
- **Per-mode energy.** Instead of a fixed linear decay, each mode carries an `energy`
  value integrated on the JS side every frame. That energy sets the resonator's audible
  level (and the visible mode's displacement).
- **Drive injection.** The scalar "drive" derived from your input feeds energy almost
  entirely into the **low** modes (`drive·e^(−0.52·i)`).
- **Amplitude-dependent cascade (the nonlinearity).** Once a mode's energy exceeds
  `CRASH_THRESHOLD (0.34)`, a fraction — growing **quadratically** with the excess
  (`COUPLE·excess·energy`) — is shuttled UP to the next two modes. Below threshold
  nothing moves up: it stays a soft rumble. Above it, energy avalanches into the high
  modes and the spectrum brightens and "cracks" open. This is the analogue of the
  Föppl–von Kármán quadratic coupling (deflection couples to in-plane stress ≈ deflection²,
  which transfers energy between modes at large amplitude).
- **Ring-down tail.** Energy always decays (highs faster than lows), so stopping the
  drive gives a natural, settling tail — not a drone.
- **Crackle.** A mild `tanh` waveshaper on the master bus adds extra harmonics when it
  gets loud (the audible crackle of the crash); a compressor keeps it safe.

The **threshold is made visible**: a mono readout flips `rumbling → STORMING`, and the
sheet's copper surface grows a smoothed, localized white-hot highlight as storm energy
rises.

## Input

- **Mobile:** `devicemotion` (shake magnitude → drive) and `deviceorientation`
  (tilt → sheet lean), behind the iOS `DeviceMotionEvent.requestPermission()` gesture.
- **Desktop / no sensor:** drag the pointer across the sheet — drag speed is the drive,
  pointer position leans the sheet. This path fully works with no motion sensor and no
  granted permission.

## Self-demo

On load a **seeded escalating shake** runs automatically (`runAutoDrive`): a ~2.4s
sub-threshold build, a hard push past the crash threshold, then a settle — the whole
arc in ~8s with **zero input**, so the sheet visibly buckles, blooms, and calms even
when muted on a phone. Pressing "Enable motion + sound" restarts the arc with audio
(if the human hasn't already grabbed control); the first real tilt/shake or drag hands
over to the human. All randomness is a deterministic `mulberry32`/seeded wobble with a
fixed seed; timing uses `performance.now()`.

## Visual

Raw WebGL2, `canvas.getContext("webgl2")`, no three.js and no libraries. A real
`131×89`-vertex quad mesh: the vertex shader displaces z by summing the plate mode shapes
(product-of-sine standing waves) weighted by live energies, derives the surface normal
analytically, and passes a "high-mode curvature" term to the fragment shader. Shading is
copper/bronze metal (bright toward the light, dark bronze in the troughs) over a deep
storm-blue ground, with a Blinn-Phong sheen and the localized white-hot crack highlight.
If WebGL2 is unavailable it falls back to a Canvas2D displaced-profile sheet and keeps
audio running; art hex lives only inside the renderers, chrome uses semantic tokens.

## How it differs from the lab's linear struck-plate pieces

The lab already has linear struck-plate / gong / "bloom" modal pieces and a kids thunder
drum. This one differs on two axes, deliberately:

1. **Input is continuous SHAKING** driven by tilt/motion (pointer-drag fallback), **not
   a discrete strike.** The character depends on *how hard* you drive, continuously.
2. **The synthesis is explicitly NONLINEAR** — amplitude-dependent energy transfer
   between modes with a discoverable crash threshold — **not a fixed linear modal decay.**
   The *shape* of the spectrum changes with drive, not just its overall amplitude.

## References / prior art

- **Föppl–von Kármán equations** — coupled nonlinear PDEs for large-amplitude thin-plate
  deflection + in-plane stress.
- **"Explicit and Stable Pseudospectral Time-Domain Method for the Föppl–von Kármán
  Equations,"** arXiv:2608.06139 (7 Aug 2026) — a stable time-domain scheme for exactly
  this nonlinear plate regime; the reason this prototype exists this cycle.
- The theatrical **thunder sheet** (flexible metal sheet percussion).
- Nonlinear plate / cymbal chaos acoustics — Chaigne, Touzé, Thomas on cymbal/gong
  chaotic vibration and energy cascade.

## Honest limitations

- It is a **qualitative analogue, not a PDE solve.** We do not integrate the
  Föppl–von Kármán equations in the browser.
- The mode coupling is a **hand-tuned scalar cascade**, not derived from the true modal
  stiffness/coupling tensor.
- The visible sheet uses **idealized product-of-sine mode shapes**, not the plate's exact
  eigenmodes.
- The nonlinear balance is tuned by ear; on unusual hardware the crash may read as a bit
  subtle or a bit harsh.

## Tags

INPUT tilt/device-motion (+ pointer-drag fallback) · OUTPUT raw WebGL2 deforming sheet
mesh · TECHNIQUE nonlinear plate modal synthesis with amplitude-dependent mode-coupling
+ discoverable crash threshold · PALETTE storm (deep storm-blue ground, copper/bronze
sheet, white-hot crack) · TUNING inharmonic plate partials, no scale, no drone · VIBE
elemental, dramatic, physical.
