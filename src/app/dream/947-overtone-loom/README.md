# Overtone Loom

**"What if you could SEE why a chord sounds sweet or sour — play notes and watch
the real spectral-interference dissonance field between their overtones light up,
in real time, computed on the GPU?"**

An additive-synthesis instrument fused with a live Helmholtz/Sethares sensory-
dissonance visualizer. Each note you play is a stack of harmonic partials. The
screen shows the **sensory roughness** (beating) between every pair of partials
currently sounding, laid out along a log-frequency axis. Consonant intervals
(octave, fifth) lock the field dark and still; dissonant intervals (minor 2nd,
tritone) make it churn bright. The instrument makes consonance both audible and
visible.

Pitch/harmony **is** the idea here — this is the opposite of a held drone.

## How to use

1. Press **Start** (browsers require a gesture to open the AudioContext and the
   GPU device).
2. Press the on-screen note strips — held notes stack into a chord. A Web MIDI
   controller, if present, is auto-connected (note-on/off + velocity).
3. Watch the **dissonance field** above the keyboard and the **total dissonance**
   readout/meter. Add a fifth: the number stays low, the field stays calm. Add a
   minor second: the number jumps, the field churns.
4. Move the **timbre brightness** and **partials/voice** sliders. Brighter / more
   partials push spectral energy up, and you can watch intervals that were
   consonant become dissonant — that is the 2026 finding (below) made tangible:
   consonance is a property of the actual *spectrum*, not of abstract ratios.
5. If you do nothing, an **auto-demo** cycles telling intervals
   (unison → octave → fifth → major triad → tritone → minor 2nd → cluster) so a
   hands-off viewer hears and sees the consonance→dissonance gradient within a
   second or two. Any key press pauses it.

## The dissonance math

For two partials `(f1,a1)` and `(f2,a2)` the Plomp-Levelt / Sethares roughness is:

```
df   = |f2 - f1|
fmin = min(f1, f2)
s    = 0.24 / (0.0207 * fmin + 18.96)
R    = a1*a2 * ( e^(-b1*s*df) - e^(-b2*s*df) )      b1 = 3.5, b2 = 5.75
```

- **Total dissonance** (the scalar readout/meter) sums `R` over every pair of the
  partials currently sounding.
- **The field** at a probe frequency `fp` sums the roughness a hypothetical
  partial at `fp` would have against every real sounding partial — so bright bands
  appear exactly where a new partial would beat against the chord. The frequency
  axis is log-spaced from ~A1 (55 Hz) to ~A6 (1760 Hz).

The canonical CPU version lives in `dissonance.ts`; the **exact same arithmetic**
is re-implemented in the WGSL compute shader and the WebGL2 fragment shader so all
three render tiers agree.

## Tags

- **INPUT** — on-screen note keyboard (pointer/touch strips) + optional Web MIDI
  (`navigator.requestMIDIAccess`, note-on/off, velocity) + an always-available
  auto-demo. No microphone.
- **OUTPUT** — primary renderer is a **raw WebGPU compute shader (WGSL)**: one
  invocation per frequency bin computes that bin's roughness against all sounding
  partials in parallel; a fullscreen pass renders the field. Fallback cascade:
  **WebGPU → raw WebGL2 (same field math in a fragment shader) → Canvas2D (CPU
  coarse field)**, with a visible amber notice on fallback.
- **TECHNIQUE** — **additive synthesis** (a bank of Web Audio sine oscillators per
  voice, `1/n^rolloff` amplitude) + the **Sethares/Plomp-Levelt sensory-dissonance
  model** above.
- **VIBE** — clinical / Ikeda spectral-lab: bright cyan/white field on near-black,
  thin monospace labels, oscilloscope/spectrum aesthetic.

## Named references

- Hermann von Helmholtz, *On the Sensations of Tone* (1863) — consonance as
  overtone coincidence.
- William Sethares, *Tuning, Timbre, Spectrum, Scale* (1998) — the continuous
  dissonance-curve model implemented here.
- "Elementary spectrum for the dissonance curve," *Journal of Mathematics and
  Music* (2026), DOI 10.1080/17459737.2026.2628778 — consonance emerges from a
  timbre's actual spectrum, not abstract ratios. This is why the timbre / partial-
  count sliders change which intervals read as consonant.

## Audio safety & teardown

- AudioContext is gesture-gated behind Start.
- Master chain: `GainNode (0.22) → lowpass 7 kHz → DynamicsCompressor →
  destination`. Adding notes makes the field busier, never painfully louder.
- On unmount: oscillators stopped, AudioContext closed, `cancelAnimationFrame`,
  WebGPU buffers + device destroyed, MIDI + resize listeners removed.

## Degradation

- No WebGPU → WebGL2 (amber notice). No WebGL2 → Canvas2D (amber notice).
- No audio → rose notice; the field still renders silently.
- Never throws an unhandled error; never leaves a blank screen.

## Files

- `page.tsx` — the prototype (client component): audio engine, keyboard,
  auto-demo, and the WebGPU/WebGL2/Canvas2D render cascade.
- `dissonance.ts` — the Sethares/Plomp-Levelt model + additive partial bank +
  log-frequency axis helpers (CPU reference shared by all tiers).
