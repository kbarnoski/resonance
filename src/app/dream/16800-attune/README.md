# 16800 · attune

**Status:** Demoable. Builds clean (`npx tsc --noEmit` and `npx eslint` both pass on this file; the orchestrator runs the authoritative `npm run build`). The zero-setup two-tab path and the solo ambient-presence path are the ones I could actually exercise end to end by reading the code; the remote WebRTC copy-paste path and real cross-device clock sync are unverified here (see the honest note below).

## The one question

What if presence itself — two people simply *being here together*, listening to the same take — were the only instrument? What if the room deepens only when you attune to each other?

## What it is

A multi-user co-presence **shared-listening room**. Two people (or two browser tabs) join ONE synchronized session. Karel's single real piano recording plays in sync on both. Each participant is a soft luminous **presence** in a shared, warm, candlelit WebGL2 field.

There is **no conducting, no mixing, no note-playing** — this is deliberately *not* a performance/mixer piece (the sibling `15920-duetlink` already splits a take into two conducted voices; this is the opposite of that). It is a place of meditative co-presence. The music is identical for both listeners; the ART is the shared attention.

## How co-presence & attunement work

- Each listener's **presence** is their slow pointer position, smoothed, drawn as a warm glow. Positions stream to the peer at ~18 Hz (`{ t:"pos", x, y }`).
- A single scalar, **attunement**, is computed every frame as:

  `attunement = nearness × gentleness(you) × gentleness(them)`

  - **nearness** = 1 as the two glows overlap, fading to 0 past a ~0.42 (normalized) separation.
  - **gentleness(p)** = 1 when a presence is nearly still, fading to 0 as it moves frantically (measured as smoothed uv/sec speed, `smoothstep` between 0.04 and 0.5 uv/sec).
  - Both conditions must hold: you have to be **close together AND moving slowly** — the phenomenology of attuning.
- Attunement **rises slowly** (attuning takes patience, ~0.7/s toward target) and **relaxes faster** when broken (~2.2/s), so drifting apart or moving frantically lets the room settle back.
- As attunement rises the field **blooms**: warmer and deeper, the domain-warped fbm grows more **laminar** (coherent), a honey **bridge** filament forms between the two glows, and a shared halo grows at their midpoint.
- The shared **"room" audio** also opens with attunement — a lowpass sweeps from ~2.2 kHz up to ~14 kHz and a gentle trim lifts — so the take audibly *deepens* as you attune. This is **derived identically on both peers from the same two positions**, so it is a single shared room parameter, not a per-user mix: the music stays the same for both.
- **Solo fallback:** with no peer present, a slow **breathing ambient presence** stands in for the second person, so the co-presence idea and the attunement bloom are always visible and audible alone. The UI says so ("solo (ambient presence)").

## Chord drive

`loadTrackAnalysis(id)` gives the chord progression; the current chord is tracked by playback time (from the synced anchor `S`/`O` and `sync.now()`). The chord root nudges the hue **within the warm family** (amber → honey → rose-gold) and minor/diminished chords add a gentle shimmer. If a take has no public analysis, a small notice appears and the field drifts on a neutral warm state.

## Sync design

Transport is the shared `_shared/peerSync` module — no custom signaling.

- **Shared clock:** an NTP-style ping/pong makes `sync.now()` read the same millisecond on both peers (0 offset on the same-browser backend by construction).
- **Playback anchor:** the host picks an instant and offset and broadcasts `{ t:"play", S: now()+700, O, trackId }`; each peer schedules `source.start(ctx.currentTime + max(0,(S − now())/1000), O)`, so Karel's take starts sample-close on both. A late joiner jumps to the right offset. The host re-broadcasts an `anchor` every ~2s so drift is corrected and late joiners catch up.
- **Three transports, one API:** two same-browser tabs sync instantly over BroadcastChannel (the guaranteed zero-setup review path); two machines use a real WebRTC data channel via copy-paste SDP (the secondary "Connect a remote listener" panel); a lone visitor gets the ambient presence.

## Audio safety

Audio is Karel's **real verified catalog only** (`WELCOME_HOME_TRACKS` + `SNOWFLAKE_TRACKS` via `loadRealTrackBuffer`). The one audible path is `bufferSource → room lowpass → room gain → createSafeMaster().input`. No oscillators, no generated audio, no `ctx.destination`. Visuals are driven from `master.analyser`.

## Rendering

A single fullscreen WebGL2 fragment pass (feature-detected; a house-style `text-destructive` notice replaces the canvas if WebGL2 or shader compile/link is unavailable). Umber near-black ground; amber/honey/rose-gold presence glows with soft exp falloff; domain-warped 4-octave fbm; slow luminance drift only — no strobe, no film grain, no noise overlay. Conservative cost, targeting 60fps on integrated GPUs/phones. Full teardown on unmount: `cancelAnimationFrame`, stop/disconnect the source, `master.disconnect()`, `sync.destroy()`, delete program/buffer + `WEBGL_lose_context`, `ctx.close()`, and pointer/keeper listeners removed.

## Named references

- **Pauline Oliveros — *Deep Listening*.** The practice of listening together as a discipline (a phenomenology/practice, never a substance). This piece is a room built for that practice — attention as the instrument.
- **"Co-Sound: an interactive medium with spatial synchronization" (2026).** Co-presence plus spatial synchronization — the frame of two presences meeting in a synchronized shared space.

Framed around co-presence and shared attention, not virtuosity.

## Honest note on what's unverified

- I verified the code against `tsc` and ESLint, and traced the two-tab BroadcastChannel path and solo ambient path by reading `peerSync`/`safeMaster`/`welcomeHome`. I did **not** run the app in a browser, so the actual audio load (`/api/audio/[id]`), analysis endpoint, and the felt "bloom" are unconfirmed at runtime — the build gate is `npm run build` (run by the orchestrator), which does not exercise the browser.
- The **remote WebRTC** copy-paste path and cross-device **clock offset** are untested here; only the same-browser two-tab path (offset 0 by construction) is exercised in review.
- Attunement is computed **locally** on each peer from the two shared positions; tiny per-peer differences in the smoothed value mean the shared "room" filter can differ by a hair between machines. It's intentionally subtle and both sides watch the same two positions, but it is not sample-identical — an acceptable trade for "the room deepens as you attune" without introducing a real per-user mix.
- Presence speed uses normalized uv/sec, so the "gentleness" thresholds feel slightly different across very different aspect ratios / screen sizes; the constants (`SPEED_LO`/`SPEED_HI`/`PROX_THRESHOLD`) are tuned by feel, not measurement.
