# /dream/1-live — Mic-input audio-reactive viz

**Status**: demoable · **Cycle shipped**: 0

## What this is

A live microphone visualizer. Click *Start mic*, allow permission, then
play, sing, hum, or just talk. Six frequency bands are extracted from
the FFT and rendered as concentric radial color fields:

| Band | Range | Color |
|---|---|---|
| sub-bass | 20–60 Hz | deep violet |
| bass | 60–250 Hz | cyan |
| low-mid | 250–500 Hz | green |
| mid | 500–2 kHz | yellow |
| high-mid | 2–4 kHz | orange |
| high | 4–20 kHz | magenta |

The outermost ring is sub-bass, the innermost is high. Each ring is
sized by its band's smoothed energy, blended additively so co-occurring
bands sum toward white at peaks.

Percussive onsets trigger a brief white flash at center. Inter-onset
intervals feed a rolling median → BPM estimate, displayed top-right.

## Why this prototype

It answers "what would Resonance feel like as a live performance
instrument" — the simplest possible mic-driven viz that already shows
real responsiveness to musical content. It also seeds the
`_shared/use-mic-analyser.ts` hook that every subsequent live-input
prototype (fluid, attractor, operator, etc.) reuses.

## What's good

- Latency feels ~one frame at 60fps — direct enough to perform with
- Onset detector + BPM lock from spectral flux works on a metronome
  and on real piano playing without tuning
- Gain slider lets you play in a loud room or aux-line a quiet recording

## What's rough

- The radial-ring composition is one aesthetic among many — a future
  cycle should add a "viz mode" picker (rings, bars, particle field,
  spectrogram waterfall, etc.)
- No persistence — bookmark/share-link can't restore a configuration
- BPM is shown but doesn't drive anything visually yet — a beat-locked
  shader pulse would be the natural next step
- Centroid is shown numerically but not visualized — could become the
  vertical position of energy in a different mode
- No file-input mode — only live mic. Add `<input type="file">` for
  testing with recordings.

## Iteration suggestions

- **Viz modes**: top-left dropdown switches between rings (current),
  bars, spiral, kaleidoscope mirror, particle flow
- **Color schemes**: alt mapping — synesthetic (research-grounded
  letter↔color), or fully user-customizable
- **Recording mode**: capture a session as MediaRecorder, export
  the canvas + audio together (live performance documentation)
- **MIDI input**: when a MIDI device is connected, use note-on as
  onset source instead of (or in addition to) spectral flux
- **Touch-to-color**: tap the screen to "paint" a region — local
  collaboration with phones around a venue
