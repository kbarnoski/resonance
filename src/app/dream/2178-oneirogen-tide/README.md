# Oneirogen II — Tide

Cycle-2 of [`2074-oneirogen`](../2074-oneirogen). A drug-free, cosmic-ambient
piece for the **hypnagogic (sleep-onset)** state.

**The question:** *What if, as you drift from wake to sleep, you could plant a
seed of attention — and watch the dream preferentially replay and recombine
exactly that seed?*

Cycle-1 let you **watch** a single dial α hand the wheel from world → dream.
Tide is the interaction model it lacked: you **incubate** the dream — you plant,
with your hand, what the dream will replay — and you drive the wake→sleep handoff
with your own **engagement** instead of a slider.

## The proven α engine (re-implemented fresh here)

A single parameter **α ∈ [0,1]** interpolates the whole audio-visual field:

- **α = 0 · wake** — bottom-up / sensory. An `AnalyserNode` FFT of the live sound
  (a built-in ambient pad by default, or a dropped file) is split into
  bass / mid / high bands; those band energies swell the amplitudes of a
  **sensory scalar potential**. A field of ~220 drifting phosphene streams follows
  the **curl** (perpendicular gradient, sampled by finite differences) of that
  potential, rendered as soft additive radial glows (deep indigo → violet → soft
  lilac, hue ≈ 250–295). At α≈0 the field visibly **tracks the sound**.
- **α = 1 · sleep** — top-down / internal. The field **detaches** and advects
  along an **autonomous potential** whose phases drift on their own sub-Hz clocks;
  its swell is fed not by the live analyser but by a **256-slot circular memory
  ring** that recorded the world's band-energy while awake and now loops it back
  as a remembered motif.
- **Between** — a smooth crossfade of both the visual flow (sensory → autonomous,
  blended by α) and the audio: a "world" `liveBus` fades out while a generative
  "replay" `replayBus` (detuned voicing nudged by the memory values) fades in.

Audio graph: master → destination; `liveBus` (world, gain 1→0 with α) → master +
analyser; `replayBus` (dream, gain 0→1 with α) → master; a built-in ambient pad =
4 detuned sine/triangle voices through a lowpass with sub-Hz detune LFOs; an
optional dropped file via `File.arrayBuffer()` → `decodeAudioData` (fully
client-side, **no network**) ducks the pad. Starts **silent**; the primary
**Begin** button resumes the `AudioContext` from inside the click handler.

## The two new mechanics (the cycle-2 contribution)

### 1. Engagement drives α — the embodied handoff

α is a **slew-limited follower** of your engagement, not a timeline:

- While you actively move / interact the pointer, **engagement is high** and α is
  pulled toward **0 (wake)** — the field tracks the world.
- When you go **still** and stop feeding input, engagement **decays** and α drifts
  up toward **1 (sleep)** — the dream takes over.

*Attention holds you awake; letting go lets the dream take over* — the real
hypnagogic mechanic. The follower is slew-limited (α moves at ≤ 0.12 / s, a gentle
drift ≪ 3 Hz, never a jump) and is **never** an autonomous 0→peak→0 timeline —
**you** drive it by engaging vs. releasing. A small **manual α slider** remains as
an accessibility / override fallback (press *Return to engagement* to hand control
back to your body), but the headline interaction is engagement.

### 2. Spatial incubation seeding — targeted dream incubation

While awake, **drag on the field to paint a glowing seed locus.** At the moment
you plant it (pointer-up) the piece captures:

- the seed's **(x, y)** location (stored normalized, so it survives resize), and
- the **live spectral signature** (current bass / mid / high) at that instant,

into a **tagged, higher-weight slot** of the memory ring (a run of ring slots is
written with the elevated signature and a `tag` flag, so the seed stands out from
ordinary recorded energy). As α rises into sleep the autonomous replay
**preferentially reactivates your seed**: the phosphene field **blooms brighter
from the seed's location** (a sub-Hz reactivation clock makes it recur, not play
verbatim), the tagged ring slots make the seed's recorded energy **recur louder**
in the looped motif, and the seed's signature nudges the replay pad's detune —
**recombined** with the ambient memory rather than replayed straight. You visibly
**see your planted seed recur in the dream.** You can plant a couple of seeds; the
**newest is weighted strongest** (older seeds are demoted on each new plant).
Single-pointer only (mouse + single touch) — not a multi-touch instrument.

## Self-demo (headless / zero input)

