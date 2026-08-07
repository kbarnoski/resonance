# 7912 · entrain-moire — "Pulse before sound"

**Question answered:** _Can you make "two coupled oscillators locking" something two
people literally feel and complete together — where the reward exists only in the
lock, not in either player alone?_

## Concept

A two-device duet that completes only through **entrainment**. Two people in two
browser tabs (same origin) each drive one Kuramoto-style oscillator — a phase θ and
a rate ω. Neither can make the whole sound alone. When the two phases phase-lock, a
third emergent layer (a just-intonation chord) blooms that neither can summon alone,
and it dissolves as they drift apart.

## Entrainment / Kuramoto mechanic

- Each player is an oscillator `{θ, ω, k}`. Coupling follows the two-oscillator
  Kuramoto form: `dθ/dt = ω + K·sin(θ_other − θ_self)`.
- **Reaching** (holding the pointer) raises the coupling `K`, so your phase and your
  spatial frequency `k` bend toward your partner's — pulling the pair toward lock.
- Order parameter `R = |cos(Δφ/2)| = |(e^{iθ_self}+e^{iθ_partner})/2|`. Combined with a
  spatial-frequency match, high `R` = lock: the field snaps sharp, a bloom brightens,
  and the chord fades in. Drift → `R` falls → everything dissolves.

## WebGPU wave-interference approach

The field is **not** a particle/field-sim. Each player is one **wave source** on a
full-screen moiré surface. A WebGPU render pipeline (fullscreen triangle-strip +
fragment shader) computes the live superposition every frame:

```
field = sin(kA·d1 − θ_self) + sin(kB·d2 − θ_partner)
```

mapped to brightness on the violet ramp. Two independent phases make the moiré
**crawl and shimmer** (the visual beat). As the oscillators entrain (phases + spatial
frequencies converge) the crawl **freezes into a crisp standing pattern** — the
visual signature of lock — literally showing coupled-oscillator locking as wave
physics.

### Fallback chain (mandatory — reviewed on a phone)

1. **WebGPU** render pipeline (preferred).
2. If `navigator.gpu` is missing or adapter/device request fails → **WebGL2**
   fragment shader running the identical interference math.
3. If WebGL2 also fails → an **animated CSS moiré**: two overlapping
   `repeating-linear-gradient` layers (`mix-blend-screen`) whose offsets/angles beat
   and then freeze at lock. (Never Canvas2D.)

A small on-brand notice ("WebGPU unavailable — showing lightweight interference")
appears in the non-WebGPU paths. The audio + entrainment logic run identically in all
three.

## Audio (Web Audio, synthesized locally)

- Two sine sources, each amplitude-modulated by its own phase → a **pulsing tone**
  ("pulse before sound").
- Source B is detuned by `(1 − R)·6.5 Hz`: you **hear the beat**, and it → 0 (unison)
  as they lock.
- At strong lock a **just-intonation triad** (root · 5/4 · 3/2) fades in — the emergent
  third neither makes alone. Master ≈ 0.12, click-free `setTargetAtTime` ramps, full
  teardown on unmount. Audio starts on first gesture.

## Transport (control-state only)

Same-origin `BroadcastChannel("entrain-7912")` broadcasts this tab's source state
(peer id, position, θ, ω, spatial freq `k`, reach) at ~20 Hz; the partner is rendered
from their messages. Peer id via `crypto.randomUUID()`. No server / API route. If no
message arrives for 1.5 s the partner is considered gone and the ghost resumes. "Pulse
before sound": we send control/pulse, never audio — each tab synthesizes locally.

## Solo self-demo

With no partner, a deterministic seeded ghost (`mulberry32(0x7912)`, inline — no
`Math.random`) drifts in from a seeded edge, its rate converges toward lock (moiré
freezes, beat → 0, chord blooms), holds, then drifts out and de-locks — the full
find → reach → lock → bloom → drift arc in ~10.5 s, looping via `performance.now()`.
One tab, no input, silent → the whole concept reads. A real partner yields the ghost.

## Safety

Temporal frequencies are kept low (carrier ≈ 0.14 Hz, beat well under 1 Hz), so the
interference is a slow shimmer, never a strobe; no full-screen luminance flicker.
`prefers-reduced-motion` slows the simulation further (×0.45).

## Design-notes text (in-app)

> Each player is a Kuramoto-style oscillator: a phase θ and a rate ω. Each is one wave
> source on a full-screen moiré surface, and the fragment shader sums their live
> superposition, sin(kA·d₁ − θself) + sin(kB·d₂ − θpartner). Two independent phases make
> the interference crawl and shimmer — the beating you also hear.
>
> Holding "reaches" — it turns up the coupling so your phase and spatial frequency bend
> toward your partner's. When the order parameter R = |cos(Δφ/2)| climbs and the
> frequencies match, the crawl freezes into a crisp standing pattern and a
> just-intonation triad blooms: the emergent third neither of you can summon alone.
> Drift apart and it dissolves.
>
> Rendered with a WebGPU render pipeline; it falls back to a WebGL2 fragment shader,
> then to an animated CSS moiré, so the same physics survives on a phone. Transport is
> control-state only over BroadcastChannel — "pulse before sound": we send phase and
> rate, never audio, and each tab synthesizes locally. With no partner a seeded ghost
> performs the full find → reach → lock → bloom → drift arc.

## Named references

- **"Pulse Before Sound"** telematic-music model — JoNMA 2026 (telematic music sends
  control/pulse, not audio; synthesize locally).
- **Kuramoto joint-music model** — coupled-oscillator model of joint musical timing,
  where partners phase-lock through mutual perception.

## Files

- `page.tsx` — the whole prototype (client component).
- `README.md` — this document.
