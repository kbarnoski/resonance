// motes.ts — the point-field and the tunnel rings.
//
// Two additive-blended THREE.Points clouds share one in-code radial-gradient
// sprite texture. Overlapping additive sprites ARE the bloom — there is no
// post-processing pass, no external shader library.
//
//   • dust  — thousands of soft motes that morph between a diffuse void cloud
//             and a tight cylindrical tunnel wall as tunnelStrength rises.
//   • rings — concentric rungs pinned along the tunnel axis; as the camera
//             passes each one it fires a soft bell (returned to the caller).
//
// Colour is written per-vertex every frame: cool violet in the void, warming
// to gold toward the light. All placement is deterministic (seeded PRNG).

import * as THREE from "three";
import { LIGHT_Z, type Journey } from "./journey";

const DUST = 6000;
const NUM_RINGS = 22;
const POINTS_PER_RING = 54;
const RING_VERTS = NUM_RINGS * POINTS_PER_RING;

// Cool violet of the deep field ↔ warm gold near the being of light.
const COOL = new THREE.Color(0.34, 0.3, 0.78);
const WARM = new THREE.Color(1.0, 0.72, 0.34);

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/**
 * A soft round sprite as a DataTexture — a pure-math radial falloff, no canvas.
 * White RGB with a smooth alpha shoulder; under additive blending each point
 * lays down a gentle halo, and overlapping halos accumulate into bloom.
 */
