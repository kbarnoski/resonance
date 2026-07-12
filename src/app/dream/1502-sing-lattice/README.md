# Sing Lattice — sing into a scale that has no octave

## The one question
**What if you could sing INTO a xenharmonic tuning lattice — and instead of a
piano's 12 tones, your voice wandered a strange, beautiful, deliberately-"wrong"
scale where every node you land on lights up and rings the room sympathetically?**

You hum or sing into the mic. Your fundamental is tracked in real time and
snapped onto a **Bohlen–Pierce** lattice. Each node you land on glows amber→violet,
glides a synth tone up to meet you, and plucks a real string there *and* at its
harmonic neighbours — so holding a few tones makes the room bloom into a 3:5:7
chord that sounds like nothing on a keyboard. The "wrongness" is the instrument.

## The tuning I committed to — and why
**Bohlen–Pierce.** Heinz Bohlen (1972) and, independently, John R. Pierce noticed
a scale need not repeat at the 2:1 octave. BP repeats at the **tritave** — the
3:1 — and divides it into **13 steps**. Because the period is odd (3, not 2), BP
consonance is an *odd-harmonic* phenomenon: its signature chord is 3:5:7, and its
just ratios factor into powers of **3, 5, 7 only — no factor of 2 anywhere**. To
an octave-trained ear it is genuinely alien and genuinely lovely, which is exactly
the brief.

The playable nodes are the classic just **"Lambda"** BP scale. Quotient out the
tritave (the powers of 3) and every pitch has a coordinate on a 2-D **harmonic
lattice** (an Erv-Wilson construction), horizontal axis = prime **5**, depth axis
= prime **7**. That is why the piece is laid out as a real slanted lattice of
DOM/CSS-3D nodes with glowing harmonic bonds between neighbours — not a keyboard
row. Lattice neighbours differ by a single factor of 5 or 7, i.e. they are each
other's nearest consonances, so the geometry *is* the sympathetic-resonance map.

### Exact tuning — the just BP "Lambda" lattice (period = tritave 3:1 = 1901.955¢)

| Step | Note | Ratio | Cents | Prime factoring | Lattice (5,7) |
|-----:|:----:|:-----:|------:|:----------------|:-------------:|
| 0  | C  | 1/1   |    0.00 | —              | (0, 0)   |
| 1  | D♭ | 27/25 |  133.24 | 3³ / 5²        | (−2, 0)  |
| 2  | D  | 25/21 |  301.85 | 5² / (3·7)     | (2, −1)  |
| 3  | E  | 9/7   |  435.08 | 3² / 7         | (0, −1)  |
| 4  | F  | 7/5   |  582.51 | 7 / 5          | (−1, 1)  |
| 5  | G♭ | 75/49 |  736.93 | 3·5² / 7²      | (2, −2)  |
| 6  | G  | 5/3   |  884.36 | 5 / 3          | (1, 0)   |
| 7  | H  | 9/5   | 1017.60 | 3² / 5         | (−1, 0)  |
| 8  | J♭ | 49/25 | 1165.02 | 7² / 5²        | (−2, 2)  |
| 9  | J  | 15/7  | 1319.44 | 3·5 / 7        | (1, −1)  |
| 10 | A  | 7/3   | 1466.87 | 7 / 3          | (0, 1)   |
| 11 | B♭ | 63/25 | 1600.11 | 3²·7 / 5²      | (−2, 1)  |
| 12 | B  | 25/9  | 1768.72 | 5² / 3²        | (2, 0)   |

*(Note names use the standard BP letters C D E F G H J A B with chromatic ♭s.
The 1/1 is anchored at 185 Hz so the whole tritave sits ~185–555 Hz, a
comfortable hum/sing range.)*

For reference only, **13-EDT** (the equal-tempered BP) has a step of
1901.955 / 13 = **146.304¢**, i.e. degrees at 0, 146.30, 292.61, 438.91, 585.22,
731.52, 877.83, 1024.13, 1170.43, 1316.74, 1463.04, 1609.35, 1755.65¢. The
instrument uses the *just* ratios above (the lattice needs exact 5- and 7-limit
coordinates); the just and 13-EDT versions are close cousins.

## Pitch-detection method
Real-time **autocorrelation**, specifically the McLeod **normalized square
difference function (NSDF)**, run on `getFloatTimeDomainData()` from an
`AnalyserNode` (fftSize 2048) — deliberately *not* an FFT-bin peak, which
octave-errors badly on a sung vowel whose loudest partial is often a harmonic,
not the fundamental. Per frame:

