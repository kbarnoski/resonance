# 4088 · Reliquary

> **The one question:** What if the hall rang with Karel's *real* piano
> recording, split across its depth — low registers deep in the apse, high
> registers at the door — and the room's acoustic (its reverb tail) changed as
> you leaned *through* it?

A deep v2 of **3920 · nave**. It keeps nave's head-coupled **off-axis
(asymmetric-frustum) projection** and MediaPipe FaceLandmarker head tracking
*exactly* — the webcam tracks your head, the flat monitor becomes a window into a
receding nave, and the audio listener is glued to your head every frame. On top
of that it adds two new subsystems that answer the question above:

1. a **single real recording split across the hall's depth**, and
2. a **movable (head-position-coupled) reverb**.

Built with **three.js** (`import * as THREE from "three"`, already a project
dependency) and **pure Web Audio API**. MediaPipe is loaded exactly as nave does
(jsDelivr CDN ESM dynamic import + matching wasm path). No new npm dependencies.

## Subsystem 1 — one recording, split across depth

Instead of nave's seven independent synthesized voices, there is **one source**
feeding the whole hall:

- **Default (no ID needed):** a warm synthesized **cathedral-piano bed** — an
  eight-note chord (C2 · C3 · G3 · C4 · E4 · G4 · C5 · E5), each note an additive
  stack of partials with a slow per-note breathing tremolo. The chord deliberately
  spans registers so *every* band has real content (deep C2 for the apse, bright
  C5/E5 partials for the air near the door). It blooms in on "Enter the hall".
- **Real recording:** paste a **Resonance recording UUID** and press *Load
  recording*. It fetches the existing public route, decodes, and loops the buffer
  into the *same* source hub, replacing the synth bed. The bands and reverb are
  untouched, so the real piece is immediately spatialized across the hall.

  ```ts
  const res = await fetch(`/api/audio/${encodeURIComponent(id)}`);
  const { url } = await res.json();           // { url, codec, hasAac }
  const buf = await (await fetch(url)).arrayBuffer();
  const audioBuf = await ctx.decodeAudioData(buf);
  // → AudioBufferSourceNode(loop) → sourceOut  (synth bed stopped)
  ```

  (This mirrors `163-paths-visualizer`. The route is READ-only; no route is
  created or edited.)

**The split.** `sourceOut` fans out into **five frequency bands**, each a cascade
of two highpass + two lowpass biquads (a clean ~band-pass with steeper skirts
than a single biquad). Each band → its own **HRTF `PannerNode`** at a distinct
depth in `-Z`:

| band | range (Hz) | depth (z) | place |
|------|-----------|-----------|-------|
| sub  | 30–150    | −22.0     | deep apse |
| low  | 150–400   | −16.0     | |
| mid  | 400–1100  | −11.0     | |
| high | 1100–3200 | −6.4      | |
| air  | 3200–16000| −3.3      | near the door |

So leaning toward a distant node walks you into the *low* registers of the piece;
leaning back keeps you in the *air*. It's a **cartography of one recording across
space**. Each band also taps an `AnalyserNode`; per-band RMS drives the pulse,
glow and point-light of that band's luminous depth-node (`getFloatTimeDomainData`
→ RMS → smoothed).

## Subsystem 2 — the movable (head-coupled) reverb

Nave used a single static `ConvolverNode`. Here the tail is a small **Feedback
Delay Network** built entirely from Web Audio nodes — **no impulse file**:

- **4 delay lines** with mutually incommensurate delay times
  (43 / 69 / 95 / 123 ms) for a cathedral-scale, dense hall.
- a **4×4 orthonormal Hadamard feedback matrix** (Hadamard / 2, energy
  preserving) implemented as 16 gain nodes routing each line's feedback into all
  four delays — this is what makes the tail diffuse rather than a discrete echo.
  Feeding it the panners' stereo output keeps the tail spatial.
- a **per-line damping lowpass** in the feedback path (high frequencies decay
  faster than lows, as in a real room).

Every band's *spatialized* (post-panner) signal is sent into the FDN, so the wet
tail carries each register's HRTF placement.

**Head-coupling.** Each frame an *openness* scalar is derived from head position:

```
leanIn   = clamp((3.1 − head.z) / 1.5)        // leaning toward the apse
lateral  = clamp(|head.x| / 1.15)             // sweeping through the hall
openness = clamp(0.72·leanIn + 0.28·lateral)  // 0 = dry entrance … 1 = wet apse
```

`openness` then drives three FDN parameters via `setTargetAtTime` (smoothed
~0.3 s):

| parameter | entrance (0) | apse (1) | effect |
|-----------|-------------|----------|--------|
| feedback decay (per line) | 0.60 | 0.88 | longer tail |
| wet mix | 0.10 | 0.60 | wetter |
| damping cutoff | 6.0 kHz | 2.4 kHz | darker |

The feedback stays below 0.9 with an orthonormal matrix, so the network is
stable. Leaning into the apse is **audible as the room opening up** — the tail
lengthens, swells and darkens; leaning back to the door dries it out. A deep
"apse glow" in the scene brightens with the same scalar, and the readout shows
`reverb NN%`, so you can see and hear the coupling. (Research anchor:
listener-movement-coupled RIR rendering with FDNs, arXiv:2510.00238.)

## Graceful degrade (sounds & animates with zero permissions)

- **On "Enter the hall":** the synth-piano bed plays immediately, already split
  across the five depth-bands and running through the movable reverb. No ID
  required — the reviewer at 06:30 with no UUID handy still gets the full piece.
- **Real ID that 404s / fails:** the synth bed keeps playing and an on-brand
  `text-destructive` notice appears; nothing else changes.
- **No camera / permission denied / MediaPipe fails:** on-brand notice + falls
  back to **pointer parallax** (X/Y leans the room; dragging *down* leans you into
  the apse so pointer users can still open the reverb). Same projection + audio
  path.
- **No input at all (headless):** a **seeded deterministic head-drift** (Lissajous
  orbit) walks the same path, so it visibly and audibly animates with no camera.
- **No WebGL:** a clear `text-destructive` notice replaces the canvas.
- **Determinism:** all randomness is a seeded `mulberry32` (seed `0x4088`); time
  is `performance.now()`. No `Math.random`, `Date.now`, or `new Date()`.
  `AudioContext` is created only inside the "Enter the hall" gesture.
- **Teardown:** on unmount everything is released — `cancelAnimationFrame`,
  `MediaStream` tracks stopped, `FaceLandmarker.close()`, all oscillators / the
  recording source stopped, `AudioContext.close()`, three.js geometries/materials
  disposed, renderer disposed + context loss forced, listeners + ResizeObserver
  removed.

## Named references

- **Robert Kooima**, *"Generalized Perspective Projection"* — the off-axis
  asymmetric-frustum math (`applyOffAxis`), inherited from nave.
- **Johnny Lee**, *"Head Tracking for Desktop VR Displays using the Wii Remote"*
  (2007) — the canonical head-coupled-perspective ("fish-tank VR") technique.
- *"Real-time listener-movement-coupled room impulse response rendering with
  feedback delay networks,"* **arXiv:2510.00238** — the movable-reverb research
  anchor (an FDN whose response follows a moving listener).

## Known limitations

- The FDN is a *plausible* hall, not a measured impulse response; the coupling is
  perceptual/parametric, not a physically-exact moving-listener RIR. Delay times
  are fixed (changing them at runtime would click), so only decay / wet / damping
  move with the head.
- Band splitting is done with biquad cascades, so band edges overlap somewhat and
  the very low "sub" band is quiet on thin recordings; energy normalisation is
  tuned for the synth bed and typical piano material.
- HRTF panning of the FDN's summed tail is diffuse rather than precisely
  localised — the *dry* bands carry the sharp spatial cue, the wet tail carries
  envelopment.
- MediaPipe, the wasm and the model are fetched from a CDN at first "Enter", so
  head tracking needs network on first run; everything else is local. Real
  recordings need the audio URL to be CORS-fetchable + decodable by the browser.

## Next-cycle deepening

- Per-band reverb sends (a wetter apse than the door) for a depth-graded acoustic.
- Derive a *movable* delay-time modulation from head Z for a true changing room
  size, with careful de-clicking (fractional-delay interpolation).
- Two-listener shared hall: two off-axis eyes, two openness scalars, one recording.
