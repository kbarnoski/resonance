// mandala.ts — the kaleidoscopic petal mandala as a three.js scene-graph.
//
// This is a real 3D scene-graph (NOT a full-screen fragment shader): each tier
// of the mandala is an InstancedMesh of diamond "petals" arranged with N-fold
// (kaleidoscopic) rotational symmetry. Nested tiers counter-rotate at their own
// rates, sit at different z-depths (so head-tilt reveals parallax), and bloom
// outward on jawOpen. Colours ride a gold / violet / cyan iridescent palette.
//
// Idea lineage: Klüver's four form constants + the Bressloff–Cowan log-polar
// cortical map — the geometry of psychedelia is radial + rotational symmetry;
// affect-coupling (patterns shift with feeling, per REBUS / entropic-brain)
// is delivered here by the live face drive.

import * as THREE from "three";

export interface MandalaDrive {
  bloom: number; // jawOpen 0..1 — blooms outward
  warmth: number; // smile 0..1 — gold saturation + glow
  lift: number; // browInnerUp 0..1 — upper tier + brightness
  contract: number; // browDown 0..1 — pull in + darken
  focus: number; // pucker 0..1 — tighten the fold count
  yaw: number;
  pitch: number;
  roll: number;
  bright: number; // safeFlicker luminance multiplier (<=1)
  pulse: number; // transient blink pulse 0..1
  present: boolean;
}

interface Tier {
  mesh: THREE.InstancedMesh;
  baseRadius: number;
  z: number;
  dir: number; // rotation handedness
  spinRate: number;
  hue: number; // base hue (0..1)
  upper: boolean; // only shown when brow lifts
}

