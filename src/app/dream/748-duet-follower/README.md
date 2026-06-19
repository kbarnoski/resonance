# Duet Follower

**Dream prototype 748**

> What if Karel's real *Welcome Home* piano recording were an accompanist that **listens to you**? You keep the pulse — tapping the spacebar, the A–L keyboard row, or clicking the stage — and the system estimates your tempo from the gaps between taps and drives the playback rate of his **actual recording** to follow your groove. You conduct his performance's pace. It's a duet where his recording is the accompanist that adapts to you, instead of a fixed track you merely hear.

---

## How to use

1. Press **Start the duet** (this also unlocks the AudioContext on iOS).
2. Tap a steady pulse:
   - **Spacebar**, or
   - the **A–L** / **Q–T** keyboard rows, or
   - click/tap the big **TAP THE PULSE** button (or the stage on touch).
3. Watch the ribbon: his recording scrolls past a fixed center **playhead** (the white line = *now*). Amber dashed lines are upcoming **musical landmarks** the recording is heading toward; the solid amber line is the *next* one.
4. **Speed up your taps** → his performance hurries to reach the next landmark in time. **Slow down** → it breathes and waits with you. The readouts show your tempo (bpm), the current follow rate (×), and your tap count.

You always see something alive within ~2s; if his recording can't be reached, an offline piano phrase is followed instead and an amber notice appears.

---

## The technique

**Onset → tempo estimate → interactive pacing of his real recording.**

- **Onsets.** Each tap is treated as a beat onset. The engine keeps a short window of recent inter-onset intervals (IOIs) and takes their median to estimate your **beat period** (clamped to a musical 30–240 bpm).
- **Landmarks.** His recording is analyzed *once* into a coarse ~50 ms RMS envelope. Rising edges of the smoothed envelope (with a 180 ms refractory gap) become musical **landmarks** — the moments the accompaniment "aims for." If too few are found, evenly spaced fallback landmarks are used so following always has targets.
- **Following.** On each tap, the engine measures the recording-time gap to the next landmark and sets `playbackRate = gap / beatPeriod`, blended smoothly with the current rate (35% old / 65% target) and clamped to 0.4–2.2×. The intent: his performance **arrives at that musical moment one of *your* beats from now**, re-timed to your groove.
- **Continuous playback.** His recording plays as **one continuous, looping `AudioBufferSource`** whose `playbackRate` is what we re-time. It is **never** shattered into a granular grain cloud — this is whole-phrase, continuous following, not a CataRT grain field. We can't read a live position from a `BufferSource`, so we integrate `elapsed × rate` against the audio clock to track the logical playhead for the visuals.

**Output** is pure **SVG / DOM**: a moving piano-roll-style ribbon (the envelope mirrored about a center line), landmark markers, and a pulsing playhead. No WebGL / WebGPU / shaders.

**Master chain:** `source → masterGain (~0.3) → lowpass → DynamicsCompressor → destination`, to stay warm and avoid clipping.

---

## Named references

- **Matchmaker** — open-source real-time piano *score following* (arXiv **2510.10087**, Oct 2025). The modern reference point for following a live performer through a known piece in real time.
- **Christopher Raphael, *Music Plus One*** — statistical automatic accompaniment; a Bayesian model that anticipates and re-times an accompaniment to a soloist.
- **Roger Dannenberg / Barry Vercoe** — foundational automatic-accompaniment / synthetic-performer systems (1980s) that first made a computer follow a human's tempo.
- **Arshia Cont, *Antescofo*** — anticipatory score follower coupling listening with a timed reactive language.

This prototype is a deliberately *inverted, tractable* cousin of those systems: the human supplies the pulse and his recording is the follower, rather than a machine following a human score.

---

## Honest notes (what's unverified / simplified)

- This is **onset-driven tempo following**, **not** full audio-to-score DTW alignment. The "landmarks" are envelope-peak heuristics, not transcribed notes — an honest, demoable proxy for true score position.
- `playbackRate` time-stretching also **shifts pitch** slightly. Rate is clamped to 0.4–2.2× so his piano stays recognizable; a true phase-vocoder time-stretch (pitch-preserving) is out of scope for this cycle.
- Tempo is a **short median of recent taps** — it favors stability over instant reaction, so erratic tapping settles rather than chasing every jitter. Conversely, a single tap before two are registered won't move the rate.
- The visual playhead position is **integrated** from `elapsed × rate`, not read from the audio engine (the Web Audio API doesn't expose live `BufferSource` position), so it can drift slightly from the true sample position over long sessions; it re-anchors whenever the source restarts.
- Landmark detection quality depends on the recording's dynamics; the offline fallback phrase has clean, well-spaced onsets and demonstrates the following behavior most legibly.

---

## Tags

- **INPUT:** keyboard / tap pulse (spacebar, A–L / Q–T rows) + click/touch. No microphone, no camera.
- **OUTPUT:** SVG / DOM piano-roll ribbon + playhead. No WebGL / WebGPU / shaders. No Canvas2D.
- **TECHNIQUE:** real-time onset → tempo estimate → score-following / interactive pacing of his real recording (continuous time-stretch via `playbackRate`).
- **VIBE:** warm, responsive, call-and-response chamber-concert duet. Legible warm register, not a dark luminous-glow meditation.

---

## Files

| File | Purpose |
|------|---------|
| `page.tsx` | UI, tap input (keyboard + click/touch), rAF loop, SVG ribbon + playhead, design-notes overlay, teardown. |
| `audio.ts` | Fetch Karel's recording · offline fallback phrase · `analyzeRecording` (envelope + landmarks) · `buildFollowerEngine` (continuous following accompanist). |
| `README.md` | This file. |
