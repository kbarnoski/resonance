# Roundtable

One of Karel's real piano takes is laid around a **ring** — angle is position in the piece — and a **playhead** sweeps that ring in synced time, landing on the same instant for every listener in the room. Each present listener tends a **window**: an arc of the ring centered on their pointer. The collective "coverage" is the **union** of everyone's arcs, and the take is only fully heard where the room, together, is covering it. A solo listener can illuminate one slice at a time; a full room, spreading out, keeps the whole piece alive. Cooperative, not competitive.

**Status**: skeleton (cycle 1 of a 3-cycle build) — demoable

## How the coverage → sound rule works

Everyone hears the **same** thinning and filling, because the rule is computed identically on every peer from the same shared arcs and the same shared playhead:

- When the sweeping playhead is **inside** the room's covered region → the take plays at full presence: the gain opens to full and the low-pass sits wide open (~14 kHz).
- When the playhead is in an **uncovered gap** → the take dims: the gain ducks (to ~0.16) and the low-pass closes (~560 Hz), so the piece literally thins out where no one is attending.

Both transitions use `setTargetAtTime` (~0.1–0.12 s) on a gain node and a low-pass cutoff, so there is no zipper noise or hard jump — the piece breathes between lit and dim. The only audio source is one decoded real recording from Karel's verified catalog (`loadRealTrackBuffer`), played back through a single looping `createBufferSource`; the whole chain terminates in the shared ear-safety master bus (`createSafeMaster`), never the raw destination, and its analyser drives the glow. There are no oscillators, no noise, no synth.

A readout (`covered: 64% · present: N · lit / in a gap`) makes the shared logic legible: coverage is the fraction of the ring the union of arcs covers, `present` is the live listener count, and the state is whether the playhead is currently lit or in a gap. Because the same arcs reach every peer, these readouts — and the audio — match across the room.

## Synced clock & playhead

Transport is the shared `peerSync` module. Two tabs of the **same browser** sync instantly over a `BroadcastChannel` (shared OS wall clock, offset 0) — this is the primary demo path. Remote peers connect over a real WebRTC data channel with copy-paste SDP (no signaling server), and `peerSync` runs an NTP-style ping/pong so `now()` reads the same millisecond on every peer.

Playback is anchored to the shared clock, not started ad hoc: the host broadcasts `{ startAtSharedMs, offsetSec }` with a ~400 ms lead, and **every** peer schedules against its **local** AudioContext clock — `when = ctx.currentTime + max(0, (startAtSharedMs − now())/1000)`, starting at `offsetSec`. A late joiner, whose lead is already negative, starts immediately at the correct offset into the looping buffer. The **playhead angle is derived from the same shared anchor** — `pos = (offsetSec + (now() − startAtSharedMs)/1000) mod duration`, `angle = 2π · pos/duration` — so the sweep you *see* lines up with the audio you *hear*, and is identical on every peer. Each listener streams their own arc angle at a throttled ~20 Hz; stale peers (no update > 3 s, or gone from `peers()`) are pruned.

## Graceful degradation

- **No BroadcastChannel / no peers** → solo fully works, labelled honestly as `solo · open a second tab to fill the ring`. Your single arc lights its slice; the rest of the piece thins.
- **Audio fails to load** → a designed `text-destructive` notice, no crash.
- **Clean up on unmount** → the source is stopped and disconnected, nodes detached, `ctx.close()`, `ps.destroy()`, the rAF is cancelled and all intervals cleared.
- Idle / pre-start never looks blank: the ring breathes and a preview playhead sweeps before the first anchor.

## Named references

- **NTP-style shared-clock offset estimation** for networked playback — the ping/pong round-trip, min-RTT offset estimate behind `peerSync.now()` that lets every peer anchor to the same instant.
- **Browser networked-music-performance over WebRTC** — Sacchetto, Gastaldi, Chafe, Rottondi & Servetti, AES 2022, "JackTrip-WebRTC": uncompressed PCM music performance in the browser over WebRTC, the lineage for peer-to-peer collaborative audio without a server.
- The **~20–30 ms rhythmic-drift perception threshold** from networked-music-performance research, which motivates anchoring playback to a shared transport position (and periodically re-anchoring) rather than trusting free-running local clocks.

## What is cycle 2 / 3 (planned, not built here)

- **Variable arc widths earned by attention** — a window that widens the longer a listener tends it, so presence is rewarded rather than fixed.
- **Overlap = richer harmony** — where two arcs overlap, the take gains a voice (a second layer / harmonic bloom) instead of merely staying lit.
- **A "the room completed the piece" moment** — when the union covers the whole ring, a held, celebratory full-presence state.
- **Host migration** — graceful hand-off of the transport anchor when the host leaves, so the room survives departures.
