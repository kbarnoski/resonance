# Ebbline

**Status**: demoable

## Question
What if leaning your body forward and back made one of Karel's real piano recordings flow forward or run backward — your torso the live performer the playback engine follows, in rate AND in time-direction?

## What it is
One real recording from Karel's catalog is conducted by the forward/back pitch of your torso. Lean forward and the take flows forward and faster; sit upright and it holds a near-still shimmer; lean back and the very same music runs backward, faster the further you recline. The input is the body's lean (MediaPipe pose, shoulders and nose only), the sound is a continuous time-direction + variable-rate re-reading of the take, and the output is an SVG "tide line." The pole is intense (forward surge) to contemplative (backward ebb).

## Signal path
- **Lean (shoulders + nose only).** `createPoseTracker` gives one pose. We gate presence strictly on the two shoulders and the nose — never hips or ankles, which sit off a seated laptop webcam; a frame missing lower landmarks is read normally, not dropped. Forward lean brings the torso toward the lens, so the shoulder line foreshortens WIDER and the nose DROPS relative to the shoulder midline. Both cues are measured as deviation from a slow (~3 s) self-calibrating neutral, combined, and clamped to a signed scalar `lean ∈ [-1,+1]` (upright → 0), then smoothed over ~0.16 s.
- **Time-direction + variable rate (the fresh verb).** The decoded take is reversed once at load into a second buffer (its Float32 channel data copied end-to-start). Two looping `AudioBufferSourceNode`s read the same take — a FORWARD voice and a REVERSED voice — through per-voice seed and crossfade gains into a mixer. A virtual playhead integrates the signed lean velocity. The rate magnitude is `SHIMMER + |lean|·k` (so lean ≈ 0 is a near-still creep, lean → ±1 approaches ~1.45×). An equal-power crossfade (`sin`/`cos` of the forward fraction) fades between the two voices with lean's sign. On every direction flip (hysteresis-latched) both voices are re-seeded to the shared playhead — the forward voice at `head`, the reversed voice at `dur − head` — so the reversal is heard as the SAME instant of music running backward, not a second track. Rate and crossfade are ramped with `setTargetAtTime(…, 0.12)` and re-seeds use a 6 ms gain dip, so there is no zipper and no click. Every node reaches the speakers only through `createSafeMaster(...).input`.
- **Tide line (SVG).** A fixed pool of 200 vertical filament `<line>`s is mutated each frame. They stream left as the music flows forward and reverse to stream right as it runs back; their spacing compresses as `|rate|` rises and stretches as it falls. A central waterline tilts with lean, and the whole field is driven by BOTH lean/rate AND the `safeMaster` analyser — each filament's length, brightness and width track a frequency bin and the master RMS, so every audible change has a visible one. Idle stays rich via a travelling sine when no audio is playing.
- **Palette: garnet-smoke.** Vivid wine-garnet (forward surge) interpolates through desaturated ash/smoke-grey (backward ebb) on a near-black garnet field, with a radial glow that warms garnet forward and cools to smoke back. These hues live only inside the SVG; all UI chrome uses Resonance semantic tokens.

## Works when shipped
- A mono status line is always visible: `tracking · live` with the live lean, flow direction and rate when shoulders + nose are framed; a `text-destructive` lost state ("face the camera, shoulders in frame; lean forward and back") when they are not.
- A labelled autonomous demo drive (`demo · autonomous`) runs on mount and on any camera/model failure — a slow lean sweep −1 → +1 through the IDENTICAL lean → rate/direction → SVG chain, never indistinguishable from live.
- Graceful degradation: no camera, denied permission, or a model/Web-Audio failure each surface a visible notice while the demo keeps conducting; audio-load failure keeps the tide streaming silently.
- Fullscreen + info overlay via `ImmersiveHud`; write-up chrome hides while immersive (art, status line, notices and HUD pills remain).

## Design notes
Audio is Karel's REAL catalog only (`REAL_TRACKS` / `loadRealTrackBuffer`); the reversed buffer is a copy of that same take, never a synth or oscillator. Output is SVG, the deliberately rested render path here — no Canvas2D, WebGL or three.js — and there is no film grain or noise overlay anywhere.

## References
- arXiv:2609.18999, "Variable-Rate Harmonic-Percussive Time-Scale Modification with Real-Time Playback" (Jerin et al., 2026): its thesis is that playback rate must change continuously in response to a live performer. Ebbline inverts the framing — the live performer is your TORSO, conducting the rate AND the time-direction of a fixed real recording rather than a system re-stretching audio on its own. No claim is made that this inversion is itself novel in the literature.
