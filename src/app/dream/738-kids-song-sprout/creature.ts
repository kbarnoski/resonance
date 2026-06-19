// creature.ts — the luminous 3D sprout, built from THREE.Points (additive
// glow). It breathes, leans toward sound, brightens when listening, and
// visibly GROWS as the memory matures: more particles active, larger radius,
// warmer colour, brighter core.

import * as THREE from "three";

const MAX_POINTS = 2600;

export interface Creature {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  points: THREE.Points;
  core: THREE.Mesh;
  geo: THREE.BufferGeometry;
  mat: THREE.PointsMaterial;
  base: Float32Array; // base positions on unit-ish sphere shell
  seeds: Float32Array; // per-point random phase
  resize: () => void;
  dispose: () => void;
}

function makeGlowTexture(): THREE.Texture {
  const s = 64;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.85)");
  g.addColorStop(0.5, "rgba(255,255,255,0.32)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

/** Throws if WebGL unavailable — caller falls back to Canvas2D. */
export function makeCreature(container: HTMLElement): Creature {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x02040a, 0.085);

  const camera = new THREE.PerspectiveCamera(
    55,
    container.clientWidth / container.clientHeight,
    0.1,
    100
  );
  camera.position.set(0, 0, 7);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setClearColor(0x02040a, 1);
  container.appendChild(renderer.domElement);

  // ── Particle shell ──────────────────────────────────────────────
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(MAX_POINTS * 3);
  const colors = new Float32Array(MAX_POINTS * 3);
  const base = new Float32Array(MAX_POINTS * 3);
  const seeds = new Float32Array(MAX_POINTS);

  for (let i = 0; i < MAX_POINTS; i++) {
    // even-ish sphere distribution (fibonacci)
    const t = i / MAX_POINTS;
    const phi = Math.acos(1 - 2 * t);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    // jitter toward a soft blob rather than perfect sphere
    const r = 0.7 + Math.random() * 0.45;
    const x = Math.sin(phi) * Math.cos(theta) * r;
    const y = Math.sin(phi) * Math.sin(theta) * r * 1.15; // slightly tall
    const z = Math.cos(phi) * r;
    base[i * 3] = x;
    base[i * 3 + 1] = y;
    base[i * 3 + 2] = z;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    seeds[i] = Math.random() * Math.PI * 2;
    colors[i * 3] = 0.6;
    colors[i * 3 + 1] = 0.8;
    colors[i * 3 + 2] = 1.0;
  }

  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setDrawRange(0, 600); // starts small — grows over time

  const tex = makeGlowTexture();
  const mat = new THREE.PointsMaterial({
    size: 0.22,
    map: tex,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.9,
  });

  const points = new THREE.Points(geo, mat);
  scene.add(points);

  // ── Soft bright core ────────────────────────────────────────────
  const coreGeo = new THREE.SphereGeometry(0.4, 24, 24);
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xbfe0ff,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  scene.add(core);

  const resize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };

  const dispose = () => {
    geo.dispose();
    mat.dispose();
    tex.dispose();
    coreGeo.dispose();
    coreMat.dispose();
    renderer.dispose();
    if (renderer.domElement.parentElement === container) {
      container.removeChild(renderer.domElement);
    }
  };

  return { scene, camera, renderer, points, core, geo, mat, base, seeds, resize, dispose };
}

// Colour palette: cool baby-blue young -> warm gold/rose mature.
function growthColor(growth: number, target: THREE.Color) {
  const young = new THREE.Color(0.55, 0.78, 1.0); // baby blue
  const mid = new THREE.Color(0.8, 0.7, 1.0);     // violet
  const old = new THREE.Color(1.0, 0.82, 0.55);   // warm gold
  if (growth < 0.5) {
    target.copy(young).lerp(mid, growth / 0.5);
  } else {
    target.copy(mid).lerp(old, (growth - 0.5) / 0.5);
  }
}

export interface CreatureFrame {
  time: number;       // seconds
  growth: number;     // 0..1
  listening: number;  // 0..1 mic energy
  singing: number;    // 0..1 own-voice energy
  leanX: number;      // -1..1 toward sound source
}

const _col = new THREE.Color();
const _tmp = new THREE.Color();

export function drawCreature(c: Creature, f: CreatureFrame) {
  const { geo, base, seeds, points, core, mat } = c;
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const colAttr = geo.getAttribute("color") as THREE.BufferAttribute;
  const arr = pos.array as Float32Array;
  const carr = colAttr.array as Float32Array;

  // growth -> active particle count & size & scale
  const active = Math.floor(600 + f.growth * (MAX_POINTS - 600));
  geo.setDrawRange(0, active);

  const scale = 0.8 + f.growth * 1.2; // matures bigger
  const breathe = 1 + Math.sin(f.time * 1.1) * (0.04 + f.growth * 0.03);
  const listenPush = 1 + f.listening * 0.25;
  const singPush = 1 + f.singing * 0.18;

  growthColor(f.growth, _col);
  // brighten when listening or singing
  const bright = 0.6 + f.listening * 0.5 + f.singing * 0.7;

  for (let i = 0; i < active; i++) {
    const bx = base[i * 3];
    const by = base[i * 3 + 1];
    const bz = base[i * 3 + 2];
    const s = seeds[i];
    // gentle shimmer / drift
    const wob = 1 + Math.sin(f.time * 1.6 + s) * 0.05;
    const m = scale * breathe * listenPush * singPush * wob;
    arr[i * 3] = bx * m + f.leanX * 0.5; // lean toward sound
    arr[i * 3 + 1] = by * m + Math.sin(f.time * 0.7 + s) * 0.04;
    arr[i * 3 + 2] = bz * m;

    // per-point colour twinkle around the growth hue
    const tw = 0.8 + 0.2 * Math.sin(f.time * 3 + s * 2);
    _tmp.copy(_col).multiplyScalar(bright * tw);
    carr[i * 3] = Math.min(1.4, _tmp.r);
    carr[i * 3 + 1] = Math.min(1.4, _tmp.g);
    carr[i * 3 + 2] = Math.min(1.4, _tmp.b);
  }
  pos.needsUpdate = true;
  colAttr.needsUpdate = true;

  mat.size = 0.18 + f.growth * 0.16 + f.singing * 0.1;
  mat.opacity = 0.78 + f.singing * 0.2;

  // core
  const coreScale = scale * (1 + f.singing * 0.5 + f.listening * 0.2) * breathe;
  core.scale.setScalar(coreScale);
  core.position.x = f.leanX * 0.5;
  growthColor(f.growth, _tmp);
  (core.material as THREE.MeshBasicMaterial).color.copy(_tmp);
  (core.material as THREE.MeshBasicMaterial).opacity =
    0.35 + f.singing * 0.4 + f.listening * 0.2 + f.growth * 0.1;

  // slow auto-rotation; faster a touch as it matures (more alive)
  points.rotation.y += 0.0015 + f.growth * 0.001;
  core.rotation.y = points.rotation.y;

  c.renderer.render(c.scene, c.camera);
}
