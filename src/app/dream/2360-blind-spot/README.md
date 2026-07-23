# 2360 · blind-spot

**The one question:** *What if you could hear your own consciousness edit
reality — sit still, and watch objectively-present tones vanish from your
awareness one by one, the chord thinning as your attention narrows?*

A **Motion-Induced-Blindness (MIB)** instrument. Fixate the central mark while a
large field of blue crosses rotates slowly in the background. Salient warm
target dots in the periphery spontaneously **disappear from conscious awareness**
for seconds at a time — even though they are physically always on screen, and
even though you *know* they're there.

## How MIB works

Discovered by Bonneh, Cooperman & Sagi (*Nature* 2001): a slowly-moving global
motion field suppresses stationary high-salience targets from perception. The
targets never physically change — your visual system simply stops reporting
them. It is one of the cleanest everyday dissociations between what is on the
retina and what reaches awareness.

## The two independent, conflicting variables

This piece deliberately has **no master 0→1 dial**. Two genuinely independent
axes are always in play, and they conflict:

1. **Objective presence** — the targets are always physically drawn. Each dot's
   thin outline **ring never dims**. That ring *is* the objective axis.
2. **Subjective awareness** — which dots you currently perceive. The bright
   **fill** and a sustained **chord partial** encode this axis; it rises and
   falls independently of presence.

The instrument reads your *subjective* field back to you as sound. Each of the
six target dots is one soft sine partial in a calm additive chord (A2 root,
ratios 110/165/220/275/330/440 Hz). When a dot vanishes and you **report it**
(tap the dot, or press its number **1–6**), that partial fades out and the chord
audibly **thins** to match your shrinking awareness — then **re-blooms** as dots
return. You are literally hearing the difference between what is there and what
you perceive.

## Spatial anisotropy (today's-research hook)

Recent work — **PMC11557702 (2024)** — shows MIB fading is *spatially
anisotropic*: targets on **oblique** meridians (diagonals) fade **more often and
for longer** than those on **cardinal** meridians (horizontal / vertical). The
six dots are placed at both: three cardinal (up / right / left) and three
oblique (the diagonals). The **blind-map** readout logs how long each position
has spent faded, so an attentive viewer watches their own oblique bars fill
faster — the piece quietly reveals your personal anisotropic "blind map." The
seeded demo schedule biases the obliques the same way.

## Subsystems

- **Rotating-grid MIB stimulus renderer** — pure SVG-DOM. A single `<g>` of ~170
  blue "+" crosses; only its `rotate(deg cx cy)` transform mutates per frame in
  one `requestAnimationFrame` loop (~0.08 rev/sec — slow, smooth, no flicker).
- **Report state machine** — pointer + keyboard (1–6) toggling each dot's
  reported visibility, easing its awareness toward the report.
- **Additive partial-bank synth** (`synth.ts`) — one sustained sine voice per
  dot, each gain driven continuously by that dot's awareness; a slow shared LFO
  lets the pad breathe.
- **Blind-map readout** — per-position accumulation of "time spent faded",
  cardinal vs oblique.

## Named references

- Bonneh, Y. S., Cooperman, A. & Sagi, D. "Motion-induced blindness in normal
  observers." *Nature* **411**, 798–801 (2001).
- Spatial anisotropy of MIB fading — **PMC11557702** (2024).

## The seeded demo (honest stand-in)

Real MIB requires *your own* fixating eyes; a headless renderer cannot verify a
perceptual disappearance, and a silent 06:30 phone glance can't perform it
either. So the default **auto-fade demo** uses a deterministic
`mulberry32(0x2360)` schedule (no `Math.random()`, no `Date.now()` — only
`performance.now()` for animation timing) to fade and restore dots and thin /
re-bloom the chord automatically. Switch to **Report mode** to drive it with
your own perception.

## Honest limitations

- The demo is a *simulation* of the report, not evidence of your MIB — the point
  is only to make the audio-visual coupling legible when no one is fixating.
- MIB strength varies enormously between people and depends on steady central
  fixation, dim surroundings, and peripheral (not foveal) targets. If nothing
  vanishes for you, relax your gaze on the centre and wait ~10–20 s.
- On mount the grid already rotates and all dots are visible, so the stimulus
  reads instantly even before sound is started.

## Safety

Calm fixation piece. The grid rotation is a gentle continuous ~0.08 rev/sec
(≈9 rev/sec-free — well under any flicker/strobe rate); reduced further when the
OS requests reduced motion. No flashing, no high-frequency luminance change.
