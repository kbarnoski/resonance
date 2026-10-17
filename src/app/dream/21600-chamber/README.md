# Chamber

Play Karel's piano through the resonant ghost of one of its own moments. Fly through a 3-D resonance chamber built from his recording, and wherever you move re-selects which instant of the take becomes the body the sound rings inside.

**Status**: demoable

## The idea

One of Karel's real recordings plays continuously (the **dry** signal: a `BufferSourceNode` looping the decoded `AudioBuffer`). The **wet** signal is that same dry signal pushed through a `ConvolverNode` whose impulse response is a **short, Hann-windowed, normalized slice (~0.2–1.2 s)** cut from the *same* recording at a position the cursor chooses. Convolving his piano with a fragment of itself makes the piece ring with the spectral signature of that one instant — a self-reverberation that re-colors as you move. This is a single genuine **convolution block** (auto-convolution cross-synthesis): not a bandpass filterbank, not granular, not a phase vocoder.

## How to

Press **Play** to let a recording fill the chamber (a small track selector picks which; it defaults to *Interplay*). Then:

- **Move the mouse left/right** to fly the focus through the recording's timeline — wherever you are becomes the resonant body (the IR slice center).
- **Move up/down** to open the chamber: deeper gives more of the wet, convolved signal and a longer pre-delay.
- **Drag** (or open your hand on camera) to widen the resonant window, so a longer slice of that instant rings back.
- Arrow keys + Space work too (a11y). Everything is fully audible and visible with the **mouse alone — no camera required**.

## Control path

`cursor → IR slice → convolution → sound + visual`, one resolved cursor driving both:

1. **cursor X** → a normalized timeline position `u ∈ [0,1]`. The IR slice is centered at `u × duration`; the camera flies to `z = -u × DEPTH`, so moving right literally flies you deeper into his timeline.
2. **cursor Y** → wet/dry mix (`wetMix` gain) and pre-delay (`DelayNode.delayTime`).
3. **drag / hand openness** → the resonant window length (0.2–1.2 s).

The IR is rebuilt on a **~200 ms throttle** (and only when the cursor has actually moved — `ConvolverNode.buffer` assignment is expensive). Two convolvers (`convA` / `convB`) sit in parallel; each rebuild loads the new slice into the *inactive* convolver and **crossfades** its wet gain up while the old one fades down (`setTargetAtTime`), so the chamber re-tunes with no clicks. Block diagram:

```
src(loop) ─┬─ dryGain ───────────────────────────────> master.input
           └─ preDelay ─┬─ convA ─ wetA ─┐
                        └─ convB ─ wetB ─┴─ wetMix ──> master.input
```

Every path to the speakers terminates at `createSafeMaster(ctx).input`; nothing touches `ctx.destination` directly. Visual shimmer is read from `safeMaster.analyser`.

## The look

A genuinely volumetric chamber you fly *through*, not a flat canvas and not a violet-glow-on-black field:

- the chamber **walls are his own notes** — a helical tunnel placed by pitch-class (circle of fifths → angle), register (vertical lift) and time (depth), lit toward bone wherever they fall inside the current resonant window;
- **translucent resonance shells** (tori) you pass between, with `depthWrite` for real occlusion;
- a **slate vapor** mote fill for parallax, a `FogExp2` haze that dissolves distance, size-attenuation, and a **bone focus-plane** marking the instant currently ringing;
- a cool steel/bone/slate palette on a **lifted (non-black)** ground, **`NormalBlending` + `depthWrite`** — no additive bloom, no glow.

## Graceful degradation

- **No WebGL →** a `text-destructive` notice; nothing starts, no crash.
- **Audio load throws →** a designed `text-destructive` message; the context is closed cleanly (`ctx.close()`).
- **Analysis null or < 20 notes →** the chamber wall falls back to a helical time-grid along his buffer (still mapped to his timeline); the readout shows `grid-slices` vs `wall-notes`.
- **Camera denied / model fails / no hand →** the pointer keeps full control with a visible mono status line (`tracking · live`, `hand lost — pointer still works`, `pointer · live`, or a labelled `idle` drift).
- **Unmount →** geometries/materials/renderer disposed + `forceContextLoss()`, buffer source stopped, all audio nodes and `master` disconnected, `ctx.close()`, camera tracks stopped, rAF cancelled.

## References

- **Auto-convolution / short-slice-as-IR cross-synthesis** — using a signal's own windowed fragment as the reverb impulse response so the source rings with its own spectral signature. The embodied gesture here is choosing *which* fragment, in real time, by moving through a space built from the recording.
- **"Accelerated Interactive Auralization of Highly Reverberant Spaces using Graphics Hardware"** (arXiv:2509.04390, 2026) — the GPU-convolution-reverb research anchor for real-time, movement-driven re-auralization of a resonant space, which this piece echoes at interactive rates with a throttled, crossfaded convolution block.
