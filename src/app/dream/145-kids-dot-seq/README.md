# 145-kids-dot-seq — Dot Sequencer

**For**: kids (4+)
**Route**: `/dream/145-kids-dot-seq`
**Status**: demoable
**Cycle**: 172 (kids build)

## What it is

Six glowing colored dots in a row. A bright white cursor sweeps continuously left to right. Tap any dot to light it up — when the cursor passes a lit dot, that note plays. Tap again to turn it off. The result is a one-bar loop that plays forever at the current BPM.

C-major pentatonic notes across 6 steps:
- Violet: C3 (lowest, leftmost)
- Blue: E3
- Cyan: G3
- Emerald: A3
- Amber: C4
- Rose: E4 (highest, rightmost)

All combinations are consonant — there are no wrong patterns.

## Design decisions

**Full-column tap zones** — any tap in a column (the full canvas height, 1/6 of the width) toggles that dot. This makes the effective tap target ~200px × ~62px on a 375px phone, more than enough for 4yo motor accuracy despite the narrow horizontal extent.

**Note-on-tap feedback** — tapping a dot plays the note immediately, so the child hears the sound before the cursor reaches it. This teaches the pitch→color mapping without waiting.

**Sweep cursor, not grid jump** — the cursor sweeps smoothly left-to-right (not teleporting cell to cell), which shows kids *where* the music is coming from at every moment. The visual flow matches the sonic flow.

**80 BPM default** — slow enough that a child can hear each note distinctly. +/- 16 BPM per tap gives a usable range (40–160 BPM).

## Why this now

The first 144 prototypes are either reactive (respond every frame to audio input) or event-driven (tap → immediate note). This is the first where the child **constructs** a musical pattern that then plays autonomously. Different cognitive mode: deliberate composition rather than continuous performance. A child can tap one dot and hear a single note looping; tap three and discover harmony. The pattern is persistent — the loop plays while the child considers what to add next.

Inspired by Karel's love of `98-kids-drum-circle` ❤️ (rhythm as the primary musical concept) and `111-kids-shape-loop` ❤️ (additive composition through simple gestures).

## Zero deps

Pure Web Audio API (OscillatorNode, GainNode) + Canvas2D. No mic, no camera, no network. Zero permissions.
