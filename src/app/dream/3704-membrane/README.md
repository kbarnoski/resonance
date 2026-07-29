# 3704 · Membrane

## The one question

> What if two Physarum swarms live in TWO adjacent fields separated by a permeable
> MEMBRANE, and the amount each swarm can "hear" the other across that membrane
> controls whether their two voices form call-and-response or drift into
> independent counterpoint?

This is a deliberate second-cycle deepening of **3552 · Forage**. Forage was one
field, one swarm, seeded by food, singing its own transport topology. Membrane
keeps Forage's Physarum compute pipeline and topology→sound chain but changes the
*body*: there are now **two separate swarms in two separate fields**, and the
interesting object is no longer the network — it is the **coupling between two
networks**. The membrane *is* the interface.

## The two-field + membrane model

- **Two independent bodies.** The trail buffer is one wide grid packed as `L | R`:
  columns `[0, fw)` are swarm L's field, `[fw, 2·fw)` are swarm R's field. Each
  swarm has its own agents (first half of the buffer = L, second half = R) and
  forages only inside its own half. The membrane at column `fw`, and the two outer
  edges, are **walls** — the box-blur diffusion never bleeds across them and agents
  reflect off them. So this is genuinely two fields, not one field with two species.

- **The permeable membrane.** In the diffuse pass, a permeability-scaled attractant
  is added to each field near the boundary:
  `leak = perm · (baseline·e^(−d/26) + 0.16 · other_field_density_at_mirror)`.
  The `baseline` term is a faint membrane glow each swarm can first *sense* across
  the boundary; the second term reinforces once the *other* swarm's trail has
  actually reached the mirror cell. High `perm` → both swarms grow toward the
  membrane and their densities meet and entrain there. Low `perm` → the leak
  vanishes and each swarm forages its own food alone.

- **Permeability is the master control.** `←/→` (or `[` `]`) sweep it 0→1. It is the
  coupling itself, not a mood/EQ dial — everything downstream (whether the two
  bodies touch, whether the two voices lock) follows from this one number.

## From permeability to call-and-response vs counterpoint

A cheap reduce pass reads back four floats each frame (async, double-buffered):
`massL`, `massR`, and the trail density in the `MEMB_BAND` columns on each side of
the membrane (`membL`, `membR`). The **cross-membrane connectivity** is
`min(membL, membR)` normalized — a real "connection" requires *both* swarms to be
present at the membrane, so connectivity is an **emergent measurement of the coupled
state**, not a copy of the permeability dial. Raise permeability and it takes a few
seconds of growth before connectivity actually rises; drop it and connectivity
decays as the swarms retreat.

## Sonification — a spatial duet

Swarm L → **voice 1, panned hard left**; swarm R → **voice 2, panned hard right**.
The stereo split is what makes the two bodies audible as *two*.

