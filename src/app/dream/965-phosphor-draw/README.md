# 965 · Phosphor Draw

**The question:** *What if the glowing image you SEE and the sound you HEAR were literally the same signal?*

A true oscilloscope vector-synthesizer. You draw a closed loop on a dark XY
scope; that loop becomes a **stereo audio signal** — X coordinates fill the
left channel, Y coordinates fill the right — looped at an audible rate. Because
the very same stereo signal is what gets plotted on the XY scope, **the shape
you hear is the shape you see**. Sound and light are one signal.

## How it works — the signal-is-the-image principle

1. **Resample.** Any drawn or preset path is normalised to roughly `[-0.9, 0.9]`
   and resampled into `SHAPE_N` (1024) points spaced by *constant arc length*
   (`path-geometry.ts`). Even spacing means the electron beam / playback head
   moves at a perceptually even rate around the loop.
2. **Sonify.** A stereo `AudioBuffer` is filled with `L[i] = x[i]`,
   `R[i] = y[i]` (`audio-engine.ts`). With `loop = true`, the buffer's traversal
   rate is the fundamental **pitch**, set via `playbackRate`
   (`freq · bufferLen / sampleRate`) so retuning never rebuilds the buffer.
   The loop's geometry is its **timbre**: a circle ≈ near-sine, a square ≈ rich
   odd harmonics, a star ≈ bright buzz. A modest master gain (~0.28) and a ~18 Hz
   DC-blocking highpass keep it clean and safe.
3. **Show the exact same signal.** The render loop rotates the shape by the
   current spin angle and writes the result into a *single* `xs`/`ys` array pair.
   That same array drives both the scope **and** the audio buffer push, so the
   "you see exactly what you hear" claim is literally true — including spin,
   which is audible (the stereo waveform changes) and visible (the figure turns).
4. **Phosphor look.** `phosphor-gl.ts` is a WebGL2 vectorscope: a ping-pong
   `RGBA16F` feedback texture fades the previous frame (CRT persistence), then
   the new beam is drawn additively as a `LINE_STRIP`. Per-vertex intensity is
   **dwell-based** — where the beam moves slowly it glows brighter, exactly like
   a real scope. A final pass adds soft bloom and a filmic tonemap so hot spots
   bloom to white-green.

## Controls

- **Presets** — figure-8, circle, square, star, lissajous, heart: one tap to
  hear instantly with zero drawing.
- **Draw** — sketch any closed loop with finger or mouse (Pointer Events, so it
  works on iPad). It is closed, normalised, smoothed and resampled on release.
- **pitch** (40–400 Hz) — loop replay rate = fundamental.
- **spin** (0–2 rad/s) — slowly rotates the shape; audible *and* visible.
- **brightness** — beam intensity.
- **persistence** — afterglow / CRT decay length.

## Autoplay

On load, after the single required Start tap (needed to unlock audio on
iOS/Safari — the `AudioContext` is created and resumed inside that gesture), a
slowly-spinning **figure-8** is already drawing itself and singing, so a glancing
reviewer immediately sees and hears the idea.

## Graceful degradation

- **No WebGL2 / no float render targets** → falls back to a Canvas2D scope
  (`phosphor-2d.ts`) using translucent-decay trails + `shadowBlur` glow.
- **No audio** → the scope still runs silently with a visible `text-rose-300`
  notice.
- Audio nodes are fully torn down on unmount.

## References / lineage

- **Jules Antoine Lissajous (1857)** — Lissajous figures: the original
  geometry-from-two-signals.
- **Jerobeam Fenderson — *Oscilloscope Music*** — the art form of audio whose XY
  plot is a drawing.
- **Hansi Raber — *OsciStudio* / *osci-render*** — tools that convert vector art
  into oscilloscope-playable audio; the direct technical lineage of this patch.
- **Ryoji Ikeda — *data-cosm* (2026)** — the sound-as-light / signal-as-image
  thesis at installation scale.
