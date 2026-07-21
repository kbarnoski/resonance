# 2094 · Unself

**Watch your own self peel away from you.** A six-and-a-half-minute, drug-free,
**stateful** dissociation journey — not a loop. A single autonomous parameter
`D` (0 → peak → 0) drives everything, so minute 6 does not look or sound like
minute 1.

## The question

> What if a 6-minute drug-free journey could let you watch your own self peel
> away from you — a luminous figure that first mirrors your motion, then splits
> into a delayed ghost you can't tell from yourself, drains of colour and
> reality, disperses into drifting motes, then re-coalesces?

## The arc (five phases, driven by `D`)

| Phase | Timeline | State |
| --- | --- | --- |
| **Embodied** | 0–15% | One warm luminous point-cloud figure that mirrors your tilt exactly. One self, present. |
| **Depersonalization** | 15–35% | A **delayed ghost-self** peels off. A ring-buffer replays your figure a growing delay behind (~0.4s → ~3s), brightening toward parity — the doppelgänger split. |
| **Derealization** | 35–55% | The field drains toward grey; the figure flattens into a **cardboard cutout behind glass**. Unreal. |
| **Dissolution** | 55–80% | **Peak.** The figure disperses into drifting **motes**; boundaries melt into a soft centre-out glow; time slows hard. |
| **Return** | 80–100% | Motes re-coalesce, the ghost catches up and re-merges, colour returns — a soft landing, never abrupt. |

The wall-clock runs the ~390s arc so the piece actually **ends**. Your tilt
modulates `D` slightly upward (a little felt agency) but never resets the clock.

## The shared arc engine (the research payload)

Named mechanism: **Bera, Looger, Proekt & Cichon, "Cortical Mechanisms
Contributing to Ketamine-Induced Dissociation," _The Neuroscientist_ (2026),
doi:10.1177/10738584251403946** — dissociation = thalamocortical
**disconnection** + sensory-gating breakdown + subjective **time dilation**.
Translated to code (`arc.ts`):

- **Audio-visual DESYNC** — as `D` rises, the audio envelope increasingly
  **lags** the visual motion (up to ~600 ms at the peak). A motion-energy ring
  buffer feeds the audio its own past; the two streams the brain normally binds
  come apart. This is the felt core of dissociation.
- **Time dilation** — a global `timeScale` shrinks as `D` rises (~1 → ~0.38),
  slowing the animation clock and stretching every DSP glide (`setTargetAtTime`
  time constants scale by `1/timeScale`), snapping back on **Return**.
- **Palette drain, boundary melt, ghost delay** all scale with `D`.

## Renderer & audio

- **Renderer: Canvas2D** (`getContext("2d")`). A luminous point-cloud figure, a
  ring-buffer ghost replay, and a drifting-mote dissolution field, all with
  additive `globalCompositeOperation = "lighter"` glow and a translucent
  per-frame fill for luminance trails (which lengthen as time dilates). No GL,
  no shader compile — the safest substrate. No 2D context → on-brand
  `text-destructive` notice, audio still runs.
- **Audio: Web Audio, drones only** — no struck/plucked events, no pitched
  lattice (not pentatonic, not a JI stack, never the Chladni set). Two sustained
  clusters on an irregular non-harmonic ratio set: a warm **present "you"**
  crossfading into a **ghost "you"** (detuned ~−30¢, cotton-wool lowpass,
  mono-collapsed, delayed 0.4→3s). A seeded convolution-reverb **void** opens
  toward the peak with a lowpass that opens at the light moment. Master ~0.14 →
  `DynamicsCompressor` → destination; full teardown on unmount.

## Input & fallback

`DeviceOrientationEvent` beta/gamma only (first reading = baseline). iOS
`requestPermission()` is called inside the Begin handler. **No pointer / mouse /
touch, no microphone.** With no sensor or no reading within ~1.5s, a seeded
auto-drive (`mulberry32(0x2094)` + `performance.now()`) wanders the tilt so the
whole journey self-demos with zero sensor and zero interaction. A chip shows
`source: tilt / auto`.

## Safety

No strobe, no full-screen flicker — slow luminance drift only.
`prefers-reduced-motion` softens the mote wander and drift. **Stop** silences
audio and halts animation the same frame. No `Math.random` / `Date.now` in any
loop — seeded PRNG + `performance.now()` deltas only.

## Cycle-3 deepening (honest note)

This is a **cycle-3 deepening** of the lab's out-of-body line.
**2080 Exo Vantage** built the room: a single decoupling of sight from balance
that _breathed_ between embodied and out-of-body. **2094** folds in the banked
**2084 echo-self** doppelgänger mechanic and — the defining new idea — replaces
that breath with a genuine multi-phase **timeline** that evolves and does not
return you to where you started until it chooses to.

The honest limitation: the phase transitions are currently **time-gated on a
fixed clock**. A cycle-4 version would let accumulated tilt engagement actually
advance or hold the arc, so the journey's pace becomes yours rather than the
clock's.

## References

- Bera, Looger, Proekt & Cichon, "Cortical Mechanisms Contributing to
  Ketamine-Induced Dissociation," _The Neuroscientist_ (2026),
  doi:10.1177/10738584251403946.
- Lenggenhager, Tadi, Metzinger & Blanke, "Video ergo sum: manipulating bodily
  self-consciousness," _Science_ (2007).
- Blanke & Metzinger, "Full-body illusions and minimal phenomenal selfhood,"
  _Trends in Cognitive Sciences_ (2009).
- Cento, Gammeri et al. (2026) — the vestibular contribution to
  depersonalization and derealization.

## Files

- `page.tsx` — client component: chrome, canvas, journey readout, Stop, notes.
- `arc.ts` — the journey engine: `D`, phases, `timeScale`, desync ring buffer.
- `orientation.ts` — tilt input + seeded auto-drive fallback.
- `audio.ts` — present/ghost drone clusters, reverb void, desync, time dilation.
- `scene.ts` — Canvas2D point-cloud figure, ghost replay, mote dissolution.
- `readme-text.ts` — design-notes text for the in-app overlay.
