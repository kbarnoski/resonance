# 2712 · emberline

**The one question:** *What if you could HEAR what matter is made of — every
chemical element played as a chord whose notes are its REAL emission spectrum?*

emberline is a self-touring generative piece. It walks through a sequence of
chemical elements, and each element becomes one sustained additive "chord of
matter": its real visible **emission-spectrum lines** become the partials of a
tone. Each spectral line is one sine partial; the line's relative intensity is
that partial's amplitude. Because the frequencies come straight from physics,
the intervals are whatever nature dictates — never snapped to a scale.

Simple gases (hydrogen, sodium) sound like clean sparse chords. Dense-line
metals (iron, neon) sound like rough shimmering clusters. That roughness is the
point: the dissonance is emergent real physics.

## How the mapping works

Data is a small hard-coded table (`spectra.ts`) of each element's strongest
visible lines as `{ nm, rel }`. Nothing is fetched.

**Wavelength → partial frequency.**

1. Each line's optical frequency is `f_opt = c / λ`. Shorter (bluer) wavelength
   ⇒ higher `f_opt` ⇒ higher pitch — physically honest.
2. Across the visible band `f_opt` spans only ~1 octave, so a raw scaling would
   cram every element into a semitone soup. Instead we stretch `log(f_opt)`
   linearly onto a **logarithmic** audible band. Both axes are logarithmic, so
   every frequency **ratio** (the interval structure) is preserved; only the
   octave-span is widened until the ear can resolve the intervals nature chose.
3. The mapping is **global** (the same constants for every element), so an
   element's register is meaningful rather than re-normalised away.

Constants (in `spectra.ts`):

| constant | value | meaning |
|---|---|---|
| `C_LIGHT` | 299,792,458 m/s | speed of light |
| `LAM_RED` | 820 nm | red bound → `AUDIO_LO` |
| `LAM_VIOLET` | 380 nm | violet bound → `AUDIO_HI` |
| `AUDIO_LO` | 80 Hz | lowest partial pitch |
| `AUDIO_HI` | 1600 Hz | highest partial pitch |

`nmToHz(nm)`: `t = log(f_opt / f_opt_lo) / log(f_opt_hi / f_opt_lo)`, then
`f = AUDIO_LO · (AUDIO_HI/AUDIO_LO)^t`. Deterministic, monotonic, exact.

**Intensity → amplitude.** Each partial's gain is `rel / Σrel` (so line-dense
elements don't clip), summed into one voice with a gentle 1.6 s attack, sustain,
and 2.2 s release. Advancing the tour **cross-fades** the old voice out while
the new chord blooms in. A shared convolution reverb plus a soft feedback delay
give the tour a slow breathing tail. A per-partial amplitude shimmer drifts the
timbre — but the **line frequencies are never detuned**, so the physics stays
exact.

## Why there is no scale

Pitch is the physically-mapped line frequency, period. No just intonation, no
pentatonic, no scale-snapping anywhere. The interval between two partials is
whatever the two wavelengths dictate — so sodium's D-doublet (589.0 / 589.6 nm)
is a near-unison of a few cents, and iron's ten lines form a rough beating
cluster. The piece is allowed to sound rough because matter is.

## Visual (SVG, not Canvas2D, not three.js)

The iconic emission-spectrum band: each line is a glowing vertical bar placed by
wavelength across a black spectral strip, coloured by its real visible
wavelength, brightness = intensity. Beneath it, the additive "partial ladder" —
one bar per audible partial, same colour as its line, pulsing with the sounding
amplitude. A big element name + symbol + one-line readout ("Fe · iron · 10 lines
· dense rough cluster") sit above. Everything animates on load: the tour
auto-advances, so a muted viewer still sees it working. SVG is universally
available, so it also serves as the graceful fallback if WebGL2 is unavailable.

## Interaction (secondary — the piece self-tours first)

A **Begin** button unlocks Web Audio (a user gesture is required) and starts the
sound; the visual tour animates before that. Small controls: element chips to
pick an element, **Pause/Resume**, and **Next element**. No keyboard-instrument,
no scale, no AI.

## Determinism

Any dither (the reverb impulse noise, the shimmer phases) comes from a seeded
`mulberry32` (seed `0x2712`). No `Math.random`, no `Date.now()`, no `new Date()`.
`performance.now()` is used only for animation timing. Two runs produce identical
partial frequencies.

## References

- **Balmer (1885)** — the empirical formula for hydrogen's visible series
  (656.3 / 486.1 / 434.0 / 410.2 nm), the first chord you hear.
- **Rydberg (1888/1890)** — the Rydberg formula generalising the spectral series
  of hydrogen and beyond.
- **Wavelength → RGB** — Dan Bruton's classic approximation ("Approximate RGB
  values for a given wavelength", efg's Computer Lab / SFASU spectra page).
- **Fresh research context** — Roddy et al., *Generative Sonification of
  Synthetic Virology Data* (Leonardo / MIT Press, 2026): generative sonification
  of scientific data as a live 2026 art-research frontier. emberline sonifies the
  physics of matter itself.

## Files

- `page.tsx` — client component: tour loop, envelope, controls, notes modal.
- `spectra.ts` — element line table, `nmToHz` mapping, wavelength→RGB, mulberry32.
- `audio.ts` — additive Web Audio engine (osc-per-partial), reverb/delay tail.
- `viz.ts` — imperative SVG renderer (spectral strip + partial ladder).
- `README.md` — this file.
