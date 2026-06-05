**For**: kids (4+) · **Route**: `/dream/334-kids-pass-the-song` · **Cycle**: 334

# Pass the Song 🎶

**Two children, two tablets (or two browser tabs) in the same room, pass a
glowing creature back and forth and TAKE TURNS adding notes to build ONE shared
song together.** No reading, no winning, no "wrong" note — just a creature that
flies between friends carrying a melody that grows.

## What's novel

This is the lab's **first multi-user / turn-taking / collaborative KIDS piece.**
The lab's only prior server-less collaborative work, `319-hub-score`, is an adult
just-intonation ensemble. 334 borrows that piece's "no server, just same-origin
tabs gossiping over a `BroadcastChannel`" lineage but inverts the model: instead
of a *continuous shared field* that everyone holds at once, 334 is a **turn-based
relay** — exactly one child "holds" the creature at a time, adds one note, and
hands it across. That hand-off is the whole point.

The pedagogy is **Reggio Emilia "group synchrony / joint attention"**: two kids
making one artifact together, turn by turn, each one's contribution visibly
becoming part of a shared thing. It is **call-and-response** structured as a
physical-feeling pass — the creature flying off your edge and arriving on your
friend's opposite edge gives the abstract idea of "your turn / my turn" a body.

## How to play

1. Press **▶ Start**. The AudioContext + microphone are created inside that tap
   (required for iOS Safari). A soft D drone fades in — it never goes silent.
2. The glowing creature is on **your** screen first ("Your turn!").
3. **Give it a note** two ways:
   - **Hum or sing** — live pitch detection snaps your voice to the nearest
     D-major scale degree and that becomes the creature's note (primary input).
   - **Tap** one of the eight big glowing color-spots (each ≥64px) to pick a
     note instead — the always-available fallback.
4. Tap **✨ send to friend**. The creature **flies off the screen edge** toward
   your friend, carrying the updated song over the `BroadcastChannel`.
5. On the friend's tab the creature **arrives flying in from the opposite edge**,
   it's now their turn, and the **song ribbon** (a row of colored note-beads,
   one bead per turn) is shown identically on both screens.
6. Every **4 turns** the whole accumulated ribbon **plays back** as a little song
   the two kids built together.

## How the BroadcastChannel turn-passing works (`sync.ts`)

A single uniquely-named channel, `resonance-pass-the-song-334`, carries two kinds
of traffic:

- **Presence** — on Start each tab sends a `ping` and replies to others with
  `pong`, then heartbeats a `ping` every 1.5s. The first answer tells a tab a
  **real partner** exists (and gives it the partner's id).
- **The pass** — when you send the creature, the holder posts a single `pass`
  message containing the full new `SongState` (the whole bead ribbon + the id of
  whose turn it now is + which edge the creature arrives from) and a **revision
  counter**. The receiver only accepts a `pass` addressed to it with a *higher*
  rev, so late or duplicate messages reconcile cleanly. There is no server and no
  clock-sync handshake.

The shared scale + snapping live in `sync.ts` too, so both tabs agree on exactly
what note each bead means.

## How the solo robot-friend fallback works

Karel reviews on his phone at 6:30am with **one tab open**, so the whole
pass-back-and-forth must be demoable solo. If no real partner answers within
**~4 seconds** (or any time the child is alone), a **robot friend** takes the
other side:

- The creature flies off your edge as usual.
- After a short "thinking" beat (~0.9–1.4s) the robot **chooses a tasteful
  in-scale note** — a neighbour, third, or fifth of your last note, never random
  noise and never out of key — plays it, appends its bead, and **flies the
  creature back** to you.

So a single person sees the *entire* loop and the song still grows. A badge shows
who you're with: violet **"Playing with a friend 👫"** when a second tab is
present, amber **"Playing with the robot friend 🤖"** in solo/demo mode.

## Scale & sound design (`audio.ts` — safe for small ears)

- **D major over an always-on D drone** — *not* the overused C-major-pentatonic.
  Seven diatonic degrees of D major (D E F♯ G A B C♯) plus the octave D′, rooted
  at D4 (~294 Hz) so it sits sweetly for small voices. A soft D drone (root +
  fifth + octave, gentle vibrato) is always sounding underneath, so it's never
  silent and **nothing a child gives is ever "wrong."**
- Everything is **synthesized Web Audio**: bell/triangle note voices, click-free
  glides via `setTargetAtTime`, and a **brick-wall `DynamicsCompressor` limiter**
  on the master so there are no sudden loud transients or harsh highs.
- Every tap or sung note answers with **sound + visual within ~50ms** (the
  creature recolors to the chosen note and pulses).
- **Renderer is inline SVG** (no Canvas2D, no three.js): the creature, its aura,
  and the fly animation are driven by mutating SVG attributes inside a single
  `requestAnimationFrame` loop — the React tree is not re-rendered per frame. The
  bead ribbon is plain DOM since it only changes once per turn.

## Privacy & safety

The microphone is **analysis-only** — its stream feeds an `AnalyserNode` that is
never connected to the output, never recorded, never stored, never transmitted.
All mic tracks are stopped on unmount and the AudioContext is closed. If the mic
is denied or unavailable, a readable rose notice appears and play continues with
the tap spots + robot friend — the screen is never blank and nothing throws.

## Kids design rules honored

No reading required (icons + bold saturated color per note, characters not text);
tap-targets ≥64px with generous spacing; immediate response every time; **no fail
states / no "wrong" — only "different"**; looping drone so it never feels broken.

## References / lineage

- **`319-hub-score`** — the lab's first server-less multi-tab piece; 334 reuses
  its `BroadcastChannel`, D-root, and revision-counter patterns (re-implemented,
  not imported) and turns the *continuous ensemble* into a *turn-based relay*.
- **Reggio Emilia** "group synchrony / joint attention" — two children making one
  thing together, turn by turn.
- **Call-and-response** pedagogy — the pass embodies "your turn / my turn."

## Honest status

**Build-verified, not browser-verified.** `npm run build` (Next.js + TypeScript +
ESLint) passes for this route; full teardown (cancel rAF, post `bye` + close
channel, stop mic, close AudioContext) is wired on unmount.

**Unverified (no live browser/device run):**
- Real two-tab passing on actual devices — the presence handshake, `pass`
  reconcile, and arrival edges are logically correct but untested across two live
  tabs; only the solo robot path was reasoned through end-to-end.
- Microphone autocorrelation pitch accuracy with a real child's hum (gate
  thresholds and the 7-frame sustain may want tuning on-device).
- iOS Safari AudioContext/mic-in-gesture behavior and exact tap-to-sound latency.
- Playback-every-4-turns scheduling overlap on very long ribbons.
