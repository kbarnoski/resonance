// ─────────────────────────────────────────────────────────────────────────────
// scene.ts — the volumetric soft-fog Ganzfeld field (three.js).
//
//   This is NOT a flat 2D fragment field. It is a real 3D volume: ~260 large,
//   very soft billboard "fog puffs" are scattered through a box the camera sits
//   INSIDE, so nearer puffs parallax past farther ones and FogExp2 blends the far
//   ones into an even wash. Heavy overlap + low per-puff opacity means the net is
//   a near-uniform luminous field — the visual homogeneity a Ganzfeld needs —
//   with only slow, large-scale luminance/hue drift. No flicker, ever.
//
//   The spectral slope drives the palette and the drift:
//     white → bright, cool, even, nearly still
//     pink  → warm amber glow, gentle
//     brown → deep teal, slow oceanic current (the study's water theme)
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from "three";
import type { FieldState } from "./field";

const PUFF_COUNT = 260;
const BOX = 26; // half-extent of the fog volume

/** Probe for a usable WebGL context before constructing the renderer. */
export function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (c.getContext("webgl2") || c.getContext("webgl"))
    );
  } catch {
    return false;
  }
}

/** Three anchor palettes: [base(clear/fog), puffNear, puffFar]. */
const PAL = {
  white: {
    base: new THREE.Color(0.62, 0.64, 0.68),
    near: new THREE.Color(0.92, 0.93, 0.97),
    far: new THREE.Color(0.7, 0.74, 0.82),
  },
  pink: {
    base: new THREE.Color(0.5, 0.36, 0.36),
    near: new THREE.Color(0.98, 0.72, 0.6),
    far: new THREE.Color(0.7, 0.42, 0.44),
  },
  brown: {
    base: new THREE.Color(0.09, 0.26, 0.29),
    near: new THREE.Color(0.32, 0.72, 0.72),
    far: new THREE.Color(0.1, 0.36, 0.42),
  },
};

