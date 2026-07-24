# 2522 · XY-Scope

**The question:** *What if the sound* were *the picture — an XY oscilloscope where
the raw audio signal itself draws glowing vector shapes, and pushing it toward
harsher, more dissonant timbres visibly warps the shape in lockstep?*

## What it is

Two raw oscillators, hard-panned into a stereo signal: **voice A is the left
channel and drives the scope's X axis; voice B is the right channel and drives
Y.** The glowing figure on screen is not a visualization *of* the sound — it *is*
the sound, plotted as the parametric curve `(L(t), R(t))`. This is classic
oscilloscope / Lissajous music: feed a scope in XY mode two related tones and the
electron beam traces a standing figure.

The trace is drawn from the **real audio buffer** — two `AnalyserNode`s (one per
channel) sampled with `getFloatTimeDomainData` every frame — so image and sound
are literally the same data.

## Why free ratio = free dissonance

The lab has leaned hard on just-intonation / pentatonic engines that snap every
interval onto a consonant lattice so nothing can sound bad. This piece
deliberately does the opposite. **Base frequency and the ratio between the two
voices are fully continuous and un-tempered** — nothing is quantized.

- Simple ratios (2:1, 3:2) lock the beam into a **stable, closed Lissajous loop**
  and sound consonant.
- Irrational / complex ratios never close, so the figure **precesses** and the
  two tones **beat and clash**.

Free ratio is free dissonance: the player can walk a clean loop straight into a
screeching, buzzing one, and the geometry moves with the harmony.

## The danger axis

**Drive** is one knob that pushes the piece from clean into harsh two ways at
once, so timbre and geometry sharpen together:

1. **Waveshaping** — each sine is run through a `tanh` saturator, bending it
   toward a square. New harmonics buzz in; the smooth Lissajous grows sharp
   corners and spikes.
2. **FM** — voice B is frequency-modulated at voice A's rate. Because the ratio
   is free, the sidebands land inharmonically → gritty, dissonant noise that
   scales with drive.

Hold **Space** to ramp drive to full danger; the whole figure snaps taut and
metallic.

## Rendering (WebGL2, hand-rolled)

Raw WebGL2 — no three.js, no libraries. The audio-buffer polyline is drawn as a
`LINE_STRIP` with additive blending into a **ping-pong persistence buffer** (each
frame decays the last, the phosphor trail of a real CRT scope), then a final
bloom + tonemap pass smears the 1px trace into glow. Violet phosphor that shifts
toward magenta as drive rises. Degrades to a `<destructive>` note plus a minimal
SVG vector fallback if WebGL2 is unavailable, and keeps the visual (no audio)
if Web Audio is missing.

## Auto-demo

Browsers block audio before a gesture, so on load a **silent, audio-free**
auto-demo animates the *same* L/R equations (deterministic math, seeded
mulberry32 `0x2522` for analog phosphor noise) — a glowing figure morphs on
screen so a silent 6:30am phone screenshot already shows something alive. Real
audio starts only after the first gesture.

## Key map

| Key | Action |
| --- | --- |
| `Enter` / `P` | start audio |
| `A S D F G H J K L` | base pitches |
| `← / →` | sweep ratio (dissonance) |
| `↑ / ↓` | sweep phase (rotate the figure) |
| `Space` (hold) | ramp drive to full danger |
| `[` / `]` | nudge drive down / up |

On-screen sliders mirror every control as a fallback.

## References

- **Jerobeam Fenderson**, *Oscilloscope Music* — audio-as-image on an XY vector
  scope; the direct lineage for this piece.
- **Rutt–Etra video synthesizer** — analog vector-deflection imaging.
- **Ryoji Ikeda** — data / signal aesthetic (raw signal as image and sound).

## Status

**Demoable.** Makes sound on gesture; the XY trace is driven by the real audio
buffer; ratio + drive genuinely push it into harsh, dissonant territory while the
shape warps; auto-demo runs silently on load; degrades gracefully with no
AudioContext or no WebGL. Deterministic (no `Math.random` / `Date.now`). Full
teardown on unmount (oscillators stopped, context closed, GL context lost and
buffers deleted, listeners and RAF removed).
