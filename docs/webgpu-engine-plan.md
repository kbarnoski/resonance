# WebGPU particle engine: plan

Drafted 2026-10-13 (foundation phase, isolated from the show). The step from today's
WebGL2 GPGPU engine to a WebGPU **compute** engine: 10⁵–10⁶ particles, real fluid for
the smoke and ink souls, collisions with each still's depth map, and optimal-transport
(shortest-path) form changes. Karel greenlit "mind blowing professional grade" work.

Context: `docs/journey-viz-frontier-2026.md` (tier 3 #13), `docs/particle-upgrade-plan.md`
(v2 effects-from-parts, imagery-aware particles), `docs/particle-perf-audit-2026-10-07.md`
(kiosk stall laws), `docs/karel-feedback-queue.md`.

**Laws that bind every phase:**

- **Seizure safety.** No brightness flicker. Everything is eased. Light only moves through
  the exposure governor's slew limit.
- **Motion, not brightness.** The music moves forces. It never moves size, alpha or colour
  luminance, and never moves on the beat.
- **Snowflake and Ghost get the new engine** (Karel 2026-10-13: "i do want the new particle
  engine and all that in snowflake and ghost. just not new particle shaders in them"). See §4.1.
- **Sample before batch.** Every phase ships behind a flag. Karel picks on film, side by side
  with WebGL.
- **No sync GPU work on the kiosk** (§5).

---

## 1. The engine today (WebGL2), end to end

`src/lib/particles/particle-engine.ts` (2,264 lines) and `shaders.ts` (2,309 lines). One
engine and one context per session (`shared-engine.ts`), re-parented into whichever journey
plays. The journey layer `src/components/audio/particle-lead-layer.tsx` drives it through
the `ParticleEngine` interface (~70 methods).

| Stage | What it does |
|---|---|
| State | N×N RGBA32F textures: `pos` (xyz, age) and `vel`, ping-ponged and written by one MRT pass. `seed` (band skewed low, 3 randoms) is written once by `SEED_INIT_FS`; the boot cloud by `POS_INIT_FS`. `texSideFor` caps at 1024² (1,048,576). The kiosk runs 400² (160k). |
| SIM | One full-screen fragment pass. `buildSimFS([soul])` holds **one small program per soul** (47 souls; the 2026-10-05 hang came from a union program). The force stack runs in order: soul force law (`soulForce`, with form variants, field instances, unfold) → harmonic currents → breath → light gravity → two hands (flag) → living score (flag) → image spring (`(imgT − p)·9`, drag 4.6, spatial-pairing softness) → impulses (scatter, bounce, melody/follow) → **acceleration cap** (`uAccCap`) → speed cap → respawn (rise/wrap/fountain/smoke/ink, staggered rebirth with age < 0) → NaN guard. |
| SPECTRUM | 128-bin RG16F texture (level, drive). Each particle reads its own band. |
| DRAW | `gl.POINTS × N²`, attribute-less (`texelFetch(gl_VertexID)`). Soft gaussian sprites, additive into an RGBA16F HDR target that holds trails (`FADE_FS`: prev × decay). Palette by band, YIQ hue/sat (luma kept), image colours, the bridge, living fire, DOF/drift (cine), stable motes (`?stable=1`), streaks (`?trails=1`). |
| TAA | `?stable=1`: a 3×3-clamped history resolve. |
| LUM/EXPO | Every 4th frame: mip-downsample → 16×16 → a 1×1 exposure slew (≤ ~25 %/s, cap 0.16). Entirely on the GPU. |
| GLOW | `?glow=1`, cine only: quarter-res bloom, low-passed in time. **Off in the show** (flicker). |
| COMP | Hue-preserving tone map, sRGB, black-gated IGN dither. |
| Pairing | `?pfx`: five passes per image (polar histogram, CDFs, assign), no readback. |
| Readiness | KHR_parallel_shader_compile. Every program is warmed by a 1-pixel draw while invisible. A watchdog (gap/CPU/fail) turns particles off for the session. |

CPU side: the critically damped followers (`springTau`, `critStep`), the palette spring, the
retarget glide, figure staging (`crossesStep`/`figureHeld`), the settle detector, and the
camera orbit with off-centre placement. These are cheap, and the WebGPU engine reuses them
verbatim.

The limits WebGPU removes:

- Fragment-shader GPGPU can't scatter, so there's no P2G, no binning and no sorting.
- There are no atomics and no shared memory.
- Each pipeline is built at first draw (the warm dance).
- Points are capped at an implementation-defined size and can't be sorted.

---

## 2. Architecture

### 2.1 State: storage buffers, structure of arrays

Each particle owns one `vec4f` per stream. Updates happen **in place**: a particle reads and
writes only itself, so no ping-pong is needed.

| Stream | Content | 1M motes |
|---|---|---|
| `pos` | xyz, w = age (< 0 = fading in) | 16 MB |
| `vel` | xyz, w = band level (phase C: fluid weight) | 16 MB |
| `seed` | band, 3 randoms (PCG hash of the index; never re-seeded, so colours never pop) | 16 MB |
| `uv` ×2 | importance-sampled image coordinates, double-buffered | 16 MB |

The render pass reads only `pos` and `seed`, so velocity bandwidth isn't paid at 10⁶.
Uniform blocks are declared once (`webgpu/layout.ts`). JS offsets and WGSL structs are
generated from that one list, so a padded `vec3` can never drift between the two.

### 2.2 Compute passes (one frame)

1. **integrate**: the force stack, a `@workgroup_size(256)` dispatch over N, 2-D past 65,535
   groups. Each force is a WGSL module with a fixed contract: it reads `p, v, s, drive`, adds to
   `f` and `drag`, and may set the snap target. `buildSimWGSL(forces)` concatenates the forces
   it's asked for. This is the "effects from parts" model from the upgrade plan, and it ports
   the WebGL forces one at a time with no giant union program.
   - **Phase A forces:** form spring, image spring, curl drift (per-mote band drive), impulses,
     acceleration cap, speed cap, NaN guard (bit-pattern test, because fast-math folds `x != x`).
   - **To port (§A.2–A.3):** the 47 soul laws (as modules), currents, breath, light gravity,
     two hands, living score, melody/follow, hover, respawn/wrap.
2. **fluid** (phase C): a 2.5-D grid, P2G/G2P (§2.4).
3. **collide** (phase D): the still's depth field (§2.5).
4. **bin** (phase B): a per-tile counting sort for DOF and splatting (§2.6).
5. **govern**: the WCAG 2.3.1 governor. One workgroup computes the **exact** mean displayed
   luminance over a stride-2 grid of the HDR frame (no mip aliasing, so the mean can't jitter
   as motes cross mip cells), then slews exposure by ≤ `1 − e^(−0.3·dt)` per frame. It's
   written to a storage buffer and never read back.

### 2.3 Render

- **HDR pass**:
  1. The trail fade is a full-screen triangle whose *blend* does the work
     (`src·0 + dst·constant`, constant = `trail^(dt·60)`). One target, no ping-pong.
  2. Then the **instanced sprites**: 4-vertex strip × N, vertex-pulled from storage, additive
     into rgba16float.
- **Energy-conserving sprites** (live in phase A). The drawn footprint never goes below `minPx`
  (1.5 px, σ ≥ 0.5 px: band-limited, so there's no sub-pixel shimmer as a mote drifts). The
  peak scales by 1/area, so **a mote's total light is the same at any size**. Nearness,
  `setSizeScale` and DOF change the footprint, never the brightness. This replaces the
  stable-mote coverage path and is the foundation of the seizure law at 10⁶.
- **Temporal resolve** (phase B): a compute TAA on the HDR target (3×3 neighbourhood clamp,
  `taaKeep(dt)` from `stable-motes.ts`). It's mandatory at 1M motes and ≤ 1.5 px sizes.
- **Composite**: a hue-preserving tone map, sRGB, black-gated dither to the canvas
  (premultiplied when transparent). It's a direct port.

### 2.4 Fluid (phase C): smoke and ink become real

- **Grid**: a 2.5-D MAC-style grid aligned to the camera. It's 192×108 in screen-plane cells ×
  24 depth slabs (≈ 500k cells, rgba16f velocity plus a scalar density/temperature). The 2.5-D
  layout keeps it cheap, and depth matters less than the screen plane for how it reads.
- **Solver**: stable fluids (Stam):
  - semi-Lagrangian advection (MacCormack for less smearing);
  - vorticity confinement (curl kept alive at low resolution);
  - pressure: red-black Gauss-Seidel, 16–24 iterations, or a 2-level multigrid V-cycle if the
    budget allows.
- **Coupling (PIC/FLIP 0.9)**:
  - P2G: particles splat momentum into the grid with fixed-point `atomicAdd<i32>`. WebGPU has
    no float atomics, so the scale is 2¹⁶ and the result is deterministic.
  - G2P: particles take back the FLIP-blended velocity.
  - Buoyancy comes from the temperature each mote carries.
  - The bass injects plume **momentum** (motion), never density brightness.
- **Souls**: smoke, ink, wisp, flame and aurora gain the fluid; every other soul leaves it at
  weight 0, so it costs nothing there. Ink drops become real dye drops into the grid.

### 2.5 Depth collisions (phase D): particles that live in the imagery

- The pack already has a depth map per still (Depth Anything, from the depth-parallax work).
  Each one is loaded as an r16f texture alongside the still, so the depth is known before the
  still appears.
- A particle is projected into the still's cover-fit screen space. The still is modelled as a
  height field in front of the camera (depth → world distance along the view axis, scaled by a
  per-journey `depthScale`).
- A mote behind the surface is pushed out along the depth-gradient normal. Then
  `v_n → −e·v_n` (restitution 0.2), `v_t` keeps friction 0.9, and the mote slides along.
- Precompute (harvest, offline-safe): a jump-flood SDF of depth edges at 256², so motes flow
  *around* silhouettes ("flow around the figure", "settle on surfaces", "drift through the
  light beams" from the upgrade plan) instead of sticking.

### 2.6 Binning and sorting: DOF and shimmer-free splatting (phase B)

- **Tile binning**: 16×16-px tiles, two counting-sort passes (count with `atomicAdd`, a
  prefix sum in one workgroup per 1024 tiles, then scatter). They run in compute after
  integrate.
- **Two splat paths**:
  - **Tiny motes** (drawn ≤ 2 px, the vast majority at 1M): a compute splat into a fixed-point
    `atomic<u32>` accumulation buffer (R, G, B planes). Integer addition is associative, so the
    result is **bit-identical every frame regardless of order**. That means no blend-order
    shimmer, and it's far cheaper than 10⁶ raster quads.
  - **Large motes** (near, or defocused by DOF): raster quads sorted back to front by depth bin
    (one radix pass on 16-bit depth keys), so bokeh discs layer correctly.
- **DOF** (the cine look): the circle of confusion from depth goes into the footprint only.
  Energy conservation (§2.3) keeps defocus from ever brightening or dimming a mote. That
  removes the flicker failure of the parked bloom.

### 2.7 Optimal-transport form changes (phase E)

Today a re-aim pairs particles by index (contract → expand through the centre). Spatial
pairing (step 1) fixed images with a polar CDF, a cheap approximation of OT.

Phase E uses **sliced optimal transport**:

1. Project the particle cloud and the target sample set onto K random directions (K = 16–32).
2. GPU-radix-sort both (1M keys ≈ 1–2 ms on M-series) and match by rank.
3. Average the displacements, then iterate. The assignment converges toward the W₂-optimal
   (shortest total path) pairing.

It runs **once per form change**, spread over frames while the old form holds (never inside a
visible frame budget; nothing is read back). Motes then travel straight (McCann displacement
interpolation) on the existing critically damped spring and acceleration cap. Morphs become
shortest-path flows with no crossings through the centre. It replaces `uPairSoft` and
spatial pairing (`setImageLiteral` softness becomes a drift on the OT target).

---

## 3. API parity and fallback

### 3.1 The parity engine: conductor + ported passes (phase A, built)

Hand-porting 47 soul laws, every force feature and the draw program would fork the show's
source the day it was written (souls change daily: today's starburst calm, the Yellow Bird
flight). Phase A instead keeps **one source of behaviour**:

- **The conductor** is the show's own WebGL engine (`particle-engine.ts`), unmodified, running
  against a recording WebGL2 context (`webgpu/gl-capture.ts`). That context draws nothing; it
  records each program's uniforms (per program, as GL does), the texture units and uploads,
  and every draw call. Every method, follower, glide, staging rule, image timeline and feature
  envelope is therefore the show's code, and the conductor object *is* the `ParticleEngine` the
  journey layer drives. Its watchdog covers the WebGPU encoding too.
- **The ports.** `webgpu/gl-port.ts` turns the show's GLSL into Vulkan-flavoured GLSL 4.50 with
  a few mechanical edits. Each edit is asserted, so a reshaped source fails loudly:
  - uniforms become one std140 block;
  - particle textures become storage buffers, and the spectrum keeps its LINEAR clamp;
  - the sim's MRT outputs become a 256-wide compute kernel;
  - point sprites become instanced quads (gl_PointCoord from the corner);
  - GL clip z and window y are converted;
  - vertex-stage `texture()` becomes `textureLod(…, 0)`;
  - NaN tests become a bit-pattern check.

  `scripts/gen-webgpu-port.mjs` runs **naga** (wgpu's type-correct translator) and commits
  the WGSL to `port.generated.ts`, along with the source hash it was made from. All 47 souls,
  the figure frame, currents, breath, light gravity, two hands, the living score, the image
  spring, hover, the signature flight and respawn port in one pass, plus the whole draw program
  (image colours, bridge, living fire, depth of field, colour drift, stable motes, trails).
- **The executor** is `webgpu/engine-port.ts`. Each captured draw runs its WebGPU pass:
  - `seedInit`/`posInit` → compute init;
  - `sim` → the ported simulation;
  - `fade` + `draw` → blend-constant fade plus ported sprites;
  - `taa` → the TAA port;
  - `comp` → the exact-mean governor plus composite.
  - the five pairing passes → `pair-wgsl.ts` (compute).
  `lum`/`expo` are replaced by the governor. Bloom is not ported (it's off in the show).
- **Freshness.** The engine warns (lab HUD and console) when the show's GLSL changed after the
  port was generated. `engine-port.test.ts` asserts every edit still applies. The parity test
  fails on a sim or draw uniform the port doesn't carry. Regenerate with
  `NAGA_BIN=… node scripts/gen-webgpu-port.mjs` (`cargo install naga-cli`).

The native compute skeleton (`webgpu/engine.ts`: procedural forms, energy-conserving sprites)
stays as the phase B renderer's test bed (`/lab/webgpu?engine=native`).

### 3.2 Surface, failure and fallback

- `createWebGPUParticleEngine(canvas, opts): WebGPUParticleEngine` returns **synchronously**,
  with the same `ParticleEngine` surface as `createParticleEngine`, so `particle-lead-layer.tsx`
  can drive either engine. The device, context and pipelines resolve asynchronously, and
  `isWarm()` is false until they're done. The layer already keeps the field invisible until
  `isWarm()`, so that contract carries over unchanged.
- **Failure semantics** match WebGL, so `shared-engine.ts` needs no new paths:
  - `navigator.gpu` missing → `ParticleEngineUnsupported` thrown synchronously.
  - Adapter, device or WGSL failure → `opts.watchdog.onStall(why)`.
  - Device loss → `opts.onContextLost`.
- **Backend selection** (`webgpu/backend.ts`):
  - `?gpu=webgpu` opts in. The default is off: the show runs WebGL2.
  - `probeWebGPU()` requests an adapter **without touching a canvas**. A canvas that has given
    out a `webgpu` context can never give a `webgl2` one, so the decision is made on the probe,
    never by trying.
  - `chooseParticleBackend()` falls back to WebGL2 when the flag is off, the probe hasn't run,
    or the probe failed.
- **Wiring** (phase A exit, §A.7): `shared-engine.ts` kicks `probeWebGPU()` at boot and creates
  via `createParticleEngineFor(...)`. Until then nothing in the show imports the WebGPU code,
  and a test asserts it.

## 4. Parity ledger

`src/lib/particles/webgpu/parity.ts` keeps three tables. Tests and tsc enforce them:

- `METHOD_PARITY`: every `ParticleEngine` method, marked **live** (on the GPU now), **state**
  (CPU state kept and glided exactly like WebGL, GPU effect in the named phase) or **planned**
  (a stub). tsc fails if a method is added to the interface and not listed.
- `UNIFORM_PARITY`: every uniform of the WebGL sim (all souls, score and hands on) and draw
  (trails and stable on), **parsed from `shaders.ts` by the test**. A new WebGL force feature
  that isn't mapped fails CI, so the port can't silently fall behind the show.
- `MASTERED_PARITY`: the Snowflake and Ghost checklist (§4.1).

Status with the parity engine (phase A): 70 of 71 methods are live through the conductor;
`setTripwire` (the async velocity probe, §A.6) is the exception. Every sim and draw uniform is
carried by the generated port, and spatial pairing runs as compute.

### 4.1 Snowflake ("first-snow") and Ghost ("ghost")

Karel, 2026-10-13: "i do want the new particle engine and all that in snowflake and ghost.
just not new particle shaders in them."

- **Both run the new engine with every particle feature**: currents, breath, light gravity, the
  score, the bridge, cine, energy-conserving sprites, fluid where their souls call for it,
  depth collisions, OT form changes. This matches `mastered-features.ts`
  (`MASTERS_FEATURES_DEFAULT = true`).
- **Only their shader casts stay locked**, and that's handled elsewhere. Their content (take,
  stills, emblems, scripted particle casts) is unchanged.
- Each signature moment must look **the same or better** on WebGPU before the engine drives
  them. Karel judges it on film, side by side with WebGL at the show count.

| Journey | Moment | Lab case |
|---|---|---|
| Snowflake | Emblem variants snowflake-1…7: gather, hold, release at the calm pace (0.6), spatially paired | `snowflake-emblems` |
| Snowflake | Calm form holds (~25–32 s), slow breath, gentle dolly, never "changing its mind" | `snowflake-calm` |
| Snowflake | Murmuration opening; the swell eases in (no brightness jump); Silk Threads | `snowflake-calm` |
| Ghost | Opening: emblem → slow blob rising **in place** over the tunnel, fine motes (size 0.85, no offset) | `ghost-opening` |
| Ghost | The angel flash: approach ramp, meeting the angel on the beat (flash pace, no glide), wearing it, dissipating; the outline treatment | `ghost-angel` |
| Ghost | Blossom → wings hover hand-off (no back-and-forth), no stall on the final wings | `ghost-blossom-wings` |
| Ghost | Spirit soul, no ribbons, never green; recycled motes fade in by age, staggered (no bunching at the top after the flash) | `ghost-angel` |
| Ghost | Quiet imaging: further, sparser, beside the imagery | `ghost-opening` |

Each lab case drives only the `ParticleEngine` surface, so the identical script runs on both
engines (`/lab/webgpu?case=ghost-angel` against `…&gpu=webgl2`).

**Gates for these two journeys:**

- WebGPU may drive them only after their cases are filmed and approved.
- The worn image **colours** (§A.5) and the soul ports for murmuration, spirit, rings and
  threads (§A.2) must be live first.
- The parity test checks that both journeys stay in the checklist and every case exists.

## 5. Kiosk stall laws, carried to WebGPU

| WebGL lesson (2026-10-05 → 10-09) | WebGPU rule (enforced by) |
|---|---|
| Sync compile/link froze Chrome; the pipeline was built at first draw | Only `createComputePipelineAsync`/`createRenderPipelineAsync`, all at creation. `getCompilationInfo` errors → stall. No pipeline creation after start. (static scan + fake-device test) |
| `getBufferSubData` readbacks blocked 20–236 ms | No `mapAsync` on the frame path. The only one is the opt-in timing probe: one in flight, polled on later frames, never awaited. No `onSubmittedWorkDone`. (static scan) |
| Big main-thread uploads at journey start | Image uv (8 MB at 1M) trickles in ≤ 1 MB per frame into the idle half of a double buffer, then swaps. The image pull holds until it lands. (test) |
| New context per journey | One device and context per session (shared-engine). `dispose()` destroys the device. |
| Re-seed or init loops in JS | `seedInit`/`posInit` compute passes run while invisible (`prewarm`). `setCount` rebuilds on the GPU. (test) |
| `writeBuffer` and the init share a queue timeline | The init passes get their own submit, so the frame's uniform write can't overwrite the init radius. |
| Watchdog | The same gap/CPU contract and the same `hiddenSince` exemption. |
| Main-thread GL syncs stall only on the kiosk | Measure on the kiosk (the lab page), never on a dev box. |

## 6. Performance budgets (kiosk: M4 Pro, 3024×1964 panel)

The show runs the particle canvas at **DPR 1 → 1512×982**. The particles share the frame with
the shader layers, the video morphs and the imagery, so they get **≤ 4 ms GPU at 60 fps**.
DPR 2 (3024×1964) is a stretch goal for phase B and later.

Estimated targets. **To be replaced by lab measurements.**

| Pass | 250k | 1M | Notes |
|---|---|---|---|
| integrate (phase A forces) | 0.15 ms | 0.5 ms | 3 simplex evaluations per mote dominate. M4 Pro ≈ 273 GB/s; 1M × 64 B r/w ≈ 0.25 ms of bandwidth. |
| integrate (full force stack) | 0.4 ms | 1.4 ms | Souls, currents, gravity and score all gated by weight 0. |
| sprites (raster, phase A) | 0.4 ms | 1.5 ms | Fill-bound; 1.5 px floor keeps quads tiny. |
| splat, compute atomic (phase B) | 0.3 ms | 0.8 ms | Replaces raster for ≤ 2 px motes. |
| fluid 2.5-D (phase C, fluid souls only) | 1.0 ms | 1.2 ms | Grid-bound, not count-bound. |
| depth collide (phase D) | 0.05 ms | 0.15 ms | One r16f fetch plus a gradient. |
| govern + composite + TAA | 0.5 ms | 0.5 ms | Resolution-bound. |
| OT re-assign (phase E) | – | 1–2 ms once | Spread across frames while a form holds. |
| **total, steady** | **≈ 2 ms** | **≈ 3.5–4 ms** | |

CPU per frame: ≤ 0.3 ms. That's uniform packing (≈ 600 B), one command encoder and 4–6
passes, with no per-mote JS.

## 7. Phases

Each phase follows the upgrade plan's process: build behind a flag, sample on film, Karel
approves, unit tests plus a full tour, then flip the flag and deploy once (never while he's
watching).

### A: parity port at the same count (160k–410k)

- **A.1 Skeleton (this commit):**
  - device and adapter, async pipelines, storage-buffer state;
  - integrate with form spring, image spring, curl and impulses;
  - fade, energy-conserving sprites, governor and composite;
  - `?gpu=webgpu` backend selection with WebGL2 fallback;
  - the parity ledger; the lab page with mastered-journey cases.
- **A.2–A.5, A.8: done by the parity engine (§3.1).** The souls (all 47, the figure frame,
  variants, field mode, unfold, respawn and wrap), the force stack (currents, breath, light
  gravity, two hands, living score, melody/follow, hover), the image timeline (dissolve, world
  fade, colour mix), the draw features (image colours, tint, hue spread and wave, height
  colour, the bridge, living fire, DOF and drift, stable motes, trails) and the signature
  flight all run from the show's own GLSL, ported by naga, driven by the show's own CPU code.
- **A.6 Probes:** async velocity tripwire and state sampling (mapAsync, one in flight).
- **A.9 Spatial pairing on the GPU (done):** the conductor's five pairing passes run as
  compute (`pair-wgsl.ts`): an atomic<u32> histogram replaces the float-blend point scatter;
  the bins, quantiles and per-mote hash are the same, so emblems gather where the show's do.
- **A.7 Exit:**
  - shared-engine wiring behind `?gpu=webgpu`;
  - the full tour on WebGPU at 160k matches WebGL frame for frame (`scripts/journey-review/`);
  - `no-sync` and parity tests are green;
  - Snowflake and Ghost cases filmed side by side and approved.

### B: 250k–1M

Tile binning, the atomic compute splat for tiny motes, sorted raster for large ones, compute
TAA, then the cinematic look (DOF via footprint, colour drift) with bloom only as a temporally
filtered pass. Velocity streaks are rebuilt as stretched quads.

**Exit:** 1M motes at 60 fps on the kiosk with the shaders running, fpsLow ≥ 58, filmed with
zero shimmer.

### C: fluid

The 2.5-D stable-fluids grid with PIC/FLIP coupling for smoke, ink, wisp, flame and aurora.
Bass injects momentum. A sample comes first (2–3 journeys).

### D: depth collisions

Pack depth maps and the edge SDF at harvest (offline). The collide pass runs, and motes settle
on and flow around the stills' structure. Ghost's tunnel and tree are the reference sample.

### E: optimal-transport form changes

Sliced OT re-assignment per form change (GPU radix sort), straight-line travel on the existing
springs. It retires spatial pairing.

## 8. What to run

- **Lab:** `/lab/webgpu` (not linked anywhere). By default it runs the **parity engine** at
  1,000,000 motes, cycling torus → knot → rose → nebula → lissajous souls.
  - Query options:
    - `?gpu=webgl2` runs the show engine on the same script (A/B);
    - `?engine=native` runs the native compute skeleton (procedural forms);
    - `?n=250000` sets the count (the show engines cap at 1024²);
    - `?form=knot` holds one figure;
    - `?dpr=2` runs at the full panel;
    - `?timing=0` turns timestamps off;
    - the show's own particle flags apply (`?stable=1`, `?cine=0`, …);
    - `?case=snowflake-emblems|snowflake-calm|ghost-opening|ghost-angel|ghost-blossom-wings`
      runs a mastered-journey moment.
  - Keys: space = next figure, 1–5 = figure, ↑/↓ = count ×2/÷2, h = HUD.
  - The HUD shows fps, p5 fps, frame ms, and GPU ms per pass (sim, sprites, govern,
    composite), plus a note if the port is stale.
  - `window.__webgpuLab.snapshot()` returns the same numbers for scripts.
- **Tests:** `nice -n 19 npx vitest run src/lib/particles` covers layout, WGSL, parity,
  backend, both engines against a recording fake device, the port's edits and freshness, and
  the static stall-law scan. With `NAGA_BIN=/path/to/naga` the hand-written WGSL is also
  validated by naga.
- **Regenerate the port** after any change to the sim or draw GLSL:
  `NAGA_BIN=… node scripts/gen-webgpu-port.mjs`.

## 9. Risks and open questions

- **Tint vs naga.** The WGSL is validated with naga, but Chrome compiles with Tint. Tint is
  usually stricter on uniformity. The first kiosk run of the lab is the real check, and
  `getCompilationInfo` errors surface in the HUD.
- **Timestamp quantisation.** Chrome rounds `timestamp-query` to 100 µs unless the WebGPU
  developer feature flag is enabled. Per-pass numbers below ~0.2 ms are approximate; trust the
  totals and fps.
- **One device, two engines.** During an A/B on the kiosk, never run both engines in the show
  at once (two GPU contexts). The lab runs one per page.
- **Fixed-point splat range.** Splatting 1M overlapping motes into one pixel could overflow u32
  at 2¹⁶ scale. Clamp per-mote energy and use 2¹² for dense souls; the test must prove it on a
  worst case (the full field collapsed to the image centre).
- **Fluid on the kiosk.** Grid resolution is the knob. If C costs more than 1.2 ms, drop to
  128×72×16.
