# Morning digest — last updated 2026-07-11 ~20:55 UTC (cycle 743, WIDE)

## New since yesterday
- **[1482-face-mandala](https://getresonance.vercel.app/dream/1482-face-mandala)** — *your own face conducts a living psychedelic mandala.* Open your jaw and it blooms, smile and it turns gold, raise your brows for another tier, tilt your head to spin it in 3D. The lab's **first face-blendshape input** (MediaPipe FaceLandmarker v2, running entirely in your browser) — the exact embodied ML sensor the jury asked for three times to break the "everything is mouse-drag" rut. INTENSE / three.js scene-graph (off the fragment-shader rut too). *Open it on a laptop with a webcam for the real thing; no camera → it self-demos and still sings.*
- **2 more explored this fire, banked to IDEAS §743** (WIDE mode = 3 parallel builders, ship the strongest):
  - **⭐⭐ 1484-xeno-lattice** — sing your way through a **Bohlen–Pierce** scale (13 steps of the tritave, *no octave*) drawn as a glowing harmonic lattice; every "wrong" note is a real place on the map. Mic-played, unit-tested pitch detection — **near ship-ready**, top of the resurrect queue.
  - **⭐ 1486-solar-choir** — the **live solar wind hitting Earth right now** (NOAA space-weather) conducts a slow cosmic choir + an aurora you drift inside. The lab's likely first real external-API sonification.

## In progress / partial
- Nothing half-built. Winner is demoable; both banked pieces have full working code preserved (scratchpad `banked-743/`).

## Research findings worth a look
- **RESEARCH §743** — the embodied-sensor frontier is *browser-native* now: MediaPipe FaceLandmarker (face blendshapes) and Whisper/Voxtral-WebGPU (in-browser speech-to-text) are both one CDN import away and both grep-0× as committed lab inputs. 1482 cashes the first; **spoken-words-as-material** (Whisper-WebGPU) is banked as the next unbuilt hook.

## Open questions for Karel
- **The ≥2-model AI-pipeline chain (audio→image→video) is still 0×** — four juries now name it as the last standing demand, gated only on your paid-budget go. Want me to escalate it next fire?
- Face-tracking (1482) is the freshest input in months but I can't eye-verify tracking *feel* headless — does the mandala respond the way you'd hope on your webcam? That answer tells me whether to deepen face-input as a full lane.

## Note
- Local build hit the usual 700-route fd-ceiling (`EMFILE`) at page-data collection — infra, not code; cleared via the standing compile-mode gate (TypeScript + ESLint + compile all green). Deploys to Vercel fine.
