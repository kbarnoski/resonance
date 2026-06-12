/**
 * flock.ts — 3D boids engine + three.js scene setup
 * Reynolds 1987 "Flocks, Herds and Schools" rules in 3D with spatial hash.
 */
import * as THREE from 'three';

// ── Constants ──────────────────────────────────────────────────────────────────

export const NUM_BIRDS = 2800;

const SEP_RADIUS = 0.8;
const ALI_RADIUS = 2.2;
const COH_RADIUS = 3.0;
const SEP_WEIGHT = 1.8;
const ALI_WEIGHT = 1.0;
const COH_WEIGHT = 0.9;
const ATTRACTOR_WEIGHT = 0.6;
const MAX_SPEED = 5.5;
const MIN_SPEED = 1.8;
const MAX_FORCE = 2.2;

// Sky volume extents
export const BOUNDS = { x: 28, y: 18, z: 22 };

// ── Spatial hash ───────────────────────────────────────────────────────────────

const CELL = ALI_RADIUS;

function hashCell(cx: number, cy: number, cz: number): number {
  return (cx * 73856093) ^ (cy * 19349663) ^ (cz * 83492791);
}

function cellKey(x: number, y: number, z: number): number {
  const cx = Math.floor(x / CELL);
  const cy = Math.floor(y / CELL);
  const cz = Math.floor(z / CELL);
  return hashCell(cx, cy, cz);
}

// ── Boid types ─────────────────────────────────────────────────────────────────

export interface Attractor {
  x: number;
  y: number;
  z: number;
  strength: number; // 0–1
}

export interface FlockState {
  orderParam: number;   // 0=chaos, 1=perfect alignment
  centroidY: number;    // −1 to +1 normalised
  centroidZ: number;    // −1 to +1 normalised (depth)
  speed: number;        // avg speed normalised 0–1
  clusters: ClusterInfo[];
}

export interface ClusterInfo {
  cx: number; cy: number; cz: number;
  count: number;
  id: number;
}

// ── Scene helpers ──────────────────────────────────────────────────────────────

