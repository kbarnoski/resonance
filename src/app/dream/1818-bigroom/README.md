# 1818 · big room

A generative, **long-form, stateful EDM build-and-drop journey engine** in the
festival / melodic big-room house idiom. An alternate to Resonance's slow
6-phase psychedelic journey arc: this one is bright, euphoric, main-stage. One
Start press runs a full multi-minute arrangement start to finish; it is
genuinely different at minute four than at second four.

## The concept

EDM structure is not defined by harmony or lyrics but by **changes in energy,
rhythm, and timbre**, organized into named sections. This engine runs a real
arrangement —

```
intro → buildup → drop → breakdown → build2 → drop2 → outro
```

— through a sample-accurate look-ahead sequencer, maintains a single continuous
**energy/tension curve**, and lets that curve drive the DSP and the visuals at
once.

### Reference

The section taxonomy and the energy/rhythm/timbre framing follow **EDMFormer**
(Sajeer, Patel, Chung, Bae, *EDMFormer: Structure-Aware Modeling of Electronic
Dance Music*, arXiv:**2603.08759**, 8 Mar 2026), which models EDM form as
transitions between the sections above, driven by energy, rhythm, and timbre
rather than tonal or lyrical content. This prototype is an interpretation of
that structural idea as a live audio-visual instrument, not a reproduction of
the paper's model.

## The section state machine

`buildSections()` in `audio.ts` declares the arrangement as an ordered list of
`Section`s, each with a length in **bars**, an **energy at start / end**
(`e0`/`e1`), a **kind** (`intro | buildup | drop | breakdown | outro`), and a
violet **hue** for the ribbon. ~102 bars at 126 BPM ≈ 3m14s.

Transport is section-relative. The scheduler tracks a global `stepIndex` (16th
notes) and a `sectionStartStep`; when `stepIndex − sectionStartStep` reaches
`bars × 16`, it advances to the next section. Reaching the end fires `finish()`.

## The energy curve

`energyForSection(sec, p)` returns `e0 + (e1 − e0) · shape(kind, p)` for a
fraction `p` through the section. The shape differs per kind:

- **intro** — `smoothstep` ease-in from a low floor,
- **buildup** — `p^2.2`, so energy **surges** at the end,
- **drop** — held near ceiling,
- **breakdown** — `smoothstep` ease **down** to a low,
- **outro** — linear decay to zero.

The live **Intensity** slider adds `(intensity − 0.5) · 0.35` to the curve
(clamped), nudging the whole journey hotter or cooler without changing its
shape. The nudged energy is what drives the DSP each 16th.

### What the energy curve drives

- **supersaw lead filter cutoff** — `260 + energy² · 7200 Hz`,
- **sidechain-pump depth** — `0.18 + energy · 0.62`, applied as a gain duck on
  the pumped bus at every kick,
- **layer add/drop** — which instruments play is a function of section kind:
  breakdowns strip the kick and hats to a soft pad; drops run the full stack,
- **riser** intensity and the snare-roll density in the build climax.

## The classic build → drop

Inside every **buildup**, the last four bars enter the climax:

1. a **snare-roll accelerando** — 8ths → 16ths → 32nds as the bars count down,
2. a continuous **uprising sweep** — a bandpass-filtered white-noise voice whose
   center frequency ramps 500 → 9000 Hz, plus a **pitch riser** (a sawtooth
   sweeping 200 → 1500 Hz),
3. the kick drops out in the final bar, then a **silent gap** (the last two
   16ths) — the breath-hold,
4. the **drop**: an impact crash + sub boom on the downbeat, the full hook and
   supersaw return, and heavy **sidechain pump** ducks everything on each kick.

`build2` is bigger (energy to 1.0); `drop2` is the peak; the `outro` decays.

## Live controls (optional — Start alone is enough)

- **Intensity** — nudges the energy curve in real time.
- **Drop now** — collapses the current live buildup (`bars → relBar + 2`) so the
  next drop triggers early; if pressed outside a buildup it arms the next one.
- **Mute** and **Stop** for instant silence.

## Scheduling & audio graph

- **Look-ahead scheduler** (`scheduler()`): a 25 ms `setInterval` enqueues every
  event whose time is within `currentTime + 0.1 s` off `AudioContext.currentTime`
  — not one timer per note. Fixed 126 BPM.
- **Graph:** kick / crash / riser → `punchBus` (never ducked); everything else →
  `pumpBus` (sidechained). Both → `DynamicsCompressor` → master `GainNode`
  (**0.18 ceiling**) → destination.
- Harmony is a euphoric 4-bar loop (Fm – Ab – Eb – Db) flowing continuously
  across the whole piece; a detuned 6-osc **supersaw** carries the chords and a
  bright **pluck** carries the hook arpeggio.

## Visuals (`scene.ts`, Canvas2D)

- A reactive violet **skyline** of bars that rise with energy and **pump** on
  every kick (driven by the sidechain punch), with a particle field that
  **blooms** — spawns a burst — on each drop.
- The drop bloom is a **smooth one-shot luminance rise**, not a flash.
- A live **structure ribbon** across the bottom draws the EDMFormer section map
  as colored blocks with a moving playhead, and the **energy envelope curve**
  plotted above it with a dot tracking the current energy.

## Determinism & safety

- All randomness comes from a `mulberry32` PRNG seeded with the fixed constant
  `0x1818` (noise buffer, particle spawns, bar phases). No `Math.random`,
  `Date.now`, or `new Date` affecting output.
- Any repetitive flicker is ≤ 3 Hz; the bloom is a smooth rise. All audio passes
  through a compressor and a master gain capped at 0.18. `prefers-reduced-motion`
  reduces motion, bloom, and pump amplitude. Mute and Stop give instant silence.
- Self-contained: Web Audio + Canvas2D only, no external assets, no network, no
  new dependencies. The only cross-folder import is the shared prototype nav.

## Files

- `page.tsx` — client component: Start gesture, live transport UI, design-notes
  modal, canvas host, teardown.
- `audio.ts` — `BigRoomEngine`: section state machine, energy curve, look-ahead
  scheduler, synthesized instruments, sidechain, riser, safety chain.
- `scene.ts` — `Scene`: Canvas2D skyline + particle bloom + structure ribbon.
