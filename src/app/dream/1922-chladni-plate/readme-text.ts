export const README = `Chladni Plate asks: what if you could STRIKE and BOW a real physical plate, watch its Chladni nodal figures form in the settling sand, and hear its true inharmonic modal voice?

HOW TO PLAY
• Tap or click the plate to STRIKE it. Where you hit matters: strike an antinode of a mode and that mode rings loud; strike its nodal line and it stays silent. The figure and the timbre both depend on the point of impact.
• Press and drag to BOW it — a continuous, slightly rough excitation that sustains the modes under your pointer, like drawing a violin bow along the plate edge (exactly how Chladni first made his figures visible).
• It is silent and still until you touch it. No autoplay, no demo loop — the instrument is dead without a hand.

THE SOUND — 2D modal / physical-modeling synthesis
The plate is voiced as a bank of ~28 damped sinusoidal modes. Crucially, a stiff plate's flexural modes scale as the SQUARE of a membrane's: frequency ∝ (m/a)² + (n/b)² rather than the square root. That spreads the partials into a genuinely INHARMONIC spectrum — not a harmonic series, and emphatically not a pentatonic or tempered scale. It is what makes struck metal sound like metal. Each strike adds an impulse to every mode weighted by its mode shape sin(mπx)·sin(nπy) at the impact point; each mode then decays with its own time constant. Polyphony is bounded to exactly one persistent oscillator per mode, so it never runs away.

THE PICTURE — WebGL2 fragment shader
A full-screen shader sums the currently-excited modes into a standing-wave field u(x,y) = Σ Aₖ·sin(mπx)·sin(nπy) and draws sand collecting where |u| ≈ 0 (the nodal lines) while antinodes darken to bare oxidized metal. Because the modes decay at different rates, the nodal figure blooms on impact and morphs as the higher partials die away first. What you see is literally the current modal energy of what you hear.

PALETTE
Cool graphite plate, warm brass frame and sheen, pale sand on the nodal lines, a hot flash at the strike point.

REFERENCES
• Ernst Chladni's plate figures (c. 1787) — the visual and physical antecedent: bow a sand-strewn metal plate and the sand migrates to the nodal lines.
• "Differentiable Modal Synthesis for Physical Modeling of Planar String Sound and Motion Simulation" — arxiv.org/abs/2407.05516 — the 2D modal-synthesis reference for frequency and mode-shape formulation.

If WebGL2 is unavailable the prototype shows an on-brand notice rather than a broken canvas.`;
