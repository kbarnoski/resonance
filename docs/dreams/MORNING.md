# Morning digest — last updated 2026-06-22 ~06:25 UTC (cycle 511)

## ▶ Open this first
- **[/dream/837-quasicrystal](https://getresonance.vercel.app/dream/837-quasicrystal)** — **Quasicrystal.** Music with the structure of a quasicrystal: a real **de Bruijn pentagrid → Penrose tiling** generates a score that's perfectly ordered, self-similar, and **never repeats** — it can play for an hour without looping, different at minute 5 than minute 1. Fat/thin rhombs and their 7 vertex types map to just-intonation pitches; φ-inflation zooms the crystal. The lab's **first aperiodic-order composition** (grep-0×). Press **Begin Crystal** — it plays itself; tune tempo / inflation / traversal. Hit **Design Notes** in-app for the why.

## How this cycle ran (adult · WIDE · 3 explorers → shipped 1)
- Mode **WIDE** (alternated off §510's DEEP): 3 orthogonal adult briefs, each resting your recording and dodging the answering-agent thread (JURY #1) + the touch-input rut (5× in last 10). Shipped the strongest.
- **2 more explored, banked to IDEAS §511** (both built complete + build-verified, neither committed):
  - **`836-flightpaths`** — sonify the **live ADS-B sky**: each real aircraft a sustained spatial voice on a clinical radar (altitude→pitch, bearing→pan, density→harmony). The genuine real-world-data lab-first; **top resurrect-first next adult cycle.** Banked because the live feed is often CORS-blocked → most visitors would see the simulated sky.
  - **`838-hocket-loom`** — play one live MIDI/keyboard line, it shatters across an interlocking **hocket / kotekan / phase** ensemble. Banked: canon/interlock is well-trodden lab ground.

## Research finding worth a look (RESEARCH §511)
- **Skylight** (Tom's Hardware, June 2026) — viral open-source Raspberry-Pi + ADS-B rig that projects real flight paths onto your ceiling. It makes the sky *visible* but never *heard* — that gap seeded `836`. Confirmed by grep that the lab owns **no aircraft/transit data source** (NOAA/USGS/Wiki/weather are taken).

## Process note (the standing fix held)
- Grepped every brief's technique/data-source **before** fan-out: aircraft = un-owned ✓; **optical-flow, genome/GA, and WebGPU-compute all turned out OWNED/saturated** — so I cut those and never over-claimed. The jury's "WebGPU compute never appeared" (#2) is **factually wrong** — ~21 prototypes already use it; please don't keep chasing it as the unbuilt frontier.

## Open questions for Karel
- **836 is one CORS check from shippable.** Want me to verify airplanes.live returns in-browser next cycle and ship the real-sky version (with a tiny guarded proxy if the feed is blocked)?
- Quasicrystal is **autonomous/generative** — happy with pieces that "play themselves" in the adult lane, or do you want a live-performance hand on everything?

_Infra (standing since 472): local `npm run build` passes compile+lint+type-check but can't finish static-gen — a ~4096-fd container ceiling, not a code defect; Vercel deploys fine._
