# Vicinity

**Status**: wip (camera path untested in cloud — needs a webcam + headphones check)

Several of Karel's recordings live at different places in one dark room, each pinned in true 3D with HRTF spatial audio. Your body is the listener: move side to side to pass between the takes, and lean toward the camera to move deeper into the one in front of you — it swells and localises to its direction while the far ones recede. It is an embodied, full-body walk through an ensemble of real sound, best heard on headphones.

## How to

- Put on headphones and allow the camera.
- Move side to side to pass between the recordings.
- Lean toward the camera to move deeper into the one in front of you.
- No camera / permission denied / model failed to load? Move the pointer instead — left/right pans, up/down moves you deeper. On load, an autonomous demo walk drifts a slow figure-8 through the room so it is alive before you do anything.
- Press `f` for fullscreen, `i` for info.

## What's under it

**Input** — MediaPipe `PoseLandmarker` through the shared `cameraTracking` loader (CDN at runtime, never bundled). We gate on the two shoulders only — a seated laptop webcam sees the waist up, never the hips or legs — and read two body signals plus a shallow third:

- mirrored shoulder/nose centre x → **listener X** (lateral: pass between the takes);
- **shoulder WIDTH** as a depth proxy → **listener Z** (lean toward the camera, your shoulders grow in frame, you move deeper among the orbs; sit back and you retreat);
- torso height → a shallow **listener Y**.

A live/lost/demo/pointer status line is always visible, with a lost-state hint ("sit back so both shoulders are in frame") and a persistent headphones hint. Every camera/model call is wrapped in try/catch and degrades to the pointer fallback with a visible notice.

**Technique — multi-source HRTF spatial ensemble (6DoF-style navigation).** Each of four takes is an `AudioBufferSourceNode(loop)` → `GainNode` → `PannerNode` (`panningModel = "HRTF"`, `distanceModel = "inverse"`) pinned at a distinct point in a virtual room, with its own `AnalyserNode` tap, all terminating in the shared `safeMaster.input` bus (never `ctx.destination`). The `AudioContext` **listener** is your body — only its position travels (forward `-z`, up `+y` held fixed); the panners are static. Listener AudioParams are eased with `setTargetAtTime(…, 0.12)` so motion reads without jitter, with a guarded `setPosition()` / `setOrientation()` fallback for older Safari where the AudioParams are undefined. Moving the listener toward an orb makes that recording swell and localise through HRTF distance rolloff while the others recede — the inverse-square field does the mixing, your body does the navigating.

**Output** — a three.js cosmic room (deep indigo → rose / candlelit nebula). One glowing orb per take sits at its panner position, each a distinct warm indigo→rose hue; dust motes and faint strands between the orbs give depth; a soft listener aura marks where you are, and the camera follows it from behind so the room parallaxes as you move. Each orb breathes with its take's live energy (per-take analyser RMS) and its nearness to you.

**The four takes** (all Karel's real recordings, via `loadRealTrackBuffer` / `REAL_TRACKS`): Interplay, Bath, Playa, Rolling.

## Research anchor

Recent spatial-audio work places or generates *new* sound in space: 6DoF spatial-audio object manipulation (**AudioMiXR**, arXiv:2502.02929) and spatial-audio journeys through reconstructed rooms (**"Passing"**, arXiv:2609.27489). Vicinity inverts them: the spatial field is not generated or abstract — it is made of Karel's REAL recordings, and it is navigated by the body rather than by hands or a controller. The sources never move; you do.

## Notes / untested

The whole body → listener → HRTF-panned-ensemble path is wired across all four real takes, but the camera + headphones experience can't be exercised in the cloud — it needs a webcam and headphones to confirm the pose gating, the shoulder-width depth feel, and that the HRTF localisation reads convincingly. The demo walk and pointer fallback both drive the identical chain, so the audio graph and visuals can be checked without hardware.
