# Concept Jury Verdict — 2026-08-08

## Summary
Two big standing asks finally shipped this window — the **first multi-user/co-presence
piece** (`7912-entrain-moire`, flagged ~25 cycles) and a **true long-form memory-journey**
(`8392-longtide`, the thin axis the menu has begged for) — and both are real, not gestures.
The player-authored-structure gate the last three juries hammered is also being answered
honestly now: `7848-latents` and `7960-origami` make you *discover* the structure by ear
instead of watching a pre-given one be correct. That's the good news, and it's substantial.
The catch is that the lab obeyed the last jury too literally: told to kill Canvas2D, it swung
the whole window into **three.js additive particle-clouds (5×) rendered violet over a
just-intonation drone** — the "field-sim monoculture" the 08-07 jury declared *dead* is
quietly back (swarm + particle-life + fluid + flow = 4 glowing-dot fields), and the house
look/sound has hardened into a single register. One wall came down; a prettier one went up.

## Diversity audit
- **Over-represented input: touch/pointer (5×)** — `7848`, `7912`, `7960`, `7992`, `8392`.
  Not alarming on its own (pointer is the default modality), but it's the window's lean.
  mic 3× (`7720`, `8024`, `8312`), keyboard 3× (`8072`, `8200`, `8264`), tilt 2× (`7784`,
  `7816`), camera 1× (`8360`), audio-file 1× (`7800`). Input is still the *healthiest* axis —
  don't "fix" it. The problem this window is downstream of input.
- **Over-represented output: three.js (5×)** — `7960`, `8024`, `8200`, `8312`, `8392`. **This
  is the headline and it's an over-correction.** Last jury banned Canvas2D (was 6×); the lab
  obeyed — Canvas2D is down to 2× (`7784`, `7800`) — and immediately built the *next* wall out
  of three.js additive point-clouds. Add WebGL2-raw 2× (`7720`, `7816`) + WebGPU 2× (`7912`,
  `8360`) and the GPU umbrella is **9/15**. The bright spot: DOM/SVG survived the pivot — SVG
  3× (`7848`, `7992`, `8072`), DOM-CSS 1× (`8264`) = 4/15, genuinely healthier than the "SVG
  is starved" complaint of a week ago. But three.js-particle-cloud is now the pile.
- **Over-represented technique: CPU field-sim → additive-glow cloud (4×)** — `7816` (vision-cone
  swarm), `8200` (particle-life matrix), `8360` (stable-fluids), `8392` (curl flow-field). The
  08-07 jury wrote "**Zero Kuramoto / neural-field / fluid this window**" as its proudest line.
  One week later the continuous-field simulation, advected and rendered as glowing dots, is back
  in four of fifteen. Individually the engines differ; as a *format* they've re-converged. Two
  further repeats worth naming: **Dawkins/Karl-Sims "breed-by-crossover"** appears twice back-to-
  back (`8072`, `8200`), and a **just-intonation drone bed** underlies ~8+ pieces — the default
  audio substrate is now unquestioned.
- **Over-represented vibe: violet-ramp cosmic-ambient (~6×)** — `7720`, `7816`, `8024`, `8312`,
  `8360`, `8392`. The psychedelic/cosmic pole the last jury wanted "re-centered" is not just back,
  it's the *house style*: violet→indigo→amber ramp, JI drone, slow luminance drift, additive glow.
  The analytical/didactic pole course-corrected hard (canonical-math-sonified down to 3× — `7784`,
  `7800`, `7960`, from ~7×), which is real progress, but the cosmic half over-filled to compensate.
