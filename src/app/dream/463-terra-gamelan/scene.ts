// scene.ts — three.js luminous Earth globe, starfield, and quake embers.
// Procedural (no external textures). Disposes everything on teardown.

import * as THREE from "three";
import type { Quake } from "./seismic";

const GLOBE_RADIUS = 1.6;
const MAX_QUAKES = 500; // hard cap; oldest embers fade + are reclaimed
const QUAKE_TTL_MS = 24 * 60 * 60 * 1000; // fade out after ~24h

// lat/lon (degrees) -> unit-sphere xyz, scaled to radius.
function latLonToVec3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return new THREE.Vector3(x, y, z);
}

// Per-quake render record kept parallel to a Points buffer.
interface Ember {
  id: string;
  time: number; // ms epoch of the quake
  mag: number;
  base: THREE.Vector3; // position on globe
  flash: number; // 0..1 current pulse energy (1 right after ring)
  cr: number; // base color r/g/b (depth-mapped)
  cg: number;
  cb: number;
}

export interface TerraScene {
  /** Add a quake ember; `ring=true` makes it flash bright. */
  addQuake: (q: Quake, ring: boolean) => void;
  /** Pointer drag to spin the globe; dx/dy in pixels. */
  drag: (dx: number, dy: number) => void;
  /** Current number of live embers. */
  count: () => number;
  resize: () => void;
  dispose: () => void;
}

