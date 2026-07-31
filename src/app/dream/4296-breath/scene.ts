// 4296 · BREATH — scene.ts
//
// The companion as a luminous three.js PRESENCE in a dark violet space: a bright
// icosahedron core wrapped in two additive glow shells and a breathing particle
// halo. Its whole body encodes attention through DISTANCE — it draws NEAR the
// camera when invitation is high ("I'm ready to answer") and RECEDES into the
// fog, dimming, when you're mid-thought ("keep going, I'm listening"). It blooms
// at the instant it decides to speak, and always has a slow idle breath so the
// scene is alive before you play. Your own notes leave brief rising light-traces.
//
// Core three only — no postprocessing packages. Deterministic (seeded mulberry32).

import * as THREE from "three";
import { makeMulberry32 } from "./music";

// Violet art ramp (raw colour is allowed only inside the WebGL art).
const VIOLET = [0x8b5cf6, 0xa78bfa, 0xc4b5fd, 0xddd6fe];
const BACKDROP = 0x07040f;

const NEAR_Z = 2.6; // presence position when fully invited (large, close)
const FAR_Z = -7.0; // presence position when withdrawn (small, dim, far)
const TRACE_COUNT = 72;

export interface BreathState {
  approach: number; // 0 = withdrawn/far, 1 = near/ready
  answering: boolean;
  bloom: number; // 0..1 decision flash
  padLevel: number; // 0..1 companion loudness
  reduced: boolean; // prefers-reduced-motion
}

export interface BreathHandle {
  update(state: BreathState, elapsedSec: number): void;
  spawnTrace(semitone: number, velocity: number): void;
  resize(): void;
  dispose(): void;
}

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (c.getContext("webgl2") || c.getContext("webgl"))
    );
  } catch {
    return false;
  }
}

