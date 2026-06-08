# Morning digest — last updated 2026-06-08 (UTC) (cycle 356)

> **Still acting on the jury verdict** ("break the tuning fixation; build something that *refuses* to harmonize"). This kids fire answers two mandates at once — **#1 "rhythm/noise, not tuning"** and **#6 "the camera/MediaPipe body room is the biggest untouched first."** I went **DEEP** (3 approaches to one concept) and shipped the most kid-legible. See `docs/dreams/JURY.md`.

## New since yesterday
- **`/dream/419-kids-body-band` — Body Band 🥁** (kids 4+). *Open it, tap **Start the band**, and dance — or just watch.* **Your whole body plays a live drum kit through the camera:** hand up → tom, other hand up → snare, both arms thrown wide → crash, knee-lift/drop → kick, head-bob → hi-hat. A groove engine **quantizes every move onto a steady beat**, so even a flailing toddler sounds musical. It's **pure percussion — no melody, no tuning, just rhythm** (the jury's "refuse to harmonize," for kids), and it's the lab's **first body-tracking piece that makes a BEAT instead of a chord** (every prior pose piece made harmony). If the camera's denied, a friendly **ghost dancer** plays the kit hands-free in ~2s, so it demos on your phone untouched. Sits right in your **loved camera-kids lineage** (`101`❤️ `104`❤️ `217`❤️ `234`❤️).

## Also explored (DEEP fire — 3 approaches, 2 banked in IDEAS §356)
- **`420-kids-motion-storm`** — same idea with **no ML at all**: raw webcam frame-differencing → motion energy drives the groove. The dependency-free version that builds even if the MediaPipe CDN is down. Banked as the runs-anywhere sibling.
- **`421-kids-beat-puppet`** — each **limb drives its own continuous percussion layer** (arm = shaker, other arm = conga, legs = kick/hat) — you sculpt an evolving polyrhythm by which parts you move. Banked as the cycle-2 deepening (hits → layers).

## Research finding worth a look
- Anchor: **"Dance Motion-Guided Music Generation via RVQ,"** *Electronics* May 2026 — academics now generate music *from* dance motion (the inverse of the usual pipeline). That's what flipped the concept: the lab had mapped the body to harmony five times and never to **rhythm**. RESEARCH §356.

## Open questions for Karel
- **Does a 4-year-old read "dance → drums"?** The gesture thresholds are first-guess (build-verified, not browser-verified) — worth 20 sec of flailing in front of the camera to tell me if "hand up = drum" lands or needs loosening.
- **Still need your review-browser answer** (phone or desktop) — it gates whether I finally ship the **WebGPU storm** next adult cycle (it's the biggest unclaimed technical "first" but only shines on desktop WebGPU).
- **Pure-percussion register for kids** — is energetic/noisy the right counter to the calm-consonant rut, or do you want the kids lane kept gentle and the "weird" reserved for the adult cycles?
