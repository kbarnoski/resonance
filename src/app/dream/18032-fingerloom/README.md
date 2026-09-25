# 18032-fingerloom — your ten fingers each hold a strand of your own recording

**Status**: wip — builds clean and the full control path is code-traced (per-finger flexion → per-voice gain → audible + visible), but the live per-finger calibration and the by-ear balance of ten simultaneously-bloomed bands are **unverifiable headless** (no camera/speakers in the cloud). Needs Karel's ~30-second webcam check: does the ten-finger orchestration track, and does curling a finger cleanly silence its strand? The per-finger calibration constants (straightness 0.66–0.97, thumb abduction 0.52–1.12) are reasoned for a seated desk webcam and may want a small nudge in real testing.

## What it is

A per-**finger** orchestration conductor. One of Karel's real piano takes (default
*Welcome Home*) loops and is split into ten parallel band/voice strands spanning
bass → air. Each of your ten fingers articulates ONE of those voices
independently: **curl a finger to silence its strand, extend it to let that
strand bloom.** Your two open hands orchestrate the full spectral texture; a
closing fist collapses the piece to a single quiet core voice that is always
alive.

The conducted musical parameter is **orchestration / voice-articulation density**
— which strands of the recording sound, and how brightly — driven by the flexion
of each of the 10 fingers, read *independently*. This is deliberately distinct
from prior two-hand position/openness pieces: it never uses the shared
whole-hand `open` scalar.

## How it works

- **Input:** webcam → MediaPipe `HandLandmarker` with `numHands=2` (21 landmarks
  per hand) via the shared `createHandTracker` / `startCamera`. Hands are pinned
  to stable slots by handedness (Left → low strands, Right → bright strands), so
  a given finger always drives the same voice.
- **Per-finger reader (the heart of the piece):** `readFingerExtensions` computes
  ten independent curl/extension scalars from the 21 keypoints. For the four
  fingers it uses a scale-invariant **straightness ratio** — the direct
  MCP→TIP distance over the summed joint-segment path (MCP·PIP·DIP·TIP), ≈1 when
  extended and dropping toward ~0.5 when folded. For the thumb it uses its
  **abduction** (tip → index-MCP distance normalised by palm size). Fully curled
  ≈ 0, fully extended ≈ 1.
- **Audio (Karel's real catalog only):** `loadRealTrackBuffer` decodes one real
  take; a single looping `AudioBufferSourceNode` feeds ten parallel `bandpass`
  filters (log-spaced centres 100 Hz → 8.6 kHz, Q rising toward the top) each
  into its own gain, plus a low-passed always-on **core** bed. Finger extension →
  that voice's gain (upper bands scaled up so extending them adds real air).
  Every audible node terminates in `createSafeMaster(ctx).input`; all gain moves
  use `setTargetAtTime(target, now, 0.12)`. No oscillators, noise, or synths —
  only the decoded real buffer.
- **Output:** Canvas2D loom of ten luminous filaments (no three.js). Each warp
  strand's brightness / thickness / turbulence tracks its voice's gain; woven
  weft threads and the knots where they cross active warps brighten with the
  orchestration; overall motion energy is driven by `safeMaster.analyser`. A
  ten-bar strand-level readout gives always-visible per-voice feedback.
- **Palette:** cool bioluminescent — teal-cyan filaments to pale-bone highlights
  on a near-black deep-sea field (raw hsl/hex in the art). No violet, no amber.
  UI chrome uses Resonance semantic tokens only.

## The technique

Real-time articulated-hand control of a musical instrument from a single RGB
camera: the 21-keypoint hand skeleton is estimated every `requestAnimationFrame`
(no async in the control path), and per-finger joint geometry is turned into ten
continuous control signals with ~0.1–0.15 s smoothing. This is the per-finger,
21-keypoint realtime pipeline behind camera-driven virtual instruments — see
**IJFMR 2026, "Real-Time Gesture Recognition for Virtual Musical Instruments."**
Where prior lab pieces mapped a single whole-hand openness or two-hand position,
Fingerloom decomposes the hand into ten independent articulators, one per voice.

## Audio / rule-of-10 note

Ten voices, ten fingers, one-to-one. All ten band voices plus the core bed route
exclusively through `createSafeMaster` (never `ctx.destination`); the safe-master
limiter and low-pass cap keep the summed strands tame no matter how many bloom at
once. Degradation is graceful throughout: an autonomous labelled demo keeps the
strands breathing before any hand appears, a pointer "bloom cursor" opens and
closes voices when the camera is denied or unavailable, and a `text-destructive`
lost-state prompts the viewer to show their hands. Full teardown on unmount stops
the camera tracks, closes the tracker, cancels the RAF, disconnects every node,
and closes the AudioContext.