Deterministic throughout: **mulberry32** seeded from `0x2178` drives all
stochastic init (stream positions, phases, autopilot seed location); all timing
comes from the rAF `timestamp`. There is **no `Math.random`, no `Date.now`**.
After **Begin**, a seeded **autopilot** holds engagement high (~wake) for the
first ~3 s, **auto-plants a seed** at ~3 s, then releases — engagement decays and
α slews up so a hands-free 06:30 phone-glance viewer sees the full
**wake → incubate → dream** arc on its own within ~15 s. The moment a real hand
engages (pointer down / real movement), the autopilot **yields** permanently and
your body takes over.

## Safety — no strobe, no flicker

All brightness change is **slow luminance drift**. The global luminance breath is
routed through the shared **`SafeFlicker`** engine (≤ 3 Hz hard clamp, soft sine
with a floor, honors `prefers-reduced-motion`); phosphenes fade gently over their
lifetimes; the trail buffer **dissolves** (low-alpha fill) rather than
`clearRect`-ing to hard black. α and every luminance term are slew-limited well
under 3 Hz. Degrades gracefully: guards `typeof window`, wraps `AudioContext`
creation and `decodeAudioData` in try/catch (bad file → on-brand
`text-destructive` notice), null-checks `getContext('2d')`, and never touches Web
Audio / Canvas at module top level. With no audio device the visual field still
runs.

## Tags

- `input: single-pointer drag (plant seed) + engagement-drives-α — NOT multi-touch, NOT a slider-as-primary, NOT autonomous`
- `output: Canvas2D additive phosphene field — NOT WebGL2/three.js/WebGPU, NOT SVG-DOM`
- `technique: Wake-Sleep α handoff DRIVEN by engagement + targeted-dream-incubation seed reactivation from a tagged memory ring`
- `harmony: free-detuned ambient pad (NON-lattice) — NOT pentatonic, NOT Bohlen-Pierce, NOT a JI-stack`
- `state: hypnagogia / sleep-onset incubation · pole: cosmic-ambient (handoff/replay — NOT dissolution)`

## Named references

1. **The oneirogen hypothesis** — eLife reviewed preprint **105968**, Version of
   Record **2026-04-21**. Models classical-psychedelic and dream imagery as a
   single parameter **α** interpolating wake (bottom-up) ↔ sleep (top-down) via
   the **Wake–Sleep algorithm**. Cycle-1's anchor; the α engine here is its
   re-implementation.
2. **Targeted Dream Incubation at sleep onset** — Frontiers in Sleep, published
   **2026-06-24** (`10.3389/frsle.2026.1812535`): sleep-onset dreams "tag"
   memories for later processing, and a cue planted at sleep onset gets
   incorporated into subsequent dream content. **This cycle's fresh anchor** — the
   seed mechanic implements it (a planted cue, tagged in memory, reincorporated
   into the replay).
3. **MIT Media Lab "Dormio"** (Horowitz, Maes et al.) — the targeted
   dream-incubation device that presents a cue at sleep onset to steer hypnagogic
   dream content. The drag-to-plant-a-seed gesture is the Dormio cue made
   spatial.

## Cycle-3 deepening

A future cycle could:

- Let **multiple seeds compete** — give planted seeds decaying salience that
  fight for the replay's attention, so the dream drifts between them and
  occasionally fuses two into a chimera, instead of the newest simply winning.
- Add a **second incubator over WebRTC** — two sleepers planting seeds into one
  shared dream field, watching whose motif the replay reactivates (a two-body
  hypnagogia).
- Use **Karel's real Path piano as the world** — replace the built-in pad with a
  live instrument so the wake-field tracks a real performance and the seed
  captures a real musical phrase to be recombined.

## Headless limits

- **Headless-unverified.** Built and tuned in a headless environment with no audio
  device, no pointer, and no dropped file. The band mapping, crossfade balances,
  phosphene brightness, engagement gain / decay, slew rate, and seed bloom radius
  were tuned **by reasoning**, not by ear or eye; the wake↔sleep balance points and
  the "feels like ~15 s" autopilot timing may want adjustment on real hardware.
- Because engagement decay + α slew are time-based, the exact seconds-to-sleep
  depend on frame pacing; the ~15 s figure assumes ~60 fps.
- The "curl noise" is a cheap sum-of-sines scalar potential sampled by finite
  differences, not true Perlin/simplex curl noise — chosen for a calm, boundless
  drift at low cost.
- Seed **audio** reactivation (detune nudge) is subtle; the seed's recurrence is
  most legible **visually** (the bloom). The replay remains a memory-modulated pad,
  not a generative reconstruction of the dropped track.
