# 13968 · Flip-Deck

**Flip your own record.** A beat-locked DJ deck built from ONE of Karel's real
solo-piano recordings. The deck detects his tempo, beats and downbeats, draws his
whole waveform as a WebGL2 ribbon with the grid on it, and lets the visitor
re-compose his bars into a new groove — scrub, hot-cue loops, reverse, half-time,
beat-repeat — all quantised to his bars over a steady clock so it never falls out
of time. **The only sound is regions of his actual recording. No synth, ever.**

Route: `/dream/13968-flipdeck`

---

## Interaction model — the turntablist flip-ribbon

- The full track is a horizontal ribbon. The detected beat grid is drawn on it:
  subtle ice lines on beats, brighter violet lines on downbeats/bars.
- **Drag across bars** on the ribbon → set a loop. Both ends snap to bar
  boundaries, so the loop always repeats perfectly in time.
- **Click a beat** (a small drag) → scrub the playhead there, beat-quantised, and
  play through from that point.
- **1 / 2 / 4-bar loop** buttons set a loop of that length anchored at the bar
  under the playhead.
- **Reverse** plays a pre-built time-reversed copy of the buffer (a real backspin).
- **Half-time** is `playbackRate = 0.5` — the pitch drops an octave, exactly like
  slowing a real turntable. That is the intended move, not a bug.
- **Beat-repeat / stutter** machine-guns a short slice (½-beat) at the loop head.
- **Exit loop** returns to straight play-through from the current spot.
- **Solo original (play straight)** overrides every flip and plays his take clean.
- **Tempo ± nudge** re-grids the beats/bars live (cheap — see caching below) if the
  detected grid drifts against his rubato.

A **seeded self-demo** runs on Start: a 2-bar loop is set about a quarter into the
track and played for ~8 s, labelled *"auto — grab the ribbon to take over"*. Any
interaction (or the 8 s timeout) hands control to the visitor.

---

## DSP pipeline — `beatEngine.ts` (offline, after decode)

All on the mono mixdown; pure functions of the samples (no `Math.random` / clocks).

1. **Spectral-flux onset novelty.** Hand-rolled radix-2 STFT, frame 2048 / hop 512,
   Hann window. Per frame, sum the half-wave-rectified frame-to-frame magnitude
   increase → an onset novelty curve. A low band (< ~220 Hz) energy curve is kept
   in parallel for downbeat picking.
2. **Tempo by autocorrelation.** The novelty is mean-subtracted (local-background
   removal) and half-wave rectified, then autocorrelated over the lag range for
   60–180 BPM. The peak lag → BPM, with a mild bias toward ~110 BPM to resist
   octave errors and a weak-signal fallback of 90 BPM.
3. **4/4 beat/bar grid.** A pulse train is phase-aligned to the novelty (best phase
   maximises novelty landing on beats). Bars are 4 beats; the downbeat phase (0–3)
   is the offset whose beats carry the most low-band accent. Outputs beat times +
   bar times to draw and to snap loops to.

`analyzeTrack()` also returns a `GridCache` (the enhanced novelty + low band) so a
BPM nudge calls `regrid()` — rebuilding only the grid, without re-running the STFT.

`buildPeaks()` downsamples the mixdown to per-bin min/max for the ribbon;
`reverseBuffer()` builds the reversed copy used for backspins.

## WebGL renderer — `waveGL.ts`

Raw `webgl2` (no three.js). One shader program throughout: `vec2` clip position +
`vec4` colour per vertex, alpha-blended. Three buffers:

- **Waveform** — a static `TRIANGLE_STRIP` from the min/max peaks, coloured with an
  ice→violet gradient along time.
- **Grid** — static triangles, one thin quad per beat (subtle) and per downbeat
  (brighter/taller).
- **Overlay** — a small dynamic buffer re-uploaded each frame for the loop-region
  fill + edges, the live drag selection, and the bright playhead marker.

DPR-aware resize, spectrum glow from the SafeMaster analyser, and a full GL
teardown (`WEBGL_lose_context`) on unmount. If `getContext("webgl2")` fails the
page shows a `text-destructive` notice; WebGL2 is the primary/intended renderer.

## Audio scheduling

`AudioContext` is created inside the Start click. Everything routes through
`createSafeMaster(ctx).input` — never `ctx.destination`. A ~25 ms lookahead
scheduler schedules the next region a hair ahead of the current one ending, so
loops are gapless and beat-locked; it never relies on `source.loop`. Each voice
gets its own `GainNode` with a short attack/release ramp to kill clicks. Reverse
plays regions of the reversed buffer at the mirrored offset; half-time sets
`playbackRate = 0.5`. Toggling any flip takes effect at the next segment boundary,
so changes are always beat-aligned. Full teardown stops the timer, all sources,
`safeMaster.disconnect()`, GL teardown and `cancelAnimationFrame` on unmount.

## References (classic MIR — not overclaimed)

- J. P. Bello et al., "A Tutorial on Onset Detection in Music Signals," IEEE TSAP,
  2005 — spectral-flux onsets.
- D. Ellis, "Beat Tracking by Dynamic Programming," J. New Music Research, 2007.
- M. Heydari et al., BeatNet+ / real-time rhythm analysis (TISMIR).
- Framing: the 2026 real-time interactive-remix / "generative delay" turn — Live
  Music Diffusion, arXiv:2605.22717 (May 2026).

## Honest limits

- Solo piano is **deeply rubato**, so the autocorrelation grid is an approximation
  — it can lock to a half/double tempo or drift over long expressive passages. The
  BPM nudge is there for exactly this; loops still stay internally in time because
  they snap to whatever grid is current.
- **Half-time drops the pitch an octave** (0.5× tape speed). Intended turntable
  behaviour, called out in the UI.
- Downbeat picking is a low-band heuristic; on sparse left-hand passages the "bar 1"
  guess can land a beat off. Re-set the loop by dragging if a groove feels rotated.
