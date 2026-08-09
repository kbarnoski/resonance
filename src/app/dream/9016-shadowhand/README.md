# 9016 · Shadow Hand

## The one question

**What if an AI accompanist LISTENED to Karel's real piano recording and played
a complementary second voice in real time — a shadow hand on the keyboard?**

This is a **score-following / reactive-accompaniment** piece, not a physics
simulation. The whole point is an agent that *hears* a human performance and
answers it musically, in the moment.

## What it does

1. **Real audio source.** On "Play Karel's piano" it fetches
   `/api/audio/549fc519-f7fc-4c38-a771-adaad2edbc81`, decodes it to an
   `AudioBuffer`, and plays it. That prod route returns JSON `{ url }` (a signed
   storage URL) by default and raw `audio/*` bytes on its transcode path, so the
   loader inspects `content-type`: JSON → resolve `.url` → fetch → `arrayBuffer`
   → `decodeAudioData`; audio bytes → decode directly. **Any failure (offline,
   CORS, 4xx/5xx, decode error) falls back** to a seeded procedural piano phrase
   (triangle-osc + envelope, pentatonic, looped) so the piece always runs. A
   `live piano` / `fallback` badge reports which is playing.

2. **Score-following on the playing audio.** The Karel bus is tapped through an
   `AnalyserNode`. Every frame the follower computes, from the FFT magnitude:
   - **Onset** — spectral flux (sum of positive bin increases) with an adaptive
     threshold and a rising-edge + refractory gate.
   - **Chroma** — a 12-bin pitch-class histogram over the ~50–2200 Hz band →
     dominant pitch class, plus a slow accumulator for a rough key/tonic.
   - **Tempo / beat phase** — inter-onset-interval median → bpm, driving a
     phase-locked beat clock that gets nudged to the downbeat on each onset.

3. **Generative second voice (the accompanist).** From `{chroma, onset, key,
   beat, energy}` a soft 2-operator FM bell harmonizes a third/fifth/sixth
   **below** Karel's detected pitch, quantized to the estimated major key,
   gliding between notes with `setTargetAtTime`. It enters on predicted beats and
   **rests when he is dense** (energy gate) so it answers rather than doubles.
   Master = `0.18` gain → `DynamicsCompressor` limiter → destination. The
   accompanist is never fed back into the analyser — it does not follow itself.

4. **WebGPU-compute visualization.** A 4000-particle field lives in a storage
   buffer stepped by a compute shader each frame. First half = Karel's hand
   (left attractor, one spin, bursts on his onsets); second half = the shadow
   hand (right attractor, opposite spin, bursts on the accompanist's onsets). The
   detected chroma bends both flow fields. A render pass draws each particle as a
   soft additive amber sprite (instanced quads). **Graceful degradation:**
   `navigator.gpu` is feature-detected; if absent (or device/adapter request
   fails) it degrades to a ~64-circle inline **SVG** field driven by the same
   state (a `text-destructive` note explains the switch). No Canvas2D, no WebGL2.

5. **Muted read.** Before any audio, a **seeded** synthetic onset/chroma stream
   (`mulberry32(0x9016)`) drives the field, so both hands are already breathing
   within ~1s on a muted phone. All randomness in the piece — demo stream,
   particle seeding, fallback phrase — comes from `mulberry32`; never
   `Math.random`, never `Date.now()`.

## Named references (score-following lineage)

- **Barry Vercoe**, *The Synthetic Performer in the Context of Live Performance*
  (ICMC 1984) — foundational machine score-following.
- **Roger B. Dannenberg**, *An On-Line Algorithm for Real-Time Accompaniment*
  (ICMC 1984) — the accompaniment/following algorithm this piece descends from.
- **"A Design Space for Live Music Agents"**, arXiv:2602.05064 (2026) — frames
  listen→infer→respond agents; the shadow hand is a small point in that space
  (feature-based following + generative complementary voice, no learning).

## Honest limitations

- The score-follower is **feature-based, not alignment-based** — it tracks pitch
  class, attacks, and implied tempo, but does not align to a stored symbolic
  score, so it cannot anticipate more than a beat ahead or recover a specific bar
  after a jump.
- Chroma from a raw FFT magnitude is octave-ambiguous and smears under pedal /
  dense chords; the "key" estimate is a slow argmax, not a real key-finder.
- Tempo tracking is a median IOI — it locks to steady playing but lags large
  rubato swings.
- The accompanist quantizes to a **major** scale only; on minor/modal passages
  it will sound consonant-but-generic rather than idiomatic.
- WebGPU sprites are additive with a per-frame clear (no trails) to stay
  photosensitive-safe; the SVG fallback is far coarser (64 vs 4000 particles).

## Teardown

`cancelAnimationFrame`, `ResizeObserver.disconnect`, GPU device `destroy()` (and
buffers), all audio nodes disconnected + oscillators stopped + `AudioContext.close()`,
SVG elements removed. Honors `prefers-reduced-motion` (flow amplitude ×0.4) and
avoids strobe (smooth onset envelopes, ~66 ms onset refractory).
