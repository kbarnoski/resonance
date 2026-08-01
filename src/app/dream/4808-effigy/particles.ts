// ── 4808-effigy · the PARTICLE-BODY (three.js GPU points) ───────────────────
//
// ~15k additive points. Each is permanently bound to one bone of the 33-landmark
// skeleton (a fraction sample its length) or is free ambient "dust". Every frame
// each point springs toward its bone target with a stiffness that FALLS as motion
// energy rises, while a curl-ish flow field pushes it out with a force that RISES
// with motion. So a still body gathers the cloud into a luminous effigy; a moving
// body melts it into liquid light. Trails/afterimage are done in page.tsx by not
// clearing the buffer (a translucent fade quad) — that lives with the renderer.
//
// Colour is a violet→magenta vertical ramp (legs deep, hands bright) drawn only
// from the sanctioned palette. Deterministic: all per-point attributes are drawn
// once from a seeded mulberry32. No Math.random anywhere.

import * as THREE from "three";
import { BONES } from "./pose";
import { mulberry32 } from "./rng";
import { VIOLET_VEC3 } from "../_shared/palette";

// nominal bone lengths → particle density weighting (long limbs get more points)
const BONE_WEIGHT = [
  0.6, 0.65, 0.65, 0.65, 0.65, 1.0, 1.0, 0.4, 1.0, 1.0, 1.0, 1.0, 0.5, 0.5, 0.28, 0.28,
];
// height hint per bone (0 low/legs .. 1 high/hands) → hue along the ramp
const BONE_HEIGHT = [
  0.62, 0.66, 0.78, 0.66, 0.78, 0.45, 0.45, 0.32, 0.3, 0.14, 0.3, 0.14, 0.72, 0.72, 0.06, 0.06,
];

function ramp(u: number, out: [number, number, number]): void {
  const t = u < 0 ? 0 : u > 1 ? 1 : u;
  const deep = VIOLET_VEC3.deep;
  const indigo = VIOLET_VEC3.indigo;
  const violet = VIOLET_VEC3.mid;
  const magenta = VIOLET_VEC3.magenta;
  const light = VIOLET_VEC3.light;
  let a: [number, number, number];
  let b: [number, number, number];
  let f: number;
  if (t < 0.3) {
    a = deep;
    b = indigo;
    f = t / 0.3;
  } else if (t < 0.6) {
    a = indigo;
    b = violet;
    f = (t - 0.3) / 0.3;
  } else if (t < 0.82) {
    a = violet;
    b = magenta;
    f = (t - 0.6) / 0.22;
  } else {
    a = magenta;
    b = light;
    f = (t - 0.82) / 0.18;
  }
  out[0] = a[0] + (b[0] - a[0]) * f;
  out[1] = a[1] + (b[1] - a[1]) * f;
  out[2] = a[2] + (b[2] - a[2]) * f;
}

export interface ParticleBody {
  points: THREE.Points;
  update(
    world: Float32Array,
    motion: number,
    brightness: number,
    present: boolean,
    dt: number,
    time: number,
    reduce: boolean,
  ): void;
  dispose(): void;
}

