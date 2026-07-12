// ─────────────────────────────────────────────────────────────────────────────
// flight.ts — key/tilt flight camera (subsystem "d").
//
// Arrow keys / WASD steer and thrust; device tilt (when granted) adds pitch and
// yaw. The camera ALSO self-drifts with a gentle baseline thrust + slow yaw
// sway, so the sky is already moving on load with no input — flying just changes
// which pulsars fall near and loud. Motion honours prefers-reduced-motion.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from "three";

const MAX_R = 150; // stay well inside the pulsar sphere (radius 320)

interface OrientationRequestable {
  requestPermission?: () => Promise<PermissionState | "granted" | "denied">;
}

export interface Flight {
  update(dtSec: number, elapsedSec: number): void;
  enableTilt(): Promise<void>;
  dispose(): void;
}

export function makeFlight(
  camera: THREE.PerspectiveCamera,
  reducedMotion: boolean,
): Flight {
  const keys = new Set<string>();
  let yaw = 0;
  let pitch = 0;
  const pos = new THREE.Vector3(0, 0, 0);
  const forward = new THREE.Vector3();
  const euler = new THREE.Euler(0, 0, 0, "YXZ");

  // device-tilt contributions (radians of intended rate)
  let tiltYaw = 0;
  let tiltPitch = 0;

  const driftScale = reducedMotion ? 0.4 : 1;

  const onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (
      ["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(k)
    ) {
      keys.add(k);
      e.preventDefault();
    }
  };
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
  const onBlur = () => keys.clear();

  const onOrient = (e: DeviceOrientationEvent) => {
    // beta: front-back tilt (pitch), gamma: left-right tilt (yaw)
    const beta = e.beta ?? 0; // -180..180
    const gamma = e.gamma ?? 0; // -90..90
    tiltPitch = THREE.MathUtils.clamp((beta - 40) / 60, -1, 1) * 0.5;
    tiltYaw = THREE.MathUtils.clamp(gamma / 45, -1, 1) * 0.6;
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);

  let tiltAttached = false;

  return {
    update(dtSec: number, elapsedSec: number) {
      const dt = Math.min(dtSec, 0.05);
      const held = (a: string, b: string) => (keys.has(a) || keys.has(b) ? 1 : 0);

      let yawRate = (held("arrowleft", "a") - held("arrowright", "d")) * 0.8;
      let pitchRate = 0; // pitch comes from self-drift + device tilt; w/s = thrust
      let thrust = (held("w", "arrowup") - held("s", "arrowdown")) * 26;

      // self-drift baseline (never fully still)
      yawRate += Math.sin(elapsedSec * 0.08) * 0.12 * driftScale;
      pitchRate += Math.sin(elapsedSec * 0.05 + 1.3) * 0.05 * driftScale;
      thrust += 8 * driftScale;

      // device tilt
      yawRate += tiltYaw * driftScale;
      pitchRate += tiltPitch * driftScale;

      yaw += yawRate * dt;
      pitch += pitchRate * dt;
      pitch = THREE.MathUtils.clamp(pitch, -1.2, 1.2);

      euler.set(pitch, yaw, 0, "YXZ");
      camera.quaternion.setFromEuler(euler);
      forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
      pos.addScaledVector(forward, thrust * dt);
      pos.clampLength(0, MAX_R);
      camera.position.copy(pos);
    },
    async enableTilt() {
      if (tiltAttached) return;
      if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) {
        return;
      }
      const doe = window.DeviceOrientationEvent as unknown as OrientationRequestable;
      try {
        if (typeof doe.requestPermission === "function") {
          const res = await doe.requestPermission();
          if (res !== "granted") return;
        }
        window.addEventListener("deviceorientation", onOrient);
        tiltAttached = true;
      } catch {
        /* tilt unavailable — keys still fly */
      }
    },
    dispose() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      if (tiltAttached) window.removeEventListener("deviceorientation", onOrient);
    },
  };
}
