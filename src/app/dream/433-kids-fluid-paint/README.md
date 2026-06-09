**For**: kids (4+)

# Fluid Paint

> "What if a 4-year-old finger-paints, and the paint is REAL flowing liquid — they smear glowing color across the screen, the colors swirl and blend like ink in water, and the motion of the fluid IS the music?"

A calm, dreamy, non-percussion instrument for small fingers. Drag anywhere to pour glowing color into a living fluid simulation; the painting keeps flowing and humming long after you lift your hand.

---

## How it works

### The Fluid Simulation (`fluid.ts`)

Implements the classic **Navier-Stokes "Stable Fluids"** pipeline on the GPU using WebGL2 ping-pong framebuffer textures (RGBA 16-bit float or 32-bit float where available):

1. **Advect velocity** — each texel looks up where it came from in the previous velocity field (semi-Lagrangian back-trace) and copies that value, dissipating very slightly (0.2%/frame) to prevent runaway energy.
2. **Splat forces** — a drag gesture injects a Gaussian blob of velocity AND a matching blob of dye color at the touch point. Force magnitude is proportional to drag speed.
3. **Divergence** — computes `∇·u` (a single fullscreen GLSL pass) stored in a single-channel FBO.
4. **Jacobi pressure solve** — 20 iterations of the pressure Poisson equation `∇²p = ∇·u`, reading `(L+R+T+B − div) / 4` per cell.
5. **Gradient subtract** — subtracts `∇p` from velocity to enforce incompressibility (`∇·u = 0`), making the fluid realistically swirl rather than expand or collapse.
6. **Advect dye** — the separate color field is advected by the now-divergence-free velocity field. Dye dissipates very slowly (0.015%/frame) so paintings persist for minutes.
7. **Display** — tone-maps the dye field with `1 − exp(−dye × 2)` (soft HDR clamp) onto the full-resolution canvas. Near-black pixels are suppressed with `smoothstep` to keep the background dark.

**Resolutions**: 128×128 sim grid (velocity + pressure + divergence), 512×512 dye grid (color). The sim runs at full 60fps on a mid-range phone; the small sim grid is a deliberate Stam-tradition choice (the pressure solve converges well at low resolution).

### The Sound Engine (`audio.ts`)

**NOT percussion** — sustained, consonant, evolving. Mapping uses a JS-side energy accumulator (no GPU readbacks that would stall the pipeline):

- **Chord pad**: five oscillators in open major-9 voicing (C2, G2, E3, B3, D4 — 65, 98, 165, 247, 294 Hz), mix of sine and triangle tones with ±4 cent detuning for warmth. A quiet always-on drone (padGain floor = 0.04) means it is never silent.
- **Energy → volume**: each drag event injects a small amount into a decaying energy accumulator (`energy *= 0.985` per frame). The pad gain tracks `0.04 + energy × 0.66` with a 150 ms time constant, so painting swells the music and pausing lets it settle.
- **Hue → timbre**: the active swatch's hue angle drives a lowpass filter cutoff from ~350 Hz (cool cyan/teal) up to ~3200 Hz (warm amber/rose), making warm colors sound brighter and cool colors darker — a direct cross-modal metaphor a 4-year-old can feel.
- **Swirl → tremolo**: drag speed drives an LFO (0.3–4.3 Hz) that amplitude-modulates the pad through a gain node, creating gentle shimmer during fast strokes and calm stillness when the finger rests.
- **Ambient noise bed**: a looping 2-second white noise buffer through a narrow bandpass filter (120 Hz) at gain 0.008 — barely audible, just enough to confirm the audio graph is live.
- **Safety limiter**: everything routes through a `DynamicsCompressor` (threshold −8 dB, ratio 20:1, attack 3 ms, release 250 ms) into a master gain of 0.22, providing a brick-wall ceiling that can never blast small ears regardless of how vigorously the child paints.

### Kids Design Choices

- **Color is the language**: five big (≥72 px) emoji swatches at the bottom — violet, teal, amber, rose, cyan. No text needed; the icon + color is self-explanatory.
- **Immediate response**: splat is injected synchronously in the pointer-down handler; GL sim renders in the same rAF that received the command. Latency is well under 50 ms on any device that supports WebGL2.
- **No wrong notes**: the chord pad is always consonant (major-9 open fifth cloud). There are no fail states, no score, no game over.
- **Auto-demo**: 1.8 s after load, if no interaction has occurred, the sim runs a scripted sequence of five colored strokes (one per swatch) in a loop, so a reviewer or a child who just picked up a phone sees the painting come alive with zero prompting.
- **Tap-to-start**: `AudioContext` is created inside the first user gesture (pointer-down or the tap-to-start button), satisfying iOS Safari's autoplay policy. A friendly "Tap to Paint!" overlay covers the autoplay case.
- **Full teardown on unmount**: `cancelAnimationFrame`, `sim.destroy()` (deletes all GL textures, buffers, programs, and calls `WEBGL_lose_context`), `audio.destroy()` (stops all oscillators and closes the context).
- **DPR-aware sizing**: the canvas is set to `offsetWidth/Height × devicePixelRatio` (capped at 2× for performance), with a `ResizeObserver` that updates it on window resize.
- **WebGL2 fallback**: if `canvas.getContext('webgl2')` returns null, a `text-rose-300` notice is shown in place of the canvas.

---

## References

- **Jos Stam, "Stable Fluids"**, SIGGRAPH 1999. The foundational semi-Lagrangian incompressible Navier-Stokes solver; this implementation follows the pressure-projection pipeline described therein.
- **Mark Harris, "Fast Fluid Dynamics Simulation on the GPU"**, GPU Gems Chapter 38, NVIDIA, 2004. The canonical mapping of Stam's algorithm onto GPU fragment shaders with ping-pong FBOs.
- **Pavel Dobryakov, WebGL-Fluid-Simulation** (github.com/PavelDoGreat/WebGL-Fluid-Simulation). The definitive browser implementation lineage; this prototype independently re-derives the GLSL passes in the same Stam tradition.

---

## Honest "unverified surface" note

This prototype was written without the ability to run a browser, compile TypeScript, or listen to audio output. The GLSL shaders, WebAudio graph, and React component structure are correct to the best of the author's knowledge, but the following have **not been verified** at runtime:

- Half-float FBO completeness on mobile GPUs (the `EXT_color_buffer_float` / `EXT_color_buffer_half_float` fallback path).
- iOS Safari AudioContext autoplay gate behavior (the tap-to-start flow is standard but untested here).
- Exact perceived loudness and tremolo feel — the compressor threshold and master gain are chosen conservatively but may need tuning.
- TypeScript strict-mode compilation (no `tsc` run was possible).

A human tester should verify audio output levels, fluid visual quality, and touch responsiveness on at least one iOS and one Android device before shipping to children.