export function buildParticleBody(count = 15000, seed = 0x4808): ParticleBody {
  const rng = mulberry32(seed);

  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const vel = new Float32Array(count * 3);
  const boneA = new Int16Array(count); // -1 → dust
  const boneB = new Int16Array(count);
  const along = new Float32Array(count);
  const offX = new Float32Array(count);
  const offY = new Float32Array(count);
  const offZ = new Float32Array(count);
  const phase = new Float32Array(count);
  const homeX = new Float32Array(count);
  const homeY = new Float32Array(count);
  const homeZ = new Float32Array(count);

  // cumulative bone weights for weighted selection
  const cum: number[] = [];
  let acc = 0;
  for (let i = 0; i < BONES.length; i++) {
    acc += BONE_WEIGHT[i] ?? 0.5;
    cum.push(acc);
  }
  const total = acc;

  const DUST_FRAC = 0.16;
  const rgb: [number, number, number] = [0, 0, 0];

  for (let i = 0; i < count; i++) {
    phase[i] = rng() * Math.PI * 2;
    if (rng() < DUST_FRAC) {
      // dust: a home point on a soft shell around the body, gently orbiting
      boneA[i] = -1;
      boneB[i] = -1;
      const th = rng() * Math.PI * 2;
      const ph = Math.acos(2 * rng() - 1);
      const r = 1.1 + rng() * 1.3;
      homeX[i] = Math.sin(ph) * Math.cos(th) * r;
      homeY[i] = (Math.cos(ph) * r) * 0.8;
      homeZ[i] = Math.sin(ph) * Math.sin(th) * r * 0.7;
      pos[i * 3] = homeX[i];
      pos[i * 3 + 1] = homeY[i];
      pos[i * 3 + 2] = homeZ[i];
      ramp(0.5 + rng() * 0.45, rgb);
    } else {
      const pick = rng() * total;
      let bi = 0;
      while (bi < cum.length - 1 && pick > cum[bi]) bi++;
      boneA[i] = BONES[bi][0];
      boneB[i] = BONES[bi][1];
      along[i] = rng();
      const spread = 0.05;
      offX[i] = (rng() - 0.5) * spread;
      offY[i] = (rng() - 0.5) * spread;
      offZ[i] = (rng() - 0.5) * spread;
      ramp((BONE_HEIGHT[bi] ?? 0.4) + (rng() - 0.5) * 0.18, rgb);
    }
    col[i * 3] = rgb[0];
    col[i * 3 + 1] = rgb[1];
    col[i * 3 + 2] = rgb[2];
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(col, 3));

  const material = new THREE.PointsMaterial({
    size: 0.032,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;

  const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute;

  function update(
    world: Float32Array,
    motion: number,
    brightness: number,
    present: boolean,
    dt: number,
    time: number,
    reduce: boolean,
  ): void {
    const step = Math.min(0.05, Math.max(0.001, dt));
    const m = reduce ? motion * 0.5 : motion;
    const coherence = 1 - m * 0.82; // still body → tight cloud
    const springBase = (reduce ? 10 : 13) * (present ? 1 : 0.35);
    const spring = springBase * (0.22 + 0.78 * coherence);
    const turb = (reduce ? 0.25 : 0.55) * (0.25 + m * 1.7);
    const damp = Math.exp(-step / (reduce ? 0.16 : 0.22));

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      let tx: number;
      let ty: number;
      let tz: number;

      if (boneA[i] < 0) {
        // dust orbits its home slowly
        const s = Math.sin(time * 0.12 + phase[i]);
        const c = Math.cos(time * 0.1 + phase[i]);
        tx = homeX[i] * c - homeZ[i] * s;
        tz = homeX[i] * s + homeZ[i] * c;
        ty = homeY[i] + 0.15 * Math.sin(time * 0.2 + phase[i]);
      } else {
        const a = boneA[i] * 3;
        const b = boneB[i] * 3;
        const t = along[i];
        tx = world[a] + (world[b] - world[a]) * t + offX[i];
        ty = world[a + 1] + (world[b + 1] - world[a + 1]) * t + offY[i];
        tz = world[a + 2] + (world[b + 2] - world[a + 2]) * t + offZ[i];
      }

      const px = pos[i3];
      const py = pos[i3 + 1];
      const pz = pos[i3 + 2];
      const ph = phase[i];

      // curl-ish flow field (cheap, smooth, deterministic)
      const fx = Math.sin(py * 1.7 + time * 0.6 + ph) + Math.sin(pz * 2.1 - time * 0.4);
      const fy = Math.sin(pz * 1.9 + time * 0.5 + ph) + Math.sin(px * 1.6 + time * 0.45);
      const fz = Math.sin(px * 2.0 - time * 0.55 + ph) + Math.sin(py * 1.5 + time * 0.5);

      const sp = boneA[i] < 0 ? spring * 0.25 : spring;

      let vx = vel[i3] + (tx - px) * sp * step + fx * turb * step;
      let vy = vel[i3 + 1] + (ty - py) * sp * step + fy * turb * step;
      let vz = vel[i3 + 2] + (tz - pz) * sp * step + fz * turb * step;
      vx *= damp;
      vy *= damp;
      vz *= damp;
      vel[i3] = vx;
      vel[i3 + 1] = vy;
      vel[i3 + 2] = vz;
      pos[i3] = px + vx * step;
      pos[i3 + 1] = py + vy * step;
      pos[i3 + 2] = pz + vz * step;
    }
    posAttr.needsUpdate = true;

    // luminance drift is SLOW + smooth (safety): size/opacity track smoothed
    // motion + a ~0.22 Hz breath, never a strobe.
    const breath = 0.9 + 0.1 * Math.sin(time * 1.4);
    material.size = 0.03 * (0.8 + m * 0.85) * breath;
    material.opacity = Math.min(0.72, 0.28 + brightness * 0.32 + m * 0.12) * (present ? 1 : 0.6);
  }

  function dispose(): void {
    geometry.dispose();
    material.dispose();
  }

  return { points, update, dispose };
}
