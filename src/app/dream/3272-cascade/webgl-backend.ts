// three.js WebGLRenderer fallback: the identical machine on the CPU with a
// smaller swarm (~1,400 particles), integrated in a normal RAF loop and drawn as
// additive instanced points (THREE.Points + a radial sprite). Same physics, same
// deflectors, same bars, same tuning as the WebGPU path — only the count and the
// place the maths runs differ.

import * as THREE from "three";
import {
  BAR_COUNT,
  CPU_COUNT,
  FIELD_H,
  MAX_SPEED,
  initState,
  rampRGB,
  stepCpu,
  type Backend,
  type SimParams,
  type SimState,
} from "./sim";

function makeSprite(): THREE.Texture {
  const s = 64;
  const cv = document.createElement("canvas");
  cv.width = s;
  cv.height = s;
  const g = cv.getContext("2d")!;
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, "rgba(255,255,255,0.55)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.28)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(cv);
  tex.needsUpdate = true;
  return tex;
}

export class WebGLBackend implements Backend {
  readonly kind = "webgl" as const;
  readonly count = CPU_COUNT;
  readonly hits = new Int32Array(BAR_COUNT);

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private geom: THREE.BufferGeometry;
  private posAttr: THREE.BufferAttribute;
  private colAttr: THREE.BufferAttribute;
  private sprite: THREE.Texture;
  private material: THREE.PointsMaterial;
  private state: SimState;
  private disposed = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 1);

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
    this.camera.position.z = 1;

    this.state = initState(CPU_COUNT);
    const positions = new Float32Array(CPU_COUNT * 3);
    const colors = new Float32Array(CPU_COUNT * 3);
    positions.fill(5); // start offscreen
    this.geom = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(positions, 3);
    this.colAttr = new THREE.BufferAttribute(colors, 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.colAttr.setUsage(THREE.DynamicDrawUsage);
    this.geom.setAttribute("position", this.posAttr);
    this.geom.setAttribute("color", this.colAttr);

    this.sprite = makeSprite();
    this.material = new THREE.PointsMaterial({
      size: 2.6,
      map: this.sprite,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      sizeAttenuation: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(this.geom, this.material);
    points.frustumCulled = false;
    this.scene.add(points);
  }

  private syncSize(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (
      this.canvas.width !== Math.floor(w * dpr) ||
      this.canvas.height !== Math.floor(h * dpr)
    ) {
      this.renderer.setSize(w, h, false);
    }
  }

  frame(dt: number, params: SimParams): void {
    if (this.disposed) return;
    this.syncSize();
    const step = Math.min(dt, 0.033);
    stepCpu(step, params, Math.random() * 1000, this.state, this.hits);

    const pv = this.state.posvel;
    const pos = this.posAttr.array as Float32Array;
    const col = this.colAttr.array as Float32Array;
    for (let i = 0; i < this.count; i++) {
      const pi = i * 4;
      const px = pv[pi];
      const ti = i * 3;
      if (px < 0) {
        pos[ti] = 5;
        pos[ti + 1] = 5;
        pos[ti + 2] = 0;
        continue;
      }
      const py = pv[pi + 1];
      pos[ti] = px * 2 - 1;
      pos[ti + 1] = 1 - (py / FIELD_H) * 2;
      pos[ti + 2] = 0;
      const spd = Math.hypot(pv[pi + 2], pv[pi + 3]) / MAX_SPEED;
      const [r, g, b] = rampRGB(spd);
      col[ti] = r;
      col[ti + 1] = g;
      col[ti + 2] = b;
    }
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.geom.dispose();
    this.material.dispose();
    this.sprite.dispose();
    this.renderer.dispose();
  }
}
