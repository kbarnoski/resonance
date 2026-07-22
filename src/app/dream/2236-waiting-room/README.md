# 2236 · Waiting Room

**Route:** `/dream/2236-waiting-room`

> What if you had to **build a space with your body** before a psychedelic
> presence could inhabit it — the DMT "waiting room" assembling out of your own
> motion, and only when the room is fully formed does something arrive in it?

Your moving body — seen through the **webcam** — does not summon a swarm. It
**carves a space**. Sustained motion climbs a four-stage immersion ladder that
warps a hexagonal "cortical" lattice into a receding honeycomb tunnel — the DMT
antechamber — and only once that room is fully built does a coherent presence
condense inside it and regard you. Stop moving and it recedes. It is *sustained,
never permanent*.

## The finding it renders

- **"Micro-phenomenology of immersion and perceived presences under DMT"**
  (*Neuroscience of Consciousness*, Oxford, 2026, article **niag015**) — under
  DMT, immersion is a **structured continuum**, and a perceived **presence
  emerges only AFTER** multisensory integration and 3D-spatial structure have
  developed. First the body, then the senses bind, then a *space* forms, then
  something inhabits it. That ordering is the literal spine of this piece.
- **"Computational spirits: a neuroscientific account of psychedelic entity
  encounters"** (*Neuroscience of Consciousness*, 2026, article **niaf069**) —
  models entities as **autonomous predictive agents**. So the presence here
  keeps its own slow autonomous drift rather than being pinned to the cursor.
- The classic **DMT "waiting room" / antechamber** — the shimmering architecture
  that precedes breakthrough (Strassman).

## The log-polar / form-constant warp

The **Bressloff–Cowan** insight: the Klüver form constants (tunnels, funnels,
spirals, honeycombs) are what a simple striped/hexagonal pattern in primary
visual cortex looks like *after* the retino-cortical map is undone. That map is
nearly complex-logarithmic — cortical horizontal ≈ `log(r)`, cortical vertical ≈
`θ`. So the renderer runs it in **reverse**: for every screen pixel it takes
`(log r, θ)` as cortical coordinates, evaluates a **hexagonal three-plane-wave
lattice** there (three cosines at 60°), and the honeycomb blooms into a receding
tunnel with real apparent depth. This is the primary substrate, and it is
**driven by the live motion field**, not a time-only autopilot: motion builds
`coherence`, `coherence` resolves the lattice, and the motion **centroid** steers
the vanishing point and the presence's gaze.

## The four-stage ladder

A single scalar `coherence ∈ [0,1]` (a leaky integrator over motion energy)
selects the stage. Reaching **Presence** takes ~15–35 s of real movement; going
still lets it decay back down.

1. **I · Bodily** — near-dark. Only motion registers; faint radial ripples where
   you move. No structure.
2. **II · Binding** — sustained motion accumulates coherence; the spectral audio
   ignites and binds to motion, and the warp organises noise into faint
   concentric/honeycomb structure (the form constants beginning to resolve).
3. **III · Antechamber** — the log-polar warp deepens into a legible receding
   honeycomb chamber with real depth (the "waiting room"); the motion centroid
   shifts the vanishing point so you feel you are moving through it.
4. **IV · Presence** — with the room built, a face-like gestalt condenses in the
   honeycomb, its two eye-hollows tracking your motion centroid (its gaze), with
   its own slow autonomous drift. Stop moving → coherence decays → the presence
   recedes and the room flattens.

## Technique (pure browser, no new packages)

- **Capture** — `getUserMedia({ video })` → hidden `<video>` → each frame drawn
  **mirrored** to a tiny 96×72 canvas.
- **Motion field** — per-cell luminance frame-difference (thresholded, decayed).
  Total energy → the ladder; centroid → vanishing point + gaze. Cheap, no ML.
- **Warp engine** — Canvas2D. The inverse log-polar hex lattice is evaluated
  per-pixel into a capped internal `ImageData` (≤ ~66k px) and upscaled with
  smoothing on (soft, anti-flicker, ≥30fps).
- **Audio** — Web Audio. A stretched-partial **inharmonic** additive cluster
  (bell/metal-like, `[1, 1.87, 2.74, 3.52, 4.61, 5.9, 7.35] × 92 Hz`), a lowpass
  that opens with motion, a slow shimmer LFO, `DynamicsCompressor`, master gain
  ≤ 0.2, silent until first motion. **No pentatonic / plain-JI scale.**
- **Graceful fallback** — no camera / denied / throw → **pointer/touch motion**
  (velocity splatted into the same field) with a clear on-brand notice. Fully
  playable without a camera; never throws, never a dead screen.

## Safety

No fast strobing. The tunnel drift is a smooth spatial translation, not a
luminance flip; overall brightness only tracks `coherence`, which changes over
seconds. `prefers-reduced-motion` further slows the drift. Nothing here flickers.

## Next-cycle deepening

- Distinct *entity typologies* from niaf069 (guardian / trickster / teacher) via
  different presence gestalts and drift signatures.
- A true moving-vanishing-point recompute (currently eased in screen space) for
  stronger parallax when walking "around" the room.
- Bilateral head-pose from an optional lightweight tracker so leaning shifts the
  chamber, not just gross motion.
- A breakthrough state above Presence: the honeycomb walls dissolving once you
  hold full coherence long enough.