export function createBreathScene(mount: HTMLElement, seed: number): BreathHandle | null {
  if (!hasWebGL()) return null;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    if (!renderer.getContext()) return null;
  } catch {
    return null;
  }

  const rand = makeMulberry32(seed);
  let width = Math.max(1, mount.clientWidth);
  let height = Math.max(1, mount.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height);
  renderer.setClearColor(BACKDROP, 1);
  const canvas = renderer.domElement;
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  mount.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(BACKDROP, 0.11); // depth swallows the withdrawn presence
  const camera = new THREE.PerspectiveCamera(52, width / height, 0.1, 60);
  camera.position.set(0, 0, 6);
  camera.lookAt(0, 0, 0);

  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(o: T): T => {
    disposables.push(o);
    return o;
  };

  // ── The presence group ──────────────────────────────────────────────────
  const presence = new THREE.Group();
  scene.add(presence);

  const coreGeo = track(new THREE.IcosahedronGeometry(0.62, 2));
  const coreMat = track(
    new THREE.MeshBasicMaterial({ color: VIOLET[3], transparent: true, opacity: 0.9 }),
  );
  const core = new THREE.Mesh(coreGeo, coreMat);
  presence.add(core);

  const glow1Geo = track(new THREE.SphereGeometry(1.0, 32, 32));
  const glow1Mat = track(
    new THREE.MeshBasicMaterial({
      color: VIOLET[1],
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  const glow1 = new THREE.Mesh(glow1Geo, glow1Mat);
  presence.add(glow1);

  const glow2Geo = track(new THREE.SphereGeometry(1.9, 32, 32));
  const glow2Mat = track(
    new THREE.MeshBasicMaterial({
      color: VIOLET[0],
      transparent: true,
      opacity: 0.13,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  const glow2 = new THREE.Mesh(glow2Geo, glow2Mat);
  presence.add(glow2);

  // Breathing particle halo around the core.
  const HALO = 320;
  const haloPos = new Float32Array(HALO * 3);
  for (let i = 0; i < HALO; i++) {
    const u = rand() * 2 - 1;
    const theta = rand() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    const rad = 1.1 + rand() * 0.7;
    haloPos[i * 3] = Math.cos(theta) * r * rad;
    haloPos[i * 3 + 1] = u * rad;
    haloPos[i * 3 + 2] = Math.sin(theta) * r * rad;
  }
  const haloGeo = track(new THREE.BufferGeometry());
  haloGeo.setAttribute("position", new THREE.BufferAttribute(haloPos, 3));
  const haloMat = track(
    new THREE.PointsMaterial({
      color: VIOLET[2],
      size: 0.05,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  const halo = new THREE.Points(haloGeo, haloMat);
  presence.add(halo);

  // ── Player light-traces (rise from below, fade out) ──────────────────────
  const tracePos = new Float32Array(TRACE_COUNT * 3);
  const traceCol = new Float32Array(TRACE_COUNT * 3);
  const traceVel = new Float32Array(TRACE_COUNT * 3);
  const traceLife = new Float32Array(TRACE_COUNT); // 0 = dead
  for (let i = 0; i < TRACE_COUNT; i++) {
    tracePos[i * 3 + 1] = -999; // park offscreen
  }
  const traceGeo = track(new THREE.BufferGeometry());
  traceGeo.setAttribute("position", new THREE.BufferAttribute(tracePos, 3));
  traceGeo.setAttribute("color", new THREE.BufferAttribute(traceCol, 3));
  const traceMat = track(
    new THREE.PointsMaterial({
      size: 0.14,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  const traces = new THREE.Points(traceGeo, traceMat);
  scene.add(traces);
  let traceCursor = 0;
  const traceColor = new THREE.Color();

  let lastElapsed = 0;

  function spawnTrace(semitone: number, velocity: number) {
    const i = traceCursor;
    traceCursor = (traceCursor + 1) % TRACE_COUNT;
    const x = (semitone / 12 - 0.5) * 4.4; // low notes left, high notes right
    tracePos[i * 3] = x + (rand() - 0.5) * 0.3;
    tracePos[i * 3 + 1] = -2.6;
    tracePos[i * 3 + 2] = 0.4 + (rand() - 0.5) * 0.6;
    traceVel[i * 3] = (rand() - 0.5) * 0.3;
    traceVel[i * 3 + 1] = 1.4 + velocity * 1.3;
    traceVel[i * 3 + 2] = (rand() - 0.5) * 0.3;
    traceLife[i] = 1;
    traceColor.setHex(VIOLET[3]).lerp(new THREE.Color(VIOLET[0]), semitone / 12);
    traceCol[i * 3] = traceColor.r;
    traceCol[i * 3 + 1] = traceColor.g;
    traceCol[i * 3 + 2] = traceColor.b;
  }

  function update(state: BreathState, elapsedSec: number) {
    const dt = Math.min(0.05, elapsedSec - lastElapsed);
    lastElapsed = elapsedSec;
    const motion = state.reduced ? 0.35 : 1;

    // Distance encodes attention: near when invited, receding when listening.
    const approach = state.answering ? 1 : state.approach;
    const targetZ = FAR_Z + (NEAR_Z - FAR_Z) * approach;
    presence.position.z += (targetZ - presence.position.z) * (1 - Math.exp(-dt / 0.5));

    // Slow idle breath — always alive, even at rest.
    const breath = 1 + Math.sin(elapsedSec * 0.55) * 0.06 * motion;
    const pad = state.padLevel;
    const bloom = state.bloom;

    // Overall luminosity: bright & big when near/answering, dim when withdrawn.
    const lum = 0.35 + approach * 0.65;
    const s = breath * (0.85 + approach * 0.35 + bloom * 0.5 + pad * 0.4);
    presence.scale.setScalar(s);
    presence.rotation.y = elapsedSec * 0.12 * motion;
    presence.rotation.x = Math.sin(elapsedSec * 0.21) * 0.15 * motion;

    coreMat.opacity = 0.55 + lum * 0.4 + pad * 0.3 + bloom * 0.3;
    glow1Mat.opacity = (0.12 + lum * 0.28 + pad * 0.4 + bloom * 0.45) * 1;
    glow2Mat.opacity = 0.04 + lum * 0.12 + pad * 0.28 + bloom * 0.4;
    glow1.scale.setScalar(1 + pad * 0.4 + bloom * 0.5);
    glow2.scale.setScalar(1 + pad * 0.7 + bloom * 0.8);
    haloMat.opacity = 0.2 + lum * 0.5 + pad * 0.3;

    // Halo particles breathe in and out around their base radius.
    const swell = 1 + Math.sin(elapsedSec * 0.7) * 0.05 * motion + pad * 0.18 + bloom * 0.22;
    const hp = haloGeo.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < HALO; i++) {
      hp.setXYZ(
        i,
        haloPos[i * 3] * swell,
        haloPos[i * 3 + 1] * swell,
        haloPos[i * 3 + 2] * swell,
      );
    }
    hp.needsUpdate = true;

    // Advance the light-traces.
    const tp = traceGeo.getAttribute("position") as THREE.BufferAttribute;
    const tc = traceGeo.getAttribute("color") as THREE.BufferAttribute;
    let anyTrace = false;
    for (let i = 0; i < TRACE_COUNT; i++) {
      if (traceLife[i] <= 0) continue;
      anyTrace = true;
      traceLife[i] = Math.max(0, traceLife[i] - dt / 1.3);
      tracePos[i * 3] += traceVel[i * 3] * dt;
      tracePos[i * 3 + 1] += traceVel[i * 3 + 1] * dt;
      tracePos[i * 3 + 2] += traceVel[i * 3 + 2] * dt;
      const life = traceLife[i];
      tp.setXYZ(i, tracePos[i * 3], tracePos[i * 3 + 1], tracePos[i * 3 + 2]);
      // fade by scaling colour toward black (additive → invisible)
      tc.setXYZ(
        i,
        traceCol[i * 3] * life,
        traceCol[i * 3 + 1] * life,
        traceCol[i * 3 + 2] * life,
      );
      if (life <= 0) tracePos[i * 3 + 1] = -999;
    }
    if (anyTrace) {
      tp.needsUpdate = true;
      tc.needsUpdate = true;
    }

    renderer.render(scene, camera);
  }

  function resize() {
    width = Math.max(1, mount.clientWidth);
    height = Math.max(1, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function dispose() {
    for (const d of disposables) {
      try {
        d.dispose();
      } catch {
        /* ignore */
      }
    }
    renderer.dispose();
    try {
      renderer.forceContextLoss();
    } catch {
      /* ignore */
    }
    if (canvas.parentNode === mount) mount.removeChild(canvas);
  }

  return { update, spawnTrace, resize, dispose };
}
