// 1288-gasket-cathedral — scene.ts
//
// A NAVIGABLE first-person three.js room built from the 3D Apollonian packing.
// Every bell is one instance of a shared icosphere in an InstancedMesh; the
// enclosing Soddy sphere is a big inward-facing shell — the cathedral walls.
// Palette is nacre / mother-of-pearl: pale iridescent shells (thin-film via
// MeshPhysicalMaterial.iridescence) with soft speculars sliding across them on
// deep slate — deliberately NOT saturated jewel-glow-on-black.
//
// Camera control degrades gracefully: pointer-lock mouse-look + WASD when
// available; drag-to-look otherwise; DeviceOrientation (gyro) on phones. If the
// player is idle ~2s the camera auto-tours a gentle path through the nave.
// Bells ring on click (nearest along gaze) and on PROXIMITY as you pass through
// them; each ring is reported to the caller for spatialised audio. Everything
// (geometry / materials / renderer / listeners) is disposed on teardown.

import * as THREE from "three";
import type { WorldSphere, Outer } from "./packing";

export interface StrikeEvent {
  index: number;
  x: number;
  y: number;
  z: number;
  bend: number;
  sizeNorm: number;
}

export interface FramePose {
  px: number;
  py: number;
  pz: number;
  fx: number;
  fy: number;
  fz: number;
  ux: number;
  uy: number;
  uz: number;
  autoTour: boolean;
}

export interface SceneOptions {
  spheres: WorldSphere[];
  outer: Outer;
  reduced: boolean;
  onStrike: (e: StrikeEvent) => void;
  onLockChange: (locked: boolean) => void;
}

export interface SceneHandle {
  update(dt: number, elapsed: number): FramePose;
  requestPointerLock(): void;
  isPointerLocked(): boolean;
  enableGyro(): Promise<boolean>;
  hasPointerLock(): boolean;
  resize(): void;
  dispose(): void;
}

const AUTO_TOUR_IDLE_MS = 2000;
const IDENTITY = new THREE.Quaternion();

/** A pale slate + mother-of-pearl environment: low windows of cool pearl and
 *  warm champagne on a dark slate so the nacre has soft light to slide. */
function makeEnvTexture(): THREE.DataTexture {
  const w = 256;
  const h = 128;
  const data = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);
    const base = 0.03 + 0.06 * (1 - v);
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1);
      const pearl = Math.exp(-((u - 0.28) ** 2) / 0.02 - ((v - 0.34) ** 2) / 0.05);
      const cool = Math.exp(-((u - 0.72) ** 2) / 0.03 - ((v - 0.3) ** 2) / 0.06);
      const champ = Math.exp(-((u - 0.5) ** 2) / 0.02 - ((v - 0.66) ** 2) / 0.05);
      // Desaturated: all three windows near-white with faint temperature tints.
      const r = base * 0.9 + pearl * 0.7 + cool * 0.5 + champ * 0.75;
      const g = base * 0.95 + pearl * 0.72 + cool * 0.62 + champ * 0.68;
      const b = base * 1.05 + pearl * 0.8 + cool * 0.8 + champ * 0.55;
      const o = (y * w + x) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 1;
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.needsUpdate = true;
  return tex;
}

