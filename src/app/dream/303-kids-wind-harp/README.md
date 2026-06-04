# /dream/303-kids-wind-harp — Wind-Harp

**The one question:** *What if a kid could TILT their iPad and gravity would
swing a row of glowing strings like a wind-harp — each string that swings far
enough plucks itself and sings, so the child plays music by tipping the world?*

A hands-free, no-reading, no-fail audio-visual toy for a 4-year-old. Tip the
tablet; the strings sway with believable physical motion; the ones that swing
far enough pluck themselves and ring out in a warm modal scale.

---

## How it works

### Input — device TILT → a gravity vector
The `deviceorientation` event gives `gamma` (left/right tilt) and `beta`
(front/back tilt). We map those into a 2-D **gravity vector** in the harp's
normalised space. Tipping the iPad literally changes which way "down" is, so the
hanging strings swing toward the low side. The incoming vector is smoothed each
frame so motion is liquid, never jittery.

On iOS 13+ `DeviceOrientationEvent.requestPermission()` must be called from a
user gesture — it is invoked inside the **"Tilt to play"** button tap, and
denial is handled gracefully (see fallbacks).

### Technique 1 — Verlet string physics (`physics.ts`)
Each of the 7 strings is a vertical chain of point masses pinned at top and
bottom. We integrate the free nodes with **Verlet integration** (position-based,
velocity implied by `x − prevX`) and then satisfy the segment-length **distance
constraints** with a few relaxation iterations per frame. A gentle spring pulls
each node back toward its resting vertical line so the harp re-centres when held
flat. The tilt-gravity vector drives the whole simulation, so the strings swing,
sway, overshoot, and settle naturally. Physics runs on a fixed 120 Hz substep
for stability regardless of display refresh.

A string "plucks" when the horizontal displacement of its **midpoint** crosses a
threshold on the way up (with hysteresis + a per-string refractory window so one
swing fires exactly once and it never machine-guns).

### Technique 2 — Karplus-Strong pluck synthesis (`harp-audio.ts`)
When a string plucks we synthesise its note with the **Karplus-Strong
plucked-string algorithm** (Karplus & Strong, 1983): a short burst of noise is
pushed through a tuned delay line (its length sets the pitch) with a
lowpass-averaging filter in the feedback path, giving the characteristic
bright-attack / mellow-decay plucked tone. Each pluck is rendered offline into a
small `AudioBuffer` and played through a `BufferSource` — the simplest robust
path (no `ScriptProcessor`/`AudioWorklet` lifecycle to babysit), and it lets us
bake **brightness, decay, length and loudness from the swing amplitude**: a big
swing is louder, brighter and longer; a small one is a soft tap.

### Output — raw WebGL2 (`harp-gl.ts`)
A vertical row of 7 glowing strings drawn over a soft dark indigo→black gradient
with a slow breathing centre glow. Each string is built CPU-side from its node
positions into a smooth **filled ribbon** (a triangle strip expanded along the
curve normal) with a soft-edged falloff across its width. Blending is plain
**alpha-over — matte, not additive bloom** — so the strings read like glowing
threads resting on the gradient rather than blown-out light. A freshly plucked
string flashes brighter and fattens slightly, then decays; ongoing swing gives a
gentle baseline shimmer.

### Tuning / vibe
The 7 strings are tuned low-to-high to a warm **D-Dorian** scale
(D E F G A B C — explicitly *not* C-major pentatonic). An ambient **drone pad**
(D2 + A2, detuned triangles, slow tremolo, lowpass) sits underneath so silence
is never dead, plus a shimmer feedback-delay send. A `DynamicsCompressor`
limiter on the master keeps a fistful of simultaneous plucks friendly. Calm,
shimmering, playful — **every tilt makes pretty sound, and there is no fail
state.**

---

## Fallbacks (so it's fully playable with no sensors)
The demo must work on a desktop with no device sensors. Three layers:

1. **iOS permission** requested in the start tap; denial shows a clear
   `text-rose-300` note.
2. **Pointer drag** — dragging anywhere across the canvas tilts the gravity
   vector toward the cursor, so you can swing the strings with a mouse/finger.
3. **Auto-sway** — if no tilt events arrive within ~2 s (or on denial), gravity
   slowly orbits on a sine and the harp **plays itself**, so the full pipeline
   (physics → pluck → sound) is visible without any sensor. Releasing a pointer
   drag with no sensor present resumes auto-sway.

---

## Named references
- **Aeolian harp** (the wind-harp / wind harp): a stringed instrument played not
  by fingers but by moving air. Here the child's **tilt is the wind**.
- **Karplus, K. & Strong, A. (1983),** "Digital Synthesis of Plucked-String and
  Drum Timbres" — the plucked-string algorithm used for every voice.

## Tags
- **INPUT** = device TILT (`deviceorientation` beta/gamma → gravity vector),
  hands-free. Pointer-drag + auto-sway fallbacks.
- **OUTPUT** = raw WebGL2 — glowing matte string ribbons over a soft dark
  gradient.
- **TECHNIQUE** = Verlet rope/string physics + Karplus-Strong plucked-string
  synthesis.
- **VIBE** = warm D-Dorian, ambient drone, master limiter, calm, no fail state.

## Files
- `page.tsx` — client component: tilt/pointer/auto-sway input, fixed-step
  physics loop, pluck → audio, WebGL2 render, permission + cleanup.
- `physics.ts` — Verlet string simulation + pluck detection.
- `harp-audio.ts` — Karplus-Strong voices, drone pad, shimmer, limiter.
- `harp-gl.ts` — WebGL2 gradient + string-ribbon renderer.

---

## Honest notes — what's unverified
This sandbox has **no device sensors and no GPU**, so the following were written
to spec but could **not** be runtime-verified here:

- **Real device tilt.** The `deviceorientation` → gravity mapping (gamma/beta
  ranges, sign, and feel) is reasoned, not tuned on a physical iPad; expect to
  adjust `GRAVITY_SCALE` and the beta term once tested on hardware.
- **iOS permission flow.** `requestPermission()` is called in the gesture as
  required, but the granted/denied branches weren't exercised on real Safari.
- **WebGL2 rendering.** Shaders compile-checked only by inspection; the ribbon
  triangle-strip joins (degenerate vertices between strings) and the matte glow
  look were not seen rendered. DPR is capped at 2.
- **Audio timbre.** Karplus-Strong buffers, drone, and limiter levels are
  unheard; pluck loudness/brightness curves may want tuning by ear.
- TypeScript typecheck and ESLint both pass clean for this folder.