const MAX_PETALS = 22;
const TIERS = 5;
const TWO_PI = Math.PI * 2;

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export class Mandala {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;

  private group: THREE.Group;
  private tiers: Tier[] = [];
  private core: THREE.Mesh;
  private coreMat: THREE.MeshBasicMaterial;
  private halo: THREE.Mesh;
  private haloMat: THREE.MeshBasicMaterial;
  private dummy = new THREE.Object3D();
  private tmpColor = new THREE.Color();
  private petalGeo: THREE.BufferGeometry;

  // smoothed pose so head motion feels like breath
  private sYaw = 0;
  private sPitch = 0;
  private sRoll = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(0x05030a, 1);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x05030a, 0.055);

    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 100);
    this.camera.position.set(0, 0, 7.2);

    this.group = new THREE.Group();
    this.scene.add(this.group);

    // A diamond petal: an octahedron squashed into a flat lens that points +Y.
    const geo = new THREE.OctahedronGeometry(1, 0);
    geo.scale(0.34, 1.0, 0.1);
    geo.translate(0, 1.0, 0); // pivot at the ring centre, tip outward
    this.petalGeo = geo;

    for (let ti = 0; ti < TIERS; ti++) {
      const mat = new THREE.MeshBasicMaterial({
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.9,
      });
      const mesh = new THREE.InstancedMesh(this.petalGeo, mat, MAX_PETALS);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      // allocate per-instance colour
      for (let i = 0; i < MAX_PETALS; i++) {
        mesh.setColorAt(i, this.tmpColor.setRGB(1, 1, 1));
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

      const tier: Tier = {
        mesh,
        baseRadius: 0.9 + ti * 0.85,
        z: -ti * 0.55,
        dir: ti % 2 === 0 ? 1 : -1,
        spinRate: 0.12 + ti * 0.045,
        hue: (0.11 + ti * 0.16) % 1, // gold → violet → cyan sweep across tiers
        upper: ti === TIERS - 1,
      };
      this.group.add(mesh);
      this.tiers.push(tier);
    }

    // Glowing core.
    this.coreMat = new THREE.MeshBasicMaterial({
      color: 0xffd27a,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 2), this.coreMat);
    this.group.add(this.core);

    // Soft halo behind the core.
    this.haloMat = new THREE.MeshBasicMaterial({
      color: 0x8a5bff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.28,
    });
    this.halo = new THREE.Mesh(new THREE.SphereGeometry(1.5, 24, 24), this.haloMat);
    this.halo.position.z = -0.6;
    this.group.add(this.halo);
  }

  resize(w: number, h: number, dpr: number): void {
    this.renderer.setPixelRatio(Math.min(2, dpr));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  update(d: MandalaDrive, tSec: number): void {
    // Smooth head pose → whole-mandala tilt in 3D.
    this.sYaw = lerp(this.sYaw, d.yaw, 0.08);
    this.sPitch = lerp(this.sPitch, d.pitch, 0.08);
    this.sRoll = lerp(this.sRoll, d.roll, 0.08);
    this.group.rotation.set(-this.sPitch, this.sYaw, this.sRoll);

    // A slow autonomous breath keeps it alive when neutral / absent.
    const breath = d.present ? 0 : 0.18 + 0.12 * Math.sin(tSec * 0.4);
    const bloom = clamp(d.bloom + breath, 0, 1.3);

    // Fold count: pucker tightens (fewer, sharper petals); brow/jaw open it up.
    const fold = clamp(
      Math.round((7 + d.lift * 5 + bloom * 4) * (1 - d.focus * 0.55)),
      3,
      MAX_PETALS,
    );

    const warm = d.warmth;
    const bright = d.bright * (0.6 + 0.55 * bloom + 0.35 * warm - 0.35 * d.contract);

    for (let ti = 0; ti < this.tiers.length; ti++) {
      const tier = this.tiers[ti];
      const mesh = tier.mesh;
      const count = fold;
      mesh.count = count;

      const radius =
        tier.baseRadius * (1 + bloom * 0.7 - d.contract * 0.25) + bloom * 0.3;
      const petalScale =
        (0.55 + bloom * 0.7 + d.pulse * 0.25) * (1 - ti * 0.06);

      // upper tier fades in only when the brow lifts
      const tierVis = tier.upper ? clamp(d.lift * 1.4 - 0.1, 0, 1) : 1;
      const spin = tier.dir * (tier.spinRate * (1 + bloom * 0.8)) * tSec;

      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = clamp(0.35 + 0.55 * bright, 0.05, 1) * tierVis;

      for (let i = 0; i < count; i++) {
        const a = (i / count) * TWO_PI + spin;
        const x = Math.cos(a) * radius;
        const y = Math.sin(a) * radius;
        // tip petals gently out of plane for real depth
        const zTilt = Math.sin(a * 2 + tSec * 0.3) * 0.12 * (1 + bloom);
        this.dummy.position.set(x, y, tier.z + zTilt);
        this.dummy.rotation.set(0, 0, a - Math.PI / 2);
        const s = petalScale;
        this.dummy.scale.set(s, s * (0.8 + bloom * 0.5), s);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(i, this.dummy.matrix);

        // iridescent colour: base hue per tier, drifting with angle + warmth.
        const hue =
          (tier.hue + i * 0.014 + tSec * 0.02 - warm * 0.09 + 1) % 1;
        const sat = clamp(0.55 + warm * 0.4 - d.contract * 0.2, 0, 1);
        const light = clamp(
          (0.4 + 0.28 * bloom + 0.2 * warm + 0.25 * d.pulse) * bright,
          0.05,
          0.85,
        );
        this.tmpColor.setHSL(hue, sat, light);
        mesh.setColorAt(i, this.tmpColor);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    // Core pulses with bloom + blink; warms toward gold with smile.
    const coreScale = 0.7 + bloom * 0.9 + d.pulse * 0.5;
    this.core.scale.setScalar(coreScale);
    this.core.rotation.y = tSec * 0.4;
    this.core.rotation.x = tSec * 0.25;
    this.tmpColor.setHSL((0.12 - warm * 0.05 + 1) % 1, 0.9, clamp(0.5 * bright + 0.2 + d.pulse * 0.3, 0.1, 0.95));
    this.coreMat.color.copy(this.tmpColor);
    this.coreMat.opacity = clamp(0.5 + 0.5 * bright, 0.1, 1);

    this.halo.scale.setScalar(1 + bloom * 0.8);
    this.haloMat.opacity = clamp((0.12 + bloom * 0.28) * bright, 0.02, 0.6);
    this.tmpColor.setHSL((0.72 - warm * 0.5 + 1) % 1, 0.7, 0.5);
    this.haloMat.color.copy(this.tmpColor);

    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.tiers.forEach((t) => {
      (t.mesh.material as THREE.Material).dispose();
      t.mesh.dispose();
    });
    this.petalGeo.dispose(); // shared petal geometry, disposed once
    this.core.geometry.dispose();
    this.coreMat.dispose();
    this.halo.geometry.dispose();
    this.haloMat.dispose();
    this.renderer.dispose();
  }
}
