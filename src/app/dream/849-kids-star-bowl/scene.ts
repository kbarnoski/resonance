// Star Bowl three.js scene — night-blue bowl + glowing star-marbles.
//
// Marbles are rendered as additive THREE.Points with a per-point shader that
// draws a soft round glow when calm and adds prickly "spikes" (a starburst
// alpha pattern) as tension rises. The bowl is a translucent dish ring + a
// soft glowing center well. A backdrop of faint static stars sits behind.
//
// Renderer teardown disposes all geometries/materials and force-loses the
// WebGL context. Returns null if WebGL is unavailable.

import * as THREE from "three";
import { Marble, bowlHeight, BOWL_R } from "./physics";

export interface StarScene {
  resize: (w: number, h: number) => void;
  render: (marbles: Marble[], tension: number, tMs: number) => void;
  dispose: () => void;
}

const NIGHT_BLUE = new THREE.Color("#0b1830");
const CALM = new THREE.Color("#bcd6ff"); // soft blue-white
const SPIKY = new THREE.Color("#9fb8ff"); // cooler, slightly prickly silver-blue

const starVert = /* glsl */ `
  attribute float aSeed;
  uniform float uPixelRatio;
  uniform float uSize;
  varying float vSeed;
  void main() {
    vSeed = aSeed;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPixelRatio * (1.0 / -mv.z);
  }
`;

const starFrag = /* glsl */ `
  precision mediump float;
  uniform float uTension;
  uniform float uTime;
  uniform vec3 uCalm;
  uniform vec3 uSpiky;
  varying float vSeed;

  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float r = length(p) * 2.0; // 0 center .. 1 edge
    float ang = atan(p.y, p.x);

    // Round soft core glow (always present).
    float core = smoothstep(1.0, 0.0, r);
    core = pow(core, 1.6);

    // Prickly spikes: a cosine starburst whose sharpness/strength grows with
    // tension. When calm (uTension~0) this vanishes -> perfectly round.
    float twinkle = 0.5 + 0.5 * sin(uTime * 2.0 + vSeed * 30.0);
    float spikes = cos(ang * 5.0 + vSeed * 6.2831);
    spikes = pow(max(spikes, 0.0), mix(8.0, 1.5, uTension));
    float spikeMask = spikes * smoothstep(1.0, 0.15, r);
    float prickly = spikeMask * uTension * (0.6 + 0.4 * twinkle);

    float alpha = core + prickly * 0.9;
    alpha *= mix(0.85, 1.0, twinkle);
    if (alpha < 0.01) discard;

    vec3 col = mix(uCalm, uSpiky, uTension);
    // hot center
    col += vec3(0.25) * core;
    gl_FragColor = vec4(col, alpha);
  }
`;

