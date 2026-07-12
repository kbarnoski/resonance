# 1520 · Click Cathedral

**The one question:** *Can you SEE a vast space you cannot see — by clicking into the dark and listening to it answer?*

A drug-free human-echolocation instrument on the **audio-only / no-screen** surface. You emit *clicks* into an invisible, procedurally-generated cathedral, and the space answers in **spatialized binaural echoes**. The screen is deliberately almost-empty: sound is the medium. The altered-state hook is **sensory substitution** — assembling a rich spatial percept from pure sound, the eyes-closed "third ear" / boundless-space phenomenology — and it is **active and building** (you *construct* a room), not a dissolving void.

## How to play

1. **Wear headphones.** The echoes are binaural (HRTF-panned); they collapse to nothing on a mono speaker.
2. Press **Enter the dark** to start the AudioContext (gesture-gated; master gain ramps up from silence).
3. Press **Space** (or tap the field) to emit a click. Listen: the room scatters it back — near soft walls answer quick and dull, a far stone vault answers late, bright, and reverberant.
4. **Aim** with **← / →** or by moving your pointer. Aiming steers a directional "flash-sonar" lobe — you hear most strongly what you point at.
5. **Keep clicking toward a region** to build its image. The more you probe a direction, the sharper and louder its return becomes, and the brighter its point blooms on the faint belief map.
6. Switch between **Small chamber / Long corridor / Vast vault** to hear the size contrast (delay + reverb tail change dramatically).
7. Optional: **Use mic clicks** — real mouth/tongue-clicks are detected by broadband onset detection and drive the room too. If the mic is denied, everything still works from the spacebar.

## The neuroscience it embodies

Garcia-Lazaro et al., **"Neural and behavioral correlates of evidence accumulation in human click-based echolocation," *eNeuro*, April 2026** (Smith-Kettlewell Eye Research Institute + Cardiff University).

The key finding: expert echolocators build their spatial map by **"stacking" / summation** — localization accuracy improves roughly **linearly with the number of self-generated clicks**. The percept is assembled by progressively **accumulating acoustic evidence over time**, not read from a single optimal snapshot.

This piece makes that mechanism the core loop. Each surface carries a **belief** value that rises linearly each time a click lands on it (weighted by how well it was aimed). As belief accumulates:

- the surface's echo gets **louder** and **brighter** (filter cutoff and gain scale with belief) — *each click sharpens the image*;
- its point on the belief map blooms larger and more opaque;
- an overall **"image forming: N%"** readout tracks mean belief across the room.

So a vague, uncertain space resolves into a confident one only through **repeated, self-generated clicking** — the eNeuro evidence-accumulation result, made playable.

## Technique

- **Procedural room geometry** — a seeded `mulberry32` PRNG places a set of surfaces at azimuth / distance / elevation / material. Three presets vary count, distance spread, and material bias; the corridor biases surfaces onto a long front/back axis so its size reads as a receding tunnel. Fully deterministic — no `Math.random`, no `Date.now`.
- **Binaural HRTF echo renderer** — per click, surfaces are ranked by aim-lobe × reflectivity ÷ distance; the strongest ~10 are voiced (global cap 14, recycled on `onended`). Each echo is a short broadband noise burst → per-material biquad (soft = dull lowpass / stone = bright bandpass) → distance-delayed gain envelope → **HRTF `PannerNode`** at the surface's 3-D position → master, with a send into a **`ConvolverNode`** whose deterministic impulse gives the room its size (1.1 s chamber → 4.6 s vault). Delay = distance ÷ 343 m/s.
- **Click-summation / evidence-accumulation model** — the belief array described above; the whole feedback loop.
- **Mic onset input** — own minimal `getUserMedia` → highpass → `AnalyserNode` time-domain transient detector with a rolling baseline and 160 ms refractory window. Optional; spacebar is the guaranteed controller.

Master chain: master gain (≤ 0.2, ramped from 0) → `DynamicsCompressor` limiter → destination. A very faint ambient bed (airy filtered noise + 48 Hz breath drone through the room reverb) keeps it from ever being dead silent. Full teardown on unmount (close AudioContext, stop mic tracks, cancel rAF). Honors `prefers-reduced-motion` (no drift, no rings). No strobing — the page is dark and calm.

## Honest novelty

The lab is 1500+ deep; convolution reverb and binaural panning are common here. The novelty is the **specific combination**: an *active click-summation echolocation instrument* on the **audio-only surface**, embodying the April-2026 eNeuro evidence-accumulation finding. Four genuinely-present subsystems (procedural geometry + HRTF echo renderer + belief model + mic onset), named references.

## References

- **Garcia-Lazaro et al., *eNeuro*, April 2026** — "Neural and behavioral correlates of evidence accumulation in human click-based echolocation." (The finding this piece embodies: accuracy grows ~linearly with click count.)
- **Daniel Kish** — human flash-sonar / echolocation pioneer.
- **Pauline Oliveros** — *Deep Listening*.

## Tags

`input: self-clicks+mic-onset · output: audio-only/binaural · technique: HRTF-echolocation + click-summation · palette: near-black/faint-violet · pole: cosmic-ambient (active, not void)`

## Next-cycle deepening

- Give each surface a small extent (multi-tap early reflections per surface) so large walls read as *walls*, not points — closer to real geometric acoustics.
- Head-tracking via device orientation / webcam so turning your head re-pans the whole room (true first-person listening), making the aim control embodied rather than a key press.
- A genuine per-material measured-IR convolution (short surface impulse responses) instead of biquad approximations, and add frequency-dependent air absorption over distance.
- A quantifiable "localization accuracy vs. clicks" mini-task that logs the eNeuro linear-improvement curve as the user plays — turning the embodiment into a soft in-browser replication.
