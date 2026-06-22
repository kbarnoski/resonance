# Feel the Beat (`856-kids-rumble-band`)

**The one question:** What if a 4-year-old could play music with a game
controller they already hold — push the two thumbsticks to conduct two glowing
creature-voices, mash the big colorful buttons to add drums — and the controller
**rumbles in their hands in time with the beat**, so they FEEL the music as well
as hear it?

## The mechanic — Gamepad API + haptics

- **Input: a Bluetooth game controller** (Xbox / PS / Switch Pro) paired with a
  tablet — the starved, off-screen, off-camera input that's already in many
  homes. Polled every frame via `navigator.getGamepads()`; hot-plug handled with
  `gamepadconnected` / `gamepaddisconnected`.
- **Left stick** steers a warm *melody creature*. Stick position picks a note;
  every note is snapped to a **C-major pentatonic** scale, so there are no wrong
  notes. Magnitude → loudness + brightness. **Right stick** steers a cool
  *harmony creature* a consonant interval (a fifth) above. Sticks at rest → both
  voices gently sustain over an always-on drone.
- **Face buttons A / B / X / Y** = four big colored warm drum/marimba pings
  (soft attacks, never harsh). **Bumpers / triggers** add a sparkle swell.
- **Haptics (the special sauce):** `gamepad.vibrationActuator.playEffect(
  "dual-rumble", { duration, strongMagnitude, weakMagnitude })`, feature-detected.
  The pad pulses a **gentle felt beat** on every beat (accented every 4th) plus
  an extra bump on each drum hit. Rumble is gentle and never a constant buzz.
- An always-running soft groove (a slow ~96 BPM felt pulse over a drone) makes it
  musical before the child does anything; everything they add layers on top.

## Output — raw WebGL2 (no three.js)

Hand-written WebGL2: an opaque gradient/aurora background pass, then **additive**
(`SRC_ALPHA, ONE`) instanced glow point-sprites — ~700 drifting stars that
breathe with the felt beat, two soft creature blobs (warm amber / cool cyan) that
move with the sticks, and expanding ripple bursts on each drum hit. The whole
field brightens on the beat, so you **see** the pulse even with no controller.
Shaders are compiled/linked with error checks; if `getContext("webgl2")` is null
the audio keeps running and a `text-rose-300` notice appears.

## Graceful degradation (no controller / no GPU)

- **Auto-demo on mount:** within ~0.6s the soft groove starts, the two creatures
  trace a slow Lissajous, and drums fire on alternating beats — hands-free, so an
  untouched page is already sounding, animating, and visibly pulsing.
- **On-screen fallback:** two ≥96px virtual sticks (drag) and four ≥76px colored
  drum buttons make the piece fully playable with touch/mouse alone.
- If no gamepad connects, a friendly `text-white/75` hint shows ("Connect a game
  controller, or play with the buttons below") — never an error.
- iOS/autoplay: the `AudioContext` is created/resumed inside the first tap of the
  72px **Start** button.

## Kids-safety audio chain

All voices → `master gain (0.26)` → `BiquadFilter lowpass (6500 Hz)` →
`DynamicsCompressor (threshold −10, ratio 20:1)` → destination. Attacks ≥40ms,
no harsh highs, no sudden loud transients, always-on soft drone (never silent).

## References

- **Gamepad API** & **GamepadHapticActuator.playEffect** ("dual-rumble") —
  MDN / W3C Gamepad Extensions.
- **Émile Jaques-Dalcroze — eurhythmics:** rhythm is learned through the *body*.
  Here the felt beat reaches the body through touch/haptics — a cross-modal
  "feel the music in your hands" idea.

## Tags

- **Input:** game controller (Gamepad API) — fallback: touch/pointer
- **Output:** raw WebGL2 additive glow point-sprites
- **Technique:** Web Audio synthesis (pentatonic snap, warm drums, drone) +
  beat-synced dual-rumble haptics
- **Vibe:** calm-but-playful, kids, cross-modal / felt rhythm

## Honest self-assessment

- I could not verify the **rumble** itself — no controller in the sandbox. The
  `playEffect` path is feature-detected and typed with a minimal local interface,
  but whether the felt pulse reads as musical (and whether magnitudes feel right)
  is unconfirmed on real hardware. Browser support for haptics varies by pad +
  browser; the UI says "(no rumble on this pad)" when absent.
- I could not hear the audio or see the GPU output here, so the **mix balance**
  (drone vs. creatures vs. drums) and the visual glow intensity are best-guess
  and may need tuning.
- Stick-to-note mapping combines x-position and height into one scale index; on
  real hardware the exact note a given stick angle picks may feel arbitrary to an
  adult, though "no wrong notes" still holds for a child.
- The auto-demo is intentionally aggressive (starts ~0.6s) so the review page is
  alive immediately; real input takes over and the demo resumes after a brief
  idle.
