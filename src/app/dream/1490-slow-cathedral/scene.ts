// ─────────────────────────────────────────────────────────────────────────────
// scene.ts — the three.js SCENE-GRAPH that renders the growing cathedral.
//
// NOT a full-screen shader and NOT Canvas2D: a real 3D scene of luminous
// struts (THREE.LineSegments, additive), glowing junction nodes (THREE.Points),
// and a small pool of soft tip-flares (THREE.Sprite) that bloom where a branch
// has just reached a growth node. Geometry is APPENDED incrementally as the
// growth state machine accretes nodes — the buffers only ever fill, mirroring
// the memory of the structure.
//
// Palette ascends with height: deep-indigo foundations → violet nave → warm
// gold/white cathedral-glass at the spire. Everything additive on a near-black
// indigo ground, so the structure reads as light, never a void.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from "three";
import type { CathedralGrowth, GrowthEvent } from "./growth";

const TIP_POOL = 26;

/** Soft radial glow sprite, generated (no external asset), for additive bloom. */
function makeGlowTexture(): THREE.Texture {
  const s = 64;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.35, "rgba(230,205,255,0.6)");
  grd.addColorStop(1, "rgba(120,90,220,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  const tex = new THREE.Texture(c);
  tex.needsUpdate = true;
  return tex;
}

/** Height-driven cathedral-glass colour: indigo base → gold/white spire. */
function heightColor(t: number, out: THREE.Color): THREE.Color {
  const tt = Math.min(1, Math.max(0, t));
  // hue: ~0.70 (indigo/violet) sweeping down to ~0.11 (warm gold)
  const hue = 0.70 - 0.59 * Math.pow(tt, 0.85);
  const sat = 0.85 - 0.32 * tt;
  const light = 0.34 + 0.52 * Math.pow(tt, 0.9);
  return out.setHSL(hue, sat, light);
}

export interface CamParams {
  /** extra yaw offset from tilt/pointer (radians) */
  yaw: number;
  /** extra pitch offset from tilt/pointer (radians) */
  pitch: number;
}

export class CathedralScene {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly group: THREE.Group;
  private readonly mount: HTMLElement;
  private readonly growth: CathedralGrowth;

  private readonly segGeom: THREE.BufferGeometry;
  private readonly segPos: THREE.BufferAttribute;
  private readonly segCol: THREE.BufferAttribute;
  private readonly segMat: THREE.LineBasicMaterial;
  private segVerts = 0;

  private readonly ptGeom: THREE.BufferGeometry;
  private readonly ptPos: THREE.BufferAttribute;
  private readonly ptCol: THREE.BufferAttribute;
  private readonly ptMat: THREE.PointsMaterial;
  private ptCount = 0;

  private readonly glowTex: THREE.Texture;
  private readonly tips: { sprite: THREE.Sprite; life: number; max: number }[] = [];
  private tipCursor = 0;

  private readonly floor: THREE.Mesh;
  private builtNodes = 0;
  private camAngle = 0;
  private readonly tmpColor = new THREE.Color();

