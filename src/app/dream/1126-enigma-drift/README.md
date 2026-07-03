# 1126 — Enigma Drift

An interactive **Enigma / peripheral-drift illusion** built as an instrument.
A completely static, high-contrast geometric field — concentric saturated rings
crossed by a fine radial black spoke grating on warm gallery paper — that makes
you hallucinate intense streaming rotation that is not there. The motion is
composed entirely inside your own visual system by your involuntary eye
movements. No drug, no animation, no strobe.

## How to view it

1. Open the page. The field appears immediately (audio waits for a gesture).
2. Press **Begin** to start the shimmering drone (Web Audio needs a user
   gesture to sound).
3. **Fixate the black dot at the centre** and let your gaze relax. Within a few
   seconds the coloured rings should appear to rotate and stream. The effect is
   strongest in peripheral vision, so keep your eyes on the centre rather than
   chasing the motion.
4. Tune it:
   - **Density / intensity** — more rings + finer spokes = a stronger, almost
     vertiginous percept. This same control drives the audio (more partials,
     quicker beating).
   - **Saturation** — colour intensity of the annuli.
   - **Shimmer** — a *very* subtle sub-pixel micro-drift of the whole field to
     seed microsaccade-like reversals. Even at maximum it is well under 1px and
     under 3 Hz — barely alive, never blinking.

## Technique

Illusory-motion Op-art. Two static SVG layers:

1. A **radial spoke grating** — alternating black / paper angular sectors. This
   high-contrast fine structure is the contrast energy the illusion feeds on.
2. **Semi-transparent concentric coloured annuli** (cyan / magenta / violet /
   amber) laid over it. The colour lets you localise the streaming; the crossing
   spokes make each band appear to flow.

The illusion field is inline **SVG** (deliberately, not `<canvas>`) — crisp
concentric circles and radial paths are the right tool. A tiny `<canvas>` is
used only for the audio waveform meter.

The **audio** is an additive high-partial drone: up to nine detuned sine
partials in a high register (G5–G7). Each partial is a pair of near-frequency
oscillators whose physical interference produces slow amplitude **beating** — a
sonic mirror of the perceived streaming. Raising Density widens the detune (the
beating quickens, ~0.6 → ~5 Hz) and brings in more partials. Gentle onset, a
`DynamicsCompressor` limiter, no clicks. Full teardown on unmount (oscillators
stopped, context closed, animation frame cancelled).

## Safety

Photosensitive-epilepsy safe by construction: the field is **static**. There is
no strobe, no flicker, no rapid colour alternation. The only movement is the
optional Shimmer drift, which is sub-pixel and far below 3 Hz. The UI states
plainly that the streaming is a perceptual illusion — nothing on screen actually
moves quickly.

If Web Audio is unavailable the illusion still runs in silence and a rose-tinted
notice explains that sound is off.

## Honest limitations

- The strength of the percept **varies a lot per viewer** — some people see
  strong rotation instantly, others need to relax their gaze or view slightly
  off-centre. It is strongest in peripheral vision.
- It **fades if you track** a moving point; it depends on you holding fixation
  so microsaccades do the work.
- Very bright ambient light or a small screen weakens the contrast structure and
  the effect with it.

## References

- Isia Leviant, *Enigma* (1981).
- Troncoso, X. G., Macknik, S. L., & Martinez-Conde, S. — "Microsaccades drive
  illusory motion in the Enigma illusion," *PNAS* (2008).
- Faubert, J., & Herbert, A. M. — "The peripheral drift illusion: A motion
  illusion in the visual periphery," *Perception* (1999).
- Bridget Riley — Op-art.

## Files

- `page.tsx` — UI, SVG field, sliders, micro-drift loop, audio wiring, teardown.
- `field.ts` — pure geometry for the spoke grating and coloured annuli.
- `audio.ts` — the additive high-partial beating drone (`EnigmaDrone`).
