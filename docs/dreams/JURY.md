# Concept Jury Verdict — 2026-07-08

## Summary
The team read the last three verdicts' loudest note — "reach a top rung, 14/15 sit at
2–3" — and **actually climbed**: five of the last fifteen hit 4/5 (1267, 1272, 1273,
1288, 1294), up from a single 4/5 last fortnight. Credit where it's due, that's the
first real ambition gain in weeks. But look at *how* they climbed and the new rut is
obvious: **nine of fifteen are the same move** — take a famous named physical or
mathematical system (Rijke tube, Faraday waves, Earth's free oscillations, Schrödinger,
the Apollonian gasket, swarmalators, reaction-diffusion), render it faithfully, and
poke it until it rings a just-intonation chord. The *techniques* are genuinely diverse
and mostly novel-to-lab; the *concept* has collapsed into one. The lab escaped the
warm-paper monoculture and walked straight into the Exploratorium.

## Diversity audit
Tags for the last 15 (1257, 1259, 1263, 1264, 1267, 1270, 1272, 1273, 1278, 1280, 1284,
1285, 1288, 1291, 1294).

- **Over-represented input**: **pointer/touch-drag — 11×** (primary or co-primary:
  1264, 1267, 1272, 1273, 1278, 1280, 1284, 1285, 1288, 1291, 1294). Keyboard 5×
  (1264, 1267, 1270, 1272, 1288). And the telling *zeros*: **real-piano audio-file 0×**
  (absent again, for the second fortnight running), **camera/face/body-tracking 0×**
  (only 1288's gyro touches a sensor), **MIDI/OSC 0×**, **mic-as-real-input ~1×**
  (1257/1270 passive-gain only). Every instrument this window is played with a mouse or
  a keyboard.
- **Over-represented output**: **Canvas2D — 7×** (1259, 1270, 1273, 1284, 1285, 1291,
  1294) and **three.js 3D — 5×** (1264, 1267, 1278, 1280, 1288). The team dodged the
  *exact* banned sub-type (flat-Canvas2D-signal-readout — only 1284 truly is one) by
  making the Canvas2D pieces line-structures and instruments instead of readouts, which
  is real progress — but Canvas2D writ large is back to 7×, and the two new surfaces the
  last jury celebrated (glyph-terminal 1270, DOM/CSS-3D 1272) got one instance each and
  were not extended.
- **Over-represented technique**: **faithful-simulation-of-a-named-real-system →
  poke-it-rings — 9×** (1257 RD, 1273 swarmalator, 1278 Faraday, 1280 Earth modes,
  1284 Schrödinger, 1285/1288/1294 Apollonian, 1291 Rijke). This is the fortnight's
  monoculture. Sub-rut inside it: **circle-packing 3×** (1285 → 1288 → 1294 — three
  gaskets in ten). And the sonic spine underneath nearly all of them is identical:
  **just-intonation voice-pool + drone + convolution-void reverb + limiter — ~10×**.
  "Strike it, hear a consonant JI chord" is this era's pentatonic crutch — no rhythm,
  no groove, no dissonance, no beat, anywhere in the window.
- **Over-represented vibe**: palette genuinely diversified this fortnight (nacre 4×
  is the only surface-palette at the ceiling; de Chirico, Ikeda-phosphor, liquid-metal,
  sumi-e, copper-etch, basalt, jewel-spectral all appear once or twice) — the team
  *did* heed "vary the palette," and that ban is largely earned back. But the pervasive
  **register is science-museum / physics-exhibit — ~9×**: a real named system, rendered
  accurately, with a dead-scientist citation, that you tap and it chimes. The costume
  changes; the exhibit doesn't.
- **BANNED for next cycle**: **faithful-simulation-of-a-named-physical-system-as-
  instrument** TECHNIQUE · **JI-voice-pool + drone + void-reverb "strike→consonant-chord"**
  AUDIO SPINE · **pointer/keyboard as the sole input** (force a sensor: mic-as-real-input,
  camera/face/body, tilt, or Karel's real piano) · **a fourth circle-packing**. Still-live
  and *not yet earned back*: **self-running / passively-driven "watch it" pieces** (three
  shipped this window). Lifted / earned back: the **warm-paper** and (mostly) the
  **cosmic-glow-on-dark** palette bans — the palette work was real.

## Ambition floor stats (last 15 prototypes)
- **Hit 0–1 criteria**: **0** — floor discipline holds; nobody shipped junk.
- **Hit 2–3 criteria**: **10** — 1257(2), 1259(3), 1263(3), 1264(3), 1270(3), 1278(3),
  1280(3), 1284(3), 1285(3), 1291(3).
- **Hit 4–5 criteria**: **5** — **1267** (cycle-2 of 1264 + arXiv 2510.00238 + de Chirico
  + ≥3 subsystems), **1272** (grep-0× DOM/CSS-3D surface + playable sequencer + 2026 refs +
  ≥3 subsystems), **1273** (grep-0× swarmalator dynamical system + Strogatz 2017 + 2026
  review + ≥3 subsystems), **1288** (3D Soddy packing + cycle-2 of 1285 + Indra's Pearls +
  ≥3 subsystems), **1294** (tangency-graph coupled resonance + Möbius transport + cycle-2/3
  of 1285/1288 + ≥3 subsystems). **Zero hit 5** — criterion #1 was cashed with novel
  *techniques* but never with a genuine first embodied surface or the still-0× AI-pipeline
  chain. Still, five 4/5s after a long stretch at one is a real, un-hedged improvement.

## Standouts (positive)
- **1272-lattice-tracker**: the window's best build — the last jury's DOM/CSS-3D "fifth
  surface" turned into an *actual instrument you compose with*: a ProTracker-lineage
  step-sequencer built from a real `<div>` grid bent into a flying CSS-3D corridor. It
  cashes three standing demands at once — "make it PLAYABLE," "reach a top rung," "a
  surface the lab has never rendered on" — and it's the rare piece here that isn't
  poke-a-simulation-hear-a-bell. This is what climbing looks like.
- **1294-indra-descent**: the gasket trilogy's justification. 1285 and 1288 drew the
  packing; 1294 is the first that makes it **play back** — tap one circle and the chord
  ripples outward along the *tangency graph* as a self-similar arpeggio, and a continuous
  Möbius dive re-tiles the fractal infinitely as you fall. A real cycle-2/3 deepening, a
  genuinely novel-to-lab coupling (the packing is wired, not just drawn), and the sumi-e
  ink palette is a deliberate escape from the nacre it inherited. The one gasket that
  earns its place in a window with three.
- **1273-swarm-choir**: the swarmalator banked as a ⭐ back at §695 finally shipped — a
  genuinely novel dynamical system (each dot is *both* a position and an oscillator phase,
  so spatial order and musical sync are the same variable) that you **steer into named
  states**, not watch. Novel technique + actively played + a fresh reference (Strogatz
  Nature Comms 2017). The right way to cash a banked ambition.
- **1267-dream-growth**: the cleanest cycle-2 of the window — 1264's walk-and-strike
  cathedral gains a morphogenetic memory layer so every strike accretes geometry and the
  room *becomes a record of your playing*. Depth over breadth, exactly as asked.

## Pruning candidates (concept-level, NOT for deletion — immutability rule holds)
- **1257-lattice** (2/5): reaction-diffusion is 6× in the lab and GPU-RD is lab-prior; the
  arc self-runs and the mic is passive gain only. A beautiful nacre screensaver — the exact
  "watch it, don't play it" three juries have now named. The lowest build in the window.
- **1259-auroral** (3/5): gorgeous and one-glance-legible, but it's a **fourth data-drone**
  — passively driven by NOAA feeds with no perturbation. The 07-07 jury said in plain
  words that the next live-planet piece "must be an instrument you can **perturb**, not
  another readout." It shipped as a readout anyway. Concept, not craft, is the miss.
- **1263-emerge** (3/5): another "press begin and surrender" self-running particle arc.
  The Anadol DATALAND citation is carrying the ambition; the interaction is nil. The
  screensaver pole again, in Anadol's clothes.
- **1284-quantum-etch** (3/5): handsome copper line-etching, but it re-treads the quantum
  territory `1142-orbital-cloud` covered *two weeks ago* (split-step Schrödinger vs. its
  wavefunction sampler), and it's the one true signal-readout in the window — contours of
  |ψ|². Novel rendering, already-mined concept.
- **The gasket cluster risk**: 1285/1288/1294 are three of the last ten. 1294 justifies
  the trilogy by making it play; 1285 and 1288 as a pair edge toward a mini-monoculture. A
  *fourth* gasket would be the new rut, not a deepening.

## Provocations for tomorrow's dream cycle
1. **You climbed — now leave the physics museum.** The ambition gain is real and earned
   (one 4/5 → five), so don't undo it — but you climbed by making the lab an Exploratorium:
   nine of fifteen are "simulate a famous equation faithfully, tap it, hear a bell." Hard-ban
   **faithful-simulation-of-a-named-physical-system-as-instrument** for a week. The next
   ambitious build must reach a top rung *without* a 19th-century equation as its spine.
2. **Break the JI-bell audio monoculture — it's the new pentatonic crutch.** ~10 of 15 run
   the identical spine: just-intonation voice-pool + drone + convolution-void reverb +
   limiter, "strike → consonant chord." There is not one rhythm, groove, beat, or deliberate
   dissonance in the entire window. Ship a piece with *time* in it — a pulse, a drop, a
   dissonance that resolves — or Karel's real piano as the carrier. Anything but a fourth
   room full of bells.
3. **Your references have gone dead.** The mandate's #3 examples are living AV artists —
   Tschepe, Akten, Ikeda, Anadol. This fortnight you cited Descartes (1643), Rijke (1859),
   Faraday (1831), Benioff (1961). That's a physics textbook, not the art frontier. Build one
   piece that borrows a *named, recent* TouchDesigner / Houdini / Anadol technique you can
   point to, not a dead scientist's equation.
4. **Stop shipping watched pieces.** 1257 / 1259 / 1263 are three self-running or passively-
   driven fields in one window — the exact "screensaver not instrument" liability the 06-29,
   07-04, and 07-07 juries all named. 1259 was *specifically told* the next live-planet piece
   must be perturbable and shipped a readout regardless. The live-planet suite is your most
   legible work — make the next one an instrument you play *against* the planet (bend the
   magnetosphere, damp a tide), not a fourth data-drone.
5. **The whole embodied + real-piano lane is 0× — again.** Every input this fortnight is
   pointer, keyboard, data, or self. Real *Welcome Home* piano: 0×, two fortnights running.
   Camera / face / body / tilt: ~0×, with MediaPipe face-blendshape research (§603) and
   hand/pose banked and *untouched*. Spend a cycle on an embodied instrument — the sensor lane
   is the least-crowded corner of the whole lab.
6. **The genuine ceiling is still one budget decision away.** Zero pieces hit 5/5, and the
   reason is the same as always: the ≥4-subsystem **AI-pipeline chain** (audio→image→video, or
   music→narrative→TTS→score-follow) is still **0×** and gated only on Karel's per-prototype
   paid-budget call. Put that decision in front of him a fourth time — one such build is worth
   more than the next five faithfully-simulated equations.

## Karel-facing line
Real climb — five pieces hit the 4/5 top rung this fortnight (vs. one last time), but they
got there by turning the lab into a physics museum: nine of fifteen are "simulate a famous
equation, poke it, hear a bell." 1272-tracker and 1294-indra genuinely soared; tomorrow, break
the Exploratorium and put a sensor or Karel's real piano back in the room.
