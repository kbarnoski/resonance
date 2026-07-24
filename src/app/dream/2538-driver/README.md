# 2538 · driver

**The one question:** _What if a techno machine never played the same bar twice — a generative club engine that composes an endless, evolving arrangement in real time, rhythm-first, and can sound genuinely dangerous?_

A rhythm-first generative club engine. A seeded arrangement state machine walks a
multi-minute arc — intro → build → drop → breakdown → build → drop … — mutating
a fully-synthesized 909/303-style pattern bank every bar so that, over minutes,
the machine audibly transforms and **never plays the same bar twice**. Output is
a hand-rolled WebGL2 "equalizer city"; the computer keyboard is the performance
surface. No samples, no pitch-lattice safety net — timbre and rhythm are the
substrate, and the acid line is allowed to clash.

This is the direct cash of arXiv:2605.21874 ("Real-time, EDM-inspired
sonification of a supercomputer", May 2026): infinite-yet-stylistically-coherent,
genre-native, monitoring-style music — a continuous stream that stays engaging
because it *evolves* rather than loops.

## The arrangement state machine (`engine.ts` — the heart)

`Arrangement` advances one 16th step per `tick()` and re-evaluates the whole
piece each bar:

- **Phase walk.** `intro → build → drop → breakdown → build → …`. Every phase
  gets a fresh, PRNG-drawn length (build 6–10 bars, drop 8–16, breakdown 4–8),
  so no two passes of a phase line up.
- **Energy / tension scalars.** A target energy is derived from the phase and
  its progress, then *smoothed per step* (time constant ~2 s) so the visual
  drifts gently rather than snapping — this is also the photosensitive-safety
  guarantee. Track activation is gated by energy thresholds, so tracks fade in
  and drop out organically (the kick and hats fall away in the breakdown, the
  sub and open hat only appear at the top of a drop). Both scalars are shown
  numerically in the HUD.
- **Per-bar mutation.** Four-on-the-floor kick with drifting ghost hits;
  backbeat clap with wandering ghosts; closed hats built from offbeat 8ths plus
  probabilistic 16th ghosts (the main source of bar-to-bar variety); sparse open
  hats; fills that roll the kick and clap and fire a noise riser before a drop.
- **The acid line evolves, it doesn't regenerate.** ~40% of its 16 steps are
  re-rolled each bar, so the phrase is continuous yet never identical, with an
  occasional dissonant root drift (±1 or ±5 semitones).

### How it never repeats

Two mechanisms. (1) Every bar draws fresh values from a single advancing PRNG
stream, so consecutive bars structurally differ. (2) Each finished bar is hashed
(FNV-style over the whole pattern bank + acid sequence + root) and checked
against a rolling 64-bar history; only genuinely-new bars increment the
`distinct bars` counter shown in the HUD next to `0 repeats`. In practice the
counter tracks the bar count exactly — the machine is composing, not looping.

### Deliberately dangerous, not snapped-consonant

The acid draws from a pool that includes the b9 (1 semitone) and the tritone
(6), can jump an octave, and drifts its root into dissonance against the sub.
There is no just-intonation / pentatonic quantiser. Combined with a resonant,
envelope-modulated 303 filter (`synth.ts`) driven through a waveshaper, and a
soft-clip + limiter on the master, it can bite. Rhythm and timbre are the point.

## Determinism

All pseudo-randomness comes from `mulberry32(0x2538)`; the seeded noise bed in
`synth.ts` is filled from the same generator family. There is **no** `Math.random`,
`Date.now`, or `new Date()` anywhere — variation is PRNG + a monotonic bar/step
counter, so replaying the seed reproduces the same performance. `performance.now`
is used only for animation frame timing (visual clock), never for musical
variation.

## Output — WebGL2 (`gl.ts`)

A hand-rolled WebGL2 fragment shader (no three.js): a spectrum of glowing violet
columns — an "equalizer city" over a receding club floor — whose heights are
driven by the live per-voice envelopes and the energy scalar. A soft VU cap
rides each bar; a playhead glow marks the current 16th step; horizontal beams
track tension. Falls back to a DOM bar-meter (with a `text-destructive` notice)
when WebGL2 is unavailable.

**Photosensitive-epilepsy safety.** Brightness is a smoothly-drifting field. The
kick contributes only a soft global lift at ~2 Hz (well under 3 flashes/sec); the
background never approaches a full-screen high-contrast strobe; a filmic tone
curve caps peak luminance. Per-hit twinkles decay over 50–250 ms and are
localized to their spectral band, not the whole screen.

## Input — the keyboard is the instrument

| Key         | Action                                   |
| ----------- | ---------------------------------------- |
| Space / F   | trigger a fill                           |
| ↑ / ↓       | raise / lower the energy bias            |
| D           | force a drop                             |
| B           | force a breakdown                        |
| A           | toggle the acid line on/off              |
| 1–6         | mute / unmute kick·sub·clap·chat·ohat·acid |

Space (before start) or the **start engine** button gates the `AudioContext`
behind a user gesture. On small screens an on-screen button row mirrors the
controls.

## Silent-review / auto-demo

On load the engine is already running its arrangement silently, driven by the
animation-frame clock, so a still screenshot reads as "a machine mid-composition"
— phase, energy, tension and a live spectrum are all visible without audio. Audio
starts on the first gesture and the state carries over seamlessly.

## References

- arXiv:2605.21874 — _Real-time, EDM-inspired sonification of a supercomputer_
  (May 2026): infinite, stylistically-coherent, genre-native monitoring music.
- Brian Eno / Koan — generative music as rules + state, not a fixed loop.
- Roland TR-909 / TB-303 — the synthesized-voice reference for the kit and the
  resonant acid bassline.

## Honest caveats (unverified headless)

- Audio timing, the acid glide/slide behaviour, and the exact "danger" of the
  drive were tuned by ear in the design but **not verified in a real browser in
  this environment** — no sound was rendered headless.
- Photosensitive-safety measures are built in by construction (soft luminance
  drift, ≤3 Hz global pulse, capped peak luminance) but were **not** validated
  against a formal flash-analysis tool.
- WebGL2 shader compilation is assumed to succeed on the reviewer's GPU; the DOM
  fallback covers the no-WebGL2 case but the shader itself was not run here.
- "Never repeats" is guaranteed structurally (advancing PRNG + hash check) rather
  than proven exhaustively; a hash collision would under-count distinct bars but
  cannot cause an actual audible repeat within the history window.
