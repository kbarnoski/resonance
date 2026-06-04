# 311 · Kids Music Box

A slowly-rotating 3D music-box cylinder a young child studs with pins to compose a looping tune that **persists, accumulates, and keeps playing** — a little machine they build and that is remembered, not a momentary forgettable wash.

## The one question

> What if a ~4yo (can't read) could COMPOSE a looping tune by placing pins on a rotating 3D music-box cylinder — and that composition PERSISTS and grows over the session, so what the child made is remembered, instead of an instant-forgettable soundscape?

## How to play

1. Tap **Start** (this unlocks/resumes the Web Audio context and seeds a simple tune so the box is already singing).
2. The barrel spins slowly and continuously. A fixed glowing **comb** at the front (nearest the camera) plucks every pin as it rotates past.
3. **Tap a slot on the front face of the barrel** to add a pin (a colored stud pops up). Tap it again to remove it. The next time that stud rolls past the comb, it sounds.
4. **🧹 Start fresh** clears every pin so the child can begin a new tune.
5. **⏸ Hold / ▶ Spin** pauses and resumes the rotation.

The grid: **circumference = time steps** (14 steps per rotation), **cylinder length = pitches** (6 rows, low at the bottom). Taps are only accepted on the camera-facing front face (the slot's surface normal must point toward the camera), so the child can't accidentally toggle the far side.

## No reading required

Everything is color, shape, and motion. Each pitch row has its own warm color (shown as a little legend strip at the top), the studs the child taps ARE the melody, and a stud gives an immediate visual pop plus a glow ping each time it's plucked. The only text is a small caption for the supervising adult.

## Persistence / memory (the point)

The pattern is the state: a boolean grid `[row][step]`. It lives in a ref read every animation frame by the 3D scene, mirrored to React via a version counter so studs re-render. **Every toggle is written to `localStorage`** (`dream-311-kids-music-box-v1`) inside a try/catch that degrades silently if storage is unavailable (private mode, quota). On Start we **load the saved pattern if one exists**, otherwise seed a simple D-Lydian tune.

So the loop keeps playing while the child rearranges it, the work accumulates, and the box **remembers across reloads**. This is deliberately a break from the lab's recent "sensor → instant forgettable soundscape" pattern: here the child's composition is a thing that persists and grows.

## Named reference

- **Swiss cylinder musical box** — a pinned rotating brass cylinder plucking a tuned steel comb, invented ~1796 in Geneva. The whole physical metaphor (barrel + pins + comb + pluck-as-it-passes) is modeled on this. (The modern programmable *muro box* is the same idea with re-arrangeable pins, which is exactly what tapping does here.)
- **Karplus-Strong plucked-string synthesis** for the pluck timbre — a short filtered noise burst fed into a tuned delay line with a lowpass-averaging feedback term. Sounds like a real plucked comb tooth.

## Audio

- **Karplus-Strong** is rendered once per pitch at init into a short `AudioBuffer` (manual `Float32Array` fill: filtered noise excitation → delay line with lowpass feedback → attack/release envelope to avoid clicks). At play time we just fire a cheap `BufferSource` — the simplest reliable low-latency path (no `ScriptProcessor`/`AudioWorklet`, no per-note synthesis cost). Low rows ring longer; high rows are a touch brighter and decay slightly faster.
- Signal chain: sources → master gain (0.55) → dry + a **synthesized reverb** (filtered decaying-noise impulse, no audio files) → **`DynamicsCompressor` acting as a hard-ish limiter** → destination. The limiter + modest master gain keep dense patterns safe for small ears; nothing startling.

## Scale chosen (and why)

**D Lydian hexachord** — D, E, F#, G#, A, B (the raised 4th, G#, gives the bright Lydian sparkle). Bright, consonant, and pleasant with no harsh intervals, and **explicitly not C-major-pentatonic** (banned this cycle). Voiced low → high so the bottom row is the deepest note.

## Known rough edges

- Pin studs are individual meshes (one per active pin), not a single instanced mesh. Fine for a 14×6 grid but would want `InstancedMesh` if the grid grew large.
- Pluck timing is sampled per frame against the nearest step (`Math.round`), so at very low frame rates the pluck point could drift by part of a step. At 9s/rotation and 60fps this is inaudible.
- The hit-grid is a separate set of invisible planes kept in lockstep with the visible body via a shared rotation ref; if those ever desynced, taps would land on the wrong stud. Verified by construction (same `rotationRef`), but not browser-tested here.
- No WebGL → readable rose notice; no Web Audio → readable notice and the box still spins silently.

## Next-cycle deepening

- **InstancedMesh** studs + a subtle "rolling" highlight band sweeping with the comb.
- Velocity by tap pressure / row height, and a gentle per-pin volume.
- Multiple saved boxes (a shelf of barrels the child can switch between).
- A second concentric barrel for a bass/ostinato layer.
- Haptic tick on tap (Capacitor) for the iOS build.
- Export the tune as a tiny shareable code so a grown-up can save a child's favorite.
