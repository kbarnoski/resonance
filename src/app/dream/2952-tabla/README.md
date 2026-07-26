# 2952 · Tabla Mesh

**What if you could strike a REAL vibrating drumhead with your fingers — and
PRESS into it with your palm to bend the pitch up mid-ring, the way a tabla
player slides the heel of the hand across the head (the *ga*/*ghe* pitch
glide)? — because the sound is a genuine 2-D digital waveguide MESH membrane,
not a sample.**

This is the lab's first **2-D** digital waveguide mesh; everything before it was
1-D (Karplus–Strong strings). The drumhead you touch is a real propagating
membrane solved at audio rate — every tap sends waves radiating out, reflecting
off the circular rim and interfering into the drum's modes. Nothing is sampled
or looped.

## How to play

- **Tap = strike.** An impulse is injected at the exact point you touch. A quick
  flick hits harder (velocity comes from pointer speed).
- **Radius = timbre.** Strike near the **rim** for a bright, high-partial ring
  (*na* / *ta*); strike the **centre** for the deep fundamental (*ge*). The
  impulse is narrow at the rim, broad at the centre — just like where a tabla
  player's fingers land.
- **Press &amp; hold = pitch-bend (*ga*).** Holding a finger down raises the local
  membrane tension under your palm; the more you press (the longer you hold),
  the higher the still-ringing tone glides. Release and it slides back down.
  Drag while holding to move the press zone.
- **Start / autopilot.** A seeded `mulberry32(0x2952)` virtual player performs a
  looping *theka* (dha · dhin · tin · ta) on load, so the page is alive before
  anyone touches it. Press **Start the drum** to enable sound (browsers require
  a user gesture to open audio), then **Take over** to play by hand and back.

You **see the wave you hear**: the Canvas2D height-map shades the membrane's real
displacement — crests glow warm gold, troughs sink dark, and the pressed region
blooms violet as its tension rises.

## The DSP (implemented for real)

The membrane is a **2-D digital waveguide mesh** — Van Duyne & Smith, *"The 2-D
Digital Waveguide Mesh,"* IEEE WASPAA/ICASSP 1993. A rectilinear grid of 4-port
scattering junctions joined by bidirectional unit delays; the lossless junction
update is `v_J = (2/N)·Σ(incoming) − v_prev` with `N = 4`. On the homogeneous
square mesh this is provably identical to the explicit finite-difference scheme
for the 2-D wave equation

```
u(n+1) = 2·u(n) − u(n−1) + c²·(uN + uS + uE + uW − 4·u)
```

which is the form run here (`mesh.ts`, and inlined in `worklet.ts`). Key points:

- **Circular boundary.** A Dirichlet mask clamps the square grid into a round
  head; the rim reflects waves back, building the membrane's modal spectrum.
- **Excitation.** A raised-Gaussian displacement impulse, scaled by strike
  velocity; width shrinks toward the rim so edge strikes excite higher partials.
- **Press-bend — the whole trick.** A per-junction `c²` field (the local squared
  wave speed = tension). Pressing eases `c²` up in a Gaussian region under the
  pointer (kept ≤ 0.49 for stability), raising local wave speed and therefore
  the pitch of the ringing modes — audibly bending a strike *up* while it still
  sounds. Release relaxes `c²` back and the pitch glides down.
- **Output.** Displacement read at a fixed off-centre listening junction → DC
  blocker → one-pole lowpass → soft `tanh` limiter, master capped at **0.12**.
- **Where it runs.** The audio mesh (42×42) runs a full block of samples every
  render quantum inside an **AudioWorklet**, loaded from a **Blob URL** string
  (`worklet.ts`) so Next bundles nothing special; a **ScriptProcessorNode**
  fallback runs the same `MembraneMesh` on the main thread if AudioWorklet is
  unavailable. A separate coarser, eye-tuned membrane (52×52, slower waves,
  heavier damping) draws the visible ripples, driven by the same strike/press
  events so vision tracks sound.

Tabla acoustics motivate the idiom: a real tabla is famously *harmonic* — the
loaded (syahi) head's overtones fall close to integer ratios — which is why it
carries pitch. This was first analysed by **C.V. Raman** ("The Indian Musical
Drums," 1934), following Raman & Kumar. The dark centre disc in the render is
that syahi tuning paste.

## Next-cycle deepening

1. **Banded excitation per bol.** Replace the single Gaussian with stroke-shaped
   excitation kernels (open *na* ring, closed *tin*, slap *ke*) so each *bol* has
   its own attack spectrum rather than only a position/width difference.
2. **Sympathetic resonance to a drone.** Couple the mesh to a tanpura/drone
   waveguide so the head rings sympathetically at the raga's Sa — the way a real
   dayan is tuned to the tonic and blooms under a droning accompaniment.
3. **Rim-vs-centre stroke classification from touch.** Use contact radius and
   pointer trajectory to auto-classify strokes into *na / ge / dha / ti*, and
   drive the syahi-loading (mass) field per stroke for true edge-damped *na*
   versus open resonant *ge*.