function rampColor(
  out: THREE.Color,
  slope: number,
  key: "base" | "near" | "far",
): void {
  const s = Math.min(1, Math.max(0, slope));
  if (s <= 0.5) out.copy(PAL.white[key]).lerp(PAL.pink[key], s / 0.5);
  else out.copy(PAL.pink[key]).lerp(PAL.brown[key], (s - 0.5) / 0.5);
}

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uFlow;
  uniform float uSize;
  attribute float aSeed;
  attribute float aPhase;
  varying float vDepth;
  varying float vSeed;

  void main() {
    vSeed = aSeed;
    vec3 p = position;
    // Slow, bounded oceanic sway — brown (high uFlow) drifts most.
    float w = uTime * (0.05 + uFlow * 0.12);
    p.x += sin(w * 0.7 + aPhase * 6.28) * (0.8 + uFlow * 2.6);
    p.y += sin(w + aPhase * 4.0) * (0.6 + uFlow * 3.2);
    p.z += cos(w * 0.5 + aPhase * 5.0) * (0.8 + uFlow * 2.0);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float camDist = -mv.z;
    vDepth = clamp(camDist / 40.0, 0.0, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (900.0 / max(camDist, 1.0)) * (0.7 + 0.6 * aSeed);
    gl_PointSize = clamp(gl_PointSize, 40.0, 520.0);
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3 uNear;
  uniform vec3 uFar;
  uniform float uOpacity;
  varying float vDepth;
  varying float vSeed;

  void main() {
    vec2 d = gl_PointCoord - vec2(0.5);
    float r = length(d);
    if (r > 0.5) discard;
    // Very soft gaussian — no hard edge, so puffs melt together.
    float a = exp(-r * r * 7.0) * uOpacity;
    vec3 col = mix(uNear, uFar, vDepth);
    // A touch of per-puff luminance variety keeps it alive, still uniform.
    col *= 0.85 + 0.3 * vSeed;
    gl_FragColor = vec4(col, a);
  }
`;

export class FogScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private points: THREE.Points;
  private geometry: THREE.BufferGeometry;
  private material: THREE.ShaderMaterial;
  private fog: THREE.FogExp2;
  private container: HTMLElement;

  private raf = 0;
  private running = false;
  private lastT = 0;
  private clock = 0;

  private field: FieldState | null = null;
  private baseColor = new THREE.Color();
  private smoothFlow = 0.4;
  private smoothDrive = 0.4;

  constructor(container: HTMLElement, seedRand: () => number) {
    this.container = container;
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    rampColor(this.baseColor, 0.5, "base");
    this.renderer.setClearColor(this.baseColor, 1);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.fog = new THREE.FogExp2(this.baseColor.getHex(), 0.03);
    this.scene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 200);
    this.camera.position.set(0, 0, 0);

    // Scatter puffs through the volume with the seeded PRNG (no Math.random).
    const positions = new Float32Array(PUFF_COUNT * 3);
    const seeds = new Float32Array(PUFF_COUNT);
    const phases = new Float32Array(PUFF_COUNT);
    for (let i = 0; i < PUFF_COUNT; i++) {
      positions[i * 3] = (seedRand() * 2 - 1) * BOX;
      positions[i * 3 + 1] = (seedRand() * 2 - 1) * BOX;
      positions[i * 3 + 2] = (seedRand() * 2 - 1) * BOX;
      seeds[i] = seedRand();
      phases[i] = seedRand();
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3),
    );
    this.geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    this.geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));

    const near = new THREE.Color();
    const far = new THREE.Color();
    rampColor(near, 0.5, "near");
    rampColor(far, 0.5, "far");

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uFlow: { value: 0.4 },
        uSize: { value: 0.5 },
        uOpacity: { value: 0.16 },
        uNear: { value: near },
        uFar: { value: far },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.NormalBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  setField(f: FieldState): void {
    this.field = f;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastT = performance.now();
    const loop = () => {
      if (!this.running) return;
      this.frame();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private frame(): void {
    const now = performance.now();
    let dt = (now - this.lastT) / 1000;
    this.lastT = now;
    if (!Number.isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, 0.05);

    const f = this.field;
    const flow = f ? f.flow : 0.4;
    const drive = f ? f.drive : 0.4;
    const slope = f ? f.slope : 0.5;

    // Smooth every driver so all motion is drift, never a jump.
    const k = 1 - Math.exp(-dt / 0.6);
    this.smoothFlow += (flow - this.smoothFlow) * k;
    this.smoothDrive += (drive - this.smoothDrive) * k;

    // Advance the fog clock at a flow-scaled rate — brown flows faster.
    this.clock += dt * (0.4 + this.smoothFlow);
    this.material.uniforms.uTime.value = this.clock;
    this.material.uniforms.uFlow.value = this.smoothFlow;

    // Palette follows the slope; opacity/brightness breathe with the swell.
    const near = this.material.uniforms.uNear.value as THREE.Color;
    const far = this.material.uniforms.uFar.value as THREE.Color;
    const tgtNear = new THREE.Color();
    const tgtFar = new THREE.Color();
    rampColor(tgtNear, slope, "near");
    rampColor(tgtFar, slope, "far");
    near.lerp(tgtNear, k);
    far.lerp(tgtFar, k);

    const tgtBase = new THREE.Color();
    rampColor(tgtBase, slope, "base");
    // Gentle luminance drift with the swell — stays a soft field, never dark.
    const lum = 0.9 + 0.2 * this.smoothDrive;
    tgtBase.multiplyScalar(lum);
    this.baseColor.lerp(tgtBase, k);
    this.renderer.setClearColor(this.baseColor, 1);
    this.fog.color.copy(this.baseColor);
    // Denser haze on brown so the far field reads as deep water.
    this.fog.density = 0.022 + slope * 0.02;
    this.material.uniforms.uOpacity.value = 0.13 + 0.06 * this.smoothDrive;

    // Whisper of camera sway so the volume feels inhabited, sub-perceptual slow.
    this.camera.rotation.z = Math.sin(this.clock * 0.05) * 0.02;
    this.camera.rotation.y = Math.sin(this.clock * 0.03) * 0.03;

    this.renderer.render(this.scene, this.camera);
  }

  resize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
    this.renderer.dispose();
    const el = this.renderer.domElement;
    if (el.parentElement) el.parentElement.removeChild(el);
  }
}
