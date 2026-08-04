# 6216 · Drumskin

**What if the screen were a real, tuned drumhead you strike and stroke with all
ten fingers — a physical membrane whose ripples ARE the sound?**

Drumskin turns the whole viewport into a circular drumhead simulated as a
genuine 2-D wave equation. Strike it and a ripple spreads, reflects off the rim,
and interferes with every other finger's wake. The sound is tapped from that
same physics, so what you see and what you hear are one object.

## How to use it

- **Tap** anywhere on the head to strike it — a hard, percussive hit that booms
  and rings.
- **Drag / stroke** to rub the skin — a softer, moving friction excitation that
  smears energy across the membrane.
- **Play with all ten fingers.** It is genuinely multi-touch (and multi-pointer
  on desktop); simultaneous strikes beat and interfere because the physics, not
  a mixer, produces the polyphony.
- **Where you strike matters.** Centre strikes boom the low modes; rim strikes
  ring the highs. Angle around the head walks a scale, so drumming around the
  rim plays a melody — it is voiced like a tuned tongue / hang drum.
- **Tuning** selector offers three voices: *Ashiko* (warm, low, minor
  pentatonic), *Hang* (bright, major pentatonic), *Tabla* (mid, Kafi-ish).
- It **plays itself gently on load** from a seeded pattern, so it is already
  alive — rippling and singing — before you touch it. Your touch takes over on
  top. (Browser autoplay policy means audio unlocks on your first tap; the
  visuals self-play immediately regardless.)

## The physical model

The drumhead is a circular membrane discretised on a grid and integrated with
the finite-difference form of the 2-D wave equation:

```
u_next = 2·u − u_prev + c²·Δt²·∇²u − damping·(u − u_prev)
```

- `∇²u` is the 5-point Laplacian of the height field.
- The **rim is a fixed (Dirichlet) boundary** — height is pinned to zero outside
  the disc — which is what makes waves *reflect* instead of leaving.
- **Strikes and strokes** are injected as Gaussian bumps added directly into the
  height field inside the update. A tap is a single strong bump; a drag is a
  weaker bump that follows your finger every frame.
- The field is **hard-clamped** and globally damped so that many fingers piling
  energy in can never make the simulation explode.

**GPU path (primary):** the field lives in two `RGBA32F` textures that
ping-pong — R = current height, G = previous height. One fragment-shader pass
does the whole step for all 256×256 cells; a second pass colour-maps the height
(tint) and velocity (glow) into a luminous violet displacement, with raking
light from the height gradient. A tiny central read-back drives an ambient
shimmer.

**Fallback path:** if the browser can't render to float textures, the exact same
equation runs on a smaller CPU grid and is drawn to a Canvas2D image — same
physics, softer picture.

## The audio

Sampling a 2-D mesh at 44.1 kHz in JavaScript is infeasible, so Drumskin uses
the practical, reliable side of the same idea: each strike rings a bank of
**modal resonators tuned to the modal frequencies of an ideal circular
membrane** — the ratios of the zeros of the Bessel functions Jₘ
(`1, 1.593, 2.136, 2.296, …`), which is precisely the inharmonic voice of a real
drumhead. Each strike is a short additive voice (sine partials at those ratios,
per-mode exponential decay); strike **radius** shapes the modal mix exactly as
the membrane does. The bus runs through a `DynamicsCompressor` limiter with
master gain held under `0.18`.

## Named reference

Modelled after **Julius O. Smith III's digital-waveguide mesh / 2-D physical
modeling** (CCRMA, Stanford). The membrane is a real wave simulation and the
audio is derived from its modal structure — the drum's pitch is physical and
tunable — rather than being a separate synthesizer bolted on.

## Honest limitations

- **Grid resolution vs. latency.** The GPU grid is 256×256 (108×108 on the CPU
  fallback). That is enough for convincing ripples and interference, but it is
  coarser than a true audio-rate mesh — fine detail and the very highest partials
  are approximated by the modal bank rather than read from the mesh itself.
- **Audio is modal, not mesh-tapped.** For reliability the sound comes from
  Bessel-tuned resonators driven by strike position/strength, not from sampling
  the visual field at audio rate. The coupling (where/how hard → timbre and
  pitch) is faithful, but it is a physically-informed model, not a literal tap.
- **Autoplay policy.** Sound cannot start before the first user gesture; the
  visual membrane self-plays from load, and audio joins on first touch.
- **Read-back stall.** The ambient-shimmer envelope uses a 4×4 GPU read-back per
  frame, a small synchronous cost; it is intentionally tiny.

## Files

- `page.tsx` — the client component: canvases, multi-pointer input, render loop,
  chrome, tuning selector, design-notes modal.
- `waveGPU.ts` — WebGL2 finite-difference membrane + luminous renderer.
- `waveCPU.ts` — Canvas2D fallback solver (same equation, smaller grid).
- `audio.ts` — Bessel-tuned modal resonator drum (`ModalDrum`, tunings).
- `selfplay.ts` — seeded self-playing strike scheduler.
- `prng.ts` — mulberry32 deterministic RNG.
