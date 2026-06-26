# 973 · Wave Terrain

A browser-native **wave-terrain synthesizer** — the lab's first. The glowing 3D
landscape you *see* is literally the sound you *hear*.

## The one question

> What if the glowing 3D landscape you SEE *is literally the sound you HEAR* —
> where an orbit tracing a closed path over a height-terrain reads out the audio
> waveform sample-by-sample, so reshaping the land sculpts the timbre and
> spinning the orbit faster plays a higher note?

## The technique

Wave-terrain (a.k.a. terrain) synthesis defines a height surface
`z = f(x, y)` over a 2D field. A **closed orbit** path is traced across that
surface; the height under the moving read-point, sampled at audio rate over one
full loop, *is* one period of a waveform.

- Reshape the terrain → you reshape the timbre.
- Spin the orbit faster (play a higher note) → the same shape plays at a higher
  pitch.
- Move/resize the orbit → you scan a different region, so the waveform (and
  therefore the spectrum) changes.

Implementation here:

1. `terrain.ts` — five height functions and a closed Lissajous-ish orbit.
   `sampleWaveform()` walks the orbit at **1024 points**, reads the height,
   **DC-blocks** (subtracts the mean, since terrains carry an offset) and
   peak-normalizes → one period.
2. `audio.ts` — that period is turned into a `PeriodicWave` via a real DFT
   (`waveformToFourier` → `createPeriodicWave`). Up to **6 voices** are plain
   `OscillatorNode`s sharing the current `PeriodicWave`; pitch = note frequency.
   On morph/orbit change the wave is rebuilt and re-applied to live voices.
   Amplitude is normalized by `1/√n` voices. Master chain:
   `Gain → lowpass (8 kHz) → DynamicsCompressor (limiter) → destination`, peak
   kept well under 0.3.
3. `gl.ts` — hand-rolled **WebGL2** (no three.js): a 96×96 perspective
   heightfield mesh sampling an `R32F` height texture, warm topographic
   elevation palette, relief shading, contour bands, the luminous orbit ring on
   the surface, and a glowing moving read-point.
4. `page.tsx` — the strip under the 3D view draws the carved waveform (the exact
   period being played) with a scrubbing read marker, so you can *see*
   orbit-shape → waveform → sound.

## How to play

Press **▶ Start the instrument** (creates the AudioContext on your gesture).

- **Home row `A S D F G H J K L`** = play notes (D Dorian, ~2 octaves). Upper
  letters `Q W E R T Y U I O P` continue higher. This is the **primary input** —
  the mouse is not.
- **`1`–`5`** = switch terrain preset (dunes / ridges / ripples / saddle /
  crater), each a distinct timbre.
- **`[` `]`** or **`← →`** = orbit radius (sculpt timbre live).
- **`↑ ↓`** = orbit lobes (path complexity → harmonic content).
- **`M`** = toggle slow terrain morph (timbre evolves over time).
- **Web MIDI** (optional): note on/off → voices, velocity → amplitude. If no
  device is present, the keyboard works fully; MIDI is never required.

If you just open the page and wait ~3 s, a soft **auto-demo** plays a slow D
Dorian arpeggio and morphs the terrain so the idea is immediately audible and
visible. Any real keypress stops the demo.

## Vibe

Topographic / bronze-relief / contour-elevation. Warm earth low ground →
bright gold ridges. Deliberately **not** a dark cosmic/nebula look.

## Named references

- Curtis Roads, *Microsound* (2001) — terrain synthesis.
- Mitsuhashi, Y. (1982) "Audio Signal Synthesis by Functions of Two Variables",
  *JAES*.
- Borgonovo, A. & Haus, G. (1986) "Sound Synthesis by Means of Two-Variable
  Functions", *Computer Music Journal*.
- Freshness anchor (RESEARCH §565): the 2025–2026 wave-terrain revival — Scaler
  Music **Carbon Electra 2** (announced **May 28, 2026**), whose engine produces
  sound "via a 2D trajectory that scans over a 3D surface or terrain", and
  Conductive Labs **Terrain** hardware synth (2025). Despite the commercial
  revival there is no free, browser-native wave-terrain instrument — this is
  that.

## Warts / untested

- **I cannot hear audio in the build environment**, so the *timbres* of the five
  presets are reasoned from the math, not auditioned. The DFT/`PeriodicWave`
  path, DC-block, and per-voice normalization are correct in principle, but the
  relative brightness of presets and the morph speed may want tuning by ear.
- Crossfade on morph is implemented as a parameter-swap (`setPeriodicWave` on
  live oscillators) plus smoothed gains rather than a full dual-oscillator
  crossfade; at high morph speeds a faint timbral seam is theoretically
  possible. Morph runs slowly (0.03/s) to stay under that.
- The terrain is recomputed on the CPU every morph frame and re-uploaded to the
  height texture + DFT'd. On a 96×96 grid + 1024-point DFT this is light, but on
  very weak hardware the morph could be reduced; it is fine on a normal laptop in
  reasoning, untested on mobile.
- WebGL2 `lineWidth > 1` is a no-op on most platforms, so the orbit ring renders
  as a 1px loop on many GPUs (still clearly visible against the surface).
- The Canvas2D fallback (top-down heatmap) renders and audio still plays, but it
  was not exercised on a machine that actually lacks WebGL2.
- Web MIDI path is wired but untested without a physical controller.
