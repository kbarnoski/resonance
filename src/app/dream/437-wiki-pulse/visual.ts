/**
 * visual.ts — Wiki-Pulse three.js data-field renderer.
 *
 * Aesthetic: Ryoji Ikeda "data-cosm" — clinical, glowing points on near-black.
 * Each incoming recentchange spawns a visual event particle that fades over time.
 *
 * Layout (the 3D "field"):
 *   X-axis → wiki language / project (enwiki far left, wikidata far right, etc.)
 *   Y-axis → byte delta: additions above center, removals below
 *   Z-axis → depth jitter + time drift (particles float gently back)
 *
 * Color coding:
 *   Human edits → bright cyan/teal to white  (hue 180–200)
 *   Bot edits   → cold amber/orange           (hue 30–40), dimmer
 *   New page    → bright magenta accent       (hue 300)
 *   Log         → dim grey-green             (hue 120, low saturation)
 *   Categorize  → muted violet               (hue 260)
 *
 * Size: proportional to log(|byteDelta|+1)
 *
 * Each particle lives for ~3s, fading out via opacity on a custom ShaderMaterial
 * (PointsMaterial doesn't support per-point alpha easily, so we use a Points mesh
 * with BufferGeometry and update attributes each frame).
 *
 * We maintain a fixed-size circular buffer of MAX_PARTICLES slots.
 * No allocation after init — all updates are typed array writes.
 *
 * Cleanup: dispose geometry, material, renderer on unmount.
 */

import * as THREE from "three";
import type { RecentChangeEvent } from "./stream";

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_PARTICLES = 600;
const PARTICLE_LIFETIME = 3.5; // seconds

// Wiki-family → X position in [-4, +4]
const WIKI_X: Record<string, number> = {
  enwiki: -3.8,
  dewiki: -3.0,
  frwiki: -2.5,
  eswiki: -2.0,
  ruwiki: -1.5,
  jawiki: -1.0,
  zhwiki: -0.5,
  itwiki: 0.0,
  ptwiki: 0.5,
  arwiki: 1.0,
  plwiki: 1.5,
  nlwiki: 2.0,
  svwiki: 2.5,
  wikidata: 3.4,
  commonswiki: 3.8,
};

function wikiToX(wiki: string): number {
  return WIKI_X[wiki] ?? (Math.random() - 0.5) * 3.5;
}

// Byte delta → Y  (clamped log scale, centered at 0)
function deltaToY(delta: number): number {
  const sign = delta >= 0 ? 1 : -1;
  const magnitude = Math.log1p(Math.abs(delta)) / Math.log(20001); // 0..1
  return sign * magnitude * 3.5;
}

// Event type + bot → HSL color components [h, s, l]
function eventToHSL(evt: RecentChangeEvent): [number, number, number] {
  if (evt.bot) return [35, 0.85, 0.6];       // amber — cold machine
  switch (evt.type) {
    case "new":        return [300, 0.9, 0.72]; // magenta
    case "log":        return [120, 0.25, 0.45]; // muted grey-green
    case "categorize": return [255, 0.6, 0.6];   // violet
    case "edit":
    default: {
      // Human edits: cyan spectrum, main namespace brighter
      const hue = evt.namespace === 0 ? 190 : 175;
      const lit = evt.namespace === 0 ? 0.78 : 0.55;
      return [hue, 0.85, lit];
    }
  }
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60)       { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }
  return [r + m, g + m, b + m];
}

// Event type + delta → point size
function eventToSize(evt: RecentChangeEvent, absDelta: number): number {
  const base = evt.bot ? 2.5 : (evt.namespace === 0 ? 4.0 : 2.8);
  const sizeBoost = Math.log1p(absDelta) / Math.log(50001) * 8;
  return Math.min(base + sizeBoost, 14);
}

// ── Particle slot ─────────────────────────────────────────────────────────────

interface ParticleSlot {
  alive: boolean;
  spawnTime: number;
  lifetime: number;
}

// ── Exported types ────────────────────────────────────────────────────────────

export interface VisualEngine {
  spawnParticle: (evt: RecentChangeEvent) => void;
  drawFrame: (timestamp: number) => void;
  dispose: () => void;
}

// ── Build the engine ──────────────────────────────────────────────────────────

