// ─────────────────────────────────────────────────────────────────────────────
// aurora.ts — the three.js particle aurora (OUTPUT).
//
// A large GPU particle field (BufferGeometry + additive PointsMaterial) whose
// points are advected through a data-driven curl/flow vector field, forming
// vertical "auroral curtain" ribbons that ripple, fold and shimmer. The field
// parameters come from the live solar-wind drivers:
//
//   energy   (speed)      → advection velocity / vertical drift speed.
//   coupling (Bz south)   → curtains ERUPT: brighten, fold harder, redden.
//   thickness(density)    → how many particles are "active" / curtain thickness.
//   turbulence(|B|)       → curl-noise amplitude (shimmer / chaos).
//   intensity(Kp)         → color shift quiet green → storm magenta/red + glow.
//
// A vast luminous sheet on a dark space background — awe, not a center bloom.
// Camera is orbitable; user can lightly perturb the field, but DATA drives it.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Params } from "./data";

const COUNT = 42000; // curtain particles
const FIELD_W = 240; // horizontal extent of the curtain sheet
const FIELD_H = 130; // vertical extent
const CURTAINS = 7; // number of folded ribbons

interface AuroraScene {
  update(p: Params, dt: number): void;
  perturb(x: number, y: number): void;
  resize(w: number, h: number): void;
  dispose(): void;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// Cheap smooth pseudo-noise from summed sines — enough for a curl-ish flow.
function flow(x: number, z: number, tm: number): number {
  return (
    Math.sin(x * 0.06 + tm * 0.6) +
    0.6 * Math.sin(z * 0.09 - tm * 0.4) +
    0.4 * Math.sin((x + z) * 0.05 + tm * 0.9)
  );
}

export function createAuroraScene(canvas: HTMLCanvasElement): AuroraScene {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
  });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x02040a, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x02040a, 0.0016);

  const camera = new THREE.PerspectiveCamera(
    58,
    canvas.clientWidth / Math.max(1, canvas.clientHeight),
    0.1,
    2000,
  );
  camera.position.set(0, 20, 210);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 90;
  controls.maxDistance = 520;
  controls.target.set(0, 10, 0);
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.25;

  // ── Particle buffers ────────────────────────────────────────────────────────
  const positions = new Float32Array(COUNT * 3);
  const colors = new Float32Array(COUNT * 3);
  // Per-particle home data: which curtain, base x, phase, height fraction.
  const home = new Float32Array(COUNT * 4);

  for (let i = 0; i < COUNT; i++) {
    const curtain = i % CURTAINS;
    // Spread curtains across the sheet with a gentle serpentine base offset.
    const cx = (curtain / (CURTAINS - 1) - 0.5) * FIELD_W;
    const along = (Math.random() - 0.5) * (FIELD_W / CURTAINS) * 1.6;
    const heightFrac = Math.random();
    const phase = Math.random() * Math.PI * 2;

    home[i * 4 + 0] = curtain;
    home[i * 4 + 1] = cx + along;
    home[i * 4 + 2] = phase;
    home[i * 4 + 3] = heightFrac;

    positions[i * 3 + 0] = cx + along;
    positions[i * 3 + 1] = (heightFrac - 0.4) * FIELD_H;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 30;

    colors[i * 3 + 0] = 0.1;
    colors[i * 3 + 1] = 0.9;
    colors[i * 3 + 2] = 0.5;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const sprite = makeGlowTexture();
  const mat = new THREE.PointsMaterial({
    size: 2.6,
    map: sprite,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
    opacity: 0.9,
  });

  const points = new THREE.Points(geo, mat);
  scene.add(points);

  // A faint star backdrop for depth.
  const stars = makeStars();
  scene.add(stars);

  let tm = 0;
  let perturbX = 0;
  let perturbY = 0;
  let perturbDecay = 0;

  // Smoothed live params so changes ease in.
  const cur: Params = {
    energy: 0.3,
    coupling: 0,
    thickness: 0.3,
    turbulence: 0.2,
    intensity: 0.25,
  };

  function update(p: Params, dt: number) {
    // Ease toward the incoming data snapshot.
    const k = Math.min(1, dt * 0.5);
    cur.energy = lerp(cur.energy, p.energy, k);
    cur.coupling = lerp(cur.coupling, p.coupling, k);
    cur.thickness = lerp(cur.thickness, p.thickness, k);
    cur.turbulence = lerp(cur.turbulence, p.turbulence, k);
    cur.intensity = lerp(cur.intensity, p.intensity, k);

    tm += dt * (0.4 + 1.6 * cur.energy);

    const pos = geo.attributes.position.array as Float32Array;
    const col = geo.attributes.color.array as Float32Array;

    const turbAmp = 6 + 34 * cur.turbulence + 24 * cur.coupling;
    const fold = 12 + 46 * cur.coupling; // curtains fold harder in a storm
    // Active fraction from density: at low thickness, upper curtain fades out.
    const activeThresh = 1 - (0.45 + 0.55 * cur.thickness);

    perturbDecay *= Math.pow(0.02, dt);

    for (let i = 0; i < COUNT; i++) {
      const baseX = home[i * 4 + 1];
      const phase = home[i * 4 + 2];
      const hf = home[i * 4 + 3];

      // Vertical column: particles drift upward and recycle.
      const y = (hf + tm * 0.03 * (0.4 + cur.energy)) % 1;
      const yy = (y - 0.4) * FIELD_H;

      // Horizontal fold: a serpentine flow that folds with coupling.
      const f = flow(baseX, yy, tm + phase);
      const x =
        baseX +
        Math.sin(yy * 0.05 + tm * 0.7 + phase) * fold +
        f * turbAmp * 0.5;

      // Depth ripple.
      const z =
        Math.cos(baseX * 0.04 + yy * 0.03 + tm * 0.5) * (14 + 22 * cur.turbulence) +
        f * turbAmp * 0.3;

      // Light user perturbation pushes the sheet.
      const px = perturbX * 40 * perturbDecay * Math.sin(yy * 0.02 + phase);
      const py = perturbY * 30 * perturbDecay;

      pos[i * 3 + 0] = x + px;
      pos[i * 3 + 1] = yy + py;
      pos[i * 3 + 2] = z;

      // ── Color: quiet green/teal → storm magenta/red as coupling+Kp rise ──
      const storm = Math.min(1, cur.coupling * 0.7 + cur.intensity * 0.6);
      // brightness fades near the top of each column + inactive when thin
      const vfade = Math.min(1, (1 - Math.abs(hf - 0.5) * 1.4));
      const active = hf > activeThresh ? 1 : 0.15;
      const bright = (0.4 + 0.6 * cur.intensity) * vfade * active;

      // green→teal at rest, magenta/red in storm
      const r = lerp(0.08, 1.0, storm) * bright;
      const g = lerp(0.95, 0.18, storm) * bright;
      const b = lerp(0.55, 0.72, storm) * bright;
      col[i * 3 + 0] = r;
      col[i * 3 + 1] = g;
      col[i * 3 + 2] = b;
    }

    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;

    // Point size & glow ride the storm.
    mat.size = 2.2 + 2.4 * cur.coupling + 1.2 * cur.intensity;
    mat.opacity = 0.75 + 0.22 * cur.intensity;

    // Slow storm-tinted background.
    const bg = new THREE.Color().setRGB(
      0.008 + 0.04 * cur.coupling,
      0.016,
      0.04 + 0.02 * cur.intensity,
    );
    renderer.setClearColor(bg, 1);
    (scene.fog as THREE.FogExp2).color.copy(bg);

    controls.autoRotateSpeed = 0.2 + 0.5 * cur.energy;
    controls.update();
    renderer.render(scene, camera);
  }

  function perturb(x: number, y: number) {
    perturbX = x;
    perturbY = y;
    perturbDecay = 1;
  }

  function resize(w: number, h: number) {
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }

  function dispose() {
    controls.dispose();
    geo.dispose();
    mat.dispose();
    sprite.dispose();
    (stars.geometry as THREE.BufferGeometry).dispose();
    (stars.material as THREE.Material).dispose();
    renderer.dispose();
  }

  resize(canvas.clientWidth, canvas.clientHeight);

  return { update, perturb, resize, dispose };
}

/** Soft radial glow sprite for additive particles. */
function makeGlowTexture(): THREE.Texture {
  const size = 64;
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const g = cv.getContext("2d")!;
  const grad = g.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.7)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.needsUpdate = true;
  return tex;
}

/** A faint starfield for depth. */
function makeStars(): THREE.Points {
  const n = 1200;
  const p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = 700 + Math.random() * 600;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    p[i * 3 + 0] = r * Math.sin(ph) * Math.cos(th);
    p[i * 3 + 1] = r * Math.cos(ph);
    p[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(p, 3));
  const m = new THREE.PointsMaterial({
    size: 1.4,
    color: 0x8899bb,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  return new THREE.Points(g, m);
}
