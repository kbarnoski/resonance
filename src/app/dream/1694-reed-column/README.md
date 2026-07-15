# 1694 · Reed Column

## The one question

**What if you could blow into your laptop mic and it became a real clarinet — a
self-oscillating single-reed woodwind physical model where your actual breath is
the exciter?**

This is the **BLOW** member of the lab's physical-model instrument triad:

- **pluck** — a struck/plucked string
- **bow** — `1692-friction-loom` (stick-slip bowed string)
- **blow** — *this* (single-reed / clarinet)

## What it actually is

A genuine **1-D digital waveguide** wind instrument running per-sample in an
`AudioWorklet` (loaded from a Blob URL — no network fetch). Not a sample, not an
oscillator bank: a real self-oscillating physical model.

### The bore (cylinder ⇒ odd harmonics ⇒ twelfth)

The bore is a single delay line. A clarinet bore is **cylindrical** and closed at
the reed / open at the bell, so its round trip is terminated by:

- **Bell (open) end:** a **sign-inverting, lossy reflection** — a one-pole
  lowpass loss filter with reflection coefficient `< 1`. The sign inversion +
  closed-reed boundary is exactly what makes a cylinder support **odd harmonics**
  (`f, 3f, 5f …`), giving the hollow clarinet timbre.
- **Mouthpiece end:** the **reed reflection** (below).

Because the resonator favours odd harmonics, the instrument **overblows to the
3rd harmonic — a twelfth, not an octave.** That is the signature clarinet
behaviour, and it is made audible here.

### The reed nonlinearity (the heart)

Each sample we form the pressure difference across the reed and look it up in a
nonlinear **reed table** (McIntyre–Schumacher–Woodhouse / Julius O. Smith / STK
form):

```
pBore = -reflCoef * lowpass(boreOut)     // reflected bore pressure at the reed
Δp    = pBore - pMouth                    // pressure difference across the reed
r     = clamp(offset + slope·Δp, -1, 1)   // reed table (reed closes as p rises)
inject = pMouth + Δp · r                   // pressure re-entering the bore
```

With `offset ≈ 0.7`, `slope ≈ -0.44`, `reflCoef ≈ 0.95`. As blowing pressure
rises the reed **closes** (`r` falls); this **pressure-controlled nonlinearity**
is what turns steady breath into a self-sustaining limit cycle. The **pitch comes
from the bore delay length**, not from the breath — the breath only supplies
energy. Below a pressure **threshold the column is silent** (no drone); above it
it speaks; harder breath overblows.

### Overblow / register vent

A real clarinet reaches the twelfth because the **register key opens a small vent
that forces a pressure node and promotes the 3rd mode.** We model that vent with
**hysteresis** on the smoothed blowing pressure: blow past the overblow threshold
(`> 0.72`) and the loop **retunes to 1/3 its length** (glided, so it swoops
rather than clicks), sounding the 3rd harmonic; it releases below `0.5`. The
reed's own breath is held inside its speaking window so hard blowing *overblows*
instead of just choking the reed shut.

Numerically verified: base `≈ 202 Hz`, overblown `≈ 604 Hz` — a ratio of `2.99`,
i.e. a true twelfth.

### Bounded by construction

Bell loss `< 1` removes energy each round trip, the reed table output is clamped
to `[-1, 1]`, the injected pressure is clamped, and the summed output is
`tanh`-saturated. The master chain is `worklet → lowpass → DynamicsCompressor →
Gain(0.12) → destination`, so the model cannot blow up.

## Controller (non-keyboard)

- **PRIMARY — mic breath.** `getUserMedia({audio})` → an `AnalyserNode` → a
  per-frame RMS breath envelope → smoothed → that **is** the blowing pressure
  `pMouth`. The mic connects **only to the analyser, never to `destination`**, so
  there is no feedback howl.
- **SECONDARY — pointer-x** over the canvas slides the effective bore length,
  quantized to a clarinet-ish scale (D minor pentatonic across the chalumeau).

No computer-keyboard note input.

## Deterministic ghost self-demo

On mount — before/without any mic — a **ghost breath** built from a **frame
counter** (`Math.sin` of the counter, never `Math.random` / `Date.now` /
`new Date` / `performance.now` in the audio path) plays a tongued phrase: each
note swells through the reed threshold and some notes push past the overblow
threshold to sound the twelfth, over a scripted bore-length sweep. So the page is
never blank or silent, even headless. A live blow takes over; a fixed idle
timeout (~4 s of no breath and no pointer) returns to the ghost. **Mic-denied** is
handled with an on-brand `text-destructive` notice while the ghost keeps playing.

## Visual (Canvas2D only)

- The **live standing pressure wave in the bore** — antinode at the reed, node at
  the bell; the number of nodes triples visibly when it overblows. The real bore
  buffer snapshot from the worklet is overlaid faintly for authenticity.
- A **breath-pressure meter** with the *speak* (onset) and *blow* (overblow)
  thresholds marked.
- A readout of the **sounding pitch**, the **register** (Chalumeau ·
  fundamental / Clarion · 3rd harmonic — 12th), and a live/ghost badge.

Warm amber-reed & wood palette **inside the canvas only**; UI chrome uses the
semantic house tokens (violet is the only accent).

## Honest known limits

- The **register vent is an approximation.** A true clarinet overblows because
  the vent forces a pressure node in the standing wave; here we approximate that
  by retuning the loop to the 3rd harmonic (with hysteresis) once blowing
  pressure crosses a threshold. The *result* — the audible twelfth jump — is
  faithful, but it does not emerge purely from the bore acoustics; it is switched.
- The bore delay is **integer-length** (no fractional/allpass interpolation), so
  tuning is quantized to the sample grid and both registers sit ~1% sharp of
  equal temperament (consistent across registers, so intervals stay correct). A
  production model would add a fractional-delay allpass and a tonehole lattice.
- **No toneholes / cross-fingerings, no breath noise or vibrato model,** no bell
  radiation model beyond the one-pole loss. A single cylindrical bore only.
- The reed table is the simple **clamped-linear STK form**, not a full
  collision/beating-reed model, so extreme over-pressure "squeaks" and multiphonics
  are not reproduced.
- Mic mapping (RMS → pressure, floor `0.012`, gain `7`) is tuned for a typical
  laptop mic; very quiet or very hot mics may need to blow softer/harder.

## References

- M. E. McIntyre, R. T. Schumacher & J. Woodhouse, "On the oscillations of
  musical instruments," *JASA* 74(5), 1983.
- Perry R. Cook, **STK** (Synthesis ToolKit) `Clarinet` model.
- Julius O. Smith III, *Physical Audio Signal Processing* / digital waveguide
  theory (CCRMA).
- J. O. Smith, V. Välimäki & J. Reiss, "Four Decades of Digital Waveguides,"
  arXiv:2604.12878, 2026.
