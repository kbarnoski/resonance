# Morning digest — last updated 2026-06-25 ~04:1x UTC (cycle 545, adult · WIDE)

## ☀️ Open this first
**[927-depth-room](https://getresonance.vercel.app/dream/927-depth-room)** — *your webcam becomes a depth camera, and distance is the instrument.* Tap **Enter the room**, allow the camera, and **lean in** → a close, bright granular foreground blooms and the room glows warm; **pull back** → it recedes to cool dark and a low drone. Move toward/away → shimmer rises. You're sculpted in light and sound by distance alone — no notes, no scale.
*Why it matters:* the lab's **first depth-camera piece** — the one thing the jury has named in *every single verdict* ("depth-camera STILL 0×"), always deferred for "needs a Kinect." A browser ML model (**Depth Anything V2** on **WebGPU via Transformers.js**) reads how far every pixel is from an ordinary laptop cam — no hardware. Music lives in **space/proximity, not pitch** (the jury's other standing ask). Camera is on-device, live, never recorded.

## New since yesterday
- **927-depth-room** (adult, WIDE fire) — winner of 3 orthogonal explorers. Camera → in-browser monocular-depth → HRTF-spatialized granular voices + a WebGL2 depth-shaded room. Ambition 4/5; in-README dated research citation now **11 cycles running**.

## Explored but banked (see IDEAS §545)
- **928-tilt-orrery** ⭐ resurrect-first — tilt your phone and a little cosmos of ~1,400 orbiting bodies pours around a gravity well; when a body swings to its closest point it strikes a percussive grain, so the **gravitational rhythm** is the music. Real **WebGPU compute** (the scarce GPU surface you loved in 130-tsl-particle-compute), CPU fallback. The cleanest unbuilt compute swing — next adult fire.
- **929-cathedral-rhythm** — play interlocking **Euclidean rhythms** (Reich-style phasing), pitch held to one drone, through a procedural cathedral reverb; a WebGL2 **raymarched stone nave** flashes with each pulse. MIDI / keyboard / pads.

## Research finding (RESEARCH §545)
- **A webcam is now a depth camera.** Real-time **monocular depth estimation** (Depth Anything V2, NeurIPS 2024) runs in the browser on **WebGPU via Transformers.js** — no install, no server, no special hardware. Drove 927 directly. (Model is 2024-foundational; the *in-browser WebGPU real-time path* is the recent enabler — flagged honestly.)

## Open questions for Karel
- Does **"lean in = bloom, pull back = drone"** read as embodied and musical, or do you want distance mapped to something stronger (a clear arc, or distance → *timbre* not just density)? Only your body + the real cam can tell.
- The depth model loads from a CDN on first open (a few seconds, then live ~6fps). If it doesn't load on your machine, you'll see the **synthetic breathing-depth fallback** — still sounds + shows, but it's not *you*. Worth knowing whether WebGPU+the model actually fire on your setup.

*Build: `✓ Compiled successfully in 81s`, lint + types clean (only the standing container EMFILE static-gen blocker — infra, Vercel deploys fine). NOT camera/WebGPU/ear-verified — no sensors in the build sandbox. 2 more explored — see IDEAS §545.*
