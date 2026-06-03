**For**: kids (4+)

# Thunder Drum

A full-screen, multi-touch drum skin you strike anywhere with a finger. The sound is not sampled and it is not a pretty bell scale — it is a tiny real-time **physical model of a circular membrane**. Strike the center for a deep round boom, strike near the rim for a bright slap, and hit it *hard* (or roll fast) to hear the head's tension bend the pitch up before it settles — the "bwooOOWww" of a thunder-drum / tympani.

## The one question it answers

What if a kid could play a real drum skin — strike it anywhere, and hear the *physics* of a thunder-drum, where a hard hit bends the pitch up before settling?

## Why it's novel in the lab

Every other kids toy in this lab plays plucked strings or triangle bells locked to a C-major pentatonic scale on tap. This is the lab's **first playable membrane physical-modeling / non-linear modal synthesis** instrument:

- **The pitches are eigenmodes, not a scale.** A struck drum head vibrates in the modes of a circular membrane, whose frequencies are the zeros of Bessel functions — inharmonic and **deliberately non-pentatonic** by physics. It sounds like a drum, not a glockenspiel.
- **The signature: tension pitch-glide.** A drum head under a hard strike momentarily tightens, so all partials start sharp and exponentially relax to their rest pitch. That non-linearity is *the* thunder-drum sound, and it is wired directly to how hard you hit.
- **Strike position is timbre.** Where you touch the skin changes which modes are excited — round and dark at the center, bright and slappy at the rim — just like a real drum.

## Audio engine

Web Audio API only. Each strike spawns a **modal voice**: a bank of decaying sine partials at the ideal circular-membrane mode ratios relative to a fundamental `f0`:

```
MODE_RATIOS = [1.000, 1.594, 2.136, 2.296, 2.653, 2.918, 3.156, 3.500]
              (0,1)  (1,1)  (2,1)  (0,2)  (3,1)  (1,2)  (4,1)  (2,2)
```

Higher modes decay faster (per-mode time-constants shorten from ~0.85 s down to ~0.15 s), which is what makes it read as a struck skin instead of a sustained chime.

### Tuning (consonant but NOT pentatonic)

Four drum zones sit around the head, tuned as a just-intonation spread over a 110 Hz root — unison, just fourth, just fifth, octave:

| Zone (by angle) | Ratio | f0 (Hz) | Color |
| --- | --- | --- | --- |
| 1 | 1/1 | 110.0 | rose |
| 2 | 4/3 | 146.7 | amber |
| 3 | 3/2 | 165.0 | cyan |
| 4 | 2/1 | 220.0 | violet |

These are membrane *fundamentals*; each then rings its full inharmonic mode bank on top, so the result is consonant between zones yet unmistakably not a major-pentatonic toy.

### Strike position → timbre

The tap radius `r` (0 = center, 1 = rim) sets a per-partial gain. Low axisymmetric modes are weighted toward the center (`centerWeight = 1 - brightness`), higher modes toward the rim (`rimWeight = 0.25 + 0.9 * brightness`), blended by `r`. Center hits are dark and round; edge hits are bright and slappy.

### Velocity → non-linear pitch glide

A pseudo-velocity is derived from how fast successive taps arrive (fast drum-roll = harder); drags read as soft continuous strikes. On a hard hit, all partials start detuned **up to +6% sharp** (`bend = 1 + 0.06 * velocity`) at the attack, then relax to rest pitch over **120–260 ms** via `osc.frequency.setTargetAtTime(...)`. A soft tap barely glides; a hard tap clearly bends.

### Safety / always-on

- A soft ambient drone (two low sines a fifth apart with slow vibrato) starts on the first gesture so it is never silent.
- Everything ramps via `setTargetAtTime` / `setValueAtTime` — click-free. A master `DynamicsCompressor` limiter keeps layered hits from clipping, and levels are kept gentle (the "would this wake a sleeping toddler?" test).
- The `AudioContext` is created and resumed on first pointer-down to satisfy autoplay policies.

## Visual (three.js)

The drum head is a high-resolution `CircleGeometry` disc seen at a slight tilt. On strike, mesh vertices are displaced by a **travelling radial standing-wave ripple** emanating from the contact point, pinned to zero at the rim (`cos(rNorm * PI/2)`) like a real membrane, decaying in space and time. Multiple strikes overlap as multiple ripples. The skin breathes gently at rest, each zone has a bold saturated color (color = sound), and every contact spawns an expanding additive glow ring. Multi-touch is handled via Pointer Events. If WebGL is unavailable, a readable `text-rose-300` notice is shown instead of throwing.

## References

- **nlm: Real-Time Non-linear Modal Synthesis in Max**, arXiv 2603.10240, 2026 — the tension/amplitude-dependent detune approach.
- **Lord Rayleigh, _Theory of Sound_, 1877** — circular-membrane Bessel modes and their eigenfrequency ratios.
- **Morrison & Rossing — tympani tension nonlinearity** — why a struck head's pitch rises then settles.

## Next-cycle deepening

- Replace the per-partial sine bank with a coupled-mode solver so partials exchange energy (truer attack transient).
- Amplitude-dependent damping (loud hits damp faster) for a more convincing dynamic range.
- A real two-strike "pitch pedal" gesture (drag to retune the head like a tympani foot pedal).
- Map continuous drag pressure/area, where available, to true velocity instead of inter-tap timing.
- A subtle shell resonance / air-cavity mode under the membrane for body.
