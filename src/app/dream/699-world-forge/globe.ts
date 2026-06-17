// globe.ts — three.js renderer for the living Earth.
//
// A slowly auto-rotating dark sphere with a procedural lat/long graticule
// glow and scattered "continent-ish" point dots (NO external texture). Each
// event spawns an additive light bloom at a deterministic pseudo geo-loc;
// blooms swell then fade over a few seconds and leave a soft afterglow.
// The whole planet brightens with the rolling activity intensity.
//
// THREE is passed in (dynamically imported by the page) so it never enters
// the static import graph. We keep the typing local + minimal to avoid any
// `any` while not depending on three's published types at build edges.

import { geoFor, hashStr, type ForgeEvent } from "./feed";

type ThreeModule = typeof import("three");

const TYPE_COLOR: Record<string, [number, number, number]> = {
  PushEvent: [0.45, 0.72, 1.0], // cool blue-white
  WatchEvent: [1.0, 0.92, 0.6], // bright gold (a star)
  PullRequestEvent: [0.55, 1.0, 0.7], // warm green
  IssuesEvent: [1.0, 0.55, 0.45], // muted ember
  IssueCommentEvent: [0.85, 0.6, 1.0], // soft violet
  ForkEvent: [0.6, 0.5, 1.0], // low violet-blue
  CreateEvent: [0.5, 0.85, 1.0], // teal bloom
};

interface Bloom {
  born: number;
  life: number; // seconds
  type: string;
}

export interface GlobeHandle {
  spawn: (e: ForgeEvent) => void;
  setIntensity: (x: number) => void;
  dispose: () => void;
}

const R = 1.0;

function latLonToVec3(
  lat: number,
  lon: number,
  radius: number,
): [number, number, number] {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return [x, y, z];
}

