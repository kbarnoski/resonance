# Concept Jury Verdict — 2026-08-07

## Summary
The lab did the work the last three juries demanded, and it shows: the mic-as-analyser
monoculture is broken (mic is down to 1× from 4×), the continuous-field-simulation engine
that ate five slots last window is at **zero**, technique is genuinely diverse for the first
time in a month, and the psychedelic charter is re-centered — ~7 of 15 sit on the intense/
cosmic pole after 11 dark cycles. That's a real course-correction and it deserves to be said
plainly. The catch: the lab climbed out of the field-sim pit straight into a prettier one —
a **museum of beautiful math-explainers rendered in Canvas2D**, where a canonical structure
(an aperiodic monotile, Ford circles, change-ringing, Huygens' construction, Chladni modes)
is pre-given and you mostly *watch it be correct*. Technique is wide; **agency is thin**.
Only two of fifteen hand the human a genuine verb.

## Diversity audit
- **Over-represented input: none ≥4×** — and that is the headline. Keyboard is the mild lean
  (3×: `7416`, `7464`, `7544`), then camera 2× (`7320`, `7672`), tilt 2× (`7784`, `7816`),
  audio-file 2× (`7368`, `7800`), autonomous/none 2–3× (`7480`, `7656`, `7800`), with MIDI
  (`7384`), pointer (`7640`), breath-tap (`7592`), mic (`7720`) one apiece. Input is the
  window's healthiest axis by a mile — last window's mic 4× is gone. **Do not spend the
  next cycle "fixing" input; it's the one thing that's working.**
- **Over-represented output: Canvas2D (6×)** — `7464`, `7480`, `7544`, `7656`, `7784`, `7800`
  — over the line, and it's an *over-correction*. The jury said "go actually non-GPU"; the lab
  heard "mint Canvas2D," and Canvas2D is now the pile. Meanwhile **WebGL2-raw is still 5×**
  (`7416`, `7640`, `7672`, `7720`, `7816`), so the wider GPU umbrella is **8/15** (WebGL2 5×
  + three.js 2× [`7320`,`7368`] + WebGPU 1× [`7384`]). Only ONE piece (`7592`) used the
  freshest substrate available — pure CSS/DOM — and it was one of the most distinctive looks
  in the window. SVG appears only as `7464`'s secondary UI. The two output walls are Canvas2D
  and WebGL2; DOM/SVG are starved.
- **Over-represented technique: none ≥4× — genuinely diverse, credit where due.** Phase
  vocoder, EDM tension-arc, dissonance-curve, turmite, aperiodic tiling, Stern–Brocot/Ford,
  Ganzfeld entrainment, traveling-wave replay, change-ringing, off-axis projection, raymarched
  DE fractal, Huygens/WFS, modal synthesis, vision-cone swarm — fifteen builds, ~fifteen
  distinct engines. **Zero Kuramoto / neural-field / fluid this window.** This is the biggest
  single improvement over yesterday and it is not an accident.
- **Over-represented vibe: "canonical-mathematics-sonified" (~7×)** — `7416`, `7464`, `7480`,
  `7544`, `7656`, `7784`, `7800` (with `7368` adjacent). The technique per-piece is fresh, but
  the *format* has hardened into a single move: take a named, pre-existing mathematical or
  physical structure, render it faithfully, sonify it, and let the player steer or watch. It's
  the analytical monoculture wearing a mathematician's coat instead of an instrument-maker's.
  The other pole — psychedelic/altered-state (`7480` cosmic, `7592`, `7640`, `7672`, `7720`,
  `7816`, `7656` ritual-adjacent) — is back and healthy, so the lab is bimodal again, which is
  *better* than one wall. But the analytical half is now "Wikipedia-with-sound."
- **BANNED for next cycle:** Canvas2D output (do NOT answer by minting a fifth WebGL2 — that
  wall is still 5×; go **three.js / WebGPU / or actually DOM-CSS**) · the
  **"sonify-a-named-mathematical-structure"** format (the structure must be *discovered by the
  player*, not pre-given) · the **log-polar / form-constant tunnel** as the default psychedelic
  renderer (it's in `7640`, `7672`, and `7816`'s fold — the pole is re-centered, now vary how
  it *looks*). In plain terms: **no Canvas2D, no museum-label explainer, no log-polar tunnel.**

## Ambition floor stats (last 15 prototypes)
- **Hit 0–1 criteria: 0** — third window running that nobody scraped the floor. The
  local-minimum builds are genuinely gone; stop worrying about the floor.
- **Hit 2–3 criteria: ~12** — the bulk. But the *character* of the pass improved:
  **#1 (novel technique) is now earned honestly four times** — `7464-ruletape` (first turmite,
  grep-0), `7720-mandelbulb` (first raymarched distance-estimated 3D fractal, grep-0),
  `7784-huygens` (first Huygens/Wave-Field-Synthesis piece), `7816-elderswarm` (first
  non-reciprocal vision-cone swarm, grep-0). That's the direct answer to yesterday's "#1 is
  disclaimed in 13 of 15" complaint — real firsts, not stock phrases. The honesty caveat: most
  of these firsts are "first **port** of a known structure," not "first new thing a person can
  DO." The floor is being *reached* now, not just papered — but reached toward technique, not
  interaction.
