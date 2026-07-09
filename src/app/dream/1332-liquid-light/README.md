# 1332 · Liquid Light

## The one question

**What if the 1960s psychedelic liquid light show — molten pools of colored oil
pushed across a projector by heat and gravity — were an _instrument you pour with
your phone_, tilting to make the color flow and bloom?**

You don't strike a note and wait for it to decay. You _lean_ the plate. The oil
runs the way you tilt it, gathering, blooming, and separating, while a warm drone
opens and bends up with the pour.

## The named reference (and why)

- **The Joshua Light Show** — Joshua White's projection troupe behind the bands at
  the Fillmore East in the late 1960s, still reforming and touring. The canonical
  American liquid-light rig: clock-glass dishes of immiscible colored oil and dye
  on overhead projectors, pushed by hand and heat.
- **Mark Boyle & Joan Hills' "Sensual Laboratory"** — the British side of the same
  moment, their liquid projections for Soft Machine and Hendrix. Boyle & Hills
  treated the chemistry of blooming, boiling, immiscible fluids as a fine-art
  medium, not just a backdrop.

This piece is a deliberate homage to that lineage: an analog oil-wheel /
wet-plate liquid light show, translated to a phone you tilt. Choosing that
lineage is the point — it is a real, nameable art form, and its physics (heat +
gravity + immiscible color) map cleanly onto tilt as the input.

## The Canvas2D dye-advection approach

No WebGL — Canvas2D on purpose, to stay dependency-light and ship-safe. The oil
is a coarse **dye advection** on a small offscreen buffer (`fluid.ts`):

1. **Advect + fade.** Each frame the previous buffer is redrawn onto a scratch
   buffer, translated slightly along the pour (tilt) vector and multiplied by a
   decay < 1, with a whisper of centre-zoom. Pools therefore _smear_ downhill and
   churn even when the flow is small. Ping-pong buffers swap each frame.
2. **Re-inject color.** A handful of emitters (magenta / cyan / amber / violet /
   green) drift with the flow and stamp translucent radial gradients using
   `globalCompositeOperation = 'lighter'` — additive glow, so pools bloom, merge,
   and separate. A faint complementary outer stop gives the thin-film iridescent
   edge.
3. **Present.** The small buffer is upscaled with smoothing over near-black, then
   a vignette caps corner brightness.

The multiplicative per-frame decay bounds the additive accumulation, so glow can
never run away.

## The tilt → pour mapping

- **Tilt direction** (`gamma` = L/R, `beta` = F/B) → the gravity vector the dye
  advects along, and the audio stereo pan.
- **Tilt magnitude** → "heat": bigger, hotter blooms; a longer smear; the drone's
  lowpass cutoff opens (300 → 2100 Hz) and the whole chord bends up ~22 cents.
- **Desktop fallback:** pointer-**drag** vector = pour vector.
- **Auto-drift:** a slow lissajous current always adds a faint living churn, so the
  plate is never dead — before Begin, on release, or when held still.

Audio (`audio.ts`) is a warm swirling just-chord drone (root A1, stacked pure
ratios, detuned pairs for chorus) over a felt **~0.3 Hz LFO throb** — this piece
lives in _time_; it is a breathing bed, not a bell. Master gain is capped at
**0.26** behind a `DynamicsCompressor` limiter, with a 3 s fade-in and full
teardown.

## Safety (photosensitive epilepsy)

No strobe. The bloom is smooth, continuous luminance drift. Peak brightness is
capped three ways: the per-frame multiplicative decay bounds additive glow, the
vignette darkens corners so a hot pool never blows the frame to full white, and
the only global luminance oscillation is a shallow ≤0.3 Hz "breath" on the
injection amount. `prefers-reduced-motion` slows the churn and the throb and
softens contrast.

## Next-cycle deepening

- **Immiscibility & surface tension:** give each dye its own decay/spread so colors
  genuinely refuse to mix at their boundaries (true oil-and-water beading) instead
  of only additively overlapping.
- **Two-hand / two-plate:** a second pour source (second pointer, or shake gesture)
  so two colors can be poured against each other.
- **Heat pockets:** localized "hot spots" under the plate (from tilt dwell) that
  boil a pool outward, echoing the projectionist's heat gun.
- **Spectral coupling:** let a pool's dominant hue steer which partials of the drone
  bloom, so the color you pour and the chord you hear are the same gesture.
