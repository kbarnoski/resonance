# Concept Jury Verdict — 2026-08-03

## Summary
The lab did the assigned thing: last jury said "get off psychedelic field-sims," and it
did — psychedelic/altered-states fell from 9-of-15 to 3 (all carryover), and the field-sim
reflex is dead. Ambition is *better* than ever: **zero sub-floor builds, 8 of 15 at a real
4–5**. But it didn't learn *spread* — it learned to **migrate the monoculture**. The new
house style is a music-theory reading room: **7 of the last 15 are "represent music as
symbolic note-data, run a theory/analysis engine on it, draw it as a 2D scrolling score."**
The pendulum swung from GPU-field (9× GPU-raster) straight to CPU-2D (9× Canvas2D + SVG),
and from "melt your ego in a fractal" to "here is a heat-map of your song's form." Same
convergence, opposite pole. The immersive/transcendent register the Resonance brand is
actually built on (Cosmic Homecoming, Inner Sanctuary) is now the **minority**.

## Diversity audit
- Over-represented input: **none hits ≥4 — this axis is genuinely fixed.** mic 3× (`5272`,
  `5528`, `5784`), self-playing/none 3× (`5480`, `5688`, `5864`), MIDI 2× (`5336`, `5720`),
  device-orientation 2× (`5576`, `5816`), pointer-drag only 2× (`5224`, `5304`, both
  carryover). Last jury's "pointer-drag 5×" is gone. **Credit where due — input diversity
  is the win of the window.**
- Over-represented output: **Canvas2D 5×** (`5272`, `5384`, `5432`, `5480`, `5688`) **and
  inline-SVG/DOM 4×** (`5336`, `5528`, `5576`, `5624`). Combined CPU-2D = **9 of 15** — the
  exact mirror of last window's 9-of-15 GPU-raster. three.js fell to 4, WebGL2 to 2, WebGPU
  to 0. A **scrolling-score/piano-roll on SVG** is its own sub-cluster (`5336`, `5528`,
  `5624`).
- Over-represented technique: **"music as symbolic note-data + a music-theory/analysis
  engine, rendered as a 2D score" (≈7×)** — `5336` species-counterpoint, `5384` SSM/novelty
  analysis, `5480` motivic-transformation, `5528` online-DTW score-following, `5624` edit-op
  sequencer, `5720` Spiral-Array tonal analysis, `5864` bidirectional tension model. No
  single named algorithm hits 4, but the **meta-move** — note-data + theory engine + scroll —
  is now what "ripple a field and sonify it" was last window. Field-sim itself is down to 3
  (all carryover: `5224`, `5272`, `5304`).
- Over-represented vibe: **analytical / cerebral "explain-the-music" (≈6–7×)** — `5384`,
  `5480`, `5528`, `5624`, `5720`, `5784`, `5864` mostly ask you to *understand* music, not be
  *moved* by it. Psychedelic dropped to 3 (`5224`, `5272`, `5304`, + `5688` hypnagogic-
  adjacent). The genuinely-immersive count (`5304`, `5576`, `5688`, `5816`) is now the
  minority — a new gap, not a strength.
- **BANNED for next cycle:** Canvas2D output · inline-SVG scrolling-score/piano-roll output ·
  the "note-data + theory engine + 2D score" technique (any piece whose core is analyzing/
  transforming/following symbolic music and drawing it as a roll) · analytical/cerebral
  "here's how the music works" vibe. Do NOT mint an eighth reading-room piece.

## Ambition floor stats (last 15 prototypes)
- **Hit 0–1 criteria: 0.** No local-minimum builds — held for a second straight window.
- **Hit 2–3 criteria: 7** — `5272`, `5384`, `5432`, `5480`, `5688`, `5720`, `5816`. (Mostly
  clear on ≥3-subsystems + named-ref; the weak leg is novelty or research-recency, not effort.)
- **Hit 4–5 criteria: 8** — `5224-covenant` (4/5), `5304-formless` (4/5), `5336-answerer`
  (4/5), `5528-follow` (5/5), `5576-reflections` (4/5), `5624-redlines` (4/5),
  `5784-converge` (4/5), `5864-overture` (4–5/5). **A better top-tier than last window (8 vs
  5). Ambition is not the problem and hasn't been for two windows — form and vibe are.**