export function makeScene(canvas: HTMLCanvasElement, count: number): StarScene | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "low-power",
    });
  } catch {
    return null;
  }
  if (!renderer.getContext()) return null;

  const pr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pr);

  const scene = new THREE.Scene();
  scene.background = NIGHT_BLUE;
  scene.fog = new THREE.FogExp2(NIGHT_BLUE, 0.18);

  // Camera looks down at a tilted dish — gives the "bowl on a table" read.
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 2.05, 2.35);
  camera.lookAt(0, -0.05, 0);

  // ── Backdrop stars (faint, static) ───────────────────────────────────────
  const bgCount = 120;
  const bgPos = new Float32Array(bgCount * 3);
  for (let i = 0; i < bgCount; i++) {
    bgPos[i * 3] = (Math.random() - 0.5) * 14;
    bgPos[i * 3 + 1] = Math.random() * 5 + 1.5;
    bgPos[i * 3 + 2] = -3 - Math.random() * 8;
  }
  const bgGeo = new THREE.BufferGeometry();
  bgGeo.setAttribute("position", new THREE.BufferAttribute(bgPos, 3));
  const bgMat = new THREE.PointsMaterial({
    color: 0x9fb8e8,
    size: 0.04,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  const bgStars = new THREE.Points(bgGeo, bgMat);
  scene.add(bgStars);

  // ── The bowl: a translucent dish ring + glowing center well ──────────────
  const bowlGroup = new THREE.Group();
  scene.add(bowlGroup);

  // Rim ring
  const ringGeo = new THREE.RingGeometry(BOWL_R * 0.96, BOWL_R * 1.06, 64);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x4a6aa8,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  bowlGroup.add(ring);

  // Concentric guide rings to read the dish as a bowl
  const guideGeos: THREE.BufferGeometry[] = [];
  const guideMats: THREE.Material[] = [];
  for (let k = 1; k <= 4; k++) {
    const rr = (k / 5) * BOWL_R;
    const seg = 64;
    const pos = new Float32Array((seg + 1) * 3);
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      pos[i * 3] = Math.cos(a) * rr;
      pos[i * 3 + 1] = -bowlHeight(rr / BOWL_R) - 0.02;
      pos[i * 3 + 2] = Math.sin(a) * rr;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const m = new THREE.LineBasicMaterial({
      color: 0x32508c,
      transparent: true,
      opacity: 0.35 - k * 0.04,
    });
    bowlGroup.add(new THREE.Line(g, m));
    guideGeos.push(g);
    guideMats.push(m);
  }

  // Calm center well — soft glowing disc that brightens as tension drops.
  const wellGeo = new THREE.CircleGeometry(BOWL_R * 0.34, 48);
  const wellMat = new THREE.MeshBasicMaterial({
    color: 0x2e5cc0,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const well = new THREE.Mesh(wellGeo, wellMat);
  well.rotation.x = -Math.PI / 2;
  well.position.y = -bowlHeight(0) - 0.03;
  bowlGroup.add(well);

  // ── Star-marbles (additive Points + custom shader) ───────────────────────
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) seeds[i] = Math.random();
  const marbleGeo = new THREE.BufferGeometry();
  marbleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  marbleGeo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));

  const marbleMat = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: pr },
      uSize: { value: 90 },
      uTension: { value: 0 },
      uTime: { value: 0 },
      uCalm: { value: CALM.clone() },
      uSpiky: { value: SPIKY.clone() },
    },
    vertexShader: starVert,
    fragmentShader: starFrag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const marbles = new THREE.Points(marbleGeo, marbleMat);
  scene.add(marbles);

  const posAttr = marbleGeo.getAttribute("position") as THREE.BufferAttribute;

  function resize(w: number, h: number) {
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }

  function render(ms: Marble[], tension: number, tMs: number) {
    const t = tMs * 0.001;
    for (let i = 0; i < ms.length && i < count; i++) {
      const m = ms[i];
      const r = Math.hypot(m.x, m.y) / BOWL_R;
      positions[i * 3] = m.x;
      positions[i * 3 + 1] = -bowlHeight(r) + 0.02; // ride the dish surface
      positions[i * 3 + 2] = m.y;
    }
    posAttr.needsUpdate = true;

    marbleMat.uniforms.uTension.value = tension;
    marbleMat.uniforms.uTime.value = t;

    // Center well glows brighter & warmer the calmer we are.
    wellMat.opacity = 0.25 + (1 - tension) * 0.45;
    (wellMat.color as THREE.Color).setHSL(0.6, 0.7, 0.45 + (1 - tension) * 0.15);
    // Rim flushes slightly cooler/brighter under tension.
    ringMat.opacity = 0.35 + tension * 0.35;

    // Gentle idle breathing of the whole bowl.
    bowlGroup.rotation.y = Math.sin(t * 0.12) * 0.05;

    renderer.render(scene, camera);
  }

  function dispose() {
    marbleGeo.dispose();
    marbleMat.dispose();
    bgGeo.dispose();
    bgMat.dispose();
    ringGeo.dispose();
    ringMat.dispose();
    wellGeo.dispose();
    wellMat.dispose();
    guideGeos.forEach((g) => g.dispose());
    guideMats.forEach((m) => m.dispose());
    renderer.dispose();
    renderer.forceContextLoss();
  }

  return { resize, render, dispose };
}
