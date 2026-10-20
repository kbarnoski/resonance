# Sever

**Status**: demoable

## The one question

What if you could physically reach into Karel's piano and pull its ringing
**resonance** apart from its hammer **attacks** — separating one recording into
two living layers you re-balance and re-time with your two hands?

This is the lab's first source-separation / decomposition piece: it takes one
real take of Karel's solo piano and cleaves it, offline, into a sustained
harmonic layer and a percussive-transient layer, then hands you the split to
play with.

## Method — median-filter HPSS

The separation runs **once, offline** (not in real time) when you press
*Separate & play*, behind a visible "separating…" progress state. It is the
classic median-filtering harmonic/percussive source separation:

1. **Mono downmix**, capped to the first ~75 s of the take so the heavy pass
   stays tractable in the browser main thread (chunked with `await` yields so
   the UI stays responsive, with a labelled progress bar).
2. **STFT** — Hann window, size 2048, hop 512 (75 % overlap), via a hand-written
   radix-2 FFT with precomputed twiddles.
3. On the magnitude spectrogram, two **median filters**:
   - *harmonic estimate* `h` = median along the **time** axis (horizontal,
     length 17) — a sustained string is a long horizontal ridge that survives.
   - *percussive estimate* `p` = median along the **frequency** axis (vertical,
     length 17) — a hammer attack is a vertical broadband streak that survives.
4. **Wiener-style soft masks**: `H = h²/(h²+p²)`, `P = p²/(h²+p²)`, applied to
   the **complex** STFT (a real mask scales magnitude only, so the **original
   phase is preserved**).
5. **Inverse STFT + windowed overlap-add** (weighted OLA, normalised by the
   summed squared window) into two mono `AudioBuffer`s: `harmonic` (the ringing)
   and `percussive` (the hammers).

This realises the *decomposition* idea of **D-Composer** — *"Simultaneous Drum
Transcription and Sound Event Decomposition"*, arXiv:2610.22535 (19 Oct 2026) —
with the median-filtering algorithm of **D. Fitzgerald, "Harmonic/Percussive
Separation using Median Filtering," Proc. DAFx-10, Graz, 2010**.

It is the **real** median-filter HPSS described in the brief, not a fallback.
The only honest simplifications from a reference library implementation: the
signal is processed in **mono** (not per-channel), and only the first ~75 s are
decomposed (both are compute budget choices for an in-browser, main-thread,
run-once pass — the algorithm itself is the full STFT + dual-median + soft-mask
+ iSTFT chain). The two output layers sum back to approximately the original
take, which is what lets "hands together" read as the fused original.

## Playback & control mapping

Both buffers loop in lockstep (same start time, same offset). Everything
terminates at `createSafeMaster(ctx).input` — no oscillators, no noise, nothing
connects to `ctx.destination`. Per-layer `AnalyserNode`s tap each layer's gain
to drive the two-chemical visual. All gains/rates move with
`setTargetAtTime(~0.12 s)`, so every change is click-free.

| Input (hands) | Pointer fallback | Effect |
| --- | --- | --- |
| **Span** — distance between the two hands (or one hand's openness) | pointer **X** (left = fused, right = severed) | Hands together = fused original. As they part, the percussive layer's gain lifts and its **playbackRate drifts** (×1 → ×1.05) so the attacks detach in time from the harmony. |
| **Height** — average hand height (one hand: its height) | pointer **Y** (top = brighter) | A lowpass on the harmonic bed opens from ~400 Hz to ~16 kHz — reach up, the ringing brightens. |

Hands and pointer write the **identical** control struct `{ span, height }`, so
the piece is fully usable and verifiable with a mouse alone. The pointer path is
always live; the camera is a labelled enhancement.

## Visual — GPGPU Gray-Scott reaction-diffusion

A 2-D simulation surface on **raw WebGL2 ping-pong framebuffers** (two `RGBA16F`
textures, a fragment shader running the Gray-Scott update ~10 sub-steps/frame,
neighbours read with `texelFetch`). Not a raymarched volume, not three.js, not
Canvas2D.

- The **harmonic** layer's RMS nudges the feed rate → broad, smooth spreading
  fronts (sustained energy made visible).
- Each **percussive** onset (detected from the percussive analyser) **injects a
  burst of chemical V** at a seeded point → a spreading ripple.
- The two coupled chemicals render as the two separated layers: cool
  **slate / indigo** for the sustain bed, pale **bone** for the transient
  injections (no violet-phosphor glow). The hand **split** sweeps a seam that
  biases kill/feed per side, so the field visibly cleaves into two territories.
- DPR-capped at 2.

## Graceful degradation

- **No camera / permission denied** → pointer control carries the whole piece;
  the status line says so explicitly (`pointer control · camera off …`). The
  status line never lets an idle fallback masquerade as live tracking: it reads
  `two hands · tracking · live` / `one hand · tracking · live` when tracking,
  and `text-destructive` `hands lost — show both hands, waist-up` when the
  camera is on but no hand is seen.
- **No WebGL2 / no float render targets** → a graceful notice; the audio
  separation still plays, only the field is hidden.
- **Audio load failure** (network / audio service) or **separation failure** →
  a clear error state with a *Back* button; the AudioContext is closed.
- Full teardown on unmount: cancel rAF, stop + disconnect every audio node,
  close the AudioContext, stop camera tracks, close the hand tracker, delete all
  GL textures / framebuffers / programs and lose the GL context.
