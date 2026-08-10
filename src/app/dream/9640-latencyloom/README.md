# 9640 · Latency Loom

**The question:** what if a shared room let several people (or several browser
tabs) weave one piece together, and the *network latency between them* was not a
bug to hide but the instrument itself — each player's note reaching the others
late, so the room plays itself as a distributed canon?

## What it does

- **Real serverless transport.** Every open tab of this page is a live player on
  a `BroadcastChannel("dream-9640-latencyloom")`. Playing a note broadcasts a
  control message `{id, pitch, distanceMs, triggerShared}`. Open the page in two
  tabs and they genuinely play together — join/leave presence included.
- **Local synthesis (Cornelljam pattern).** No audio is streamed. Each client
  re-synthesizes received control events with `synth.ts`, so the room scales at
  zero bandwidth regardless of how many nodes are present.
- **Latency as the instrument.** BroadcastChannel is ~instant, so inter-peer
  distance is *simulated* per player. A note's onset is scheduled delayed by the
  sender's distance; the same delay animates a pulse travelling from the sender's
  node to every receiver. The local player's **distance slider (0–1200 ms)**
  re-tunes the canon in real time — the delay is the compositional control, framed
  as the instrument, not an error.
- **Shared quantization grid.** A 110-BPM, 8th-note metronome derived from
  `performance.timeOrigin + performance.now()` (Unix-ms, identical across tabs on
  one machine). A note's delayed onset is quantized *up* to the next grid tick, so
  voices always land on the grid and different distances become whole-tick canon
  offsets — musical drift, never mud.
- **Just intonation, not pentatonic.** 7-limit ratios `[1/1, 9/8, 5/4, 4/3, 3/2,
  5/3, 7/4, 2/1]` over a ~196 Hz fundamental. Each lane gets a distinct waveform,
  detune character and stereo seat so overlapping canon voices stay legible.
- **Auto-demo.** On mount, three seeded synthetic players (deterministic
  `mulberry32`) join at staggered distances and play a gentle interlocking JI
  phrase. A muted phone sees pulses crossing a living network with zero
  interaction; real tabs join alongside them.
- **Degrade.** If `BroadcastChannel` is undefined, the room runs on the synthetic
  players alone and shows the notice "Cross-tab sync unavailable — showing a
  simulated room."

## The look

A clinical, high-key network diagram — paper-white Canvas2D ground, thin dark-ink
edges and nodes. Deliberately *not* a warm particle field and *not* cosmic indigo.
When a note fires you literally see the canon offset: a pulse leaves the sender's
node and reaches every receiver over that peer's latency, lighting each node as
its audio sounds. A horizontal ruler at the bottom ticks with the shared
metronome. The single restrained accent is the brand violet (`--primary` token),
reserved for the local player's node and its pulses; every other lane is an ink
shade. Under reduced-motion the travelling dots are replaced by a soft edge tint,
keeping the diagram near-static.

## Controls

- **a s d f g h j k** — play JI degrees 1–8.
- **Tap / click the loom** — horizontal position selects the degree.
- **Distance slider** — your latency to the room; drag to re-tune the canon.
- **Start sound** — opens the AudioContext (browser gesture requirement). Visuals
  run before sound.

## Files

- `page.tsx` — transport, metronome scheduler, synthetic ensemble, Canvas2D render.
- `synth.ts` — JI tuning + per-lane local voice synthesis (routed through the
  shared safe-master bus).
- `rng.ts` — `mulberry32`, string hashing, and a one-shot `crypto` seed for the
  stable per-tab player id.

## References

- NIME 2025, *Exploiting Latency in the Design of a Networked Music Instrument* —
  native transmission delay used as a musical device.
- Oda & Fiebrink, *The Global Metronome* (NIME 2016) — a shared temporal reference
  so networked players stay locked.
- The Cornelljam local-synthesis pattern — transmit control events, synthesize on
  each client.

## Notes on safety / constraints

- Sound routes exclusively through `createSafeMaster(ctx, { gain: 0.18 })`; no
  oscillator touches `ctx.destination` directly.
- None of the forbidden randomness/wall-clock globals appear anywhere — randomness
  is seeded `mulberry32`, time is `performance.now()` / `performance.timeOrigin`
  and the AudioContext clock.
- Pure client, no API route. Self-contained; the only cross-folder imports are
  from `../_shared/**`.
