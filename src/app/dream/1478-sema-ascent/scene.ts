// ─────────────────────────────────────────────────────────────────────────────
// scene.ts — the whirl architecture as a real three.js SCENE-GRAPH (not a
// full-screen fragment shader, not a point cloud). Nine nested shells of light,
// each an InstancedMesh of flame-shard "petals" plus an additive halo, stacked
// like a gyroscope/orrery. Each shell is spun by the shared Conductor at its own
// polyrhythmic rate; a central Sprite core swells white-hot at the peak.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from "three";
import {
  RING_COUNT,
  makeRingConfigs,
  type ArcDrivers,
} from "./arc";

export interface SemaScene {
  render(dt: number, d: ArcDrivers, phase: Float64Array): void;
  resize(w: number, h: number): void;
  setLean(x: number, y: number): void; // -1..1 tilt of the whirl axis
  dispose(): void;
}

export function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (c.getContext("webgl2") || c.getContext("webgl"))
    );
  } catch {
    return false;
  }
}

// Soft radial-gradient texture for additive glow (deterministic — no assets).
function makeGlowTexture(): THREE.Texture {
  const s = 128;
  const cv = document.createElement("canvas");
  cv.width = cv.height = s;
  const g = cv.getContext("2d")!;
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,226,150,0.7)");
  grad.addColorStop(0.6, "rgba(255,150,40,0.18)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(cv);
  tex.needsUpdate = true;
  return tex;
}

interface Shell {
  spin: THREE.Group; // rotates on the ring normal (local Z)
  petals: THREE.InstancedMesh;
  halo: THREE.InstancedMesh;
  petalMat: THREE.MeshBasicMaterial;
  haloMat: THREE.MeshBasicMaterial;
}

