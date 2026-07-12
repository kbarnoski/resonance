# 1508 · Wolf Throat

**The one question:** *What if you could pick up a whole xenharmonic scale with
your VOICE — and be gloriously **wrong** in it on purpose — while watching the
consonance/dissonance landscape you're singing across ripple in real time?*

This is the direct cash-out of **`1408 · wolf-ring`**. That piece took the
historically "wrong" wolf-fifth interval and made it a *landmark you could walk
into on purpose* — the wrong note as a destination, not an error. The Wolf
Throat generalises that from one interval to a **whole playable microtonal
instrument**: a full xenharmonic scale you can be wrong inside of, played by
singing, with the wrongness rendered as terrain you fly over and — crucially —
**hear**.

---

## How it works

1. **Voice in (mic, analysis-only).** The mic feeds an `AnalyserNode` on its own
   `AudioContext`. It is **never** connected to `destination` — no feedback
   howl. Each frame we pull a 2048-sample time-domain frame and run a hand-rolled
   **YIN** fundamental-pitch tracker (`pitch.ts`): difference function →
   cumulative-mean-normalised difference → absolute-threshold pick → parabolic
   interpolation. No FFT, no npm dependency. It returns a frequency plus a
   `clarity` confidence; below a loudness gate or with no periodicity it returns
   `null` and the landscape dreams on its own.

2. **Relate the pitch to a xenharmonic tuning (`tunings.ts`).** The sung pitch is
   *folded* into one period of the current scale (an octave — or, for
   Bohlen–Pierce, a **tritave**) and placed on a log-frequency axis. Degrees are
   only **landmarks**; nothing is ever snapped. Being between them is the point.

3. **Render the sensory-dissonance landscape (`tunings.ts` + Canvas2D).** A probe
   complex tone is swept across the whole period and its **roughness** against a
   fixed reference (the drone's harmonic spectrum) is computed with the
   **Plomp–Levelt / Sethares** model. That traces a curve: **valleys =
   consonance, ridges = roughness/wrongness**. The sung pitch is a glowing cursor
   riding the terrain; the nearest degree lights up; consonant valleys bloom in
   rings, rough ridges throw jittering shards.

4. **The instrument sings back (`audio.ts`).** A warm **drone bed** (harmonic
   complex on the base D3) holds continuously — it *is* the reference the whole
   landscape is measured against. A **throat voice** (additive, organ-ish) glides
   to the pitch you're singing and beats against the drone. So the roughness on
   screen is literally the roughness in your ears: land in a valley and it locks
   in smooth; sing a wrong microtone and its partials grind. You hear the
   wrongness, you don't just see it.

---

## The four tunings

| Scale | Period | Degrees | Character |
|---|---|---|---|
| **Bohlen–Pierce** | tritave **3:1** | 13 equal | No octave at all; alien, luminous |
| **19-EDO** | octave 2:1 | 19 equal | Sweeter thirds, dense microtonal neighbours |
| **Sléndro-flavoured** | octave 2:1 | 5 near-equal | Un-tempered gamelan-ish float (no fixed standard) |
| **Just (5-limit)** | octave 2:1 | 9/8, 5/4, 4/3, 3/2, 5/3, 15/8 | Valleys sit dead-centre on the degrees |

Switching tuning re-forms the entire terrain, because the same drone spectrum
falls into consonance at different places for each scale.

## The roughness model

Two pure partials at frequencies *f₁, f₂* (amplitudes *a₁, a₂*) contribute a
dissonance

```
d = min(a₁,a₂) · ( e^(−b₁·s·Δf) − e^(−b₂·s·Δf) )
s = d* / (s₁·f_min + s₂)
```

with Sethares' constants `b₁=3.5, b₂=5.75, d*=0.24, s₁=0.0207, s₂=18.96`. The
roughness of one complex tone against another is the sum over **every pair of
partials**. Sweeping the probe gives the dissonance curve — exactly the tool
Sethares uses to explain why a given timbre wants a given scale.

## Named references

- **William Sethares**, *Tuning, Timbre, Spectrum, Scale* (2005) — the roughness
  curve and the timbre↔scale argument.
- **R. Plomp & W. J. M. Levelt**, "Tonal Consonance and Critical Bandwidth"
  (1965) — the underlying critical-band dissonance data.
- **Harry Partch**, *Genesis of a Music* (1949) — the just-intonation lattice.
- **Heinz Bohlen / Kees van Prooijen** — the 3:1 tritave scale.
- **Lineage:** `1408 · wolf-ring` — the wrong-note-as-landmark idea this extends.

## Safety & house rules

- **No strobe.** The only global brightness change is a slow luminance breathe
  driven through the shared `SafeFlicker` engine at 0.08 Hz — far below the
  photosensitive danger band, soft sine, floor 0.82.
- **`prefers-reduced-motion`** is honoured: fewer echo/bloom/shard layers, slower
  phantom, damped pulsing.
- **Audio safety:** master gain ramps from silence, peaks at ≤ 0.22, and passes
  through a `DynamicsCompressor` limiter. Voice count is small (≤ ~8 oscillators).
- **Determinism:** all randomness is a seeded `mulberry32`; time is
  `performance.now()`. No `Math.random`, no `Date.now`.
- **Graceful degrade:** no mic permission → a phantom auto-singer wanders the
  landscape, the drone still plays, and a `text-destructive` notice explains the
  sensor failure. No Web Audio → a readable notice; visuals continue.

## Honest self-assessment — what's rough / unverified

- **YIN under a live drone.** With `echoCancellation`/`noiseSuppression` on, the
  browser suppresses most of the speaker bleed, but in a loud room the detector
  can occasionally lock onto the drone instead of the voice. Headphones fix it
  entirely. The clarity gate (`> 0.55`) hides most false locks.
- **The sléndro tuning is "flavoured," not authentic.** Real sléndro varies
  gamelan to gamelan and has no fixed cents; the values here are a plausible
  near-equipentatonic, chosen for feel. Labelled as such in the UI and here.
- **Roughness = cross-partial sum only.** Intra-spectrum roughness (constant
  offset) is dropped, and amplitudes are a simple 1/k rolloff rather than a
  measured voice spectrum — so the curve is qualitatively Sethares, not a
  calibrated match to any specific timbre.
- **Register folding is octave/period-based** for cursor position, which is
  perceptually reasonable but means a very high or very low singer maps to the
  same spot as their folded pitch — intentional, but worth knowing.
- Not tuned against assistive tech; keyboard-only users can switch tunings and
  read the notes but cannot "sing."
