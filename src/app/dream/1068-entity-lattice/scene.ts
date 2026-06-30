// ─────────────────────────────────────────────────────────────────────────────
// scene.ts — the DMT-style entity-lattice (three.js, GPU point field).
//
//   ~200k THREE.Points with a custom additive ShaderMaterial. Each particle is
//   bound to ONE of the 12 tracked joints (attribute aJoint) and to ONE symmetry
//   index (attribute aSym) plus a small random offset (attribute aRand). In the
//   VERTEX shader the joint's position (uJoints[aJoint], in normalised [-1,1]
//   space mapped to 3D) is reflected/rotated across N symmetry planes:
//
//     • a high-fold RADIAL rotation about the view (z) axis — N-fold "more
//       directions than there should be" (Graham St John's breakthrough
//       phenomenology), with N rising with drive (6 → 12 fold),
//     • a MIRROR in z giving fore/aft entity-copies,
//     • a recursive RADIAL SHELL repeat so copies tile outward into a crystal
//       lattice rather than a single ring.
//
//   So one moving body becomes a luminous hyperspace lattice of recursive
//   kaleidoscopic copies of itself. Particles ease toward their reflected target
//   each frame (GPU lerp via uEase) so motion smears into glittering trails.
//
//   Colour: indigo → magenta → gold-white by distance-from-core and speed;
//   AdditiveBlending; deep near-black indigo background with a faint radial
//   vignette (never flat black). Brightness only ever swells (well under 3 Hz) —
//   no strobing.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from "three";
import { JOINT_COUNT } from "./pose";

const POINT_COUNT = 200_000;
const SYM_MAX = 12; // max radial folds at full drive
const SHELLS = 4; // recursive outward lattice shells

const VERTEX_SHADER = /* glsl */ `
  precision highp float;

  uniform vec3  uJoints[${JOINT_COUNT}];
  uniform float uJointSpeed[${JOINT_COUNT}]; // per-joint motion speed 0..1 (cycle-2)
  uniform float uTime;
  uniform float uDrive;     // 0..1 toward breakthrough
  uniform float uFold;      // current radial fold count (float, eased)
  uniform float uBreak;     // 0..1 breakthrough latch — locks the lattice into a mandala
  uniform float uSize;
  uniform float uAspect;

  attribute float aJoint;   // which joint 0..11
  attribute float aSym;     // symmetry slot 0..(SYM_MAX*2*SHELLS-1)
  attribute vec3  aRand;    // small per-particle jitter + phase

  varying vec3  vColor;
  varying float vGlow;

  const float SYM_MAX = ${SYM_MAX.toFixed(1)};
  const float SHELLS  = ${SHELLS.toFixed(1)};
  const float PI = 3.14159265359;

  // indigo (core/far) -> magenta (mid) -> gold-white (hot, fast)
  vec3 ramp(float t) {
    vec3 indigo  = vec3(0.18, 0.10, 0.55);
    vec3 magenta = vec3(0.85, 0.18, 0.78);
    vec3 gold    = vec3(1.0, 0.92, 0.62);
    vec3 c = mix(indigo, magenta, smoothstep(0.0, 0.55, t));
    c = mix(c, gold, smoothstep(0.55, 1.0, t));
    return c;
  }

  mat2 rot(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
  }

  void main() {
    int ji = int(aJoint + 0.5);
    vec3 jp = uJoints[ji];
    float jspeed = uJointSpeed[ji]; // true per-joint motion (cycle-2)

    // Decode symmetry slot into (fold index, mirror, shell).
    float slot = aSym;
    float shell = floor(mod(slot, SHELLS));
    float rest  = floor(slot / SHELLS);
    float mirror = mod(rest, 2.0);          // 0 / 1
    float foldIx = floor(rest / 2.0);       // which radial copy

    // Place the joint into a 3D lattice cell. Scale body up to fill space.
    vec3 p = jp * 1.6;

    // Recursive radial shell: push copies outward in concentric crystal rings,
    // each rotated so the lattice reads as "more directions than there should be".
    // At breakthrough (uBreak->1) the shell rotation FREEZES into a held crystal.
    float shellR = 1.0 + shell * (1.1 + 0.5 * uDrive);
    float shellRot = shell * 0.6 + uTime * 0.12 * (0.4 + uDrive) * (1.0 - 0.9 * uBreak);
    p.xy *= shellR;
    p.xy *= rot(shellRot);
    p.z  += (shell - SHELLS * 0.5) * (0.9 + 0.6 * uDrive);

    // High-fold radial kaleidoscope about the view axis. uFold animates 6->12;
    // at breakthrough the fold SNAPS to maximum symmetry (the held mandala).
    float fold = mix(uFold, SYM_MAX, uBreak);
    float ang = (foldIx / max(fold, 1.0)) * 2.0 * PI;
    ang += uTime * (0.05 + 0.35 * uDrive) * (1.0 - 0.92 * uBreak); // spin locks at breakthrough
    p.xy *= rot(ang);

    // Mirror in z for fore/aft entity-copies.
    if (mirror > 0.5) p.z = -p.z;

    // Per-particle jitter so each "entity copy" is a cloud, not a hard dot;
    // jitter breathes with a phase so the lattice shimmers.
    float ph = aRand.z * 6.2831 + uTime * (1.0 + 2.0 * uDrive);
    vec3 jit = aRand * (0.06 + 0.10 * sin(ph)) * (1.0 + uDrive);
    p += jit;

    // Pull the whole lattice back so we sit inside it.
    p.z -= 2.2;

    // Distance-from-core (radial in xy) + TRUE per-joint speed (cycle-2): a fast
    // limb paints its own copies hot gold while a still torso stays deep indigo,
    // so the lattice is literally coloured by where your body is moving.
    float rad = length(p.xy);
    float coreT = clamp(rad * 0.16 + 0.15 + 0.4 * uDrive, 0.0, 1.0);
    float speedT = clamp(jspeed * 0.85 + uDrive * 0.3 + abs(sin(ph)) * 0.12, 0.0, 1.0);
    // Breakthrough drives every copy toward the hot gold-white end + a held bloom.
    float t = clamp(coreT * 0.5 + speedT * 0.6 + uBreak * 0.5, 0.0, 1.0);
    vColor = ramp(t);

    vGlow = (0.4 + 0.9 * speedT) * (0.6 + 0.6 * uDrive) * (1.0 + 1.3 * uBreak);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;

    float camDist = -mv.z;
    gl_PointSize = uSize * (200.0 / max(camDist, 0.4)) * (0.7 + 0.8 * speedT) * (1.0 + 0.5 * uBreak);
    gl_PointSize = clamp(gl_PointSize, 0.6, 12.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision mediump float;
  varying vec3  vColor;
  varying float vGlow;
  void main() {
    vec2 d = gl_PointCoord - vec2(0.5);
    float r2 = dot(d, d);
    if (r2 > 0.25) discard;
    // Soft round sprite, hotter centre.
    float a = exp(-r2 * 9.0);
    gl_FragColor = vec4(vColor * vGlow, a);
  }
`;

