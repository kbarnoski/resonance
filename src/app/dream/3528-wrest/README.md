# 3528 · Wrest

A WebGL2 fragment-shader substrate for a third relationship with an instrument:
not **playing** it, not **witnessing** it, but continuously **wresting a
self-running generative voice back from itself and letting it go** — negotiated
authorship, with real consequence but no win, no lose, no fail-buzzer.

## The ONE question

> What if you don't *play* an instrument and don't merely *witness* one — but
> continuously wrest a self-running generative voice back from itself and let it
> go?

## The WREST engine

A single **autonomous continuous-pitch voice** sounds from the moment you press
Start. Its behaviour each frame:

- **Drift.** A seeded random-walk (`mulberry32(0x3528)`) pushes its velocity;
  the pitch has **momentum** (velocity + damping), so it keeps heading the way
  it was going.
- **Gravity, not a grid.** A slowly rotating chord (8 soft D-Dorian chords,
  ~6.5 s each) pulls the pitch toward the **nearest chord tone in log-frequency
  space** as a gentle continuous force — never a quantizer. Continuous pitch
  survives; nothing snaps.
- **Your force.** Your sung/hummed pitch is detected by autocorrelation on a mic
  `AnalyserNode` (RMS gives loudness). When you make sound, a **control balance
  α ∈ [0,1]** rises toward you with a **~0.1 s attack**; when you go quiet it
  **decays back to the machine over ~1.5 s**.
- **The sounding fundamental is the negotiation:** `lerp(machine, you, α)` every
  frame. At α≈1 you're steering it to your pitch; at α≈0 it free-runs. You can
  instantly **rescue** it from wherever it wandered.
- **Consequence (memory).** A slow **home bias** (time constant ≈25 s) absorbs
  the residue of the sounding pitch, weighted by α. The machine's own drift is
  biased toward this home. Neglect the voice and home barely moves — it wanders
  somewhere you did not choose. Over-grip it and home clamps to your pitch — the
  surprise dies. No score, but the piece at minute five is visibly and audibly
  the record of how you negotiated.
- **Harmonic bed.** Autonomous pad voices (root, fifth, sub-octave) follow the
  rotating chord so the tug-of-war voice always sings over a bed.
- **Master.** All voices sum through a `tanh` soft-clip and a 0.2 output gain —
  conservative, no clipping.

### Self-demo

If mic permission is denied or not yet granted, a **seeded synthetic performer**
periodically **grabs** (raises α with a fresh chord-tone target + vibrato) and
**releases** (lets α decay). A headless reviewer immediately sees and hears the
tug-of-war. The **first real mic input hands over permanently** (`micLive`), and
from then on quiet lets α decay — the rescue/release gesture becomes yours.

## The substrate (WebGL2)

A full-screen `#version 300 es` fragment shader (raw WebGL2 — no three.js, no
Canvas2D) renders the negotiation as a warping flow field:

- the **machine current** and the **human pull** are two glowing horizontal
  bands (normalized pitch → screen Y);
- the **sounding voice** is the bright ridge riding between them;
- **α is made legible** as how far the whole continuum *bends* toward the human
  band;
- the **home bias** is a faint residue line marking your negotiation history.

Uniforms (fundamental, α, RMS, machine/human/sound/home positions, chord phase)
are pushed every frame. Palette is the Resonance violet ramp on near-black. Only
slow luminance drift — no strobe/flicker — and `prefers-reduced-motion` damps
the motion.

## How to use it

1. Press **Start mic** and allow the microphone (or deny it — the synthetic
   performer keeps the piece alive).
2. Hum or sing a steady pitch. Watch the field bend toward you and the control
   bar fill to **you**; the sounding ridge climbs to your pitch.
3. Go quiet. Over ~1.5 s control slides back to **machine** and the voice
   resumes its own drift — now subtly biased toward where you left it.
4. Play the long game: keep rescuing it, or let it roam. Minute five sounds like
   your choices.

## Reference

Cited: **"Opening the Design Space: Two Years of Performance with Intelligent
Musical Instruments"** (arXiv:2604.23583, submitted 2026-04-26). Its finding
that ~0.1 s human↔AI control switching creates "a free-running system you guide
but don't fully control," together with the **"rescue" gesture**, is exactly
what the control-balance α implements: the fast handoff toward the human and the
slow release back to the machine.

## Honest limitations

- **Autocorrelation pitch detection** is monophonic and best with a clear, close
  hum; noisy rooms, polyphony, or very quiet input fall below the RMS gate and
  read as "quiet" (α decays). It works — it is not a studio-grade tracker.
- **One tug-of-war voice.** The negotiation is deliberately a single line over a
  pad, not a full ensemble.
- The **home-bias consequence is slow by design** (~25 s); its effect is felt
  over a session, not in a five-second glance.
- Sung pitch outside D3–D5 is clamped into that range for both audio and the
  visual; octave errors from the detector can briefly jump the target.
- Audio starts only inside the Start user-gesture (browser autoplay policy).
