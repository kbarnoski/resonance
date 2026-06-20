# 777 · Song Architecture

**Route:** `/dream/777-song-architecture`

## The one question it answers

> What is the hidden **architecture** of Karel's real piano recording — where do its
> phrases repeat, and where does the form turn?

It loads his real "Welcome Home" piano recording, plays it whole, and computes — in
the browser — a **chroma-feature Self-Similarity Matrix (SSM)**. Rendered as a luminous
Canvas2D heatmap, the bright diagonal is "each frame matches itself," and the **bright
off-diagonal stripes are where a passage RECURS** — literally drawing the song's form.

## How it works (the experience)

1. Press **Play his recording**. The piece plays from the top.
2. The matrix is computed and drawn as a deep-violet → magenta → amber → white-hot heatmap.
3. A **playhead crosshair** (row + column highlight) sweeps the diagonal in sync with playback.
4. **Click any bright off-diagonal cell** → the two similar moments play back-to-back
   (frame *i*'s ~2s, then frame *j*'s ~2s), resynthesized from the decoded buffer with
   `AudioBufferSourceNode` start offsets — so you HEAR why they're similar.
5. A thin **emerald novelty curve** along the bottom edge (checkerboard-kernel correlation)
   marks likely section boundaries.

## Subsystems (≥3 distinct — ambition criterion #2)

| Subsystem | File | What it does |
|---|---|---|
| Audio-file load / playback | `audio.ts`, `page.tsx` | Read-only GET of his recording, `decodeAudioData`, whole-piece playback + click-to-resynthesize segments |
| Synthesized fallback | `audio.ts` | `OfflineAudioContext` renders a clear **A·B·A** piano phrase when the network is unavailable, so real recurrence stripes still appear |
| Chroma feature extraction | `ssm.ts` | Hann-windowed radix-2 FFT per ~1s frame; magnitude bins folded into a 12-bin pitch-class chroma vector, L2-normalized |
| N×N SSM computation | `ssm.ts` | `S[i][j] = cosine(chroma_i, chroma_j)` over all frame pairs |
| Novelty curve | `ssm.ts` | Gaussian-tapered checkerboard kernel correlated along the diagonal (Foote section detection) |
| Canvas2D heatmap render | `page.tsx` | Matrix-resolution `ImageData` → scaled blit, gamma-boosted stripes, playhead crosshair, hover/click highlights, axis labels |

All rendering is **Canvas2D only** — no WebGL/WebGPU/shaders, no external npm deps, no API route.

## Named reference (ambition criterion #3)

Jonathan Foote, **"Visualizing Music and Audio using Self-Similarity"**, ACM Multimedia
(1999/2000) — the foundational SSM paper. The checkerboard-kernel novelty score is also
from Foote's "Automatic Audio Segmentation Using a Measure of Audio Novelty" (2000).

Recent revival work nodded to in the notes panel: **SSM-Net**, and **"Generating Music with
Structure Using Self-Similarity as Attention"** (arXiv, 2024).

## A genuinely new use of his recording

Most prototypes granulate or re-pitch the audio. This one instead **reveals its
structure**: it treats his performance as a signal whose form can be measured and drawn,
then lets you click the drawing to audibly confirm a repeat. The recording is the subject
of analysis, not raw material to be chopped.

## How it degrades without network

In a dev container with no network, the read-only GET to `/api/audio/<id>` returns null.
The app then synthesizes a ~36s piano-ish phrase via `OfflineAudioContext` with an explicit
**A · B · A** form (a C-major figure, a contrasting A-minor figure, then the A figure again).
The SSM therefore still shows genuine off-diagonal recurrence stripes, and a visible
`text-amber-300/95` notice reads *"Using a synthesized stand-in (his recording unavailable
here)."* The piece is **never silent or blank**.

## Ambition criteria hit

- **#2 — ≥3 distinct subsystems:** audio load/playback + chroma extraction + N×N SSM +
  novelty curve + Canvas2D heatmap + click-to-resynthesize interaction (six in total).
- **#3 — named reference:** Foote (1999/2000), cited above and in the in-app design notes.
- **New use of his recording:** structural analysis (reveal the form), not granulation.

## House-constraint notes

- `"use client"` at top of `page.tsx`; default-export React component.
- `AudioContext` / `OfflineAudioContext` constructed only inside the play handler, after a
  user gesture, guarded by `typeof window !== "undefined"`.
- No `any` types; helpers named `draw*` / `compute*` / `make*` / `run*` (never `use*`).
- `getContext("2d")` null-checked then narrowed to `CanvasRenderingContext2D`.
- Cleanup on unmount: rAF cancelled, all audio sources stopped, `AudioContext` closed.
