# 169 — Marble Music (kids)

**For**: kids 4+  
**Route**: `/dream/169-kids-marble-run`  
**Status**: `demoable`

## What it does

Dark canvas pre-loaded with three glowing colored ramps. Marbles drop from the top, fall with gravity, and bounce off the ramps — each bounce plays a Karplus-Strong pluck note. The pitch is determined by where the ramp sits vertically: **ramps high on screen = higher notes, ramps low = lower notes** (same physical analogy as string length on an instrument — feels right without needing explanation).

**Controls:**
- **Draw a ramp** — drag finger/mouse across the canvas (>30px). The ramp appears instantly and gets its pitch color from its vertical position.
- **Drop 🎵** — launches a marble from a random position at the top. Auto-launches every 4.2 seconds.
- **Clear** — resets to the 3 demo ramps and removes all marbles.

## Interaction design

This is the first kids prototype where the child **builds the machine first, then watches it play**. All 168 prior prototypes are reactive — tap/drag/hold → immediate note. Marble Music separates design from performance: draw ramps, then observe what the physics makes. Different cognitive mode: construction over performance.

Three interaction layers:
1. **Passive** (age 3–4): watch marbles fall and listen to the sounds
2. **Active** (age 4–6): tap "Drop" repeatedly, observe different trajectories
3. **Constructive** (age 5+): draw new ramps to redirect marbles, sculpt the melody

## Audio

Karplus-Strong synthesis (same algorithm as `105-pluck-field` ❤️ and `152-kids-star-paint` ❤️). Six pre-computed buffers at C-major pentatonic from C3 (bottom) to E4 (top):

| Y position | Pitch | Color |
|---|---|---|
| Top 1/6 | E4 | rose |
| 2/6 | C4 | amber |
| 3/6 | A3 | emerald |
| 4/6 | G3 | cyan |
| 5/6 | E3 | indigo |
| Bottom 1/6 | C3 | violet |

Soft C3+G3 sine pad at gain 0.005 runs throughout — the "heartbeat" that keeps the canvas feeling alive.

## Physics

- Gravity: 0.22 px/frame²
- Restitution: 0.68 (marbles lose ~32% energy per bounce)
- Tangential friction: 0.92 (slight sliding along ramps)
- Wall bounces: left/right edges with 60% restitution
- Marbles removed when they fall off the bottom edge

Collision uses signed-distance to line segment + approach-direction check (only bounces when marble is approaching the ramp surface, not when already moving away).

## What the Marble Machine cultural moment tells us

The Wintergarten Marble Machine (2016, millions of YouTube views), BooSnoo (2026 animated show), and Sago Mini Music Machine (2026 game feature) all confirm that "marble + music" is a proven format. Our differentiator: **free-draw ramps**. Every existing marble music toy uses fixed/pre-built tracks. Ours gives the child a blank canvas and lets them be the architect.

## Polish ideas

- Sparkle burst on each bounce (visual feedback at collision point)
- Velocity cap to prevent marbles from going too fast on steep ramps
- Sound: add a faint reverb tail (1-tap ConvolverNode) for richer marble-on-wood feel
- Visual: ramp end-caps (small circles) to make ramp endpoints clearer
- The 6-color pitch legend could appear briefly in a corner on first draw
