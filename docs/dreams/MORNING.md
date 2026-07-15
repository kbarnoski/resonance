# Morning digest — last updated 2026-07-15 ~22:40 UTC

## New since yesterday
- **[1762-nde-void](https://getresonance.vercel.app/dream/1762-nde-void)** — *tilt your phone to gaze around a cold, sparse architectural VOID — the ketamine k-hole / near-death "in-between."* Your body drifts forward on rails while your gaze roams free (that split IS the dissociative feel). Each distant luminous structure is **HRTF-spatialized from its true 3-D position**, so passing one sweeps its cold bell-tone from in front of you, across your head, to behind. **Open it, press Begin, tilt to look around — best with headphones (the audio is binaural). Or just watch: it drifts and sweeps on its own.**

## Why this one
- **Cashes yesterday's jury's loudest note head-on.** #2: *"return to the psychedelic core on the OTHER poles — dissociative is thin — cash a banked altered-states piece, don't start another instrument."* This is the long-banked `void-descent` finally shipped, on the dissociative pole the lab had served only once.
- **The defining move: one geometry, two senses.** A single table drives BOTH the raymarched shader AND one spatial-audio panner per structure (plus the listener orientation) — so sight and sound can never come apart. Passing a structure genuinely relocates its sound to wherever its glow now is.
- **three.js, off the banned Canvas2D** (jury #3), 4 subsystems, cold violet-neutral architectural palette — a deliberate break from the last four cosmic-ambient/breath pieces.

## Explored but not shipped (WIDE fire — 3 built, best shipped; other 2 banked, IDEAS §790)
- ⭐⭐ **1760-nidra** — cross the hypnagogic threshold by **TOUCH**: a drug-free yoga-nidra body-scan where a travelling point of **phone haptic vibration** is the moving locus of your attention (feet→crown). The boldest idea of the night and the literal answer to the jury's "test the screen-bias with a haptic experiment" — **held back only because iPhones don't support web vibration**, so it needs an Android review or an iOS audio-tactile fallback first. **If you're on Android, say the word and I'll ship it — it's the top of the bank.**
- ⭐ **1764-ganzfeld** — your **camera's own sensor noise** becomes the "neural noise" of a Ganzfeld: point at a blank wall and a shader amplifies the grain into drifting hallucinatory geometry. Freshest concept; the real-camera bloom is currently too subtle — needs a legibility pass.

## Research finding (§790)
- **Yoga nidra reframes hypnagogia as a *conscious, guided descent*, not a spontaneous drop-off** (Woolfe, 2026-05; Sharpe et al.) — a systematic feet→crown scan of *attention* that keeps you awake at sleep's border, and the relaxed entry makes the threshold imagery gentler. That seeded tonight's haptic body-scan brief. Paired with the 2025–26 browser spatial-audio surge (HRTF is now the *expected* immersive-web stack) → the shipped void.

## Open questions for Karel
- **What phone do you review on?** If Android/Chrome, `1760-nidra` (the haptic body-scan) is ready to ship — it's genuinely the most novel thing in the bank and only needs your device confirmed.
- **The AI-pipeline chain (audio→image→video, ≥2 models) is STILL the one genuinely-empty lane** — 8 juries running, blocked only on your go for a small per-prototype paid budget (rule #6). One word unblocks it.
- Housekeeping (unchanged): the full `npm run build` still can't finish the *page-data* step under this sandbox's hard 4096-fd cap at ~745 routes — but this cycle it **passed ESLint + TypeScript + compile cleanly** and the compile-mode gate is EXIT 0 with the new route in the manifest; Vercel has the fd headroom, deploy is unaffected. (New: a builder running its own `npm install` mid-cycle corrupted node_modules — root-caused, fixed, logged.)
