# 9720 — Test Card

**What if playing a chord rendered, frame-exact, as a stark black-white-red data
test pattern — the way Ryoji Ikeda converts audio signal into real-time barcode
imagery?**

`state: data-sublime · pole: intense`

**Status**: demoable

An idle seeded auto-demo silently latches a rotating subset of partials on load,
so the barcode field is alive at a glance before any interaction; playing any key
hands the field to you.

## What it is

A full-bleed Canvas2D field that turns a sounding spectral cluster into a 1-bit
data test pattern: scrolling barcode bars, CRT scanlines, and a moving red scan
cursor. When notes sound, their partials appear as bars; silence empties the
field. It reads as *the sound made visible*, frame-synchronized.

## Reference

Ryoji Ikeda, *test pattern* (2008–) and *data-verse* — audio signal converted
in real time into 1-bit barcode / scanline imagery, black & white with red as
the sole accent, staged as sensory-overload "data sublime." (Ikeda has two 2026
solo shows; *data-cosm [n°1]* ran at 180 Studios into 2026.) This prototype
borrows the palette discipline and the audio→barcode conversion, not any assets.

## How it works

**Audio (deliberately NOT pentatonic).** A small Web Audio graph of nine stacked
sine oscillators forms a microtonal just-intonation cluster —
`RATIOS = [1, 3/2, 2, 11/4, 3, 15/4, 4, 11/2, 8]`, including the undecimal 11/4
and 11/2 — over a low fundamental (default 87.31 Hz). Each partial carries a
tiny inharmonic detune (`×(1 + 0.004·i)`) for slow beating/shimmer. Keys `a–l`
latch partials on/off; `↑ / ↓` shift the fundamental by a 7-EDO step (non-
diatonic). A `DynamicsCompressor` limiter guards against clipping when the full
cluster sounds. Glitch percussion: short bandpass-filtered white-noise bursts
fired at scan-cursor grid crossings.

**Visual (pure Canvas2D, frame-exact).** Each frame reads the live per-partial
amplitude model (lerped envelope shared by audio and video). For every screen
column the renderer computes an **XOR interference** of every sounding partial's
barcode: higher frequency → tighter bar period (`2600 / freq`), louder → wider
duty cycle. Overlapping partials moiré against each other — the spectrum made
visible. Horizontal black scanlines carve the white field; a red scan cursor
sweeps (~2.6 s), inverting a strip via `globalCompositeOperation = "difference"`
with a 1px red line on top, and a top rail shows red ticks per active partial.

**Palette.** Pure `#000`, pure `#fff`, one red `#ff2200` — no gradients, no
other hue inside the canvas. UI chrome outside the canvas uses Resonance
semantic tokens.

## Safety (photosensitive epilepsy)

Default motion is slow horizontal barcode scrolling plus the sweeping cursor —
spatial motion, luminance-stable, no fast full-field flicker. The only toggling
effect (an invert-strobe) is **off by default**, gated at ~2.9 Hz (340 ms), only
runs while a note sounds, and has an instant `kill` button.

## Controls

- **Start** — creates the AudioContext (user gesture) and begins the loop.
- **Keys a–l** / on-screen row — toggle the 9 partials.
- **fund − / + / ↑ / ↓** — shift the fundamental (7-EDO microtonal step).
- **Silence** — release all partials.
- **Design notes** — in-app overlay of this content.

Degrades gracefully: if Web Audio is unavailable it shows a notice and still
runs the visuals from the toggle state.
