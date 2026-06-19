// scene.ts — three.js renderer that makes the SHARED PULSE visible.
//
// One ring, centered, that BREATHES on every shared beat (radius + glow snap on
// the down-phase, decay through the beat). Notes bloom as points that ride the
// ring at the angle of their pitch and the radius of their velocity:
//   • YOUR notes   → warm amber/rose, swelling outward
//   • PARTNER notes → cool cyan/violet
// Both sit on the SAME ring driven by the SAME shared beatPhase — so you can SEE
// the two players locked to one pulse despite the network gap.
//
// One driver per frame mutates buffers/uniforms; React never re-renders per
// frame. Full GPU teardown on dispose(). If WebGL is unavailable the page falls
// back to a Canvas2D ring (see page.tsx) — this module simply throws on init.

import * as THREE from "three";

const MAX_BLOOMS = 96;

interface Bloom {
  angle: number; // radians around the ring
  radius: number; // base radius (0.45..0.95)
  born: number; // performance.now() ms
  life: number; // ms
  warm: boolean; // me=warm, them=cool
  vel: number;
}

const WARM = new THREE.Color("#ffb27a"); // amber/rose (me)
const WARM2 = new THREE.Color("#ff7a9c");
const COOL = new THREE.Color("#7adfff"); // cyan/violet (partner)
const COOL2 = new THREE.Color("#b18cff");