## Standouts (positive)
- `5528-follow`: **the window's peak.** A genuinely new verb — *follow* a live performer
  against a known score with a transparent online-DTW cost grid that survives rush, drag,
  wrong notes, skips and repeats, verified headlessly on all four hard cases, degrading to a
  seeded synthetic performer. This is exactly the "interaction logic, not PDE" escape hatch
  the last jury named (`4680`/`4728` lineage) — and it has real live-performance fitness
  (care-#3). 5/5, and the rare build where the mechanic *is* the concept.
- `5864-overture`: the most plausible **alternate journey engine** the lab has ever shipped —
  Karel's standing care-#4. A 6-minute through-composed cinematic arc (Freytag) driven by a
  real quantitative **Farbood tension model that runs both ways** (dramaturgy drives the
  notes; the notes read back as a live tension curve). You could drop his Path recordings
  into this. This is the one to extend into a real engine.
- `5576-reflections`: the **installation/room lane** the jury has begged for ~11 cycles,
  finally a second entry — a navigable binaural room built on the from-scratch image-source
  method (order-2 lattice, 17 images/voice), the acoustics re-rendering as you walk. Neuhaus/
  Leitner as refs is earned. Different subsystem set from everything around it.
- `5784-converge`: the **freshest technique** in the window — a CMA-ES swarm re-deriving its
  own FM patch to *become* a timbre you give it, scored on analytic Bessel spectra so
  thousands of candidates rank per second. "A synth that becomes your sound," grep-0× verb in
  a 1600-piece lab. Real surprise (care-#2).
- Honorable: `5336-answerer` (a partner that can *refuse* to cadence) is strong and on-brand —
  but see below; it's the head of a cluster, not a lone jewel.

## Pruning candidates (concept-level, NOT for deletion — immutability rule still holds)
- `5720-lattice`: an **analytical reskin of the lab's oldest shape** — play notes, watch a
  pretty 3D crystal light up. The Spiral Array and center-of-effect are real tonal analysis,
  but the *experience* is a visualizer you look at, and it's the **third three.js glowing-
  orbiting-object** of the window (`5224`, `5816`, `5720`). "Dress a note-visualizer as
  analysis" is the window's clearest local-minimum repeat.
- `5480-development`: the **plainest member of the symbolic-score cluster** — a solo self-
  composer with no interaction and no partner, so it lacks the one thing that makes its
  siblings sing (`5336`'s refusal, `5528`'s following, `5624`'s counter-editing agent). The
  developing-variation engine is competent; the piece has no *stake*. It reads as the cluster's
  baseline, which is exactly why the cluster shouldn't grow.
- `5432-tremorsong`: the **most templated form of data-music** — quake→pitch/pan/loudness
  parameter-mapping is the textbook sonification example, and the named ref (Holtzman/
  SeismoDome) *is* the canonical version that already exists. It cashes the data-sonification
  menu item in its most expected shape; its own "what I'd deepen" (audify the real seismogram
  waveform, not a synth bell) is where the actual idea was.

## Provocations for tomorrow's dream cycle
- **You migrated the monoculture; you didn't break it.** Window −1 = 9/15 psychedelic field-
  sims. Window 0 = 7/15 note-data-on-a-scrolling-score. The lab has now proven it can move a
  monoculture on command but can't *hold a spread*. Ban the "symbolic music + theory engine +
  2D roll" recipe outright for a cycle — no counterpoint engine, no SSM, no piano-roll diff.
- **Reclaim the transcendent pole — it's the brand and it's now the minority.** The lab swung
  from ego-dissolution to spreadsheets; `5384`/`5480`/`5720`/`5784` want you to *understand*
  music. Build ONE unabashedly beautiful, wordless, immersive piece with **no readout, no
  meter, no derivation trace, no "here's how it works" chrome** — `5576`-room and
  `5304`-formless are the register to return to. Immersion is not the same as psychedelic;
  you can serve Cosmic Homecoming without a brain paper.
- **Kill Canvas2D + SVG-scrolling-score output for a cycle.** Rendering flipped GPU-9 → CPU-2D-9;
  WebGPU is now 0× (it was the jury-under-represented lane you were *supposed* to feed). Force
  a WebGPU-compute or a genuine 3D-embodied output — not a fourth piano-roll.
- **Build a REAL room, not a third single-user one — this is the second time.** You now hold
  TWO spatial-audio spines (`5048-narthex` HRTF choir, `5576-reflections` image-source room)
  and built the two-device-WebRTC / depth-camera installation from *neither*. Last jury (#4):
  "put narthex in a real shared/embodied room this week or admit the lane is dead." You built
  another solo room. Next cycle: two devices in one shared acoustic space, or strike the
  installation lane permanently and stop banking it.
- **Standing yes/no for Karel (stop re-queuing it):** the AI-pipeline chain (music→image→video)
  has been "queued next" for ~24 cycles per MORNING and every jury. Fund `FAL_KEY` and build
  it, or strike it permanently. Related freshness note: three of the last research dives (§997
  BeatEdit, §1000 diff-audio, §1001 NIME) honestly admit their anchor is >30 days or
  foundational — the daily-freshness mandate is getting expensive to hit, which is another
  reason to spend a build on *feeling* rather than the next citable frontier paper.

## Karel-facing line
You escaped the psychedelic field-sims and the ambition floor is rock-solid — but you traded
them for a music-theory reading room (7 of the last 15 are "analyze note-data on a scrolling
score"); `5528-follow` and `5864-overture` are the jewels — now build ONE wordless, gorgeous,
immersive piece and stop explaining the music at me.
