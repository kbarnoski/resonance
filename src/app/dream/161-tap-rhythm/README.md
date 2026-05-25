# 161 — Tap Rhythm

**Question**: what if you could walk up and clap a groove, and Resonance turned it into a loop?

## What it does

Three-drum circular step sequencer built from physical tapping:

1. **Select** a drum type (kick / snare / hi-hat)
2. **Tap** the TAP button (or press spacebar) in time with your intended rhythm
3. After 2 s of silence the system auto-captures: detects BPM from inter-onset intervals (median IOI → BPM), quantizes each tap to the nearest 16th-note slot in a 32-step (2-bar) grid, overlays on the existing pattern
4. Repeat with a different drum type to layer kick + snare + hat
5. Click any dot on the clock face to cycle it through kick → snare → hat → empty

## Technical details

- **Drum synthesis**: Web Audio API only, zero external deps
  - Kick: 80→36 Hz sine with exponential frequency and gain decay (classic 808 style)
  - Snare: white noise through 2200 Hz bandpass BiquadFilter, ~110 ms
  - Hi-hat: white noise through 8500 Hz highpass, ~35 ms sharp decay
- **Scheduler**: `setInterval` every 20 ms reads ahead 90 ms (`LOOKAHEAD`), schedules drums via `AudioContext.currentTime`. Same double-buffer clock pattern used in Tone.js — never calls `setTimeout` for per-hit timing.
- **BPM detection**: collects inter-onset intervals (filtered 120–1800 ms), takes the median, converts to BPM. Median is more robust than mean to outliers (hesitations, double-taps).
- **Quantization**: `elapsed % cycleMs → Math.round(elapsed / stepMs) % STEPS`. A 2-bar grid so users can tap simple or complex patterns.
- **Canvas**: pure Canvas2D RAF loop, reads refs directly — zero React re-renders during drawing. DPR-aware sizing. Clock hand sweeps at playback position; active step glows its drum color.

## Interaction model

- **No mic required** — tap the button or keyboard
- **Additive layering** — tap kicks, then snares, then hats; each pass overlays the previous without erasing other drum types
- **Live edit** — click any ring dot to cycle it; changes take effect immediately (scheduler reads `stepsRef.current` live)
- **BPM slider** — adjusts speed while looping; tempo shifts at the next scheduled step (no click or gap)

## What makes this different

158 prior prototypes take audio as *input* (mic signal, pitch, spectrum). This is the first where **rhythm timing** is the primary input — not "what pitch are you playing" but "when are you tapping." A non-pianist can produce a coherent 2-bar groove in 30 seconds.

Live performance angle: tap a groove at the start of a set, let it loop, then layer with `121-loop-station` or play against `33-aria-companion`. First Resonance drum machine that emerges from physical gesture rather than step-programming.

## Inspired by

- DARC (arxiv 2601.02357, Jan 2026) — tap/beatbox → drum accompaniment (server-side)
- "Live performance fitness" priority in AGENT.md
- Karel's love of `98-kids-drum-circle` ❤️ (rhythm as primary interaction)
