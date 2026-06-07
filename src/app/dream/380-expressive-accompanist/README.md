# 380 — Expressive Accompanist

**Cycle 2 of the Resonance "Accompanist" thread.**

Cycle 1 (`375-tempo-canon`) shipped an online-DTW tempo-follower that plays the left-hand accompaniment locked to the soloist's rubato, with a glowing warping-path visual. This prototype deepens that foundation by adding **expressive coupling** across three dimensions simultaneously — the central claim of The ACCompanion (Cancino-Chacón/Peter/Widmer, IJCAI 2023).

---

## What it answers

> "What if the machine accompanist followed not just your TEMPO but your DYNAMICS and ARTICULATION — so it feels like a real duet partner, not a metronome?"

---

## How to use it

**Demo:** Press **"Play demo ▸"** (or wait ~2 seconds for auto-play) to hear the baked expressive performance of the Pachelbel Canon melody. The machine plays bass and chord accompaniment in real time.

**Keyboard:** Home-row keys `a s d f g h j k` play the Pachelbel Canon melody in D major (D4 through D5). Hold keys for legato, tap quickly for staccato — the accompaniment follows your articulation.

**MIDI:** Press **"Connect MIDI"** to request Web MIDI access. If a device is present, real note-velocity drives dynamics coupling.

**Reset:** Clears the alignment and all state.

---

## The piece

**Melody:** Pachelbel's Canon in D, first phrase (~16 notes) in D major, played as the right-hand "soloist" part.

**Accompaniment:** Pachelbel's canonical ground-bass harmonic sequence — `I V vi III IV I IV V` — looped in two halves. Bass note + chord triad, synthesized with detuned oscillators through a DynamicsCompressor limiter.

---

## The three subsystems

### `score.ts` — Reference score + baked performance
- `REFERENCE[]` — 16-note melody (MIDI pitches + nominal beat durations).
- `HARMONY[]` — One harmony per melody note: bass pitch + chord MIDI notes + Roman numeral label.
- `KEY_MAP[]` — Eight home-row keys → D-major scale pitches.
- `makePerformance()` — A reproducible baked performance with deliberate, legible expression:
  - **Tempo:** steady intro → accelerando → big ritardando into the final note.
  - **Dynamics:** crescendo (pp→ff over the first half), diminuendo (ff→mp over the second half).
  - **Articulation:** legato first half (ratio ~0.85), staccato second half (ratio ~0.25), legato return for the final bar.
  - Deterministic pseudo-random jitter makes it sound human without being random.
  - Returns `PerfEvent[]` with `(midi, velocity, durationMs, dtMs)` — the follower never sees score positions, only these tuples.

### `dtw.ts` — Online streaming DTW with expression tracking
Implements forward-only online DTW in the spirit of Simon Dixon's MATCH (2005):
- **Recurrence:** `D(i,j) = cost(i,j) + min(D(i-1,j), D(i,j-1), D(i-1,j-1))`.
- **Window:** bounded search ahead of the last committed column, radius ≈ 5.
- **Forward-only:** `committedCol` never moves backward.
- **Slope:** warping path slope over a short span of recent cells → local tempo proxy.
- **Expressive tracking (new in cycle 2):**
  - `smoothedVelocity` — EMA-smoothed note velocity (α = 0.35), drives accompaniment gain.
  - `smoothedArticulation` — EMA-smoothed IOI ratio = `durationMs / IOI_ms` (α = 0.30 for slower phrase-level changes). Near 1.0 = legato; near 0 = staccato.

### `audio.ts` — Web Audio synthesis with expressive accompaniment
- `ExpressiveAudio.accompany(h, smoothedVelocity, smoothedArticulation, durScale)`:
  - **Dynamics coupling:** `smoothedVelocity / 127` → bass peak amplitude (0.15..0.60) and chord peak (0.08..0.36). Accompaniment stays softer than the soloist.
  - **Articulation coupling:** `smoothedArticulation` scales the envelope decay duration. Legato → long sustain; staccato → short, detached chords.
  - **Tempo coupling:** `durScale = 1 / slope` elongates decays when the soloist drags and shortens them when rushing.
  - Sawtooth bass + triangle chord voices, 2 detuned oscillators each.
  - Summed through a `DynamicsCompressor` brick-wall limiter (threshold –6 dB, ratio 20:1) — dynamic range never clips.
