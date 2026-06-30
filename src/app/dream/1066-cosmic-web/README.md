# 1066 · The Cosmic Web

**One question:** What if the same slime-mold algorithm astronomers use to map
the dark-matter cosmic web were a playable cosmic-ambient instrument — you seed
luminous nutrients into the void and a living filament network grows between
them, and the web's connectivity *sings*?

- **state:** cosmic-web / meditative boundlessness
- **pole:** cosmic-ambient

This is the lab's first **Physarum** (slime-mold / *Physarum polycephalum*)
agent-transport simulation, and it runs as a **WebGPU compute shader**. The GPU
agent field *is* the resonating body — it drives the audio via readback, it is
not a decorative shader you stare at.

## References (what each contributed)

- **Jeff Jones, "Characteristics of pattern formation and evolution in
  approximations of Physarum transport networks" (2010).** The canonical agent
  model used here verbatim: each agent is `{x, y, heading}`, deposits a fixed
  trail, senses three points ahead (forward / forward-left / forward-right at a
  sense angle + sense distance), rotates toward the strongest reading, steps
  forward at constant speed, wraps at the edges. A diffuse+decay pass re-routes
  the network.
- **Sage Jenson, "mold" Physarum artworks.** Borrowed the aesthetic instinct
  that the trail field, tone-mapped and colourised, is itself the artwork — and
  that slow parameter drift makes minute-5 unlike minute-1.
- **Oskar Elek / Joseph Burchett et al., "Monte Carlo Physarum Machine" /
  "Revealing the Dark Threads of the Cosmic Web" (UC Santa Cruz, 2020).** The
  conceptual core: a slime-mold transport model reconstructed the cosmic web's
  dark-matter filaments better than human-designed algorithms. Our "nutrient
  wells → grow filaments between them" loop is that result turned into an
  instrument. (The May-2026 JWST sharpest-ever filament image is the news hook.)

## Technique

### Physarum model parameters (`physarum.ts` `PARAMS`)
`senseAngle 0.52 rad · senseDist 11 px · turnSpeed 0.42 rad · moveSpeed 1.05 px
· decay 0.94 · diffuse 0.62 · nutrientPull 1.9`. Nutrient wells add an
attractive Gaussian halo (`r ≈ 40 px`) to the sensed value, so agents climb the
gradient toward seeds and filaments form between them. Wells are also baked
faintly into the field so they stay luminous before agents arrive.

### WebGPU compute architecture (`gpu.ts`)
Two compute passes + one render pass per frame on a 512×512 field:
1. **Agent pass** (`@workgroup_size(64)`) — 300k agents (clamped to the
   adapter's `maxStorageBufferBindingSize`, up to 1M) in a storage buffer. Each
   senses 3 points, steers, steps, wraps, and `atomicAdd`s its deposit into an
   `i32` fixed-point trail buffer (×1024) — atomics make deposits race-free.
2. **Diffuse/decay pass** (`@workgroup_size(8,8)`) — 3×3 box-blur × decay,
   written to a `f32` trail buffer (and mirrored back to the atomic buffer for
   the next frame's sensing) plus the nutrient glow bake.
3. **Render pass** — full-canvas triangle; the `f32` trail is tone-mapped
   (`1 - e^{-t·0.55}`) through a luminous cosmic palette (deep indigo void →
   violet → cyan-white filaments → gold nutrient cores).

### Readback → audio mapping (the field IS the body)
Every 4th frame a small reduce compute shader downsamples the trail to a 24×24
grid into a mappable buffer, read back with `mapAsync` (one map in flight, never
blocking). On the CPU we compute **`FieldStats`** — identical contract on both
paths:
- **energy** (mean brightness) → drone gain + **lowpass cutoff / brightness** +
  shimmer level.
- **variance** (spatial busyness / branchiness) → **sparse bell density**: bells
  fire when busyness surges and busier networks ring more often.
- **brightest region X** → **slow stereo pan** of the whole field.

### Audio (`audio.ts`)
A warm just-intonation drone bank (fundamental 65.4 Hz + just fifth 3:2 + octave
+ a high 9:2 shimmer, each with a gently detuned partner osc for beating) →
slow lowpass → stereo panner → a **code-generated convolution reverb** (a 4.2 s
decaying-noise impulse, no external files) → soft compressor → master. Sparse
FM bell pings on a just/pentatonic scale ring through the reverb. The
`AudioContext` is created and resumed on the first click (iOS gesture gate).

## Fallback chain
- **WebGPU compute** (primary). A small badge reads
  `text-emerald-300/95 "WebGPU compute"`.
- **No WebGPU → CPU Physarum** on a 256×256 grid with 45k agents (same Jones
  model, same `FieldStats`, same audio coupling), drawn via `ImageData` scaled
  to the display canvas. Badge: `text-amber-300/95 "CPU fallback"`.
- **No audio device (headless review machine):** the sim still renders and the
  autonomous nutrient drift keeps the web moving, so a headless glance shows a
  living, re-routing filament network with zero interaction.

## How to play it
1. **Enter the cosmic web** (starts audio + sim).
2. **Click / drag** anywhere to plant nutrient wells — filaments grow between
   the points you place; nearby clicks reinforce an existing well.
3. Do nothing: pre-seeded wells keep it alive, and an autonomous seeder slowly
   adds / relocates / fades wells (~every 7 s) so the network re-routes and the
   sound evolves over minutes.
4. **mute** toggles the master; everything keeps simulating.

## Next-cycle deepening
- True connectivity sonification: count distinct filament crossings along sample
  lines (graph degree) rather than only variance, and map branch *count* to
  chord voicing.
- Multi-species agents (different sense angles) for competing filament colours,
  panned independently.
- A second `rgba` trail channel for agent age, so freshly-formed filaments
  trigger a brighter "forming" timbre than settled ones.
- Persistent nutrient mass (gravity-like accretion) so wells merge into
  super-clusters over long sessions.
- WebGL2 transform-feedback path between the GPU and CPU tiers for mid-range
  machines.
