# Aria Companion — design notes

**Route**: `/dream/210-aria-companion`  
**Cycle**: 243 (adult build)  
**Question**: what if the piano responded when you rested?

## What it does

Play piano (or any pitched sound) into the mic. After a 1.5s pause, Aria
generates an 8-note response using a 1st-order Markov chain built from your
own note transitions. The response plays back as a piano-timbred tone through
a short reverb. Both your phrase and Aria's response appear as horizontal
bars on a scrolling piano roll — warm orange (YOU) on top, cool blue (ARIA)
below.

The Markov table accumulates across the session. After several rounds, Aria
starts mirroring your melodic tendencies: which intervals you favor, which
notes you resolve to. The longer the session, the more the dialogue feels
like a personal conversation.

## Audio architecture

```
mic → AnalyserNode → pitch detection (autocorrelation, 20 Hz)

Aria's response:
  OscillatorNode × 3 (fundamental + 2nd + 3rd partial)
  → GainNode (piano envelope: 12ms attack, exponential decay 0.8s)
  → dryGain (0.62) → AudioContext.destination
  → reverbGain (0.38) → ConvolverNode (0.9s synthetic impulse) → destination
```

Piano timbre: three sine oscillators at 1×, 2×, 3× fundamental with gain
ratios 1 : 0.28 : 0.09. Sounds like a damped piano string — present but not
harsh.

## Markov chain mechanics

Each time a stable pitch transitions to a different stable pitch (both held
for ≥100ms), `transitions[prevMidi][curMidi]++`. Pitch stability is confirmed
by two consecutive pitch-detection frames (50ms poll × 2 = 100ms minimum
note duration before it registers).

Response generation: pick a random start note from the captured sequence.
Walk the transition table for 8 steps, sampling each row weighted by
accumulated counts. Rows with no data fall back to a random pentatonic
interval (0, 2, 4, 7, 9, or 12 semitones from current note).

After Aria responds, the captured sequence resets — but the Markov table
persists. Later rounds accumulate richer transitions for better-learned responses.

## Visual

Two-lane scrolling piano roll. Notes scroll from right (just played) to left
(past). Vertical range: C2–C7 (60 semitones). Octave grid lines at each C.
Live (held) notes glow brighter than completed ones.

Scroll speed: 80 px/sec. A 1-second note = 80px wide. STEP_MS=375ms Aria
notes appear as ~30px blocks — visible but compact.

## Polish ideas

- **Interruption feedback**: flash the canvas when user taps mid-response
- **Markov depth**: 2nd-order chains (prev×prev→next) for better style capture
- **Velocity**: amplitude from analyser → note thickness in piano roll
- **Harmony mode**: Aria adds a bass pedal tone below each response note
- **Export**: download the full piano roll as a PNG or MIDI file
- **Interval annotation**: label the intervals Aria used (P5, M3, etc.)

## Research basis

Inspired by Aria-Duet (NeurIPS 2025, arxiv 2511.01663) — turn-taking piano AI
on a Disklavier with autoregressive transformer response. This is the
zero-dependency browser version: Markov chain instead of transformer,
AudioWorklet-free, runs in any browser tab. The "Design Space for Live Music
Agents" taxonomy (arxiv 2602.05064) identifies dialogue agents as the
least-explored category; Aria Companion is the first in the dream sandbox.
