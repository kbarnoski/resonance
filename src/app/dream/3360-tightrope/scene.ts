// ─────────────────────────────────────────────────────────────────────────────
// scene.ts — the 3-D circus (three.js, real geometry — NOT a fragment shader).
//
//   A wire strung along the depth axis (z) from a near start platform to a far
//   platform. A stylised walker — torso, head, legs, and a long balance pole —
//   stands on the wire and walks INTO the scene as he makes progress, receding
//   toward the far platform (the natural "distance to safety" cue). He LEANS
//   visibly: the whole body pivots at the feet by the balance angle, tipping left
//   or right on screen and swinging the pole with him.
//
//   Instanced geometry: an audience of ~180 instanced pillars lines both sides of
//   the wire, receding into the dark. They lean inward and pulse when the walker
//   wobbles — the crowd holding its breath. A single circus spotlight tracks him.
//
//   Everything is built from primitives and disposed on teardown. If a WebGL
//   context can't be created the constructor throws and the page shows a notice.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from "three";
import type { WalkerState } from "./physics";

const NEAR_Z = 7; // start platform (near camera)
const FAR_Z = -9; // far platform (safety)
const WIRE_Y = 1.7; // wire height above the void
const AUDIENCE_ROWS = 3;
const AUDIENCE_PER_ROW = 30;
const AUDIENCE_COUNT = AUDIENCE_ROWS * AUDIENCE_PER_ROW * 2; // both sides

const COL_CALM = new THREE.Color(0x8ea0c8); // wire at rest
const COL_TENSE = new THREE.Color(0xb64d7a); // wire under tension

