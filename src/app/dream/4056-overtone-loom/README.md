# 4056 · Overtone Loom

**What if a sound generated its OWN scale?**

Sing or play into the mic. The piece extracts the strongest spectral peaks of
your voice/instrument and their **harmonic recurrence**, derives a bespoke
**microtonal scale** from them, and hands you a playable keyboard tuned to your
own harmonic fingerprint. The tuning is *derived from the signal*, never imposed
— no 12-TET, no pentatonic snap. Change what you hum and the scale re-derives.

The output modality is **SVG**: a live log-frequency tuning wheel / harmonic
lattice. One octave = 360°; each derived degree is a labelled node at its cents
position; radial spokes join them to the fundamental; the currently-sounding
degree glows; incoming mic peaks appear as faint arcs before they crystallise
into degrees. No `<canvas>`, no WebGL — the SVG is the deliverable.

## How to use it

1. Open the page. It boots straight into the **auto-demo**: a deterministic
   synthetic spectrum (seeded `mulberry32(0x4056)`) whose peaks random-walk, so
   the scale visibly forms within ~2 s and an autopilot arpeggiates the derived
   degrees. A hands-off reviewer sees *and* (best-effort autoplay) hears it
   immediately.
2. Press **Start mic** to feed your own voice/instrument. The scale re-derives
   live from your signal and the autopilot steps aside.
3. Play the derived degrees with the QWERTY row **A S D F G H J K L** (mapped
   across two octaves) or by tapping the nodes on the wheel. The first mic or
   keypress hands over from the autopilot.
4. **Read the design notes** opens an in-page summary of the derivation.

If the mic is denied or unavailable, an on-brand `text-destructive` notice
appears and the seeded synthetic-spectrum path keeps the wheel animating and
sounding — never a dead screen.

## The derivation (the load-bearing novel technique)

After the **Biotuner** engine and **Antoine Bellemare's "harmonic recurrence"**
approach: derive a tuning system from the spectral peaks of a signal — peaks
become scale degrees, ratios between peaks become intervals.

1. **Analyse.** A Web Audio `AnalyserNode` (fftSize 8192) yields the dB
   spectrum. It is folded into an exponential moving average (~0.5 s) so the
   scale is steady, not jittery. `pickPeaks` finds up to 8 local maxima above an
   adaptive noise floor (loudest peak − 32 dB) in **80–2000 Hz**, refined by
   parabolic interpolation for sub-bin frequency accuracy.
2. **Derive.** The lowest strong peak is the fundamental **f0**. For every peak:

   ```
   ratio  = foldToOctave(peak / f0)          // ×2 or ÷2 until in [1, 2)
   cents  = 1200 · log2(ratio)
   ```

   Harmonic recurrence: each folded ratio is snapped to the nearest small-integer
   **just** ratio if within **18¢** — `1/1, 16/15, 9/8, 7/6, 6/5, 5/4, 4/3, 7/5,
   3/2, 8/5, 5/3, 7/4, 9/5, 15/8` — and labelled. Degrees closer than **15¢**
   are merged (a just-labelled degree wins the merge). The unison `1/1` is always
   present. Every degree is stored as an exact frequency ratio with its cents
   value shown.
3. **Play.** The QWERTY row maps to the derived degrees across ~2 octaves.
   A key plays a clean continuous-pitch additive voice at
   `f0 · ratio · 2^octave` (5-partial sine stack, soft ADSR, **no quantiser**).
   Master chain: gain cap → lowpass 6.5 kHz → compressor, so it stays ear-safe.

Files:

- `biotuner.ts` — `mulberry32`, `deriveScale`, `pickPeaks`,
  `makeSyntheticSpectrum`, `foldToOctave`, `centsOf` (pure, testable).
- `page.tsx` — audio graph, mic FFT, autopilot, SVG tuning wheel, keyboard.

## Reference

- **Biotuner** — a Python toolbox for biological-signal-based tuning by
  **Antoine Bellemare** et al. The "harmonic recurrence" method (peaks → scale
  degrees; inter-peak ratios → intervals) is the technique reimplemented here in
  the browser. This prototype is an original real-time Web Audio + SVG take on
  that idea, not a port.

## Known limits

- Peak-picking assumes a reasonably pitched/tonal input in 80–2000 Hz; pure
  noise or heavy polyphony yields an unstable degree count.
- f0 is simply the lowest strong peak — a strong subharmonic or room rumble can
  pull it down. The 80 Hz floor and noise gate mitigate but don't eliminate this.
- Browser autoplay policies may keep the very first audio silent until any click
  or keypress resumes the AudioContext; visuals always animate regardless.
- The scale is folded to a single octave; octave-stretched or inharmonic timbres
  (bells, gongs) collapse interesting detail that a full 2-D lattice would keep.
