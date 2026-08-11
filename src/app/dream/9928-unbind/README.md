# 9928 · Unbind

`state: dissociative-void · pole: cosmic-ambient`

## The question

What if a piece deliberately **un-binds the two streams the brain fuses** — letting the
sound drift out of lock with the visual motion — to induce the calm, weightless
**derealization of the dissociative void**? And what does it feel like when you press a
button and they snap back into lock?

Perceptual binding is the everyday miracle that stitches a seen flash and a heard swell
into one event. This piece gently pulls that stitch loose, holds you in the resulting
detachment, and then — on demand — sews it back.

## How it works

### 1. The raymarched void (`void-gl.ts`)

A WebGL1 fragment shader raymarches a **sparse** signed-distance field: pale-jade rings
domain-repeated along `z`, thin cold-silver pillars on a wide lattice, and distant
teal-white points. Glow is accumulated **volumetrically** along each ray (step-weighted
inverse-distance) rather than as hard surface hits, so the structures read as faint light
in vast blackness. A slow wandering camera (`sin/cos` of time) recedes forever forward in
`+z`, so structures approach and pass — thin sensory density, stretched/slow time, the
architectural void rather than ornate fractal. No WebGL → an on-brand notice; the audio
still plays.

### 2. The desync engine (the concept)

One clock drives **one swell envelope** (`pulseEnv`, a sharp-onset bump every ~7.3 s). The
**visual** bloom samples that envelope at time `t`. The **audio** bloom samples the *same
shape* at `t + offset`. The two subsystems are therefore driven by identical intent but
sampled at **different times** — the audio never quite accompanies the visual pulse it
"should", and the brain cannot bind streams that do not co-occur. The felt result is
derealization / detachment.

### The wandering-offset mapping

- `offset(t) = OFFSET_MAX · sin(2π t / OFFSET_PERIOD)` with `OFFSET_MAX = 0.5 s`,
  `OFFSET_PERIOD = 26 s`. The offset itself drifts sinusoidally, so the desync breathes
  between roughly −500 ms … +500 ms and is never static.
- A `bindMul` in `[0,1]` scales the offset: `effectiveOffset = offset(t) · bindMul`.
  `1` = fully unbound, `0` = locked.
- The current value is shown subtly, bottom-right: `bind: −340 ms · unbound`.

### The Re-bind contrast

The **Re-bind** button snaps `bindMul` toward `0` (fast, ~0.3 s), collapsing the offset to
zero so the audio and visual blooms coincide — one embodied event, `bind: 0 ms · locked`,
with a subtle cold brightness lift as confirmation. The lock is held ~3 s, then `bindMul`
drifts slowly back toward `1` (~10 s), and the void quietly returns. The **contrast
between bound and unbound is the piece.**

### Audio (`audio.ts`) — never silent

- An **inharmonic / spectral** drone (`droneBank`) tuned to irrational ratios
  `[1, √2, √5, √7, 3]` — deliberately **not pentatonic, not just-intonation** — sits under
  everything forever, so the piece is never silent once started.
- A "void swell" voice (inharmonic partials `[1, 2.094, 3.416]`) blooms in and out with the
  time-shifted envelope handed in each frame. It routes, with the drone, through a long
  `createVoidReverb` convolution tail (6.5 s) for vastness, then the `createSafeMaster`
  ear-safety bus (`gain: 0.18`).

Audio attaches on the first user gesture (**Start**); the void raymarches from mount via a
seeded auto-drift (`mulberry32`, no `Math.random`/`Date.now` at module scope).

## Palette

Dark-void-luminous but **cold**: pale-jade rings, cold-silver pillars, teal-white points on
a near-black blue-green ground. No cosmic indigo/violet as the art hue, no warm amber/gold,
no clinical high-key monochrome. (The UI chrome uses the app's semantic tokens, which is
where the only accent hue lives.)

## Safety

Slow luminance drift only. The swell period is ~7.3 s and the offset period ~26 s — nothing
approaches the photosensitive danger band; there is never a full-frame flash faster than
3 Hz. `prefers-reduced-motion` halves the already-slow drift.

## References

- **van Lommel** (*Consciousness Beyond Life*, 2010) and **Greyson** (*After*, 2021) —
  the phenomenology of the NDE **void**: weightless, timeless, luminous, detached-yet-calm.
- **Sensory-conflict theory of derealization** — depersonalization/derealization arises
  when the brain's multisensory predictions fail to bind incoming streams; deliberately
  decoupling audio timing from visual motion is a gentle, reversible enactment of that
  failure.
- **arXiv:2608.07486** — Porcino, Rodrigues, Bernardini, Trevisan, Clua, *"A Symbolic
  Machine Learning Approach for Cybersickness Potential-Cause Estimation"* (2026). This
  piece is the **therapeutic inverse of cybersickness**: cybersickness is the pathological
  result of sensory conflict (visual motion the vestibular system does not confirm); here
  we do the opposite on purpose — a *safe, slow, opt-out* audio↔visual decoupling to evoke
  the phenomenology of the dissociative void, never nauseating, always calm.
- **VISIONARY design note** — "decouple the audio envelope from visual motion": the audio
  swell and the visual swell share one envelope sampled at two times; the drift between
  them is the whole instrument.

## Files

- `page.tsx` — React shell, the single clock, the shared envelope, the wandering-offset
  desync engine, Re-bind, the offset readout, graceful degradation.
- `void-gl.ts` — the WebGL raymarched sparse void.
- `audio.ts` — the never-silent inharmonic drone + reverb-drenched void swell.
