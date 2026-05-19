# 39-anticipate — Aria Anticipation Display

**Route**: `/dream/39-anticipate`  
**Status**: demoable  
**Cycle**: 43 (2026-05-19)

## What it does

Extends `33-aria-companion` with one key addition: when Aria computes a response, all planned
notes appear as ghost outlines in the ARIA panel **before a single sound plays**. Over the
next 8 seconds, each note solidifies from dashed outline → full bright bar as it sounds, left
to right. The user watches Aria's intention become action.

The canvas is split into two halves: past (left of the center line) and future (right).
Ghost notes appear to the right of "now," then slide left through the cursor as they play.

## The insight

ReaLJam (CHI 2025, arxiv 2502.21267) ran human-AI piano duet experiments and found that
**showing the AI's planned notes before execution** dramatically improved perceived collaboration
quality. Participants felt more "in dialogue" with the AI when they could anticipate its moves.
The effect was strong enough that transparent ghost notes were the single highest-rated design
feature across all conditions.

This prototype tests the same insight in a browser with a zero-cost Markov chain.

## How the anticipation works

1. User plays ≥8 notes, then stops for 2 seconds.
2. Markov chain generates response phrase (8–16 notes).
3. All response notes are immediately rendered as dashed blue outlines in the ARIA panel,
   positioned at their future play times (right of the center "now" line).
4. 0.8 seconds later, the first note plays. Its ghost bar flashes bright and solidifies.
5. Subsequent notes solidify one by one at 470ms intervals.
6. The solidification wave sweeps left-to-right through the ARIA panel.

## Time window

Unlike `33-aria-companion` (cursor at right edge, 9s history), this prototype shows:
- **8 seconds of history** (left of center)
- **8 seconds of future** (right of center)
- Center vertical line = "now"

This split makes past (user notes) and future (Aria's plan) spatially distinct.

## Architecture

- Pitch detection: NSDF autocorrelation (same as `13-piano-canvas`, `26-score-follow`)
- Markov chain: 1st-order bigram transition table built from user's own note sequence
- Synthesis: triangle-wave OscillatorNode + short reverb (procedural impulse response)
- Ghost bar rendering: dashed strokeRect + 10% fill. Solidification flash: 280ms glow decay
- All Web Audio, zero npm dependencies

## Polish ideas

- **Chord highlighting**: when Aria's ghost notes form a chord interval (≤50ms apart in startMs),
  draw connecting lines between them like a chord diagram.
- **Revision display**: if re-running demo several times, show Markov table convergence — how
  often each interval appears as the user repeats phrases.
- **Anticipation slider**: user controls how far ahead ghosts appear (0–2s preview window).
  At 0ms they appear simultaneously with the sound; at 2000ms they appear 2s before.
- **Multiple responses visible**: after several exchanges, show previous Aria responses fading
  behind the current one — a "conversation trail."
- **Confidence shading**: shade ghost bars by Markov probability (bright = high-probability
  next note, dim = low-probability pentatonic fallback). Shows where Aria is "sure" vs.
  "improvising."
