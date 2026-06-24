// GPU particle light-field for the shadow-dance, built on three.js (v0.182).
//
// A THREE.Points system of several thousand additive-blended glowing
// particles (custom ShaderMaterial, indigo -> violet -> warm-gold palette)
// that bloom and scatter around the body's center and respond to the three
// movement qualities:
//   energy      -> particle density/brightness + bloom radius
//   impulsivity -> outward burst impulse (a stomp throws a shockwave of light)
//   fluidity    -> particles stream and trail rather than scatter
//
// This is the required GPU surface (not Canvas2D, not SVG).

import * as THREE from "three";
import type { MotionFrame } from "./pose";

export interface SceneHandle {
  update(frame: MotionFrame, dt: number): void;
  resize(w: number, h: number): void;
  dispose(): void;
}

const COUNT = 5000;

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uEnergy;
  uniform float uBurst;
  uniform float uFluidity;
  uniform vec2  uCenter;
  uniform float uSpread;
  attribute float aSeed;
  attribute float aAngle;
  attribute float aRadius;
  varying float vGlow;
  varying float vSeed;

  void main() {
    vSeed = aSeed;

    // Base orbit around the body center, breathing with energy.
    float t = uTime * (0.15 + aSeed * 0.4);
    float r = aRadius * (0.5 + uSpread * 1.2) * (0.7 + uEnergy * 1.6);

    // A burst (stomp) pushes particles outward as a shockwave.
    r += uBurst * (0.6 + aSeed) * 1.4;

    float ang = aAngle + t + uBurst * aSeed * 2.0;
    // Fluidity makes motion smooth & swirly; low fluidity = jittery scatter.
    float jitter = (1.0 - uFluidity) * (sin(aSeed * 91.7 + uTime * 6.0)) * 0.25;

    vec2 pos = uCenter + vec2(cos(ang), sin(ang)) * (r + jitter);
    pos.y += sin(uTime * (0.3 + aSeed) + aSeed * 6.28) * 0.05 * uFluidity;

    vec4 mv = modelViewMatrix * vec4(pos, 0.0, 1.0);
    gl_Position = projectionMatrix * mv;

    // Size: nearer-center & higher-energy particles are bigger/brighter.
    float energyPop = 0.5 + uEnergy * 2.5 + uBurst * 3.0;
    gl_PointSize = (4.0 + aSeed * 10.0) * energyPop * (1.0 / (1.0 + r * 0.4));
    vGlow = energyPop * (0.3 + aSeed * 0.7);
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;
  uniform float uEnergy;
  varying float vGlow;
  varying float vSeed;

  void main() {
    // Soft round glow sprite.
    vec2 d = gl_PointCoord - vec2(0.5);
    float dist = length(d);
    float alpha = smoothstep(0.5, 0.0, dist);
    alpha *= alpha;

    // Palette: indigo -> violet -> warm gold, shifted by energy & seed.
    vec3 indigo = vec3(0.30, 0.22, 0.75);
    vec3 violet = vec3(0.62, 0.35, 0.95);
    vec3 gold   = vec3(1.00, 0.80, 0.45);
    float mixA = clamp(uEnergy * 1.2 + vSeed * 0.4, 0.0, 1.0);
    vec3 col = mix(indigo, violet, smoothstep(0.0, 0.6, mixA));
    col = mix(col, gold, smoothstep(0.55, 1.0, mixA));

    gl_FragColor = vec4(col * (0.6 + vGlow), alpha * (0.35 + vGlow * 0.5));
  }
`;

export function startScene(canvas: HTMLCanvasElement): SceneHandle {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x000000, 0);
  const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio : 1, 2);
  renderer.setPixelRatio(dpr);

  const scene = new THREE.Scene();
  // Orthographic camera in clip-ish space: x/y roughly -1.6..1.6.
  const camera = new THREE.OrthographicCamera(-1.6, 1.6, 1.6, -1.6, -10, 10);
  camera.position.z = 1;

  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(COUNT * 3); // unused per-vertex (computed in shader) but required
  const seeds = new Float32Array(COUNT);
  const angles = new Float32Array(COUNT);
  const radii = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    seeds[i] = Math.random();
    angles[i] = Math.random() * Math.PI * 2;
    radii[i] = Math.pow(Math.random(), 0.6) * 0.9;
  }
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  geo.setAttribute("aAngle", new THREE.BufferAttribute(angles, 1));
  geo.setAttribute("aRadius", new THREE.BufferAttribute(radii, 1));

  const uniforms = {
    uTime: { value: 0 },
    uEnergy: { value: 0 },
    uBurst: { value: 0 },
    uFluidity: { value: 0.5 },
    uCenter: { value: new THREE.Vector2(0, 0) },
    uSpread: { value: 0.4 },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geo, mat);
  scene.add(points);

  let time = 0;
  let burst = 0;
  let energyS = 0;
  let fluidS = 0.5;
  const center = new THREE.Vector2(0, 0);

  function resize(w: number, h: number) {
    renderer.setSize(w, h, false);
    const aspect = w / h;
    const half = 1.6;
    camera.left = -half * aspect;
    camera.right = half * aspect;
    camera.top = half;
    camera.bottom = -half;
    camera.updateProjectionMatrix();
  }

  function update(frame: MotionFrame, dt: number) {
    time += dt;
    // Smooth the driving signals for cinematic, never-jittery motion.
    energyS += (frame.energy - energyS) * 0.15;
    fluidS += (frame.fluidity - fluidS) * 0.08;
    // Impulse triggers a decaying burst.
    if (frame.impulsivity > burst) burst = frame.impulsivity;
    burst *= Math.pow(0.02, dt); // fast decay (~1/50 per second)

    center.x += (frame.cx - center.x) * 0.15;
    center.y += (frame.cy - center.y) * 0.15;

    uniforms.uTime.value = time;
    uniforms.uEnergy.value = energyS;
    uniforms.uBurst.value = burst;
    uniforms.uFluidity.value = fluidS;
    uniforms.uSpread.value = frame.spread;
    uniforms.uCenter.value.copy(center);

    renderer.render(scene, camera);
  }

  function dispose() {
    geo.dispose();
    mat.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }

  return { update, resize, dispose };
}
