# Concept Jury Verdict — 2026-08-02

## Summary
The ambition floor is not the problem anymore — it's genuinely holding (0 sub-floor
builds in the window, 5 of 15 at a real 4–5, every ambitious build research-chained).
The problem is that all that ambition is now aiming at **one target**. Nine of the last
fifteen are psychedelic / altered-states pieces, and nearly every ambitious one is the
*same recipe underneath*: **simulate a continuous field (erosion / fluid / reaction-diffusion /
wave / mass-spring / active-nematic / minimal-surface), render it on the GPU, sonify it, and
let the viewer drag on it.** The lab took the last jury's "psychedelic is fading — return to
it" and overcorrected into a psychedelic-neuroscience-field-sim gallery. It solved *range*
last window by accident and lost it again this window. High ceiling, collapsing spread.

## Diversity audit
- Over-represented input: **pointer / touch drag** (5× — `4776`, `4952`, `5000`, `5224`,
  `5304`; the "drag on the GPU field" gesture)
- Over-represented output: **three.js** (4× — `4728`, `4808`, `5224`, `5304`) **and WebGL2/
  WebGL2-shader** (4× — `4904`, `5000`, `5096`, `5160`). Combined GPU-raster (three.js +
  WebGL2 + WebGPU) is **9 of 15** — inline-SVG/DOM has fallen to 3 and Canvas2D to 3.
- Over-represented technique: **"simulated continuous PDE/physics field, sonified"** (≈9× —
  `4776` erosion, `4856` wave-field, `4904` criticality field, `4952` erosion, `5000` mass-spring,
  `5160` fluid dye, `5224` active-nematic, `5272` reaction-diffusion, `5304` TPMS geometry).
  No single named algorithm hits 4, but the *meta-move* — a field that ripples and you listen
  to it — is now the house style.
- Over-represented vibe: **psychedelic / altered-states** (9× — `4808`, `4904`, `5000`,
  `5048`, `5096`, `5160`, `5224`, `5272`, `5304`; the last nine shipped are almost wall-to-wall
  altered-states). Sub-pattern: **"literalize a neuroscience-of-consciousness paper as a field"**
  (`4808` DiscoForcing, `4904` DMT-criticality, `5224` DMT-entities, `5272` REBUS, `5304` jhāna
  fMRI) is its own repeating template — 5 builds citing brain papers to justify a shader.
- **BANNED for next cycle:** pointer/touch-drag input · three.js output · WebGL2/WebGL2-shader
  output · field-sim-as-instrument technique (any "ripple a continuous field and sonify it") ·
  psychedelic/altered-states vibe. A dragged, GPU-field, brain-paper altered-state is this
  window's local minimum. Do not mint another.

## Ambition floor stats (last 15 prototypes)
- **Hit 0–1 criteria: 0.** No local-minimum builds this window — a genuine improvement.
- **Hit 2–3 criteria: 10** — `4616`, `4680`, `4808`, `4856`, `4904`, `4952`, `5000`, `5096`,
  `5160`, `5272`. (Most clear the floor on ≥3-subsystems + named-ref + fresh-research; the
  weakness is novelty, not effort — many are extensions or re-scaffolds.)
- **Hit 4–5 criteria: 5** — `4776-contour` (5/5: first hydraulic-erosion sim + ≥3 subsystems +
  named refs + multi-cycle shared engine + fresh research), `4728-rubato` (4/5), `5048-narthex`
  (4/5), `5224-covenant` (4/5), `5304-formless` (4/5). **These are the ones to extend, and to
  learn *range* from — note that the two best (`5224`, `5048`) are the two that broke the
  field-sim/psychedelic mold hardest.**

## Standouts (positive)
- `5224-covenant`: the window's peak. **The only genuinely new technique here** — a real
  active-nematic director field with honest ±½ topological-defect *detection and tracking*, and
  the golden three-defect braid is a state actually detected from the tracked data, not scripted.
  Reframing "DMT entities" as real self-propelled physics is the rare build where the mechanic
  and the concept are the same object. This is what "borrow a NAMED reference" (Sanchez/Dogic,
  arXiv:2503.10880) is supposed to produce.
- `5048-narthex`: the closest the lab has ever come to the installation/room lane it perpetually
  banks and never builds — a real full-sphere HRTF choir with a head-tracked `AudioListener` and
  a *procedurally-synthesised* convolution IR (no sample file). Cardiff's *Forty Part Motet* as
  the ref is earned. Different subsystem set from everything around it.
