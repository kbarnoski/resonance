// Converts the 21 hand landmarks (mirrored, 0..1 image space) into the
// particle-field's world space (roughly -1.35..1.35, y-up) and eases them
// frame-to-frame so a lost/returning hand doesn't snap the particle field.

import type { HandLandmark } from "./handLoader";
import { ANCHOR_COUNT } from "./gpu";

export interface AnchorTracker {
  /** Float32Array of length ANCHOR_COUNT*2, [x0,y0,x1,y1,...] in world space. */
  current: Float32Array;
  update(landmarks: HandLandmark[] | null, dt: number): void;
}

export function createAnchorTracker(): AnchorTracker {
  const current = new Float32Array(ANCHOR_COUNT * 2);
  // start clustered near the center so the first frame isn't a jump-cut
  for (let i = 0; i < ANCHOR_COUNT; i++) {
    current[i * 2] = 0;
    current[i * 2 + 1] = 0;
  }

  function update(landmarks: HandLandmark[] | null, dt: number): void {
    const k = 1 - Math.exp(-12 * dt);
    if (landmarks && landmarks.length >= ANCHOR_COUNT) {
      for (let i = 0; i < ANCHOR_COUNT; i++) {
        const p = landmarks[i];
        const tx = (p.x - 0.5) * 2.3;
        const ty = -(p.y - 0.5) * 2.3;
        current[i * 2] += (tx - current[i * 2]) * k;
        current[i * 2 + 1] += (ty - current[i * 2 + 1]) * k;
      }
    }
    // when absent, anchors simply hold their last position — the compute
    // shader's `presence` term already weakens the pull toward them.
  }

  return { current, update };
}
