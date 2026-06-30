// ─────────────────────────────────────────────────────────────────────────────
// scene.ts — the dark globe of Deep Tremor (three.js).
//
//   A slowly auto-rotating, near-black point/wireframe Earth floats in a vast
//   void. Each earthquake spawns an expanding ring sitting ON the globe surface
//   at the quake's TRUE lat/lon (tangent to the sphere), plus a brief radial
//   glow. Ring radius + brightness scale with magnitude; rings fade as they
//   expand. This is the "void" pole — calm, vast, a touch funereal — NOT a
//   center-of-screen bloom: rings appear all over the globe at real locations.
//
//   SAFETY: all luminance changes are slow smooth drifts (well under 3 Hz). No
//   strobing or flicker.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from "three";

const GLOBE_RADIUS = 2;
const MAX_RINGS = 96;

/** Probe for a usable WebGL context before constructing the renderer. */
export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

/** Geographic (lon,lat) degrees → position on the globe surface, matching the
 *  audio engine's geoToUnit convention (Y up, facing -Z). */
function geoToSurface(lonDeg: number, latDeg: number, r: number): THREE.Vector3 {
  const lon = (lonDeg * Math.PI) / 180;
  const lat = (latDeg * Math.PI) / 180;
  return new THREE.Vector3(
    Math.cos(lat) * Math.sin(lon) * r,
    Math.sin(lat) * r,
    Math.cos(lat) * Math.cos(lon) * r,
  );
}

interface Ring {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  geom: THREE.RingGeometry;
  glow: THREE.Sprite;
  glowMat: THREE.SpriteMaterial;
  age: number;
  life: number;
  maxScale: number;
  peak: number;
}

