# 1590 · Body Mirror

**What if your whole body — not your voice — is the instrument, and the room hears where your hands are?**

A camera-driven, hands-free spatial-audio instrument. Your webcam watches your hands; where they are in the frame becomes where the sound is and where the light glows. No microphone, no singing, no typing — the body is the whole controller.

## How to play

1. On load the piece is already alive: a warm WebGL field breathes and a **synthetic demo body** moves two glowing hands so you can see and (after step 2) hear the idea without a camera.
2. Press **Start — begin the sound** — this is the gesture gate browsers require before audio can play. The demo body now drives real, spatialised sound.
3. Press **Enable camera to play with your body** to grant the webcam and switch the controller from the demo body to *you*.
4. With the camera live:
   - **Move a hand left ↔ right (X)** → its continuous voice **pans** across the stereo field (real `StereoPannerNode`) and its glowing trail follows.
   - **Raise / lower a hand (Y / height)** → its pitch climbs and descends a minor-pentatonic scale.
   - **Raise BOTH hands high** → a warm **chord pad swells** in, and a filament of light binds the two hands.
   - **Pinch** (thumb tip to index tip) → a bright note is **plucked and placed in 3-D space** through a real `PannerNode`, at the position of that hand.

Live readouts (mode / hands / swell / pan) sit along the bottom so you can watch the mapping work.

## The four wired subsystems

1. **Camera capture** — `getUserMedia({ video: { facingMode: "user" } })` into a hidden `<video>`.
2. **Landmark model** — **MediaPipe Tasks-Vision `HandLandmarker`** (`numHands: 2`, `VIDEO` mode), loaded at **runtime from a CDN** in `handLoader.ts` via a dynamic `import()` with a `/* webpackIgnore: true */` magic comment. Nothing is added to `package.json`; the WASM + `.task` model are fetched from jsdelivr / googleapis. Each new video frame calls `detectForVideo` with a forced-monotonic timestamp. From the 21 landmarks per hand we read the palm centre (wrist + middle-MCP midpoint), and the thumb-tip↔index-tip distance for the pinch.
3. **Spatial Web Audio** — `audio.ts`. Each hand owns a continuous triangle+sub voice → a real `StereoPannerNode` panned by hand X, pitched by hand height. A stacked sawtooth **pad** swells when both hands rise. A **pinch** spawns a transient plucked note routed through a real 3-D `PannerNode` (HRTF) positioned from the hand's screen location. Signal path: voices/pad/plucks → master gain (≤ 0.26, 1.4 s fade-in) → `DynamicsCompressor` limiter → destination. All nodes are faded and torn down on unmount.
4. **WebGL2 render** — `render.ts`. A single full-screen fragment shader (raw WebGL2, no Canvas2D) paints a warm breathing wash, additive **glowing trails** that follow each hand, bright hand cores that flash on a pinch, and the two-hand filament. Hand positions and up to 64 fading trail points are passed as `vec4` uniform arrays each frame.

That is 4 real subsystems, integrated and driving each other.

## Reference — Videoplace & Rozin's mirrors

Borrowed directly from **Myron Krueger's _Videoplace_ (1975)**: the earliest "artificial reality" where a camera turned the whole body silhouette into a live instrument — no wands, no gloves, no wires, just you in front of a lens making sound and image respond to where you are. I also took the surface idea from **Daniel Rozin's mechanical mirrors**, where a wall of physical elements reconfigures itself to reflect the viewer's body. Body Mirror fuses the two: the camera reads your hands like Videoplace, and the reactive "mirror" is a field of warm light (Rozin's reflecting surface, rendered in photons instead of wood or metal) that answers where your hands are. The one idea I leaned on hardest is Krueger's insight that **presence itself is the interface** — you do not pick up a controller, you *are* the controller.

## Palette

The chrome (title, buttons, readouts, modal) uses only semantic brand tokens (`text-foreground`, `text-muted-foreground`, `bg-primary`, `text-destructive`). The **art canvas is deliberately warm / embodied** — copper → amber → teal — the sanctioned off-violet zone, to make the piece feel like skin and firelight rather than the cool violet system chrome.

## Graceful degradation

- **No camera / permission denied / MediaPipe or WASM fails to load** → the piece stays fully alive: the synthetic **demo body** keeps driving the same audio and visuals, and an on-brand `text-destructive` notice explains what happened. The reviewer never sees a blank screen, and the whole audio-visual idea is demonstrable with no webcam at all.
- **No WebGL2** → a `text-destructive` notice explains the visual can't run; audio still works.
- **Audio gated** behind the Start button (browser autoplay policy); camera gated behind its own button, and enabling the camera also starts sound so the piece is never silent-while-visual or visual-while-silent.
- **`prefers-reduced-motion`** → shorter, faster-decaying trails and gentler smoothing.

## Honest gaps

- The MediaPipe bundle, WASM and hand model are pulled from a CDN on the first **Enable camera**, so that first press has a short spin and needs network + WebGL/WASM.
- Hands are assigned to voice slots by left→right screen order, not MediaPipe handedness, so if your hands cross, the two voices swap — musically fine, not identity-stable.
- Tempo/scale are fixed (minor pentatonic, root A3); the instrument is expressive in space and height, not in key changes.
- Output only — there is no microphone anywhere in this piece by design.
