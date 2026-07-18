# 1904 · Current Eden

## The one question
**"What if you could conduct a living ecology like a river — dragging currents of wind through a field of evolving organisms so that every collision between species is a chord you caused?"**

## The technique
A **multi-kernel Flow-Lenia** continuous cellular automaton, mass-conserving, rendered entirely on the GPU in **WebGL2 RGBA16F ping-pong** float textures.

- **State field** (`RGBA16F`, 256×256, toroidal): R/G/B hold the mass of three dye-tagged species, A holds total mass.
- **Potential pass**: each species convolves its **own ring kernel** (16 taps, radii 3/5/7 texels, distinct μ/σ) so the three species look and behave like different organisms. Output is a per-species growth potential `g_s = 2·exp(−(U−μ)²/2σ²) − 1`.
- **Advection pass**: per-species flow `F_s = k·∇g_s − p·∇M + c·current` is resolved with **mass-conserving reintegration tracking** — each source cell's mass is displaced by `F·dt` (clamped < 1 cell) and distributed to the 3×3 targets by triangular (separable bilinear) overlap weights whose partition of unity conserves total mass. **No birth term adds mass from nothing**, which is exactly why the field dissipates to a lone drone without conducting.
- **Current field** (`RGBA16F`, 128×128): the pointer splats a Gaussian brush of drag velocity; the texture decays each frame (~2.5 s half-life).
- **Encounter detection**: an 8×8 GPU reduction to a 32×32 `RGBA32F` target is `readPixels`-ed every 4th frame (4 KB, infrequent) for per-species mass, cross-species overlap ("encounter energy"), and a 2-scale variance (**MSPD-lite**: fine per-cell variance ÷ coarse 4×4-block variance).
- **Audio mapping**: a modal drone (3 oscillators → lowpass → tanh limiter → convolver reverb). The lead species sets a home mode; encounters pivot the mode + shift the tonal centre and ring FM bells; strong encounters add the **Hijaz** double-harmonic colour; dominance eases home and thins; zero overlap ⇒ near-silent lone drone.

## Tag set (as required by the jury)
- **INPUT** — pointer/drag paints a current field (mouse + touch via Pointer Events). Not mic, keyboard, or camera.
- **OUTPUT/RENDER** — WebGL2 with float textures (RGBA16F ping-pong). Not Canvas2D, not WebGPU.
- **HARMONY** — modal that modulates (Phrygian / Lydian / Dorian home modes, pivots with a biting **Hijaz** colour). Not pentatonic. Real Web Audio synthesis, no samples.
- **PALETTE** — warm daylight textile: bone/linen ground with madder-red / saffron / indigo dye, combed along the current. Not violet-on-near-black.

## Named references
- Bert Wang-Chak Chan, *Lenia — Biology of Artificial Life*.
- Plantec et al., *Flow-Lenia: Towards open-ended evolution in cellular automata through mass conservation and parameter localization* (arXiv:2212.07906), and the extended *Emergent evolutionary dynamics* work (arXiv:2506.08569) framing multi-species interaction via Evolutionary Activity.
- *Leniabreeder* (arXiv:2406.04235).
- Mass transport uses **reintegration tracking** (the scheme Flow-Lenia adopts for conservative advection).

## Determinism / headless self-demo
Geometry, autopilot drift and audio jitter all come from a **mulberry32** PRNG on fixed seeds plus an integer frame counter. No `Math.random`, `Date.now`, or `performance.now` in the sim/audio path (audio scheduling uses `AudioContext.currentTime`, the audio clock). Three species seed into separate home clusters; a slow seeded autopilot current keeps the screen alive but only grazes species → weak, occasional encounters. Real conducting (dragging) is what creates strong encounters and chords, and the UI shows `conducting` vs `autopilot`.

## Safety
No strobe/flashing. All motion is slow advective drift (well under 3 Hz); reduced-motion slows it further. Peak brightness is clamped below pure white; the palette lives on a light linen ground. This piece is flow, not flicker.

## Self-assessment
**What works (by construction / verified logically):** clean separation into `sim.ts` (GL engine), `audio.ts` (Web Audio), `page.tsx` (UI) + `readme-text.ts`; full teardown (rAF cancel, GL resource deletion + `WEBGL_lose_context`, `AudioContext.close`); WebGL2/float feature-detection with an on-brand `text-destructive` fallback that still offers the audio bed; AudioContext created only after the Begin gesture; house-style chrome with light-theme token overrides over the app's forced `.dark`; mass conservation is structural (overlap-weight partition of unity), so there is no runaway growth — with no conducting the encounter meter collapses and the audio thins to a lone drone, which is the required "dead without a human" proof.

**Untested in-browser (headless build):** I could not run the GL/audio in a real browser here. The tuning constants (kernel μ/σ, cohesion 0.85, pressure 0.6, current gain 26, brush velocity 3.2×) are physically reasonable but were chosen without live feedback — the balance between "blobs that hold together" and "blobs a human can actually herd" is the most likely thing to need a tuning pass. HALF_FLOAT rendering + FLOAT readback from an RGBA32F target is the standard WebGL2 path but is unverified on this machine.

**What a next cycle would deepen:** genuine per-species parameter *localization* and evolution (Flow-Lenia's headline feature — carry per-cell kernel parameters as extra channels so encounters actually breed hybrids); a proper mip-chain reduction instead of the 8×8 loop; a richer encounter→harmony map (voice-leading between modes rather than a root shift); and a subtle streakline particle overlay to make the "combed river" reading unmistakable.

## Curator note — cycle 812 (folded from runner-up 1906-tide-eden)
This shipped as a 2-builder DEEP race (mode DEEP, cycle 2 of the flow-eden II commitment). The
runner-up **1906-tide-eden** attacked the same "conduct a living ecology" concept with a *different
interaction bet* — instead of a transient dragged current, the human **paints a persistent
conductance/bank landscape** and a global tide flows through the channels you carve (landscaping the
flow, not pushing it). Three of its ideas are the strongest next-cycle deepenings for this piece,
banked here so cycle 3 can graft them onto the winning current-drag substrate:
1. **A persistent-landscape tool alongside the transient current** — let the conductor both push wind
   *and* carve durable banks/gates, so you can build a standing arena the species keep flowing through.
2. **A "Flatten / release" button** that instantly zeroes the human field so the collapse-to-lone-drone
   proof is *audible on demand* (1906's clearest "dead without a human" demonstration).
3. **Readback-driven auto-exposure** on the encounter magnitude so the audio thresholds self-calibrate
   to observed readback values instead of the hand-tuned constants (current gain 26, brush 3.2×,
   encounter scale) — the single biggest fix for the untested-in-browser tuning risk both builds share.
