# 302 · Mirror Canon (Round)

**Conduct a four-voice round sung entirely by past versions of yourself.**
Perform a body-phrase, tap to commit it, and a new past-you enters a few beats
later singing the *same* material in **canon** — until you have built and
conducted a stacked round (Frère Jacques / Frippertronics) of your own selves
in a matte wooden mirror.

This piece extends the standout **287-mirror-choir** (body-pose → vocal-formant
choir + matte wooden mirror). The 287 engine is **re-implemented here** (in
`pose.ts` + `audio.ts`, not imported from 287) and a new layer is added on top:
a **stacked-round canon-memory engine**.

---

## What it is

- **Input:** your body, via the camera. MediaPipe Pose Landmarker (Lite) tracks
  33 landmarks in real time. Hand height → pitch (a D-Dorian chord stack); body
  openness (wrist span vs. shoulder span) → vowel; raised hands → energy/level.
- **Output:** a **matte wooden mirror** — a tessellated grid of warm amber tiles
  on near-black. Pure Canvas2D `source-over` (no additive, no glow, no bloom, no
  three.js). Your live silhouette is the brightest amber reflection; each
  committed canon voice is a dimmer, distinctly-**tinted** ghost-silhouette of a
  past-you, fanned across the mirror so the stacked round reads as a row of your
  selves.
- **Synthesis:** a Klatt-ish formant vocal choir — a `sawtooth` glottal pulse
  (plus a second pulse a fifth up) split into three parallel `bandpass` formant
  filters (F1/F2/F3, Q 9–12), summed to a gain, faded by a conduct fader. An
  always-on warm sine **pad** (D2/A2/D3/A3) keeps it from ever being silent. The
  whole master runs through a `DynamicsCompressor` limiter so the round can
  **never** get loud or harsh. All parameter changes glide (`setTargetAtTime`).

## The new layer — stacked round / canon memory

- A steady **bar clock**: 4 beats at 72 BPM, so one **bar ≈ 3.3 s** is one loop.
- The primary button — **"Add a voice to the round"** — records the live
  **parameter stream** (pitch / vowel-openness / register / energy / pose, at
  `FRAMES_PER_BAR = 96` snapshots) for exactly one bar, then commits it as a
  **canon voice**. Recording the parameter stream (not audio) is lighter and
  cleaner: it is replayed through a fresh formant voice.
- **Canon entry:** each committed voice enters offset by a fixed number of beats
  from the previous one (`CANON_OFFSET_BEATS = 1`, i.e. voice _n_ enters _n_
  beats late). All voices share **one locked bar grid** — no drift. This is a
  true round / canon, the deliberate contrast to a phasing version.
- **Conduct controls:** per-voice **mute** and **solo** (faders glide, no
  clicks), plus voice count and a **Clear round** control. Cap of **4 voices**.
- The piece **accumulates**: it is genuinely different and fuller at minute two
  than at second five. That evolving state is the point. No fail state, no score.

## How it works (subsystems)

| File | Role |
| --- | --- |
| `pose.ts` | Landmark indices, D-Dorian table, Klatt/Peterson-Barney formant tables, one-pole landmark smoothing, ghost keyframes (idle + a distinct performance set), and `extractParams` → the `ParamFrame` we record/loop. |
| `audio.ts` | Formant `ChoirVoice` builder, the live voice + 4 canon voices + sine pads, `DynamicsCompressor` limiter, gentle tape-style delay (Frippertronics nod), `applyVoiceParams` (gliding), and `setVoiceFader` (mute/solo). |
| `page.tsx` | The bar clock, recording → commit, canon-offset playback (`sampleLoop` at `barPhase − offset`), conduct UI, and the `drawMirror` wooden-mirror renderer. |

## How it degrades

- **No camera / MediaPipe blocked / no pose within ~3 s** → a **ghost
  performer** loops a hand-authored keyframe phrase and drives the *identical*
  choir + mirror + canon pipeline. It also **auto-commits two voices**, so the
  whole round demos itself on a phone with zero sensors. The reason is shown in
  readable `text-rose-300`.
- The MediaPipe module loads at runtime from the **jsDelivr CDN** via a
  `webpackIgnore` dynamic import, so the build stays clean and **no npm
  dependency is added**.
- AudioContext + camera request both happen **inside the Begin tap** (iOS-safe).
- `OffscreenCanvas` / `getImageData` for the live-video silhouette is wrapped in
  try/catch; on failure the silhouette falls back to the landmark-hull ellipse.
- No API route, no network beyond the MediaPipe CDN, no secrets, nothing
  uploaded.

## Named references

- **Daniel Rozin, _Wooden Mirror_ (1999)** — the matte, tile-based,
  source-over-only mirror aesthetic (no glow).
- The **musical round / canon** tradition — *Frère Jacques*, *Sumer Is Icumen
  In* — staggered entries of the same material.
- **Frippertronics / Robert Fripp** tape looping, and the gentle feedback delay.
- **Pauline Oliveros, _Deep Listening_** — the meditative-ritual, embodied vibe.
- The **loop-pedal one-person-choir** tradition — Jacob Collier; Ariana Grande's
  BOSS RC-505 — stacking yourself into an ensemble.
- **LUMIA** (arXiv:2512.17228, Dec 2025) — embodied looping system.

## What's unverified

- **MediaPipe CDN load reliability** is the main risk: the model + wasm are
  fetched at runtime, so a slow or blocked CDN can delay or prevent camera mode.
  This is handled by the 3-second pose probe → ghost fallback, but the camera
  path itself was not run end-to-end in a real browser here.
- Audio/visual behaviour was verified by lint + full TypeScript typecheck only;
  it was **not** auditioned live, so exact loudness balance, formant intelligi-
  bility, and the visual fan-spread of ghosts may want tuning on real hardware.
- The recording begins from wherever you are in the current bar (it does not
  hard-snap to the next downbeat) and captures one full bar of phase; this is
  musically fine for a round but means the first beat you hear back may differ
  from the exact gesture-start.

---

## Multi-cycle commitment — this is cycle 1 of a thread

This piece is **cycle 1** of the "Mirror Canon" thread (itself a deepening of
287-mirror-choir). It was the winner of a DEEP fire whose parallel sibling —
**Mirror Canon (Phasing)** — is already built and banked as the planned
**cycle-2 deepening**:

- **Cycle 2 — Phasing mode.** Add a Steve Reich *Piano Phase* mode: instead of
  the locked bar grid, each committed voice plays at a *slightly* different loop
  rate (`length × (1 + N·0.012)`) so the past-yous gradually drift in and out of
  phase with one another and the live performer — the piece never repeats and is
  genuinely different at minute 2 than at second 5. A mode toggle (Round ⇄ Phase)
  lets the conductor choose a locked round or an evolving phase-cloud. The sibling
  prototype implemented the full phasing engine + a phase-spread HUD; fold it in
  here as a second mode rather than a separate piece.
- **Cycle 3 — polish.** On-hardware tuning of loudness balance / formant
  intelligibility, downbeat-snapped recording, and the ghost fan-spread.

Banked in `docs/dreams/IDEAS.md` (cycle 303 entry).