export class LatticeScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private points: THREE.Points;
  private material: THREE.ShaderMaterial;
  private container: HTMLElement;
  private raf = 0;
  private last = 0;

  // Eased joint targets fed to the shader uniform.
  private jointCurrent = new Float32Array(JOINT_COUNT * 3);
  private uJointVecs: THREE.Vector3[] = [];

  // Per-joint motion speed (cycle-2): smoothed frame-to-frame displacement of the
  // raw incoming joints, 0..1, fed to the shader so fast limbs glow.
  private jointPrevRaw = new Float32Array(JOINT_COUNT * 3);
  private jointSpeed: number[] = new Array(JOINT_COUNT).fill(0);
  private havePrevRaw = false;

  private drive = 0;
  private fold = 6;

  // Breakthrough state machine (cycle-2): sustained high drive crosses a
  // threshold and LATCHES the lattice into a held hyper-symmetric mandala, then
  // releases into a refractory cool-down so it can't immediately re-trigger.
  private brk = 0; // 0..1 visual/audio breakthrough amount (eased)
  private breakCharge = 0; // seconds of sustained high drive
  private broken = false; // currently in the held mandala
  private brokenTime = 0; // seconds spent in breakthrough
  private refractory = 0; // seconds of forced cool-down after a breakthrough

  constructor(container: HTMLElement) {
    this.container = container;
    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
    });
    // Throws if WebGL is unavailable — caller catches.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(new THREE.Color(0x05030f), 1);
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      62,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      100,
    );
    this.camera.position.set(0, 0, 0.001);
    this.camera.lookAt(0, 0, -1);

    for (let i = 0; i < JOINT_COUNT; i++) {
      this.uJointVecs.push(new THREE.Vector3());
    }

    const geo = new THREE.BufferGeometry();
    const aJoint = new Float32Array(POINT_COUNT);
    const aSym = new Float32Array(POINT_COUNT);
    const aRand = new Float32Array(POINT_COUNT * 3);
    // Dummy position attribute (shader computes real position) — three needs one.
    const pos = new Float32Array(POINT_COUNT * 3);
    const symSlots = SYM_MAX * 2 * SHELLS;
    for (let i = 0; i < POINT_COUNT; i++) {
      aJoint[i] = Math.floor(Math.random() * JOINT_COUNT);
      aSym[i] = Math.floor(Math.random() * symSlots);
      aRand[i * 3] = (Math.random() * 2 - 1);
      aRand[i * 3 + 1] = (Math.random() * 2 - 1);
      aRand[i * 3 + 2] = Math.random();
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aJoint", new THREE.BufferAttribute(aJoint, 1));
    geo.setAttribute("aSym", new THREE.BufferAttribute(aSym, 1));
    geo.setAttribute("aRand", new THREE.BufferAttribute(aRand, 3));
    // We compute positions in-shader, so a generous bounding sphere avoids cull.
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -3), 40);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uJoints: { value: this.uJointVecs },
        uJointSpeed: { value: this.jointSpeed },
        uTime: { value: 0 },
        uDrive: { value: 0 },
        uFold: { value: 6 },
        uBreak: { value: 0 },
        uSize: { value: 1.0 },
        uAspect: { value: 1.0 },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  /** Feed fresh joint targets (flat XYZ, normalised) + drive features. */
  setPose(joints: Float32Array, motion: number, lift: number, spread: number): void {
    // Single drive 0..1: motion dominates, raised + spread arms push to breakthrough.
    const target = Math.min(
      1,
      motion * 0.6 + lift * 0.3 + spread * 0.25 + motion * lift * 0.4,
    );
    this.drive += (target - this.drive) * 0.08;

    // Per-joint speed: frame-to-frame displacement of the RAW joints, normalised
    // and asymmetrically smoothed (snap up, linger down) so a fast limb paints a
    // lasting hot streak. Skipped on the first frame (no previous to diff).
    if (this.havePrevRaw) {
      for (let j = 0; j < JOINT_COUNT; j++) {
        let s = 0;
        for (let c = 0; c < 3; c++) {
          const d = joints[j * 3 + c] - this.jointPrevRaw[j * 3 + c];
          s += d * d;
        }
        const spd = Math.min(1, Math.sqrt(s) * 14); // per-frame displacement → 0..1
        const a = spd > this.jointSpeed[j] ? 0.45 : 0.08;
        this.jointSpeed[j] += (spd - this.jointSpeed[j]) * a;
      }
    } else {
      this.havePrevRaw = true;
    }
    this.jointPrevRaw.set(joints);

    // Ease joint targets so motion smears into glittering trails.
    for (let k = 0; k < this.jointCurrent.length; k++) {
      this.jointCurrent[k] += (joints[k] - this.jointCurrent[k]) * 0.18;
    }
    for (let j = 0; j < JOINT_COUNT; j++) {
      this.uJointVecs[j].set(
        this.jointCurrent[j * 3],
        this.jointCurrent[j * 3 + 1],
        this.jointCurrent[j * 3 + 2],
      );
    }
  }

  /** Current breakthrough amount 0..1 — page routes it to audio + the HUD meter. */
  getBreakthrough(): number {
    return this.brk;
  }

  /** Current eased drive — page routes it to the audio engines. */
  getDrive(): number {
    return this.drive;
  }

  start(): void {
    this.last = performance.now();
    const loop = () => {
      const now = performance.now();
      let dt = (now - this.last) / 1000;
      this.last = now;
      if (!Number.isFinite(dt) || dt < 0) dt = 0;
      dt = Math.min(dt, 0.05);

      // Fold density rises with drive (6 -> 12) — more directions at breakthrough.
      const targetFold = 6 + this.drive * (SYM_MAX - 6);
      this.fold += (targetFold - this.fold) * 0.05;

      // ── Breakthrough state machine ──────────────────────────────────────────
      // Sustaining high drive charges toward a breakthrough; crossing it latches
      // the held mandala for a bounded dwell, then forces a refractory cool-down.
      const ENTER = 0.8; // drive must exceed this to charge
      const HOLD = 2.2; // seconds of sustained drive to break through
      const DWELL_MAX = 9; // max seconds held in the mandala
      const REFRACT = 6; // cool-down before it can trigger again
      let breakTarget: number;
      if (this.refractory > 0) {
        this.refractory -= dt;
        this.breakCharge = 0;
        breakTarget = 0;
      } else if (this.broken) {
        this.brokenTime += dt;
        breakTarget = 1;
        // Release on a long dwell OR if the body goes quiet.
        if (this.brokenTime > DWELL_MAX || this.drive < 0.4) {
          this.broken = false;
          this.brokenTime = 0;
          this.breakCharge = 0;
          this.refractory = REFRACT;
        }
      } else {
        if (this.drive > ENTER) this.breakCharge += dt;
        else this.breakCharge = Math.max(0, this.breakCharge - dt * 1.5);
        if (this.breakCharge >= HOLD) {
          this.broken = true;
          this.brokenTime = 0;
        }
        // Pre-breakthrough: glow charges up to a "shimmering threshold" at 0.5.
        breakTarget = Math.min(0.5, (this.breakCharge / HOLD) * 0.5);
      }
      const ba = breakTarget > this.brk ? 0.05 : 0.025;
      this.brk += (breakTarget - this.brk) * ba;

      const u = this.material.uniforms;
      u.uTime.value = now / 1000;
      u.uDrive.value = this.drive;
      u.uFold.value = this.fold;
      u.uBreak.value = this.brk;
      u.uSize.value = 1.0 + this.drive * 0.8;

      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  resize(): void {
    const w = this.container.clientWidth;
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.material.uniforms.uAspect.value = w / h;
  }

  dispose(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.points.geometry.dispose();
    this.material.dispose();
    this.renderer.dispose();
    const el = this.renderer.domElement;
    if (el.parentNode) el.parentNode.removeChild(el);
  }
}
