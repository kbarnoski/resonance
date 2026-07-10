// ─────────────────────────────────────────────────────────────────────────────
// viz.ts — three.js orbiting phase-ring visualiser for 1392-phase-loom.
//
// Each active loop is a tilted orbital RING with a glowing mote travelling
// around it once per loop period. Rings at different periods orbit at different
// rates, so you SEE the phasing: when two motes reach the same angle (loops in
// phase / a conjunction) a connecting filament lights and the core swells; as
// they drift apart the light fades. The swell tracks the (very slow) beat
// frequency, so its luminance change is well under 3 Hz — no strobe.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from "three";
import type { LoopSample } from "./engine";

const MAX_SLOTS = 10;

function makeGlowTexture(): THREE.Texture {
  const s = 64;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d");
  if (g) {
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.3, "rgba(255,255,255,0.7)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
  }
  const tex = new THREE.Texture(c);
  tex.needsUpdate = true;
  return tex;
}

function ringRadius(slot: number): number {
  return 1.2 + slot * 0.42;
}

interface RingGfx {
  ring: THREE.LineLoop;
  ringMat: THREE.LineBasicMaterial;
  mote: THREE.Sprite;
  moteMat: THREE.SpriteMaterial;
  color: THREE.Color;
  radius: number;
}

export class PhaseLoomViz {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private group: THREE.Group; // tilted orbital plane
  private glowTex: THREE.Texture;
  private rings = new Map<number, RingGfx>();
  private links: THREE.LineSegments;
  private linkGeom: THREE.BufferGeometry;
  private linkPos: Float32Array;
  private linkCol: Float32Array;
  private core: THREE.Sprite;
  private coreMat: THREE.SpriteMaterial;
  private mount: HTMLElement;
  private reduceMotion: boolean;
  private spin = 0;

  constructor(mount: HTMLElement) {
    this.mount = mount;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    mount.appendChild(this.renderer.domElement);

    this.reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x05040d, 0.028);

    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
    this.camera.position.set(0, 0, 12.5);
    this.camera.lookAt(0, 0, 0);

    this.group = new THREE.Group();
    this.group.rotation.x = -0.62; // look down onto the orbital plane
    this.scene.add(this.group);

    this.glowTex = makeGlowTexture();

    // conjunction filaments (additive; black = invisible)
    const maxPairs = (MAX_SLOTS * (MAX_SLOTS - 1)) / 2;
    this.linkPos = new Float32Array(maxPairs * 2 * 3);
    this.linkCol = new Float32Array(maxPairs * 2 * 3);
    this.linkGeom = new THREE.BufferGeometry();
    this.linkGeom.setAttribute(
      "position",
      new THREE.BufferAttribute(this.linkPos, 3),
    );
    this.linkGeom.setAttribute(
      "color",
      new THREE.BufferAttribute(this.linkCol, 3),
    );
    const linkMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.links = new THREE.LineSegments(this.linkGeom, linkMat);
    this.group.add(this.links);

    // central core that swells with total alignment
    this.coreMat = new THREE.SpriteMaterial({
      map: this.glowTex,
      color: new THREE.Color(0.7, 0.6, 1),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.core = new THREE.Sprite(this.coreMat);
    this.core.scale.setScalar(0.8);
    this.group.add(this.core);

    this.resize();
  }

  resize() {
    const w = this.mount.clientWidth || window.innerWidth;
    const h = this.mount.clientHeight || 480;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Reconcile the ring set with the currently active loops. */
  syncLoops(samples: LoopSample[]) {
    const wanted = new Set(samples.map((s) => s.slot));
    for (const [slot, g] of this.rings) {
      if (!wanted.has(slot)) {
        this.group.remove(g.ring);
        this.group.remove(g.mote);
        g.ring.geometry.dispose();
        g.ringMat.dispose();
        g.moteMat.dispose();
        this.rings.delete(slot);
      }
    }
    for (const s of samples) {
      if (this.rings.has(s.slot)) continue;
      this.rings.set(s.slot, this.makeRing(s.slot, s.hue));
    }
  }

  private makeRing(slot: number, hue: number): RingGfx {
    const radius = ringRadius(slot);
    const color = new THREE.Color().setHSL(hue / 360, 0.7, 0.6);
    const SEG = 96;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0));
    }
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    const ringMat = new THREE.LineBasicMaterial({
      color: color.clone(),
      transparent: true,
      opacity: 0.32,
    });
    const ring = new THREE.LineLoop(geom, ringMat);
    this.group.add(ring);

