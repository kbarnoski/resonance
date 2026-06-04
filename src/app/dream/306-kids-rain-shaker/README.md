# 306 · Kids Rain-Shaker

**For**: kids (4+). Phone preferred (it uses the motion sensor), iPad and desktop supported. No reading required — color and motion are the language.

## What it is
Hold the phone and **shake it like a rainstick or a maraca**. The harder you
shake, the warmer the shower: gentle shakes make a soft trickle of beads; bigger
shakes tumble warm rain down the screen, and each strong shake-peak strikes a
bell. An always-on ambient pad in **D-Dorian** keeps it alive. No fail, no timer,
no score — every shake is musical.

Route: `/dream/306-kids-rain-shaker`

## How to use it
1. Tap **Shake to play** (this unlocks audio and asks for motion permission,
   both required inside a tap on iOS).
2. Shake the phone. Soft = trickle, hard = a warm tumble of rain + bells.
3. On a computer with no sensor: **swish the mouse fast** to shake, or just
   watch — it rains by itself.
4. A small **design notes** button sits in the top-right corner.

## Subsystems
- **`shake.ts`** — the accelerometer shake-energy detector. Per `devicemotion`
  event: read `accelerationIncludingGravity`, subtract a slow per-axis running
  average (a **high-pass** that removes the constant gravity component), take the
  magnitude, feed a smoothed **shake-energy envelope** (fast attack, slow
  release). Threshold crossings with a ~130 ms refractory window emit discrete
  **hit** events; the continuous envelope drives bead density. Every input path
  (motion, pointer-shake, auto-demo) feeds the IDENTICAL `pushSample` pipeline.
- **`rain-audio.ts`** — Web Audio. (1) An always-on soft **D-Dorian pad** drone
  (detuned triangles, breathing lowpass). (2) A **rainstick** trickle of short
  filtered-noise bead grains whose spawn rate and brightness track the live
  energy. (3) **FM bell chimes** struck on hit events, panned, velocity from hit
  strength, lowpassed so they never get piercing. Everything sums through a final
  `DynamicsCompressor` used as a brick-wall limiter, so vigorous shaking can
  never blast.
- **`rain-gl.ts`** — raw **WebGL2** (hand-written GLSL ES 3.00). A soft
  **dark→dawn** gradient quad that warms with energy, plus a CPU-simulated pool
  of falling **bead/rain particles** drawn as soft round point-sprites (matte
  premultiplied alpha-over — the lab's non-additive house style, no blow-out)
  whose count, speed and warmth scale with shake energy, and warm **glow blooms**
  on each bell strike. DPR/resize aware.
- **`page.tsx`** — `"use client"` component: Start gesture (AudioContext +
  `DeviceMotionEvent.requestPermission()` + WebGL2 init), the render/audio loop,
  fallback wiring, HUD, and the design-notes panel.

## Named references
- The **rainstick** — Andean/Chilean cactus-spine instrument played by tilting
  and shaking — and the **maraca / shaker** percussion tradition.
- The embodied motion → sound mapping echoes movement-sonification research
  (CHI 2026, *Designing Interactive Movement Sonification*).

## Graceful degradation (critical for the phone review)
- **iOS 13+**: `DeviceMotionEvent.requestPermission()` is called inside the
  Start button's click handler. If **denied**, a `text-rose-300` notice shows and
  it falls back to pointer-shake + auto-demo.
- **No sensor / no events within ~2 s** (desktop): falls back to (a)
  **pointer/mouse-shake** — fast pointer movement synthesises an acceleration
  vector into the same detector — and (b) a gentle **auto-demo** that feeds
  synthetic shake samples so it rains and chimes by itself.
- **No WebGL2**: a `text-rose-300` notice shows; **audio still runs**.
- The `AudioContext` is created inside the Start tap (iOS-safe).

## Ambition
Hits the **floor**: a self-contained, audio-visual, kid-safe prototype that
answers its one question end-to-end on a real phone (devicemotion → shake-energy
→ warm WebGL2 rain + D-Dorian bells), with full graceful degradation so it demos
itself on a sensor-less laptop.
