// scene.ts — three.js GPU point-cloud render of the molecular-dynamics gas.
//
// One THREE.Points per particle (N ≈ 900) with a custom additive
// ShaderMaterial. Positions come straight from the MD engine each frame; the
// 2D sheet is given a thin static z-thickness and a gentle camera sway so it
// reads as a real 3D scene (not a flat 2D drawing, not a full-screen shader).
//
// Colour maps local state, per particle:
//   cold + well-coordinated (crystal)  → crystal-cyan  #38bdf8 → #5eead4
//   hot (gas)                          → plasma-magenta #e879f9 / #f0abfc
// Brightness only ever swells gently with heat — no strobe (photosensitive-safe).
//
// screenToSim() ray-casts the pointer onto the sheet plane so a drag injects
// heat exactly where the user points.

import * as THREE from "three";
import type { MolecularDynamics } from "./md";

const VERTEX_SHADER = /* glsl */ `
  precision highp float;
  uniform float uSize;
  uniform float uCentroid;   // 0..1 brightness → hue bias of the hot end
  uniform float uDpr;
  attribute float aHeat;      // 0..1 speed-based local kinetic energy
  attribute float aCoord;     // 0..1 coordination (order) 0..1
  varying vec3 vColor;
  varying float vGlow;

  vec3 palette() {
    vec3 blue = vec3(0.220, 0.741, 0.973); // #38bdf8
    vec3 teal = vec3(0.369, 0.922, 0.831); // #5eead4
    vec3 mag  = vec3(0.909, 0.475, 0.976); // #e879f9
    vec3 pink = vec3(0.941, 0.671, 0.988); // #f0abfc
    // Ordered crystal drifts toward teal; disordered cold stays blue.
    vec3 cold = mix(blue, teal, clamp(aCoord, 0.0, 1.0));
    vec3 hot  = mix(mag, pink, clamp(uCentroid, 0.0, 1.0));
    return mix(cold, hot, smoothstep(0.06, 0.82, aHeat));
  }

  void main() {
    vColor = palette();
    vGlow = 0.55 + aHeat * 1.05 + aCoord * 0.22;

    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;

    float camDist = -mv.z;
    gl_PointSize = uSize * uDpr * (320.0 / max(camDist, 1.0)) * (0.7 + aHeat * 0.7);
    gl_PointSize = clamp(gl_PointSize, 1.0, 22.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision mediump float;
  varying vec3 vColor;
  varying float vGlow;
  void main() {
    vec2 d = gl_PointCoord - vec2(0.5);
    float r2 = dot(d, d);
    if (r2 > 0.25) discard;
    float a = exp(-r2 * 7.0);            // soft round glow, hotter centre
    gl_FragColor = vec4(vColor * vGlow, a);
  }
`;