    const moteMat = new THREE.SpriteMaterial({
      map: this.glowTex,
      color: color.clone(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mote = new THREE.Sprite(moteMat);
    mote.scale.setScalar(0.5);
    this.group.add(mote);

    return { ring, ringMat, mote, moteMat, color, radius };
  }

  render(samples: LoopSample[], dt: number) {
    if (!this.reduceMotion) {
      this.spin += dt * 0.04;
      this.group.rotation.y = this.spin;
    }

    // update motes; remember angles for conjunction test
    const angles: { slot: number; a: number; g: RingGfx; phase: number }[] = [];
    for (const s of samples) {
      const g = this.rings.get(s.slot);
      if (!g) continue;
      const a = s.phase * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(a) * g.radius;
      const y = Math.sin(a) * g.radius;
      g.mote.position.set(x, y, 0);
      // flare on every cell step (frame-accurate from phase)
      const sp = s.phase * s.cellLen;
      const d = Math.abs(sp - Math.round(sp));
      const flare = Math.exp(-d * d * 26);
      g.mote.scale.setScalar(0.42 + flare * 0.5);
      g.moteMat.color.setHSL(s.hue / 360, 0.75, Math.min(0.85, 0.5 + flare * 0.4));
      g.moteMat.opacity = 0.75 + flare * 0.25;
      g.ringMat.opacity = 0.22 + flare * 0.18;
      angles.push({ slot: s.slot, a, g, phase: s.phase });
    }

    // conjunction filaments + total alignment
    let li = 0;
    let alignTotal = 0;
    for (let i = 0; i < angles.length; i++) {
      for (let j = i + 1; j < angles.length; j++) {
        const A = angles[i];
        const B = angles[j];
        let d = Math.abs(A.phase - B.phase);
        if (d > 0.5) d = 1 - d;
        const closeness = Math.max(0, 1 - d / 0.1); // within ~10% of a cycle
        if (closeness > 0.01) {
          const amt = closeness * closeness;
          alignTotal += amt;
          const pa = A.g.mote.position;
          const pb = B.g.mote.position;
          this.linkPos[li * 6 + 0] = pa.x;
          this.linkPos[li * 6 + 1] = pa.y;
          this.linkPos[li * 6 + 2] = pa.z;
          this.linkPos[li * 6 + 3] = pb.x;
          this.linkPos[li * 6 + 4] = pb.y;
          this.linkPos[li * 6 + 5] = pb.z;
          const ca = A.g.color;
          const cb = B.g.color;
          const k = 0.9 * amt;
          this.linkCol[li * 6 + 0] = ca.r * k;
          this.linkCol[li * 6 + 1] = ca.g * k;
          this.linkCol[li * 6 + 2] = ca.b * k;
          this.linkCol[li * 6 + 3] = cb.r * k;
          this.linkCol[li * 6 + 4] = cb.g * k;
          this.linkCol[li * 6 + 5] = cb.b * k;
          li++;
        }
      }
    }
    // zero the remaining filament slots
    for (let k = li * 6; k < this.linkPos.length; k++) {
      this.linkPos[k] = 0;
      this.linkCol[k] = 0;
    }
    (this.linkGeom.attributes.position as THREE.BufferAttribute).needsUpdate =
      true;
    (this.linkGeom.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    this.linkGeom.setDrawRange(0, li * 2);

    // core swell (slow, follows the beat frequency — inherently < 3 Hz)
    const align = Math.min(1, alignTotal / 3);
    const scaleCap = this.reduceMotion ? 1.6 : 2.8;
    this.core.scale.setScalar(0.7 + align * scaleCap);
    this.coreMat.opacity = 0.12 + align * 0.55;

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    for (const [, g] of this.rings) {
      this.group.remove(g.ring);
      this.group.remove(g.mote);
      g.ring.geometry.dispose();
      g.ringMat.dispose();
      g.moteMat.dispose();
    }
    this.rings.clear();
    this.linkGeom.dispose();
    (this.links.material as THREE.Material).dispose();
    this.coreMat.dispose();
    this.glowTex.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