1. RMS gate rejects silence/breath.
2. NSDF `= 2·Σx[i]x[i+τ] / Σ(x[i]²+x[i+τ]²)` is computed over the vocal lag range
   (~65–1000 Hz).
3. The first NSDF peak above a clarity threshold is taken as the period (this is
   what kills octave errors), and its lag is **parabolically interpolated** for
   sub-sample precision.
4. `clarity` (the NSDF peak height) gates unvoiced frames so the room stays quiet
   when you stop singing.

The detected f0 is reduced into the base tritave, `nearestNode()` finds the
closest lattice pitch and the signed cents deviation, and the snapped synth voice
glides (portamento via `setTargetAtTime`) to a transposition of that node in the
register nearest your voice.

## The three synthesis subsystems
1. **Snapped voice** — one continuous oscillator with an **odd-harmonic periodic
   wave** (partials 1,3,5,7,9), the native BP timbre, glided to the snapped node
   and faded by voicing level.
2. **Sympathetic strings** — a real **Karplus–Strong** pluck per lit node: a
   one-period noise burst injected into a tuned delay loop with a lowpass in the
   feedback path. Striking a node also softly plucks its harmonic lattice
   neighbours (the tarab strings answering). Longer feedback on the neighbours =
   longer sympathetic tail.
3. **The room** — a generated convolution reverb everything is bussed through,
   into a compressor/limiter; master gain ≤ 0.18.

## How to play
- **Enable mic & sing** — hum or sing a steady vowel. The nearest node lights,
  the readout shows your Hz, the node name/ratio, and cents deviation, and the
  little canvas traces your pitch against the lattice's cent-lines.
- Hold a tone to sustain a node; slide between tones to wander the scale and wake
  neighbours until the room blooms.
- **Just tap the lattice** (or if the mic is blocked) — click any node, or use
  keys `1 2 3 4 5 6 7 8 9 0 q w e` for steps 0–12. It always makes sound.

## Which ambition criteria it hits
- **≥3 subsystems (4):** autocorrelation pitch detection · xenharmonic BP tuning
  engine (`tuning.ts`) · sympathetic-resonance Karplus–Strong synth (`audio.ts`) ·
  DOM/CSS-3D lattice render (`page.tsx`).
- **Named references:** Bohlen–Pierce (Heinz Bohlen & John Pierce); Erv Wilson's
  tuning lattices; Sevish's Scale Workshop; this lab's own **1408-wolf-ring**,
  extended from a single playable "wrong" fifth to an entire scale you sing inside.
- **Technique fresh to the lab's use:** voice → xenharmonic-snap, i.e. real-time
  pitch tracking driving a microtonal auto-tune onto a non-octave lattice.

## Tags
- INPUT: **microphone** (voice fundamental) — the whole point; click/keyboard is
  only a fallback.
- OUTPUT: **DOM / CSS-3D** — the lattice is real `<button>`/`<div>` elements in a
  `preserve-3d`, perspective-tilted plane; nodes pop in `translateZ`, bonds are
  transformed divs. The only canvas is the small secondary pitch trace.
- TECHNIQUE: NSDF autocorrelation + BP xenharmonic engine + Karplus–Strong
  sympathetic resonance.
- VIBE: warm/intense/luminous — amber-to-violet glow that brightens as the room
  fills with energy.

## Honest / rough notes
- **Pitch tracking is only as good as the room.** Headphones strongly recommended;
  without them the snapped voice and reverb leak back into the mic. Very noisy
  rooms or very breathy/whispered tones fall below the clarity gate and read as
  unvoiced (by design — better silent than chattering on noise).
- The NSDF is computed in plain JS each frame over the vocal lag range; it's cheap
  enough for 60 fps but is not SIMD-optimised. Extremely low male fundamentals
  (<70 Hz) sit at the edge of the search window and can be less stable.
- Snapping uses a ±62¢ "near enough" window before it (re-)excites a node, so a
  fast portamento sweep will trigger a run of nodes rather than a continuous
  glide — intentional (it makes wandering audible) but it means you can't glissando
  *between* nodes silently.
- The just-vs-EDT choice is a genuine trade-off: just ratios give clean lattice
  coordinates and purer sympathetic beating, but a listener comparing to a 13-EDT
  BP synth elsewhere will hear small differences (a few cents per degree).
- All node/room motion is smooth exponential decay (no strobe); `prefers-reduced-motion`
  shortens the energy tails. Nothing flickers near the photosensitive band.
