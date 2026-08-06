// scene.ts — three.js terrain renderer for 7368-vocodrift.
//
// Renders the log-frequency magnitude field as a luminous displaced-plane
// TERRAIN you fly over: TIME runs into depth, FREQUENCY across width, and
// MAGNITUDE lifts + brightens the surface. A scrolling window of frames is
// copied into the mesh each update so the landscape flows as the phase
// vocoder stretches the sound. Violet-family palette; raw hex is allowed here
// because this is the 3D art layer, not UI chrome.

import * as THREE from "three";
import type { TerrainField } from "./dsp";

const COLS = 96; // width samples (must match buildTerrain cols)
const ROWS = 140; // depth samples (frames of history shown)
const WIDTH = 40;
const DEPTH = 60;

// violet ramp keyed by height (dark valley → luminous ridge)
const RAMP: [number, number, number][] = [
  [0.043, 0.027, 0.075], // #0b0713 valley
  [0.227, 0.067, 0.28], // deep violet
  [0.357, 0.184, 0.79], // 5b2ec9
  [0.545, 0.361, 0.965], // 8b5cf6 primary
  [0.768, 0.71, 0.98], // c4b5fd highlight
];

function rampColor(v: number, out: THREE.Color): void {
  const x = Math.max(0, Math.min(1, v)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(x));
  const f = x - i;
  const a = RAMP[i];
  const b = RAMP[i + 1];
  out.setRGB(
    a[0] + (b[0] - a[0]) * f,
    a[1] + (b[1] - a[1]) * f,
    a[2] + (b[2] - a[2]) * f,
  );
}

export class TerrainScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private geom: THREE.PlaneGeometry;
  private mesh: THREE.Mesh;
  private mat: THREE.MeshStandardMaterial;
  private wire: THREE.Mesh;
  private wireMat: THREE.MeshBasicMaterial;
  private playMat: THREE.MeshBasicMaterial;
  private playMesh: THREE.Mesh;
  private playGeom: THREE.BoxGeometry;
  private field: TerrainField | null = null;
  private pos: Float32Array;
  private col: Float32Array;
  private tmp = new THREE.Color();
  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(0x07040f, 1);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x07040f, 0.014);

    this.camera = new THREE.PerspectiveCamera(56, 1, 0.1, 400);
    this.camera.position.set(0, 14, 40);
    this.camera.lookAt(0, 2, -6);

    // lights — cool key + violet rim
    const key = new THREE.DirectionalLight(0xc4b5fd, 1.15);
    key.position.set(-8, 24, 18);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x5b2ec9, 0.8);
    rim.position.set(10, 8, -20);
    this.scene.add(rim);
    this.scene.add(new THREE.AmbientLight(0x241147, 0.9));

    // terrain plane: COLS x ROWS vertices, laid flat then displaced in update()
    this.geom = new THREE.PlaneGeometry(WIDTH, DEPTH, COLS - 1, ROWS - 1);
    this.geom.rotateX(-Math.PI / 2);
    this.pos = this.geom.attributes.position.array as Float32Array;
    this.col = new Float32Array(COLS * ROWS * 3);
    this.geom.setAttribute("color", new THREE.BufferAttribute(this.col, 3));

    this.mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.62,
      metalness: 0.12,
      emissive: 0x1a0d33,
      emissiveIntensity: 0.55,
      flatShading: false,
    });
    this.mesh = new THREE.Mesh(this.geom, this.mat);
    this.scene.add(this.mesh);

    // faint wireframe overlay for the "contour map" read — shares the same
    // displaced geometry, so it follows the surface with no per-frame rebuild
    this.wireMat = new THREE.MeshBasicMaterial({
      color: 0x8b5cf6,
      wireframe: true,
      transparent: true,
      opacity: 0.08,
    });
    this.wire = new THREE.Mesh(this.geom, this.wireMat);
    this.scene.add(this.wire);

    // glowing playhead bar sitting at the "present" row
    this.playGeom = new THREE.BoxGeometry(WIDTH + 2, 0.5, 0.6);
    this.playMat = new THREE.MeshBasicMaterial({
      color: 0xede9fe,
      transparent: true,
      opacity: 0.85,
    });
    this.playMesh = new THREE.Mesh(this.playGeom, this.playMat);
    this.scene.add(this.playMesh);
  }

  contextValid(): boolean {
    return !this.renderer.getContext().isContextLost();
  }

  setField(field: TerrainField): void {
    this.field = field;
  }

  resize(w: number, h: number): void {
    if (this.disposed) return;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  /**
   * @param head fractional analysis-frame position currently sounding
   * @param tSec wall-clock seconds (for gentle camera drift)
   * @param reduced respect prefers-reduced-motion (still camera)
   * @param heightScale terrain relief (0..1 eased in on load)
   */
  update(head: number, tSec: number, reduced: boolean, heightScale: number): void {
    if (this.disposed || !this.field) return;
    const { data, frames, cols } = this.field;
    const c = Math.min(cols, COLS);

    // ROWS of the mesh show frames [head-ROWS+1 .. head]; newest at the front
    for (let r = 0; r < ROWS; r++) {
      // depth row 0 = far/oldest, ROWS-1 = near/newest (present)
      const fFloat = head - (ROWS - 1 - r);
      const f = Math.max(0, Math.min(frames - 1, Math.round(fFloat)));
      const inRange = fFloat >= 0 && fFloat <= frames - 1;
      const rowBase = f * cols;
      for (let x = 0; x < COLS; x++) {
        const vi = (r * COLS + x) * 3;
        const cx = x < c ? x : c - 1;
        const v = inRange ? data[rowBase + cx] : 0;
        const h = v * 10 * heightScale;
        this.pos[vi + 1] = h; // y displacement
        rampColor(v * (inRange ? 1 : 0.15) + (inRange ? 0.05 : 0), this.tmp);
        this.col[vi] = this.tmp.r;
        this.col[vi + 1] = this.tmp.g;
        this.col[vi + 2] = this.tmp.b;
      }
    }
    this.geom.attributes.position.needsUpdate = true;
    (this.geom.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    this.geom.computeVertexNormals();

    // playhead bar at the near edge (present row)
    const nearZ = DEPTH / 2;
    this.playMesh.position.set(0, 1.2 + 3 * heightScale, nearZ - 1.5);

    // slow fly-over camera drift (violet-lit landscape feel)
    const sway = reduced ? 0 : Math.sin(tSec * 0.18) * 6;
    const bob = reduced ? 14 : 13 + Math.sin(tSec * 0.11) * 2.2;
    this.camera.position.set(sway, bob, 40);
    this.camera.lookAt(sway * 0.3, 2.5, -8);

    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.geom.dispose(); // shared with the wireframe mesh
    this.mat.dispose();
    this.wireMat.dispose();
    this.playGeom.dispose();
    this.playMat.dispose();
    this.scene.fog = null;
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
