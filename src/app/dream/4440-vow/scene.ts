// ─────────────────────────────────────────────────────────────────────────────
// scene.ts — the constellation of vows (three.js).
//
//   Twelve resonant nodes hang suspended in a dark, reverent space: small
//   glowing icosahedra, each wrapped in an additive halo. They drift slowly.
//   Striking one flares its glow (soft bloom, well under 3 Hz) and sends a
//   coupling ripple through the field — its nearest neighbours shiver and dim-
//   glow in sympathy, the way a struck body sets its neighbours faintly ringing.
//
//   The dwindling reserve is expressed physically: as strikes are spent the
//   whole field cools and darkens; each node that has been spent contracts its
//   halo and never returns fully to its first brightness. When the reserve hits
//   zero the constellation goes cold — near-black, silent.
//
//   Colour language: the Resonance violet ramp. Raw hex is allowed inside art
//   materials only.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { mulberry32 } from "./synth";

const NODE_COUNT = 12;

// Violet ramp (from _shared/palette) — node core colours, low→high pitch.
const RAMP = [0x5b2ec9, 0x7c3aed, 0x8b5cf6, 0xa78bfa, 0xc4b5fd, 0xede9fe];

interface NodeVis {
  mesh: THREE.Mesh;
  halo: THREE.Sprite;
  home: THREE.Vector3;
  phase: number;
  driftAmp: number;
  color: THREE.Color;
  energy: number; // 0..1 current flare, decays each frame
  shiver: THREE.Vector3; // transient displacement, springs back
  spent: number; // times struck (drives permanent dimming/contraction)
  neighbours: number[];
}

/** Build a soft radial-gradient sprite texture for the additive halo. */
function makeHaloTexture(): THREE.Texture {
  const s = 128;
  const cv = document.createElement("canvas");
  cv.width = cv.height = s;
  const g = cv.getContext("2d")!;
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.55)");
  grad.addColorStop(0.55, "rgba(255,255,255,0.15)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(cv);
  tex.needsUpdate = true;
  return tex;
}

