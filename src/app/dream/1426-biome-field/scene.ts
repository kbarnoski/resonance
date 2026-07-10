// ─────────────────────────────────────────────────────────────────────────────
// scene.ts — the living data-field of Biome Field (three.js).
//
//   A slowly-rotating dark globe wearing a shell of glowing points — ONE point
//   per real earthquake of the last day. It is a *living field*, never a static
//   chart: the whole shell breathes on a slow radial swell, every point drifts
//   on its own phase, and recent quakes shimmer. The mapping:
//
//     magnitude → point size + brightness
//     depth     → colour (shallow warm-gold → deep violet) AND radial height,
//                 so the field reads as a 3-D data-terrain floating off Earth
//     recency   → shimmer rate + amplitude (fresh quakes twinkle brightest)
//
//   The visitor DRAGS to orbit and HOVERS to "listen in" on a region: the hover
//   raycasts onto the globe, lights a halo there, brightens nearby points, and
//   (via onFocus) tells the audio engine which part of the field to voice. After
//   ~5 s of no interaction a slow auto-orbit keeps the planet turning.
//
//   SAFETY: every per-point shimmer is a soft sine ≤ ~0.75 Hz and the shell
//   breath is far slower — no strobing, well under the 3 Hz ceiling. Reduced
//   motion damps drift + shimmer further.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from "three";
import type { Quake } from "./data";

const GLOBE_RADIUS = 2;
const CAM_RADIUS = 6.6;

export interface FocusInfo {
  lon: number;
  lat: number;
}

export interface SceneOptions {
  reduced?: boolean;
  onFocus?: (f: FocusInfo | null) => void;
}

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

/** Geographic (lon,lat) degrees → unit direction (Y up, facing -Z). */
function geoToUnit(lonDeg: number, latDeg: number): THREE.Vector3 {
  const lon = (lonDeg * Math.PI) / 180;
  const lat = (latDeg * Math.PI) / 180;
  return new THREE.Vector3(
    Math.cos(lat) * Math.sin(lon),
    Math.sin(lat),
    Math.cos(lat) * Math.cos(lon),
  );
}

/** A cosmic depth ramp: shallow = warm gold, mid = teal, deep = violet. */
function depthColor(depthNorm: number): THREE.Color {
  const shallow = new THREE.Color(1.0, 0.72, 0.34);
  const mid = new THREE.Color(0.25, 0.82, 0.78);
  const deep = new THREE.Color(0.62, 0.42, 1.0);
  const c = new THREE.Color();
  if (depthNorm < 0.5) {
    c.copy(shallow).lerp(mid, depthNorm / 0.5);
  } else {
    c.copy(mid).lerp(deep, (depthNorm - 0.5) / 0.5);
  }
  return c;
}

const FIELD_VERT = /* glsl */ `
  attribute float aMag;
  attribute float aRecency;
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uTime;
  uniform vec3 uFocusDir;
  uniform float uFocusStr;
  uniform float uPixelRatio;
  uniform float uReduced;
  varying vec3 vColor;
  varying float vBright;
  void main() {
    vec3 pos = position;
    // Slow whole-shell breath (radial swell) — well under 1 Hz.
    float breath = 1.0 + 0.014 * sin(uTime * 0.32 + aPhase * 0.6);
    pos *= breath;
    // Tiny per-point drift so the field is never frozen.
    float drift = 0.007 * (1.0 - 0.7 * uReduced);
    pos += vec3(
      sin(uTime * 0.21 + aPhase),
      cos(uTime * 0.17 + aPhase * 1.3),
      sin(uTime * 0.24 + aPhase * 0.7)
    ) * drift;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    // Recency shimmer: soft sine, faster + stronger for fresh quakes (<=0.75 Hz).
    float shimHz = 0.35 + aRecency * 0.4;
    float shimAmt = (0.22 + aRecency * 0.5) * (1.0 - 0.6 * uReduced);
    float shim = 1.0 + shimAmt * sin(uTime * 6.2831853 * shimHz + aPhase * 6.2831853);

    // Focus: emphasise points near the pointer's ground projection.
    float prox = max(0.0, dot(normalize(position), uFocusDir));
    float focusGlow = uFocusStr * pow(prox, 8.0);

    float baseSize = 2.4 + aMag * 9.5;
    float size = baseSize * shim * (1.0 + focusGlow * 1.7);
    gl_PointSize = size * uPixelRatio * (300.0 / max(0.001, -mv.z));

    vColor = aColor;
    vBright = (0.42 + aMag * 0.66) * shim * (1.0 + focusGlow * 1.5);
  }
`;

const FIELD_FRAG = /* glsl */ `
  precision mediump float;
  varying vec3 vColor;
  varying float vBright;
  void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float r = dot(uv, uv);
    if (r > 1.0) discard;
    float soft = exp(-r * 2.4);
    vec3 col = vColor * vBright * soft;
    gl_FragColor = vec4(col, soft * 0.95);
  }
`;

