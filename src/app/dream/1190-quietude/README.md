# 1190 · Quietude

**What if SILENCE were the instrument?**

An inversion of every microphone prototype in the lab. Instead of sound driving
the visuals, the room's *quiet* opens the piece and any noise ducks it. Stillness
is rewarded.

A just-intonation drone-choir is **always** synthesizing internally, held at
zero. When the room falls quiet the choir blooms open with a slow attack; the
moment a sound arrives it ducks fast. Sustained stillness unlocks new overtone
voices one at a time, so deep silence is audibly *richer* than a merely-quiet
moment.

## How to use

1. Open the route and press **Enter the quiet** (audio is gesture-gated — the
   browser will not let sound start without a click).
2. Grant microphone access. Then be quiet. Master gain ramps up from zero; the
   quieter the room, the fuller the choir.
3. Stay still. Every ~4 seconds of sustained quiet fades in one more overtone
   voice (up to all seven). The gold/ivory mandala grows more rings, rays, and
   motes as voices unlock.
4. Make any sound. The choir ducks instantly and the mandala shatters into
   drifting motes — which reconverge into rings as quiet returns.

### No microphone? Still-mode

If the mic is denied or unavailable, a clear rose note appears and **still-mode**
takes over: the same instrument, a different silence-sensor. Leaving the pointer
and keyboard idle raises openness and unlocks voices; any `pointermove` /
`keydown` / scroll / touch ducks it. Reward stillness by not touching anything.

## The technique

- **Adaptive noise-floor gating** (`floor.ts`). A self-calibrating floor tracks
  a running minimum of RMS that falls fast toward new lows and rises very slowly,
  so it rejects steady fan/speaker bleed and works in any room. `openness =
  1 − smoothstep(floor, floor + margin, rms)`, then an asymmetric gate smooths it
  with a slow attack (quiet opens gradually) and a fast release (noise ducks
  instantly).
- **JI drone-choir** (`choir.ts`). Root 110 Hz; partials `1 · 9/8 · 5/4 · 3/2 ·
  5/3 · 15/8 · 2`. Each voice is a pair of detuned oscillators with a sub-0.3 Hz
  shimmer LFO on their detune, a peaking formant + softening lowpass, summed into
  a shared procedural convolution reverb (a decaying-noise impulse response),
  through a `DynamicsCompressor` limiter into a master gain peaking at ~0.18.
- **Stillness timer → voice unlock.** A fractional unlocked-voice count rises
  while openness is high and relaxes slowly (never yanks) during a disturbance;
  the newest voice fades in/out smoothly rather than snapping.
- **SVG mandala** (in `page.tsx`). Inline `<svg>` — concentric `<circle>` rings,
  radial `<line>` rays whose count grows with unlocked voices, and a pool of mote
  `<circle>`s. All animated by mutating attributes via refs inside one
  `requestAnimationFrame` loop (no per-frame React re-render). Rings dissolve and
  motes scatter outward on disturbance, then spring home in quiet.

## Palette & safety

Bright gold/ivory on warm off-white (`#faf6ec`) — a light, meditative,
conceptual piece, not a dark one. All motion is slow luminance/position drift;
no strobe or flicker. `prefers-reduced-motion` flattens the scatter animation and
keeps only a gentle breath.

## Named references

- **John Cage — *4′33″* (1952):** the piece whose "silence" is the ambient room
  itself. Here silence isn't the frame around the music — it *is* the music.
- **Éliane Radigue — sustained drone practice:** slow, patient, barely-moving
  drones that reward deep listening; the choir's sub-0.3 Hz shimmer and multi-
  minute voice bloom are in that lineage.

## Honest gaps

- The noise floor takes a few seconds to settle after a loud room quiets down
  (slow-rise by design), so openness can lag briefly on first entering silence.
- Browser echo-cancellation is disabled for raw input; loud room reverb or the
  device's own speakers can keep openness suppressed. Headphones help.
- Still-mode idle detection is global to the window; the design-notes toggle
  counts as activity, so read the notes before settling into stillness.
- The mandala geometry is procedural but fixed at 7 rings; it does not yet react
  to *which* overtone unlocked (all voices share one visual weight).
