# 20800-physforge — Physforge

**Status**: demoable

## The question

What if you could forge Karel's recorded piano into a different physical **material** in real time — soften it to felt or harden it to glass, shrink its body to a music-box or swell it to a cathedral — with two **independent** physical axes you move by hand?

This piece plays one of Karel's real recordings (looping) and reshapes it through a "material console": two independent physical transformation axes. It is explicitly **not** a bandpass-filter bank.

## The two physical axes

**Axis X — HARDNESS (a nonlinear waveshaper).** A `WaveShaperNode` whose transfer curve morphs from a gentle, near-linear `tanh` (soft "felt") at x=0 to a steep sigmoid plus a wavefolding term (hard "glass/metal") at x=1. The curve is built in a 2048-sample `Float32Array` and regenerated throttled (~17 Hz, never per audio frame) as x changes, with `oversample = "4x"`. Harder = more harmonics and edge; the makeup gain is pulled **down** as drive rises so the hardest settings never blast.

**Axis Y — BODY SIZE (a feedback comb resonator).** A `DelayNode` + feedback `GainNode` loop, with a damping lowpass inside the loop. Small body = a short delay (~3 ms, a tight boxy music-box resonance); large body = a long delay (~120 ms, a cavernous swell). Feedback gain is capped at 0.82 (never ≥ 1 — no runaway), and the in-loop lowpass lets long bodies darken naturally as they ring out.

### Why this is NOT a bandpass bank

A bandpass bank is "N resonant bandpasses summed onto the dry take" — a parallel filter sum. Neither axis here does that. Hardness is a static-nonlinearity waveshaper (a transfer curve applied sample-by-sample, generating new harmonics), and body size is a **feedback comb** — a recirculating delay with its own decay and in-loop damping, a genuinely different block diagram with memory and ringing rather than a parallel sum of resonators.

## The many-to-many coupling

The axes are not two separable knobs. The waveshaper **feeds** the comb body, so hardness sets the excitation character the body rings with. Body size scales the wet/dry blend (a bigger body pours more signal into the resonator). And the in-loop damping cutoff is darkened by **both** a bigger body (longer, darker ring) and a harder drive (a large, hard-driven body absorbs its own extra harmonics). Moving both hands is genuinely different from moving either alone — you sweep a 2-D space of timbres.

### Signal graph

```
AudioBufferSourceNode(HIS buffer, loop=true)
  → waveShaper(hardness, oversample 4x) → makeupGain
    → dryGain ───────────────────────────────┐
    → delay → wetGain ────────────────────────┤→ createSafeMaster(ctx).input
                delay → damp(lowpass) → feedbackGain → delay   (comb loop, fb ≤ 0.82)
```

Zero oscillators (every voice is Karel's buffer). The only audible sink is `createSafeMaster(ctx).input` — never `ctx.destination`. Visuals are driven from `safeMaster.analyser`.

## The control model (pointer-first + camera)

- **Pointer is first-class.** Pointer X over the stage → hardness (left = soft felt, right = hard glass); pointer Y → body size (top = small music-box, bottom = large cathedral). Arrow keys nudge both axes. These drive the identical audio chain — the piece is fully experienceable with no webcam.
- **Camera is the richer layer on top.** Two hands via the shared MediaPipe tracker: left hand height → hardness, right hand height → body size. Fewer than two hands / denied / model failure shows a visible `text-destructive` notice ("show both hands, shoulders in frame") and keeps full pointer control.
- **Idle** (no pointer, no camera for ~2 s) gently auto-drifts both axes on slow independent sinusoids, clearly labeled "autonomous · drifting", so the piece is never silent or blank.

A visible status line always says which state is active: `pointer · live`, `tracking · live — two hands`, the `text-destructive` lost state, or the labeled autonomous drift.

## The visual (Canvas2D only)

The material is a living physical ingot at center that deforms with the two axes: hardness sharpens its edges into crystalline facets with a tight bright specular; soft rounds it into a molten, diffuse, wobbling blob. Body size scales the ingot and grows the resonant ring halo around it. An inset plots the **live waveshaper transfer curve** (straight from the `Float32Array`, against a linear reference diagonal) so you see the nonlinearity bend; a second inset shows the live `analyser` amplitude, and the ingot pulses on audio RMS. Palette is violet-phosphor + bone/graphite on near-black — no green, no grain overlay. WebGL/WebGPU are not used (Canvas2D 2D context only).

## Reference

**PhysicsSliders (arXiv:2610.18597, announced 2026-10-14) — learning independent physical control axes over a sound.** Physforge gives you two such axes by hand, as DSP you can see: the transfer curve bends and the physical body rings in front of you.