export class PulseScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private host: HTMLElement;
  private onResize: () => void;
  private disposables: Array<{ dispose: () => void }> = [];

  private ring: THREE.Line;
  private ringMat: THREE.LineBasicMaterial;
  private ringPos: THREE.BufferAttribute;
  private ringBase: Float32Array; // unit-circle samples
  private readonly RING_SEGS = 220;

  private core: THREE.Mesh;
  private coreMat: THREE.MeshBasicMaterial;

  private points: THREE.Points;
  private pointGeom: THREE.BufferGeometry;
  private pointPos: THREE.BufferAttribute;
  private pointColor: THREE.BufferAttribute;
  private pointSize: THREE.BufferAttribute;

  private blooms: Bloom[] = [];
  private phase = 0; // 0..1 shared beat phase
  private locked = false;

  constructor(host: HTMLElement) {
    this.host = host;
    const w = host.clientWidth || 800;
    const h = host.clientHeight || 500;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(0x000000, 0);
    host.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    const aspect = w / h;
    this.camera = new THREE.OrthographicCamera(
      -aspect, aspect, 1, -1, 0.1, 10,
    );
    this.camera.position.z = 2;

    // ── breathing ring ──
    this.ringBase = new Float32Array((this.RING_SEGS + 1) * 3);
    const ringArr = new Float32Array((this.RING_SEGS + 1) * 3);
    for (let i = 0; i <= this.RING_SEGS; i++) {
      const a = (i / this.RING_SEGS) * Math.PI * 2;
      this.ringBase[i * 3] = Math.cos(a);
      this.ringBase[i * 3 + 1] = Math.sin(a);
      this.ringBase[i * 3 + 2] = 0;
    }
    ringArr.set(this.ringBase);
    const ringGeom = new THREE.BufferGeometry();
    this.ringPos = new THREE.BufferAttribute(ringArr, 3);
    ringGeom.setAttribute("position", this.ringPos);
    this.ringMat = new THREE.LineBasicMaterial({
      color: new THREE.Color("#e7d9ff"),
      transparent: true,
      opacity: 0.5,
    });
    this.ring = new THREE.Line(ringGeom, this.ringMat);
    this.scene.add(this.ring);
    this.disposables.push(ringGeom, this.ringMat);

    // ── central breathing core ──
    const coreGeom = new THREE.CircleGeometry(0.13, 48);
    this.coreMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color("#ffd9b0"),
      transparent: true,
      opacity: 0.25,
    });
    this.core = new THREE.Mesh(coreGeom, this.coreMat);
    this.scene.add(this.core);
    this.disposables.push(coreGeom, this.coreMat);

    // ── note blooms (points) ──
    this.pointGeom = new THREE.BufferGeometry();
    this.pointPos = new THREE.BufferAttribute(new Float32Array(MAX_BLOOMS * 3), 3);
    this.pointColor = new THREE.BufferAttribute(new Float32Array(MAX_BLOOMS * 3), 3);
    this.pointSize = new THREE.BufferAttribute(new Float32Array(MAX_BLOOMS), 1);
    this.pointGeom.setAttribute("position", this.pointPos);
    this.pointGeom.setAttribute("aColor", this.pointColor);
    this.pointGeom.setAttribute("aSize", this.pointSize);
    this.pointGeom.setDrawRange(0, 0);

    const pointMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uPix: { value: Math.min(window.devicePixelRatio, 2) } },
      vertexShader: `
        attribute vec3 aColor; attribute float aSize;
        varying vec3 vColor; uniform float uPix;
        void main(){
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uPix;
        }`,
      fragmentShader: `
        varying vec3 vColor;
        void main(){
          vec2 d = gl_PointCoord - vec2(0.5);
          float r = length(d);
          float a = smoothstep(0.5, 0.0, r);
          gl_FragColor = vec4(vColor, a);
        }`,
    });
    this.points = new THREE.Points(this.pointGeom, pointMat);
    this.scene.add(this.points);
    this.disposables.push(this.pointGeom, pointMat);

    this.onResize = () => {
      const nw = this.host.clientWidth || 800;
      const nh = this.host.clientHeight || 500;
      this.renderer.setSize(nw, nh);
      const ar = nw / nh;
      this.camera.left = -ar;
      this.camera.right = ar;
      this.camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", this.onResize);
  }

  setPhase(phase: number, locked: boolean) {
    this.phase = phase;
    this.locked = locked;
  }

  // Add a note bloom. `pitch01`: 0..1 across the keyboard → ring angle.
  addBloom(pitch01: number, vel: number, warm: boolean) {
    const angle = -Math.PI / 2 + pitch01 * Math.PI * 2;
    this.blooms.push({
      angle,
      radius: 0.5 + Math.min(1, Math.max(0, vel)) * 0.42,
      born: performance.now(),
      life: 1600,
      warm,
      vel: Math.min(1, Math.max(0.1, vel)),
    });
    if (this.blooms.length > MAX_BLOOMS) this.blooms.shift();
  }

  // Per-frame driver.
  render() {
    const now = performance.now();

    // breathing: sharp swell at phase 0, decay across the beat
    const swell = Math.pow(1 - this.phase, 2.2); // 1 at downbeat → 0
    const baseR = 0.78 + swell * 0.12;
    const breath = 0.5 + 0.5 * Math.sin(now * 0.0009);

    // ring radius pulse
    const arr = this.ringPos.array as Float32Array;
    for (let i = 0; i <= this.RING_SEGS; i++) {
      // subtle organic wobble so the ring feels felt, not CG
      const a = (i / this.RING_SEGS) * Math.PI * 2;
      const wob = 1 + 0.015 * Math.sin(a * 5 + now * 0.0012);
      const r = baseR * wob;
      arr[i * 3] = this.ringBase[i * 3] * r;
      arr[i * 3 + 1] = this.ringBase[i * 3 + 1] * r;
    }
    this.ringPos.needsUpdate = true;
    this.ringMat.opacity = 0.32 + swell * 0.5;
    this.ringMat.color.setHSL(
      this.locked ? 0.42 : 0.08, // emerald when locked, amber when not
      0.5,
      0.7 + swell * 0.15,
    );

    // core
    const cs = 0.85 + swell * 0.7 + breath * 0.1;
    this.core.scale.setScalar(cs);
    this.coreMat.opacity = 0.12 + swell * 0.5;

    // blooms → point buffer
    const pos = this.pointPos.array as Float32Array;
    const col = this.pointColor.array as Float32Array;
    const siz = this.pointSize.array as Float32Array;
    let n = 0;
    for (let i = this.blooms.length - 1; i >= 0 && n < MAX_BLOOMS; i--) {
      const b = this.blooms[i];
      const age = (now - b.born) / b.life;
      if (age >= 1) {
        this.blooms.splice(i, 1);
        continue;
      }
      // ride outward then fade; ring radius modulated by current swell
      const grow = 1 - Math.pow(1 - Math.min(1, age * 2.2), 2);
      const r = (b.radius + swell * 0.05) * (0.6 + 0.4 * grow);
      pos[n * 3] = Math.cos(b.angle) * r;
      pos[n * 3 + 1] = Math.sin(b.angle) * r;
      pos[n * 3 + 2] = 0;
      const fade = 1 - age;
      const cA = b.warm ? WARM : COOL;
      const cB = b.warm ? WARM2 : COOL2;
      const mix = b.vel;
      col[n * 3] = (cA.r + (cB.r - cA.r) * mix) * fade;
      col[n * 3 + 1] = (cA.g + (cB.g - cA.g) * mix) * fade;
      col[n * 3 + 2] = (cA.b + (cB.b - cA.b) * mix) * fade;
      siz[n] = (10 + b.vel * 26) * (0.5 + 0.7 * fade);
      n++;
    }
    this.pointPos.needsUpdate = true;
    this.pointColor.needsUpdate = true;
    this.pointSize.needsUpdate = true;
    this.pointGeom.setDrawRange(0, n);

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener("resize", this.onResize);
    for (const d of this.disposables) {
      try {
        d.dispose();
      } catch {
        /* ignore */
      }
    }
    try {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
    } catch {
      /* ignore */
    }
    if (this.renderer.domElement.parentNode === this.host) {
      try {
        this.host.removeChild(this.renderer.domElement);
      } catch {
        /* ignore */
      }
    }
  }
}
