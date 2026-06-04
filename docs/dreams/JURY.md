# Concept Jury Verdict — 2026-06-04 (UTC)

## Summary
Yesterday's verdict asked for two things — *ship the spatial/non-screen breadth you've
banked* and *stop shipping orphans* — and the lab delivered both: `308-orbit-choir` is the
first build in 300+ whose output is **not a screen**, and the multi-cycle threads
(`291-harmonograph` cycle 3, `302-mirror-canon-round` cycle 2) finally make criterion #4 real
after it had never once been claimed. That's genuine progress. But the **kids lane has
collapsed into a single recipe** — a fresh phone sensor wired to a no-fail modal soundscape,
shipped five fires running (293 → 295 → 298 → 303 → 306) — and last week's ban on three.js
didn't diversify the output, it **relocated the monoculture to raw-WebGL2 fragment shaders
(7 of 15).** The floor is still cleared by swapping the *sensor* and the *technique label*
while the *experience* barely moves.

## Diversity audit
- **Over-represented input:** phone motion/orientation sensor — **4×** (290 heading · 303 tilt · 306 shake · 308 heading). Touch (3×) and camera/body (3×) sit just under the line.
- **Over-represented output:** raw WebGL/WebGL2 fragment-shader screen viz — **7×** (284, 285, 293, 295, 298, 303, 306). Matte Canvas2D adds 3× (280, 287, 302). **Net: 13 of 15 output to a screen.** Banning three.js last week didn't break the screen-viz habit — it just moved it to hand-rolled shaders.
- **Over-represented technique:** **none ≥4** — this is the genuinely healthy axis. Physical-modeling (284 membrane · 286 soft-body · 303 Verlet = 3×) is the closest cluster. Technique-shopping is working; the problem is everything downstream of it converging.
- **Over-represented vibe:** **kids — 9×** (280, 284, 286, 290, 293, 295, 298, 303, 306). Structural via the every-other rotation, but 60% is high, and the *form inside it* has flattened (see pruning).
- **BANNED for next cycle:** **raw-WebGL2-fragment-shader OUTPUT · phone-motion/orientation INPUT · the "new-sensor → always-musical modal noodle" KIDS FORM · C-major-pentatonic.** Whatever ships next must not be a sensor-driven, no-fail modal soundscape painted by a single full-screen shader.

## Ambition floor stats (last 15 prototypes)
- **Hit 0–1 criteria: 2** — `284-kids-thunder-drum`, `303-kids-wind-harp`. Both are single-instrument touch/tilt toys: one real novelty (membrane modal synth / Verlet rope) bolted to a thin "instrument-type" reference (a drum's Bessel modes; an Aeolian harp). These are the local-minimum builds.
- **Hit 2–3 criteria: 7** — 280, 290, 293, 295, 298, 302, 306. The lab's center of mass: a real subsystem count + a citable reference, but rarely the novel-technique-AND-depth combination.
- **Hit 4–5 criteria: 6** — 283, 285, 286, 287, 291, 308. These are the ones to extend, not re-spawn.
- **Still zero 5/5 builds.** But criterion #4 (multi-cycle) was finally claimed for real this fortnight (291 reached cycle 3; 302 reached cycle 2) — the single biggest improvement over last jury, where it had never been claimed in 15.

## Standouts (positive)
- **308-orbit-choir**: the verdict's headline. First HRTF spatial output, first DeviceOrientation-as-*listener-rotation*, and the first build in 300+ whose output is **not a screen**. It also fills the long-form/stateful gap (different at minute 6 than minute 0). This is what "massively bigger" looks like — discharges three standing provocations at once.
- **287-mirror-choir**: still the reference standout — body-as-instrument that earns "I didn't know we could do that," and it seeded the lab's *second* real multi-cycle thread (302).
- **291-harmonograph**: the proof the lab can deepen. Three cycles (birth → expressive → polychrome + SVG export) on one playable instrument; the only piece you genuinely *play* rather than watch react.
- **285-mosaic-listener**: conceptually the sharpest adult piece — concatenative re-assembly of a recording you navigate by hand. "Made of the original but never is the original" is a real idea, not a label.

## Pruning candidates (concept-level — immutability rule still holds, nothing is deleted)
- **303-kids-wind-harp** & **306-kids-rain-shaker**: textbook examples of the local minimum. Each claims a fresh sensor (tilt, accelerometer) and a fresh DSP label (Verlet, shake-energy) but delivers the *same* experience — wave a phone, hear a forgiving D-Dorian/pentatonic wash that can't be played wrong and remembers nothing. The sensor changed; the piece didn't.
- **293-kids-sky-band**: strong idea (the real sky scores it) undercut by **reverting to C-major pentatonic** — the exact rut the prior jury banned. The novelty is the input; the sound is the default.
- **284-kids-thunder-drum**: a genuine first (membrane modal synth) trapped in a 2-subsystem touch toy. The physics deserved a bigger frame than "tap the screen."

## Provocations for tomorrow's dream cycle
1. **Deepen 308 with Karel's real *Welcome Home* piano stems — do NOT ship a sixth sensor-noodle.** The non-screen spatial thread is the freshest thing the lab owns and the README already specs it (real stems + haptics + localStorage persistence). The standing "use his actual music" directive has *never* reached the spatial layer. That's the next adult build.
2. **Break the kids recipe.** Five straight kids fires are "new sensor → no-fail modal bed." Ban that form for one kids cycle: build a kids piece with **memory or consequence** — the child can make something *wrong* and fix it, or what they did persists and grows (298-echo-friend already pointed this way; nothing followed it). Stop shipping sensor swaps.
3. **Real-world-data sonification has exactly one entry (293) and it's kids+pentatonic.** RESEARCH §289 logged a live earthquake/seismic sonification finding that nothing has built on. Spend an adult cycle composing from the live planet — the empty shelf the lab keeps walking past.
4. **Zero AI-pipeline-chain prototypes in the last 15, despite it being Karel's explicit standing directive (AI image gen *embedded* in an AV piece).** RESEARCH §285 logged real-time audio-conditioned image generation on 2026-06-02 and nothing touched it. This is the most-wanted, least-served axis.
5. **The research dives have gone honest-but-hollow.** Six of the last ~ten dives concluded "this week's cs.SD is all generative audio, not interaction" and fell back on foundational refs (§297, §299, §301, §302, §303, §304). Either *build on* the generative-audio frontier you keep finding (audio-conditioned diffusion, LiveBand) — which would also satisfy #4 — or stop forcing a daily <30-day novelty claim and just call it a path-(b) dive. The freshness mandate is manufacturing ritual, not surprise.

## Karel-facing line
Strong at the edges — `308-orbit-choir` finally breaks the screen and the multi-cycle threads are holding — but the kids lane has shipped the same no-fail modal noodle through five different sensors; tomorrow, deepen the spatial piece with your real piano, don't build a sixth shaker.
