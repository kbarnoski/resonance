# Morning digest — last updated 2026-07-05 (cycle 670, adult · DEEP)

> **Following yesterday's jury**: it praised the fast diversification of *form* but said embodiment came back **shallow** — motion-energy and face-blendshapes, never the body's actual geometry — and left **provocation #4 un-cashed**: *"go structural. Full-body Pose skeleton, gait→tempo, joints/limbs/presence-in-a-room as the instrument."* Today's fire cashes exactly that. See `docs/dreams/JURY.md`.

## Open this first
- **`/dream/1200-gait-loom` — your GAIT is the sequencer. Press "Begin · use camera", step back so your legs are in frame, and walk (or step in place). Headphones on.**
  Your stepping cadence **locks a BPM**; each footfall drops a low granular thud and each arm-swing sprays bright grains, all quantized to your gait clock — a groove **weaves** as you keep moving and **unravels to silence** when you stop. No camera? It falls back to limb pads + a tap-tempo button + spacebar, same engine.

## Why this one
- **The instrument is your body's locomotion, not a pose→knob map.** MediaPipe Pose tracks 33 landmarks; a per-foot lift→plant state machine finds your footfalls and smooths them into tempo. **Gait→tempo was 0×** even within the lab's ~10 existing body pieces — this is the first.
- **Breaks all four of the jury's standing bans at once:** active body-skeleton input (not passive), **granular** voice (not the banned JI choir — 6× in the window), chromatic **ember+teal-on-graphite** palette (not bright-daylight), a Canvas2D loom that isn't a bright scene.
- **Ran DEEP:** three body-skeleton instruments with three different non-JI voices raced; `1200` (gait→granular) won for being the freshest angle + voice + *form*.
- **Honest scope-check that shaped it:** the jury called full-body Pose "0×", but a grep says it's lab-common (677/582/803/811/869…) — it's only 0× in the recent *window*. So I didn't oversell it as a new technique; the real freshness is gait+granular+rhythm. That same grep killed one of the three at curate (a body→drumhead→modal piece too close to the shipped **803-body-chimes** — the "same instrument twice" trap you flagged with 1190≈1152).

## Explored but banked (2 more — see IDEAS §670, both fully built + clean)
- **⭐ `1198-limbline`** — your body as **plucked Karplus-Strong strings**: each bone a waveguide, a fast joint plucks it, extending a limb rings it lower; glowing filaments with pulses that travel down a struck bone. Robust, distinct voice — my **top resurrect** for the next embodied slot; lost only because gait→tempo was the newer angle.
- **`1199-resonant-room`** — your joints strike a real **128×128 finite-difference wave-membrane**; the drumhead's own modes are the sound. Dropped because it lands too near 803-body-chimes.

## Heads-up (build gate — infra, not code)
- The winner passed the **real gate**: `next lint --dir 1200-gait-loom` → **0 warnings/0 errors**, `tsc --noEmit` project-wide → **0 errors**. The full `npm run build` still can't finish *in this container* — it hits the **standing `EMFILE` fd ceiling** (hard-capped at 4096 open files) during static-gen of the ~700-page tree. **Same ceiling documented back in cycle 603; Vercel has no such cap and deploys normally** (668/669 are live). Not a code problem.
- **NOT camera/ear-verified** (headless container, no webcam/speakers): the gait lift/plant thresholds, grain balance, and tempo-lock *feel* want your screen + a few steps. The tap-tempo/pad fallback guarantees it's never blank or silent.

## Still queued behind you
- Jury's other un-cashed provocations: **WebRTC multi-user** (still 0×, still blocked on your **signaling-store** call — or say "stub it against a public test server"); **depth-camera spatial audio** (0×).
- Near-black-glow ban (jury 07-04) lifts ~**07-11** — gates the dark resurrects `1174-magnetosphere-song`, `1166-ear-tone-field`.
- `1198-limbline` (⭐) · `1195-ignition` (⭐) · `1197-torsion` · `1189-turner-sky` all want a slot.
