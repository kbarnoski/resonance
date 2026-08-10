# 9688 · PURELOCK

**The one question:** *What if you could **see** consonance* — a just-intonation
instrument where the acoustic beating between two voices is rendered as visible
motion that **freezes into stillness** when you land a pure small-integer ratio,
and **throbs** as you drift off it?

## The mechanic: beating → visible stillness

Two complex tones sound together: a fixed root drone (D3, 146.83 Hz) and the
walked interval voice. Both are built additively from harmonic partials, so they
**share partials** — and where a partial of one lands near a partial of the
other, they **beat** at the difference frequency (Helmholtz's classical account
of consonance and dissonance).

- **Pure just ratio** (e.g. `3/2`, `5/4`, `4/3`): a low harmonic of the voice
  coincides *exactly* with a low harmonic of the root — for `3/2`, the 2nd
  voice-partial equals the 3rd root-partial. Difference = **0 Hz**. No beat. The
  interference field **locks** and goes still and near-white.
- **Complex just ratio** (e.g. `45/32`): no *low* partials coincide, but a
  strong pair sits *near* coincidence (for `45/32`, the 5th voice-partial vs the
  7th root-partial differ by ~4.6 Hz). That is a real, slow **throb** — the field
  crawls and reddens.
- **12-TET retune** (A/B): the same interval, snapped to the nearest equal-
  tempered semitone, detunes the coinciding pair. A just major third (`5/4`,
  386¢) becomes 400¢ — **+14¢** — and the once-locked `4:5` partial pair now
  beats at ~5.8 Hz. You **hear** the roughness return and **see** the field start
  to throb. Toggle back and it locks. This A/B is the money shot.

### From beating to pixels (Plomp–Levelt → moiré)

`analyze(fRoot, fVoice)` walks all partial pairs (8 harmonics each) and returns:

- **`R`** — sensory *roughness*, the Sethares parametrization of the
  Plomp–Levelt dissonance curve
  (`d = a₁a₂(e^(−3.5·s·Δf) − e^(−5.75·s·Δf))`, `s = 0.24/(0.0207·f_min+18.96)`),
  summed over the cross-partials and normalized to `[0,1]`. Drives the red
  banding and the throb depth.
- **`beatHz`** — the slowest *strong* partial-pair difference: the audible throb
  rate. Zero at a pure lock. Drives the temporal phase of the moiré (and the
  on-screen Hz readout).

The visual is a **hand-rolled WebGL2 interference field** (one vertex + one
fragment shader, a full-screen quad — no three.js, no Canvas2D dot-field). Two
overlaid gratings: at lock (`R → 0`) they are *identical*, the moiré envelope
vanishes, and the field is a calm still white. As `R` grows the second grating
detunes in frequency and angle → broad moiré fringes appear, red floods the
destructive fringes, and the whole pattern **crawls at `beatHz`**. Consonance
becomes literally seeable: still = pure, moving = rough.

## The lattice (7-limit just intonation)

An Euler / harmonic lattice (Tonnetz, after Erv Wilson's just-intonation
lattices). Each node is `3^a · 5^b · 7^c · 2^k`, octave-reduced into `[1,2)` and
displayed as an exact reduced fraction:

- **← / →** — ∓ / ± a just fifth (`3/2`), the *a* axis.
- **↑ / ↓** — ± a just major third (`5/4`), the *b* axis.
- **z / x** — ∓ / ± a septimal seventh (`7/4`), the bonus 7-limit *c* axis.

Deliberately **7-limit just intonation**, never pentatonic.

## Controls

- **Walk:** arrow keys, `z`/`x` for the septimal axis, or **tap any node** in the
  lattice mini-map (fill: white = consonant, red = rough).
- **`t`** or the button: **A/B** the current interval between just and nearest
  12-TET.
- **Play sound:** audio starts on the first gesture (browser autoplay rule); the
  visual runs before any audio.
- **Seeded auto-walker:** on load, a deterministic walker (`mulberry32(0x9688)`,
  never `Math.random`) steps node→node every ~2.5 s so a muted phone sees
  consonance breathe — freeze on pure ratios, throb on complex ones — with the
  WebGL field animating within ~1 s. The first real key/tap hands over control.

## Palette & safety

Ikeda black-white-red: near-black ground, clean white at lock, red banding when
rough (the one brand-violet accent is UI chrome only — the current node marker).
The throb is a slow smooth beat: its rate is clamped to ≤ 2.5 Hz and its
luminance depth to ≤ 22 %, well under any strobe threshold. `prefers-reduced-
motion` freezes the crawl (static contrast tint) and slows the auto-walker to
discrete steps. Full teardown on unmount: rAF cancelled, GL program/buffers/VAO
freed and context lost, `AudioContext` closed.

## References

- H. von Helmholtz, *On the Sensations of Tone* (1863) — beats & consonance.
- R. Plomp & W. J. M. Levelt, "Tonal Consonance and Critical Bandwidth,"
  *JASA* 38 (1965) — the roughness curve.
- W. A. Sethares, *Tuning, Timbre, Spectrum, Scale* (1998) — the dissonance
  parametrization used here, and timbre/tuning coincidence.
- Erv Wilson — just-intonation lattices / the harmonic Tonnetz.

## Honest limitations

- The roughness normalization constant (`/0.22`) and partial roll-off (`0.8^n`)
  are tuned by ear, not calibrated to a listening panel; absolute `R` values are
  indicative, not psychoacoustically exact.
- `beatHz` reports the single slowest strong pair; a genuinely rough interval has
  *many* simultaneous beats, so one number under-describes it.
- Only the primary near-coincidence drives the moiré's temporal phase — the field
  shows one dominant beat, not the full interference spectrum.
- Harmonic partials only (pure sine stacks); real instrument timbres would shift
  which ratios lock (Sethares' whole point), which this piece does not explore.
