// ─────────────────────────────────────────────────────────────────────────────
// figure.ts — the point-light skeleton (Johansson 1973 biological motion).
//
//   Fourteen joint markers in 3D LOCAL coordinates (Y up, figure roughly
//   centred on the origin) describe a dancer frozen in a pirouette pose: one
//   standing pivot leg, the other extended out and forward, arms open. The
//   whole figure is spun about the vertical axis by scene.ts; here we only
//   supply the local pose and a gentle, legible "aliveness" cycle (a breathing
//   bob + a slow arm/leg sway) so the walker is never rigidly static.
//
//   No Math.random / Date.now anywhere: any variation is deterministic, driven
//   by a mulberry32 seed and the animation phase.
// ─────────────────────────────────────────────────────────────────────────────

/** Deterministic seedable PRNG. Same seed → same stream, every run. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Joint {
  name: string;
  x: number;
  y: number;
  z: number;
}

// Base pose. Depth (z) is deliberately non-trivial on the limbs — the extended
// leg and the two arms carry the figure forward/back, so that when the figure
// spins the projected horizontal motion is rich enough to read as a person,
// yet (orthographically) perfectly ambiguous in depth.
export const JOINTS: readonly Joint[] = [
  { name: "head", x: 0.0, y: 1.75, z: 0.0 },
  { name: "shoulderL", x: -0.52, y: 1.25, z: 0.0 },
  { name: "shoulderR", x: 0.52, y: 1.25, z: 0.0 },
  { name: "elbowL", x: -1.02, y: 1.12, z: 0.18 },
  { name: "elbowR", x: 1.04, y: 1.34, z: -0.16 },
  { name: "handL", x: -1.5, y: 0.92, z: 0.34 },
  { name: "handR", x: 1.48, y: 1.62, z: -0.32 },
  { name: "pelvis", x: 0.0, y: 0.05, z: 0.0 },
  { name: "hipL", x: -0.3, y: 0.0, z: 0.0 },
  { name: "hipR", x: 0.3, y: 0.0, z: 0.0 },
  { name: "kneeR", x: 0.3, y: -0.95, z: 0.0 }, // standing / pivot leg
  { name: "footR", x: 0.32, y: -1.85, z: 0.05 },
  { name: "kneeL", x: -0.62, y: -0.52, z: 0.46 }, // raised leg, out & forward
  { name: "footL", x: -1.06, y: -0.34, z: 0.96 },
];

export const JOINT_COUNT = JOINTS.length;

/**
 * Fill `out` (length JOINT_COUNT*3) with the animated LOCAL joint positions at
 * phase `t` (seconds). Motion is intentionally minimal — a soft breathing bob
 * plus a slow limb sway — because the compelling motion is the spin applied by
 * the scene. `alive` scales the sway (0 = frozen pose, honours reduced-motion).
 */
export function applyPose(t: number, alive: number, out: Float32Array): void {
  const breathe = Math.sin(t * 1.1) * 0.03 * alive; // whole-body vertical bob
  const armSway = Math.sin(t * 0.9) * 0.05 * alive;
  const legSway = Math.sin(t * 0.9 + 1.6) * 0.05 * alive;

  for (let i = 0; i < JOINT_COUNT; i++) {
    const j = JOINTS[i];
    let x = j.x;
    let y = j.y + breathe;
    const z = j.z;

    // Arms counter-sway for a living, articulated read.
    if (j.name === "handL" || j.name === "elbowL") {
      y += armSway;
      x -= armSway * 0.4;
    } else if (j.name === "handR" || j.name === "elbowR") {
      y -= armSway;
      x += armSway * 0.4;
    } else if (j.name === "footL" || j.name === "kneeL") {
      // The lifted leg rises and settles a touch — the most legible cue that
      // this is a body, not a diagram.
      y += legSway;
    }

    out[i * 3] = x;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = z;
  }
}
