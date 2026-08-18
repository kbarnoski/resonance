# waveroom

**Route:** `/dream/15104-waveroom`

## The one question

What if one of Karel's recordings became a resonant **room** you walk through —
where you physically hear its standing-wave nodes and antinodes by moving a
listener across a real acoustic wave-propagation field, not by dragging faders?

This is **not** a mixer. There is exactly **one audio source** — one real
recording — injected as a point source into a simulated resonant chamber. A real
2D acoustic wave equation propagates its pressure through the room; the sound
reflects off the walls and interferes into standing-wave patterns. You move a
listener dot through the field and the audio is spatialised by the *local field
pressure* at that position. Antinodes are loud and bright; nodes are quiet and
dark. Walking the room is hearing the room's acoustic modes.

## How the FDTD wave simulation works

The engine solves the **2D scalar wave equation** with the standard explicit
leapfrog finite-difference time-domain (FDTD) stencil, entirely on the GPU:

```
u_next = 2·u − u_prev + C²·∇²u − DAMP·(u − u_prev)
```

- `∇²u` is the 5-point Laplacian of the pressure field.
- `C² = (c·dt/dx)²` is fixed at **0.49**, just under the 2D CFL stability limit
  (`C² ≤ 0.5`), so waves propagate as fast as the physics allows while staying
  stable — this maximises reflection strength and standing-wave build-up.
- A small bulk `DAMP` keeps the driven field from integrating to a blow-up.

**State layout.** A pair of `RGBA32F` textures ping-pong through framebuffers
(`field.ts`). Each texel packs three fields:

- `.r` = `u` — current pressure
- `.g` = `u_prev` — pressure one step ago (the leapfrog needs both)
- `.b` = `E` — a decaying **peak-hold of |u|**, i.e. the standing-wave energy
  map. Antinodes accumulate high energy; nodes stay near zero. This is what
  makes the mode structure visible *between* wavefronts and what the audio
  samples for spatialisation.

**Walls.** Textures use `CLAMP_TO_EDGE`, which makes off-grid samples mirror the
edge value → a zero-gradient (Neumann / reflecting) boundary. Reflecting walls
are what fold wavefronts back into the room and create the standing waves. A thin
absorbing perimeter (outer ~5%) bleeds the very outermost cells so a continuously
driven room stays bounded.

**Source injection.** Each substep, a small Gaussian splat is added to the
pressure at a fixed source cell (the "speaker cone"). Its amplitude is the
**live signed waveform peak** of the recording (`getByteTimeDomainData` →
peak-abs sample), so the actual music is what ripples through the room; strong
onsets (spectral flux via `getByteFrequencyData`) add a larger impulse. The
drive is tapped **before** the listener gain, so the room stays excited even when
the listener is standing on a silent node.

Runs `SUBSTEPS = 6` leapfrog iterations per animation frame on a `320×320` grid.

**Reference.** Savioja, *"Real-Time 3D Finite-Difference Time-Domain Simulation
of Low- and Mid-Frequency Room Acoustics"* (DAFx 2010), and the broader
wave-based room auralisation lineage. This is a 2D reduction of that method,
following the same explicit leapfrog / CFL discipline.

## The spatialisation mapping

Signal path (the single source):

```
BufferSource(loop) → listenerGain → delay → lowpass → safeMaster.input → speakers
                                              └→ feedback-delay tail → safeMaster.input
```

A throttled `gl.readPixels` of an 8×8 region around the listener texel reads the
local peak-hold energy (`.b`) a few times per second (`audio.ts` / `field.ts`):

- **Local field energy → gain.** Antinode = high energy = loud and open; node =
  low energy = quiet. (`GainNode`, ramped with `setTargetAtTime`.)
- **Distance from source → delay.** Scaled up to ~120 ms (`DelayNode`).
- **Distance from source → lowpass cutoff.** Cutoff falls with distance, so the
  far corners go dark (air/wall absorption). (`BiquadFilterNode`.)
- A gentle **feedback-delay tail** gives the room depth in the corners.

All parameter changes ramp (~90–120 ms) so moving the listener never clicks.

## Palette

A **diverging pressure colormap** that encodes the physics:

- **teal** — rarefaction (negative pressure)
- **near-black** — zero pressure
- **coral** — compression (positive pressure)

Plus a cool peak-hold bloom marking antinodes. Nodes read as dark bands,
antinodes as bright ones — you can literally see the room's modes.

## Audio provenance

Every audible sample is **Karel's real, verified catalog** via
`REAL_TRACKS` / `loadRealTrackBuffer` from `../_shared/welcomeHome`, routed
through `createSafeMaster` (`../_shared/visionary/safeMaster`). There are **zero
oscillators and zero synthesis** — the wave field only conducts the one real
recording. Default source: *Interplay* (rich dynamics); the selector switches
among all `REAL_TRACKS`.

## Graceful degradation

If WebGL2 or float framebuffers (`EXT_color_buffer_float`) are unavailable, or a
recording fails to load, the page shows an on-brand `text-destructive` notice
rather than a blank screen or an unhandled throw. Idle drift of the listener
respects `prefers-reduced-motion` (slower, smaller walk).

## Honest caveats — NOT yet ear-verified

This prototype was built and type-checked headless. I could **not** verify in a
real browser with audio output that:

- the standing-wave banding is visually as crisp as intended for every track
  (the peak-hold decay and the `tanh` display gains were tuned by reasoning, not
  by eye);
- moving the listener produces a clearly audible, musical loud↔quiet swing
  between antinodes and nodes (the energy→gain thresholds
  `smoothstep(0.015, 0.32, …)` may need retuning against the real readback
  magnitudes);
- the `320×320`, 6-substep-per-frame budget holds 60 fps on low-end GPUs;
- the feedback-delay tail (`0.42` feedback) never accumulates unpleasantly on
  sustained loud passages (it is bounded and passes through `safeMaster`, but the
  subjective amount is unverified).

These are the first knobs to turn on a real device.
