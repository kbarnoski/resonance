# 20160-timesring — Times Ring

**Status**: demoable — Canvas2D string-art ring, pointer-first with one-hand camera enhancement, sounding Karel's real catalog through a resonant-partial bank on the safeMaster bus.

## The question

What if conducting your own recording sculpted a living string-art figure — and the exact number of petals you *see* is the harmonic color you *hear*?

Times Ring is the lab's first modular-multiplication string-art piece. Place **N pegs** evenly on a circle and draw a chord from peg `i` to peg `round(k·i) mod N` for every `i`. As the multiplier **k** varies, the envelope of all those chords morphs: `k≈2` traces a cardioid (1 cusp), `k≈3` a nephroid (2 cusps), `k≈4` three cusps, and so on — the cusp count you see is `round(k) − 1`. This is the classic "times tables on a circle" construction.

## The single-scalar see==hear coupling

The whole piece turns on **one scalar `k`**, and it voices both sides so the integer you see is the integer you hear. On screen, `k` is the modular multiplier that draws the figure. In your ears, `round(k)` is the number of **active resonant partials** in a parallel bandpass bank tuned to the 1st..round(k) harmonics of the current chord's root — applied to Karel's real recording, never a synth. Two active partials when you see one cusp; nine when you see eight. The coupling is kept airtight by making the bank the *only* thing that voices the count: there is no interval tap to blur it, and a live mono readout (`k 3 · 2 cusps · 3 partials · N 180`) states the integers on screen.

`k` is a base driven by **his music** plus the **conductor's continuous offset**. The base comes from `loadTrackAnalysis`: the current chord's root is walked around the circle of fifths (so neighbouring keys give neighbouring figures) and a minor quality darkens it toward fewer petals. When the analysis is absent, a spectral read of the tamed master signal drives the base instead, so the piece still sings. His harmony sculpts the base figure; the conductor bends it live.

## Conducting, pointer-first

The conductor is **pointer-first** by design — the lab has a verification-debt problem, so the piece is fully experienceable and self-verifiable with no webcam at all. The pointer (drag X → k offset, Y → peg count, press-and-hold → complete the figure and deepen the resonance) and the arrow keys (left/right → k, up/down → N, Space → hold) drive the **identical** `setParams` control chain as the camera. The one-hand camera is an enhancement layered on top: `f.cx` → k offset, `f.height` → peg count, `f.open` → draw-up and resonator wet/Q, loaded through `_shared/cameraTracking` with its GPU→CPU fallback and teardown. With no camera and no pointer the piece goes **idle**: his music alone drives `k`, the ring breathes, and the resonators sing autonomously — the screen is never blank or static.

Every audio parameter change is smoothed with `setTargetAtTime(target, ctx.currentTime, 0.12)` so conducting feels immediate but never twitchy. The visual is **Canvas2D only** — thin violet-phosphor chords with `globalCompositeOperation = "lighter"` and a per-frame near-black trail fade, DPR-aware, violet ramp on near-black with bone-white peg accents (no green/teal/cyan, no grain overlay). Every node graph terminates at `createSafeMaster(ctx).input`, never `ctx.destination`.

## Graceful degradation

- **No camera / permission denied / model-load failure** → pointer + keyboard mode with a visible notice; the camera button simply reflects the denied/failed state.
- **Audio load failure** → a `text-destructive` notice and a retry via Play.
- **No analysis for a track** → spectral fallback keeps `k` moving so the figure and the resonators stay alive.

## Reference

The construction follows **Mathologer / Burkard Polster**'s modular-multiplication "times tables on a circle" (cardioid, nephroid and rose curves) from *Times Tables, Mandelbrot and the Heart of Mathematics*. This cycle's fresh anchor is **Bluzaborges — Modular Cardioid v1.0.0** (GitHub, 2026-10-01).
