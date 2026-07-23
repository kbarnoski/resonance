# 2354 · buoyant

## The one question
**What if the SOUND your body makes when you move could change how HEAVY your own body FEELS — making you feel buoyant and light, or leaden and grounded, without any drug?**

You hold the phone and physically bounce / step / sway in place. Every footfall
is sonified in real time. By shaping that movement-sound you can talk your body
into feeling lighter or heavier — a drug-free altered state of the *body*, not
the mind.

## Grounding / references
- **Tajadura-Jiménez et al. — SoniBand (CHI 2026).** Pitch-modulated
  movement-sonification measurably changes a person's *perceived body-lightness,
  physical effort, and affective state*. Brighter / higher-pitched
  movement-sound → the body feels lighter and more buoyant; darker / lower →
  heavier and grounded. This is axis 1.
- **Tajadura-Jiménez et al. — "As Light as Your Footsteps" (CHI 2015).** The
  foundational result: altering the spectral frequency of one's own footstep
  sounds changes felt body weight and gait. This piece is a direct descendant.
- **Lenggenhager & Blanke — full-body ownership.** Whether you *own* an altered
  bodily sensation depends on the **temporal synchrony** of the multisensory
  feedback. Tight sync → the change is felt as yours; growing lag → it floats
  free of you, uncanny / derealized. This is axis 2.

## The two INDEPENDENT axes (no single master knob)
The piece deliberately has **no** one 0→1 "intensity" dial. It has two variables
that are genuinely independent and can conflict:

1. **Lightness — brightness / pitch of the movement-sound (SoniBand axis).**
   A slider the visitor controls directly. Higher = brighter, airier timbre,
   higher & more stretched partials → the body feels lighter, floats, hangs
   weightless. Lower = a low thud → heavy, grounded.
2. **Ownership — sync / lag (Lenggenhager/Blanke axis).** A second, independent
   slider. It is the temporal offset between the movement and its sonic + visual
   echo. `0 ms` = tight sync, you *own* the altered weight. Increasing lag
   pushes the echo later, until the weight-change floats free of your body —
   uncanny, derealized.

**Why they can't collapse to one knob:** they occupy orthogonal quadrants.
- bright + tight → *buoyant, and it is yours*
- bright + lagged → *floating free — it isn't quite yours* (uncanny lift)
- dark + tight → *heavy, grounded, fully owned*
- dark + lagged → *leaden, and strangely detached*

Bright-but-lagged and dark-but-tight are opposite corners; no single scalar can
name them. Both axes are always audibly present (brightness colours the drone +
every footstep grain; lag delays the echo) and visibly present (brightness sets
buoyant rise vs. leaden sink; lag delays the field's response and opens a visible
gap between the raw-input marker and the mass's reaction).

## Subsystems integrated
- **DeviceMotion capture** — `accelerationIncludingGravity` (falls back to
  `acceleration`), high-passed against a slow gravity baseline to isolate
  movement energy. On iOS, `DeviceMotionEvent.requestPermission()` is called
  from the Start gesture; on Android/desktop the listener is just attached.
- **Footfall onset detection** — a smoothed motion envelope with rising-edge
  peak-picking and a refractory window; each onset is one sonified footstep.
- **Movement-sonification synth (raw Web Audio, no libraries)** — each footfall
  is a filtered noise-burst impact (spectral centroid tracks brightness) plus a
  body-resonance tone at a *continuous* pitch with a stretched-inharmonic
  partial. A sustained buoyancy drone bed rises in pitch and inharmonicity with
  brightness. Master gain ≈0.15 behind a `DynamicsCompressorNode`; context is
  started/resumed only on the user gesture. **No pentatonic / just-intonation**
  scales anywhere — continuous pitch and stretched partials only.
- **Buoyancy visual (Canvas 2D)** — a soft-body cluster of cloud grains that
  rises and hangs weightless when bright+light (underdamped bob) and sinks /
  compresses with a heavy contact-shadow when dark+heavy (overdamped). A
  high-key aerial / daylight palette (pale sky-blue, warm white, cloud tones),
  never the jeweled violet-on-black look.
- **Sync / ownership axis** — footstep audio is scheduled at `now + lag`; the
  visual response is queued to fire at the same lagged time; a raw-input marker
  flashes at the *un-lagged* instant so the temporal gap is legible on screen.

## Fallbacks (mandatory graceful degradation)
- **No DeviceMotion / permission denied / no events within ~1.6 s** → automatic
  switch to **pointer/drag**: dragging up and down on the field drives motion
  energy and triggers footsteps. A one-line note always states the active mode.
- **Seeded autopilot** — a deterministic (mulberry32) generator supplies gentle
  footfalls when no human input has arrived for ~2.6 s, so a silent desktop
  glance shows the mass breathing. Crucially it only injects *movement*; it
  never touches either axis, so the two knobs stay entirely the visitor's.

## Safety
- No flicker / strobe by default. The only auto-motion is a ≤0.12 Hz luminance
  *drift* (a slow breath, floor 0.9), well under any photosensitive threshold.
- `prefers-reduced-motion` freezes the drift, damps particle jitter, and
  disables the autopilot's auto-bobbing.

## Honest caveats
- **Headless — untested on a real phone.** The onset-detection thresholds
  (`THRESH`, the refractory window, the baseline high-pass rate) are tuned by
  reasoning, not against real accelerometer traces. On a physical device the
  sensitivity will almost certainly need re-tuning per handset.
- The core SoniBand effect is a claim about *proprioception* — it only truly
  lands when the visitor is actually moving their own body and hearing the
  sound bone-conducted / close-mic'd. On a desktop with the pointer fallback
  you get the *structure* of the piece (two conflicting axes, the felt-state
  readout) but not the somatic illusion.
- **Needs Karel's hardware to evaluate properly:** a phone strapped or held to
  the body, ideally bone-conduction or a close worn speaker so the
  movement-sound feels like it comes *from* the body, plus a real bounce/step
  space. Latency of the whole motion→audio path on real hardware is the make-or
  -break variable for the ownership axis and can't be judged headless.
- The four quadrant labels are authored interpretations; whether real listeners
  report "uncanny" at bright+lagged vs. "detached" at dark+lagged is an open
  empirical question this prototype is meant to help ask, not answer.
