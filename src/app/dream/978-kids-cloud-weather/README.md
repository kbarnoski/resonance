# 978 — Conduct the Sky (Kids Cloud Weather)

**What it is.** A whole-body, off-glass instrument for ~4-year-olds. The front
webcam watches the child, who stands back and *moves*. Their motion paints a
living, bright daytime sky on a Canvas2D world — a glowing sun, drifting
parallax clouds, a rolling meadow, flowers that bloom on notes, and
birds/sparkles on sudden bursts — while playing a real **C-Lydian** melody over
an always-on soft Lydian pad bed. No finger ever touches the glass; the *quality*
of the movement is the instrument.

**How to play.** Tap **▶ PLAY THE SKY!** (this one gesture unlocks audio and
asks for the camera). Then stand back and move with your whole body:

- **Reach UP high / jump** → higher, brighter Lydian notes; flowers bloom near
  the bright meadow. **Crouch / move low** → lower, warmer notes.
- **A BIG sweeping wave** → louder, a burst of many flowers blooming at once.
  **A tiny gentle wiggle** → one soft single note.
- **A SUDDEN burst** → a sparkly staccato pluck plus a shooting star / bird.
  **Smooth, SUSTAINED motion** → a long legato sung tone and slow cloud drift.

There are no wrong notes, no fail states, no reading required — everything maps
to a sweet, calm, kid-safe sound.

**Named reference — Laban Effort Theory (BeSound).** The three controls are the
core *Effort* qualities from Rudolf Laban's movement analysis (the same
movement-quality vocabulary that interactive works like *BeSound* use to turn
dance into sound): **Space/height** (vertical centroid of motion → musical
register), **Weight/energy** (total frame-difference motion → dynamics and how
much blooms), and **Time — sudden vs. sustained** (rate of change of motion
energy → staccato pluck vs. legato tone). Mapping *movement quality* (not just
position) to *musical expression* is the heart of the piece.

**Why Lydian.** C Lydian is **C D E F♯ G A B** — a real church mode, not a
"no-wrong-notes" pentatonic. Its defining feature is the **raised 4th (F♯)**,
which lifts the major scale into the bright, floating, "wonder/magic" color
heard in a lot of film and fantasy music. We keep that F♯ in both the melody and
the pad bed (a Cadd9 color lifting to a D/C "II" shimmer) so the sky always
feels dreamy and buoyant rather than flatly happy.

**Input technique.** Pure frame-difference, no ML. Each frame is drawn to a tiny
64×48 offscreen canvas; per-pixel luminance is differenced against the previous
frame; the thresholded motion mask yields (a) total motion energy, (b) the
motion-weighted vertical centroid (body height), and (c) the time-derivative of
energy (suddenness). An adaptive baseline self-calibrates to room lighting. No
MediaPipe / TensorFlow / npm ML dependencies.

**Always-alive (06:30-glance) robustness.** If the camera is denied/unavailable
or there is no motion for ~2.5s, an invisible **ghost auto-conductor** drifts a
figure-8 of body-height + energy, so the sky keeps painting itself and a gentle
Lydian phrase plays on its own. Clouds always drift and the sun always glows, so
a silent glance is never static or silent. On Stop/unmount the camera track is
fully stopped and the AudioContext is closed.

**Audio safety.** Master chain is `gain (≤0.3) → lowpass (~7 kHz) →
DynamicsCompressor(threshold −10, ratio 20) → destination`, with smooth
envelopes (attack ≥15 ms) and no sudden loud transients.

**Machine-verification status.** This sandbox has **no GPU and no camera**, so
the prototype is **compile/lint-verified only** — its runtime audio-visual
behavior (camera frame-diff, Web Audio output) has not been observed on this
box and should be confirmed on real hardware.
