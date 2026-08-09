// ─────────────────────────────────────────────────────────────────────────────
// scene.ts — the luminous volume (three.js + bloom + afterimage).
//
//   The 2D active-nematic field is read into a deep, dark space. Behind hangs a
//   parallax star-veil; a faint field of short segments traces the director. The
//   defects are the stars: a +½ is a bright violet-white head trailing a comet
//   of its recent path; a −½ is a dimmer, cooler three-fold form that only
//   drifts. Everything is piped through UnrealBloomPass (jeweled glow) and a
//   light AfterimagePass (slow visionary tracers). When the braid locks the three +½
//   brighten and their trails weave a repeating mandala.
//
//   SAFETY: no strobe. Every brightness change is a slow lerp (≤ a few Hz);
//   bloom/afterimage never flash the full screen. prefers-reduced-motion damps
//   bloom, shortens tracers and slows the orbit.
//
//   Raw hex is permitted inside three.js material/colour code (design-system §6).
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { AfterimagePass } from "three/examples/jsm/postprocessing/AfterimagePass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import type { TrackedDefect } from "./nematic";
import { mulberry32 } from "./nematic";

const SPAN = 26; // world width the grid maps onto
const POOL = 48; // entity visual slots
const MAX_TRAIL = 46;

// Violet ramp (from _shared/palette).
const PLUS_COLOR = 0xc9b8ff; // violet-white +½ head
const MINUS_COLOR = 0x6366f1; // cool indigo −½
const VEIL_COLOR = 0x3a1d78;

export interface SceneFrame {
  defects: TrackedDefect[];
  N: number;
  veil: { pos: Float32Array; ang: Float32Array; count: number };
  confinement: { cx: number; cy: number; r: number; on: boolean };
  engagement: number;
  braidLocked: boolean;
  braidIds: number[];
}

function makeRadialTexture(): THREE.Texture {
  const s = 128;
  const cv = document.createElement("canvas");
  cv.width = cv.height = s;
  const g = cv.getContext("2d")!;
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.22, "rgba(255,255,255,0.6)");
  grad.addColorStop(0.5, "rgba(255,255,255,0.16)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(cv);
  tex.needsUpdate = true;
  return tex;
}

