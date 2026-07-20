# 2080 · Exo Vantage

**The one question:** What if you could watch yourself from OUTSIDE your own body — a
drug-free out-of-body experience induced by decoupling what you SEE from what your inner ear
(the phone's motion sensor) reports?

An INTENSE → dissociative piece on the out-of-body / depersonalization pole. You begin embodied,
looking out through the eyes of a luminous standing presence in a spare floor-and-fog room. The
device's tilt drives that figure's balance, but it also drives a **visual–vestibular mismatch**:
what the motion sensor (the inner ear) reports drifts out of register with the lagging visual
signal. That mismatch is exactly the failure-to-integrate that the literature identifies as the
substrate of the OBE — so as it accumulates, the **camera detaches from the figure's head and
floats up-and-behind to a third-person vantage.** You watch your own body from outside. Hold
still and the mismatch relaxes and you sink back in; the piece breathes between the two.

## How it works

- **Input** (`orientation.ts`) — a single tilt vector plus a **mismatch scalar**.
  - Primary: `DeviceOrientationEvent` beta/gamma. The **first reading calibrates a resting
    baseline**, so however the phone is held becomes "level".
  - The mismatch is a **leaky integrator** pumped by the tilt's angular speed (movement =
    vestibular/visual disagreement) and relaxed slowly toward embodiment when you hold still,
    with a slow seeded "breath" so it oscillates between embodied and out-of-body.
  - **iOS**: the Begin button calls `DeviceOrientationEvent.requestPermission?.()` inside the
    gesture. Denied/unavailable → graceful `text-destructive` note, falls back to keys + ghost.
  - **Autonomous self-demo**: a seeded (`mulberry32`) drift wanders the tilt AND pumps the
    mismatch with zero sensor/zero input — a phone reviewer who won't tilt still sees the body
    come loose. A real tilt/arrow-key takes over instantly. Seeded PRNG + `performance.now()`
    only — no `Math.random` / `Date.now` in any loop.
- **Output** (`scene.ts`, three.js) — a glowing point-cloud **body-schema** (a presence, not a
  detailed model) in a fog room with a fading floor grid. The camera lerps first-person →
  up-and-behind third-person on the eased detachment scalar, with a slow float drift at the
  outer vantage. Palette is deliberately **drained / derealized**: desaturated bone-grey with a
  faint sickly green-amber tint that deepens as you detach. Degrades to an on-brand notice if
  WebGL is unavailable.
- **Audio** (`audio.ts`) — the shared `startDroneBank` bed plus sparse sustained tones, run as
  **two copies**: DRY (clear, present, lightly stereo) and DETACHED (a duplicate detuned
  ~-28 cents, lowpass-filtered toward cotton-wool/underwater, given a short slap-delay, and
  collapsed to mono). As detachment rises an **equal-power crossfade** moves the mix from dry
  toward that detached recording of itself — the DPDR "everything sounds unreal, like a recording
  of something happening to someone else" percept — and returns to clear on the way back. Master
  gain ≤ 0.3, `ctx.resume()` on the gesture. No struck-bell/percussion events; the banned Chladni
  ratios `1, 2.76, 5.40, 8.93` are not used.

## Safety

- **No strobe.** The only luminance change is a slow (<1 Hz), high-floor breath routed through the
  shared `SafeFlicker` engine (≤3 Hz, off by default). `prefers-reduced-motion` freezes the
  autonomous drift and softens the breath.
- Full teardown on unmount: RAF cancelled, audio ramped down + `AudioContext.close()`, all
  listeners removed, three.js renderer/geometries/materials disposed.

## References

- Cento, Gammeri et al., "The role of the vestibular system in depersonalization and
  derealization: Evidence from a systematic review," *J. Vestibular Research*, 2026
  (doi:10.1177/09574271251412707) — the OBE as a failure to integrate visual + vestibular +
  somatosensory signals.
- Lenggenhager, Tadi, Metzinger & Blanke, "Video ergo sum," *Science*, 2007 — the classic
  full-body illusion where seeing your body from outside displaces the felt self.

---

`input=device-tilt(+ghost) · output=three.js-OBE-camera · technique=visual-vestibular decoupling → camera self-displacement · palette=drained/derealized · pole=intense/dissociative`
