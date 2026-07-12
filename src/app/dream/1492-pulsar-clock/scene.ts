// ─────────────────────────────────────────────────────────────────────────────
// scene.ts — the three.js scene-graph sky (subsystem "c").
//
// A dim Milky-Way starfield on a far shell; 15 neutron-star cores on the great
// celestial sphere, each carrying a thin lighthouse beam that sweeps about the
// pulsar's own tilted spin axis at (a clamped version of) its real rotation
// rate. Fast millisecond pulsars would strobe if drawn literally, so the visual
// spin is capped and their per-tick brightness is near-constant; the slow
// giants get the full, majestic per-rotation glow envelope. NO strobe, ever —
// every brightness change is a smooth glow envelope on a small local object.
//
// This is a real scene graph (points, meshes, sprites), NOT a full-screen shader.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from "three";
import { PULSARS, SKY_RADIUS, mulberry32, type Pulsar } from "./catalog";

const VIOLET_DEEP = 0x0b0713;
const BEAM_COLOR = 0xc9c4ff; // cool violet-white
const CORE_COLOR = 0xe6e2ff;

interface PulsarVisual {
  pulsar: Pulsar;
  pivot: THREE.Object3D; // spins about the local +Y = spin axis
  core: THREE.Mesh;
  coreMat: THREE.MeshBasicMaterial;
  halo: THREE.Sprite;
  beamMats: THREE.MeshBasicMaterial[];
  visualRate: number; // rad/s, clamped so nothing strobes
  glowAmp: number; // per-tick envelope depth (small for fast tickers)
  baseHalo: number;
}

export interface Sky {
  render(elapsedSec: number, dtSec: number): void;
  resize(w: number, h: number): void;
  camera: THREE.PerspectiveCamera;
  dispose(): void;
}

