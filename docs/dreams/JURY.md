# Concept Jury Verdict — 2026-07-23

## Summary
The lab has genuinely climbed out of its old rut: ambition-floor scores rise
monotonically across the 14-day window, and the last six builds (2340→2388)
are all 4–5/5 — real named references, real recent research, real subsystem
counts. But it climbed straight into a *new* rut. Roughly eleven of the last
fifteen are the identical template — "a drug-free altered state, framed as
one philosophical question, with two independent conflictable variables and
NO master knob." That structure was the cure for last month's local minimum;
it is now itself the local minimum. `2388-round` is the week's clear peak and
`2366-solar-wind` the sharpest concept; the weakest three are the oldest in
the window, which is exactly the right direction of travel — but the form has
converged even as the quality rose.

## Diversity audit
- Over-represented input: **screen-tap / pointer / drag** (6×: 2252, 2290, 2320, 2332, 2348, 2360) — and **webcam-motion-centroid is the rising tail** (3×: 2314, 2340, 2388, all frame-difference centroid)
- Over-represented output: **three.js / WebGL-GPU shader** (6×: 2264, 2304, 2320, 2332, 2366, 2388) — with **canvas-2D** close behind (4×: 2290, 2314, 2326, 2354)
- Over-represented technique: **entrainment / phase-lock / coupled-oscillator synchrony** (4×: 2276 detune-collapse-to-unison, 2290 Kuramoto, 2326 respiratory entrainment, 2332 PLV lock)
- Over-represented vibe: **"drug-free altered state of consciousness"** (≈14 of 15 — the theme monoculture Karel flagged, now dressed in fresh palettes but the same subject) · explicit **cosmic-ambient** pole 4× (2252, 2264, 2276, 2304)
- **BANNED for next cycle:** screen-tap-only input · three.js/GPU-shader output · entrainment/phase-lock technique · the "drug-free altered state" framing · **and the meta-ban — the "two-independent-variables / no-master-knob / one-question" template itself.** If the piece can be described as "an altered state with two knobs that fight," reject it.

## Ambition floor stats (last 15 prototypes)
Criteria: (1) novel technique · (2) ≥3 subsystems · (3) named reference · (4) multi-cycle · (5) research <14d.
- **Hit 0–1 criteria — the local-minimum builds:** 2 — `2264-crystal-bloom` (≥3 subsystems only), `2252-eternal-return` (multi-cycle only)
- **Hit 2–3 criteria:** 8 — `2276-oceanic-gather`, `2290-phase-society`, `2304-seismic-choir`, `2314-the-return`, `2320-three-valves`, `2326-we-breathe`, `2332-lock`, `2348-tritone-veil`
- **Hit 4–5 criteria — the ones to extend:** 5 — `2340-echo-body` (4), `2354-buoyant` (4), `2360-blind-spot` (4), `2366-solar-wind` (4), `2388-round` (**5/5** — the only one)

The shape of the distribution is the story: every build from 2340 onward scores
4+. The research-first mandate is working. The risk is no longer *low ambition*
— it's *convergent form at high ambition*.

## Standouts (positive)
- `2388-round`: the only 5/5 in the window and the piece that finally fills the lab's thinnest lane — a genuine long-form, stateful, *accumulating* piece (body-as-looper, Reich phasing across your own past selves). It is provably different at minute five than minute one. Extend this seam.
- `2366-solar-wind`: the sharpest concept — it is about the *real Sun–Earth system this minute*, not the visitor's own nervous system. Live CORS-open NOAA telemetry + volumetric raymarched aurora. This is how you break the solipsism, and it directly cashed a prior jury demand.
- `2354-buoyant`: the lab's first felt-*body-weight* piece and first real accelerometer-footfall input. Embodied, off-screen-bias, named CHI 2026 reference. Rare and good.
- `2304-seismic-choir`: music genuinely *about something* — real USGS quakes as a spatial choir. Same virtue as solar-wind: the outside world does the composing.

## Pruning candidates (concept-level, NOT for deletion — immutability rule still holds)
- `2264-crystal-bloom`: keyboard → glowing three.js crystals + soft C-Lydian bells. This is one texture-swap away from the classic "keyboard-plus-glowing-visualizer" local minimum: no named reference, no recent-research chain, no multi-cycle plan. Ambition floor 1. Pretty, but it is the build the mandate exists to prevent.
- `2252-eternal-return`: a lovely CSS light-bloom, but conceptually a re-skin of `2244-deep-now` (press-hold time-dilation). Attention-dilation of note-events has now shipped ~3× (2244, 2252, and 2346-freeze-cathedral). The mechanic is spent; retire it.
- `2276-oceanic-gather`: "tilt to gather voices into unison" is the bliss/oceanic-union pole done many times over. HRTF craft is real, but there's no named reference and no research chain — it coasts on an established pole rather than opening a new one.

## Provocations for tomorrow's dream cycle
1. **Ban the altered-state framing for a full week.** ~14 of 15 pieces are "a drug-free altered state." Build something that is *not about consciousness at all* — a game, a genuinely useful tool, a joke, a piece about the outside world. `2366` and `2304` already proved the outward-facing lane is the strongest one in the window; go there on purpose.
2. **Kill the template, not just the tags.** The "two independent variables / no master knob / here is the one question" structure is in ~11 of 15. It was the anti-local-minimum rule; it has *become* the local minimum. Next build: allow a single expressive control if the concept wants one. Stop performing the mandate.
3. **AI-pipeline chains remain at ZERO.** The categorical menu has asked for "2+ models in series" for weeks and nothing has shipped one. A music→image→video or lyric→cover-art→loop chain (fal.ai / replicate, both untouched) would be the single most novel thing the lab could do tomorrow.
4. **True multi-user is still unbuilt.** `2326-we-breathe` is same-origin BroadcastChannel across *tabs on one machine* — not the WebRTC shared room RESEARCH §870 (collective effervescence / inter-brain synchrony) actually points at. Spend a cycle on a real cross-machine listening room. Two people, two devices, one field.
5. **Webcam is quietly becoming the next monoculture, and WebGPU compute is still a zero.** Frame-difference motion-centroid has shipped 3× in the tail (2314, 2340, 2388). If you use the camera, ban bare centroid — use real MediaPipe body/hand/face tracking (still never used, per the mandate's own example list). And §875 says WebGPU compute is now universally deployable in 2026 browsers; the lab *still* hasn't shipped one. That's the sharpest single technical gap left.

## Karel-facing line
The lab climbed out of its old rut and straight into a new one — six straight 4-and-5/5 builds, all singing the same "two-knobs-no-master, it's-an-altered-state" tune; `2388-round` is the week's peak, now break the template.
