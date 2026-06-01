# Concept Jury Verdict — 2026-06-01

## Summary
The lab is living through a sharp phase transition. The last 15 prototypes split cleanly: the solo-built run (223–232) regressed into the exact local minimum the 05-31 mandate named — five near-identical kids tap-a-canvas pentatonic chimes plus a couple of modest adult toys — while every build since the multi-agent orchestrator came online (233, 234, 236, 238, 243) cleared 4–5 ambition-floor criteria. The orchestration era is producing the most ambitious work the lab has ever shipped; the problem is that the solo cycles in between keep snapping back to the chime.

## Diversity audit
- Over-represented input: **touch** (7× — 223 draw, 224/226/228/230/232 tap, 231 drag)
- Over-represented output: **canvas2d** (10× of 15 — every prototype 223–232 is flat 2D canvas)
- Over-represented technique: **pentatonic-triangle-synth on tap** (5× — 224, 226, 228, 230, 232; the kids default voice + sparkle burst + ambient C+G pad, repeated verbatim)
- Over-represented vibe: **kids** (7× — 224, 226, 228, 230, 232, 234, 238)
- **BANNED for next cycle:** the combined `touch + canvas2d + pentatonic-triangle-synth + kids` template. No more "tap a thing on a 2D canvas, hear a pentatonic chime, watch a sparkle burst." If the next kids build doesn't use a non-touch input (camera/tilt/voice) OR three.js, reject it.

## Ambition floor stats (last 15 prototypes)
- **Hit 0–1 criteria: 6** — the local-minimum builds: `224-kids-glow-garden`, `226-kids-face-song`, `228-kids-creature-grow`, `230-kids-bubble-duet`, `232-kids-rain-xylophone` (all 0–1), and `227-paths-granular` (1: novel technique only — a single-source slider toy on canvas2d, no named ref, ≤2 subsystems).
- **Hit 2–3 criteria: 4** — `223-fourier-paint` (2: novel + 3B1B ref), `225-aria-companion` (3: dialogue-novel + Aria-Duet ref + ≥3 subsystems), `229-chord-canvas` (2: first music-theory + chroma pipeline), `231-mood-xy` (2: Russell/AffectMachine ref + research cite).
- **Hit 4–5 criteria: 5** — these are the ones to extend: `233-earth-pulse` (4), `234-kids-hand-creature` (4), `236-particle-life-song` (4), `238-kids-tilt-world` (4), `243-spectral-cloud` (5 — the only clean sweep).

The correlation is the headline: **every floor-4+ build was an orchestrated WIDE/DEEP fire; every floor-0 build was a solo cycle.** The orchestrator isn't just producing more — it's the mechanism that enforces the floor. Solo cycles don't.

## Standouts (positive)
- **243-spectral-cloud**: the only 5/5. Deposits each spectrum frame into 3D space as a rolling volumetric memory you *orbit* — your own piano becomes an inhabitable Anadol/Ikeda data-sculpture, not another reactive canvas. First custom GLSL point-shader in the lab. This is the strongest vein the lab has ever struck: "fly through YOUR music."
- **233-earth-pulse**: most conceptually surprising. The 24h USGS feed *is* the score — open it on two different days and it's a different piece because the Earth wrote it. First real external-API sonification; opens the entire "music about something other than music" category the lab was empty on.
- **236-particle-life-song**: runs the causality *forward*. Every audio-reactive particle demo in the world drives particles from audio; this lets the self-organization BE the music — you hear a swarm's voice bloom as it condenses. The framing inversion is the whole idea, and it lands.
- **234-kids-hand-creature** + **238-kids-tilt-world**: the two pieces that prove the kids zone can escape flat glass. MediaPipe hands conducting a noise-displaced 3D blob; tilt rolling a marble through a 3D hill-world with spatial-panned audio. Embodied music for 4-year-olds — exactly the direction the other five kids builds should have taken.

## Pruning candidates (concept-level, NOT for deletion — immutability rule still holds)
- **224, 226, 228, 230, 232** (glow-garden / face-song / creature-grow / bubble-duet / rain-xylophone): five consecutive kids builds with the same skeleton — tap a 2D canvas → pentatonic triangle chime → BANDIMAL sizing → ambient C+G pad → sparkle burst. Each is individually competent and 4yo-safe. Collectively they ARE the local minimum the mandate was written to climb out of. What was missing: a non-touch input, a third subsystem, a named reference, or any research backing. Zero of the five hit two floor criteria.
- **227-paths-granular**: an *adult* build that still landed at the floor. First granular engine in the lab (a genuine, valuable first) — but wrapped in the least ambitious possible shell: one uploaded source, five sliders, a flat canvas. The lab's first granular synthesis deserved a bigger frame than a texture toy. (Honest taste note: Karel **loved** this one, and `223-fourier-paint`, despite both scoring low on the floor — so the floor and Karel's taste are not the same axis. Granular-of-your-own-piano clearly resonates; the lesson is to give that resonance a more ambitious vessel, not to dismiss it.)

## Provocations for tomorrow's dream cycle
- **Orchestrate the kids cadence — stop shipping solo kids builds.** The two floor-4 kids pieces (234, 238) were both orchestrated DEEP/WIDE fires; the five floor-0 ones were all solo. The fix isn't "try harder on kids," it's "run the same WIDE/DEEP fan-out on the kids cycle that you run on adults." A solo kids cycle regresses to the chime every time.
- **The kids touch+canvas2d+pentatonic triple is banned for a week.** Every kids build for the next 7 days must use a non-touch input (MediaPipe / tilt / mic-pitch) OR three.js. 234 and 238 already showed the door — walk through it again, don't slide back to flat glass.
- **The "fly through YOUR music" thread is the lab's richest vein — go DEEP, don't let it cool.** 243 shipped; its siblings `spectral-tunnel` and `spectral-canyon` are build-verified and banked in IDEAS.md. Resurrect one this week. One volumetric build is a demo; three is a body of work.
- **The cycle-271 reactive-accompaniment / WebGPU-compute thread is unbuilt past 243.** The `duet-shadow` seed (mic onset → generative answer) is sitting there, and `225-aria-companion` already proved the dialogue UX with a Markov chain. Fuse them: extend 225 into real reactive accompaniment on the compute frontier instead of seeding yet another idea.
- **Spend a cycle in the real-world-data category 233 opened.** Its own README seeds `weather-score` (NOAA/SWPC Kp → drone), `transit-pulse` (live flight/AIS → spatial arpeggio), `iss-pass`. The lab was empty here two days ago and now has exactly one piece. Build a second so it's a category, not a fluke.
- **Be precise about what's actually overused.** FFT+canvas is NOT the problem in this window (only 229 + 243 use FFT). The genuinely over-mined combo is the kids pentatonic-chime template. Ban that, not FFT.

## Karel-facing line
Top of the night is the best the lab has ever shipped — the orchestrated builds (233/234/236/238/243) all cleared the ambition floor — but the five solo kids cycles in between collapsed into near-identical pentatonic tap-chimes, so the verdict is: run the orchestrator on the kids cadence too, or keep paying for the local minimum.
