// ─────────────────────────────────────────────────────────────────────────────
// scene.ts — the congruent visual-vection starfield (three.js).
//
//   The auditory Shepard–Risset glissando induces *auditory vection*: a felt
//   sense of self-motion (rising) strong enough to shift postural sway. To make
//   the eyes feel the same ascent the ears do, the stars stream RADIALLY toward
//   and past the camera — classic visual vection (optic-flow expansion). Inhale
//   (b high) gathers the vast field inward toward a luminous core and speeds the
//   inward flow (stars rush past = forward/upward self-motion); exhale (b low)
//   releases them to a slow boundless drift.
//
//   ~120k points live in a deep spherical shell around the camera. Each frame
//   every point creeps inward along its radial direction at a breath-scaled
//   speed; points that fall inside the core radius are re-spawned on the far
//   shell — so the flow is endless and the field never depletes. Additive
//   blending + size attenuation + a violet→gold radial colour ramp. A whisper
//   of continuous rotation keeps it alive on the exhale hold.
//
//   Brightness changes only ever drift (well under 3 Hz) — no strobing.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from "three";

const POINT_COUNT = 120_000;
const SHELL_FAR = 900; // far edge of the field
const SHELL_NEAR = 6; // core radius — points re-spawn when they cross inward
const SPHERE_SPREAD = 1.0;

/** Custom additive point shader: round soft sprites, distance-faded, per-point
 *  colour. Kept tiny — no textures, no fetches. */
const VERTEX_SHADER = /* glsl */ `
  uniform float uSize;
  uniform float uBreath;
  varying vec3 vColor;
  varying float vFade;

  // violet (far) -> cyan (mid) -> warm gold (near core)
  vec3 ramp(float t) {
    vec3 violet = vec3(0.42, 0.28, 0.85);
    vec3 cyan   = vec3(0.35, 0.78, 0.95);
    vec3 gold   = vec3(1.0, 0.82, 0.45);
    vec3 c = mix(violet, cyan, smoothstep(0.0, 0.55, t));
    c = mix(c, gold, smoothstep(0.5, 1.0, t));
    return c;
  }

  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float dist = length(position);
    // nearness in [0,1]: 0 far shell, 1 at the core
    float near = clamp(1.0 - dist / ${SHELL_FAR.toFixed(1)}, 0.0, 1.0);
    vColor = ramp(near);

    // Fade in from the far shell, glow brighter toward the core; breath lifts
    // overall luminance smoothly (drift, never a strobe).
    float coreGlow = smoothstep(0.0, 0.85, near);
    vFade = (0.25 + 0.9 * coreGlow) * (0.7 + 0.5 * uBreath);

    gl_Position = projectionMatrix * mv;
    float camDist = -mv.z;
    gl_PointSize = uSize * (1.0 + 2.4 * coreGlow) * (300.0 / max(camDist, 1.0));
    gl_PointSize = clamp(gl_PointSize, 0.5, 14.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision mediump float;
  varying vec3 vColor;
  varying float vFade;
  void main() {
    vec2 d = gl_PointCoord - vec2(0.5);
    float r = length(d);
    if (r > 0.5) discard;
    float soft = smoothstep(0.5, 0.0, r); // round soft falloff
    gl_FragColor = vec4(vColor * vFade, soft * vFade);
  }
`;

export class BreathScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private points: THREE.Points;
  private geometry: THREE.BufferGeometry;
  private material: THREE.ShaderMaterial;

  private positions: Float32Array;
  /** Per-point inward radial unit direction (toward origin), reused on respawn. */
  private dirs: Float32Array;

  private raf = 0;
  private running = false;
  private breath = 0;
  private smoothBreath = 0;
  private lastT = 0;
  private rotation = 0;
  private container: HTMLElement;

  constructor(container: HTMLElement) {
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
    this.renderer.setClearColor(0x05030f, 1); // deep space-indigo
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x05030f, 0.0009);

    this.camera = new THREE.PerspectiveCamera(72, w / h, 0.1, 2000);
    this.camera.position.set(0, 0, 0);

    this.positions = new Float32Array(POINT_COUNT * 3);
    this.dirs = new Float32Array(POINT_COUNT * 3);

    for (let i = 0; i < POINT_COUNT; i++) {
      this.spawnPoint(i, true);
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.positions, 3),
    );

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uSize: { value: 2.6 },
        uBreath: { value: 0 },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  /** Place point i at a fresh radius along a random direction. On respawn we
   *  put it back on the far shell; on first fill we scatter through the volume. */
  private spawnPoint(i: number, initial: boolean): void {
    // Uniform direction on the sphere.
    const u = Math.random() * 2 - 1;
    const theta = Math.random() * Math.PI * 2;
    const s = Math.sqrt(Math.max(0, 1 - u * u));
    const dx = s * Math.cos(theta);
    const dy = u;
    const dz = s * Math.sin(theta);

    const r = initial
      ? SHELL_NEAR + Math.cbrt(Math.random()) * (SHELL_FAR - SHELL_NEAR)
      : SHELL_FAR * (0.85 + Math.random() * 0.15);

    const o = i * 3;
    this.positions[o] = dx * r * SPHERE_SPREAD;
    this.positions[o + 1] = dy * r * SPHERE_SPREAD;
    this.positions[o + 2] = dz * r * SPHERE_SPREAD;
    // Inward unit direction (toward the core) = -position/|position|.
    this.dirs[o] = -dx;
    this.dirs[o + 1] = -dy;
    this.dirs[o + 2] = -dz;
  }

  setBreath(b: number): void {
    this.breath = Number.isFinite(b) ? Math.min(1, Math.max(0, b)) : 0;
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
    dt = Math.min(dt, 0.05); // clamp big tab-switch gaps → stable

    // Smooth the breath so velocity changes are gentle (no jolts).
    const ba = 1 - Math.exp(-dt / 0.4);
    this.smoothBreath += (this.breath - this.smoothBreath) * ba;
    const b = this.smoothBreath;

    // Inward flow speed (units/sec): a small drift floor + a strong inhale push.
    // This is the visual-vection control — fast inward flow = forward/upward.
    const flow = 26 + 150 * b;

    const pos = this.positions;
    const dir = this.dirs;
    for (let i = 0; i < POINT_COUNT; i++) {
      const o = i * 3;
      const step = flow * dt;
      pos[o] += dir[o] * step;
      pos[o + 1] += dir[o + 1] * step;
      pos[o + 2] += dir[o + 2] * step;

      const x = pos[o];
      const y = pos[o + 1];
      const z = pos[o + 2];
      const r2 = x * x + y * y + z * z;
      // Crossed inward past the core → recycle to the far shell (endless flow).
      if (r2 < SHELL_NEAR * SHELL_NEAR) {
        this.spawnPoint(i, false);
      }
    }
    (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate =
      true;

    // Whisper of rotation so the field lives even on a held exhale.
    this.rotation += dt * (0.012 + 0.03 * b);
    this.points.rotation.y = this.rotation;
    this.points.rotation.x = Math.sin(this.rotation * 0.4) * 0.05;

    this.material.uniforms.uBreath.value = b;

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
