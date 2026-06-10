**For**: kids (4+)

# 489 — Pond Pair

Two glowing water ponds sit side by side with a narrow channel between them.
A little lily pad floats on one pond, bobs on the ripples, and — when the waves
build up enough energy — drifts to the channel edge and rides across to the other
pond, dropping that carried energy in as a new splash that makes the other pond sing.

## The idea

This is Cycle 2 of the Wave Field kids spine. Cycle 1 (`478-kids-wave-pond`) showed
one real FDTD pond you tap and hear. Here the extension is: **two coupled wave fields
with a tangible floating carrier object** that makes the energy transfer visible and
playful. A child taps Pond A, sees ripples spread, watches the pad bob and drift, then
sees it cross the channel and hears Pond B ring — a visible messenger carrying sound
between two waters.

## Technique

### FDTD wave fields (two grids)

Two 56×56 grids. Each cell is updated every frame (3 substeps) using the standard
discrete 2-D wave equation:

```
uNext[i,j] = 2·u[i,j] - uPrev[i,j] + C²·(u[i+1,j] + u[i-1,j] + u[i,j+1] + u[i,j-1] - 4·u[i,j])
uNext[i,j] *= (1 - DAMP)
```

`C_WAVE = 0.35`, `C² = 0.1225`, `DAMP ≈ 0.0018`. Outer boundary is Dirichlet (fixed
at zero) — waves reflect cleanly off the rim.

Tapping injects a small Gaussian displacement bump (radius ≈ 3 cells) into the grid.

### Sympathetic coupling (always-on whisper)

The ponds whisper to each other through their facing edge columns at all times:

```
diff = uB[edge] - uA[edge]
uA[edge] += K * diff
uB[edge] -= K * diff
```

`K ≈ 0.08`. This is analogous to sympathetic resonance between two mechanically
coupled resonators — a ringing in pond A subtly excites pond B and vice versa even
without the pad. The coupling is always active; the pad is the dramatic visible layer
on top.

**Named reference:** Van Duyne & Smith, "Physical Modeling with the 2-D Digital
Waveguide Mesh," Proceedings of the International Computer Music Conference (ICMC),
1993. The grids implement their 2-D Digital Waveguide Mesh formulation.

### The lily pad carrier object

The pad is a buoyant object that:

1. **Bobs** — its vertical position tracks a lowpass-filtered version of the wave
   height beneath it.
2. **Drifts** — its 2-D velocity is driven by the local wave gradient (waves push the
   pad like a real floating object). Friction of 0.88 per frame keeps drift bounded.
3. **Accumulates energy** — a scalar `carriedEnergy` value grows proportional to the
   field RMS while the pad is in a pond. A golden dot on the pad visualises this.
4. **Crosses** — when carried energy exceeds a threshold and the pad has drifted near
   the channel edge, it begins a fixed-speed crossing animation.
5. **Delivers** — on arrival it injects a Gaussian bump with amplitude proportional to
   carried energy, triggering the new pond to ring, and plays a sparkle chime.

A cooldown of 1.8 s prevents rapid back-and-forth thrashing.

## Audio

- **Pond A bells:** low pentatonic — C3, D3, E3, G3, A3 (130–220 Hz)
- **Pond B bells:** high pentatonic — C4, D4, E4, G4, A4 (262–440 Hz)
- Pickup-area energy (averaged over a 9×9 region around an off-centre pickup cell)
  selects and triggers notes. Soft attack ~12 ms, exponential release ~1.2 s.
- **Sparkle chime** on pad arrival: ascending C5–E5–G5–C6 arpeggio.
- **Ambient pad:** always-on C3 + G3 sine oscillators with slow LFO vibrato. Fades in
  gently over ~2 s on start.
- All audio routes through a `DynamicsCompressor` brick-wall limiter (threshold -10 dB,
  ratio 12:1) for child safety.

## Controls

- **Tap either pond** — injects ripples that spread and ring
- **Drag / touch-move** — trail of gentler ripples
- **Multi-touch** — two simultaneous touches both work; tap both ponds at once for
  cross-pond interference
- **Lily pad** — watch it bob, drift, cross the channel, and drop energy on arrival
- **3-second auto-demo** plays scripted taps before first touch — shows the pad
  crossing hands-free

## What is unverified

- The per-frame `createImageData`/`putImageData` pixel fill approach may slow below
  60fps on large canvases on low-end mobile devices. If needed, reduce `GRID` to 40
  or add frame-skipping.
- Pad crossing threshold and speed are tuned aesthetically, not derived from physics.
- The sympathetic coupling uses a simplified edge-column approach rather than a true
  open (absorbing) boundary between the two sub-domains.
- Bell note timing uses heuristic energy thresholds; exact musical behaviour varies
  with device audio latency.
- The `crossDir` initial value in the interface is set to `1` but is always overwritten
  before first use — this is safe but redundant.

## Next-cycle deepening (folded in from this fire's two non-winner explorations)

This shipped as the winner of a DEEP 3-builder fire on the same cycle-2 concept
("two ponds that talk"). The two non-winners are pre-scoped as cycle-3 layers on
top of this carrier model:

- **Child-controllable coupling (from `488-kids-echo-ponds`).** Replace the fixed
  `K_COUPLE = 0.08` whisper with a big, draggable glowing **vine/bridge handle**
  (≥64px) the child pulls wide (flood across) or pinches shut (ponds sing alone),
  so the *coupling itself* becomes a second toy alongside the pad. Optionally swap
  the renderer to a **WebGPU compute** FDTD step (storage-buffer ping-pong, WGSL),
  with this Canvas2D path as the fallback — the lab's starved GPU-compute lane.
- **Cooperative two-pond framing (from `487-kids-two-ponds`).** Lean harder into
  "two kids each claim a pond": distinct dual-palette `ImageData` renders per pond
  and an explicit channel-glow that brightens with cross-edge energy, so a splash
  in one child's pond visibly *and* audibly wakes the other's — the social-bonding
  gap KIDS.md flags.
