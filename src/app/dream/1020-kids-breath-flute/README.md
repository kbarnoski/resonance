**For**: kids (4+)

# Breath Flute

Blow or hum into the tablet and a glowing column of air actually *sings* a real
flute — not a recording, not a sample, but a flute **synthesized from physics**
in real time. Tap the big glowing holes to pick a note. Blow softly for a mellow
tone, harder for a brighter one.

## What it is

A self-contained, touch-first, no-reading-required instrument for small children.
The child's **breath loudness** (the microphone's RMS envelope) is the air
pressure that drives a modelled flute bore. They choose the pitch by tapping one
of eight big coloured circles laid out as a real musical mode. Loud breath =
louder and brighter; soft breath = mellow. If there's no microphone (or it's
denied) the holes still work as "tap-puffs", and after two seconds of stillness
the flute gently plays a little phrase by itself, so the screen is never silent.

## The technique

This is a genuine **jet-drive digital-waveguide flute** — a physical model, not
a sampler. Per audio sample (`flute.ts`):

- **One fractional-delay bore.** A delay line whose (interpolated) length sets
  the pitch. Total loop length = bore delay + jet delay = one period.
- **A two-stage termination + jet path.** An inverting one-pole **reflection
  filter** at the bore end, whose cutoff tracks the pitch (cutoff = 5× the
  fundamental). This anchors the fundamental and stops the low notes jumping to
  a sharp higher mode.
- **A cubic non-linear jet term.** `jet(x) = x·(x² − 1)`, the classic STK jet
  table: nearly linear for soft breath, saturating for hard breath — which is
  what brightens the timbre and (pushed past the playing band) would overblow.
- **A non-inverting feedback loop** that sustains the standing wave.
- **A DC blocker** on the output.

The child's raw breath is smoothed (≈25 ms attack) and mapped into the bore's
**stable playing band** so soft breath is mellow, hard breath is bright, and an
accidental gust never squeaks into the octave.

The model runs in an **AudioWorklet** (loaded via a Blob URL — worklets can't
import, so the DSP travels as a source string) for clean, low-latency audio,
with a **ScriptProcessorNode fallback** when AudioWorklet is unavailable. The
visual air-column is **WebGL2** (a teal → violet → gold aurora shader) with a
**Canvas2D fallback**.

### Why G-Mixolydian (and not pentatonic)

The eight holes are **G A B C D E F G** — G-Mixolydian, a real mode (a major
scale with a lowered 7th). It has a genuine, slightly wistful character and real
intervals to discover. It is deliberately **not** a "no-wrong-notes" pentatonic
scale.

## How to use it

1. Tap **Start** (a user gesture is required to begin audio).
2. Allow the microphone if you'd like to blow/hum; if you decline, everything
   still works.
3. **Tap a glowing hole** to pick a note. Drag a finger across the holes to
   slide between pitches while it sounds.
4. **Blow or hum** into the tablet — softly, then harder — and watch the column
   grow and warm.
5. Leave it alone for two seconds and it plays a gentle phrase by itself.

## Named reference

Perry R. Cook & Julius O. Smith — the **STK (Synthesis ToolKit) "Flute"**
jet-drive waveguide model. This prototype is a faithful port of that topology
(bore delay, jet delay, reflection filter, cubic jet table, DC block).

## Verification

`flute.test.ts` exports a headless `selfTest()` that synthesizes each of the 7
scale notes for a short buffer and, per note, asserts:

1. **bounded** — no NaN/Inf and every sample below a ceiling,
2. **oscillating** — non-trivial output RMS,
3. **in tune** — the fundamental (estimated by autocorrelation) within
   ±60 cents of the target.

It passes for the whole scale at both 48000 Hz and 44100 Hz (every note lands
within ~±20 cents, most within ±7). Call it from the dev console:

```ts
import { selfTest } from "./flute.test";
console.log(selfTest().summary);
```

## Design notes

- **The hard part was tuning, not topology.** A raw STK jet flute happily
  mode-jumps and overblows. Three things tamed it: (a) splitting the period as
  `bore + jet` with `bore = (period − comp)·(1 − jetRatio)`, (b) a ~2-sample
  group-delay compensation so the fundamental lands on pitch, and (c) a
  reflection-filter cutoff that **tracks the pitch** rather than sitting at a
  fixed frequency — without that, the lowest notes (G4, A4) ran 90–160 cents
  sharp because the bore favoured a higher mode.
- **Breath is pressure, not pitch.** We never do pitch detection on the child's
  voice. Loudness of breath = air pressure into the bore; pitch comes only from
  the tapped hole. Humming works as well as blowing because both are just
  "loudness over time".
- **Always-alive.** Mic, tap-puff and idle auto-demo feed one shared breath
  envelope (strongest wins), so the flute makes sound on a hands-free glance and
  degrades gracefully through every failure mode.
- **Calm by construction.** The playing band can't overblow, the palette is warm
  and soft, the holes are ≥76 px, and there is no reading required.
