# 13568 · Canon Circle

## The one question

**What if opening a second browser tab makes you a live second voice in a canon
built from Karel's own recorded piano — and the room automatically keeps every
voice in the same key and tempo?**

This is a multi-user / multi-tab collaborative canon. A prior lab piece did a
shared-clock canon on synthesised oscillator voices; Canon Circle replaces those
with **slices of Karel's real recordings**, which is the whole point.

## How to use it

1. Press **Begin the canon**. With a single tab you already hear a round: your
   chosen track plus two softer "ghost" voices entering on staggered beats. It is
   never a silent or dead screen.
2. **Open this same page in a second browser tab** (same origin). That tab
   announces itself over a `BroadcastChannel` and becomes a live voice in the
   canon — its ring blooms into the clock. Open a third, a fourth; each is a new
   voice. Close one and its ring fades out.
3. Shape your voice: pick your **track**, nudge your **entry beat** (±1 beat) to
   stagger against the others and open the round, set your **gain**, and
   **mute** / **solo**. Every change is broadcast to the other tabs.

Each tab plays *its own* voice locally; because all tabs are phase-locked to one
shared grid, the tabs layer into a single canon when heard together.

## The mechanism

### Leader-elected shared clock (no server)

Tabs gossip over `BroadcastChannel("dream-canoncircle")` — same origin, no
backend. On mount each tab mints a random id (from a `mulberry32` PRNG seeded by
one `performance.now()` read) and heartbeats its presence. Peers that go silent
for ~3s are dropped. The tab with the **lowest id is elected conductor** and
broadcasts one beat grid `{ bpm, epochMs }` — a tempo plus a shared wall-clock
origin (`performance.timeOrigin + performance.now()`, comparable across tabs of
one machine without ever calling `Date.now()`). Followers phase-align their
playback to that grid. If the conductor's tab closes, the next-lowest id
transparently takes over on the very next frame.

### Harmonic consensus (the research hook)

Following D. Shin's "harmonic consensus stage," the conductor fixes one master
`bpm` (seeded from the conductor's track tempo via `loadTrackAnalysis`, falling
back to 72) and one **consensus key center**. Each voice reports its track's key;
each voice is assigned the shortest semitone transpose (in ±6 semitones) that
snaps its phrase's root into the consensus key, applied with
`AudioBufferSourceNode.detune`. Every phrase is also conformed to a whole number
of shared beats (an 8-beat loop). The result: layered phrases stay consonant no
matter who joins or on which track.

### The voices

A voice loops a short region sliced from one of Karel's real tracks' decoded
`AudioBuffer`, entering on its chosen beat; with several tabs open the phrases
overlap into a Reich-style round. With one tab, two ghost voices (sibling tracks,
staggered entries) keep a canon audible; ghosts fade back as real tabs join.

### The visual

Inline SVG — a slowly rotating canon "clock." Each live voice is a concentric
ring; the swept arc and its bright petal track that voice's phrase playhead
within the loop; the petal pulses on beat onsets, driven by the shared grid and
the `safe.analyser` level. Ring hue-shade encodes which track. New tabs bloom a
ring in; departing tabs fade one out. The conductor's ring is marked, and the
center shows the live voice count. Palette: cool violet on near-black. Honours
`prefers-reduced-motion` by holding the rotation.

All audio routes through `_shared/visionary/safeMaster` (never `ctx.destination`)
and uses **only Karel's verified catalog** (`REAL_TRACKS`) — no oscillators, no
synthesised musical tones.

## References

- **D. Shin, "Real-Time Collaborative Generative Music Jamming on a Video Sharing
  Platform," Technical Disclosure Commons, Aug 5, 2026.** Its harmonic consensus
  stage projects competing user inputs into a shared harmonic space, fixing one
  unified key / tempo / chord — the direct model for the conductor's grid + key
  center here.
- **Steve Reich — phase / canon technique.** Identical looped material entering at
  offset beats to build an interlocking round.

## Demoable vs. rough

**Demoable now**

- Cross-tab presence, heartbeat, and lowest-id conductor election with automatic
  failover.
- One shared beat grid + consensus key/tempo broadcast; followers phase-align and
  auto-transpose via detune.
- Real recorded phrases from `REAL_TRACKS`, looped on an 8-beat grid through the
  safe master bus.
- Single-tab ghost fallback so a canon plays immediately.
- Live interaction: track select, ±1 entry-beat nudge, gain, mute, solo — all
  broadcast.
- Rotating SVG clock with per-voice playheads, bloom/fade, conductor marker,
  reduced-motion support.

**Rough / approximate**

- Cross-tab timing assumes tabs share one machine's wall clock (true for the
  intended "open a second tab" demo); it is not NTP-synced across devices.
- Transpose is coupled to playback rate (tape-style detune), so large transposes
  slightly shift a slice's speed. Kept within ±6 semitones to stay musical.
- Onset pulses are driven by the beat grid + analyser envelope rather than the
  per-note onset roll from `loadTrackAnalysis`.
- Phrase regions are fixed offsets per voice, not beat-detected downbeats.

## Next-cycle deepening

- Drive petal onsets from `analysis.notes[]` so each ring flashes on Karel's
  actual note attacks, not just beat boundaries.
- Beat-align phrase slices to detected downbeats/chord changes so every voice
  enters on a musical boundary.
- Add a per-voice chord report so the consensus stage resolves a shared *chord*
  (not only a key center), and let voices vote the progression forward.
- Decouple pitch from rate with a small granular/PSOLA shift so larger transposes
  stay in tempo.
- A "conductor baton" affordance: let the lead tab pull the whole room's tempo up
  or down, rippling through every follower's grid.
