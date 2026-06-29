# Morning digest — last updated 2026-06-29 ~22:15 UTC (cycle 603)

## Open this first
- **[1057-face-bloom](https://getresonance.vercel.app/dream/1057-face-bloom)** — *your FACE is the instrument.* Allow the camera, then **open your jaw** to bloom the kaleidoscope, **raise your brows** to heat and densify it, **turn your head** to tour tunnels → spokes → spirals → honeycombs, **smile** to push it gold. Idle/neutral = quiet warm dark; it comes alive only as you express. The petals aren't arbitrary — they're real Klüver form constants warped out of your visual cortex's log-polar map (the shared `_shared/psych/` engine). No camera? Sliders play the same instrument. `state: psilocybin · pole: intense-warm`.

## Why this one
The lab has webcam *hand* tracking (1051) but had **never used the face** — and MediaPipe now hands us **52 live facial-expression coefficients** (jaw, brow, squint, smile), a *semantic* control channel, not raw geometry. So the instrument isn't "where's your hand," it's "what's your face *doing*" — a uniquely apt psychedelic coupling (your face dissolving into the field). It's the **3rd piece to compose the new shared engine** instead of re-deriving it, and the lowest-friction camera demo in the lab (no calibration — just emote).

## Also explored (banked, not shipped)
WIDE fire — **"active-control surfaces the lab hasn't used"**, 3 parallel builders (face / tilt / hand-conduct), shipped the strongest:
- **1059-piano-flock** ⭐ (IDEAS §603) — *conduct a GPU particle flock by hand; the flock's living shape re-voices YOUR PIANO.* Brings back the WebGPU **compute** body you wanted (and uses your real *Welcome Home* recordings via the anon API + file-drop). Lost only because that compute-body + real-piano combo just shipped twice (1052/1053) — first to resurrect.
- **1058-tilt-temple** (IDEAS §603) — *steer a cosmic-ambient void descent by tilting your phone*, with a Shepard-tone "endless fall." Canvas2D (dodges the banned shader form), but it's another tunnel — adjacent to 1041/1042/1051, so it lost on diversity.

## Research finding worth a look
- **MediaPipe Face Landmarker** ships 52 ARKit-style **blendshape** expression coefficients + a head-pose matrix live in-browser (GPU). That's an under-used *expression* control surface for the whole lab — face, smile, squint, brow as instrument inputs (RESEARCH §603). 1057 is the first to use it.

## Open questions for Karel
- Want a small public **Welcome Home track-list endpoint**? It'd let 1059 (and others) auto-load your real piano instead of you dropping a file at review.
- Next infra is a DEEP cycle: **`feedback.ts`** (ping-pong accumulator, re-derived in 1047) + the **drone/Shepard/convolution-void** audio kit (re-synthesized in 5+ recent pieces incl. this fire's 1058). Worth it?

## Caveat (same as every cycle)
Built + type/lint-clean (authoritative `npm run build`: **✓ Compiled successfully → lint + type-check pass, 0 issues from the 1057 folder**; only the standing container fd-ceiling blocks local static-gen — Vercel deploys fine, lab is live). **Not camera/ear-verified** in-container (no webcam/audio) — the expression→bloom feel, organ balance, and the squint-shimmer threshold are reasoned, not yet seen/heard; first review may want a gain tune.
