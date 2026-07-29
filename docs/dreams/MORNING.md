# Morning digest — last updated 2026-07-29 (cycle 950, DEEP)

> **The jury's biggest unfilled seam was #4: installation/spatial — still 0× after 900+ personal-screen pieces, "nothing that imagines Resonance in a room." Tonight went DEEP on exactly that: one concept ("Resonance as a room, operated live") built three ways in parallel, shipped the strongest — which also answers seam #5 (the shared-`now` substrate).** See `docs/dreams/JURY.md`.

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **[3744-maproom](/dream/3744-maproom)** — **the lab's FIRST piece that imagines Resonance in a ROOM.** A 3×3 video wall of nine projection surfaces, each a *different* audio-reactive pattern, all locked to **one shared clock** — a bright downbeat sweep crosses the whole wall once per bar so you can *see* the nine tiles breathe as one room. Resolume-style cue bar (keys 1–5), master fader, click a tile to solo it full-screen. **Why open it:** it also quietly answers provocation #5 — the whole "state" is just `(seed, t0, bpm, cueId)`, so two phones given the same seed render the *identical* frame with **no network** between them. Determinism replaces the wire. This single browser is a preview of a synced multi-wall / N-phone install. Opens in AUTO and self-demos — press 1–5 to take over.

## In progress / partial
- DEEP cycle: three realizations built, shipped the strongest; two banked runners-up are rebuild-ready (IDEAS §950):
  - **3736-atrium** ⭐⭐ HIGH — sit *inside* a three.js box venue; the lab's first **spatial-audio room** (each voice on an HRTF panner sweeps left→back→right in your ears as its light crosses the room). Held only because that payoff needs **headphones** to verify — the natural next ship.
  - **3752-groundplan** ⭐⭐ — a top-down SVG venue floor-plan where the geometry *is* the mix; drag a speaker and the room re-pans live.

## Research findings worth a look
- **§950:** 2026 is the year the *browser* became a real on-site installation runtime (WebGPU across all engines; production spatial-web). The pro tool for audio-reactive projection is **Resolume Arena** (audio-analysis + BPM + MIDI/OSC + surface mapping) — the vocabulary maproom borrows. Lineage: **teamLab Borderless**.

## Open questions for Karel
- Installation/spatial is finally open — ship the **immersive** version next (3736-atrium, in-a-room + spatial audio, headphones), or a **real two-device sync** proof for maproom (open it on two phones, watch them lock frame-identical)?
- The **AI-pipeline chain** (music→image→video) is still 0× — needs your explicit **FAL_KEY go-ahead + a per-run $ cap** before I can build it. Flagging again.
- Still uncashed: your **real Path piano** as a live source (maproom/atrium would each place a track on a surface), and a **Tauri operator build** for an actual projector wall.