export function hasWebGL(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export interface ColorParams {
  centroid: number; // 0..1 — hue bias of the hot end
  energy: number; // 0..1 — gentle overall point-size swell
  reduced: boolean;
}

export class CrucibleScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private points: THREE.Points;
  private material: THREE.ShaderMaterial;
  private geo: THREE.BufferGeometry;
  private container: HTMLElement;

  private readonly n: number;
  private readonly L: number;
  private readonly scale: number; // sim units → world units
  private posArr: Float32Array; // n*3
  private heatArr: Float32Array; // n (eased)
  private coordArr: Float32Array; // n (eased)
  private posAttr: THREE.BufferAttribute;
  private heatAttr: THREE.BufferAttribute;
  private coordAttr: THREE.BufferAttribute;

  private raycaster = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private ndc = new THREE.Vector2();
  private hit = new THREE.Vector3();

  private disposed = false;

  constructor(container: HTMLElement, n: number, boxL: number) {
    this.container = container;
    this.n = n;
    this.L = boxL;
    // Fit the box into ~22 world units across.
    this.scale = 22 / boxL;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, Math.max(1, container.clientHeight));
    renderer.setClearColor(new THREE.Color(0x04060a), 1);
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      200,
    );
    this.camera.position.set(0, -7, 30);
    this.camera.lookAt(0, 0, 0);

    // Geometry: real per-particle positions + heat/coord attributes.
    this.geo = new THREE.BufferGeometry();
    this.posArr = new Float32Array(n * 3);
    this.heatArr = new Float32Array(n);
    this.coordArr = new Float32Array(n);
    const zRand = makeRand(0x5ce2e);
    for (let i = 0; i < n; i++) {
      // Static thin z-thickness so the sheet has real depth/parallax.
      this.posArr[i * 3 + 2] = (zRand() - 0.5) * 1.1;
    }
    this.posAttr = new THREE.BufferAttribute(this.posArr, 3);
    this.heatAttr = new THREE.BufferAttribute(this.heatArr, 1);
    this.coordAttr = new THREE.BufferAttribute(this.coordArr, 1);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.heatAttr.setUsage(THREE.DynamicDrawUsage);
    this.coordAttr.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute("position", this.posAttr);
    this.geo.setAttribute("aHeat", this.heatAttr);
    this.geo.setAttribute("aCoord", this.coordAttr);
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 40);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uSize: { value: 1.0 },
        uCentroid: { value: 0.4 },
        uDpr: { value: Math.min(window.devicePixelRatio || 1, 2) },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geo, this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  /** Reference speed used to normalise per-particle heat into 0..1 for colour. */
  private static readonly SPEED_REF = 2.3;

  /**
   * Pull fresh positions + local state from the MD engine, ease the colour
   * channels to avoid flicker, and set the frame uniforms.
   */
  sync(md: MolecularDynamics, cp: ColorParams): void {
    const s = this.scale;
    const half = this.L * 0.5;
    const pos = md.pos;
    const speed = md.speed;
    const coord = md.coord;
    const posArr = this.posArr;
    const heatArr = this.heatArr;
    const coordArr = this.coordArr;
    const ease = cp.reduced ? 0.12 : 0.22;

    for (let i = 0; i < this.n; i++) {
      posArr[i * 3] = (pos[i * 2] - half) * s;
      posArr[i * 3 + 1] = (pos[i * 2 + 1] - half) * s;

      let h = speed[i] / CrucibleScene.SPEED_REF;
      if (h > 1) h = 1;
      heatArr[i] += (h - heatArr[i]) * ease;

      let c = coord[i] / 6;
      if (c > 1) c = 1;
      coordArr[i] += (c - coordArr[i]) * ease;
    }

    this.posAttr.needsUpdate = true;
    this.heatAttr.needsUpdate = true;
    this.coordAttr.needsUpdate = true;
    this.material.uniforms.uCentroid.value = cp.centroid;
    this.material.uniforms.uSize.value = 1.0 + cp.energy * 0.4;
  }

  /** Draw one frame with a gentle 3D camera sway (elapsed seconds). */
  render(elapsed: number, reduced: boolean): void {
    if (this.disposed) return;
    const swayAmp = reduced ? 0.05 : 0.14;
    const az = swayAmp * Math.sin(elapsed * 0.045);
    const r = 30;
    this.camera.position.set(Math.sin(az) * r, -7, Math.cos(az) * r);
    this.camera.lookAt(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Convert a pointer position (client px) into simulation coordinates by
   * ray-casting onto the sheet plane. Null if the ray misses the plane.
   */
  screenToSim(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const p = this.raycaster.ray.intersectPlane(this.plane, this.hit);
    if (!p) return null;
    const half = this.L * 0.5;
    return {
      x: p.x / this.scale + half,
      y: p.y / this.scale + half,
    };
  }

  resize(): void {
    if (this.disposed) return;
    const w = this.container.clientWidth;
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.geo.dispose();
    this.material.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    const el = this.renderer.domElement;
    if (el.parentNode) el.parentNode.removeChild(el);
  }
}

function makeRand(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
