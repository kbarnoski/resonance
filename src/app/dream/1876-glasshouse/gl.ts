// ─────────────────────────────────────────────────────────────────────────────
// gl.ts — the dithered signal-noise field (three.js, WebGL).
//
// A dense field of THREE.Points rendered through a custom ShaderMaterial with an
// ordered (Bayer 4×4) dither and per-channel chromatic offset — the visual
// language of Robert Borghesi's ASTRODITHER (2026). The field settles into a calm
// grid when the machine is idle and TEARS / breaks up + fringes chromatically as
// load and jank rise.
//
// A deliberate, bounded feedback loop: the number of drawn points scales with
// machine load via setDrawRange, so a straining machine literally spends more GPU
// on its own portrait — which the frame-timing sensor then hears. Capped so the
// tab never freezes.
//
// If WebGL is unavailable, create() throws and the page shows an on-brand notice.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from "three";
import type { Sample } from "./telemetry";

const GRID = 200; // 200×200 = 40,000 points max
const MAX_POINTS = GRID * GRID;
const MIN_ACTIVE = 6000; // idle floor

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uJank;
  uniform float uLoad;
  uniform float uMem;
  uniform float uRestless;
  uniform float uSize;
  uniform vec2 uRes;

  attribute vec2 aGrid;   // -1..1 lattice position
  attribute float aRand;  // per-point random 0..1

  varying float vRand;
  varying float vGlow;

  // cheap hash-noise
  float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }

  void main() {
    vRand = aRand;
    vec3 pos = vec3(aGrid, 0.0);

    // gentle idle breathing
    float t = uTime;
    pos.z += sin(aGrid.x * 3.0 + t * 0.6) * 0.04
           + cos(aGrid.y * 2.4 - t * 0.5) * 0.04;

    // TEARING: jank shoves points off the lattice along a noisy vector
    float tear = uJank;
    vec2 dir = vec2(hash(aGrid + aRand) - 0.5, hash(aGrid.yx - aRand) - 0.5);
    pos.xy += dir * tear * (0.35 + aRand * 0.9);
    pos.z += (hash(aGrid * 7.0 + t * 0.1) - 0.5) * tear * 1.2;

    // memory pressure squeezes the field vertically (harmonic compression)
    pos.y *= 1.0 - uMem * 0.18;

    // pointer restlessness adds a slow swirl
    float ang = uRestless * 0.8 * (0.3 + aRand);
    float ca = cos(ang), sa = sin(ang);
    pos.xy = mat2(ca, -sa, sa, ca) * pos.xy;

    vGlow = 0.35 + uLoad * 0.65 + tear * (aRand);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    float sz = uSize * (1.0 + uLoad * 0.8) * (0.6 + aRand * 0.8);
    gl_PointSize = clamp(sz / -mv.z, 1.0, 6.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  uniform float uJank;
  uniform float uLoad;

  varying float vRand;
  varying float vGlow;

  // ordered 4x4 Bayer matrix threshold, indexed by screen pixel
  float bayer(vec2 fc){
    int x = int(mod(fc.x, 4.0));
    int y = int(mod(fc.y, 4.0));
    int i = x + y * 4;
    // classic Bayer ordering / 16
    float m[16];
    m[0]=0.0;  m[1]=8.0;  m[2]=2.0;  m[3]=10.0;
    m[4]=12.0; m[5]=4.0;  m[6]=14.0; m[7]=6.0;
    m[8]=3.0;  m[9]=11.0; m[10]=1.0; m[11]=9.0;
    m[12]=15.0;m[13]=7.0; m[14]=13.0;m[15]=5.0;
    float v = 0.0;
    for(int k=0;k<16;k++){ if(k==i) v = m[k]; }
    return (v + 0.5) / 16.0;
  }

  void main() {
    // round soft point
    vec2 pc = gl_PointCoord - 0.5;
    float r = dot(pc, pc);
    if (r > 0.25) discard;

    float th = bayer(gl_FragCoord.xy);

    // brightness of this point; dither thresholds it → signal-noise texture
    float b = vGlow * (1.0 - r * 2.2);

    // per-channel chromatic offset — fringes grow with jank (ASTRODITHER fuzz)
    float ch = uJank * 0.5;
    float rC = step(th, b + ch);
    float gC = step(th, b);
    float bC = step(th, b - ch * 0.6);

    if (rC + gC + bC < 0.5) discard;

    // violet base warming to near-white at high intensity
    vec3 cool = vec3(0.42, 0.28, 0.86);
    vec3 hot  = vec3(0.90, 0.86, 1.0);
    vec3 tint = mix(cool, hot, clamp(b, 0.0, 1.0));

    vec3 col = tint * vec3(rC, gC, bC);
    // chromatic split literally separates the channels into R/violet/B fringe
    col.r = mix(col.r, rC * (0.95 + uLoad * 0.05), ch);
    col.b = mix(col.b, bC, ch);

    float a = clamp(b, 0.0, 1.0) * (0.6 + uLoad * 0.4);
    gl_FragColor = vec4(col, a);
  }
`;

export interface GLScene {
  render(sample: Sample, time: number): void;
  resize(w: number, h: number): void;
  activeCount(): number;
  dispose(): void;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export function createGL(container: HTMLElement): GLScene {
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    52,
    container.clientWidth / container.clientHeight,
    0.1,
    50,
  );
  camera.position.set(0, 0, 3.1);

  // build the lattice (shuffled so setDrawRange reveals a spatially-even subset)
  const grid = new Float32Array(MAX_POINTS * 2);
  const rand = new Float32Array(MAX_POINTS);
  const order: number[] = [];
  for (let i = 0; i < MAX_POINTS; i++) order.push(i);
  // deterministic shuffle
  let seed = 0x1876;
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }
  const aspect = 1.6;
  for (let k = 0; k < MAX_POINTS; k++) {
    const cell = order[k];
    const gx = cell % GRID;
    const gy = Math.floor(cell / GRID);
    grid[k * 2] = ((gx / (GRID - 1)) * 2 - 1) * aspect;
    grid[k * 2 + 1] = (gy / (GRID - 1)) * 2 - 1;
    rand[k] = rnd();
  }

  const geom = new THREE.BufferGeometry();
  // a dummy position attribute (required); real placement comes from aGrid
  geom.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(MAX_POINTS * 3), 3),
  );
  geom.setAttribute("aGrid", new THREE.BufferAttribute(grid, 2));
  geom.setAttribute("aRand", new THREE.BufferAttribute(rand, 1));
  geom.setDrawRange(0, MIN_ACTIVE);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uJank: { value: 0 },
      uLoad: { value: 0 },
      uMem: { value: 0 },
      uRestless: { value: 0 },
      uSize: { value: 260 },
      uRes: { value: new THREE.Vector2(1, 1) },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geom, material);
  points.frustumCulled = false; // placement lives in aGrid, not position
  scene.add(points);

  let activeCount = MIN_ACTIVE;

  function render(sample: Sample, time: number): void {
    const u = material.uniforms;
    u.uTime.value = time;
    // smooth the reactive uniforms toward the sample
    u.uJank.value += (sample.jank - u.uJank.value) * 0.1;
    u.uLoad.value += (sample.load - u.uLoad.value) * 0.08;
    const memR = sample.mem ? sample.mem.ratio : 0.3;
    u.uMem.value += (memR - u.uMem.value) * 0.05;
    u.uRestless.value += (sample.restlessness - u.uRestless.value) * 0.12;

    // FEEDBACK LOOP: active points scale with load (bounded + smoothed).
    const target = MIN_ACTIVE + clamp01(sample.load) * (MAX_POINTS - MIN_ACTIVE);
    activeCount += (target - activeCount) * 0.04;
    geom.setDrawRange(0, Math.floor(activeCount));

    // slow drift of the camera so it never feels frozen
    camera.position.x = Math.sin(time * 0.12) * 0.25;
    camera.position.y = Math.cos(time * 0.09) * 0.15;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
  }

  function resize(w: number, h: number): void {
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    material.uniforms.uRes.value.set(w, h);
  }

  function dispose(): void {
    geom.dispose();
    material.dispose();
    renderer.dispose();
    if (renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
  }

  return {
    render,
    resize,
    activeCount: () => Math.floor(activeCount),
    dispose,
  };
}
