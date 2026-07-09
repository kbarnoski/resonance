// ─────────────────────────────────────────────────────────────────────────────
// 1320-khole-tunnel · desync.ts — the audio-visual DESYNC engine.
//
//   The signature mechanic of "Unbinding": the beat you HEAR comes loose from
//   the flash you SEE. Every frame the render loop pushes the current visual
//   pulse drive (0..1). The audio does NOT read that value — it reads
//   `readLagged()`, which returns the drive from `lagSeconds` AGO. So the
//   audio throb trails the visual breath by a slowly drifting offset.
//
//   This is the phenomenology of dissociative sensory UNBINDING — the uncoupling
//   of sensory input from awareness described in Bera et al. 2026 ("Cortical
//   Mechanisms Contributing to Ketamine-Induced Dissociation"), where the
//   retrosplenial ~3 Hz rhythm rides the same clock but perception comes apart.
//
//   The lag is a slow sine (~0.05 Hz) wandering between ~0.3 s and ~1.2 s. A
//   `dissociation` amount (0..1, rises while the viewer holds toward the light)
//   widens the lag range AND speeds the drift — so the world un-binds MORE the
//   deeper you go. At rest the offset is small and nearly steady; at depth it
//   swings the full 0.3→1.2 s and wobbles faster.
//
//   No React, no Web Audio — pure math over a ring buffer so either sense can
//   read it. Deterministic given the same push sequence.
// ─────────────────────────────────────────────────────────────────────────────

export interface DesyncEngine {
  /** Store the current visual drive (0..1) and advance the internal clock. */
  push(v: number, dtSeconds: number): void;
  /** The drive value from `lagSeconds` ago (linearly interpolated). */
  readLagged(): number;
  /** 0..1 depth: widens the lag range and speeds the drift. */
  setDissociation(d: number): void;
  /** Current lag in seconds — handy for HUD / debugging. */
  currentLag(): number;
}

const BUFFER_SECONDS = 4; // must comfortably exceed the max lag (1.2 s)
const ASSUMED_HZ = 120; // headroom for high-refresh displays
const CAPACITY = Math.ceil(BUFFER_SECONDS * ASSUMED_HZ);

const LAG_FLOOR = 0.3; // never tighter than ~0.3 s
const LAG_CEIL = 1.2; // never looser than ~1.2 s

export function createDesync(): DesyncEngine {
  // Parallel circular buffers of (absolute time, value).
  const times = new Float32Array(CAPACITY);
  const vals = new Float32Array(CAPACITY);
  let head = -1; // index of the most-recent sample
  let count = 0;

  let clock = 0; // monotonic seconds since first push
  let driftPhase = 0; // phase of the slow lag-drift sine
  let dissociation = 0;
  let lag = LAG_FLOOR; // last computed lag, exposed via currentLag()

  const setDissociation = (d: number) => {
    dissociation = Math.min(1, Math.max(0, d));
  };

  const push = (v: number, dtSeconds: number) => {
    const dt = Math.min(0.1, Math.max(0, dtSeconds));
    clock += dt;

    // Drift the lag. At rest: slow (~0.03 Hz), tight range near the floor.
    // At depth: faster (~0.08 Hz), full 0.3→1.2 s swing.
    const driftHz = 0.03 + 0.05 * dissociation;
    driftPhase += 6.28318530718 * driftHz * dt;

    const center = LAG_FLOOR + (LAG_CEIL - LAG_FLOOR) * (0.15 + 0.45 * dissociation);
    const amp = (LAG_CEIL - LAG_FLOOR) * (0.08 + 0.42 * dissociation);
    lag = center + amp * Math.sin(driftPhase);
    lag = Math.min(LAG_CEIL, Math.max(LAG_FLOOR, lag));

    head = (head + 1) % CAPACITY;
    times[head] = clock;
    vals[head] = Math.min(1, Math.max(0, v));
    if (count < CAPACITY) count++;
  };

  const readLagged = (): number => {
    if (count === 0) return 0;
    const target = clock - lag;

    // Walk backward from the newest sample to find the bracketing pair.
    let newer = head;
    for (let i = 1; i < count; i++) {
      const older = (head - i + CAPACITY) % CAPACITY;
      if (times[older] <= target) {
        // target lies between `older` and `newer` — linear interpolate.
        const t0 = times[older];
        const t1 = times[newer];
        const span = t1 - t0;
        if (span <= 1e-6) return vals[older];
        const f = Math.min(1, Math.max(0, (target - t0) / span));
        return vals[older] + (vals[newer] - vals[older]) * f;
      }
      newer = older;
    }
    // Target older than everything we hold — return the oldest sample.
    return vals[newer];
  };

  const currentLag = () => lag;

  return { push, readLagged, setDissociation, currentLag };
}
