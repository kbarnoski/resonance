# 17312-timeheads — two hands, two tape heads, one take: live counterpoint from a single solo-piano recording

**Status:** demoable

Route: `/dream/17312-timeheads`

## The one question

> What if each of my two hands were an independent tape head reading a DIFFERENT
> moment of the same solo-piano recording at once — so I could weave live
> counterpoint out of one monophonic take, conducting it with my bare hands via
> webcam?

## What it is

An embodied camera-conducting piece. Karel's one real piano take is loaded once
into an `AudioBuffer`. Two independent **granular playheads** read it at the same
time — one per hand — each continuously scheduling short grains (~40–120 ms)
sliced live from his recording. Your hands never make sound; they *conduct* where
each head reads, how fast, how dense, and how the two voices harmonise. One
monophonic take becomes a live two-voice canon.

Audio is 100% Karel's catalog recording (Welcome Home / Snowflake, selectable),
loaded via `loadRealTrackBuffer` and routed entirely through the shared
`createSafeMaster` ear-safety bus. No oscillators, no synthesis, no mic audio —
every grain is a slice of his take.

## The two-playhead mapping (the heart of the piece)

Two independent realtime granular streams, one per hand, both reading the **same**
buffer at independent positions. Each stream continuously schedules grains via
`AudioBufferSourceNode`, each grain with its own short gain envelope and a
`StereoPannerNode`, into a per-stream gain node, into `master.input`.

Hands are assigned to streams by `cx` ordering each frame: leftmost hand → head A
(silver), rightmost → head B (violet). Per head, per frame (smoothed):

| gesture | audio parameter |
| --- | --- |
| horizontal position (`cx`) | **playhead position** in the take (`cx∈[-1.2,1.2] → 0..duration`) **and stereo pan** (left hand pans left, right hand pans right) |
| height | grain **pitch / playbackRate** (`0.5×…2.0×`, exponential) |
| openness | grain **density** (fist ≈ 6/s … open ≈ 60/s) |
| fist | **mute** that voice (fades out; releasing brings it back) |
| vertical gap between the two hands | a harmonising **interval** on head B |

## How one take becomes counterpoint

Two heads reading one monophonic melodic line at *different* offset positions is
exactly a **canon / round**: one line, two voices displaced in time. Slide the
heads apart and you hear his take set against itself — one voice lagging in an
earlier bar while the other pushes ahead. Because pitch, density, pan and mute are
per-head, the two read as two genuinely independent voices, not one doubled
signal.

When you bring your hands together the two playheads **converge** (same buffer
position): the grain-streams braid, brighten, and collapse toward a visible,
audible unison — then diverge again into counterpoint as you separate them.

## The interval-from-gap harmonisation

Left to raw offsets, two heads at random pitches clash. So the **vertical gap**
between your two hands is snapped to a consonant interval — `[0, m3, M3, P4, P5,
M6, octave]` semitones — and applied as a `playbackRate` ratio to head B on top of
its own height-driven pitch. Small gap → near-unison; wider gap → a clean fifth or
octave above. The counterpoint therefore harmonises on purpose: the gesture that
separates the voices in register is the same one that tunes their interval.

## The visual (three.js, additive points)

`THREE.Points` + `THREE.BufferGeometry` + `THREE.PointsMaterial`,
`blending: THREE.AdditiveBlending`, `depthWrite:false`, near-black background —
two braided light-streams (head A silver, head B brand-violet, both cool/neutral).
Each grain that fires energises a mote at its head's playhead X, with Y = pitch and
brightness = amplitude; motes trail and fade (fading alpha via additive falloff —
**no** film-grain/noise pass). The take's downsampled RMS is drawn faintly as a
shared horizontal "time ribbon" so you see *where* each head reads, with a vertical
playhead marker per head. Convergence blends the two streams toward a bright braid.
Extra energy is driven from `master.analyser` (`getByteFrequencyData`). No WebGL
degrades to a Canvas2D mote render.

## The latency approach

Latency is the craft. The bar (GestureSync, ACM Multimedia Systems Conference
2026) is ~50 ms end-to-end for a gesture→audiovisual response to feel immediate.
This piece:

- **Detects on the rAF loop** — `tracker.detectForVideo(video, performance.now())`
  every frame; the per-frame gesture-read cost is shown live in the readout.
- **Schedules grains with a minimal ~100 ms lookahead** (`LOOKAHEAD = 0.1`), the
  smallest window that reliably avoids buffer-source underruns.
- **Smooths every audio parameter** with `setTargetAtTime(target, ctx.currentTime,
  ~0.1 s)` (stream gain) and a frame-rate-independent lerp on playhead/pitch/pan,
  so motion is conducted, not twitchy.
- Keeps the gesture→sound path **fully synchronous** — no `await`, no async hop
  between reading a hand and scheduling its grains.

## Graceful degradation

- **No camera / permission denied / MediaPipe load failure** → pointer drives head
  A (X = playhead + pan, Y = pitch) and on-screen sliders drive head B (position,
  pitch) with a mute toggle, so the counterpoint stays fully demonstrable without a
  webcam. On-brand `text-muted-foreground` notice.
- **No WebGL** → Canvas2D mote fallback + notice; audio unaffected.
- **Audio load failure** → `text-destructive` notice.
- Respects `prefers-reduced-motion` (calmer mote drift + slower decay).
- All grain sources, the AudioContext, the MediaStream tracks, the hand tracker,
  and every three.js resource are disposed on unmount / stop.

## References

- **Curtis Roads, *Microsound* (MIT Press, 2001)** — the canonical text on
  granular synthesis: sound built from streams of short grains, each with its own
  envelope, position, pitch and pan. The two per-head grain streams here are a
  direct application of its grain-cloud model to a real recording.
- **The musical canon / round form** — one melodic line performed as two (or more)
  voices offset in time (e.g. "Frère Jacques", Pachelbel's Canon). Two tape heads
  reading one monophonic take at different offsets *is* a canon, generated live
  from the offset between your hands.
- **GestureSync (ACM Multimedia Systems Conference, 2026)** — establishes the
  ~50 ms end-to-end gesture→audiovisual latency budget for interaction that feels
  immediate; the rAF detection, ~100 ms grain lookahead, and ~0.1 s parameter
  smoothing above are chosen against that bar.