export class BiomeScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private globe: THREE.Group;
  private field: THREE.Points | null = null;
  private fieldGeom: THREE.BufferGeometry | null = null;
  private fieldMat: THREE.ShaderMaterial;
  private raycastSphere: THREE.Mesh;
  private focusSprite: THREE.Sprite;
  private focusTex: THREE.Texture;
  private raycaster = new THREE.Raycaster();
  private container: HTMLElement;
  private reduced: boolean;
  private onFocus?: (f: FocusInfo | null) => void;

  private raf = 0;
  private lastT = 0;
  private clock = 0;

  // Orbit state (spherical around origin).
  private az = 0.4;
  private pol = 0.35;
  private lastInteraction = 0;
  private lastPointer: { x: number; y: number } | null = null;

  // Focus state (eased).
  private focusDir = new THREE.Vector3(0, 0, 1);
  private focusStr = 0;
  private focusTarget = 0;

  constructor(container: HTMLElement, opts: SceneOptions = {}) {
    this.container = container;
    this.reduced = opts.reduced ?? false;
    this.onFocus = opts.onFocus;

    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x04060d);
    this.scene.fog = new THREE.FogExp2(0x04060d, 0.055);

    this.camera = new THREE.PerspectiveCamera(46, w / h, 0.1, 100);

    this.globe = makeGlobe();
    this.scene.add(this.globe);
    this.scene.add(makeStarfield());

    // Invisible-but-raycastable shell for hover → lon/lat.
    const rsGeom = new THREE.SphereGeometry(GLOBE_RADIUS * 1.02, 32, 24);
    const rsMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    this.raycastSphere = new THREE.Mesh(rsGeom, rsMat);
    this.globe.add(this.raycastSphere);

    this.focusTex = makeGlowTexture();
    const fsMat = new THREE.SpriteMaterial({
      map: this.focusTex,
      color: new THREE.Color(0.8, 0.95, 1.0),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.focusSprite = new THREE.Sprite(fsMat);
    this.focusSprite.scale.setScalar(0.7);
    this.globe.add(this.focusSprite);

    this.fieldMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uFocusDir: { value: new THREE.Vector3(0, 0, 1) },
        uFocusStr: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uReduced: { value: this.reduced ? 1 : 0 },
      },
      vertexShader: FIELD_VERT,
      fragmentShader: FIELD_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.updateCamera();
  }

  /** Build / replace the point field from a set of quakes. */
  setQuakes(quakes: Quake[]): void {
    const n = quakes.length;
    if (n === 0) return;

    let minTime = Infinity;
    let maxTime = -Infinity;
    for (const q of quakes) {
      if (q.time < minTime) minTime = q.time;
      if (q.time > maxTime) maxTime = q.time;
    }
    const timeSpan = Math.max(1, maxTime - minTime);

    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const mags = new Float32Array(n);
    const recs = new Float32Array(n);
    const phases = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      const q = quakes[i];
      const depthNorm = Math.min(1, Math.max(0, q.depthKm / 660));
      const dir = geoToUnit(q.lon, q.lat);
      const radius = GLOBE_RADIUS * (1.02 + depthNorm * 0.34);
      positions[i * 3] = dir.x * radius;
      positions[i * 3 + 1] = dir.y * radius;
      positions[i * 3 + 2] = dir.z * radius;

      const col = depthColor(depthNorm);
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;

      // Magnitude usually -1..7.5; compress to 0..1 with a soft floor.
      mags[i] = Math.min(1, Math.max(0, (q.mag + 1) / 8.5));
      recs[i] = Math.min(1, Math.max(0, (q.time - minTime) / timeSpan));
      phases[i] = (i * 0.61803398875) % 1;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    geom.setAttribute("aMag", new THREE.BufferAttribute(mags, 1));
    geom.setAttribute("aRecency", new THREE.BufferAttribute(recs, 1));
    geom.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));

    // Swap in the new field, disposing the old geometry.
    if (this.field) this.globe.remove(this.field);
    this.fieldGeom?.dispose();
    this.fieldGeom = geom;
    this.field = new THREE.Points(geom, this.fieldMat);
    this.field.frustumCulled = false;
    this.globe.add(this.field);
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

  /** Pointer input from the page. `isDown` distinguishes drag-to-orbit from
   *  hover-to-listen. Client coords are converted to NDC here. */
  handlePointer(clientX: number, clientY: number, isDown: boolean): void {
    this.lastInteraction = performance.now();
    const rect = this.renderer.domElement.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -(((clientY - rect.top) / rect.height) * 2 - 1);

    if (isDown && this.lastPointer) {
      const dx = nx - this.lastPointer.x;
      const dy = ny - this.lastPointer.y;
      this.az -= dx * 2.2;
      this.pol = Math.min(1.25, Math.max(-1.25, this.pol + dy * 2.2));
    } else if (!isDown) {
      this.raycastFocus(nx, ny);
    }
    this.lastPointer = { x: nx, y: ny };
  }

  /** Pointer left the surface or lifted — release drag + fade the focus halo. */
  endPointer(): void {
    this.lastPointer = null;
    this.focusTarget = 0;
    this.onFocus?.(null);
  }

  private raycastFocus(nx: number, ny: number): void {
    this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const hits = this.raycaster.intersectObject(this.raycastSphere, false);
    if (hits.length === 0) {
      this.focusTarget = 0;
      this.onFocus?.(null);
      return;
    }
    const local = this.globe.worldToLocal(hits[0].point.clone()).normalize();
    this.focusDir.copy(local);
    this.focusTarget = 1;
    const lat = (Math.asin(Math.min(1, Math.max(-1, local.y))) * 180) / Math.PI;
    const lon = (Math.atan2(local.x, local.z) * 180) / Math.PI;
    this.onFocus?.({ lon, lat });
  }

  private update(dt: number): void {
    this.clock += dt;

    // Idle → slow auto-orbit after ~5 s of no interaction (keeps it alive).
    const idle = performance.now() - this.lastInteraction > 5000;
    if (idle) {
      this.az += dt * (this.reduced ? 0.02 : 0.045);
    }
    // A perpetual whisper of rotation even mid-interaction, very slow.
    this.globe.rotation.y += dt * (this.reduced ? 0.006 : 0.012);
    this.updateCamera();

    // Ease focus strength + place the halo.
    this.focusStr += (this.focusTarget - this.focusStr) * Math.min(1, dt * 6);
    this.fieldMat.uniforms.uTime.value = this.clock;
    this.fieldMat.uniforms.uFocusStr.value = this.focusStr;
    (this.fieldMat.uniforms.uFocusDir.value as THREE.Vector3).copy(this.focusDir);

    const sprMat = this.focusSprite.material as THREE.SpriteMaterial;
    sprMat.opacity = this.focusStr * 0.75;
    this.focusSprite.position
      .copy(this.focusDir)
      .multiplyScalar(GLOBE_RADIUS * 1.03);
    const pulse = 0.6 + 0.12 * Math.sin(this.clock * 1.6);
    this.focusSprite.scale.setScalar(pulse * (0.6 + this.focusStr * 0.4));
  }

  private updateCamera(): void {
    const cp = Math.cos(this.pol);
    this.camera.position.set(
      CAM_RADIUS * cp * Math.sin(this.az),
      CAM_RADIUS * Math.sin(this.pol),
      CAM_RADIUS * cp * Math.cos(this.az),
    );
    this.camera.lookAt(0, 0, 0);
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
    this.fieldGeom?.dispose();
    this.fieldGeom = null;
    this.field = null;
    this.fieldMat.dispose();
    this.focusTex.dispose();
    (this.focusSprite.material as THREE.SpriteMaterial).dispose();
    this.scene.traverse((obj) => {
      const mesh = obj as Partial<THREE.Mesh> &
        Partial<THREE.Points> &
        Partial<THREE.LineSegments>;
      if (mesh.geometry && typeof mesh.geometry.dispose === "function") {
        mesh.geometry.dispose();
      }
      const mat = (obj as { material?: THREE.Material | THREE.Material[] })
        .material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else if (mat) mat.dispose();
    });
    this.renderer.dispose();
    const el = this.renderer.domElement;
    if (el.parentNode) el.parentNode.removeChild(el);
  }
}