- `melodyEcho(midi, velocity)` — soft echo of the played note, velocity-scaled.

### `gl.ts` — WebGL2 expression ribbon renderer
Raw `#version 300 es` GLSL, no libraries. The **expression ribbon** extends the cycle-1 warping path with:
- **Halo layer:** large, dim violet point sprites whose size encodes **live dynamics** (fat = loud, thin = soft). A custom `u_dash` uniform applies a screen-space dashing pattern when articulation drops below 0.45 (**staccato indicator**).
- **Core layer:** smaller cyan-white point sprites, always solid — the alignment signal.
- **Window band:** translucent violet quad showing the DTW search window.
- **45° guide:** faint dotted diagonal — "you'd be here in strict tempo."
- **Fire rings:** expanding point sprites at each chord event; max size encodes **accompaniment loudness** (ring of fire = chord was loud).
- **Cursor:** pulsing warm dot at the current committed cell.

DPR-aware resize, single VBO/VAO, `DYNAMIC_DRAW` uploads each frame.

---

## The expressive-parameter coupling mechanic

This is the lab-first feature that distinguishes cycle 2 from cycle 1:

```
Soloist plays note (pitch, velocity, durationMs)
      │
      ▼
OnlineDTW.step() → smoothedVelocity (EMA), smoothedArticulation (EMA), slope
      │                        │                        │
      ▼                        ▼                        ▼
 tempo coupling           dynamics coupling       articulation coupling
 (durScale from          (accompaniment gain    (accompaniment decay
  1/slope)                scales with vel)       scales with art.ratio)
      │                        │                        │
      └────────────────────────┼────────────────────────┘
                               ▼
                     ExpressiveAudio.accompany()
                     ExpressionRenderer (ribbon thickness + dashing)
```

---

## Self-verifying baked performance design

The auto-demo is engineered so that a reviewer on any device (no MIDI, no external input) can verify all three coupling axes in a single 15-second playthrough:

| Phase | Notes | What changes | What to observe |
|-------|-------|--------------|-----------------|
| Intro | 0–2 | Steady tempo, pp→mp | Ribbon thin, solid, path near 45° |
| Accelerando | 3–9 | Rushing | Path steeper, BPM rises |
| Crescendo peak | 5–8 | Loudest notes | Ribbon fat, rings large |
| Ritardando | 9–15 | Dragging | Path flatter, BPM drops |
| Staccato phrase | 8–13 | Short notes | Ribbon dashes, chords detach |
| Diminuendo | 9–15 | Soft notes | Ribbon thins, rings small |
| Resolution | 15 | Long final note | Path plateaus (held column) |

---

## Graceful degradation

| Capability | Absent | Behaviour |
|---|---|---|
| WebGL2 | No GPU / context fail | `text-rose-300` notice in canvas area; audio still runs |
| Web MIDI | Browser doesn't support | Status line; keyboard + demo still work |
| Autoplay | Browser blocks AudioContext | Silent catch; user presses "Play demo" to start |

---

## References

- **The ACCompanion** — Cancino-Chacón, C., Peter, S., & Widmer, G. (2023). *The ACCompanion: Accompaniment of Expressive Piano Performances.* IJCAI 2023. arXiv:2304.12939. — Source of the central thesis: tempo alone is mechanical; dynamics + articulation coupling makes an accompanist human.

- **Peransformer** — arXiv:2510.10175, October 2025. Transformer-based expressive performance modelling; informs the design of the articulation IOI-ratio coupling.

- **Simon Dixon, MATCH** (2005) — *On-line Time Warping for Live Musical Score Following.* IJCAI 2005. — Lineage for the online DTW implementation: bounded search window, forward-only commitment, 3-predecessor recurrence.

---

## Technical notes

- **No new npm dependencies.** All synthesis is Web Audio API; all rendering is raw WebGL2.
- **`"use client"`** on `page.tsx` (browser APIs throughout).
- **No API routes.** Pure client-side.
- Cleanup: RAF loop cancelled, AudioContext closed, MIDI listeners nulled on unmount.
- TypeScript strict; ESLint clean (warnings only in pre-existing repo files).
