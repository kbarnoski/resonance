**For**: kids (4+)** — a calm, wintery snow-globe music box. No reading, no score, no fail, no timer. Tilt and watch the snow chime.

## The brief it answers
"What if a 4-year-old tilts the tablet like a snow globe — and Karel's REAL recorded piano pours out as glowing snow that chimes when it lands?"

A 3D glass snow globe holds ~220 glowing motes drifting in a sphere. The child **tilts the device** and the motes slide and fall under that gravity. When a mote settles onto one of 5 glowing chime rails near the bottom and rests there for a beat, it plays a **short, soft window of Karel's real recorded piano** pitch-shifted to that rail's pentatonic tone, then dissolves into a sparkle and respawns at the top — infinite calm play.

## Tag fidelity
- **INPUT = device tilt / orientation.** `DeviceOrientationEvent` is the primary input (gamma steers x, beta nudges the downward bias). Touch is *not* primary. Fallbacks: drag-to-tilt (pointer events on the canvas) and an always-on gentle auto-drift that swings gravity sideways so motes keep landing and chiming **hands-free within ~2s**, even with zero permissions.
- **OUTPUT = three.js / WebGL.** The whole scene is `three` (already a dependency, zero deps added): a transparent glass sphere, additive-blended rim glow, 5 glowing rail meshes, and motes rendered as an additive `THREE.Points` cloud driven by a per-mote physics loop. Not Canvas2D.
- **TECHNIQUE = his REAL recorded piano as discrete pitched windows triggered by mote-landings.** Each landing carves a fresh random 0.25–0.5s Hann-windowed slice of his recording (`makeSliceBuffer`) into an `AudioBufferSourceNode` with `playbackRate` mapped to the rail's pentatonic tone. This is a physics-triggered music box — *not* a continuous grain cloud, *not* a follower/analyzer of his recording.
- **VIBE = calm wintery.** Deep night-blue background `#0b1830`, soft blue-white-silver motes/rails, slow drift, soft attack/long decay envelopes, an always-on C2+G2 ambient pad. Bedtime-tolerable: no bright-active flashing, no dark void.

## Audio safety (kids-safe)
Master chain in `audio.ts` `makeMasterChain`: `gain 0.28 (≤0.3) → BiquadFilter lowpass 6800Hz (≤7500) → DynamicsCompressor(threshold −10, ratio 20:1) → destination`. Per-chime gains peak at 0.22 with soft 20ms attacks and a 12ms rate-limit so a flurry can never stack into a loud transient. Always-on soft pad (C2 + G2) so it is never silent. All pitches snap to **C-major pentatonic** (C4 D4 E4 G4 A4) — there are no "wrong" notes.

## His-piano + fallback path
On the Start tap we create/resume the `AudioContext` and call `DeviceOrientationEvent.requestPermission()` (feature-detected, iOS) inside the same gesture. We then call `fetchPianoBuffer` (the verbatim loader for Karel's recording `549fc519-…`). **If it returns null** — which it will in the sandbox with no network — we synthesize a soft celesta/bell `AudioBuffer` (`makeFallbackBellBuffer`, inharmonic partials with exponential decay) so the globe always sounds, and surface a clearly-visible `text-rose-300` notice that a fallback voice is playing. Either way the piece looks alive and chimes within ~2s of Start with zero permissions granted.

## Graceful degradation
- No WebGL → friendly full-screen notice (`text-rose-300`), no crash.
- No device-orientation → drag-to-tilt + auto-drift + a `text-rose-300` notice.
- No AudioContext → fallback bell flagged, visuals still run.

## Teardown
On unmount: cancel rAF, remove all listeners (orientation, resize, pointer), dispose every geometry/material, `renderer.dispose()` + `renderer.forceContextLoss()`, stop/disconnect all audio nodes, `audioCtx.close()`.

## Lineage / references
- **Music-box / snow-globe** lineage — a self-contained object whose motion makes melody.
- Karel's published **"Snowflake"** journey — this is its playable, child-facing companion.
- The loved his-piano prototypes **`227-paths-granular`** and **`163-paths-visualizer`** (real-piano lineage) — here the source material is the same artist, re-cast as discrete landings rather than a continuous cloud.
- **LEGO SMART Play (2026)** — the screen-free brick that turns "motion through the air" into sound + light — current-register touchstone for tilt-as-instrument for very young children.