- Each voice is a triangle + sub-sine through its own low-pass filter and panner.
- **Amplitude & brightness** of each voice track that swarm's normalized trail
  mass (a swarm that hasn't grown is silent; a rich network is loud and open).
  Mass is self-scaled to a slow running maximum so the mapping works identically on
  the GPU and CPU paths despite different absolute densities.
- **Pitch:** each swarm rides its own continuous modal position (linear
  interpolation between adjacent just ratios of a Dorian↔Lydian morph) with
  different drift phases, so by default the two lines *diverge* — independent
  counterpoint.
- **Connectivity bends them together.** As connectivity `k` rises, voice R glides
  toward `nearestJust(freqR/freqL)·freqL` — a **just interval** of voice L — and its
  amplitude envelope crosses from an independent pulse (own period) to an
  **antiphase echo of L's pulse** (L calls, R answers). At `k→1` the two voices are
  audibly singing together: locked interval + call-and-response. At `k→0` they
  separate again.

**Continuous pitch only.** Every bend, vibrato, mode morph and root transpose is a
glide via `setTargetAtTime`; `modePitch` interpolates *between* ratios rather than
choosing one. The just interval is a **glide destination, never a quantiser** — the
protected lab rule.

## Why the input is non-pointer (keyboard) + autopilot

The jury banned pointer/touch as the instrument. The primary verb here is the
**keyboard**:

- `←/→` or `[` `]` — **membrane permeability** down/up (the headline control, the
  move from "two soloists" to "one duet").
- `1`–`8` — plant a food well at one of eight mapped anchor positions in the field
  you are currently feeding.
- `Space` — toggle which field (L / R) you feed.

A **seeded deterministic autopilot** runs hands-off: it sweeps permeability
`0 → 1 → 0` over 48 s (so a reviewer hears the transition *both directions*) and
plants food on a seeded schedule. Permeability and food each have independent
"auto owns it" flags — press an arrow and you take permeability while the food
autopilot keeps going, or vice versa. There is no pointer path and no win/lose: you
are shaping a coupled two-body system.

## Output substrate — WebGPU compute with a mandatory Canvas2D fallback

- **Primary — WebGPU compute.** Per frame: (1) diffuse+decay+food+**membrane
  coupling** compute pass ping-ponging the packed u32 fixed-point trail buffers
  (`@workgroup_size(8,8)`); (2) a single agent pass over *both* swarms
  (`@workgroup_size(64)`, atomic deposits, per-agent side derived from index);
  (3) a reduce pass writing the 4-float masses + membrane bands; (4) a fragment
  render pass drawing swarm L in a **cooler indigo-violet** ramp and swarm R in a
  **warmer magenta-violet** ramp, with the membrane as a faint dividing line whose
  glow tracks permeability. ~61k agents total on a 768×384 packed field. Device /
  buffer / bind-group structure mirrors `3552-forage` and `75-houdini-particle-flock`
  (read-only references). WGSL is validated with `pushErrorScope`; any failure
  throws and triggers the fallback.
- **Mandatory fallback — Canvas2D.** If `navigator.gpu` is absent or device/shader
  creation throws, the *identical* two-swarm + membrane model runs on the CPU at
  ~2.6k agents on a 340×170 packed field, drawn via a `willReadFrequently`
  offscreen buffer. **Sonification runs in both paths.**
- No strobe: only a slow ≤0.2 Hz luminance drift. `prefers-reduced-motion` halves
  agent motion.

## Determinism & safety

One seeded `mulberry32` PRNG drives agent spawns and the autopilot schedule. **No
`Math.random`, no `Date.now`, no argless `new Date()`** — all time comes from
`requestAnimationFrame` timestamps and `AudioContext.currentTime`. Both the
`AudioContext` and the WebGPU device are created inside the Start user gesture.
rAF, GPU resources and the AudioContext are all torn down on stop/unmount.

## Ambition criteria hit (≥3 target — hits all)

1. **Novel technique for this lab:** two *separate* coupled Physarum bodies whose
   permeable-membrane connectivity is the expressive control, mapping an emergent
   coupling measure onto a call-and-response ↔ counterpoint axis. Distinct from
   Forage's single-field pairwise-tube harmony.
2. **≥3 subsystems:** two agent sims + two diffusion fields + membrane coupling +
   connectivity/duet mapper + two-voice spatial (panned) synth — five+.
3. **Named references:** Jones 2010, "Characteristics of pattern formation and
   evolution in approximations of Physarum transport networks"; "The Agentic
   Symphony" (Meera Sundar, ADCx India 2026) — emergent call-and-response from
   coupled agents; MusicSwarm (Buehler 2026, arXiv:2509.11973).
4. **Deliberate multi-cycle v2** of `3552-forage`, reusing its compute + sonification
   spine and re-asking the question at the level of *two coupled bodies*.

## Honest self-assessment — what is / isn't verifiable headless

- **Verified here:** ESLint clean (exit 0) and `tsc --noEmit` reports zero errors
  for this file; no forbidden patterns (`Math.random` / `Date.now` / off-brand
  chrome); determinism, semantic-token chrome, teardown and fallback wiring are
  readable from source.
- **Not verifiable headless:** neither the WebGPU compute path nor the Canvas2D
  render/audio can be exercised without a GPU + Web Audio + a real rAF loop, so the
  *musical* result and WGSL compilation are unproven in this environment.
  Mitigations: the GPU path self-validates with `pushErrorScope` and auto-falls-back
  to the CPU model on any WebGPU error; the CPU path is plain TypeScript.
- **Risks to flag to the curator:** (1) the coupling/mass/connectivity constants
  (leak gains, `MEMB_BAND`, self-scaling maxima, envelope periods) were set by
  reasoning, not by ear — the crossover between "counterpoint" and "call-and-response"
  may need a listening pass to make it maximally legible. (2) The membrane baseline
  attractant is what bootstraps growth toward the boundary; if it is too weak on
  slow hardware the swarms may take longer to meet. (3) CPU fallback at 340×170 /
  2.6k agents may run ~20–30 fps on weak machines — the coupling still forms and
  sings, just more slowly. (4) Async readback adds ~1–2 frames of audio latency,
  inaudible for this slow material.
