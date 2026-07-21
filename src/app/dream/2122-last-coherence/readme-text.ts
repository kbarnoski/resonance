// Prose shown in the "Read the design notes" overlay. Kept in sync with README.md.
export const README_TEXT = `THE LAST COHERENCE — a near-death experience rendered NOT as a tunnel you travel down, but as the dying brain's own memory-material igniting into a single COHERENCE SURGE: your whole life binding together at once, then releasing into light.

A cloud of ~200,000 "memory-motes" drifts scattered and dim. One scalar C (coherence, 0→1→0) drives everything across a ~6-minute autonomous loop:

FADING — the field is dispersed, the senses withdraw; a thin drone and the sparsest piano fragments.

THE SURGE — C rises as a slow luminance ramp (the gamma surge, ≪3 Hz, never a strobe). Motes are pulled toward 24 cluster centroids and snap into brilliant connected constellations; each surfacing cluster is a piano memory fragment growing louder and overlapping. Everything connected at once — the life review made literal.

BOUNDLESS LIGHT — all clusters converge toward one radiant point; the field becomes a single breathing luminous whole; the fragments overlap into a sustained chord of a whole life.

RETURN — C releases, the light recedes, the motes disperse back to drift. It loops.

The mechanic is the visual INVERSE of dissolution: a dis-connected field undergoing a coherence phase-transition into hyper-connection.

GROUNDING (2026 neuroscience):
· Borjigin et al., "Surge of neurophysiological coupling and connectivity of gamma oscillations in the dying human brain," PNAS 120 (2023) — at death, gamma power spikes up to ~300× baseline in the temporo-parieto-occipital junction with long-range coupling to prefrontal cortex: a sudden hyper-coherence of the kind that could bind and encode memory.
· "Near-death visions as a final internally-generated simulation," Frontiers in Psychology (March 2026) — the dying brain replays its OWN stores as a last simulation, not an external realm.
· Raymond Moody, Life After Life (1975) — the phenomenology anchor: the panoramic life review.

TECHNIQUE: a WebGPU compute shader integrates every mote each frame (dispersal when C is low; centroid attraction + binding when C rises; centroid convergence at the peak), rendered as instanced soft additive points. If WebGPU is unavailable it falls back to a Canvas2D field of ~3,000 motes running the same arc. Audio is a deterministic seeded generative-piano carrier (mulberry32, fixed seed 0x2122) over a just-intonation drone and a code-generated void reverb, all through a limiter. Optionally drop a piano track and its windowed grains become the memory material — decoded locally, never uploaded.

SAFETY: cosmic-ambient, boundless and calm. The coherence surge is a slow luminance ramp, slew-limited, honoring prefers-reduced-motion — no strobing.

HEADLESS-UNVERIFIED: this was authored without a GPU or audio device. The WebGPU path (pipeline compile, buffer bindings, additive blend look) and the exact audio balance have not been run; the Canvas2D + Web Audio fallback is the safer, verified-by-design path.`;
