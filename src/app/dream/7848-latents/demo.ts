// 7848-latents — the seeded self-demo explorer.
//
// On load, a deterministic explorer (mulberry32 0x7848) roams the field,
// discovers a few good spots BY SCANNING (see discoverFeatures), drops a marker
// at each as it arrives, then hands off to the sequencer to loop the authored
// path. A reviewer on a sensor-less phone sees the token wander, markers appear,
// a path form, and the loop begin — entirely without input, within ~8 s. The
// instant the user touches the field the demo is abandoned.

import { discoverFeatures, mulberry32, type Field, type Point } from "./field";

export interface Explorer {
  /** the good spots the explorer will discover, in visiting order. */
  markers: Point[];
  /** dense roam polyline the token follows during the explore phase. */
  roam: Point[];
  /** roam index at which each marker is revealed. */
  revealAt: number[];
  /** seconds the explore phase lasts before playback takes over. */
  exploreSeconds: number;
}

/**
 * Plan the explore phase: a meandering route that visits each discovered
 * feature, with small seeded wiggles so the wander reads as searching, not a
 * straight line. Markers are revealed on arrival at each feature.
 */
export function createExplorer(field: Field, seed = 0x7848): Explorer {
  const rnd = mulberry32(seed ^ 0x51ed);
  const markers = discoverFeatures(field, 5, 0.2);

  const roam: Point[] = [];
  const revealAt: number[] = [];

  // Start a little away from the first marker so the token is seen approaching.
  let cur: Point = {
    x: clamp01(markers[0].x + (rnd() - 0.5) * 0.4),
    y: clamp01(markers[0].y + (rnd() - 0.5) * 0.4),
  };
  roam.push(cur);

  for (let m = 0; m < markers.length; m++) {
    const target = markers[m];
    const steps = 7;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      // ease toward the target with a decaying seeded wiggle
      const wig = (1 - t) * 0.14;
      const x = cur.x + (target.x - cur.x) * t + (rnd() - 0.5) * wig;
      const y = cur.y + (target.y - cur.y) * t + (rnd() - 0.5) * wig;
      roam.push({ x: clamp01(x), y: clamp01(y) });
    }
    cur = target;
    roam.push({ x: cur.x, y: cur.y });
    revealAt.push(roam.length - 1); // marker drops when the token arrives
  }

  return { markers, roam, revealAt, exploreSeconds: 6.5 };
}

/** Position along the roam polyline at explore-progress p ∈ [0,1]. */
export function roamAt(roam: Point[], p: number): { pos: Point; index: number } {
  const clamped = Math.max(0, Math.min(1, p));
  const f = clamped * (roam.length - 1);
  const i = Math.min(roam.length - 2, Math.floor(f));
  const t = f - i;
  const a = roam[i];
  const b = roam[i + 1];
  return {
    pos: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
    index: Math.round(f),
  };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
