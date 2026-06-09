/**
 * scene.ts — Three.js night-sky scene helpers for Comet Gather
 *
 * Contains:
 *   - Scene / camera / renderer setup
 *   - Drifting mote creation (sprites + glow, 20–40 motes)
 *   - Constellation cluster for gathered motes
 *   - Background starfield (Points)
 *   - Reticle / scoop aura (always at view centre)
 *   - Camera control via gyro quaternion or drag
 *   - Per-frame update helpers
 */
import * as THREE from "three";
import { MOTE_FREQS } from "./audio";

// ── Constants ─────────────────────────────────────────────────────────────────

const SKY_RADIUS  = 85;
const MOTE_COUNT  = 30;
const DRIFT_SPEED = 0.022; // units/sec base drift

// Palette: bold saturated colours for kids
const MOTE_COLORS: readonly number[] = [
  0x9b59f5, // violet
  0x4fc3f7, // sky blue
  0xf48fb1, // rose
  0x80cbc4, // teal
  0xffd54f, // amber
  0xce93d8, // lavender
  0x80deea, // cyan
  0xffab91, // peach
  0xa5d6a7, // mint
  0xe6ee9c, // lime
  0x90caf9, // periwinkle
  0xf8bbd9, // pink
  0xb39ddb, // purple
  0x4dd0e1, // aqua
];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Mote {
  id: number;
  mesh: THREE.Mesh;
  position: THREE.Vector3;  // current position (on sky sphere, mutates)
  driftAxis: THREE.Vector3; // fixed random perpendicular drift axis
  driftSpeed: number;       // rad/sec
  driftAngle: number;       // current accumulated drift angle
  color: THREE.Color;
  freqIndex: number;
  gathered: boolean;
  gatherTime: number;       // performance.now() when gathered
  // constellation target position (set when gathered)
  constellationTarget: THREE.Vector3;
  // animated screen position (for pan calculation)
  screenX: number;
  screenY: number;
  screenZ: number;
}

export interface SceneState {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  motes: Mote[];
  backgroundStars: THREE.Points;
  reticle: THREE.Mesh;
  reticleAura: THREE.Mesh;
  constellationLines: THREE.Line[];
  /** Dispose everything — call on unmount */
  dispose: () => void;
}

// ── Texture factories ──────────────────────────────────────────────────────────

