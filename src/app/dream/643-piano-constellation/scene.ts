// scene.ts — three.js renderer for the 12 pitch-class constellations.
//
// Each pitch class is a small star CLUSTER on its own orbit around a central core.
// A cluster brightens + expands when its note sounds (live AnalyserNode level) and
// FLARES (a fast bright pulse) when you replay/grain that note. The soloed chroma is
// pulled forward and glows; muted/dimmed chromas fade back. On mount the scene orbits
// gently so a silent glance already looks alive.
//
// Falls back to reporting backend "none" (caller shows a Canvas2D notice) if WebGL
// is unavailable. Disposes geometries / materials / renderer on dispose().

import * as THREE from "three";
import { CHROMA_COUNT } from "./chroma";

// Hue per pitch class around the circle of the chroma ring (C..B).
const CHROMA_HUES = [
  0.0, 0.07, 0.13, 0.2, 0.3, 0.42, 0.5, 0.58, 0.66, 0.74, 0.84, 0.92,
];
const STARS_PER_CLUSTER = 26;
const HAMMER_INDEX = CHROMA_COUNT; // 13th cluster = hammers
const CLUSTER_COUNT = CHROMA_COUNT + 1;

export interface ConstellationScene {
  backend: "webgl" | "none";
  /**
   * levels: per-cluster live level 0..1 (length CLUSTER_COUNT).
   * effGain: per-cluster effective gain after solo/mute 0..1.
   * flares: per-cluster replay-flare intensity 0..1 (decays externally).
   * soloed: index of soloed cluster or -1.
   */
  render(levels: Float32Array, effGain: Float32Array, flares: Float32Array, soloed: number, t: number): void;
  resize(): void;
  dispose(): void;
}

