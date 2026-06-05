# Morning digest — last updated 2026-06-05 (UTC), cycle 317

Open the lab: https://getresonance.vercel.app/dream

## ⭐ Open this first (adult — your own piano, on the GPU)
- **[323-latent-condensation](https://getresonance.vercel.app/dream/323-latent-condensation)** — **your *Welcome Home* piano, made of 120,000 GPU particles.** Tap **Play Karel's piano**: a cloud of particles churns in turbulent chaos, then on each musical phrase it **condenses into a flowing form** (sphere → torus → ribbon) and dissolves back into noise in the rests. *Why open it:* the whole simulation runs in a **WebGPU compute shader** — the chaos↔form breathing is driven, phrase by phrase, by the live spectrum of your real recording. Best in Chrome/Edge/Safari with WebGPU; if your browser lacks it you get a clear notice and the audio still plays.

## Why this one won (3 explored, 1 shipped — WIDE)
- **A new renderer for the recent window.** Touch input (4×) and Canvas2D output (4×) are *banned* this fire, and three.js had crept to 3× — so I shipped the one piece that's none of those: **WebGPU compute** (light, 8.6 kB, no three.js bundle), driven by an **audio-file** input.
- **Your actual music, in a form the lab had never reached.** The standing "use his real piano" directive keeps coming back — this puts it inside a GPU particle dramaturgy (condense on phrases, dissolve on rests). Pulls from your loved cluster: real music (227/163) + particle/systems (130❤️, 236❤️, 243❤️, 262❤️).
- **Honest ambition 3/5:** 4 subsystems + named ref (nibi, a 2026 WebGPU compute particle engine; + Anadol) + this fire's research. I did **not** claim "first WebGPU" — we've used compute shaders before (130/16/55/75); the novelty is the application, not the technique.

## Also explored this fire (banked in IDEAS.md)
- **324-stillness** — the Cage "blooms only when you're QUIET" anti-instrument (silence → bloom, any sound → collapse), rendered in SVG with cross-session persistence. Ship-ready; **re-flagged as the next adult build** — it's still the boldest answer to "too similar."
- **325-seismic-choir** — every earthquake on Earth in the last day, sung as a **sustained voice placed in 3D space around your head** (HRTF) via the live USGS feed; the chord you hear is the planet's seismic state right now.

## Threads / what's next
- **Adult (319):** ship banked **324-stillness** (now the standing pick), or **322-strange-attractor** (your wishlist), or **deepen 323** (onset-triggered bursts so individual notes fire shockwaves; a readable authored-camera form like an album silhouette).
- **Kids (318):** resurrect **323-kids-coral-bloom** (the voice-grown reef), or deepen **322-kids-voice-garden** (two-voice duet, seasons over multi-day age).

## Open questions for you
- **AI-pipeline-chain** (image gen *inside* an AV piece) is still your most-wanted, never-built direction; it needs paid FAL generation and I won't spend autonomously. **Grant a per-prototype budget (e.g. $X/cycle) and I'll build it next adult fire.**
- **323 is build-verified, not browser-verified** — the one real risk is whether the WGSL runs on your review device's GPU (I couldn't execute it on hardware in the sandbox). 20 seconds at the URL settles it; if WebGPU is off you'll see the labeled fallback rather than a crash.
