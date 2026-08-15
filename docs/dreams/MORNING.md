# Morning digest — last updated 2026-08-15T05:14Z (cycle 1139, WIDE)

## New since yesterday
- **[13248-rubatoline](https://getresonance.vercel.app/dream/13248-rubatoline)** — **the lab's first piece about *your* expressive timing.** It runs real-time onset detection on one of your actual recordings (default *Bath*) and draws your **rubato** — the elastic push-and-pull of your tempo — as a living line of ink on a scrolling paper staff. Where your time is steady the marks fall evenly; where you push and pull they bunch and spread, and a breathing tempo-curve baseline stretches and compresses to match. A meter reads **STEADY / gentle push-pull / expressive rubato** from the variance of your recent note-spacings — separating intentional expressive timing from metronomic time. **Why open this (headphones):** every other catalog piece uses your audio as *texture*; this one reads how you actually *play* — your performance's timing, not an FFT of noise. It's also the most different-in-kind thing in the lab right now: an ink notation score, not another shader. On a muted phone a seeded demo already alternates steady and rubato phrases so the idea reads on the first frame. Refs: Grosche & Müller (Predominant Local Pulse), "Rubato" (arXiv:2605.24291, 2026), Simon Dixon.

## Explored this fire (WIDE — 2 more built, banked, not shipped)
- **graftfield** — your whole album grows one continuous **reaction-diffusion garden** on the GPU (WebGPU compute), its patterns seeded by the **real chords and key** of each track; long-form and never-resetting, so minute 5 ≠ minute 1. The technically biggest of the three. IDEAS §1139, **resurrect-strong**.
- **tiltweave** — **tilt your phone** to steer *through* a recording: leaning pans it across the room and opens/darkens it, bending a woven curtain of light with you. IDEAS §1139.
- All three raced *different directions with different renderers* (SVG / three.js / WebGPU) in one fire — a direct answer to the "too similar" note.

## Research finding worth a look
- **Rubato is a 2026 MIR frontier being made visible** — new work transcribes *timestamped* sheet music to show expressive timing, and separates intentional rubato from unsteady timing via rhythmic-stability metrics. Your Covid-era solo piano is rubato to the core — a perfect fit. That's the engine under rubatoline. RESEARCH §1139.

## Housekeeping
- **Log rotation done.** STATE/IDEAS/RESEARCH had grown to 11/4/3 MB and were bloating `.git` (a multi-MB blob every 2 hours). Moved the old bulk into `docs/dreams/archive/` and kept the recent ~200KB live — future cycles now commit tiny doc diffs. Nothing lost (it's all in `archive/` + git history).

## Open questions for Karel
- **Sound-on / real-device review is the biggest lever** — rubatoline genuinely needs your ears to judge whether the onsets track your rubato and the stability label reads true. Same standing ask: resonantrooms (headphones), preparedchance (MIDI), dreammedley (5-min arc).
- **graftfield** is the strongest resurrect if you like it — want the GPU harmony-garden built out next, or shall I chase the AI-pipeline chain (music → image → video, needs a FAL_KEY budget + your go-ahead)?
