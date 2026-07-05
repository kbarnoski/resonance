// ════════════════════════════════════════════════════════════════════════════
// hopf.ts — the genuine Hopf fibration S³ → S², plus stereographic projection
// and 4D (unit-quaternion) rotation. All the topology lives here.
//
// A point b = (x,y,z) on the base 2-sphere S² lifts to its FIBRE: a great circle
// in the 3-sphere S³. Using the standard quaternion parametrisation:
//
//   N = sqrt(2(1+z))
//   a = (1+z)/N · cos t
//   b = (1+z)/N · sin t
//   c = (x·cos t − y·sin t)/N
//   d = (x·sin t + y·cos t)/N          (t ∈ [0, 2π))
//
// One verifies |(a,b,c,d)| = 1, so the fibre lives on S³. Stereographic
// projection from the pole (0,0,0,1),
//
//   (a,b,c,d) → (a,b,c)/(1−d),
//
// turns each fibre into a circle in R³; the fibres over a circle of latitude on
// S² form a (Villarceau/Clifford) torus, and the whole S² gives nested, mutually
// LINKED tori. A slowly-varying 4D rotation q ↦ qL · q · qR spins the bundle
// through dimensions the projection cannot hold still — the rings breathe and
// turn inside-out. That is the "float through 4D" motion.
//
// Ref: Heinz Hopf (1931); Niles Johnson's Hopf-fibration visualisation;
// Villarceau circles / the Clifford torus.
// ════════════════════════════════════════════════════════════════════════════

export type Quat = [number, number, number, number]; // (a,b,c,d) = a + b·i + c·j + d·k

/** Quaternion product q1·q2 with components (w,x,y,z) = (a,b,c,d). */
export function quatMul(q1: Quat, q2: Quat): Quat {
  const [w1, x1, y1, z1] = q1;
  const [w2, x2, y2, z2] = q2;
  return [
    w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2,
    w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
    w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
    w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2,
  ];
}

/** Unit quaternion for an angle about a 3-axis (used to build the 4D rotation). */
export function axisQuat(ax: number, ay: number, az: number, angle: number): Quat {
  const len = Math.hypot(ax, ay, az) || 1;
  const h = angle * 0.5;
  const s = Math.sin(h) / len;
  return [Math.cos(h), ax * s, ay * s, az * s];
}

/** Apply the 4D rotation qL · q · qR to a point on S³. */
export function rotate4(p: Quat, qL: Quat, qR: Quat): Quat {
  return quatMul(quatMul(qL, p), qR);
}

/** Stereographic projection S³ → R³ from the pole (0,0,0,1). */
export function stereo(p: Quat): [number, number, number] {
  const inv = 1 / (1 - p[3] + 1e-6);
  return [p[0] * inv, p[1] * inv, p[2] * inv];
}

/** The Hopf fibre point over base b=(x,y,z)∈S² at parameter t. */
export function fibrePoint(
  x: number,
  y: number,
  z: number,
  t: number,
): Quat {
  const N = Math.sqrt(2 * (1 + z)) || 1e-4;
  const ct = Math.cos(t);
  const st = Math.sin(t);
  const s = (1 + z) / N;
  return [s * ct, s * st, (x * ct - y * st) / N, (x * st + y * ct) / N];
}

export interface BasePoint {
  x: number;
  y: number;
  z: number;
  lat: number; // z, in [-1,1] — drives colour and pitch
  lon: number; // longitude in radians
}

export interface FibreRange {
  start: number; // first vertex index (in vertices, not floats)
  count: number; // vertices in the loop
}

export interface FibreGeometry {
  /** Interleaved [a,b,c,d, lat] per vertex, all fibres concatenated. */
  data: Float32Array;
  stride: number; // floats per vertex (5)
  ranges: FibreRange[];
  bases: BasePoint[]; // one per fibre, index-aligned with ranges
  vertexCount: number;
}

export interface FibreConfig {
  latRings: number; // nested tori (circles of latitude on S²)
  perRing: number; // fibres per ring (longitudes)
  segments: number; // segments per fibre loop
  latMin: number; // avoid the −1 singularity
  latMax: number;
}

/**
 * Sample the base S² as `latRings` circles of latitude × `perRing` longitudes
 * and generate every fibre as a closed loop of `segments` S³ points. The result
 * is a set of nested, linked tori once projected.
 */
export function buildFibres(cfg: FibreConfig): FibreGeometry {
  const { latRings, perRing, segments, latMin, latMax } = cfg;
  const stride = 5;
  const bases: BasePoint[] = [];
  const ranges: FibreRange[] = [];

  // First pass: enumerate base points.
  for (let li = 0; li < latRings; li++) {
    const u = latRings === 1 ? 0.5 : li / (latRings - 1);
    const z = latMin + (latMax - latMin) * u;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    for (let mi = 0; mi < perRing; mi++) {
      // golden-angle offset per ring so longitudes interleave, not stack
      const lon = (mi / perRing) * Math.PI * 2 + li * 2.399963;
      bases.push({
        x: r * Math.cos(lon),
        y: r * Math.sin(lon),
        z,
        lat: z,
        lon,
      });
    }
  }

  const vertsPerFibre = segments; // LINE_LOOP closes itself
  const totalVerts = bases.length * vertsPerFibre;
  const data = new Float32Array(totalVerts * stride);

  let v = 0;
  for (let f = 0; f < bases.length; f++) {
    const b = bases[f];
    ranges.push({ start: v, count: vertsPerFibre });
    for (let sIdx = 0; sIdx < segments; sIdx++) {
      const t = (sIdx / segments) * Math.PI * 2;
      const q = fibrePoint(b.x, b.y, b.z, t);
      const off = v * stride;
      data[off] = q[0];
      data[off + 1] = q[1];
      data[off + 2] = q[2];
      data[off + 3] = q[3];
      data[off + 4] = b.lat;
      v++;
    }
  }

  return { data, stride, ranges, bases, vertexCount: totalVerts };
}
