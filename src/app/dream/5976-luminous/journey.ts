// journey.ts — the near-death arc as one monotonic ~4.5 minute traversal.
//
// A single eased progress ∈ [0,1] drives EVERYTHING: where the camera is along
// the tunnel, how tightly the mote-field organizes, how warm the light is, how
// dense the fog. The canonical NDE stages (Raymond Moody, "Life After Life",
// 1975) are laid out as keyframe nodes and interpolated with smootherstep, so
// the world is genuinely in a different state at minute 4 than at minute 1 —
// never a loop.
//
//   0.00–0.15  the void / darkness   — near-black indigo, camera nearly still
//   0.15–0.45  the tunnel            — motes draw into a shell we fly up
//   0.45–0.75  the being of light    — a warm radiance blooms to fill the field
//   0.75–0.90  the boundary          — camera slows almost to rest inside light
//   0.90–1.00  the gentle return     — the light recedes, cooling to indigo
//
// No THREE render objects live here — only plain math + a couple of reusable
// vectors — so this file stays pure and testable.

import * as THREE from "three";

/** Full length of the self-playing journey, in seconds (~4.5 min). */
export const DURATION = 270;

/** The warm being-of-light sits far up the axis; the camera climbs toward it. */
export const LIGHT_Z = 900;
export const LIGHT_POS = new THREE.Vector3(0, 60, LIGHT_Z);

// Stage-node positions along progress. Every parameter array below is sampled
// at these same nodes and smootherstep-interpolated between them.
const NODES = [0.0, 0.15, 0.45, 0.75, 0.9, 1.0];

//                 void   tunnel  approach  peak    boundary  return
const CAMZ = [0, 25, 400, 760, 795, 430];
const CAMY = [0, 4, 30, 40, 42, 16];
const LINT = [0.06, 0.16, 0.7, 1.45, 1.55, 0.18]; // central-glow intensity
const LSIZE = [60, 110, 240, 560, 640, 180]; // central-glow world size
const WARM = [0.0, 0.06, 0.5, 0.96, 1.0, 0.12]; // cool violet → warm gold
const FOG = [0.0016, 0.0015, 0.0012, 0.0017, 0.0019, 0.0016];
const TUN = [0.0, 0.4, 0.92, 0.72, 0.6, 0.22]; // diffuse cloud → tight tunnel
const MOTE = [0.4, 0.65, 0.95, 0.75, 0.62, 0.42]; // mote brightness
const SWAY = [1.0, 2.2, 3.2, 0.7, 0.35, 1.3]; // camera drift amplitude

// The palette: deep indigo void ↔ enveloping warm gold at the light.
const VOID_FOG = new THREE.Color(0.015, 0.012, 0.045);
const WARM_FOG = new THREE.Color(0.9, 0.62, 0.36);

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Ken Perlin's smootherstep — C2-continuous, so eased motion never jerks. */
function smoother(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Sample a per-node array at progress p, smootherstep-eased between nodes. */
function sample(arr: number[], p: number): number {
  for (let i = 0; i < NODES.length - 1; i++) {
    if (p <= NODES[i + 1]) {
      const span = NODES[i + 1] - NODES[i];
      const t = span > 0 ? (p - NODES[i]) / span : 0;
      const e = smoother(clamp01(t));
      return arr[i] + (arr[i + 1] - arr[i]) * e;
    }
  }
  return arr[arr.length - 1];
}

export interface Journey {
  camPos: THREE.Vector3;
  lookAt: THREE.Vector3;
  fogColor: THREE.Color;
  roll: number;
  lightIntensity: number;
  lightSize: number;
  warmth: number;
  fogDensity: number;
  tunnelStrength: number;
  moteBrightness: number;
  progress: number;
  /** Recompute the whole world state from progress + a free-running clock. */
  update(progress: number, time: number, reduced: boolean): void;
}

/** Build a Journey whose per-frame update mutates reusable buffers (no GC). */
export function makeJourney(): Journey {
  const j: Journey = {
    camPos: new THREE.Vector3(),
    lookAt: new THREE.Vector3(),
    fogColor: new THREE.Color(),
    roll: 0,
    lightIntensity: 0,
    lightSize: 0,
    warmth: 0,
    fogDensity: 0,
    tunnelStrength: 0,
    moteBrightness: 0,
    progress: 0,
    update(progress: number, time: number, reduced: boolean): void {
      const p = clamp01(progress);
      j.progress = p;

      const camZ = sample(CAMZ, p);
      const camY = sample(CAMY, p);
      j.lightIntensity = sample(LINT, p);
      j.lightSize = sample(LSIZE, p);
      j.warmth = sample(WARM, p);
      j.fogDensity = sample(FOG, p);
      j.tunnelStrength = sample(TUN, p);
      j.moteBrightness = sample(MOTE, p);

      // Camera drift: two slow incommensurate sines so it never obviously
      // repeats. Reduced-motion sharply damps sway and roll.
      let sway = sample(SWAY, p);
      let rollAmp = 0.06;
      if (reduced) {
        sway *= 0.4;
        rollAmp *= 0.3;
      }
      const swx =
        Math.sin(time * 0.11) * sway * 0.6 +
        Math.sin(time * 0.07 + 1.3) * sway * 0.4;
      const swy = Math.cos(time * 0.09) * sway * 0.5;

      j.camPos.set(swx, camY + swy, camZ);
      // Always gaze toward the light; because it sits above the axis, the
      // forward glide reads as an ascent up the tunnel.
      j.lookAt.set(swx * 0.25, LIGHT_POS.y + swy * 0.15, LIGHT_POS.z);
      j.roll = Math.sin(time * 0.05) * rollAmp;

      // Fog (and the clear color, set from it in the scene) is the medium the
      // camera moves through: near-black indigo that turns to enveloping gold.
      j.fogColor.copy(VOID_FOG).lerp(WARM_FOG, clamp01(Math.pow(j.warmth, 1.3)));
    },
  };
  return j;
}
