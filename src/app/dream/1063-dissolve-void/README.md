# 1063 · Dissolve · Void

**Pole:** cosmic-ambient (void) · **State:** ketamine K-hole / dissociation / out-of-body

## The one question

> What does it feel like when your senses come **un-bound** — when the link
> between what you do, what you see, and what you hear gently dissolves?

You float in a vast, sparse, luminous void. On a phone you steer by **tilting**;
on desktop you **drag**. But the void does not obey you cleanly. The image trails
your hand by a slowly-shifting delay, and the sound trails it by a *different*
delay — so cause and effect come unglued. Over a ~4.5-minute arc the binding
loosens toward a dissociative peak, then snaps clear once — a bright,
re-synchronised flash — before a soft return.

## The phenomenology

This piece is drug-free, but it is shaped after the ketamine **K-hole** /
dissociation: depersonalization, floating out of body, time dilation, and the
sense of melting into a luminous vastness. The CORE mechanic — an **audio-visual
desync engine** — is not decoration. It enacts the documented *mechanism* of
dissociation: the normally-tight binding between sensory input, motor action, and
conscious awareness is deliberately lagged and decoupled.

## Research grounding

- **Bera, Looger, Proekt & Cichon, "Cortical Mechanisms Contributing to
  Ketamine-Induced Dissociation," _The Neuroscientist_ / Neuroscience Reviews,
  2026 (SAGE).** A defining feature of the dissociated brain state is the
  **uncoupling of sensory input from conscious awareness** and altered
  sensory-motor coupling, driven by NMDA-receptor blockade →
  thalamocortical disconnection. The desync engine here literally enacts this
  finding: the control stream, the visual motion, and the audio envelope are
  given three different, drifting lags so they glide out of phase.
- **Ketamine NMDA-antagonism / thalamocortical disconnection** (PSYCHEDELIC.md
  Cluster 2) — the broader mechanism behind the dissociative, out-of-body,
  vast-void quality of the experience.
- **Borjigin et al., PNAS 2013 / 2023** — the end-of-life / altered-state
  **gamma surge** of "hyper-lucid clarity." Modelled here as a brief
  **clarity snap** near the end of the arc: the lag collapses to near-zero,
  everything re-binds, sharpens and brightens, then softly returns.

## How the desync engine works (the lab's first)

There is **one** clock (time-dilated by `TIME_SCALE = 0.6` for the weightless,
dilated-time feel) and **one** raw control stream (`field.control`, set from
tilt or drag, −1..1).

1. **Visual lag** (`void.ts`): the visual "camera" eases toward the raw control
   by a smoothing factor that *shrinks* (gets laggier) as dissociation depth
   grows, breathing on its own slow cycle. The image therefore trails your hand.
2. **Audio lag** (`audio.ts`): the audio applies its **own**, longer lag —
   breathing on a *different* phase — before the control nudges the `AudioListener`
   orientation, the drone's low-pass cutoff, and the orbits of the HRTF motes.
3. Because the two lags differ and both drift across the arc, **what you do,
   what you see, and what you hear drift out of phase** — the sensory-motor
   uncoupling above.
4. The **clarity snap** (gamma surge, ~90% through the arc) drives both lags to
   near-zero: the void re-binds, sharpens, the vignette opens and the centre
   blooms — then the arc eases back down for a soft return.

The desync is exposed *through the experience*, not as a settings panel.

### Visuals (`void.ts`, Canvas2D only)

- Sparse luminous **motes** at varied depths with exponential **depth fog** and
  **parallax** driven by the *desynced* camera.
- Faint **receding rings / filaments** that drift toward you and recycle.
- Additive blending (`globalCompositeOperation = "lighter"`) over a soft
  **afterimage** (low-alpha veil, never a hard clear) → weightless trails.
- A **vignette** that slowly constricts toward a bright centre (hypoxic
  tunnel-vision feel) and opens in the clarity snap.
- No fast full-screen strobe — only slow luminance drift (safety).

### Audio (`audio.ts`, Web Audio only)

- A generative **drone bed**: detuned sustained sines (a low open chord with slow
  beating) → a long low-pass that slowly **opens** → a synthetic **convolution
  reverb** (multi-second decaying-noise impulse) for vastness.
- **5 HRTF sound motes**: each an oscillator + tremolo through its own
  `PannerNode` with `panningModel: "HRTF"`, drifting on slow Lissajous orbits in
  3D **around the listener** — vastness via spatialisation. (The lab's first
  HRTF-spatialised psychedelic void.)
- Master **compressor/limiter** guards the swell. `AudioContext` is created only
  on the first user gesture (the Start button).

## How to use

1. Tap **Enter the void**. This unlocks audio and, on iOS, requests
   DeviceOrientation permission (required to be inside a tap).
2. **Phone:** tilt to float. **Desktop / no-gyro:** drag anywhere to float.
3. Notice that the image and the sound *trail* your hand — and by different
   amounts. Stay with it; let the binding loosen.
4. Open **design notes** (corner toggle) for the short version of this README.

### Degrades gracefully

- No DeviceOrientation (or permission denied) → silently falls back to
  pointer-drag, with a readable hint.
- No audio device / blocked AudioContext → visuals still run; a one-line note in
  readable rose text.
- Idle (no input) → the void drifts autonomously and the motes keep moving and
  sounding, so a glance is always alive and sounding.

## Next-cycle deepening

- **Per-sense lag readout**: a faint, optional debug overlay tracing the three
  streams (control / image / audio) so the desync is legible to the curious.
- **Breath coupling**: use the mic envelope (via `_shared/use-mic-analyser`) so
  slow breathing widens the void and the clarity snap can be "exhaled" into.
- **Multiple snaps**: a sparse sequence of micro clarity-snaps approaching the
  big one, like the brain flickering back toward coherence.
- **Richer motes**: granular grain-clouds per mote instead of single oscillators
  for a more textural spatial field.
- **Doppler on the motes**: enable PannerNode velocity so fast-passing motes
  pitch-shift as they sweep by.
- **Re-binding ritual**: an explicit gesture that momentarily re-syncs all three
  streams, so the user can feel the cost of coherence.
