# 15920 · duetlink

**The one question:** What if two people, in two different places, could conduct
ONE of Karel's real piano recordings together — each shaping a different voice of
the same take, so the mix is a shared gesture?

This is the dream lab's **first multi-user (peer-to-peer) prototype**. Two
participants join one synchronized session. Karel's single real recording plays,
split into a **LOW voice** (bass/pad) and a **HIGH voice** (melody). The **host**
conducts the low voice, the **guest** conducts the high voice, and each
participant's pointer live-shapes their voice while both peers see both cursors
and hear both voices in sync. The combined result is a two-person duet performed
on a single take.

## How the two voices split from ONE take

One real track is fetched and decoded once (`loadRealTrackBuffer`, Karel's
verified Welcome Home / Snowflake catalog only — no synths, no oscillators). That
single `AudioBuffer` feeds **two** `AudioBufferSourceNode`s that are *started at
the same synced instant*, then routed through a Linkwitz-Riley-style crossover:

- **Low branch:** two cascaded Butterworth low-pass filters (Q = 0.707) at
  ~420 Hz (an LR4 corner), then an expression low-pass whose cutoff the host's
  cursor sweeps, then a stereo panner and gain.
- **High branch:** two cascaded high-pass filters at the same ~420 Hz corner,
  then a peaking "colour" filter the guest's cursor sweeps, then a panner and
  gain.

Both branches sum into the shared ear-safety master (`createSafeMaster`), whose
analyser also drives the visuals. Each cursor maps **x → colour filter + stereo
pan** (a spatial axis) and **y → gain + a gentle ±2.5% `playbackRate` lean**. The
lean is deliberately small so the two voices stay time-aligned to the shared
clock while still carrying an expressive, hand-played micro-phrasing.

## How the shared clock keeps both peers aligned

Transport lives in the shared `_shared/peerSync` module. It layers an NTP-style
ping/pong over whichever channel is live, so `sync.now()` returns the *same
millisecond* on every peer (host-authoritative; ± a few ms). Synchronized
playback works like this:

1. The host picks an instant `S = now() + 600ms` (a lead so both peers can
   schedule) and a buffer offset `O`, and broadcasts `{t:"play", S, O, trackId}`.
2. Each peer schedules its two sources via
   `source.start(ctx.currentTime + max(0, (S − now()))/1000, O)`, so Karel's take
   starts sample-close on both machines.
3. The host re-broadcasts its current position every ~2s as an `anchor`; a guest
   who joins mid-piece starts from the live offset and catches up. This is
   RTCP-style periodic **re-anchoring** applied at the app layer to prevent
   drift.

## Transport + fallback design

Three transports behind one API, chosen for how far apart the two people are:

- **Two same-browser tabs (the guaranteed review path):** `sync.startLocal()`
  runs a BroadcastChannel. The tabs share the OS wall clock, so the clock offset
  is 0 by construction and sync is instant. This runs automatically on load — the
  moment a second tab opens, one becomes host (low voice) and the other guest
  (high voice). This is how the piece is meant to be demoed.
- **Two remote machines:** a real **WebRTC `RTCDataChannel`** with no signaling
  server — the host creates a self-contained ICE-complete offer code, the guest
  pastes it and returns an answer code, and the data channel carries cursors,
  play anchors, and the clock ping/pong.
- **Solo (one visitor):** if no peer ever connects, an **auto-partner ghost
  cursor** breathes the unclaimed voice with gentle Lissajous idle motion, so a
  single visitor still hears and sees the full two-voice duet. The transition to
  a real second peer is seamless — the ghost simply yields once a live cursor
  arrives.

## Visual / output

Primary surface is **raw WebGL2** (three.js is installed but not needed here).
The two voices are drawn as two intertwining ribbons whose form is driven by the
master analyser and each owner's cursor; both peers' cursors are luminous points
with additive trails (a translucent fade quad each frame). The palette is
**cold / achromatic** — the low voice is cool blue, the high voice cool white,
over a near-black steel ground, with the Resonance violet reserved for chrome.
Canvas2D is a graceful fallback only when WebGL2 is unavailable.

## References

- **Networked music performance** research on latency tolerance — the finding
  that small, bounded timing offsets are musically acceptable, which is what
  makes a data-channel duet feasible without a media server.
- The **`RTCDataChannel` + NTP-style clock-offset** pattern that is the 2026
  browser consensus for collaborative audio: anchor playback to a shared
  transport position rather than streaming audio between peers.
- **RTCP-style periodic re-anchoring:** re-estimating the offset / re-broadcasting
  transport position on an interval to keep two independent clocks from drifting.

---

`input: multi-user peer cursors (WebRTC/BroadcastChannel) · output: WebGL2 dual-ribbon · technique: peer clock-sync + dual-voice crossover of one take · palette: cold/achromatic`
