**For: kids (4+)**

# Moonlit Tide Pool

A serene, all-GPU sea of light you tilt at bedtime. Tilt the iPad and a glowing
shallow-water simulation flows downhill, pools in the low corner, and every pool
rings a soft bell. The rhythm of the music is the rhythm of how the child tilts:
gentle rocking gives slow, sparse drops; faster swaying gives a calm flurry of
chimes. Nothing can sound harsh, nothing is ever silent.

## What it is

A single full-screen WebGL2 canvas. The water is not a picture or a video — it
is a live physics simulation whose entire state lives in GPU textures and is
advanced every frame by fragment shaders. On top of the water sit a few fixed
"lily" probe points; when water pools deeply enough over a lily, that lily glows
brighter and rings one note from a warm pentatonic bank.

## The interaction

- **Tilt** the device (DeviceOrientation beta/gamma) → the sea runs downhill
  toward the low corner. iOS 13+ asks permission, which we request *inside* the
  Start tap (a user gesture), as required.
- **Pooling rings bells.** Each lily watches its own patch of water. When the
  depth there crosses a threshold (a rising edge, with a ~0.22s cooldown), it
  rings a single soft bell. Gentle tilt = sparse drops; fast rocking = a flurry.
- **No interval/harmony engine.** Pitch is held deliberately dumb — a fixed
  pentatonic bank {C4 D4 E4 G4 A4 C5 D5 E5}, consonant by construction. The
  music lives in the *rhythm* of tilt + pooling, not in pitch theory.

## The all-GPU virtual-pipes technique (and why GPU matters)

The water is solved with the **virtual-pipes shallow-water model**: imagine each
grid cell connected to its four neighbours by little pipes. Each frame runs two
fragment-shader passes on ping-pong float framebuffers (RGBA32F, falling back to
RGBA16F via `EXT_color_buffer_half_float`, with a graceful notice if neither is
available):

1. **Flux pass.** For every cell, accelerate its four outflow fluxes (left,
   right, down, up — packed into one RGBA texel) by the height difference to each
   neighbour *plus* the tilt-gravity component, then damp them and scale them so
   a cell can never push out more water than it holds (keeps depth non-negative
   and the solve stable). Walls are closed (no-flux), so it behaves like a real
   tide pool.
2. **Height pass.** For every cell, add the net of (neighbours' inflow aimed at
   me) minus (my own outflow). A slow, gentle central spring adds a trickle so
   the sea breathes and never fully drains.

A final **shade pass** turns the height field into a glowing moonlit sea: deep =
cool indigo, pooled/high = warm gold, additive glow, and a soft specular shimmer
from normals computed out of the height field. Lily nodes glow brighter the
instant they ring, so the rhythm reads even with the sound off.

**Why GPU matters here:** because the flux and height fields *live* in textures
and every cell is updated in parallel by the fragment shader, a full 256×256
shallow-water solve runs every frame with sub-steps to spare — no CPU array, no
per-cell JavaScript loop, no main-thread stall. The pooling in the low corner is
**physically earned** by real flux-based flow, not faked with a damped membrane.

### Reading pooling back cheaply

Reading a whole GPU texture back to the CPU each frame would stall the pipeline.
Instead we read back **only the handful of lily texels** — a few 1×1
`gl.readPixels` calls straight from the sim framebuffer at each lily's grid
coordinate, throttled to ~30ms. That is enough to detect the depth rising-edge
that triggers a bell, without ever pulling the full 256×256 grid across the bus.

## Kids-safety envelope (absolute)

- Web Audio only. Master chain: `masterGain (0.24) → lowpass (6kHz) →
  DynamicsCompressor (threshold -10, ratio 20) → destination`. A hard tilt makes
  **more** soft bells, never louder or harsher — the limiter holds the ceiling.
- An always-on soft ambient drone (C2 + G2 under a slow filter LFO) means it is
  never silent.
- Each bell is a gentle sine with a ≥40ms attack and a long, soft decay plus one
  quiet partial — no sudden transients, no high ringing.
- AudioContext is created and resumed inside the Start tap (iOS-safe).

## Fallbacks (always sounds + shows)

- **No motion sensor / desktop / permission denied** → drag a finger or the
  pointer to tip the sea (the same gravity uniform), AND an **idle auto-demo**
  gently rocks the tide whenever no input is present, so a hands-free glance
  *sees* the sea flow and pool and *hears* bells within about 0.6s.
- **Permission denied** → the reason is shown in `text-rose-300`; audio and the
  auto-demo keep running.
- **No WebGL2 or no float-texture support** → a `text-rose-300` notice; the
  ambient drone keeps playing so it is never dead.
- **Full teardown:** cancels rAF, removes all listeners, deletes every texture /
  FBO / program / buffer / VAO, calls `loseContext()` via `WEBGL_lose_context`,
  and closes the AudioContext.

## Citation

RESEARCH §546 (2026-06-25) — virtual-pipes shallow-water (Mei, Decaudin & Hu,
"Fast Hydraulic Erosion Simulation on GPU", 2007; foundational) made real-time
in-browser via recent GPU water solvers (lisyarus/webgpu-shallow-water,
GitHub 2025; Codrops / 80.lv WebGPU water, Jan 2026).

*Not device/ear/GPU-verified in the build container: typechecked and linted
clean, but the DeviceOrientation permission flow, the float-texture path on real
hardware, the GPU readback timing, and the actual audio output have not been
exercised on a physical device.*
