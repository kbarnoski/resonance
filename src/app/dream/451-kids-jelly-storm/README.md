**For**: kids (4+)

A joyful jelly avalanche you conduct: tap, drag, and shake to make squishy jelly creatures RAIN — and the more chaos there is, the louder, faster, and more triumphantly the music climbs, then lands on a big happy chord when it all settles.

## How to play

- Press **TAP TO PLAY!** to start (this turns on the sound and, on iPhone/iPad, asks for shake permission).
- **Tap anywhere** to drop a new squishy jelly creature — it bounces and piles up.
- **Drag** across the screen to fling and poke the jelly around.
- **Shake** your phone or tablet to make jelly rain in a burst (if shake isn't available, tapping still rains jelly).
- A mouse works fine where there's no touch.
- Watch the bright bar at the top: as the jelly pile gets wild, the bar fills and the music gets bigger. Let it calm down and the music **resolves** to a big happy chord.

No reading is required to play — it's all squish, bounce, and sound.

### Hands-free / auto-demo

If nobody touches the screen for about 3 seconds, jelly starts raining and bouncing on its own. The music builds toward a triumphant peak, the screen calms, the music resolves, and the loop starts again — so the piece is fully alive in sight and sound with zero interaction.

## The technique — Position Based Dynamics soft bodies

Each creature is a small **filled soft body** simulated with **Position Based Dynamics**. It's a ring of perimeter particles plus a center particle, held together by two kinds of constraints that we project a few times per frame:

1. **Distance constraints** — perimeter springs, spokes to the center, and a few cross-braces keep the blob from collapsing or stretching.
2. **An area (volume) constraint** — the polygon's signed area is pulled back toward its rest area, so the blob genuinely *squishes* on impact and bounces back to full volume. That compression also drives the glow and the sound, so you can *see* and *hear* the squish.

We integrate Verlet-style, run a couple of substeps with ~5 solver iterations each, and add cheap blob-vs-blob and bouncy-floor collisions so the creatures pile and jostle. The count is capped (~36) so it stays fast.

- Cited: Müller, Heidelberger, Hennix, Ratcliff, *"Position Based Dynamics"* (Journal of Visual Communication and Image Representation, 2007) — the constraint-projection method this engine is built on.
- Why now: soft-body physics in the browser is having a moment in 2025 — see the WebGPU **AVBD** (Augmented Vertex Block Descent) solvers and projects like **jure/webphysics** pushing real-time deformable bodies straight onto the web. PBD is the friendly, robust ancestor of that family and runs everywhere, which is exactly what a kids' toy needs.

Rendered with **three.js / WebGL**: each creature is re-triangulated from its particles every frame into a glowing, additively-blended blob in bold saturated colors, over a dark playful background that brightens with the chaos.

## Audio design — escalate, then resolve

Pitched **melodic** synthesis only (no drum-machine grid — that's banned this cycle). Warm marimba/mallet voices: triangle + sine body with a light, fast FM shimmer and a quick decay, plus an **always-on warm pad** so it's never silent.

Everything is in **G major** — the full major scale and real diatonic chords (not a pentatonic drift). The live physics **energy** (total kinetic energy + spawn rate) drives the intensity:

- **Low energy** → sparse single mallet notes over a soft pad.
- **Rising energy** → a faster, denser arpeggio that climbs a **I–IV–V–I** progression, brightening the pad and, at peak chaos, dropping a **triumphant tutti chord**.
- **Calming down** → the engine **RESOLVES to the tonic G-major chord** — the satisfying payoff. The build-and-resolve arc is the heart of the piece.

A final **DynamicsCompressor brick-wall limiter** plus a sane master gain keep it kid-safe: full and energetic, but never harsh or scary, even when the screen is full of bouncing jelly.

## Graceful degradation

- No WebGL → a readable, friendly notice instead of a blank screen.
- No DeviceMotion (or permission denied) → tapping and dragging still rain jelly.
- No touch → mouse works.
- No interaction → the auto-demo runs the whole build-and-resolve loop on its own.

## Next-cycle deepening (cycle 1 of the "Squish" spine)

This is cycle 1 of a multi-cycle **"Squish"** spine. Next cycles could:

- Give creatures **faces and personalities** that react to being squished (eyes squeeze shut on impact), deepening the emotional read for little kids.
- Let two players share the storm on one screen, each "owning" a color so the harmony reflects who's making the chaos.
- Move the solver toward a **WebGPU AVBD** path for many more creatures and true self-collision, with the area constraint mapped to a fuller, breathier pad voice.
- Add a gentle "calm down together" mode where holding still on purpose triggers an extended, ceremonial resolve — teaching the build-and-release arc as a feeling.
