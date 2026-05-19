# 35-loop-station — design notes

## What question this answers

"What if Resonance had a live loop station — and every layer you recorded was automatically
phase-locked to the others?"

The 34 prototypes before this one all *react* to audio. This is the first where you
**construct** a composition over time: record a bass line, then a melody, then an arpeggio,
then a rhythmic click — each loop locks to the same grid, so they sync automatically.

## How it works

**Recording** (`● REC → ■ STOP`): pressing REC connects the mic to a ScriptProcessorNode
that captures raw PCM samples (2048-sample buffers) into a Float32Array accumulator.
Pressing STOP concatenates the chunks into a single Float32Array, then creates an AudioBuffer
trimmed to the nearest BPM-synced bar boundary. A 50ms linear crossfade applied to the
first/last 2205 samples removes click artifacts at the loop point.

**Phase locking**: every slot tracks a shared `originTime` (AudioContext.currentTime
of the first loop). When a new loop is ready, it schedules its `AudioBufferSourceNode.start()`
at the next multiple of `barDuration * bars` beyond the origin — so Slot 2 always starts
on Slot 1's beat 1, regardless of when you pressed STOP.

**Playhead**: each slot's waveform shows a white cursor line. Position is:
`(AudioContext.currentTime - slot.startTime) % loopDuration / loopDuration`.
This runs in a requestAnimationFrame loop.

**Demo mode**: four loops synthesized via `OfflineAudioContext` at load time:
- Slot 1: 55 Hz sub-bass drone (two detuned sines, Hann crossfade)
- Slot 2: C4-E4-G4-C5 piano phrase (triangle waves, exponential decay)
- Slot 3: C5-E5-G5-B5-C6-G5-E5-C5 arpeggio (sine waves, staccato envelopes)
- Slot 4: quarter-note click track (white noise bursts, downbeat accented)

All four start simultaneously at the next bar boundary after loading, fully phase-locked.

**Overdub** (partial): pressing REC on a playing slot reduces its gain to 50% and begins
recording a new layer. On STOP, the new recording replaces the slot (mixing was not
implemented in Cycle 38 — see below).

## Polish ideas for future cycles

- **True overdub mix**: sum the existing AudioBuffer with the new recording sample-by-sample
  when STOP is pressed. Requires aligning the new recording to the grid origin (trim head
  to the next beat boundary, wrap tail).
- **Waveform scroll while recording**: draw incoming RMS energy from ScriptProcessor
  in real time, so the waveform builds as you play.
- **Per-slot volume fader**: replace the binary mute with a gain slider.
- **Undo last overdub**: keep the previous buffer reference and swap back on demand.
- **MIDI trigger**: press hardware pad → triggers REC/STOP on assigned slot, BPM tap.
- **Auto-quantize**: when BPM tap is active, trim recorded loop to exact bar boundary
  rather than actual elapsed time (removes "too short by 50ms" artifacts on human timing).
- **Export**: render all active loops to a single WAV file via `OfflineAudioContext`.

## Why this felt right

The first time you load the demo and all four layers lock together, it immediately
communicates the idea: even though each loop was synthesized independently, the
shared grid makes them cohere. The violet sub-bass sitting below the orange arpeggio
is the same color relationship as the frequency bands in `1-live` — lowest frequencies
are cool/violet, highest are warm/orange. The color system is consistent across the
whole sandbox now.

The loop station is the prototype most directly useful to a live performer. A pianist
at a venue could record a drone, then a phrase, then add a rhythmic layer — without
taking their hands off the instrument between layers (BPM tap works with a foot pedal;
a MIDI trigger would work hands-free). This is the architecture for "Resonance as a
live instrument."
