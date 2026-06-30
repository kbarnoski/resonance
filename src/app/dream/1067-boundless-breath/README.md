# Boundless Breath (1067)

**The question.** What if you could *breathe yourself into a boundless, endless
ascent* — your inhale gathers a vast field of stars inward toward a luminous core
and lifts a Shepard–Risset endless glissando upward; your exhale releases the
stars outward into boundless drift and the glissando settles — so that the *felt
sense of rising forever* (auditory + visual vection) is something you **play**
with your breath, not a video you watch?

This is an **instrument played by breath-as-control**, not a lean-back
screensaver.

## How breath maps to the rise

Breath is the control signal. `breath.ts` pulls the mic into a Web-Audio
`AnalyserNode`, computes a per-frame RMS of the waveform, and smooths it with
asymmetric attack/release plus slow auto-ranging into a value **b ∈ [0,1]** that
reads as the swell-and-fall of breathing (not transients).

| breath b | audio (Shepard + bed) | visuals (starfield) |
|---|---|---|
| **inhale (b→1)** | upward transpose accelerates; spectral brightness opens; reverb blooms; drone lifts | inward radial flow speeds up — stars rush toward/past the camera = forward/upward self-motion |
| **exhale (b→0)** | ascent eases to a near-hover (never hard-reverses); space settles | flow drops to a slow boundless drift; a whisper of rotation keeps it alive |

No mic / permission denied → an **auto fallback** paces a calm ~5.5
breaths-per-minute sine so the instrument always lives and sounds (amber
"○ auto-breath" notice). Mic active shows an emerald "● breath".

## The Shepard ascent (`shepard.ts`)

A real Shepard–Risset endless glissando: 9 sine partials spaced one octave apart,
each weighted by a fixed Gaussian envelope over log-frequency (centred
mid-spectrum, ~3 octaves wide). A global transpose `phase` (in octaves) advances
continuously and wraps at each octave, so partials fade **in** at the bottom of
the envelope and **out** at the top — no audible edge, the rise is genuinely
endless. The glide is continuous (no quantised steps); breath couples directly to
the ascent rate and brightness.

`audio.ts` assembles: Shepard engine + a low just-intonation drone bed (root +
3:2 fifth, detuned pairs) + a **code-synthesised** convolution reverb (an
exponential-decay noise impulse rendered straight into an `AudioBuffer` — no file
is fetched) → a master `DynamicsCompressor` limiter → destination. Inhale opens
the reverb send and drone slightly.

## The congruent visual vection (`scene.ts`)

~120k points in a deep spherical shell around the camera, drawn as a
`THREE.Points` additive `ShaderMaterial`. Each frame every point creeps inward
along its radial direction at a breath-scaled speed; points that cross inside the
core radius re-spawn on the far shell, so the optic-flow expansion is endless and
the field never depletes. Violet → cyan → gold radial colour ramp, soft round
sprites, size attenuation, a subtle continuous rotation. Velocities and dt are
clamped; positions stay finite (no NaN) for minutes.

This pairs **visual** vection (radial optic flow) with the **auditory** vection of
the glissando so the eyes feel the same ascent the ears do.

## References

- **Roger N. Shepard (1964)** — *Circularity in judgments of relative pitch* —
  the discrete octave-stacked illusion.
- **Jean-Claude Risset** — the continuous *glissando* version (the barber-pole
  tone that glides forever).
- **Auditory-vection research** — the Shepard–Risset glissando induces a
  metaphorical bodily sense of self-motion (rising/falling) as strong as visual
  self-motion cues, measurably shifting listeners' postural sway. That finding is
  the grounding for pairing the rising tone with congruent radial star flow.

## Honest novelty

The lab already has passive Shepard-tone demos (`40-shepard-tone`,
`132-shepard-tone`, `187-shepard-tone`). Those play themselves. The new thing
here is the **breath-coupled, vection-paired, *played* version** — you steer the
endless rise with your own lungs, and the stars carry your eyes up with it.

## Next-cycle deepening

- Detect inhale/exhale **phase/direction** (zero-crossing of the envelope slope),
  not just amplitude, for true bidirectional steering.
- A breath-locked particle **bloom at the core** on the inhale peak.
- **Binaural** spatialisation of the Shepard partials for a wider boundless field.
- Gentle **pitch-class → colour** coupling on the core glow.
- A guided onboarding that teaches coherent (~5.5/min) breathing before free play.

## Safety

No strobing or flicker. All brightness change is smooth luminance drift, tied to
the slow breath envelope and well under 3 Hz. WebGL-unavailable and
mic-denied both degrade to readable notices rather than crashing.
