// ─────────────────────────────────────────────────────────────────────────────
// scene.ts — three.js flythrough renderer for the spectral landscape.
//
// The time × log-frequency magnitude grid becomes a THREE.Points cloud:
//   x = frequency (log axis, spread left→right)
//   y = magnitude (height of the terrain)
//   z = time (we fly forward along this axis)
// Color is emissive, mapped by frequency band: deep violet bass → cyan/white
// treble, brightened by magnitude. Additive blending for a cosmic glow.
//
// The camera position is locked to playback progress; the caller pushes a 0..1
// `progress` each frame plus a steer (yaw/pitch) from drag / arrow keys.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from "three";
import type { SpectralGrid } from "./fft";

export interface FlightScene {
  /** advance one frame: progress is 0..1 playback position */
  render: (progress: number, yaw: number, pitch: number, dt: number) => void;
  resize: () => void;
  dispose: () => void;
}

const WORLD_LENGTH = 220; // z-extent of the whole track
const WORLD_WIDTH = 60; // x-extent of the frequency axis
const HEIGHT_SCALE = 26; // magnitude → y

/** Build the flythrough scene attached to `mount`. Returns null if no WebGL. */
export function buildFlightScene(
  mount: HTMLElement,
  grid: SpectralGrid,
): FlightScene | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    if (!renderer.getContext()) throw new Error("no context");
  } catch {
    return null;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const sizeOf = () => ({
    w: mount.clientWidth || window.innerWidth,
    h: mount.clientHeight || window.innerHeight,
  });
  let { w, h } = sizeOf();
  renderer.setSize(w, h);
  renderer.setClearColor(0x04030a, 1);
  mount.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = "none";

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x04030a, 0.012);

  const camera = new THREE.PerspectiveCamera(62, w / h, 0.1, 600);

  // ── build the point cloud ──────────────────────────────────────────────────
  const { cols, rows, data } = grid;
  const count = cols * rows;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  const colDeep = new THREE.Color(0x4a1d8f); // deep violet (bass)
  const colMid = new THREE.Color(0x2f7df6); // blue
  const colHi = new THREE.Color(0x46e8ff); // cyan
  const colTop = new THREE.Color(0xffffff); // white (treble peaks)
  const tmp = new THREE.Color();

  let p = 0;
  for (let c = 0; c < cols; c++) {
    const z = -(c / (cols - 1)) * WORLD_LENGTH; // fly toward -z over time
    for (let r = 0; r < rows; r++) {
      const fNorm = r / (rows - 1); // 0 bass → 1 treble
      const x = (fNorm - 0.5) * WORLD_WIDTH;
      const mag = data[c * rows + r]; // 0..1
      const y = Math.pow(mag, 1.4) * HEIGHT_SCALE - 4;

      positions[p * 3 + 0] = x;
      positions[p * 3 + 1] = y;
      positions[p * 3 + 2] = z;

      // color by frequency band, brightened by magnitude toward white
      if (fNorm < 0.4) {
        tmp.copy(colDeep).lerp(colMid, fNorm / 0.4);
      } else if (fNorm < 0.75) {
        tmp.copy(colMid).lerp(colHi, (fNorm - 0.4) / 0.35);
      } else {
        tmp.copy(colHi).lerp(colTop, (fNorm - 0.75) / 0.25);
      }
      const bright = 0.25 + Math.pow(mag, 1.2) * 0.95;
      tmp.lerp(colTop, Math.pow(mag, 3) * 0.5);
      colors[p * 3 + 0] = tmp.r * bright;
      colors[p * 3 + 1] = tmp.g * bright;
      colors[p * 3 + 2] = tmp.b * bright;

      sizes[p] = 0.6 + mag * 3.4;
      p++;
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geom.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

  // round soft sprite texture for the points
  const sprite = makeGlowSprite();

  const material = new THREE.PointsMaterial({
    size: 1,
    map: sprite,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  // scale per-point size via onBeforeCompile (aSize attribute)
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      "attribute float aSize;\n" +
      shader.vertexShader.replace(
        "gl_PointSize = size;",
        "gl_PointSize = size * aSize;",
      );
  };

  const points = new THREE.Points(geom, material);
  scene.add(points);

  // a faint floor grid of additive lines for depth cueing
  const gridHelper = new THREE.GridHelper(WORLD_LENGTH, 60, 0x1a1140, 0x130b2e);
  gridHelper.position.y = -5;
  gridHelper.rotation.x = 0; // grid lies on XZ already
  const gridMat = gridHelper.material as THREE.Material;
  gridMat.transparent = true;
  gridMat.opacity = 0.35;
  scene.add(gridHelper);

  const resize = () => {
    const s = sizeOf();
    w = s.w;
    h = s.h;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  // smoothed steer
  let smYaw = 0;
  let smPitch = 0;
  const lookTarget = new THREE.Vector3();

  const render = (progress: number, yaw: number, pitch: number, dt: number) => {
    const k = Math.min(1, dt * 6);
    smYaw += (yaw - smYaw) * k;
    smPitch += (pitch - smPitch) * k;

    const clamped = Math.max(0, Math.min(1, progress));
    const camZ = -clamped * WORLD_LENGTH + 14; // sit slightly behind the front
    const camY = 6 + Math.sin(clamped * Math.PI * 3) * 1.2;
    camera.position.set(smYaw * 8, camY - smPitch * 6, camZ);

    // look ahead down the track, steered by yaw/pitch
    lookTarget.set(
      smYaw * 14,
      camY - 4 - smPitch * 14,
      camZ - 40,
    );
    camera.lookAt(lookTarget);
    camera.rotation.z = -smYaw * 0.25; // bank into the turn

    renderer.render(scene, camera);
  };

  const dispose = () => {
    geom.dispose();
    material.dispose();
    sprite.dispose();
    gridHelper.geometry.dispose();
    (gridHelper.material as THREE.Material).dispose();
    renderer.dispose();
    if (renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
  };

  return { render, resize, dispose };
}

/** A radial soft-glow sprite drawn once into a CanvasTexture (setup only). */
function makeGlowSprite(): THREE.CanvasTexture {
  const size = 64;
  const cv = document.createElement("canvas");
  cv.width = size;
  cv.height = size;
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
  grad.addColorStop(0.3, "rgba(255,255,255,0.7)");
  grad.addColorStop(0.7, "rgba(255,255,255,0.15)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.needsUpdate = true;
  return tex;
}
