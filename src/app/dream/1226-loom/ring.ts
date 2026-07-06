// ─────────────────────────────────────────────────────────────────────────────
// ring.ts — 1D circular mass-spring "membrane rim" for scanned synthesis.
//
// N masses arranged in a closed loop. Each mass has a scalar displacement.
// Forces per mass:
//   - spring to the two loop neighbours (discrete Laplacian → wave propagation)
//   - weak centering force pulling displacement back toward rest (0)
//   - velocity damping (so plucks ring out over a couple of seconds)
//   - a gentle low-mode "breathing" drive so the ring is never perfectly still
//
// Integrated with semi-implicit (symplectic) Euler at the SLOW haptic rate —
// several sub-steps per animation frame keep it stable while the visible wave
// sloshes around the loop over ~seconds. The instantaneous displacement array
// IS a single-cycle wavetable that an audio oscillator scans at pitch rate.
//
// Reference: Verplank, Mathews & Shaw, "Scanned Synthesis," ICMC 2000.
// ─────────────────────────────────────────────────────────────────────────────

export const RING_N = 128;

export interface RingState {
  n: number;
  pos: Float32Array; // displacement per mass — this is the live wavetable
  vel: Float32Array; // velocity per mass
  kSpring: number;
  kCenter: number;
  damping: number;
}

export function makeRing(n: number = RING_N): RingState {
  const ring: RingState = {
    n,
    pos: new Float32Array(n),
    vel: new Float32Array(n),
    kSpring: 1500, // neighbour coupling — sets wave-travel speed around the loop
    kCenter: 13, // weak restoring-to-rest
    damping: 0.5, // velocity damping (per second)
  };
  seedBreathing(ring, 0.13);
  return ring;
}

// Seed a soft standing wave so a cold-glance page already shows motion.
export function seedBreathing(ring: RingState, amp: number): void {
  const { n, pos, vel } = ring;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pos[i] = amp * (Math.sin(2 * a) * 0.7 + Math.sin(3 * a + 1.0) * 0.4);
    vel[i] = 0;
  }
}

// Advance the physical simulation by dt seconds.
//   t          — running clock (drives the breathing forcing)
//   breatheGain — amplitude of the gentle idle drive
export function stepRing(
  ring: RingState,
  dt: number,
  t: number,
  breatheGain: number,
): void {
  const sub = 4;
  const h = Math.min(dt, 0.05) / sub;
  const { n, pos, vel, kSpring, kCenter, damping } = ring;

  for (let s = 0; s < sub; s++) {
    const tt = t + s * h;
    for (let i = 0; i < n; i++) {
      const left = pos[i === 0 ? n - 1 : i - 1];
      const right = pos[i === n - 1 ? 0 : i + 1];
      const lap = left + right - 2 * pos[i];
      const a = (i / n) * Math.PI * 2;
      const drive =
        breatheGain *
        (Math.sin(2 * a) * Math.cos(tt * 0.9) +
          0.6 * Math.sin(3 * a) * Math.cos(tt * 1.37));
      const force = kSpring * lap - kCenter * pos[i] - damping * vel[i] + drive;
      vel[i] += force * h; // semi-implicit: velocity updated first
    }
    for (let i = 0; i < n; i++) {
      pos[i] += vel[i] * h; // then position uses the fresh velocity
    }
  }
}

// Pluck = inject a gaussian bump of displacement + velocity near `center`.
export function pluckRing(
  ring: RingState,
  center: number,
  width: number,
  amp: number,
  kick: number,
): void {
  const { n, pos, vel } = ring;
  const w2 = 2 * width * width;
  for (let i = 0; i < n; i++) {
    let d = Math.abs(i - center);
    d = Math.min(d, n - d); // circular distance around the loop
    const g = Math.exp(-(d * d) / w2);
    pos[i] += amp * g;
    vel[i] += kick * g;
  }
}
