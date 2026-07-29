# 3504 · Commons

**The one question:** what if Resonance were a shared room where two people
are simply *present together in sound* — weaving lines into one drifting
harmonic field, with no score, no winner, just company?

Commons is not a duet you perform, and not a game you win. It's a room you're
*in*. Two soft glowing presences drift inside a slowly evolving chord; when
either one hums or taps, a warm tone joins the shared field, their bloom
pulses, and a filament arcs toward the other presence. Over a few minutes the
filaments accumulate into a woven, breathing cloud — the visible residue of
having simply spent time together in the same harmonic space.

## How it works

### A shared framework, not a score

The room's harmony is a fixed, deterministic eight-chord loop, all diatonic
7th chords in D Dorian (`harmony.ts`), advancing on a shared **beat index** —
a small integer, not a wall-clock timestamp. Both peers compute
`chordIndexForBeat(beat)` identically once they agree on where `beat` is (see
"Two devices" below). Every chord shares at least two tones with its
neighbour, so the loop drifts rather than jumps, and it never resolves to a
tonic — there's no cadence to "arrive" at, on purpose. No stakes, no
destination.

### Contributions stay continuous — the framework only *pulls*

A hum (mic RMS + spectral centroid as an approximate pitch) or a tap (mapped
log-scale from vertical position) produces a raw, continuous frequency. That
frequency is never snapped to a scale grid. Instead, `pullTowardField()`
bends it *softly* (blend factor ~0.38, in log-frequency space) toward the
nearest tone of the current chord — a center of gravity, not a quantizer. The
oscillator then glides (portamento) from slightly below the target up to it,
so every contribution arrives, it doesn't snap.

### The synthetic companion — company without a second human

Alone, `makeCompanion()` (`net.ts`) joins immediately. It listens for your
contributions, waits a breath (1.4–3.1s — long enough to not talk over you),
then answers with a complementary tone drawn from the current chord, biased
away from your last pitch so it leaves register space rather than doubling
you. If the room goes quiet for a while, it occasionally initiates on its
own. It never "responds correctly" or "scores" your input — it just keeps
you company.

### Self-demo — alive with nobody there

`makeAutopilot()` drives a synthetic *local* voice — a slowly wandering
melodic contour, routed through the exact same soft-pull + companion-notify
path as a real hum — whenever the real person has been idle for more than
three seconds, including the few seconds right after pressing Start. Any
real mic input or tap immediately hands control back. This is what makes the
piece reviewable headless: press Start, wait, and two presences are already
weaving with no mic, no click, and no second person.

### Two devices, no server

"Create room" builds an `RTCPeerConnection` + `RTCDataChannel`, gathers ICE,
and serializes the offer into a copyable blob. "Join room" pastes that blob,
produces an answer blob; pasting the answer back into the host completes the
handshake (`net.ts`, manual-SDP tier — the same pattern used elsewhere in the
lab for serverless pairing). Only tiny intents cross the wire —
`{kind:"contribute", pitch, strength, beat}` — never audio; each browser
resynthesises locally. On connect, the host sends one `{kind:"sync", beat,
msIntoBeat}` message so the guest can align its local clock offset to the
host's — the "small integer beat index carried over the network" the shared
framework needs. A `BroadcastChannel` "Local duet" tier is included too, for
testing the feeling with two tabs on one machine before trying a real second
device.

### Sound

Two audible layers, `audio.ts`: a four-voice triangle-wave drone bed that
sustains the current chord and glides (not cuts) whenever the harmony drifts,
and short warm contribution voices (sine + a faint upper partial) that arrive
with a half-second glide and a soft 1.5–3s decay. Both share a synthesized
convolution reverb (seeded noise impulse, ~3s tail) and a slow feedback delay
— every contribution audibly lands in the same room. Master gain is clamped
at 0.3; the `AudioContext` is only created after the Start button gesture.

### Visuals — inline SVG only

Everything is DOM-mutated `<line>`/`<path>`/`<g>` elements from fixed pools
(no element creation in the frame loop): chord-tone gridlines that
cross-fade in/out as the harmony drifts, two presence blooms that drift on a
slow deterministic sine wander and chase the pitch of their last
contribution, and a pool of fading filament paths connecting the two blooms
each time someone contributes. A radial-gradient wash breathes gently with
the beat and shifts hue slightly (271°–283°, staying inside the violet ramp)
as the chord changes.

## Named references

- **NIME 2026** (New Interfaces for Musical Expression, London, June 2026).
- **"A Design Space for Live Music Agents"** (arXiv:2602.05064) — the framing
  that ensemble music is a socially embedded practice of trust, timing, and
  mutual anticipation *within a shared harmonic/rhythmic framework*, rather
  than a series of scored, correct/incorrect moves. Commons tries to make
  that shared framework — the drifting chord, the beat index both sides
  agree on — the actual medium of the piece, not a backdrop for a
  performance metric.

## Determinism

No `Math.random()`, `Date.now()`, or argless `new Date()` anywhere. All
randomness (companion phrasing, autopilot's contour, the reverb impulse
noise) runs through a seeded `mulberry32()` (`harmony.ts`). All timing is
`performance.now()` deltas accumulated from a start timestamp captured in
the Start handler; the shared beat clock is a pure function of that elapsed
time (plus a one-time network-supplied offset once a peer connects).

## What's demoable now

- Solo: Start → companion joins, self-demo autopilot fills in within ~2s,
  two presences visibly weave with no input at all.
- Real interaction: tap the field or enable the mic and hum; contributions
  glide into the shared chord, pulse your bloom, and throw a filament at the
  companion (or your partner, once connected).
- "Local duet" (two tabs, same machine) and "Connect a room" (manual-SDP
  WebRTC, two real devices/browsers) both drive a second real presence
  instead of the companion.
- Graceful degrade: no mic → tap still works and the self-demo still runs;
  WebRTC unavailable/blocked → a calm notice, solo companion keeps going;
  mic permission denied → destructive-styled inline error, rest of the room
  unaffected.

## What a next cycle would deepen

- Pitch detection is spectral-centroid-based (from the shared mic analyser),
  which is a reasonable proxy for a hum but not a true fundamental-frequency
  tracker — a proper autocorrelation/YIN pitch detector would make sung
  melodic contours track far more faithfully.
- The beat-clock sync is a single one-shot correction on connect; a long
  session across two devices would slowly drift apart. A periodic
  resync (or NTP-style round-trip correction) would keep two real
  participants' chord changes perfectly aligned indefinitely.
- Currently caps at two presences. The same event protocol generalizes to a
  small room (3–4 people) with additional presence slots and hue
  variations still inside the violet ramp via lightness, not hue, shifts.
- The companion's "leaves space" heuristic is a simple register-distance
  filter; a version informed by real telematic-ensemble timing literature
  (rather than this piece's own approximation of it) could make its
  anticipatory quality read as more genuinely responsive over a longer
  session.

## Files

- `page.tsx` — UI, SVG field (gridlines/blooms/filaments/wash), pointer +
  mic input, the shared animation loop, WebRTC/loopback panels, notes modal.
- `harmony.ts` — the shared framework: `mulberry32`, the beat clock, the
  8-chord D Dorian progression, the soft pull-toward-field function.
- `audio.ts` — Web Audio engine: drone bed, contribution voices, synthesized
  reverb impulse, master chain.
- `net.ts` — wire protocol, BroadcastChannel loopback tier, manual-SDP
  WebRTC tier, the synthetic companion, the self-demo autopilot.
