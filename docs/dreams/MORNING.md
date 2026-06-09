# Morning digest — last updated 2026-06-09 (UTC, cycle 366)

## New since yesterday
- **`444-kids-aurora-hands`** ([open](https://getresonance.vercel.app/dream/444-kids-aurora-hands)) — **a 4-year-old cups, swirls and scatters a huge living GALAXY of light with their bare hands in the air — and the galaxy sings.** Wave your hands at the camera: **open hand** pushes the light outward into a nebula, **closed/pinched hand** pulls it into a glowing ball, **bring both hands together** → the particles converge and a warm consonant swell rises. 60,000 particles on a **WebGPU compute shader** (8,000 on the WebGL2 fallback), driven by **MediaPipe HandLandmarker**, over a continuous, never-silent, **non-percussion** D-pentatonic chord-cloud. **Why open it:** it's the **biggest kid-facing GPU concept** the lab has made, it breaks the recent kids-percussion run, and it rides your loved `234-hand-creature` + `262-aurora-particle` / `130-tsl-particle-compute` lineage. *(On your phone with no camera it self-demos hands-free — "ghost hands" dance the galaxy + music immediately; tap "✋ Turn on camera" to take over. A top-right badge shows whether it ran WebGPU ✦ or the WebGL2 ◈ fallback.)*
- This was a **DEEP** kids fire — **one big concept** (*paint a singing galaxy of light by moving in front of the camera*) attacked **3 ways** (optical-flow / whole-body pose / hand-tracked WebGPU); strongest shipped. **2 more explored — see IDEAS §366.** Cleared the floor at 2/5 (≥3 subsystems + MediaPipe/Anadol refs); dodged every ban incl. the **count-banned touch input** (5× in the last 10) via camera, and picked the cleanest renderer (WebGPU, 0× recent).

## Banked tonight (IDEAS §366 — both build-reviewed, ~ready to ship)
- **`445-kids-light-river`** — the **most robust** take: model-free **optical flow** (no MediaPipe, no WebGPU) → a 40k-particle WebGL2 aurora a child paints with *any* whole-body motion. The maximum-reliability 06:30 ship if you ever want zero camera-model / WebGPU risk.
- **`446-kids-star-swarm`** — *your whole body becomes a constellation*: **MediaPipe PoseLandmarker** 11 joints each stream a swarm of ~29k glowing three.js singing stars (head=high, feet=low), ghost-dancer fallback. The next kids body-spatial ship.

## Research finding worth a look
- **RESEARCH §366**: a grep audit corrected two stale "lab-first" assumptions — **WebGPU compute is NOT unused** (15 prior prototypes use it; the 2026-06-08 jury's "still never used" line is outdated) and **optical flow already shipped** (`221`, `295`). The live hook was the MediaPipe→GPU-particle lineage (NVIDIA-Flex / TouchDesigner, derivative.ca 2026) → *camera motion drives a large GPU particle field the body conducts*, which became tonight's whole fan-out.

## Open questions for Karel
1. **`444`**: on your machine, does it run **WebGPU** (the 60k galaxy) or fall back to **WebGL2** (8k)? Does the 60k version read as "massive and alive," and does the **cup-to-gather / fling-to-scatter** gesture feel *magical* or fiddly with your hands?
2. Does HandLandmarker reliably track a small child's hands, or should the next kids cycle prefer the **model-free `445-light-river`** (any motion, no model)?
3. Which next — keep mining the **camera-motion → GPU-galaxy** vein (it's clearly your loved lane), or rotate the kids cycle to a **non-camera** register for breadth (touch is rested, camera will be 3× soon)?
