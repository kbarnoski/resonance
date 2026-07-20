# 2058 · Aura Fortress

**The one question:** What if Resonance could induce the phenomenology of a
_scintillating scotoma_ — the shimmering geometric "fortification spectrum" of a
migraine visual aura — as an autonomous 4–6 minute journey, with no drug and no
pointer input?

Route: `/dream/2058-aura-fortress` · Input modality: **none / autonomous**

---

## The phenomenon

A migraine visual aura (a _scintillating scotoma_) is a real, drug-free
altered-perception event. It begins as a small shimmering C-shaped spot near
the point of fixation and slowly expands over ~15–20 minutes into an arc of
zigzagging bright light — the "fortification spectrum," named for its
resemblance to the star-fort ramparts of a Vauban fortress. The arc
**scintillates** at its leading edge and drags a temporary **scotoma** (a blind
or greyed-out region) behind it. When it finishes crossing the field, vision
recovers. Here the whole arc is compressed to ~5.5 minutes.

## The CSD wave model

The arc is a **traveling reaction front** standing in for **cortical spreading
depression (CSD)** — a slow wave of neuronal depolarization that crosses visual
cortex at roughly **3 mm/min**, which is what makes the perceptual arc creep so
slowly. The model here is deliberately simple and lives entirely in retinal
(screen) space:

- A wavefront **radius `R(t)`** advances from a fixation origin (set slightly
  left of centre; the C opens toward the right periphery) over the journey.
- At the front (`d ≈ R`) sits a bright **scintillating band**.
- Along that band we procedurally generate **fortification zigzags**: a
  herringbone of short bright chevron segments, in a band-local coordinate
  (`u` = arc length, `v` = across the band), with the diagonal direction
  flipping every cell — the classic fortification look, tangent to the arc.
- Just **behind** the front (`R − d` small) is a desaturated **scotoma** band
  with faint static; further behind, the field **recovers** — so the blind
  region travels with the front rather than accumulating.
- The C-shape is an angular sector whose half-width **grows** with progress, so
  the arc opens from a small near-central spot into a wide peripheral sweep.

Rendering is a **WebGL2 fragment shader** (`webgl.ts`), one fullscreen triangle.
No log-polar / exp() warp (banned this cycle); no SVG-DOM. If WebGL2 is
unavailable the audio still plays and an on-brand `text-destructive` notice
explains that the aura cannot be drawn.

## Audio mapping

Web Audio, generated in-browser, no samples, no network (`audio.ts`). The **same
wave state** that drives the shader drives the sound each frame, so the two are
genuinely coupled rather than one visualizing the other:

- **Scintillating edge → shimmer.** A band of drifting, detuned high partials
  through a bandpass whose centre frequency tracks the wavefront's position; its
  loudness is tremolo'd by the **same ≤ 3 Hz scintillation oscillator** that
  drives the visual luminance drift (so you hear the shimmer you see), and gets a
  brightness kick from the wavefront's speed.
- **Scotoma → migrating notch.** Two cascaded `notch` biquads sweep through a
  soft low drone, deepening (higher Q) mid-journey when the scotoma is most
  active. The "blind" region is thus audible as a **traveling hole** in the
  spectrum.
- **Harmony** is non-just, non-pentatonic, non-scalar: an inharmonic set of
  irrational partial ratios (`1, 1.487, 2.113, 2.879, 3.561, 4.402, 5.233` for
  the shimmer; `1, 1.335, 1.828, 2.427` for the drone) that slowly detune via
  independent low LFOs. It is **not** the banned Chladni glass-plate set
  (`1, 2.76, 5.40, 8.93`). Calm-but-uncanny.
- **Master chain:** gain ~0.14 → `tanh` soft-clip `WaveShaper` limiter →
  destination, so it never blows out.

Everything evolves over the full journey (notch migration, Q envelope, drone
lowpass, band centre), so minute 5 does not sound like minute 1.

## Safety (the hard constraint)

For photosensitive-epilepsy safety the luminance flicker is **slow and smooth**:
a **sinusoidal** luminance drift at **2.6 Hz** (≤ 3 Hz), **floored** so it never
reaches black — there is **no hard on/off strobe** anywhere in the shader. The
audio tremolo shares that same 2.6 Hz oscillator and is likewise floored. A
`text-xs` photosensitivity note appears on the start panel, and an instant
**Stop** control ends audio and animation immediately.

## Named references / live-research anchor

- **Karl Lashley (1941)** — self-mapped the spread of his own aura, inferring a
  cortical wave moving at a few mm/min.
- **Aristides Leão (1944)** — discovered cortical spreading depression (CSD).
- **McLeod et al. (2025, _Headache_)** — first-ever **direct intracranial
  recording of CSD** in a human migraine-with-aura patient. This is the
  live-research anchor: the mechanism this piece dramatizes was, in 2025,
  observed directly in a human brain for the first time.

## What I'd deepen next cycle

- **True 2D reaction–diffusion** (a real excitable-medium / FitzHugh–Nagumo
  solve on a texture) instead of an analytic radius, so the front can bend,
  break, and re-form the way real CSD does.
- **Binocular geometry** — a proper hemifield map and a blind-spot-aware scotoma,
  and letting the arc traverse a mapped cortical magnification (without the
  banned log-polar warp — perhaps a measured retinotopy LUT).
- **Recovery afterglow** and negative-scotoma variants (some auras leave a
  positive shimmer, others a pure blind hole).
- Verify the felt experience on real speakers and a real display — currently
  built and type-checked only.

## Files

- `page.tsx` — `"use client"` UI, journey clock, single wave-state driver, Stop,
  design-notes modal.
- `webgl.ts` — WebGL2 renderer: arc, fortification herringbone, scotoma,
  scintillation. Exports `WaveState`.
- `audio.ts` — Web Audio engine: shimmer band + migrating-notch drone.
- `README.md` — this file.
