# 1101 · Time, Dissolving

**The one question:** *What if we could dissolve the listener's sense of **when** — the felt flow and grain of time — the way ketamine / NDE time-dilation makes onset and echo merge and the "floor" of pitch drop away forever?*

**State · pole:** ketamine / NDE temporal dissolution & oceanic boundlessness · **cosmic-ambient**.

This is an **audio-first** piece. The sound is the medium; the visual is deliberately minimal and *deliberately desynced* from it. The whole point is to break the brain's normal audio-visual binding — eyes and ears quietly disagree — so you feel time lose its grip. A **Re-bind** toggle snaps them back into sync so you can A/B the dissociation turning on and off.

---

## How it works

### The carrier sound (from `../_shared/psych/`)
Composed into one slow, stateful ~4-minute arc:

1. **Shepard–Risset endless DESCENT** (`startShepard`, `dir: -1`) — sine partials one octave apart under a fixed Gaussian window; as the comb glides down, partials fade in at the top and out at the bottom, so the pitch falls *forever* and no pitch "floor" ever arrives.
2. **Just-intoned drone bed** (`startDroneBank`) — a pure-ratio chord on a 55 Hz root, lightly detuned, giving the void a warm, boundless foundation.
3. **Granular time-stretch smear** — an internal, deterministic harmonic source (open fifths + a whisper of noise) is resampled into overlapping windowed grains by a look-ahead scheduler. A slow-crawling playhead + heavy grain overlap = time-stretch: successive moments blur into one another.
4. **Swelling convolution "void" reverb** (`createVoidReverb`, 7.5 s tail) — the wet mix rises across the arc until each onset and its own echo become indistinguishable. **Time collapses.**
5. A **soft limiter** (`DynamicsCompressorNode`) + master gain guard against clipping, keeping it meditative.

A single global **`timeScale`** (time-dilation) stretches the Shepard glide rate *and* the granular playhead together — the deeper you sink, the slower time runs.

### The stateful arc (minute 4 ≠ minute 1)
- **0–2:30** — the descent begins, grains lengthen and overlap, the low-pass slowly closes, the void wet climbs. Dissolution deepens toward a plateau.
- **~3:00** — deep plateau: long overlapping grains, dark closed filter, huge wet tail, maximal time-dilation.
- **~3:15 clarity snap** — a brief hyper-lucid moment: the low-pass blooms open, the wet drops, grains shorten and sharpen, `timeScale` snaps back to 1, and the visual re-aligns with the audio. Everything momentarily coherent (the "gamma surge" translation).
- **3:30–4:00** — a soft return to a gentle residual drift (never silent, never a hard stop).

### The desync mechanism (the dissociation)
The true audio envelope is pushed into a ring buffer every frame. The visual bloom is driven by a **heavily lagged, warping** read from that buffer — the lag grows with dissolution depth (up to ~5 s) and slowly oscillates, so what you *see* never quite matches what you *hear*. That mismatch **is** the temporal-binding breakdown.

- **Re-bind OFF (default):** visual lags/warps behind audio → felt loss of temporal grip.
- **Re-bind ON:** visual tracks the audio envelope exactly → eyes and ears agree (a faint green sync dot pulses).
- The **clarity snap always re-aligns them briefly**, bound or not.

### The visual
Dark near-black void; one soft luminous bloom whose radius/brightness follow the (lagged) envelope, a breathing ring outline, and a crisp inner core that only resolves at the clarity snap. Exponential depth-fog / vignette gives vastness. A whisper-faint arc shows arc position. Palette: deep violet-void → soft-white at the snap.

---

## References
- **Pauline Oliveros — *Deep Listening*** (long ~45 s reverb spaces; attention to the tail).
- **La Monte Young** — sustained-drone practice / *Dream House* (boundless just-intoned continuity).
- **Shepard–Risset endless glissando** — the auditory barber-pole, here descending.
- **Borjigin et al., PNAS (2013 / 2023)** — the near-death **gamma surge** hyper-lucidity finding, translated into the clarity-snap.

*Phenomenology only — no medical claims.*

---

## Graceful degradation
- **Passive:** with no input the arc plays itself for ~4 minutes and then drifts gently; it never blanks and never goes silent after the start gesture.
- **Tap-to-deepen:** clicking the void (or "Sink deeper") adds a decaying depth boost; optional, additive.
- Audio starts only inside the user gesture (AudioContext created/resumed on click). Missing `AudioContext` or 2D canvas surfaces a rose error message instead of a blank screen.
- All timers, animation frames, and audio nodes are torn down on unmount (kit `.stop()`, `clearInterval`, `cancelAnimationFrame`, delayed `ctx.close()`).

---

## Next-cycle deepening
- **Spatialize the void** — a slow, decorrelated stereo tail (or Ambisonic) so the reverb wraps around rather than sits in front.
- **Micro-tap grammar** — double-tap for the clarity snap on demand; hold to freeze `timeScale` at 0.
- **Multiple desync channels** — lag brightness, hue, and radius by *different* amounts so the visual itself internally disagrees.
- **Adaptive arc length** — 3/5/8-minute modes; a "no return" endless mode.
- **Biofeedback re-bind** — drive the re-bind threshold from breath or heart-rate coherence rather than a button.
- **Grain-pitch descent** — fold a subtle downward playbackRate ramp into the grains so the smear itself joins the endless fall.
