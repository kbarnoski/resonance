# Morning digest — last updated 2026-08-13 17:28 UTC (cycle 1121)

**WIDE cycle — I answered your jury's two *still-open* provocations at once.** Yesterday's DEEP (orbithall) already deepened a proven first (#3). That left #1 "ship a real GPU piece — WebGPU-compute is 0× shipped, rest Canvas2D + SVG" and #2 "reclaim a live sensor — everything's turned into desk-input." So this fan reclaimed **three different rested sensors** (mic / tilt / MIDI) across **three different non-banned outputs** (WebGPU / three.js / pure-CSS), and I shipped the one that lands both #1 and #2.

## New since yesterday
- **[11312-voxbloom](https://getresonance.vercel.app/dream/11312-voxbloom)** — *sing into a rotating 3-D sculpture of your own voice.* A live-mic FFT drives a real **WebGPU compute** point cloud: every harmonic is a shell of ~60k glowing cyan points that blooms outward when you're loud and folds back to the core when you're quiet. Orbit it with a drag. **Why open it:** it's the WebGPU-compute GPU piece the jury kept asking for (0× shipped in the last 15), and it reclaims the mic — two open provocations in one ship.
  - **Phone-robust:** a seeded self-demo starts the sculpture blooming within ~1s before any permission, and where a device has no WebGPU it falls back to a three.js points cloud (never a flat 2-D drawing) — so a muted phone still sees an orbiting sculpture. Tap **Start microphone** to sing into it.
  - Honest billing (per your provocation #5): I greped first — WebGPU-compute + spectral clouds already exist in the lab, so this is billed **2/5 (#2 subsystems + #5 research)**, *not* a faked "first." The value is shipping the rested GPU substrate + the mic, not a novel algorithm.

## Also explored (banked, not shipped — see IDEAS §1121)
- **11328-tiltglide** ⭐ RESURRECT-FIRST — *tilt your phone to fly an endless canyon of singing crystal where your altitude is the melody*, over a Shepard–Risset endless-descent drone (three.js, tilt sensor, cosmic-ambient). Reclaims tilt beautifully — but its three.js doesn't land your *named* WebGPU-#1, so it lost narrowly. I'd ship it verbatim next.
- **11344-lumenorgan** — *a MIDI keyboard as an organ of light*: a pure-CSS stained-glass window (zero canvas/WebGL) that blooms a panel per note; a self-playing chorale runs on a bare phone. Freshest substrate, truest MIDI reclaim — but explicitly non-GPU, and MIDI can't be tried on a phone.

## Open questions for you
- **GPU-check on your machine:** does voxbloom's WebGPU compute path resolve your voice's harmonics into distinct *shells* (I can't verify WebGPU or audio headless — the three.js fallback is what a phone sees). If it lands, a device-verified WebGPU deepening is a strong next DEEP.
- Next is a **DEEP** by rotation. Promote **tiltglide** to a full ship, deepen **voxbloom** on real GPU, or finally take the **multi-user / WebRTC** lever you keep naming (now 0× for 16+ cycles)?
