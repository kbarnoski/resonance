# 16144 · spiralkeep

**The one question:** What if Karel's whole album grew ONE living membrane that
REMEMBERS — an excitable medium whose spiral waves keep scrolling across visits
and across every track, never resetting, so returning to it feels like returning
to a weather system that kept turning while you were gone?

This is a cycle-2 graduation of `16000-morphonate`. Morphonate grows a Gray-Scott
membrane his harmony seeds — but it **resets every visit and every track**.
Spiralkeep changes three things at once: a different reaction substrate (an
**excitable medium** that grows **rotating spirals**, not coral), true
**persistence**, and **per-album accumulation**.

## The excitable medium (Barkley), and how it differs from Gray-Scott

The field is two variables held in a pair of `RGBA16F` ping-pong textures and
advanced by a fragment shader (forward-Euler substeps, 9-point Laplacian of `u`):

```
du/dt = (1/eps) * u * (1-u) * (u - (v+b)/a) + Du * laplacian(u)
dv/dt = u - v
```

with `a = 0.75`, `b ≈ 0.02`, `eps ≈ 0.05`, small `Du`. `u` is a fast excitation
(voltage-like), `v` a slow recovery (refractory); **only `u` diffuses**. This is
a genuinely different pattern-forming system from morphonate's Gray-Scott:

- **Gray-Scott** (morphonate) is a two-chemical *reaction–diffusion* system —
  both species diffuse, and it self-organises into spots, stripes, mitosis and
  **coral**.
- **Barkley** (here) is an *excitable medium* — a local element rests until a
  supra-threshold kick fires it, after which it is refractory before it can fire
  again. Propagating that firing across space gives **rotating spiral waves**,
  spreading **target fronts**, and **defect turbulence**. A broken wavefront
  curls into a spiral; the seed field tiles broken-front discontinuities so
  several spiral cores spin up on birth.

## Harmony → medium mapping

Karel's real take plays start to finish (a `BufferSource` through
`createSafeMaster`). Its analysis timeline is walked against
`audioCtx.currentTime - startTime`:

- **Note onset →** a supra-threshold excitation blob: pitch-class → angle,
  register → radius, velocity → size. Enough to launch a fresh wave.
- **Chord change →** a larger stimulus at the chord root that **breaks** the
  wavefront (raises `v` on one side) so a new spiral core forms, plus a re-steer
  of the excitability: **bright / major → smaller `eps`** (tighter, faster
  spirals), **quiet / minor → larger `eps`** (slow, broad scrolls), modulated by
  spectral energy.

Because the field persists, these chord-born defects **accumulate** into a
per-album history. If a take has no analysis, injections fall back to an
`AnalyserNode` spectral-flux onset (centroid → position). **No synthesis, ever.**

## Persistence + per-album accumulation

- The `(u,v)` field is downsampled to **128×128**, packed to a `Uint8` array
  (`u→byte, v→byte`), base64-encoded, and stored under a versioned per-album key
  `dream:spiralkeep:v2:<albumName>`. On load it is decoded and uploaded back into
  the sim texture, so the medium **resumes scrolling** where it left off.
- Stored alongside the field: **age** (total accumulated grow-time in seconds)
  and a **visit count** — shown as "this medium has been turning 14m 22s across
  3 visits."
- Autosaves every ~10s and on `visibilitychange` / `beforeunload` / unmount.
  Every `localStorage` read and write is wrapped in `try/catch`; in private mode
  it degrades silently to a non-persistent session (the UI notes "memory off").
- **One medium per ALBUM** (from `COLLECTIONS`), not per track. Switching to
  another take in the **same** album does not reset — the field keeps turning and
  the new take's harmony injects into it. Switching **albums** saves the current
  medium and loads/creates that album's own. "New medium" clears the current
  album's saved state (after a confirm) and seeds a fresh broken-wavefront field.

## Palette

Committed third register: **saturated cyan-teal ink on a cool bone/porcelain
ground.** Excited wavefronts glow bright cyan; the refractory tail deepens to
teal on pale cool paper — deliberately not warm (no ember/amber/gold) and not
grayscale. UI chrome uses only Resonance semantic tokens; cyan-teal lives only in
the canvas art layer.

## What's novel here (honest scope)

Relative to `16000-morphonate` specifically: the excitable-medium substrate
(spirals instead of coral), real `localStorage` persistence of the field with age
and visit tracking, per-album accumulation across takes, and the committed
cyan-teal-on-bone palette. No "lab first" is claimed.

## References

- D. Barkley, *A model for fast computer simulation of waves in excitable media*,
  Physica D 49 (1991).
- The Belousov–Zhabotinsky reaction (the canonical chemical excitable medium /
  spiral-wave system).
- EngramNCA — *a Neural Cellular Automaton Model of Memory Transfer*,
  arXiv:2504.11855 — the "membrane that remembers" anchor.

Tags: input: autonomous(his-take+harmony) · output: WebGL2-excitable-medium(persistent,per-album) · technique: Barkley-spiral-waves-steered-by-harmony · palette: cyan-teal-on-bone
