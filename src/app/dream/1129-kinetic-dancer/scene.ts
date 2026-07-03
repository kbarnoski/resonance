// ─────────────────────────────────────────────────────────────────────────────
// scene.ts — orthographic structure-from-motion render of the point-light
// dancer (three.js). The KineticDancer class.
//
//   The joints are a single flat THREE.Points cloud (equal-size ivory dots,
//   sizeAttenuation:false → ZERO perspective/size depth cues). An
//   OrthographicCamera looks straight down -Z, so the projection discards depth:
//   the perceived rotation direction is genuinely bistable (Wallach & O'Connell
//   1953; Ullman 1979; Kayahara's Spinning Dancer 2003).
//
//   The figure always spins the same real way about Y; a signed `bias` adds a
//   tiny REAL tilt about the horizontal axis, which is the ONLY thing that can
//   disambiguate the percept. A slow seeded autonomous drift lets the bias
//   wander gently through zero so the figure can "flip" hands-off.
//
//   A noise field of randomly-moving decoy dots (deterministic mulberry32) can
//   bury the walker — the 2026 expectation/detection finding: at high noise the
//   figure only pops out once your brain locks on.
//
//   SAFETY: rotation is slow (full turn ≥ 6 s), dot size & brightness are
//   constant — no strobe, no flicker.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from "three";
import { JOINT_COUNT, applyPose, mulberry32 } from "./figure";

const IVORY = 0xf3ecda; // warm off-white dots
const SLATE = 0x18212f; // deep slate-blue ground
const VIEW_HALF = 2.45; // world half-height of the ortho frustum
const MAX_DECOYS = 140;
const BASE_TURN_SECONDS = 8; // one full turn at speed multiplier 1

/** Probe for a usable WebGL context before constructing the renderer. */
export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

