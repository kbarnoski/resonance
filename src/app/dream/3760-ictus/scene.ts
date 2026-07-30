// ─────────────────────────────────────────────────────────────────────────────
// scene.ts — the instrument rendered in three.js (WebGL, 3D). NOT Canvas2D.
//
//   A tilted bar-grid RING lies in the world. Eight slot posts stand around it —
//   the eighth-note grid you play against. A bright PLAYHEAD orbits the ring at
//   the current bar phase, flaring on the downbeat. Locked contacts bloom as
//   glowing posts fanned across the ring width (one lane per limb) and PULSE
//   each time the loop passes them. Off-grid strikes spawn a red GHOST that
//   drifts off the ring and fades — the miss is legible on the art itself. Your
//   four strike limbs float above the ring as emissive orbs; a translucent
//   STRIKE PLANE marks the surface a downward strike crosses.
//
//   Palette: warm-violet on near-black (raw color is allowed inside the art).
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from "three";
import { SLOTS_PER_BAR, LIMBS } from "./sequencer";

const RING_R = 2.6;
const RING_TILT = Math.PI / 2.35;
// Violet arc, one hue per limb (L-hand … R-foot). Raw art color, on-brand.
const LIMB_HUE = [0.72, 0.78, 0.66, 0.83];
const RED_HUE = 0.99;

export interface LimbView {
  x: number; // -1..1 scene X (already mirrored)
  y: number; // -1..1 scene Y (up positive)
  present: boolean;
  flash: number; // 0..1 strike flash, decays in caller
}

export interface FrameState {
  limbs: LimbView[];
  phase: number; // 0..1 position within the bar
  downbeatPulse: number; // 0..1 envelope, strong on beat 1
  groove: number; // 0..1 groove-lock score
  lean: number; // 0..1 (colour warmth cue)
}

interface Ghost {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  vx: number;
  vy: number;
}