export function buildScene(): {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  pointsMesh: THREE.Points;
  positions: Float32Array;
  colors: Float32Array;
  cleanup: () => void;
} {
  // Scene
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0520, 0.022);

  // Sky gradient background — a deep indigo/violet dusk
  scene.background = new THREE.Color(0x0d0b2a);

  // Camera
  const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 200);
  camera.position.set(0, 0, 18);
  camera.lookAt(0, 0, 0);

  // Renderer — created but canvas not appended here; caller appends
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  // Bird geometry: buffer geometry with position + color
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(NUM_BIRDS * 3);
  const colors = new Float32Array(NUM_BIRDS * 3);

  // Initialise random positions scattered in volume
  for (let i = 0; i < NUM_BIRDS; i++) {
    positions[i * 3 + 0] = (Math.random() - 0.5) * BOUNDS.x * 0.6;
    positions[i * 3 + 1] = (Math.random() - 0.5) * BOUNDS.y * 0.6;
    positions[i * 3 + 2] = (Math.random() - 0.5) * BOUNDS.z * 0.4;
    colors[i * 3 + 0] = 0.7;
    colors[i * 3 + 1] = 0.6;
    colors[i * 3 + 2] = 1.0;
  }

  const posAttr = new THREE.BufferAttribute(positions, 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  const colAttr = new THREE.BufferAttribute(colors, 3);
  colAttr.setUsage(THREE.DynamicDrawUsage);

  geometry.setAttribute('position', posAttr);
  geometry.setAttribute('color', colAttr);

  // Soft glowing circle sprite for each point
  const spriteCanvas = document.createElement('canvas');
  spriteCanvas.width = 32;
  spriteCanvas.height = 32;
  const ctx2d = spriteCanvas.getContext('2d')!;
  const grad = ctx2d.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(200,180,255,0.85)');
  grad.addColorStop(0.7, 'rgba(140,100,255,0.3)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx2d.fillStyle = grad;
  ctx2d.fillRect(0, 0, 32, 32);
  const sprite = new THREE.CanvasTexture(spriteCanvas);

  const material = new THREE.PointsMaterial({
    size: 0.38,
    map: sprite,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    sizeAttenuation: true,
    opacity: 0.92,
  });

  const pointsMesh = new THREE.Points(geometry, material);
  scene.add(pointsMesh);

  // Subtle ambient starfield in background
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(600 * 3);
  for (let i = 0; i < 600; i++) {
    starPos[i * 3 + 0] = (Math.random() - 0.5) * 140;
    starPos[i * 3 + 1] = (Math.random() - 0.5) * 80;
    starPos[i * 3 + 2] = -50 - Math.random() * 60;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({
    size: 0.12,
    color: 0xeeeeff,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity: 0.55,
    sizeAttenuation: true,
  });
  scene.add(new THREE.Points(starGeo, starMat));

  // Horizon warm glow plane (depth cue)
  const horizonGeo = new THREE.PlaneGeometry(120, 18);
  const horizonMat = new THREE.MeshBasicMaterial({
    color: 0x3a1040,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
  });
  const horizonMesh = new THREE.Mesh(horizonGeo, horizonMat);
  horizonMesh.position.set(0, -10, -20);
  scene.add(horizonMesh);

  function cleanup() {
    geometry.dispose();
    material.dispose();
    sprite.dispose();
    starGeo.dispose();
    starMat.dispose();
    horizonGeo.dispose();
    horizonMat.dispose();
    renderer.dispose();
  }

  return { scene, camera, renderer, pointsMesh, positions, colors, cleanup };
}

// ── Boids simulation ───────────────────────────────────────────────────────────

// Per-bird state stored in flat arrays for cache friendliness
const bx = new Float32Array(NUM_BIRDS);
const by = new Float32Array(NUM_BIRDS);
const bz = new Float32Array(NUM_BIRDS);
const vx = new Float32Array(NUM_BIRDS);
const vy = new Float32Array(NUM_BIRDS);
const vz = new Float32Array(NUM_BIRDS);

// Initialise velocities
for (let i = 0; i < NUM_BIRDS; i++) {
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.random() * Math.PI;
  const sp = MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED);
  vx[i] = sp * Math.sin(phi) * Math.cos(theta);
  vy[i] = sp * Math.cos(phi);
  vz[i] = sp * Math.sin(phi) * Math.sin(theta);
  // Copy initial position from scatter
  bx[i] = (Math.random() - 0.5) * BOUNDS.x * 0.6;
  by[i] = (Math.random() - 0.5) * BOUNDS.y * 0.6;
  bz[i] = (Math.random() - 0.5) * BOUNDS.z * 0.4;
}

// Spatial hash map: cell key → array of bird indices
let spatialMap: Map<number, number[]> = new Map();

function buildSpatialHash() {
  spatialMap = new Map();
  for (let i = 0; i < NUM_BIRDS; i++) {
    const k = cellKey(bx[i], by[i], bz[i]);
    let cell = spatialMap.get(k);
    if (!cell) { cell = []; spatialMap.set(k, cell); }
    cell.push(i);
  }
}

function getNeighbours(x: number, y: number, z: number, radius: number): number[] {
  const r = Math.ceil(radius / CELL);
  const cx0 = Math.floor(x / CELL) - r;
  const cy0 = Math.floor(y / CELL) - r;
  const cz0 = Math.floor(z / CELL) - r;
  const result: number[] = [];
  for (let cx = cx0; cx <= cx0 + r * 2; cx++) {
    for (let cy = cy0; cy <= cy0 + r * 2; cy++) {
      for (let cz = cz0; cz <= cz0 + r * 2; cz++) {
        const cell = spatialMap.get(hashCell(cx, cy, cz));
        if (cell) {
          for (const idx of cell) result.push(idx);
        }
      }
    }
  }
  return result;
}

let clusterState: ClusterInfo[] = [];
let clusterTimer = 0;

function computeClusters(): ClusterInfo[] {
  // Cheap 3D grid bucket cluster detection: split space into coarse buckets
  const BUCKET = 8;
  const buckets: Map<number, { sx: number; sy: number; sz: number; count: number; id: number }> = new Map();
  for (let i = 0; i < NUM_BIRDS; i++) {
    const bkx = Math.floor(bx[i] / BUCKET);
    const bky = Math.floor(by[i] / BUCKET);
    const bkz = Math.floor(bz[i] / BUCKET);
    const k = hashCell(bkx, bky, bkz);
    let b = buckets.get(k);
    if (!b) { b = { sx: 0, sy: 0, sz: 0, count: 0, id: k }; buckets.set(k, b); }
    b.sx += bx[i]; b.sy += by[i]; b.sz += bz[i]; b.count++;
  }

  // Merge nearby buckets and keep top 4 by count
  const sorted = Array.from(buckets.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  return sorted.map((b, idx) => ({
    cx: b.sx / b.count,
    cy: b.sy / b.count,
    cz: b.sz / b.count,
    count: b.count,
    id: idx,
  }));
}

export function stepFlock(
  dt: number,
  attractors: Attractor[],
  positions: Float32Array,
  colors: Float32Array,
): FlockState {
  dt = Math.min(dt, 0.033); // cap at ~30fps equivalent

  buildSpatialHash();

  let totalOrderX = 0, totalOrderY = 0, totalOrderZ = 0;
  let totalSpeed = 0;
  let centroidYAcc = 0, centroidZAcc = 0;

  const MAX_NEIGHBOURS = 24; // cap per bird to keep it smooth

  for (let i = 0; i < NUM_BIRDS; i++) {
    const px = bx[i], py = by[i], pz = bz[i];
    let fsx = 0, fsy = 0, fsz = 0; // separation
    let fax = 0, fay = 0, faz = 0; // alignment
    let fcx = 0, fcy = 0, fcz = 0; // cohesion

    let sepCount = 0, aliCount = 0, cohCount = 0;

    const neighbours = getNeighbours(px, py, pz, COH_RADIUS);
    let checked = 0;

    for (const j of neighbours) {
      if (j === i) continue;
      if (checked >= MAX_NEIGHBOURS) break;
      checked++;

      const dx = px - bx[j];
      const dy = py - by[j];
      const dz = pz - bz[j];
      const d2 = dx * dx + dy * dy + dz * dz;
      const d = Math.sqrt(d2) + 0.0001;

      if (d < SEP_RADIUS) {
        fsx += dx / d; fsy += dy / d; fsz += dz / d;
        sepCount++;
      }
      if (d < ALI_RADIUS) {
        fax += vx[j]; fay += vy[j]; faz += vz[j];
        aliCount++;
      }
      if (d < COH_RADIUS) {
        fcx += bx[j]; fcy += by[j]; fcz += bz[j];
        cohCount++;
      }
    }

    // Attractor forces
    let fatx = 0, faty = 0, fatz = 0;
    for (const att of attractors) {
      const dx = att.x - px;
      const dy = att.y - py;
      const dz = att.z - pz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.001;
      const pull = att.strength / (1 + d * 0.15);
      fatx += (dx / d) * pull;
      faty += (dy / d) * pull;
      fatz += (dz / d) * pull;
    }

    // Normalise and apply Reynolds rules
    let steerX = 0, steerY = 0, steerZ = 0;

    if (sepCount > 0) {
      const m = Math.sqrt(fsx * fsx + fsy * fsy + fsz * fsz) + 0.0001;
      steerX += (fsx / m) * MAX_SPEED * SEP_WEIGHT;
      steerY += (fsy / m) * MAX_SPEED * SEP_WEIGHT;
      steerZ += (fsz / m) * MAX_SPEED * SEP_WEIGHT;
    }

    if (aliCount > 0) {
      const m = Math.sqrt(fax * fax + fay * fay + faz * faz) + 0.0001;
      steerX += (fax / m) * MAX_SPEED * ALI_WEIGHT - vx[i];
      steerY += (fay / m) * MAX_SPEED * ALI_WEIGHT - vy[i];
      steerZ += (faz / m) * MAX_SPEED * ALI_WEIGHT - vz[i];
    }

    if (cohCount > 0) {
      const tx = fcx / cohCount - px;
      const ty = fcy / cohCount - py;
      const tz = fcz / cohCount - pz;
      const m = Math.sqrt(tx * tx + ty * ty + tz * tz) + 0.0001;
      steerX += (tx / m) * MAX_SPEED * COH_WEIGHT - vx[i];
      steerY += (ty / m) * MAX_SPEED * COH_WEIGHT - vy[i];
      steerZ += (tz / m) * MAX_SPEED * COH_WEIGHT - vz[i];
    }

    steerX += fatx * ATTRACTOR_WEIGHT;
    steerY += faty * ATTRACTOR_WEIGHT;
    steerZ += fatz * ATTRACTOR_WEIGHT;

    // Boundary avoidance (soft bubble)
    const boundForce = 3.5;
    if (px > BOUNDS.x * 0.5) steerX -= boundForce * (px / (BOUNDS.x * 0.5));
    if (px < -BOUNDS.x * 0.5) steerX += boundForce * (-px / (BOUNDS.x * 0.5));
    if (py > BOUNDS.y * 0.5) steerY -= boundForce * (py / (BOUNDS.y * 0.5));
    if (py < -BOUNDS.y * 0.5) steerY += boundForce * (-py / (BOUNDS.y * 0.5));
    if (pz > BOUNDS.z * 0.5) steerZ -= boundForce * (pz / (BOUNDS.z * 0.5));
    if (pz < -BOUNDS.z * 0.5) steerZ += boundForce * (-pz / (BOUNDS.z * 0.5));

    // Clamp steer force
    const sm = Math.sqrt(steerX * steerX + steerY * steerY + steerZ * steerZ);
    if (sm > MAX_FORCE) {
      steerX = (steerX / sm) * MAX_FORCE;
      steerY = (steerY / sm) * MAX_FORCE;
      steerZ = (steerZ / sm) * MAX_FORCE;
    }

    // Integrate velocity
    vx[i] += steerX * dt;
    vy[i] += steerY * dt;
    vz[i] += steerZ * dt;

    // Clamp speed
    const spd = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i] + vz[i] * vz[i]);
    if (spd > MAX_SPEED) {
      vx[i] = (vx[i] / spd) * MAX_SPEED;
      vy[i] = (vy[i] / spd) * MAX_SPEED;
      vz[i] = (vz[i] / spd) * MAX_SPEED;
    } else if (spd < MIN_SPEED && spd > 0.001) {
      vx[i] = (vx[i] / spd) * MIN_SPEED;
      vy[i] = (vy[i] / spd) * MIN_SPEED;
      vz[i] = (vz[i] / spd) * MIN_SPEED;
    }

    // Integrate position
    bx[i] += vx[i] * dt;
    by[i] += vy[i] * dt;
    bz[i] += vz[i] * dt;

    // Write to GPU buffer
    positions[i * 3 + 0] = bx[i];
    positions[i * 3 + 1] = by[i];
    positions[i * 3 + 2] = bz[i];

    // Bird colour: z-depth → far birds are dimmer violet, near birds warm white
    const depthFade = Math.max(0, Math.min(1, (bz[i] + BOUNDS.z * 0.5) / BOUNDS.z));
    // Near = warm (orange-white), Far = cool violet
    colors[i * 3 + 0] = 0.65 + depthFade * 0.35; // R
    colors[i * 3 + 1] = 0.5 + depthFade * 0.4;   // G
    colors[i * 3 + 2] = 1.0;                       // B

    totalOrderX += vx[i]; totalOrderY += vy[i]; totalOrderZ += vz[i];
    totalSpeed += spd;
    centroidYAcc += by[i];
    centroidZAcc += bz[i];
  }

  // Order parameter (Vicsek): magnitude of avg normalised velocity
  const avgVx = totalOrderX / NUM_BIRDS;
  const avgVy = totalOrderY / NUM_BIRDS;
  const avgVz = totalOrderZ / NUM_BIRDS;
  const orderParam = Math.sqrt(avgVx * avgVx + avgVy * avgVy + avgVz * avgVz) / MAX_SPEED;

  // Cluster detection throttled to ~200ms
  clusterTimer += dt;
  if (clusterTimer > 0.2) {
    clusterTimer = 0;
    clusterState = computeClusters();
  }

  return {
    orderParam: Math.min(1, orderParam),
    centroidY: (centroidYAcc / NUM_BIRDS) / (BOUNDS.y * 0.5),
    centroidZ: (centroidZAcc / NUM_BIRDS) / (BOUNDS.z * 0.5),
    speed: (totalSpeed / NUM_BIRDS) / MAX_SPEED,
    clusters: clusterState,
  };
}

// Slow camera drift — call each frame
export function driftCamera(camera: THREE.PerspectiveCamera, t: number) {
  const swayAmt = 1.8;
  const swaySpeed = 0.07;
  camera.position.x = Math.sin(t * swaySpeed) * swayAmt;
  camera.position.y = Math.cos(t * swaySpeed * 0.6) * 0.9;
  camera.position.z = 18 + Math.sin(t * swaySpeed * 0.4) * 2.5;
  camera.lookAt(
    Math.sin(t * swaySpeed * 0.5) * 0.8,
    Math.cos(t * swaySpeed * 0.3) * 0.5,
    0
  );
}