export function buildVisualEngine(container: HTMLDivElement): VisualEngine {
  // ── Renderer ─────────────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setClearColor(0x000000, 1);
  container.appendChild(renderer.domElement);

  // ── Scene / Camera ────────────────────────────────────────────────────────
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    60,
    container.clientWidth / container.clientHeight,
    0.1,
    100
  );
  camera.position.set(0, 0, 8);
  camera.lookAt(0, 0, 0);

  // ── Geometry: fixed-size CircularBuffer ───────────────────────────────────
  const positions  = new Float32Array(MAX_PARTICLES * 3);
  const colors     = new Float32Array(MAX_PARTICLES * 3);
  const sizes      = new Float32Array(MAX_PARTICLES);
  const alphas     = new Float32Array(MAX_PARTICLES); // 0..1

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color",    new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("size",     new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("alpha",    new THREE.BufferAttribute(alphas, 1));

  // Custom shader: per-point alpha + circular shape
  const material = new THREE.ShaderMaterial({
    vertexShader: /* glsl */`
      attribute float size;
      attribute float alpha;
      attribute vec3 color;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = color;
        vAlpha = alpha;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (300.0 / -mvPos.z);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */`
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        // Soft glow falloff
        float alpha = vAlpha * (1.0 - smoothstep(0.2, 0.5, d));
        gl_FragColor = vec4(vColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);

  // Particle slots
  const slots: ParticleSlot[] = Array.from({ length: MAX_PARTICLES }, () => ({
    alive: false,
    spawnTime: 0,
    lifetime: PARTICLE_LIFETIME,
  }));

  let nextSlot = 0;

  // Grid lines: subtle world axis indicators
  const gridMat = new THREE.LineBasicMaterial({ color: 0x1a1a2e, transparent: true, opacity: 0.4 });

  // Horizontal (Y=0) axis line
  const hGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-5, 0, 0), new THREE.Vector3(5, 0, 0),
  ]);
  scene.add(new THREE.Line(hGeom, gridMat));

  // Vertical (X=0) axis line
  const vGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, -4.5, 0), new THREE.Vector3(0, 4.5, 0),
  ]);
  scene.add(new THREE.Line(vGeom, gridMat));

  // Label dots for wiki positions: faint static reference cloud
  const labelPositions: number[] = [];
  for (const x of Object.values(WIKI_X)) {
    labelPositions.push(x, 0, -0.5);
  }
  const labelGeom = new THREE.BufferGeometry();
  labelGeom.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(labelPositions), 3)
  );
  const labelMat = new THREE.PointsMaterial({
    color: 0x223344,
    size: 2,
    sizeAttenuation: true,
  });
  scene.add(new THREE.Points(labelGeom, labelMat));

  // ── Resize handler ────────────────────────────────────────────────────────
  let resizeObserver: ResizeObserver | null = null;
  function handleResize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  resizeObserver = new ResizeObserver(handleResize);
  resizeObserver.observe(container);

  // ── Gentle camera drift ───────────────────────────────────────────────────
  let cameraAngle = 0;

  // ── Particle spawn ────────────────────────────────────────────────────────
  function spawnParticle(evt: RecentChangeEvent): void {
    const idx = nextSlot % MAX_PARTICLES;
    nextSlot++;

    const delta = evt.length ? evt.length.new - evt.length.old : 0;
    const absDelta = Math.abs(delta);
    const x = wikiToX(evt.wiki) + (Math.random() - 0.5) * 0.3;
    const y = deltaToY(delta)   + (Math.random() - 0.5) * 0.25;
    const z = (Math.random() - 0.5) * 2.0;

    const [h, s, l] = eventToHSL(evt);
    const [r, g, b] = hslToRgb(h, s, l);
    const sz = eventToSize(evt, absDelta);

    positions[idx * 3]     = x;
    positions[idx * 3 + 1] = y;
    positions[idx * 3 + 2] = z;
    colors[idx * 3]     = r;
    colors[idx * 3 + 1] = g;
    colors[idx * 3 + 2] = b;
    sizes[idx]  = sz;
    alphas[idx] = 1.0;

    slots[idx] = {
      alive: true,
      spawnTime: performance.now() / 1000,
      lifetime: PARTICLE_LIFETIME + Math.random() * 1.0,
    };

    // Mark attributes dirty
    (geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (geometry.attributes.size as THREE.BufferAttribute).needsUpdate = true;
    (geometry.attributes.alpha as THREE.BufferAttribute).needsUpdate = true;
  }

  // ── Draw frame ────────────────────────────────────────────────────────────
  let alphasDirty = false;

  function drawFrame(timestamp: number): void {
    const now = timestamp / 1000;

    // Gentle camera orbit
    cameraAngle += 0.00018;
    camera.position.x = Math.sin(cameraAngle) * 0.5;
    camera.position.y = Math.cos(cameraAngle * 0.7) * 0.3;
    camera.lookAt(0, 0, 0);

    // Update alphas for all alive particles
    alphasDirty = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const slot = slots[i];
      if (!slot.alive) {
        if (alphas[i] > 0) { alphas[i] = 0; alphasDirty = true; }
        continue;
      }
      const age = now - slot.spawnTime;
      if (age >= slot.lifetime) {
        alphas[i] = 0;
        slot.alive = false;
        alphasDirty = true;
      } else {
        // Fade-in first 0.1s, hold, then fade out
        let a: number;
        if (age < 0.1) {
          a = age / 0.1;
        } else {
          const fadeStart = slot.lifetime * 0.5;
          a = age > fadeStart
            ? 1 - (age - fadeStart) / (slot.lifetime - fadeStart)
            : 1.0;
        }
        const newAlpha = Math.max(0, Math.min(1, a));
        if (Math.abs(newAlpha - alphas[i]) > 0.005) {
          alphas[i] = newAlpha;
          alphasDirty = true;
        }
      }

      // Slow Z drift: particles float toward viewer
      positions[i * 3 + 2] += 0.0002;
    }

    if (alphasDirty) {
      (geometry.attributes.alpha as THREE.BufferAttribute).needsUpdate = true;
      (geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }

    renderer.render(scene, camera);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  function dispose(): void {
    resizeObserver?.disconnect();
    resizeObserver = null;

    geometry.dispose();
    material.dispose();
    hGeom.dispose();
    vGeom.dispose();
    labelGeom.dispose();
    labelMat.dispose();
    gridMat.dispose();
    renderer.dispose();

    const canvas = renderer.domElement;
    if (canvas.parentNode === container) {
      container.removeChild(canvas);
    }
  }

  return { spawnParticle, drawFrame, dispose };
}
