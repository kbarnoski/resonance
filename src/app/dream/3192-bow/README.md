# 3192-bow — Bow the string

> "What if the screen taught you to BOW a string — controlling bow speed and
> pressure as a 2-D gesture, where too little force whispers, too much force
> screeches, and only the right zone sings?"

The most literal reading of *a musical decision you can get wrong*. Real bowing
is a skill because the string's physics forgives nothing. This piece models the
bowed-string stick–slip friction interaction and shows you the **playable zone**
— you keep your gesture inside it, and you hear (and see) it the instant you
fall out.

## What it is

A single surface does double duty: the **Schelleng playability diagram** *is*
the bow strip. You drag a pointer across it —

- **horizontal = bow speed** (the bow's velocity),
- **vertical = bow force / pressure** (top = feather-light, bottom = crushing).

Under it runs a real bowed-string physical model, and a live cursor sits on the
diagram wherever your gesture is. A second SVG panel draws the string itself:
the traveling **Helmholtz corner** as an animated polyline, so you watch the
string capture, ripple, or jitter.

## How to play

1. On load the piece runs a **seeded auto-bow** (visuals only — see the audio
   note): it starts too light (a thin *surface* whistle), sweeps down into the
   *singing* wedge (a clean, locked tone), then pushes too hard into *raucous*
   crunch — demonstrating all three regimes hands-free. A **● auto** badge
   shows this.
2. Press **Play the auto-demo with sound** to hear that same demo, or **Pick up
   the bow** to take control (badge flips to **live**). You can also just start
   dragging on the diagram — first pointer-down hands you the bow.
3. **Drag** on the diagram to bow. Sideways = speed, down = pressure. Keep the
   cursor in the violet wedge to sing.
4. Pick the open string with the **G3 / D4 / A4 / E5** buttons, the **← →**
   arrow keys, or number keys **1–4**. Pitch is the discrete choice; the
   expressive continuous input is the bow gesture, which is snapped to nothing.

## The mechanic

### Friction model (the sound)

A **digital-waveguide** bowed string: two fractional delay lines are the string
on either side of the bow point (their combined length sets the pitch), with a
gentle low-pass reflection loss at the bridge for string damping. At the bow
point sits a **nonlinear friction junction** (McIntyre, Woodhouse & Schumacher,
1983): every sample it forms the *relative velocity* between bow and string and
a friction curve returns a coupling coefficient — near-zero relative velocity =
**stick** (bow drags the string), large relative velocity = **slip** (bow skates
free). The stick↔slip alternation is Helmholtz motion — that alternation *is* the
tone.

Your gesture reaches the junction as two knobs:

- **bow speed → bow velocity** amplitude,
- **bow force → the slope of the friction curve** (its capture width). A large
  slope (light bow) gives a narrow capture region — the string struggles to lock,
  yielding a thin surface whistle. A small slope (heavy bow) gives a wide capture
  region — the string over-sticks and the release turns irregular, a raucous
  crunch. Between them it sings.

The timbre change is driven by the friction nonlinearity, **not** a filter sweep.
Physical friction noise (bow-hair scratch, loudest while slipping) is mixed in
proportionally.

Two force-dependent terms shape the *extremes* so all three regimes are clearly
audible (verified headless by RMS + autocorrelation on the steady tail):

- **Bridge damping falls as force rises** (loop gain `0.88 + 0.135·force`,
  capped at 1). A light bow injects little energy and cannot overcome the
  bridge loss, so the amplitude stays low — a thin surface sound; a firm bow
  overcomes it and sings. This is the minimum-bow-force effect.
- **A slip-breakdown term above `force ≈ 0.7`** adds an irregular perturbation
  to the injected velocity that grows with string energy — the multi-slipping
  that turns an over-pressed string raucous. It is exactly zero inside the
  singing band, so the clean tone stays clean. (Headless: singing autocorrelation
  ≈ 1.0, raucous ≈ 0.43 — genuinely aperiodic, not just louder.)

### Schelleng diagram (the stakes)

Schelleng (1973) showed the clean-tone region is a **wedge** in the
bow-force / bow-motion plane, bounded by a **minimum** bow-force curve (below it:
surface sound) and a **maximum** bow-force curve (above it: raucous). His
relations, at a fixed bow–bridge distance β:

- `F_min ∝ v / β²` — minimum force **rises** with bow speed;
- `F_max ∝ 1 / (β v)` — maximum force **falls** with bow speed.

So plotted against speed the wedge **narrows and eventually pinches shut** — fast
bowing is unforgiving. `schelleng.ts` renders those two curves as SVG paths and
classifies every gesture as `surface` / `singing` / `raucous`. The same
(speed, force) numbers drive both the diagram *and* the synth, so what you see
and what you hear agree.

### Visualization (SVG, deliberately not canvas/WebGL)

- The Schelleng wedge, its two boundary curves, and a live crosshair cursor,
  colored by regime (indigo surface / violet singing / red raucous).
- The string as an animated SVG polyline (~140 points): a Helmholtz "tent" whose
  corner travels back and forth, its amplitude ramping up as the string captures,
  rippling thinly in surface, and jittering in raucous. Updated every rAF from
  the bow parameters. Violet brand ramp throughout.

## Architecture / files

- `page.tsx` — `"use client"` React page, both SVGs, pointer + keyboard input,
  seeded auto-bow, controls, teardown.
- `string.ts` — the `BowedString` DSP class (waveguide + friction junction) and
  the `BowEngine` that wires it into a safe Web Audio graph.
- `worklet-source.ts` — the same DSP inlined as an AudioWorklet processor string,
  loaded from a Blob URL.
- `schelleng.ts` — the playability-envelope math and regime classification.

## Audio path & caveats

- **AudioWorklet preferred, ScriptProcessor fallback.** The engine first loads
  the sample-rate friction loop as an **AudioWorklet** from a `Blob` URL (no
  `public/` file needed under the dream-folder scope). If `addModule` fails on a
  given browser it falls back to a **`ScriptProcessorNode`** running the
  identical TypeScript model. The status line tells you which is live.
- **Gated behind a gesture.** The `AudioContext` is only created/resumed inside
  a button or first pointer-down — so the on-load auto-bow shows **visuals only**
  until you click. That's browser autoplay policy, not a bug; press a button to
  add sound.
- **Safe by construction.** Master gain is held at 0.12 (≤ 0.15) feeding a
  `DynamicsCompressor` limiter; injected bow velocity and delay-line contents are
  clamped, with a DC blocker — a raucous bow cannot blast or blow up.
- **Clean teardown.** rAF is cancelled, the worklet/ScriptProcessor and graph are
  disconnected, the Blob URL is revoked, the `AudioContext` is closed, and
  listeners are removed on unmount.
- **Degrades gracefully.** Touch and mouse both drive the bow (pointer events);
  if audio fails the SVG still tells the whole stick–slip story with a notice.
- **Honest tuning caveat.** The friction constants (bow-table slope range, loop
  damping, capture width) are *physically shaped but tuned by eye, not ear.* The
  three regimes are correctly ordered and the model self-oscillates, but the
  exact boundary where each regime bites wants a real-ear tuning pass on real
  hardware. The animated corner's sweep rate is slowed for legibility and is not
  the audio pitch.
- **Seeding.** The auto-bow and bow-hair noise use a self-written
  `mulberry32(0x3192)` / xorshift — no `Math.random`, `Date.now`, or argless
  `new Date()`.

## References

- **McIntyre, Woodhouse & Schumacher, "On the oscillations of musical
  instruments," _JASA_ 74(5), 1983** — the friction-driven bowed-string model.
- **Schelleng, "The bowed string and the player," _JASA_ 53(1), 1973** — the
  bow-force / bow-position playability diagram (the "Schelleng diagram") whose
  wedge is rendered here.
