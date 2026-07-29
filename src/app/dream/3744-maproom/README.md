# 3744 · Maproom

**The operator monitor of a many-surface Resonance install.** A flattened 3×3
grid of every projection surface in a venue as a live tile — each tile a
*different* audio-reactive pattern — plus a Resolume-style cue/mix bar. Every
tile is locked to **one deterministic shared "now,"** so the whole room breathes
together.

The one question it answers: _What if a Resonance installation ran across many
surfaces at once — N projection walls / N phones on N walls — all showing
different content but sharing one clock, so the whole room pulses as one?_

## How to use it

1. **Start the wall** — one gesture creates the `AudioContext`, starts the
   generative bed, and launches the video wall. It opens in **AUTO**: a seeded
   autopilot walks the cue list (Load-in → Build → Peak → …) so a hands-off
   reviewer with no hardware sees the wall pulse together and hears the bed.
2. **Take over** — press **1–5** or click any cue button to jump scenes. The
   first human key/click flips **AUTO → YOU**.
3. **Master fader** scales overall intensity; **BPM** readout is top-right.
4. **Click a tile** to solo it full-screen (preview one wall); click again,
   press **S**, or **Esc** to return to the wall.
5. **Design notes** (bottom-right) opens a summary of this document.

Watch the **downbeat sweep**: a bright band crosses the *entire* wall once per
bar, and a flash pulses on every beat. Because it lands on every tile at the
same instant, it is the visible proof that all nine surfaces share one clock.

## The deterministic shared "now" (the whole point)

All tiles read one beat clock, integrated from wall time:

```
beat += (performance.now() - lastPerf) / beatMs   // beatMs = 60000 / bpm
```

Every pixel a tile draws is a **pure function of `(surfaceIndex, beat, seed)`**
via `mulberry32(seed)`. There is *no* per-tile randomness that isn't derived
from the shared seed + beat — particle positions, plasma phases, pluck pitches
and pad chords all fall out of `mulberry32` fed a key built from the seed and
the beat/bar index.

The consequence, and the jury provocation: **two browsers given the same seed
(`0x3744`) and a synced wall-clock render the byte-identical frame** — with no
network traffic between them. So this single-browser demo *is* a preview of a
synchronized multi-wall / N-phone installation. The seed is shown in the cue
bar; syncing a second device means agreeing on that seed and a shared `t0`.

### Why this is a multi-wall / N-phone substrate

Networked video walls normally push frames or state over the wire. Here the
"state" is just `(seed, t0, bpm, cueId)` — a handful of scalars. Given those,
each surface computes its own frame locally and independently, yet they stay
frame-locked because they're evaluating the *same pure function at the same
beat*. Add a device, hand it the same four scalars, and it joins the room in
lockstep. That is the deepest form of "sync": nothing to stream, because there
is nothing that could drift.

## The audio bed

A seeded, BPM-locked Web Audio bed that **plays** (no silent piece):

- **Pad** — three detuned oscillators through a lowpass filter; the triad
  changes each bar via `chordForBar(seed, bar)` and **glides** continuously
  between chords (`setTargetAtTime`) rather than snapping.
- **Kick + pluck** — scheduled on an eighth-note grid anchored to the shared
  beat. Pluck pitches come from `pluckMidiForEighth(seed, eighth)` on a
  **diatonic** (7-note) scale with a small continuous detune — deliberately
  *not* a pentatonic safety net; the lab protects continuous pitch.
- An `AnalyserNode` reads this same signal into 16 bands, so the tiles react to
  the exact audio you hear, in lockstep with the visuals.

## The operator bar (Resolume-style)

A **cue list** of named scenes — Load-in, Build, Peak, Breakdown, Blackout —
each remaps which surfaces are *hot*, the palette energy, the tempo, and the
audio density. Keys `1..5` and clickable buttons (≥44px), a master intensity
fader, a live BPM readout (`font-mono`), and click-a-tile-to-solo.

## Named references

- **Resolume Arena** — the VJ mixer whose vocabulary this borrows: live
  audio analysis, BPM sync, surface mapping, and a cue list driving a wall.
- **teamLab Borderless** — many synchronized surfaces that together form one
  continuous world, which is the felt experience this monitor is operating.

## Faked vs real

- **Real:** the deterministic clock, the pure-function-of-`(index, beat, seed)`
  rendering, the seeded BPM-locked audio, the live analysis, the cue mixing,
  the seeded headless self-demo. All timing is `performance.now()`; all
  randomness is `mulberry32`. No `Math.random`, `Date.now`, or `new Date()`.
- **Faked / not built:** actual networking. There are no sockets, no
  timeserver, no second device. The claim is precisely that you don't *need*
  them to prove the substrate — determinism replaces the wire.

## Next-cycle deepening

- **Real clock sync:** replace the local `t0` with an NTP-style timeserver or
  WebRTC data-channel handshake so several browsers agree on wall-clock to the
  millisecond, then confirm they converge to identical frames.
- **N actual devices:** open the same route on a wall of phones with a shared
  `?seed=&t0=` in the URL; each renders one surface (or its own tile) and the
  room self-assembles.
- **Operator hand-off protocol:** broadcast only `(cueId, bpm, master)` deltas
  — kilobytes/hour — while every surface still renders locally.
- **Surface mapping:** per-device geometry so a tile can key/warp onto a real
  non-rectangular projection surface (true Resolume-style output mapping).
