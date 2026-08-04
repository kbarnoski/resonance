# Ruledline (6584)

**What if a Xenakis-style ruled architectural surface were a playable instrument — where the straight generator lines you reshape by hand ARE the string glissandi you hear?**

A self-contained audio-visual prototype for the Resonance dream lab. Pure SVG, Web Audio, zero GPU.

## What it is

A **ruled surface** is a surface swept by a moving straight line. Two **director** curves — a top edge and a bottom edge, each a Catmull-Rom spline passing through three draggable handles — are sampled at matching parameters `t ∈ [0,1]`. The 24 straight **generator** lines connect `A(t)` to `B(t)`. Bow a director and every generator re-aims at once: a hyperbolic-paraboloid fan twisting in real time. This is honest geometry — the polylines you watch move are the surface, nothing faked for the eye.

A **playhead** sweeps left→right across the fan. The instant it crosses a generator, that line **sounds a string glissando**.

## How to play it

- **Alive on load.** Before you touch anything, a slow *seeded* warp breathes the surface and an auto-sweep playhead reads it. Web Audio needs a user gesture to make sound, so the visuals move immediately and audio unlocks on your first pointer/tap (expected and fine).
- **Drag a glowing handle** (the six ringed circles) to sculpt a director curve. Multi-touch: grab several handles at once.
- **Drag empty space** to scrub the playhead by hand, left or right, reading the surface wherever you want. Release to resume the auto-sweep.
- Steep, long lines = fast wide glissandi. Flat lines = steady tones. Lines bunched near the playhead pile into a shifting **glissando cluster** — Xenakis' string mass.
- **Design notes** button (top-right) reveals the full method.

## The see = hear weld

When the playhead crosses a generator, the line **flashes** and simultaneously sounds a glissando that glides from the pitch of its screen-**low** endpoint to its **high** endpoint (`linearRampToValueAtTime` portamento on a sawtooth → lowpass voice). Screen-Y maps to a lightly scale-snapped pitch (~2.6 octaves, major scale), so endpoints land consonant while the glide stays continuous. A bright **sweep-dot rides the line bottom→top in lock-step with the portamento** — you literally watch the pitch travel up the line as you hear it. The slope and length of the visible line *is* the glissando. That is the weld.

## References

- **Iannis Xenakis & Le Corbusier, Philips Pavilion**, Brussels Expo '58 — a shell of hyperbolic-paraboloid ruled surfaces derived directly from the string-glissando geometry of *Metastaseis*.
- **Xenakis, *Metastaseis*** (1953–54) — orchestral string glissandi as continuous ruled-line masses; the origin of the architecture↔music correspondence.
- **arXiv:2607.06589 (2026), *Extending Xenakis: From Architectural Geometry to Sonification of the Philips Pavilion*** — reconstructs the pavilion as ruled surfaces whose governing straight lines generate string glissandi. Ruledline ports that offline method into a live, hand-played browser instrument.
- **Ruled surface** (differential geometry): a surface with a straight line through every point; the hyperbolic paraboloid and conoid are the doubly/singly ruled cases used here.

## Design notes

- **Pure SVG, zero GPU.** Every generator is an `<line>`; directors are `<path>`; handles, sweep-dots and the playhead are `<circle>`/`<line>`. No canvas, no WebGL. All motion is `setAttribute` straight to the DOM inside one rAF loop.
- **Audio graph:** per generator, an `OscillatorNode` (sawtooth) → `BiquadFilterNode` (lowpass, gentle Q) → gain, with a frequency portamento over 0.36 s, a short attack and release. Polyphony capped at 10 voices with oldest-voice stealing. Master chain: input → dry + seeded `ConvolverNode` reverb (wet) → `DynamicsCompressorNode` limiter → master gain → destination.
- **Determinism:** all randomness runs through `mulberry32(0x6584)`; timing is `performance.now()` / `requestAnimationFrame`. No `Math.random`, `Date.now`, or argless `new Date()`.
- **Graceful degradation:** if `AudioContext` is unavailable the surface keeps moving and an on-brand `text-destructive` notice appears — no unhandled errors.
- **`prefers-reduced-motion`:** damps the auto-warp amplitude and slows the auto-sweep.
- **Teardown:** cancels rAF, stops/disconnects every audio node, closes the `AudioContext`, and removes all listeners on unmount. `touch-action: none` on the SVG.
- House style: violet/neutral only, semantic Tailwind tokens for all chrome, raw hex confined to the SVG art layer.

## Next-cycle deepening

- **Curved-vs-straight toggle** — let a generator itself bow (a conoid vs. hyperboloid choice), turning each glissando into a curved pitch contour.
- **Second director pair** to build a full closed shell (two ruled panels meeting at a ridge) and pan its two halves across the stereo field.
- **Bowed/arco timbre** — swap the sawtooth for a filtered noise + resonator bank so the cluster reads as real strings rather than synth.
- **Playhead as tape** — a wider read-head that sounds a *band* of generators at once with per-line amplitude falloff, closer to a scanning-synthesis read of the surface.
- **Density control** — drag to add/remove generators live (16↔28), trading a sparse chord for a dense glissando sheet.
- **Snap-strength dial** — from fully chromatic (raw *Metastaseis* microtonal glide) to hard-quantised.
- **Record-and-replay** — the seeded determinism makes a shareable performance seed straightforward.
