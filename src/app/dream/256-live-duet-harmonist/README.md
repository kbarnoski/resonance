# 256 · Live Duet Harmonist

> What if Resonance gave a pianist a live AI accompanist that listens to the **chords** you play
> and answers with a real **jazz comping bed** — rootless / drop-2 voicings and a walking bass —
> that locks to the **rhythm** of your playing instead of a fixed metronome?

This is the **harmony member** of the "AI band you play with." Its sibling
`251-live-duet-trader` handles the **melodic / monophonic** trading line; this prototype is the
**polyphonic / chordal** half. A single-pitch tracker (autocorrelation / NSDF) collapses when a
pianist plays four notes at once, so the front end here is a **12-bin chroma → 36-template chord
match**, not single-pitch detection. The distinguishing ambition versus a plain triad harmonizer
is **jazz voicings + onset-synced (not fixed-clock) comping**.

## The pipeline (and why each param is what it is)

```
mic → AnalyserNode(fftSize 4096) → byte FFT
   ├─ chroma fold (60–2000 Hz → 12 bins, one-pole 0.8)   ── what note classes are sounding
   │     → cosine-match 36 templates (maj/min/dom7 × 12)  ── which chord + quality
   │       → 160 ms settle (look-ahead)                   ── switch only when it persists
   │         → rootless / drop-2 voicing (3+7 shell + tension)
   │           → nearest-pitch voice leading (setTargetAtTime glide)
   └─ spectral flux (Σ positive bin increases)            ── onsets / attacks
         → adaptive threshold mean + 1.5·std, 100 ms refractory
           → median inter-onset interval → tempo (folded 60–180 BPM)
             → look-ahead scheduler (25 ms tick / 100 ms window) places
                walking-bass quarter notes + comp stabs ON YOUR PULSE
```

- **Chroma band 60–2000 Hz, fold `pc = round(12·log2(f/C0)) mod 12`.** Below 60 Hz is rumble; above
  2 kHz is mostly harmonics that muddy the class estimate. Folding to 12 bins is octave-invariant,
  which is exactly what chord identity needs.
- **One-pole smoothing `chroma = 0.8·prev + 0.2·now`.** Heavy smoothing because chords are held;
  it kills frame-to-frame flicker without lagging chord *changes* noticeably.
- **36 templates, cosine match, floor `0.62`.** 12 roots × 3 qualities. Templates are weighted
  masks: the **3rd and 7th shell tones are emphasized** and, for dom7, the **b7 is weighted highest**
  (it is the dominant signature). Below the floor we *hold the previous chord* rather than guess.
- **160 ms settle window.** A newly-detected chord must persist ~160 ms before the bed switches, so
  the accompaniment is anticipatory and stable rather than chasing every passing tone. (Look-ahead /
  settle idea from arXiv 2604.07612.)
- **Spectral-flux onsets, threshold `mean + 1.5·std`, 100 ms refractory.** Sum of positive bin-to-bin
  energy increases is a cheap, polyphony-tolerant attack detector; the adaptive threshold rides the
  noise floor; 100 ms refractory rejects double-triggers inside one attack.
- **Tempo = median inter-onset interval, folded to 60–180 BPM**, smoothed `0.85/0.15`. Median is
  robust to one stray onset; folding by ×2 / ÷2 keeps the pulse in a musical range. If playing is
  sparse / legato we never get enough onsets, so the pulse falls back to a gentle **80 BPM** and
  never stalls.
- **Scheduler: 25 ms `setInterval` tick, 100 ms look-ahead, events at exact `AudioContext.currentTime`.**
  The Chris Wilson "two clocks" pattern — JS timer is only ever *coarse*, sample-accurate scheduling
  is done on the audio clock.

## Voicing table (the differentiator — Mark Levine vocabulary)

Voiced in the mid register (~C3–C5, midi 48–72), rootless / drop-2 feel — **shell tones (3 & 7)
plus a color tone**, no doubled root:

| Quality | Label  | Intervals from root (semitones) | Tones                |
|---------|--------|---------------------------------|----------------------|
| maj     | `Xmaj7`| 4, 11, 14, 7                    | 3, 7, 9, 5           |
| min     | `Xm7`  | 3, 10, 14, 7                    | b3, b7, 9, 5         |
| dom7    | `X7`   | 4, 10, 14, 9                    | 3, b7, 9, 13         |

