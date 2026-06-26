# 970 · Tension Gong

A playable struck-metal resonator — bell-plate, gong, tam-tam, cymbal-disc —
built on **non-linear modal synthesis** in an AudioWorklet.

## The one question

> What if a struck-metal instrument bent and bloomed in pitch the way a REAL
> gong does — because the synthesis itself is non-linear?

Linear modal synthesis (a fixed bank of decaying sine modes) sounds dead:
every strike of a body produces the same pitch and the same timbre. Real metal
does not. Hit a tam-tam hard and it starts **sharp**, shimmers, then glides
**down** in pitch as it decays — the gong "bloom". This prototype makes that
behaviour come out of the synthesis itself, not out of an envelope or LFO drawn
on top.

## The technique — non-linear modal synthesis

Each of the four bodies is a bank of 12–16 two-pole modal resonators tuned to an
**inharmonic, clustered metal spectrum** (stretched/paired ratios, not a
harmonic series and not a tuned scale). On top of the linear bank, three
non-linearities run live in the AudioWorklet
(`worklet-source.ts`):

1. **Tension modulation.** A running `energy = Σ amp²` across modes sets each
   mode's instantaneous frequency to `f_i = f0_i · (1 + beta_i · betaScale ·
   energy)`. The biquad coefficients are re-derived every 128-sample control
   block from the live energy, so a loud strike rings sharp and **glides back
   down** to the rest pitch as the energy bleeds away. This is the pitch bloom,
   and it is produced by the resonators changing frequency — not by pitch
   automation.
2. **Mode coupling.** While the body is loud, a fraction of each mode's state is
   transferred to its spectral neighbour (`coupleAmt · energy`). The spectrum
   shimmers up during the attack, then — as energy decays and the coupling term
   vanishes — **clarifies and settles**.
3. **Strike-velocity dependence.** A hard strike (Shift) pushes energy into the
   **high** modes (brighter attack) and is given a larger `betaScale`, so it
   bends pitch more. A soft strike stays near the linear pitch and lights mostly
   the low modes.

The strike itself injects an impulse into each resonator's state, weighted
across modes by velocity; the unforced two-pole recurrence then free-rings as a
decaying sinusoid at the (energy-shifted) pole frequency.

### Reference

Grounded in **"nlm: Real-Time Non-linear Modal Synthesis in Max",
arXiv:2603.10240 (March 2026)**, which models exactly tension modulation, pitch
glide and mode coupling for real-time physical synthesis. The mapping here is a
faithful, simplified real-time version of that approach.

## Input — non-pointer

The instrument is played with the **computer keyboard**, not the mouse:

- `A S D F G H J K` — strike the metal. Position along the row tilts the
  spectrum slightly (keys further right favour higher modes).
- **Shift** held while striking — a hard, sharp, pitch-bending hit.
- Playing **fast** (rapid successive strikes) raises strike velocity.
- **Holding** a key longer before release fires a softer secondary tap, so hold
  duration also shapes velocity.
- `1 2 3 4` — switch bodies (also via the on-screen buttons).

**Web MIDI** is attempted on start (`navigator.requestMIDIAccess`). If a MIDI
device is present, note-on **velocity** drives strikes (a header line shows the
device name). If MIDI is unavailable it degrades **silently** to the keyboard.

The on-screen pointer buttons only select a body / start audio — they are not
the playing surface.

## Visual

Canvas2D, clinical / metallurgical palette: brushed-steel greys on near-black
with a hot amber or steel-cyan accent per body. The plate is rendered as a
**Chladni-style nodal field** — each live mode draws its `sin(mπx)·sin(nπy)`
nodal lines, brightening as that mode rings and fading as it decays, so you
literally see which modes are alive and watch the spectrum settle after a
strike. A thin per-mode strip below shows each mode's amplitude plus a rising
**pitch-glide tick** marking how far above its rest frequency the instantaneous
frequency currently sits. The visuals READ the audio (amplitudes + instantaneous
frequencies posted from the worklet ~60×/s); they never drive it.

## Real vs faked

- **Real:** the modal resonator bank, the energy-driven tension modulation and
  pitch glide, the neighbour mode coupling, and the velocity→brightness/bend
  mapping all run sample/block-accurately in the worklet. The pitch genuinely
  changes because the resonator centre frequencies change with energy.
- **Simplified:** the inharmonic ratios are hand-tuned to read as
  metal/gong/tam-tam rather than measured from a specific instrument; tension
  modulation is recomputed per control block (not per sample) for CPU sanity;
  mode coupling is a first-neighbour state transfer rather than a full quadratic
  plate model. The Chladni mode-shape numbers are illustrative, derived from the
  partial index, not the exact eigenmodes of each ratio.

## Degradation

- **No AudioWorklet** → a visible amber/rose notice; the piece needs the worklet
  to run the non-linear synthesis, so it does not fake a fallback voice.
- **No Web MIDI** → silently keyboard-only (header notes "no MIDI device").
- **Audio can't start** → a status line reports it.
- Audio is gated behind a first user gesture (the start button). On unmount:
  MIDI handlers detached, worklet node disconnected, AudioContext closed, blob
  URL revoked, RAF + key listeners removed.
