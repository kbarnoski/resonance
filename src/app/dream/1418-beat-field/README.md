# 1418 · Beat Field

**What if the music were composed in the BEATING itself?**

A stack of four detuned oscillator voices whose acoustic *roughness / beating* is
sculpted along one continuous axis:

> pure **lock** (silence-of-beating, dark calm) → ~1–3 Hz **slow shimmer** →
> **AM tremolo** → **dense roughness** (the howl)

Dissonance/beating is the **played expressive medium**, not a value to minimize
and not something merely visualized. You push *into* the roughness and *release*
back to the lock — that gesture is the dynamics. This is neither a temperament
picker nor a dissonance readout; it is a continuous field you sculpt in real time.

## How to play

- **Begin** (button) starts audio — browsers block autoplay, so sound only begins
  on this tap.
- **Drag anywhere** on the canvas: horizontal = beat rate `bt` (left = lock,
  right = howl); vertical = drive/brightness (up = louder/brighter).
- **Keys `1`–`5`** pick a chord preset (Unison lock, Octave, Just fifth,
  Major triad, Cluster).
- **`↑` / `↓`** move the root pitch by a semitone.
- **`← / →`** nudge `bt` down / up.
- **Idle ~5 s** and the field auto-sweeps the whole arc (lock → howl → lock) so a
  cold glance is always alive.

A live **tier badge** (top-left) shows the render substrate in use:
`WebGPU` (emerald) / `WebGL2` (sky) / `Canvas` (amber).

## The field kernel (single source of truth — `field.ts`)

Plomp–Levelt / Sethares sensory roughness between two partials of frequencies
`f1,f2` and amplitudes `a1,a2`:

```
s  = 0.24 / (0.021 * Math.min(f1, f2) + 19)
df = Math.abs(f1 - f2)
r  = a1 * a2 * (Math.exp(-3.5 * s * df) - Math.exp(-5.75 * s * df))
```

The instrument is **4 voices × 6 partials**. A single scalar `bt` (Hz, 0.25 → 42,
log-mapped from pointer x) splits each voice's partials: partial `h` of a voice at
fundamental `f` sits at `h*f ± h*bt/2` (the sign alternates per voice). Because the
split scales with `h`, the **upper partials roughen first** as `bt` grows.

Total roughness = sum of pairwise `r` across all partials → drives loudness, glow,
and the drone/reverb. The strongest cross-voice pairs become glow **blobs**, placed
by *(which voice-pair → y, mean frequency → x)*, so the picture literally shows
where the roughness lives. `field.ts` is imported by every render tier and the
audio engine; the WGSL/GLSL shaders mirror the same Gaussian-splat sum.

## Render strategy

1. **`gpu.ts` — raw WebGPU compute (primary).** A WGSL compute shader over a
   256×256 grid splats the blobs into an `rgba16float` storage texture; a render
   pass blits it with a cosmic→howl palette + additive glow. Throws a typed
   `WebGPUUnsupportedError` on any failure; the canvas context is bound **last** so
   a failure leaves the canvas clean for the fallback.
2. **`gl.ts` — WebGL2 fragment fallback.** Same field in a full-screen fragment
   shader (blobs as a uniform array).
3. **`canvas2d.ts` — Canvas2D coarse grid.** 72×40 cells evaluating
   `sampleFieldAt()` directly; renders on anything.

## Audio (`audio.ts`, independent of the render tier)

24 `OscillatorNode`s (4 × 6) tuned straight to the split partials — the beating is
the *real* acoustic interference between them, no LFO faked on top. Per-partial
gain ~1/h, gesture-gated `AudioContext`, master gain ramping 0 → ≤ 0.20 over ~2 s
behind a `DynamicsCompressor` limiter, over a low `startDroneBank` bed and a
`createVoidReverb` tail. Sound works even if every GPU tier fails.

## Safety

No strobe. Every *visual* pulsation is clamped to ≤ 2.8 Hz (`VISUAL_MAX_HZ`) even
when the *audio* beat is fast; the idle sweep moves over tens of seconds.
`prefers-reduced-motion` slows the sweep and softens contrast. The screen never
goes black — a dark-violet nebula floor is always present.

## Honest limitations

- Only the WebGPU-compute tier has been exercised in *code*; a real browser pass is
  needed to confirm the WGSL pipeline compiles across Chrome/Safari and that the
  three tiers look consistent. The fallbacks are implemented but not yet visually
  spot-checked side by side.
- The blob-splat visual is a legible *representation* of the roughness field, not a
  physically exact spectral interference image; the numeric kernel is exact but the
  screen placement (voice-pair → y, frequency → x) is an interpretive mapping.
- The idle auto-sweep and the pointer/keys share one `bt`, so touching a control
  during a sweep snaps control back to you (by design) but can look abrupt.

## Constants worth a browser-tuning pass

- `ROUGHNESS_GAIN` (`field.ts`, 5.0) — total-roughness → intensity; raise if the
  howl looks dim, lower if the lock already glows.
- `RADIUS_GAIN` (`field.ts`, 6.0) — per-blob size vs. roughness.
- `MASTER_PEAK` (`audio.ts`, 0.20) and the drone/reverb mix — overall loudness feel.
- `VISUAL_MAX_HZ` (`field.ts`, 2.8) — visual pulsation ceiling (keep well under the
  photosensitive band).
- Idle sweep `period` (`page.tsx`, 26 s / 48 s reduced) and the palette breakpoints
  in the shaders.

## References

- R. Plomp & W. J. M. Levelt (1965), "Tonal Consonance and Critical Bandwidth,"
  *J. Acoust. Soc. Am.* 38, 548–560.
- William A. Sethares, *Tuning, Timbre, Spectrum, Scale* (2nd ed., Springer 2005).
- **XenRoll v0.4.3** (June 2026) — xenharmonic piano-roll; its "beating" dissonance
  submodel motivated treating beat rate as the played axis.
