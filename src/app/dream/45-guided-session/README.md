# 45-guided-session — Guided Brainwave Session

**Route**: `/dream/45-guided-session`  
**Status**: `demoable`  
**Cycle shipped**: 53  
**Dependencies**: none (pure Web Audio API + Canvas2D)

---

## What it does

The user picks a journey (e.g. "Stressed → Calm"), a step duration (30s demo / 5min / 10min), and presses **Begin journey**. The session plays isochronic tones — amplitude-modulated carrier at 200 Hz, with the modulation rate at the target brainwave frequency — and walks through a sequence of waypoints from the starting state to the goal state.

Works with any speaker (no headphones required, unlike `42-binaural`'s binaural mode).

---

## Clinical basis

Research backing: RESEARCH.md §§74 ("music as controlled hallucination"), 75 (MindMelody closed-loop music therapy), 80 (AI music therapy cluster, Frontiers 2026). All three papers validate:

1. **Goal-directed traversal** is more effective than open-ended listening for brainwave entrainment
2. **Isochronic tones** (amplitude modulation) produce measurable brainwave frequency following response without headphones
3. **Proactive session guidance** — providing context-appropriate prompts and smooth state transitions — improves subjective effectiveness ratings

The four journeys are all *descending* in frequency (high Hz → low Hz), matching the relaxation/sleep direction that the research cluster validates most strongly.

---

## Audio architecture

```
OscillatorNode(sine, 200Hz)
  → GainNode(base=0.5)  ← LFO(sine, beatHz) → LfoGain(0.5)    ← amplitude oscillates [0, 1]
  → MasterGain(0.55)
  → destination
```

The `LFO.frequency` is swept between waypoints via:
```javascript
lfoR.frequency.setTargetAtTime(nextWp.hz, actx.currentTime, 4); // 4s time constant
```

The 4-second time constant produces a perceptible but gradual transition — audible as a slowing or quickening of the pulse character. At 24Hz → 10Hz (β⁺ to α), the change takes ~12-15 seconds to fully complete, giving the brain time to follow.

Noise layer (from `42-binaural` pattern): pink noise (lowpass 1200Hz) for β/α states, brown noise (lowpass 300Hz) for θ/δ states. Automatically switches when the step advances.

---

## Canvas

Same ring animation as `42-binaural`:
- One ring born every `1/hz` seconds (beat period)
- Each ring expands from 0 to 42% of the shorter canvas dimension
- Alpha fades from 0.6 to 0 as the ring expands (age/ringLife)
- Ring life = `max(0.2, 3/hz)` seconds — slow states have long-lived rings, fast states tight rapid rings
- Center radial glow peaks at ring birth, decays with `exp(-age*5)`
- Hue tracks the current waypoint: β⁺=amber, β=yellow-green, α=cyan, θ=indigo, δ=violet

The key perceptual difference from `42-binaural`: because the journey descends through states, the ring period visibly slows over the session. At β⁺ 24Hz: rapid staccato rings. By α 10Hz: gentle ripples. By θ 4Hz: three-second expanding pulses. The canvas is a clock of the journey's progress.

---

## Journey waypoints

```
WPS[0]  γ   35Hz  scattered · hyperactive  hue=20  (amber-orange)
WPS[1]  β⁺  24Hz  stressed · anxious       hue=45  (warm amber)
WPS[2]  β   18Hz  alert · restless         hue=75  (yellow-green)
WPS[3]  β⁻  14Hz  focused · clear          hue=100 (green)
WPS[4]  α   10Hz  relaxed · aware          hue=180 (cyan)
WPS[5]  θ⁺   7Hz  drowsy · softening       hue=210 (cyan-indigo)
WPS[6]  θ    4Hz  meditative · deep        hue=240 (indigo)
WPS[7]  δ    2Hz  deep rest · healing      hue=270 (violet)
```

---

## Polish ideas

1. **Smooth hue transition between steps** — interpolate canvas hue over the 4-second LFO sweep, so the color change visually tracks the audio transition
2. **Session history** — store each session's journey + timestamp in localStorage, show a "recent sessions" panel on the setup page
3. **Custom journey builder** — let the user pick individual waypoints to create a custom path
4. **Ascending journeys** — "Tired → Focused" arc: θ(6) → α(10) → β⁻(14) — useful as a morning activation session; requires going up in Hz which is less studied but valid
5. **Guided transitions** — on each step advance, show a brief full-screen fade + transition message ("Entering α state — relaxed awareness...") before the canvas resumes
6. **Integration with `42-binaural`** — share the noise chain and journal, allow binaural mode for headphone sessions
7. **Timer countdown** — show "auto-advancing in 45s" in the progress area when within 60s of end, so the user isn't surprised
