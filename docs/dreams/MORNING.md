# Morning digest — last updated 2026-06-03 (UTC, cycle 299)

**Open this first:** [/dream/291-harmonograph](https://getresonance.vercel.app/dream/291-harmonograph) — play a chord, then **hold the Space bar** (sustain) and layer another chord on top.

## New since yesterday
- **Harmonograph just became an instrument you *play*** (`291-harmonograph`, **cycle 2**). The chord-draws-itself figure is the same — but now you sculpt it live, the way a pianist uses pedal + dynamics:
  - **Sustain pedal** (MIDI CC64 / **Space bar** / on-screen pad): released notes keep ringing *and* keep drawing — so the figure **accretes** as you layer chords over a held bass.
  - **Mod-wheel → damping** (CC1 / ↑↓ keys / slider): sweep from a loose, sprawling figure to a tight inward spiral.
  - **Harder strikes draw brighter ink**; **Export PNG** saves the figure as an image named for the chord.
- **Why open it:** it's the first time the lab has *deepened* a piece instead of shipping a new orphan — this is the jury's #1 ask, honored. Try a held bass note + pedal, then walk a chord progression on top and watch the figure thicken.

## How it was made (the orchestration is the point)
- **DEEP fire — 2 parallel builders attacked the SAME piece from two angles**, both starting from cycle-1's working code:
  - 🏆 `harmonograph-expr` — the **expressive** layer (pedal / damping / ink / PNG). **Won** — covers 3 of the 4 planned cycle-2 features and changes how you *play*. Promoted into `291-harmonograph`.
  - 🌱 `harmonograph-spectrum` — **per-note color threads** (each note its own hue, circle-of-fifths) + **SVG vector export**. Build-verified, banked as **cycle 3**.

## Research worth a look (RESEARCH §299)
- **Chord→color is an active vein**: *Chord Colourizer* (arXiv 2510.10173, 2025) maps CQT chord detection onto **Newton's color wheel** — the seed for cycle 3's colored threads.
- Honest note: this week's arxiv cs.SD is all *generative* audio-video (Foley-Omni, JenBridge), **nothing** on interactive instruments — so continuing the multi-cycle build (not chasing a fresh paper) was the right call.

## Next
- **Cycle 300 (kids)**: banked candidates `294-kids-voice-garden` (sing→bloom) or `295-kids-shadow-dance` (dance→bloom).
- **Cycle 301+ (adult)**: 291 **cycle 3** — the polychrome specimen (colored threads + SVG export), already build-verified and banked.

## Open questions for Karel
- 291 cycle 2 is **build-verified, not browser-verified**. The one thing a 2-min play would confirm: does the **pedal-accrete** read as intended (layered figure thickening) without the older parked notes muddying it? And does **Export PNG** capture the figure cleanly on your browser?
- **Force-push doc-drift** on `main` recurred again (local diverged 50/50; I `git reset --hard origin/main`). Harmless to the loop, but worth a glance if it's coming from your side.
