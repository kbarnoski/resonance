// ─────────────────────────────────────────────────────────────────────────────
// 5816-astrolabe · the celestial sphere (three.js)
//
// A GPU-rastered night sky seen from its centre. The pitch-stars sit on an
// engraved sphere of latitude rings — the octaves — like the plate of an
// astrolabe. A distant seeded starfield rotates for parallax. A reticle pinned
// to screen-centre is the alidade: whatever it rests on is what the beam aims
// at. The whole pitch-sphere drifts slowly around its axis so the sky is alive
// from the instant the page loads.
//
// Rendering only. Proximity / synthesis decisions live in page.tsx; this class
// consumes a per-star glow array and paints it. Colours use a violet ramp with
// near-white cores. No Math.random (seeded field), no strobe (all luminance
// changes are slow drifts well under 3 Hz).
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from "three";
import { mulberry32, clamp01 } from "./rng";
import { RINGS, type Star } from "./starmap";

const R = 14; // sphere radius (camera at centre)
const DRIFT = 0.014; // rad/s — slow azimuth drift of the pitch-sphere

/** Soft radial dot, generated once, used for star cores and glow. */
function makeDotTexture(): THREE.Texture {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(226,214,255,0.85)");
  grad.addColorStop(0.6, "rgba(150,120,240,0.28)");
  grad.addColorStop(1, "rgba(120,90,230,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

/** Violet ramp: lower octave-ring = deep violet, higher = pale near-white. */
function ringColor(ring: number): THREE.Color {
  const t = RINGS <= 1 ? 0.5 : ring / (RINGS - 1);
  const c = new THREE.Color();
  // hue ~ violet (0.72), rising lightness & falling saturation with the octave
  c.setHSL(0.72 - t * 0.03, 0.62 - t * 0.28, 0.5 + t * 0.34);
  return c;
}

export class SkyScene {
  readonly domElement: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private sphere: THREE.Group; // rotating pitch-sphere (stars + graticule)
  private field: THREE.Points; // distant background stars
  private reticle: THREE.Group;
  private reticleMat: THREE.MeshBasicMaterial[];

  private cores: THREE.Sprite[] = [];
  private glows: THREE.Sprite[] = [];
  private baseColors: THREE.Color[] = [];
  private twinklePhase: number[] = [];
  private twinkleRate: number[] = [];

  private drift = 0;

  constructor(mount: HTMLElement, stars: Star[]) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(mount.clientWidth, mount.clientHeight);
    this.renderer.setClearColor(0x05040a, 1);
    this.domElement = this.renderer.domElement;
    mount.appendChild(this.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x05040a, 0.012);

    this.camera = new THREE.PerspectiveCamera(
      62,
      mount.clientWidth / mount.clientHeight,
      0.1,
      200,
    );
    this.camera.position.set(0, 0, 0);
    this.scene.add(this.camera);

    const dot = makeDotTexture();

    // ── the pitch-sphere group ──
    this.sphere = new THREE.Group();
    this.scene.add(this.sphere);

    const rng = mulberry32(0x5816);

    for (const s of stars) {
      const color = ringColor(s.ring);
      this.baseColors.push(color);
      const px = s.dir[0] * R;
      const py = s.dir[1] * R;
      const pz = s.dir[2] * R;

      // glow halo (violet, additive, larger)
      const glowMat = new THREE.SpriteMaterial({
        map: dot,
        color: color.clone(),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.0,
      });
      const glow = new THREE.Sprite(glowMat);
      glow.position.set(px, py, pz);
      glow.scale.setScalar(2.6);
      this.sphere.add(glow);
      this.glows.push(glow);

      // bright core (near white, additive)
      const coreMat = new THREE.SpriteMaterial({
        map: dot,
        color: new THREE.Color(0xf3efff),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.9,
      });
      const core = new THREE.Sprite(coreMat);
      core.position.set(px, py, pz);
      core.scale.setScalar(0.62);
      this.sphere.add(core);
      this.cores.push(core);

      this.twinklePhase.push(rng() * Math.PI * 2);
      this.twinkleRate.push(0.35 + rng() * 0.45); // 0.35–0.8 Hz-ish, sub-3Hz
    }

    // ── graticule: one latitude circle per octave-ring (the astrolabe plate) ──
    for (let ring = 0; ring < RINGS; ring++) {
      const t = RINGS <= 1 ? 0.5 : ring / (RINGS - 1);
      const el = (t * 2 - 1) * 1.02;
      const y = Math.sin(el) * R;
      const rad = Math.cos(el) * R;
      const seg = 96;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.sin(a) * rad, y, Math.cos(a) * rad));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({
        color: ringColor(ring),
        transparent: true,
        opacity: 0.16,
      });
      this.sphere.add(new THREE.Line(geo, mat));
    }

    // ── distant seeded starfield (parallax life) ──
    const N = 900;
    const pos = new Float32Array(N * 3);
    const fieldRng = mulberry32(0x5816 ^ 0x9e37);
    for (let i = 0; i < N; i++) {
      // uniform on a large sphere
      const u = fieldRng() * 2 - 1;
      const phi = fieldRng() * Math.PI * 2;
      const rr = Math.sqrt(1 - u * u);
      const rad = 60 + fieldRng() * 40;
      pos[i * 3] = rad * rr * Math.cos(phi);
      pos[i * 3 + 1] = rad * u;
      pos[i * 3 + 2] = rad * rr * Math.sin(phi);
    }
    const fieldGeo = new THREE.BufferGeometry();
    fieldGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const fieldMat = new THREE.PointsMaterial({
      map: dot,
      color: new THREE.Color(0xb9a8f0),
      size: 0.9,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.field = new THREE.Points(fieldGeo, fieldMat);
    this.scene.add(this.field);

    // ── reticle (the alidade), pinned to screen-centre ──
    this.reticle = new THREE.Group();
    this.reticleMat = [];
    const mkRing = (inner: number, outer: number, opacity: number) => {
      const geo = new THREE.RingGeometry(inner, outer, 48);
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(0xc9b8ff),
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      this.reticleMat.push(mat);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(0, 0, -2);
      this.reticle.add(m);
    };
    mkRing(0.05, 0.056, 0.85);
    mkRing(0.09, 0.093, 0.35);
    this.camera.add(this.reticle);

    this.resize(mount.clientWidth, mount.clientHeight);
  }

  /** Current azimuth drift of the pitch-sphere (radians around Y). */
  getDrift(): number {
    return this.drift;
  }

  /** Transform a world-space forward into the pitch-sphere's local frame.
   *  The sphere is rotated by +drift about Y, so the inverse is Ry(-drift). */
  worldToLocalDir(fwd: [number, number, number]): [number, number, number] {
    const c = Math.cos(this.drift);
    const s = Math.sin(this.drift);
    return [fwd[0] * c - fwd[2] * s, fwd[1], fwd[0] * s + fwd[2] * c];
  }

  resize(w: number, h: number): void {
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /**
   * @param fwd     world forward the camera should look along
   * @param glow    per-star glow 0..1 (proximity + pluck flash)
   * @param aim     0..1 how strongly the beam is centred on a star
   * @param dt      seconds since last frame
   * @param tSec    performance.now()/1000
   */
  render(
    fwd: [number, number, number],
    glow: number[],
    aim: number,
    dt: number,
    tSec: number,
  ): void {
    this.drift = (this.drift + DRIFT * dt) % (Math.PI * 2);
    this.sphere.rotation.y = this.drift;
    this.field.rotation.y = this.drift * 0.35;

    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(fwd[0], fwd[1], fwd[2]);

    for (let i = 0; i < this.cores.length; i++) {
      const tw = 0.72 + 0.28 * Math.sin(tSec * this.twinkleRate[i] * Math.PI * 2 + this.twinklePhase[i]);
      const g = clamp01(glow[i] ?? 0);
      // core: gently twinkling baseline, blooming with glow
      const core = this.cores[i];
      core.material.opacity = 0.35 * tw + 0.65 * g;
      core.scale.setScalar(0.5 + 0.12 * tw + 0.9 * g);
      // halo: violet, only really present when the beam is near
      const halo = this.glows[i];
      halo.material.opacity = 0.06 * tw + 0.9 * g;
      halo.scale.setScalar(1.8 + 3.4 * g);
      const bc = this.baseColors[i];
      halo.material.color.setRGB(bc.r, bc.g, bc.b);
    }

    // reticle brightens as it homes onto a star (slow, sub-3Hz)
    const pulse = 0.6 + 0.4 * clamp01(aim);
    this.reticleMat[0].opacity = 0.5 + 0.5 * pulse;
    this.reticleMat[1].opacity = 0.2 + 0.3 * pulse;

    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.renderer.dispose();
    this.scene.traverse((o) => {
      const any = o as unknown as {
        geometry?: { dispose?: () => void };
        material?: { dispose?: () => void } | Array<{ dispose?: () => void }>;
      };
      any.geometry?.dispose?.();
      const m = any.material;
      if (Array.isArray(m)) m.forEach((mm) => mm.dispose?.());
      else m?.dispose?.();
    });
  }

  detach(): void {
    this.domElement.parentNode?.removeChild(this.domElement);
  }
}