/** A soft round sprite so PointsMaterial renders discs, not squares. */
function makeDotTexture(): THREE.Texture {
  const size = 64;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  grad.addColorStop(0.0, "rgba(255,255,255,1)");
  grad.addColorStop(0.55, "rgba(255,255,255,1)");
  grad.addColorStop(0.8, "rgba(255,255,255,0.55)");
  grad.addColorStop(1.0, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.beginPath();
  g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

interface Decoy {
  cx: number;
  cy: number;
  ax: number;
  ay: number;
  fx: number;
  fy: number;
  px: number;
  py: number;
}

export interface DancerSample {
  /** Effective bias driving the visual tilt & audio, −1..+1. */
  effBias: number;
  /** userBias component alone (drag/slider), −1..+1. */
  userBias: number;
}

export class KineticDancer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;

  private tiltGroup: THREE.Group; // rotation.x = bias tilt
  private spinGroup: THREE.Group; // rotation.y = the pirouette
  private figurePts: THREE.Points;
  private figureGeo: THREE.BufferGeometry;
  private figurePos: Float32Array;

  private decoyPts: THREE.Points;
  private decoyGeo: THREE.BufferGeometry;
  private decoyPos: Float32Array;
  private decoys: Decoy[] = [];

  private dotMat: THREE.PointsMaterial;
  private dotTex: THREE.Texture;

  private container: HTMLElement;
  private raf = 0;
  private t0 = performance.now();
  private last = this.t0;
  private theta = 0;

  // bias / percept control
  private userBias = 0;
  private drift = 0;
  private driftVel = 0;
  private dragging = false;
  private driftEnabled = true;
  private visualBias = true;
  private reduced = false;

  private speed = 1;
  private noise = 0;
  private rng: () => number;
  private onSample?: (s: DancerSample) => void;

  constructor(
    container: HTMLElement,
    opts: { seed?: number; onSample?: (s: DancerSample) => void } = {},
  ) {
    this.container = container;
    this.onSample = opts.onSample;
    this.rng = mulberry32(opts.seed ?? 0x1129);

    const w = container.clientWidth || 640;
    const h = container.clientHeight || 480;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(SLATE, 1);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    const aspect = w / h;
    this.camera = new THREE.OrthographicCamera(
      -VIEW_HALF * aspect,
      VIEW_HALF * aspect,
      VIEW_HALF,
      -VIEW_HALF,
      0.1,
      100,
    );
    this.camera.position.set(0, 0, 10);
    this.camera.lookAt(0, 0, 0);

    this.dotTex = makeDotTexture();
    this.dotMat = new THREE.PointsMaterial({
      color: IVORY,
      size: 12,
      sizeAttenuation: false, // equal-size flat dots — no depth cue
      map: this.dotTex,
      transparent: true,
      alphaTest: 0.35,
      depthTest: false,
      depthWrite: false,
    });

    // ── Figure cloud ─────────────────────────────────────────────────────────
    this.figurePos = new Float32Array(JOINT_COUNT * 3);
    applyPose(0, 1, this.figurePos);
    this.figureGeo = new THREE.BufferGeometry();
    this.figureGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(this.figurePos, 3),
    );
    this.figurePts = new THREE.Points(this.figureGeo, this.dotMat);
    this.figurePts.renderOrder = 2;

    this.spinGroup = new THREE.Group();
    this.spinGroup.add(this.figurePts);
    this.tiltGroup = new THREE.Group();
    this.tiltGroup.add(this.spinGroup);
    this.scene.add(this.tiltGroup);

    // ── Decoy noise field (independent random motion, drawn flat at z≈0) ──────
    this.decoyPos = new Float32Array(MAX_DECOYS * 3);
    for (let i = 0; i < MAX_DECOYS; i++) {
      const d: Decoy = {
        cx: (this.rng() * 2 - 1) * VIEW_HALF * aspect,
        cy: (this.rng() * 2 - 1) * VIEW_HALF,
        ax: 0.3 + this.rng() * 1.4,
        ay: 0.3 + this.rng() * 1.4,
        fx: 0.15 + this.rng() * 0.5,
        fy: 0.15 + this.rng() * 0.5,
        px: this.rng() * Math.PI * 2,
        py: this.rng() * Math.PI * 2,
      };
      this.decoys.push(d);
      this.decoyPos[i * 3] = d.cx;
      this.decoyPos[i * 3 + 1] = d.cy;
      this.decoyPos[i * 3 + 2] = 0;
    }
    this.decoyGeo = new THREE.BufferGeometry();
    this.decoyGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(this.decoyPos, 3),
    );
    this.decoyGeo.setDrawRange(0, 0);
    this.decoyPts = new THREE.Points(this.decoyGeo, this.dotMat);
    this.decoyPts.renderOrder = 1;
    this.scene.add(this.decoyPts);

    window.addEventListener("resize", this.onResize);
  }

  private onResize = () => {
    const w = this.container.clientWidth || 640;
    const h = this.container.clientHeight || 480;
    const aspect = w / h;
    this.camera.left = -VIEW_HALF * aspect;
    this.camera.right = VIEW_HALF * aspect;
    this.camera.top = VIEW_HALF;
    this.camera.bottom = -VIEW_HALF;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  start() {
    this.last = performance.now();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.frame();
    };
    this.raf = requestAnimationFrame(loop);
  }

  private frame() {
    const now = performance.now();
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.1) dt = 0.1; // clamp after tab-switch
    const t = (now - this.t0) / 1000;

    // ── Spin: always the same real direction, slow (turn ≥ 6 s) ──────────────
    const turn = BASE_TURN_SECONDS / Math.max(0.35, this.speed);
    this.theta += (dt / turn) * Math.PI * 2 * (this.reduced ? 0.6 : 1);
    this.spinGroup.rotation.y = this.theta;

    // ── Bias dynamics: drag holds, otherwise decays; drift wanders slowly ─────
    if (!this.dragging) {
      this.userBias *= this.reduced ? 0.96 : 0.985; // gentle settle to centre
    }
    if (this.driftEnabled && !this.reduced) {
      // A soft seeded random-walk that pulls back toward zero → the bias
      // meanders across the ambiguous midline and the figure can flip hands-off.
      this.driftVel += (this.rng() - 0.5) * 0.0009 - this.drift * 0.0012;
      this.driftVel *= 0.97;
      this.drift = Math.max(-0.55, Math.min(0.55, this.drift + this.driftVel));
    } else {
      this.drift *= 0.98;
    }

    const effBias = Math.max(
      -1,
      Math.min(1, this.userBias + (this.driftEnabled ? this.drift : 0)),
    );
    // The disambiguating tilt (real 3D). Zeroed in audio-only mode so there is
    // no visual cue at all — only the sound can tip the percept.
    const tilt = this.visualBias ? effBias * 0.34 : 0;
    this.tiltGroup.rotation.x = tilt;

    // ── Animate the local pose (breathing / limb sway) ───────────────────────
    applyPose(t, this.reduced ? 0.4 : 1, this.figurePos);
    (this.figureGeo.attributes.position as THREE.BufferAttribute).needsUpdate =
      true;

    // ── Decoy noise field ────────────────────────────────────────────────────
    const visible = Math.round(this.noise * MAX_DECOYS);
    for (let i = 0; i < visible; i++) {
      const d = this.decoys[i];
      this.decoyPos[i * 3] = d.cx + Math.sin(t * d.fx + d.px) * d.ax;
      this.decoyPos[i * 3 + 1] = d.cy + Math.sin(t * d.fy + d.py) * d.ay;
    }
    this.decoyGeo.setDrawRange(0, visible);
    if (visible > 0) {
      (this.decoyGeo.attributes.position as THREE.BufferAttribute).needsUpdate =
        true;
    }

    this.renderer.render(this.scene, this.camera);

    this.onSample?.({ effBias, userBias: this.userBias });
  }

  // ── Controls ───────────────────────────────────────────────────────────────
  /** Horizontal drag delta (normalised −1..1 of canvas width) nudges the bias. */
  nudge(dxNorm: number) {
    this.userBias = Math.max(-1, Math.min(1, this.userBias + dxNorm * 1.6));
  }
  setUserBias(v: number) {
    this.userBias = Math.max(-1, Math.min(1, v));
  }
  setDragging(b: boolean) {
    this.dragging = b;
  }
  setSpeed(mult: number) {
    this.speed = Math.max(0.35, Math.min(2.5, mult));
  }
  setNoise(n: number) {
    this.noise = Math.max(0, Math.min(1, n));
  }
  setDriftEnabled(b: boolean) {
    this.driftEnabled = b;
  }
  setVisualBias(b: boolean) {
    this.visualBias = b;
  }
  setReducedMotion(b: boolean) {
    this.reduced = b;
  }
  getEffBias(): number {
    return Math.max(
      -1,
      Math.min(1, this.userBias + (this.driftEnabled ? this.drift : 0)),
    );
  }
  getUserBias(): number {
    return this.userBias;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    this.figureGeo.dispose();
    this.decoyGeo.dispose();
    this.dotMat.dispose();
    this.dotTex.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    const el = this.renderer.domElement;
    if (el.parentNode) el.parentNode.removeChild(el);
  }
}
