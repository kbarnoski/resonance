# 1041 · NDE Tunnel

**The one question:** What if a screen could evoke the phenomenology of the
near-death / ketamine experience — leaving the body, drifting through a vast
dark void, down a tunnel toward a being of light — *drug-free*?

A full-screen WebGL2 raymarched fragment shader flies you endlessly down a
curving wormhole toward a growing being of light, while a pure Web Audio
cosmic-ambient drone bank breathes through a synthetic convolution-reverb
void. Visuals and audio share one slow, time-dilated clock — but the audio is
deliberately lagged behind the visuals (see below). It auto-plays hands-free
after a single Start tap and loops forever (~2 minutes).

## The technique

- **Raymarched infinite wormhole SDF.** The fragment shader marches ~72 steps
  down a cylindrical tunnel whose spine follows endless `sin/cos` curves, so
  the camera flies forever down a curving tube. Domain motion along `z` plus a
  breathing radius and ribbed walls give parallax and vastness.
- **Exponential depth fog** fades distant walls into darkness; sparse luminous
  wisps / stars drift past for spatial scale.
- **Center-out radial light bloom** — the "being of light" grows at the
  vanishing point, additive and warm (gold → white), intensifying toward the
  peak. This is the emotional core.
- **Hypoxic vignette** — an animated peripheral darkening that constricts the
  field toward the bright center: the literal "tunnel vision" of retinal
  ischemia. It tightens at the peak.
- **Gamma clarity-snap** — near peak light, a brief (~2–3 s) hyper-lucid lift:
  gamma drops, contrast and coherence surge, then ease back. A smooth ramp,
  never a flash.
- A subtle iridescent oil-on-water sheen on the walls and slow chromatic
  aberration keep it weightless and receding — the cosmic-ambient pole.

## The journey arc (one shared timeline, loops forever)

1. **Onset** — near-black, body-still, a faint distant point of light, slow drone.
2. **Leaving the body** — the void opens, slow forward drift begins, wisps pass.
3. **The tunnel** — the wormhole forms, gentle acceleration toward the light, vignette constricts.
4. **The light** — the center bloom fills toward white, the gamma clarity-snap, the musical peak.
5. **Return** — the light recedes, you drift back into the calm void, soft landing, loop. Never abrupt.

Everything (camera speed, light, vignette, clarity, the audio filter and
swell) is a smooth function of one loop phase in `timeline.ts`.

## The audio

Pure Web Audio API:

- A **generative drone bank** — four detuned low oscillators (a low open chord
  with slow beating partners) staggered in entry, through a low-pass filter
  that **opens toward the light** and closes on the return.
- A **convolution-reverb void** — a `ConvolverNode` fed a *synthetically
  generated* impulse response (exponentially-decaying, low-pass-filtered noise,
  ~4.5 s tail). No external asset; cathedral/underwater vastness.
- **Dissociation desync.** The audio envelope eases toward the visual `light`
  value *slowly*, so the audio swell arrives a beat after the visual surge —
  the two streams the brain normally binds are gently decoupled.
- A single **time dilation** `TIME_SCALE` stretches the whole clock (visual
  motion + DSP modulation rates) slow.

Master gain is modest (≈0.15), ramps in over ~6 s, and tears down fully on
Pause and unmount.

## Named references

- **Raymond Moody**, *Life After Life* (1975) — the canonical NDE schema of
  the dark tunnel, forward movement, and the being/realm of light that this
  piece stages.
- **Borjigin et al.**, PNAS (2013) and follow-up work (2023) — the documented
  end-of-life **gamma surge**, a transient burst of synchronized high-frequency
  brain activity near death, which inspired the "gamma clarity-snap."
- **Hypoxic tunnel-vision mechanism** — peripheral retinal ischemia under
  oxygen/blood-pressure loss constricts the visual field toward the center,
  the leading physiological account of the "tunnel," rendered here as the
  animated vignette.
- **Ketamine as an NMDA-receptor antagonist** — its thalamocortical
  disconnection and dissociative phenomenology motivate the deliberate
  **audio-visual desync**: cross-modal binding is loosened, not synchronized.
- **Pauline Oliveros**, *Deep Listening* — convolution-reverb vastness and slow
  attentional drift as an aesthetic of immersive, cavernous space.

## Honesty note

DMT / endogenous-tryptamine theories of the NDE (e.g. speculation about a
near-death pineal DMT release) are **unproven and contested**. This prototype
does not claim any mechanism for the near-death experience. It evokes the
reported *phenomenology* — the felt shape of the journey — and nothing more.

## Safety

This is a **slow cosmic piece, designed against photosensitive-epilepsy
triggers.** There is no strobe and no full-screen flicker above ~3 Hz. Every
luminance change — the light bloom, the vignette, the clarity-snap — is a
smooth continuous ramp driven by motion and slow luminance drift. A visible
**Pause** button instantly freezes all motion and silences the audio.