- **BANNED for next cycle:** three.js additive particle/point-cloud output (go DOM-CSS, SVG, raw
  Canvas2D-as-instrument, or a genuinely 3D *geometry* piece — not another dot-field) · **CPU
  field-sim as the core** (boids / particle-life / fluid / flow — rest it a week, it's back to 4×)
  · **violet-ramp cosmic-ambient + the default JI-drone bed** (pick a different palette AND a
  different tuning system for one cycle) · the **Dawkins/Karl-Sims breed-by-crossover verb**
  (used twice this window).

## Ambition floor stats (last 15 prototypes)
- **Hit 0–1 criteria: 0** — fourth window running the floor is clean. Stop worrying about it.
- **Hit 2–3 criteria: 11** — the bulk: `7720` (3: #1 raymarched-DE first + #3 White/Nylander/
  Quílez + #5 ASTRODITHER), `7784` (2: #1 first-WFS + #3), `7800` (3: #1 modal-transfer + #2 + #3
  NeuroSonic), `7848` (3: #2 + #3 + #5 discover-then-steer §1048), `7960` (2: #1 first-origami +
  #3 Kawasaki/Maekawa/Lang), `7992` (3: #2 + #3 Calliphony + #5 §1050/§1051), `8072` (2: #2 + #3,
  self-disclaims first), `8200` (2: #2 + #3, deepens `236`), `8264` (2: #2 four-subsystems + #3
  Apollinaire, "no first claims"), `8312` (3: #1 sympathetic-loom + #2 + #3 jawari/Dream House),
  `8360` (3: #2 + #3 Stam/Anadol + camera-embodied). The honest read: **#1 is still mostly "first
  *port* of a known structure," not "first new thing a human can DO."**
- **Hit 4–5 criteria: 4** — `7816-elderswarm` (#1 vision-cone-first + #2 + #3 + arguable), `7912-
  entrain-moire` (#1 first co-presence + #2 + #3 + #5), `8024-oneirogen` (#1 reality-monitoring
  crossfade + #2 + #3 eLife/Frontiers 2026 + #5), `8392-longtide` (#1 first long-form-memory + #2
  three-engine fusion + #3 Anadol + #5 §1059 — the closest anyone came to 5/5). **Still nobody
  hit a clean 5/5** — the ceiling is unchanged: strong 3/5 bodies with a 4/5 lid.

## Standouts (positive)
- **`7912-entrain-moire`**: the piece the jury has demanded for ~25 cycles and finally got. The
  first genuine multi-user/co-presence build — two tabs, two Kuramoto oscillators, and a
  just-intonation third that blooms *only* in the lock and dissolves as they drift, so the reward
  literally cannot exist in either player alone. Control-signals-not-audio transport
  (BroadcastChannel), a WebGPU→WebGL2→CSS fallback ladder so it survives a phone, and a seeded
  ghost that performs the whole find→reach→lock→bloom→drift arc solo. This is the co-presence
  register the lab had *zero* of. Don't let it be a one-off.
- **`8392-longtide`**: the long-form/state axis the diversity menu names as the lab's thinnest,
  filled honestly. A ~10-minute non-looping arc with a real memory ring: seeds plant persistent
  vortices AND capture granular phrases, and the fourth movement replays *your own earlier
  gestures* transposed up a fifth — you hear your past return. It's SCOPE-as-freshness (fusing
  three loved engines) rather than a new primitive, and that's the right bet now that grep-0
  primitive novelty is exhausted. The one to *extend*, not repeat.
- *(Honorable — the player-authored-structure gate, finally passed: `7848-latents` (discover the
  unlabelled axes of a sound-world by ear, then compose along the ones you found) and
  `7960-origami` (author a crease pattern, discover flat-foldability by ear — Kawasaki-flat rings
  consonant). Both answer "what can I DO that isn't watch or steer-a-descent?" — the exact gate
  the last jury imposed. And `8024-oneirogen`'s tug-of-war verb: α drifts toward hallucination and
  you fight it with novel sound until, past a threshold, no sound brings it back — a verb with a
  real, discoverable failure point, not a slider.)*

## Pruning candidates (concept-level, NOT for deletion — immutability rule still holds)
- **`8200-rulesmith` + `8072-galápagos` (as a pair)**: both are Dawkins/Karl-Sims **aesthetic-
  selection breeding** instruments shipped in the same window — pick parents, crossover+mutate,
  bank favourites, breed. Each is competent and each *openly disclaims* being a first (`8072` cites
  `71-shader-evolve`; `8200` says it deepens `236-particle-life-song`). Together they're a mini-
  monoculture: the "breed a field by crossover" verb, done twice. One would have been enough; the
  second is the local-minimum tell — reaching for the same proven verb rather than a new one.
- **`7784-huygens`**: gorgeous vector-geometry craft, but it's precisely the "sonify-a-named-
  mathematical-structure and watch the construction be *correct*" format the 08-07 jury banned for
  a week — and here it is inside that week. You tilt to steer the virtual source, but the verb is
  watch-the-envelope-kiss-the-wavelets. Museum-label-with-sound, under an active moratorium.
- **`8360-tidewash`**: the lesser of the window's two cosmic-ambient liquid-light granular pieces
  (twin to `8392`). "Wave your hands, watch the fluid swirl, hear it granulate" is a known shape;
  the webcam optical-flow input is a nice zero-ML touch, but the verb is thinner than longtide's
  memory arc and the palette/technique are the exact house default this verdict is flagging.

## Provocations for tomorrow's dream cycle
- **You killed the Canvas2D wall and built a three.js one — stop feeding whatever the last jury
  greenlit.** 5 of 15 are three.js additive point/particle clouds. Ban three.js-particle-cloud for
  a week and, harder, **ban CPU field-sim as the core** — the swarm/particle-life/fluid/flow format
  the 08-07 jury called *dead* is back at 4×. Build one where the visual is *not* a cloud of
  glowing dots advected by a field: real 3D geometry, typography, ink, a diagram you edit, a room.
- **Break the violet-and-just-intonation reflex.** ~6 cosmic-ambient violet pieces, a JI drone
  under ~8+. Spend one full cycle deliberately OFF both: a different colour world (paper/monochrome/
  high-contrast graphic), a different tuning (equal-temperament grit, a gamelan/spectral scale,
  noise-based sound), or **no drone bed at all**. The house style has become invisible to itself.
- **The co-presence piece must not be a one-off.** `7912` proved the two-device room works. The lab
  still has exactly one. Build the *second* multi-user piece tomorrow — and make it NOT entrainment/
  moiré: a shared-authoring canvas, a conducted ensemble, a call-and-response between two strangers
  who never lock but answer each other.
- **Rest breed-by-crossover; if you want selection, invert it.** Twice this window (`8072`, `8200`)
  the verb was "you hand-pick parents." Flip it: a *co-creative* selector where the piece proposes
  and breeds toward what it infers YOU like from what you keep — the machine as the second taste in
  the room, not just the executor of yours.
- **Embodied/spatial is still nearly empty — go there with a real sensor.** `8360` used a webcam
  (optical flow, no ML) and `7784`/`7816` used tilt, but there's still **zero MediaPipe body/hand
  tracking, zero depth-camera, zero true spatial-audio room**. The menu's "Spatial/installation"
  category has been open for weeks. Spend a DEEP on a hand-tracked (MediaPipe) or depth-sensed room
  — the genuinely un-built register, not another field advected by a mouse.
- **Build the research that's already sitting there.** `7992-quillsvg` correctly built on §1050
  (Calliphony, calligraphy-as-performance) — good. But **§1051** (live-music *agents* have a formal
  design space) and **§980** (DiscoForcing — the body drives the sound) are cited and *unbuilt*.
  A "live agent that plays WITH you" is named in the research and has zero prototypes. That's the
  chain to close next.

## Karel-facing line
You shipped the two I've been asking for — the first co-presence duet (`7912`) and a real
10-minute memory-journey (`8392`) — but the lab traded last week's Canvas2D museum for a new
monoculture: 5 of 15 are three.js violet particle-clouds over a just-intonation drone, and the
"dead" field-sim is quietly back in four builds.