- **Hit 4–5 criteria: ~3** — `7416-temperlattice` (#2+#3+#4+#5, but #4 is earned by being
  cycle-3 of the dissonance line, i.e. continuing), `7816-elderswarm` (#1+#2+#3+#5), and
  `7320-fishtank` (#1+#2+#5) borderline. **Still nobody hit 5/5.** The ceiling is unchanged: a
  competent 3/5 body with a thin 4/5 lid.

## Standouts (positive)
- **`7464-ruletape`**: the single best answer to the last jury, executed to the letter. It's
  the discrete/symbolic/agentic interaction I begged for — you rewrite the machine's DNA (a
  turn-symbol string), non-GPU, NOT a field-sim, and a one-symbol edit visibly flips the same
  turmite between chaos, symmetry, and highway while an order-meter needle crosses the critical
  edge under your hands. Honest #1 (first Langton/turmite in 7000+ protos). This is the model:
  the player *does* something and the structure answers. More of this.
- **`7816-elderswarm`**: today's DEEP winner, and it earns it. A genuinely fresh mechanic — a
  non-reciprocal vision-cone perception swarm where agents attend to *you* and your looking
  can't reach *them* — that one-sidedness is what makes 2000 dots feel like a population of
  watching minds coalescing into a gaze-figure that meets you, then dissolves. One measured
  coherence scalar drives sound and light as the *same* event, so it sings the instant the
  figure forms. Re-centers the psychedelic charter with a real first, not a re-skin.
- **`7784-huygens`**: the window's cleanest "you can SEE the physics." A wall of forty point
  sources, each throwing a circular wavelet, and the reconstructed wavefront emerges as the
  literal common-tangent envelope — you watch the envelope *kiss* each individual wavelet
  because the drawn wavelets and the drawn envelope come from the same timing math. First WFS
  piece in the lab, drawn as legible vector geometry instead of a sampled pixel field. If the
  "explainer" format has a ceiling, this is near it — but see the provocation about the format.
- *(Honorable: `7720-mandelbulb` finally fills the most conspicuous gap in the lab — ~100 GPU
  worlds and never once the canonical drug-free DMT geometry, a raymarched DE fractal. Iconic
  hole, honestly closed.)*

## Pruning candidates (concept-level, NOT for deletion — immutability rule still holds)
- **`7544-fordtree`**: the math is gorgeous and the craft is real, but this is the
  "canonical-structure + steer-a-descent" template at its most passive — you press arrows to
  fall through the rationals while a beautiful pre-given circle packing scrolls past. It's the
  third+ "infinite descent through a mathematical continuum" shape (cf. `7480`'s endless
  tiling, the Shepard descents). You don't *make* anything; you choose a branch. Local-minimum
  of the new explainer pile.
- **`7480-einstein`**: openly disclaims its own #1 — it's a *port* of the 2023 Smith–Myers–
  Kaplan monotile, and it says so honestly. The concept ("a never-looping melody from a
  never-repeating tiling") is elegant, but the interaction is nil: it plays itself, and the
  einstein is a fixed layout a playhead crosses. A museum label with a soundtrack, and the lab
  already owns the genre next door (`837-quasicrystal`). Beautiful; inert.
- **`7368-vocodrift`**: the phase vocoder is honest, hard-won craft — but "your recording
  becomes a terrain you fly over" is the audio-driven-landscape shape the lab has shipped many
  times. The verb (fly over your own sound) is old and passive; the freshness is in the DSP,
  not in what the player gets to do.

## Provocations for tomorrow's dream cycle
- **You broke the monoculture — don't build the next one out of Canvas2D math-explainers.**
  ~7 of 15 are "here is a beautiful piece of known mathematics, sonified and steerable."
  Impeccable, and now a rut. **Ban the pre-given-structure format for a week:** build one where
  the structure is *discovered/authored by the player*, not laid down for them to admire.
  `7464-ruletape` already proved this is more alive — the turmite's regime is something you
  *find* by editing, not a fixed packing you scroll.
- **Interaction depth is the weak axis now — not technique novelty.** You're earning #1 four
  times this window (real progress), but almost all are "first port of a known thing." Impose a
  "what can I DO here that isn't watch or steer-a-descent?" gate on the next build. The two best
  pieces (ruletape, elderswarm) both pass it; most of the rest don't.
- **Force the multi-user question — you're one build away.** `7320-fishtank` proved
  head-tracked spatial audio works in-browser; `7816`'s own seeds name a two-device "two eyes
  that find each other" merge; the WebRTC two-device decision has been flagged ~25 cycles with
  zero movement and the lab still has **zero multi-user pieces**. Build the two-device room
  tomorrow instead of re-flagging it a 26th time.
- **Output: three.js / WebGPU / or actually DOM-CSS — not Canvas2D, not a fifth WebGL2.**
  Canvas2D is the new 6× pile and WebGL2 is still 5×. The one CSS/DOM piece (`7592`) was among
  the freshest substrates all window. Go there, or go three.js/WebGPU with real dimensionality
  — but stop feeding the two output walls.
- **Rest the log-polar tunnel.** The "log-polar warp + ping-pong feedback trail" is quietly
  becoming the default psychedelic renderer (`7640`, `7672`, `7816`'s fold). The intense pole
  is healthily back — now diversify *how* it looks. Two weeks off the tunnel; find another way
  for a hallucination to move.

## Karel-facing line
Best course-correction night of the month — the mic-and-field-sim monoculture is dead and the
psychedelic charter is back — but the analytical half quietly became a museum of Canvas2D
math-explainers: technique is finally diverse, yet only `7464-ruletape` and `7816-elderswarm`
let you actually *do* anything.
