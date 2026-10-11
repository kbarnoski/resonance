# RESONHAND — two-hand resonant conducting of Karel's chords

**Status**: wip — pointer path works; camera + WebGL2 paths untested headless (no webcam / GPU in the build cloud).

## The one question

*What if your two hands could reach into one of Karel's piano recordings and make its own harmony ring out — a resonant halo tuned to the exact chord he's playing in that moment?*

You are not triggering notes. His real recording keeps playing; your hands lay a bank of resonators over it and lift out the harmony that is *already there* — the halo is retuned, live, to the chord sounding under your hands.

## Why open this

Because you can physically grab the harmony inside a real piece of music and hear it ring back at you — his chords, not FFT noise.

## The conducting (interaction mapping)

Every parameter is smoothed with `setTargetAtTime(target, ctx.currentTime, 0.1)` so it feels immediate but never zippery.

- **Left hand height** (bottom→top) → resonant-halo **wet gain**. At the bottom you hear the dry recording; raise it and a shimmering resonant halo swells in.
- **Left hand openness** (fist→spread) → **how many chord-tones ring** (fist = just the root; spread = the full chord lit up) **and the filter Q** (more open = sharper, more singing resonance).
- **Right hand height** → **brightness tilt** — raises the center octave of the resonator bank (darker → brighter halo).
- **Right hand cx** (mirrored center x) → **stereo pan** of the halo (`StereoPannerNode`).
- **Distance between the hands** → **space** — the wet amount of a feedback-delay tail (more apart = more room).

No camera, or the hand model fails to load → a **pointer fallback drives the identical audio chain** (drag Y = halo swell + brightness, drag X = chord spread + pan, distance-from-center = space, press = full chord). It is labeled as the pointer fallback and never masquerades as live tracking.

## Subsystems

1. **Harmony walker (required).** `loadTrackAnalysis(id)` gives the track's chord list `{time, chord, duration}[]`. Each animation frame we compute the current loop time of the `AudioBufferSourceNode` and find the chord sounding now. `chordRoot` / `chordIsMinor` parse it into a pitch-class triad, which `chordOffsets` expands to 8 priority-ordered resonator pitches (root · fifth · octave · third · … · 7th) across a couple of octaves via `440·2^((midi−69)/12)`. If analysis is `null` the piece falls back to a fixed vi–IV–I–V progression so it still rings — but prefers his real chords. A chord change fires a hue ripple and updates the on-screen chord label.
2. **Audio engine.** One of Karel's real decoded takes (`loadRealTrackBuffer`) loops through a dry path **and** a parallel bank of 8 bandpass `BiquadFilterNode`s → per-band gains (openness gates them) → halo gain (left height) → `StereoPannerNode` (right cx) → a feedback `DelayNode` space (hand distance) → `createSafeMaster(ctx).input`. Nothing connects to `ctx.destination` directly. No oscillator is ever a voice.
3. **Camera / input.** `_shared/cameraTracking` — `startCamera`, `createHandTracker(2)`, `computeHandFeatures`. Hands are assigned to the person's left/right by MediaPipe handedness when distinct, else by mirrored center-x.
4. **Visual (raw WebGL2).** A full-screen fragment shader draws a field of vertical luminous filaments, one per resonator band, each glowing with that band's live amplitude (tapped from a per-band `AnalyserNode`). The two hands are luminous poles the filaments bend toward; a chord change ripples a cool brightening wave across the field; an idle shimmer keeps it alive with no signal. Palette is cold struck-metal (near-black → steel-blue → incandescent near-white). WebGL2 absent → an on-brand Canvas2D fallback of the same filaments.

## Named reference

**Golan Levin & Zachary Lieberman, "Manual Input Sessions" (2004)** — hands casting shapes that generate synchronized sound and graphics. Resonhand follows that lineage of hand-shaped sound+image, here reaching into a real recording's live harmony rather than generating abstract form.

## Constraints honored

Client component; audio is Karel's catalog only, all terminating in `createSafeMaster`; shared camera module; visible tracking-status line with an actionable lost-state hint; graceful degradation for camera / WebGL2 / audio; `useImmersive` + `ImmersiveHud` fullscreen with chrome hidden; semantic chrome tokens (violet accent only); no noise overlay; no new dependencies or API routes.
