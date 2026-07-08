# Morning digest — last updated 2026-07-08 (cycle 707, ~18:15 UTC fire)

> **Your jury (2026-07-08)**: real climb (five 4/5s), but *"you turned the lab into a physics museum — leave the Exploratorium; put a **sensor** or your real piano and a **rhythm** back in the room; your references have gone dead — cite a **living** AV artist."* 706 put your real piano back; **707 (this fire) puts a face-tracking camera + a dub groove in.**

**WIDE fire — I played a dub-techno track with my face.** Three orthogonal **sensor** instruments, each with a real **groove** (a beat, not a bell) and a *living*-artist reference. Shipped the freshest.

## New since yesterday — ⭐ open this first
- **[1305-face-desk](https://getresonance.vercel.app/dream/1305-face-desk)** — **your face is the mixing desk.** A webcam tracks your expressions (MediaPipe FaceLandmarker — 52 ARKit blendshapes) and you play a 124 BPM **dub-techno groove** with no mouse: **open your jaw** → the filter blooms open + throws a dub echo; **raise your brows** → build the arrangement up (hats → chord stab) or strip it back; **turn your head** → pan + feed the delay; **blink** → a beat-stutter; **smile** → brighten. **Why open it:** it's the lab's first **face**-tracked instrument (705 did hands; face was the still-0× lane you kept asking for), it has an actual *beat* (jury #2), and it cites a **living** AV artist — Lieberman & McDonald's FaceOSC (jury #3). Alive on a phone glance; if the camera's denied it plays with the mouse. *(Best on a laptop with a webcam.)*
- *2 more fully built this fire (same "sensor + groove" brief, different sensor) — banked to IDEAS §707, folder-clean:*
  - **⭐⭐ 1307-clap-loom** — **build a groove with your claps.** Real mic **onset detection** (not a gain meter) catches each clap/beatbox/tap, **quantises it to the grid**, and loops it back so you overdub layer by layer. Cashes your *other* 0× lane (mic-as-real-input) and echoes your loved `172-loop-station` — strongest **ship-next**.
  - **⭐ 1306-tilt-pour** — **pour a groove by tilting your phone.** Tilt bends a 3-against-4 polyrhythm across a sloshing liquid field. The most phone-native of the three — made for exactly this 06:30 review.

## Why 1305 won of the three
Freshest technique (first face-blendshapes in the lab), the only one citing a *living* AV artist, the most self-teaching mapping (jaw→bloom+echo reads in one gesture), and it maxes the sensor lane you've asked for most. 1307/1306 are excellent and queued.

## Open questions for you
1. **The 5/5 ceiling is still one budget call away.** The genuinely-0× reach — a ≥4-subsystem **AI-pipeline** chain (audio→image→video) — needs a per-prototype **paid budget** I won't spend unattended. Give me a cap and I'll build it.
2. **Want the mic looper (1307) or the tilt piece (1306) shipped next?** Both are built and one command from live.
3. **`npm run build` still can't fully run locally** — container fd ceiling (4096) `EMFILE`s at Next's prerender across ~660 routes. Not a code defect: `next build --experimental-build-mode compile` (whole tree incl. 1305) passes EXIT 0 and Vercel deploys fine. Fix: raise the container `ulimit -n`, or archive old routes.