export function createScene(mount: HTMLElement, opts: SceneOptions): SceneHandle | null {
  const { spheres, outer, reduced, onStrike } = opts;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    if (!renderer.getContext()) return null;
  } catch {
    return null;
  }

  let width = Math.max(1, mount.clientWidth);
  let height = Math.max(1, mount.clientHeight);
  const SLATE = 0x0b0e14;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height);
  renderer.setClearColor(SLATE, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  mount.appendChild(canvas);
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.cursor = "grab";

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SLATE);
  scene.fog = new THREE.FogExp2(SLATE, 0.02);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = makeEnvTexture();
  const envRT = pmrem.fromEquirectangular(envTex);
  scene.environment = envRT.texture;
  envTex.dispose();
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(72, width / height, 0.05, 400);

  // ── The cathedral shell (enclosing Soddy sphere, seen from inside) ──
  const shellGeo = new THREE.SphereGeometry(outer.r, 48, 32);
  const shellMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x161a24),
    metalness: 0.2,
    roughness: 0.55,
    side: THREE.BackSide,
    envMapIntensity: 0.5,
  });
  const shell = new THREE.Mesh(shellGeo, shellMat);
  shell.position.set(outer.x, outer.y, outer.z);
  scene.add(shell);

  // ── The bells: one InstancedMesh, iridescent nacre ──
  const detail = reduced ? 1 : 2;
  const bellGeo = new THREE.IcosahedronGeometry(1, detail);
  const bellMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0xe9e6ea),
    metalness: 0.15,
    roughness: 0.32,
    clearcoat: 1,
    clearcoatRoughness: 0.28,
    iridescence: 1,
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [120, 420],
    envMapIntensity: 1.15,
    emissive: new THREE.Color(0x20242e),
    emissiveIntensity: 0.0,
  });
  const count = spheres.length;
  const bells = new THREE.InstancedMesh(bellGeo, bellMat, count);
  bells.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const baseColor = new THREE.Color();
  const tmpColor = new THREE.Color();
  const RING_HI = new THREE.Color(0xfff8ff);
  const dummy = new THREE.Object3D();
  const baseColors: THREE.Color[] = [];
  for (let i = 0; i < count; i++) {
    const s = spheres[i];
    dummy.position.set(s.x, s.y, s.z);
    dummy.scale.setScalar(s.r);
    dummy.quaternion.copy(IDENTITY);
    dummy.updateMatrix();
    bells.setMatrixAt(i, dummy.matrix);
    // Pale nacre with a faint pearl hue that drifts with depth (never saturated).
    const hue = 0.55 + 0.14 * Math.sin(s.depth * 1.7 + i * 0.13);
    baseColor.setHSL(hue, 0.12, 0.82);
    baseColors.push(baseColor.clone());
    bells.setColorAt(i, baseColor);
  }
  bells.instanceMatrix.needsUpdate = true;
  if (bells.instanceColor) bells.instanceColor.needsUpdate = true;
  scene.add(bells);

  // ── Lights: pale key + cool fill + warm champagne rim (all low saturation) ──
  const key = new THREE.PointLight(0xfff4ea, 40, 0, 2);
  key.position.set(outer.r * 0.4, outer.r * 0.5, outer.r * 0.3);
  scene.add(key);
  const fill = new THREE.PointLight(0xcfe0ff, 26, 0, 2);
  fill.position.set(-outer.r * 0.5, -outer.r * 0.2, outer.r * 0.4);
  scene.add(fill);
  const rim = new THREE.PointLight(0xffe9cf, 18, 0, 2);
  rim.position.set(0, -outer.r * 0.4, -outer.r * 0.5);
  scene.add(rim);
  scene.add(new THREE.AmbientLight(0x2a2f3a, 0.7));

  // ── Per-bell ring energy (visual pulse) ──
  const energy = new Float32Array(count);
  const active = new Set<number>();
  const cooldown = new Float32Array(count); // seconds remaining before re-strike
  const insideLast = new Uint8Array(count);

  function ringSphere(index: number) {
    const s = spheres[index];
    energy[index] = 1;
    active.add(index);
    onStrike({ index, x: s.x, y: s.y, z: s.z, bend: s.bend, sizeNorm: s.sizeNorm });
  }

  // ── First-person camera state ──
  let yaw = 0;
  let pitch = 0;
  const pos = new THREE.Vector3(0, 0, 0);
  const forward = new THREE.Vector3(0, 0, -1);
  const right = new THREE.Vector3(1, 0, 0);
  const worldUp = new THREE.Vector3(0, 1, 0);
  const boundR = outer.r * 0.94;

  const keys = new Set<string>();
  let lastInputMs = performance.now();
  let pointerLocked = false;
  let gyroActive = false;
  const hasLockApi =
    typeof document !== "undefined" && "pointerLockElement" in document;

  // Drag-look (fallback / desktop without lock, and touch).
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let downX = 0;
  let downY = 0;
  let downAt = 0;
  let moved = false;

  function markInput() {
    lastInputMs = performance.now();
  }

  function applyLook(dxYaw: number, dyPitch: number) {
    yaw -= dxYaw;
    pitch -= dyPitch;
    const lim = Math.PI / 2 - 0.02;
    pitch = Math.max(-lim, Math.min(lim, pitch));
  }

  // Nearest bell along the gaze ray, in front of the camera and reasonably near.
  function gazePick(): number {
    let best = -1;
    let bestT = Infinity;
    const ox = pos.x;
    const oy = pos.y;
    const oz = pos.z;
    const dx = forward.x;
    const dy = forward.y;
    const dz = forward.z;
    for (let i = 0; i < count; i++) {
      const s = spheres[i];
      const rx = s.x - ox;
      const ry = s.y - oy;
      const rz = s.z - oz;
      const t = rx * dx + ry * dy + rz * dz;
      if (t <= 0) continue; // behind
      const px = ox + dx * t;
      const py = oy + dy * t;
      const pz = oz + dz * t;
      const perp = Math.hypot(px - s.x, py - s.y, pz - s.z);
      // A gaze "hit" if the ray passes within the bell, weighted so nearer wins.
      if (perp < s.r * 1.15 && t < bestT) {
        bestT = t;
        best = i;
      }
    }
    return best;
  }

  // ── Input listeners ──
  const onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (["w", "a", "s", "d", "q", "e", " ", "shift"].includes(k)) {
      keys.add(k === " " ? "space" : k);
      markInput();
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    keys.delete(k === " " ? "space" : k);
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!pointerLocked) return;
    markInput();
    applyLook(e.movementX * 0.0022, e.movementY * 0.0022);
  };

  const handleLockChange = () => {
    pointerLocked = hasLockApi && document.pointerLockElement === canvas;
    canvas.style.cursor = pointerLocked ? "none" : "grab";
    opts.onLockChange(pointerLocked);
  };

  const onPointerDown = (e: PointerEvent) => {
    markInput();
    if (pointerLocked) {
      // Locked: a click strikes the bell under the crosshair.
      const idx = gazePick();
      if (idx >= 0) {
        cooldown[idx] = 0.25;
        ringSphere(idx);
      }
      return;
    }
    dragging = true;
    moved = false;
    downX = lastX = e.clientX;
    downY = lastY = e.clientY;
    downAt = performance.now();
    canvas.style.cursor = "grabbing";
    canvas.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragging || pointerLocked) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 3) moved = true;
    lastX = e.clientX;
    lastY = e.clientY;
    markInput();
    applyLook(dx * 0.0042, dy * 0.0042);
  };

  const onPointerUp = (e: PointerEvent) => {
    if (pointerLocked) return;
    const quick = performance.now() - downAt < 320;
    dragging = false;
    canvas.style.cursor = "grab";
    canvas.releasePointerCapture?.(e.pointerId);
    if (!moved && quick) {
      // A tap (no drag) strikes the bell along the gaze.
      const idx = gazePick();
      if (idx >= 0) {
        cooldown[idx] = 0.25;
        ringSphere(idx);
      }
    }
  };

  // Gyro (DeviceOrientation) look on phones.
  let gyroBaseYaw = 0;
  let gyroHasBase = false;
  const onDeviceOrientation = (e: DeviceOrientationEvent) => {
    if (!gyroActive) return;
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    markInput();
    const a = THREE.MathUtils.degToRad(e.alpha);
    const b = THREE.MathUtils.degToRad(e.beta);
    if (!gyroHasBase) {
      gyroBaseYaw = -a;
      gyroHasBase = true;
    }
    yaw = -a - gyroBaseYaw;
    const lim = Math.PI / 2 - 0.02;
    pitch = Math.max(-lim, Math.min(lim, b - Math.PI / 2));
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("pointerlockchange", handleLockChange);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);

  // ── Auto-tour path: a slow drift through the nave sampling the packing ──
  let tourT = Math.random() * 10;

  function updateOrientation() {
    forward.set(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch),
    );
    forward.normalize();
    right.crossVectors(forward, worldUp).normalize();
  }

  function clampToShell() {
    const d = pos.length();
    if (d > boundR) pos.multiplyScalar(boundR / d);
  }

  const moveTmp = new THREE.Vector3();

  return {
    update(dt: number, elapsed: number): FramePose {
      const now = performance.now();
      const idle = now - lastInputMs > AUTO_TOUR_IDLE_MS;
      const autoTour = idle;

      if (autoTour) {
        // Gentle Lissajous drift through the nave; slowly sweep the gaze.
        tourT += dt * (reduced ? 0.04 : 0.08);
        const R = outer.r * 0.5;
        pos.set(
          Math.sin(tourT * 0.7) * R,
          Math.sin(tourT * 0.5) * R * 0.4,
          Math.cos(tourT * 0.9) * R,
        );
        yaw = tourT * 0.9 + Math.PI;
        pitch = Math.sin(tourT * 0.6) * 0.25;
      } else if (gyroActive) {
        // Phone: glide slowly forward along the current gaze so you drift
        // through the nave (no WASD on touch) and ring bells by proximity.
        moveTmp.copy(forward).multiplyScalar((reduced ? 1.4 : 2.4) * dt);
        pos.add(moveTmp);
      } else {
        // WASD / QE movement in the look frame.
        const speed = (keys.has("shift") ? 14 : 7) * dt;
        moveTmp.set(0, 0, 0);
        if (keys.has("w")) moveTmp.addScaledVector(forward, speed);
        if (keys.has("s")) moveTmp.addScaledVector(forward, -speed);
        if (keys.has("d")) moveTmp.addScaledVector(right, speed);
        if (keys.has("a")) moveTmp.addScaledVector(right, -speed);
        if (keys.has("e") || keys.has("space")) moveTmp.addScaledVector(worldUp, speed);
        if (keys.has("q")) moveTmp.addScaledVector(worldUp, -speed);
        pos.add(moveTmp);
      }
      clampToShell();
      updateOrientation();

      camera.position.copy(pos);
      camera.lookAt(pos.x + forward.x, pos.y + forward.y, pos.z + forward.z);

      // ── Proximity strikes: ring a bell when the camera enters it ──
      for (let i = 0; i < count; i++) {
        if (cooldown[i] > 0) cooldown[i] = Math.max(0, cooldown[i] - dt);
        const s = spheres[i];
        const d = Math.hypot(pos.x - s.x, pos.y - s.y, pos.z - s.z);
        const inside = d < s.r * 0.92 ? 1 : 0;
        if (inside && !insideLast[i] && cooldown[i] <= 0) {
          cooldown[i] = 0.6;
          ringSphere(i);
        }
        insideLast[i] = inside;
      }

      // ── Visual ring pulse: decay energy, pulse scale + brighten ──
      if (active.size > 0) {
        const ringHz = 9;
        const done: number[] = [];
        for (const i of active) {
          energy[i] -= dt * 0.7;
          if (energy[i] <= 0.001) {
            energy[i] = 0;
            done.push(i);
          }
          const s = spheres[i];
          const e = Math.max(0, energy[i]);
          const pulse = 1 + 0.06 * e * Math.sin(elapsed * ringHz + i);
          dummy.position.set(s.x, s.y, s.z);
          dummy.scale.setScalar(s.r * pulse);
          dummy.quaternion.copy(IDENTITY);
          dummy.updateMatrix();
          bells.setMatrixAt(i, dummy.matrix);
          const bc = baseColors[i];
          tmpColor.copy(bc).lerp(RING_HI, 0.5 * e);
          bells.setColorAt(i, tmpColor);
        }
        for (const i of done) {
          const s = spheres[i];
          dummy.position.set(s.x, s.y, s.z);
          dummy.scale.setScalar(s.r);
          dummy.quaternion.copy(IDENTITY);
          dummy.updateMatrix();
          bells.setMatrixAt(i, dummy.matrix);
          bells.setColorAt(i, baseColors[i]);
          active.delete(i);
        }
        bells.instanceMatrix.needsUpdate = true;
        if (bells.instanceColor) bells.instanceColor.needsUpdate = true;
      }

      // Faint global shimmer on the material's emissive as bells ring.
      let ringing = 0;
      for (const i of active) ringing += energy[i];
      bellMat.emissiveIntensity = Math.min(0.5, 0.04 + ringing * 0.06);

      renderer.render(scene, camera);

      return {
        px: pos.x,
        py: pos.y,
        pz: pos.z,
        fx: forward.x,
        fy: forward.y,
        fz: forward.z,
        ux: worldUp.x,
        uy: worldUp.y,
        uz: worldUp.z,
        autoTour,
      };
    },

    requestPointerLock() {
      if (!hasLockApi) return;
      markInput();
      canvas.requestPointerLock?.();
    },

    isPointerLocked() {
      return pointerLocked;
    },

    hasPointerLock() {
      return hasLockApi;
    },

    async enableGyro(): Promise<boolean> {
      type DOE = typeof DeviceOrientationEvent & {
        requestPermission?: () => Promise<"granted" | "denied">;
      };
      const DOEvent = (typeof DeviceOrientationEvent !== "undefined"
        ? (DeviceOrientationEvent as DOE)
        : undefined);
      if (!DOEvent) return false;
      try {
        if (typeof DOEvent.requestPermission === "function") {
          const res = await DOEvent.requestPermission();
          if (res !== "granted") return false;
        }
      } catch {
        return false;
      }
      gyroActive = true;
      gyroHasBase = false;
      window.addEventListener("deviceorientation", onDeviceOrientation);
      markInput();
      return true;
    },

    resize() {
      width = Math.max(1, mount.clientWidth);
      height = Math.max(1, mount.clientHeight);
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },

    dispose() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("pointerlockchange", handleLockChange);
      window.removeEventListener("deviceorientation", onDeviceOrientation);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      if (hasLockApi && document.pointerLockElement === canvas) {
        document.exitPointerLock?.();
      }
      bellGeo.dispose();
      bellMat.dispose();
      shellGeo.dispose();
      shellMat.dispose();
      bells.dispose();
      envRT.dispose();
      renderer.dispose();
      if (canvas.parentNode === mount) mount.removeChild(canvas);
    },
  };
}
