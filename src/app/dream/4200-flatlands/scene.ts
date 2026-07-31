// 4200-flatlands — scene.ts
//
// Derealization made literal geometry. The world is an InstancedMesh field of
// thin, tessellated FLAT PLANES — cardboard cutouts, Abbott's Flatland — held
// in a loose receding formation inside a desaturated-steel fog. As the arc
// descends they DRIFT APART (gaps of void opening), turn edge-on and thin
// toward transparency (they lose their "realness"), the fog swallows the far
// field, and the whole scene blooms toward a calm near-WHITE void at the still
// point — then re-coheres on return.
//
// Not a point cloud, not a fragment-shader field: real scene-graph geometry
// (InstancedMesh planes) + an UnrealBloom postprocess. Palette is the DPDR
// steel/silver → white void. Deterministic: the field is seeded by an inline
// mulberry32 so it is identical every run.

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import type { Frame } from "./arc";

export interface FlatSceneHandle {
  update(frame: Frame, exposureGate: number, elapsed: number, reduced: boolean): void;
  resize(): void;
  dispose(): void;
}

const COUNT = 460;
const STEEL_DARK = 0x151a20; // desaturated steel void (rest background)
const VOID_WHITE = 0xeef1f4; // the calm near-white the still point blooms to
const DEPTH = 34; // how far the formation recedes in Z

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (c.getContext("webgl2") || c.getContext("webgl") || c.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

// inline deterministic PRNG — no Math.random / Date.now anywhere.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createFlatScene(mount: HTMLElement, seed: number): FlatSceneHandle | null {
  if (!hasWebGL()) return null;

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
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  const canvas = renderer.domElement;
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  mount.appendChild(canvas);

  const scene = new THREE.Scene();
  const bgColor = new THREE.Color(STEEL_DARK);
  scene.background = bgColor;
  const fog = new THREE.FogExp2(STEEL_DARK, 0.028);
  scene.fog = fog;

  const camera = new THREE.PerspectiveCamera(56, width / height, 0.1, 220);
  camera.position.set(0, 0, 8);
  camera.lookAt(0, 0, -DEPTH * 0.3);

  // ── the plane field ───────────────────────────────────────────────────────
  // A thin, lightly tessellated plane; DoubleSide so an edge-on plane still
  // catches a sliver of light before it vanishes into the void.
  const geo = new THREE.PlaneGeometry(1, 1, 3, 3);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    fog: true,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, COUNT);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;

  const rnd = mulberry32(seed);

  // per-instance base state
  const bx = new Float32Array(COUNT);
  const by = new Float32Array(COUNT);
  const bz = new Float32Array(COUNT);
  const yaw0 = new Float32Array(COUNT);
  const tilt0 = new Float32Array(COUNT);
  const roll0 = new Float32Array(COUNT);
  const edgeTurn = new Float32Array(COUNT); // extra yaw at full spread → edge-on
  const sclX = new Float32Array(COUNT);
  const sclY = new Float32Array(COUNT);
  const phase = new Float32Array(COUNT); // shimmer / drift phase
  const baseCol = new Float32Array(COUNT * 3); // steel palette, linear-ish rgb

  for (let i = 0; i < COUNT; i++) {
    // loose receding slab formation: wide in XY, receding in Z with jitter
    const depthT = rnd();
    const z = -depthT * DEPTH - 1.5;
    const spreadXY = 3.4 + depthT * 7.5; // far planes sit wider
    bx[i] = (rnd() * 2 - 1) * spreadXY;
    by[i] = (rnd() * 2 - 1) * (2.2 + depthT * 4.0);
    bz[i] = z;

    yaw0[i] = (rnd() * 2 - 1) * 0.28;
    tilt0[i] = (rnd() * 2 - 1) * 0.22;
    roll0[i] = (rnd() * 2 - 1) * 0.5;
    edgeTurn[i] = (rnd() < 0.5 ? -1 : 1) * (0.9 + rnd() * 0.8);

    const s = 0.9 + rnd() * 1.9;
    sclX[i] = s * (0.7 + rnd() * 0.7);
    sclY[i] = s * (1.0 + rnd() * 0.9);
    phase[i] = rnd() * Math.PI * 2;

    // desaturated steel/silver: lightness varies, a faint cool blue tint.
    const l = 0.34 + rnd() * 0.4;
    baseCol[i * 3] = l * 0.94;
    baseCol[i * 3 + 1] = l * 0.98;
    baseCol[i * 3 + 2] = l * 1.06;
  }

  // reusable temporaries
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  const white = new THREE.Color(VOID_WHITE);
  const steel = new THREE.Color(STEEL_DARK);

  // seed instance transforms once so frame 1 is already alive
  for (let i = 0; i < COUNT; i++) {
    euler.set(tilt0[i], yaw0[i], roll0[i]);
    quat.setFromEuler(euler);
    pos.set(bx[i], by[i], bz[i]);
    scl.set(sclX[i], sclY[i], 1);
    m4.compose(pos, quat, scl);
    mesh.setMatrixAt(i, m4);
    col.setRGB(baseCol[i * 3], baseCol[i * 3 + 1], baseCol[i * 3 + 2]);
    mesh.setColorAt(i, col);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);

  // ── postprocess: bloom toward the white void ──
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    0.3, // strength (driven each frame)
    0.75, // radius
    0.55, // threshold — only the brighter planes / bg bloom
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  return {
    update(frame, exposureGate, elapsed, reduced) {
      const { spread, fade, fog: fogK, bloom: bloomK, dolly, white: whiteK, sat, motion } = frame;

      // background + fog lerp steel → white void
      col.copy(steel).lerp(white, whiteK);
      bgColor.copy(col);
      fog.color.copy(col);
      fog.density = 0.024 + 0.12 * fogK;

      // exposure: base × safeFlicker gate (steady 1.0 when flicker disabled)
      renderer.toneMappingExposure = frame.exposure * exposureGate;

      // camera: third-person pull-back (detachment) + a slow, motion-scaled orbit
      const orbitRate = reduced ? 0.004 : 0.02;
      const camZ = 8 + dolly * 20;
      const camY = dolly * 3.4;
      const orbit = Math.sin(elapsed * orbitRate * motion) * 0.25;
      camera.position.set(Math.sin(orbit) * camZ * 0.35, camY, Math.cos(orbit) * camZ);
      camera.lookAt(0, camY * 0.3, -DEPTH * (0.25 + spread * 0.2));

      const spreadK = 1 + spread * 1.5;
      const zPush = spread * 20;
      const driftAmp = 0.16 * motion;
      const shimmerAmp = (1 - whiteK) * 0.12; // faint unreal shimmer, calms at void
      const op = 0.85 * (1 - 0.9 * fade); // slabs thin toward transparency
      mat.opacity = Math.max(0.05, op);

      for (let i = 0; i < COUNT; i++) {
        const ph = phase[i];
        const drift = Math.sin(elapsed * 0.18 + ph) * driftAmp;

        pos.set(bx[i] * spreadK, by[i] * spreadK, bz[i] - zPush);

        euler.set(
          tilt0[i] + drift * 0.5,
          yaw0[i] + edgeTurn[i] * spread + drift,
          roll0[i],
        );
        quat.setFromEuler(euler);

        const sh = 1 - 0.18 * fade; // shrink a touch as edges recede
        scl.set(sclX[i] * sh, sclY[i] * sh, 1);
        m4.compose(pos, quat, scl);
        mesh.setMatrixAt(i, m4);

        // colour: steel base → desaturate/whiten toward the void; faint shimmer
        const shimmer = 1 + Math.sin(elapsed * 0.7 + ph * 1.7) * shimmerAmp;
        const r = baseCol[i * 3] * shimmer;
        const g = baseCol[i * 3 + 1] * shimmer;
        const b = baseCol[i * 3 + 2] * shimmer;
        // desaturate toward luminance as sat falls, then lift toward white void
        const lum = 0.3 * r + 0.59 * g + 0.11 * b;
        const desat = 1 - sat; // sat here is "colour presence"; lower = washed
        col.setRGB(
          THREE.MathUtils.lerp(r, lum, desat),
          THREE.MathUtils.lerp(g, lum, desat),
          THREE.MathUtils.lerp(b, lum, desat),
        );
        col.lerp(white, whiteK * 0.85);
        mesh.setColorAt(i, col);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

      bloom.strength = 0.3 + 1.15 * bloomK;

      composer.render();
    },

    resize() {
      width = Math.max(1, mount.clientWidth);
      height = Math.max(1, mount.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height);
      composer.setSize(width, height);
      bloom.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },

    dispose() {
      geo.dispose();
      mat.dispose();
      mesh.dispose();
      bloom.dispose();
      composer.dispose();
      renderer.dispose();
      const gl = renderer.getContext();
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
      if (canvas.parentNode === mount) mount.removeChild(canvas);
    },
  };
}
