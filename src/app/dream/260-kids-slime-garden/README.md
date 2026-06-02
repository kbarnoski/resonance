**For**: kids (4+)

# Slime Garden

A dark, calm screen where thousands of tiny luminous creatures crawl and lay
glowing trails. Touch anywhere and you drop a bright "food" spot; the creatures
steer toward it and their glowing tendrils thicken into a living network that
reaches between the food spots. As the strands connect, the garden sings.

## How to play

Tap and hold anywhere on the screen — creatures crawl to your touch and the
glowing veins sing louder and brighter as they connect.

## Named reference

Sage Jenson's **"mold"**, and Jeff Jones, **"Characteristics of Pattern
Formation and Evolution in Approximations of Physarum Transport Networks"**
(2010). The canonical *Physarum polycephalum* slime-mold agent algorithm.

## Technique

**Physarum transport-network agent simulation.** Each agent has a position and
a heading. Every step it samples the trail field at three sensor points
(front-left / front / front-right), rotates toward the brightest reading, steps
forward, and deposits a little trail. The trail grid then diffuses (a 3×3 box
blur) and decays each frame. A gentle extra pull toward the nearest active food
node biases the network into connecting your touch points.

**Robust CPU-sim + GL-render path.** The agent and trail simulation run on the
CPU at a 220×220 grid with 3,500 agents stored in typed arrays. Each frame the
trail grid is uploaded as a WebGL2 `R8` texture and drawn through a fragment
shader that maps trail intensity → a bioluminescent additive glow over deep
indigo. This avoids fragile float render-target ping-pong on the GPU. The
visuals are rendered entirely through WebGL2 shaders.

Palette: deep indigo background; gold → teal → magenta glowing veins, with a
soft white-hot core where the network is densest, plus a faint living shimmer
and a settling vignette.

## Audio mapping

- C-major pentatonic only — there are no wrong notes.
- Up to **5 food nodes**, one sine voice each, tuned to **C3 E3 G3 A3 C4**
  (130.81, 164.81, 196.0, 220.0, 261.63 Hz).
- A node's **gain** and **lowpass cutoff** rise with the average glow / trail
  intensity sampled in a small disc around it: a well-connected, glowing node
  sings louder and brighter; a lonely node stays quiet and dark.
- An always-on soft sine **pad (C3 + G3)** means it is never silent.
- A master `DynamicsCompressor` acts as a limiter so it never clips and there
  are no scary loud transients.

## Subsystems

- **Physarum sim** — typed-array agents (x, y, heading), three-sensor steer,
  deposit, plus food attraction. Fixed 60 Hz timestep with catch-up cap.
- **Trail field** — double-buffered Float32 grid; 3×3 diffusion + decay; food
  glow injection.
- **WebGL2 renderer** — fullscreen triangle pair, `R8` trail texture (tight
  `UNPACK_ALIGNMENT`), bioluminescent palette fragment shader.
- **Audio engine** — Web Audio pad + 5 pentatonic voices, glow-driven gain and
  filter, master compressor/limiter. AudioContext created inside the Start
  gesture.
- **Input** — full-screen Pointer events; tap drops food, hold keeps the most
  recent node alive under the finger, drag moves it.

## Degradation notes

- The simulation crawls silently before Start (a living visual demo). Pressing
  the big **Start** button unlocks audio and the ambient pad inside a user
  gesture (required for AudioContext) — no permissions are requested (no
  camera, no mic).
- If WebGL2 is unavailable, a readable `text-rose-300` notice is shown and the
  gentle audio pad still plays once Start is pressed, so the experience is
  never broken or silent.
