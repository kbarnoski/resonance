// 1280-earth-bell — scene.ts
//
// The planet as a struck bell rendered as a REAL deforming globe. An icosphere's
// radius is modulated per-vertex by the sum of the currently-ringing normal
// modes: each mode's spherical-harmonic shape (precomputed once per vertex)
// times its decaying envelope times a slow visible oscillation at that mode's
// scaled frequency. Vertex normals are recomputed each frame so the ridges of
// the football / rosette / sectoral crowns genuinely rise and catch raking
// light. Palette is basalt / ocean-abyss: a dark polished planet, cold cyan-
// steel key light skimming across the mode ridges, no neon glow. Orbit-drag
// rotates the globe; a tap raycasts to a lat/long to strike it. Everything is
// disposed on teardown.

import * as THREE from "three";
import {
  MODES,
  MODE_COUNT,
  MODE_MAX_ABS,
  modeVisHz,
  realSH,
  totalEnergy,
  type ModeModel,
} from "./modes";

const R = 1.6; // base globe radius
const DISP = 0.13; // peak radial displacement as a fraction of R

export interface SceneHandle {
  update(model: ModeModel, elapsed: number, autoSpin: boolean): void;
  orbit(dx: number, dy: number): void;
  /** Raycast a screen point to a unit direction in the globe's LOCAL frame. */
  pickLocalDir(clientX: number, clientY: number): [number, number, number] | null;
  resize(): void;
  dispose(): void;
}

/** A cold "abyssal" environment: dark ocean floor with two raking cool windows
 *  and one faint warm ember, so the dark stone has cold light to reflect. */
function makeEnvTexture(): THREE.DataTexture {
  const w = 256;
  const h = 128;
  const data = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);
    const base = 0.012 + 0.05 * (1 - v);
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1);
      const coldA = Math.exp(-((u - 0.24) ** 2) / 0.012 - ((v - 0.36) ** 2) / 0.03);
      const coldB = Math.exp(-((u - 0.7) ** 2) / 0.02 - ((v - 0.28) ** 2) / 0.04);
      const ember = Math.exp(-((u - 0.52) ** 2) / 0.006 - ((v - 0.6) ** 2) / 0.02);
      const r = base * 0.7 + coldA * 0.4 + coldB * 0.3 + ember * 0.7;
      const g = base * 1.0 + coldA * 1.2 + coldB * 1.0 + ember * 0.4;
      const b = base * 1.35 + coldA * 1.8 + coldB * 1.5 + ember * 0.2;
      const o = (y * w + x) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 1;
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.needsUpdate = true;
  return tex;
}

