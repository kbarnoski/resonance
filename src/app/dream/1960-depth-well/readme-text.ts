// readme-text.ts — the design notes shown in the in-page modal.

export const README_TEXT = `A room that remembers where your body was — and keeps every place you dwelled sounding a tuned tone you can walk back to.

Step in front of a webcam and the piece estimates monocular depth: how far each part of the frame is. You become a live 3D point cloud floating in a dark blue-black volume. Hold still in a spot — dwell — and the room deposits a durable, glowing memory-node right there in 3D space. That node keeps sounding one partial of a just-intonation stack over a low 55 Hz root. Move away and it persists; pass back through it and it swells, louder and brighter. Over a session you author a chord of pure ratios spread through the room's depth. Your past positions durably shape the present sound — this is a compositional-memory instrument, not a passive visualizer.

Depth is the enabling technology. Depth-Anything-V2 (small) runs in the browser on WebGPU via Transformers.js, loaded at runtime. Depth chooses which partial and register a memory takes; horizontal position sets its stereo pan; the live present locus is the one warm amber accent, and its nearness to a node makes that node bloom.

It is fully alive without the model. From the first frame a synthetic wandering presence drifts through the depth volume, pausing to dwell and depositing nodes on a gentle loop, so the whole pipeline — cloud, memory, and spatial just-intonation audio — is complete on load. With a camera but no model, a crude brightness-and-motion pseudo-depth still lets you play. No WebGPU falls back to a Canvas2D projection. It never blanks.

Lineage: Myron Krueger's Videoplace (the body as interface), Daniel Rozin's mechanical mirrors (a surface that reflects your presence), and Rafael Lozano-Hemmer's presence-and-tracking installations (a space that records where people were). Depth Well adds durable, tuned memory: the room does not just mirror you, it keeps singing where you have been.`;