export class VowScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private nodeGeo: THREE.IcosahedronGeometry;
  private haloTex: THREE.Texture;
  private nodes: NodeVis[] = [];
  private reserveFrac = 1; // remaining / total → global brightness floor
  private cold = false; // reserve exhausted → whole field near-black
  private t = 0;
  readonly nodePositions: { x: number; y: number }[] = []; // for DOM fallback labels

  constructor(canvas: HTMLCanvasElement, seed: number) {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);
    this.renderer.setClearColor(0x05030a, 1);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x05030a, 0.03);

    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
    this.camera.position.set(0, 0, 15);

    const ambient = new THREE.AmbientLight(0x3a1d78, 0.6);
    this.scene.add(ambient);

    this.nodeGeo = new THREE.IcosahedronGeometry(0.42, 1);
    this.haloTex = makeHaloTexture();

    const rng = mulberry32(seed);
    // Place nodes on a gently perturbed double-ring so they read as a
    // constellation, not a grid. Deterministic layout from the seed.
    for (let i = 0; i < NODE_COUNT; i++) {
      const ring = i % 2 === 0 ? 4.6 : 7.4;
      const ang = (i / NODE_COUNT) * Math.PI * 2 + (rng() - 0.5) * 0.5;
      const y = (rng() - 0.5) * 6.5;
      const home = new THREE.Vector3(
        Math.cos(ang) * ring + (rng() - 0.5) * 1.2,
        y,
        Math.sin(ang) * (ring * 0.4) + (rng() - 0.5) * 1.6 - 1,
      );
      const color = new THREE.Color(RAMP[i % RAMP.length]);

      const mat = new THREE.MeshStandardMaterial({
        color: 0x1a1030,
        emissive: color.clone(),
        emissiveIntensity: 0.35,
        roughness: 0.4,
        metalness: 0.3,
      });
      const mesh = new THREE.Mesh(this.nodeGeo, mat);
      mesh.position.copy(home);
      mesh.userData.index = i;
      this.scene.add(mesh);

      const haloMat = new THREE.SpriteMaterial({
        map: this.haloTex,
        color: color.clone(),
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const halo = new THREE.Sprite(haloMat);
      halo.scale.setScalar(2.4);
      halo.position.copy(home);
      this.scene.add(halo);

      this.nodes.push({
        mesh,
        halo,
        home,
        phase: rng() * Math.PI * 2,
        driftAmp: 0.25 + rng() * 0.35,
        color,
        energy: 0,
        shiver: new THREE.Vector3(),
        spent: 0,
        neighbours: [],
      });
      this.nodePositions.push({ x: 0, y: 0 });
    }

    // Precompute the 3 nearest neighbours of each node for the coupling ripple.
    for (let i = 0; i < NODE_COUNT; i++) {
      const dist = this.nodes
        .map((n, j) => ({ j, d: n.home.distanceTo(this.nodes[i].home) }))
        .filter((x) => x.j !== i)
        .sort((a, b) => a.d - b.d);
      this.nodes[i].neighbours = dist.slice(0, 3).map((x) => x.j);
    }

    // Post: soft additive bloom for the glow.
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(w, h),
      0.9, // strength
      0.7, // radius
      0.15, // threshold
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.setSize(w, h);
  }

  /** Flare a node and ripple to its neighbours. `intensity` in [0,1]. */
  ring(index: number, intensity = 1): void {
    const n = this.nodes[index];
    if (!n) return;
    n.energy = Math.min(1.4, n.energy + intensity);
    // Coupling: neighbours shiver + faintly glow.
    for (const j of n.neighbours) {
      const nb = this.nodes[j];
      nb.energy = Math.min(1.4, nb.energy + intensity * 0.18);
      const dir = nb.home.clone().sub(n.home).normalize();
      nb.shiver.addScaledVector(dir, intensity * 0.22);
    }
  }

  /** Record that a node has been permanently spent (dims + contracts it). */
  markSpent(index: number): void {
    const n = this.nodes[index];
    if (n) n.spent += 1;
  }

  /** The renewal ritual restores the field: wear cleared, warmth returns. */
  reset(): void {
    this.cold = false;
    this.reserveFrac = 1;
    for (const n of this.nodes) {
      n.spent = 0;
      n.energy = 0;
    }
  }

  /** Set remaining-fraction → global cooling of the field. */
  setReserveFraction(frac: number): void {
    this.reserveFrac = Math.max(0, Math.min(1, frac));
  }

  /** The whole field goes cold and silent (reserve exhausted). */
  setCold(cold: boolean): void {
    this.cold = cold;
  }

  /** Pick a node under a client-space pointer. Returns index or -1. */
  pick(clientX: number, clientY: number): number {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const meshes = this.nodes.map((n) => n.mesh);
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (hits.length === 0) return -1;
    return hits[0].object.userData.index as number;
  }

  frame(dt: number): void {
    this.t += dt;
    const t = this.t;
    // Global brightness: cools with the reserve; a soft floor keeps the field
    // faintly visible until it is truly exhausted (then near-black).
    const globalDim = this.cold ? 0.06 : 0.35 + 0.65 * this.reserveFrac;

    for (let i = 0; i < NODE_COUNT; i++) {
      const n = this.nodes[i];
      // slow drift + spring-damped shiver
      const dx = Math.sin(t * 0.18 + n.phase) * n.driftAmp;
      const dy = Math.cos(t * 0.13 + n.phase * 1.3) * n.driftAmp;
      n.shiver.multiplyScalar(Math.pow(0.0008, dt)); // fast decay back home
      const px = n.home.x + dx + n.shiver.x;
      const py = n.home.y + dy + n.shiver.y;
      const pz = n.home.z + n.shiver.z;
      n.mesh.position.set(px, py, pz);
      n.halo.position.set(px, py, pz);
      n.mesh.rotation.y += dt * 0.3;
      n.mesh.rotation.x += dt * 0.12;

      // Flare decays (~1s) — gentle, no strobe.
      n.energy *= Math.pow(0.06, dt);

      // Permanent dimming/contraction from having been spent.
      const wear = 1 / (1 + n.spent * 0.12);
      const baseGlow = 0.28 * wear * globalDim;
      const flare = n.energy * 1.7 * (this.cold ? 0.1 : 1);
      const mat = n.mesh.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = baseGlow + flare;

      const haloMat = n.halo.material as THREE.SpriteMaterial;
      haloMat.opacity = Math.min(1, baseGlow * 0.8 + n.energy * 0.9);
      const haloScale = (1.9 + n.energy * 1.6) * (0.65 + 0.35 * wear);
      n.halo.scale.setScalar(haloScale);

      // Project to screen for the DOM fallback / label overlay.
      const v = n.mesh.position.clone().project(this.camera);
      this.nodePositions[i].x = (v.x * 0.5 + 0.5) * 100;
      this.nodePositions[i].y = (-v.y * 0.5 + 0.5) * 100;
    }

    this.bloom.strength = this.cold ? 0.15 : 0.55 + 0.5 * this.reserveFrac;
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
    for (const n of this.nodes) {
      (n.mesh.material as THREE.Material).dispose();
      (n.halo.material as THREE.SpriteMaterial).dispose();
    }
    this.nodeGeo.dispose();
    this.haloTex.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
