# 18512-facescore
**Status**: demoable

**Question**: What if your face conducted the phrasing of Karel's piano, drawn as a living score?

## What it is
One real recording from Karel's catalog loops at normal speed. Your face conducts its articulation and brightness, and the sound is drawn as a living ink line-score. Input is the face (MediaPipe blendshapes plus head roll). Output is SVG, the deliberately rested render path: no canvas, WebGL or WebGPU. The verb is articulation and phrasing conducting, a dry-articulate to feedback-delay-bloom crossfade.

## Signal path
- Blendshapes become one openness scalar: jawOpen, eye openness (inverted eyeBlink), brow (browInnerUp minus browDown) and a little smile are combined and smoothed. Brow height is also kept separately as brightness. Head roll comes from the angle between the outer eye corners (landmarks 33 and 263).
- Two buses are crossfaded equal-power by openness (cos and sin). The dry bus has a presence high-shelf and a fast-release compressor with makeup, so attacks stay clear and clipped. The bloom bus is the take fed into a feedback delay (240 ms, feedback 0.45 to 0.58, lowpass inside the loop), so each note sustains and overlaps the next into legato. It is a delay network, not a convolver reverb.
- Brow drives a master high-shelf (-6 to +6 dB). Head tilt leans a StereoPanner. Everything goes into the shared safe master, which is the only node that touches the destination. No synth or oscillators.

## The score
- The page is a fixed viewBox SVG with a fixed set of elements: five staff strokes, a main ink contour, a ghost contour, and 110 reusable note-marks (a head circle plus a tail line). Attributes are mutated each frame and no DOM is created per frame.
- Open face: long wavelength, deep swells, a heavy unbroken contour and long horizontal tie-tails on the notes. Tight face: the wave clips toward a square shape, the stroke thins and breaks into dashes, and the marks become short vertical ticks.
- Note-marks are spawned from spectral flux in the master analyser. Pitch region (spectral centroid) sets the offset from the line, and the marks ride the contour as it scrolls. Head tilt rotates the whole staff by a few degrees.
- Look: near-black ink (#1b1a17) on bone paper (#e9e4d8). The chrome sits in its own dark overlay using the theme tokens.

## Degradation
Gating is on face presence only. When a frame has no face the last-good values are held for 0.7 s, then the status line turns destructive with a hint. After a longer loss, or before any face is found, a labelled demo breath moves the openness. With no camera, denied permission, or a model load failure, a visible notice appears and the pointer takes over (Y opens, X tilts). Before Play, a labelled demo drive breathes the line.

## References
- Cornelius Cardew, "Treatise" (1963-67): the graphic-score lineage behind a notation that is drawn and not engraved.
- arXiv:2609.10844, "Expressive Robotic Pianist ... Musical Dynamics" (2026-09-09): the framing of expressive dynamics as a controllable layer over a fixed performance.
