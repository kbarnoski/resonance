// ════════════════════════════════════════════════════════════════════════════
// 3136 · Tarab — string geometry helpers (pure, no three import here beyond types)
//
// Each string is a real 3-D line whose interior vertices displace along a
// decaying standing wave. Amplitude (from the audio coupling map) → physical
// displacement, so a string you WATCH shiver is exactly a string you HEAR ring.
// ════════════════════════════════════════════════════════════════════════════

import * as THREE from "three";

export const SEGMENTS = 40; // vertices per string
export const FIELD_W = 6.4; // world width the racks span
export const STRING_H = 4.2; // world height of a string (nut → bridge)

// Violet-leaning warm ramp. Front (played) rods sit warm; tarab strings sit
// cooler/dimmer and brighten toward warm bone-white as they ring.
const VIOLET = new THREE.Color(0x8b6bd6);
const DEEP = new THREE.Color(0x3a2d5c);
const WARM = new THREE.Color(0xf6e6c4);

export function baseColor(t: number, played: boolean): THREE.Color {
  // t in [0,1] across the rack (low → high pitch).
  const c = DEEP.clone().lerp(VIOLET, 0.35 + t * 0.55);
  if (played) c.lerp(WARM, 0.12);
  return c;
}

export function litColor(base: THREE.Color, amp: number): THREE.Color {
  return base.clone().lerp(WARM, Math.min(0.85, amp * 1.4));
}

// Standing-wave displacement of one string.
//   positions: flat XYZ buffer (SEGMENTS+1 verts) laid out top→bottom.
//   x0,z0    : the string's resting column position.
//   amp      : current ring amplitude (0..~1).
//   phase    : per-string phase offset (deterministic).
//   speed    : shimmer speed (higher strings wobble faster).
//   mode     : standing-wave mode number (1 = fundamental bow).
export function writeStandingWave(
  positions: Float32Array,
  x0: number,
  z0: number,
  amp: number,
  time: number,
  phase: number,
  speed: number,
  mode: number,
) {
  const n = SEGMENTS;
  const swing = amp * 0.55; // world units of max displacement
  const osc = Math.sin(time * speed + phase);
  for (let i = 0; i <= n; i++) {
    const u = i / n; // 0 at top nut, 1 at bottom bridge
    const y = STRING_H * (0.5 - u);
    // Envelope pinned at both ends (nut + bridge), belly in the middle.
    const env = Math.sin(Math.PI * u * mode);
    const d = swing * env * osc;
    const o = i * 3;
    positions[o] = x0 + d * 0.35; // slight lateral sway
    positions[o + 1] = y;
    positions[o + 2] = z0 + d; // main displacement toward camera
  }
}
