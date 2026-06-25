# Morning digest — last updated 2026-06-25 ~16:2x UTC (cycle 551, adult · DEEP)

> **Today's jury** (`docs/dreams/JURY.md`) asked for four things: **ban three.js / push onto raw WebGPU** (#1), **make music from real PITCH / voice-leading again** (#2), and above all **deepen one of the three "0× category-openers" you cracked — don't open a fifth** (#4). This build does all three at once.

Open the lab: https://getresonance.vercel.app/dream

## ☀️ Open this first
- **[942-depth-harmonic-room](https://getresonance.vercel.app/dream/942-depth-harmonic-room)** 🎹🕯️🟠 — *Walk through harmony.* Stand in front of your webcam: an ML model reads the room as a live **depth field**, and your **distance + sideways position place you inside a Tonnetz** — the classic geometry of chords. **Step sideways** and the harmony rotates through related keys (C → Am → F → Dm…); **lean in** and the chord brightens to major, **pull back** and it darkens to minor. Every step is a real **neo-Riemannian P/L/R move** — two of the three voices hold, one glides — so you literally *walk voice-led chord changes*. Rendered as a candle-warm **WebGPU** lattice that blooms as you lean in.
  - **This is the deepening of `927-depth-room`** the jury asked for (#4) — same depth-camera idea, but where 927 froze pitch, here **harmony IS the instrument** (#2). And it's on **raw WebGPU** (the scarce surface the jury wants), *not* three.js (#1).
  - **No camera? It still plays.** A synthetic "presence" drifts the Tonnetz on its own within ~1s, a laptop without a camera steers by mouse, and it degrades WebGPU → WebGL2 → a plain chord view. Camera is processed on-device, never recorded.

## In progress / partial
- Nothing mid-thread. **Next fire = cycle 552 (kids).** Kids resurrect-first: **940-kids-blob-choir** (the Canvas2D conduct-a-choir twin of yesterday's 941).

## Also explored this fire (DEEP — 1 concept × 2 render approaches, shipped 1)
- **943-depth-tonnetz-room** ⭐ — the *same* depth→Tonnetz instrument on **raw WebGL2** instead of WebGPU. Build-green, banked in IDEAS §551 as the **adult resurrect-first**: the bulletproof no-WebGPU twin if 942's WebGPU path feels flaky on your hardware. (Its builder honestly flagged that a rectangular grid can't make *both* axes perfectly parsimonious — the Tonnetz is triangular — a real limitation to fix in a future pass.)

## Research finding worth a look
- **RESEARCH §551** — browser-native monocular depth (Depth Anything V2, Apache-2.0, runs on WebGPU via Transformers.js) is now a *free, no-hardware room sensor* in 2026. Point it at the **neo-Riemannian Tonnetz** (the spatial geometry of harmony, where least distance = smoothest voice-leading) and walking *becomes* composing. In-README dated-citation streak now **17 cycles**.

## Open questions for Karel
- I **rejected the other two deepen-targets the jury named:** 918 (WebRTC) is a *kids* piece (wrong rotation tonight), and 915's suggested path (music→narrative→**TTS**) collides with your standing "pull way back on AI voice generation." 927→harmony felt like the cleanest adult read of #4 + #2. Push back if you'd rather I'd taken 915 (routing narrative to on-screen text/score instead of TTS).
- 942 is **not GPU/camera/ear-verified** here (no WebGPU/webcam/audio in the container; static-gen still hits the standing EMFILE infra ceiling — Vercel deploys fine). Worth a real-device check: does **Depth Anything V2 actually load on your WebGPU**, and do the warm pads read as genuinely *voice-led* as you move? The fallbacks cover every failure, so it'll always sound — but the live depth path is the unverified bit.
- **Verification debt is mounting** (jury #3): 942 is the 17th build-green-but-unheard prototype. If infra allowed me to actually run 927/942/932 on a real device, that'd be a higher-value cycle than a fresh build — flagging in case you want to prioritize an infra fix.
