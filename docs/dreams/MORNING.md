# Morning digest — last updated 2026-07-30 (cycle 960, WIDE)

> **A sound that composes its own scale.** Tonight went WIDE — three lab-first techniques raced, off every one of yesterday's jury bans (granular · point-cloud · pointer · cosmic-ambient) — and shipped the one that lands the starved output lane the jury flagged: **SVG**.

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **[4056-overtone-loom](/dream/4056-overtone-loom)** — **hum a note and the piece derives a microtonal scale from your OWN voice's harmonics, then hands you a keyboard tuned to it.** Neither imposed (no 12-TET/pentatonic) nor absent (not bare continuous-pitch) — a genuine *third* stance: the tuning is read out of the signal. Hit **Start** (a synthetic voice self-demos hands-off), watch the scale crystallise on a live **SVG tuning wheel**, then play the derived degrees on `A S D F G H J K L`. Change what you hum → the scale re-derives. **Why open it:** a "huh, I didn't know we could do that" — and the first crisp SVG harmonic-cartography piece in a long while. Ref: the **Biotuner** engine / Antoine Bellemare.

## Two more explored tonight (WIDE fire — 3 lab-first techniques; both non-winners built, verified, banked in IDEAS §960)
- **`4072-lenia-choir`** ⭐⭐ HIGH, ship-next — a **living ecology that SINGS**: lab-first **Lenia** (Bert Chan) continuous cellular automaton whose *orbium* gliders each become a voice; WebGPU compute + Canvas2D fallback, long-form/stateful (minute 5 ≠ minute 1). The builder empirically swept params to get gliders that actually persist. Held only vs. 4056's SVG diversity edge + WebGPU build risk.
- **`4064-hollow`** ⭐ — finally puts **your REAL piano in the lab**: loads your actual Path recording via `/api/audio`, then **freezes** any instant into an infinitely-breathing spectral chord you can sculpt (a true phase-vocoder freeze, not banned granular). Held only because Canvas2D output is saturated this window.

## Research finding worth a look
- **RESEARCH §960** — the **Biotuner** engine + Antoine Bellemare's *harmonic recurrence*: derive a tuning system from a signal's own spectral peaks (peaks → scale degrees, ratios → intervals). The lab had only ever *imposed* a tuning or *avoided* one — this is the untried third stance, and it's tonight's winner.

## Open questions for Karel
- **Which to ship next?** `4072-lenia-choir` (WebGPU living choir) is the boldest and ship-ready with documented params; `4064-hollow` is the one that finally uses YOUR music. Say which and I'll build it out.
- **Still-stalled, your call only:** the **AI-pipeline chain** (music→image→video) is STILL 0× — it needs your explicit **FAL_KEY** go-ahead + a per-run $ cap. A decision, not a build; say the word and I'll wire it behind the api-guard.
- **Multi-user (jury #5):** real two-device WebRTC, or retire the seed? It's been demoed-solo for three windows now.
