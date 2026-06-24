// Procedural glowing 3D garden built with three.js.
// Each beat spawns/grows a plant (stem springs up, bloom pops with an elastic
// ease). The whole garden breathes always, and pulses/sways in time with the
// looped rhythm. Steady rhythm -> orderly rows; wild rhythm -> swaying jungle.

import * as THREE from "three";

export type PlantKind = "thump" | "shaker";

interface Plant {
  group: THREE.Group;
  stem: THREE.Mesh;
  bloom: THREE.Mesh;
  bloomMat: THREE.MeshStandardMaterial;
  birth: number; // seconds
  targetHeight: number;
  baseScale: number;
  swayPhase: number;
  hue: number;
  kind: PlantKind;
}

const MAX_PLANTS = 80;
// Bright, warm garden palette.
const THUMP_HUES = [0.95, 0.02, 0.08]; // pink / coral / orange
const SHAKER_HUES = [0.13, 0.45, 0.55]; // gold / mint / cyan

// Elastic ease-out so blooms feel alive (pop + settle).
function easeOutElastic(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
}

export class Garden {
  readonly renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private plants: Plant[] = [];
  private groundMat: THREE.MeshStandardMaterial;
  private clock = new THREE.Clock();
  private loopFlash = 0; // 0..1, decays — global pulse on each loop hit
  private ambientLight: THREE.PointLight;

  // Shared geometries (disposed once at teardown).
  private stemGeo: THREE.CylinderGeometry;
  private bloomGeo: THREE.IcosahedronGeometry;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.scene = new THREE.Scene();
    // Dark warm background + fog for depth.
    this.scene.background = new THREE.Color(0x1a1410);
    this.scene.fog = new THREE.Fog(0x1a1410, 9, 26);

    this.camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.1,
      100,
    );
    this.camera.position.set(0, 4.2, 9.5);
    this.camera.lookAt(0, 1.4, 0);

    // Soft warm lighting.
    this.scene.add(new THREE.AmbientLight(0x4a3a2a, 1.1));
    const key = new THREE.DirectionalLight(0xfff0d8, 0.8);
    key.position.set(4, 8, 6);
    this.scene.add(key);
    this.ambientLight = new THREE.PointLight(0xffb070, 6, 30, 1.6);
    this.ambientLight.position.set(0, 5, 4);
    this.scene.add(this.ambientLight);

    // Warm ground plane.
    const groundGeo = new THREE.CircleGeometry(22, 48);
    this.groundMat = new THREE.MeshStandardMaterial({
      color: 0x2e2418,
      roughness: 0.95,
      metalness: 0,
    });
    const ground = new THREE.Mesh(groundGeo, this.groundMat);
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    this.stemGeo = new THREE.CylinderGeometry(0.05, 0.09, 1, 6);
    this.stemGeo.translate(0, 0.5, 0); // pivot at base
    this.bloomGeo = new THREE.IcosahedronGeometry(0.42, 1);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  /** Spawn a plant for a beat. centroid 0..1 picks timbre/colour. */
  spawnPlant(velocity: number, centroid: number) {
    const kind: PlantKind = centroid > 0.5 ? "shaker" : "thump";
    const hueSet = kind === "shaker" ? SHAKER_HUES : THUMP_HUES;
    const hue = hueSet[Math.floor(Math.random() * hueSet.length)];

    // Scatter across a disc, biased toward foreground.
    const r = 1.5 + Math.random() * 6.5;
    const ang = Math.random() * Math.PI * 2;
    const x = Math.cos(ang) * r;
    const z = Math.sin(ang) * r * 0.7 - 1;

    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const stemMat = new THREE.MeshStandardMaterial({
      color: 0x3f7d3a,
      roughness: 0.7,
    });
    const stem = new THREE.Mesh(this.stemGeo, stemMat);
    const targetHeight = 1.0 + velocity * 1.6 + Math.random() * 0.5;
    stem.scale.y = 0.001;
    group.add(stem);

    const color = new THREE.Color().setHSL(hue, 0.85, 0.6);
    const bloomMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.4,
      roughness: 0.4,
    });
    const bloom = new THREE.Mesh(this.bloomGeo, bloomMat);
    bloom.position.y = targetHeight;
    bloom.scale.setScalar(0.001);
    group.add(bloom);

    this.scene.add(group);

    const plant: Plant = {
      group,
      stem,
      bloom,
      bloomMat,
      birth: this.clock.elapsedTime,
      targetHeight,
      baseScale: 0.7 + velocity * 0.6,
      swayPhase: Math.random() * Math.PI * 2,
      hue,
      kind,
    };
    this.plants.push(plant);

    // Cap plant count — retire oldest.
    while (this.plants.length > MAX_PLANTS) {
      const old = this.plants.shift();
      if (old) this.disposePlant(old);
    }
  }

  /** Pulse the whole garden on a looped beat hit. */
  loopPulse(intensity = 1) {
    this.loopFlash = Math.min(1.4, this.loopFlash + intensity);
  }

  private disposePlant(p: Plant) {
    this.scene.remove(p.group);
    (p.stem.material as THREE.Material).dispose();
    p.bloomMat.dispose();
  }

  render() {
    const t = this.clock.elapsedTime;
    const dt = this.clock.getDelta();
    this.loopFlash = Math.max(0, this.loopFlash - dt * 2.6);

    // Garden-wide breathing + loop pulse.
    const breathe = 1 + Math.sin(t * 0.7) * 0.02;
    const pulse = 1 + this.loopFlash * 0.12;
    this.ambientLight.intensity = 6 + this.loopFlash * 7;

    for (const p of this.plants) {
      const age = t - p.birth;
      // Stem springs up (elastic) over ~0.6s.
      const grow = easeOutElastic(Math.min(1, age / 0.6));
      p.stem.scale.y = p.targetHeight * grow;
      p.bloom.position.y = p.targetHeight * grow;

      // Bloom pops slightly after the stem.
      const bloomT = easeOutElastic(Math.min(1, (age - 0.08) / 0.6));
      const sc =
        Math.max(0, bloomT) * p.baseScale * breathe * pulse;
      p.bloom.scale.setScalar(sc);

      // Bob & sway on the loop pulse + a gentle idle sway.
      const sway =
        Math.sin(t * 1.3 + p.swayPhase) * 0.04 +
        this.loopFlash * 0.12 * Math.sin(p.swayPhase);
      p.group.rotation.z = sway;
      p.group.position.y = this.loopFlash * 0.18 * (0.5 + Math.random() * 0);

      // Bloom glow brightens with the loop pulse.
      p.bloomMat.emissiveIntensity = 1.2 + this.loopFlash * 1.8;
    }

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.plants.forEach((p) => this.disposePlant(p));
    this.plants = [];
    this.stemGeo.dispose();
    this.bloomGeo.dispose();
    this.groundMat.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.renderer.dispose();
  }
}