export async function createGlobe(
  container: HTMLElement,
  THREE: ThreeModule,
): Promise<GlobeHandle> {
  const w = container.clientWidth || window.innerWidth;
  const h = container.clientHeight || window.innerHeight;

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h);
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 100);
  camera.position.set(0, 0.35, 3.4);
  camera.lookAt(0, 0, 0);

  // group that rotates (the planet)
  const planet = new THREE.Group();
  scene.add(planet);

  // ── the dark Earth body ───────────────────────────────────────────
  const sphereGeo = new THREE.SphereGeometry(R, 64, 48);
  const sphereMat = new THREE.MeshStandardMaterial({
    color: 0x0a1426,
    emissive: 0x0a1830,
    emissiveIntensity: 0.5,
    roughness: 1,
    metalness: 0,
  });
  const sphere = new THREE.Mesh(sphereGeo, sphereMat);
  planet.add(sphere);

  // faint rim/atmosphere via a slightly larger back-side sphere
  const atmoGeo = new THREE.SphereGeometry(R * 1.06, 48, 32);
  const atmoMat = new THREE.MeshBasicMaterial({
    color: 0x2b5bd0,
    transparent: true,
    opacity: 0.08,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const atmo = new THREE.Mesh(atmoGeo, atmoMat);
  planet.add(atmo);

  // ── graticule (lat/long lines) glow ────────────────────────────────
  const gratGeo = new THREE.BufferGeometry();
  const gratPts: number[] = [];
  const addLine = (pts: [number, number, number][]) => {
    for (let i = 0; i < pts.length - 1; i++) {
      gratPts.push(...pts[i], ...pts[i + 1]);
    }
  };
  for (let lat = -60; lat <= 60; lat += 30) {
    const ring: [number, number, number][] = [];
    for (let lon = -180; lon <= 180; lon += 6) {
      ring.push(latLonToVec3(lat, lon, R * 1.002));
    }
    addLine(ring);
  }
  for (let lon = -180; lon < 180; lon += 30) {
    const meridian: [number, number, number][] = [];
    for (let lat = -85; lat <= 85; lat += 5) {
      meridian.push(latLonToVec3(lat, lon, R * 1.002));
    }
    addLine(meridian);
  }
  gratGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(gratPts, 3),
  );
  const gratMat = new THREE.LineBasicMaterial({
    color: 0x2f6fd0,
    transparent: true,
    opacity: 0.18,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const graticule = new THREE.LineSegments(gratGeo, gratMat);
  planet.add(graticule);

  // ── scattered "continent-ish" dots ────────────────────────────────
  const dotCount = 1400;
  const dotPos = new Float32Array(dotCount * 3);
  for (let i = 0; i < dotCount; i++) {
    // fibonacci sphere for even-ish coverage, perturbed so it reads organic
    const t = (i + 0.5) / dotCount;
    const y = 1 - 2 * t;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const phi = i * 2.39996; // golden angle
    const seed = hashStr("dot" + i) / 0xffffffff;
    const keep = seed > 0.42; // sparse "land"
    const rad = keep ? R * 1.004 : R * 0.0; // hidden if not "land"
    dotPos[i * 3] = Math.cos(phi) * r * rad;
    dotPos[i * 3 + 1] = y * rad;
    dotPos[i * 3 + 2] = Math.sin(phi) * r * rad;
  }
  const dotGeo = new THREE.BufferGeometry();
  dotGeo.setAttribute("position", new THREE.BufferAttribute(dotPos, 3));
  const dotMat = new THREE.PointsMaterial({
    color: 0x3b86ff,
    size: 0.016,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const dots = new THREE.Points(dotGeo, dotMat);
  planet.add(dots);

  // ── bloom system (additive sprites at geo locations) ───────────────
  // Build a soft radial sprite texture once.
  const cnv = document.createElement("canvas");
  cnv.width = cnv.height = 64;
  const cx = cnv.getContext("2d");
  if (cx) {
    const g = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,255,255,0.7)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    cx.fillStyle = g;
    cx.fillRect(0, 0, 64, 64);
  }
  const spriteTex = new THREE.CanvasTexture(cnv);

  const MAX_BLOOMS = 220;
  const bloomGroup = new THREE.Group();
  planet.add(bloomGroup);
  const sprites: Array<{
    sprite: InstanceType<ThreeModule["Sprite"]>;
    mat: InstanceType<ThreeModule["SpriteMaterial"]>;
    data: Bloom | null;
  }> = [];
  for (let i = 0; i < MAX_BLOOMS; i++) {
    const mat = new THREE.SpriteMaterial({
      map: spriteTex,
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.visible = false;
    bloomGroup.add(sprite);
    sprites.push({ sprite, mat, data: null });
  }
  let bloomCursor = 0;

  // ── lights ─────────────────────────────────────────────────────────
  const ambient = new THREE.AmbientLight(0x1a2b4a, 0.8);
  scene.add(ambient);
  const key = new THREE.PointLight(0x6f9bff, 1.2, 20);
  key.position.set(3, 2, 4);
  scene.add(key);

  // ── state ──────────────────────────────────────────────────────────
  let intensity = 0;
  let rafId = 0;
  let disposed = false;
  const clock = new THREE.Clock();

  const spawn = (e: ForgeEvent) => {
    const { lat, lon } = geoFor(e);
    const [x, y, z] = latLonToVec3(lat, lon, R * 1.02);
    const slot = sprites[bloomCursor];
    bloomCursor = (bloomCursor + 1) % MAX_BLOOMS;
    const col = TYPE_COLOR[e.type] ?? TYPE_COLOR.PushEvent;
    slot.mat.color.setRGB(col[0], col[1], col[2]);
    slot.sprite.position.set(x, y, z);
    slot.sprite.visible = true;
    slot.data = {
      born: clock.getElapsedTime(),
      life:
        e.type === "ForkEvent" || e.type === "CreateEvent"
          ? 4.5
          : e.type === "WatchEvent"
            ? 3.2
            : 2.6,
      type: e.type,
    };
  };

  const setIntensity = (x: number) => {
    intensity = Math.max(0, Math.min(1, x));
  };

  const onResize = () => {
    if (disposed) return;
    const nw = container.clientWidth || window.innerWidth;
    const nh = container.clientHeight || window.innerHeight;
    renderer.setSize(nw, nh);
    camera.aspect = nw / nh;
    camera.updateProjectionMatrix();
  };
  window.addEventListener("resize", onResize);

  const animate = () => {
    if (disposed) return;
    rafId = requestAnimationFrame(animate);
    const now = clock.getElapsedTime();

    // auto-rotate; busier planet turns a hair faster
    planet.rotation.y += 0.0012 + intensity * 0.0016;
    planet.rotation.x = Math.sin(now * 0.05) * 0.04 + 0.18;

    // camera breathes
    camera.position.x = Math.sin(now * 0.06) * 0.25;
    camera.position.y = 0.35 + Math.sin(now * 0.045) * 0.12;
    camera.lookAt(0, 0, 0);

    // planet glow tracks intensity
    sphereMat.emissiveIntensity = 0.4 + intensity * 0.6;
    gratMat.opacity = 0.12 + intensity * 0.22;
    dotMat.opacity = 0.4 + intensity * 0.4;
    atmoMat.opacity = 0.06 + intensity * 0.12;

    // update blooms
    for (const s of sprites) {
      if (!s.data) continue;
      const age = now - s.data.born;
      const k = age / s.data.life;
      if (k >= 1) {
        s.data = null;
        s.sprite.visible = false;
        s.mat.opacity = 0;
        continue;
      }
      // swell then fade: quick rise, soft decay (afterglow tail)
      const env =
        k < 0.12 ? k / 0.12 : Math.pow(1 - (k - 0.12) / 0.88, 1.6);
      const size = (0.06 + 0.10 * Math.min(1, k * 4)) * (1 + 0.4 * env);
      s.sprite.scale.set(size, size, size);
      s.mat.opacity = Math.min(1, env * 0.95);
    }

    renderer.render(scene, camera);
  };
  animate();

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(rafId);
    window.removeEventListener("resize", onResize);
    sphereGeo.dispose();
    sphereMat.dispose();
    atmoGeo.dispose();
    atmoMat.dispose();
    gratGeo.dispose();
    gratMat.dispose();
    dotGeo.dispose();
    dotMat.dispose();
    spriteTex.dispose();
    for (const s of sprites) s.mat.dispose();
    renderer.dispose();
    if (renderer.domElement.parentNode === container) {
      container.removeChild(renderer.domElement);
    }
  };

  return { spawn, setIntensity, dispose };
}
