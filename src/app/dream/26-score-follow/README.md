# Score Follow — design notes

**Route**: `/dream/26-score-follow`  
**Cycle**: 30 · **Status**: demoable

## What it is

Bach Invention No.1 (BWV 772, opening 35 notes) displayed as a static piano roll.
The user plays along on piano or sings into the mic. Autocorrelation pitch detection
runs at ~30 Hz. Each detected note is matched against the next expected score note
(±1.5 semitone tolerance). On match: the note lights green, the score scrolls to
reveal the next note at the cursor. On miss: the cursor pauses. After ~1.5 s of
wrong-note playing: the cursor backs up one note (forgiveness mode).

## Score-following algorithm

Deliberately simple: symbol-level matching (not ML, not DTW, not HMM). Each match
requires a silence gap after the previous note (RMS drops below threshold). This
means legato playing produces one match per note, not per frame.

```
detect pitch (autocorrelation, fftSize=4096, threshold=0.82)
↓
if detectedMidi - score[cursorIdx].midi < 1.5 semitones:
    mark matched, advance cursorIdx, require silence before next match
elif wrong note for > 90 frames (~1.5 s):
    back up cursorIdx by 1 (forgiveness)
```

Compare to the literature (RESEARCH.md §31, arxiv 2505.05078): proper score following
uses HMM or neural sequence alignment, handles polyphony, and achieves <200ms latency.
This is the minimal viable version: monophonic melody, ±1.5 semitone window, no tempo
tracking. For a Resonance "learn this journey theme" feature, you'd want DTW + onset
detection as the next step.

## Visual layout

- Piano key sidebar (44px, same as `24-piano-roll`)
- Score notes: grey outline = upcoming, pulsing white = target, green glow = matched
- Cursor: fixed vertical bar at 28% from the left edge of the grid area
- Score scrolls left as matches accumulate (smooth animation, ease-in 12%/frame)
- Yellow triangle at cursor: your detected pitch (appears at the correct MIDI row height)
- The target note shows its pitch name (e.g. "C5") for readability

## What's different from `24-piano-roll`

`24-piano-roll` shows *what you played* — it records incoming notes and draws them.  
`26-score-follow` shows *what you should play* — it pre-renders the target score and
evaluates your performance against it. The distinction is the same as the difference
between a recording and a sight-reading exercise.

## Demo mode

Plays each note via triangle-wave OscillatorNode → analyser (not speakers). The
known frequency is used directly (no autocorrelation on synthesized signal) so each
note matches cleanly on the first frame. BPM slider controls demo playback tempo.

## Polish ideas

- DTW-based alignment instead of symbol matching (handles timing variation better)
- Highlight the next 3 notes ahead in a slightly warmer grey (look-ahead window)
- Auto-scroll the score before starting so the user can see the full piece
- Multiple scores (different Bach inventions, or a custom DSL import from `22-code-score`)
- Accuracy score: % of notes matched on first attempt vs. with forgiveness
- "Practice mode": loop a specific bar when you miss it too many times
