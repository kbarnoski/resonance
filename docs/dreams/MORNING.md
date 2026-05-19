# Morning digest — last updated 2026-05-19 UTC (Cycle 30)

## New since yesterday

- **[/dream/26-score-follow](/dream/26-score-follow)** — Score Follow.
  Bach Invention No.1 as a piano roll. Play along — the score lights green as you match
  each note. The cursor advances ONLY when you play the right pitch (±1.5 semitones).
  **Try first**: click **Demo mode** — watch the 35 notes self-match and the cursor glide
  through the piece. Then click **Start mic** and play C4, D4, E4... following the score.
  The yellow triangle at the cursor shows your detected pitch in real time. Play the wrong
  note for 1.5 s → cursor backs up one step (forgiveness mode).

  This is the first prototype where your playing is *evaluated* rather than visualized.
  The three piano-representation prototypes together: `13-piano-canvas` (abstract painting
  of what you played), `22-code-score` (write it, hear it paint itself), `24-piano-roll`
  (see what you played as notation), `26-score-follow` (reproduce the target score).

- **[/dream/25-cellular](/dream/25-cellular)** — from Cycle 29 (yesterday).
  Conway's Game of Life where living cells trigger pitches. Glider preset = a walking
  4-note melodic loop. Pulsar preset = a rhythmic chord machine. Click/drag to paint cells.
  No mic, no permissions. First autonomous-music prototype in the sandbox.

## In progress / partial

- All 26 prototypes are `demoable`. Nothing half-built.

## Queued next

1. **Research cycle** — Cycles 28, 29, 30 were all builds. Due for a research sweep per
   AGENT.md rule. Cycle 31 will likely be research.

2. **`27-gpu-additive`** — particles ARE Fourier partials; GPU compute physics IS the
   synthesizer. Most ambitious item; may need 2 cycles + WebGPU. Worth discussing.

3. **`26-score-follow` polish** — DTW alignment, look-ahead highlighting (next 3 notes
   in warmer grey), custom score import via `22-code-score` DSL.

## Open questions for Karel

- **`elevenlabs-compose` budget** — streaming structured music with section control,
  ~$0.40–1.13/generation. The `5-arcs` arc shapes + real AI-generated music for each phase.
  Greenlight?

- **`ghost-animate`** — Kling 3.0 (multi-shot, native audio, $0.40/sec) or HappyHorse-1.0
  (single-shot, 1080p). Needs FAL_KEY + budget approval. Admin-only, ready to wire in.

- **Cellular MIDI out?** — Web MIDI `.send()` per tick → route note events to your DAW.
  One small function. Say the word.

## Preview URL

https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app/dream/26-score-follow
