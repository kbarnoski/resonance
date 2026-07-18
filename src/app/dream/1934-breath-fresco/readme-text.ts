/** Design notes shown behind the "Read the design notes" affordance. */
export const README_TEXT = `Breath Fresco turns a whole listening session into a wall you can read back like an autobiography. Breathe near the microphone: each exhale trowels a glowing horizontal stratum into wet plaster.

The memory mechanic is spatial, not temporal decay. The wall's horizontal axis IS time. A trowel head advances slowly left to right as the session runs. Every completed exhale deposits a persistent band at the current time-column; the band's height is set by how hard you breathed (mapped to a just-intonation partial). Deposits accumulate and are effectively permanent — behind the trowel they oxidize to a deeper sienna over minutes, but they never fade back to the ground. After a few minutes the wall shows where you breathed hard, where you rested, the rhythm of the whole session.

This is deliberately NOT a decaying chord. Nothing is "hold a tone and it dissolves in ~30 seconds unless renewed." Your past gestures durably shape the artifact — compositional memory as autobiography.

Sound: each exhale opens one sustained just-intonation partial over a ~60 Hz fundamental, an Éliane-Radigue-style drone that thickens as the fresco fills (bounded to 24 voices, gentle envelopes, compressor, master ≤ 0.18).

Image: a real WebGPU compute field (ping-ponged rgba16float storage textures, vertical-fuse + additive deposit passes, render-time oxidation) with a full Canvas2D fallback running the same logic.

No mic? A deterministic ghost-breath generator drives the same state machine so the wall fills and the drone evolves on its own — clearly a demo until a real breath takes over.

References: Éliane Radigue (long-form drone); Pauline Oliveros, Deep Listening; buon fresco — pigment fused into wet plaster, permanent.`;
