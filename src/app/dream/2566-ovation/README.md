# 2566 · Ovation — the sound of many hands clapping

**The one question:** *What if you could conduct a crowd's applause — from one
lone, awkward clapper up to a thundering standing ovation that spontaneously
synchronizes into rhythmic unison, and back down again?*

A joke and a warm-human piece, but grounded in real physics. Applause is a
population of coupled oscillators, and it does something remarkable: when a
crowd's clapping slows, it spontaneously falls into periodic **unison** — the
rhythmic stadium clap everyone has heard. You conduct that transition and feel
it happen.

## What you do

- **Hold `Space` or `↑` / `↓`** — swell or hush the crowd (the conduct level).
- **Number keys `1`–`6`** (or `+` / `-`) — set crowd size, 1 → 8 → 60 → 400 →
  1,400 → 4,000 clappers.
- **`A`** — toggle auto-conduct, a seeded arc that runs the whole story on its
  own (lone clapper → roar → locked ovation → fade). It is on until you take
  the baton, and it is the always-on fallback if the browser lacks WebGL2 or
  Web Audio.

Watch the HUD: **coherence `r`** (the Kuramoto order parameter) climbs from 0
(chaos) toward 1 (unison) as the ovation locks.

## How it works

### The Kuramoto crowd (`sim.ts`)

Each clapper is a phase oscillator with its own natural clapping rate. The
phases are coupled to the crowd's *mean* phase (mean-field Kuramoto):

```
dθ_i/dt = ω_i + K · r · sin(ψ − θ_i)
```

where `r·e^{iψ} = (1/N) Σ e^{iθ_j}` is the complex order parameter — `r` is the
coherence, `ψ` the mean phase. An agent **claps** when its phase wraps past 2π.

As you swell to a full ovation three things happen together, mirroring what
real crowds do: the mean clapping rate **slows** (the giddy fast clap becomes a
deliberate rhythmic one), the spread of natural rates **narrows**, and the
coupling `K` **rises**. Below the critical coupling the crowd is an incoherent
hiss of claps; above it the phases lock and `r → 1`. A small position-based
phase lead makes the unison clap arrive as a **wavefront sweeping the arena**
(a visualization choice, not in the original model).

Everything is deterministic: a seeded `mulberry32` PRNG (seed `0x2566`) sets all
positions and natural rates; `performance.now()` is the only clock.

### Granular clap engine (`audio.ts`) — no pitch anywhere

There is no fundamental, no scale, no melody: applause is pure noise
transients, which is the whole point. Each clap is a 3–12 ms burst of white
noise shaped by a randomized bandpass (a subtractive highpass into a one-pole
lowpass), so every clap has its own papery character.

Thousands of claps can't each be an audio node, so an **AudioWorklet** (built
from a Blob URL, no external files) owns a pool of ~160 grains and is *driven*
by one compact message per animation frame:

- **bed** — the steady presence of the crowd, spawning a continuous Poisson-ish
  hiss of faint claps that grows into a roar;
- **pulse** — the fraction that clapped *this* frame, spawning a tight cluster;
- **r** — the coherence, which controls how a burst's grains are placed in
  time: at low `r` they **smear across the frame** (diffuse patter); at high `r`
  they **stack together** into one thunderous unison smack, with their center
  frequencies converging too. So the synchronization transition is audible in
  the grain timing itself.
- **cheer** — at peak, a low band-limited noise roar plus rare band-limited
  whistle sweeps, for the joke.

The worklet's own randomness is a seeded `mulberry32` as well. Master chain:
soft-clip → compressor → clamped gain.

### Crowd field (`gl.ts`) — raw WebGL2, no three.js

One `GL_POINT` per clapper in a stadium bowl. A per-agent `flash` attribute
(uploaded each frame) blooms bright violet→white on a clap and decays;
additive blending plus a translucent fade quad leaves soft persistence, so an
incoherent crowd twinkles at random while a locked crowd pulses as one and you
see the wavefronts travel. If WebGL2 is unavailable, a lightweight DOM crowd
meter takes over so the piece is never dead.

## Reference

- Z. Néda, E. Ravasz, T. Vicsek, Y. Brechet, A.-L. Barabási, **"The sound of
  many hands clapping,"** *Nature* **403**, 849–850 (2000) — applause
  spontaneously synchronizes into periodic unison when the clapping rate slows.
- Y. Kuramoto, *Chemical Oscillations, Waves, and Turbulence* (1984) — the
  coupled-oscillator model and the order parameter used here.
