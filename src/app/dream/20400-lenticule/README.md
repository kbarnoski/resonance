# 20400-lenticule — Lenticule

**Status**: demoable — two of Karel's real recordings woven into one Canvas2D lenticular print; a single viewing-angle scalar sweeps both the strip-interlaced image and an equal-power audio crossfade between the two takes. Pointer-first with one-hand camera enhancement; fully exercisable with no webcam.

**One question:** What if two of Karel's recordings were woven into a single
*lenticular* print — and moving your head (or dragging) swept the viewing angle
so the woven **image** *and* the **sound** crossfaded from one piece to the other?

## What it is

Two of Karel's real recordings play at once, each looping. Each renders to its
own animated, audio-reactive **image**:

- **Track A** → a warm horizontal **interference / stripe** field (magenta-violet)
- **Track B** → a cooler **radial / concentric** field (blue-violet)

The two images are **interlaced as fine vertical strips** on a single Canvas2D —
a lenticular print. A single scalar **viewing angle `a ∈ [0,1]`** controls which
image each strip shows. As `a` sweeps, strips flip from A to B with a soft
cross-blend band — the characteristic lenticular **flip / shimmer** — and at
`a ≈ 0.5` the two images weave into one interference print.

## How to use

- Press **Play** to sound both recordings at once.
- **Sweep left ↔ right** across the print (drag, or just move the pointer) to
  tilt the viewing angle. Left edge resolves to the first piece; right edge to
  the second; the middle weaves both.
- **Arrow keys** (←/→) nudge the angle — no pointer motion needed.
- **Use camera (one hand)** is an optional enhancement: move one hand left/right
  and your hand's horizontal position (`cx`) drives the *identical* angle.
- Pick any two different pieces from the two selects before Play.

## The coupling (see == hear)

There is **one scalar `a`**, and it voices both sides:

- **Visual** — each lenticule (a repeating run of `LENTICULE_STRIPS` strips)
  carries a sub-strip *ramp* of flip-thresholds `θ ∈ [0,1]`. A strip shows image
  B once `a` passes its `θ`, with a soft blend band (`smoothstep(θ−band, θ+band, a)`).
  Repeating the ramp every lenticule gives the fine vertical interlace texture;
  sweeping `a` reveals B sub-strip by sub-strip = the lenticular shimmer. At
  `a = 0`, every strip shows A; at `a = 1`, every strip shows B; at `a ≈ 0.5`,
  half the sub-strips in each lenticule show each image = the woven interference.
- **Audible** — the same `a` is an **equal-power crossfade** between the two
  buffers: `gainA = cos(a·π/2)`, `gainB = sin(a·π/2)`.

So the image you **see** resolving to track B is exactly the sound you **hear**
fading to track B. At `a ≈ 0.5` you see both woven and hear both at equal power.

Both buffer sources loop continuously through the **same** `createSafeMaster(ctx).input`
bus; the angle only ever moves the blend (via `setTargetAtTime`, ~0.12 s), it
never restarts playback. Each field's reactivity is tapped off its **own
pre-crossfade** analyser, so each image animates to its own track's spectrum.

## Pointer-first

Pointer X and the arrow keys drive the **identical** `a` target as the one-hand
camera, so the whole piece is fully usable — and fully verifiable — with **no
webcam**. The camera (`createHandTracker` + `computeHandFeatures`, hand `cx`) is
a pure enhancement mapped to the same target. `a` is smoothed with a ~0.12 s time
constant (lerp for the visual, `setTargetAtTime` for the crossfade gains).

## Idle / autonomous state

With no camera and no pointer, the piece **auto-sweeps** `a = 0.5 + 0.5·sin(breath)`
slowly back and forth — the print shimmers and the mix breathes on its own. This
state is labelled `idle · auto-sweeping the print`, never disguised as live
tracking.

## Degradation

- **No camera / denied / model-load fail** → pointer + keyboard path (unchanged),
  with a visible `text-destructive` / muted status line and an actionable hint.
- **Tracking state is visible** — `tracking · live` vs the `text-destructive`
  lost state ("show one hand, palm to camera").
- **One track fails to load** → the single loaded track plays and both fields
  render from it, so the visual weave stays alive; a `text-destructive` notice
  says the audio crossfade is disabled.
- **Both tracks fail / Web Audio unavailable** → a designed error state with a
  retry hint (no blank page, no unhandled throw).

## Named reference

**Lenticular printing** / integral (“fly's-eye”) imaging — the ridged-lens print
that shows a different picture depending on your viewing angle. Here the two
pictures are two of Karel's pieces, and the angle is yours to sweep.

## Technique note (freshness / diversity)

Lab-first: **lenticular strip-interlacing rendered in Canvas2D** — two source
images interlaced as fine vertical lenticule columns, the viewing angle selecting
which image each strip shows with a soft flip band. This is **not** a GPU
per-pixel field (Canvas2D only, no WebGL/WebGPU this cycle) and not the loom /
weave metaphor used elsewhere in the lab — it is optical-print compositing driven
by a viewing angle. No film-grain / noise overlay. Palette is achromatic
bone/graphite duotone with a violet accent on near-black (no green, cyan, amber).

## Honest note on verification

The live camera "feel" (head/hand sweep) cannot be verified headless — there is
no webcam in CI. But the camera is mapped to the **exact same `a` target** as the
pointer and arrow keys, which *are* fully exercisable without a camera, so the
whole coupling (visual flip ⇄ equal-power audio crossfade) is verifiable through
the pointer path while frozen.
