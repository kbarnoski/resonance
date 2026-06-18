**For**: kids (4+)

# 713 — Rubber Face Sing-Along

## The one question
**What if a 4-year-old could SCULPT a silly voice with their fingers — grab a giant
googly face and pull its nose, stretch its mouth, squish its cheeks, and the face's
voice bends and morphs in real time?**

A huge friendly cartoon face fills the screen. The child grabs its features and
deforms them, and every squish drives a **source-filter / formant ("vowel") voice
synth** — a buzzy glottal-ish sawtooth source pushed through three bandpass formant
filters. The voice is sculpted entirely by touch. There is **no microphone**: the
sound comes from how the face is squished, not from anything the child says.

## How to play
1. Tap **"Wake the face!"** (this creates + unlocks the AudioContext for iOS).
2. Grab a feature with a finger (or mouse) and pull:
   - **Nose up / down** → the voice slides high or low, like a slide-whistle
     (loosely snapped to a friendly pentatonic-ish set, ~120–500 Hz, never harsh).
   - **Mouth wide vs. tall** → morphs the formants between vowels: neutral = "ooo",
     pull sideways = "eee", pull down = "aaa". The face says different silly vowels
     as you reshape its mouth.
   - **Cheeks squished in** (drag toward the center) → a wah / lowpass wobble.
   - **Ears / eyes pulled** → adds vibrato depth and a goofy warble.
3. **Let go** → the feature springs back with a comic boing and the voice glides
   back to a quiet whisper over the always-on ambient pad.
4. Do nothing for ~2.5s and a **ghost finger** auto-demos: it pulls the face around
   on its own so the face is visibly + audibly singing. The instant a real finger
   touches, the ghost steps aside.

No reading is required — text is labeling only. All grab targets are ≥64px and the
voice responds within a frame of touch.

## Tags
- **INPUT**: touch-drag deformation (single finger; multitouch supported — each
  pointer can grab a different feature).
- **OUTPUT**: Canvas2D rubbery cartoon face on a dark, saturated background.
- **TECHNIQUE**: gestural-deformation → source-filter / formant ("vowel") synthesis.
  Synth params come from how the face is squished, **not** from a microphone.
- **VIBE**: silly / stretchy-face / Mr-Potato-Head slapstick.

## Named references
- **Mr. Potato Head** / stretchy-face toys — the joy of yanking facial features off
  a friendly head; the face here is deliberately over-reactive and rubbery.
- **Klatt formant synthesis** / the source-filter vocal model — a glottal source
  (sawtooth + light vibrato) shaped by a bank of formant resonances to produce
  vowels. Here the formant frequencies are driven by the mouth's shape.
- **Sesame Street puppet mouths** — big, expressive, exaggerated mouth shapes that
  read instantly as "talking/singing" to a small child.

This is the lab's first **DEFORMATION → formant-synth** piece. Every prior
vowel/formant prototype (393, 413) drove the synth from a real microphone; this one
is sculpted entirely by touch.

## Audio architecture
- **Voice**: `OscillatorNode` (sawtooth, glottal-ish source) with a sine vibrato LFO
  modulating its frequency → three parallel `BiquadFilter` **bandpass** formants
  (F1/F2/F3, gains 1.0/0.7/0.4) → `BiquadFilter` lowpass "wah" → voice `GainNode`.
- **Vowel morph**: the three formant frequencies are blended between the OOO / AAA /
  EEE tables from the mouth handle's width vs. height, smoothed with
  `setTargetAtTime`.
- **Ambient bed**: two always-on sine oscillators (110 Hz + 165 Hz) through a soft
  lowpass, so the piece never feels silent or broken.
- **Safety chain (everything routes through this)**:
  `masterGain (0.3) → BiquadFilter lowpass (7500 Hz) → DynamicsCompressor
  (threshold −10, knee 6, ratio 20:1) → destination`. Nothing can blast or screech.
- AudioContext is created **inside the Start button's pointer handler** for iOS
  unlock; if it can't start, a `text-rose-300` notice asks for one more tap and the
  face keeps animating.

## Visual architecture
- Pure Canvas2D, DPR-aware. Big round yellow head, two googly white eyes whose
  pupils track the nose, rosy cheeks, a squishy red nose ball on a rubber-band
  tether, and a mouth ellipse that stretches wide/tall with the mouth handle.
- Each feature is a spring handle (verlet-ish: stiffness 0.18, damping 0.74) so it
  boings back when released.
- Subtle dashed grab rings hint where to touch; a ghost finger + pulsing ring shows
  during the idle auto-demo.

## Ambition floor (honest note)
This prototype is aiming primarily at:
- **#1 a never-before-used technique in the lab** — gestural **deformation → formant
  synthesis**. Prior formant work (393, 413) was mic-driven; this derives vowels and
  pitch from how the face is physically squished. That is the core bet.
- **#3 named references** — Mr. Potato Head, Klatt source-filter synthesis, and
  Sesame Street puppet mouths, all cited above and legible in the design.

It does not claim the other ambition tiers (e.g. a deep generative system or a novel
audio-DSP contribution); the formant bank is a deliberately simple, friendly,
kid-safe approximation rather than a faithful Klatt synthesizer.

## What's rough / unverified
- The exact "this sounds like a vowel" quality of a 3-formant bandpass bank is
  approximate; it reads as a silly cartoon voice more than crisp speech (intentional
  for kids, but the AAA/EEE/OOO distinction is best verified by ear on device).
- Multitouch and true touch latency are unverified without a real iPad — built with
  Pointer Events + `touch-none`, but not yet hands-on tested on a touchscreen.
