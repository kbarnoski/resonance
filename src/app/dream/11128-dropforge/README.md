# 11128 · Dropforge

**The one question:** what if the journey engine could ride an EDM build-and-drop
arc — tension coiling, the breath-holding break, the release — instead of a calm
ambient wash?

Dropforge is the opposite pole to the lab's ambient pieces: an autonomous,
long-form EDM tension engine with memory and state. It is genuinely *different at
minute 5 than at minute 1*.

## What it is

A self-driving state machine cycling the canonical EDM dramaturgy:

```
intro → build → break → THE DROP → sustain → decay → (loop to build, evolved)
```

- **build** — a riser climbs, a lowpass opens, the snare roll accelerates from
  8ths to 16ths, and tension coils on an accelerating curve.
- **break** — everything strips to a filtered pad + reverb tail and holds for
  ~2 bars of near-black suspense.
- **the drop** — a white-noise + sub impact hits the downbeat; the sub-bass
  arrives for the first time; the lead opens up; the visuals bloom.
- **sustain / decay** — the groove settles, then winds down and loops back to a
  fresh build.

Each loop **mutates** its parameters — key, lead motif, groove density, BPM — via
a seeded `mulberry32` PRNG (seed `0x11128`), so sections evolve rather than
repeat. A single `tensionEnergy` (0..1) is the value the whole audio + visual
system reads.

## How to use

- **Start** — begins the engine (audio starts on this gesture). It self-runs; no
  further input is required.
- **Energy** slider — biases how hot the entire arc runs (0.5 is neutral).
- **Force the drop** — armed only while the engine is *building*; collapses the
  build into the break → drop early. The drop still feels earned.

The live readout shows the current section, BPM, pass number, and tension.

## The technique

- **Long-form stateful arc** (`arc.ts`) — a `DropArc` class holding section index,
  progress, mutating params, and the biased tension target. Per-section tension
  curves give the build its accelerating coil and the drop its spike.
- **Look-ahead scheduler** (`scheduler.ts`) — a ~25 ms `setTimeout` loop with a
  ~100 ms look-ahead walks 16th notes against `AudioContext.currentTime`, asking
  the arc what to play at each step. Tight timing independent of main-thread
  jitter.
- **Sidechain ducking** (`synth.ts`) — every kick slams a shared duck-bus gain
  down and ramps it back, so bass + lead breathe under the kick: the classic EDM
  pump. Kick / snare / riser bypass the duck.
- **Synthesis, no samples** — supersaw lead (5 detuned saws → rising lowpass),
  off-beat plucked bass, sub that only arrives at the drop, riser (looping noise
  → climbing bandpass + a saw pitch-glide), noise claps, and a two-osc reverb pad
  for the break.
- Everything routes into the shared **ear-safety master bus**
  (`_shared/visionary/safeMaster`), whose limiter also tames the drop's peak.

## Visuals — pure CSS/DOM compositor

No canvas, no WebGL, no SVG. Every layer is a `<div>`: a radial-gradient
background, a field of concentric rings, a bloom disc, a shockwave ring, and a
bar field. The render loop updates only a handful of CSS custom properties per
frame (`--t`, `--lvl`, `--kick`, `--bloom`, `--drift`, `--hue`); the browser's
compositor is the entire renderer. During the build the rings tighten and
brighten; the break drains to near-black; the drop blooms and fires an expanding
shockwave; then the groove pumps to the kick.

Palette: electric violet → magenta, cool-white light on black.

## Strobe safety

This is non-negotiable for EDM. There is **no flashing**:

- Energy reads through *smooth* luminance swells, scale, blur and hue — never a
  strobe.
- The only kick-rate luminance motion is a soft, eased peak-follower envelope
  (kick ~2 Hz, well under the 3 Hz cap) contributing a small (~15%) share of the
  bloom.
- Tension is smoothed (rise fast, fall slow) so even the drop is a swell, not a
  snap.
- `prefers-reduced-motion` removes the kick pump and the shockwave entirely,
  leaving only slow gradient drift.

## What's rough / next

- The reverb is a generated-impulse convolver; a dedicated pre-delay + longer
  tail would make the break breathe more.
- Motifs are pure random draws from the scale; a little melodic contour shaping
  (steps over leaps) would make leads more singable.
- Snare-roll acceleration is quantized in three stages; a continuous ramp to a
  32nd-note roll right before the drop would tighten the anticipation.
- No hats/percussion layer yet — adding open/closed hats would thicken the
  sustain groove.
