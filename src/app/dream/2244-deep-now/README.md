# 2244 · The Deep Now

An altered state you **play**: the dilation of time itself. Press and hold, and
the more you attend, the more each moment's processing stretches — echoes
decelerate and hang, tones bloom, and a single instant swells to fill everything
(the "eternal now").

- **Route:** `/dream/2244-deep-now`
- **Input:** pointer press-and-hold to attend (multi-parameter, multi-touch, played)
- **Output:** SVG-DOM — real `<svg>` elements mutated per frame (no canvas, no WebGL)
- **Technique:** subjective time-dilation via attention-driven echo-lifetime stretch
- **Harmony:** D Dorian (modal) pitch + Sethares stretched partials
- **Pole:** cosmic-ambient arrival — structure BUILDS and HANGS; nothing drains away

## The one question

> What if an altered state you PLAY was *the dilation of time itself* — where
> sustained attention makes a single moment stretch until one instant swells to
> fill everything (the "eternal now")?

## The mechanic (played, multi-parameter)

Three independent played parameters, all real-time — never an autonomous ramp:

1. **Press-and-hold → attention `A`.** `A` is a *slew-limited follower*: it rises
   while you hold (τ≈2.4 s) and eases back on release (τ≈3.6 s). It is never an
   autonomous 0→peak→0 timeline and never a single master knob.
2. **x-position → pitch** — quantised to a D-Dorian modal scale degree.
3. **y-position → timbre/register brightness** — tilts energy toward upper
   partials and shifts the art-layer hue (magenta→indigo).

Multiple simultaneous pointers layer independent voices.

`A` drives a `timeScale = 1 / (1 + 6·A)`: **1** at rest, down to **~0.14** at deep
attention. Existing SVG echoes advance by `dt × timeScale`, so at deep `A` they
visibly **decelerate** and hang; their spawn lifetime also stretches (`~1.3 s`
fleeting → `~10 s` near-eternal). Fresh strikes still appear instantly — it is
the *existing* moment that slows. A persistent radial lattice (concentric rings +
spokes) materialises as `A` builds: the accumulated instant becomes a held,
luminous, near-frozen bloom.

Audio mirrors it (Web Audio, real played voices — not a drone bed): as `A` rises,
note **attack/release stretch** (release `~1.2 s` → `~25 s`), the resonant reverb
tail blooms toward near-infinite, and every DSP glide constant is scaled by
`1/timeScale`. **Pitch stays stable; only time stretches.**

### Harmony detail

Deliberately **not** pentatonic, **not** just-intonation, **not** Bohlen-Pierce:

- **Pitch:** D Dorian, semitone offsets `[0,2,3,5,7,9,10,12,…]` over ~two octaves.
- **Timbre:** Sethares **stretched partials** — partial *k* sits at
  `f₀ · s^(log₂ k)` with a stretched-octave ratio `s ≈ 2.06` (integer harmonics
  would be `s = 2.0`). The mildly inharmonic series gives the characteristic
  shimmering stretched timbre.

## Research grounding

- **psypost, 2026-03-20 — "Psilocybin alters time perception by disrupting working
  memory and attention."** Psychedelic time-dilation is *not* the brain changing
  an internal pacemaker's speed. 5-HT2A activation raises cortical excitability
  and sensory input **gain**, so the brain **over-processes** each moment — and
  more processing is felt as *more elapsed time* (dilation). This prototype makes
  that mechanism playable: more attention (hold) = more processing per instant =
  more subjective duration = a stretched, hanging "now."
- **Marc Wittmann, *Felt Time* (MIT Press).** Subjective duration expands with
  attention and arousal; attended moments feel longer. `A` is exactly that
  attentional gain, played by hand.

## Self-demo (headless-safe)

On mount a **seeded** autopilot (`mulberry32`, fixed literal seed `0x2244`) plays
the piece with zero input — short fleeting taps interleaved with occasional long
sustained holds, so the dilation arc is legible even with no interaction. Live
pointer input takes over immediately; the autopilot resumes after ~7 s idle so the
piece stays alive. No `Math.random`, no `Date.now`, no argless `new Date()` — only
the seeded RNG and rAF timestamps drive anything time- or randomness-related.

## Safety

Any luminance oscillation routes through the shared `createSafeFlicker`
(`../_shared/psych/safeFlicker`): **off by default**, hard-capped ≤3 Hz, soft sine
with a luminance floor (never a strobe), and it honours `prefers-reduced-motion`
(also damping the core "breath" and lattice rotation). Nothing strobes.

## Degrade gracefully

- **No Web Audio:** an on-brand `text-destructive` notice appears and the visuals
  keep running silently. Audio is created only on the "Begin" gesture (browser
  autoplay policy); the visual self-demo runs from mount without it.
- **No pointer:** the seeded autopilot self-demos.

## Files

- `page.tsx` — the `"use client"` page: SVG-DOM substrate, played gestures,
  attention follower, time-dilation loop, seeded autopilot, chrome.
- `audio.ts` — `DeepNowAudio`: modal pitch + Sethares stretched-partial voices,
  attention-stretched envelopes/glides, shared void-reverb tail.
- `rng.ts` — seeded `mulberry32` + `randRange`.
- `README.md` — this file.

Reused from `_shared`: `psych/safeFlicker` (`createSafeFlicker`,
`prefersReducedMotion`) and `psych/convolutionVoid` (`createVoidReverb`). All
played voices are built in this folder.

## Honest notes on what I could not verify headless

- I could not run the piece in a real browser in this environment, so the exact
  perceptual "feel" of the deceleration and the audio balance (voice level vs.
  reverb wet at deep `A`) are tuned by ear-of-the-mind, not measured. The gains
  are conservative and pass through a compressor, but on-device level/EQ may want
  a tweak.
- Multi-touch layering is implemented via pointer events with `setPointerCapture`;
  I verified the logic but not on real multi-touch hardware.
- TypeScript + ESLint were confirmed clean for this folder. I did not run a full
  production `next build`.
