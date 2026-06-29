# 1043 — Dreamachine

`state: jhāna / hypnagogia · pole: cosmic-ambient`

## The one question

> What if Resonance could move your **own** visual cortex into hallucinated
> geometry — spirals, tunnels, cobwebs, honeycombs — with no drug, just safe
> rhythmic light + a uniform field + drone, the way Brion Gysin's *Dreamachine*
> (1959) and modern *Ganzflicker* do?

## What it does

The screen does **not** draw the hallucination. That's the whole point. It
supplies the two ingredients the visual cortex needs to manufacture imagery on
its own:

1. a **uniform, unstructured, soft field** (a *Ganzfeld*) — full-viewport warm
   color with imperceptibly slow noise-driven color drift, a soft radial
   vignette, and faint blue-noise "visual snow";
2. a gentle whole-field **luminance pulse** (a *Ganzflicker* stimulus) — soft,
   low-contrast, sine-shaped, and **hard-capped at ≤ 3 Hz**.

You dim your lights, soft-focus the center, relax — and your own brain turns the
neural noise into form constants. A phase-locked drone deepens the entrainment.
It should feel slow, weightless, luminous, meditative — boundless, not intense.

## Safe-flicker design and the exact safety measures (the headline)

Flicker in the 3–30 Hz band can trigger seizures in photosensitive people, with
the highest risk around 15–20 Hz. The single most important deliverable here is
the **safe-photic-pulse engine** (`flicker.ts`), and the safety is enforced in
code:

- **Warning + explicit opt-in gate first.** No flicker runs until the viewer
  reads a photosensitive-epilepsy warning (shown in amber, clearly visible) and
  presses *"I understand — begin the field."* The warning advises anyone with a
  history of photosensitive epilepsy or seizures not to proceed and notes they
  can stop instantly.
- **3 Hz hard cap, enforced at one gate.** `clampRate()` in `flicker.ts` is the
  single function every requested rate passes through; it clamps to
  `MIN_HZ..MAX_HZ` (0.5–3.0 Hz). The UI slider's `max` is read from `MAX_HZ`, so
  the user literally cannot reach the danger band.
- **Gentlest default = no flicker.** The default mode is `drift`: a ~0.18 Hz
  luminance sine (cosmic-slow), with the pulse slider disabled.
- **Soft sine, low contrast — never a strobe.** Modulation is a continuous sine,
  not a square wave, and depth is capped at `MAX_DEPTH = 0.45`, so the field
  eases between ~55% and 100% brightness. It never flashes full black↔white.
- **Always-visible instant STOP.** The *Stop* button eases depth to 0 (a calm,
  steady field) and hushes the drone immediately; *Resume* brings it back.
- **One shared clock.** The engine clocks off the `AudioContext` sample clock
  when audio is available (drift-free) and falls back to `performance.now()`
  otherwise, with continuous phase integration so rate/mode changes never cause a
  phase jump.

## The science (phenomenology only — no medical claims)

- **Klüver form constants** — flicker on a uniform field reliably evokes four
  universal patterns: lattices/honeycombs, cobwebs, tunnels/funnels, spirals.
  They are a property of the visual cortex.
- **Ganzfeld** — a uniform, unstructured visual field; the brain amplifies its
  own neural noise into imagery. **Ganzflicker** — that field pulsed in the
  alpha band (8–12 Hz). *(We deliberately stay far below alpha for safety; the
  ≤3 Hz pulse still entrains and is far from the seizure-risk band.)*

## Audio design (`audio.ts`)

A meditative, cosmic-ambient drone — no harsh tones:

- detuned sustained oscillator layers (sine partials at root, fifth, octave, a
  faint filtered saw, and a twelfth) with slow per-voice detune LFOs for gentle
  beating;
- a low-pass filter that **breathes** open/closed at ~0.092 Hz (≈ 5.5/min, a calm
  breath pace);
- a simple feedback-delay "void" tail for depth (no external impulse response);
- a master amplitude **phase-locked to the light pulse** — the page hands the
  audio engine the exact same per-frame luminance level the shader uses, so light
  and sound rise and fall together.

## The ~5.5-minute arc (`arc.ts`)

One non-looping timeline drives field brightness, pulse depth, pulse rate, drone
swell, and the form-constant hint opacity, so minute 5 ≠ minute 1:

- **Onset** — still, faint field, no pulse.
- **Come-up** — drift begins, pulse depth fades in, drone warms.
- **Plateau** — gentle alpha-paced (≤3 Hz) pulse + drone swell; the deepest
  stretch.
- **Return** — pulse slows and fades, settling into a calm steady field.

All transitions are smoothstep-eased — never abrupt.

## Subsystems

1. **Ganzfeld field renderer** — WebGL2 fragment shader (`shader.ts`): uniform
   warm field, slow value-noise color drift, soft vignette, blue-noise grain,
   plus an optional very-faint breathing form-constant scaffold.
2. **Safe-photic-pulse engine** (`flicker.ts`) — the gated ≤3 Hz soft-sine
   modulator with `drift` / `pulse` modes, clocked off the shared audio clock.
3. **Generative drone bank** (`audio.ts`) — detuned layers, breathing low-pass,
   feedback "void" tail, amplitude phase-locked to the light.
4. **Form-constant hint overlay** — subtle concentric-ring / spoke / hex scaffold
   in the shader at low alpha; the brain does most of the work.

## References

- Brion Gysin & Ian Sommerville, *Dreamachine* (1959) — stroboscopic light on
  closed/soft eyes.
- Collective Act, *Dreamachine* (London, 2022).
- *Ganzflicker* / the 2026 Oxford *Neuroscience of Consciousness* study on
  flicker-evoked imagery.
- Heinrich Klüver — the four form constants.
- Bressloff & Cowan — geometric visual hallucinations as cortical pattern
  formation (the retina→V1 complex-log map).
- W. Grey Walter — early flicker / EEG entrainment work.

## Degrade-gracefully

- No WebGL2 → a clear notice (and the flicker engine / drone are unaffected, but
  there is nothing to render).
- No audio → the visual field and safe pulse continue self-clocked; a notice
  explains the drone is unavailable.

## Next-cycle deepening

- Optional breath input via `_shared/use-mic-analyser` to pace the pulse to the
  viewer's own breathing instead of the clock.
- Eyes-closed companion mode tuned for the warmer red glow seen through eyelids.
- A second, even softer "afterimage" pass so trails linger gently.
- Per-viewer rate-finding: a guided sweep within the safe band to locate the
  individual's most form-constant-rich frequency.
- Save/restore the arc position so a session can resume where it left off.
