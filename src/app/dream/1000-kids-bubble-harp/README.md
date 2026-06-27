**For**: kids (4+)

# Bubble Harp

A calm full-screen underwater aquarium. A dozen-plus glowing bubbles drift slowly
upward and bob in teal water lit by drifting amber light rays. Every bubble is
tuned to a note in **D-major pentatonic** (D E F♯ A B across three octaves) — so
there are no "wrong" notes, ever. Size maps to pitch: big bubbles are low and
warm, small bubbles are high and bright.

## What it answers
"What if a 4-year-old could TAP floating bubbles and each one were a real plucked
string that wobbles, sings, and blooms?"

## The mapping (input → sound + motion)
- **Tap a bubble** → it gets *plucked*: a real Karplus-Strong string tone rings at
  the bubble's note, the bubble does a soft-body **wobble/jiggle** (squash-and-
  stretch around the rim) and a **glow bloom**, then settles. Bigger bubbles =
  lower, longer, slightly louder notes.
- **Drag across several bubbles** → a **glissando harp-strum**: each newly entered
  bubble plucks in turn. Sweep your finger to arpeggiate. (A bubble won't re-pluck
  while your finger lingers on it.)
- **Bubbles drift, bob, and gently collide** — light soft-body physics nudges them
  apart and squashes them on contact (they never pop). A rare, very soft
  sympathetic shimmer can trigger when two bubbles kiss.
- **Always-on soft drone pad + water ambience** — two detuned low sines (root + 5th,
  an octave down) plus a slowly-swept band-passed noise "water" bed, so it is
  **never silent**.
- Bubbles that drift off the top **respawn at the bottom** (and re-tune to a fresh
  note) for infinite calm play.

## Karplus-Strong (the real thing)
Reference: **Karplus & Strong, "Digital Synthesis of Plucked-String and Drum
Timbres," Computer Music Journal 7(2), 1983** — the classic delay-line string
pluck.

How it's implemented here: each pluck runs a genuine **delay line with a low-pass
filter in the feedback path**, excited by a short noise burst — not an oscillator
with an envelope.

- **Primary path — AudioWorklet** (`karplus-proc`, source embedded in the page and
  loaded synchronously in the Start tap via a Blob URL so the worklet file lives in
  this folder, not `public/`). The processor holds 24 round-robin `KarplusVoice`s.
  Each voice:
  - sizes its delay line to `round(sampleRate / freq)` samples (this sets the pitch),
  - fills it with a **softly low-pass-smoothed noise burst** (the pluck excitation —
    soft attack keeps it kids-safe),
  - and each sample reads the line, applies a **2-point averaging low-pass blend**
    (`damp`) times a **loop gain < 1** (`decay`), and writes it back. That averaging
    feedback is exactly the Karplus-Strong filter; the loop gain gives the string
    its natural decay. Low/big bubbles use a mellower damp and longer decay (warm,
    longer); high/small bubbles are slightly brighter and shorter (kid-safe).
- **Fallback path — precomputed buffer** (`buildKarplusBuffer`): if the worklet
  fails to load, the same delay-line + averaging-filter feedback is rendered
  **offline** into an `AudioBuffer` per note and played through a `BufferSource`.
  The timbre still comes from the delay-line feedback (string-like decay), not a
  plain oscillator.

Polyphony is kept loud-safe by **√-voice normalization** in the worklet (mixing N
active voices divides by √N), plus per-note volume scaling — so a fistful of taps
never spikes.

## Kids-safe master chain
`voiceBus + pad → masterGain (0.26) → lowpass (6500 Hz) → DynamicsCompressor
(threshold −10 dB, ratio 20) → destination`. Soft excitation, no harsh transients,
no high ringing. Start button is ≥72px and gesture-gates the AudioContext + loads
the worklet synchronously inside the tap (iOS requirement). Bubble tap targets are
clamped to ≥64px effective. Every tap responds visually immediately (<50ms), audio
is pre-initialized at Start.

## Rendering & degradation chain
- **Primary: raw WebGL2** (hand-written, no three.js). One additive-blended
  full-screen quad per bubble; the fragment shader draws a glassy refractive core,
  bright rim, outer glow, and an offset iridescent highlight, and deforms the rim
  by the wobble + contact-squash uniforms. Faint oversized dim quads make the
  drifting light rays. Palette: deep teal water → amber/coral bubble glows.
- **Fallback: Canvas2D** — radial-gradient glowing circles with an ellipse
  squash-stretch wobble + bloom and a highlight; same physics, same audio, same
  light rays. Chosen automatically when `getContext("webgl2")` is null.
- **No Web Audio** → visuals stay fully alive and a `text-rose-300` notice shows;
  taps still wobble + bloom bubbles.
- **Ghost-finger auto-demo**: after ~1.8s with no input, a ghost finger drives the
  *identical* pluck pipeline — alternating single taps and short 3–4 bubble strums —
  so an unattended phone both SEES bubbles wobble + bloom and HEARS plucks within
  ~1s. Any real touch resets the idle timer and takes over.

Never a dead screen, never silent.

## Honest "not device-verified" note
This was written and self-checked (tsc/lint) but **not run on a real device or
heard through speakers/headphones**. Things a real device + ear are needed to
confirm:
- **The Karplus-Strong timbre** — that the worklet voice rings like a warm plucked
  string (not buzzy or too short/long), that the `damp`/`decay` tuning sounds good
  across the octave range, and that the soft excitation is genuinely gentle. The
  offline-buffer fallback timbre likewise needs an ear.
- **The worklet path itself** — Blob-URL `addModule` + `AudioWorkletNode`
  construction succeeding inside the Start gesture on real iOS/Android Safari/Chrome
  (the precomputed-buffer fallback covers failure, but which path actually runs on a
  given phone needs checking — the on-screen label reports it).
- **Loudness safety under mashing** — that √-voice normalization + the compressor
  actually keep a 4-year-old hammering taps comfortably quiet on real hardware.
- **Touch glissando feel** — that drag-strum across bubbles feels responsive and the
  per-bubble re-pluck lockout is tuned right for small fingers.
- WebGL2 additive blending color/brightness on real GPUs.
