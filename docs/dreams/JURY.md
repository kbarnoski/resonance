# Concept Jury Verdict — 2026-06-13 (UTC)

## Summary
The ceiling came back: after a window where nothing cleared 3/5, this fortnight
ships **two honest 4/5 pieces** — `557-piano-splat-galaxy` and
`569-kids-ember-keeper` — and they are the two genuinely fresh moves of the
window (a real <14-day technique bind, and the lab's first true cross-session
memory). But the floor is sagging under them. Yesterday's verdict banned
WebGPU-compute and Canvas2D, and the lab obeyed by **fleeing the renderer rather
than the reflex**: three.js roared back to **6 of 15** and SVG to **5 of 15** —
between them they own 11 of the last 15 outputs. Same disease as last jury ("the
screen surface keeps relocating instead of disappearing"), new host. And the lab
has quietly shipped the **same growing-companion creature twice** (549 and 569)
eight cycles apart, with 569 over-claiming a "first" that 549 already did.

## Diversity audit
- **Over-represented input:** **microphone / voice — 5×** (532 sing, 549 sing,
  559 clap, 569 hum, 570 speech). It's the only input family that broke 4. The
  genuinely off-glass inputs the mandate keeps asking for showed up only as
  singletons: tilt (553), shake-motion (566), camera (545, 568 = 2×). **Real-
  world-data API input is 0× the entire window** (last seen 502, now out of frame).
- **Over-represented output:** **three.js — 6×** (537, 545, 553, 566, 568, 569)
  AND **SVG — 5×** (538, 549, 552, 559, 570). WebGL2 sat at 3× (532, 557, 564).
  **WebGPU collapsed to 1×** (541 only) — last jury banned it at 4×, and the lab
  overcorrected straight past "diverse" into a fresh three.js monoculture.
- **Over-represented technique:** no single CORE hits 4 (15 distinct cores, to
  the lab's credit), but the meta-family is **onset / beat / tempo extraction —
  6×** (545 optical-flow tempo, 557 spectral-flux, 559 clap onset, 564 onset,
  566 shake onset, 568 MediaPipe beat). And underneath nearly every kids piece
  sits the **C-major-pentatonic "nothing-is-ever-wrong" wash** (537, 541, 549,
  553, 566, 569) — the exact pentatonic-plus-visualizer local minimum the mandate
  names by name. ~6 of the 7 kids pieces lean on it.
- **Over-represented vibe:** the kids/adult alternation is structural, but inside
  it: **adult = "cerebral puzzle you decode" — 5×** (538 tuning, 545 time, 552
  tuning, 568 time, 570 language) and **kids = "playful/joyful sensory" — 4×**
  (537, 553, 559, 566). The adult side has collapsed into two heady registers
  (tuning puzzles + metric puzzles) with no warmth to hold onto.
- **BANNED for next cycle:** three.js OUTPUT (6×) · SVG OUTPUT (5×) · microphone/
  voice INPUT (5×) · onset/beat/tempo-extraction TECHNIQUE (6×) · pentatonic-safe-
  wash + adult-cerebral-puzzle VIBE. Build something that renders **off** three.js
  and SVG (WebGPU is starved at 1×; audio-only/projection are 0×), takes input
  from something other than a microphone or a finger, and whose tension you
  **feel** rather than **solve**.

## Ambition floor stats (last 15 prototypes)
- **Hit 0–1 criteria: 1** — `553-kids-tilt-fountain` (tilt + three.js + zone
  pentatonic; no named reference, no novel subsystem, no research bind — the
  local-minimum build of the window).
- **Hit 2–3 criteria: 12** — 532, 537, 538, 541, 545, 549, 552, 559, 564, 566,
  568, 570. Competent, diversity-clean, capped at 3. This is the cruising
  altitude.
- **Hit 4–5 criteria: 2** — `557-piano-splat-galaxy` (#1 first Gaussian-splat
  renderer + #2 + #3 Kerbl 3DGS/Anadol + #5 binds the <14-day splatting finding)
  and `569-kids-ember-keeper` (#1 first cross-session persistence + #2 + #3
  Tamagotchi/Grand/D'Arcy Thompson + #4 spine cycle 1). **Extend these two.**

## Standouts (positive)
- **`557-piano-splat-galaxy`**: the first piece in ~8 juries to actually
  *implement* a <14-day finding (in-browser Gaussian splatting, RESEARCH §405)
  instead of writing "#5 unclaimable" again. A genuinely new renderer in the lab,
  and Karel's real piano as the seed of it — ambition and warmth in one. This is
  the model: a fresh technique in service of his own music.
- **`569-kids-ember-keeper`**: the lab's first state that survives the browser
  closing. A creature that is *bigger tomorrow because you came back* — the
  directest answer yet to the standing #6 ("a creature genuinely changed
  tomorrow"). The append-only mulberry32-regrown genome is a real idea, not a
  decoration.
- **`538-xenharmonic-lattice`** (honorable): the first xenharmonic piece in 538
  prototypes — a whole new harmonic lane, tension that lives in the tuning. Worth
  a mention even at 3/5 because it opened territory, not just filled it.

## Pruning candidates (concept-level, NOT for deletion — immutability rule still holds)
- **`553-kids-tilt-fountain`**: the cleanest local-minimum example of the window.
  Tilt-to-pour orbs through pentatonic chime zones is a *visualizer with a tilt
  knob* — no reference, no research, no novel subsystem, no tension (you can't get
  it wrong, so there's nothing at stake). Polished, and exactly the build the
  mandate says is no longer a valid target.
- **`549-kids-song-friend` + `569-kids-ember-keeper` (the duplication)**: these
  are near-twins — a kids creature whose body grows from accumulated voice input,
  persisted across calendar days in localStorage, sung back changed. Shipped 8
  cycles apart. 569 is the better build, but it claims "the lab's **FIRST**
  cross-session persistent state" — which 549 already shipped (and 408/518 touched
  before that). One growing-companion piece is a spine; two is an attractor, and
  the over-claim means nobody grepped the lab before declaring the first.
- **`541-kids-liquid-light`**: lovely, but its only ambition lever is "first
  WebGPU in the kids set," and WebGPU fluid already exists at 520. Strip that and
  it's fluid-sim + pentatonic wash — observational tension, nothing held or
  resolved. A renderer flex in search of a concept.

## Provocations for tomorrow's dream cycle
1. **The renderer fled, it didn't diversify.** three.js (6×) + SVG (5×) = 11 of
   15 outputs. Ban both for the next cycle. WebGPU is starved (1×) and audio-only
   / projection / non-screen is **0× the entire window** — spend a cycle off the
   glass entirely: a depth-camera spatial-audio room, or a pure audio/haptic
   piece. The lab still has zero embodied-spatial prototypes after 570 builds.
2. **Real-world-data sonification is 0× this whole window** (502 was the last,
   now out of frame) despite being a named-starved menu category every jury.
   Build the weather/seismic/transit/ISS piece — music *about* something other
   than music — and make its tension live in the data, not a synth knob.
3. **Freeze the growing-companion-creature spine.** 549 and 569 are the same
   piece; the next kids cycle must NOT be a creature that remembers you and grows.
   It's become this fortnight's autopilot the way GPU-physics was last fortnight's.
4. **The adult side has no heart, only puzzles.** 5 of the 7 adult pieces are
   "decode the tuning" (538/552) or "feel the time drift" (545/568) or "parse the
   language" (570). Ban polytempo AND the xenharmonic lattice for the next adult
   cycle and chase a piece with emotional warmth — something that moves you
   without asking you to understand it first. The splat galaxy proved ambition and
   warmth aren't opposites.
5. **The research-first rule worked exactly twice** — §405 (splat → 557/564) and
   §411 (ASR → 570) — and §405 produced both 4/5 adults. Everywhere else the dive
   wrote "#5 unclaimable, cs.SD is server-ML" and fell back on #3/#4. Stop mining
   the same dry well: §405 proved the graphics / WebGPU / AV-artist wells (the
   ones the jury named) still hold fresh <14-day binds. Go back to them before
   shipping another spine cycle-2.

## Karel-facing line
Two real gems this fortnight (the splat galaxy and the ember keeper), but the lab
fled WebGPU straight into a three.js-and-pentatonic comfort zone and shipped the
same growing-creature twice — tomorrow: drop three.js, SVG and the mic, get off
the glass, and chase warmth instead of another clever puzzle.

---

_Meta note: STATE.md's chronological log ends at cycle 399 while shipped cycles
run to 411 (`docs/dreams/STATE.md` not updated for 400–411 in this snapshot);
INDEX.md retains only recent entries with older ones pruned. Doc drift, flagged
not corrected — the jury is read-only on the lab. Audit was reconstructed from
the prototype READMEs, RESEARCH.md (fresh through §411), and the cycle commit
messages._
