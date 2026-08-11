# Hearthbreath

**Route:** `/dream/10120-hearthbreath`

> What if you had to keep a fire alive with your own breath — and the fire's life,
> spread, and death were a real physical combustion simulation you could hear
> crackling?

A warm bed of glowing coals that you tend with your breath. The coals are not a
decorative shader — they are a real **combustion-front cellular automaton** in
the lineage of the Drossel–Schwabl forest-fire model. You keep the hearth alive
by breathing (the mic is oxygen); fall silent and the front stalls and dies to
grey ash. Feed it or lose it.

## How it works

- **Rendering.** The automaton runs as a **WebGPU compute shader** on a 256×256
  grid using ping-pong storage buffers (`vec4<f32>` per cell: fuel, temperature,
  char). A fragment blit maps each cell to the ember palette. If `navigator.gpu`
  is absent or any WebGPU call fails, it falls back cleanly to the **identical
  rules on a CPU typed-array grid** (128×128) drawn to a Canvas2D `ImageData`.
  A small note reports which renderer is active and if the fallback engaged.
- **Audio.** Web Audio noise buffers + BiquadFilters only — **no pitched
  oscillator, no drone**. Everything gates on activity, so a dead hearth is near
  silence.
- **Input.** Sensor-first with a real degrade ladder (see below).

### The combustion-CA rules (per cell, per step)

Each cell holds `fuel` (unburnt wood, 0..1), `temperature`, and `char` (ash).

1. **Diffusion.** Heat spreads to the 4 neighbours via a Laplacian
   (`temp += 0.16 * (up+down+left+right - 4*temp)`). Because heat spreads
   *before* it decays, a **travelling burn-front** emerges rather than a uniform
   blob.
2. **Ignition + combustion.** A cell whose temperature exceeds the ignition
   threshold (`0.42`) and still has fuel ignites: it consumes fuel, converts it
   to char, and releases heat (`temp += burn * 3.2`). Newly-crossed ignitions are
   counted for the audio crackle.
3. **Radiative cooling.** Every step temperature decays (`temp -= cool*temp`).
   With no draft the cell drops below ignition and dies to ash.
4. **Seeding.** Painting with the pointer injects fuel + a spark inside a small
   radius (drop a fresh log).

Fuel turns to glowing coal turns to grey char — a real front that spreads and
dies in patches.

### Breath → oxygen mapping

The player's breath is the **global oxygen / draft** level `oxygen ∈ [0,1]`:

- higher oxygen → larger fuel burn rate (`0.018 + 0.06*oxygen`) and **reduced
  cooling** (`cool = 0.045 * (1 - 0.65*oxygen)`), so the front travels and
  brightens (the fire roars);
- silence → cooling wins, the front stalls, coals cool to grey ash and the
  hearth dies.

The raw breath signal is smoothed with an attack/release envelope (fast attack,
slow release) before it drives the sim.

### Audio (inharmonic, physics-driven)

- **Crackle:** each frame, the number of cells that *newly ignited* triggers
  short filtered-noise bursts (bandpass, randomized center 0.9–4.5 kHz, fast
  exponential decay). Rhythm emerges from the physics, not a clock.
- **Roar:** a warm lowpass-noise bed (~300–800 Hz) whose gain tracks total grid
  heat.
- **Wind:** a bandpass-noise layer tracking the player's live breath signal.

### Input degrade ladder

1. **Microphone breath** — `getUserMedia({audio})` → bandpass → `AnalyserNode`;
   short-term RMS of the time-domain signal is the oxygen driver. Blow near the
   mic to fan the front.
2. **Pointer "fan the coals"** — if mic is denied/unavailable, drag across the
   bed as a bellows (drag speed = draft) and paint fuel + sparks.
3. **Auto self-tending ghost breath** — always available: a deterministic seeded
   oscillation (mulberry32 seeded `0x10120`, never `Math.random`) breathes the
   hearth on its own, so the piece is alive on load with no permissions. A
   visible toggle switches mic / auto.

### Record / Replay

A rolling 20-second ring buffer always captures the breath/draft signal.
**Record breath** snapshots it; **Replay** feeds the snapshot back as the oxygen
driver so the hearth re-lives your tending gesture hands-free.

## Named reference

Drossel, B. & Schwabl, F. (1992). *Self-organized critical forest-fire model.*
**Physical Review Letters, 69, 1629.** This piece adapts that model's
fuel/fire/empty lattice into a continuous fuel–temperature–char combustion front
driven by breath as oxygen.

## Honest limitations

- The grid is small (256² GPU / 128² CPU) with reflective edges, so it is a
  stylized hearth, not physical fire dynamics.
- GPU ignition/heat counters are read back asynchronously a few times per second
  (to avoid pipeline stalls), so crackle density is a smoothed estimate rather
  than exactly one pop per ignited cell. The CPU path counts exactly.
- Microphone sensitivity varies by device; the pointer bellows and auto breath
  exist precisely so the piece is fully demoable without a mic.
- Brightness changes are deliberately slow (smoothed oxygen, gradual front
  advance) to respect photosensitive-epilepsy safety — no strobe, nothing
  flashing above ~3 Hz.

## Design notes (modal text)

> A hearth you tend with your own breath. The coals are a combustion-front
> cellular automaton in the lineage of Drossel & Schwabl's self-organized-critical
> forest-fire model (Phys. Rev. Lett. 69, 1629, 1992). Each grid cell holds fuel,
> temperature, and char; heat diffuses to its neighbours, fuel above the ignition
> threshold ignites and releases heat, spent cells cool to ash — so a travelling
> burn-front emerges rather than a uniform glow. Your breath is the global oxygen
> / draft: loud breath raises combustion and slows cooling so the front travels
> and roars; silence lets it die. Sound is inharmonic and physics-driven —
> filtered-noise crackle proportional to new ignitions, a warm bed tracking grid
> heat, and a wind layer tracking your breath. No pitched drone; a silent hearth
> is near silence.
