# Morning digest — last updated 2026-07-29 (cycle 946, DEEP)

> **Yesterday's jury** said the lab has *never once* spent a deliberate second cycle deepening a strong piece — criterion (4) is 0-for-6 windows, "that, not ambition, is the missing discipline" — and named `3608-atlas` the peak to extend. **So this cycle is the lab's first-ever deepening.** See `docs/dreams/JURY.md`.

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **[3648-songlines](https://getresonance.vercel.app/dream/3648-songlines)** — **a recording played like a keyboard.** `3608-atlas` gave you a recording's timbre-map to *wander* with the mouse. Songlines makes it an **instrument you play and compose with.** Hit Start, then press keys **A W S E D F T G Y H U J** (low→high) — each jumps you to a *timbre region* of the recording (warm/low → bright/shimmer) and sounds its grains. **Plug in a MIDI keyboard and it plays that** — the lab's first real Web MIDI instrument, and the seam most relevant to "Resonance for pianists." Then the point of it: hit **Record**, play a little phrase, hit **Stop** — and it **loops forever.** You didn't wander a recording; you *composed with it.* Before you touch anything, a seeded autopilot plays + records + loops a phrase so you see the whole idea in ~2 seconds.

## Why this one matters
Three jury asks in one build: (1) the **first deliberate deepening** — the discipline the jury said was missing for six windows; (2) **off touch, onto a wire** — real MIDI, the still-zero hardware path serving your live-performance priority; (3) **agency back** — you author a composition, but with **no fail-buzzer** (the correction to a run of 11 no-stakes pieces).

## Also explored this DEEP cycle (built + banked, not shipped — IDEAS §946)
- **`3656-tracer`** (⭐⭐) — steer a read-head through the cloud, record the path, then **overdub** more paths into a growing multi-voice piece. The best banked answer to "make it different at minute 5" (memory).
- **`3664-confluence`** (⭐) — **two recordings in one shared timbre-map**, morph between them: play recording A's contour with recording B's material. The jury's other named v2 hook.

## Research (RESEARCH §946)
- Schwarz's corpus-synthesis work notes navigation "**can be recorded for later playback**" — the un-built half of atlas, which Songlines makes literal. Plus **FXplorer** (arXiv:2606.08286, Jun 2026), a recent "map as playable surface" sibling.

## Open questions for Karel
- **Does playing a recording's own timbres as notes *feel* musical?** Built headless — needs your ears (and a MIDI keyboard, if you have one plugged in).
- **Feed it your actual Path piano?** The natural next step: point Songlines at one of *your* recordings via `/api/audio/[id]` so a take of yours becomes a playable map. (Still-uncashed real-music directive.)
- **Unblock the AI-pipeline chain (music→image→video)?** Still 0× — needs your explicit go-ahead + a per-run `FAL_KEY` $ cap. One word unblocks it.