// ── Builders ────────────────────────────────────────────────────────────────

/** A dark point-cloud Earth: a faint sphere of points, a wireframe shell, and a
 *  near-black core so back-side field points don't bleed through. */
function makeGlobe(): THREE.Group {
  const group = new THREE.Group();

  const count = 7000;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
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
    color: 0x334066,
    size: 0.016,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });
  group.add(new THREE.Points(pGeom, pMat));

  const wGeom = new THREE.SphereGeometry(GLOBE_RADIUS * 0.999, 36, 24);
  const wMat = new THREE.MeshBasicMaterial({
    color: 0x18213e,
    wireframe: true,
    transparent: true,
    opacity: 0.32,
  });
  group.add(new THREE.Mesh(wGeom, wMat));

  const cGeom = new THREE.SphereGeometry(GLOBE_RADIUS * 0.95, 32, 24);
  const cMat = new THREE.MeshBasicMaterial({ color: 0x03040b });
  group.add(new THREE.Mesh(cGeom, cMat));

  return group;
}

/** A faint static star/void backdrop. */
function makeStarfield(): THREE.Points {
  const count = 1300;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const v = new THREE.Vector3(
      Math.random() * 2 - 1,
      Math.random() * 2 - 1,
      Math.random() * 2 - 1,
    )
      .normalize()
      .multiplyScalar(22 + Math.random() * 28);
    positions[i * 3] = v.x;
    positions[i * 3 + 1] = v.y;
    positions[i * 3 + 2] = v.z;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0x4a5680,
    size: 0.07,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });
  return new THREE.Points(geom, mat);
}

/** A soft radial-gradient sprite texture for the focus halo. */
function makeGlowTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
    g.addColorStop(0, "rgba(255,255,255,0.85)");
    g.addColorStop(0.35, "rgba(150,200,255,0.4)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}
