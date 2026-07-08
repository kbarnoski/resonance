// 1278-faraday-relief — scene.ts
//
// The Faraday surface as REAL displaced relief geometry, not a flat fragment
// field. A subdivided PlaneGeometry lies flat in the XZ plane; every frame each
// vertex's height is set from the amplitude-equation height field and the
// vertex normals are recomputed, so ridges genuinely rise into 3D. A liquid-
// metal MeshStandardMaterial (high metalness, low-ish roughness) reflects a
// procedurally-built dark studio environment plus two slowly moving lights, so
// specular glints slide across the ridges as the pattern forms. A long lens at
// a low RAKING angle reads the relief as depth. Everything is disposed on
// teardown.

import * as THREE from "three";
import { COS_THETA, SIN_THETA, type FaradayState } from "./faraday";

const PLANE_SIZE = 12;
const HEIGHT_SCALE = 0.18;

export interface SceneHandle {
  update(state: FaradayState, elapsed: number): void;
  resize(): void;
  dispose(): void;
}

/** A dark "mercury studio": a soft equirect gradient with two bright soft
 *  windows, so the metal has something to reflect (glints that slide). */
function makeEnvTexture(): THREE.DataTexture {
  const w = 256;
  const h = 128;
  const data = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const v = y / (h - 1); // 0 top → 1 bottom
    // dark petrol floor, cooler dim sky
    const base = 0.02 + 0.10 * (1 - v);
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1);
      // two soft light "windows" — one warm copper, one cold cyan
      const warm = Math.exp(-((u - 0.28) ** 2) / 0.010 - ((v - 0.34) ** 2) / 0.020);
      const cold = Math.exp(-((u - 0.72) ** 2) / 0.014 - ((v - 0.30) ** 2) / 0.024);
      const r = base * 0.9 + warm * 1.7 + cold * 0.25;
      const g = base * 1.0 + warm * 1.1 + cold * 0.9;
      const b = base * 1.25 + warm * 0.5 + cold * 1.9;
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
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    if (!renderer.getContext()) return null;
  } catch {
    return null;
  }

  let width = Math.max(1, mount.clientWidth);
  let height = Math.max(1, mount.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height);
  renderer.setClearColor(0x05070a, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  mount.appendChild(renderer.domElement);
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070a);
  scene.fog = new THREE.FogExp2(0x05070a, 0.045);

  // Procedural environment for the metal reflections.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = makeEnvTexture();
  const envRT = pmrem.fromEquirectangular(envTex);
  scene.environment = envRT.texture;
  envTex.dispose();
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 100);
  camera.position.set(0, 1.9, 8.7);
  camera.lookAt(0, 0.12, 0);

  const SEG = reduced ? 96 : 160;
  const geo = new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2); // lie flat: normal +Y, grid in XZ

  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x2b3742), // dark petrol steel — the mercury tint
    metalness: 0.97,
    roughness: 0.24,
    envMapIntensity: 1.15,
  });
  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);

  // Two moving lights: warm copper key + cold cyan fill. They slide the glints.
  const key = new THREE.DirectionalLight(0xffcf9a, 1.5);
  key.position.set(5, 5, 4);
  scene.add(key);
  const fill = new THREE.PointLight(0x7fd8ff, 22, 46, 2);
  fill.position.set(-6, 3.6, 5);
  scene.add(fill);
  const amb = new THREE.AmbientLight(0x141c24, 0.6);
  scene.add(amb);

  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  const arr = posAttr.array as Float32Array;
  const vertCount = arr.length / 3;

  function displace(state: FaradayState) {
    const A = state.A;
    const phi = state.phi;
    const k = state.k;
    // hoist active modes to avoid per-vertex branching cost
    for (let i = 0; i < vertCount; i++) {
      const o = i * 3;
      const x = arr[o];
      const z = arr[o + 2];
      let hgt = 0;
      for (let j = 0; j < 6; j++) {
        const a = A[j];
        if (a > 1e-4) hgt += a * Math.cos(k * (x * COS_THETA[j] + z * SIN_THETA[j]) + phi[j]);
      }
      arr[o + 1] = hgt * HEIGHT_SCALE;
    }
    posAttr.needsUpdate = true;
    geo.computeVertexNormals();
  }

  const orbitSpeed = reduced ? 0.018 : 0.04;
  const breatheSpeed = reduced ? 0.06 : 0.12;

  return {
    update(state: FaradayState, elapsed: number) {
      displace(state);

      // Very gentle idle sway + breathing — never a flash, just slow drift.
      const a = elapsed * orbitSpeed;
      camera.position.set(
        Math.sin(a) * 1.9,
        1.9 + Math.sin(elapsed * breatheSpeed) * 0.22,
        8.7 - Math.cos(a) * 0.5,
      );
      camera.lookAt(0, 0.12, 0);

      // Lights orbit slowly so speculars travel across the forming ridges.
      key.position.set(Math.cos(elapsed * 0.14) * 6, 5, Math.sin(elapsed * 0.14) * 6);
      fill.position.set(Math.cos(elapsed * 0.1 + 2.1) * -6.5, 3.6, Math.sin(elapsed * 0.1 + 2.1) * 6.5);

      renderer.render(scene, camera);
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
