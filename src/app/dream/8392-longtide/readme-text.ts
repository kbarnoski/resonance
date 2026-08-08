// Plain-text design notes surfaced in the in-app modal. Kept in sync with
// README.md (which carries the fuller self-assessment + references).

export const README = `Longtide — a 10-minute journey with real memory.

THE QUESTION
What if a Resonance piece were a flowing cosmic field you SEED and STEER,
carried by granulated piano, that at minute 8 plays your own earlier gestures
back to you — transformed — so minute 10 is unrecognisable from minute 1?

THE FUSION
Three loved prototypes become one arc:
 • 130 tsl-particle-compute — a GPU-scale instanced particle FIELD (here ~22k
   points CPU-advected through an analytic curl flow, robust on any WebGL).
 • 243 spectral-cloud — the field's colour + afterimage are the SPECTRAL BODY,
   driven live by the piano's FFT (amplitude + spectral centroid).
 • 227 paths-granular — a procedural warm-piano CARRIER read by a GRANULAR
   engine of overlapping Hann grains.

THE ARC (five movements, ~2 min each, slow drift — never a loop)
Stillness → Bloom → Turbulence → Recollection → Dissolution. Each shifts the
flow character, particle speed/size, harmony and palette temperature
(violet → indigo → warm amber).

THE MECHANIC — MEMORY
Drag (or press Space at the reticle) to plant a SEED: a persistent vortex that
(a) permanently bends the local flow, (b) captures the granular read-head as a
"phrase", (c) is stored in a memory ring. Short-term: each seed echoes locally,
a soft decaying canon. Long-term: in movement 4 (Recollection) the field
RE-PLAYS your earlier seeds in order — each old vortex re-lights (warm) as its
phrase re-sounds, time-stretched and transposed up a perfect fifth. You watch
and hear your own past return.

CONTROLS
Pointer-drag = seed + steer · Space = plant at reticle · 1–5 = jump movement ·
R = reset · drop a .wav/.mp3/.m4a to feed your own piano.

A deterministic "virtual traveller" (seed 0x8392) seeds + steers so the whole
arc self-plays within ~2s of load. The moment you act, it retires.

SAFETY
Slow luminance drift only, no strobe (SafeFlicker, ≤3 Hz). Reduced-motion is
honoured with a calmer flow.

REFERENCES
Refik Anadol, Latent City (2026) — memory-as-material, multi-chapter canvas.
La Monte Young — long-duration sustained-tone listening.`;
