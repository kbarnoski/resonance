# Roundtable

One of Karel's real piano takes is laid around a **ring** — angle is position in the piece — and a **playhead** sweeps that ring in synced time, landing on the same instant for every listener in the room. Each present listener tends a **window**: an arc of the ring centered on their pointer. The collective "coverage" is the **union** of everyone's arcs, and the take is only fully heard where the room, together, is covering it. A solo listener can illuminate one slice at a time; a full room, spreading out, keeps the whole piece alive. Cooperative, not competitive.

**Status**: cycle 2 of a 3-cycle build — demoable

## How the coverage → sound rule works

Everyone hears the **same** thinning and filling, because the rule is computed identically on every peer from the same shared arcs and the same shared playhead:

- When the sweeping playhead is **inside** the room's covered region → the take plays at full presence: the gain opens to full and the low-pass sits wide open (~14 kHz).
- When the playhead is in an **uncovered gap** → the take dims: the gain ducks (to ~0.22) and the low-pass closes (~720 Hz), so the piece literally thins out where no one is attending.

Both transitions use `setTargetAtTime` (~0.1–0.12 s) on a gain node and a low-pass cutoff, so there is no zipper noise or hard jump — the piece breathes between lit and dim. The only audio source is one decoded real recording from Karel's verified catalog (`loadRealTrackBuffer`), played back through a single looping `createBufferSource`; the whole chain terminates in the shared ear-safety master bus (`createSafeMaster`), never the raw destination, and its analyser drives the glow. There are no oscillators, no noise, no synth.

A readout (`covered: 64% · harmony: N% · attention: N% · present: N · lit / in a gap`) makes the shared logic legible: coverage is the fraction of the ring the union of arcs covers, `harmony` is the fraction two or more arcs cover together, `attention` is your own earned-width level, `present` is the live listener count, and the state is whether the playhead is currently lit or in a gap. Because the same arcs reach every peer, these readouts — and the audio — match across the room.

## Cycle 2 — attention earns coverage, overlap earns harmony

Cycle 1 gave every listener a fixed window and a binary lit/gap rule. Cycle 2 makes **what you do in the room matter**, in two ways that are both computed identically on every peer (so see == hear still holds):

- **Attention earns coverage.** Your window is no longer a fixed fifth of the ring. It is **narrow when you are restless and widens the longer you settle on one stretch** (dwell integrates toward full over ~5.5 s of stillness below ~16°/s of angular motion, and decays faster when you move). The earned width is streamed in the same `arc` message, so everyone sees everyone else's attention — a room that each settles into a part covers far more than a room that darts around. Your `attention` readout and the brightness of your own arc track it.
- **Overlap earns harmony.** Where **two or more** windows stack on the same stretch, the take **gains a voice**: a second `AudioBufferSourceNode` of the *same recording*, detuned **+1200 cents (one octave up)**, soft-filtered (~5.2 kHz low-pass) to a halo, its gain normally ~0 and swelled to ~0.34 (`setTargetAtTime` ~0.18 s, click-free) exactly when the shared playhead crosses a doubly-covered region. Because an octave is a 2× playback rate, the halo realigns with the main voice at each loop boundary — it is consonant by construction, never a detuned clash. Visually, the overlap draws a brighter seam over the coverage union and the playhead blooms a second ring as it crosses it. Stacking attention doesn't just keep the piece alive — it enriches it.

Both voices (main + octave halo) still terminate only in `createSafeMaster`; the octave voice is Karel's own recording resampled, never a synth tone, so ABSOLUTE rule 10 holds.

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
- **Joint listening raises interpersonal synchrony** — Curzel, Tillmann, Fournel, Novembre & Ferreri, *"Joint music listening enhances interpersonal affective and neural synchrony"* (LEAD / Univ. Pavia, published 24 Feb 2026; fNIRS hyperscanning of friend dyads). Listening *together* increased how closely two partners' continuous pleasure tracked each other and raised their interpersonal neural synchrony. Cycle 2's "attention earns coverage, overlap earns harmony" is an artistic enactment of that finding: the piece rewards — and is enriched by — the room attending *together*, on the same stretch, rather than apart.
- **Mezcal: A Collaborative Transmission Art Instrument** (NIME 2026) — an always-on browser WebRTC instrument where visitors are auto-joined into one shared session and **no single person controls the mix**. The same design stance as roundtable: the collective, not any individual, shapes the sound.

## What is cycle 3 (planned, not built here)

- **A "the room completed the piece" moment** — when the union covers the whole ring, a held, celebratory full-presence state.
- **Host migration** — graceful hand-off of the transport anchor when the host leaves, so the room survives departures.
- **A hand-driven arc** (camera as a secondary layer over the catalog audio, per the embodied directive) — conduct your window with an open/closed hand instead of a pointer.