export class TightropeScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private container: HTMLElement;

  private walker: THREE.Group;
  private pole: THREE.Mesh;
  private wire: THREE.Mesh;
  private wireMat: THREE.MeshStandardMaterial;
  private farPlatform: THREE.Mesh;
  private farMat: THREE.MeshStandardMaterial;
  private spot: THREE.SpotLight;

  private audience: THREE.InstancedMesh;
  private audienceBase: { x: number; z: number; h: number }[] = [];
  private tmpObj = new THREE.Object3D();

  private disposables: { dispose(): void }[] = [];
  private fallAnim = 0;
  private camX = 0;

  constructor(container: HTMLElement) {
    this.container = container;
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = false;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x06070d);
    this.scene.fog = new THREE.Fog(0x06070d, 10, 26);

    this.camera = new THREE.PerspectiveCamera(48, w / h, 0.1, 100);
    this.camera.position.set(0, WIRE_Y + 1.0, NEAR_Z + 4);
    this.camera.lookAt(0, WIRE_Y + 0.2, 0);

    // ── Lighting: restrained, with one circus spotlight ──────────────────────
    const ambient = new THREE.AmbientLight(0x2a3050, 0.7);
    this.scene.add(ambient);
    const rim = new THREE.DirectionalLight(0x4455aa, 0.35);
    rim.position.set(-4, 6, 4);
    this.scene.add(rim);

    this.spot = new THREE.SpotLight(0xf0e6d0, 40, 30, 0.5, 0.5, 1.2);
    this.spot.position.set(0, WIRE_Y + 6, NEAR_Z);
    this.spot.target.position.set(0, WIRE_Y, NEAR_Z);
    this.scene.add(this.spot);
    this.scene.add(this.spot.target);

    // ── The wire ──────────────────────────────────────────────────────────────
    const wireLen = NEAR_Z - FAR_Z;
    const wireGeo = new THREE.CylinderGeometry(0.02, 0.02, wireLen, 8);
    this.wireMat = new THREE.MeshStandardMaterial({
      color: COL_CALM,
      emissive: COL_CALM,
      emissiveIntensity: 0.4,
      roughness: 0.4,
      metalness: 0.3,
    });
    this.wire = new THREE.Mesh(wireGeo, this.wireMat);
    this.wire.rotation.x = Math.PI / 2; // lie along z
    this.wire.position.set(0, WIRE_Y, (NEAR_Z + FAR_Z) / 2);
    this.scene.add(this.wire);
    this.disposables.push(wireGeo, this.wireMat);

    // ── Platforms ─────────────────────────────────────────────────────────────
    const platGeo = new THREE.BoxGeometry(2.2, 0.4, 1.6);
    const nearMat = new THREE.MeshStandardMaterial({
      color: 0x1a2036,
      roughness: 0.9,
      metalness: 0.1,
    });
    const nearPlat = new THREE.Mesh(platGeo, nearMat);
    nearPlat.position.set(0, WIRE_Y - 0.2, NEAR_Z + 0.7);
    this.scene.add(nearPlat);

    this.farMat = new THREE.MeshStandardMaterial({
      color: 0x1a2036,
      emissive: new THREE.Color(0x3a6f5a),
      emissiveIntensity: 0.5,
      roughness: 0.7,
      metalness: 0.1,
    });
    this.farPlatform = new THREE.Mesh(platGeo, this.farMat);
    this.farPlatform.position.set(0, WIRE_Y - 0.2, FAR_Z - 0.7);
    this.scene.add(this.farPlatform);
    this.disposables.push(platGeo, nearMat, this.farMat);

    // ── The walker ────────────────────────────────────────────────────────────
    this.walker = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xe8e4de,
      roughness: 0.5,
      metalness: 0.05,
    });
    const poleMat = new THREE.MeshStandardMaterial({
      color: 0x9a86f0,
      emissive: new THREE.Color(0x5a44b0),
      emissiveIntensity: 0.4,
      roughness: 0.3,
      metalness: 0.4,
    });
    this.disposables.push(bodyMat, poleMat);

    const torsoGeo = new THREE.CylinderGeometry(0.1, 0.13, 0.55, 12);
    const torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.position.y = 0.62;
    this.walker.add(torso);

    const headGeo = new THREE.SphereGeometry(0.13, 16, 12);
    const head = new THREE.Mesh(headGeo, bodyMat);
    head.position.y = 1.0;
    this.walker.add(head);

    const legGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.36, 8);
    const legL = new THREE.Mesh(legGeo, bodyMat);
    legL.position.set(-0.06, 0.18, 0);
    const legR = new THREE.Mesh(legGeo, bodyMat);
    legR.position.set(0.06, 0.18, 0);
    this.walker.add(legL, legR);

    const poleGeo = new THREE.CylinderGeometry(0.018, 0.018, 3.0, 8);
    this.pole = new THREE.Mesh(poleGeo, poleMat);
    this.pole.rotation.z = Math.PI / 2; // horizontal, across the wire (x axis)
    this.pole.position.y = 0.72;
    this.walker.add(this.pole);
    this.disposables.push(torsoGeo, headGeo, legGeo, poleGeo);

    this.walker.position.set(0, WIRE_Y, NEAR_Z);
    this.scene.add(this.walker);

    // ── Instanced audience ────────────────────────────────────────────────────
    const audGeo = new THREE.CylinderGeometry(0.12, 0.16, 1.0, 6);
    const audMat = new THREE.MeshStandardMaterial({
      color: 0x141a2e,
      roughness: 0.95,
      metalness: 0.0,
    });
    this.audience = new THREE.InstancedMesh(audGeo, audMat, AUDIENCE_COUNT);
    this.audience.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const color = new THREE.Color();
    let i = 0;
    for (const side of [-1, 1]) {
      for (let row = 0; row < AUDIENCE_ROWS; row++) {
        for (let n = 0; n < AUDIENCE_PER_ROW; n++) {
          const z = NEAR_Z - (n / (AUDIENCE_PER_ROW - 1)) * (NEAR_Z - FAR_Z);
          const x = side * (2.4 + row * 1.0 + Math.random() * 0.3);
          const height = 0.7 + Math.random() * 0.7;
          this.audienceBase.push({ x, z, h: height });
          this.tmpObj.position.set(x, WIRE_Y - 1.2 + height / 2, z);
          this.tmpObj.scale.set(1, height, 1);
          this.tmpObj.rotation.set(0, 0, 0);
          this.tmpObj.updateMatrix();
          this.audience.setMatrixAt(i, this.tmpObj.matrix);
          const shade = 0.06 + Math.random() * 0.08;
          color.setRGB(shade * 0.8, shade * 0.9, shade * 1.3);
          this.audience.setColorAt(i, color);
          i++;
        }
      }
    }
    this.audience.instanceMatrix.needsUpdate = true;
    if (this.audience.instanceColor) this.audience.instanceColor.needsUpdate = true;
    this.scene.add(this.audience);
    this.disposables.push(audGeo, audMat);
  }

  /** Update the whole scene from the walker's balance state. */
  render(state: WalkerState, dt: number): void {
    const z = NEAR_Z + (FAR_Z - NEAR_Z) * state.progress;

    // Fall / win body animation.
    let dropY = 0;
    let leanRender = state.lean;
    if (state.fallen) {
      this.fallAnim = Math.min(1, this.fallAnim + dt * 0.8);
      const e = this.fallAnim;
      leanRender = state.lean + Math.sign(state.lean || 1) * e * 1.4;
      dropY = -e * e * 4.5;
    } else {
      this.fallAnim = 0;
    }

    this.walker.position.set(0, WIRE_Y + dropY, z);
    this.walker.rotation.z = -leanRender; // +lean tips screen-right
    this.walker.rotation.x = state.fallen ? this.fallAnim * 1.2 : 0;

    // Spotlight tracks him.
    this.spot.position.set(0, WIRE_Y + 6, z + 0.5);
    this.spot.target.position.set(0, WIRE_Y + dropY, z);

    // Camera gently follows depth so he stays framed as he recedes; a whisper of
    // lateral sway toward his lean adds precariousness.
    this.camX += (state.lean * 0.6 - this.camX) * Math.min(1, dt * 3);
    const camZ = NEAR_Z + 4 + (FAR_Z - NEAR_Z) * state.progress * 0.35;
    this.camera.position.set(this.camX, WIRE_Y + 1.0, camZ);
    this.camera.lookAt(this.camX * 0.4, WIRE_Y + 0.2, z * 0.5);

    // Wire shimmers toward hot pink with tension; the far platform brightens as
    // safety nears.
    this.wireMat.color.copy(COL_CALM).lerp(COL_TENSE, state.wobble);
    this.wireMat.emissive.copy(COL_CALM).lerp(COL_TENSE, state.wobble);
    this.wireMat.emissiveIntensity = 0.35 + state.wobble * 0.9;
    this.farMat.emissiveIntensity = 0.4 + state.progress * 1.4;

    // Audience leans in and pulses with the wobble — the crowd holding its breath.
    const pulse = state.wobble;
    for (let i = 0; i < this.audienceBase.length; i++) {
      const b = this.audienceBase[i];
      const lean = pulse * 0.25 * (b.x < 0 ? 1 : -1);
      const bob = 1 + pulse * 0.12 * Math.sin(i * 1.7 + performance.now() * 0.004);
      this.tmpObj.position.set(b.x, WIRE_Y - 1.2 + (b.h * bob) / 2, b.z);
      this.tmpObj.scale.set(1, b.h * bob, 1);
      this.tmpObj.rotation.set(0, 0, lean);
      this.tmpObj.updateMatrix();
      this.audience.setMatrixAt(i, this.tmpObj.matrix);
    }
    this.audience.instanceMatrix.needsUpdate = true;

    this.renderer.render(this.scene, this.camera);
  }

  resetVisual(): void {
    this.fallAnim = 0;
    this.camX = 0;
    this.walker.position.set(0, WIRE_Y, NEAR_Z);
    this.walker.rotation.set(0, 0, 0);
  }

  resize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.audience.dispose();
    this.renderer.dispose();
    const el = this.renderer.domElement;
    el.parentElement?.removeChild(el);
  }
}