export function buildScene(canvas: HTMLCanvasElement): SemaScene {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x030209, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x030209, 0.03);

  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 100);
  camera.position.set(0, 2.4, 9);
  camera.lookAt(0, 0, 0);

  const glowTex = makeGlowTexture();

  // Backdrop: a big dim additive disc so the frame is never a flat black void.
  const backMat = new THREE.MeshBasicMaterial({
    map: glowTex,
    color: new THREE.Color(0.5, 0.3, 0.08),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    opacity: 0.5,
  });
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(34, 34), backMat);
  backdrop.position.set(0, 0, -6);
  scene.add(backdrop);

  // Whirl group: all shells live here; leaning tilts the whole axis.
  const whirl = new THREE.Group();
  scene.add(whirl);

  const cfgs = makeRingConfigs();
  const petalGeo = new THREE.ConeGeometry(0.1, 0.46, 6);
  const haloGeo = new THREE.PlaneGeometry(0.7, 0.7);
  const shells: Shell[] = [];
  const m4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const zAxis = new THREE.Vector3(0, 0, 1);

  for (let i = 0; i < RING_COUNT; i++) {
    const c = cfgs[i];
    const tiltGroup = new THREE.Group(); // static orientation of this shell
    tiltGroup.rotation.x = c.tilt;
    tiltGroup.rotation.y = c.yaw;
    tiltGroup.position.z = c.z;

    const spin = new THREE.Group(); // conductor-driven rotation
    tiltGroup.add(spin);

    const petalMat = new THREE.MeshBasicMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const haloMat = new THREE.MeshBasicMaterial({
      map: glowTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const petals = new THREE.InstancedMesh(petalGeo, petalMat, c.petals);
    const halo = new THREE.InstancedMesh(haloGeo, haloMat, c.petals);
    petals.frustumCulled = false;
    halo.frustumCulled = false;

    for (let p = 0; p < c.petals; p++) {
      const a = (p / c.petals) * Math.PI * 2;
      pos.set(Math.cos(a) * c.radius, Math.sin(a) * c.radius, 0);
      // point the flame-shard outward along the radius
      quat.setFromAxisAngle(zAxis, a - Math.PI / 2);
      scl.set(1, 1, 1);
      m4.compose(pos, quat, scl);
      petals.setMatrixAt(p, m4);
      scl.set(1.4, 1.4, 1.4);
      quat.identity();
      m4.compose(pos, quat, scl);
      halo.setMatrixAt(p, m4);
    }
    petals.instanceMatrix.needsUpdate = true;
    halo.instanceMatrix.needsUpdate = true;

    spin.add(halo);
    spin.add(petals);
    whirl.add(tiltGroup);
    shells.push({ spin, petals, halo, petalMat, haloMat });
  }

  // White-hot core — a camera-facing Sprite that swells at the Fana peak.
  const coreMat = new THREE.SpriteMaterial({
    map: glowTex,
    color: new THREE.Color(1, 0.85, 0.55),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    opacity: 0.0,
  });
  const core = new THREE.Sprite(coreMat);
  core.scale.set(2, 2, 1);
  scene.add(core);

  const col = new THREE.Color();
  let azimuth = 0;
  let leanX = 0;
  let leanY = 0;
  let leanTX = 0;
  let leanTY = 0;

  function setLean(x: number, y: number) {
    leanTX = x;
    leanTY = y;
  }

  function resize(w: number, h: number) {
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }

  function render(dt: number, d: ArcDrivers, phase: Float64Array) {
    // slow camera breathe / orbit — speeds gently with intensity
    azimuth += dt * (0.04 + d.intensity * 0.05);
    const r = 9 - d.flare * 1.2; // drift inward at the peak
    camera.position.set(
      Math.sin(azimuth) * r * 0.35,
      2.4 + Math.sin(azimuth * 0.7) * 0.5,
      Math.cos(azimuth) * r,
    );
    camera.lookAt(0, 0, 0);

    // ease the whirl axis toward the tilt target
    leanX += (leanTX - leanX) * Math.min(1, dt * 3);
    leanY += (leanTY - leanY) * Math.min(1, dt * 3);
    whirl.rotation.z = leanX * 0.5;
    whirl.rotation.x = leanY * 0.5;

    for (let i = 0; i < RING_COUNT; i++) {
      const s = shells[i];
      s.spin.rotation.z = phase[i] * Math.PI * 2;

      const lit = d.ringsLit > i;
      // ignition ramps in over the shell's own brightness, never a hard pop
      const base = lit ? 1 : 0.05;
      const bright = base * (0.35 + 0.65 * d.intensity);

      // hue: deep gold → white-hot. inner shells run hotter.
      const inner = 1 - i / RING_COUNT;
      const heat = Math.min(1, d.warmth + d.flare * (0.4 + inner * 0.6));
      const hue = 0.09 + 0.045 * heat; // amber → pale gold
      const sat = 1 - 0.85 * heat; // desaturate toward white
      const light = 0.45 + 0.5 * heat;
      col.setHSL(hue, sat, light);

      s.petalMat.color.copy(col);
      s.petalMat.opacity = Math.min(1, 0.15 + bright * 0.85);
      s.haloMat.color.copy(col);
      s.haloMat.opacity = Math.min(0.9, (0.08 + bright * 0.5) * (0.6 + d.flare));
    }

    // core swell — smooth, no strobe (flare is a slow gaussian in arc.ts)
    const cf = d.flare;
    coreMat.opacity = cf * 0.85;
    const cs = 2 + cf * 9;
    core.scale.set(cs, cs, 1);
    col.setHSL(0.11, 1 - 0.9 * cf, 0.55 + 0.45 * cf);
    coreMat.color.copy(col);

    // backdrop breathes with overall energy
    backMat.opacity = 0.28 + d.intensity * 0.35 + cf * 0.3;
    col.setHSL(0.09, 0.8 - 0.5 * d.warmth, 0.25 + 0.35 * d.warmth);
    backMat.color.copy(col);

    renderer.render(scene, camera);
  }

  function dispose() {
    petalGeo.dispose();
    haloGeo.dispose();
    backdrop.geometry.dispose();
    backMat.dispose();
    coreMat.dispose();
    glowTex.dispose();
    for (const s of shells) {
      s.petals.dispose();
      s.halo.dispose();
      s.petalMat.dispose();
      s.haloMat.dispose();
    }
    renderer.dispose();
  }

  return { render, resize, setLean, dispose };
}