Each comp voice **glides to the nearest pitch** of the next voicing (`setTargetAtTime`, ~60 ms) —
minimal-motion voice leading, no hard cuts.

**Walking bass** (triangle, ~C2 register): root on the downbeat (beat 0), chord 5th and 3rd on beats
1–2, and a **chromatic approach a semitone below the next chord's root** on beat 4 — a stand-up
bass walking into the next change, not a held pedal.

## Color ↔ root

The center chord name and every node are colored by **root pitch class → hue** (`hue = root/12 · 360`):

| Root | 0 C | 1 C# | 2 D | 3 D# | 4 E | 5 F | 6 F# | 7 G | 8 G# | 9 A | 10 A# | 11 B |
|------|-----|------|-----|------|-----|-----|------|-----|------|-----|-------|------|
| Hue° | 0   | 30   | 60  | 90   | 120 | 150 | 180  | 210 | 240  | 270 | 300   | 330  |

The same wheel colors the 12-wedge chroma ring (brightness = live pitch-class energy), the comp-voice
nodes, the walking-bass ladder marker, and the scrolling chord-history blocks at the bottom (block
width = chord duration).

## Degradation behavior

- **Mic denied / unavailable** → auto-runs a **ii–V–I–vi in C** (Dm7 → G7 → Cmaj7 → Am7) at **88 BPM**
  with the full walking bass + comping, driving the **same visuals** from the synthetic chord stream.
  A `text-rose-300` notice states demo mode and offers a **"Use microphone"** retry.
- **No audio at all** → a `text-rose-300` message; the page never throws.
- **Legato / sparse playing** → onset estimator starves, pulse falls back to 80 BPM so the bed keeps
  breathing. The master always sits on a quiet floor and swells with input energy.
- **Cleanup** on unmount cancels the rAF, clears the scheduler interval, stops mic tracks, and closes
  the `AudioContext`.

## Named references

- **ReaLchords** — Lee et al., *arXiv 2506.14723* (Jun 2025): an online model generating chord
  accompaniment simultaneously with a melody, RL-refined for harmonic + temporal coherency. This
  prototype is the **DSP / symbolic cousin** — it reacts to the player's *chords* with jazz voicings
  rather than learning the distribution.
- **arXiv 2604.07612** — *"Towards Real-Time Human–AI Musical Co-Performance"* (Apr 2026): source of
  the ~160 ms **look-ahead / settle** window.
- **Chris Wilson — "A Tale of Two Clocks"**: the look-ahead audio scheduler (coarse JS timer + exact
  audio-clock scheduling) used here.
- **Mark Levine — *The Jazz Piano Book***: the rootless / drop-2 voicing vocabulary implemented in the
  voicing table above.

## Honest limitations

- Chroma + cosine matching is **inversion-insensitive and bass-blind**; a C6 and an Am7 share pitch
  classes, so the root can flip on ambiguous voicings. There is no explicit bass-note bias yet.
- Only three qualities (maj / min / dom7). No min7b5, dim, aug, sus, or alt extensions — the template
  bank would need to grow and the floor re-tuned.
- Spectral-flux tempo is a **loose pulse**, not a beat tracker; syncopation or rubato can make the
  walking bass feel slightly ahead/behind. There is no phase alignment of the downbeat to a specific
  onset.
- Byte-FFT (0–255) loses dynamic range versus a float FFT; very quiet chords sit near the floor.
- Voice leading is greedy nearest-pitch per voice without global assignment, so it can occasionally
  cross voices on large root motion.

## Next-cycle deepening

- **Bass-aware chord detection**: bias the root toward the lowest strong partial to resolve
  inversion ambiguity, and detect slash chords.
- **Richer template bank**: min7b5 / dim7 / 7alt / sus, with per-quality confidence floors.
- **True beat tracker** (comb-filter / dynamic-programming over the flux) to phase-lock the downbeat,
  enabling anticipatory "and-of-4" comp pushes and bass enclosures.
- **Hungarian assignment** for globally-optimal voice leading instead of greedy nearest-pitch.
- **Trade hand-off** with `251-live-duet-trader` so the melodic and harmonic agents share one pulse
  and key — the full "AI band you play with."
