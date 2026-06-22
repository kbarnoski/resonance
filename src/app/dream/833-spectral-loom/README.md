# 833 · Spectral Loom

A clinical, Ryoji-Ikeda-flavored **spectral instrument where the visitor's own
live microphone is the raw material.** You make a sound, freeze it as a
spectrogram *image*, then **paint that image** — smear energy sideways, brush it
in and out, stretch it — and **hear the picture you painted** through additive
resynthesis.

## The question it answers

> *What if you could FREEZE your own live sound as a spectrogram image and then
> PAINT that frozen picture — smear it, stretch it, brush energy in and out —
> and hear the picture you painted?*

It deliberately rests on the visitor's live voice/sound rather than a stored
file, so the material is *theirs*.

## Freeze → paint → resynth design

1. **Listen.** A live STFT via `AnalyserNode` (`fftSize 1024`, byte magnitudes
   normalized `0..1`, folded onto a perceptual log-frequency row grid)
   scrolls a rolling spectrogram on Canvas2D.
2. **❄ Freeze.** Copies the rolling window into an editable magnitude matrix
   `buffer[TIME_COLS][ROWS]` — a held "image" you can edit.
3. **Edit the picture to edit the sound** (pointer drags on the frozen image):
   - **Raise +** / **Lower −** — a soft-falloff Gaussian brush that adds or
     removes magnitude (`applyBrush`).
   - **Smear ↔** — drags spectral energy sideways in time, a freeze-stretch
     blend toward the drag direction (`applySmear`).
   - **Freeze-stretch slider** — a per-frame IIR time-blur that leaks each
     column into the next, melting transients into drones (`applyTimeBlur`).
   - A **scrub head** sweeps the frozen frame; a **Loop** toggle re-triggers it
     rhythmically so the instrument stays active, never a static drone.
4. **Resynthesis.** A capped **additive oscillator bank (96 max)** reads the
   magnitude column *under the scrub head* each frame, picks the loudest rows,
   and sets each oscillator's frequency + gain with `setTargetAtTime` smoothing
   (no zipper noise). Master chain:
   `gain → lowpass ≤13.5 kHz → DynamicsCompressor → destination`.

## Mic-free demo path (hard requirement, fully implemented)

- The canvas animates a synthesized demo spectrogram **on load**, so it is never
  blank.
- **Start mic** requests `getUserMedia` only after the gesture. If the mic is
  **denied or absent**, a `text-rose-300` notice appears *and* the **Use demo
  sound** button routes an internally generated evolving sound (slow drifting
  chord + whistle sweep + filtered-noise band) through the **identical**
  capture → freeze → scrub → resynth pipeline. The whole mechanic is demoable
  with no microphone. You can also switch mic → demo mid-session.

## Graceful degradation

- Mic denied/absent → rose notice + demo path.
- Canvas2D unavailable → rose text notice overlaid on the panel.
- Audio engine failure → rose notice; visuals keep running.
- Clean teardown on unmount: `cancelAnimationFrame`, `track.stop()` on mic
  tracks, disconnect all nodes, `audioCtx.close()`.

## Visuals

Near-black background, a cool monochrome → cyan → violet → white magnitude
ramp, a crisp dim grid, a violet frozen-frame border, and a bright (cyan when
looping) scrub-head line with glow. Pixel art is rendered into a small
`ImageData` then nearest-neighbor scaled for a tactile, data-instrument look so
brush strokes are clearly visible — and audible.

## Reference

Jean-François Charles, **"A Tutorial on Spectral Sound Processing Using Max/MSP
and Jitter,"** *Computer Music Journal* 32:3 (2008) — the technique of treating
a spectrogram as an editable image buffer and resynthesizing from it
(GRM/IRCAM spectral-freeze lineage). Aesthetic kinship: **Ryoji Ikeda**'s
data/spectral clinical visuals.

## Next-cycle deepening

- Replace the additive bank with a true inverse-FFT (overlap-add) resynth via an
  `AudioWorklet`, so phase and noise textures survive — the current additive
  reconstruction discards phase and treats each row as a pure tone.
- Add **multiple frozen layers** that can be cross-faded/multiplied, and a
  **per-region freeze** (lasso a time/frequency rectangle) instead of freezing
  the whole window — moving from one held image toward a small spectral montage.
- Brush *shape* presets (vertical "harmonic comb", horizontal "sustain") and an
  undo stack.
