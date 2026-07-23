# Morning digest — last updated 2026-07-23 ~20:30 UTC (cycle 881, DEEP)

> **Day 4 of your jury's "full week off altered-states"** (tool → game → technical-firsts → **body-instruments**). Cycle 880 shipped the first of your jury's two named 0× technical gaps (WebGPU compute). This DEEP fire ships the **other one**: **real MediaPipe** face/hand/body tracking — the jury's endorsed fix for the bare-webcam-centroid monoculture.

Open the lab: https://getresonance.vercel.app/dream · **best on a laptop with a webcam + sound on.**

## New since yesterday
- **`2410-facesong`** → https://getresonance.vercel.app/dream/2410-facesong — **your face is a vocal instrument.** The lab's first *real* MediaPipe (`FaceLandmarker`, 478 landmarks + **52 blendshapes**). Open your mouth → an "aah" swells; smile → it brightens toward "ee"; purse → rounds toward "oo"; raise your brows → the pitch bends; tilt your head → it pans. A glowing 478-point face-mesh sings back what you're doing. **Why open it:** it's the freshest control surface MediaPipe offers — the *trained expression coefficients*, not just dots — driving a real formant "voice." Just sit at the laptop and let it read your face; no hands to raise, no standing back.
- **2 more explored this fire (DEEP — one concept, three MediaPipe models), banked to IDEAS §881:**
  - ⭐⭐ `2408-handspan` — first real `HandLandmarker` (21 pts × 2 hands): conduct a chord with bare hands (finger-spread = voices, height = register, pinch = strike). TOP resurrect for a hands cycle — its `hands.ts` becomes a reusable `_shared` primitive.
  - ⭐ `2412-conductor` — first real `PoseLandmarker` (33-pt full body): a whole-body theremin (reach wide = swell, raise a hand = climb in pitch). The most *stage-fit* piece; held back only because it needs your whole body in frame = least reviewable at a seated glance. A natural fit for your installation/Tauri-venue interest.

## In progress / partial
- None. Clean single-commit cycle: winner shipped, two seeds banked.

## Research findings worth a look
- **The under-used MediaPipe channel is the FaceLandmarker's 52 *blendshapes*** — a trained, labelled expression bus (jawOpen, mouthSmile, browInnerUp…) predicted client-side (*Blendshapes GHUM*, arXiv 2309.05782). Everyone else uses raw landmark positions; almost nobody sonifies the blendshapes. Cashed this cycle as `2410`. RESEARCH.md §881.

## Open questions for Karel
- **The camera-verify debt, honestly.** `2410`'s live face-tracking can't run headless, so it's compile/lint-verified only — but it degrades to a seeded visual auto-demo (a breathing synthetic face) + a pointer/sliders fallback, so it always renders. On your real machine you'll see the true blendshape-driven version. Worth a glance: does the vowel morph read as a convincing sung voice?
- **Both of your jury's named 0× technical gaps are now closed** (880 = WebGPU compute, 881 = real MediaPipe). The two lanes still needing your go-ahead: a real **AI-pipeline chain** (audio→image→video — needs a FAL_KEY budget + your OK) and a **true cross-machine WebRTC** listening room. Say the word.
- Mode ledger …879 D · 880 W · **881 D** → back to WIDE next cycle.
