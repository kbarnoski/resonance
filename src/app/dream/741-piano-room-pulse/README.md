# 741 — Piano Room Pulse

**The one question:** Two phones on the same room code are ~80–150ms apart over
the network — too far apart to play tight rhythm by raw reflex. What if both
devices estimated their clock offset (NTP-style) and gently locked BOTH players
onto ONE shared, slowly-drifting pulse — so a real ensemble **LOCK** emerges
across the room despite the latency?

This is the musical-ensemble-lock champion of a 3-way exploration of the same
transport. The distinguishing subsystem is a **shared-clock sync**.

## How the lock works

You cannot beat network latency by reacting faster. So neither device tries.
Instead both agree on a **timeline** and place every note on it — the
Ableton-Link idea applied to two phones in a room.

1. **Clock offset (NTP-style, over the WebSocket).** Phone A's `Date.now()` and
   Phone B's are not the same wall clock. Peers exchange `ping{t0}` →
   `pong{t0, t1}` over the Supabase channel. The asker measures:

   ```
   rtt    = t3 − t0                  // round trip (t3 = my now on return)
   offset = t1 − (t0 + rtt/2)        // peer clock − my clock at the midpoint
   ```

   Offsets from the lowest-RTT samples are trusted most and folded into a
   slewed weighted mean, so the estimate is stable and drifts rather than jumps.
   `sharedNow() = localNow() + offset` → a clock both peers read the same value
   from. (See `clock.ts`.)

2. **One shared metronome, derived not transmitted.** Both devices hardcode the
   same epoch + BPM (68, a gentle felt groove). Given one shared clock, both
   compute the *identical* `beatPhase(now)` with pure arithmetic — the
   breathing pulse needs no messages once the clock is locked.

3. **Gentle quantization.** When you strike a note, its scheduled sounding time
   is snapped to the nearest shared **sub-beat** (1/2 beat) with a small
   humanize jitter (~11ms) so it feels alive, not robotic. We broadcast the
   note + its **shared-clock target time** — never audio. The receiver converts
   that target back into its own local clock and schedules the partner's note
   onto the SAME grid. Even with 100ms+ latency, both notes land locked to the
   pulse instead of smearing.

Both devices render their own + the partner's notes locally through one
electric-piano voice — **you** warm amber/rose, panned left; the **partner**
cool cyan/violet, panned right.

## What you'll see and hear

A warm dark piano room with a 4-char room code (auto-friendly, or type your
own to match a friend). An always-on breathing D-Dorian pulse bed. A three.js
**pulse ring** that swells on every shared beat — your notes bloom warm on the
ring, the partner's cool, both riding the same pulse. The ring glows emerald
once the duet clock is **LOCKED**. No WebGL → a minimal inline Canvas2D ring.

**Input is a real keyboard first:** Web MIDI (`requestMIDIAccess`, note-on
`0x90`, emerald device badge, `onstatechange`), then the computer keyboard
(`a s d f g h j k l` across D Dorian, `w e t y u o` passing tones, `z`/`x`
octave), then the on-screen piano as touch fallback. Every pitch is snapped to
**D Dorian** — nothing is ever out of tune.

## Bulletproof solo glance

When you're alone, after ~2.5s idle a **ghost partner** auto-plays D-Dorian
phrases locked to the same shared pulse, in the cool color/pan — so the screen
is always sounding and visibly a locked duet with zero setup and zero network.
The ghost steps aside the instant a real partner joins.

## Transport

Supabase **Realtime Broadcast** — a genuine cross-device WebSocket pub/sub. The
client is built lazily inside a handler, never at module top. Room code = the
channel suffix. Presence → "partner in the room — locked & live". **No database
writes, no API route** — Broadcast is ephemeral pub/sub. The anon key is a
`NEXT_PUBLIC_*` value (public by design). Missing env or any failure →
graceful solo mode with a calm amber notice; the solo experience always works.

If `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set, open
the page on two devices with the same room code to hear the real lock.

## References

- **Ableton Link** — agree on a shared timeline, not on individual hits; the
  core inspiration for the shared-clock ensemble sync here.
- **NTP / clock-offset estimation over a WebSocket** — the ping/pong
  offset + RTT math used to build `sharedNow()`.
- **Google Chrome Music Lab — "Shared Piano"** — collaborative web piano in a
  room; the spiritual ancestor of the room-code duet.
- **JackTrip / Chris Chafe (CCRMA, Stanford)** — networked-ensemble research on
  playing music together across real internet latency.

## Files

- `page.tsx` — UI, gesture/iOS unlock, MIDI + keyboard + on-screen input, ping
  loop, ghost partner, animation loop, full teardown, Canvas2D fallback.
- `clock.ts` — NTP-style offset/RTT estimation + the shared metronome &
  quantization (the heart of the build).
- `audio.ts` — electric-piano FM/additive voice + always-on D-Dorian pulse bed;
  precise sample-accurate scheduling on the shared grid.
- `room.ts` — Supabase Realtime Broadcast transport (note + ping + pong +
  presence), all failures → solo.
- `scene.ts` — three.js breathing pulse ring with warm/cool note blooms; full
  GPU teardown.
