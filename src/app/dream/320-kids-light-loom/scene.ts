/**
 * 320 · Kids Light Loom — Three.js Scene
 *
 * Renders 6 vertical glowing strings on a dark stage using THREE.js.
 * Each string is a thin tube/line with emissive color.
 * When bowed: standing-wave displacement + brighter emissive + sparkle particles.
 *
 * Approach: raw THREE (no @react-three/fiber) — imperative renderer
 * mounted in a ref div, same pattern as 244-kids-sing-creature.
 */

import * as THREE from "three";
import { STRING_COLORS, STRING_FREQS } from "./audio";

export interface LoomScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  dispose: () => void;
  updateString: (
    idx: number,
    bowEnergy: number,    // 0..1
    bowY: number,         // normalized 0..1 where bow crosses the string
    time: number          // seconds, for standing wave animation
  ) => void;
}

// Number of segments per string for the standing-wave mesh
const SEG = 48;
// Number of sparkle particles per string
const SPARK_COUNT = 18;

interface StringMesh {
  lineMesh: THREE.Line;
  lineGeo: THREE.BufferGeometry;
  glowMesh: THREE.Mesh;
  glowMat: THREE.MeshBasicMaterial;
  sparkGeo: THREE.BufferGeometry;
  sparkMesh: THREE.Points;
  sparkMat: THREE.PointsMaterial;
  color: THREE.Color;
  freq: number;
  bowEnergy: number;
  bowY: number;
  baseX: number;  // world-space X of this string's rest position
}

function makeStringMesh(
  scene: THREE.Scene,
  idx: number,
  x: number,
  color: THREE.Color,
  freq: number
): StringMesh {
  // ── standing-wave line ─────────────────────────────────────────────────────
  const positions = new Float32Array((SEG + 1) * 3);
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    positions[i * 3 + 0] = x;
    positions[i * 3 + 1] = -1 + t * 2; // -1 to +1 in world space
    positions[i * 3 + 2] = 0;
  }
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const lineMat = new THREE.LineBasicMaterial({
    color,
    linewidth: 2,      // note: linewidth > 1 only works on some GPUs
    transparent: true,
    opacity: 0.9,
  });
  const lineMesh = new THREE.Line(lineGeo, lineMat);
  scene.add(lineMesh);

  // ── glow plane (a thin billboard rect behind the string for glow effect) ─
  const glowGeo = new THREE.PlaneGeometry(0.06, 2.2);
  const glowMat = new THREE.MeshBasicMaterial({
    color: color.clone().multiplyScalar(0.4),
    transparent: true,
    opacity: 0.15,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const glowMesh = new THREE.Mesh(glowGeo, glowMat);
  glowMesh.position.set(x, 0, -0.01);
  scene.add(glowMesh);

  // ── sparkle particles ──────────────────────────────────────────────────────
  const sparkPositions = new Float32Array(SPARK_COUNT * 3);
  for (let i = 0; i < SPARK_COUNT; i++) {
    sparkPositions[i * 3 + 0] = x;
    sparkPositions[i * 3 + 1] = 0;
    sparkPositions[i * 3 + 2] = 0;
  }
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPositions, 3));

  const sparkMat = new THREE.PointsMaterial({
    color,
    size: 0.06,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const sparkMesh = new THREE.Points(sparkGeo, sparkMat);
  scene.add(sparkMesh);

  return {
    lineMesh,
    lineGeo,
    glowMesh,
    glowMat,
    sparkGeo,
    sparkMesh,
    sparkMat,
    color,
    freq,
    bowEnergy: 0,
    bowY: 0.5,
    baseX: x,
  };
}

/** Update a string's geometry each frame based on bow state */
function tickString(sm: StringMesh, idx: number, time: number) {
  const { bowEnergy, bowY, freq, lineGeo, glowMat, sparkGeo, sparkMat, baseX } = sm;

  // ── standing-wave displacement ─────────────────────────────────────────────
  const posAttr = lineGeo.getAttribute("position") as THREE.BufferAttribute;
  const arr = posAttr.array as Float32Array;

  // Number of anti-nodes scales with energy (more bow = more modes)
  const modes = 1 + Math.floor(bowEnergy * 2.5); // 1..3 modes
  const maxDisp = bowEnergy * 0.22;

  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG; // 0..1 along string
    const y = -1 + t * 2;

    // Standing wave: sum of modes with slight detuning for richness
    let disp = 0;
    for (let m = 1; m <= modes; m++) {
      const spatialMode = Math.sin(m * Math.PI * t);
      const temporalFreq = freq * m;
      const phase = time * temporalFreq * 2 * Math.PI;
      disp += spatialMode * Math.cos(phase) / m;
    }
    disp *= maxDisp;

    arr[i * 3 + 0] = baseX + disp;
    arr[i * 3 + 1] = y;
  }
  posAttr.needsUpdate = true;
  lineGeo.computeBoundingBox();

  // ── line/glow brightness ───────────────────────────────────────────────────
  const lineMat = sm.lineMesh.material as THREE.LineBasicMaterial;
  // Energized = bright saturated, idle = dim
  const baseLum = 0.25 + bowEnergy * 0.65;
  lineMat.color.setHSL(
    sm.color.getHSL({ h: 0, s: 0, l: 0 }).h,
    0.9,
    Math.min(0.9, baseLum)
  );
  lineMat.opacity = 0.4 + bowEnergy * 0.6;

  // Glow plane brightness
  glowMat.color.copy(sm.color).multiplyScalar(bowEnergy * 0.8);
  glowMat.opacity = bowEnergy * 0.35;

  // ── sparkles near bow contact point ───────────────────────────────────────
  if (bowEnergy > 0.05) {
    const sparkPos = sparkGeo.getAttribute("position") as THREE.BufferAttribute;
    const sArr = sparkPos.array as Float32Array;
    const bowWorldY = -1 + bowY * 2;

    for (let i = 0; i < SPARK_COUNT; i++) {
      // Phase offset per spark+string so each string's sparks shimmer differently
      const phase = (time * 3.7 + i * 0.37 + idx * 0.11) % 1;
      const spread = bowEnergy * 0.3 * (0.5 + 0.5 * phase);
      sArr[i * 3 + 0] = baseX + (Math.random() - 0.5) * spread;
      sArr[i * 3 + 1] = bowWorldY + (Math.random() - 0.5) * spread * 0.8;
      sArr[i * 3 + 2] = (Math.random() - 0.5) * 0.05;
    }
    sparkPos.needsUpdate = true;
    sparkMat.opacity = bowEnergy * 0.7 * (0.5 + 0.5 * Math.sin(time * 8));
    sparkMat.size = 0.04 + bowEnergy * 0.08;
  } else {
    sparkMat.opacity = 0;
  }
}

