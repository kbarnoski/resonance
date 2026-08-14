# 11888 · Chorus Rooms

**What if a Resonance listening room spanned every open browser tab/window as a
single synchronized instrument — with no server at all?**

Every open tab of this page is **one voice** in a shared ambient canon. Tabs on the
same device and origin discover each other over the browser's zero-server
`BroadcastChannel`, stay phase-locked through a **leader-elected shared clock**, and
each renders the *whole* room in its own Web Audio graph. Move your pointer to shape
your voice's timbre and pan; open a second window and you literally add a player to
the room.

- **Route:** `/dream/11888-chorusrooms`
- **INPUT:** pointer / touch + cross-tab messages (`BroadcastChannel`) — no server, no API route
- **OUTPUT:** inline SVG-DOM — a calm room of participant orbs + a shared phase ribbon
- **TECHNIQUE:** `BroadcastChannel` leader-elected shared-clock ensemble sync; each tab = one placed voice in a common bar/canon; pointer → that voice's timbre/pan
- **PALETTE:** pale jade / moonstone orbs on a deep verdant slate room
- **POLE:** cosmic-ambient — a calm shared room, not intense

## How the sync works

**Two architectures, one choice.** Browser networked music tends to fall into one of
two shapes: the **shared-instance** model, where one audio engine is streamed/shared
to everyone, and the **synchronized local-engine** model, where every client runs its
own identical engine and only small control state is exchanged, kept together by a
shared clock. This prototype implements the **synchronized local-engine** model over
`BroadcastChannel` — no WebRTC, no signaling, no backend.

**Transport (`room.ts`).** Tabs exchange only tiny messages on a same-origin
`BroadcastChannel`: `hello` (a new tab announces itself), `state` (pointer position +
liveness heartbeat, ~1/s and on movement), `downbeat` (the conductor's bar marker),
and `bye` (clean departure). No audio is ever sent between tabs.

**Leader-elected shared clock.** Every tab advances its own bar phase at a fixed tempo
off `performance.now()` (a 7-second bar). The tab with the **lowest id** is, by
unanimous agreement, the **conductor**; on each bar wrap it broadcasts a `downbeat`.
Because `BroadcastChannel` delivery on one device is effectively instantaneous, each
follower treats a downbeat's arrival as "phase ≈ 0 right now" and gently nudges its
local bar-start into agreement. Miss a downbeat and a tab simply free-runs at the same
tempo until the next one — so it degrades softly. Leadership is emergent and
self-healing: close the conductor's tab and the new lowest id starts conducting.

**The canon (`voice.ts`).** Each tab renders the whole room — self, peers, phantoms —
as its own voices: two lightly-detuned oscillators → lowpass → amplitude envelope →
stereo panner → the shared safe-master limiter (never the raw context output). A voice
**sounds once per bar**, exactly when the shared phase sweeps past its canon slot, so
many tabs weave a slow round. There is no independent drone — silence between entries,
continuity from the canon's long overlapping tails. Your **pointer** sets only your own
voice's brightness (height → filter cutoff) and pan (width → stereo position); peers
shape theirs and send the numbers over.

**The picture (`render.tsx`).** A deep slate room holds one jade/moonstone orb per
participant, placed where that voice's pointer sits; the orb blooms on its canon entry.
The **shared phase ribbon** along the bottom shows the playhead sweeping 0→1 each bar
with a tick per voice — put two windows side by side and the playheads move in
lock-step. That is the synchronization, made visible.

## Muted-06:30 phone stand-in

A lone, muted tab is never a static page and never a self-playing wash. From mount,
`demo.ts` seeds **three phantom residents** (deterministic `mulberry32`, seed `0x11888`)
that drift their pointers on slow incommensurate tides and hold stable canon slots and
pitches — so within ~1s a full, living room is visible with zero audio and zero peers.
Tap **Join the room** and that same room immediately sounds as an ensemble. When real
tabs open, the phantoms recede so the room is carried by the people in it.

## Named reference

The two architectures of browser networked music — **"shared-instance" vs.
"synchronized local-engine"** — as framed in the IRCAM Forum article *"WebRTC and the
Web Audio API as a Real-Time Collaborative Performance Environment"* and SoundBridge's
2026 collaborative-DAW guide. This prototype implements the **synchronized
local-engine** model, but carried over `BroadcastChannel` instead of WebRTC — trading
cross-network reach for a genuinely zero-server, same-device instrument.

## Honest limits

- **Same origin, same device.** `BroadcastChannel` only connects tabs of the same
  origin in the same browser profile on one machine. This is a room you fill by opening
  windows, not a room across the internet — that is the whole point of the "no server"
  constraint, and also its ceiling.
- **Message-timed sync, not sample-accurate.** The shared clock corrects on downbeat
  arrival; scheduling is at the millisecond scale of message delivery and `rAF`, not
  sample-locked. For a slow ambient canon this is inaudible, but it is not a
  tight-transient groove machine.
- **No BroadcastChannel → solo.** If the API is missing, the tab runs the seeded
  phantom room alone with an on-brand notice; it never throws.
- **Bounded voices.** The local graph caps at nine voices, keeping many-tab rooms cheap.

## Files

- `page.tsx` — client page: rAF loop, participant merge, pointer input, chrome, notes.
- `room.ts` — `BroadcastChannel` transport + leader-elected shared clock.
- `voice.ts` — the local ensemble engine (one Web Audio graph per tab).
- `demo.ts` — seeded phantom room + stable slot/pitch assignment.
- `render.tsx` — inline SVG room of orbs + the shared phase ribbon (all art color here).
- `types.ts` — the shared `Participant` vocabulary.
- `prng.ts` — `mulberry32`, string hash, math helpers (no platform RNG / wall clock).
