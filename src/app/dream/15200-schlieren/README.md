# 15200 · Schlieren

**One question:** What if you could *see* Karel's recording as the air it moves — a shadowgraph of sound?

A synthetic knife-edge **schlieren** visualization of one of Karel's real piano
takes. A GPU field of simulated "air" is disturbed by his music and rendered as
the signed density gradient cut by a knife-edge: near-black at rest, luminous
grayscale plumes and ripples billowing from unseen sources as he plays —
meditative and cosmic at low energy, spiking to sharp shockwave-like ripples on
loud onsets.

## The technique

Schlieren imaging makes invisible density / refractive-index gradients in a
transparent medium visible. In the classic optical rig, a point source is
collimated through the test region and refocused onto a **knife-edge**; light
bent by a gradient *toward* the edge is blocked (reads dark) and light bent
*away* passes (reads bright), so ∂(density)/∂x along the knife axis becomes
brightness. It is how shockwaves, heat plumes, and even sound propagating in air
are photographed.

**Named references**

- Toepler, 1864 — the original schlieren method.
- A.J. Settles, *Schlieren and Shadowgraph Techniques: Visualizing Phenomena in
  Transparent Media* (Springer, 2001) — the standard modern reference.
- The synthetic / **background-oriented schlieren (BOS)** line — recreating the
  knife-edge cut computationally from a density field rather than optically,
  which is exactly what this piece does.

Schlieren imaging is monochrome, so this render is deliberately **achromatic**
(grayscale) — no color hues. That is on-brand, not a limitation.

## How his music drives the field

The only sound is Karel's decoded recording, played through the shared
`safeMaster` ear-safety bus. There are **zero oscillators and zero synthesized
tones**. Each frame the live signal from `safeMaster.analyser` is reduced to:

- **low / mid / high** band energies (bin ranges derived from the real sample
  rate; the master's 14 kHz cap means nothing musical sits above the high band),
- overall **RMS** from the time-domain waveform,
- a spectral-flux **onset** amount that spikes on loud attacks.

Four fixed emitter points in the field are pumped with pressure proportional to
those values (low→emitter 0, mid→1, high→2, RMS→3), plus an onset kick shared
across all four so a loud attack fires a sharp expanding ripple. Envelope
followers (fast attack, slow release) give the plumes a natural settle. A tiny
"breath" term keeps the field from ever sitting perfectly dead.

## Subsystems

- **`schlierenField.ts`** — WebGL2 fragment-shader field. Two `RGBA16F`
  half-float textures are ping-ponged as a **damped 2D wave equation** at 256²
  (R = current, G = previous). A 4-neighbor Laplacian propagates ripples;
  velocity damping (<1), value clamping, and a soft absorbing border keep it
  numerically stable. A second **schlieren render pass** takes the field's
  spatial gradient by central differences, projects it onto the knife-edge unit
  vector, and maps the signed scalar to grayscale around a near-black rest with a
  luminous glow from the gradient magnitude, plus a faint vignette.
- **`audioEngine.ts`** — loads/plays one real take via
  `loadRealTrackBuffer`, routes an `AudioBufferSourceNode` into
  `safeMaster.input`, and derives the smoothed `FieldDrive` each frame.
- **`page.tsx`** — hero, Play button, track selector (all of `REAL_TRACKS`),
  knife-edge angle slider, design-notes overlay, `PrototypeNav`, the render loop,
  and full teardown.

## Interaction (subordinate — the piece works untouched)

- **Drag horizontally** across the frame → rotate the knife-edge, revealing
  gradients along a different axis (a genuine schlieren control).
- **Press** → an extra emitter disturbs the air where you touch.
- **Mobile tilt** (feature-detected, optional) → left/right tilt rotates the
  knife-edge. Never required.

## Robustness

- **No WebGL2 / no float-render** → the recording still plays and an on-brand
  notice explains why the field is dark. Never crashes.
- **Audio load failure** → on-brand `text-destructive` error, context cleaned up.
- **prefers-reduced-motion** → slower, calmer field (fewer substeps, throttled to
  ~30 fps, lower drive) but still gently animating.
- **Full teardown** on unmount: cancel rAF, stop & disconnect the source,
  disconnect safeMaster, close the AudioContext, delete all GL textures /
  framebuffers / programs / VAO and lose the context.

## Honest limitations

- This is a **2D scalar damped-wave field**, not a real Navier–Stokes fluid and
  not a true optical ray-trace. The knife-edge cut is applied directly to the
  field gradient — a faithful analogue of the schlieren *effect*, not a physical
  optics simulation.
- The emitters are **stand-ins** for where the sound "enters" the air; their
  fixed positions are an aesthetic choice, not a measurement of real acoustic
  sources.
- Band-to-emitter mapping is tuned by ear for the plume look, not calibrated to
  any physical pressure scale.
- No GPU/audio was available in the build environment, so the shaders, playback,
  and reactivity were verified by construction and type-checking rather than a
  live run.