export function buildLoomScene(
  canvas: HTMLCanvasElement,
  width: number,
  height: number
): LoomScene | null {
  // ── renderer ───────────────────────────────────────────────────────────────
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.setClearColor(0x05050f, 1);

  // ── scene + camera ─────────────────────────────────────────────────────────
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, width / height, 0.01, 100);
  camera.position.set(0, 0, 3.8);

  // ── soft background fog ────────────────────────────────────────────────────
  scene.fog = new THREE.Fog(0x05050f, 6, 20);

  // ── ambient background plane (dark starfield feel) ─────────────────────────
  const bgGeo = new THREE.PlaneGeometry(20, 20);
  const bgMat = new THREE.MeshBasicMaterial({ color: 0x05050f });
  const bgMesh = new THREE.Mesh(bgGeo, bgMat);
  bgMesh.position.z = -2;
  scene.add(bgMesh);

  // ── string placement ───────────────────────────────────────────────────────
  const count = STRING_FREQS.length; // 6
  const xMin = -1.5;
  const xMax = 1.5;
  const strings: StringMesh[] = STRING_FREQS.map((freq, i) => {
    const x = xMin + (i / (count - 1)) * (xMax - xMin);
    const color = new THREE.Color(STRING_COLORS[i]);
    return makeStringMesh(scene, i, x, color, freq);
  });

  // ── idle: gentle shimmer on all strings ────────────────────────────────────
  // (handled in updateString with bowEnergy = 0 but a tiny residual)

  // ── updateString (called from animation loop) ──────────────────────────────
  function updateString(
    idx: number,
    bowEnergy: number,
    bowY: number,
    time: number
  ) {
    const sm = strings[idx];
    if (!sm) return;
    sm.bowEnergy = bowEnergy;
    sm.bowY = bowY;
    tickString(sm, idx, time);
  }

  // ── render ─────────────────────────────────────────────────────────────────
  // The page's RAF loop calls renderer.render manually.

  // ── dispose ────────────────────────────────────────────────────────────────
  function dispose() {
    for (const sm of strings) {
      sm.lineGeo.dispose();
      (sm.lineMesh.material as THREE.Material).dispose();
      (sm.glowMesh.geometry as THREE.BufferGeometry).dispose();
      sm.glowMat.dispose();
      sm.sparkGeo.dispose();
      sm.sparkMat.dispose();
      scene.remove(sm.lineMesh);
      scene.remove(sm.glowMesh);
      scene.remove(sm.sparkMesh);
    }
    bgGeo.dispose();
    bgMat.dispose();
    renderer.dispose();
  }

  return { renderer, scene, camera, dispose, updateString };
}
