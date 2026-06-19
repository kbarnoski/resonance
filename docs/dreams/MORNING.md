# Morning digest — last updated 2026-06-19 (UTC) · cycle 477 (adult · DEEP)

> **Two phones, one piano, in time.** Type the same room code on two devices and play Karel's piano together — and a shared clock gently locks both of you onto one pulse so it feels like one room, not two laggy browsers. It's the jury's loudest *unbuilt* ask (#4: "make a multi-user piece *actually* cross-device") finally answered — and gone deeper than a note relay.

## New since yesterday
- **🎹🔗 [/dream/741-piano-room-pulse](/dream/741-piano-room-pulse) — Piano Room Pulse.** Type the same 4-letter
  room code on **two phones** and play together — and a shared **NTP-style clock** gently locks both of you onto
  ONE drifting pulse, so a real ensemble **LOCK** emerges despite ~100ms of network latency. **Open this one.**
  The directest hit on **JURY #4** ("retire the cross-device asterisk") + the deepest on **#3** (reward depth):
  the prior cross-device piece (729) joined via a clunky manual SDP copy-paste; this joins by *typing a code*
  (Supabase Realtime — frictionless) and adds what 729 never had — a shared clock + lock, the actual hard
  problem of networked music. MIDI/computer-keyboard first; D-Dorian so nothing's ever wrong; three.js
  pulse-ring. **2 more cross-device approaches explored — see IDEAS §477.**

## How to actually try it
- **Solo (your 06:30 one-phone glance):** just open it — a *Voyager*-style ghost partner auto-plays in time
  after ~2.5s, so it's always sounding and visibly a locked duet with zero setup.
- **Real test:** open the page on two devices, type the **same room code** (e.g. `MOSS`) on each, play. (Uses
  the Supabase env you already have on Vercel; if it can't reach the room it quietly stays solo — nothing breaks.)

## Explored but banked (IDEAS §477)
- **739-piano-room-relay** ⭐ — Supabase Realtime *direct*: the reliability/frictionless champion. Lost because
  it moves notes but doesn't fight latency — without the clock, two players smear.
- **740-piano-room-portal** ⭐ — WebRTC P2P **auto-signaled over Supabase** (join by code, no manual handshake —
  kills 729's friction). Lowest latency; lost because P2P is the most fragile cross-device (STUN-only NAT risk).

## Heads-up
- **Build gate: green on code, blocked on infra (standing since cycle 472).** `npm run build` compiles +
  type-checks + lints clean, but this container's 4096-fd limit kills Next's static-gen worker (`EMFILE`) —
  **pristine main fails identically**, so it's the container, not the code. Vercel builds it fine.
- **Open thread (JURY #5):** your real *Welcome Home* piano is still only in the paths-* pieces. The obvious
  next move is to fuse it INTO this cross-device duet (739/741 base) so two people play *your* recording together.

## Open questions for Karel
- Cross-device needs a real two-phone try — does the clock lock *feel* locked by ear? Want me to resurrect
  **739** (simpler/looser) or **740** (P2P/tighter) instead?
- Next adult cycle: wire your actual piano into the duet (answers JURY #5), or keep the synth?

## Next
- Cycle 478 = **kids** (resurrect-first: `736-kids-echo-grove` ⭐ / `737-kids-memory-reef`, or 738's cycle-2).
