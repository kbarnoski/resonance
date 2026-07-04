// ─────────────────────────────────────────────────────────────────────────────
// scene.ts — the three.js flythrough of the infinite gyroid cathedral.
//
// We march ONE 2π³ chunk (marchingCubes.ts) and, because the gyroid field is
// 2π-periodic, tile it across a 5×5×5 THREE.InstancedMesh lattice (125 instances,
// one draw call). Every frame the lattice origin snaps to the nearest 2π multiple
// of the camera position, so the camera is always buried in the centre of the
// lattice and flight is seamless and endless.
//
// The camera drifts forward continuously along its heading; pointer drag steers
// yaw/pitch. Material is MeshPhysicalMaterial with thin-film iridescence plus a
// teal-cyan fresnel rim injected through onBeforeCompile, over near-black FogExp2.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from "three";
import { polygonize } from "./marchingCubes";
import { field, gradient } from "./gyroid";

const TWO_PI = Math.PI * 2;
const LATTICE = 5; // 5×5×5 = 125 instances
const HALF = (LATTICE - 1) / 2;

export interface CathedralScene {
  /** Advance one frame. Returns the local field sample at the camera for audio. */
  frame: (
    dt: number,
    yaw: number,
    pitch: number,
    luminance: number,
  ) => { field: number; gradMag: number };
  resize: () => void;
  dispose: () => void;
  triangleCount: number;
}

export interface SceneOptions {
  resolution: number;
  morph?: number;
  /** Forward drift speed in world units/sec. */
  speed?: number;
}

