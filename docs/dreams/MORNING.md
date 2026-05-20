# Morning digest — last updated 2026-05-20 UTC (Cycle 54)

## New since yesterday

- **[/dream/46-osc-composer](/dream/46-osc-composer)** — Oscilloscope Composer
  _Why open this_: design a Lissajous shape with three sliders, download the stereo WAV that
  draws it on an oscilloscope in XY mode. The download IS the point — same file you'd feed into
  a real oscilloscope or into `20-scope` (Phase Portrait mode). Five presets map musical intervals
  to geometry: perfect fifth = 3-lobe trefoil, perfect fourth = 4-leaf rose. Puzzle mode shows
  a target figure and asks you to match it.

## What's been shipping (Cycles 52–53)

- **[/dream/45-guided-session](/dream/45-guided-session)** — Guided Brainwave Session _(Cycle 53)_
  Pick a journey arc (Stressed → Calm, Scattered → Calm, Wired → Drowsy, Alert → Deep Rest),
  set step duration (Quick 30s / Normal 5m / Deep 10m). Isochronic tones walk your brainwave
  frequency from start to goal — no headphones needed. Based on the proactive music therapy
  research cluster (RESEARCH.md §§74, 75, 80). Path breadcrumb, per-step journal, auto-advance.

- **[/dream/44-vocal-bgm](/dream/44-vocal-bgm)** — Vocal BGM _(Cycle 52)_
  Hum 5–15s → ACE-Step 1.5 generates a 30s full-band arrangement around your melody.
  Genres: jazz trio, ambient, cinematic, rock, folk. $0.006/generation, FAL_KEY in use.
  ⚠ If it shows a fal.ai error, paste it — will fix endpoint in next cycle.

## In progress / partial

- Nothing currently in-progress.

## Research findings worth a look

- **Oscilloscope music as genre** — an art form where audio = visual. `46-osc-composer` is
  the sandbox's entry point. Polish direction: add waveform selector (triangle/sawtooth adds
  overtone loops that create spirograph-style figures), slow phase auto-rotation for WAVs that
  "spin" on an oscilloscope.

- **Proactive mood traversal** (`mood-journey`, IDEAS.md) — still unbuilt. Combines `38-mood-xy`
  synthesis engine with `42-binaural` isochronic layer; auto-glides from "now" to "goal" over
  10–20 minutes. Research due this cycle or next (3-cycle threshold reached).

## Open questions for Karel

1. **GEMINI_API_KEY** — still pending. Unlocks `lyria-ghost`, `binaural-lyria`, `30-lyria-jam`,
   `piano-to-ghost`. Four prototypes waiting on one key.

2. **`44-vocal-bgm` API status** — did the ACE-Step endpoint work, or did you see a fal.ai error?
   If error: paste the message and the agent will fix `route.ts` next cycle.

3. **Research vs build** — research is at the 3-cycle threshold (Cycles 52, 53, 54). Next cycle
   could be research sweep OR build `mood-journey` (zero deps, one cycle). Your call.
