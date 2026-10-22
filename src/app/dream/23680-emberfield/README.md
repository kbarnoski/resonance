# 23680-emberfield — Ember Field

**Status**: demoable

A warm room you stand inside for ten minutes. Karel's piano becomes a slow,
breathing ember-cloud — tens of thousands of embers advected through a curl-noise
flow field — that you stir with your whole body. Reach high and the palette warms
toward gold; open your arms and turbulence rises; grow still and both the field
and the music settle toward near-silence. It is the deliberate opposite of the
lab's recent cool-clinical / datamatics monoculture: cosmic-ambient, warm,
boundless, meditative.

## The one question
"What if Resonance were a warm room you could stand inside — Karel's piano as a
slow, breathing ember-cloud you stir with your whole body?"

## Mechanism (≥3 subsystems)

1. **Catalog loader** — one real take of Karel's, via `loadRealTrackBuffer` from
   `_shared/welcomeHome` (default "Welcome Home"; pick any Welcome Home / Snowflake
   track). No synth, no oscillator, no noise anywhere in the signal path.

2. **Granular time-stretch engine** — many short overlapping grains are read from a
   head whose advance is **decoupled from real time**, so the piece can breathe
   toward a long, sustained bloom. Each grain is a slice of HIS decoded buffer
   (per-grain detune jitter only — his pitch, `playbackRate` 1), with a triangular
   gain window. Grains sum into a **warm tone-cap lowpass** (cutoff opens toward
   gold with reach-height) → a **warm tail whose convolution IR is a decayed slice
   of his own recording** → `createSafeMaster(ctx).input`. Stillness drives the
   read-head rate toward ~0.1× and thins the grain density; motion quickens it.
   Every audio parameter is smoothed ~0.12 s with `setTargetAtTime`.

3. **Curl-noise GPU flow-field render** — ~44k embers as a single `THREE.Points` +
   `ShaderMaterial` (additive warm glow, size attenuation, hand-rolled distance
   fog). Velocity is the **curl of a value-noise vector potential** (divergence-free,
   after Bridson 2007), baked into a 32³ velocity grid and sampled per ember with
   trilinear interpolation on the CPU — smooth at scale, and unmistakably volumetric
   / NOT Canvas2D. The flow topology is **re-grown in background chunks and
   cross-faded every ~24 s**, so the room is genuinely different at minute 5 than at
   minute 1; a multi-minute LFO drifts the baseline palette and a breathing LFO
   keeps idle alive, never static.

4. **Pose tracker** — `createPoseTracker` + `startCamera` from `_shared/cameraTracking`,
   gated ONLY on shoulders + wrists (never hips/ankles), x mirrored.

5. **Audio → field coupling** — spectral energy from `safeMaster.analyser` →
   ember brightness + size; bass → flow turbulence; spectral-flux onsets → warm
   pulses that ripple outward through the cloud (a shell of brightened embers with
   a gentle outward kick).

## Embodied control (+ pointer fallback)
Your two hands are **attractor-vortices** the embers swirl toward and around.
Reach-height warms the palette (ember ↔ gold); arm-span opens/closes the
turbulence; hand velocity drives the granular rate + grain density; stillness
lets the field settle and the music slow toward near-stillness — the meditative
payoff. The **pointer fallback** is a single attractor the mouse drags (Y →
warmth, drag → turbulence, speed → energy) driving the **identical control struct**,
so the piece is fully playable with a mouse alone; arrow keys nudge the same
attractor. Idle (no hands, no pointer) leaves the room breathing on its own.

## Output substrate (jury bans honored)
three.js GPU `Points`, additive warm ember/amber/gold/rose on near-black warm
charcoal — never Canvas2D, never cool-clinical/schematic/ice-blue/datamatics, no
film-grain or noise overlay (the value noise only *shapes* the flow field; it is
the simulation, not a screen grain). No drug/dosing metaphors — "depth" and
"intensity" only.

## Ambition
**#3** — the Refik Anadol audio-reactive particle / flow-field register; **Ars
Electronica 2026 Deep Space "Reactive || Interactive Particle Waves"** (a
walk-through audio-reactive particle garden, festival Sept 9–13 2026); curl-noise
advection after Robert Bridson, *"Curl-Noise for Procedural Fluid Flow,"*
SIGGRAPH 2007. **#2** — five cooperating subsystems (above). **#5** — the Ars
Electronica 2026 anchor is a current-year visual-technique source. Plus the
long-form stateful-evolution quality: the flow topology and palette genuinely
drift over minutes.

## Degradation
No camera / denied / model-fail → pointer + visible notice. No WebGL → designed
`text-destructive` notice, nothing started. Audio load fail → designed
`text-destructive` notice, no synth fallback. Full teardown on unmount: grains
stopped, nodes + master disconnected, `ctx.close()`, camera tracks stopped,
tracker closed, rAF cancelled, three.js geometry/material/renderer disposed with
`forceContextLoss()`.
