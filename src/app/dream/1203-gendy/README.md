# 1203 · Gendy

**The one question:** *What if the waveform itself were alive — a jagged polygon
whose every corner drifts by a random walk, and you could tune how much order vs.
chaos it holds?*

A hands-on realisation of **Iannis Xenakis's Dynamic Stochastic Synthesis
(GENDYN)** as a live, gestural instrument. You are literally holding a waveform
and can calm it into a pure pitched tone or unleash it into stochastic grit.

## How GENDYN works here

The tone is not sampled or oscillated — it is **drawn**. One cycle of the
waveform is defined by a small set of **breakpoints** (12 here), each carrying a
**time-duration** and an **amplitude**. We linearly interpolate between the
breakpoints to fill the cycle.

What makes it *dynamic* and *stochastic*: after **every completed cycle**, each
breakpoint's amplitude **and** duration is nudged by a random step (a Gaussian
random walk — a *second-order* stochastic process, since it is the breakpoints,
not the samples, that walk). Each value **reflects off elastic mirror barriers**
(min/max) so it stays bounded yet never settles. The durations are renormalised
each cycle to the target period, so the fundamental tracks the chosen pitch while
the relative jitter warps the waveform horizontally.

- **Order ↔ chaos** (the drag) sets step size, barrier width, and per-cycle pitch
  jitter together. Small steps + tight barriers near duration 1 → the shape
  barely changes cycle-to-cycle → a nearly periodic, pitched tone. Large steps +
  loose barriers + pitch wobble → the shape convulses → a gritty, living roar.
- **Three voices** at registers ×0.5, ×1.0, ×2.0 add body.
- Runs in an **AudioWorklet** (`worklet-source.ts`, shipped as a Blob-URL string
  so the folder stays self-contained). If `addModule` throws or worklets are
  unavailable, it falls back to a **ScriptProcessorNode** driving the identical
  algorithm (`gendy-core.ts`) so it always makes sound.

**Input** — active gesture: drag anywhere on the field. Up/right tightens toward a
pure tone and raises the pitch region; down/left dissolves it into roughness. When
you let go, the field breathes on a slow sine so it stays alive.

**Output** — WebGL2 oscilloscope (`gendy-renderer.ts`): the **actual current
waveform** is drawn as a glowing ribbon filament, redrawn every frame as its
corners drift, over a **ping-pong feedback afterimage field** so you *see* the
random walk. Deep-teal / near-charcoal ground with radial chiaroscuro; the
filament runs electric-violet when calm → hot amber when chaotic. Falls back to a
dark chromatic Canvas2D path (shadow-blur glow + translucent veil trails).

## Safety

Master `DynamicsCompressor` limiter, master gain **exponentially ramped from 0**,
per-sample `tanh` soft-clip **and** a hard amplitude clamp in the DSP. No
strobe/flicker — continuous slow luminance drift only. Audio is gesture-gated
behind **Begin**. Respects `prefers-reduced-motion` (calmer chaos ceiling, slower
motion). Full teardown on unmount: RAF cancelled, all audio nodes + worklet/script
node disconnected, `ctx.close()`, GL program/buffers/textures deleted,
`webglcontextlost` handler + resize listener removed, object URL revoked.

## Tags

- **INPUT** drag order↔chaos (active)
- **OUTPUT** WebGL2 living-waveform oscilloscope
- **TECHNIQUE** GENDYN dynamic stochastic synthesis (random-walk breakpoints w/ elastic barriers)
- **PALETTE** deep-saturated chromatic chiaroscuro
- **VIBE** gritty / organic / intense

## References

- **Iannis Xenakis**, *GENDY3* (1991) and *Formalized Music* — the theory of
  dynamic stochastic synthesis (random walks with elastic barriers).
- **Peter Hoffmann**, analytical work on the GENDYN program.
- **Nick Collins** / **Andrew Brown**, realtime stochastic-synthesis
  implementations.
- **GendyJS**, a Web Audio proof-of-concept.

*New to this lab: GENDYN as a **waveform** synthesis voice has never been built
here before — this cycle's over-used voices (just-intonation choir/drone) are
deliberately avoided.*

## Honest rough edges

- The ScriptProcessorNode fallback is deprecated and can glitch under main-thread
  load; it exists purely so the piece never goes silent.
- The pitch is renormalised per cycle, so at very high chaos the *timbral* grit is
  stronger than the *pitch* instability of Xenakis's fully-free-running durations
  — a deliberate trade for a musically holdable instrument.
- Worklet and fallback keep two hand-synced copies of the DSP core; they must be
  edited together.
- The oscilloscope shows only the lead (mid-register) voice, not the full
  three-voice sum.