export function makeSpriteTexture(): THREE.DataTexture {
  const N = 64;
  const data = new Uint8Array(N * N * 4);
  const c = (N - 1) / 2;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = (x - c) / c;
      const dy = (y - c) / c;
      const d = Math.sqrt(dx * dx + dy * dy);
      // 1 at centre, smoothly to 0 at the rim; squared for a soft core.
      const f = smoothstep(1, 0, d);
      const a = Math.round(f * f * 255);
      const i = (y * N + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = a;
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export interface MoteField {
  /** Advance one frame; returns the number of ring crossings (bell triggers). */
  update(j: Journey, dt: number): number;
  dispose(): void;
}

export function makeMotes(
  scene: THREE.Scene,
  sprite: THREE.DataTexture,
  rng: () => number,
): MoteField {
  // ---- dust cloud -------------------------------------------------------
  const dustPos = new Float32Array(DUST * 3);
  const dustCol = new Float32Array(DUST * 3);
  const theta = new Float32Array(DUST);
  const zPos = new Float32Array(DUST);
  const rDiffuse = new Float32Array(DUST);
  const rShell = new Float32Array(DUST);
  const twist = new Float32Array(DUST);
  const drift = new Float32Array(DUST);
  const baseBright = new Float32Array(DUST);

  for (let i = 0; i < DUST; i++) {
    theta[i] = rng() * Math.PI * 2;
    // Span the whole traversal plus a little behind and beyond the light.
    zPos[i] = -140 + rng() * (LIGHT_Z + 520);
    rDiffuse[i] = 40 + rng() * 240; // wide, formless cloud (the void)
    rShell[i] = 92 + rng() * 46; // the tunnel wall it collapses toward
    twist[i] = (rng() - 0.5) * 2.0;
    drift[i] = 0.5 + rng() * 1.0;
    baseBright[i] = 0.45 + rng() * 0.55;
  }

  const dustGeo = new THREE.BufferGeometry();
  const dustPosAttr = new THREE.BufferAttribute(dustPos, 3).setUsage(
    THREE.DynamicDrawUsage,
  );
  const dustColAttr = new THREE.BufferAttribute(dustCol, 3).setUsage(
    THREE.DynamicDrawUsage,
  );
  dustGeo.setAttribute("position", dustPosAttr);
  dustGeo.setAttribute("color", dustColAttr);

  const dustMat = new THREE.PointsMaterial({
    size: 3.4,
    map: sprite,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  scene.add(dust);

  // ---- tunnel rings -----------------------------------------------------
  const ringPos = new Float32Array(RING_VERTS * 3);
  const ringCol = new Float32Array(RING_VERTS * 3);
  const ringZ = new Float32Array(NUM_RINGS);
  const ringRadius = new Float32Array(NUM_RINGS);
  const ringGlow = new Float32Array(NUM_RINGS); // brief flare when passed

  for (let r = 0; r < NUM_RINGS; r++) {
    ringZ[r] = 20 + (r / NUM_RINGS) * (LIGHT_Z - 40);
    ringRadius[r] = 108 + rng() * 24;
    for (let k = 0; k < POINTS_PER_RING; k++) {
      const a = (k / POINTS_PER_RING) * Math.PI * 2;
      const idx = (r * POINTS_PER_RING + k) * 3;
      ringPos[idx] = Math.cos(a) * ringRadius[r];
      ringPos[idx + 1] = Math.sin(a) * ringRadius[r];
      ringPos[idx + 2] = ringZ[r];
    }
  }

  const ringGeo = new THREE.BufferGeometry();
  ringGeo.setAttribute("position", new THREE.BufferAttribute(ringPos, 3));
  const ringColAttr = new THREE.BufferAttribute(ringCol, 3).setUsage(
    THREE.DynamicDrawUsage,
  );
  ringGeo.setAttribute("color", ringColAttr);

  const ringMat = new THREE.PointsMaterial({
    size: 3.0,
    map: sprite,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const rings = new THREE.Points(ringGeo, ringMat);
  rings.frustumCulled = false;
  scene.add(rings);

  let clock = 0;
  let prevCamZ = -1;

  return {
    update(j: Journey, dt: number): number {
      clock += dt;
      const warm = j.warmth;
      const tunnel = j.tunnelStrength;
      const bright = j.moteBrightness;

      // --- dust ---
      for (let i = 0; i < DUST; i++) {
        const z = zPos[i];
        const r = rDiffuse[i] + (rShell[i] - rDiffuse[i]) * tunnel;
        const ang = theta[i] + clock * drift[i] * 0.15 + twist[i] * z * 0.0015;
        const p3 = i * 3;
        dustPos[p3] = Math.cos(ang) * r;
        dustPos[p3 + 1] = Math.sin(ang) * r;
        dustPos[p3 + 2] = z;

        // Warmer toward the light; global warmth lifts the whole field.
        const pw = smoothstep(250, LIGHT_Z, z);
        const mix = clamp01(pw * 0.75 + warm * 0.5);
        const b = bright * baseBright[i];
        dustCol[p3] = (COOL.r + (WARM.r - COOL.r) * mix) * b;
        dustCol[p3 + 1] = (COOL.g + (WARM.g - COOL.g) * mix) * b;
        dustCol[p3 + 2] = (COOL.b + (WARM.b - COOL.b) * mix) * b;
      }
      dustPosAttr.needsUpdate = true;
      dustColAttr.needsUpdate = true;

      // --- rings + crossing detection ---
      const camZ = j.camPos.z;
      let bells = 0;
      for (let r = 0; r < NUM_RINGS; r++) {
        if (
          prevCamZ >= 0 &&
          prevCamZ < ringZ[r] &&
          camZ >= ringZ[r] &&
          tunnel > 0.35
        ) {
          bells++;
          ringGlow[r] = 1;
        }
        ringGlow[r] *= Math.exp(-dt * 1.4);

        const pw = smoothstep(250, LIGHT_Z, ringZ[r]);
        const mix = clamp01(pw * 0.8 + warm * 0.4);
        const base =
          (0.5 + 0.5 * pw) * tunnel * bright * (0.7 + ringGlow[r] * 1.8);
        const cr = (COOL.r + (WARM.r - COOL.r) * mix) * base;
        const cg = (COOL.g + (WARM.g - COOL.g) * mix) * base;
        const cb = (COOL.b + (WARM.b - COOL.b) * mix) * base;
        const start = r * POINTS_PER_RING;
        for (let k = 0; k < POINTS_PER_RING; k++) {
          const ci = (start + k) * 3;
          ringCol[ci] = cr;
          ringCol[ci + 1] = cg;
          ringCol[ci + 2] = cb;
        }
      }
      ringColAttr.needsUpdate = true;
      prevCamZ = camZ;

      return bells > 2 ? 2 : bells;
    },

    dispose(): void {
      scene.remove(dust);
      scene.remove(rings);
      dustGeo.dispose();
      dustMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
    },
  };
}
