# 10056 · skyoculus

A James Turrell Skyspace reduced to one aperture: you look up through a crisp-edged
oculus in a dark chamber ceiling at a near-flat sky-plane whose colour cycles
pale-blue → silver → deep-slate → back over ~78 s. A hidden cove light casts the
opponent of the sky onto the chamber, exaggerating the aperture's colour; as the
sky's luminance crosses a threshold the opening flips from a receding hole into an
advancing, self-luminous panel that spills light onto the walls.

## The question

What if you lay back beneath a dark chamber and looked up through an oculus at a
plane of sky that a slow chromatic light-arc drives across the luminosity
threshold — until the aperture stops reading as a hole to the sky and becomes a
solid, self-luminous panel hovering just above you?

## Drivers (both degrade gracefully)

- **Breath** — mic RMS envelope (behind an explicit Enter gesture). Exhale dilates
  the oculus, nudges the sky toward the threshold, and opens the drone's spectrum.
  No/denied mic → a ~0.15 Hz auto-breath keeps it alive on mount.
- **Gaze** — device-orientation tilt looks further up the oculus (iOS
  `requestPermission`). Unavailable/denied → pointer-drag + a slow auto drift.
- **Chromatic arc** — an autonomous ~78 s traverse that crosses the luminosity
  threshold on the way up and back down, so the flip is guaranteed with no input.

## Flip mechanism

The luminosity threshold (~0.60 Rec.709 luminance here) is the boundary where a
patch stops reading as an *illuminated surface* and reads as *self-luminous*.
Below it the sky-plane carries a faint depth gradient (recessed hole) and the
chamber holds only a dim opponent cove-glow; above it the internal gradient
flattens to a solid panel and light spills outward onto the walls. The eight-
partial inharmonic drone re-weights energy upward at the same moment, so the flip
is audible as a slow spectral opening as well as visual.

## Audio

Eight-partial inharmonic choral drone — ratios `1, 1.34, 1.79, 2.36, 3.03, 3.91,
4.87, 6.14`, root ~55 Hz, 2–3 detuned voices per partial (±3–6 cents, seeded),
higher partials quieter. Routed drone → void reverb → safe-master (gain 0.16).
Deterministic: `mulberry32(0x10056)` only; `performance.now` / rAF delta for time.

## Rendering

`@react-three/fiber` + a drei `ScreenQuad` full-screen triangle carrying a
hand-written `RawShaderMaterial`: aperture + opponent cove-light + self-luminous
spill + vignette, with per-frame dither to kill banding on the near-flat field.
All luminance/chroma motion is slow drift (≤ ~0.2 Hz) — never strobing. Full
teardown on unmount (oscillators, AudioContext, mic tracks, listeners, material).

## References

- **James Turrell** — *Skyspace* / Ganzfeld-aperture works: the architectural
  oculus and hidden opponent cove-light that flatten sky into an advancing solid.
- **Duay & Nagai, "The luminosity threshold", PLOS ONE 2026** — the luminance
  boundary where a surface stops reading as illuminated and reads as self-luminous.

## Tags

- **state** · numinous / meditative / self-luminous
- **pole** · deep
- **input** · breath (mic RMS) · gaze (device tilt / pointer drag) · autonomous arc
- **output** · full-screen aperture shader · inharmonic choral drone
- **technique** · architectural aperture + opponent cove-light + luminosity-threshold flip
- **palette** · pale-blue / silver-white / deep-slate stone
