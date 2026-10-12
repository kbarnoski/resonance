# Cymatica — conduct the sand figure of your own harmony

**Status**: wip — pointer path works end to end; camera (pose) + WebGL2 GPGPU float-texture paths are untested headless (no webcam / GPU in the build cloud), with a Canvas2D CPU fallback for the sim and a pointer fallback for the body.

## The one question

*What if your body could conduct the actual physical standing-wave geometry — the Chladni sand figure — of the harmony inside one of Karel's own piano recordings?*

One of Karel's real catalog piano takes always plays (audible). The chord sounding **right now** — read from the track's chord analysis — selects which Chladni plate modes `(m,n)` are excited, so the sand figure on screen **is** the harmony he is playing. You, seated at a laptop webcam and visible from the waist up, conduct the plate with your upper body; your motion also transforms the sound, so you control what you hear, not only what you see.

## The body → mode → sand → sound chain

Everything audible is smoothed with `setTargetAtTime(target, ctx.currentTime, 0.12)`; the gesture reading is lerped per frame so it feels conducted, not twitchy.

- **Wrist height** → **driving frequency / mode energy.** Higher hands push the plate into higher-order modes (a larger base `(m,n)`) and drive the grains harder.
- **Arm span** → the plate's **"tension":** how many modes ring (2–8) and their spacing (the m/n separation widens as you open your arms).
- **Torso lean / sway** → **damping:** more lean sharpens the descent and cuts the jitter, so the nodal lines go crisp; centered and loose, they stay diffuse.

Each of those also moves the **sound** of his real take: wrist height sweeps a **resonant lowpass** cutoff (≈360 Hz → 8.2 kHz), lean raises its **Q** (ties a sharp sound to sharp nodal lines), and arm span opens a **reverb-space send** — a feedback delay of his own filtered signal. Nothing connects to `ctx.destination`; the whole mix terminates at `createSafeMaster(ctx).input`, and no oscillator is ever a voice.

## The render — a genuine GPGPU sand simulation

**160,000** grains (`400 × 400`) live in a WebGL2 **ping-pong float texture** (`RGBA32F`), one grain per texel. This is a real simulated particle system, not a full-screen field shader:

1. **Sim pass** (fragment shader → position texture). For each grain the plate displacement field `D(x,y) = Σ a_{mn}·sin(mπx)·sin(nπy)` is summed over the active modes along with its analytic gradient. The grain does **gradient descent on `|D|`** — stepping along `−sign(D)·∇D` — so it migrates toward the **nodal lines** where `D ≈ 0`. **Jitter proportional to `|D|`** is added, so grains sitting on the antinodes (large `|D|`) get shaken off. Edges reflect. The emergent nodal figure is the physics, not a drawn curve.
2. **Grain pass.** A vertex shader reads each grain's position via `gl_VertexID`, recomputes `|D|` for a node-glow brightness, and draws a small **additive point** into a 16-bit float trail texture (faded each frame for a short persistence).
3. **Display pass.** Reinhard tone-map of the trail over a near-black steel plate.

**Palette:** near-black steel plate, bone / silver / warm-white sand, a faint **cool-violet** glow along the nodal lines. No green anywhere; no grain/noise overlay.

**Degradation:** no WebGL2 or no float render targets → a Canvas2D CPU sand sim (3,200 grains) running the **identical** field physics; no camera / pose-model failure → the pointer fallback drives the exact same `{height, span, lean}` control chain, labeled as pointer and never disguised as live tracking.

## Works-when-shipped

The pose reading gates **only** on shoulders (+ at least one wrist) — hips, knees and ankles are never required, because a seated laptop view never sees them. The status line reads `tracking · live`, `tracking · live · raise your hands into frame`, or a `text-destructive` `tracking lost · face the camera, shoulders in frame`, and the pointer fallback is always labeled.

## Named references

- **Ernst Chladni (1787)** — the founding cymatics experiment: a bowed metal plate strewn with sand settles into nodal "Chladni figures" that make a vibration's standing-wave geometry visible.
- The standard **Chladni mode equation** for a (idealized) square plate, `sin(mπx/L)·sin(nπy/W)`, whose integer mode numbers `m, n` rise with driving frequency — exactly the field summed per grain here (with `L = W = 1`).
- **ElvijsCoder's _Chladni_Sky_** — an open WebGL2 + Web Audio project that drives a GPU "sand" Chladni plate from audio; cited here as the lineage for doing the sand figure as a real GPGPU particle system rather than a painted field.

## Constraints honored

Client component; audio is Karel's verified catalog only (`loadRealTrackBuffer`), all terminating in `createSafeMaster`; shared `_shared/cameraTracking` pose loader; visible tracking-status line with an actionable lost-state hint; graceful degradation for camera / WebGL2 / audio; `useImmersive` + `ImmersiveHud` fullscreen with chrome hidden; viz fills the viewport; semantic chrome tokens with violet (`primary`) as the only accent; no serif, no grain/noise overlay, no off-brand hues, no new dependencies, no API route. Full teardown on unmount: camera tracks stopped, pose tracker closed, RAF cancelled, AudioContext closed, GL textures / framebuffers / programs / VAO deleted.