export function createScene(mount: HTMLElement, reduced: boolean): SceneHandle | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    if (!renderer.getContext()) return null;
  } catch {
    return null;
  }

  let width = Math.max(1, mount.clientWidth);
  let height = Math.max(1, mount.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height);
  renderer.setClearColor(0x04070a, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  mount.appendChild(renderer.domElement);
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04070a);
  scene.fog = new THREE.FogExp2(0x04070a, 0.05);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = makeEnvTexture();
  const envRT = pmrem.fromEquirectangular(envTex);
  scene.environment = envRT.texture;
  envTex.dispose();
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 100);
  camera.position.set(0, 0.5, 6.4);
  camera.lookAt(0, 0, 0);

  // Icosphere: enough subdivision to resolve l≈2–6 mode shapes smoothly.
  const detail = reduced ? 4 : 5; // 5 → 10242 verts / 20480 faces
  const geo = new THREE.IcosahedronGeometry(R, detail);
  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  const arr = posAttr.array as Float32Array;
  const vertCount = arr.length / 3;

  // Precompute base unit directions per vertex, and each mode's shape value
  // there (normalised to [-1,1]) so the per-frame loop is pure multiply-add.
  const dirs = new Float32Array(arr.length);
  const shapes: Float32Array[] = MODES.map(() => new Float32Array(vertCount));
  for (let i = 0; i < vertCount; i++) {
    const o = i * 3;
    const x = arr[o];
    const y = arr[o + 1];
    const z = arr[o + 2];
    const inv = 1 / Math.sqrt(x * x + y * y + z * z);
    const nx = x * inv;
    const ny = y * inv;
    const nz = z * inv;
    dirs[o] = nx;
    dirs[o + 1] = ny;
    dirs[o + 2] = nz;
    const theta = Math.acos(Math.max(-1, Math.min(1, ny)));
    const phi = Math.atan2(nz, nx);
    for (let mi = 0; mi < MODE_COUNT; mi++) {
      shapes[mi][i] = realSH(MODES[mi].l, MODES[mi].m, theta, phi) / MODE_MAX_ABS[mi];
    }
  }

  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x162a2f), // dark basalt / abyssal teal-stone
    metalness: 0.62,
    roughness: 0.42,
    envMapIntensity: 1.1,
    emissive: new THREE.Color(0x08222b),
    emissiveIntensity: 0.0,
    flatShading: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  const globe = new THREE.Group();
  globe.add(mesh);
  globe.rotation.set(0.35, 0.6, 0);
  scene.add(globe);

  // Cold raking key + dim steel fill + a faint warm rim so ridges read.
  const key = new THREE.DirectionalLight(0xbfe6ff, 1.7);
  key.position.set(4.5, 2.2, 3.5);
  scene.add(key);
  const fill = new THREE.PointLight(0x6fb6d8, 14, 40, 2);
  fill.position.set(-5, -1.5, 4);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffb890, 0.35);
  rim.position.set(-2, 1, -4);
  scene.add(rim);
  const amb = new THREE.AmbientLight(0x0c1820, 0.5);
  scene.add(amb);

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const tmpVec = new THREE.Vector3();

  const oscFactor = new Float32Array(MODE_COUNT);

  function displace(model: ModeModel) {
    // Per-mode oscillation factor once per frame (env × slow visible sinusoid).
    let anyActive = false;
    for (let mi = 0; mi < MODE_COUNT; mi++) {
      const env = model.env[mi];
      if (env <= 0) {
        oscFactor[mi] = 0;
        continue;
      }
      anyActive = true;
      const w = 2 * Math.PI * modeVisHz(MODES[mi]);
      oscFactor[mi] = env * Math.sin(w * model.t);
    }
    for (let i = 0; i < vertCount; i++) {
      const o = i * 3;
      let sum = 0;
      if (anyActive) {
        for (let mi = 0; mi < MODE_COUNT; mi++) {
          const f = oscFactor[mi];
          if (f !== 0) sum += f * shapes[mi][i];
        }
      }
      if (sum > 2.2) sum = 2.2;
      else if (sum < -2.2) sum = -2.2;
      const r = R * (1 + DISP * sum);
      arr[o] = dirs[o] * r;
      arr[o + 1] = dirs[o + 1] * r;
      arr[o + 2] = dirs[o + 2] * r;
    }
    posAttr.needsUpdate = true;
    geo.computeVertexNormals();
  }

  const spin = reduced ? 0.02 : 0.05;

  return {
    update(model: ModeModel, elapsed: number, autoSpin: boolean) {
      displace(model);

      if (autoSpin) globe.rotation.y += spin * 0.016;
      // Gentle idle breathing of the camera; never a flash, just slow drift.
      const breathe = reduced ? 0.04 : 0.09;
      camera.position.y = 0.5 + Math.sin(elapsed * breathe) * 0.12;
      camera.lookAt(0, 0, 0);

      // The stone catches a faint inner light only while it is ringing.
      const e = totalEnergy(model);
      mat.emissiveIntensity = 0.12 + 0.75 * e;
      key.intensity = 1.5 + 0.7 * e;

      renderer.render(scene, camera);
    },
    orbit(dx: number, dy: number) {
      globe.rotation.y += dx * 0.006;
      globe.rotation.x += dy * 0.006;
      globe.rotation.x = Math.max(-1.3, Math.min(1.3, globe.rotation.x));
    },
    pickLocalDir(clientX: number, clientY: number) {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObject(mesh, false);
      if (hits.length === 0) return null;
      // World hit → globe-local → unit direction on the base sphere.
      tmpVec.copy(hits[0].point);
      globe.worldToLocal(tmpVec);
      tmpVec.normalize();
      return [tmpVec.x, tmpVec.y, tmpVec.z];
    },
    resize() {
      width = Math.max(1, mount.clientWidth);
      height = Math.max(1, mount.clientHeight);
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      envRT.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    },
  };
}