/** Build the cathedral scene on `mount`. Returns null if WebGL is unavailable. */
export function buildCathedralScene(
  mount: HTMLElement,
  opts: SceneOptions,
): CathedralScene | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    if (!renderer.getContext()) throw new Error("no webgl context");
  } catch {
    return null;
  }

  const sizeOf = () => ({
    w: mount.clientWidth || window.innerWidth,
    h: mount.clientHeight || window.innerHeight,
  });
  let { w, h } = sizeOf();

  const BG = 0x04060a;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h);
  renderer.setClearColor(BG, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  mount.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = "none";
  renderer.domElement.style.display = "block";

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(BG, 0.05);
  scene.background = new THREE.Color(BG);

  const camera = new THREE.PerspectiveCamera(70, w / h, 0.05, 200);
  camera.position.set(0.9, 0.4, 0.9); // start off-surface, inside a pore

  // ── marched chunk → geometry ────────────────────────────────────────────────
  const march = polygonize({
    resolution: opts.resolution,
    isolevel: 0,
    period: TWO_PI,
    morph: opts.morph ?? 0,
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(march.positions, 3),
  );
  geometry.setAttribute("normal", new THREE.BufferAttribute(march.normals, 3));
  geometry.computeBoundingSphere();

  // ── iridescent material with a teal-cyan fresnel rim ────────────────────────
  const rimColor = new THREE.Color(0x35f0e0); // teal-cyan
  const material = new THREE.MeshPhysicalMaterial({
    color: 0x4a2f8f, // deep violet base
    roughness: 0.22,
    metalness: 0.55,
    iridescence: 1,
    iridescenceIOR: 1.35,
    clearcoat: 0.4,
    clearcoatRoughness: 0.5,
    side: THREE.DoubleSide, // a minimal surface has two faces
    emissive: new THREE.Color(0x0a0620),
    emissiveIntensity: 1,
  });
  const rimUniforms = {
    uRim: { value: rimColor.clone() },
    uRimStrength: { value: 1.35 },
    uLum: { value: 1 },
  };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = rimUniforms.uRim;
    shader.uniforms.uRimStrength = rimUniforms.uRimStrength;
    shader.uniforms.uLum = rimUniforms.uLum;
    shader.fragmentShader =
      "uniform vec3 uRim;\nuniform float uRimStrength;\nuniform float uLum;\n" +
      shader.fragmentShader
        .replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
           vec3 vDir = normalize(vViewPosition);
           float fres = pow(1.0 - abs(dot(normalize(normal), vDir)), 3.0);
           totalEmissiveRadiance += uRim * fres * uRimStrength;`,
        )
        // slow, global luminance breathing (kept ≤ a gentle drift by the caller)
        .replace(
          "#include <dithering_fragment>",
          `gl_FragColor.rgb *= uLum;
           #include <dithering_fragment>`,
        );
  };

  const mesh = new THREE.InstancedMesh(geometry, material, LATTICE ** 3);
  mesh.frustumCulled = false; // lattice is re-centred every frame
  const m = new THREE.Matrix4();
  let inst = 0;
  for (let a = 0; a < LATTICE; a++) {
    for (let b = 0; b < LATTICE; b++) {
      for (let c = 0; c < LATTICE; c++) {
        m.makeTranslation(
          (a - HALF) * TWO_PI,
          (b - HALF) * TWO_PI,
          (c - HALF) * TWO_PI,
        );
        mesh.setMatrixAt(inst++, m);
      }
    }
  }
  mesh.instanceMatrix.needsUpdate = true;

  // The lattice rides inside this group; group.position tracks the camera.
  const lattice = new THREE.Group();
  lattice.add(mesh);
  scene.add(lattice);

  // ── lights ──────────────────────────────────────────────────────────────────
  const hemi = new THREE.HemisphereLight(0x6a4ad0, 0x0a1a20, 0.9);
  scene.add(hemi);
  const key = new THREE.PointLight(0x9a6cff, 22, 40, 1.6); // violet
  const fill = new THREE.PointLight(0x2ce0d8, 16, 40, 1.6); // teal
  scene.add(key, fill);

  // ── flight state ────────────────────────────────────────────────────────────
  const speed = opts.speed ?? 2.1;
  const forward = new THREE.Vector3();
  const euler = new THREE.Euler(0, 0, 0, "YXZ");
  const grad: [number, number, number] = [0, 0, 0];
  let t = 0;

  const frame = (dt: number, yaw: number, pitch: number, luminance: number) => {
    t += dt;

    // heading from steer → forward vector
    euler.set(pitch, yaw, 0, "YXZ");
    camera.quaternion.setFromEuler(euler);
    forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    camera.position.addScaledVector(forward, speed * dt);

    // snap the lattice origin to the nearest 2π multiple of the camera position
    lattice.position.set(
      Math.round(camera.position.x / TWO_PI) * TWO_PI,
      Math.round(camera.position.y / TWO_PI) * TWO_PI,
      Math.round(camera.position.z / TWO_PI) * TWO_PI,
    );

    // drifting lights orbit the camera
    key.position.set(
      camera.position.x + Math.sin(t * 0.23) * 4,
      camera.position.y + Math.cos(t * 0.19) * 3,
      camera.position.z + Math.cos(t * 0.27) * 4,
    );
    fill.position.set(
      camera.position.x + Math.cos(t * 0.17) * 5,
      camera.position.y + Math.sin(t * 0.21) * 3,
      camera.position.z + Math.sin(t * 0.15) * 5,
    );

    rimUniforms.uLum.value = luminance;

    renderer.render(scene, camera);

    // sample the field at the camera for the audio engine
    const { x, y, z } = camera.position;
    const f = field(x, y, z, opts.morph ?? 0);
    gradient(x, y, z, grad, opts.morph ?? 0);
    const gm = Math.hypot(grad[0], grad[1], grad[2]);
    return { field: f, gradMag: gm };
  };

  const resize = () => {
    const s = sizeOf();
    w = s.w;
    h = s.h;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  const dispose = () => {
    geometry.dispose();
    material.dispose();
    renderer.dispose();
    if (renderer.domElement.parentNode === mount) {
      mount.removeChild(renderer.domElement);
    }
  };

  return { frame, resize, dispose, triangleCount: march.triangleCount };
}