export function createTerraScene(canvas: HTMLCanvasElement): TerraScene | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
  } catch {
    return null;
  }
  if (!renderer.getContext()) return null;

  const parent = canvas.parentElement;
  const widthOf = () => parent?.clientWidth || canvas.clientWidth || 640;
  const heightOf = () => parent?.clientHeight || canvas.clientHeight || 480;

  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(widthOf(), heightOf(), false);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    42,
    widthOf() / heightOf(),
    0.1,
    100,
  );
  camera.position.set(0, 0, 5.2);

  // ── world group (we rotate this for auto-spin + drag) ────────────────────
  const world = new THREE.Group();
  scene.add(world);

  // ── starfield ────────────────────────────────────────────────────────────
  const STAR_COUNT = 1400;
  const starPos = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i++) {
    const r = 30 + Math.random() * 30;
    const u = Math.random() * 2 - 1;
    const t = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    starPos[i * 3] = r * s * Math.cos(t);
    starPos[i * 3 + 1] = r * u;
    starPos[i * 3 + 2] = r * s * Math.sin(t);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0x9bb8ff,
    size: 0.13,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  // ── globe: dotted point-sphere + faint wireframe shell ───────────────────
  const DOT_COUNT = 2600;
  const dotPos = new Float32Array(DOT_COUNT * 3);
  for (let i = 0; i < DOT_COUNT; i++) {
    // fibonacci sphere for even coverage
    const k = i + 0.5;
    const phi = Math.acos(1 - (2 * k) / DOT_COUNT);
    const theta = Math.PI * (1 + Math.sqrt(5)) * k;
    const x = Math.sin(phi) * Math.cos(theta);
    const y = Math.sin(phi) * Math.sin(theta);
    const z = Math.cos(phi);
    dotPos[i * 3] = x * GLOBE_RADIUS;
    dotPos[i * 3 + 1] = y * GLOBE_RADIUS;
    dotPos[i * 3 + 2] = z * GLOBE_RADIUS;
  }
  const dotGeo = new THREE.BufferGeometry();
  dotGeo.setAttribute("position", new THREE.BufferAttribute(dotPos, 3));
  const dotMat = new THREE.PointsMaterial({
    color: 0x2f6fb0,
    size: 0.035,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const globeDots = new THREE.Points(dotGeo, dotMat);
  world.add(globeDots);

  const wireGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 0.995, 28, 20);
  const wireMat = new THREE.MeshBasicMaterial({
    color: 0x123a5e,
    wireframe: true,
    transparent: true,
    opacity: 0.28,
  });
  const wire = new THREE.Mesh(wireGeo, wireMat);
  world.add(wire);

  // solid inner core to occlude back-side embers (so the globe reads as solid)
  const coreGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 0.985, 32, 24);
  const coreMat = new THREE.MeshBasicMaterial({ color: 0x040a14 });
  const core = new THREE.Mesh(coreGeo, coreMat);
  world.add(core);

  // soft atmosphere halo (back-side, additive)
  const haloGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.18, 32, 24);
  const haloMat = new THREE.MeshBasicMaterial({
    color: 0x1e63a8,
    transparent: true,
    opacity: 0.12,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const halo = new THREE.Mesh(haloGeo, haloMat);
  world.add(halo);

  // ── quake embers (single Points buffer, additive glow) ───────────────────
  const embers: Ember[] = [];
  const emPos = new Float32Array(MAX_QUAKES * 3);
  const emColor = new Float32Array(MAX_QUAKES * 3);
  const emSize = new Float32Array(MAX_QUAKES);
  const emberGeo = new THREE.BufferGeometry();
  emberGeo.setAttribute("position", new THREE.BufferAttribute(emPos, 3));
  emberGeo.setAttribute("color", new THREE.BufferAttribute(emColor, 3));
  emberGeo.setAttribute("aSize", new THREE.BufferAttribute(emSize, 1));

  // Custom points material: per-point size + soft round sprite, additive.
  const emberMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true, // makes three inject the `color` attribute declaration
    uniforms: { uScale: { value: heightOf() } },
    vertexShader: `
      attribute float aSize;
      varying vec3 vColor;
      uniform float uScale;
      void main() {
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uScale / max(-mv.z, 0.001);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        vec2 d = gl_PointCoord - vec2(0.5);
        float r = length(d);
        if (r > 0.5) discard;
        float a = smoothstep(0.5, 0.0, r);
        gl_FragColor = vec4(vColor, a);
      }
    `,
  });
  const emberPoints = new THREE.Points(emberGeo, emberMat);
  emberPoints.frustumCulled = false;
  world.add(emberPoints);

  // color by depth: shallow = warm (amber/rose), deep = cool (violet/blue)
  function depthColor(depthKm: number, out: THREE.Color) {
    const t = Math.min(1, Math.max(0, depthKm / 700));
    const shallow = new THREE.Color(0xffb058); // warm amber
    const deep = new THREE.Color(0x6a7dff); // cool violet-blue
    out.copy(shallow).lerp(deep, t);
  }

  const tmpColor = new THREE.Color();

  // Write ember `e` into Points buffer slot `i`, scaled by current intensity.
  function writeEmber(i: number, e: Ember, intensity: number) {
    emPos[i * 3] = e.base.x;
    emPos[i * 3 + 1] = e.base.y;
    emPos[i * 3 + 2] = e.base.z;
    // size from magnitude (clamped) plus flash pulse
    const magN = Math.min(1, Math.max(0, (e.mag + 1) / 8));
    const baseSize = 0.006 + magN * 0.05;
    emSize[i] = baseSize * (1 + e.flash * 2.4);
    // brightness scales with flash + a floor so embers stay visible
    const b = 0.35 + intensity * 0.65;
    emColor[i * 3] = e.cr * b;
    emColor[i * 3 + 1] = e.cg * b;
    emColor[i * 3 + 2] = e.cb * b;
  }

  const seen = new Set<string>();

  function addQuake(q: Quake, ring: boolean) {
    if (seen.has(q.id)) return;
    seen.add(q.id);
    const base = latLonToVec3(q.lat, q.lon, GLOBE_RADIUS * 1.012);
    depthColor(q.depthKm, tmpColor);
    const e: Ember = {
      id: q.id,
      time: q.time,
      mag: q.mag,
      base,
      flash: ring ? 1 : 0.12,
      cr: tmpColor.r,
      cg: tmpColor.g,
      cb: tmpColor.b,
    };
    if (embers.length >= MAX_QUAKES) {
      // drop the oldest
      const old = embers.shift();
      if (old) seen.delete(old.id);
    }
    embers.push(e);
  }

  // ── interaction state ─────────────────────────────────────────────────────
  let spinY = 0;
  let spinX = 0.12;
  let dragVelY = 0;

  function drag(dx: number, dy: number) {
    spinY += dx * 0.005;
    spinX = Math.max(-1.2, Math.min(1.2, spinX + dy * 0.005));
    dragVelY = dx * 0.005;
  }

  function count() {
    return embers.length;
  }

  // ── render loop ────────────────────────────────────────────────────────────
  let raf = 0;
  let last = performance.now();
  let disposed = false;

  function frame(t: number) {
    if (disposed) return;
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;

    // auto-rotate + drag inertia
    dragVelY *= 0.94;
    spinY += dt * 0.06 + dragVelY;
    world.rotation.y = spinY;
    world.rotation.x = spinX;
    stars.rotation.y += dt * 0.004;

    // update embers: decay flash, age out, compact array in place
    const now = Date.now();
    let write = 0;
    for (let r = 0; r < embers.length; r++) {
      const e = embers[r];
      if (now - e.time > QUAKE_TTL_MS) {
        seen.delete(e.id); // aged out; drop
        continue;
      }
      // decay flash toward 0 (exponential settle over ~1s)
      e.flash *= Math.pow(0.18, dt);
      const intensity = 0.15 + e.flash * 0.85;
      if (write !== r) embers[write] = e; // compact
      writeEmber(write, e, intensity);
      write++;
    }
    embers.length = write;

    emberGeo.setDrawRange(0, embers.length);
    (emberGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (emberGeo.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
    (emberGeo.getAttribute("aSize") as THREE.BufferAttribute).needsUpdate = true;

    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  function resize() {
    const w = widthOf();
    const h = heightOf();
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    emberMat.uniforms.uScale.value = h;
  }

  function dispose() {
    disposed = true;
    cancelAnimationFrame(raf);
    starGeo.dispose();
    starMat.dispose();
    dotGeo.dispose();
    dotMat.dispose();
    wireGeo.dispose();
    wireMat.dispose();
    coreGeo.dispose();
    coreMat.dispose();
    haloGeo.dispose();
    haloMat.dispose();
    emberGeo.dispose();
    emberMat.dispose();
    renderer.dispose();
  }

  return { addQuake, drag, count, resize, dispose };
}
