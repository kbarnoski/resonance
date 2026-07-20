/**
 * The exo-vantage scene for 2080 · Exo Vantage — three.js.
 *
 * A spare floor-and-fog room holds one luminous PRESENCE: a standing humanoid
 * suggested only by a glowing point-cloud (a body-schema, never a detailed
 * model). The device's tilt drives the figure's subtle sway/balance.
 *
 * THE CORE MECHANIC — camera detachment. As the mismatch/detachment scalar
 * rises, the camera eases OUT of the figure's head (first-person, embodied) and
 * floats up-and-behind to a third-person vantage — so you literally watch "your
 * own" body from outside and above. The further out, the stronger the
 * dissociation. All easing is slow and dreamlike; nothing snaps.
 *
 * Palette is deliberately DRAINED / derealized: desaturated cool bone-grey with
 * a faint sickly green-amber tint that deepens as you detach — unreal, not
 * pretty. Raw hex is allowed here because this is the art layer.
 */

import * as THREE from "three";

export interface SceneFrame {
  /** Left-right lean (radians). */
  tiltX: number;
  /** Front-back lean (radians). */
  tiltZ: number;
  /** Detachment scalar 0 (embodied) .. 1 (out-of-body). */
  detach: number;
  /** Absolute time (seconds) for slow idle motion. */
  time: number;
  /** Luminance multiplier in [floor,1] from the shared SafeFlicker. */
  flick: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smoothstep(x: number): number {
  const t = x < 0 ? 0 : x > 1 ? 1 : x;
  return t * t * (3 - 2 * t);
}

// Drained palette anchors (kept desaturated + cool-to-sickly).
const FOG_EMBODIED = new THREE.Color(0.055, 0.066, 0.06);
const FOG_DETACHED = new THREE.Color(0.075, 0.08, 0.062);
const BODY_EMBODIED = new THREE.Color(0.66, 0.72, 0.6); // bone-green
const BODY_DETACHED = new THREE.Color(0.62, 0.6, 0.44); // sickly drained amber

export class ExoScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private fog: THREE.FogExp2;
  private figure: THREE.Group;
  private points: THREE.Points;
  private pointsMat: THREE.PointsMaterial;
  private grid: THREE.GridHelper;
  private gridMat: THREE.Material;
  private geom: THREE.BufferGeometry;

  private readonly camPos = new THREE.Vector3();
  private readonly camTarget = new THREE.Vector3();
  private readonly scratchColor = new THREE.Color();
  private lastT = -1;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    // A throw here (no WebGL) is caught by the page, which shows an on-brand notice.
    this.renderer.setPixelRatio(Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio : 1));
    this.renderer.setClearColor(FOG_EMBODIED, 1);

    this.scene = new THREE.Scene();
    this.fog = new THREE.FogExp2(FOG_EMBODIED.getHex(), 0.052);
    this.scene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.05, 80);
    this.camera.position.set(0, 1.62, 0.001);

    // ── Spare floor: a faint grid that fades into fog (a room with no walls).
    this.grid = new THREE.GridHelper(60, 60, 0x2a2f28, 0x1c211b);
    this.gridMat = this.grid.material as THREE.Material;
    this.gridMat.transparent = true;
    this.gridMat.opacity = 0.22;
    this.scene.add(this.grid);

    // ── The presence: a glowing point-cloud humanoid (body-schema, not a model).
    this.figure = new THREE.Group();
    this.scene.add(this.figure);

    const positions = buildBodySchema();
    this.geom = new THREE.BufferGeometry();
    this.geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    this.pointsMat = new THREE.PointsMaterial({
      color: BODY_EMBODIED.clone(),
      size: 0.05,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: true,
    });
    this.points = new THREE.Points(this.geom, this.pointsMat);
    this.figure.add(this.points);

    this.resize();
  }

  resize(): void {
    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth || canvas.width || 1;
    const h = canvas.clientHeight || canvas.height || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(f: SceneFrame): void {
    if (this.disposed) return;
    let dt = this.lastT < 0 ? 1 / 60 : f.time - this.lastT;
    dt = dt < 0 ? 0 : dt > 0.1 ? 0.1 : dt;
    this.lastT = f.time;

    const d = f.detach;
    const dSmooth = smoothstep(d);

    // ── Figure sway: tilt leans the body (balance), plus a faint living idle.
    const idleX = Math.sin(f.time * 0.5) * 0.02;
    const idleZ = Math.cos(f.time * 0.37) * 0.02;
    this.figure.rotation.z = -f.tiltX * 0.32 + idleX;
    this.figure.rotation.x = f.tiltZ * 0.32 + idleZ;
    this.figure.position.y = Math.sin(f.time * 0.6) * 0.01;

    // ── Camera: first-person (embodied) → up-and-behind (out-of-body).
    const headY = 1.62;
    // Embodied: eyes just ahead of the face (so the head-cloud stays behind the
    // near plane, not a wash), gazing out and slightly down — you are INSIDE the
    // presence and your view does NOT follow the body's lean: the mismatch.
    const fpX = 0;
    const fpY = headY + 0.01;
    const fpZ = -0.13;
    // Detached: floated up and behind, with a slow drift so it truly floats.
    const orbit = Math.sin(f.time * 0.05) * 0.55 * dSmooth;
    const back = 4.2;
    const tpX = Math.sin(orbit) * back;
    const tpY = headY + 2.5;
    const tpZ = Math.cos(orbit) * back;

    this.camPos.set(
      fpX + (tpX - fpX) * dSmooth,
      fpY + (tpY - fpY) * dSmooth,
      fpZ + (tpZ - fpZ) * dSmooth,
    );
    // Look forward when embodied, at the torso when detached.
    const lookFwdZ = -3;
    const lookX = 0;
    const lookY = 1.5 + (1.05 - 1.5) * dSmooth;
    const lookZ = lookFwdZ + (0 - lookFwdZ) * dSmooth;
    this.camTarget.set(lookX, lookY, lookZ);

    // Extra dreamlike easing on top of the already-eased detach scalar.
    const camEase = 1 - Math.exp(-dt * 2.0);
    this.camera.position.lerp(this.camPos, camEase);
    this.camera.lookAt(this.camTarget);

    // ── Drain the palette further the more you detach.
    this.scratchColor.copy(FOG_EMBODIED).lerp(FOG_DETACHED, dSmooth);
    this.fog.color.copy(this.scratchColor);
    this.fog.density = 0.052 + dSmooth * 0.02;
    this.renderer.setClearColor(this.scratchColor, 1);

    this.scratchColor.copy(BODY_EMBODIED).lerp(BODY_DETACHED, dSmooth);
    this.pointsMat.color.copy(this.scratchColor);
    // Slow luminance breathing via SafeFlicker; presence lifts a touch when out.
    this.pointsMat.opacity = (0.7 + 0.22 * dSmooth) * f.flick;

    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.geom.dispose();
    this.pointsMat.dispose();
    this.gridMat.dispose();
    (this.grid.geometry as THREE.BufferGeometry).dispose();
    this.renderer.dispose();
    try {
      this.renderer.forceContextLoss();
    } catch {
      /* not all contexts support it */
    }
  }
}

