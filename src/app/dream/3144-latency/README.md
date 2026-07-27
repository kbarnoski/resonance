# 3144-latency — Latency Canon

## What is this

A networked-performance prototype that treats the round-trip delay between two
players as **musical material** instead of a defect. A shared transport spins a
Canvas2D rhythm wheel: one revolution is one bar (4 beats) at 90 BPM, and a
playhead sweeps the sixteenth-note grid. Every note drops a mark at the
playhead's angle; the measured network latency is snapped to the nearest
rhythmic subdivision (1/32 … 1/4) and drawn as the angular **gap** between a
note and its delayed echo — so the lag reads as a deliberate canon interval.
When taps land on the grid, notes and echoes interlock into an even, ringing
figure; when a tap lands off-grid, its echo smears off the beat and the pattern
frays. That mismatch is the instrument, and the human's decision — *when* to tap
— is a rhythmic choice that can be wrong.

## How to play

1. **Solo (default, no second device).** Press **Start** to unlock audio. A
   seeded auto-partner is already looping a phrase on the inner ring, and every
   note answers itself one canon-interval later, so the canon is audible and
   visible immediately with zero interaction. Tap the wheel or press any key to
   drop your own notes on the outer ring. Tap *on* a tick to interlock; tap
   *between* ticks and the figure frays and the center "lock" glow dims.
2. **Re-measure the link.** Drag the **latency** slider (40–320 ms). A seeded
   ping/pong loop measures the round trip continuously — the raw milliseconds
   wobble with injected jitter, while the snap engine locks the echo onto the
   nearest subdivision. A faint pre-snap **ghost** shows where the raw arrival
   landed; the solid echo shows where the snap put it.
3. **Invite a second device (opt-in).** "Invite a partner" opens a serverless
   WebRTC handshake via manual SDP copy-paste: one player creates an offer and
   sends the SDP text to a friend; the friend pastes it, generates an answer,
   and sends it back. Their taps then land on the inner ring in real time
   (public STUN only, no signaling server, no api route).

## Reference

- **NIME 2025, paper 69 — "Exploiting Latency in the Design of a Networked Music
  Performance."** The organizing idea: rather than chase zero-latency, design
  *with* delay so it becomes structure.
- **The ~25 ms Ensemble Performance Threshold** — below it players synchronize
  naturally; above it, lag must be made into material or it destroys ensemble.
- **Chafe / CCRMA** latency-accepting networked ensembles (JackTrip) — accepting
  and composing around delay across the network.

Here the round trip is quantized into a canon: measured, snapped to a beat
subdivision, and rendered as the interval between a note and its answer.

## Subsystems integrated

- **WebRTC data channel** (`net.ts`, `RtcPeer`) — manual-SDP, serverless — with
  a seeded **`LoopbackPeer`** stand-in that echoes taps back at an adjustable
  round-trip latency + jitter, so the piece is fully playable and reviewable on
  one headless device.
- **Latency measure-and-snap engine** (`wheel.ts`, `snapLatency`) — ping/pong
  RTT measurement smoothed with an EMA, snapped to `CANON_STEPS`.
- **Web Audio pluck synth** (`audio.ts`, `PluckSynth`) — triangle+sine partials,
  a fast gain envelope and a lowpass sweep, plus a beat-synced feedback delay
  for canonic space. Consonant D-pentatonic pitch set: rhythmic stakes, not
  melodic — every subdivision maps to a good note, so only *timing* can be off.
- **Canvas2D rhythm wheel** (`wheel.ts`, `drawWheel`) — grid, playhead,
  local/remote bands, canon-gap arcs, pre-snap ghosts, and a lock-driven hub.

## Determinism / safety notes

- All randomness is seeded `mulberry32` (auto-partner phrase, loopback jitter,
  peer id); no `Math.random`. All timing uses `performance.now()` and
  `AudioContext.currentTime`; no `Date.now` / `new Date`.
- `AudioContext` is created only inside the Start gesture. Teardown cancels the
  rAF, clears intervals, closes the AudioContext, the LoopbackPeer, and any
  RTCPeerConnection, and removes listeners.

## Honest limits (what can't be verified headless)

The real two-phone path (`RtcPeer`) can't be exercised in this sandbox: there is
no second browser, and STUN/NAT traversal depends on the network between two
real devices. It is written defensively — non-trickle ICE so a single SDP paste
carries every candidate, try/catch around every handshake step, and a fallback
that returns the app to loopback on any failure or disconnect — but the genuine
device-to-device canon is **unverified** here. Everything reviewable runs through
the loopback + seeded auto-partner, which is the intended demo and is the part
that must (and does) read as a legible canon on one device.
