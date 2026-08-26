// stroke.ts — the idle auto-demo calligraphic gesture.
//
// So the piece makes his sound and MOVES the moment it starts (no pointer
// required), an automatic brush stroke periodically draws itself and bows the
// take. Each gesture is a smooth Catmull-Rom sweep through a few points with a
// calligraphic press-release pressure profile. A real pointer takes over the
// instant it touches, and the auto-demo resumes only after a spell of quiet.

export interface AutoSample {
  x: number; // 0..1
  y: number; // 0..1
  pressure: number; // 0..1
  drawing: boolean; // false during the rest between gestures
}

interface Gesture {
  pts: { x: number; y: number }[];
  born: number; // ms
  drawMs: number; // gesture duration
  restMs: number; // pause after
}

function rand(a: number, b: number) {
  return a + Math.random() * (b - a);
}

/** A sweeping calligraphic path: start on one side, arc across the paper. */
function makeGesture(now: number, calm: boolean): Gesture {
  const leftToRight = Math.random() < 0.5;
  const x0 = leftToRight ? rand(0.1, 0.28) : rand(0.72, 0.9);
  const x1 = leftToRight ? rand(0.72, 0.9) : rand(0.1, 0.28);
  const pts: { x: number; y: number }[] = [];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = x0 + (x1 - x0) * t + rand(-0.08, 0.08);
    const y = rand(0.22, 0.8) + Math.sin(t * Math.PI) * rand(-0.12, 0.12);
    pts.push({ x: Math.min(0.95, Math.max(0.05, x)), y: Math.min(0.92, Math.max(0.08, y)) });
  }
  return {
    pts,
    born: now,
    drawMs: calm ? rand(3600, 5200) : rand(2200, 3400),
    restMs: calm ? rand(1600, 2600) : rand(700, 1400),
  };
}

function catmull(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number,
): { x: number; y: number } {
  const t2 = t * t;
  const t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number) =>
    0.5 *
    (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return { x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) };
}

export class AutoStroke {
  private g: Gesture;
  private calm: boolean;
  constructor(now: number, calm = false) {
    this.calm = calm;
    this.g = makeGesture(now, calm);
  }

  /** Sample the auto-gesture at wall-clock `now` (ms). */
  sample(now: number): AutoSample {
    const g = this.g;
    const age = now - g.born;
    if (age > g.drawMs + g.restMs) {
      this.g = makeGesture(now, this.calm);
      return this.sample(now);
    }
    if (age > g.drawMs) {
      // resting between gestures — ink dries, no bow
      const last = g.pts[g.pts.length - 1];
      return { x: last.x, y: last.y, pressure: 0, drawing: false };
    }
    const u = age / g.drawMs; // 0..1 along the gesture
    const seg = u * (g.pts.length - 1);
    const i = Math.min(g.pts.length - 2, Math.floor(seg));
    const localT = seg - i;
    const p0 = g.pts[Math.max(0, i - 1)];
    const p1 = g.pts[i];
    const p2 = g.pts[i + 1];
    const p3 = g.pts[Math.min(g.pts.length - 1, i + 2)];
    const pos = catmull(p0, p1, p2, p3, localT);
    // calligraphic press-release: swell in the middle, lift at the ends
    const pressure = 0.25 + 0.7 * Math.sin(Math.min(1, Math.max(0, u)) * Math.PI);
    return { x: pos.x, y: pos.y, pressure, drawing: true };
  }
}
