# Dream Agent — cycle state

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
