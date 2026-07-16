# 1766 · Ganzfeld Ascent

**The one question:** *What if holding perfectly still let your own visual cortex — and the screen — accrete neural noise UP a hallucination hierarchy, from phosphene dots → cobweb / lattice form-constants → proto-faces?*

A dim, near-uniform violet-grey luminance field — a **Ganzfeld**. Over it runs a persistent WebGPU compute substrate that mirrors the real Ganzfeld / Ganzflicker phenomenology. The core mechanic is a **stillness accumulator**: while you hold still, a `complexity` value climbs, and the field organizes itself up a content hierarchy. Move, and the trance breaks.

## The hierarchy (driven by `complexity` 0→1)

- **0.00–0.33 — Dots.** Isotropic fine phosphene grain / floaters, barely above uniform. Sparse specks twinkle in and fade.
- **0.33–0.66 — Cobwebs / lattice.** The noise organizes into oriented filaments: the reaction-diffusion activator support bends along a fixed swirling orientation field, so the grain elongates into cracked-glass / honeycomb form-constants.
- **0.66–1.00 — Faces.** The field is folded with bilateral (mirror-x) symmetry as complexity rises, and two slow symmetric dark attractor wells (eye-like) plus one (mouth-like) inside a broad face oval gravity-pull the accreted structure. It reads as a proto-face emerging from the grain (pareidolia) — not a literal photo.

## The stillness mechanic (the soul of the piece)

`page.tsx` listens to `pointermove` and `deviceorientation`. Any motion above a small threshold tops up a decaying "recent motion" energy; while it stays near zero, `complexity` climbs slowly toward 1 (asymmetric: **slow climb, fast fall**). Motion knocks `complexity` back down fast — the reset is tuned to feel like you disturbed something delicate. Because complexity also drives a complexity-dependent decay in the compute step, the accreted lattice/face structure literally *melts back to grain* when you move.

An **autopilot** engages after ~9 s of no interaction and gently self-drives the ascent (climb, then a slow tour of the upper stages), so a reviewer who never holds still still sees dots → cobwebs → faces happen on its own. The piece is never dead on screen.

## The WebGPU-compute technique

The whole reason this is a compute piece and not a fragment shader: a **persistent 2D structure field** in GPU **storage buffers** carried across frames. Per frame (`gpu.ts`):

1. **INJECT** compute pass — seed spatial neural noise: sparse twinkling phosphene specks + a faint fine grain, hashed from integer `(x, y, frame)`. This raw material is constant across stages; what changes is how it organizes.
2. **STEP** compute pass — an anisotropic reaction-diffusion move. An isotropic center-surround (short-range activator minus wider inhibitor) concentrates grain into structure at one scale (dots). As `complexity` rises the activator support cross-fades to a **directional** average along a fixed swirling orientation field (cobweb filaments), then a **bilateral mirror-x fold** plus symmetric attractor wells emerge (faces). Two field buffers **ping-pong**.
3. **RENDER** pass — a full-viewport triangle samples the field onto a dim near-uniform violet-grey Ganzfeld with faint emergent structure and a soft vignette. Brightness is **hard-clamped ≤ 0.7**.

Graceful fallback mirrors the lab reference (`1758-boundless-wave/gpu.ts`): if `navigator.gpu` or the adapter is missing, `initGanzfeldGpu` returns `null`, and `page.tsx` shows a clean on-brand notice plus a layered DOM Ganzfeld (glow → lattice → face) that still climbs the same ascent, while the audio bed keeps playing.

## The sound (`audio.ts`)

A self-contained Web Audio cosmic-ambient bed: a soft detuned pad (JI-ish low drone) through a lowpass and a synthesized (deterministic-IR) reverb, behind a limiter at calm gain (~0.4). The hypnagogic signature is a **~6 Hz theta-band amplitude modulation** — an LFO on a gain node. This is *audio* amplitude modulation, **not** visual flicker, so it's safe, and it's the sonic analog of hypnagogic theta rhythm. As `complexity` climbs, the filter opens, a faint higher shimmer fades in, the reverb wettens and the theta deepens — the ear hears the ascent too. Audio start is gated behind the first click (`audioContext.resume()`).

## Safety stance

This is the **Dreamachine lineage deliberately de-fanged**. NO alpha-band (8–12 Hz) visual flicker — that is the photosensitive-epilepsy zone. The only luminance change is a slow ~0.06 Hz drift (well under 3 Hz), and brightness is hard-clamped ≤ 0.7 in the shader (no white-out). `prefers-reduced-motion` (via `_shared/psych/safeFlicker`) softens the climb rate, weakens the attractors and flattens the drift. All animation is driven by an integer frame counter + hash noise — no `Math.random` / `Date` / `performance.now` in the field/state path.

## Named references

- **"From dots to faces: individual differences in visual imagery capacity predict the content of Ganzflicker-induced hallucinations"** — *Neuroscience of Consciousness* 2026 (article niag016; arXiv:2507.09011). The hallucination-content hierarchy (dots → cobwebs → faces) this ascent renders.
- **The Ganzfeld effect** — a uniform sensory field leads the brain to amplify its own neural noise into imagery.
- **Dreamachine** — Brion Gysin, 1959 / Collective Act, 2022. The flicker-hallucination lineage — noted here as the ancestor deliberately de-fanged for safety (no alpha flicker).

## Next-cycle deepening

- **Gaze-holding as a second axis:** use a front camera (opt-in) to detect micro-saccade stillness, so *eye* stillness — not just pointer stillness — feeds the accumulator, closer to true Ganzfeld fixation.
- **Imagery-capacity personalization:** the paper's finding is that aphantasics tend to plateau at dots/cobwebs while strong visualizers reach faces. A short pre-roll self-report could bias each viewer's reachable ceiling, making the ascent a gentle phantasia probe.
- **Richer form-constants:** add the other Klüver constants (tunnels, spirals) as intermediate attractor topologies between cobwebs and faces, selected by a slow-drifting orientation-field mode.
- **True Gray-Scott mode:** an opt-in substrate swap to a genuine Turing reaction-diffusion for the cobweb stage, for reviewers who want the labyrinthine transient rather than the controllable anisotropic-blur approximation.
