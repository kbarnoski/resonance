# 225 — Aria Companion

**For**: pianists / Karel  
**Status**: demoable  
**Built**: Cycle 259 (2026-05-31)

## What it is

Play a phrase on your piano. Pause for 2 seconds. Aria responds with a generated phrase built from a Markov chain trained on YOUR intervals — then listens again.

The longer you play, the more Aria mirrors your style. First exchanges are generic (pentatonic fallback). By the 4th–5th exchange, the Markov table has absorbed your interval tendencies — Aria starts sounding like it studied you.

## What makes this different

All 224 prior prototypes are **reactive** (responding every frame) or **generative** (playing autonomously). This is the first **dialogue** prototype: it listens, waits for a complete thought, then responds with its own. The same distinction that separates call-and-response jazz improvisation from a solo performance.

Inspired by the "Design Space for Live Music Agents" taxonomy (arxiv 2602.05064, Feb 2026), which identifies dialogue agents as the least-explored category in the field — and the Aria-Duet system (NeurIPS 2025) which showed this paradigm on a Disklavier. This is the zero-dep browser version.

## How it works

### Pitch detection
NSDF-based (McLeod Pitch Method variant): for each candidate period τ, computes  
`NSDF(τ) = 2·Σ x[n]·x[n+τ] / Σ (x[n]² + x[n+τ]²)`  
which is bounded [-1, 1] and robust to amplitude variation. Detection at 20 Hz (50ms interval), 2048-sample AnalyserNode buffer. Threshold: NSDF > 0.5. Detected frequencies are snapped to the nearest pentatonic MIDI note to avoid pitch-tracking noise triggering off-key responses.

### Markov chain
1st-order bigram table: counts how often each MIDI note is followed by each other. Built fresh from the current phrase and merged into a cumulative global table. Response generation: weighted random sampling from the bigram table (70% Markov, 30% pentatonic random walk to prevent getting stuck in loops). Response length: `min(phrase_length + 3, 18)` notes.

### Piano timbre
4 additive partials: triangle oscillators at 1×, 2×, 3×, 4.05× the fundamental. Gains: 1.0, 0.42, 0.18, 0.07. The 4.05× partial is slightly detuned from the 4th harmonic — creates a subtle inharmonicity resembling real piano string behavior. 12ms linear attack, exponential decay.

### Piano roll display
Split canvas: YOU (orange) on top, ARIA (blue) on bottom. Scrolling 7-second window. Y axis: MIDI 36 (C2) at bottom → MIDI 84 (C6) at top. Note bars scroll left at constant speed. Octave grid lines at C notes. Live pitch dot on right edge of YOU panel while actively playing.

## Interaction model

1. **idle** → buttons visible  
2. **listening** → mic active; pitch detected every 50ms; notes buffered  
3. After 2s silence AND ≥8 notes → **responding** → Aria's phrase scheduled and plays  
4. After Aria finishes → back to **listening** (phrase buffer cleared)  
5. Markov table accumulates across all exchanges in the session

Demo mode pre-populates a 10-note pentatonic phrase (C D F G F D C D F A), triggers a Markov response, then shows the "Try with mic" prompt.

## Polish ideas

- Add a "Markov heatmap" overlay: show the bigram table as a 12×12 pitch-class grid, cells brighter when that transition is common in the current session. Karel would see his own harmonic tendencies emerge visually.
- **Phrase memory**: keep the last 3 phrases, not just the current one, so Aria can quote back longer-range motifs.
- **Call length control**: slider for minimum phrase length (8 notes default; lower = faster exchanges; higher = longer dialogue).
- **Response register shift**: after 5+ exchanges, Aria's pentatonic fallback could shift up/down an octave from Karel's register to create more contrast.
- **Tempo tracking**: measure inter-note intervals in the phrase; set Aria's step time to match the phrase's average tempo rather than fixed 500ms.
- **Export**: download the accumulated exchange as a MIDI file (user notes + Aria notes, two separate tracks).
