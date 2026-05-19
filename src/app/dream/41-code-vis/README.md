# code-vis — live coding DSL: write notes, hear them, see them

**Route**: `/dream/41-code-vis`  
**Cycle**: 46  
**Status**: demoable

## What it is

A split-screen live coding environment. The left pane is a text editor with a minimal
music DSL. The right pane is a canvas showing a glowing constellation of rings — one per
voice. Edit the score; 400ms later the audio and visuals update automatically.

The DSL is deliberately minimal — one line per note:

```
C4  tri  0.8      // C4 triangle wave at amplitude 0.8
E4  sin  0.6      // E4 sine wave at 0.6
G4  tri  0.5      // G4 triangle at 0.5
Bb3 saw  0.4      // Bb3 sawtooth at 0.4
// lines beginning with // are ignored
```

Fields: `NOTE WAVE AMP`

- **NOTE**: pitch name + octave (C4, D#3, Bb5, A3, F#2 …)
- **WAVE**: `sin` (sine) · `tri` (triangle) · `saw` (sawtooth) · `sq` (square)
- **AMP**: 0.0–1.0. Controls ring size AND oscillator amplitude.

## The visual

Each voice is a glowing ring on the canvas:

- **Color** = frequency → hue. Same mapping as `1-live`: low bass = violet (hue 260),
  mid = green/yellow (hue 120–60), high treble = red (hue 0). The color IS the pitch.
- **Size** = amplitude. Louder voices get larger rings.
- **Pulse** = BPM slider. All rings pulse together at the beat rate — a sin² envelope
  (sharp peak, smooth decay). At 80 BPM, one pulse per 750ms.
- **Layout** = circular constellation. N voices form an N-gon (triangle, square, hexagon…).
  Single voice sits at center.

The trail (22% alpha clear per frame) creates gentle bloom as rings expand on each beat.

## Why this prototype exists

All 40 previous prototypes either react to mic input or generate audio via API. None of
them let you *specify* what to play as code. This is the reverse direction: you author
the sound in text and the canvas renders it in real time.

A pianist can write a chord in three lines and hear it immediately. The DSL is intentionally
simpler than `22-code-score` (which schedules a melody over time) — code-vis holds all notes
simultaneously as a sustained chord/texture, with no sequencing.

The design question: **can writing music feel like writing code?** The answer here is a
minimal one — yes, if you strip the notation to its essentials: pitch, timbre, volume.
Everything else (rhythm, duration, articulation) is left to the imagination.

## Interactions

- **Write code** → 400ms debounce → voices reparse → audio crossfades (150ms fade out, 150ms
  fade in). The old voices fade while new ones bloom.
- **▶ Start / ■ Stop** → toggles AudioContext. Must press Start for audio to play.
- **BPM slider** (40–200) → changes pulse rate live. 80 = moderate heartbeat. 200 = frenetic.
- **↓ PNG** → saves the current canvas frame. The constellation at peak pulse makes a nice poster.
- **Parse status** bar (bottom of editor) shows how many voices were successfully parsed.
  If you write a note the parser can't understand, it shows "no valid notes."

## Web Audio architecture

One `AudioContext` per session (created on first Start). Each voice:
1. `OscillatorNode` → type from WAVE field, frequency from NOTE
2. `GainNode` → amplitude from AMP field, with 150ms linear fade-in on create
3. Chain: osc → gain → masterGain → destination

Master gain normalises for N voices: `0.55 / sqrt(N)`. Three simultaneous voices at amp 0.8
are roughly as loud as one voice at amp 0.8.

On code change: old oscillators fade out (150ms) and stop, new ones fade in (150ms)
simultaneously. No click artifacts.

## Polish ideas

- **Chord templates**: quick-insert buttons for common chords (C major, Am, Dm7, G7)
- **Arpeggio mode**: each voice plays sequentially at the BPM rate instead of simultaneously.
  The constellation then animates clockwise (one ring per beat).
- **Color feedback**: highlight parse-failed lines in red inside the textarea. Needs a custom
  overlay element layered behind the transparent textarea.
- **Mic input augmentation**: detect the current mic pitch (autocorrelation, same as
  `13-piano-canvas`) and show it as a dashed ring on the canvas — "what you're playing vs
  what the code is playing."
- **Loop animation**: instead of all voices pulsing together, give each voice a phase offset
  equal to its index / N. The constellation breathes in a rotating wave rather than a single
  heartbeat.
- **Voice labels**: show `WAVE AMP` below the note name (small sub-label). Currently only note
  name is visible.
- **Pitch-to-canvas mapping**: instead of circular layout, place voices at their frequency
  position along the X axis (same log-scale as `17-acoustic-trail`). Chords become
  horizontal arrangements; single notes sit at their natural pitch position.

## Connection to Resonance

The DSL is the simplest possible "composer interface" — type a note, hear it, see it. This
is the starting point of a much larger question: what if Resonance's journey mode could be
authored as code? A score describes the harmonic texture of each journey phase: which
frequencies to foreground, which timbres to use, how loud each layer should be. The session's
visuals then emerge from the score rather than from mic input.

Related prototypes: `22-code-score` (sequenced melody from DSL), `13-piano-canvas`
(played notes → painting), `5-arcs` (journey phase sequencing).
