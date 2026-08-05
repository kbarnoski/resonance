# 6968-kholapse

**The one question:** _What does it feel like to hear your own music dissolve as you fall into a ketamine k-hole?_

Drop one of Karel's real solo-piano recordings (or let the seeded arpeggio carry it) and a single **dissociation-depth** scalar `d ∈ [0,1]` smears time and folds space into a receding violet wireframe tunnel. This is **road A of 3** sibling explorations of the same idea: a **granular time-freeze** audio engine driving a **WebGL2 folding wireframe tunnel**.

## The mechanistic spine

**Bera, Looger, Proekt & Cichon, "Cortical Mechanisms Contributing to Ketamine-Induced Dissociation," _The Neuroscientist_ 32(1), 2026.** Dissociation is the cortex **suppressing feedforward stimulus-specific detail while feedback context / salience persists**, and at depth **generating internal patterns "without input."** Everything here maps `d` literally onto that split:

- **Feedforward (suppressed as d→1):** the recording's fine detail — grain sharpness, transient attacks, high-frequency content, pitch identity; the wireframe's line crispness and the treble-driven shard-tear.
- **Feedback / context (persists, even amplifies):** the slow gestalt — a frozen playhead, a sustained drone, reverb bloom, the tunnel's global motion and core glow, the bass-driven wall fold.
- **At d→1:** an internally-generated (seeded) drift takes over as the real audio thins — "internally-driven patterns divorced from reality."

## Mapping table — `d` → audio + visual

| `d` | Audio (granular time-freeze) | Visual (folding wireframe tunnel) |
|---|---|---|
| **0** surface | playhead at real time; grains ~70 ms; `playbackRate` 1.0; HF open (16 kHz); no echo; reverb dry; drone calm | crisp fine wireframe; fast forward travel; single-fold tunnel; audio drives motion |
| **0.5** drift | playhead at ½ speed; grains ~270 ms; rate ~0.79 (pitch/tempo decouple); lowpass closing; ping-pong echo opening; reverb `wet=0.35`; drone drive `0.55` | lines widen/blur; travel slows; angle kaleido-folds into more shards; bass folds walls, treble tears shards; longer feedback smear |
| **1.0** k-hole | playhead **frozen**; grains ~460 ms; rate ~0.58; lowpass ~900 Hz (feedforward gone); echo wide; reverb `wet=0.7`; drone drive `0.8`; dry granular thinned | motion driven by **seeded internal drift**, not the (thinned) audio; many shards; long inward feedback advection; color detail desaturates; intimate vignette, never a cosmic white end |

**Live coupling (both directions):** an `AnalyserNode` reads amplitude, spectral centroid, and bass/mid/treble band energies. **Loud transients surface you** (ease effective `d` down → momentary sharpen); **silence sinks you** (ease `d` up above the slider baseline). A depth slider scrubs the whole arc by hand.

**Per-angular-sector spectral advection** is the fresh part: bass energy folds the tunnel walls one way while treble tears the shards the other — the _shape of the real music_ descends the hole, until at `d→1` the internal seeded drift, not the audio, drives the shader.

## Implementation notes

- **Determinism:** all randomness seeded with `mulberry32(0x6968)` — no `Math.random`, `Date.now`, or `new Date`. Time is `performance.now()` + `requestAnimationFrame`. The seeded just-intonation arpeggio is alive-on-load and demoable headless (silent until the first gesture, per Web Audio; the visual auto-drifts from first paint).
- **Ping-pong RGBA8 feedback** (two textures + FBOs, `UNSIGNED_BYTE` — no float-buffer extension) advects the smear inward.
- **Photosensitive-safety:** every luminance/opacity change is slow eased drift well under 3 Hz; `prefers-reduced-motion` slows travel and the `d`-easing further. No strobe, no Klüver honeycomb/hexagon geometry — a folding tunnel, not stripes.
- **Audio safety:** master gain ≤ 0.26 behind a `DynamicsCompressor` limiter; full teardown (stop sources, cancel the grain timer, disconnect, close) on dispose.
- **Graceful degrade:** no WebGL2 → on-brand `text-destructive` notice (never a white screen); failed decode → `text-destructive` message while the seeded arpeggio keeps playing.

## References

- Bera, Looger, Proekt & Cichon (2026), _The Neuroscientist_ 32(1) — the feedforward-suppression / feedback-persistence spine (built, not just cited).
- van Lommel et al. — NDE tunnel phenomenology (the receding-tunnel geometry, as inspiration).
- Classic k-hole phenomenology (time-freeze, pitch/tempo decoupling, ego-dissolution into internally-generated pattern) — inspiration only.

## Next-cycle deepening

- **Onset-aware grain scheduling:** detect transient onsets in the source buffer and quantize grain spawns to them, so a real piano attack punches through the freeze before dissolving — sharpening the feedforward/feedback contrast at the exact moments the ear expects detail.
- **Head-tracked drift:** feed pointer/gyro into a gentle camera nudge for a more embodied fall.
- **Stereo-decorrelated grain field** and a second internal-drift attractor so `d→1` blooms into two competing self-generated patterns rather than one, closer to the "without input" multiplicity Bera et al. describe.
