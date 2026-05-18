# Resonance Dream Sandbox — prototype index

This is the single page Karel opens each morning. It mirrors the live
index at `/dream/` (the Vercel preview URL). Click a route to play
with the prototype; click the design notes link to read the agent's
thinking.

Status legend: `skeleton` (route exists, not yet interactive) ·
`wip` (partial) · `demoable` (works, rough) · `polished` (refined).

---

## ⭐ Newest (Cycle 3)

- **[/dream/3-fluid](/dream/3-fluid)** — Fluid — real-time Navier-Stokes ink-in-water
  driven by audio. Bass pulses the center, treble stirs turbulence, pitch shifts dye color.
  Drag to stir manually. Ambient drift mode for no-mic use.

---

## Prototypes

### dashboard (/ route)
**Status**: `demoable` · **Cycle shipped**: 1 · **Last touched**: 2026-05-18

`/dream/` is now an async server component that reads `MORNING.md` and
`STATE.md` at build time. Layout: MORNING.md hero → recent cycle
stream (label, summary, when) → clickable prototype list → footer.
Phone-first, no JS required.

### 1-live
**Status**: `demoable` · **Cycle shipped**: 0 · **Last touched**: 2026-05-17

Open `/dream/1-live` on the preview URL. Click **Start mic**, allow
permission, play or hum something. Six frequency bands bloom as
concentric color fields — sub-bass deep violet at the outer edge,
high treble white-hot at the center. Onsets flash. BPM and band
levels display top-right.

Design notes: see `src/app/dream/1-live/README.md`.

---

### 2-ghost-lab
**Status**: `demoable` · **Cycle shipped**: 2 · **Last touched**: 2026-05-18

Open `/dream/2-ghost-lab`. Two modes:
- **LoRA vs no-LoRA**: same prompt, A=flux-lora (Ghost character LoRA attached),
  B=flux-dev (base model). Directly shows whether identity lock is working.
- **A/B Prompts**: two independent prompts, each with optional LoRA toggle.

Five pre-set scenes (stone chamber → root portal → underground pool → tiny planet →
cosmic ascension) with alternate camera angles. Vote buttons (👍 A / Both / 👍 B /
Neither) stored in localStorage with running tally.

Design notes: `src/app/dream/2-ghost-lab/README.md`

---

### 3-fluid
**Status**: `demoable` · **Cycle shipped**: 3 · **Last touched**: 2026-05-18

Open `/dream/3-fluid`. Click **Start mic** or **Ambient drift**. Drag to stir.

Real WebGL 2 Navier-Stokes fluid sim (128×128 RGBA16F). Bass injects radial
pressure pulses from center; treble adds turbulence splats; spectral centroid
maps to dye color (indigo → green → orange/red); onsets fire burst splats.
25 Jacobi iterations per frame for incompressibility. Filmic tone-mapped display.

Requires WebGL 2 + EXT_color_buffer_float (Chrome/Firefox/Safari 15+). Falls
back to an error message with explanation on unsupported browsers.

Design notes: `src/app/dream/3-fluid/README.md`

---

### 4-operator `[queued]`
Tauri-mode operator panel mock — performer view + scene library + MIDI
mapping for live performance. Queued.

### 5-arcs `[queued]`
Journey engine v2 — picker for non-psychedelic arcs (EDM build-and-
drop, cinematic three-act, ritual, sleep cycle). Queued.

---

## How to use this sandbox

- **Don't expect production polish**. These are dreams. Some will be
  beautiful, some will be broken, all are exploratory.
- **You're in the loop.** Open a Claude Code conversation, say "what
  did you dream last night?" The assistant will summarize and propose
  directions. Tell it what to deepen / kill / add.
- **Adding ideas**: tell Claude "add this to the dream queue: ..." and
  it'll write into IDEAS.md. Next agent cycle picks it up.
- **Stopping the loop**: go to claude.ai/code/routines, disable
  "Resonance Dream Agent." Re-enable any time.

---

## Files to scan each morning

In rough order:

1. **`/dream/`** — the live dashboard (renders MORNING.md + cycles + prototypes)
2. **STATE.md** — chain of thought for each cycle
3. **INDEX.md** (this file) — prototype status board
4. **RESEARCH.md** — findings from research cycles (created cycle ~4)
5. **IDEAS.md** — full queue
