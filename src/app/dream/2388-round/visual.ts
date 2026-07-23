// three.js output layer — each loop is an autonomous glowing figure.
//
// A layer draws its full recorded path as a faint closed ghost line plus a
// bright pale head that retraces it on the layer's own drifting clock. LIVE-you
// is the brightest figure — a cool-accent head trailing its recent motion.
// Ikeda near-monochrome on near-black, gentle slow camera drift. Raw hex is
// allowed here because this is the art layer, not chrome.

import * as THREE from "three";

const NEAR_BLACK = 0x050607;
const PALE = 0xf4f6f8;
const GREY = 0xaeb6bd;
const ACCENT = 0x8fbfff;

/** Normalized centroid (x,y ∈ [-1,1], y down) + depth → world coords. */
function toWorld(x: number, y: number, z: number): [number, number, number] {
  return [x * 3.2, -y * 2.2, z];
}

interface Figure {
  ghost: THREE.LineLoop;
  ghostGeom: THREE.BufferGeometry;
  ghostMat: THREE.LineBasicMaterial;
  head: THREE.Mesh;
  headMat: THREE.MeshBasicMaterial;
  z: number;
}

export class Visualizer {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly headGeom: THREE.SphereGeometry;
  private readonly figures = new Map<number, Figure>();

  private readonly liveHead: THREE.Mesh;
  private readonly liveHeadMat: THREE.MeshBasicMaterial;
  private readonly liveTrail: THREE.Line;
  private readonly liveTrailGeom: THREE.BufferGeometry;
  private readonly liveTrailMat: THREE.LineBasicMaterial;
  private readonly liveTrailArr: Float32Array;
  private readonly t0: number;

  private nextLayer = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(NEAR_BLACK);
    this.scene.fog = new THREE.FogExp2(NEAR_BLACK, 0.055);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    this.camera.position.set(0, 0, 7);

    this.headGeom = new THREE.SphereGeometry(0.085, 16, 16);

    // LIVE figure — brightest, cool accent.
    this.liveHeadMat = new THREE.MeshBasicMaterial({ color: ACCENT });
    this.liveHead = new THREE.Mesh(this.headGeom, this.liveHeadMat);
    this.liveHead.scale.setScalar(1.35);
    this.scene.add(this.liveHead);

    const trailN = 56;
    this.liveTrailArr = new Float32Array(trailN * 3);
    this.liveTrailGeom = new THREE.BufferGeometry();
    this.liveTrailGeom.setAttribute(
      "position",
      new THREE.BufferAttribute(this.liveTrailArr, 3),
    );
    this.liveTrailMat = new THREE.LineBasicMaterial({
      color: ACCENT,
      transparent: true,
      opacity: 0.5,
    });
    this.liveTrail = new THREE.Line(this.liveTrailGeom, this.liveTrailMat);
    this.scene.add(this.liveTrail);

    this.t0 = performance.now();
  }

  addFigure(id: number, points: { x: number; y: number }[]): void {
    if (this.figures.has(id)) return;
    const z = -0.7 - (this.nextLayer % 6) * 0.52;
    this.nextLayer++;

    const arr = new Float32Array(points.length * 3);
    for (let i = 0; i < points.length; i++) {
      const [wx, wy, wz] = toWorld(points[i].x, points[i].y, z);
      arr[i * 3] = wx;
      arr[i * 3 + 1] = wy;
      arr[i * 3 + 2] = wz;
    }
    const ghostGeom = new THREE.BufferGeometry();
    ghostGeom.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    const ghostMat = new THREE.LineBasicMaterial({
      color: GREY,
      transparent: true,
      opacity: 0.22,
    });
    const ghost = new THREE.LineLoop(ghostGeom, ghostMat);
    this.scene.add(ghost);

    const headMat = new THREE.MeshBasicMaterial({
      color: PALE,
      transparent: true,
      opacity: 0.8,
    });
    const head = new THREE.Mesh(this.headGeom, headMat);
    this.scene.add(head);

    this.figures.set(id, { ghost, ghostGeom, ghostMat, head, headMat, z });
  }

  updateFigure(id: number, x: number, y: number): void {
    const f = this.figures.get(id);
    if (!f) return;
    const [wx, wy, wz] = toWorld(x, y, f.z);
    f.head.position.set(wx, wy, wz);
  }

  removeFigure(id: number): void {
    const f = this.figures.get(id);
    if (!f) return;
    this.figures.delete(id);
    this.scene.remove(f.ghost);
    this.scene.remove(f.head);
    f.ghostGeom.dispose();
    f.ghostMat.dispose();
    f.headMat.dispose();
  }

  updateLive(
    x: number,
    y: number,
    trail: { x: number; y: number }[],
  ): void {
    const [wx, wy, wz] = toWorld(x, y, 0.5);
    this.liveHead.position.set(wx, wy, wz);
    const n = this.liveTrailArr.length / 3;
    for (let i = 0; i < n; i++) {
      const src = trail[i] ?? trail[trail.length - 1] ?? { x, y };
      const [tx, ty, tz] = toWorld(src.x, src.y, 0.5);
      this.liveTrailArr[i * 3] = tx;
      this.liveTrailArr[i * 3 + 1] = ty;
      this.liveTrailArr[i * 3 + 2] = tz;
    }
    this.liveTrailGeom.attributes.position.needsUpdate = true;
  }

  render(now: number): void {
    const t = (now - this.t0) / 1000;
    this.camera.position.x = Math.sin(t * 0.08) * 1.25;
    this.camera.position.y = Math.sin(t * 0.05) * 0.6;
    this.camera.position.z = 7 + Math.sin(t * 0.03) * 0.7;
    this.camera.lookAt(0, 0, -1.4);
    this.renderer.render(this.scene, this.camera);
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  dispose(): void {
    this.figures.forEach((f) => {
      this.scene.remove(f.ghost);
      this.scene.remove(f.head);
      f.ghostGeom.dispose();
      f.ghostMat.dispose();
      f.headMat.dispose();
    });
    this.figures.clear();
    this.scene.remove(this.liveHead);
    this.scene.remove(this.liveTrail);
    this.liveTrailGeom.dispose();
    this.liveTrailMat.dispose();
    this.liveHeadMat.dispose();
    this.headGeom.dispose();
    this.renderer.dispose();
  }
}