export class TremorScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private globe: THREE.Group;
  private rings: Ring[] = [];
  private glowTexture: THREE.Texture;
  private raf = 0;
  private lastT = 0;
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x04060c);
    this.scene.fog = new THREE.FogExp2(0x04060c, 0.06);

    this.camera = new THREE.PerspectiveCamera(48, w / h, 0.1, 100);
    this.camera.position.set(0, 1.2, 6.4);
    this.camera.lookAt(0, 0, 0);

    this.glowTexture = makeGlowTexture();
    this.globe = makeGlobe();
    this.scene.add(this.globe);
    this.scene.add(makeStarfield());
  }

  start(): void {
    this.lastT = performance.now();
    const loop = () => {
      const now = performance.now();
      let dt = (now - this.lastT) / 1000;
      this.lastT = now;
      if (!Number.isFinite(dt) || dt < 0) dt = 0;
      dt = Math.min(dt, 0.05);
      this.update(dt);
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Spawn an expanding ring + glow at the quake's true lat/lon. */
  spawnQuake(lon: number, lat: number, mag: number): void {
    if (this.rings.length >= MAX_RINGS) {
      const old = this.rings.shift();
      if (old) this.disposeRing(old);
    }

    const m = Math.min(8, Math.max(1, mag));
    const maxScale = 0.18 + (m / 8) * 0.9;
    const life = 2.6 + (m / 8) * 3.4;
    const peak = 0.35 + (m / 8) * 0.6;

    const inner = 0.012;
    const outer = 0.06;
    const geom = new THREE.RingGeometry(inner, outer, 48);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setHSL(0.6, 0.45, 0.62),
      transparent: true,
      opacity: peak,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geom, mat);

    const pos = geoToSurface(lon, lat, GLOBE_RADIUS + 0.01);
    mesh.position.copy(pos);
    // Orient the ring tangent to the sphere (its +Z faces outward).
    mesh.lookAt(pos.clone().multiplyScalar(2));

    const glowMat = new THREE.SpriteMaterial({
      map: this.glowTexture,
      color: new THREE.Color().setHSL(0.58, 0.5, 0.7),
      transparent: true,
      opacity: peak,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glow = new THREE.Sprite(glowMat);
    glow.position.copy(pos);
    glow.scale.setScalar(0.12 + (m / 8) * 0.4);

    this.globe.add(mesh);
    this.globe.add(glow);

    this.rings.push({ mesh, mat, geom, glow, glowMat, age: 0, life, maxScale, peak });
  }

  private update(dt: number): void {
    // Slow auto-rotation — vast and calm.
    this.globe.rotation.y += dt * 0.06;

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.age += dt;
      const t = r.age / r.life;
      if (t >= 1) {
        this.disposeRing(r);
        this.rings.splice(i, 1);
        continue;
      }
      // Ease-out expansion; opacity fades as it grows (smooth, no flicker).
      const grow = 1 - Math.pow(1 - t, 2);
      const scale = 0.6 + grow * r.maxScale * 14;
      r.mesh.scale.setScalar(scale);
      r.mat.opacity = r.peak * (1 - t) * (1 - t);
      // Glow blooms fast then fades within the first third of the life.
      const gT = Math.min(1, t * 3);
      r.glowMat.opacity = r.peak * (1 - gT);
      r.glow.scale.setScalar((0.12 + grow * 0.25) * (1 + r.maxScale));
    }
  }

  private disposeRing(r: Ring): void {
    this.globe.remove(r.mesh);
    this.globe.remove(r.glow);
    r.geom.dispose();
    r.mat.dispose();
    r.glowMat.dispose();
  }

  resize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  dispose(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    for (const r of this.rings) this.disposeRing(r);
    this.rings = [];
    this.glowTexture.dispose();
    // Dispose every geometry/material left in the scene graph.
    this.scene.traverse((obj) => {
      const mesh = obj as Partial<THREE.Mesh> & Partial<THREE.Points> & Partial<THREE.LineSegments>;
      if (mesh.geometry && typeof mesh.geometry.dispose === "function") {
        mesh.geometry.dispose();
      }
      const mat = (mesh as { material?: THREE.Material | THREE.Material[] }).material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else if (mat) mat.dispose();
    });
    this.renderer.dispose();
    const el = this.renderer.domElement;
    if (el.parentNode) el.parentNode.removeChild(el);
  }
}

// ── Builders ────────────────────────────────────────────────────────────────

/** A dark point-cloud Earth: points on a sphere + a faint wireframe shell. */
function makeGlobe(): THREE.Group {
  const group = new THREE.Group();

  // Point sphere (deep indigo/slate, subtle).
  const count = 9000;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // Even spherical distribution (Fibonacci-ish via golden angle).
    const y = 1 - (i / (count - 1)) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = i * 2.399963229728653;
    positions[i * 3] = Math.cos(theta) * radius * GLOBE_RADIUS;
    positions[i * 3 + 1] = y * GLOBE_RADIUS;
    positions[i * 3 + 2] = Math.sin(theta) * radius * GLOBE_RADIUS;
  }
  const pGeom = new THREE.BufferGeometry();
  pGeom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const pMat = new THREE.PointsMaterial({
    color: 0x3a4a7a,
    size: 0.018,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  });
  group.add(new THREE.Points(pGeom, pMat));

  // Faint wireframe shell so the form reads as a globe.
  const wGeom = new THREE.SphereGeometry(GLOBE_RADIUS * 0.999, 36, 24);
  const wMat = new THREE.MeshBasicMaterial({
    color: 0x1a2342,
    wireframe: true,
    transparent: true,
    opacity: 0.35,
  });
  group.add(new THREE.Mesh(wGeom, wMat));

  // A solid near-black core so back-side rings don't bleed through.
  const cGeom = new THREE.SphereGeometry(GLOBE_RADIUS * 0.96, 32, 24);
  const cMat = new THREE.MeshBasicMaterial({ color: 0x03040a });
  group.add(new THREE.Mesh(cGeom, cMat));

  return group;
}

/** A faint static star/void backdrop. */
function makeStarfield(): THREE.Points {
  const count = 1400;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const v = new THREE.Vector3(
      Math.random() * 2 - 1,
      Math.random() * 2 - 1,
      Math.random() * 2 - 1,
    )
      .normalize()
      .multiplyScalar(20 + Math.random() * 30);
    positions[i * 3] = v.x;
    positions[i * 3 + 1] = v.y;
    positions[i * 3 + 2] = v.z;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0x556088,
    size: 0.08,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  return new THREE.Points(geom, mat);
}

/** A soft radial-gradient sprite texture for the per-quake glow. */
function makeGlowTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(0.3, "rgba(150,180,255,0.5)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}
