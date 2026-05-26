# 172 — Loop Station

**Route**: `/dream/172-loop-station`
**Built**: Cycle 201 (2026-05-26)
**Status**: demoable

## What it does

A 4-slot browser loop station built entirely from Web Audio API primitives. Load the demo to hear four phase-locked loops — sub-bass drone, pentatonic melody, high arpeggio, rhythm pattern — all snapped to the same beat grid. Or tap REC on any slot to record a loop from your microphone.

Every loop starts playing at the next beat-1 boundary after you stop recording. All loops share the same clock origin, so a 1-bar loop and a 2-bar loop are always perfectly aligned.

## Controls

- **Load demo** — synthesizes 4 loops offline (OfflineAudioContext) and starts them all phase-locked at once.
- **● REC / ■ STOP** — tap to start recording (asks for mic), tap again to stop. The recording is decoded and trimmed/padded to the nearest bar within the selected bar length.
- **1b / 2b / 4b** — bar length selector per slot. Changes affect the next recording on that slot.
- **MUTE** — silent crossfade to zero (GainNode `setTargetAtTime`). Tap again to unmute.
- **✕** — stop and clear the slot.
- **TAP TEMPO** — tap three or more times; median inter-tap interval → BPM. Takes effect for new loops.

## Technical design

**Phase lock**: All loops share `clockOrigin`, a single AudioContext timestamp representing beat 1. When a new loop is scheduled, `alignedStart()` computes the next bar boundary:

```
phase = (now - clockOrigin) % barDuration
wait  = barDuration - phase
startAt = now + wait   (clamped to at least 20ms future)
```

`AudioBufferSourceNode` with `loop=true`, `loopStart=0`, `loopEnd=buf.duration` handles the looping. The loop boundary is crossfade-free at the buffer level (we apply an 80ms linear fade-in/out to the buffer itself on creation).

**Demo synthesis**: Each of the 4 demo buffers is rendered via `OfflineAudioContext` — fully offline, no API key, no network. The 4 renders run in parallel via `Promise.all`.

**Recording**: `MediaRecorder` captures compressed WebM audio. On stop, `audioCtx.decodeAudioData()` converts back to PCM. The decoded buffer is trimmed/padded to the nearest bar within the selected bar length, fade edges applied, then handed to `startLoop`.

**Waveform display**: Each slot's buffer is downsampled to 200 amplitude-peak points for drawing. The playhead sweeps using `audioCtx.currentTime - playStartAt % buf.duration`.

## Design intent

This is the first prototype where you actively **construct** a composition over time rather than playing into it or watching it. The paradigm is a Boss RC-1 looper or Ableton session clips — but entirely in the browser, zero dependencies, zero server.

The phase-lock is the key interaction. The moment you close a loop, it aligns to the global beat grid. A first-time user discovers this when their second loop snaps into rhythmic alignment with the first — without any explicit explanation.

## What's left (polish ideas)

- **Overdub**: tap REC on a looping slot to layer additional audio on top (mix new recording into existing buffer)
- **Waveform color by frequency content** (run FFT on buffer, find dominant band, color accordingly)
- **Loop length display** (show actual seconds or bars in each slot header)
- **Export**: record all 4 slots mixed to a single AudioBuffer → WAV download
- **Global BPM automation**: when BPM changes while loops are playing, option to adjust `playbackRate` on all source nodes (pitch-shifts but preserves rhythm alignment)
