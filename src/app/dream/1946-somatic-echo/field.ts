// ─────────────────────────────────────────────────────────────────────────────
// field.ts — the visual substrate: a body-aura of additive THREE.Points.
//
//   ~3,300 additive points form a luminous field around the felt "body".
//   Motion scatters them; stillness lets them GATHER into a coherent mandala /
//   aura. Additive blending; a soft bloom-like glow grows as smoothness rises.
//   Palette: deep indigo → warm gold on near-black (cosmic, warm).
//
//   SAFETY: no strobe / no flicker above ~3 Hz — only slow luminance drift.
//   prefers-reduced-motion calms the animation (smaller perturbation, slower).
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from "three";
import { GRID_W, GRID_H } from "./flow";

const POINT_COUNT = 3300;

export interface FieldDriver {
  smoothness: number;
  energy: number;
  centroidX: number;
  centroidY: number;
  reward: number;
  cells: Float32Array;
}

interface Particle {
  // rest position on the mandala (unit disc, polar)
  radius: number;
  angle: number;
  ring: number; // 0..1 which shell
  // current displacement from rest
  ox: number;
  oy: number;
  oz: number;
  vx: number;
  vy: number;
  vz: number;
}

export class AuraField {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private geometry: THREE.BufferGeometry;
  private material: THREE.PointsMaterial;
  private points: THREE.Points;
  private positions: Float32Array;
  private colors: Float32Array;
  private particles: Particle[] = [];
  private sprite: THREE.Texture;
  private rnd: () => number;
  private t = 0;
  private reduced: boolean;
  private disposed = false;

  // colours (deep indigo → warm gold)
  private readonly cIndigo = new THREE.Color(0x2a1f6e);
  private readonly cViolet = new THREE.Color(0x6a4bd6);
  private readonly cGold = new THREE.Color(0xffcf70);

