// Plain-text design notes surfaced in the in-app modal. Kept in sync with
// README.md (which carries the fuller self-assessment).

export const README_TEXT = `Cascade — compose a rhythm by diverting a waterfall of physics marbles onto a row of tuned bars. A browser marble machine where the marbles are thousands of GPU-simulated particles.

THE ONE QUESTION
What if you could COMPOSE a groove not by placing notes, but by steering a stream — tilting angled deflectors so a falling waterfall of particles lands on the bars you want, in the rhythm you want?

THE MACHINE
Particles fall continuously under gravity from an emitter at the top. Down the field sit a handful of DEFLECTORS — angled bars you drag to reposition and rotate to re-aim. Particles collide with them and get thrown left or right. At the bottom is a row of nine TUNED RESONATOR BARS (a major-pentatonic row, low pitch on the left, high on the right). Every particle that strikes a bar plucks that bar's note and flashes it. So where the deflectors sit, how they are angled, and how hard you open the emitter together decide WHICH bars get hit and in what rhythm. Aim the flow and it becomes a groove; over-drive the emitter and the stream turns to a dense, unpitched wash — a decision you can get wrong.

THE TECHNIQUE (GPU PHYSICS)
This is the lab's GPU-compute-physics piece. When your browser exposes WebGPU, the whole simulation runs GPU-side: a WGSL COMPUTE SHADER integrates ~30,000 particles under gravity, resolves collisions against every deflector (segment SDF + reflection) and against the bar row, and recirculates spent particles back to the emitter with a flow-controlled release delay. Bar strikes are tallied into an atomic storage buffer that is copied back to the CPU each frame (36 bytes) to drive the audio. Particles are drawn as additive point-sprites straight from the same GPU buffer via a WebGPU render pipeline — positions never leave the GPU.

GRACEFUL FALLBACK
Where WebGPU is absent (Safari/Firefox/older Chrome/CI), the exact same machine runs on the CPU with a smaller swarm (~1,400 particles), integrated in a normal animation-frame loop and rendered through three.js's WebGLRenderer as instanced points. The physics constants, the deflectors, the bars, the tuning and the interaction are identical — only the particle count and where the maths runs differ. A quiet note says "running CPU fallback — WebGPU unavailable"; it is a graceful degrade, not a failure.

THE SOUND
Web Audio only. Each bar is a short struck-modal voice: an inharmonic partial stack (1, 2.76, 5.40) with a fast, pitch-dependent decay and a filtered mallet tick, so higher bars ring shorter and brighter like a real xylophone. A voice pool caps simultaneous notes and a per-bar retrigger cooldown keeps a dense stream from machine-gunning; everything runs through a master limiter. Audio is created on the Start gesture to satisfy autoplay policy.

REFERENCES
Wintergatan "Marble Machine" — marbles released onto tuned percussion; the interaction model here. three.js WebGPU compute-physics (2026) — thousands of particles integrated and collided in a compute shader, drawn without a CPU round-trip; the technique anchor.

A NEXT CYCLE COULD
Add funnels and spinners as extra divertors, a quantise-to-grid toggle so hits snap to a tempo, per-bar timbre selection, and a shareable machine layout (deflector positions in the URL).`;