/** A soft three-lobed glow for the passive −½ (three-fold) entities. */
function makeTrefoilTexture(): THREE.Texture {
  const s = 128;
  const cv = document.createElement("canvas");
  cv.width = cv.height = s;
  const g = cv.getContext("2d")!;
  g.translate(s / 2, s / 2);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const lx = Math.cos(a) * s * 0.2;
    const ly = Math.sin(a) * s * 0.2;
    const grad = g.createRadialGradient(lx, ly, 0, lx, ly, s * 0.26);
    grad.addColorStop(0, "rgba(255,255,255,0.85)");
    grad.addColorStop(0.5, "rgba(255,255,255,0.14)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.arc(lx, ly, s * 0.26, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.needsUpdate = true;
  return tex;
}

interface Slot {
  halo: THREE.Sprite;
  trail: THREE.Line;
  trailPos: Float32Array;
  trailMat: THREE.LineBasicMaterial;
  haloMat: THREE.SpriteMaterial;
  id: number; // defect id currently shown, -1 if free
  glow: number; // smoothed brightness
}

export class CovenantScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private afterimage: AfterimagePass;
  private radialTex: THREE.Texture;
  private trefoilTex: THREE.Texture;
  private slots: Slot[] = [];
  private stars: THREE.Points;
  private starMat: THREE.PointsMaterial;
  private veilSeg: THREE.LineSegments;
  private veilGeo: THREE.BufferGeometry;
  private confRing: THREE.Line;
  private confMat: THREE.LineBasicMaterial;
  private reduced: boolean;
  private azimuth = 0;
  private azVel = 0;
  private bloomTarget = 0.9;
  private t = 0;

  constructor(canvas: HTMLCanvasElement, seed: number, reducedMotion: boolean) {
    this.reduced = reducedMotion;
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);
    this.renderer.setClearColor(0x04030a, 1);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x04030a, 0.012);

    this.camera = new THREE.PerspectiveCamera(52, w / h, 0.1, 200);
    this.camera.position.set(0, 0, 30);

    const rng = mulberry32(seed ^ 0x1d3);

    // ── parallax star-veil ──
    const starN = 700;
    const sp = new Float32Array(starN * 3);
    for (let i = 0; i < starN; i++) {
      sp[i * 3] = (rng() - 0.5) * SPAN * 2.6;
      sp[i * 3 + 1] = (rng() - 0.5) * SPAN * 2.6;
      sp[i * 3 + 2] = -20 - rng() * 40;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    this.starMat = new THREE.PointsMaterial({
      color: 0x8b5cf6,
      size: 0.22,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.stars = new THREE.Points(starGeo, this.starMat);
    this.scene.add(this.stars);

    // ── director veil (short segments, updated each frame) ──
    const maxVeil = 2600;
    this.veilGeo = new THREE.BufferGeometry();
    this.veilGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(maxVeil * 2 * 3), 3),
    );
    const veilMat = new THREE.LineBasicMaterial({
      color: VEIL_COLOR,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.veilSeg = new THREE.LineSegments(this.veilGeo, veilMat);
    this.scene.add(this.veilSeg);

    // ── confinement ring ──
    const ringPts: THREE.Vector3[] = [];
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      ringPts.push(new THREE.Vector3(Math.cos(a), Math.sin(a), 0));
    }
    const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPts);
    this.confMat = new THREE.LineBasicMaterial({
      color: 0x8b5cf6,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.confRing = new THREE.Line(ringGeo, this.confMat);
    this.scene.add(this.confRing);

    // ── entity pool ──
    this.radialTex = makeRadialTexture();
    this.trefoilTex = makeTrefoilTexture();
    for (let i = 0; i < POOL; i++) {
      const haloMat = new THREE.SpriteMaterial({
        map: this.radialTex,
        color: PLUS_COLOR,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const halo = new THREE.Sprite(haloMat);
      halo.scale.setScalar(1.6);
      halo.visible = false;
      this.scene.add(halo);

      const trailPos = new Float32Array(MAX_TRAIL * 3);
      const trailGeo = new THREE.BufferGeometry();
      trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
      trailGeo.setDrawRange(0, 0);
      const trailMat = new THREE.LineBasicMaterial({
        color: PLUS_COLOR,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const trail = new THREE.Line(trailGeo, trailMat);
      trail.visible = false;
      this.scene.add(trail);

      this.slots.push({ halo, trail, trailPos, trailMat, haloMat, id: -1, glow: 0 });
    }

    // ── post: bloom + afterimage ──
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(w, h),
      reducedMotion ? 0.6 : 0.95,
      0.72,
      0.0,
    );
    this.composer.addPass(this.bloom);
    this.afterimage = new AfterimagePass(reducedMotion ? 0.6 : 0.86);
    this.composer.addPass(this.afterimage);
    this.composer.addPass(new OutputPass());
    this.composer.setSize(w, h);
  }

  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private hit = new THREE.Vector3();

  /** Project a client-space pointer onto the field plane → grid coords. */
  pickGrid(clientX: number, clientY: number, N: number): { gx: number; gy: number } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    if (!this.raycaster.ray.intersectPlane(this.plane, this.hit)) return null;
    const gx = (this.hit.x / SPAN + 0.5) * N;
    const gy = (-this.hit.y / SPAN + 0.5) * N;
    return { gx, gy };
  }

  private gx(g: number, N: number): number {
    return (g / N - 0.5) * SPAN;
  }
  private gy(g: number, N: number): number {
    return -(g / N - 0.5) * SPAN;
  }

  frame(dt: number, f: SceneFrame): void {
    this.t += dt;
    const { N } = f;

    // ── slow auto-orbit (+ damped pointer nudge) ──
    const orbitBase = this.reduced ? 0.03 : 0.06;
    this.azimuth += (orbitBase + this.azVel) * dt;
    this.azVel *= Math.pow(0.02, dt);
    const R = 30;
    const tilt = Math.sin(this.t * 0.05) * 3;
    this.camera.position.set(
      Math.sin(this.azimuth) * R,
      tilt,
      Math.cos(this.azimuth) * R,
    );
    this.camera.lookAt(0, 0, 0);
    this.stars.rotation.z = this.azimuth * 0.05;

    // ── director veil ──
    const vcount = Math.min(f.veil.count, 2600);
    const vpos = this.veilGeo.getAttribute("position") as THREE.BufferAttribute;
    const varr = vpos.array as Float32Array;
    const L = 0.42;
    for (let k = 0; k < vcount; k++) {
      const cx = this.gx(f.veil.pos[k * 2], N);
      const cy = this.gy(f.veil.pos[k * 2 + 1], N);
      const a = f.veil.ang[k];
      const dx = Math.cos(a) * L;
      const dy = Math.sin(a) * L;
      const o = k * 6;
      varr[o] = cx - dx;
      varr[o + 1] = cy + dy;
      varr[o + 2] = -3;
      varr[o + 3] = cx + dx;
      varr[o + 4] = cy - dy;
      varr[o + 5] = -3;
    }
    this.veilGeo.setDrawRange(0, vcount * 2);
    vpos.needsUpdate = true;

    // ── confinement ring ──
    const targetRingOp = f.confinement.on ? 0.25 + 0.25 * f.engagement : 0;
    this.confMat.opacity += (targetRingOp - this.confMat.opacity) * Math.min(1, dt * 3);
    if (f.confinement.on) {
      const rad = (f.confinement.r / N) * SPAN;
      this.confRing.position.set(
        this.gx(f.confinement.cx, N),
        this.gy(f.confinement.cy, N),
        0,
      );
      this.confRing.scale.setScalar(rad);
    }

    // ── entity slot assignment ──
    const present = new Map<number, TrackedDefect>();
    for (const d of f.defects) present.set(d.id, d);
    // free slots whose defect vanished
    for (const s of this.slots) {
      if (s.id >= 0 && !present.has(s.id)) s.id = -1;
    }
    const shown = new Set(this.slots.filter((s) => s.id >= 0).map((s) => s.id));
    // assign new defects to free slots
    for (const d of f.defects) {
      if (shown.has(d.id)) continue;
      const free = this.slots.find((s) => s.id < 0);
      if (!free) break;
      free.id = d.id;
      free.glow = 0;
      shown.add(d.id);
    }

    // ── update each slot ──
    for (const s of this.slots) {
      if (s.id < 0) {
        s.halo.visible = false;
        s.trail.visible = false;
        continue;
      }
      const d = present.get(s.id)!;
      const isPlus = d.sign === 1;
      const braid = f.braidLocked && f.braidIds.includes(d.id);
      const wx = this.gx(d.x, N);
      const wy = this.gy(d.y, N);
      // depth by type + age: +½ float slightly forward, −½ sit back
      const wz = (isPlus ? 1.2 : -1.8) + Math.min(2, d.age * 0.15) * (isPlus ? 1 : 0);
      s.halo.position.set(wx, wy, wz);
      s.halo.visible = true;
      s.haloMat.map = isPlus ? this.radialTex : this.trefoilTex;
      s.haloMat.color.setHex(isPlus ? PLUS_COLOR : MINUS_COLOR);

      // brightness: +½ bright (brighter in braid), −½ dim; slow lerp (no strobe)
      const target = isPlus
        ? (braid ? 1.5 : 0.7 + Math.min(1, d.age / 3) * 0.3)
        : 0.32;
      s.glow += (target - s.glow) * Math.min(1, dt * 2.2);
      s.haloMat.opacity = s.glow;
      const size = isPlus ? (braid ? 2.6 : 1.7 + d.speed * 0.02) : 1.35;
      s.halo.scale.setScalar(size);

      // comet trail (only +½)
      if (isPlus && d.trail.length >= 4) {
        const n = Math.min(MAX_TRAIL, d.trail.length / 2);
        for (let k = 0; k < n; k++) {
          const ti = d.trail.length - n * 2 + k * 2;
          s.trailPos[k * 3] = this.gx(d.trail[ti], N);
          s.trailPos[k * 3 + 1] = this.gy(d.trail[ti + 1], N);
          s.trailPos[k * 3 + 2] = wz;
        }
        const tpos = s.trail.geometry.getAttribute("position") as THREE.BufferAttribute;
        tpos.needsUpdate = true;
        s.trail.geometry.setDrawRange(0, n);
        s.trailMat.color.setHex(PLUS_COLOR);
        s.trailMat.opacity = (braid ? 0.75 : 0.4) * s.glow;
        s.trail.visible = true;
      } else {
        s.trail.visible = false;
      }
    }

    // ── bloom: slightly richer when the braid locks; slow, ≤3 Hz ──
    const base = this.reduced ? 0.6 : 0.95;
    this.bloomTarget = f.braidLocked ? base + 0.3 : base;
    this.bloom.strength += (this.bloomTarget - this.bloom.strength) * Math.min(1, dt * 0.8);

    this.composer.render();
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w, h);
  }

  dispose(): void {
    for (const s of this.slots) {
      s.haloMat.dispose();
      s.trailMat.dispose();
      s.trail.geometry.dispose();
    }
    this.radialTex.dispose();
    this.trefoilTex.dispose();
    this.veilGeo.dispose();
    (this.veilSeg.material as THREE.Material).dispose();
    this.stars.geometry.dispose();
    this.starMat.dispose();
    this.confRing.geometry.dispose();
    this.confMat.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
