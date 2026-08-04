// ─────────────────────────────────────────────────────────────────────────────
// scene.ts — the spatial stem mixer (three.js).
//
//   Four glowing bodies float in space, one per stem, each with its own
//   character driven live by that stem's analyser level:
//
//     percussive → a cluster of sharp shards that brighten & jitter on hits
//     bass       → a large slow low sphere that swells with sub energy
//     body       → a luminous flowing point-field / ribbon that shimmers
//     air        → a fine high halo of points that glimmers overhead
//
//   The camera auto-orbits on load (alive with zero interaction); pointer/touch
//   drag looks around; a click on a body is reported so the page can toggle its
//   solo. Muted/soloed-out stems fall silent, their analyser reads ~0, and the
//   body dims to a faint base glow — so the visual always follows the real mix.
//   UnrealBloomPass + ACES tone mapping give the violet-forward glow. All raw
//   hex lives ONLY here inside three.js materials. Everything is disposed.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { mulberry32, clamp, lerp } from "./prng";

// art-only palette (violet-forward)
const C_PERC = new THREE.Color(0xb043e0); // magenta-violet
const C_BASS = new THREE.Color(0x5b2ec9); // deep violet
const C_BODY = new THREE.Color(0x8b5cf6); // brand violet
const C_AIR = new THREE.Color(0xddd6fe); // pale violet

const POS = [
  new THREE.Vector3(4.6, 1.2, -1.5), // percussive
  new THREE.Vector3(-3.4, -3.0, 1.0), // bass
  new THREE.Vector3(0, 0.2, 0), // body
  new THREE.Vector3(0.4, 4.4, -0.5), // air
];

