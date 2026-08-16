# 14128 · choirtabs

**The one question:** What if you and your other browser tabs/devices became a
live CHOIR singing your own recorded piano as a canon — every voice locked to one
shared clock, entering in staggered rounds?

Every open tab of this page becomes ONE voice in a canon of Karel's real recorded
piano. Open it in two or more tabs (or two windows/profiles in the same browser)
and each tab adds a voice; even a single tab is fully demoable, because within
~1 second it auto-spawns 2–3 virtual voices so the canon is audible and visible
immediately. Real tabs join and replace those stand-ins as they open.

## How the shared-clock canon works

The model is **synchronized local-engine**, not shared-instance. Every tab runs
its OWN Web Audio graph and plays the WHOLE choir locally. Tabs never stream audio
to each other — they exchange only tiny state (presence, each voice's chosen track
and canon delay, the transport, and clock ticks) over a single same-origin
`BroadcastChannel("choirtabs")`. **Broadcast control, not audio.** What keeps every
local engine phase-locked is one shared clock.

**Leader election.** Each tab picks a probabilistically-unique id (from
`crypto.randomUUID()`, else a `crypto.getRandomValues` string, else a
`performance.now()`-seeded counter — never `Math.random`/`Date.now`, which the
determinism gate bans). The lowest id is, by unanimous agreement, the **leader**.
It owns the tempo. Leadership is emergent and self-healing: close the leader's tab
and the new lowest id simply starts ticking, carrying its already-tracking beat
forward.

**The clock.** The leader broadcasts a periodic `tick` carrying the continuous
beat position (~every 200 ms). Followers treat a tick's *arrival* as "the beat is
this value right now" — BroadcastChannel delivery on one device is effectively
instantaneous — and extrapolate locally between ticks off `performance.now()`.
Drop a tick and a follower free-runs at the same tempo until the next one, so the
clock degrades softly instead of stalling. (We can't share an epoch across tabs:
each document has its own `performance.now()` origin, so we sync on message-arrival
events, not absolute timestamps.)

**The gapless canon.** Each voice loops a phrase of the real recording. We **never**
set `source.loop`. Instead a ~100 ms lookahead scheduler queues successive
`AudioBufferSourceNode`s so each phrase starts exactly on its beat boundary; target
beats are converted to `AudioContext.currentTime` via the delta from now, and an
**equal-power crossfade** (sqrt curves via `setValueCurveAtTime`) covers the seam.
A voice's **entry delay** (in bars) offsets its phrase-start grid: it stays silent
until its entry, then loops. Different delays put voices at different points in the
same phrase — a true round. All audio routes through the ear-safety master
(`createSafeMaster`), never `ctx.destination`; visuals read its analyser.

**The visual field** is WebGL2: a cool violet/ice field of glowing voice-columns +
orbs, each flaring on its own canon onset, with your voice ringed, the leader's
column tinted cyan-ice, and a horizontal pulse sweeping on the shared beat. It
degrades to a notice (audio keeps playing) where WebGL2 is unavailable.

## Named references

- **Canon / round** — the centuries-old imitative musical form where a melody is
  sung against a delayed copy of itself.
- **"Broadcast control, not audio"** — the sub-50 ms multiplayer model of
  browser-collaborative sequencers (e.g. shared online-sequencer / jam patterns),
  where clients exchange only small state and each renders sound locally, rather
  than streaming audio between peers.
- **`11888-chorusrooms`** — the lab's own zero-server, leader-elected shared-clock
  ensemble. This piece is its lineage descendant and *fixes* it: chorusrooms sang
  through synthesized oscillator voices; choirtabs sings Karel's REAL catalog.

## Honest limitations

- **BroadcastChannel is same-browser only.** "Devices" here means separate
  windows, tabs, or profiles in the *same browser on one machine*. True
  cross-device sync (phone + laptop) needs a WebRTC or WebSocket relay with a
  signaling/clock server — out of scope this cycle.
- **Each tab needs its own user gesture** to start audio (browser autoplay
  policy), so a freshly opened follower tab shows the field immediately but only
  sounds after you press Join in it.
- **Phrase looping is time-based, not beat-detected.** The phrase window is a fixed
  musical length of the recording, not an onset-aligned musical phrase, so the
  round is rhythmic-by-clock rather than transcribed.
- Per-tab audio may differ by a few milliseconds of scheduling jitter; this is
  inaudible and self-correcting as ticks re-anchor each follower.
