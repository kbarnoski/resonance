# 1726 · drum-trance

**What if drumming a steady ~4 Hz beat could drive you into a drug-free trance —
where the STEADINESS of your rhythm is measured and rewarded by intensifying
psychedelic geometry?**

A shamanic **theta auditory-driving** piece. You play a steady ~4 beats/sec
pulse on touch/pointer drum pads. The steadier and closer-to-4-Hz your drumming,
the more a full-screen Klüver form-constant field brightens, sharpens, and
escalates (tunnel → spiral → honeycomb), dissolving its boundary in a white-out
at deep lock. Erratic drumming, or stopping, lets it fade back to a dim scatter.

## How to use

1. Open the page — a **ghost drummer** is already auto-playing a steady 4.2 Hz,
   so the field animates on its own (silently, since browsers require a gesture
   to start audio).
2. Press **Enable sound**, then **tap a pad** — control hands over to you and the
   ghost fades out.
3. Hold a steady ~4 taps/sec. Watch the readout (bottom-left): **tempo** in Hz,
   **lock** %, and the current **form** constant. As lock climbs it goes
   `tunnel → spiral → honeycomb`, and past ~85% a peripheral white-out blooms.
4. Inputs: multi-touch / mouse on the four pads (big centre **Skin** + three
   rim/edge tones), or keyboard **Space / F / J / K**.
5. Stop drumming for ~3.5 s and the ghost drummer resumes.

## The five subsystems

1. **Touch/pointer drum pads** — four large (≥76 px, centre 112 px) pads driven
   by `pointerdown` (multi-touch capable) plus Space/F/J/K. Each hit is real
   agency: you play the rhythm.
2. **Modal membrane-drum synthesis** (`audio.ts`) — each hit is a short
   bandpassed noise transient exciting **three detuned, inharmonic** modal
   resonators (decaying sines at membrane Bessel-like ratios 1 : 1.59 : 2.14…,
   each detuned a few fixed cents). Percussion, not a drone: short, punchy,
   slightly dissonant. Different pads = different fundamentals and timbres.
   Master chain: voices → bus → `DynamicsCompressor` → master gain `0.12` →
   destination, with a light `createVoidReverb` send. **No `droneBank`.**
3. **Theta-steadiness tracker** (`registerOnset` in `page.tsx`) — measures
   inter-onset intervals, scores closeness to the 4 Hz (0.25 s) theta target via
   a tolerant log-ratio Gaussian, and scores steadiness from the coefficient of
   variation over the last ~6 intervals. Their product is a per-hit reward that
   eases a smoothed **entrainment scalar** `E ∈ [0,1]` upward on steady hits and
   decays it every frame when drumming is erratic or stops.
4. **Klüver form-constant field** (`field.ts`, Canvas2D) — a small offscreen
   `ImageData` is filled per-pixel in cortical (log-polar) space using the shared
   `formConstant` / `honeycomb` from `_shared/psych/logpolar.ts`, then upscaled
   with smoothing. Brightness, contrast, saturation, form-density and the
   tunnel→spiral→honeycomb crossfade all scale with `E`. Each beat gently pulses
   luminance.
5. **Entrainment-reward loop** — the on-screen mono readout (tempo / lock% /
   form) plus the field state ITSELF is the reward: steadier drumming visibly and
   audibly deepens the trance geometry.

## Determinism & headless self-demo

- The **only clock** in the state/audio/animation path is an integer frame
  counter (tempo maths assume 60 fps). `ctx.currentTime` is used **solely** to
  schedule audio. There is **no** `Math.random`, `Date.now`, `new Date`, or
  `performance.now` in any of those paths (the excitation noise uses a
  fixed-seed mulberry32).
- The deterministic ghost drummer (fixed 4.2 Hz, fixed pad pattern) means the
  piece animates identically on every headless run with nobody touching it.

## Safety

- **Photosensitive:** no hard strobe. The 4 Hz cadence is audio only; the screen
  merely breathes — beat pulses are a small luminance swing over a high floor,
  and motion/contrast/pulse are all further softened when
  `prefersReducedMotion()` is set.
- **No microphone / camera** — pure touch/pointer/keyboard.

## References

- Aparicio-Terrés, B. et al. "Neural tracking at theta predicts drumming-induced
  altered states of consciousness." *Scientific Reports* **16**:10204
  (2026-03-26).
- Klüver's four form constants; Bressloff–Cowan cortical log-polar map (see
  `_shared/psych/logpolar.ts`).

## Honest limitations

- **Frame-counter clock:** using the frame counter as the tempo clock is exact
  for the ghost and for determinism, but a real user's steadiness is only
  measured accurately if `requestAnimationFrame` runs a steady 60 fps. On 120 Hz
  or a throttled tab the reported Hz drifts; the *reward feel* (steady = bright)
  still reads correctly.
- The field is a 150-px-wide CPU buffer upscaled with smoothing — deliberately
  soft, not razor-sharp; per-pixel Canvas2D caps the achievable resolution.
- Modal voices are additive-sine approximations of membrane modes, not a full
  FD membrane simulation, so timbre is stylised rather than physically exact.
- Entrainment tuning (decay rate, reward sigmas) is hand-picked for a pleasant
  demo arc, not calibrated to any physiological measurement.
