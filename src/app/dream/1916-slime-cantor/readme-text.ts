export const README = `Slime Cantor asks: what if a living slime-mold transport network were a musical instrument — and its emergent NETWORK TOPOLOGY were the harmony you compose with your fingers?

HOW TO PLAY
• Tap (or click) empty agar to drop a food seed. Drag to move it. Tap a seed again to remove it.
• Up to ten fingers at once — each finger carries its own seed.
• The slime grows luminous veins toward the food. When a vein physically connects two seeds, an edge is born.

WHERE THE MUSIC COMES FROM
The connected seeds form a small weighted graph. We take its graph-Laplacian eigenvalues — the network's natural resonant modes, exactly like the modes of a drum head (frequency ∝ √λ) — and sound them as an additive drone. As the slime rewires, the spectrum drifts and the chord morphs. A new vein rings a soft bell; a broken one, a gentle damp.

With no seeds connected, the field is a formless luminous wash and a quiet static drone: the harmony genuinely requires your placement. Nothing here is pentatonic or quantized — the eigenvalues map continuously to pitch.

UNDER THE HOOD
A genuine agent-based Physarum simulation runs in WebGPU compute shaders: hundreds of thousands of agents sense, rotate toward, and deposit trail, which diffuses and decays each frame (Jones 2010). Food nodes emit chemoattractant so veins route between them (Tero et al. 2010, the Tokyo-rail optimal-transport behaviour). Without WebGPU it falls back to a lighter Canvas2D slime so it is never blank.

Deep teal agar, amber/gold veins, coral seeds — dark-field bio-microscopy. Slow luminance drift only; no strobe.`;
