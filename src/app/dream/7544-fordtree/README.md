# 7544 · Ford Tree

> **What if you could *descend* the infinite tree of all just-intonation harmony — the Stern–Brocot / Ford-circle structure where every rational p/q is one tangent circle *and* one musical interval — falling forever from the simple consonances (octave, fifth, fourth) toward the microtonal abyss, hearing each interval as you pass it?**

## What it is

A steerable infinite descent through the **rational continuum itself**, rendered as a nested tangent-circle packing and sounded as pure just intonation.

Every positive rational `p/q` is two things at once:

- a **Ford circle** — centre `(p/q, 1/2q²)`, radius `1/2q²`, tangent to the x-axis and tangent to its Stern–Brocot neighbours, forming an infinitely nested circle packing;
- a **just-intonation interval** above a drone root — `3/2` is the perfect fifth, `4/3` the fourth, `5/4` the major third, `7/4` the harmonic seventh, and so on.

The camera falls toward the current node while the packing self-similarly reveals ever-finer structure. As you descend, denominators grow, the ratios get more microtonal, and the harmony drifts from pure consonance into shimmering alien territory. It runs forever: when the denominator gets astronomically large it gracefully resurfaces to the root and dives again.

## How to use it

- **Press "Start sound"** to begin the audio (browsers require a gesture before sound). The visuals run silently from the moment the page loads.
- **← flatter / → sharper** — at each step the current interval sits between two Stern–Brocot neighbours; the left arrow takes the flatter mediant branch, the right arrow the sharper one. This is the load-bearing verb: **you steer which rationals you fall through.**
- **↑ ascend** — climb one level back toward the root (simpler ratios).
- **Space** — pause the auto-descent / resume it.
- **Click any circle** — dive straight to that rational (its full Stern–Brocot path is reconstructed by the mediant/Euclid algorithm).

The **readout** (top-left) shows the current `p/q`, its size in cents, and the interval name.

Left to itself it auto-descends: a slow, self-running fall that reads as a compelling infinite tangent-circle descent even on a silent phone with zero interaction.

## The math

- **Stern–Brocot tree** (Moritz Stern, 1858; Achille Brocot, 1861). Starting from the boundaries `1/1` and `2/1`, the **mediant** of neighbours `a/b` and `c/d` is `(a+c)/(b+d)`; repeated mediants enumerate every rational in `[1,2]` exactly once, in lowest terms. Left/right choices spell a path — equivalently a **continued-fraction** expansion of the target ratio. Depth ↑ ⇒ larger denominators ⇒ more complex, more microtonal ratios.
- **Ford circles** (L. R. Ford, *"Fractions,"* American Mathematical Monthly, 1938). Each reduced `p/q` gets a circle of radius `1/(2q²)` tangent to the x-axis; the circles for Stern–Brocot / **Farey** neighbours are mutually tangent. Restricting to the octave `[1,2]` makes the packing exactly the just-intonation intervals within one octave.
- **Musical mapping.** Each rational `r ∈ [1,2)` is voiced as the interval `r` above a sustained drone root (≈ G2). Simpler ratios (small `q`) ring pure, bright and long; deeper/complex ratios beat, shimmer and decay faster — the true rational is always sounded (no 12-TET quantise, no pentatonic). A soft cosmic-ambient drone plus generated-impulse reverb sit underneath, and the filter cutoff / reverb mix drift slowly over minutes so the descent feels like a journey rather than a loop.

## This is NOT the dissonance-curve line

To be plain: this piece is **not** the lab's rested *dissonance-curve / Sethares timbre-derived-scale* line. That line derives a scale from a psychoacoustic **dissonance measure** of a given timbre. This is a completely different, number-theoretic object — the **Stern–Brocot mediant tree / Ford circles / Farey sequence**, i.e. the structure of the rational numbers themselves. There is no dissonance metric anywhere in it; consonance here is just "small denominator", which falls straight out of the tree's depth.

## Implementation notes

- Pure inline **SVG** (mandatory) — no Canvas2D, WebGL or WebGPU. The visible packing is rebuilt each frame by recursing the mediant tree, pruned to the visible x-window and culled below `0.55px`, hard-capped at 168 live circles so the DOM stays bounded and never freezes. Circles are keyed by `p/q` for stable reconciliation.
- **Web Audio**: a sustained drone (root + just fifth + sub), per-interval bell/pad voices whose partials realise the ratio (with beating detune on complex ratios), and a `ConvolverNode` reverb built from a deterministic decaying-noise impulse. Voices are concurrency-capped and disconnected as they finish; full teardown on unmount stops every node and `close()`s the context.
- **Deterministic**: no `Math.random` / `Date.now` / `new Date`. Branch choices and the reverb impulse use a seeded `mulberry32(0x7544)`. Animation runs off `requestAnimationFrame` deltas and an internal phase counter, never the wall clock.
- **Infinite zoom**: the camera lerps in log-scale toward `APPARENT_R · 2q²`, so each step multiplies the zoom and the packing endlessly reveals finer structure; the denominator cap resurfaces to the root so it loops forever.

## Honest notes (unverified without speakers)

- I could not listen to this. The **audio balance is unverified** — the drone-vs-bell mix, the reverb wet level, and whether complex-ratio beating reads as "shimmer" rather than "mud" in the low register are best guesses; the bell register (`root × 4 × value`) was chosen for clarity but may want tuning.
- The **silent-screen read** is the strongest claim I can make from the code: nested tangent circles with a glowing current node, a violet void, and a continuous log-scale fall toward the axis should read as an infinite harmonic descent with zero interaction — but I have not seen it animate.
- Very deep dives approach floating-point limits on `p/q`; the `Q_RESURFACE = 100000` cap keeps it safely away and provides the eternal loop.

## Tags

- **input**: keyboard / pointer — steered descent (← → branch, ↑ ascend, space pause, click to dive)
- **output**: inline SVG (non-GPU) tangent-circle packing
- **technique**: Stern–Brocot mediant tree / Ford circles / Farey — just-intonation harmony navigation
- **pole**: cosmic-ambient / infinite harmonic descent (psychedelic)

## Named references

- Moritz Stern, *Über eine zahlentheoretische Funktion* (1858).
- Achille Brocot, *Calcul des rouages par approximation* (1861).
- L. R. Ford, *"Fractions,"* American Mathematical Monthly 45 (1938) — the Ford circles.
- **Farey sequences** and their connection to **continued fractions**.
- Harry Partch, *Genesis of a Music*; David B. Doty, *The Just Intonation Primer* — for the just-intonation interval names.
