# Concept Jury Verdict — 2026-06-26 (UTC)

## Summary
The best **execution-diversity** window in months — the field obeyed last jury's
hardest asks almost to the letter. three.js is *dead* (7×→1×), WebGPU is now the
house renderer (6×), and **real harmony came roaring back on BOTH sides**: the
adult Tonnetz room (942), the kids voice-leading choir (941), the two-kid I–IV–V–vi
conductor (950) and the V→I firefly (957) make the "pitch held deliberately dumb"
boilerplate from two weeks ago look like a phase we grew out of. Technique
diversity is genuinely high — Kuramoto, differential growth, real friction physics,
maqam microtones, oscilloscope vector-synth, neo-Riemannian voice-leading all in
one fortnight, none repeating. The catch is the same shape it always is: as one rut
closes, two open. **Pointer-drag-on-glass is back to ~7× as the input reflex**, the
"**ship a GPU sim, pulse a bell off it**" move quietly became the new adult default
(4×), pentatonic-no-wrong-notes crept back as the kids safety harmony, and the
verification debt the last two juries flagged is *worse* — **15 of 15 are still
machine-unverified**, every README closing with the identical EMFILE/no-GPU
disclaimer.

## Diversity audit
- **Over-represented input: pointer/touch-drag-on-glass — 7× (941, 946, 953, 954, 957, 960, 965)** + drag-secondary on 932. Last window the jury *praised* the sensor spread (depth, shake, data, MIDI, tilt all appeared); it's collapsing back to a finger on glass. tilt holds at 3× (932, 950, 964); shake/data/depth/MIDI/none are 1× each — the interesting sensors are each one-offs that nothing extends.
- **Over-represented output: raw GPU shader (no library) — 11× (WebGPU/WGSL 6×: 932, 941, 942, 947, 950, 954; raw WebGL2 5×: 939, 946, 957, 960, 965).** This is the *correction working* — three.js fell to 1× (935, the lone holdout) exactly as asked. Credit where due. But WebGPU at 6× is already the next candidate-monoculture, and Canvas2D (952, 953, 964) is healthy and earns its place — keep it legitimate, don't ban it back.
- **Over-represented technique: the "GPU physics sim → sonify it" move — 4× (932 N-body, 953 magnetic-field, 954 Kuramoto, 964 differential-growth).** No *named* technique repeats ≥4× — diversity is real — but this *meta-pattern* (run a gorgeous simulation, read a pitch off it) has become the reliable adult/kids gesture, the way granular was last window.
- **Over-represented vibe: kids 7× (structural, every-other rotation — not a fault) + cosmic/bioluminescent-glow on the adult side 4× (932, 939, 942, 954).** The dark-nebula/aurora/phase-field adult look persists; 952 (ink-and-gold), 947 (clinical Ikeda), 960 (glass luminescence), 965 (CRT green) prove it's escapable. **Plus a harmony tic: pentatonic-no-wrong-notes is back as the kids crutch — 3 strict (946, 953, 964) + 935/960 lean on it.**
- **BANNED for next cycle: pointer/touch-drag-as-primary-input · cosmic/bioluminescent-glow adult vibe · pentatonic-no-wrong-notes kids harmony · the "ship-a-GPU-sim-and-pulse-a-bell-off-it" pattern.** (WebGPU/WebGL2 explicitly NOT banned — the correction is healthy; just don't let WebGPU become the next 7×.)

## Ambition floor stats (last 15 prototypes)
- **Hit 0–1 criteria: 0** — zero local-minimum builds. The floor is holding.
- **Hit 2–3 criteria: 5** — 935 (3), 946 (3), 950 (3), 953 (3), 957 (3). All five are kids-side; the kids lane is carrying the lighter builds.
- **Hit 4–5 criteria: 10** — 932, 939, 941, 947, 954, 960, 964, 965 (each 4) + **942 (5) and 952 (5)**. Two-thirds of the window clears 4/5, and criterion #5 (in-README dated research) is near-universal again.

## Standouts (positive)
- **942-depth-harmonic-room**: the verdict's high-water mark. It takes last jury's open ask #4 — "develop the depth-camera opener into a walk-through instrument" — and *does it*: Depth Anything V2 on WebGPU + a neo-Riemannian Tonnetz where your body position walks parsimonious P/L/R triad transforms with real voice-leading. Depth-camera AND real harmony in one build. 5/5.
- **952-maqam-calligraphy**: the bravest concept. Autonomous 5.5-minute long-form taqsim in *exact microtonal cents* (never snapped to 12-TET), driven by a sayr state machine, rendered as calligraphic brushstrokes. No on-glass input, no cosmic glow, no pentatonic — it dodges every monoculture at once and fills a real cultural-tooling gap. 5/5.
- **960-cristal-friction**: the direct answer to "granular is comfort food." A real stick-slip LuGre friction model solved per-sample in an AudioWorklet, coupled to a modal resonator bank — the *timbre is physics*, not a sample or a grain cloud. The bowed-glass register is genuinely new.
- **947-overtone-loom**: the lone clinical/Ikeda build, and it earns it — a live Sethares/Plomp-Levelt dissonance field that *proves* consonance comes from the spectrum, not abstract ratios. Uses MIDI (the 1× sensor). Intellectually the most honest piece here.
- **957-kids-come-home**: the kids-side answer to "make music from PITCH again." A V→I cadence as a one-finger toy — drag the firefly into the leading-tone's tremble, let go, it swoops home on a resolved chord. Only 3/5 on the floor, but conceptually it's exactly the move the last jury begged for.

## Pruning candidates (concept-level, NOT for deletion — immutability rule still holds)
- **953-kids-iron-garden**: the cleanest example of the kids comfort formula — multi-touch drag + C-pentatonic-no-wrong-notes + always-on drone + bloom-on-proximity. The iron-filing field viz is lovely, but the *instrument* underneath is the lab's Nth "drag glowing things, pentatonic chords bloom." Missing: a recent-research cite (#5 absent) and a genuinely new technique.
- **946-kids-bird-round**: melodic-contour-into-canon is a nice idea, but the realization is drag-to-draw-a-melody + C-pentatonic + WebGL2 glow — three things the lab has done many times. No #5 research anchor; the canon scheduler is the only fresh part.
- **935-kids-shake-critters**: PhISEM stochastic-shaker synthesis is a legitimate technique, but the build is "shake → rattle band, three.js glow, no melody" — the timbre-rhythm-only kids move *and* the lone three.js straggler. Local-minimum on harmony (it has none) and on renderer (the banned library).

## Provocations for tomorrow's dream cycle
1. **Pentatonic-no-wrong-notes is the new kids crutch — ban it for a week.** You just *proved* on the adult side (941 voice-leading, 950 I–IV–V–vi, 957 V→I) that a child can hold real harmony in one finger. If a kid touches the next build, give them a real mode, a functional progression, or genuine tension/resolution — not the can't-be-wrong scale.
2. **Kill the "ship-a-GPU-sim-and-pulse-a-bell-off-it" reflex (4× this window).** Next adult build, make the *sound* the primary object the way 960 (friction) and 965 (oscilloscope) did — the simulation should be the instrument's resonating *body*, not a screensaver you read a pitch off of.
3. **Force a non-pointer input.** Drag-on-glass is back to 7×; the sensor spread the last jury praised is decaying into one-offs. The richest open thread is 942 — push the depth-room into a *multi-zone* spatial instrument you physically walk through. Or build the adult MIDI/desk-controller piece (MIDI is 1×, only 947). Embodied-spatial, not a finger.
4. **Verification debt is now the #1 liability — two juries and counting.** 15/15 build-green, 0/15 ever heard or seen running; every README ends with the same EMFILE/no-GPU sandbox disclaimer. We are stacking a fortnight of untested surface area. Spend a cycle on the infra fix, or hand-verify the three strongest (942, 952, 960) on a real device, before shipping a 16th unheard prototype.
5. **The adult-cosmic-glow look is still the default (4×).** 952's ink-and-gold, 947's clinical lab, 960's glass, 965's CRT green show the adult side can look like *anything* else. Keep choosing a register that isn't a dark nebula.

## Karel-facing line
The lab did everything you asked two weeks ago — three.js is dead, WebGPU is the new default, and real harmony came back hard on both adult AND kids sides — so today's note is about the *next* ruts, not the old ones: pointer-drag is back to 7×, "ship-a-sim-and-pulse-a-bell" is the new adult reflex, pentatonic crept back for kids, and **15 of 15 builds are still machine-unverified** — but 942 (a depth-camera you walk through a harmony lattice) and 952 (a 5½-minute autonomous maqam improvisation in true microtones) are the two to actually open.
