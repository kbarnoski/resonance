# Concept Jury Verdict — 2026-08-10

## Summary
Technically this is one of the stronger recent stretches — four of the last fifteen builds genuinely clear the ambition floor (handflux, astral, heliosong, mnemonic), and **no build sits in the 0–1 local-minimum bucket**. But the lab is quietly collapsing into a monoculture of *taste*, not of ambition: warm amber/ember/gold light on near-black, Karel's real piano as the source, and a GPU particle-field advected by curl-noise. The recipe is ambitious; the *look and feel* have stopped surprising.

## Diversity audit
- **Over-represented input:** `audio-file` (Karel's real piano) — **4×** (9016, 9128, 9368, 9464). `keyboard` 3×, `tilt` 2×, `mic` 2× are fine.
- **Over-represented output:** `WebGPU/GPU-render` — **8×** (8904, 8952-WebGL2, 9016, 9224, 9320, 9416, 9464, 9560); `inline-SVG` **4×** (9080, 9128, 9160, 9368).
- **Over-represented technique:** No single technique hits ≥4 — technique diversity is genuinely healthy. The nearest clusters are *physics/constraint simulation* ×3 (pendulum / cloth / tensegrity) and *curl-noise particle field* ×2 (astral, handflux). Hold this line; it's the one axis that's working.
- **Over-represented vibe:** `warm ember/amber/gold on near-black` — **~7×** (8856, 9016, 9224, 9304, 9320, 9368, + parchment-warm 8904/9160); a secondary `parchment/ink illuminated-manuscript` cluster **~4×** (8904, 9080, 9128, 9160); `cosmic indigo→violet` **~4×** (9304, 9464, 9512, 9560). Cool, harsh, clinical, or high-clash palettes are effectively extinct.
- **BANNED for next cycle:** `audio-file (Karel's-piano)` input · `WebGPU curl-noise particle-field` output · `warm ember/amber/gold-on-near-black` vibe · (soft ban) `major/minor-pentatonic` tuning, which is now near-universal.

## Ambition floor stats (last 15 prototypes)
- **Hit 0–1 criteria: 0** — genuinely nobody phoned it in this stretch. Good.
- **Hit 2–3 criteria: 11** — 8856(2), 8904(2), 8952(3), 9016(3), 9128(3), 9160(3), 9224(3), 9304(3), 9320(2), 9368(2), 9416(3). The fat middle: they clear the bar, but most clear it by exactly the same two rungs (≥3 subsystems + a named reference) and stop.
- **Hit 4–5 criteria: 4** — 9080(4), 9512(4), 9464(5), 9560(5). These are the ones to extend. Note they cluster in the most recent cycles **and** in the cosmic-GPU-particle vibe — the ambition and the monoculture are growing on the same branch.

## Standouts (positive)
- **9560-handflux** — 5/5. The first piece to map hand **velocity, not position** (grep-0 in every prior tracking piece), chained same-day off §1083 research. A fast downward strike *booms*; gentle stirring stays quiet. That single axis is what separates "wave at a theremin" from playing an instrument — a real new expressive primitive, not a reskin.
- **9464-astral** — 5/5. Makes the **ordered-dither veil the rendering *language*** of a whole piece (grep showed dither had only ever been buried anti-banding), over Karel's real recording, converging over minutes toward a tunnel-to-light. The rare case where the long-form arc actually earns "minute four ≠ minute zero."
- **9080-mnemonic** — the memory ribbon. Conceptually the richest build here: it *captures your motifs and draws them back transformed* (invert/augment/retrograde) as living notation, and proves inline-SVG can carry depth with **zero GPU**. Multi-cycle, Krumhansl key-finding, George Lewis / Robert Rowe lineage — cited, not name-dropped.
- **9128-rekindle** — the first real **in-browser neural net** (Spotify basic-pitch, TF.js) → transcription → functional reharmonization. Finally cashes the "AI pipeline / TensorFlow.js" menu item that had sat untouched. Ships the model as optional, degrades honestly.
- **8952-tensegrity** — a genuinely **new physical form** (grep-0 on snelson/prestress/tensegrity): drag one node and the globally-coupled prestress retunes the whole chord. Hand-written WebGL2, real named-reference spine (Snelson, Fuller, Schek, Skelton). Fresh mechanic, not a fresh skin.
- **9304-passage** — the lab's first true **audio-first** piece; brave enough to make the screen a near-blank bloom and put the entire payoff in HRTF spatialization. The screen-bias experiment the mandate keeps asking for.

## Pruning candidates (concept-level, NOT for deletion — immutability rule holds)
- **9368-afterglow** — beautiful, and squarely inside the frontier STATE.md itself flagged **saturated (§1071)**: Karel's-piano × warm dissolve × granular cloud × amber-SVG. It's the Nth "his recording erodes into warm memory." Nothing wrong with it; there's just no longer any *surprise* in the lane.
- **8856-pendulums** and **8904-billow** — the "physics toy → pentatonic voices → warm visual" template, twice. Doppler-pendulum-wave and billowing-cloth are the same recipe with a different solver. Competent, legible, and interchangeable at the concept level.
- **9320-morphochoir** — a gorgeous reaction-diffusion sim with the audio **bolted on**: eight fixed pentatonic probes, and by their own admission "the re-voicing is spatial, not modulating." The sim is the point; the choir is decoration. The audio needs to be *causal to* the morphology, not sampled from it.

## Provocations for tomorrow's dream cycle
1. **Kill the warm palette for a week.** Ember/amber/gold-on-near-black (or its parchment cousin) is ~7 of the last 15. Ban warm *and* cosmic-indigo. Force a palette that would look wrong next to everything else in the lab: Ikeda black-white-red, clinical high-key clean, or a deliberate high-chroma clash.
2. **Bench Karel's piano and the curl-noise particle field, together, for one cycle.** `audio-file×his-piano` is 4/15 and the `{his-piano × warm-dissolve/particle}` space is *explicitly flagged saturated* in STATE.md (§1071). astral + handflux (+ morphochoir, shadowhand) are all "GPU field of glowing points, curl-noise/RD advected, indigo→gold." Build one piece whose source is **neither him nor a synth pad** and whose visual is **not a particle field**.
3. **Zero embodied-room and zero multi-user in 15 cycles.** handflux is camera-hands but still one flat screen. Spend a cycle on a genuinely thin category: a **WebRTC shared listening/conducting room**, a depth-camera/projection spatial piece, or a real **MIDI/OSC-out** performance tool. The mandate's menu lists these; nothing has touched them.
4. **Nothing conceptual/critical has shipped.** The menu's boldest lane — an emptiness room, a regret song, a piece you can't hear without paying a cost — is grep-0 across the whole stretch. That's the direction most likely to break the aesthetic monoculture, because it isn't *about* being pretty.
5. **Ban pentatonic tuning for a cycle.** Major/minor-pentatonic is in pendulums, billow, tensegrity, morphochoir, formcanon, passage, handflux… it's the default that makes everything sound consonant-and-samey. Force microtonal, spectral/just-intonation, serial, or noise-pitched material and let it be a little uncomfortable.
6. **Extend, don't restart.** mnemonic (multi-cycle, claimed) and handflux (cycle-2 = per-finger vortices + duet) both wrote down their next passes. The 4–5-criteria builds are where depth compounds — pick ONE and ship its cycle 2 instead of minting a fifth cosmic drone.

## Karel-facing line
Strong week on the merits — four builds that actually clear the ambition bar — but the lab is drifting into one palette, one source, and one particle-field recipe; tomorrow needs to break the monoculture, not polish it.
