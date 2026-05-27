# Morning digest — last updated 2026-05-27 UTC (Cycle 206)

## New since yesterday

- **Cycle 206 — kids research sweep** (no new prototype)  
  All four Cycle 196 kids seeds were built (marble-run, snow-globe, garden-bloom, raindrop-rhythm).
  Queue was empty → full kids research sweep. Found 4 fresh findings, seeded 4 new prototype ideas
  (see KIDS.md). Recommended next kids build: **`176-kids-lego-sequencer`** (Cycle 208).

## Queued next

- **Cycle 207 (adult)**: `sdf-cave` or `splat-bloom` — both zero deps, one-cycle builds.
  - `sdf-cave` = SDF ray-marching cave interior that breathes with audio. Highest surprise factor
    in the queue. First prototype where the viewer is *inside* the space.
  - `splat-bloom` = 500 Gaussian splat ellipses + additive blending. Painterly, soft. Closest
    aesthetically to `130-tsl-particle-compute` ❤️.
  - **Open question**: which direction do you prefer? (Or should I just pick one?)

- **Cycle 208 (kids)**: `176-kids-lego-sequencer` — 2D pitch × time block grid. Tap to place
  colored blocks on a 5-row × 8-column canvas; a sweep cursor plays each column. First piano-roll-
  style grid for kids. Inspired by BrickMusicTable research (150+ kids ages 3–13 using brick
  sequencers). Zero permissions · Zero deps.

## Recent builds

- **Cycle 205** — `/dream/175-vocal-choir` — sing one note → 3 HRTF harmony voices surround you
- **Cycle 204** — `/dream/174-kids-raindrop-rhythm` (kids) — tap clouds → drops fall → bell on landing
- **Cycle 203** — Research sweep: §§219–226 (vocal-choir, sdf-cave, splat-bloom, score-structure seeded)
- **Cycle 202** — `/dream/173-kids-garden-bloom` (kids) — hold soil to grow musical flower
- **Cycle 201** — `/dream/172-loop-station` ❤️ — 4-slot phase-locked loop station

## Research findings worth a look

From **Cycle 206** kids research sweep (see KIDS.md for full log):

- **Neural Rewards in Children's Improvisation** (Scientific Reports, Apr 2025): fMRI shows kids'
  brains activate reward structures MORE during free improvisation than memorized tasks. Explains
  why sessions with our free-play prototypes run longer. Scientific confirmation that "no wrong
  notes" is the correct design principle.

- **BrickMusicTable** (arxiv 2411.13224, Nov 2024): Lego brick grid sequencer. 150+ children
  ages 3–13 in workshops. Construction-as-composition validated as pedagogy. Our `kids-lego-
  sequencer` is the browser equivalent — first 2D grid in the kids zone.

- **MusiBubbles** (CHI EA 2026, Feb 2026): Web prototype defining 4 verifiable safety principles
  for generative music (bounded output, no sudden transients, cause-effect preserved, auditable).
  A useful checklist for every new kids prototype.

- **Rhythm Pals 2026**: First mainstream kids music app with camera movement detection. Confirms
  `kids-mirror-dance` (MediaPipe hand tracking → music) is timely. Needs ~8MB CDN dep + Karel OK.

From **Cycle 203** adult research (RESEARCH.md §§219–226):
- §224 MUTEK 2026 Sphaîra → `sdf-cave` seed
- §222 WebSplatter → `splat-bloom` seed
- §221 Style Plan Timeline → `score-structure` seed

## Open questions for Karel

- **sdf-cave vs splat-bloom for Cycle 207**: sdf-cave = viewer inside a cave (WebGL SDF + audio);
  splat-bloom = Gaussian splat painting. Both one cycle. Which direction?
- **kids-mirror-dance**: camera + MediaPipe hand tracking for music. ~8MB one-time CDN download.
  OK to proceed on a future kids cycle?
- **vocal-choir polish**: currently pure sine tones for harmony voices. Adding 1 overtone
  (+2×freq, gain 0.08) + convolver reverb would give a choral quality. Worth a polish cycle?
