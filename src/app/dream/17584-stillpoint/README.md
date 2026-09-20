# 17584-stillpoint — the instrument is stillness

One of Karel's real piano takes plays whole and present only when you hold your body still; any movement scatters it, granulating and blurring the recording toward a distant whisper.

**Status**: wip — audio graph (clean loop ⇄ granular reader crossfade) + Canvas2D halo built, control path fully synchronous and traceable; pose/motion path untested headless (no webcam in the build environment), verified via the auto-demo and pointer fallback.

## The idea

This inverts the whole "conduct the music with big gestures" premise of the lab. Here the instrument is **stillness**: your job is to become quiet, and the reward is the music arriving intact. Motion is the enemy of the sound, not its source. It's a meditative, cosmic-ambient piece — the screen is nearly bare and the sound is the star.

## Interaction

Full-body pose via `createPoseTracker(1)`, but the piece **gates only on the two shoulders** (`POSE_LM.LEFT_SHOULDER` = 11, `POSE_LM.RIGHT_SHOULDER` = 12, each `visibility > 0.5`). A seated laptop webcam sees the person waist-up, so requiring hips/ankles would silently drop the user into demo mode — nose (0) and wrists (15/16) are used only as extra detail *when* visible, never required.

A **motion-energy** signal is the mean frame-to-frame normalized displacement of those points. It is low-pass smoothed **asymmetrically** — fast attack (`k=0.55`), slow release (`k=0.016`) — so a twitch drops stillness at once and a held pose settles toward still over ~1–2 s. A noise floor (`0.0016`) lets a genuinely still seated body reach `stillness = 1`.

`stillness ∈ [0,1]` (1 = perfectly still) is the single control.

## Signal path

Karel's real catalog (`loadRealTrackBuffer`, default **"Bath"** `eba95845…`, a small selector over `REAL_TRACKS`) → one decoded `AudioBuffer` feeding two paths over the **same** recording:

- **clean** — looping `AudioBufferSourceNode` → `cleanGain` → `master.input`
- **scattered** — a **granular reader**: short (140 ms) Hann-windowed grains of the same buffer, scheduled ahead on `requestAnimationFrame`, read from a jittered read-head that loosely follows the clean playback position → `grainBus` → `scatterLP` (low-pass) → `scatterLevel` → `master.input`, with a `scatterLevel → convolver → reverbWet → master.input` wash.

Both terminate in **`createSafeMaster(ctx).input`** — nothing touches `ctx.destination`. The halo is driven from `master.analyser`.

## Mapping — stillness → presence

| Stillness | Clean loop | Granular scatter |
|---|---|---|
| → 1 (still) | `cleanGain = sin(s·π/2)` → unity, dry, full-band, close | grains stop spawning above `s = 0.985`; scatter fades out |
| → 0 (moving) | fades out | `scatterLevel = cos(s·π/2)·0.6` (recedes) · read-head pos jitter up to 0.32 s · grain pitch jitter ±0.05 · `scatterLP` closes to ~500 Hz · `reverbWet = (1−s)·0.7` widens |

Equal-power crossfade (sin/cos) avoids a level dip at the crossover; the granular path is heavily decorrelated so summing it with the clean copy blurs rather than comb-filters. All params smoothed with `setTargetAtTime(…, ~0.15 s)`; the control path is synchronous on rAF — no async hops.

## Visual

A single soft Canvas2D halo on near-black. It **contracts to a crisp bright still point** as stillness → 1 (color warms toward violet-white, core clarity rises), and **expands into a large diffuse halo scattered into ghosted offset rings** as you move — granulation made visible. A gentle trail fade + a small energy pulse off the analyser give it breath. No rich scene, no shader, no particle storm, no film grain. A small mono `stillness NN` readout with a thin bar sits top-left beside the tracking status.

## Works-when-shipped

- **Status line** (mono, top-left): `tracking · live` (primary) vs `pose lost · sit back so both shoulders are in frame` (destructive) vs labeled `demo` / `pointer`.
- **Auto-demo** runs **before** the camera is enabled: stillness breathes moving → still → moving on a ~15 s cosine so the coalesce/dissolve is audible and visible at a glance, clearly labeled "demo".
- **Graceful degradation**: no camera / denied / model fail → the demo keeps running and a **pointer fallback** (hold pointer still to gather, move fast to scatter) is available, with a visible notice. Fallbacks are always labeled and never pose as live tracking.

## Fullscreen

`useImmersive` / `ImmersiveToggle`. While immersive, all write-up chrome hides — only the halo, the stillness readout, the tracking status, error notices, and the exit pill remain.

## References

- **Embodied groove–synchrony model** — Frontiers in Psychology, fpsyg 2026.1803480 (2026-05-15): movement context reshapes auditory–motor coupling. Stillpoint **inverts** this — the *absence* of movement is the control variable.
- Phenomenology of meditative quiescence — stillness/quiet attention as a state that clarifies perception.
- Stillness-as-presence art lineage: **Éliane Radigue**, whose slow, sustained electronic drones treat prolonged stillness and sustained attention as the medium itself (the drone-as-presence tradition alongside La Monte Young).

## Constraints honored

Real catalog only (no synth/oscillator) · every path ends in `createSafeMaster` · shoulder-only gating (no lower-body requirement) · house-style semantic tokens only (no raw `text-white`, no `font-serif`) · no film grain · no drug/dosing language · client component, self-contained (imports only from `../_shared/`).
