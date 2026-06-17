# Pulse Ring

**Route:** `/dream/694-pulse-ring`

## What it is

One spinning clock, shared by everyone in the room. A glowing playhead hand sweeps
around a circular ring once per bar (~2 seconds). Each participant is a colored
percussion **voice** (low tom, woodblock, high bell, rim, shaker) and drops rhythmic
**beads** at angular positions on the ring. As the hand passes a bead, that bead's
voice fires.

The twist: every player can choose their own **subdivision** of the ring — 8, 12, or
16 slots. When patterns built on different subdivisions overlay on the *same* rotating
clock, you get emergent **polyrhythm and phasing**: a 12-against-8 cross-rhythm, a
16-note shaker shimmer drifting against a 3-feel bell line. The groove is not authored
by any single person — it is the sum of what the group puts on the ring.

## How to use it

1. Press **▶ Start the ring** (this creates the AudioContext inside your tap, which is
   required on iOS/Safari).
2. **Tap on the ring** to drop a bead for your current voice at that angle. **Tap your
   own bead again** to remove it.
3. Pick **Your voice** and **Your subdivision** (8 / 12 / 16) to change what and where
   you can place.
4. Toggle the **Drone** for a low A root under the groove (body only — the subject here
   is rhythm, not harmony).
5. **Open a second browser tab** (same browser) to `/dream/694-pulse-ring` to add a
   second player. The badge flips from amber *"playing solo"* to emerald *"N players on
   the ring"* the instant a real peer is heard, and both tabs share one clock and one
   ring.

If you open it alone, after ~3 seconds two **ghost players** (bots) join and lay down
complementary subdivisions — a 12/8 bell timeline plus an 8-feel pulse and a 16-note
shaker — so a lone visitor immediately hears a living polyrhythm to add to. After ~2.5s
of no interaction, an **auto-demo** evolves your own beads on a loop so a hands-free
glance stays alive with sound and motion. Ghosts vanish the moment a real peer arrives.

## The technique

- **Shared rotating clock.** A single bar-length revolution; a beat-zero **epoch**
  (in `performance.now` space) is broadcast so every client's hand points the same
  direction at the same instant. Late joiners adopt the earliest epoch and align.
- **Networked-control (not networked-audio).** Following the 2026 collaborative-web-music
  principle, only lightweight control events cross the wire over
  `BroadcastChannel("resonance-pulse-ring-694")`: presence (hello/present/bye), epoch
  resync, and conflict-free bead add/remove. No audio is ever transmitted.
- **Conflict-free shared state.** Beads are a set keyed by `(voice, slot, subdivision)`;
  add and remove are **last-write-wins** by timestamp. On join, a client requests full
  state from peers and replays it.
- **Local synthesis, phase-locked.** Every client synthesizes its own audio from scratch
  with the Web Audio API (tuned one-shot percussion per voice), driven by a ~25ms
  look-ahead scheduler. Because all clients share the same epoch, the same beads fire at
  the same wall-clock moments — everyone hears the same combined ensemble.
- **Master chain (ear-safe):** `gain (≤0.4) → lowpass(~9kHz) → DynamicsCompressor
  (-18dB, 4:1) → destination`.
- **Rendering:** Canvas2D only, one `requestAnimationFrame` loop mutating refs (React is
  not re-rendered per frame). Full teardown on unmount (cancel rAF, broadcast "bye",
  close the channel, close the AudioContext, clear all timers).

## Named references

- **Steve Reich's phasing** — *Clapping Music* (1972) and *Drumming* (1971), where
  identical or simple patterns at slightly different rates drift in and out of phase to
  generate shifting composite rhythms. Choosing different subdivisions on one shared ring
  is a discrete, multiplayer cousin of that idea.
- **West-African bell-pattern timelines** — the *gankogui* bell and the *clave/standard*
  timeline that anchor an ensemble's polyrhythm. The default ghost-player bell line uses
  the classic 12/8 timeline (slots 0,2,3,5,7,8,10), the same role a timeline bell plays
  in Ewe/Yoruba drumming.

## Honest limit

`BroadcastChannel` is **same-origin and same-browser** — it connects tabs/windows on one
machine, not separate devices. A true multi-device "shared ring" would require a transport
like **WebRTC** or a **WebSocket** relay to carry the same control events. The architecture
here (broadcast control, synthesize locally, share one epoch) is deliberately the same
shape that such a transport would use, so it would port directly.
