# 6872 · Ganzflicker — from dots to faces

## The one question

**Can a screen give you a drug-free hypnagogic hallucination** — a *Ganzflicker*
field where, as you settle in, simple geometric **form constants** (dots,
gratings, lattices) organize into ever more complex imagery — **and does the
escalation track a "visual-imagery vividness" dial the way the 2026 science says
it does?**

You take nothing. A uniform luminous field plus a slow luminous pulse does the
work: starved of structure, the visual system amplifies its own noise into
imagery. This piece renders that field and lets you play the dial that, in the
lab, decides whether you see dots or faces.

## The engine

A single WebGL2 fragment shader (`shader.ts`) renders a near-uniform luminous
**Ganzfeld** with three stacked ingredients:

1. **A dim, breathing base field.** Luminance = room brightness × a slow *safe*
   luminance drift (~0.2 Hz — a breath, never a strobe), tinted by the room's
   dominant hue blended toward Resonance violet.
2. **Animated "visual snow" grain** at low alpha — the raw stochastic texture the
   brain organizes into form.
3. **An emergent form-constant layer**, driven by one `uComplexity` uniform in
   `[0,1]`. All the geometry is stripes / hexagons under a **log-polar (`exp`)
   warp** — the standard Bressloff–Cowan map from cortical stripes to retinal
   form constants — plus a bilaterally-symmetric, domain-warped noise layer for
   the face-like pole. The escalation:

   | complexity | stage | construction |
   |---|---|---|
   | ~0 | **dots** | scattered twinkling gaussians (the aphantasic floor) |
   | low | **gratings** | concentric rings / radial grating (funnel & tunnel constants) |
   | mid | **lattice** | three log-polar gratings 60° apart → honeycomb |
   | high | **cobwebs & spirals** | logarithmic spiral + thin spokes + fine rings |
   | very high | **organized forms** | mirror-symmetric domain-warped noise + hovering pareidolic "eyes"/"mouth" |

   Each stage fades in and out on its own slow sine, so structures **never lock**
   — hypnagogic drift, not a static pattern.

Audio (`audio.ts`) is a soft just-intonation drone over a low root with a stereo
`~5 Hz` detune (a gentle binaural-ish theta beat, the drowsy sleep-threshold
rhythm). Its lowpass cutoff and upper-partial gains open with `complexity`, so
sound and vision escalate together. Everything sits under a limiter at a low
master — alive but quiet.

## The imagery-vividness dial (the 2026 research hook)

The prominent **Imagery vividness** slider operationalizes a fresh finding:

> *"From dots to faces: individual differences in visual imagery capacity predict
> the content of Ganzflicker-induced hallucinations"* — **Neuroscience of
> Consciousness, 2026, niag016.** People with vivid visual imagery
> (**hyperphantasia**) see complex forms and faces under Ganzflicker; **aphantasics**
> see mostly simple dots and geometry.

The dial is that finding, made playable. It sets the **complexity ceiling**. A
slow automatic **settling-in ramp** climbs complexity toward that ceiling over
minutes (the way real Ganzflicker imagery builds), and it climbs *faster* when
vividness is high. So:

- **Aphantasia end** → the ceiling is low; the field stays at dots/geometry no
  matter how long you watch.
- **Hyperphantasia end** → the field climbs quickly to lattices, cobwebs, and
  organized forms.

A live readout names the current stage. **Pin (skip settle)** freezes the ramp so
you can preview any level directly.

## Camera → field coupling (and the privacy stance)

**Couple to the room** requests the camera and drives the field's base luminance
and tint from the room's real light: a bright room makes a brighter field, a warm
lamp a warm field. **The camera image is never rendered, stored, or exposed** — it
is drawn to an offscreen 16×12 canvas and reduced to two scalars (average
brightness + dominant hue) before anything leaves `camera.ts`. Fallbacks: no
camera → **mic level** pulses the field; no mic → a **seeded auto-drift** (which is
why the field is alive the instant the page loads, before any permission).

## Safety design

This is a flicker piece and is treated as the highest-risk build.

- **Default = no strobe.** The field breathes via a smooth sine luminance drift
  near **0.2 Hz** — safe for everyone, and it is what you get on load.
- **Any faster flicker is opt-in only**, behind an explicit "Advanced" disclosure
  that shows a **photosensitive-epilepsy warning** before it can be enabled.
- The flicker rate is **hard-clamped ≤ 3 Hz** (`MAX_FLICKER_HZ`) at both the
  slider and in the render loop — it can never reach the ~15–25 Hz danger band.
- An **always-visible Stop** (and a second Stop pinned top-right whenever flicker
  is live) returns instantly to smooth drift the same frame.
- **`prefers-reduced-motion`** disables flicker entirely, slows the breath, and
  halves the grain.

## Determinism & teardown

All randomness is seeded `mulberry32(0x6872)`; time is `performance.now()` via
`requestAnimationFrame`. No `Math.random` / `Date.now` / `new Date`. On unmount:
rAF cancelled, drone stopped + `AudioContext.close()`, camera & mic tracks
stopped, resize listener removed, WebGL context lost. No new npm dependencies —
Web Audio + raw WebGL2 + React/Next only, all self-contained in this folder.

## Degrade path

No WebGL2 → on-brand `text-destructive` notice (never a white screen). No camera →
mic. No mic → seeded auto-drift. No audio → the field keeps breathing.

## Named references

- **Heinrich Klüver**, *form constants* (1926) — the four geometric classes.
- **W. Grey Walter**, flicker-EEG work; **Brion Gysin**, the *Dreamachine* (1959);
  the *Ganzfeld* / *Ganzflicker* paradigm.
- **Bressloff, Cowan, et al.** — the log-polar cortical map that turns stripes into
  the form constants (the shader's core trick).
- **"From dots to faces…"**, *Neuroscience of Consciousness*, 2026, **niag016** —
  the vividness→content finding the dial is built on.

## Next-cycle deepening

1. **Report-back loop.** After a session, ask the viewer what they actually saw
   (dots? faces?) and compare it to where their dial sat — turning the piece into a
   tiny live replication of niag016.
2. **Blue-noise grain texture.** Swap the hash grain for a precomputed blue-noise
   tile sampled per-frame; blue noise is closer to real retinal/photoreceptor
   noise statistics and should read as more organic "visual snow."
3. **Onset-gated pulse.** When coupled to the mic, let slow breath onsets (not just
   level) nudge the complexity ramp, so a hummed drone or the room's ambience
   physically paces the escalation.