  constructor(
    canvas: HTMLCanvasElement,
    rnd: () => number,
    reducedMotion: boolean,
  ) {
    this.rnd = rnd;
    this.reduced = reducedMotion;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: "low-power",
    });
    this.renderer.setClearColor(0x05040a, 1);
    const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio : 1, 2);
    this.renderer.setPixelRatio(dpr);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    this.camera.position.set(0, 0, 6.2);

    this.sprite = this.buildSprite();

    // build the mandala rest layout + particle state
    this.positions = new Float32Array(POINT_COUNT * 3);
    this.colors = new Float32Array(POINT_COUNT * 3);
    for (let i = 0; i < POINT_COUNT; i++) {
      // concentric-ish disc with golden-angle scatter → mandala feel
      const ring = Math.sqrt(this.rnd());
      const radius = ring * 3.4 + 0.15;
      const angle = i * 2.399963 + this.rnd() * 0.4;
      this.particles.push({
        radius,
        angle,
        ring,
        ox: 0,
        oy: 0,
        oz: (this.rnd() - 0.5) * 0.3,
        vx: 0,
        vy: 0,
        vz: 0,
      });
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.positions, 3),
    );
    this.geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));

    this.material = new THREE.PointsMaterial({
      size: 0.06,
      map: this.sprite,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
      opacity: 0.9,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.scene.add(this.points);
  }

  private buildSprite(): THREE.Texture {
    const s = 64;
    const c = document.createElement("canvas");
    c.width = c.height = s;
    const g = c.getContext("2d");
    if (g) {
      const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      grd.addColorStop(0, "rgba(255,255,255,1)");
      grd.addColorStop(0.25, "rgba(255,240,210,0.75)");
      grd.addColorStop(1, "rgba(120,110,220,0)");
      g.fillStyle = grd;
      g.fillRect(0, 0, s, s);
    }
    const tex = new THREE.Texture(c);
    tex.needsUpdate = true;
    return tex;
  }

  resize(w: number, h: number): void {
    if (this.disposed) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  /** Advance the field one frame and render. dt in seconds. */
  step(d: FieldDriver, dt: number): void {
    if (this.disposed) return;
    const step = Math.min(dt, 0.05);
    this.t += step * (this.reduced ? 0.4 : 1);

    const smooth = clamp01(d.smoothness);
    const energy = clamp01(d.energy);
    const reward = clamp01(d.reward);

    // motion-center in world space (from centroid)
    const mcx = (d.centroidX - 0.5) * 6;
    const mcy = (0.5 - d.centroidY) * 4.2;

    // agitation scatters; smoothness pulls the mandala tight.
    const scatter = (1 - smooth) * (0.6 + energy) * (this.reduced ? 0.5 : 1);
    // gather strength grows with smoothness AND reward (the resolved bloom)
    const gather = 0.6 + smooth * 2.2 + reward * 1.5;

    const pos = this.positions;
    const col = this.colors;
    const cells = d.cells;
    const drift = Math.sin(this.t * 0.5) * 0.15;

    for (let i = 0; i < POINT_COUNT; i++) {
      const p = this.particles[i];
      // rest target: a slowly-rotating mandala; smoothness slows the spin
      const spin = this.t * (0.05 + (1 - smooth) * 0.25);
      const a = p.angle + spin + p.ring * (0.5 + reward);
      const rx = Math.cos(a) * p.radius;
      const ry = Math.sin(a) * p.radius;

      // per-cell energy under this particle's rest angle scatters it outward
      const gx = Math.min(GRID_W - 1, ((rx / 3.6 + 0.5) * GRID_W) | 0);
      const gy = Math.min(GRID_H - 1, ((0.5 - ry / 3.6) * GRID_H) | 0);
      const cellE = cells[gy * GRID_W + gx] || 0;

      // deterministic per-particle turbulence phase (uses index, not random)
      const tphase = i * 0.021;
      const turbx = Math.sin(this.t * 3.1 + tphase) * scatter;
      const turby = Math.cos(this.t * 2.7 + tphase * 1.3) * scatter;

      // spring the offset toward (scatter push away from motion center)
      const pushX = (rx - mcx) * cellE * 0.35;
      const pushY = (ry - mcy) * cellE * 0.35;
      const tx = turbx + pushX + turbx * cellE * 2;
      const ty = turby + pushY + turby * cellE * 2;

      // integrate offset with a gather spring back to 0
      p.vx += (tx - p.ox) * step * 6 - p.ox * gather * step;
      p.vy += (ty - p.oy) * step * 6 - p.oy * gather * step;
      p.vz += -p.oz * gather * step * 0.5;
      const damp = 1 - Math.min(0.9, step * (4 + smooth * 6));
      p.vx *= damp;
      p.vy *= damp;
      p.vz *= damp;
      p.ox += p.vx * step;
      p.oy += p.vy * step;
      p.oz += p.vz * step;

      const j = i * 3;
      pos[j] = rx + p.ox;
      pos[j + 1] = ry + p.oy + drift;
      pos[j + 2] = p.oz;

      // colour: gold at the coherent core when smooth/rewarded; indigo when
      // scattered. Radius + reward + smoothness push toward warm gold.
      const warm = clamp01(
        (1 - p.ring) * (0.3 + smooth * 0.7) + reward * 0.6 - cellE * 0.5,
      );
      // luminance drift is slow (safe): a gentle breathing, well under 3 Hz
      const breath = 0.85 + 0.15 * Math.sin(this.t * 0.9 + p.ring * 3);
      const c = this.mixColor(warm, smooth);
      const lum = breath * (0.55 + 0.45 * smooth + reward * 0.3);
      col[j] = c.r * lum;
      col[j + 1] = c.g * lum;
      col[j + 2] = c.b * lum;
    }

    (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;

    // point size / glow: bloom grows with smoothness & reward
    this.material.size = 0.05 + smooth * 0.05 + reward * 0.06 + energy * 0.02;
    this.material.opacity = 0.72 + smooth * 0.18 + reward * 0.1;

    // gentle camera ease toward the motion center — presence, not lurching
    this.camera.position.x += (mcx * 0.12 - this.camera.position.x) * step * 1.5;
    this.camera.position.y += (mcy * 0.1 - this.camera.position.y) * step * 1.5;
    this.camera.lookAt(0, 0, 0);

    this.renderer.render(this.scene, this.camera);
  }

  private _tmp = new THREE.Color();
  private mixColor(warm: number, smooth: number): THREE.Color {
    // indigo → violet → gold as warm rises; violet mid keeps it cosmic
    const c = this._tmp;
    if (warm < 0.5) {
      c.copy(this.cIndigo).lerp(this.cViolet, warm * 2);
    } else {
      c.copy(this.cViolet).lerp(this.cGold, (warm - 0.5) * 2);
    }
    // when very smooth, nudge everything a touch warmer (the reward reads warm)
    c.lerp(this.cGold, smooth * 0.12);
    return c;
  }

  dispose(): void {
    this.disposed = true;
    this.scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
    this.sprite.dispose();
    this.renderer.dispose();
  }
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
