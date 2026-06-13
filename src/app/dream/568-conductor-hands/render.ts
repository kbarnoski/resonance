// render.ts — three.js phase-space that makes the metric dissonance LEGIBLE.
//
// Two orbiting markers (one per voice) each complete a revolution per beat-
// period. A Lissajous / spirograph ribbon is traced by their combined phase:
// because voice B is locked to an IRRATIONAL multiple of voice A, the figure
// NEVER closes — it is the visible proof the two pulses can never realign.
// Each voice's marker flashes on its scheduled beat. Dark background, emissive
// materials, deep indigo/violet field with a warm accent per voice.

import * as THREE from "three";

const VOICE_A_COLOR = 0xa78bfa; // violet
const VOICE_B_COLOR = 0xfbbf24; // warm amber
const TRAIL_LEN = 1400;

export interface ConductorScene {
  resize(w: number, h: number): void;
  // phaseA / phaseB are absolute revolution-phase (radians) for each voice.
  update(
    phaseA: number,
    phaseB: number,
    flashA: number,
    flashB: number,
  ): void;
  dispose(): void;
}

export function createScene(canvas: HTMLCanvasElement): ConductorScene {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
  });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07061a);
  scene.fog = new THREE.Fog(0x07061a, 8, 22);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
  camera.position.set(0, 0, 9);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0x4040ff, 0.4));
  const key = new THREE.PointLight(0xffffff, 0.6, 50);
  key.position.set(4, 6, 8);
  scene.add(key);

  const RADIUS = 3.2;

  // Two orbit rings (faint guides).
  function makeRing(color: number, r: number): THREE.LineLoop {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.18,
    });
    return new THREE.LineLoop(geo, mat);
  }
  scene.add(makeRing(VOICE_A_COLOR, RADIUS));
  scene.add(makeRing(VOICE_B_COLOR, RADIUS * 0.62));

  // Voice markers (emissive spheres).
  function makeMarker(color: number, size: number): THREE.Mesh {
    const geo = new THREE.SphereGeometry(size, 24, 24);
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.2,
      roughness: 0.3,
      metalness: 0.1,
    });
    return new THREE.Mesh(geo, mat);
  }
  const markerA = makeMarker(VOICE_A_COLOR, 0.26);
  const markerB = makeMarker(VOICE_B_COLOR, 0.2);
  scene.add(markerA);
  scene.add(markerB);

  // Glow halos that pulse on each beat.
  function makeHalo(color: number, size: number): THREE.Mesh {
    const geo = new THREE.SphereGeometry(size, 24, 24);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
    });
    return new THREE.Mesh(geo, mat);
  }
  const haloA = makeHalo(VOICE_A_COLOR, 0.55);
  const haloB = makeHalo(VOICE_B_COLOR, 0.45);
  scene.add(haloA);
  scene.add(haloB);

  // The never-closing Lissajous ribbon traced by the combined phase.
  const trailPositions = new Float32Array(TRAIL_LEN * 3);
  const trailColors = new Float32Array(TRAIL_LEN * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(trailPositions, 3),
  );
  trailGeo.setAttribute("color", new THREE.BufferAttribute(trailColors, 3));
  const trailMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
  });
  const trail = new THREE.Line(trailGeo, trailMat);
  scene.add(trail);
  let trailHead = 0;
  let trailFilled = 0;

  const cA = new THREE.Color(VOICE_A_COLOR);
  const cB = new THREE.Color(VOICE_B_COLOR);

  function pushTrail(x: number, y: number, mix: number): void {
    const i = trailHead * 3;
    trailPositions[i] = x;
    trailPositions[i + 1] = y;
    trailPositions[i + 2] = 0;
    const r = cA.r * (1 - mix) + cB.r * mix;
    const g = cA.g * (1 - mix) + cB.g * mix;
    const b = cA.b * (1 - mix) + cB.b * mix;
    trailColors[i] = r;
    trailColors[i + 1] = g;
    trailColors[i + 2] = b;
    trailHead = (trailHead + 1) % TRAIL_LEN;
    trailFilled = Math.min(TRAIL_LEN, trailFilled + 1);
  }

  function resize(w: number, h: number): void {
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }

  let lastFlashA = 0;
  let lastFlashB = 0;

  function update(
    phaseA: number,
    phaseB: number,
    flashA: number,
    flashB: number,
  ): void {
    // Markers orbit their rings.
    const ax = Math.cos(phaseA) * RADIUS;
    const ay = Math.sin(phaseA) * RADIUS;
    markerA.position.set(ax, ay, 0);
    haloA.position.copy(markerA.position);

    const bx = Math.cos(phaseB) * RADIUS * 0.62;
    const by = Math.sin(phaseB) * RADIUS * 0.62;
    markerB.position.set(bx, by, 0);
    haloB.position.copy(markerB.position);

    // Lissajous point: x driven by voice A, y by voice B → never-closing curve.
    const lx = Math.sin(phaseA) * 2.6;
    const ly = Math.sin(phaseB) * 2.6;
    const mix = (Math.sin(phaseB) + 1) / 2;
    pushTrail(lx, ly, mix);

    // Update the visible trail (ordered oldest→newest with fading would need a
    // draw range; we just draw the filled span as a polyline).
    trailGeo.setDrawRange(0, trailFilled);
    trailGeo.attributes.position.needsUpdate = true;
    trailGeo.attributes.color.needsUpdate = true;

    // Beat flashes: bump emissive + halo when a new beat lands.
    if (flashA > lastFlashA) lastFlashA = flashA;
    if (flashB > lastFlashB) lastFlashB = flashB;
    const now = performance.now();
    const fa = Math.max(0, 1 - (now - flashA) / 220);
    const fb = Math.max(0, 1 - (now - flashB) / 220);

    const matA = markerA.material as THREE.MeshStandardMaterial;
    const matB = markerB.material as THREE.MeshStandardMaterial;
    matA.emissiveIntensity = 1.0 + fa * 2.5;
    matB.emissiveIntensity = 1.0 + fb * 2.5;
    const scaleA = 1 + fa * 0.8;
    const scaleB = 1 + fb * 0.8;
    markerA.scale.setScalar(scaleA);
    markerB.scale.setScalar(scaleB);
    (haloA.material as THREE.MeshBasicMaterial).opacity = fa * 0.45;
    (haloB.material as THREE.MeshBasicMaterial).opacity = fb * 0.45;
    haloA.scale.setScalar(1 + fa * 1.5);
    haloB.scale.setScalar(1 + fb * 1.5);

    renderer.render(scene, camera);
  }

  function dispose(): void {
    trailGeo.dispose();
    scene.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else if (mat) (mat as THREE.Material).dispose();
    });
    renderer.dispose();
  }

  return { resize, update, dispose };
}
