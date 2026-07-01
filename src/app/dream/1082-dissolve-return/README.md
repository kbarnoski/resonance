# 1082 · Dissolve · Return

**Pole:** cosmic-ambient → hyper-lucid intense · **State:** dissociation → gamma
re-binding · **Input:** tilt/drag + stillness-as-coupling · **Output:** Canvas2D +
Web Audio HRTF · **Technique:** Kuramoto phase-coupling re-sync

> **Cycle-2 deepening of [1063 · Dissolve · Void](../1063-dissolve-void).**

## The one question

> After your senses come **un-bound** — motion, image and sound gliding out of
> phase — can you feel them **re-bind**? Can you *pull* the drifting streams back
> into one coherent, hyper-lucid instant, and hear/see the moment they lock?

1063 built the lab's first **audio-visual desync engine**: one control stream
lagged by different, drifting delays into the visual camera and the audio, so
cause and effect come unglued (the ketamine K-hole). It then hid its re-sync in a
single scripted one-frame "clarity snap." **1082 makes the re-binding the star** —
modelled, participatory, and perceptible.

## The phenomenology

You float in the same sparse luminous void. Early on the three streams — your
**control**, the **image**, the **sound** — drift freely out of phase. You *see*
the drift as a faint **zero-lag ghost** doubling beneath the lagged image (a
beating / moiré), and you *hear* it as a partial that **beats** against the drone.
A small **phase-ring** in the corner shows three coloured dots orbiting at
different rates — the three oscillators, out of sync.

Then you re-bind them, and it is something you **do**: hold still. Stillness
raises the coupling. The three dots converge on the ring, the ghost collapses into
the lagged image so the doubling **fuses into one crisp picture**, and the audible
beat slows to **zero-beat** — a bright bloom as everything **locks** into one
hyper-lucid instant. Move frantically and it stays scattered; settle and it comes
home. Then it can softly drift apart again, breathing.

## How the Kuramoto re-sync engine works

The three streams are modelled as three **coupled phase oscillators** — the
**Kuramoto model** (Yoshiki Kuramoto, 1975) of synchronization. Each has its own
drifting natural frequency offset ω_i (the "lag"). A single global coupling
strength **K** governs how strongly the three phases pull toward their common mean
phase (mean-field form):

```
dθ_i/dt = ω_i + K · r · sin(ψ − θ_i)
```

Coherence is read by the Kuramoto **order parameter** r ∈ [0,1]:

```
r · e^{iψ} = (1/N) · Σ_j e^{iθ_j}
```

- **r → 0** — the phases drift freely, visibly and audibly out of sync (1063's
  un-binding, now explicit and continuous rather than lag-scripted).
- **r → 1** — all three phases lock; the void **fuses** into one sharp, bright,
  re-bound instant (the gamma "binding" event).

**You participate in re-binding.** Coupling **K rises when the control velocity is
low** — held still or moved slowly and smoothly ("settling the mind"). Frantic
motion keeps K below the critical coupling K_c (set by the ω-spread), so the
phases can't lock. Stillness pushes K well past K_c and r climbs to ~1. K itself
eases (coupling has inertia), so settling *takes a moment* and feels earned. A
**"Let it settle"** button injects a decaying coupling boost for desktop users who
want to nudge it. A slow **baseline K floor** also lifts across the last third of
the arc, so the piece always resolves into a soft lock **hands-off** — but active
stillness reaches the bright full lock far sooner.

**Making the drift perceptible (the key deepening):**

- **Visual** (`return.ts`): two mote layers are drawn each frame — a faint,
  hue-shifted **true-position ghost** (zero-lag camera) beneath the **phase-lagged
  layer**. The lagged camera carries a phase-driven displacement whose radius ∝
  (1 − r) and whose angle *is* the visual/control phase difference — so out of
  phase the two layers **beat / moiré-double**, and as r → 1 the ghost fades and
  collapses in, fusing to one crisp image. A corner **phase-ring** (three orbiting
  dots + a coherence arc of length ∝ r) reads the live state with no settings
  panel.
