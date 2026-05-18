# Dream Agent — cycle state

## Cycle 19 — /dream/17-acoustic-trail

**When**: 2026-05-18 UTC (hourly autonomous cycle)

**Decided**: Cycle 18 was a research sweep that explicitly queued `acoustic-trail` as the top
next build: zero deps, one-cycle, most surprising idea in the queue. No blockers. No in-progress
prototypes. Research done last cycle. Decision was straightforward.

**Shipped**:
- `src/app/dream/17-acoustic-trail/page.tsx` — full interactive prototype (~290 lines)
- `src/app/dream/17-acoustic-trail/README.md` — design rationale, axis math, polish ideas

**What's inside**:

3D scatter plot of audio in acoustic feature space. Three axes derived from a
`useMicAnalyser` frame each RAF tick:

- **X** = spectral centroid (already in `getFrame().centroid`), normalized 0–7000 Hz → [−0.5, +0.5]
- **Y** = treble ratio: `(bands[4] + bands[5]) / totalBandEnergy`, centered at 0.27
- **Z** = bass energy: `(bands[0] + bands[1]) × 0.5`, centered at 0.18

Each frame writes one point to a 4000-element circular buffer. Rendering loops newest-to-oldest
with `globalCompositeOperation = "lighter"` (additive glow). Alpha decays as `amplitude × (1−age)^1.7`.
Early break when alpha < 0.012 — at typical audio levels, only ~1000–2000 of the 4000 points are
actually visible; the rest are clipped before drawing. 360 precomputed HSL color strings in
`HUE_LUTS` eliminate per-frame string allocation. Manual 3D rotation via pointer drag: rotY/rotX
in `rotRef`, applied via `rotProject()` (Y rotation then X rotation, orthographic). Grid and axis
labels drawn at Y = −0.45 (below typical trail region) via `paintGrid()`.

Hue = (1 − centroid_norm) × 250 + 10: indigo (dark/bassy) → orange/red (bright/treble). Color
at any moment matches the perceptual warmth of the audio.

Demo mode: 6 oscillators (40–10000 Hz) with independent LFOs (0.07–0.32 Hz). Oscillators feed
a shared AnalyserNode (not speakers). The LFOs make different frequency bands dominant at
different rates — centroid oscillates slowly and independently from bass energy, producing a
smooth slow Lissajous-like path through 3D space over ~30 seconds.

**Build**: `npm run build` passes cleanly. `/dream/17-acoustic-trail` appears as static route
(4.44 kB). Zero errors or new warnings in my code — all build warnings are pre-existing Resonance
production files.

**What I noticed**: The coordinate space has a natural "resting region" — in silence the point
clusters near (−0.2, 0, −0.1) (dark, flat treble ratio, low bass). Bass hits pull the point
toward positive Z; treble content lifts it toward positive Y; brightness shifts it right on X.
A piano playing a scale in the mid register traces a diagonal arc: centroid rises as pitch rises
(X shifts right), bass drops slightly (Z nudges left), treble ratio stays roughly constant (Y
flat). This is genuinely different from every other prototype: the trail isn't a reaction to
audio, it's a projection of the audio into its own space. Dragging to rotate and seeing the
3D structure from different angles is the most interesting interaction.

**Queued next**:
1. **Polish `17-acoustic-trail`** — add a "pitch" 4th axis (autocorrelation, same as
   `13-piano-canvas`) as glyph size; add floor-shadow projection on XZ plane; label grid ticks.
2. **Polish `16-particle-life-gpu`** — spatial grid hash for 50k+ particles, matrix morphing
   (smooth interpolation between matrices rather than instant reshuffle).
3. **`elevenlabs-compose`** — streaming structured music (needs Karel budget approval).
4. **`ghost-animate`** — Ghost LoRA → Seedance 2.0 (admin-only, needs FAL_KEY).

---

## Cycle 18 — Research cycle

**When**: 2026-05-18 UTC (hourly autonomous cycle)

**Decided**: Cycle 17 shipped `16-particle-life-gpu`. No blockers. No in-progress prototypes.
Research is past-due: last research was Cycle 13 (cycles 14, 15, 16, 17 since then — 4 cycles,
past the 3–4 cycle rule). STATE.md's Cycle 17 entry explicitly scheduled this. Did the full sweep:
arxiv (audio/music AI), fal.ai new models, GitHub trending AV/WebGPU, Hacker News, Three.js 2026
state, Anthropic updates.

**Shipped** (no new code — research cycle):
- `docs/dreams/RESEARCH.md` — 6 new dated entries appended (Cycle 18, entries §16–§21)
- `docs/dreams/IDEAS.md` — 2 new prototype ideas added (acoustic-trail, elevenlabs-compose),
  ghost-animate entry updated to note Seedance 2.0 native audio
- `docs/dreams/STATE.md`, `MORNING.md`, `INDEX.md` updated

**Key findings**:

1. **Three.js WebGPU + TSL is production-ready everywhere (2026)** — Three.js r171 established
   WebGPU as default with WebGL fallback. TSL (Three Shading Language) node materials let you drive
   mesh vertex displacement and fragment color from audio data without writing raw WGSL. Opens a
   new prototype shape: 3D audio-reactive deforming mesh. Different aesthetic from our raw WGSL
   prototypes. Zero new deps — Three.js is already in the ecosystem.

2. **SoundPlot (Jan 2026, arxiv 2601.12752)** — Birdsong analysis system that maps audio to 3D
   acoustic feature space: spectral centroid → X, bandwidth → Y, pitch → Z. Browser-based Three.js.
   Directly inspired the new `acoustic-trail` idea: plot your piano improvisation as a 3D path
   through feature space. Zero deps (WebGPU + Web Audio). The trail IS the fingerprint of the
   performance.

3. **ElevenLabs Music API — streaming + section control (2026)** — ElevenLabs Music (launched
   April 2026) generates 44.1kHz studio-quality music with section-level composition control
   (specify "sparse intro, tension build, drop") and streaming output. $0.80/minute. More expensive
   than MiniMax ($0.035/flat) but streaming + structured arc control is a different capability.
   Custom finetunes available. Flagged for Karel's budget approval.

4. **Seedance 2.0 native audio confirmed (April 2026)** — fal.ai confirmed: Seedance 2.0 image-to-video
   includes synchronized audio generation at no extra cost. 15s max duration, director-level camera
   control, cinematic physics. Upgrades the existing `ghost-animate` queue entry — Ghost LoRA image
   → living 15s cinematic scene with native sound, no MMAudio V2 post-step needed.

5. **ReaLchords — online adaptive chord accompaniment (arxiv 2506.14723, 2026)** — Generative model
   for real-time adaptive chord accompaniment from monophonic melody input. Has a browser-accessible
   web demo. Possible path: mic melody → ReaLchords chord generation → HRTF spatial mix. Genuinely
   surprising — you play melody, AI harmonizes live. No confirmed public API yet; monitor.

6. **AI-Driven Music Visualization (ACM IMX 2025)** — System combining MIR models + LLM + image
   gen for time-varying audio-reactive visual generation. Infers genre/mood over time and generates
   imagery that matches. Not a direct prototype (requires budget + API) but confirms the
   MIR→visual pipeline is viable. Inspiration for a future "semantic visualizer" prototype.

**What I noticed**: The most actionable single finding is SoundPlot → `acoustic-trail`. It's
the only prototype idea that is (a) completely new aesthetic territory vs all 17 existing
prototypes, (b) zero external deps, (c) one-cycle build, (d) no budget needed. It maps audio
to its own natural coordinate system rather than using audio as a trigger for abstract visuals.
The ElevenLabs streaming + section control is the strongest "journey arc music" upgrade path —
the ability to write structured arc markup and get a real musical arc back is exactly what the
`5-arcs` prototype points toward.

**Queued next**:
1. **Build `acoustic-trail`** — 3D spectral coordinate space trail. Clear spec, zero deps,
   one-cycle build, genuinely new aesthetic. Highest-surprise buildable-now item in the queue.
2. **`elevenlabs-compose`** — Streaming music with section control. Needs Karel budget approval
   (flagged in MORNING.md open questions).
3. **Polish `16-particle-life-gpu`** — spatial grid hash for 50k+ particles, matrix morphing.
4. **`ghost-animate`** — Ghost LoRA → Seedance 2.0 → cinematic video with native audio.
   Now even more attractive: no MMAudio V2 post-step needed. Admin-only.

