# Morning digest — last updated 2026-06-19 10:27 UTC · cycle 479 (adult · WIDE)

## New since yesterday
- **`744-magnetic-walk`** ([open](https://getresonance.vercel.app/dream/744-magnetic-walk)) — **the invisible magnetic field around you, made audible.** Turn your phone: your heading in the Earth's geomagnetic frame walks a 12-station "compass of keys" (a different just-intoned drone facing N vs E vs S vs W), and a WebGL2 aurora stays **locked to magnetic north** so the world feels fixed while you turn. The lab's **first true compass/magnetometer piece** (everything before used only raw tilt). **Best opened on your phone** — turn slowly. No mic, no camera, no recorded piano. Refs: Christina Kubisch *Electrical Walks*, Pauline Oliveros *Deep Listening*.
- *Why this one:* it deliberately **breaks the his-piano-grain monoculture** — 8 of the last 10 prototypes used your Welcome Home recording + concatenative grains (the lab over-corrected on the jury's "use your music" note). This cycle banned that cluster and went somewhere new.

## Banked this cycle — worth a look in IDEAS §479
- **⭐ `745-room-listener`** — the lab's **first in-browser neural net**: TensorFlow.js + COCO-SSD watches your camera and turns each object it recognizes (cup, plant, you) into its own voice — *the room, sung*. The boldest swing (3/5), aligned with your loved `101-camera-song` / `86-sound-to-video`. **Banked, not shipped**, because its headline depends on an unverifiable model download and it landed on Canvas2D — I want to rebuild it on a scarce renderer and verify the load. **Top candidate for the next adult cycle.**
- `746-orbit-bell` — hear the ISS overhead *right now*: live telemetry → a cosmic globe drone, and a bell rings the instant it crosses into Earth's shadow.

## Mode / process note
- **WIDE fire** — 3 parallel builders, 3 never-used techniques (compass-sensor / neural-camera / ISS-telemetry); shipped the strongest. Went WIDE rather than DEEP because the jury's "deepen a ceiling" plea points only at his-piano pieces — all diversity-banned this cycle — so the right move was to break the monoculture with fresh techniques.

## Open questions for Karel
- The lab swung hard onto your real piano (8 of 10). Right amount, or dial it back toward fresh-synthesized pieces like `744`? Your answer steers the next several cycles.
- Want me to prioritize resurrecting **`745-room-listener`** (first neural net, on a scarce renderer) for the next adult cycle?

## Heads-up
- `744` is **compile / lint / type-check clean** but only **structurally** verified, not run on a device — same as every cycle since #472 (the sandbox's fd ceiling blocks static-gen; pristine `main` fails identically, so it's the container, not the code — Vercel deploys fine). Unverified by eye/ear: real iOS compass behavior, the aurora shader, drone timbre. The ghost auto-drift + Canvas2D fallback guarantee it's alive on a glance even with no sensor.
