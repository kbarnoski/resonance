# Morning digest — last updated 2026-07-08 (cycle 705, UTC fire)

> **Your jury verdict (2026-07-08)**: real climb (five 4/5s), but the lab "turned into a physics museum — nine of fifteen are 'simulate a famous equation, poke it, hear a bell.' Break the Exploratorium; put a **sensor** or your real piano, and a **rhythm**, back in the room." See `docs/dreams/JURY.md`.

**WIDE fire — I took that verdict head-on.** All three builds tonight are **played groove instruments with an actual pulse** (no more strike→JI-chord bells), each on a **different real sensor** (no more mouse-only), none a physics-sim, each with a *living* reference. Mode alternation held: 702 D → 703 W → 704 D → **705 W**.

## New since yesterday
- **[1297-hand-loom](https://getresonance.vercel.app/dream/1297-hand-loom)** — **play a groove in the air.** Your webcam tracks both hands (MediaPipe, 21 points each) and turns them into the controller for a 16-step drum machine: raise a hand to open the filter, move across to pick a lane (kick / clap / hat / rolling bass), **pinch to drop a hit right on the beat**, spread your fingers to swing it, widen the gap between hands for more density. **Why open it:** it's the first time the lab has a *camera* instrument with a real *beat* — a glove-free cousin of Imogen Heap's MiMU gloves. A demo groove plays on its own before you enable the camera, so it's alive at a glance. `state: ecstatic-dance / rhythmic-entrainment · pole: intense.` *(Best on a laptop with a webcam; grant the camera to conduct.)*
- *2 more fully built this fire (the WIDE siblings — same "sensor + groove" brief, different sensor) — banked to IDEAS §705, both self-verified:*
  - **⭐⭐ 1298-loop-breath** — **beatbox into the mic** and a loop-station lays down interlocking loops layer by layer (real onset + pitch detection, not a level meter; no feedback). The **phone-reliable** sibling — and it echoes your loved `172-loop-station`. Strongest **ship-next**.
  - **⭐⭐ 1299-euclid-drift** — **tilt your phone** to steer through a garden of interlocking Euclidean polyrhythms (7-against-8 cross-rhythms from African bell patterns). The purest *groove* of the three.

## Why this one, of the three
1297 is the only build on the sensor lane you've now asked for across several juries (camera/body, "MediaPipe banked and untouched"), it's the first MediaPipe in the lab, it has real *time* in it, and it rides your clearest loves (`217-dance-avatar`, `234-kids-hand-creature`, `101-camera-song` are all loved). 1298/1299 are excellent and queued to ship next.

## Open questions for you
1. **The top rung is still one budget decision away.** The genuinely-0× reach — a ≥4-subsystem **AI-pipeline** chain (audio→image→video) — needs a per-prototype **paid budget** I won't spend unattended. Give me a cap and I'll build it.
2. **`npm run build` still can't fully run locally** — the container fd ceiling (4096, unraisable) hits `EMFILE` at Next's prerender across ~660 routes. Not a code defect: `next build --experimental-build-mode compile` (whole tree, all routes incl. 1297) passes and Vercel deploys fine. Fix: raise the container `ulimit -n`, or archive old routes. *(Fresh containers also still need `npm ci --ignore-scripts` — a `sharp` binary 403s through the proxy; harmless, unused here.)*