export class IctusScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private container: HTMLElement;
  private reduced: boolean;
  private disposables: { dispose(): void }[] = [];

  private ring: THREE.Mesh;
  private ringMat: THREE.MeshBasicMaterial;
  private playhead: THREE.Mesh;
  private playheadMat: THREE.MeshBasicMaterial;
  private light: THREE.PointLight;
  private plane: THREE.Mesh;
  private planeMat: THREE.MeshBasicMaterial;

  private slotPosts: THREE.Mesh[] = [];
  private slotMats: THREE.MeshBasicMaterial[] = [];

  // locked-contact markers, index = slot * LIMBS + limb
  private markers: THREE.Mesh[] = [];
  private markerMats: THREE.MeshStandardMaterial[] = [];
  private markerActive: number[] = new Array(SLOTS_PER_BAR * LIMBS).fill(0);
  private markerPulse: number[] = new Array(SLOTS_PER_BAR * LIMBS).fill(0);

  private limbOrbs: THREE.Mesh[] = [];
  private limbMats: THREE.MeshStandardMaterial[] = [];

  private ghosts: Ghost[] = [];
  private ghostGeo: THREE.SphereGeometry;

  private t = 0;

  constructor(container: HTMLElement, reduced = false) {
    this.container = container;
    this.reduced = reduced;
    const w = container.clientWidth || 640;
    const h = container.clientHeight || 400;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(0x06040d, 1);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x06040d, 0.11);

    this.camera = new THREE.PerspectiveCamera(48, w / h, 0.1, 100);
    this.camera.position.set(0, 2.6, 7.4);
    this.camera.lookAt(0, -0.2, 0);

    this.scene.add(new THREE.AmbientLight(0x241a3d, 0.9));
    this.light = new THREE.PointLight(0xbfa8ff, 16, 46, 2);
    this.light.position.set(0, 3, 5);
    this.scene.add(this.light);

    // the bar-grid ring
    const ringGeo = new THREE.TorusGeometry(RING_R, 0.02, 10, 128);
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0x4a2f8f,
      transparent: true,
      opacity: 0.55,
    });
    this.ring = new THREE.Mesh(ringGeo, this.ringMat);
    this.ring.rotation.x = RING_TILT;
    this.scene.add(this.ring);
    this.disposables.push(ringGeo, this.ringMat);

    // eight slot posts around the ring (beats accented brighter)
    const postGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.5, 10);
    this.disposables.push(postGeo);
    for (let s = 0; s < SLOTS_PER_BAR; s++) {
      const isBeat = s % 2 === 0;
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(0.73, 0.5, isBeat ? 0.5 : 0.32),
        transparent: true,
        opacity: isBeat ? 0.75 : 0.4,
      });
      const post = new THREE.Mesh(postGeo, mat);
      const a = this.slotAngle(s);
      const p = this.ringPoint(a, RING_R);
      post.position.set(p.x, p.y, p.z);
      this.slotPosts.push(post);
      this.slotMats.push(mat);
      this.disposables.push(mat);
      this.scene.add(post);
    }

    // locked-contact markers (glowing spheres), fanned in 4 lanes across width
    const markGeo = new THREE.SphereGeometry(0.16, 20, 16);
    this.disposables.push(markGeo);
    for (let s = 0; s < SLOTS_PER_BAR; s++) {
      for (let l = 0; l < LIMBS; l++) {
        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color().setHSL(LIMB_HUE[l], 0.8, 0.55),
          emissive: new THREE.Color().setHSL(LIMB_HUE[l], 0.9, 0.5),
          emissiveIntensity: 0.6,
          roughness: 0.3,
          metalness: 0.1,
        });
        const m = new THREE.Mesh(markGeo, mat);
        const a = this.slotAngle(s);
        const laneR = RING_R + (l - (LIMBS - 1) / 2) * 0.26;
        const p = this.ringPoint(a, laneR);
        m.position.set(p.x, p.y, p.z);
        m.scale.setScalar(0.001);
        this.markers.push(m);
        this.markerMats.push(mat);
        this.disposables.push(mat);
        this.scene.add(m);
      }
    }

    // playhead orbiting the ring
    const phGeo = new THREE.SphereGeometry(0.2, 24, 18);
    this.playheadMat = new THREE.MeshBasicMaterial({ color: 0xf1ecff });
    this.playhead = new THREE.Mesh(phGeo, this.playheadMat);
    this.scene.add(this.playhead);
    this.disposables.push(phGeo, this.playheadMat);

    // translucent strike plane (the surface a downward strike crosses)
    const planeGeo = new THREE.PlaneGeometry(7, 3.6);
    this.planeMat = new THREE.MeshBasicMaterial({
      color: 0x6d4fd0,
      transparent: true,
      opacity: 0.06,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.plane = new THREE.Mesh(planeGeo, this.planeMat);
    this.plane.rotation.x = -Math.PI / 2;
    this.plane.position.y = 0.55;
    this.scene.add(this.plane);
    this.disposables.push(planeGeo, this.planeMat);

    // four strike-limb orbs floating above the ring
    const orbGeo = new THREE.SphereGeometry(0.22, 24, 18);
    this.disposables.push(orbGeo);
    for (let l = 0; l < LIMBS; l++) {
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(LIMB_HUE[l], 0.75, 0.55),
        emissive: new THREE.Color().setHSL(LIMB_HUE[l], 0.85, 0.5),
        emissiveIntensity: 0.7,
        roughness: 0.25,
        metalness: 0.1,
        transparent: true,
        opacity: 0.9,
      });
      const orb = new THREE.Mesh(orbGeo, mat);
      orb.position.set((l - 1.5) * 0.8, 1.4, 2);
      orb.visible = false;
      this.limbOrbs.push(orb);
      this.limbMats.push(mat);
      this.disposables.push(mat);
      this.scene.add(orb);
    }

    this.ghostGeo = new THREE.SphereGeometry(0.17, 16, 12);
    this.disposables.push(this.ghostGeo);
  }

  private slotAngle(slot: number): number {
    // slot 0 at top of the ring, going clockwise
    return Math.PI / 2 - (slot / SLOTS_PER_BAR) * Math.PI * 2;
  }

  // point on the tilted ring at angle `a`, radius `r`
  private ringPoint(a: number, r: number): THREE.Vector3 {
    const x = Math.cos(a) * r;
    const yFlat = Math.sin(a) * r;
    // apply ring tilt about X
    const y = yFlat * Math.cos(RING_TILT);
    const z = yFlat * Math.sin(RING_TILT);
    return new THREE.Vector3(x, y, z);
  }

  /** A contact locked into the loop at (slot, limb). */
  onLock(slot: number, limb: number, strength: number): void {
    const i = slot * LIMBS + limb;
    this.markerActive[i] = Math.max(this.markerActive[i], 0.4 + strength * 0.6);
    this.markerPulse[i] = 1;
  }

  /** The loop passed a locked cell — pulse its marker in time. */
  onPulse(slot: number, limb: number): void {
    const i = slot * LIMBS + limb;
    this.markerPulse[i] = 1;
  }

  /** An off-grid strike — spawn a red ghost near the missed bar position. */
  onGhost(barFrac: number): void {
    const a = Math.PI / 2 - barFrac * Math.PI * 2;
    const p = this.ringPoint(a, RING_R);
    let g = this.ghosts.find((x) => x.life <= 0);
    if (!g) {
      if (this.ghosts.length > 24) return;
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(RED_HUE, 0.85, 0.55),
        transparent: true,
        opacity: 0.9,
      });
      const mesh = new THREE.Mesh(this.ghostGeo, mat);
      this.scene.add(mesh);
      this.disposables.push(mat);
      g = { mesh, mat, life: 0, vx: 0, vy: 0 };
      this.ghosts.push(g);
    }
    g.mesh.position.set(p.x, p.y + 0.1, p.z);
    g.mesh.scale.setScalar(1);
    g.life = 1;
    g.vx = (Math.random() - 0.5) * 1.2;
    g.vy = 0.6 + Math.random() * 0.5;
    g.mat.opacity = 0.9;
  }

  /** Rising-edge strike flash on a limb orb. */
  onStrike(limb: number): void {
    // handled through LimbView.flash in update(); kept for explicit calls
    const mat = this.limbMats[limb];
    if (mat) mat.emissiveIntensity = 3.2;
  }

  update(s: FrameState, dt: number): void {
    this.t += dt;
    const wob = this.reduced ? 0.35 : 1;

    // playhead orbit
    const a = this.slotAngle(s.phase * SLOTS_PER_BAR);
    const p = this.ringPoint(a, RING_R);
    this.playhead.position.set(p.x, p.y, p.z);
    const phScale = 1 + s.downbeatPulse * (this.reduced ? 0.2 : 0.6);
    this.playhead.scale.setScalar(phScale);
    this.playheadMat.color.setHSL(0.72, 0.35, 0.7 + s.downbeatPulse * 0.25);

    // downbeat light pulse (gentle) + groove tints the ring toward saturated violet
    this.light.intensity = 13 + s.downbeatPulse * (this.reduced ? 5 : 11);
    this.ringMat.color.setHSL(
      0.73,
      0.35 + s.groove * 0.45,
      0.28 + s.groove * 0.14,
    );
    this.ringMat.opacity = 0.4 + s.groove * 0.4;
    this.planeMat.opacity = 0.04 + s.lean * 0.08;

    // slot posts breathe when the playhead is near
    for (let sl = 0; sl < SLOTS_PER_BAR; sl++) {
      const dist = Math.abs(((s.phase * SLOTS_PER_BAR - sl + SLOTS_PER_BAR) %
        SLOTS_PER_BAR));
      const near = Math.max(0, 1 - Math.min(dist, SLOTS_PER_BAR - dist));
      const base = sl % 2 === 0 ? 0.5 : 0.32;
      this.slotMats[sl].opacity = (sl % 2 === 0 ? 0.55 : 0.32) + near * 0.4;
      this.slotPosts[sl].scale.y = 1 + near * 0.5;
      this.slotMats[sl].color.setHSL(0.73, 0.5, base + near * 0.2);
    }

    // locked markers: hold, pulse, decay
    for (let i = 0; i < this.markers.length; i++) {
      if (this.markerActive[i] <= 0.001) {
        if (this.markers[i].scale.x > 0.002) this.markers[i].scale.setScalar(0.001);
        continue;
      }
      this.markerPulse[i] = Math.max(0, this.markerPulse[i] - dt * 3.2);
      const limb = i % LIMBS;
      const base = 0.7 + this.markerActive[i] * 0.5;
      const scl = base * (1 + this.markerPulse[i] * (this.reduced ? 0.15 : 0.55));
      this.markers[i].scale.setScalar(scl * 0.6);
      this.markerMats[i].emissiveIntensity =
        0.5 + this.markerActive[i] * 1.2 + this.markerPulse[i] * 2.4;
      this.markerMats[i].emissive.setHSL(LIMB_HUE[limb], 0.9, 0.5);
    }

    // strike-limb orbs
    for (let l = 0; l < LIMBS; l++) {
      const lv = s.limbs[l];
      const orb = this.limbOrbs[l];
      const mat = this.limbMats[l];
      if (!lv || !lv.present) {
        mat.opacity = Math.max(0, mat.opacity - dt * 2);
        orb.visible = mat.opacity > 0.02;
        continue;
      }
      orb.visible = true;
      mat.opacity = Math.min(0.95, mat.opacity + dt * 4);
      // map normalized [-1,1] into scene space above the ring
      const tx = lv.x * 3.4;
      const ty = 0.6 + (lv.y * 0.5 + 0.5) * 2.6;
      orb.position.x += (tx - orb.position.x) * Math.min(1, dt * 12);
      orb.position.y += (ty - orb.position.y) * Math.min(1, dt * 12);
      orb.position.z = 2 - Math.max(0, lv.y) * 0.6;
      const flash = lv.flash;
      orb.scale.setScalar(1 + flash * 0.9 * wob);
      mat.emissiveIntensity = 0.7 + flash * 3;
    }

    // ghosts drift + fade
    for (const g of this.ghosts) {
      if (g.life <= 0) continue;
      g.life -= dt * 1.3;
      g.mesh.position.x += g.vx * dt;
      g.mesh.position.y += g.vy * dt;
      g.vy -= dt * 0.8;
      g.mesh.scale.setScalar(Math.max(0.001, g.life));
      g.mat.opacity = Math.max(0, g.life * 0.9);
      if (g.life <= 0) g.mesh.scale.setScalar(0.001);
    }

    this.renderer.render(this.scene, this.camera);
  }

  resize(): void {
    const w = this.container.clientWidth || 640;
    const h = this.container.clientHeight || 400;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  clearMarkers(): void {
    this.markerActive.fill(0);
    this.markerPulse.fill(0);
    for (const m of this.markers) m.scale.setScalar(0.001);
  }

  dispose(): void {
    for (const d of this.disposables) {
      try {
        d.dispose();
      } catch {
        /* noop */
      }
    }
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
