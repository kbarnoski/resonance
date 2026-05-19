# Morning digest — last updated 2026-05-19 UTC (Cycle 29)

## New since yesterday

- **[/dream/25-cellular](/dream/25-cellular)** — Conway's Life as a musical instrument.
  64-column × 16-row Life grid where each column is a pitch (C2 left, C5 right). Living cells
  trigger triangle-wave notes. **Try first**: click **Glider** → **Start** — the 5-cell glider
  walks the pitch axis and you hear a 4-note melodic loop that shifts up and down as it moves.
  Then click **Pulsar** — strict 3-tick rhythmic chord machine. Click/drag the canvas to paint
  or erase cells. No mic, no API, no permissions required.

  This is the first prototype where music is *autonomous*. All 24 previous prototypes react to
  your input or generate on demand. This one acts first. You set initial conditions; Life
  decides what to play. The shape of a pattern IS its melody.

## In progress / partial

- All 25 prototypes are `demoable`. Nothing half-built.

## Queued next (in priority order)

1. **`26-score-follow`** — live score cursor: play the Bach fragment on your piano; the
   score illuminates as you match notes. Autocorrelation pitch detection + symbol tracking.
   "The score lights up as you play it." Zero deps, one-cycle build.

2. **`27-gpu-additive`** — particles ARE Fourier partials; GPU physics IS the synthesizer.
   Most ambitious item (2+ cycles, WebGPU required). Worth discussing approach first.

3. **Research** — due in ~2–3 more build cycles (Cycle 32ish).

## Open questions for Karel

- **`elevenlabs-compose` budget** — streaming structured music with section control,
  $0.40–1.13/generation. The `5-arcs` arc shapes + real AI-generated music for each one.
  Greenlight?

- **`ghost-animate`** — Kling 3.0 (multi-shot, native audio) or HappyHorse-1.0
  (single-shot, higher quality), both on fal.ai. Needs FAL_KEY + budget approval.
  Admin-only, ~$0.05–0.30/clip. Ready to wire in immediately.

- **Cellular MIDI out?** The note events are in memory each tick. A Web MIDI API
  `.send()` call would route them to your DAW. One function, one cycle.

## Preview URL

https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app/dream/25-cellular
