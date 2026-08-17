// ─────────────────────────────────────────────────────────────────────────────
// 14656 · answerback / scene.ts — the WebGL stage (three.js). Two facing
// "voices" breathe at each other across a gap:
//
//   LEFT  · HIS call    — a WARM organism that flares on every note he plays.
//   RIGHT · THE ANSWER  — a COOL organism that blooms when the catalog replies,
//                         its motion driven by the live audio analyser.
//
// A strand of light between them carries a travelling pulse: outward-faint while
// he plays, and a bright pulse crossing back from the catalog when it answers —
// so the turn-taking reads spatially. Warm-vs-cool by design: a DUET, not the
// lab's usual violet-on-black monoculture.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from "three";

const HIS_HUE = new THREE.Color("#ff9a3c"); // amber / warm
const HIS_DEEP = new THREE.Color("#c2410c"); // ember wireframe
const ANS_HUE = new THREE.Color("#3fd8d0"); // teal / cool
const ANS_DEEP = new THREE.Color("#0e7490"); // deep cyan wireframe

const ORB_X = 2.35;

const POINT_VERT = `
  uniform float uTime;
  uniform float uEnergy;
  uniform float uSize;
  varying float vGlow;
  void main() {
    vec3 p = position;
    float n = sin(uTime * 1.7 + p.y * 5.0) * cos(uTime * 1.2 + p.x * 4.0)
            + 0.5 * sin(uTime * 2.3 + p.z * 6.0);
    float disp = 1.0 + uEnergy * 0.45 + 0.12 * n * (0.35 + uEnergy);
    vec3 pos = p * disp;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (1.0 + uEnergy * 1.3) * (300.0 / -mv.z);
    vGlow = 0.5 + 0.5 * n;
  }
`;

const POINT_FRAG = `
  precision mediump float;
  uniform vec3 uColor;
  uniform float uAlpha;
  varying float vGlow;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(uColor * (0.65 + 0.7 * vGlow), a * uAlpha);
  }
`;

const STRAND_VERT = `
  uniform float uFlow;
  uniform float uActive;
  attribute float aT;
  varying float vP;
  void main() {
    float pulse = exp(-pow((aT - uFlow) * 7.0, 2.0));
    vP = pulse;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float base = 2.2 + uActive * 2.0;
    gl_PointSize = (base + pulse * 9.0 * (0.3 + uActive)) * (300.0 / -mv.z);
  }
`;

const STRAND_FRAG = `
  precision mediump float;
  uniform vec3 uWarm;
  uniform vec3 uCool;
  uniform float uActive;
  varying float vP;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d);
    vec3 col = mix(uWarm, uCool, clamp(vP, 0.0, 1.0));
    float bright = 0.18 + 0.25 * uActive + vP * 0.9;
    gl_FragColor = vec4(col * bright, a * (0.28 + vP * 0.9));
  }
`;

interface Orb {
  group: THREE.Group;
  mat: THREE.ShaderMaterial;
  wire: THREE.LineSegments;
  wireMat: THREE.LineBasicMaterial;
  geo: THREE.IcosahedronGeometry;
  wireGeo: THREE.WireframeGeometry;
}

type Mode = "idle" | "you" | "catalog";