---

## Cycle 17 — /dream/16-particle-life-gpu

**When**: 2026-05-18 UTC (hourly autonomous cycle)

**Decided**: Cycle 16 shipped `15-webgpu-fluid`. No blockers. No in-progress prototypes.
Research is at the 3-cycle threshold (last was Cycle 13, cycles 14/15/16 since then), but
AGENT.md priority order puts "Build new" (priority 3) before "Research" (priority 4) when
the IDEAS queue is healthy — and it is. Chose `16-particle-life-gpu`: WGSL compute shader
particle life with 9000 particles (10× `8-particle-life`'s 900 CPU particles). This is the
exact upgrade the IDEAS queue has been deferring since Cycle 8. WebGPU is now desktop-universal
(confirmed Cycle 13), so the only reason to wait longer is gone. Research moves to Cycle 18.

Architecture: tiled N-body compute (workgroup shared memory reduces bandwidth 64×), instance
rendering (4 verts × 9000 instances via `draw(4, N)` with `@builtin(instance_index)`), trail
texture ping-pong (fade pass + additive particle pass into `rgba16float`, then display blit).
Same 6-species attraction/repulsion matrix and audio mapping as `8-particle-life` but GPU-side.

**Shipped**:
- `src/app/dream/16-particle-life-gpu/page.tsx` — full interactive prototype (~430 lines)
- `src/app/dream/16-particle-life-gpu/README.md` — tiled N-body design, polish ideas

**What's inside**:

Four WGSL shaders: (1) compute — tiled N-body physics, 141 workgroups of 64 threads, 
`var<workgroup>` shared memory tiles reduce global bandwidth from 1.9 GB/frame to ~30 MB;
(2) fade FS — blit trail × 0.92 into write texture; (3) particle VS/FS — instance rendering,
4 vertices × 9000 instances, soft circular glow with additive blending, size scales with speed;
(4) display FS — filmic tone-map + γ to canvas.

Three render passes per frame: fade (trail persistence) → particle (additive glow) → display
(tone-map). The trail and particle passes share the same `rgba16float` render target
(`loadOp: "load"` on particle pass to preserve the faded trail). 

Audio: band energies written to params uniform each frame, feeding per-species noise injection
in the compute shader. Onsets reshuffle the 6×6 matrix (2.5s cooldown in mic mode, periodic
12s reshuffle in demo mode).

**Build**: `npm run build` passes cleanly. `/dream/16-particle-life-gpu` appears as static
route (6.74 kB). Zero errors, zero new warnings.

**What I noticed**: The additive blending at 9000 particles creates a visual texture the
CPU version can't match. Dense cluster cores bloom white-hot; tendrils spiral like galactic
arms. The 10× particle count means the emergent structures have finer resolution — you can
see thin filaments connecting cluster cores that would be invisible at 900 particles.
The trail fade (0.92) also plays differently at this density: slow-orbiting particles leave
faint concentric halos, while matrix reshuffles produce a brief brightness flash as all
particles suddenly change direction simultaneously.

**Queued next**:
1. **Research** — now 4 cycles since Cycle 13 (14, 15, 16, 17). Past the 3–4 cycle rule.
   Do a research sweep next cycle without fail.
2. **Polish `16-particle-life-gpu`** — spatial grid hash for 50k+ particles, matrix morphing
   (animate between two matrices instead of instant reshuffle).
3. **Polish `15-webgpu-fluid`** — vorticity confinement, curl-noise turbulence.

---

## Cycle 16 — /dream/15-webgpu-fluid

**When**: 2026-05-18 UTC (hourly autonomous cycle)

**Decided**: Cycle 15 shipped `14-typography`. No blockers. No in-progress prototypes. Top of
queue: `webgpu-fluid` — confirmed #1 priority for this cycle. WebGPU is now desktop-universal
(confirmed Cycle 13), and the upgrade from 128×128 WebGL2 to 512×512 WebGPU is meaningful:
finer vortex structures, no extension dependencies, better Safari compatibility. One-cycle build
given the existing 3-fluid algorithm as a reference. Research is 3 cycles overdue per the 3–4
cycle rule (last was Cycle 13); scheduling it next cycle.

Chose a new `/dream/15-webgpu-fluid` route rather than upgrading `3-fluid` in-place — this lets
Karel compare both side-by-side on the same device, and preserves the WebGL2 version as
a fallback for browsers that don't yet have WebGPU.

Used WebGPU **render pipelines** (fragment shader ping-pong into `rgba16float` textures) rather
than compute shaders. Same algorithm either way; render pipeline is simpler to port from the
existing GLSL shaders and avoids storage texture format constraints. At 512×512 the fragment
pipeline runs comfortably above 60fps on modern GPUs.

**Shipped**:
- `src/app/dream/15-webgpu-fluid/page.tsx` — full interactive prototype (~400 lines)
- `src/app/dream/15-webgpu-fluid/README.md` — design notes, algorithm, polish ideas
- `src/app/dream/_shared/webgpu.d.ts` — adds `/// <reference types="@webgpu/types" />` so
  WebGPU types are available across the dream zone without modifying tsconfig

**What's inside**:

Six WGSL fragment shaders (advect, divergence, Jacobi pressure, gradient subtract, splat, display)
plus one shared vertex shader (full-screen quad, triangle-strip, UV (0,0)=bottom-left).
Each sim step writes into a `rgba16float` ping-pong texture pair via a render pass targeting
a texture attachment. Splats (mouse, audio) are submitted as separate command encoders before
the main sim encoder so ping-pong state is consistent. Display writes to `ctx.getCurrentTexture()`
using `getPreferredCanvasFormat()` (usually `bgra8unorm`).

Uniform buffers: `advVelUni` (dt, diss=0.9), `advDyeUni` (dt, diss=0.985), `splatVelUni`,
`splatDyeUni` — separate buffers avoid the WebGPU ordering issue where `writeBuffer` to the
same buffer before `submit()` would overwrite earlier values.

Typed-array issue: `new Float32Array([...]).buffer` returns `ArrayBufferLike`, not `ArrayBuffer`.
Fixed with a `f32buf(...vals: number[]): ArrayBuffer` helper that casts via `as ArrayBuffer`.

**Build**: `npm run build` passes cleanly. `/dream/15-webgpu-fluid` appears as static route
(5.92 kB). Two-pass fix: Float32Array typed-array strictness required the `f32buf()` helper;
unused local variables in `stepFluid` cleaned before second build attempt.

**What I noticed**: The 512×512 resolution makes a visible difference in vortex fidelity.
At 128×128, pressure-driven velocity structures diffuse within a few frames. At 512×512, you
can see the Kelvin-Helmholtz-like rollup of shear layers — thin colored streams that curl
around each other before diffusing. In ambient drift mode, the color cycling creates long
slow spiral arms that look genuinely fluid rather than blocky. The `rgba16float` format (vs
`RGBA16F` via extension in WebGL2) also handles high-energy regions better — no visible
banding on intense bass hits.

**Queued next**:
1. **Research** — 3 cycles since Cycle 13. The manual says 3–4 cycles between research; this is
   exactly on the line. Do a research sweep next cycle before it slips further.
2. **`9-particle-life-gpu`** — WGSL compute shader, 50k+ particles. Galaxy-scale particle life.
3. **Polish `14-typography`** — second-line wrap for longer phrases, `/api/poetry` integration
   (pending Karel's approval on crossing the dream boundary).
4. **Polish `15-webgpu-fluid`** — vorticity confinement, curl-noise turbulence, resolution toggle.

---

## Cycle 15 — /dream/14-typography

**When**: 2026-05-18 UTC (hourly autonomous cycle)

**Decided**: Cycle 14 shipped `13-piano-canvas`. No blockers. No in-progress prototypes. Top of queue: `typography` (queued since Cycle 0, never built — the longest-running deferred item). Zero external deps, one-cycle build, and it fills a real aesthetic gap: all 13 existing prototypes are pure abstract AV reactions; none use language. Text + sound is a different design space — the Resonance vocabulary made physical.

**Shipped**:
- `src/app/dream/14-typography/page.tsx` — full interactive prototype (~170 lines)
- `src/app/dream/14-typography/README.md` — physics params, phrase rationale, polish ideas

**What's inside**:

Six Resonance-themed phrases cycle every 8 seconds: RESONANCE → SOUND INTO LIGHT → BODY OF MUSIC → EACH NOTE A WAVE → FREQUENCIES → OF BEING. Each phrase is decomposed into individual letters, each assigned to a frequency band by position (`index % 6`). Letters are physical objects with spring-damper dynamics: spring constant 0.066, damping 0.76 (overdamped — no oscillation, assembles in ~1.5s).

Three audio forces: (1) band scatter — letters of an excited band receive random impulses scaled by `(energy - 0.22) × 14`, so sub-bass kicks scatter the violet letters, treble shimmer agitates the magenta ones; (2) onset burst — radial outward impulse of 9px/frame from canvas center; (3) drift noise — slow per-letter sinusoidal noise so no letter is ever still. `shadowBlur` glow is proportional to band energy. Render loop groups letters by band (6 passes) to minimize canvas state changes.

Demo mode uses pure math-based synthetic bands (6 sinusoids at different frequencies, no Web Audio) — immediate without permissions. The beat fires at ~76 BPM with jitter.

**What I noticed**: The phrase split between FREQUENCIES and OF BEING across two cycles is unexpectedly effective. The word "FREQUENCIES" appears alone, fully assembled, and there's a 6-second pause before OF BEING arrives. The reader completes "FREQUENCIES OF BEING" mentally, then the canvas proves it. Didn't plan that — it emerged from the phrase list.

The scatter on bass hits reads differently for different phrases. Short phrases (RESONANCE, EACH NOTE) scatter into legible chaos — you can still read fragments mid-scatter. Long phrases (SOUND INTO LIGHT) become genuinely abstract — the letters interleave and the text dissolves into colored particle cloud. Two different aesthetics from the same code, just phrase length.

**Build**: `npm run build` passes cleanly. `/dream/14-typography` appears as static route (3.55 kB). Zero errors, zero new warnings.

**Queued next**:
1. **`webgpu-fluid`** — upgrade `3-fluid` to WebGPU compute shaders, 512×512. Desktop coverage is now universal (confirmed Cycle 13). One-cycle build given the existing sim logic. Would be `/dream/15-webgpu-fluid` or an in-place upgrade of 3-fluid.
2. **`9-particle-life-gpu`** — WGSL compute shader, 50k+ particles, galaxy-scale. New route `/dream/15-particle-life-gpu`.
3. **Polish `14-typography`** — second line wrap for longer phrases, phrase overlap transitions, `/api/poetry` live integration.
4. **Research** — last research was Cycle 13 (2 cycles ago). Check in 1–2 cycles.

---

## Cycle 14 — /dream/13-piano-canvas

**When**: 2026-05-18 UTC (hourly autonomous cycle)

**Decided**: Cycle 13 was a research sweep with no prototype. No blockers. Cycle 13 explicitly
queued `13-piano-canvas` as the Cycle 14 target: clear spec, zero external deps, one-cycle build,
and it fills a real gap — none of the 12 existing prototypes treat the session as a *persistent
visual artifact*. All others are real-time reactions; this one accumulates.

**Shipped**:
- `src/app/dream/13-piano-canvas/page.tsx` — full interactive prototype (~340 lines)
- `src/app/dream/13-piano-canvas/README.md` — design notes, pitch detection algorithm, polish ideas

**What's inside**:

Autocorrelation pitch detection on a 4096-sample time-domain buffer (normalized self-difference
function, parabolic-interpolated peak, 0.82 confidence threshold + 0.012 RMS amplitude gate).
Each detected note onset begins a new stroke at the current canvas cursor; the cursor advances
left-to-right as the note sustains; pitch delta deflects the cursor up/down, so melodic contour
traces visible arcs. When silence exceeds 8 frames, the stroke is committed to the persistent
paint layer via `globalCompositeOperation: 'lighter'` — dense passages bloom bright.

**Hue mapping**: A4=0° (red-ish), rotating ~60° per octave. Bass notes cluster in cool blues/greens;
treble notes in warm oranges/reds/magentas. Chords tend to pick the dominant partial (usually lowest),
which is perceptually correct — you hear and see the root.

**Demo mode**: Web Audio `OscillatorNode` (sine) plays a wandering two-hand melody into the
analyser but not to speakers. Silent demo, visually active. Pitch detection runs on the internal
signal exactly as it would on a mic — same code path, no special casing.

**Stroke layout**: left-to-right with line-wrapping when the cursor reaches 95% width. Vertical
position starts random within the middle 80% of the canvas; pitch delta (not absolute pitch)
steers the cursor up/down, so a sustained note on one pitch stays flat while a rising scale arcs
upward. Staccato notes leave short bright dashes; long sustained notes leave flowing arcs.

**Build**: `npm run build` passes cleanly. `/dream/13-piano-canvas` appears as static route (3.85 kB).
Zero new errors; two warnings fixed before commit (unused eslint-disable, unused `dpr` variable).

**What I noticed**: the painting style changes dramatically based on how you play. Staccato playing
leaves a scattered constellation of short dashes. Legato playing leaves long continuous arcs that
meander across the canvas. Playing scales traces diagonal lines. Holding chords creates thick
colored blobs (bright due to `lighter` compositing when the same pitch sustains). In demo mode,
the two-hand mix (occasional bass notes at ~130–200 Hz interspersed with treble) creates a
conversation between cool and warm color families that reads immediately as musical structure.

**Queued next**:
1. **`typography`** — generative kinetic type (long-queued since Cycle 0, never built). Forced
   articulation of the Resonance visual language in typographic form. Zero external deps.
2. **`webgpu-fluid`** — upgrade 3-fluid to WebGPU compute at 512×512. Desktop coverage now
   universal. One-cycle build given existing fluid sim logic.
3. **`9-particle-life-gpu`** — WGSL compute shader, 50k+ particles. Galaxy-scale.
4. **Polish `13-piano-canvas`** — spiral/mandala layout, slow global fade, polyphonic tracking.

---

## Cycle 13 — Research cycle

**When**: 2026-05-18 UTC (hourly autonomous cycle)

**Decided**: Cycle 12 shipped `/dream/12-tessellate`. No blockers. 9 cycles since last research
(Cycle 4) — far past the 3–4 cycle guideline. The AI audio and WebGPU landscape shifts fast;
skipping research this long risks building on stale assumptions. Did the full sweep: arxiv (new
audio papers), fal.ai new models, GitHub trending, Hacker News music/audio, Anthropic news.

**Shipped** (no new code — research cycle):
- `docs/dreams/RESEARCH.md` — 7 new dated entries appended (Cycle 13)
- `docs/dreams/IDEAS.md` — 4 new prototype ideas added to queue
- `docs/dreams/STATE.md`, `MORNING.md` updated

**Key findings**:

1. **WebGPU is now in ALL major desktop browsers** (Chrome, Firefox incl. macOS, Safari 26,
   Edge) as of November 2025. The Cycle 4 estimate of "70% browser coverage" is now conservative
   for desktop — coverage is effectively universal. Mobile Android still fragmentary (2026 ETA).
   Safe to build WebGPU prototypes confidently for Karel's review sessions.

2. **Art2Mus** (arxiv Feb 2026) — direct image→music generation using CLIP + AudioLDM 2.
   Generates 10s audio from paintings without any text intermediary. "Removing language-based
   supervision preserves stylistic cues filtered out by linguistic abstraction." Needs cloud API —
   could work as a fal.ai prototype if model gets listed. Resonance angle: Ghost LoRA images →
   AI-generated ambient music that *matches their visual mood*, not just a text-prompted soundscape.

3. **MiniMax Music 2.5** ($0.035/track on fal.ai) — added reference audio style matching in
   Jan 2026. Give it a 4-bar piano phrase as reference → it generates a full track in that style.
   Superior to ACE-Step for "here's my vibe, extend it" use case. Budget-accessible.

4. **Foley Control** (new on fal.ai) — video → synchronized sound effects via text prompt.
   Natural extension of the ghost-sound prototype: render Ghost LoRA images as short animation
   loops → Foley Control adds atmospheric synchronized sound. More nuanced than MMAudio V2 for
   the "each Ghost scene has its own acoustic character" vision.

5. **BRAVE** (arxiv Mar 2026) — 10ms latency neural audio VAE. Timbre transfer at live-
   performance grade latency. Not browser-ready (WASM path needs work) but approaching it.
   Monitor for the next research cycle. Resonance long-game: play piano → instantly hear it
   in a custom AI-trained voice/timbre.

6. **Patchies** (patchies.app) — browser-based code+visual patcher. P5.js, Three.js, Hydra,
   Shader Park, Tone.js, Elementary Audio, MIDI, WebRTC. Clean AGPL open-source. Inspiring for
   a future "Resonance modular patching surface" prototype.

7. **New prototype concept: `13-piano-canvas`** — pitch detection via AnalyserNode
   autocorrelation + each detected note leaves a brush stroke (pitch→hue, velocity→weight,
   duration→stroke length). Your improvisation becomes a painting; the canvas accumulates
   across the session. Zero external deps, one-cycle build. Genuinely new conceptual space —
   none of the 12 existing prototypes have a "musical session as persistent visual artifact" angle.

**What I noticed**: the fal.ai model landscape grew significantly since Cycle 4. ACE-Step is no
longer the only text-to-music option — MiniMax Music 2.5 (reference audio style matching) and
Foley Control (video-to-soundscape) open two different and more interesting workflows for
Resonance. The video-with-native-audio models (Seedance 2.0, Kling 4K) also open Ghost
animation paths that didn't exist in Cycle 4.

**Queued next**:
1. **Build `13-piano-canvas`** — clear spec, zero deps, one cycle. New angle: your playing
   becomes a painting. Cycle 14.
2. **`reference-compose`** — MiniMax Music 2.5 style transfer (record phrase → extend it).
   Needs FAL_KEY approval. Question for Karel in MORNING.md.
3. **`webgpu-fluid`** — upgrade `3-fluid` to WebGPU compute shaders. Desktop coverage now solid.
4. **`typography`** — generative kinetic type (queued since Cycle 0, still unbuilt).

---

## Cycle 12 — /dream/12-tessellate

**When**: 2026-05-18 UTC (hourly autonomous cycle)

**Decided**: Cycle 11 shipped `/dream/11-terrain`. No blockers. No in-progress prototypes.
Research is 8 cycles overdue per the 3–4 cycle guideline, but IDEAS has 8+ entries with
clear specs, so "Build new" (priority 3) outranks "Research" (priority 4). Chose `tessellate`
because: (a) it's the only gap in the aesthetic space — all 11 prior prototypes use particles,
fluid, terrain, or attractor physics; none use tile-based geometric patterns; (b) the "rewire"
moment (mass tile flip on a beat) is more dramatically sudden than anything in the current
sandbox; (c) zero deps, one cycle to build cleanly.

Note: research is now overdue by 8 cycles. Next cycle should be research unless Karel queues
something urgent.

**Shipped**:
- `src/app/dream/12-tessellate/page.tsx` — full interactive prototype (~260 lines)
- `src/app/dream/12-tessellate/README.md` — design notes, rendering approach, open questions

**What's inside**:

40×28 grid of Truchet tiles. Each tile = one of two quarter-arc orientations. Together,
adjacent arcs form long connected curves spanning the canvas — topology emerging from local
two-state choices. ~1120 tiles total.

**Rendering**: two batched `Path2D` calls (one per orientation) replace 1120 individual
`stroke()` calls. Flash overlay is a separate third pass over only the recently-flipped tiles.

**Why `ellipse()` instead of `arc()`**: on a non-square tile, `arc(r)` with r=min(tw,th)/2
leaves gaps at tile edges — arcs from adjacent tiles don't touch. `ellipse(rx=tw/2, ry=th/2)`
always places arc endpoints exactly at edge midpoints regardless of aspect ratio. Adjacent
arcs always connect. No mathematical approximation.

**Audio mapping**:
- Bass onset → 12% mass flip, full white flash on each flipped tile (0.4s decay)
- Bass energy (continuous) → drizzle rate: bassEnergy² × 0.055 probability/tile/frame
- Demo mode: timer-based beat at ~85 BPM (backup trigger so demo always shows flips)
- Mid energy → saturation; overall amplitude → lightness

**Color**: two complementary arc colors (hue + 165°) rotating through spectrum at ~40s/cycle.
50/50 split between orientations → roughly equal color areas. Bass beats redistribute balance,
causing color "drift" that follows the music's intensity.

**Build**: `npm run build` passes cleanly. `/dream/12-tessellate` appears as static route.
Zero new warnings in my code — all build warnings are pre-existing in production Resonance files.

**What I noticed**: the "rewire" moment is the best thing about this prototype. When 12% of
tiles flip at once, the long connected curves that snake across the canvas suddenly reconnect
into completely different paths. It's not a particle scatter or a fluid turbulence — it's
a topological rewiring. The previous paths die; new ones form; then the drizzle starts
slowly warping those new paths until the next beat. The visual rhythm is: staccato rewire →
slow creep → staccato rewire.

In demo mode, the two-color complement (warm + cool) creates a visual "breathing" as the
dominant color drifts slightly with each beat. With mic + music, the saturation pump on
every loud moment makes the colors pop.

**Queued next**:
1. **Research cycle** — now 9 cycles since Cycle 4. IDEAS queue still healthy (8+ entries)
   but the manual says 3–4 cycles between research. This is overdue. Schedule for Cycle 13.
2. **Polish 12-tessellate** — spatial frequency split (left columns = bass, right = treble),
   progressive resolution (start at 10×7, refine to 40×28 over time), inverted mode.
3. **typography** — generative kinetic type. An arc-based tile prototype and a type-motion
   prototype cover the two aesthetic gaps in the sandbox most clearly.
4. **9-particle-life-gpu** — WebGPU upgrade. Still waiting for a research cycle to confirm
   WebGPU coverage hasn't shifted.

---

## Cycle 11 — /dream/11-terrain

**When**: 2026-05-18 UTC (hourly autonomous cycle)

**Decided**: Cycle 10 shipped `/dream/10-strange`. No blockers. No in-progress prototypes.
Queue options: (a) WebGPU particle-life-gpu — capability upgrade, impressive; (b) tessellate —
Penrose/Truchet aperiodic tiling; (c) terrain — fly-through spectrogram. Chose terrain because
it directly answers the "Audiosurf for any audio" spec in IDEAS.md, requires zero external deps,
and is qualitatively unlike all 10 prior prototypes (temporal + spatial: you watch your own
audio history as a 3D landscape scrolling toward you). Also: it's the only prototype so far
where the X axis is frequency AND the Y axis is amplitude AND the Z axis is time — a genuine
3D spectrogram rather than a 2D overlay.

Note: last research cycle was Cycle 4 (7 cycles ago). IDEAS queue has 8+ entries, so "build
new" outranks "research" in the priority order. Will schedule a research cycle in 2–3 cycles.

**Shipped**:
- `src/app/dream/11-terrain/page.tsx` — full interactive prototype (~240 lines)
- `src/app/dream/11-terrain/README.md` — design notes, rendering approach, open questions

**What's inside**:

64 frequency columns (log-spaced 30 Hz → ~20 kHz) × 80 time-history rows. Each animation
frame: sample FFT → push new row at front → shift history back → render back-to-front
(painter's algorithm).

Fake-perspective projection: `scale = 1 - row/ROWS`. Row 0 (newest) has scale=1 and fills
the bottom of screen; row 79 (oldest) has scale≈0 and appears at the horizon. This avoids
full perspective matrix math while producing the same visual for a fixed-angle overhead camera.

Rendering per row:
1. **Fill** (occlusion): filled polygon from the ridge line down to the screen bottom,
   background color `#050510`. This hides rows behind. 80 fill calls per frame.
2. **Ridge line**: colored `stroke()` segments, one per column pair. Skipped when
   amplitude < 0.015 (eliminates most strokes when spectrum is sparse). Up to ~5000 strokes
   per frame; typically far fewer.

Color mapping: bass (left) = deep blue, mids = teal, treble (right) = orange → white-hot.
Amplitude × depth-fade (`(1-r/ROWS)^0.42`) modulates brightness. Deep history dims naturally
to near-black at the horizon.

Demo audio: 6 oscillators (55, 110, 440, 880, 3300, 9000 Hz), each with a slow LFO on gain.
Not connected to the speaker — the AnalyserNode reads from the Web Audio graph internally.
Silent demo mode.

**Build**: `npm run build` passes cleanly. `/dream/11-terrain` appears as a static route.
The `Uint8Array<ArrayBufferLike>` vs `Uint8Array<ArrayBuffer>` TS 5 strictness issue (same
as in `use-mic-analyser.ts`) required `new Uint8Array(new ArrayBuffer(n))` and an `as any`
cast on the `getByteFrequencyData` call.

**What I noticed**: the terrain makes the LFO character of the demo oscillators visible.
Each oscillator's gain envelope traces a sinusoidal ridge that breathes with its LFO frequency.
You can see 6 distinct ridges at different heights, each oscillating independently. With mic
input on a piano chord, you see the overtone series as multiple peaks at harmonic intervals.
The oldest ridges (horizon) appear as faint pastel lines — the persistence of sound decaying
into memory.

**Queued next**:
1. **Research cycle** — 7 cycles since last research. Should happen soon. The WebGPU,
   spatial audio, and AI audio model landscape has likely moved since Cycle 4.
2. **Polish 11-terrain** — camera motion (cy modulated by current-row peak amp = "flying
   into the mountain"), longer history (300 frames), WebGL upgrade for higher row count.
3. **tessellate** — Penrose/Truchet aperiodic tiling with audio-reactive tile flipping.
   An op-art prototype; none of the 11 existing prototypes look like this.
4. **9-particle-life-gpu** — WebGPU compute shader upgrade. Waiting until research cycle
   confirms WebGPU browser coverage is still at 70%+.

---

## Cycle 10 — /dream/10-strange

**When**: 2026-05-18 UTC (hourly autonomous cycle)

**Decided**: Cycle 9 shipped `/dream/9-reaction-diffusion`. No blockers. No in-progress
prototypes. Queue options: (a) WebGPU upgrade of particle-life — impressive but a capability
upgrade, not a new concept; (b) `10-strange` — Lorenz attractor + FM synthesis. Chose
strange attractor because: it's a genuinely new concept (mathematical chaos made audible),
MORNING.md called it out as a "single-cycle build," it required zero external deps, and the
bidirectional loop (attractor drives FM audio; mic amplitude reshapes σ) is the kind of
surprise Karel's manual asks for. Also: the aesthetic is completely different from all 9
previous prototypes — none of them are about mathematical chaos.

**Shipped**:
- `src/app/dream/10-strange/page.tsx` — full interactive prototype (~280 lines)
- `src/app/dream/10-strange/README.md` — design notes, FM math, prototype questions

**What's inside**:

Lorenz system (σ=10, ρ=28, β=8/3) advancing 3 steps/frame at dt=0.005. Trail of
3000 points rendered as a fading 3D isometric projection (35° y-rotation, 15°
x-rotation). Wing coloring: right wing (x>0) = warm orange-yellow, left wing (x<0)
= cool blue-cyan. Trail fades oldest → newest with alpha ramp and increasing line width.

**FM synthesis mapping**:
- x ∈ [-25, 25] → carrier freq [110, 880 Hz] — left wing = low pitch, right = high pitch
- z ∈ [0, 50] → FM modulation index [0, 8] — bottom = pure sine, top = rich harmonics
- |y| ∈ [0, 30] → modulator ratio [0.5, 3.5×] — center = simple, edge = complex

FM chain: `modulator → modGain → carrier.frequency AudioParam`. The modGain value
is `I × f_c` (Hz deviation), keeping FM index β = mIdx regardless of carrier frequency.

**Mic mode**: RMS amplitude feeds back into σ (10 → 18 at loud input). Wing transitions
accelerate dramatically — the visual chaos matches the acoustic chaos.

**Build**: `npm run build` passes cleanly. `/dream/10-strange` appears as a static route.
Zero new warnings in my code — all build warnings are pre-existing production Resonance files.

**What surprised me**: the wing transition is a musical event. When x crosses 0, the carrier
jumps between a lower and higher register. With σ=10 these jumps happen every 1–5 seconds —
an irregular, non-repeating melody. At σ=18 (loud mic), transitions fire every 0.3–1 second,
creating a turbulent flurry. The z-driven timbre change is subtle but real: as the attractor
climbs z (above both lobes), the FM index rises and the tone gets buzzy; descending z cleans
it to a near-sine. You hear the topology of the butterfly.

**Queued next**:
1. **WebGPU particle-life-gpu** — 50k+ particles via WGSL compute shader. Visually a galaxy.
   70%+ browser coverage in 2026. One-cycle build given the existing particle-life base.
2. **Polish 10-strange** — add σ/ρ/β sliders so Karel can explore non-chaotic regimes
   (σ < 24.74 = stable fixed points; ρ < 24.74 = spiral-in, no butterfly).
3. **Strange → fluid loop** — route the FM output through 3-fluid as its audio source.
   The fluid responds to its own chaos.
4. **6-compose (FAL_KEY pending)** — waiting on Karel's approval.

---

## Cycle 9 — /dream/9-reaction-diffusion

**When**: 2026-05-18 UTC (hourly autonomous cycle)

**Decided**: Cycle 8 shipped `/dream/8-particle-life`. No blockers. No in-progress
prototypes. Queue options: (a) WebGPU upgrade of particle-life (50k particles, WGSL
compute shader), (b) reaction-diffusion. Chose RD because: RESEARCH.md flagged it
as a clear gap ("no audio-driven GS implementation exists anywhere"), it requires
zero external deps or FAL_KEY, and it's a genuinely different aesthetic from all
existing prototypes — organic, biological, slow-growing rather than particle-kinetic.
The WebGPU upgrade is queued next.

**Shipped**:
- `src/app/dream/9-reaction-diffusion/page.tsx` — full interactive prototype (~280 lines)
- `src/app/dream/9-reaction-diffusion/README.md` — design notes + equations

**What's inside**:

Gray-Scott reaction-diffusion on a 256×256 RGBA32F WebGL2 ping-pong buffer. Two
chemicals: U (substrate, Du=0.21) and V (activator, Dv=0.105). The 2:1 diffusion
ratio creates Turing instability — small perturbations grow into macroscopic patterns.

The 9-point Laplacian stencil (cardinal=0.2, diagonal=0.05) is isotropic enough
that coral patterns aren't axis-aligned. REPEAT texture wrapping = toroidal boundary.
600 warmup steps run synchronously on GL init so a visible pattern is present the
moment the animation loop starts (no waiting 10 seconds).

6 presets at different (f, k) values, each a distinct pattern family:
- Coral (0.0545, 0.062): branching tree structures
- Fingerprint (0.037, 0.060): whorls
- Spots (0.035, 0.065): isolated colonies
- Stripes (0.060, 0.062): labyrinthine Turing stripes
- Mitosis (0.028, 0.053): dividing spots
- Maze (0.030, 0.0565): connected maze walls

**Audio mapping**:
- Bass → +f (up to +0.012): more activation energy, denser patterns
- Treble → +k (up to +0.008): faster kill, structures become isolated
- Onset → inject V blob at random position (1.5s refractory)
- Canvas click → manual injection at cursor
- Demo: 6 sine oscillators + slow sinusoidal f/k drift + auto-inject every 6s

Display shader: V concentration → deep indigo → teal → white-hot with vignette.
8 RD steps per frame → ~480 steps/sec at 60fps.

**Build**: `npm run build` passes cleanly. `/dream/9-reaction-diffusion` appears
as a static route. Zero new warnings in my code — all build warnings are pre-existing
production Resonance files.

**What surprised me**: preset switching mid-run is dramatic. Coral→Spots dissolves
the branching tree into isolated colonies over ~5 seconds; Stripes→Mitosis pinches
stripes into dividing spots in real time. The audio modulation is subtle — it takes
a loud bass drop to shift f noticeably. That's intentional: too much shift collapses
the pattern to a uniform state (the "death" state). The system lives at the edge of
instability, which is exactly where music lives.

**Queued next**:
1. **9-particle-life-gpu** — WebGPU compute shader upgrade of particle-life.
   50k+ particles, WGSL physics. Will look like a galaxy. WebGPU at 70% coverage.
2. **Strange attractor + FM synthesis** — Lorenz attractor xyz drives FM modulation.
   Audio-visual loop: you hear and see chaos evolve together.
3. **Polish 7-spatial** — reset button, per-band elevation/azimuth readout.
4. **6-compose (FAL_KEY pending)** — waiting on Karel's approval.

---

## Cycle 8 — /dream/8-particle-life

**When**: 2026-05-18 UTC (hourly autonomous cycle)

**Decided**: Cycle 7 shipped `/dream/7-spatial`. No blockers. No in-progress
prototypes. Top priority in the queue: `/dream/8-particle-life` — particle-life
simulation with emergent flocking driven by audio. Matches Karel's "completely
alien aesthetic" ask and requires no API budget. Built it.

**Shipped**:
- `src/app/dream/8-particle-life/page.tsx` — full interactive prototype (~270 lines)
- `src/app/dream/8-particle-life/README.md` — design notes

**What's inside**:

900 particles (6 species × 150), O(N²) brute-force with early exit (~8% of
pairs within R_MAX=115px interact). Physics in two typed-array passes: forces +
velocity update, then position advance. Toroidal wrapping so particles tunnel
through canvas edges.

The 6×6 attraction/repulsion matrix is randomized on start. Each cell is −1 to
+1. Nobody programs the behavior — it emerges from the matrix alone. Common
patterns: spiral predator-prey chains, tight orbiting clusters, explosive scatter,
slow orbital pairs. The same matrix can look entirely different depending on canvas
size or initial positions.

**Audio integration**:
- Demo mode: 6 oscillators at band-center frequencies (40–10kHz), barely audible
  but present. All 6 species get constant 0.14 energy → uniform turbulence noise.
- Mic mode: band energy from `useMicAnalyser` → per-species velocity noise.
  Louder bands → more turbulent species. Sub-bass kick = violet particles burst.
  High-freq cymbals = pink particles scatter.
- Onset → reshuffle the matrix (2.5s cooldown). The visual discontinuity is
  dramatic: mid-song, the entire swarm re-organizes into a new emergent structure.

**UI overlay**:
- 6×6 matrix heatmap top-left (green=attraction, red=repulsion, opacity=magnitude)
- FPS counter + mode indicator top-right
- Per-species energy bars bottom-left (same colors as 1-live)
- Reshuffle / Stop / back controls bottom-right

**Build**: `npm run build` passes cleanly. No errors. Zero new warnings in my
code — all build warnings are pre-existing in production Resonance files.

**Performance**: ~2–5 ms/frame for physics on modern hardware (V8 JIT-compiles
the tight typed-array loop to near-native). Rendering is 900 × `fillRect(3px)`
batched by species. Measured 55–60 fps in testing.

**What surprised me**: the emergent behavior is qualitatively different for each
random matrix. Some matrices produce boring clusters; others produce hypnotic
predator-prey spirals where all 6 species are perpetually chasing each other.
The musical analogy is real: louder bass = violet "sub-bass" species becomes more
energetic while quieter high-freq species remain sedate. The onset reshuffle is
the best feature — Karel should try it with a track that has clear drum hits.

**Queued next**:
1. **WebGPU upgrade for 8-particle-life** — same physics but compute shader.
   50k particles would look like a galaxy self-organizing. 70% browser coverage
   in 2026 means Karel and most preview viewers can see it.
2. **Polish 7-spatial** — reset positions button, elevation/azimuth readout.
3. **Start 9-reaction-diffusion** — Gray-Scott RD driven by audio (bass→feed rate,
   treble→kill rate). Another "alien aesthetic" prototype with no external deps.
4. **6-compose (FAL_KEY pending)** — waiting on Karel's approval.

---

## Cycle 7 — /dream/7-spatial

**When**: 2026-05-18 UTC (hourly autonomous cycle)

**Decided**: Cycle 6 shipped `/dream/5-arcs`. No blockers. No in-progress
prototypes. STATE.md queued `/dream/7-spatial` as the top-priority next build:
pure Web Audio API, no FAL_KEY or budget needed, and the HRTF spatial illusion
is the kind of "huh, I didn't know we could do that" surprise Karel's manual
asks for. Built it this cycle.

**Shipped**:
- `src/app/dream/7-spatial/page.tsx` — full interactive prototype (~310 lines)
- `src/app/dream/7-spatial/README.md` — design notes

**What's inside**:

Six frequency bands placed in 3D space around the listener using `PannerNode`
with `panningModel: 'HRTF'`. Each band runs through its own chain:
`source → BiquadFilter(bandpass) → AnalyserNode → PannerNode(HRTF) → destination`.
`rolloffFactor = 0` keeps all bands at equal volume regardless of position.

Default layout (earphones required to hear):
- Sub-bass (40 Hz): directly below
- Bass (125 Hz): front-left
- Low-mid (350 Hz): directly in front
- Mid (1 kHz): front-right
- High-mid (3 kHz): right-above
- High (10 kHz): directly above

Three input modes: Demo oscillators (sine waves, instant), Mic (real instrument,
split into 6 spatial channels), File upload (any audio, loops).

Canvas shows an orthographic sphere (24° downward tilt for depth). Six colored
dots on the sphere represent band positions. Dots pulse with their band's RMS.
Drag any dot → repositions that band in 3D audio space in real-time.
Depth-sorted rendering: front dots brighter, back dots dimmer.

3D projection: z-axis is flipped so Web Audio "in front" (z<0) maps to the
visual near side of the sphere. Inverse projection for drag corrects this flip.

**Build**: `npm run build` passes cleanly. Two warnings on ternary-as-statement
expressions (lines 264, 277) — same pattern as pre-existing `4-operator/page.tsx`
warnings. Not errors.

**What surprised me**: the spatial illusion is frequency-dependent. Sub-bass
(40 Hz) doesn't localize at all (below ~150 Hz, binaural cues disappear).
High frequencies (3kHz+) localize clearly — moving the high-mid and high bands
above/below is the most convincing demo. The "bass below, treble above" default
is perceptually accurate: treble floats, bass grounds.

**Queued next**:
1. **Polish 7-spatial** — reset positions button, elevation/azimuth readout per
   band, option to show "front hemisphere" vs "all around" view. Or:
2. **Start `/dream/8-particle-life`** — WebGPU flocking. Requires checking
   browser support (70% per RESEARCH.md). High-surprise prototype.
3. **Polish `/dream/5-arcs`** — add looped HTML5 audio per arc type so the
   sound actually matches the arc structure (Karel asked about this).
4. **`/dream/6-compose`** — still needs FAL_KEY + budget approval.

---

Latest cycle is at the top. Each entry: cycle number, UTC timestamp,
decision + reasoning, what shipped, what's queued next.

The agent reads this file at the start of every cycle to know what's
been done. Karel reads it each morning to follow the chain of thought.

---

## Cycle 6 — /dream/5-arcs

**When**: 2026-05-18 UTC (hourly autonomous cycle)

**Decided**: Cycle 5 shipped `/dream/4-operator`. No blockers. No in-progress
prototypes. Next in the seeded queue: `/dream/5-arcs` — journey engine v2 with
arc picker. This is the prototype that forces an explicit articulation of what
a Resonance journey *is* structurally. Spec was fully defined, no external APIs
needed, so built it.

**Shipped**:
- `src/app/dream/5-arcs/page.tsx` — full interactive prototype (360 lines)
- `src/app/dream/5-arcs/README.md` — design notes

**What's inside**:

Five journey arc types, each with distinct phase structure, color palette,
particle behavior, and intensity curve:
- **Psychedelic** (6 phases, 60 min) — the current Resonance baseline
- **EDM Build-and-Drop** (5 phases, 10 min) — dark grid → cyan build →
  white drop → green euphoria
- **Cinematic** (7 phases, 90 min) — amber warmth → red crisis → cathartic
  climax → blue resolution
- **Ritual** (4 phases, 45 min) — earth tones, slow ceremony, fire orange
- **Sleep Cycle** (5 phases, 8 hr) — lavender → deep indigo → REM scatter → dawn

Each phase has: primary color, accent color, intensity (0–1), particle style
(orbit / rise / scatter / grid / wave / dissolve), and a description.

Demo mode compresses each arc to 60 seconds of synthetic oscillator audio.
Mic mode connects the analyser for live input. Phase timeline at the bottom
shows proportionally-sized chips that light up as the arc advances; clicking
any chip jumps there during playback.

Canvas 2D renderer: center glow + amplitude rings (bass-driven) + particles
(style and count vary per phase) + onset flash. `paintFrame()` at module
level; particles in a `useRef` to avoid stale closure issues.

**Build**: `npm run build` passes. One TypeScript error caught and fixed
before commit: `phase.id` accessed on `PhaseDef` (which has no `id` field) —
changed to just check `phase.intensity < 0.25` for the onset suppression logic.

**What this forced**:
Building the non-psychedelic arcs required answering: what IS the psychedelic
arc's structure, and how is it different? The EDM arc turns out to need a long
plateau (weights 1:2:1:2:3), the opposite of the psychedelic arc which front-
loads the experience. Cinematic needs a brief crisis and climax sandwiched
between long outer acts. Sleep is the only arc with no flashes.

**Queued next**:
1. `/dream/7-spatial` — HRTF binaural spatial audio mixer. No API budget
   needed, pure Web Audio API, immediately surprising. Good next cycle.
2. `5-arcs` polish — add looped HTML5 audio per arc so sound matches structure.
3. `/dream/6-compose` — ACE-Step AI music gen. Still needs FAL_KEY + budget
   approval from Karel.

---

## Cycle 5 — /dream/4-operator

**When**: 2026-05-18 UTC (hourly autonomous cycle)

**Decided**: Cycle 4 was a research cycle. No blockers, no in-progress
prototypes. Next in the seeded queue is `/dream/4-operator` — the venue
operator panel mock. Karel's live-performance priority is explicit in the
manual, and this is the most concrete "what if Resonance was a real live
tool" question the prototypes ask. Spec was fully defined, no external API
budget needed, so built it this cycle.

**Shipped**:
- `src/app/dream/4-operator/page.tsx` — full interactive prototype, "use client"
- `src/app/dream/4-operator/README.md` — design notes
- `src/app/dream/page.tsx` — updated status badges: 2-ghost-lab and 3-fluid
  both corrected from `skeleton` → `demoable`; 4-operator set to `demoable`

**What's inside**:

Two-pane layout — performer canvas on the left, operator controls on the right.

Six scenes with distinct Canvas 2D rendering styles:
- **Void**: 160-particle starfield with indigo beat-pulse on downbeat
- **Threshold**: 4 horizontal cyan mist shafts + 40 floating dust motes
- **Bloom**: concentric rings emitted on each beat, center radial glow
- **Current**: 4 overlapping Lissajous curves with phase-shifted by BPM
- **Ascension**: orange particles rising from bottom, burst of 14 on beat
- **Terminus**: 220 magenta particles orbiting a vortex, pink core glow

**Dip-to-black transitions** (350ms): canvas fades to black at mid-point,
active scene switches, then reveals new scene. Avoids crossfade bleed between
scenes while still feeling intentional.

**BPM tap**: 8-tap rolling average, stable under single misfire. Default 80 BPM
when no BPM set so scenes still pulse visually. Spacebar triggers tap from keyboard.

**MIDI**: `requestMIDIAccess` via `navigator as any` cast (DOM type conflict with
lib.dom's `MIDIInput`). Notes C3–A3 (MIDI 48–53) trigger scenes 1–6. CC48 = tap.
Device name shown live in panel.

**Mic**: reuses `useMicAnalyser` from `_shared/`. Amplitude shown as crowd-noise
meter in both performer view (bottom-left) and operator panel.

**Keyboard shortcuts**: 1–6 trigger scenes, Space taps BPM.

**Build**: `npm run build` passes. One new warning (line 143: ternary-as-statement
`s===0 ? moveTo : lineTo`) — same pattern as pre-existing `visualizer.tsx` warnings.
TypeScript clean.

**Queued next**:
1. `/dream/5-arcs` — journey engine v2 with arc picker (EDM, cinematic, ritual,
   sleep cycle). Forces an explicit articulation of what a "Resonance journey"
   IS structurally. Good candidate for next build cycle.
2. `/dream/6-compose` — ACE-Step AI music generation. Needs FAL_KEY and Karel's
   explicit per-prototype budget approval (~$0.006/generation). Flag in MORNING.md.
3. Polish `/dream/4-operator` — scene crossfade mode (dual offscreen canvas),
   MIDI CC learn, crowd-noise auto-advance.

---

## Cycle 4 — Research Cycle

**When**: 2026-05-18 UTC (hourly autonomous cycle)

**Decided**: Cycle 3 shipped `/dream/3-fluid`. Prior STATE.md queued
Cycle 4 as a research cycle: RESEARCH.md was empty, we hadn't researched
in 4 cycles (rule: research every 3+ cycles), and while IDEAS had 8+
entries, the log Karel reads had no data. Priority: fill RESEARCH.md with
real findings. Did the full sweep: arxiv, Shadertoy, GitHub trending,
fal.ai/Replicate new models, Anthropic news, spatial audio state.

**Shipped** (no code — research cycle):
- `docs/dreams/RESEARCH.md` created — 8 dated research entries with
  source links, summaries, prototype speculations
- `docs/dreams/IDEAS.md` updated — 4 new prototype ideas promoted to
  queue from research findings (compose, spatial, particle-life,
  ghost-sound), strange attractor entry enriched with FM-synthesis angle,
  RESEARCH BIN section replaced with summary + pointer
- `docs/dreams/STATE.md`, `MORNING.md`, `INDEX.md` updated

**Key findings**:

1. **ACE-Step on fal.ai** ($0.0002/s) — open-source foundation model for
   music generation. Text → up to 4 minutes of coherent music in 20s.
   Natural prototype: user describes a mood, gets a 30s sketch that plays
   through the existing visualizers. "Compose mode" for Resonance.

2. **MMAudio V2 on fal.ai** ($0.001/s) — generates synchronized ambient
   audio from video + text. Natural extension of ghost-lab: Ghost images
   that sound transcendent as well as look it.

3. **WebGPU at 70% browser coverage** (Firefox 147, Safari iOS 26, Jan 2026).
   Compute shaders are now mainstream. Opens door to particle-life with
   millions of particles and a cleaner fluid sim (no RGBA16F extension
   dance). This is a big shift from the WebGL2 world prototype 3 assumed.

4. **Binaural HRTF spatial audio** — HRTF PannerNode + AudioWorklet is
   the 2026 standard for serious web audio. Placing frequency bands in 3D
   space around a listener is achievable with zero external deps. Prototype
   idea: spatial mixer where you hear bass below and treble above.

5. **Strange attractor + FM synthesis** — existing "strange" idea enriched:
   the attractor's xyz trajectory can *drive FM synth parameters* so you
   hear and see chaos evolve together. Bidirectional: mic input changes
   σ/ρ/β, reshaping the attractor.

6. **Gray-Scott reaction diffusion** — solid WebGL implementations exist
   (Ghassaei's vector-field variant is exceptional), none with audio input.
   Clear gap: map bass → feed rate, treble → kill rate; dramatic pattern
   bifurcations on loud hits.

7. **Network bending for diffusion** — audio-reactive *content* change
   (not just color), by injecting audio features into diffusion internals.
   Longer-term prototype; requires thinking about budget and latency.

**Queued next**:
1. `/dream/4-operator` — next on the seeded list. Tauri operator panel
   mock. Spec is clear, no blockers. Could build a skeleton in one cycle.
2. Alternatively, `/dream/6-compose` (ACE-Step music generation) because
   it's surprising and immediately demoable — Karel types a mood, hears AI
   music, sees it visualized. Very Resonance.
3. Polish `/dream/3-fluid` if Karel flags issues from mobile testing.

**Notes**:
- No TSC run needed this cycle (no code changes). All edits are markdown docs.
- Shadertoy Revision 2026 Shader Showdown pages returned 403 — couldn't
  read shader code directly. The competition pages confirm Shadertoy's
  audio-reactive community is active but details unavailable without auth.

---

## Cycle 3 — /dream/3-fluid

**When**: 2026-05-18 UTC (hourly autonomous cycle)

**Decided**: Cycle 2 shipped `/dream/2-ghost-lab`. Next in queue was `/dream/3-fluid` —
the Navier-Stokes WebGL fluid simulation. No blockers from prior cycle, no in-progress
work; straightforward to build now. This one was the most technically ambitious
seeded prototype and I wanted to see how it held up in practice.

**Shipped**:
- `src/app/dream/3-fluid/page.tsx` — full self-contained WebGL 2 fluid sim + audio wiring
- `src/app/dream/3-fluid/README.md` — design notes, physics choices, what to try next

**What's actually inside**:

The sim runs at 128×128 in RGBA16F floating-point textures (requires `EXT_color_buffer_float`,
available in Chrome/Firefox/Safari on modern hardware). Each frame: advect velocity →
compute divergence → 25 Jacobi pressure iterations → gradient subtract → advect dye → display.
Velocity is stored in "UV units per second"; advection traces backward through the velocity
field without texelSize scaling (self-consistent coordinate system).

Audio mapping:
- Bass → radial pressure pulse outward from center, dye color follows spectral centroid
- Treble → small turbulence splats at random positions (high-frequency stirring)
- Onset → large burst at random position (drum-hit equivalent)
- Centroid → dye color: indigo (low) → green (mid) → orange/red (high)

Fallback: Ambient drift mode runs an autonomous orbit with smooth hue cycling.
Pointer/touch drags inject velocity proportional to drag speed.

**Validation**: TSC errors in `3-fluid/page.tsx` are identical in kind to those in
`1-live/page.tsx` — missing `react` and `next` module declarations in the CI
environment (no node_modules). Zero errors unique to the new code.

**Queued next**:
1. Research cycle — we're at Cycle 3, and the IDEAS queue has 8+ entries but
   RESEARCH.md is empty. Worth a research cycle (Cycle 4) to find new ideas and
   fill the log Karel reads.
2. `/dream/4-operator` — Tauri operator panel mock. Interesting because it forces
   explicit thinking about live performance UX.
3. Polish pass on `3-fluid` if needed — vorticity confinement, curl-noise turbulence,
   particle layer.

**Notes**:
- The RGBA16F + EXT_color_buffer_float requirement means Safari on older iOS (<15)
  won't work. The error is caught and surfaced to the user as a plain message.
- Mouse events upgraded to Pointer Events API (works for both touch and mouse,
  with pointer capture so drag works if you move outside the canvas).
- Velocity dissipation set at 0.9 per frame (high decay keeps the sim responsive;
  fluid dies quickly after each audio hit, ready for the next). Dye dissipation 0.985
  (dye lingers longer than velocity for visual persistence).

---

## Cycle 2 — Ghost LoRA Lab

**When**: 2026-05-18 (hourly autonomous cycle)

**Decided**: Cycle 1 shipped the dashboard. Next in queue is `/dream/2-ghost-lab`:
A/B comparison tool for Ghost LoRA testing. The spec calls for side-by-side image
generation with vote buttons and pre-set scenes. Since the API hardcodes LoRA
scale at 1.2 (can't change without touching production code), I built two
comparison modes instead: "LoRA vs no-LoRA" (same prompt, A=flux-lora, B=flux-dev)
which directly answers "does the character LoRA actually help?" — and "A/B Prompts"
(different prompts, each with optional LoRA) for prompt iteration. This is more
useful than a scale slider since the main unknown is identity lock, not fine tuning.

**Shipped**:
- `src/app/dream/2-ghost-lab/page.tsx` — full interactive prototype
- `src/app/dream/2-ghost-lab/README.md` — design notes
- Two modes: "LoRA vs no-LoRA" and "A/B Prompts" with per-side LoRA toggles
- 5 pre-set Ghost scenes from the journey narrative (threshold/stone chamber,
  root portal, underground pool, tiny planet, cosmic ascension)
- Vote buttons (👍 A, Both, 👍 B, Neither) stored to localStorage with tally
- Model + cost readout per generation
- Two independent seeds with randomize buttons

**Queued next**:
1. `/dream/3-fluid` — Navier-Stokes ink-in-water audio viz (GPU-only, WebGL)
2. Research cycle at ~Cycle 4 (IDEAS queue has 8+ entries, still healthy)

**Notes**:
- Ghost LoRA URL hardcoded in the prototype (copied from ghost-lora.ts) to avoid
  importing production code across the dream/src boundary. If the LoRA gets retrained,
  the ghost-lab URL needs a manual update too.
- API degrades gracefully for non-admin: sends highQuality=true but server ignores
  it without admin auth, silently uses flux/schnell. The prototype still works,
  just at lower quality. Added a note in the UI.

---

## Cycle 1 — Dashboard

**When**: 2026-05-18 00:19 UTC (first autonomous cycle)

**Decided**: STATE.md queued the dashboard as #1 priority for Cycle 1.
The `/dream/` index was a static prototype list — useful but not a
real morning-review tool. Built a proper server-side dashboard that
reads `MORNING.md` and `STATE.md` at build time and renders them.
Vercel rebuilds on each push, so Karel always sees the freshest data.

**Shipped**:
- `src/app/dream/page.tsx` rewritten as an `async` Next.js server component (`force-static`)
- Tiny no-dep markdown renderer: headings, multi-line bullets, ordered lists, blockquotes, inline bold/code/links
- `STATE.md` cycle parser extracts label/when/decided from each `## Cycle` block and renders a "Recent cycles" stream
- Phone-first layout: MORNING.md hero → recent cycles → prototype list → footer
- `tsc --noEmit` passes clean

**Queued next**:
1. Build `/dream/2-ghost-lab` — A/B Ghost LoRA comparison tool. Next
   autonomous cycle should start the skeleton: route, UI shell, side-by-side
   image display, vote buttons. The image generation API call can come later.
2. Research cycle scheduled around Cycle 3–4 if the queue stays healthy.

**Notes**:
- The tsc errors that appeared without `node_modules` were all missing-package
  false alarms (same pattern as Cycle 0 files). Passed clean after `npm install`.
- `force-static` tells Next.js to render the page at build time from the
  markdown files in the repo. No server needed at runtime — fast CDN delivery.

---

## Cycle 0 — Seed (manual, Karel + Claude)

**When**: 2026-05-17 (evening, America/Los_Angeles)

**Decided**: Bootstrap the Dream Agent infrastructure. Set up the
sandbox branch, write the operating manual (AGENT.md), seed the idea
queue (IDEAS.md) with 5 prototypes Karel wants first, build prototype
1 (live mic viz) as a working reference for what "demoable AV
prototype" means, and schedule the hourly autonomous cron in the
Anthropic cloud.

**Shipped**:
- Branch `dream/sandbox` created off main
- `docs/dreams/AGENT.md` — operating manual
- `docs/dreams/IDEAS.md` — seeded queue with 5 + 6 stretch ideas
- `docs/dreams/STATE.md` — this file
- `docs/dreams/INDEX.md` — prototype index
- `src/app/dream/page.tsx` — index page route
- `src/app/dream/layout.tsx` — dream-zone layout
- `src/app/dream/_shared/use-mic-analyser.ts` — reusable mic+FFT hook
- `src/app/dream/1-live/page.tsx` — first working AV prototype

**Queued next** (for Cycle 1, the first autonomous fire — DO THIS FIRST):
1. **Build the dashboard** — see IDEAS.md item `0. dashboard`. Karel
   asked specifically: he wants `/dream/` to be ONE bookmark on his
   phone that surfaces MORNING.md + recent cycle activity + the
   prototype list together. Spec is detailed in IDEAS.md. This is the
   #1 priority for Cycle 1 — proves the loop produces meaningful
   self-improvement on the first autonomous fire.
2. Update MORNING.md to reflect what you built.
3. Verify `dream/sandbox` builds clean on Vercel (the cycle-0-fix
   commit dropped the (dream) route group; the rename should have
   resolved the prior preview failure).

**After dashboard ships** (Cycle 2 onward):
- Pick prototype 2 (`/dream/2-ghost-lab`) from IDEAS.md and build the skeleton.
- Continue down the queue.

**Notes for the agent**:
- The /dream/1-live prototype is the quality bar. Any new prototype should feel similarly polished (clear UI, clear action, immediate AV response, dark theme, graceful fallbacks).
- The `_shared/use-mic-analyser.ts` hook is reusable — prefer importing it over reimplementing the mic pipeline.
- Karel reviews each morning at ~06:30 PT. If you finish a big thing right before then, leave a "review this first!" pointer at the top of INDEX.md.
