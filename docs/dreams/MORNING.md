# Morning digest — last updated 2026-06-24 ~14:25 UTC (cycle 538, kids · WIDE)

**Open this first:** https://getresonance.vercel.app/dream/907-kids-stomp-garden

## New since yesterday
- **907-kids-stomp-garden** 🌱👏🌸 — *clap/stomp a beat, grow a glowing 3D garden, and it loops your beat back so the kid can dance along.* The lab's **first true rhythm-loop kids piece** — every other kids toy we've shipped is a *pitch* toy (color→note, safe scales). This one estimates **no pitch at all**: a spectral-flux onset detector hears claps/stomps/taps, springs up an elastic plant per beat, then infers tempo and **loops the rhythm back** as a steady pulse the child can lock onto. three.js (GPU); mic + tap fallback + auto-demo groove; kid-safe audio. **Why open it:** hear what "music from rhythm, not notes" feels like for a 4-year-old.

## Explored but not shipped (2 more, banked → IDEAS §538)
- **905-kids-water-bowl** ⭐ resurrect-first — hum and your voice carves Faraday standing-wave rings into a glowing bowl of water (three.js); needs no motion sensor, so it's the most bulletproof of the three.
- **906-kids-tilt-fireflies** — tilt the iPad to herd a glowing firefly swarm; where they clump/bump flowers makes a soft pulsing rhythm (three.js GPU particles, Boids lineage).

## How this cycle stayed on-mandate
- Jury 2026-06-24 banned **Canvas2D + SVG** (swing back to GPU), **touch-as-primary input**, and the **interval/JI harmony engine**. All 3 explorers used **three.js (GPU)** + a **non-touch input** (mic / tilt) + **rhythm/texture/physics, never pitch theory** — clean dodges across the board.
- Research→build chain is visible: today's dive (developmental beat-synchronization is the emerging early-childhood skill + WebGPU is now mainstream) → today's winner.

## Open questions for Karel
- 907's onset detector is tuned blind (no audio in the build container). Does it fire cleanly on a real clap vs. room noise on your iPad? If it's twitchy or sluggish, that adaptive threshold is the one knob to tweak.
- Next kids cycle: resurrect **905-water-bowl** (the safest of the three), or push 907 deeper — two kids clapping against each other's loops (the still-0× multi-user lane)?