export class DuetScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private root: THREE.Group;
  private his: Orb;
  private ans: Orb;
  private strandMat: THREE.ShaderMaterial;
  private strandGeo: THREE.BufferGeometry;
  private container: HTMLElement;
  private ro: ResizeObserver;
  private disposed = false;

  private mode: Mode = "idle";
  private hisEnergy = 0;
  private ansEnergy = 0;
  private flow = 0.5;
  private clock = 0;

  constructor(container: HTMLElement) {
    this.container = container;
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 500;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(w, h);
    renderer.setClearColor(0x07080e, 1);
    container.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x07080e, 0.045);
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(52, w / h, 0.1, 100);
    camera.position.set(0, 0.4, 8.2);
    camera.lookAt(0, 0, 0);
    this.camera = camera;

    const root = new THREE.Group();
    scene.add(root);
    this.root = root;

    this.his = this.makeOrb(HIS_HUE, HIS_DEEP, -ORB_X);
    this.ans = this.makeOrb(ANS_HUE, ANS_DEEP, ORB_X);
    root.add(this.his.group, this.ans.group);

    // connecting strand of points between the two voices, along a gentle arc
    const N = 120;
    const pos = new Float32Array(N * 3);
    const ts = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const x = -ORB_X + t * (2 * ORB_X);
      const y = Math.sin(t * Math.PI) * 0.55;
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = 0;
      ts[i] = t;
    }
    const sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    sGeo.setAttribute("aT", new THREE.BufferAttribute(ts, 1));
    const sMat = new THREE.ShaderMaterial({
      uniforms: {
        uFlow: { value: 0.5 },
        uActive: { value: 0 },
        uWarm: { value: HIS_HUE.clone() },
        uCool: { value: ANS_HUE.clone() },
      },
      vertexShader: STRAND_VERT,
      fragmentShader: STRAND_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const strand = new THREE.Points(sGeo, sMat);
    root.add(strand);
    this.strandGeo = sGeo;
    this.strandMat = sMat;

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
  }

  private makeOrb(hue: THREE.Color, deep: THREE.Color, x: number): Orb {
    const group = new THREE.Group();
    group.position.x = x;

    const geo = new THREE.IcosahedronGeometry(1, 3);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uEnergy: { value: 0 },
        uSize: { value: 0.06 },
        uColor: { value: hue.clone() },
        uAlpha: { value: 0.9 },
      },
      vertexShader: POINT_VERT,
      fragmentShader: POINT_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geo, mat);
    group.add(points);

    const wireGeo = new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(1, 1));
    const wireMat = new THREE.LineBasicMaterial({
      color: deep.clone(),
      transparent: true,
      opacity: 0.35,
    });
    const wire = new THREE.LineSegments(wireGeo, wireMat);
    group.add(wire);

    return { group, mat, wire, wireMat, geo, wireGeo };
  }

  setMode(mode: Mode): void {
    this.mode = mode;
  }

  /** Karel struck a note — flare his form; higher notes flare a touch brighter. */
  noteOn(midi: number, velocity: number): void {
    const v = Math.min(1, velocity / 110);
    this.hisEnergy = Math.min(1.6, this.hisEnergy + 0.5 + v * 0.5);
    // nudge the pitch into a small vertical tilt so runs feel like motion
    const tilt = ((midi - 60) / 24) * 0.5;
    this.his.group.rotation.z = tilt;
  }

  /** Live amplitude of the catalog answer (0..1) — blooms the cool form. */
  setAnswerLevel(level: number): void {
    this.ansEnergy = Math.max(this.ansEnergy, Math.min(1.6, level * 2.2));
  }

  update(dt: number): void {
    if (this.disposed) return;
    this.clock += dt;

    // energies decay toward an idle breath
    const idle = 0.14 + 0.05 * Math.sin(this.clock * 0.9);
    this.hisEnergy += (idle - this.hisEnergy) * Math.min(1, dt * 2.4);
    this.ansEnergy += (idle - this.ansEnergy) * Math.min(1, dt * 2.4);

    const hisActive = this.mode === "you";
    const ansActive = this.mode === "catalog";

    // strand pulse: outward (his→answer) while he plays, back (answer→his) on reply
    let dir = 0.28;
    let active = 0;
    if (ansActive) {
      dir = -0.9;
      active = 1;
    } else if (hisActive) {
      dir = 0.9;
      active = 0.65;
    }
    this.flow += dir * dt;
    if (this.flow > 1.15) this.flow -= 1.3;
    if (this.flow < -0.15) this.flow += 1.3;
    this.strandMat.uniforms.uFlow.value = this.flow;
    this.strandMat.uniforms.uActive.value +=
      (active - this.strandMat.uniforms.uActive.value) * Math.min(1, dt * 4);

    // push per-orb state
    this.his.mat.uniforms.uTime.value = this.clock;
    this.his.mat.uniforms.uEnergy.value = this.hisEnergy;
    this.his.mat.uniforms.uAlpha.value = hisActive ? 1 : 0.72;
    this.his.wireMat.opacity = 0.2 + this.hisEnergy * 0.35;
    this.his.group.rotation.y += dt * 0.25;
    this.his.group.rotation.z *= 1 - Math.min(1, dt * 1.5);

    this.ans.mat.uniforms.uTime.value = this.clock;
    this.ans.mat.uniforms.uEnergy.value = this.ansEnergy;
    this.ans.mat.uniforms.uAlpha.value = ansActive ? 1 : 0.72;
    this.ans.wireMat.opacity = 0.2 + this.ansEnergy * 0.35;
    this.ans.group.rotation.y -= dt * 0.22;

    // gentle full-scene drift
    this.root.rotation.y = Math.sin(this.clock * 0.18) * 0.22;
    this.camera.position.y = 0.4 + Math.sin(this.clock * 0.3) * 0.15;
    this.camera.lookAt(0, 0, 0);

    this.renderer.render(this.scene, this.camera);
  }

  private resize(): void {
    if (this.disposed) return;
    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 500;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.disposed = true;
    this.ro.disconnect();
    for (const orb of [this.his, this.ans]) {
      orb.geo.dispose();
      orb.wireGeo.dispose();
      orb.mat.dispose();
      orb.wireMat.dispose();
    }
    this.strandGeo.dispose();
    this.strandMat.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
