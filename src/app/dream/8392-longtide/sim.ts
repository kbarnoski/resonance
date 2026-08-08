// 8392-longtide · sim.ts
// The flow-field body. ~22k CPU-advected points ride an analytic curl field
// (curl of a low-order sinusoidal vector potential — divergence-free, cheap,
// evolving). Seeds are persistent vortices that bend the flow permanently. A
// two-target feedback pass paints the "spectral body" as afterimage trails.
//
// Core three only — no three/examples/jsm. Self-contained drift camera, own
// feedback via a second WebGLRenderTarget, own point shaders.

import * as THREE from "three";
import { clamp, TAU } from "./util";
import type { Seed } from "./memory";

const PARTICLES = 22000;
const BOUND = 26; // respawn radius
const VORTEX_CAP = 40;

// Per-movement character: [Stillness, Bloom, Turbulence, Recollection, Dissolution]
const FLOW_SPEED = [0.35, 0.7, 1.35, 0.8, 0.45];
const FREQ_BASE = [0.04, 0.06, 0.11, 0.07, 0.05];
const PALETTE_TEMP = [0.08, 0.3, 0.52, 0.36, 0.75];
const POINT_SIZE = [1.5, 1.9, 2.3, 2.0, 1.7];

interface Vortex {
  x: number;
  y: number;
  z: number;
  intensity: number;
  relit: number;
  id: number;
}

const PARTICLE_VERT = /* glsl */ `
  attribute float aSeed;
  uniform float uSize;
  uniform float uAmp;
  uniform float uPixelRatio;
  varying float vSeed;
  void main() {
    vSeed = aSeed;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float sz = uSize * (0.55 + uAmp * 1.6) * (1.0 + aSeed * 0.6);
    gl_PointSize = sz * uPixelRatio * (150.0 / max(-mv.z, 1.0));
    gl_Position = projectionMatrix * mv;
  }
`;

const PARTICLE_FRAG = /* glsl */ `
  precision mediump float;
  uniform float uAmp;
  uniform float uCentroid;
  uniform float uTemp;
  uniform float uTime;
  varying float vSeed;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float a = smoothstep(0.5, 0.0, d);
    if (a <= 0.001) discard;

    vec3 violet = vec3(0.55, 0.28, 0.96);
    vec3 indigo = vec3(0.22, 0.26, 0.72);
    vec3 amber  = vec3(1.0, 0.63, 0.24);
    float m = fract(vSeed + uCentroid * 0.55 + uTime * 0.012);
    vec3 cool = mix(indigo, violet, smoothstep(0.2, 0.9, m));
    vec3 col = mix(cool, amber, clamp(uTemp * (0.35 + 0.65 * vSeed), 0.0, 1.0));
    col *= (0.45 + uAmp * 1.1);
    gl_FragColor = vec4(col * a, a);
  }
`;

const VORTEX_VERT = /* glsl */ `
  attribute float aInt;
  attribute float aWarm;
  uniform float uPixelRatio;
  varying float vInt;
  varying float vWarm;
  void main() {
    vInt = aInt;
    vWarm = aWarm;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float sz = (7.0 + aWarm * 22.0) * (0.6 + aInt);
    gl_PointSize = sz * uPixelRatio * (150.0 / max(-mv.z, 1.0));
    gl_Position = projectionMatrix * mv;
  }
`;

const VORTEX_FRAG = /* glsl */ `
  precision mediump float;
  varying float vInt;
  varying float vWarm;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float a = smoothstep(0.5, 0.0, d);
    if (a <= 0.001) discard;
    vec3 soft = vec3(0.6, 0.4, 1.0);
    vec3 hot  = vec3(1.0, 0.85, 0.55);
    vec3 col = mix(soft, hot, vWarm) * (0.6 + vInt * 0.9 + vWarm * 1.2);
    gl_FragColor = vec4(col * a, a);
  }
`;

const FADE_FRAG = /* glsl */ `
  precision mediump float;
  uniform sampler2D tPrev;
  uniform float uDecay;
  varying vec2 vUv;
  void main() {
    gl_FragColor = texture2D(tPrev, vUv) * uDecay;
  }
`;

const DISPLAY_FRAG = /* glsl */ `
  precision mediump float;
  uniform sampler2D tScene;
  uniform float uLum;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tScene, vUv).rgb * uLum;
    c = c / (c + vec3(0.85)); // soft tone-map so bright cores don't clip hard
    gl_FragColor = vec4(pow(c, vec3(0.86)), 1.0);
  }
`;

const QUAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

export class LongtideSim {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  private geom: THREE.BufferGeometry;
  private pos: Float32Array;
  private points: THREE.Points;
  private pMat: THREE.ShaderMaterial;

  private vortexGeom: THREE.BufferGeometry;
  private vortexPos: Float32Array;
  private vortexIntA: Float32Array;
  private vortexWarmA: Float32Array;
  private vortexMat: THREE.ShaderMaterial;
  private vortexPoints: THREE.Points;
  private vortices: Vortex[] = [];

  private rtA: THREE.WebGLRenderTarget;
  private rtB: THREE.WebGLRenderTarget;
  private fadeMat: THREE.ShaderMaterial;
  private displayMat: THREE.ShaderMaterial;
  private fadeMesh: THREE.Mesh;
  private displayMesh: THREE.Mesh;
  private fadeScene = new THREE.Scene();
  private displayScene = new THREE.Scene();

  private windX = 0;
  private windY = 0;
  private windZ = 0;
  private reduced: boolean;
  private width = 1;
  private height = 1;

  constructor(canvas: HTMLCanvasElement, reduced: boolean) {
    this.reduced = reduced;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(0x05060c, 1);
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(pr);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);
    this.camera.position.set(0, 0, 60);

    // ── particles ────────────────────────────────────────────────────────────
    this.pos = new Float32Array(PARTICLES * 3);
    const seeds = new Float32Array(PARTICLES);
    let s = 0x1234abcd >>> 0;
    const rnd = () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return ((s >>> 0) % 100000) / 100000;
    };
    for (let i = 0; i < PARTICLES; i++) {
      // uniform-ish inside a sphere
      const r = BOUND * 0.7 * Math.cbrt(rnd());
      const th = rnd() * TAU;
      const ph = Math.acos(2 * rnd() - 1);
      this.pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      this.pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th) * 0.6;
      this.pos[i * 3 + 2] = r * Math.cos(ph);
      seeds[i] = rnd();
    }
    this.geom = new THREE.BufferGeometry();
    this.geom.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.geom.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    this.pMat = new THREE.ShaderMaterial({
      uniforms: {
        uSize: { value: POINT_SIZE[0] },
        uAmp: { value: 0.2 },
        uCentroid: { value: 0.3 },
        uTemp: { value: PALETTE_TEMP[0] },
        uTime: { value: 0 },
        uPixelRatio: { value: pr },
      },
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geom, this.pMat);
    this.points.frustumCulled = false;
    this.scene.add(this.points);

    // ── vortices ─────────────────────────────────────────────────────────────
    this.vortexPos = new Float32Array(VORTEX_CAP * 3);
    this.vortexIntA = new Float32Array(VORTEX_CAP);
    this.vortexWarmA = new Float32Array(VORTEX_CAP);
    this.vortexGeom = new THREE.BufferGeometry();
    this.vortexGeom.setAttribute("position", new THREE.BufferAttribute(this.vortexPos, 3));
    this.vortexGeom.setAttribute("aInt", new THREE.BufferAttribute(this.vortexIntA, 1));
    this.vortexGeom.setAttribute("aWarm", new THREE.BufferAttribute(this.vortexWarmA, 1));
    this.vortexGeom.setDrawRange(0, 0);
    this.vortexMat = new THREE.ShaderMaterial({
      uniforms: { uPixelRatio: { value: pr } },
      vertexShader: VORTEX_VERT,
      fragmentShader: VORTEX_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.vortexPoints = new THREE.Points(this.vortexGeom, this.vortexMat);
    this.vortexPoints.frustumCulled = false;
    this.scene.add(this.vortexPoints);

    // ── feedback targets + fullscreen passes ─────────────────────────────────
    const rtOpts: THREE.RenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    };
    this.rtA = new THREE.WebGLRenderTarget(2, 2, rtOpts);
    this.rtB = new THREE.WebGLRenderTarget(2, 2, rtOpts);

    const quad = new THREE.PlaneGeometry(2, 2);
    this.fadeMat = new THREE.ShaderMaterial({
      uniforms: { tPrev: { value: null }, uDecay: { value: 0.9 } },
      vertexShader: QUAD_VERT,
      fragmentShader: FADE_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.displayMat = new THREE.ShaderMaterial({
      uniforms: { tScene: { value: null }, uLum: { value: 1 } },
      vertexShader: QUAD_VERT,
      fragmentShader: DISPLAY_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.fadeMesh = new THREE.Mesh(quad, this.fadeMat);
    this.displayMesh = new THREE.Mesh(quad.clone(), this.displayMat);
    this.fadeScene.add(this.fadeMesh);
    this.displayScene.add(this.displayMesh);

    this.renderer.autoClear = false;
  }

  resize(w: number, h: number): void {
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    const pr = this.renderer.getPixelRatio();
    const bw = Math.max(2, Math.floor(this.width * pr));
    const bh = Math.max(2, Math.floor(this.height * pr));
    this.rtA.setSize(bw, bh);
    this.rtB.setSize(bw, bh);
  }

  /** Project a normalised-device coord onto the z=0 plane in world space. */
  worldAt(ndcX: number, ndcY: number): THREE.Vector3 {
    const p = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(this.camera);
    const dir = p.sub(this.camera.position).normalize();
    const denom = Math.abs(dir.z) < 1e-4 ? 1e-4 : dir.z;
    const t = -this.camera.position.z / denom;
    return new THREE.Vector3(
      this.camera.position.x + dir.x * t,
      this.camera.position.y + dir.y * t,
      0,
    );
  }

  /** Add a persistent vortex mirroring a memory seed. */
  addVortex(seed: Seed): void {
    if (this.vortices.length >= VORTEX_CAP) this.vortices.shift();
    this.vortices.push({
      x: seed.x,
      y: seed.y,
      z: seed.z,
      intensity: seed.intensity,
      relit: 0,
      id: seed.id,
    });
  }

  /** Drive a vortex's relight envelope up (used during Recollection). */
  relight(seedId: number, amount: number): void {
    for (const v of this.vortices) {
      if (v.id === seedId) v.relit = Math.min(1.4, v.relit + amount);
    }
  }

  /** Set a transient wind that pushes the whole field toward a screen point. */
  setSteer(ndcX: number, ndcY: number, strength: number): void {
    const w = this.worldAt(ndcX, ndcY);
    const len = Math.hypot(w.x, w.y) || 1;
    this.windX = (w.x / len) * strength * 2.2;
    this.windY = (w.y / len) * strength * 2.2;
    this.windZ = Math.sin(w.x * 0.05) * strength;
  }

  clearVortices(): void {
    this.vortices = [];
    this.vortexGeom.setDrawRange(0, 0);
  }

  private syncVortexBuffers(): void {
    const n = Math.min(this.vortices.length, VORTEX_CAP);
    for (let i = 0; i < n; i++) {
      const v = this.vortices[i];
      this.vortexPos[i * 3] = v.x;
      this.vortexPos[i * 3 + 1] = v.y;
      this.vortexPos[i * 3 + 2] = v.z;
      this.vortexIntA[i] = v.intensity;
      this.vortexWarmA[i] = clamp(v.relit, 0, 1.4);
    }
    this.vortexGeom.setDrawRange(0, n);
    (this.vortexGeom.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.vortexGeom.attributes.aInt as THREE.BufferAttribute).needsUpdate = true;
    (this.vortexGeom.attributes.aWarm as THREE.BufferAttribute).needsUpdate = true;
  }

  step(
    dt: number,
    amp: number,
    centroid: number,
    movement: number,
    tSec: number,
    lum: number,
  ): void {
    const m = clamp(movement, 0, 4);
    const dtc = Math.min(dt, 0.05);

    // ── advect particles through the analytic curl field ──────────────────────
    const f = FREQ_BASE[m] * (1 + centroid * 1.4);
    const rm = this.reduced ? 0.5 : 1;
    const speed = FLOW_SPEED[m] * (0.6 + amp * 1.7) * rm * 4.0 * dtc;
    const pos = this.pos;
    const verts = this.vortices;
    const vN = verts.length;

    // decay wind (continuous steering keeps it alive)
    this.windX *= 0.93;
    this.windY *= 0.93;
    this.windZ *= 0.93;
    const wx = this.windX * dtc * 3.0;
    const wy = this.windY * dtc * 3.0;
    const wz = this.windZ * dtc * 3.0;

    for (let i = 0; i < PARTICLES; i++) {
      const ix = i * 3;
      const px = pos[ix];
      const py = pos[ix + 1];
      const pz = pos[ix + 2];

      // curl of a sinusoidal vector potential (analytic, divergence-free)
      let vx = f * Math.cos(2 * f * py - 1.1 * tSec) - f * Math.cos(f * pz + 1.1 * tSec);
      let vy = f * Math.cos(2 * f * pz - 0.7 * tSec) - f * Math.cos(f * px + 0.7 * tSec);
      let vz = f * Math.cos(2 * f * px - 0.9 * tSec) - f * Math.cos(f * py + 1.3 * tSec);

      // persistent vortices bend the local flow
      for (let k = 0; k < vN; k++) {
        const v = verts[k];
        const dx = px - v.x;
        const dy = py - v.y;
        const dz = pz - v.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > 90) continue;
        const strength = (v.intensity + v.relit) * Math.exp(-d2 * 0.06);
        // tangential swirl about the up axis + gentle inward pull
        vx += strength * (dz * 1.3 - dx * 0.4);
        vz += strength * (-dx * 1.3 - dz * 0.4);
        vy += strength * (-dy * 0.35);
      }

      let nx = px + vx * speed * 5.0 + wx;
      let ny = py + vy * speed * 5.0 + wy;
      let nz = pz + vz * speed * 5.0 + wz;

      // respawn when it drifts past the boundary
      const rr = nx * nx + ny * ny + nz * nz;
      if (rr > BOUND * BOUND) {
        const a = (i * 2.399963) % TAU;
        const b = ((i * 0.7) % 1) * Math.PI;
        const r = BOUND * 0.35;
        nx = r * Math.sin(b) * Math.cos(a);
        ny = r * Math.sin(b) * Math.sin(a) * 0.6;
        nz = r * Math.cos(b);
      }
      pos[ix] = nx;
      pos[ix + 1] = ny;
      pos[ix + 2] = nz;
    }
    (this.geom.attributes.position as THREE.BufferAttribute).needsUpdate = true;

    // decay relight envelopes
    for (let k = 0; k < vN; k++) verts[k].relit *= 0.985;
    this.syncVortexBuffers();

    // ── drift camera (own orbit) ──────────────────────────────────────────────
    const orbit = tSec * (this.reduced ? 0.008 : 0.02);
    const rad = 58 + Math.sin(tSec * 0.05) * 8;
    this.camera.position.set(
      Math.sin(orbit) * rad,
      Math.sin(tSec * 0.017) * 10,
      Math.cos(orbit) * rad,
    );
    this.camera.lookAt(0, 0, 0);

    // ── uniforms ──────────────────────────────────────────────────────────────
    const u = this.pMat.uniforms;
    u.uSize.value = POINT_SIZE[m];
    u.uAmp.value = amp;
    u.uCentroid.value = centroid;
    u.uTemp.value = PALETTE_TEMP[m];
    u.uTime.value = tSec;

    // ── feedback + composite ──────────────────────────────────────────────────
    const decay = this.reduced ? 0.86 : 0.92 - amp * 0.04;
    this.fadeMat.uniforms.uDecay.value = clamp(decay, 0.8, 0.95);
    this.fadeMat.uniforms.tPrev.value = this.rtA.texture;

    this.renderer.setRenderTarget(this.rtB);
    this.renderer.clear();
    this.renderer.render(this.fadeScene, this.orthoCam); // faded previous frame
    this.renderer.render(this.scene, this.camera); // new points, additive

    this.displayMat.uniforms.tScene.value = this.rtB.texture;
    this.displayMat.uniforms.uLum.value = lum;
    this.renderer.setRenderTarget(null);
    this.renderer.clear();
    this.renderer.render(this.displayScene, this.orthoCam);

    const tmp = this.rtA;
    this.rtA = this.rtB;
    this.rtB = tmp;
  }

  dispose(): void {
    this.geom.dispose();
    this.pMat.dispose();
    this.vortexGeom.dispose();
    this.vortexMat.dispose();
    this.fadeMat.dispose();
    this.displayMat.dispose();
    (this.fadeMesh.geometry as THREE.BufferGeometry).dispose();
    (this.displayMesh.geometry as THREE.BufferGeometry).dispose();
    this.rtA.dispose();
    this.rtB.dispose();
    this.renderer.dispose();
  }
}