function makeGlowTexture(size = 128): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const r = size / 2;
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0.00, "rgba(255,255,255,1.0)");
  grad.addColorStop(0.20, "rgba(255,255,255,0.90)");
  grad.addColorStop(0.50, "rgba(255,255,255,0.35)");
  grad.addColorStop(0.80, "rgba(255,255,255,0.06)");
  grad.addColorStop(1.00, "rgba(255,255,255,0.00)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function makeAuraTexture(size = 256): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const r = size / 2;
  // Outer glow ring for reticle aura
  const grad = ctx.createRadialGradient(r, r, r * 0.30, r, r, r * 0.96);
  grad.addColorStop(0.00, "rgba(255,255,255,0.00)");
  grad.addColorStop(0.40, "rgba(180,140,255,0.18)");
  grad.addColorStop(0.72, "rgba(140,100,255,0.28)");
  grad.addColorStop(0.90, "rgba(100, 60,255,0.10)");
  grad.addColorStop(1.00, "rgba(255,255,255,0.00)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function makeReticleRingTexture(size = 128): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const r = size / 2;
  const grad = ctx.createRadialGradient(r, r, r * 0.60, r, r, r * 0.94);
  grad.addColorStop(0.00, "rgba(255,255,255,0.00)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.55)");
  grad.addColorStop(0.65, "rgba(255,255,255,0.75)");
  grad.addColorStop(1.00, "rgba(255,255,255,0.00)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

// ── Build scene ───────────────────────────────────────────────────────────────

export function buildScene(canvas: HTMLCanvasElement): SceneState {
  // Renderer
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.setClearColor(0x04020f, 1); // deep indigo-black

  // Scene + camera
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04020f);

  // Very faint fog for depth atmosphere
  scene.fog = new THREE.FogExp2(0x04020f, 0.0012);

  const camera = new THREE.PerspectiveCamera(
    75,
    canvas.clientWidth / canvas.clientHeight,
    0.1,
    200
  );
  camera.position.set(0, 0, 0);

  // Textures
  const glowTex   = makeGlowTexture(128);
  const auraTex   = makeAuraTexture(256);
  const reticleTex = makeReticleRingTexture(128);

  // Background stars
  const backgroundStars = buildBackgroundStars(scene);

  // Motes
  const motes = buildMotes(scene, glowTex);

  // Reticle
  const reticle = buildReticle(scene, reticleTex);
  const reticleAura = buildReticleAura(scene, auraTex);

  // Constellation lines container (empty initially)
  const constellationLines: THREE.Line[] = [];

  const dispose = () => {
    glowTex.dispose();
    auraTex.dispose();
    reticleTex.dispose();
    motes.forEach(m => {
      (m.mesh.material as THREE.Material).dispose();
      m.mesh.geometry.dispose();
    });
    (backgroundStars.material as THREE.Material).dispose();
    backgroundStars.geometry.dispose();
    (reticle.material as THREE.Material).dispose();
    reticle.geometry.dispose();
    (reticleAura.material as THREE.Material).dispose();
    reticleAura.geometry.dispose();
    constellationLines.forEach(l => {
      (l.material as THREE.Material).dispose();
      l.geometry.dispose();
    });
    renderer.dispose();
  };

  return {
    scene,
    camera,
    renderer,
    motes,
    backgroundStars,
    reticle,
    reticleAura,
    constellationLines,
    dispose,
  };
}

// ── Background starfield ──────────────────────────────────────────────────────

function buildBackgroundStars(scene: THREE.Scene): THREE.Points {
  const COUNT = 1600;
  const positions = new Float32Array(COUNT * 3);
  const colors    = new Float32Array(COUNT * 3);

  for (let i = 0; i < COUNT; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    const r     = 92 + Math.random() * 6;
    positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
    const warm = Math.random() * 0.12;
    colors[i * 3 + 0] = 0.82 + warm;
    colors[i * 3 + 1] = 0.82 + warm * 0.5;
    colors[i * 3 + 2] = 0.94;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color",    new THREE.BufferAttribute(colors,    3));

  const mat = new THREE.PointsMaterial({
    size: 0.7,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.60,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const pts = new THREE.Points(geo, mat);
  scene.add(pts);
  return pts;
}

// ── Mote construction ─────────────────────────────────────────────────────────

function buildMotes(scene: THREE.Scene, glowTex: THREE.Texture): Mote[] {
  const motes: Mote[] = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < MOTE_COUNT; i++) {
    // Fibonacci lattice for even sky distribution
    const y   = 1 - (i / (MOTE_COUNT - 1)) * 2;
    const rho = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * i;
    const x = Math.cos(theta) * rho;
    const z = Math.sin(theta) * rho;

    const pos = new THREE.Vector3(x, y, z).multiplyScalar(SKY_RADIUS);

    const colorHex = MOTE_COLORS[i % MOTE_COLORS.length];
    const color = new THREE.Color(colorHex);
    const freqIndex = i % MOTE_FREQS.length;

    // Size variation: bigger motes feel "closer"
    const size = 5 + Math.random() * 4;
    const geo  = new THREE.PlaneGeometry(size, size);
    const mat  = new THREE.MeshBasicMaterial({
      map: glowTex,
      color,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.lookAt(new THREE.Vector3(0, 0, 0));
    scene.add(mesh);

    // Random drift axis (perpendicular to position on sphere)
    const driftAxis = new THREE.Vector3(
      Math.random() - 0.5,
      Math.random() - 0.5,
      Math.random() - 0.5
    ).cross(pos).normalize();

    motes.push({
      id: i,
      mesh,
      position: pos.clone(),
      driftAxis,
      driftSpeed: DRIFT_SPEED * (0.6 + Math.random() * 0.8),
      driftAngle: Math.random() * Math.PI * 2,
      color,
      freqIndex,
      gathered: false,
      gatherTime: 0,
      constellationTarget: new THREE.Vector3(),
      screenX: 0,
      screenY: 0,
      screenZ: 1,
    });
  }

  return motes;
}

// ── Reticle ───────────────────────────────────────────────────────────────────

function buildReticle(scene: THREE.Scene, ringTex: THREE.Texture): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(3.5, 3.5);
  const mat = new THREE.MeshBasicMaterial({
    map: ringTex,
    color: 0xffffff,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);
  return mesh;
}

function buildReticleAura(scene: THREE.Scene, auraTex: THREE.Texture): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(18, 18);
  const mat = new THREE.MeshBasicMaterial({
    map: auraTex,
    color: 0xaa88ff,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);
  return mesh;
}

// ── Per-frame helpers ─────────────────────────────────────────────────────────

/** Advance mote drift by dt seconds */
export function stepMoteDrift(mote: Mote, dt: number): void {
  if (mote.gathered) return;
  mote.driftAngle += mote.driftSpeed * dt;
  // Rotate position around drift axis by a small angle
  const q = new THREE.Quaternion().setFromAxisAngle(
    mote.driftAxis,
    mote.driftSpeed * dt
  );
  mote.position.applyQuaternion(q);
  mote.mesh.position.copy(mote.position);
  mote.mesh.lookAt(new THREE.Vector3(0, 0, 0));
}

/** Animate gathered mote flying toward constellation position */
export function stepGatheredMote(
  mote: Mote,
  dt: number,
  time: number
): void {
  if (!mote.gathered) return;
  const age = (time - mote.gatherTime) / 1000; // seconds since gathered
  const t   = Math.min(1, age * 0.8); // 0→1 over ~1.25s
  const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  mote.mesh.position.lerpVectors(mote.position, mote.constellationTarget, eased);

  // Slow orbit in constellation (after arrival)
  if (age > 1.5) {
    const orbitAngle = (age - 1.5) * 0.15 + mote.id * 0.42;
    const r          = mote.constellationTarget.length();
    const up         = new THREE.Vector3(0, 1, 0);
    const axis       = mote.constellationTarget.clone().normalize().cross(up).normalize();
    const offset     = new THREE.Vector3()
      .crossVectors(mote.constellationTarget.clone().normalize(), axis)
      .multiplyScalar(Math.sin(orbitAngle) * r * 0.06);
    mote.mesh.position.copy(mote.constellationTarget).add(offset);
  }

  // Bill-board toward camera origin
  mote.mesh.lookAt(new THREE.Vector3(0, 0, 0));

  // Pulse opacity in constellation
  const pulse = 0.65 + 0.25 * Math.sin(time * 0.002 + mote.id);
  (mote.mesh.material as THREE.MeshBasicMaterial).opacity = pulse;
}

/** Update screen-space position of a mote */
export function updateMoteScreenPos(
  mote: Mote,
  camera: THREE.Camera,
  width: number,
  height: number
): void {
  const v = mote.mesh.position.clone().project(camera);
  mote.screenX = ( v.x * 0.5 + 0.5) * width;
  mote.screenY = (-v.y * 0.5 + 0.5) * height;
  mote.screenZ = v.z;
}

/** 0..1 proximity of mote to screen centre (scoop zone) */
export function computeAimProximity(
  mote: Mote,
  width: number,
  height: number
): number {
  if (mote.screenZ > 1) return 0; // behind camera
  const cx = width / 2;
  const cy = height / 2;
  const threshold = Math.min(width, height) * 0.18;
  const dist = Math.sqrt((mote.screenX - cx) ** 2 + (mote.screenY - cy) ** 2);
  return Math.max(0, 1 - dist / threshold);
}

/** Position the reticle in view space (always at center of view) */
export function positionReticle(
  reticle: THREE.Mesh,
  reticleAura: THREE.Mesh,
  camera: THREE.Camera,
  proximity: number // 0..1 max proximity from any mote
): void {
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  reticle.position.copy(camera.position).addScaledVector(dir, 5);
  reticleAura.position.copy(camera.position).addScaledVector(dir, 4.9);
  reticle.lookAt(camera.position);
  reticleAura.lookAt(camera.position);

  // Aura brightens when near a mote
  const mat = reticleAura.material as THREE.MeshBasicMaterial;
  mat.opacity = 0.35 + proximity * 0.55;
}

/** Assign constellation positions for all gathered motes */
export function assignConstellationTargets(
  motes: Mote[],
  camera: THREE.Camera
): void {
  const gathered = motes.filter(m => m.gathered);
  if (gathered.length === 0) return;

  // Spread gathered motes in a small cluster ~30 units in front-upper area
  const clusterCenter = new THREE.Vector3(0, 20, -50);
  const spread = 8;
  gathered.forEach((m, i) => {
    const angle  = (i / Math.max(1, gathered.length - 1)) * Math.PI * 2;
    const radius = spread * Math.sqrt(i + 1) * 0.45;
    const jitter = new THREE.Vector3(
      Math.cos(angle) * radius + (Math.random() - 0.5) * 2,
      Math.sin(angle) * radius + (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 4
    );
    const target = clusterCenter.clone().add(jitter);
    // Scale to be inside the sky sphere
    const maxDist = SKY_RADIUS * 0.55;
    if (target.length() > maxDist) target.setLength(maxDist);
    m.constellationTarget.copy(target);
  });

  void camera; // camera kept for future use
}

/** Rebuild constellation line mesh (call after each new gather) */
export function rebuildConstellationLines(
  scene: THREE.Scene,
  existingLines: THREE.Line[],
  motes: Mote[]
): THREE.Line[] {
  // Remove old lines
  existingLines.forEach(l => {
    scene.remove(l);
    l.geometry.dispose();
    (l.material as THREE.Material).dispose();
  });
  existingLines.length = 0;

  const gathered = motes.filter(m => m.gathered);
  if (gathered.length < 2) return existingLines;

  // Connect gathered motes with faint lines in order of gathering
  const mat = new THREE.LineBasicMaterial({
    color: 0xaaaaff,
    transparent: true,
    opacity: 0.20,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  for (let i = 0; i < gathered.length - 1; i++) {
    const pts = [
      gathered[i].constellationTarget.clone(),
      gathered[i + 1].constellationTarget.clone(),
    ];
    const geo  = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geo, mat.clone());
    scene.add(line);
    existingLines.push(line);
  }

  return existingLines;
}

/** Update the positions of constellation lines (call each frame since motes orbit) */
export function updateConstellationLines(
  lines: THREE.Line[],
  motes: Mote[]
): void {
  const gathered = motes.filter(m => m.gathered);
  lines.forEach((line, i) => {
    if (i >= gathered.length - 1) return;
    const pts = [
      gathered[i].mesh.position.clone(),
      gathered[i + 1].mesh.position.clone(),
    ];
    line.geometry.setFromPoints(pts);
  });
}

/** Handle canvas resize */
export function handleResize(
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement
): void {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (renderer.domElement.width !== w || renderer.domElement.height !== h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}
