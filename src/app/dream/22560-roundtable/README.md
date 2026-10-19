# Roundtable

One of Karel's real piano takes is laid around a **ring** — angle is position in the piece — and a **playhead** sweeps that ring in synced time, landing on the same instant for every listener in the room. Each present listener tends a **window**: an arc of the ring centered on their pointer. The collective "coverage" is the **union** of everyone's arcs, and the take is only fully heard where the room, together, is covering it. A solo listener can illuminate one slice at a time; a full room, spreading out, keeps the whole piece alive. Cooperative, not competitive.

**Status**: cycle 3 of 3 — demoable (the first claimed multi-cycle build in the lab's history to reach cycle 3)

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

## Cycle 3 — the room survives, completes the piece, and can conduct by hand

Cycle 1 built the skeleton; cycle 2 made what you do in the room matter. Cycle 3 finishes the arc with the three things a shared room needs to feel whole — all still computed identically on every peer, so see == hear holds throughout.

- **The room completes the piece.** When the union of everyone's windows covers nearly the **whole ring** (≥ 98.5% coverage, releasing below 92% so it doesn't flap at the boundary), the breathing stops: the take is held at **full presence everywhere** — no more thinning in the gaps, because there are none — and a slow, celebratory bloom lights the ring while the readout reads *the room completed the piece*. It is the reward the cooperative thesis was building toward: not any one listener, but the room together, keeping the whole piece alight. The climax is a pure function of the shared arc set (`coverageFraction`), so it engages and releases on the same frame for every peer, and the hold you *hear* is the bloom you *see*.
- **The room survives a departure (host migration).** The transport anchor is held by one peer at a time — peerSync elects the lowest-id peer as host. When that host leaves, it sends a goodbye, the survivors drop it, and the **next-lowest id automatically becomes host**; the keeper simply keeps re-broadcasting the *same* anchor, so the take **never restarts** — the piece plays straight through the departure. A **silence backstop** covers an abrupt tab-close that sends no goodbye: if no anchor has been heard from another peer for 5 s, the lowest *live* peer (by recently-heard arc) takes over. Both rules are pure functions of shared state, so every peer agrees on exactly one keeper. Whoever takes over sees *"the room kept the piece going — you're hosting now"* and a `hosting` / `listening` chip in the readout, so the hand-off is legible rather than invisible.
- **Conduct your window by hand (optional camera layer).** Press *Conduct with hand* to turn on a MediaPipe one-hand tracker. Your hand **reaches toward the part of the ring you tend** — the hand's direction from center maps to the ring angle (0 = straight up, clockwise), smoothed with a ~0.12 s time constant so the response is immediate but not twitchy, and it drives the **same arc the pointer does**. The catalog audio is untouched; the hand is purely a control layer over it (the sanctioned camera-as-control pattern, ABSOLUTE rule 10 safe — the camera opens with `audio: false`). A steady hand naturally lets your window widen (the cycle-2 attention engine reads the now-steady arc); a restless hand narrows it. Tracking state is **always labelled on screen** (`hand · conducting` vs a `text-destructive` *no hand — reach into frame · pointer still works*), and the pointer remains the default and the fallback in every state.

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
- **Leader election for peer-to-peer applications** — *ZePoP* (arXiv:2308.02795) and Raft-style timely-failover tuning (*Dynatune*, arXiv:2507.15154) — the distributed-systems lineage for host migration: one elected coordinator, graceful hand-off on departure, a timeout backstop for an ungraceful one. `[older, foundational]` — roundtable's migration is the browser-room, shared-clock instance of this, done at the app layer over peerSync's lowest-id election.
- **Real-time embodied audio coupling** — *Sonic-AMG: Streaming Human Motion Generation from Spatial Audio* (arXiv:2610.13300, 12 Oct 2026) — contemporary streaming work coupling spatial audio and human motion in real time. Cycle 3's hand-conducting is the mirror direction (motion → the shared arc → the catalog audio's coverage), and its streaming/low-latency framing is the quality bar the ~0.12 s smoothing aims at.

## Cycle 3 degradation (added this fire)

- **Camera denied / model fails to load / no hand** → the pointer keeps full control and the status line says so (`camera off — pointer conducts` or `no hand — reach into frame · pointer still works`). Hand conducting is strictly additive; the piece is fully playable without ever turning the camera on.
- **Host leaves abruptly (no goodbye)** → the silence backstop promotes the lowest live peer within ~5 s, so the take keeps playing; the clean goodbye path is near-instant.
- Camera + tracker are released on unmount and on *Stop camera* (all tracks stopped, landmarker closed, `srcObject` cleared).

## Verification note

The primary path — pointer + the same-browser two-tab room — is exact and fully verifiable, including cycle 3's completion climax (spread two tabs' arcs until `covered` nears 100% → the piece holds and blooms) and host migration (close the host tab → the other keeps playing and flips to `hosting`). The **hand-conducting** layer cannot be verified from a headless cloud (no webcam to point at), and the cross-machine WebRTC clock offset still wants a two-device check — both are called out for Karel's ~30-second review; neither blocks the pointer/two-tab experience.
