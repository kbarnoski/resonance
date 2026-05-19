# 42-binaural — Binaural Beat Synthesizer

**Route**: `/dream/42-binaural`  
**Cycle**: 47 · **Status**: demoable

---

## What is a binaural beat?

When each ear receives a sine wave at a slightly different frequency — say, 200 Hz left and
210 Hz right — the brain perceives a rhythmic oscillation at the *difference frequency* (10 Hz)
that has no physical existence in the air. This is the binaural beat.

The effect was first documented by Heinrich Wilhelm Dove in 1839 and popularized by Gerald
Oster's 1973 Scientific American article "Auditory Beats in the Brain." The mechanism is
neurological: the superior olivary complex, which integrates input from both ears to localize
sound, produces a synchronized oscillation at the difference frequency. This is called the
*frequency following response* — cortical EEG waves entrain toward the beat frequency.

**Why headphones are required**: binaural beats only work if each ear receives a separate pure
tone. Speakers mix the two frequencies in air, producing a *monaural beat* (audible amplitude
modulation) rather than a binaural beat. The binaural effect is inside the skull.

---

## Brainwave frequency bands

| Band | Range | Character | Prototype hue |
|------|-------|-----------|---------------|
| δ delta | 0.5–4 Hz | deep sleep, healing, memory consolidation | deep violet |
| θ theta | 4–8 Hz | drowsy, hypnagogic, meditative, creative insight | indigo-blue |
| α alpha | 8–13 Hz | relaxed awareness, eyes-closed rest, flow state | cyan |
| β beta | 13–30 Hz | active thinking, focused attention, alertness | green |
| γ gamma | 30–100 Hz | high cognitive processing, perceptual binding, insight | amber |

The "Schumann resonance" of the Earth's electromagnetic field is ~7.83 Hz (theta range). Pure
coincidence? Disputed. But the resonance has a nice ring to it for Resonance specifically.

---

## Two modes

### Binaural (headphones required)
```
leftOsc(carrier Hz)       → StereoPannerNode(-1) ─┐
                                                    ├─ masterGain → destination
rightOsc(carrier+beat Hz) → StereoPannerNode(+1) ─┘
```
Both oscillators are pure sine waves. The brain computes the difference and generates the
beat internally. The carrier frequency (80–400 Hz) should be below ~1500 Hz for the binaural
effect to work — HRTF localization kicks in above that range and breaks the illusion.

### Isochronic (speakers or headphones)
```
OscillatorNode(carrier) → isoAmpGain ─────────────────── masterGain → destination
                                  ↑
LFO(beat Hz) → lfoGain(0.5) ──── isoAmpGain.gain (base 0.5)
```
The amplitude of the carrier tone oscillates sinusoidally at the beat frequency. Gain range:
`0.5 + 0.5 × sin(2π × beat × t) = [0, 1]`. This creates an audible tremolo at the beat rate.
No headphones needed — the amplitude modulation is physically present in the mono signal.

Isochronic tones are generally considered slightly less potent than binaural beats for
entrainment, but they work with any audio output and feel more like a drum rhythm than a
subtle neurological trick.

---

## Canvas visualization

The canvas shows a synchronized ring-expansion animation keyed to the AudioContext clock:

**Ring scheduler** (`nextBeatRef`): a new `Ring { birthT }` is pushed to `ringsRef.current`
every `1/beat` seconds. The beat timing is derived from `audioCtx.currentTime` — not
`Date.now()` — so the visual stays phase-locked to the audio.

**Ring expansion**: each ring expands from radius 0 to `maxR = 0.43 × min(W, H)` over its
lifetime `max(0.2, 3/beat)` seconds. Alpha fades linearly from 65% → 0% as the ring grows.
Line width tapers from 3.5px (birth) to 1.5px (death).

**Center glow**: peaks immediately after a ring birth (pulse = `exp(-phase × 5)`) and decays
exponentially until the next beat. At γ 40 Hz the rings are born 25ms apart — faster than
one 60fps frame — so the visual becomes a near-constant shimmering glow rather than discrete
pulses. This is visually appropriate: gamma oscillation is continuous, not discrete.

**Hue by brainwave state**: δ=270° (violet), θ=220° (indigo), α=180° (cyan), β=100° (green),
γ=30° (amber). As the user drags the beat slider across the bands, both the canvas and the
title bar accent color transition through this spectrum.

**Idle state**: when not playing, the canvas shows a slow breathing glow (`sin(Date.now()/2200)`)
in the current state's hue so Karel can see which state is loaded before pressing Start.

---

## Controls

| Control | Range | Notes |
|---------|-------|-------|
| Mode | binaural / isochronic | Locked while playing — stop to switch |
| Beat | 0.5–40 Hz | Updates oscillators live via `setTargetAtTime` (80ms τ) |
| Carrier | 80–400 Hz | Carrier frequency of both tones |
| Volume | 0–1 | Live update via `setTargetAtTime` |
| Presets | δ/θ/α/β/γ | One-click jumps to canonical frequencies |

---

## Polish ideas for future cycles

- **Session timer**: display how many minutes you've been in the current state. At 15+ minutes
  in theta or delta, show a gentle "consider taking a break" note.
- **Pink/brown noise layer**: a secondary noise generator underneath the tones helps mask
  environmental distractions without changing the binaural beat. A "masking" toggle + volume.
- **Transition mode**: a slow linear glide from one brainwave state to another over N minutes
  (e.g., "guide me from β focus to α relaxation over 20 minutes").
- **EEG validation note**: there are no guarantees. Binaural beats are a real psychoacoustic
  phenomenon but the entrainment effects on mood/focus are contested in the literature. The
  prototype should include a brief "this is experimental" note in the UI.
- **Ghost integration**: the existing Ghost narrative phases map to brainwave states. Early
  journey phases = delta/theta; peak phases = gamma. Binaural tone could auto-select based on
  the active journey phase — a "soundtrack layer" that primes the neural state before the music.

---

## Research basis

- Oster, G. (1973). Auditory beats in the brain. *Scientific American*, 229(4), 94–102.
- Lane, J.D., et al. (1998). Binaural auditory beats affect vigilance, performance, and mood.
  *Physiology & Behavior*, 63(2), 249–252.
- RESEARCH.md: no prior entry — this prototype synthesized from first principles and the
  psychoacoustics thread opened by `40-shepard-tone` (Cycle 45).