  constructor(mount: HTMLElement, growth: CathedralGrowth) {
    this.mount = mount;
    this.growth = growth;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.renderer.domElement.style.touchAction = "none";

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05040f);
    this.scene.fog = new THREE.FogExp2(0x05040f, 0.036);

    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 200);

    this.group = new THREE.Group();
    // Centre the structure vertically around the orbit origin.
    this.group.position.y = -growth.H * 0.5;
    this.scene.add(this.group);

    const cap = growth.MAX_NODES;

    // struts (LineSegments): 2 vertices per node (parent → node)
    this.segGeom = new THREE.BufferGeometry();
    this.segPos = new THREE.BufferAttribute(new Float32Array(cap * 2 * 3), 3);
    this.segCol = new THREE.BufferAttribute(new Float32Array(cap * 2 * 3), 3);
    this.segPos.setUsage(THREE.DynamicDrawUsage);
    this.segCol.setUsage(THREE.DynamicDrawUsage);
    this.segGeom.setAttribute("position", this.segPos);
    this.segGeom.setAttribute("color", this.segCol);
    this.segGeom.setDrawRange(0, 0);
    this.segMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.group.add(new THREE.LineSegments(this.segGeom, this.segMat));

    // junction nodes (Points)
    this.ptGeom = new THREE.BufferGeometry();
    this.ptPos = new THREE.BufferAttribute(new Float32Array(cap * 3), 3);
    this.ptCol = new THREE.BufferAttribute(new Float32Array(cap * 3), 3);
    this.ptPos.setUsage(THREE.DynamicDrawUsage);
    this.ptCol.setUsage(THREE.DynamicDrawUsage);
    this.ptGeom.setAttribute("position", this.ptPos);
    this.ptGeom.setAttribute("color", this.ptCol);
    this.ptGeom.setDrawRange(0, 0);
    this.glowTex = makeGlowTexture();
    this.ptMat = new THREE.PointsMaterial({
      map: this.glowTex,
      vertexColors: true,
      size: 0.19,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.group.add(new THREE.Points(this.ptGeom, this.ptMat));

    // tip flares (Sprites) — localized bloom where a branch just arrived
    for (let i = 0; i < TIP_POOL; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.glowTex,
        color: 0xfff2d0,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const sp = new THREE.Sprite(mat);
      sp.scale.setScalar(0.001);
      sp.visible = false;
      this.group.add(sp);
      this.tips.push({ sprite: sp, life: 0, max: 1 });
    }

    // faint ground disc so the cathedral reads as standing on something
    this.floor = new THREE.Mesh(
      new THREE.CircleGeometry(growth.Rmax * 1.6, 48),
      new THREE.MeshBasicMaterial({
        color: 0x160f34,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
      }),
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -0.02;
    this.group.add(this.floor);

    mount.appendChild(this.renderer.domElement);
    this.resize();
  }

  resize(): void {
    const w = this.mount.clientWidth || window.innerWidth;
    const h = this.mount.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Wipe rendered geometry so a fresh growth pass rebuilds from the sapling. */
  resetBuilt(): void {
    this.builtNodes = 0;
    this.segVerts = 0;
    this.ptCount = 0;
    this.segGeom.setDrawRange(0, 0);
    this.ptGeom.setDrawRange(0, 0);
    for (const t of this.tips) {
      t.life = 0;
      t.sprite.visible = false;
      (t.sprite.material as THREE.SpriteMaterial).opacity = 0;
    }
  }

  /** Append newly grown nodes into the buffers and flare a few growth events. */
  syncGrowth(events: GrowthEvent[]): void {
    const g = this.growth;
    const n = g.nodeCount;
    for (let i = this.builtNodes; i < n; i++) {
      const x = g.nx[i];
      const y = g.ny[i];
      const z = g.nz[i];
      const par = g.parent[i];
      heightColor(y / g.H, this.tmpColor);

      // node point
      this.ptPos.setXYZ(this.ptCount, x, y, z);
      this.ptCol.setXYZ(this.ptCount, this.tmpColor.r, this.tmpColor.g, this.tmpColor.b);
      this.ptCount++;

      // strut to parent
      if (par >= 0) {
        const px = g.nx[par];
        const py = g.ny[par];
        const pz = g.nz[par];
        heightColor(py / g.H, this.tmpColor);
        this.segPos.setXYZ(this.segVerts, px, py, pz);
        this.segCol.setXYZ(this.segVerts, this.tmpColor.r, this.tmpColor.g, this.tmpColor.b);
        this.segVerts++;
        heightColor(y / g.H, this.tmpColor);
        this.segPos.setXYZ(this.segVerts, x, y, z);
        this.segCol.setXYZ(this.segVerts, this.tmpColor.r, this.tmpColor.g, this.tmpColor.b);
        this.segVerts++;
      }
    }
    this.builtNodes = n;

    this.segPos.needsUpdate = true;
    this.segCol.needsUpdate = true;
    this.ptPos.needsUpdate = true;
    this.ptCol.needsUpdate = true;
    this.segGeom.setDrawRange(0, this.segVerts);
    this.ptGeom.setDrawRange(0, this.ptCount);

    // Flare a sparse subset of events (visual + it maps to the audible bells).
    const stride = Math.max(1, Math.floor(events.length / 3));
    for (let i = 0; i < events.length; i += stride) {
      const e = events[i];
      const t = this.tips[this.tipCursor];
      this.tipCursor = (this.tipCursor + 1) % TIP_POOL;
      t.sprite.position.set(e.x, e.y, e.z);
      t.max = 0.26 + e.h * 0.4;
      t.life = 1;
      t.sprite.visible = true;
    }
  }

  /** @param brightness luminance multiplier in ~[0.8,1] (slow safe swell) */
  render(dt: number, brightness: number, cam: CamParams, camSpeed: number): void {
    // tip flares fade + gently shrink (localized, never full-frame flashing)
    for (const t of this.tips) {
      if (!t.sprite.visible) continue;
      t.life -= dt * 1.4;
      if (t.life <= 0) {
        t.sprite.visible = false;
        (t.sprite.material as THREE.SpriteMaterial).opacity = 0;
        continue;
      }
      const sc = t.max * (1.2 - t.life * 0.45);
      t.sprite.scale.setScalar(sc);
      (t.sprite.material as THREE.SpriteMaterial).opacity = t.life * 0.7 * brightness;
    }

    // material brightness follows the slow luminance swell
    this.segMat.opacity = 0.82 * brightness;
    this.ptMat.opacity = 0.72 * brightness;

    // slow auto-orbit that also rises + pulls back as the cathedral grows
    this.camAngle += camSpeed * dt;
    const p = this.growth.progress;
    const radius = 8.5 + 7.5 * p; // dolly out to keep the growing spire framed
    const baseY = 1.6 + 3.6 * p; // ascend with the structure
    const yaw = this.camAngle + cam.yaw;
    const pitch = 0.18 + cam.pitch;
    this.camera.position.set(
      Math.sin(yaw) * radius * Math.cos(pitch),
      baseY + Math.sin(pitch) * radius,
      Math.cos(yaw) * radius * Math.cos(pitch),
    );
    this.camera.lookAt(0, 0.4, 0);

    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.segGeom.dispose();
    this.segMat.dispose();
    this.ptGeom.dispose();
    this.ptMat.dispose();
    this.glowTex.dispose();
    for (const t of this.tips) (t.sprite.material as THREE.SpriteMaterial).dispose();
    this.floor.geometry.dispose();
    (this.floor.material as THREE.Material).dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    if (this.renderer.domElement.parentNode === this.mount) {
      this.mount.removeChild(this.renderer.domElement);
    }
  }
}
