**For**: kids (4+)

# Stomp Garden 🌱👏🌸

Clap, stomp, tap the table, or beat-box into the mic — and your **rhythm** (not any note, not any tune) grows a glowing 3D garden that then loops your beat back so you can dance along and lock into it. No reading, no buttons to learn: a clap is the whole interface.

## How it works

- A full-screen **three.js** garden sits on a dark, warm background and gently *breathes* from the very first second (quiet warm pad + a soft heartbeat pulse), so silence never looks broken.
- The mic feeds a simple **onset detector** (`onset.ts`): we track **spectral flux** and fire a beat when energy rises sharply above a moving threshold, with a ~120ms refractory gap. We detect **rhythm, not pitch** — pitch is never estimated. The onset's **spectral centroid** (brightness) is used *only* to pick a percussion timbre: low → a membrane-y thump plant, high → a shaker/chime plant.
- **Each beat** instantly (<50ms) springs up a procedural plant — stem grows with an elastic ease, then the glowing bloom pops — and plays a soft, safe percussion hit.
- **The looper** (`looper.ts`, the magic) records the *timing* of the child's beats over a rolling ~7s window. Once there are a few beats it infers a tempo from the median inter-onset interval, lightly quantizes the hits to a loop grid, and **loops the rhythm back continuously**. The garden pulses and sways on each looped hit: a steady clap makes orderly pulsing rows, a wild rhythm makes a wild swaying jungle. Keep clapping to layer more beats in.

### Why rhythm, not pitch
Beat synchronization is an *emerging* skill in early childhood — full-body rhythmic synchronization develops gradually through childhood — so capturing a child's own rhythm and looping it back gives them a steady external pulse to lock onto, scaffolding exactly the skill that is forming.

## Reference
The interaction is a no-buttons **live looper / loop station** (the TR-808 "record your rhythm and it plays back while you layer more" model), where the loop *is* a growing garden. Beat detection follows **spectral-flux onset detection** from MIR (Bello et al., *A Tutorial on Onset Detection in Music Signals*, IEEE TASLP, 2005).

## Graceful degradation
- **No mic / denied:** tap anywhere on the garden to make beats (tap height picks the timbre), plus a gentle **auto-demo** feeds a looping groove so the garden grows and pulses on its own at a glance.
- **No WebGL:** a calm friendly notice, no crash.

## Kid-safety
The mic is used **only** for live onset detection — audio is never recorded, stored, or transmitted. The output stays gentle even on a loud clap: master chain is `source → master Gain (≤0.26) → lowpass (6000 Hz) → DynamicsCompressor → destination`, with no high ringing and capped polyphony (6 voices, steal oldest).

## Next-cycle deepening
- Per-child rhythm "memory seeds" so a returning pattern regrows the same flower species.
- Multi-layer looping: separate the thump and shaker hits onto two visual rows so a child can build a beat by body part (feet vs hands).
- A "slow-down / speed-up" sun the child can drag to stretch the loop tempo, making the synchronization target adjustable to their ability.
