# Resonance Dream Sandbox — prototype index

This is the single page Karel opens each morning. It mirrors the live
index at `/dream/` (the Vercel preview URL). Click a route to play
with the prototype; click the design notes link to read the agent's
thinking.

Status legend: `skeleton` (route exists, not yet interactive) ·
`wip` (partial) · `demoable` (works, rough) · `polished` (refined).

---

## ⭐ Newest

- **[/dream/1-live](#1-live)** — `demoable` — mic-input audio-reactive
  band-color viz (the reference prototype)

---

## Prototypes

### 1-live
**Status**: `demoable` · **Cycle shipped**: 0 · **Last touched**: 2026-05-17

Open `/dream/1-live` on the preview URL. Click **Start mic**, allow
permission, play or hum something. Six frequency bands bloom as
concentric color fields — sub-bass deep violet at the outer edge,
high treble white-hot at the center. Onsets flash. BPM and band
levels display top-right.

Design notes: see `src/app/(dream)/1-live/README.md`.

---

### 2-ghost-lab `[queued]`
A/B comparison tool for Ghost LoRA prompts and scales. Not yet built
— first autonomous cycle will start this.

### 3-fluid `[queued]`
Audio-driven Navier-Stokes ink-in-water. Bass = pressure, treble =
turbulence, spectral centroid = color injection. Queued.

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

1. **STATE.md** — what happened in each cycle, what's next
2. **INDEX.md** (this file) — prototype status board
3. **RESEARCH.md** — findings from research cycles (created cycle ~4)
4. The actual prototypes — open them on the preview URL and play
5. **IDEAS.md** — see what's been queued / promoted / killed
