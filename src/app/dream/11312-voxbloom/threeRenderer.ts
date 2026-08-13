// ─────────────────────────────────────────────────────────────────────────────
// threeRenderer.ts — the graceful-degrade path for devices without WebGPU.
//
// Still 3-D GPU geometry (a THREE.Points cloud), driven by the SAME band→radius
// mapping and the SAME auto-orbit as the WebGPU path — just with the radius lerp
// running on the CPU and WebGL doing the drawing. Never Canvas2D.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from "three";
import { N_CPU, bandFloor, buildDirections } from "./geometry";

const BLOOM = 1.85;
const ATTACK = 9.0;
const DECAY = 2.6;

export interface ThreeHandle {
  render(bands: Float32Array, az: number, el: number, dt: number): void;
  destroy(): void;
}

export function buildThree(canvas: HTMLCanvasElement): ThreeHandle {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(new THREE.Color(0.008, 0.01, 0.02), 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 60);

  const dirData = buildDirections(N_CPU);
  const bands = new Uint8Array(N_CPU); // band index per point
  const radius = new Float32Array(N_CPU);
  const positions = new Float32Array(N_CPU * 3);
  const colors = new Float32Array(N_CPU * 3);

  for (let i = 0; i < N_CPU; i++) {
    const b = dirData[i * 4 + 3];
    bands[i] = b;
    radius[i] = bandFloor(b);
  }

  const geometry = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  const colAttr = new THREE.BufferAttribute(colors, 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  colAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", posAttr);
  geometry.setAttribute("color", colAttr);

  const material = new THREE.PointsMaterial({
    size: 0.02,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);

  const cyan = new THREE.Color(0.16, 0.72, 0.95);
  const white = new THREE.Color(0.85, 0.97, 1.0);

  function render(band: Float32Array, az: number, el: number, dt: number) {
    // Keep the drawing buffer in step with the CSS size.
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || camera.aspect !== w / h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    }

    // Radius lerp + colour, matching the WGSL compute shader.
    for (let i = 0; i < N_CPU; i++) {
      const b = bands[i];
      const a = Math.min(1, band[b]);
      const target = bandFloor(b) + a * a * BLOOM;
      const cur = radius[i];
      const rate = target > cur ? ATTACK : DECAY;
      const nr = cur + (target - cur) * Math.min(1, rate * dt);
      radius[i] = nr;
      positions[i * 3] = dirData[i * 4] * nr;
      positions[i * 3 + 1] = dirData[i * 4 + 1] * nr;
      positions[i * 3 + 2] = dirData[i * 4 + 2] * nr;
      const t = Math.min(1, a * 1.7);
      const cr = cyan.r + (white.r - cyan.r) * t;
      const cg = cyan.g + (white.g - cyan.g) * t;
      const cb = cyan.b + (white.b - cyan.b) * t;
      const bright = 0.35 + a * 0.65;
      colors[i * 3] = cr * bright;
      colors[i * 3 + 1] = cg * bright;
      colors[i * 3 + 2] = cb * bright;
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;

    const rCam = 3.5;
    camera.position.set(
      rCam * Math.cos(el) * Math.sin(az),
      rCam * Math.sin(el),
      rCam * Math.cos(el) * Math.cos(az),
    );
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
  }

  return {
    render,
    destroy() {
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    },
  };
}
