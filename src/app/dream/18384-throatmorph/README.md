# 18384 · Throatmorph

**Status**: demoable — a continuous cepstral-STFT spectral-envelope morph; the labelled autonomous demo drive sweeps the whole chain headless after one Play tap, and the ultrasound surface is alive from load.

## What if?

What if you could reshape the *resonant body / vocal tract* of your own piano
recording with your two hands — morphing its timbre **continuously** from
glassy → woody → vowel-like, while pitch and melody stay **exactly** the same —
by extracting the recording's own spectral envelope and morphing *that*?

This is the cycle-2 deepening of **18320-timbrefold**. timbrefold morphed
between five discrete Peterson–Barney vowel presets using four static peaking
biquads. Throatmorph goes lab-first: it lifts the recording's *own*
log-spectral envelope with the real cepstrum and morphs that envelope
continuously toward glassy / woody / vocal targets, applying the morph as a
per-bin spectral gain and resynthesising by overlap-add. Continuous, not five
presets — and the target follows the recording's own body rather than a fixed
filter bank.

## Two-hand mapping (exact)

- **Midpoint x of the two hands → morph position `m`** — slides the whole timbre
  continuum: `m` < 0.5 blends **glassy → woody**, `m` ≥ 0.5 blends
  **woody → vocal**. This is the "which timbre" axis.
- **Average hand height → morph depth** — hands low = the untouched original
  piano (`depth` 0), hands high = fully morphed (`depth` 1). This is the "how far
  from the original" axis.
- **Separation between the two hands → vowel position** — slides the four vocal
  formants across the manifold /u/ → /o/ → /a/ → /e/ → /i/.

Every axis reaches the AudioWorklet via `port.postMessage({type:"ctrl", m,
vowel, depth})` and is smoothed there with a per-block one-pole filter. The same
three axes drive the camera, the pointer fallback and the autonomous demo drive.

Pointer fallback: mouse **x** = glassy↔vocal, mouse **up/down** = vowel, **click**
= toggle morph depth.

## Design notes

**The cepstral-STFT envelope morph (the star).** A streaming STFT runs inside an
AudioWorklet (registered from a Blob URL — no separately served `.js`): 2048-point
frames, 512 hop, 75% Hann analysis+synthesis overlap-add (COLA norm 1/1.5), a
self-contained radix-2 FFT/IFFT. Per frame:

1. Windowed frame → forward FFT → magnitude + the original complex spectrum.
2. **Source envelope `Es`:** `logMag = log(mag + eps)`; the real cepstrum
   `c = IFFT(logMag)`; a symmetric low-quefrency **lifter** keeps only the first
   ~48 of the 1024 half-coefficients (zeroing the rest); FFT back → a smooth
   source spectral envelope — the recording's *own* resonant body.
3. **Target envelope `Et`:** built continuously over the same bins as a blend of
   three shapes — **glassy** (rising high-frequency tilt + narrow upper-formant
   bumps), **woody** (low-mid emphasis + high-frequency rolloff), and a
   continuous **four-formant vocal tract** whose F1–F4 are smooth Gaussians in
   log-frequency, positions sweeping the vowel manifold. `m` blends the three;
   `vowel` slides the formant positions.
4. **Applied as a phase-preserving gain:** both `Es` and `Et` are zero-meaned
   (compared as *shapes*, not levels); the per-bin gain is
   `g = exp(depth · (Êt − Ês))`, flattening the source's own resonances and
   imposing the target's. The gain is a **real** multiplier, so the original
   phase and the harmonic fine structure — the exact partials the ear reads as
   pitch and melody — are never touched. `depth` 0 leaves the piano untouched;
   `depth` 1 fully imposes the target body. New magnitude → IFFT → overlap-add.

**Why the pitch is preserved.** We reshape only the spectral *envelope* — the
relative loudness of each region — via a real gain that keeps every bin's phase.
The read head advances one synthesis hop per frame with no rate change. So the
resonant body morphs continuously from glassy to woody to vowel-like while every
note stays exactly where Karel played it. (Source–filter model, Fant: the
recording is the source; the morphing envelope is the filter.)

**Anti-hiss defences (required — resynthesis hisses without these).** Hann
windows on *both* analysis and synthesis at COLA-correct 75% overlap; the gain is
inherently smooth because it is the difference of two liftered envelopes, and it
is further moving-averaged across bins (±3) so no single bin can spike into
musical noise; a bounded spectral floor/ceiling (−18 dB … +12 dB); and per-block
one-pole smoothing of `m` / `vowel` / `depth` so there is no zipper noise. Every
audible node terminates in `createSafeMaster(ctx).input` (the ear-safety bus);
the visuals read `safeMaster.analyser`.

**Achromatic "ultrasound / sonogram" palette.** The hero is a three.js
(WebGL, three@0.182) scrolling **formant-surface waterfall** — a height-field
ridge rendered like a medical ultrasound / X-ray of a vocal tract: grayscale
intensity, a faint warm-neutral tint *only* in the brightest crests, soft
FogExp2 depth, a barely-there scan-mesh grid. The newest ridge (front) is the
current morphing envelope × the live analyser magnitude, so it visibly reshapes
as you move `m` / `vowel` / `depth` and dances to the actual sound; older rows
flow back into the fog. No colour, no film grain, no prismatic rainbow. UI chrome
uses Resonance semantic tokens only.

**Graceful degradation.** No camera / permission denied / model-load fails → a
pointer fallback plus a labelled **autonomous demo drive** that sweeps
`m`/`vowel`/`depth` so the whole morph chain is audible and visible headless; the
status line reads `demo · autonomous`, never indistinguishable from live. A
lost-second-hand state shows a `text-destructive` hint. If WebGL / three.js
fails, the audio keeps morphing and a readable notice replaces the surface.

## References

- **NEUON — Cepstral Morph** (Dystopian Waves, 25 Sep 2026): cepstral spectral
  morphing and the separation of formant structure from spectral texture — the
  core technique deepened here.
- The finding that **cepstral-coefficient interpolation gives the most linear
  temporal-envelope morph** — why the morph is done in the liftered cepstral /
  log-envelope domain rather than by cross-fading filters.
- **The source–filter model of sound production (Fant)** — the recording as
  source, the morphing spectral envelope as the vocal-tract filter.
- **Grey, J. M. (1977), "Multidimensional perceptual scaling of musical
  timbres"** (JASA 61:1270) — timbre as a continuous, low-dimensional space to
  travel through, not a set of discrete presets.
