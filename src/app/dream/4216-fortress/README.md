# 4216 — Fortress

**INPUT** keyboard · **OUTPUT** Canvas2D · **TECHNIQUE** cortical-spreading-depression traveling wave through a log-polar retinotopic map · **VIBE** migraine scintillating-scotoma, intense / eerie

## What this is

> **The one question:** *What if you could WATCH and HEAR a migraine visual aura — the scintillating scotoma — sweep across your visual field, as a playable altered-states instrument?*

The migraine aura is not a metaphor — it is a **real, drug-free cortical phenomenon**. A wave of **cortical spreading depression (CSD)** — a slow front of neural depolarization — crawls across the primary visual cortex (V1) at roughly **3 mm/min**. Because the map from retina to V1 is a **complex logarithm** (the same log-polar warp that underlies Klüver's form constants), a wave that is a simple expanding arc in *cortical* space appears in the *visual field* as a shimmering **C-shaped band of zig-zag "fortification" chevrons** that is born near fixation, swells toward the periphery, and drags a blind gray **scotoma** behind it. Fortress lets you sit at the fovea and watch — and hear — that wave cross.

## How to use

Press **Start sound** once (audio needs a user gesture). The aura is already sweeping on load; a **seeded self-demo loops hands-free** until you touch a key, at which point control is yours.

| Key | Action |
| --- | --- |
| **Space** | trigger a fresh aura from the seed |
| **← / →** | sweep the aura toward the left / right hemifield |
| **↑ / ↓** | move the seed origin farther / nearer fixation |
| **[ / ]** | slower / faster CSD wave speed |
| **F** | toggle the safe-flicker shimmer on / off |
| **Design notes** | reveal the in-page explanation |

## The design

**CSD → log-polar mapping.** The aura front lives at cortical radius `u = u₀ + v_csd · t`. Under the inverse retinotopic warp `r = exp(u)` (`cortexToScreen` from `_shared/psych/logpolar`), that front becomes a circle in the visual field whose radius `exp(u)` starts tiny near the fovea and grows toward the periphery — the classic aura expansion. The C-shape comes from restricting the wave to an angular wedge `[seedAngle ± span]` that *widens* over time (`span → 1.35 rad`), so the aura opens as it grows, as real fortification spectra do. The seed and edge radii are derived through the warp itself (`screenToCortex(R_SEED)` / `screenToCortex(R_EDGE)`), so the geometry is principled, not hand-tuned.

- **Scintillation.** At the leading edge we draw several trailing **fortification bands** — zig-zag polylines along the arc (radial `±ZIG` alternation = the chevron herringbone). Each segment's brightness and iridescent hue come from `formConstant(u, θ, φ≈π/2, freq, phase)` — a spoke-like plane wave in cortical space that shimmers *along* the front — multiplied by the flicker gate.
- **Scotoma.** Behind the front, the wedge the wave has already crossed is filled with a **desaturated dead gray** (a radial gray gradient, dimmer than the shimmer) so it reads as a blind hole trailing the edge.

**Safe-flicker safety (mandatory).** The scintillation shimmer is routed entirely through `_shared/psych/safeFlicker` — `createSafeFlicker({ maxHz: 3, defaultHz: 2, floor: 0.6 })`. This is a **soft sine luminance drift clamped to ≤3 Hz with a 0.6 floor** — never a hard on/off black strobe, and well below the ~15–25 Hz photosensitive-epilepsy danger band. `prefers-reduced-motion` is honored: the shimmer falls to near-static. This is a non-negotiable safety rail — a real strobe reliably evokes the same form constants but is a genuine seizure hazard.

**Audio mapping.** The aura *sings* as it crosses. A small **additive bank of slightly-inharmonic detuned partials** (`700·[1, 2.01, 3.02, 4.05, 5.09, 6.14] Hz`) tracks the leading edge: its pitch **rises** as the front expands toward the periphery and its higher partials **fade in** (brighten) with progress. Critically, the shimmer bus gain is written every frame from the **same SafeFlicker luminance value the eye sees**, so the tremolo you HEAR is locked to the shimmer you SEE. Underneath, a low **drone bank** (`_shared/psych/droneBank`, root 46 Hz) is the voice of the void: its drive swells with the growing scotoma. Continuous pitch only — no drums, no scale snap. A `DynamicsCompressor` sits on the bus as a safety limiter; everything is torn down (`stop()` + `ctx.close()`) on unmount.

## Named references

- **Lashley, K. S. (1941)** — *Patterns of cerebral integration indicated by the scotomas of migraine.* The famous self-observation that fixed the scotoma's velocity across the visual field, later back-calculated to ~3 mm/min across cortex.
- **Richards, W. (1971)** — *"The Fortification Illusions of Migraines,"* Scientific American. The chevron/fortification geometry and its retinotopic origin.
- **Migraine Visual Aura and Cortical Spreading Depression — Linking Mathematical Models to Empirical Evidence** (PMC8293461). The reaction-diffusion / retinotopic CSD modeling this prototype's kinematics are drawn from.
- **Bressloff & Cowan (2001–02)** — the V1 log-polar (complex-log) map and the geometric theory of Klüver's four form constants, of which the migraine fortification is one seen through the retinotopic warp.

## Next-cycle deepening

1. **Reaction-diffusion front, not a kinematic arc.** Replace the analytic `u = u₀ + v·t` front with an actual FitzHugh–Nagumo / reaction-diffusion excitable medium simulated *in cortical coordinates*, then warp its live isocontour to screen — the front would then curve, stall at tissue heterogeneities, and re-ignite, exactly as clinical spectra do.
2. **Binocular / hemifield split-rendering.** Render left and right visual hemifields from genuinely separate cortical sheets so an aura seeded in one hemisphere respects the vertical meridian discontinuity, and add a subtle stereo pan that follows the sweep.
3. **EEG / breath-coupled ignition.** Let a slow biosignal (breath, or a live alpha-band estimate) set the CSD ignition threshold, so the reviewer's own physiology decides when and how fast the next aura fires — turning the piece from an instrument into a biofeedback mirror.