- `5304-formless`: chose the **buildable** form of a hard idea — a real marching-cubes minimal-
  surface mesh that renders on a phone, instead of banking yet another raymarch/WebGPU sibling
  that waits forever for a real-GPU review. The segregated→integrated drone maps the fMRI finding
  honestly. Fresh <14-day research (arXiv:2607.23437) actually implemented.
- `4728-rubato`: the rarest thing in the window — an accompanist that breathes with your rubato
  via a Large & Jones attending oscillator, no score/click/model. Musical stakes, not moral or
  neurological ones. The lab needs more of *this* register, not less.
- `4776-contour`: still the erosion peak, and its `_shared/erosion/engine.ts` is the one piece
  of genuine reusable infrastructure the window produced (`4952-confluence` built on it cleanly).

## Pruning candidates (concept-level, NOT for deletion — immutability rule still holds)
- `5160-datapigment`: **a re-scaffold of `4264-lucent`** — identical file layout
  (`analysis.ts` · `deposit.ts` · `gl.ts` · `rng.ts` · `synth.ts` · `page.tsx`), same verb
  ("Karel's real piano paints a WebGL2 flow-field with long memory"), which `4264` already did
  and a prior jury already praised. The Anadol "data as pigment" framing is a fresh coat of
  paint on an existing car. This is the window's clearest local-minimum repeat.
- `5096-theurgy`: the weakest of the psychedelic run — MediaPipe hands (used before in `1051`,
  `3880`) driving a generic domain-warp kaleidoscope plasma, refs thin (a hand-tracking how-to +
  Klüver), and the README itself lists the rough edges (unstable hand indexing, mirrored
  fingertips). Hands-as-forces-in-a-shader is inventory now.
- `4904-criticality` + `5272-rebus` as a pair: both are "mic FFT drives a field across a
  psychedelic threshold, drone decoheres/recoheres, just-intoned consonance rewards the peak."
  Individually fine; together they're the same neuroscience-literalization template twice, and
  they sit inside the 5-build brain-paper cluster that is itself the concept-level rut.

## Provocations for tomorrow's dream cycle
- **Ban altered-states for a cycle — you overcorrected.** Last jury said psychedelic was fading;
  the answer was NOT to make 9 of 15 psychedelic. Force one build with no ego-dissolution, no
  boundlessness, no brain paper. The lab literalized five consciousness papers as fields in one
  window — that's a genre now, not a direction.
- **Kill the field-sim reflex for a cycle.** "Simulate a continuous field, render it on the GPU,
  sonify it, drag on it" is the new house style (≈9 of 15). Build something whose core is NOT a
  rippling continuous medium — a discrete/symbolic/agentic/score-based piece. `4680-concord`
  (a partner that can *refuse*) and `4728-rubato` (an oscillator that *tracks* you) are the shape
  of the escape hatch: interaction logic, not PDE integration.
- **Cash a starved input.** Pointer-drag is 5×, camera 2×, but **MIDI/MPE shipped exactly once
  (`4616-pressing`) and it was a standout**, tilt is only ever a secondary fallback, and real
  external-data shipped once (`4856`). Build a MIDI-*primary* piece, or a real second sensor —
  not a fourth thing you drag your finger across a shader.
- **Extend `5048-narthex` into the actual room.** It is the nearest the lab has gotten to the
  two-device WebRTC / depth-camera installation the jury has named for ~10 cycles and never built.
  You have a working HRTF-spatial spine now — either put it in a real shared/embodied room this
  week or admit the installation lane is dead and stop banking it.
- **If you touch Karel's piano again, change the verb.** `5160` and `4264` both "paint it into a
  fluid." Do score-following, or a duet, or a structural analysis — anything but a third flow-field.
- **Standing yes/no for Karel (stop re-queuing it):** the AI-pipeline chain (music→image→video)
  has been "queued next" for ~16 cycles and every jury. Fund `FAL_KEY` and build it, or strike it
  permanently. A perpetually-banked idea is a lie the ledger tells itself.

## Karel-facing line
Ambition's fine — range isn't: 9 of the last 15 are psychedelic altered-states and nearly every
one is "simulate a field, sonify it, drag on it"; `5224-covenant` (DMT beings as real physics)
and `5048-narthex` (a genuine spatial-audio room) are the jewels — now get the lab off
psychedelic-field-sims for a cycle.
