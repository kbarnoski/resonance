# Nearfield (8632)

**Lane A of the shared DEEP concept "THE VEIL."**

> _What if restoring a sound — un-muffling it, drawing it near — were the instrument you play?_

A seeded musical loop (piano/bell arpeggio + pad, key of A minor) arrives
**crushed**: band-limited, muffled, thin, and **distant** — lifeless, like a
piano heard through a wall. You **hum, whistle, or play into the microphone**,
and your **loudness is the "lean-in" control**: the louder and more sustained
you are, the more the veiled loop is drawn **near** — it **blooms** into full,
present, vivid sound while a spectral waterfall behind a dark gauze **veil parts
and fills in with warm colour**.

The restoration is **rule-based DSP — no machine learning.**

---

## Input / output

- **Input** = microphone **loudness** (RMS). Louder/sustained → the veil depth
  `d` rises (bloom is fast, re-veiling on silence is slow, so it feels like
  leaning in). The mic is analysed only — it is **never routed to output**.
- **Output** = raw **WebGL2** (hand-written GLSL, no three.js): a scrolling
  spectral **waterfall** behind a literal dark **gauze** that parts from the
  centre outward as `d` rises; the high and low bands visibly fill with colour
  as they are restored.
- **Fallbacks:**
  - No mic / permission denied → a slow **auto-breathing** `d` plus a
    **pointer-drag** control, with a `text-destructive` notice.
  - No WebGL2 → a **Canvas2D** spectrogram, with a `text-destructive` notice.

## The veil as one macro `d ∈ [0,1]`

| | `d = 0` (far / muffled) | `d = 1` (near / vivid) |
|---|---|---|
| Highpass | ~300 Hz | ~25 Hz |
| Lowpass | ~800 Hz (telephone band) | ~18 kHz |
| Tilt EQ | boomy low-shelf, −20 dB highs | flat lows, +8 dB highs |
| Exciter (highs) | off | synthesized upper partials |
| Subharmonic (lows) | off | body restored |
| Room | wet / distant | dry / near |
| Gain | quiet | present |

Everything crossfades continuously so the far→near transition is dramatic but
smooth.

## How the restoration DSP works (`audio.ts`)

The seeded loop is synthesized once by deterministic additive synthesis into an
`AudioBuffer` (notes wrap-add across the loop boundary → seamless), then run
through a fixed node graph:

- **Missing highs → harmonic exciter (aural-exciter technique).** A bandpassed
  copy of the mid band (~2 kHz) is pushed through a saturating, slightly
  asymmetric waveshaper to synthesize new upper partials, highpassed at ~3.5 kHz,
  and mixed back in with a gain that blooms super-linearly (`d^1.6`).
- **Missing lows → subharmonic / phantom-fundamental synthesis.** An envelope
  follower on a lowpassed tap of the loop drives a sine sub-oscillator whose
  pitch tracks the current chord root **one octave down** (A1 / F1 / C2 / G1
  across the Am–F–C–G progression), restoring body without muddying the harmony.
- **Presence → spectral-envelope reshaping + room.** A low-shelf/high-shelf
  tilt EQ sweeps dark→bright, and a short seeded early-reflection convolution
  room crossfades from wet/distant to dry/near.

The visual spectrogram is fed by an `AnalyserNode` tapping the **restored**
(post-DSP) signal, so on screen you literally watch the highs and lows fill in.

## Palette

Dust/sepia + muffled grey at `d = 0` → warm full spectrum (amber/gold through to
cool highs) at `d = 1`. The dull→vivid colour shift is the visual payload. (Raw
hex lives only inside the WebGL/Canvas art; all UI chrome uses Tailwind semantic
tokens.)

## Determinism / muted-phone legibility

- All randomness comes from `mulberry32(0x8632)`; timing uses
  `performance.now()`. No `Math.random`, no argless `Date`.
- On load — **before any `AudioContext` exists** — a seeded auto-demo cycles
  `d` 0→1→0 over ~10 s using a **synthetic** spectrogram that models the same
  loop and band-limiting, so the veil parting + spectrum filling is fully
  legible on a **muted phone** within ~1 s. Real audio starts only after the
  "Begin · Enable sound" gesture.
- Photosensitive-safe: no full-screen strobe, only slow luminance drift; honours
  `prefers-reduced-motion`.

## Named references

- **AnyBand spectral infilling** — arXiv:2608.00572 (Aug 2026).
- **The Aural Exciter** — Aphex Aural Exciter (harmonic synthesis of highs).
- **SBR / spectral band replication** — mp3PRO, AAC+ (HE-AAC).
- **Harmonic / psychoacoustic bass restoration** — phantom-fundamental (residue
  pitch) bass enhancement.

## Next-cycle deepenings

- Replace the sub-oscillator follower with an `AudioWorklet` PLL that tracks the
  true fundamental, so restoration works on arbitrary imported audio, not just
  the seeded loop.
- Multi-band exciter (independent air/presence/warmth drives) with per-band
  lean-in gestures — pitch of your hum could steer *which* band restores.
- Feed the real analyser FFT into a spectral-flux "restoration confidence" map
  so the veil parts unevenly, following where energy is actually returning.
- Spatialise near/far with a proper HRTF/distance model so drawing-near also
  moves the source toward the listener in space.