- **Audio** (`audio.ts`): a **beat partial** (a reference tone + a detuned twin)
  produces an acoustic beat whose frequency `f_beat = |f1 − f2|` is driven by the
  **audio/control phase mismatch**. Out of phase → a fast, restless beat (~6 Hz);
  as the phases lock the detuning collapses to **zero-beat** — the two tones fuse
  into one pure, still pitch. At lock a brief bright bloom opens the drone's
  low-pass filter (the gamma flash), then relaxes as the streams breathe apart.

Everything keeps 1063's aesthetic: a luminous sparse void with a generative drone
bed (detuned sines → slowly-opening low-pass → synthetic convolution reverb) and
five **HRTF-spatialised sound motes** orbiting the listener in 3D.

## How this deepens 1063

| | 1063 · Void | 1082 · Return |
|---|---|---|
| Core model | three fixed/drifting **lags** (desync) | three **coupled Kuramoto oscillators** (re-sync) |
| Re-binding | a hidden, scripted one-frame "clarity snap" | a **modelled, continuous, felt phase-lock** |
| Agency | you only steer; the snap just happens | **stillness is the instrument** — you cause the lock |
| Drift visibility | implied (image trails hand) | **explicit**: ghost/lag doubling + phase-ring |
| Drift audibility | implied (sound trails hand) | **explicit**: a beat you hear slow to zero-beat |

## Named references

- **Kuramoto, Y. (1975/1984)** — *Chemical Oscillations, Waves, and Turbulence*;
  the Kuramoto model of coupled phase oscillators, the order parameter r, and the
  onset of synchronization above a critical coupling K_c. The engine here.
- **Binding-by-synchrony** — Singer & Gray; Fries, "A mechanism for cognitive
  dynamics: neuronal communication through neuronal coherence" — **gamma-band
  neural phase synchrony** proposed as the solution to the *binding problem*, and
  2026 work linking global gamma phase-synchrony to the emergence of a coherent
  conscious percept. The lock event models this "binding" instant.
- **Borjigin et al., PNAS 2013 / 2023** — the end-of-life / altered-state **gamma
  surge** of hyper-lucid clarity. Modelled as the bright bloom at full coherence
  (the re-binding moment).
- **Bera, Looger, Proekt & Cichon, "Cortical Mechanisms Contributing to
  Ketamine-Induced Dissociation," _The Neuroscientist_, 2026** — dissociation as
  sensory-motor **uncoupling** (NMDA-blockade → thalamocortical disconnection).
  The un-bound state (K ≈ 0) it starts from, inherited from 1063.

## How to use

1. Tap **Enter the void** — unlocks audio and, on iOS, requests DeviceOrientation
   permission (inside the tap).
2. **Phone:** tilt to steer, then hold the phone **still** to let the streams
   re-bind. **Desktop / no-gyro:** drag to steer, then release and be still — or
   press **Let it settle**.
3. Watch the ghost/lag doubling fuse and the corner phase-dots converge; hear the
   beat slow to zero-beat. When it locks, a **✦ bound** badge appears.

### Degrades gracefully (runs headless)

- **No interaction at all** → the slow baseline coupling floor lifts across the
  arc, so a hands-off ~6:30 glance both **sees** the doubling drift for minutes
  and **sees + hears** it resolve into a soft lock at the end. (Perfect stillness
  is *not* read as active settling until you first engage, so the un-bound state
  is experienced first rather than snapping to lock immediately.)
- **No DeviceOrientation / denied** → pointer-drag fallback with a readable hint.
- **No audio / blocked AudioContext** → visuals still run; a one-line rose note.

## Next-cycle deepening

- **Breath as coupling**: drive K from a mic breath-envelope (`_shared/use-mic-
  analyser`) so slow exhalation *is* the settling that binds the streams.
- **Two-body Kuramoto**: a second participant's stillness as a fourth oscillator —
  co-regulation, binding *together*.
- **N-partial spectral lock**: a whole harmonic series of beat partials that
  zero-beat one by one, so the fusion sweeps up the spectrum like a chord resolving.
- **Metastable chimera states**: tune the coupling so two streams lock while the
  third orbits free — partial binding, the shimmer of almost-coherence.
- **Hysteresis**: make lock "sticky" (Kuramoto's first-order transition) so once
  bound it resists small motion — you can move a little and stay lucid.
- **Phase-portrait mode**: an optional overlay drawing θ on the unit circle for
  the curious, exposing the model directly.
