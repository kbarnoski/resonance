# 16208 · loomvoice

**One question:** *What if your voice were a shuttle on a loom — pitch choosing which of Karel's takes rises to the surface, loudness pulling the weave tight or letting it spread across the room — weaving four whole recordings into one cloth of sound?*

## What it is

Four of Karel's **complete** piano recordings loop simultaneously and forever, as four threads of one woven cloth:

- Interplay · `d57cfae6-f234-4d24-85fe-72a8ad93a44a`
- Bath · `eba95845-cdbf-41d8-9c5d-8679686811ad`
- 2019 · `1f0a541e-df60-44a9-b839-5dc69a007d9f`
- Rolling · `d2eeee58-832b-4872-a4be-8fbf030b981d`

Every take runs its own graph: `AudioBufferSourceNode(loop) → BiquadFilter(lowpass) → GainNode → StereoPannerNode → createSafeMaster(ctx).input`. All four start at sample 0 and loop. A gain floor keeps every strand faintly present — the cloth is always genuinely polyphonic, never a solo with three muted tracks. Nothing is ever granulated or chopped; each thread is a whole recording.

The output is an **inline-SVG woven cloth**: four polychrome threads (one hsl hue each — cyan, gold, green, coral) that actually interlace over-and-under a neutral weft scaffold, in a basket-weave pattern. No WebGL, no canvas, no shader, no film grain.

## The two-axis voice → balance + spatial mapping

Each animation frame reads the mic AnalyserNode and derives two numbers:

- **loudness** = RMS of the time-domain signal.
- **rough dominant pitch** = the peak frequency bin between 90–700 Hz (parabolically interpolated), only counted when the signal is voiced above a noise floor.

Those drive a 2-D control point:

- **pitch → surface position.** A low voice surfaces strand 0, a high voice surfaces strand 3, continuously between (log-scaled). The surfaced strand gets the highest prominence: gain up, lowpass thrown open (toward ~12 kHz), thick and bright, drawn on top of the cloth. The others recede — lower gain, lowpass closing toward ~500 Hz, thin and dim — but stay audible.
- **loudness → weave tightness + stereo spread.** A whisper collapses the ensemble: all four StereoPanners near 0, threads packed into a tight center. A strong voice fans the panners out across `[-0.8, +0.8]` by strand and pulls the threads wide apart on screen. The visual spread and the audio spread are the same number.

Every audio target is eased with `setTargetAtTime` (time-constant ~0.4 s) so the balance moves musically rather than snapping.

**Hold (nice-to-have, implemented):** sustain a steady pitch at reasonable volume for ~2 s and the current balance freezes into a saved weave you can return to; a "release" affordance picks the shuttle back up.

## Mic is control-only (rule 10)

`getUserMedia({audio:true})` → `ctx.createMediaStreamSource(stream)` → `AnalyserNode`, and it **stops there**. The mic analyser is never connected to the safeMaster input or to `ctx.destination`. The only thing the visitor hears is Karel's four takes, through the shared ear-safety master. The mic is a secondary control layer with an active vocal verb (your voice conducts) — not a camera, not a passive listener.

## Graceful degradation

- Four takes are ready to play on one primary **Play** gesture.
- **Mic denied / unavailable:** an on-brand `text-destructive` notice appears, and control falls back to **pointer** (x = surface/pitch axis, y = tightness/loudness axis) plus an **idle auto-demo** that slowly traces a path through the 2-D control space, so Karel's polyphony plays and the cloth animates hands-free.
- **Full teardown on unmount:** all four sources stopped, AudioContext + safeMaster disposed, `cancelAnimationFrame`, and the mic tracks stopped.

## Honest novelty framing

This is **not a "first."** It extends the lab's multi-track-polyphony lineage — the "spheres" move, where several of Karel's whole takes are held in relationship rather than one clip being processed.

It is a deliberate counterpoint to **Mermerci et al., "Real-Time Control of a Virtual Orchestra by Recognition of Conducting Gestures" (arXiv:2604.27957, 30 Apr 2026, KTH / Swedish National Museum of Science & Technology)**, in which a vision-tracked visitor conducts recorded music but controls only its playback *pace*. loomvoice instead conducts *balance + spatial spread* — and by *voice*, not gesture.

Its precise novelty: **voice-as-shuttle — pitch selects the surfaced strand, loudness controls weave-tightness and stereo spread — over a polyphonic braid of four whole takes, rendered as interlaced cloth.**

## Files

- `page.tsx` — `"use client"` React page: idle/loading/error/running states, the imperative inline-SVG woven cloth + requestAnimationFrame loop, mode/hold HUD, design-notes modal, `PrototypeNav`.
- `engine.ts` — audio-graph construction (four strands → safeMaster), the control-only mic tap, `readVoice` (RMS + peak-bin pitch), and the pure `computeWeave` that turns one 2-D control point into per-strand audio targets + SVG geometry.
- `README.md` — this file.

## Constraints honored

Karel's real catalog only (`loadRealTrackBuffer`), zero synthesis; every audible path ends at `createSafeMaster(ctx).input`; mic never audible; no WebGL / canvas / shader; no film grain; no drug or dosing language; semantic design tokens for all chrome with polychrome hsl confined to the SVG art layer.
