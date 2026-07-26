# 2912 · Ensemble

**The one question:** *What if two people on two different devices could reach
into ONE shared resonant instrument in the browser — with no server — and hear
each other play it in real time?*

Ensemble is a shared rack of 22 plucked strings. Each connected player is a
colored presence (a shade of the violet ramp). Drag across the rack and you
excite the field at that spot; a partner on another device hears the same pluck
and sees the ripple bloom in your color, and vice-versa.

## The load-bearing idea: control events, not audio

Nothing streams audio over the network. Only compact **control events** cross
the wire:

```
{ type: "pluck", player, stringIndex, x, velocity, t }
{ type: "cursor", player, x, y, t }
```

Each browser re-synthesises the sound **locally** from those events with a
Karplus–Strong plucked string (`audio.ts`). The payload is *intent*, not sound,
so there is no audio streaming, no TURN/relay, and latency stays low. This is
the **"synchronized local engine"** model.

Because every pluck funnels through one `excite()` function whether it came from
your own pointer or off the wire, a local pluck and a remote pluck are
indistinguishable to the synth and the visuals — the whole point of the model.

## Three connection tiers — one shared protocol

1. **Seeded ghost partner (default, always works).** On Start a virtual second
   player driven by `mulberry32(0x2912)` joins and plucks the field with
   human-ish phrasing, so the piece is alive and duetting immediately — even
   solo, even headless. This is the deterministic review stand-in. (`makeGhost`
   in `net.ts`.)
2. **Local duet — BroadcastChannel loopback.** Press *Local duet*, then open the
   page in a second tab on the same machine. A `BroadcastChannel` links the two
   tabs and they exchange the identical pluck/cursor events; the ghost steps
   aside once a real tab links. (`makeLoopback`.)
3. **Cross-device WebRTC (no signalling server).** Press *Cross-device*, *Copy
   invite* on the host (offer + gathered ICE onto the clipboard / into a
   textarea), paste it on the second device to produce an *answer*, and paste
   the answer back. An `RTCDataChannel` then carries the same events between two
   real devices with no server in the middle. (`makeWebrtc`.)

All three speak the exact same `NetEvent` protocol and land in the same
`handleRemote` → `excite` path.

## Sound & visuals

- **Synth (`audio.ts`):** offline Karplus–Strong buffer per string + a light
  shared feedback-delay tail for a communal, roomy resonance. Velocity controls
  gain and brightness (a per-voice low-pass), pitch pans slightly with x.
- **Pitch:** rises *continuously* with the string's y position
  (`F_MIN → F_MAX`, log scale). Deliberately **not** snapped to a tidy
  just/tempered scale — the field rings in free ratios.
- **Visuals (SVG-DOM):** a bounded pool of `<path>` strings, `<circle>` ripples,
  and `<g>` presences is created once and mutated by ref every frame — nodes are
  never created/destroyed in the animation loop.
- **Palette:** calm violet field on dark; you are core violet, the partner is a
  shifted magenta-violet. No strobe/flicker.

## Determinism & graceful degradation

`performance.now()` for all timing; `mulberry32` for all randomness on the sim
path (ghost timing + KS excitation noise) — no `Math.random` / `Date.now`. The
piece is fully demoable with no network peer and no permissions: tier-1 keeps
the duet running. If `BroadcastChannel` or `RTCPeerConnection` is unavailable, a
calm notice appears and the ghost duet continues. The `AudioContext` is created
only after the Start gesture and is torn down (rAF cancelled, context closed,
channels/peer/BroadcastChannel closed) on Stop and unmount.

## Named reference

The **"synchronized local engine / control-events-not-audio"** networked-music
model (Cornelljam), in the lineage of **Chris Chafe & SoundWIRE** telematic
music at CCRMA.

## Ambition-floor criteria hit

- **Novel technique for the lab:** first WebRTC / multi-user piece here.
- **≥3 distinct subsystems:** WebRTC/BroadcastChannel transport + local
  Karplus–Strong synth + shared SVG-DOM visualization + serverless manual-SDP
  pairing.
- **Named reference:** synchronized-local-engine model (Cornelljam); Chris Chafe
  & SoundWIRE telematic music.

## Files

- `page.tsx` — UI, SVG field, pointer input, engine orchestration, three tiers.
- `audio.ts` — Karplus–Strong synth + shared delay tail.
- `net.ts` — event protocol, ghost, BroadcastChannel loopback, WebRTC link.
- `strings.ts` — field model, continuous pitch map, `mulberry32`, palette.
