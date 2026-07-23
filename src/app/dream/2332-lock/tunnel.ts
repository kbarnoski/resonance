// ─────────────────────────────────────────────────────────────────────────────
// 2332-lock · tunnel.ts — the entrainment tunnel, a THREE.Points shell field.
//
//   A first-person flight through concentric shells of points. The two engine
//   axes drive it INDEPENDENTLY, never one scalar:
//     • coherence (PLV × tempo) → shells snap from jittered/dim disorder into
//       clean concentric rings, and the camera glides forward.
//     • the pulse SWELL of the rings is timed to the user's own tap-phase
//       (meanTapPhase), while a crisp reference FLASH marks the true stimulus
//       beat. In-phase → swell and flash coincide (entrained). Anti-phase →
//       the rings swell BETWEEN the flashes (visibly off-beat) even though the
//       rings are perfectly formed. That is the wrong-phase state, made visible.
//
//   Cool phosphor / oscilloscope gamut (teal → mint) on charcoal. Raw art hex
//   is confined to this art layer, per brief.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from "three";
import type { Snapshot } from "./engine";

const NUM_SHELLS = 48;
const PER_SHELL = 92;
const COUNT = NUM_SHELLS * PER_SHELL; // 4416 points
const TUNNEL = 74; // depth of the recycling tunnel
const SPACING = TUNNEL / NUM_SHELLS;
const R = 5; // ring radius

function wrap(x: number, m: number): number {
  return ((x % m) + m) % m;
}
function smoothstep(a: number, b: number, x: number): number {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
}
function phaseDist(a: number): number {
  const w = a - Math.floor(a);
  return w > 0.5 ? w - 1 : w;
}

export interface Tunnel {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  update: (snap: Snapshot, dt: number, reduced: boolean) => void;
  resize: (w: number, h: number) => void;
  dispose: () => void;
}

export function createTunnel(): Tunnel {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x12151a, 0.02);

  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 200);
  camera.position.set(0, 0, 0);

  // per-point static data
  const shellIdx = new Float32Array(COUNT);
  const angBase = new Float32Array(COUNT);
  const jr = new Float32Array(COUNT); // radial jitter
  const ja = new Float32Array(COUNT); // angular jitter
  const jz = new Float32Array(COUNT); // depth jitter
  let k = 0;
  for (let s = 0; s < NUM_SHELLS; s++) {
    for (let i = 0; i < PER_SHELL; i++) {
      shellIdx[k] = s;
      angBase[k] = (i / PER_SHELL) * Math.PI * 2 + s * 0.22;
      jr[k] = Math.random() * 2 - 1;
      ja[k] = Math.random() * 2 - 1;
      jz[k] = Math.random() * 2 - 1;
      k++;
    }
  }

  const positions = new Float32Array(COUNT * 3);
  const colors = new Float32Array(COUNT * 3);
  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  const colAttr = new THREE.BufferAttribute(colors, 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  colAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("position", posAttr);
  geo.setAttribute("color", colAttr);

  const mat = new THREE.PointsMaterial({
    size: 0.11,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  scene.add(points);

  // cool phosphor endpoints (teal → mint)
  const COLD = new THREE.Color(0.10, 0.42, 0.48);
  const WARM = new THREE.Color(0.42, 1.0, 0.82);

  let travel = 0;
  let rot = 0;
  let clock = 0;

  const update = (snap: Snapshot, dt: number, red: boolean) => {
    clock += dt;
    const coh = snap.coherence;
    const align = snap.phaseAlign;

    // camera glides forward as coherence rises; smoother still when in-phase
    const glide = (2.2 + 11 * coh * (0.45 + 0.55 * align)) * (red ? 0.4 : 1);
    travel += glide * dt;
    rot += dt * (0.04 + 0.16 * coh) * (red ? 0.35 : 1);

    // disorder collapses as coherence rises
    const jitter = 1 - coh;

    // ring SWELL rides the user's tap-phase; reference FLASH rides the true beat
    const wSwell = red ? 0.16 : 0.1;
    const wFlash = red ? 0.1 : 0.06;
    const dSwell = phaseDist(snap.stimPhase - snap.meanTapPhase);
    const swellEnv = Math.exp(-(dSwell * dSwell) / (2 * wSwell * wSwell));
    const dFlash = phaseDist(snap.stimPhase); // 0 == the audible click
    const flashEnv = Math.exp(-(dFlash * dFlash) / (2 * wFlash * wFlash));

    const ringSwell = swellEnv * coh; // only formed rings swell
    const beatFlash = flashEnv * (0.35 + 0.25 * coh); // always a faint reference

    // unlocked camera judder; entrained camera is steady
    const shake = jitter * 0.22 * (red ? 0.3 : 1);
    camera.position.x = Math.sin(clock * 2.3) * shake;
    camera.position.y = Math.cos(clock * 1.7) * shake * 0.8;

    const baseCol = COLD.clone().lerp(WARM, coh);

    for (let idx = 0; idx < COUNT; idx++) {
      const s = shellIdx[idx];
      const depth = wrap(s * SPACING - travel, TUNNEL); // 0(near) … TUNNEL(far)
      const worldZ = -depth;

      const r = R * (1 + 0.11 * ringSwell) + jitter * jr[idx] * R * 0.5;
      const ang = angBase[idx] + rot + jitter * ja[idx] * 1.3;
      const zz = worldZ + jitter * jz[idx] * 2.2;

      const o = idx * 3;
      positions[o] = Math.cos(ang) * r;
      positions[o + 1] = Math.sin(ang) * r;
      positions[o + 2] = zz;

      // depth fade: fade in from the near plane, out into the fog
      const fade =
        smoothstep(0.6, 5, depth) * (1 - smoothstep(TUNNEL - 14, TUNNEL, depth));
      const bright =
        fade * (0.22 + 0.55 * coh + 0.9 * ringSwell + 0.6 * beatFlash);

      colors[o] = baseCol.r * bright;
      colors[o + 1] = baseCol.g * bright;
      colors[o + 2] = baseCol.b * bright;
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  };

  const resize = (w: number, h: number) => {
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  };

  const dispose = () => {
    scene.remove(points);
    geo.dispose();
    mat.dispose();
  };

  return { scene, camera, update, resize, dispose };
}
