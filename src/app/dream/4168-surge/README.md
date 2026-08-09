# 4168-surge

**An alternate journey engine for Resonance with a genuinely different energy
from the calm visionary default: a self-composing, long-form EDM
build-and-drop set that plays itself and hits like a set.**

## The one question

> What if Resonance had an alternate journey engine — a self-composing, ~7-minute
> EDM build-and-drop arc (tension riser → drop → breakdown → second, bigger drop →
> outro) that plays itself, seeded by a real piano melodic core?

Where the house default is calm and cosmic, this is kinetic euphoria: the
tension-and-release architecture of progressive/melodic house. Press **Drop in**
and it composes and performs a full set on its own. Interaction (an optional
real-piano layer) is secondary.

## The arc — seven sections, ~7m20s

Driven by a single `performance.now()` clock through a state machine in
`arc.ts`. Energy is not flat inside a section: builds *accelerate* (ease-in, so
the last bars feel steepest), drops slam to a high plateau then bleed, the
breakdown sinks.

| # | Section | Duration | Energy (start→end) | What changes |
|---|---------|----------|--------------------|--------------|
| 1 | Intro · the piano alone | 46s | 0.10 → 0.24 | motif stated bare on felt piano + pads; no drums |
| 2 | Build 1 · riser climbing | 58s | 0.24 → 0.90 | Shepard riser winds up, kick enters late, hats accelerate into a roll, filter closing then poised |
| 3 | Drop 1 · motif returns | 74s | 0.86 → 0.72 | four-on-the-floor, sub, supersaw lead plays the motif octave-stacked, filter opens |
| 4 | Breakdown · cooling | 56s | 0.50 → 0.34 | drums drop out, motif echoes with an octave shadow, pads swell |
| 5 | Build 2 · steeper riser | 70s | 0.34 → 0.98 | a steeper riser, denser roll, more sub |
| 6 | Drop 2 · bigger, wider | 96s | 1.00 → 0.86 | **larger than Drop 1** — 9 saw voices vs 6, an extra octave, a +2-oct piano sparkle, a bright 16th counter-arp, wider-open filter |
| 7 | Outro · dissolve | 40s | 0.55 → 0.00 | motif returns bare, long pad, everything fades |

Total = 440s. Minute 7 is a climax minute 1 only hints at.

A section-name label, an energy meter, and an elapsed/total progress readout are
on screen so a reviewer sees the arc live.

## The Shepard riser

Each build winds a **Shepard tone** (`stepRiser` in `audio.ts`): eight sine
oscillators spaced exactly one octave apart, each weighted by a Gaussian
("raised-cosine-ish") window over log-frequency centred ~3.2 octaves up. The
whole comb glides upward — `riserPhase` advances at a rate that scales with the
arc's riser drive — and **wraps every octave** (`riserPhase -= floor(riserPhase)`),
so partials fade in at the bottom of the window and out at the top and there is
never an audible edge: it seems to rise *forever*. At the drop the riser drive
falls to zero and the tension releases into the sub and the open filter.

## The motif and how it escalates

The memory of the piece is an 8-note topline (`MOTIF` in `audio.ts`) in A natural
minor over an Am–F–C–G progression. It is:

- **stated bare** in the intro on a felt-piano-ish voice (detuned triangle
  partials 1–4, soft 14 ms attack, gentle lowpass);
- **echoed with an octave shadow** in the breakdown;
- **re-orchestrated** in the drops on a 6–9-voice supersaw lead through one
  resonant lowpass whose cutoff tracks energy (the classic "filter opens on the
  drop"), octave-stacked, with the felt piano doubling underneath for body.

Drop 2 escalates the *same* motif: an extra sub-octave and super-octave in the
stack, a +2-octave piano sparkle the first drop never had, a bright 16th
counter-arp, louder sub, and a wider-open filter — audibly larger, not just
louder.

## Named reference

- **Roger Shepard, *Shepard tone* (1964)** — the auditory "barber pole" of
  octave-spaced partials under a fixed log-frequency envelope. Borrowed exactly:
  the octave comb + sliding window + octave-wrap that makes the pre-drop riser
  seem endlessly rising.
- **The canonical EDM build-and-drop song form** — borrowed as the whole
  architecture: tension (riser + rising filter + accelerating hats) → release
  (drop: filter opens, sub kicks, motif returns) → breakdown → a second, bigger
  tension/release.

## Audio ↔ shader coupling

All audio is synthesised by hand on the Web Audio API (`audio.ts`) — felt piano,
supersaw lead, mono sub, pitch-enveloped kick, noise hats + clap, pads, Shepard
riser — through a master limiter so drops don't clip. A look-ahead scheduler
(`setInterval` against `ctx.currentTime`) places the beat; a per-frame `setArc()`
glides bus gains and filter cutoff toward the arc. Everything ramps
(`setTargetAtTime` / exponential ramps from 1e-4) so it is click-free.

The visual (`shaders.ts`) is a full-screen **WebGL2 fragment shader** — a
domain-warped plasma bloom, a field, not a point cloud. It reads the arc
(`u_energy`, `u_riser`, `u_warm`, `u_flash`) and a live `AnalyserNode` envelope
(`u_rms` broadband, `u_low` kick/sub band). The build tightens and heats the
warp; the drop drives a radial bloom *surge* outward from the centre; the kick
adds a slow luminance pump. One clock, shared by ear and eye.

## Safety — swell, don't strobe

Photosensitive-epilepsy risk is real, so there is **no hard black↔white
flashing anywhere**. The drop "flash" and kick "pump" are slow luminance swells
(well under ~3 Hz), rotation is a gentle sub-Hz drift, a soft tone-map
(`col / (1 + 0.35·col)`) prevents blown highlights, and `u_reduce` damps every
motion term for `prefers-reduced-motion`.

## Degradation

- No input required — it self-plays with the synth default and no network.
- WebGL2 unavailable → a Canvas2D energy field + an on-brand `text-destructive`
  notice; context loss and DPR resize are handled.
- The optional real-piano layer (`/api/audio/{uuid}`) is best-effort: on any
  failure it shows a `text-destructive` notice and the synth plays on.
- Determinism: all randomness is a `mulberry32(0x4168)` PRNG — no `Math.random`,
  no `Date` — so the set plays the same every time.
- Full teardown on unmount: `cancelAnimationFrame`, `audioCtx.close()`, stopped
  oscillators, deleted GL program/VAO + `loseContext`, removed listeners.

## What I'd deepen next

The two clocks (the `performance.now()` arc and the `ctx.currentTime` beat grid)
run independently, so the drop's *musical* downbeat can land up to a beat away
from the arc's section boundary and the visual flash. The honest next step is to
derive one from the other — quantise section transitions to the bar grid so the
kick, the filter opening, and the bloom surge all hit on the *same* downbeat.
I'd also give the motif real harmonic re-voicing per chord (right now the lead
plays it in a fixed scale that merely fits the progression) and add a proper
send-reverb/delay bus so the breakdown breathes instead of just thinning out.
