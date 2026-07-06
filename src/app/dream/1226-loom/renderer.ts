// ─────────────────────────────────────────────────────────────────────────────
// renderer.ts — three.js 3D view of the vibrating ring.
//
// The ring is a glowing closed loop (LineLoop core + additive halo Points that
// share one live geometry) floating in 3D space, deforming with the simulation.
// A bright gold scan cursor orbits the loop at the read position; gold flares
// bloom at pluck points; the whole group gently auto-rotates. Palette: a deep
// teal → magenta jewel gradient around the ring with warm gold accents. The
// canvas is transparent so the page's jewel-toned background shows through.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from "three";

export interface LoomRenderer {
  resize: () => void;
  update: (disp: Float32Array, scanPhase: number, dt: number) => void;
  flareAt: (index: number) => void;
  dispose: () => void;
}

const RING_R = 2.2;
const DISP_SCALE = 1.15;

// A soft radial-gradient sprite (white core → transparent) for glow blobs.
function makeGlowTexture(): THREE.CanvasTexture {
  const size = 64;
  const cnv = document.createElement("canvas");
  cnv.width = size;
  cnv.height = size;
  const g = cnv.getContext("2d")!;
  const grad = g.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2,
  );
  grad.addColorStop(0.0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.55)");
  grad.addColorStop(1.0, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cnv);
  tex.needsUpdate = true;
  return tex;
}

// teal → magenta around the loop
function gradientColor(t: number, out: THREE.Color): void {
  const teal = { r: 0.06, g: 0.85, b: 0.82 };
  const mag = { r: 0.95, g: 0.16, b: 0.68 };
  out.setRGB(
    teal.r + (mag.r - teal.r) * t,
    teal.g + (mag.g - teal.g) * t,
    teal.b + (mag.b - teal.b) * t,
  );
}

export function createRenderer(canvas: HTMLCanvasElement): LoomRenderer | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
    });
  } catch {
    return null;
  }
  if (!renderer.getContext()) return null;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 6.2);
  camera.lookAt(0, 0, 0);

  const group = new THREE.Group();
  group.rotation.x = 0.34;
  scene.add(group);

  const N = 128;
  const positions = new Float32Array(N * 3);
  const colors = new Float32Array(N * 3);
  const baseCol = new THREE.Color();
  // initialise to a flat rest ring
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    positions[i * 3] = Math.cos(a) * RING_R;
    positions[i * 3 + 1] = Math.sin(a) * RING_R;
    positions[i * 3 + 2] = 0;
    gradientColor(i / N, baseCol);
    colors[i * 3] = baseCol.r;
    colors[i * 3 + 1] = baseCol.g;
    colors[i * 3 + 2] = baseCol.b;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const glowTex = makeGlowTexture();

  const lineMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const lineLoop = new THREE.LineLoop(geom, lineMat);
  group.add(lineLoop);

  const haloMat = new THREE.PointsMaterial({
    vertexColors: true,
    map: glowTex,
    size: 0.42,
    sizeAttenuation: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.85,
  });
  const halo = new THREE.Points(geom, haloMat);
  group.add(halo);

  // Scan cursor: bright gold core + gold halo sprite
  const cursor = new THREE.Group();
  const cursorCoreMat = new THREE.MeshBasicMaterial({ color: 0xffe6a0 });
  const cursorCore = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 12, 12),
    cursorCoreMat,
  );
  cursor.add(cursorCore);
  const cursorHaloMat = new THREE.SpriteMaterial({
    map: glowTex,
    color: 0xffcf5c,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.9,
  });
  const cursorHalo = new THREE.Sprite(cursorHaloMat);
  cursorHalo.scale.set(0.9, 0.9, 0.9);
  cursor.add(cursorHalo);
  group.add(cursor);

  // Pluck flares — pool of gold additive sprites
  const FLARES = 12;
  const flareMats: THREE.SpriteMaterial[] = [];
  const flareSprites: THREE.Sprite[] = [];
  const flareLife = new Float32Array(FLARES);
  const flareBaseAngle = new Float32Array(FLARES);
  for (let i = 0; i < FLARES; i++) {
    const m = new THREE.SpriteMaterial({
      map: glowTex,
      color: 0xffc24d,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0,
    });
    const s = new THREE.Sprite(m);
    s.scale.setScalar(0.01);
    group.add(s);
    flareMats.push(m);
    flareSprites.push(s);
  }
  let flareCursor = 0;

  let clock = 0;

  function resize(): void {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function update(disp: Float32Array, scanPhase: number, dt: number): void {
    clock += dt;
    const posAttr = geom.getAttribute("position") as THREE.BufferAttribute;
    const colAttr = geom.getAttribute("color") as THREE.BufferAttribute;
    const pArr = posAttr.array as Float32Array;
    const cArr = colAttr.array as Float32Array;

    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const d = disp[i];
      const r = RING_R + d * DISP_SCALE;
      pArr[i * 3] = Math.cos(a) * r;
      pArr[i * 3 + 1] = Math.sin(a) * r;
      pArr[i * 3 + 2] = d * 0.45; // slight out-of-plane bulge for 3D life
      // brighten where displaced
      const b = 0.55 + Math.min(1, Math.abs(d) * 2.4) * 0.9;
      gradientColor(i / N, baseCol);
      cArr[i * 3] = baseCol.r * b;
      cArr[i * 3 + 1] = baseCol.g * b;
      cArr[i * 3 + 2] = baseCol.b * b;
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;

    // scan cursor position (interpolated read location)
    const p = scanPhase * N;
    const i0 = Math.floor(p) % N;
    const frac = p - Math.floor(p);
    const i1 = (i0 + 1) % N;
    const dInterp = disp[i0] * (1 - frac) + disp[i1] * frac;
    const ca = scanPhase * Math.PI * 2;
    const cr = RING_R + dInterp * DISP_SCALE;
    cursor.position.set(
      Math.cos(ca) * cr,
      Math.sin(ca) * cr,
      dInterp * 0.45,
    );

    // flares fade
    for (let i = 0; i < FLARES; i++) {
      if (flareLife[i] <= 0) continue;
      flareLife[i] -= dt / 0.75;
      const life = Math.max(0, flareLife[i]);
      const fa = flareBaseAngle[i];
      flareSprites[i].position.set(
        Math.cos(fa) * RING_R,
        Math.sin(fa) * RING_R,
        0,
      );
      flareSprites[i].scale.setScalar(0.25 + life * 1.3);
      flareMats[i].opacity = life * 0.95;
    }

    // gentle auto-rotation
    group.rotation.y += dt * 0.28;
    group.rotation.x = 0.34 + Math.sin(clock * 0.16) * 0.12;

    renderer.render(scene, camera);
  }

  function flareAt(index: number): void {
    const i = flareCursor % FLARES;
    flareCursor++;
    flareLife[i] = 1;
    flareBaseAngle[i] = (index / N) * Math.PI * 2;
  }

  function dispose(): void {
    geom.dispose();
    lineMat.dispose();
    haloMat.dispose();
    glowTex.dispose();
    cursorCore.geometry.dispose();
    cursorCoreMat.dispose();
    cursorHaloMat.dispose();
    for (const m of flareMats) m.dispose();
    renderer.dispose();
    const ctx = renderer.getContext();
    const ext = ctx.getExtension("WEBGL_lose_context");
    ext?.loseContext();
  }

  resize();

  return { resize, update, flareAt, dispose };
}