function makeStarTexture(): THREE.Texture {
  const size = 64;
  const cnv = document.createElement("canvas");
  cnv.width = size;
  cnv.height = size;
  const g = cnv.getContext("2d");
  if (g) {
    const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.25, "rgba(255,255,255,0.85)");
    grd.addColorStop(0.55, "rgba(255,255,255,0.25)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(cnv);
  tex.needsUpdate = true;
  return tex;
}

export function createConstellationScene(canvas: HTMLCanvasElement): ConstellationScene {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    return {
      backend: "none",
      render: () => {},
      resize: () => {},
      dispose: () => {},
    };
  }
  if (!renderer.getContext()) {
    renderer.dispose();
    return { backend: "none", render: () => {}, resize: () => {}, dispose: () => {} };
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight, false);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x06080c, 0.045);

  const camera = new THREE.PerspectiveCamera(
    52,
    (canvas.clientWidth || window.innerWidth) / (canvas.clientHeight || window.innerHeight),
    0.1,
    100,
  );
  camera.position.set(0, 1.6, 13);
  camera.lookAt(0, 0, 0);

  const starTex = makeStarTexture();

  // Central core: a soft glowing sphere of points.
  const coreGeo = new THREE.IcosahedronGeometry(0.9, 1);
  const coreMat = new THREE.PointsMaterial({
    size: 0.12,
    map: starTex,
    transparent: true,
    color: new THREE.Color(0.7, 0.72, 0.9),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.55,
  });
  const core = new THREE.Points(coreGeo, coreMat);
  scene.add(core);

  // Per-cluster groups, each a THREE.Points of STARS_PER_CLUSTER stars.
  interface Cluster {
    group: THREE.Group;
    points: THREE.Points;
    geo: THREE.BufferGeometry;
    mat: THREE.PointsMaterial;
    baseColor: THREE.Color;
    orbitRadius: number;
    orbitSpeed: number;
    orbitPhase: number;
    inclination: number;
    basePositions: Float32Array; // local star offsets
  }
  const clusters: Cluster[] = [];

  for (let i = 0; i < CLUSTER_COUNT; i++) {
    const isHammer = i === HAMMER_INDEX;
    const group = new THREE.Group();

    const positions = new Float32Array(STARS_PER_CLUSTER * 3);
    const basePositions = new Float32Array(STARS_PER_CLUSTER * 3);
    for (let s = 0; s < STARS_PER_CLUSTER; s++) {
      // Star cluster: gaussian-ish blob.
      const r = Math.pow(Math.random(), 0.6) * (isHammer ? 0.85 : 0.6);
      const a = Math.random() * Math.PI * 2;
      const b = Math.acos(2 * Math.random() - 1);
      const x = r * Math.sin(b) * Math.cos(a);
      const y = r * Math.sin(b) * Math.sin(a) * 0.7;
      const z = r * Math.cos(b);
      basePositions[s * 3] = x;
      basePositions[s * 3 + 1] = y;
      basePositions[s * 3 + 2] = z;
      positions[s * 3] = x;
      positions[s * 3 + 1] = y;
      positions[s * 3 + 2] = z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const baseColor = isHammer
      ? new THREE.Color(0.7, 0.78, 0.95)
      : new THREE.Color().setHSL(CHROMA_HUES[i], 0.7, 0.6);

    const mat = new THREE.PointsMaterial({
      size: isHammer ? 0.14 : 0.17,
      map: starTex,
      transparent: true,
      color: baseColor.clone(),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.85,
    });
    const points = new THREE.Points(geo, mat);
    group.add(points);
    scene.add(group);

    // Orbit layout: 12 chromas evenly on a tilted ring; hammers in close & low.
    const orbitRadius = isHammer ? 2.1 : 5.0;
    const orbitPhase = isHammer ? 0 : (i / CHROMA_COUNT) * Math.PI * 2;
    const inclination = isHammer ? 0 : 0.28 * Math.sin((i / CHROMA_COUNT) * Math.PI * 2);
    const orbitSpeed = isHammer ? 0.12 : 0.05 + 0.02 * Math.sin(i);

    clusters.push({
      group,
      points,
      geo,
      mat,
      baseColor,
      orbitRadius,
      orbitSpeed,
      orbitPhase,
      inclination,
      basePositions,
    });
  }

  // Reusable scratch.
  const tmpColor = new THREE.Color();

  function render(
    levels: Float32Array,
    effGain: Float32Array,
    flares: Float32Array,
    soloed: number,
    t: number,
  ): void {
    // Gentle core breathing + slow scene yaw.
    const breathe = 0.9 + 0.1 * Math.sin(t * 0.8);
    core.scale.setScalar(breathe);
    core.rotation.y = t * 0.15;
    core.rotation.x = Math.sin(t * 0.3) * 0.1;
    scene.rotation.y = Math.sin(t * 0.05) * 0.15;

    for (let i = 0; i < CLUSTER_COUNT; i++) {
      const c = clusters[i];
      const lvl = levels[i] || 0;
      const flare = flares[i] || 0;
      const gain = effGain[i] ?? 1;
      const isSolo = soloed === i;

      // Orbit position.
      const ang = c.orbitPhase + t * c.orbitSpeed;
      const radius = c.orbitRadius + (isSolo ? -1.4 : 0); // soloed pulled forward/in.
      const x = Math.cos(ang) * radius;
      const z = Math.sin(ang) * radius;
      const y = Math.sin(ang) * c.inclination * radius + (i === HAMMER_INDEX ? -2.4 : 0);
      c.group.position.set(x, y, z);
      c.group.rotation.y = t * 0.4 + i;
      c.group.rotation.x = t * 0.25;

      // Expansion: louder / flaring → stars push outward.
      const expand = 1 + lvl * 0.9 + flare * 1.6 + (isSolo ? 0.25 : 0);
      const pos = c.geo.getAttribute("position") as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      const jitter = flare * 0.15;
      for (let s = 0; s < STARS_PER_CLUSTER; s++) {
        const bx = c.basePositions[s * 3];
        const by = c.basePositions[s * 3 + 1];
        const bz = c.basePositions[s * 3 + 2];
        arr[s * 3] = bx * expand + (jitter ? (Math.random() - 0.5) * jitter : 0);
        arr[s * 3 + 1] = by * expand + (jitter ? (Math.random() - 0.5) * jitter : 0);
        arr[s * 3 + 2] = bz * expand;
      }
      pos.needsUpdate = true;

      // Brightness: dim if muted/soloed-out; glow with level + flare.
      const dim = soloed >= 0 && !isSolo ? 0.18 : 1;
      const glow = 0.35 + lvl * 0.8 + flare * 1.2;
      tmpColor.copy(c.baseColor).multiplyScalar(Math.min(2.2, glow));
      // Flares wash toward white.
      if (flare > 0.01) tmpColor.lerp(new THREE.Color(1, 1, 1), Math.min(0.8, flare));
      c.mat.color.copy(tmpColor);
      c.mat.opacity = Math.min(1, (0.25 + 0.7 * gain) * dim + flare * 0.6);
      c.mat.size = (i === HAMMER_INDEX ? 0.14 : 0.17) * (1 + lvl * 0.6 + flare * 1.0);
    }

    renderer.render(scene, camera);
  }

  function resize(): void {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function dispose(): void {
    for (const c of clusters) {
      c.geo.dispose();
      c.mat.dispose();
      scene.remove(c.group);
    }
    coreGeo.dispose();
    coreMat.dispose();
    starTex.dispose();
    scene.clear();
    renderer.dispose();
  }

  return { backend: "webgl", render, resize, dispose };
}
