# Morning digest — last updated 2026-06-25 ~14:xx UTC (cycle 550, kids · DEEP)

> **This morning's jury** (`docs/dreams/JURY.md`) said: ban three.js, stop using the mic as the default input, retire granular texture — and above all, **make music from real PITCH / melody / harmony again.** "Pitch held deliberately dumb / drone + texture" had become boilerplate in two-thirds of builds. Today's kids build is the direct answer to that.

Open the lab: https://getresonance.vercel.app/dream

## ☀️ Open this first
- **[941-kids-choir-bloom](https://getresonance.vercel.app/dream/941-kids-choir-bloom)** 🎶🫧🌈 — *A 4-year-old conducts a choir.* Drag the glowing **rose blob** up and down to set its pitch, and a **voice-leading brain** moves the other three singing blobs into real four-part harmony underneath — so a little melody you draw with one finger turns into shifting chords (I → vi → IV → V …). The blobs are **GPU metaballs** that bloom brighter as the voices lock into a chord.
  - **This is the piece where harmony IS the idea** — the deliberate opposite of the "no-wrong-notes drone" toys the jury just called out. The voices *sing* (real formant/vowel synthesis, like a tiny offline **Blob Opera**), with **no mic, no AI, no network** — fully private, exactly right for a kids' app.
  - Rendered on **WebGPU** (the scarce GPU surface the jury asked us to push onto, *not* three.js), degrading cleanly to WebGL2 then a plain glow. Leave it alone ~2s and it sings itself a calm tune.

## In progress / partial
- Nothing mid-thread. **Next fire = cycle 551 (adult).** The jury's priority (#4) is to **develop the three 0× category-openers** rather than open a fourth: go DEEP on **927-depth-room** (→ a multi-zone spatial instrument you walk through), **915-resonant-cinema** (→ music→narrative→TTS→score-follower), or **918-starlight-friend** (→ a conducted two-player ensemble).

## Also explored this fire (DEEP — 1 concept × 2 render approaches, shipped 1)
- **940-kids-blob-choir** ⭐ — the *same* conduct-a-choir concept on **Canvas2D** (soft character-face blobs). Build-green, banked in IDEAS §550 as the **kids resurrect-first**: Canvas2D is fresh again, and it's the bulletproof no-GPU render path — the safe twin if 941's WebGPU/WebGL2 paths feel flaky on your iPad.

## Research finding worth a look
- **RESEARCH §550** — the 2026 singing-voice field is all racing toward bigger **neural** models, but the kid-magic of Blob Opera (conduct a choir by dragging voices to pitches) rebuilds with **1970s formant DSP** — offline, free, private. That's the counter-move this build makes. In-README dated-citation streak now **16 cycles**.

## Open questions for Karel
- I **rejected the queued kids resurrect (`936-kids-rattle-bloom`)** — it's a shaker with pitch held to a single drone, i.e. exactly the "pitch-dumb" template the jury banned this morning. Building a real-harmony choir instead felt like the clearer read of the verdict. Push back if you'd rather I'd shipped the banked one.
- 941 is **not GPU/ear-verified** here (no WebGPU/audio in the container; static-gen still hits the standing EMFILE infra ceiling — Vercel deploys fine). Worth a listen for whether the blobs read as genuinely *singing* (the vowel formants may want ear-tuning), and whether a 4yo grasps "drag the rose blob up = higher."
- Watch for a new template forming: **941 + 902-harmonic-mirror** are now the two builds reasoning about real harmony — good, as long as "conduct-a-choir / voice-leading" doesn't itself become the next reflex.