/** Soft radial-gradient sprite texture for the halos (deterministic). */
function makeGlowTexture(): THREE.Texture {
  const size = 128;
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const g = cv.getContext("2d")!;
  const grad = g.createRadialGradient(
    size / 2, size / 2, 0, size / 2, size / 2, size / 2,
  );
  grad.addColorStop(0, "rgba(230,226,255,1)");
  grad.addColorStop(0.25, "rgba(180,170,255,0.55)");
  grad.addColorStop(1, "rgba(120,100,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.needsUpdate = true;
  return tex;
}

export function makeSky(
  canvas: HTMLCanvasElement,
  reducedMotion: boolean,
): Sky | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "low-power",
    });
  } catch {
    return null;
  }
  if (!renderer.getContext()) return null;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(VIOLET_DEEP);
  scene.fog = new THREE.FogExp2(VIOLET_DEEP, 0.00035);

  const camera = new THREE.PerspectiveCamera(
    62, canvas.clientWidth / Math.max(1, canvas.clientHeight), 0.5, 4000,
  );

  // ── disposable registries ──────────────────────────────────────────────────
  const geoms: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const texs: THREE.Texture[] = [];

  // ── Milky-Way starfield ─────────────────────────────────────────────────────
  const rnd = mulberry32(0x5eed1919);
  const STAR_UNIFORM = 2600;
  const STAR_BAND = 1600;
  const total = STAR_UNIFORM + STAR_BAND;
  const positions = new Float32Array(total * 3);
  const colors = new Float32Array(total * 3);
  // galactic band basis — tilt the dense stripe off the equator
  const tilt = 1.05;
  const bx = new THREE.Vector3(Math.cos(tilt), 0.32, Math.sin(tilt)).normalize();
  const bz = new THREE.Vector3().crossVectors(bx, new THREE.Vector3(0, 1, 0)).normalize();
  const bn = new THREE.Vector3().crossVectors(bx, bz).normalize();
  for (let i = 0; i < total; i++) {
    const r = 900 + rnd() * 900;
    let dir: THREE.Vector3;
    if (i < STAR_UNIFORM) {
      const u = rnd() * 2 - 1;
      const phi = rnd() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      dir = new THREE.Vector3(s * Math.cos(phi), u, s * Math.sin(phi));
    } else {
      // concentrate near the tilted great circle → a Milky-Way stripe
      const ang = rnd() * Math.PI * 2;
      const lat = ((rnd() + rnd() + rnd()) / 3 - 0.5) * 0.5; // narrow gaussian-ish
      dir = new THREE.Vector3()
        .addScaledVector(bx, Math.cos(ang) * Math.cos(lat))
        .addScaledVector(bz, Math.sin(ang) * Math.cos(lat))
        .addScaledVector(bn, Math.sin(lat))
        .normalize();
    }
    positions[i * 3] = dir.x * r;
    positions[i * 3 + 1] = dir.y * r;
    positions[i * 3 + 2] = dir.z * r;
    // dim violet-white, band stars a touch brighter/warmer
    const lum = i < STAR_UNIFORM ? 0.35 + rnd() * 0.4 : 0.5 + rnd() * 0.5;
    colors[i * 3] = lum * 0.82;
    colors[i * 3 + 1] = lum * 0.78;
    colors[i * 3 + 2] = lum;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  starGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const starMat = new THREE.PointsMaterial({
    size: 2.2,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  scene.add(new THREE.Points(starGeo, starMat));
  geoms.push(starGeo);
  mats.push(starMat);

  // ── pulsars ──────────────────────────────────────────────────────────────
  const glowTex = makeGlowTexture();
  texs.push(glowTex);
  const coreGeo = new THREE.SphereGeometry(3.4, 12, 12);
  geoms.push(coreGeo);
  const beamGeo = new THREE.CylinderGeometry(0.6, 5.5, 150, 10, 1, true);
  beamGeo.translate(0, 75, 0); // extend outward from the star along +Y
  geoms.push(beamGeo);

  const visuals: PulsarVisual[] = [];
  const axisRnd = mulberry32(0x0ff5ea11);
  const MAX_RATE = (reducedMotion ? 0.6 : 1.2) * Math.PI * 2; // cap: no strobe
  const MIN_RATE = 0.12; // slowest giants still visibly turn

  for (const p of PULSARS) {
    const pos = new THREE.Vector3(...p.dir).multiplyScalar(SKY_RADIUS);
    const pivot = new THREE.Object3D();
    pivot.position.copy(pos);
    // orient local +Y to a deterministic tilted spin axis
    const axis = new THREE.Vector3(
      axisRnd() * 2 - 1, axisRnd() * 2 - 1, axisRnd() * 2 - 1,
    ).normalize();
    pivot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
    scene.add(pivot);

    // core sphere
    const coreMat = new THREE.MeshBasicMaterial({
      color: CORE_COLOR,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    mats.push(coreMat);
    const core = new THREE.Mesh(coreGeo, coreMat);
    pivot.add(core);

    // halo sprite
    const haloMat = new THREE.SpriteMaterial({
      map: glowTex,
      color: BEAM_COLOR,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    mats.push(haloMat);
    const halo = new THREE.Sprite(haloMat);
    const baseHalo = p.kind === "bell" ? 46 : p.kind === "pitched" ? 30 : 34;
    halo.scale.setScalar(baseHalo);
    pivot.add(halo);

    // double lighthouse beam, magnetic-axis offset ~32° from the spin axis
    const beamMats: THREE.MeshBasicMaterial[] = [];
    for (const flip of [0, Math.PI]) {
      const tiltGroup = new THREE.Group();
      tiltGroup.rotation.z = flip;
      const beamMat = new THREE.MeshBasicMaterial({
        color: BEAM_COLOR,
        transparent: true,
        opacity: 0.1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      mats.push(beamMat);
      beamMats.push(beamMat);
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.rotation.z = 0.56; // ~32° magnetic offset
      tiltGroup.add(beam);
      pivot.add(tiltGroup);
    }

    const realRate = (Math.PI * 2) / p.periodSec;
    const visualRate = Math.max(MIN_RATE, Math.min(MAX_RATE, realRate));
    // fast tickers barely pulse (else strobe); slow giants get full envelope
    const glowAmp =
      (p.kind === "pitched" ? 0.12 : Math.min(1, p.periodSec / 0.9)) *
      (reducedMotion ? 0.5 : 1);

    visuals.push({
      pulsar: p, pivot, core, coreMat, halo, beamMats, visualRate, glowAmp, baseHalo,
    });
  }

  const spinLocalY = new THREE.Vector3(0, 1, 0);

  function render(elapsedSec: number, dtSec: number) {
    for (const v of visuals) {
      v.pivot.rotateOnAxis(spinLocalY, v.visualRate * dtSec);
      // smooth per-tick envelope from the real period phase
      const phase = (elapsedSec / v.pulsar.periodSec) % 1;
      const shimmer = 0.5 + 0.5 * Math.sin(elapsedSec * 1.7 + v.pulsar.decDeg);
      const glow = v.glowAmp * Math.pow(1 - phase, 5) + 0.08 * shimmer;
      const g = Math.min(1, glow);
      v.coreMat.opacity = 0.6 + 0.4 * g;
      v.core.scale.setScalar(1 + g * 0.6);
      v.halo.material.opacity = 0.28 + 0.5 * g;
      v.halo.scale.setScalar(v.baseHalo * (1 + g * 0.35));
      for (const bm of v.beamMats) bm.opacity = 0.06 + 0.16 * g;
    }
    renderer.render(scene, camera);
  }

  function resize(w: number, h: number) {
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }
  resize(canvas.clientWidth || 1, canvas.clientHeight || 1);

  return {
    camera,
    render,
    resize,
    dispose() {
      for (const g of geoms) g.dispose();
      for (const m of mats) m.dispose();
      for (const t of texs) t.dispose();
      renderer.dispose();
    },
  };
}