/** Sample a luminous humanoid body-schema as a jittered point-cloud. Seeded. */
function buildBodySchema(): Float32Array {
  const rng = mulberry32(0x2080_b0d4);
  const pts: number[] = [];

  const segment = (
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    count: number,
    radius: number,
  ) => {
    for (let i = 0; i < count; i++) {
      const t = rng();
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      const z = az + (bz - az) * t;
      const r = radius * Math.sqrt(rng());
      const a = rng() * Math.PI * 2;
      pts.push(x + Math.cos(a) * r, y + (rng() - 0.5) * r, z + Math.sin(a) * r);
    }
  };

  const blob = (cx: number, cy: number, cz: number, radius: number, count: number) => {
    for (let i = 0; i < count; i++) {
      const u = rng() * 2 - 1;
      const a = rng() * Math.PI * 2;
      const r = radius * Math.cbrt(rng());
      const s = Math.sqrt(1 - u * u);
      pts.push(cx + r * s * Math.cos(a), cy + r * u, cz + r * s * Math.sin(a));
    }
  };

  // Head, neck, torso, pelvis.
  blob(0, 1.62, 0, 0.15, 150);
  segment(0, 1.5, 0, 0, 1.44, 0, 24, 0.05); // neck
  segment(0, 1.44, 0, 0, 0.98, 0, 150, 0.14); // torso (taper handled by radius)
  segment(0, 0.98, 0, 0, 0.9, 0, 60, 0.13); // pelvis

  // Shoulders → hands.
  segment(-0.22, 1.42, 0, -0.28, 0.98, 0.04, 90, 0.055); // left upper+fore arm
  segment(0.22, 1.42, 0, 0.28, 0.98, 0.04, 90, 0.055); // right
  blob(-0.29, 0.95, 0.05, 0.06, 30); // left hand
  blob(0.29, 0.95, 0.05, 0.06, 30); // right hand

  // Hips → feet.
  segment(-0.11, 0.9, 0, -0.13, 0.02, 0.02, 130, 0.06); // left leg
  segment(0.11, 0.9, 0, 0.13, 0.02, 0.02, 130, 0.06); // right leg
  blob(-0.13, 0.03, 0.06, 0.07, 26); // left foot
  blob(0.13, 0.03, 0.06, 0.07, 26); // right foot

  return new Float32Array(pts);
}