export class StemScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;

  private disposables: { dispose(): void }[] = [];
  private pickTargets: THREE.Mesh[] = [];
  private pickCb: ((i: number) => void) | null = null;

  // per-body handles
  private shards!: THREE.InstancedMesh;
  private shardBase: THREE.Matrix4[] = [];
  private shardMat!: THREE.MeshStandardMaterial;
  private bassMesh!: THREE.Mesh;
  private bassMat!: THREE.MeshStandardMaterial;
  private bodyPoints!: THREE.Points;
  private bodyMat!: THREE.PointsMaterial;
  private airPoints!: THREE.Points;
  private airMat!: THREE.PointsMaterial;

  // camera orbit state
  private azimuth = 0;
  private elevation = 0.15;
  private radius = 12;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private movedDist = 0;
  private levels = new Float32Array(4);
  private soloIndex: number | null = null;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private clock = 0;

  constructor(canvas: HTMLCanvasElement, seed: number) {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    const rng = mulberry32(seed);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07060f);
    this.scene.fog = new THREE.FogExp2(0x07060f, 0.028);

    this.camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 100);
    this.updateCamera();

    const amb = new THREE.AmbientLight(0x2a2350, 0.9);
    this.scene.add(amb);
    const key = new THREE.PointLight(0x8b5cf6, 40, 40);
    key.position.set(6, 8, 6);
    this.scene.add(key);
    const fill = new THREE.PointLight(0x5b2ec9, 20, 40);
    fill.position.set(-6, -4, -4);
    this.scene.add(fill);

    this.buildStarfield(rng);
    this.buildPercussive(rng);
    this.buildBass();
    this.buildBody(rng);
    this.buildAir(rng);

    // composer
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.9, 0.7, 0.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.attachInput(canvas);
  }

  // ── bodies ────────────────────────────────────────────────────────────────
  private buildStarfield(rng: () => number): void {
    const n = 900;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 22 + rng() * 26;
      const th = rng() * Math.PI * 2;
      const ph = Math.acos(2 * rng() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.cos(ph);
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0x2a2456, size: 0.09, sizeAttenuation: true });
    const pts = new THREE.Points(geo, mat);
    this.scene.add(pts);
    this.disposables.push(geo, mat);
  }

  private buildPercussive(rng: () => number): void {
    const count = 46;
    const geo = new THREE.OctahedronGeometry(0.34, 0);
    this.shardMat = new THREE.MeshStandardMaterial({
      color: C_PERC,
      emissive: C_PERC,
      emissiveIntensity: 0.4,
      roughness: 0.25,
      metalness: 0.1,
      flatShading: true,
    });
    this.shards = new THREE.InstancedMesh(geo, this.shardMat, count);
    const center = POS[0];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      p.set(
        center.x + (rng() * 2 - 1) * 1.7,
        center.y + (rng() * 2 - 1) * 1.7,
        center.z + (rng() * 2 - 1) * 1.7,
      );
      e.set(rng() * 6.28, rng() * 6.28, rng() * 6.28);
      q.setFromEuler(e);
      const sc = 0.4 + rng() * 0.8;
      s.set(sc, sc, sc);
      m.compose(p, q, s);
      this.shards.setMatrixAt(i, m);
      this.shardBase.push(m.clone());
    }
    this.scene.add(this.shards);
    this.disposables.push(geo, this.shardMat);
    this.addPickTarget(center, 2.2, 0);
  }

  private buildBass(): void {
    const geo = new THREE.IcosahedronGeometry(2.4, 2);
    this.bassMat = new THREE.MeshStandardMaterial({
      color: C_BASS,
      emissive: C_BASS,
      emissiveIntensity: 0.35,
      roughness: 0.5,
      metalness: 0.2,
      flatShading: true,
      transparent: true,
      opacity: 0.92,
    });
    this.bassMesh = new THREE.Mesh(geo, this.bassMat);
    this.bassMesh.position.copy(POS[1]);
    this.scene.add(this.bassMesh);
    this.disposables.push(geo, this.bassMat);
    this.addPickTarget(POS[1], 2.9, 1);
  }

  private buildBody(rng: () => number): void {
    // flowing point-field on a twisted torus ribbon
    const n = 2600;
    const pos = new Float32Array(n * 3);
    const seedArr = new Float32Array(n);
    const R = 2.4;
    const r = 0.9;
    for (let i = 0; i < n; i++) {
      const u = (i / n) * Math.PI * 2 * 3; // 3 wraps
      const v = rng() * Math.PI * 2;
      const rr = r * (0.5 + 0.5 * rng());
      pos[i * 3] = (R + rr * Math.cos(v)) * Math.cos(u);
      pos[i * 3 + 1] = rr * Math.sin(v) * 0.7;
      pos[i * 3 + 2] = (R + rr * Math.cos(v)) * Math.sin(u);
      seedArr[i] = rng();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.bodyMat = new THREE.PointsMaterial({
      color: C_BODY,
      size: 0.07,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.bodyPoints = new THREE.Points(geo, this.bodyMat);
    this.bodyPoints.position.copy(POS[2]);
    this.scene.add(this.bodyPoints);
    this.disposables.push(geo, this.bodyMat);
    this.addPickTarget(POS[2], 3.0, 2);
  }

  private buildAir(rng: () => number): void {
    const n = 1400;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const rad = 2.4 + rng() * 0.5;
      const th = rng() * Math.PI * 2;
      const ph = Math.acos(2 * rng() - 1);
      pos[i * 3] = rad * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = rad * Math.cos(ph) * 0.6;
      pos[i * 3 + 2] = rad * Math.sin(ph) * Math.sin(th);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.airMat = new THREE.PointsMaterial({
      color: C_AIR,
      size: 0.05,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.airPoints = new THREE.Points(geo, this.airMat);
    this.airPoints.position.copy(POS[3]);
    this.scene.add(this.airPoints);
    this.disposables.push(geo, this.airMat);
    this.addPickTarget(POS[3], 2.8, 3);
  }

  private addPickTarget(center: THREE.Vector3, radius: number, index: number): void {
    const geo = new THREE.SphereGeometry(radius, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ visible: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(center);
    mesh.userData.stem = index;
    this.scene.add(mesh);
    this.pickTargets.push(mesh);
    this.disposables.push(geo, mat);
  }

  // ── input ───────────────────────────────────────────────────────────────────
  private attachInput(canvas: HTMLCanvasElement): void {
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
  }

  private onDown = (e: PointerEvent): void => {
    this.dragging = true;
    this.movedDist = 0;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.movedDist += Math.abs(dx) + Math.abs(dy);
    this.azimuth -= dx * 0.005;
    this.elevation = clamp(this.elevation + dy * 0.005, -1.1, 1.1);
  };

  private onUp = (e: PointerEvent): void => {
    if (!this.dragging) return;
    this.dragging = false;
    if (this.movedDist < 6 && this.pickCb) {
      // treat as a tap → pick
      const rect = (e.target as HTMLElement)?.getBoundingClientRect?.();
      if (rect) {
        this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.pointer, this.camera);
        const hits = this.raycaster.intersectObjects(this.pickTargets, false);
        if (hits.length > 0) {
          const idx = hits[0].object.userData.stem as number;
          this.pickCb(idx);
        }
      }
    }
  };

  onPick(cb: (i: number) => void): void {
    this.pickCb = cb;
  }

  setLevels(levels: Float32Array, soloIndex: number | null): void {
    this.levels.set(levels);
    this.soloIndex = soloIndex;
  }

  private updateCamera(): void {
    const ce = Math.cos(this.elevation);
    this.camera.position.set(
      this.radius * ce * Math.sin(this.azimuth),
      this.radius * Math.sin(this.elevation) + 0.5,
      this.radius * ce * Math.cos(this.azimuth),
    );
    this.camera.lookAt(0, 0, 0);
  }

  // ── frame ───────────────────────────────────────────────────────────────────
  render(dt: number): void {
    this.clock += dt;
    if (!this.dragging) this.azimuth += dt * 0.06; // slow auto-orbit
    this.updateCamera();

    const t = this.clock;
    const lp = this.levels[0];
    const lb = this.levels[1];
    const lm = this.levels[2];
    const la = this.levels[3];
    const focus = (i: number) => (this.soloIndex === null || this.soloIndex === i ? 1 : 0.25);

    // percussive: jitter + emissive flash
    this.shardMat.emissiveIntensity = lerp(this.shardMat.emissiveIntensity, 0.3 + lp * 3.2, 0.4) * focus(0);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const jitter = lp * 0.7;
    for (let i = 0; i < this.shardBase.length; i++) {
      this.shardBase[i].decompose(p, q, s);
      const ph = i * 1.7;
      p.x += Math.sin(t * 2 + ph) * jitter * 0.25;
      p.y += Math.cos(t * 2.3 + ph) * jitter * 0.25;
      e.set(t * 0.4 + ph, t * 0.5 + ph, 0);
      const qq = new THREE.Quaternion().setFromEuler(e);
      const sc = (0.4 + (i % 5) * 0.12) * (1 + lp * 0.8);
      s.set(sc, sc, sc);
      m.compose(p, qq, s);
      this.shards.setMatrixAt(i, m);
    }
    this.shards.instanceMatrix.needsUpdate = true;

    // bass: swell + slow spin
    const bs = (1 + lb * 0.5) * (0.7 + 0.3 * focus(1));
    this.bassMesh.scale.setScalar(bs);
    this.bassMesh.rotation.y += dt * 0.15;
    this.bassMesh.rotation.x += dt * 0.05;
    this.bassMat.emissiveIntensity = lerp(this.bassMat.emissiveIntensity, 0.3 + lb * 1.8, 0.3) * focus(1);

    // body: shimmer, flow
    this.bodyPoints.rotation.y += dt * (0.1 + lm * 0.5);
    this.bodyPoints.rotation.z += dt * 0.03;
    this.bodyMat.size = (0.05 + lm * 0.12) * focus(2) + 0.02;
    this.bodyMat.opacity = clamp(0.35 + lm * 0.9, 0.15, 1) * (0.4 + 0.6 * focus(2));

    // air: glimmer halo
    this.airPoints.rotation.y -= dt * (0.06 + la * 0.4);
    this.airMat.size = (0.04 + la * 0.1) * focus(3) + 0.015;
    this.airMat.opacity = clamp(0.3 + la * 0.8, 0.1, 0.95) * (0.4 + 0.6 * focus(3));

    // bloom tracks overall energy, smoothly (no strobe)
    const energy = lp * 0.4 + lb * 0.25 + lm * 0.3 + la * 0.2;
    this.bloom.strength = lerp(this.bloom.strength, 0.6 + energy * 1.1, 0.1);

    this.composer.render();
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
  }

  dispose(): void {
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("pointerdown", this.onDown);
    canvas.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerup", this.onUp);
    this.disposables.forEach((d) => d.dispose());
    this.shards.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
