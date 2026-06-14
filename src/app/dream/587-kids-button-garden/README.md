# 587 · Button Garden

**The question:** _What if a 4-year-old's first instrument was a GAME CONTROLLER,
not a screen — mash the big buttons and a garden of light blooms and sings?_

This is the dream lab's first **Gamepad API** instrument and its first
**haptic-rumble** output. The child holds a physical controller (Xbox /
PlayStation / generic USB pad) and watches the screen bloom. They are NOT tapping
a touchscreen — the input is off the glass. The approach here is the
**discrete / percussive-playful** one for the smallest hands that just want to
MASH buttons.

## How to play

### With a controller (the intended way)

- **Face buttons (A / B / X / Y)** — four warm voices. Each press blooms a glowing
  flower of its own color somewhere on the dark field and sings a warm tone.
  **Hold** a button and its flower keeps breathing and singing; release to let it
  fade.
- **D-pad** — shifts the whole garden's **season** (spring → summer → autumn →
  winter). The palette changes AND the musical root transposes, so the world
  visibly and audibly changes mood.
- **Triggers (LT / RT, analog)** — swell a soft underlying wind/pad drone.
- **Left stick** — gently sways/tilts the whole field (parallax) so the garden
  feels physical.
- **Rumble** — when the pad supports it, a gentle thump fires on each bloom and on
  season changes. Feature-detected and wrapped in try/catch, so the piece works
  fully on pads/browsers (Safari, many generic pads) that have no haptics.

### Without a controller (graceful degradation)

The piece is fully playable with no pad attached:

- **Keyboard fallback** — `A S D F` (or `J K L ;`) bloom the four voices; **arrow
  keys** change the season.
- **On-screen buttons** — four big tappable voice buttons plus season ◀ ▶ at the
  bottom, as a last resort on a touchscreen.
- **Idle auto-demo** — on first load, and after ~2 seconds with no input, an
  autonomous gentle demo plays itself: flowers bloom on their own in a slow warm
  pattern and the season drifts. So a muted 06:30 glance shows a living, singing
  garden with zero setup. Any real input (pad, key, or tap) takes over instantly.

## Design notes

- **Voices = just intonation, NOT pentatonic.** The four face voices are the
  ratios `1/1, 5/4, 3/2, 15/8` over the active root — root, major third, fifth,
  major seventh of a warm major chord. The d-pad/season transposes the root
  (F3 / G3 / D3 / C3 across the four seasons). The "C-major-pentatonic reflex"
  is deliberately avoided.
- **Audio (Web Audio only).** Each voice is a triangle + gently-detuned sine
  partial with a soft attack and a long (~1.6 s) release, over a low root+fifth
  sine drone with a band-passed noise "wind" layer. Kid-safe master chain:
  `gain → lowpass (8 kHz) → DynamicsCompressor (brick-wall limiter, ratio 20,
  threshold −10 dBFS) → destination`. The `AudioContext` is created inside the
  first user gesture (the "Open the garden" button) for iOS unlock, and falls
  back to `webkitAudioContext`.
- **Render = Canvas2D only.** Additive (`lighter`) glowing flowers — a radial
  halo, six rotating petal lobes, and a white core — bloom and breathe over a
  dark season sky with soft motion-blur trails and a ground glow. The whole field
  parallax-sways with the left stick. No three.js / WebGL / WebGPU / SVG.
- **Edge-triggered input.** Button presses are detected on the rising edge in the
  rAF poll loop, so each press fires exactly once and holds sustain cleanly.

There is also an in-app **Design notes** disclosure in the top-right corner.

## Named references

- **Toshio Iwai — _Electroplankton_ / _TENORI-ON_.** The playful Nintendo lineage
  of "anyone can make beautiful music" with a simple controller; this piece carries
  that spirit to the smallest hands and a standard game pad.
- **The May 2026 Steam Controller haptic-song demos** — a game controller that
  plays music through rumble. The gentle bloom-thump and the quickening
  heartbeat-style rumble here nod directly to that idea of the controller itself
  being part of the sound.

## Ambition / diversity tags

`first-gamepad-api` · `first-haptic-rumble` · `off-the-glass-input` ·
`kids` · `just-intonation` · `web-audio` · `canvas2d` · `idle-auto-demo` ·
`keyboard+onscreen-fallback`

## What's unverified

- **Haptic rumble** has not been tested against a real physical controller in this
  environment; the code is feature-detected and try/catch-wrapped, so absence is
  safe, but the exact rumble feel on Xbox/PS pads is unverified.
- **Button mapping** assumes the W3C "standard gamepad" layout (face 0–3, d-pad
  12–15, triggers 6–7, left stick axes 0–1). Non-standard / generic USB pads that
  do not remap to "standard" may place buttons differently; the keyboard and
  on-screen fallbacks cover that case.
- Tested for clean ESLint and TypeScript; not run in a live browser here.
