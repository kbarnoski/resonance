// ─────────────────────────────────────────────────────────────────────────────
// scene.ts — the three.js stage: the glowing (p,q) tube, pointer picking, orbit,
// and the travelling displacement wave that makes sight and sound one model.
//
//   The knot is a TubeGeometry swept along the TorusKnotCurve. A custom
//   ShaderMaterial does three jobs: (1) a garnet→amber→gold jewel gradient down
//   the string, (2) a fresnel rim so the tube reads as glass/glowing on the deep
//   indigo ground, and (3) the pluck waves — each active pluck injects a Gaussian
//   pulse that travels outward along the arc parameter u from the pick point,
//   bulging the tube along its normal and brightening it as it goes, decaying
//   over ~2 s. That is the same waveguide the ear hears, drawn.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from "three";
import { R_MINOR, TorusKnotCurve } from "./knot";

const MAX_WAVES = 8;
const WAVE_LIFE = 2.4; // seconds a visual wave lives
const TUBE_RADIUS = 0.16;
const TUBULAR_SEGMENTS = 640;

interface Wave {
  center: number; // u in [0,1]
  amp: number;
  start: number; // seconds (scene clock)
}

const VERTEX = /* glsl */ `
  uniform float uCenters[${MAX_WAVES}];
  uniform float uAges[${MAX_WAVES}];
  uniform float uAmps[${MAX_WAVES}];
  uniform int   uCount;
  uniform float uSpeed;
  uniform float uWidth;
  uniform float uDamp;
  uniform float uAmpScale;

  varying float vU;
  varying float vBright;
  varying vec3  vN;
  varying vec3  vView;

  void main() {
    float u = uv.x;
    vU = u;

    float disp = 0.0;
    float bright = 0.0;
    for (int i = 0; i < ${MAX_WAVES}; i++) {
      if (i >= uCount) break;
      float d = abs(u - uCenters[i]);
      d = min(d, 1.0 - d);              // circular distance on the loop
      float front = uSpeed * uAges[i];  // how far the wave has travelled
      float g = exp(-pow((d - front) / uWidth, 2.0) * 0.5);
      float ripple = 0.6 + 0.4 * cos((d - front) * 90.0);
      float e = uAmps[i] * exp(-uAges[i] * uDamp) * g * ripple;
      disp += e;
      bright += abs(e);
    }
    vBright = bright;

    vec3 pos = position + normal * disp * uAmpScale;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vN = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3 uGarnet;
  uniform vec3 uAmber;
  uniform vec3 uGold;

  varying float vU;
  varying float vBright;
  varying vec3  vN;
  varying vec3  vView;

  void main() {
    vec3 base = mix(uGarnet, uAmber, smoothstep(0.0, 0.5, vU));
    base = mix(base, uGold, smoothstep(0.5, 1.0, vU));

    float fres = pow(1.0 - max(dot(normalize(vN), normalize(vView)), 0.0), 2.0);
    vec3 col = base * (0.30 + 0.55 * fres);
    col += base * 0.35;                 // ambient body so the string is legible
    col += (uGold + uAmber) * 0.5 * clamp(vBright, 0.0, 1.5) * 2.2; // pluck glow
    gl_FragColor = vec4(col, 1.0);
  }
`;

export class KnotScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private group: THREE.Group;
  private mesh: THREE.Mesh | null = null;
  private geometry: THREE.TubeGeometry | null = null;
  private material: THREE.ShaderMaterial;
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();

  private waves: Wave[] = [];
  private clock = new THREE.Clock();
  private t = 0;
  private raf = 0;
  private running = false;
  private autoSpin = true;

  // uniform scratch arrays (fixed length, reused each frame)
  private uCenters = new Float32Array(MAX_WAVES);
  private uAges = new Float32Array(MAX_WAVES);
  private uAmps = new Float32Array(MAX_WAVES);

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setClearColor(0x160a2a, 1); // deep indigo/violet ground
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x160a2a, 0.045);

    this.camera = new THREE.PerspectiveCamera(
      48,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      100,
    );
    this.camera.position.set(0, 1.4, 9.2);
    this.camera.lookAt(0, 0, 0);

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uCenters: { value: this.uCenters },
        uAges: { value: this.uAges },
        uAmps: { value: this.uAmps },
        uCount: { value: 0 },
        uSpeed: { value: 0.34 },
        uWidth: { value: 0.035 },
        uDamp: { value: 1.25 },
        uAmpScale: { value: R_MINOR * 0.9 },
        uGarnet: { value: new THREE.Color(0.78, 0.12, 0.28) },
        uAmber: { value: new THREE.Color(0.98, 0.55, 0.2) },
        uGold: { value: new THREE.Color(1.0, 0.84, 0.42) },
      },
    });
  }

  /** Build (or rebuild for a retune) the tube for a (p,q) preset. */
  setKnot(p: number, q: number): void {
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh = null;
    }
    this.geometry?.dispose();

    const curve = new TorusKnotCurve(p, q);
    this.geometry = new THREE.TubeGeometry(
      curve,
      TUBULAR_SEGMENTS,
      TUBE_RADIUS,
      14,
      true,
    );
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.group.add(this.mesh);
    this.waves = [];
  }

  /**
   * Cast a ray from a client-space pointer into the tube. Returns the arc
   * parameter u ∈ [0,1] at the hit (from the tube's length UV), or null.
   */
  pick(clientX: number, clientY: number): number | null {
    if (!this.mesh) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hits = this.raycaster.intersectObject(this.mesh, false);
    if (hits.length === 0 || !hits[0].uv) return null;
    return hits[0].uv.x;
  }

  /** Register a travelling wave at arc position u. */
  addWave(u: number, amp = 1): void {
    this.autoSpin = false;
    if (this.waves.length >= MAX_WAVES) this.waves.shift();
    this.waves.push({ center: u, amp, start: this.t });
  }

  /** Manual orbit from a drag delta (radians-ish). */
  orbit(dx: number, dy: number): void {
    this.autoSpin = false;
    this.group.rotation.y += dx * 0.006;
    this.group.rotation.x += dy * 0.006;
    this.group.rotation.x = Math.max(
      -1.2,
      Math.min(1.2, this.group.rotation.x),
    );
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    const loop = () => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      this.step();
    };
    this.raf = requestAnimationFrame(loop);
  }

  private step(): void {
    const dt = this.clock.getDelta();
    this.t += dt;

    if (this.autoSpin) {
      this.group.rotation.y += dt * 0.12;
      this.group.rotation.x = Math.sin(this.t * 0.15) * 0.12;
    }

    // compact active waves into the fixed uniform arrays
    let count = 0;
    for (const w of this.waves) {
      const age = this.t - w.start;
      if (age > WAVE_LIFE) continue;
      if (count >= MAX_WAVES) break;
      this.uCenters[count] = w.center;
      this.uAges[count] = age;
      this.uAmps[count] = w.amp;
      count++;
    }
    this.waves = this.waves.filter((w) => this.t - w.start <= WAVE_LIFE);
    this.material.uniforms.uCount.value = count;
    (this.material.uniforms.uCenters.value as Float32Array).set(this.uCenters);
    (this.material.uniforms.uAges.value as Float32Array).set(this.uAges);
    (this.material.uniforms.uAmps.value as Float32Array).set(this.uAmps);

    this.renderer.render(this.scene, this.camera);
  }

  resize(): void {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.mesh) this.group.remove(this.mesh);
    this.geometry?.dispose();
    this.material.dispose();
    this.renderer.dispose();
    const el = this.renderer.domElement;
    if (el.parentElement) el.parentElement.removeChild(el);
  }
}
