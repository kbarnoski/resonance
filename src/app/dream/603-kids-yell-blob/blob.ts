// blob.ts — a spring-mass soft-body blob (semi-implicit Verlet-ish).
//
// A closed ring of N points orbits a center. Each point is a little mass on a
// radial spring to its rest radius, PLUS edge springs to its neighbors so the
// outline stays smooth and gooey instead of spiky. Loud audio "inflates" the
// rest radius and kicks the points outward; they overshoot and jiggle back —
// that's the squash-and-stretch. We also bias the whole thing with a per-axis
// squash so a yell flattens the blob like a cartoon impact.
//
// References for the feel: Disney squash-and-stretch (Preston Blair) and
// holtsetio's softbody engine — overshoot + neighbor coupling is what sells it.

const N = 40; // ring points — enough to be smooth, cheap enough for CPU

export type Blob = {
  n: number;
  cx: number;
  cy: number; // center, screen px
  baseR: number; // resting radius in px
  // per-point polar state
  ang: Float32Array;
  rad: Float32Array; // current radius offset from rest
  vel: Float32Array; // radial velocity
  restR: number; // current target rest radius (inflation)
  squashX: number; // 1 = none; <1 flattens horizontally
  squashY: number;
  squashVX: number;
  squashVY: number;
  wob: number; // ambient wobble amount
  t: number;
};

export function makeBlob(cx: number, cy: number, baseR: number): Blob {
  const ang = new Float32Array(N);
  const rad = new Float32Array(N);
  const vel = new Float32Array(N);
  for (let i = 0; i < N; i++) ang[i] = (i / N) * Math.PI * 2;
  return {
    n: N,
    cx,
    cy,
    baseR,
    ang,
    rad,
    vel,
    restR: baseR,
    squashX: 1,
    squashY: 1,
    squashVX: 0,
    squashVY: 0,
    wob: 0,
    t: 0,
  };
}

// A loud onset: kick the rim outward and snap a squash so it "pops".
export function popBlob(b: Blob, strength: number) {
  for (let i = 0; i < b.n; i++) {
    // uneven kick = lopsided goofy pop
    const lobe = 0.6 + 0.8 * Math.abs(Math.sin(b.ang[i] * 3 + b.t));
    b.vel[i] += strength * 90 * lobe;
  }
  // squash flat then it'll spring tall (stretch)
  b.squashVY -= strength * 6;
  b.squashVX += strength * 4;
  b.wob = Math.min(1.4, b.wob + strength * 0.9);
}

// loudness 0..1 sets inflation; step integrates the springs.
export function stepBlob(b: Blob, dt: number, loud: number) {
  b.t += dt;
  // inflation target: louder = bigger. Smooth toward it.
  const target = b.baseR * (1 + loud * 0.85);
  b.restR += (target - b.restR) * Math.min(1, dt * 8);

  const k = 120; // radial spring stiffness
  const damp = 4.5; // radial damping
  const neigh = 60; // neighbor smoothing stiffness

  for (let i = 0; i < b.n; i++) {
    const prev = (i - 1 + b.n) % b.n;
    const next = (i + 1) % b.n;
    // restore toward 0 offset (i.e. toward restR)
    let a = -k * b.rad[i] - damp * b.vel[i];
    // neighbor coupling: pull toward average of neighbors -> smooth blob
    const avg = (b.rad[prev] + b.rad[next]) * 0.5;
    a += neigh * (avg - b.rad[i]);
    // gentle ambient breathing wobble, scaled by wob energy
    a += Math.sin(b.t * 6 + i * 1.7) * (8 + b.wob * 70);
    b.vel[i] += a * dt;
    b.rad[i] += b.vel[i] * dt;
    // clamp so it never collapses through center or explodes off-screen
    if (b.rad[i] < -b.restR * 0.55) {
      b.rad[i] = -b.restR * 0.55;
      b.vel[i] *= -0.3;
    }
    if (b.rad[i] > b.restR * 1.2) {
      b.rad[i] = b.restR * 1.2;
      b.vel[i] *= -0.3;
    }
  }

  // squash springs back to 1,1 (cartoon settle)
  const sk = 90;
  const sd = 7;
  b.squashVX += (-sk * (b.squashX - 1) - sd * b.squashVX) * dt;
  b.squashVY += (-sk * (b.squashY - 1) - sd * b.squashVY) * dt;
  b.squashX += b.squashVX * dt;
  b.squashY += b.squashVY * dt;
  // keep squash volume-ish conserved a touch for the rubbery look
  b.squashX = Math.max(0.5, Math.min(1.7, b.squashX));
  b.squashY = Math.max(0.5, Math.min(1.7, b.squashY));

  b.wob *= Math.exp(-dt * 1.5); // wobble energy decays
}

// Build a triangle-fan position array in CLIP SPACE for the renderer.
// Returns center-first then ring then a repeat of the first ring point.
export function buildFan(b: Blob, w: number, h: number): Float32Array {
  const verts = (b.n + 2) * 2;
  const out = new Float32Array(verts);
  // center
  out[0] = (b.cx / w) * 2 - 1;
  out[1] = -((b.cy / h) * 2 - 1);
  for (let i = 0; i <= b.n; i++) {
    const idx = i % b.n;
    const r = b.restR + b.rad[idx];
    let px = Math.cos(b.ang[idx]) * r * b.squashX;
    let py = Math.sin(b.ang[idx]) * r * b.squashY;
    px += b.cx;
    py += b.cy;
    const o = (i + 1) * 2;
    out[o] = (px / w) * 2 - 1;
    out[o + 1] = -((py / h) * 2 - 1);
  }
  return out;
}

// A small filled circle fan in clip space (for eyes). pupilOff lets the pupil
// drift with audio for googly life.
export function buildCircle(
  cxPx: number,
  cyPx: number,
  rPx: number,
  w: number,
  h: number,
  squashX = 1,
  squashY = 1,
): Float32Array {
  const seg = 20;
  const out = new Float32Array((seg + 2) * 2);
  out[0] = (cxPx / w) * 2 - 1;
  out[1] = -((cyPx / h) * 2 - 1);
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const px = cxPx + Math.cos(a) * rPx * squashX;
    const py = cyPx + Math.sin(a) * rPx * squashY;
    const o = (i + 1) * 2;
    out[o] = (px / w) * 2 - 1;
    out[o + 1] = -((py / h) * 2 - 1);
  }
  return out;
}
