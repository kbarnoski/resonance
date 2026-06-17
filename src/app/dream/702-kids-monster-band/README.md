# 702 — Kids Monster Band 🥁👹

**The one question:** *What if two little kids on two phones build ONE goofy
monster groove together — a beat neither could make alone?*

A kids multi-user music toy (built for a 4-year-old). Two browser tabs/phones
open the **same URL** and join the **same monster room** over
`BroadcastChannel` — same-origin, **no network, no server, no API route**.
Both devices are phase-locked to **one shared 16-step loop (~96 BPM)** and the
two players' taps overlay into a single emergent groove. It is a real *groove*
built by tapping — emphatically not chords or a tonal cadence.

## How two kids play

1. One kid taps **▶ START THE BAND** on their phone. A big googly orange
   monster appears — that's "YOU".
2. They tap the four giant buttons — **🥁 BOOM** (belly drum), **📯 HONK**
   (silly mouth), **🫧 POP**, **🌀 BOING**. Each tap drops that sound onto the
   nearest of the 16 loop steps and it **loops forever**.
3. A second kid opens the **same page** on another phone and taps START. A blue
   monster pops in next to the first — now there are two monsters in one band.
4. Each kid's taps add to the *shared* groove. Every monster **squashes and
   bounces on every hit — including the friend's hits**, so each kid can SEE
   their friend playing in real time.

No reading required: big icons, big colors, big bounce. Tap targets are ≥96px,
audio responds in <100ms, and everything is routed through a lowpass +
compressor at a gentle master gain (~0.3) so nothing is harsh or loud.

### Solo fallback (one device)
If no second player is present, a friendly **👻 ghost friend** monster
auto-plays a complementary pattern so the duet idea is fun and obvious from the
first second. There's also a **~2.5s idle auto-demo**: if nobody taps, the YOU
monster seeds a little starter beat so the screen is alive before anyone
touches it. The ghost steps aside the moment a real friend joins, and returns
if the friend leaves.

## The technique

- **Shared-clock 16-step groove scheduler.** The first player to start claims a
  beat-zero **epoch** (a `performance.now()` timestamp) and broadcasts it.
  Joiners adopt it; ties resolve last-write-wins toward the *earliest* epoch so
  both devices converge on the same beat zero. Each device then schedules its
  own audio **locally** against that epoch with a Chris-Wilson-style
  **look-ahead scheduler** (~25 ms tick, ~120 ms look-ahead). Audio is never
  streamed between tabs — only the epoch + patterns cross the channel, which is
  what keeps the two loops phase-locked.
- **Presence + beads sync over `BroadcastChannel`.** We broadcast join/leave
  (`hello`/`welcome`/`bye`), the shared epoch, and each player's full 16-step
  pattern per voice. Patterns are **conflict-free last-write-wins** (an
  incrementing rev per sender; each player owns their own beads). A presence
  timeout (~1.6 s of silence) flips the room back to the ghost friend.
- **Local Web Audio synthesis.** Every monster voice is a short, gentle
  FM/noise burst (no samples, no network): BOOM is a low sine thump, HONK is a
  triangle+FM down-glide, POP is a band-passed noise blip, BOING is a rubbery
  sawtooth up-glide. The two monsters are detuned ±6% so they sound like
  siblings, not clones.
- **three.js via @react-three/fiber** renders the bouncy 3D monsters with
  squash-and-stretch envelopes driven by each hit's timestamp.

## Named reference

- **Toca Band** (Toca Boca) — the friendly, no-reading, tap-a-character-to-add-
  a-part music toy this is modelled on.
- **Yamaha Tenori-on** — the 16-step grid sequencer whose looping
  light-up-a-step interaction inspired the shared step loop.
- **The Hub / The League of Automatic Music Composers** — the pioneering
  networked ensembles (1970s–80s) where players' machines passed musical data
  to build a piece together. Here the "network" is just same-origin
  `BroadcastChannel`, but the idea — *an ensemble nobody could play alone* — is
  theirs.

## Next-cycle deepening ideas

1. **More monster characters & a third+ player.** Generalise presence beyond
   two: each joiner gets their own colored monster in a curved row, with
   per-player voice palettes so a trio builds a fuller groove.
2. **Tempo/feel knobs the kids can grab.** A big "faster/slower" lever and a
   "swing" wobble that re-broadcasts as part of the shared room state — so the
   whole band changes feel together, still phase-locked.
3. **Real cross-device transport (LAN/WebRTC) behind the same model.** Keep the
   exact same epoch+pattern sync, but swap `BroadcastChannel` for a tiny
   signaling layer so two kids on *different* phones across the room (not just
   tabs) can jam — the scheduler and last-write-wins beads stay identical.
