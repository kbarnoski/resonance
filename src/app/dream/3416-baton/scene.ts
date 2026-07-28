// ─────────────────────────────────────────────────────────────────────────────
// scene.ts — the ensemble rendered as three.js (NOT Canvas2D).
//
//   Three emissive orbs on a ring — one per voice. Angle = the voice's slot,
//   brightness = its current audio level. When you conduct tightly the orbs
//   lock into a clean equilateral triangle, saturated violet. As instability
//   rises they scatter off the ring, wobble, and DESATURATE toward grey — and a
//   red halo bleeds in: the "LOST THE PULSE" state is legible on the art itself.
//   A small conductor marker follows your motion centroid, and every beat gives
//   a gentle pulse (≤3 Hz, small amplitude — no hard strobe).
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from "three";

export interface SceneState {
  levels: [number, number, number];
  instability: number;
  tightness: number;
  centroidX: number; // -1..1
  beatPulse: number; // 0..1 per-beat envelope
  downbeat: number; // 0..1, stronger on beat 1 of the bar
}

const RING_R = 2.2;
const BASE_ANGLES = [Math.PI / 2, Math.PI / 2 + (2 * Math.PI) / 3, Math.PI / 2 + (4 * Math.PI) / 3];
const VOICE_HUE = [0.72, 0.77, 0.68]; // violet arc (bass, pad, lead)
const RED_HUE = 0.99;

export class BatonScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private container: HTMLElement;
  private reduced: boolean;

  private orbs: THREE.Mesh[] = [];
  private orbMats: THREE.MeshStandardMaterial[] = [];
  private ring: THREE.Mesh;
  private ringMat: THREE.MeshBasicMaterial;
  private marker: THREE.Mesh;
  private markerMat: THREE.MeshBasicMaterial;
  private light: THREE.PointLight;
  private disposables: { dispose(): void }[] = [];
  private t = 0;
  private markerX = 0;

  constructor(container: HTMLElement, reduced = false) {
    this.container = container;
    this.reduced = reduced;
    const w = container.clientWidth || 640;
    const h = container.clientHeight || 400;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(0x07060d, 1);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x07060d, 0.12);

    this.camera = new THREE.PerspectiveCamera(46, w / h, 0.1, 100);
    this.camera.position.set(0, 0.4, 7.2);
    this.camera.lookAt(0, 0, 0);

    this.scene.add(new THREE.AmbientLight(0x20213a, 0.8));
    this.light = new THREE.PointLight(0xbfa8ff, 18, 40, 2);
    this.light.position.set(0, 1.5, 4);
    this.scene.add(this.light);

    // faint reference ring
    const ringGeo = new THREE.TorusGeometry(RING_R, 0.012, 8, 96);
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0x3a2d66, transparent: true, opacity: 0.5 });
    this.ring = new THREE.Mesh(ringGeo, this.ringMat);
    this.ring.rotation.x = Math.PI / 2.3;
    this.scene.add(this.ring);
    this.disposables.push(ringGeo, this.ringMat);

    // three orbs
    const orbGeo = new THREE.SphereGeometry(0.42, 32, 24);
    this.disposables.push(orbGeo);
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(VOICE_HUE[i], 0.7, 0.5),
        emissive: new THREE.Color().setHSL(VOICE_HUE[i], 0.8, 0.5),
        emissiveIntensity: 0.4,
        roughness: 0.35,
        metalness: 0.1,
      });
      const orb = new THREE.Mesh(orbGeo, mat);
      this.orbs.push(orb);
      this.orbMats.push(mat);
      this.disposables.push(mat);
      this.scene.add(orb);
    }

    // conductor marker
    const mGeo = new THREE.SphereGeometry(0.12, 16, 12);
    this.markerMat = new THREE.MeshBasicMaterial({ color: 0xede9fe });
    this.marker = new THREE.Mesh(mGeo, this.markerMat);
    this.marker.position.set(0, -2.4, 1.5);
    this.scene.add(this.marker);
    this.disposables.push(mGeo, this.markerMat);
  }

  update(s: SceneState, dt: number) {
    this.t += dt;
    const wob = this.reduced ? 0.25 : 1;
    const instab = s.instability;

    // conductor marker eases toward the motion centroid
    this.markerX += (s.centroidX * 2.6 - this.markerX) * Math.min(1, dt * 6);
    this.marker.position.x = this.markerX;
    const mLevel = 0.5 + s.beatPulse * 0.5;
    this.markerMat.color.setHSL(0.72, 0.4, 0.6 + mLevel * 0.25);

    // gentle downbeat pulse on the light (≤3 Hz, small amplitude)
    this.light.intensity = 14 + s.downbeat * (this.reduced ? 5 : 12);

    // ring desaturates + reddens with instability
    this.ringMat.color.setHSL(
      lerp(0.72, RED_HUE, instab),
      lerp(0.5, 0.85, instab),
      lerp(0.28, 0.4, instab),
    );
    this.ringMat.opacity = 0.35 + s.tightness * 0.4;

    for (let i = 0; i < 3; i++) {
      const orb = this.orbs[i];
      const mat = this.orbMats[i];
      const level = s.levels[i];

      // scatter: locked triangle when tight, wander when unstable
      const scatterA = instab * wob * (Math.sin(this.t * (1.3 + i) + i * 2) * 0.5);
      const scatterR = instab * wob * (Math.sin(this.t * (0.9 + i * 0.4) + i) * 0.55);
      const scatterY = instab * wob * Math.sin(this.t * (1.7 + i * 0.3) + i * 3) * 0.6;
      const ang = BASE_ANGLES[i] + scatterA;
      const r = RING_R + scatterR;
      const px = Math.cos(ang) * r;
      const py = Math.sin(ang) * r * 0.55 + scatterY; // squashed to match ring tilt
      orb.position.set(px, py, Math.sin(ang) * r * 0.28);

      // brightness from level + beat pulse; scale gently on the beat
      const pulse = 1 + s.beatPulse * (this.reduced ? 0.04 : 0.1);
      const scl = (0.75 + level * 0.6) * pulse;
      orb.scale.setScalar(scl);
      mat.emissiveIntensity = 0.3 + level * 2.2 + s.beatPulse * 0.3;

      // colour: saturated violet when tight → desaturated + red when lost
      const hue = lerp(VOICE_HUE[i], RED_HUE, instab * 0.85);
      const sat = lerp(0.82, 0.25, instab);
      mat.color.setHSL(hue, sat, 0.5);
      mat.emissive.setHSL(hue, Math.min(0.9, sat + 0.1), 0.5);
    }

    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const w = this.container.clientWidth || 640;
    const h = this.container.clientHeight || 400;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
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

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
