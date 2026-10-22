"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 23680-emberfield — Ember Field
//
// ONE question: what if Resonance were a warm room you could stand inside for ten
// minutes — Karel's piano as a slow, breathing ember-cloud you stir with your
// whole body?
//
// This is the deliberate opposite of the lab's cool-clinical cycle: cosmic-ambient,
// WARM, boundless, meditative. You stand inside it; you don't analyse it.
//
// VISUAL — a GPU curl-noise flow-field particle garden (Refik Anadol lineage).
// ~44k warm embers are advected through a divergence-free curl-noise flow field
// (velocity = curl of a value-noise vector potential, after Bridson, SIGGRAPH
// 2007). The field is baked into a velocity grid, then slowly re-grown and
// cross-faded over minutes so the room is genuinely different at minute 5 than at
// minute 1. Embers are THREE.Points + a ShaderMaterial: additive warm glow, size
// attenuation, a hand-rolled distance fog that dissolves depth. Deep ember / amber
// / gold / warm-rose on near-black warm charcoal. NOT Canvas2D, NOT clinical.
//
// AUDIO — ONE real take of Karel's, slowly. A granular / overlap time-stretch:
// many short overlapping grains are read from a head whose advance is DECOUPLED
// from real time, so the piece can breathe toward a long sustained bloom. Every
// grain is a slice of HIS decoded buffer (per-grain detune jitter only — his
// pitch, playbackRate 1). Grains → a warm tone-cap lowpass → a warm tail whose
// convolution IR is a decayed slice of HIS OWN recording → createSafeMaster.
// NO oscillator / synth / noise anywhere.
//
// COUPLING — spectral energy → ember brightness/density; bass → flow turbulence;
// onsets → warm pulses that ripple outward through the cloud.
//
// EMBODIED — your whole body stirs the field AND conducts the sound. Full-body
// pose (shoulders + wrists): your two hands are attractor-vortices the embers
// swirl toward and around; reach-height warms the palette (ember↔gold); arm-span
// opens the turbulence; hand velocity drives the granular time-stretch rate +
// grain density; stillness lets the field settle and the music slow toward
// near-stillness — the meditative payoff. Pointer fallback is a single attractor
// the mouse drags, driving the IDENTICAL control struct (fully playable with a
// mouse alone — the reviewer's cloud has no camera).
//
// Refs: Refik Anadol's audio-reactive particle/flow-field register; Ars
// Electronica 2026 Deep Space "Reactive || Interactive Particle Waves" (a
// walk-through audio-reactive particle garden, festival Sept 9–13 2026);
// curl-noise advection after Robert Bridson, "Curl-Noise for Procedural Fluid
// Flow," SIGGRAPH 2007.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { REAL_TRACKS, WELCOME_HOME_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import {
  createPoseTracker,
  startCamera,
  POSE_LM,
  type Landmark,
  type PoseLandmarkerInst,
} from "../_shared/cameraTracking";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { useImmersive, ImmersiveHud } from "../_shared/immersive";

// ── field geometry ───────────────────────────────────────────────────────────
const X_HALF = 64;
const Y_HALF = 46;
const Z_NEAR = 42;
const Z_FAR = -138;
const Z_SPAN = Z_NEAR - Z_FAR;
const N = 44000; // ember count
const GRID = 32; // curl-grid resolution per axis
const GRID3 = GRID * GRID * GRID;
const BUILD_CHUNK = 1600; // grid nodes re-grown per frame during a rebuild
const HOLD_TIME = 24; // seconds a flow topology holds before re-growing
const MORPH_TIME = 7; // seconds to cross-fade to the new topology
const BG = 0x0c0806; // near-black warm charcoal

const DESCRIPTION =
  "Karel's piano as a slow, breathing ember-cloud — tens of thousands of warm embers advected through a curl-noise flow field, the take itself granular-stretched toward a long bloom. Stand inside it for ten minutes and stir it with your whole body; grow still and it settles toward near-silence.";
const HOW_TO = [
  "Press Play — the room fills with Karel's take, stretched slow into a breathing ember-cloud",
  "Raise both hands — they become vortices the embers swirl toward and around",
  "Reach high to warm the palette toward gold; lower your hands to cool it back to ember",
  "Open your arms wide to stir up turbulence; draw them in to calm the flow",
  "Move faster to quicken the music; hold still and the field settles, the music slows toward near-stillness",
  "No camera? Drag a cursor — it is the single attractor, and drives the exact same controls",
];

// ── small helpers (NOT hooks) ──────────────────────────────────────────────────
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ── value noise + curl (field build only — never in the per-particle hot loop) ─
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}
function hash(ix: number, iy: number, iz: number, seed: number): number {
  let h = (ix * 374761393 + iy * 668265263 + iz * 1274126177 + seed * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967295;
}
function vnoise(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fade(fx);
  const uy = fade(fy);
  const uz = fade(fz);
  const c000 = hash(ix, iy, iz, seed);
  const c100 = hash(ix + 1, iy, iz, seed);
  const c010 = hash(ix, iy + 1, iz, seed);
  const c110 = hash(ix + 1, iy + 1, iz, seed);
  const c001 = hash(ix, iy, iz + 1, seed);
  const c101 = hash(ix + 1, iy, iz + 1, seed);
  const c011 = hash(ix, iy + 1, iz + 1, seed);
  const c111 = hash(ix + 1, iy + 1, iz + 1, seed);
  const x00 = lerp(c000, c100, ux);
  const x10 = lerp(c010, c110, ux);
  const x01 = lerp(c001, c101, ux);
  const x11 = lerp(c011, c111, ux);
  const y0 = lerp(x00, x10, uy);
  const y1 = lerp(x01, x11, uy);
  return lerp(y0, y1, uz);
}

const CURL_EPS = 0.72;
const SEED_A = 0;
const SEED_B = 131;
const SEED_C = 277;

// curl of the value-noise vector potential Ψ=(A,B,C) → divergence-free velocity.
function curl(x: number, y: number, z: number, seed: number, out: Float32Array, o: number): void {
  const e = CURL_EPS;
  const sa = seed + SEED_A;
  const sb = seed + SEED_B;
  const sc = seed + SEED_C;
  const dCzdy = vnoise(x, y + e, z, sc) - vnoise(x, y - e, z, sc);
  const dBydz = vnoise(x, y, z + e, sb) - vnoise(x, y, z - e, sb);
  const dAxdz = vnoise(x, y, z + e, sa) - vnoise(x, y, z - e, sa);
  const dCzdx = vnoise(x + e, y, z, sc) - vnoise(x - e, y, z, sc);
  const dBydx = vnoise(x + e, y, z, sb) - vnoise(x - e, y, z, sb);
  const dAxdy = vnoise(x, y + e, z, sa) - vnoise(x, y - e, z, sa);
  const inv = 1 / (2 * e);
  out[o] = (dCzdy - dBydz) * inv;
  out[o + 1] = (dAxdz - dCzdx) * inv;
  out[o + 2] = (dBydx - dAxdy) * inv;
}

function buildCurlChunk(grid: Float32Array, from: number, to: number, scale: number, seed: number): void {
  for (let n = from; n < to; n++) {
    const i = (n / (GRID * GRID)) | 0;
    const rem = n - i * GRID * GRID;
    const j = (rem / GRID) | 0;
    const kk = rem - j * GRID;
    const wx = (-X_HALF + (i / (GRID - 1)) * 2 * X_HALF) * scale;
    const wy = (-Y_HALF + (j / (GRID - 1)) * 2 * Y_HALF) * scale;
    const wz = (Z_FAR + (kk / (GRID - 1)) * Z_SPAN) * scale;
    curl(wx + seed * 0.0007, wy, wz, seed, grid, n * 3);
  }
}

// ── the shared control struct (camera AND pointer write the SAME shape) ─────────
interface Control {
  ax: number; // attractor A, normalized screen [0,1]
  ay: number;
  aOn: boolean;
  bx: number; // attractor B (second hand) — unused by the pointer path
  by: number;
  bOn: boolean;
  warmth: number; // 0 ember … 1 gold (reach-height)
  openness: number; // 0 calm … 1 turbulent (arm-span)
  energy: number; // 0 still … 1 fast (hand/pointer velocity)
}

interface Pulse {
  x: number;
  y: number;
  z: number;
  r: number;
  intensity: number;
}

interface Grain {
  src: AudioBufferSourceNode;
  g: GainNode;
}

interface Engine {
  ctx: AudioContext;
  master: SafeMaster;
  buffer: AudioBuffer;
  grainBus: GainNode;
  toneCap: BiquadFilterNode;
  dryGain: GainNode;
  wetGain: GainNode;
  convolver: ConvolverNode;
  grains: Grain[];
  head: number; // read-head into the buffer (s), advance decoupled from real time
  nextGrainAt: number; // ctx time of the next grain
  rate: number; // smoothed read-head advance (time-stretch); <1 = stretched
  freq: Uint8Array<ArrayBuffer>;
  prevEnergy: number;
  lastOnset: number;
}

interface Field {
  pos: Float32Array;
  seed: Float32Array;
  flash: Float32Array;
  alpha: Float32Array;
  speed: Float32Array;
  age: Float32Array;
  maxAge: Float32Array;
  gridCur: Float32Array; // GRID3*3 velocities
  gridNext: Float32Array;
  morph: number; // cur→next cross-fade
  phase: "hold" | "build" | "morph";
  buildIdx: number;
  holdT: number;
  nextSeed: number;
  nextScale: number;
  scale: number;
  pulses: Pulse[];
  geom: THREE.BufferGeometry;
  mat: THREE.ShaderMaterial;
  points: THREE.Points;
  warmBase: number; // long-form baseline palette drift
}

// ── grid rebuild / cross-fade state machine (re-grows the flow topology) ────────
function advanceGrid(fld: Field, dt: number, t: number): void {
  if (fld.phase === "hold") {
    fld.holdT += dt;
    if (fld.holdT > HOLD_TIME) {
      fld.phase = "build";
      fld.buildIdx = 0;
      fld.nextSeed = (Math.random() * 1e6) | 0;
      fld.nextScale = 0.013 + Math.random() * 0.018;
    }
  } else if (fld.phase === "build") {
    const end = Math.min(GRID3, fld.buildIdx + BUILD_CHUNK);
    buildCurlChunk(fld.gridNext, fld.buildIdx, end, fld.nextScale, fld.nextSeed);
    fld.buildIdx = end;
    if (end >= GRID3) {
      fld.phase = "morph";
      fld.morph = 0;
    }
  } else {
    fld.morph += dt / MORPH_TIME;
    if (fld.morph >= 1) {
      const tmp = fld.gridCur;
      fld.gridCur = fld.gridNext;
      fld.gridNext = tmp;
      fld.scale = fld.nextScale;
      fld.morph = 0;
      fld.phase = "hold";
      fld.holdT = 0;
    }
  }
  // long-form palette evolution (alive even while a topology holds)
  fld.warmBase = 0.12 + 0.11 * Math.sin(t * 0.012);
}

// ── advance every ember through the curl field + attractors + pulses ────────────
function advanceEmbers(
  fld: Field, sc: Control, dt: number, t: number, bass: number, bright: number,
): void {
  const pos = fld.pos;
  const flash = fld.flash;
  const alpha = fld.alpha;
  const speed = fld.speed;
  const age = fld.age;
  const maxAge = fld.maxAge;
  const cur = fld.gridCur;
  const next = fld.gridNext;
  const morph = fld.phase === "morph" ? fld.morph : 0;
  const useNext = morph > 0.001;

  // global motion scalars — stillness slows everything (meditative payoff)
  const breath = 0.6 + 0.4 * Math.sin(t * 0.13);
  const flowGain = (0.2 + 0.55 * sc.openness + 1.0 * bass + 0.35 * sc.energy) * breath;
  const flowSpeed = 15 * flowGain;
  const updraft = 1.4 + 2.2 * breath + 3.0 * bright;
  const timeScale = 0.35 + 0.65 * (0.4 + 0.6 * sc.energy); // still → slow drift

  const ax = (sc.ax - 0.5) * 2 * X_HALF;
  const ay = (0.5 - sc.ay) * 2 * Y_HALF;
  const bx = (sc.bx - 0.5) * 2 * X_HALF;
  const by = (0.5 - sc.by) * 2 * Y_HALF;
  const aStr = sc.aOn ? 1 : 0;
  const bStr = sc.bOn ? 1 : 0;
  const AR = 52;
  const AR2 = AR * AR;

  const pulses = fld.pulses;
  for (let p = pulses.length - 1; p >= 0; p--) {
    const pu = pulses[p];
    pu.r += dt * 58;
    pu.intensity *= 1 - dt * 0.9;
    if (pu.intensity < 0.02 || pu.r > 240) pulses.splice(p, 1);
  }

  const GG = GRID;
  for (let i = 0; i < N; i++) {
    const i3 = i * 3;
    let x = pos[i3];
    let y = pos[i3 + 1];
    let z = pos[i3 + 2];

    // ── sample the curl velocity grid (trilinear) ──
    const nx = clamp01((x + X_HALF) / (2 * X_HALF));
    const ny = clamp01((y + Y_HALF) / (2 * Y_HALF));
    const nz = clamp01((z - Z_FAR) / Z_SPAN);
    const gx = nx * (GRID - 1);
    const gy = ny * (GRID - 1);
    const gz = nz * (GRID - 1);
    const i0 = gx | 0;
    const j0 = gy | 0;
    const kk0 = gz | 0;
    const i1 = i0 + 1 < GRID ? i0 + 1 : i0;
    const j1 = j0 + 1 < GRID ? j0 + 1 : j0;
    const k1 = kk0 + 1 < GRID ? kk0 + 1 : kk0;
    const fx = gx - i0;
    const fy = gy - j0;
    const fz = gz - kk0;
    const w000 = (1 - fx) * (1 - fy) * (1 - fz);
    const w100 = fx * (1 - fy) * (1 - fz);
    const w010 = (1 - fx) * fy * (1 - fz);
    const w110 = fx * fy * (1 - fz);
    const w001 = (1 - fx) * (1 - fy) * fz;
    const w101 = fx * (1 - fy) * fz;
    const w011 = (1 - fx) * fy * fz;
    const w111 = fx * fy * fz;
    const b000 = (i0 * GG * GG + j0 * GG + kk0) * 3;
    const b100 = (i1 * GG * GG + j0 * GG + kk0) * 3;
    const b010 = (i0 * GG * GG + j1 * GG + kk0) * 3;
    const b110 = (i1 * GG * GG + j1 * GG + kk0) * 3;
    const b001 = (i0 * GG * GG + j0 * GG + k1) * 3;
    const b101 = (i1 * GG * GG + j0 * GG + k1) * 3;
    const b011 = (i0 * GG * GG + j1 * GG + k1) * 3;
    const b111 = (i1 * GG * GG + j1 * GG + k1) * 3;

    let vx = cur[b000] * w000 + cur[b100] * w100 + cur[b010] * w010 + cur[b110] * w110 +
      cur[b001] * w001 + cur[b101] * w101 + cur[b011] * w011 + cur[b111] * w111;
    let vy = cur[b000 + 1] * w000 + cur[b100 + 1] * w100 + cur[b010 + 1] * w010 + cur[b110 + 1] * w110 +
      cur[b001 + 1] * w001 + cur[b101 + 1] * w101 + cur[b011 + 1] * w011 + cur[b111 + 1] * w111;
    let vz = cur[b000 + 2] * w000 + cur[b100 + 2] * w100 + cur[b010 + 2] * w010 + cur[b110 + 2] * w110 +
      cur[b001 + 2] * w001 + cur[b101 + 2] * w101 + cur[b011 + 2] * w011 + cur[b111 + 2] * w111;

    if (useNext) {
      const nvx = next[b000] * w000 + next[b100] * w100 + next[b010] * w010 + next[b110] * w110 +
        next[b001] * w001 + next[b101] * w101 + next[b011] * w011 + next[b111] * w111;
      const nvy = next[b000 + 1] * w000 + next[b100 + 1] * w100 + next[b010 + 1] * w010 + next[b110 + 1] * w110 +
        next[b001 + 1] * w001 + next[b101 + 1] * w101 + next[b011 + 1] * w011 + next[b111 + 1] * w111;
      const nvz = next[b000 + 2] * w000 + next[b100 + 2] * w100 + next[b010 + 2] * w010 + next[b110 + 2] * w110 +
        next[b001 + 2] * w001 + next[b101 + 2] * w101 + next[b011 + 2] * w011 + next[b111 + 2] * w111;
      vx = vx + (nvx - vx) * morph;
      vy = vy + (nvy - vy) * morph;
      vz = vz + (nvz - vz) * morph;
    }

    vx *= flowSpeed;
    vy = vy * flowSpeed + updraft;
    vz *= flowSpeed;

    // ── attractor vortices: embers swirl toward AND around the hands ──
    if (aStr) {
      const dx = ax - x, dy = ay - y, dz = 2 - z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < AR2) {
        const d = Math.sqrt(d2) + 1e-3;
        const f2 = (1 - d / AR) * (1 - d / AR);
        vx += (dx / d) * 22 * f2;
        vy += (dy / d) * 22 * f2;
        vz += (dz / d) * 10 * f2;
        vx += -(dy / d) * 30 * f2; // tangential swirl in the x/y plane
        vy += (dx / d) * 30 * f2;
      }
    }
    if (bStr) {
      const dx = bx - x, dy = by - y, dz = 2 - z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < AR2) {
        const d = Math.sqrt(d2) + 1e-3;
        const f2 = (1 - d / AR) * (1 - d / AR);
        vx += (dx / d) * 22 * f2;
        vy += (dy / d) * 22 * f2;
        vz += (dz / d) * 10 * f2;
        vx += (dy / d) * 30 * f2; // opposite handedness for the second hand
        vy += -(dx / d) * 30 * f2;
      }
    }

    // ── pulses: warm shells ripple outward (flash + gentle outward kick) ──
    let fl = flash[i];
    for (let p = 0; p < pulses.length; p++) {
      const pu = pulses[p];
      const dx = x - pu.x, dy = y - pu.y, dz = z - pu.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-3;
      const shell = Math.abs(d - pu.r);
      if (shell < 14) {
        const g = (1 - shell / 14) * pu.intensity;
        fl += g * 0.8;
        const kick = g * 26;
        vx += (dx / d) * kick;
        vy += (dy / d) * kick;
        vz += (dz / d) * kick;
      }
    }

    // integrate
    x += vx * dt * timeScale;
    y += vy * dt * timeScale;
    z += vz * dt * timeScale;

    // age + respawn (fade in/out hides the recycle; cloud stays boundless)
    let a = age[i] + dt;
    const sp = Math.sqrt(vx * vx + vy * vy + vz * vz);
    const outOfBounds = x < -X_HALF - 12 || x > X_HALF + 12 || y < -Y_HALF - 12 ||
      y > Y_HALF + 24 || z < Z_FAR - 12 || z > Z_NEAR + 12;
    if (a > maxAge[i] || outOfBounds) {
      x = (Math.random() - 0.5) * 2 * X_HALF;
      y = (Math.random() - 0.5) * 2 * Y_HALF - 6;
      z = Z_FAR + Math.random() * Z_SPAN;
      a = 0;
      maxAge[i] = 10 + Math.random() * 16;
    }
    age[i] = a;
    pos[i3] = x; pos[i3 + 1] = y; pos[i3 + 2] = z;

    const fin = Math.min(1, a / 1.2);
    const fout = Math.min(1, (maxAge[i] - a) / 1.6);
    alpha[i] = fin * fout * (0.55 + 0.45 * fout);
    speed[i] = clamp01(sp / 42);
    flash[i] = fl * (1 - dt * 3.2);
  }
}

// ── grain scheduling (granular time-stretch of HIS take) ────────────────────────
function scheduleGrains(eng: Engine, sc: Control, dt: number): void {
  const ctx = eng.ctx;
  const now = ctx.currentTime;
  const tc = 0.12;

  // density + rate from control; stillness → very slow, long, sparse bloom
  const density = clamp01(0.2 + sc.energy * 0.8);
  const grainDur = lerp(0.3, 0.14, density);
  const overlap = lerp(2.4, 4.0, density);
  const interval = grainDur / overlap;
  eng.rate = lerp(eng.rate, lerp(0.1, 0.85, sc.energy), 1 - Math.exp(-dt / 0.3));

  // warmth opens the tone-cap toward gold brightness; smoothed
  eng.toneCap.frequency.setTargetAtTime(1500 + sc.warmth * 2900, now, tc);
  eng.wetGain.gain.setTargetAtTime(0.2 + (1 - density) * 0.18, now, tc);

  const bufDur = eng.buffer.duration;
  const loopLo = bufDur * 0.04;
  const loopHi = bufDur * 0.94;
  const peak = 0.55 / overlap;

  let guard = 0;
  while (eng.nextGrainAt < now + 0.12 && guard < 64) {
    guard++;
    const at = Math.max(now + 0.005, eng.nextGrainAt);
    let head = eng.head;
    if (head < loopLo || head > loopHi - grainDur) head = loopLo;

    const src = ctx.createBufferSource();
    src.buffer = eng.buffer;
    src.detune.value = (Math.random() * 2 - 1) * 7; // subtle warm shimmer, his pitch
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + grainDur * 0.5);
    g.gain.linearRampToValueAtTime(0.0001, at + grainDur);
    src.connect(g);
    g.connect(eng.grainBus);
    try {
      src.start(at, head, grainDur + 0.03);
      src.stop(at + grainDur + 0.04);
    } catch {
      break;
    }
    const grain: Grain = { src, g };
    src.onended = () => {
      try { g.disconnect(); } catch { /* noop */ }
      const idx = eng.grains.indexOf(grain);
      if (idx >= 0) eng.grains.splice(idx, 1);
    };
    eng.grains.push(grain);

    eng.head = head + interval * eng.rate; // decoupled advance
    eng.nextGrainAt = at + interval;
  }
  if (eng.nextGrainAt < now) eng.nextGrainAt = now + 0.01;
}

// ── shaders ─────────────────────────────────────────────────────────────────
const VERT = /* glsl */ `
  attribute float aSeed;
  attribute float aFlash;
  attribute float aAlpha;
  attribute float aSpeed;
  uniform float uPixelRatio;
  uniform float uSizeScale;
  uniform float uFogDensity;
  varying float vFog;
  varying float vFlash;
  varying float vAlpha;
  varying float vSeed;
  varying float vSpeed;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float dist = max(1.0, -mv.z);
    float base = 2.0 + aSeed * 3.2;
    gl_PointSize = base * uSizeScale * uPixelRatio * (300.0 / dist);
    gl_PointSize *= (1.0 + aFlash * 2.4);
    float fd = uFogDensity * dist;
    vFog = clamp(1.0 - exp(-fd * fd), 0.0, 1.0);
    vFlash = aFlash;
    vAlpha = aAlpha;
    vSeed = aSeed;
    vSpeed = aSpeed;
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform float uWarmth;
  uniform float uWarmBase;
  uniform float uBrightness;
  varying float vFog;
  varying float vFlash;
  varying float vAlpha;
  varying float vSeed;
  varying float vSpeed;
  vec3 ember(float t){
    vec3 c0 = vec3(0.30, 0.045, 0.02); // deep ember
    vec3 c1 = vec3(0.85, 0.22, 0.05);  // amber
    vec3 c2 = vec3(1.00, 0.52, 0.16);  // warm gold-orange
    vec3 c3 = vec3(1.00, 0.84, 0.48);  // pale gold
    if (t < 0.34) return mix(c0, c1, t / 0.34);
    if (t < 0.67) return mix(c1, c2, (t - 0.34) / 0.33);
    return mix(c2, c3, (t - 0.67) / 0.33);
  }
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float glow = exp(-d * d * 7.0); // soft warm bloom, not a crisp disc
    float t = clamp(uWarmBase + uWarmth * 0.5 + vSpeed * 0.2 + vSeed * 0.22 - 0.08, 0.0, 1.0);
    vec3 col = ember(t);
    col = mix(col, vec3(1.0, 0.40, 0.42), smoothstep(0.84, 1.0, vSeed) * 0.45); // warm-rose accent
    float bright = 0.5 + uBrightness * 0.95 + vFlash * 1.5;
    col *= bright;
    float a = glow * vAlpha * (1.0 - vFog * 0.85);
    gl_FragColor = vec4(col, a);
  }
`;

export default function Page() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rafRef = useRef<number>(0);

  const fieldRef = useRef<Field | null>(null);
  const engineRef = useRef<Engine | null>(null);

  const targetRef = useRef<Control>({
    ax: 0.5, ay: 0.5, aOn: false, bx: 0.5, by: 0.5, bOn: false,
    warmth: 0.35, openness: 0.3, energy: 0.1,
  });
  const scRef = useRef<Control>({ ...targetRef.current });
  const pointerRef = useRef({ x: 0.5, y: 0.5, px: 0.5, py: 0.5, active: false, down: false });
  const camWantRef = useRef(false);
  const trackerRef = useRef<PoseLandmarkerInst | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const prevWristRef = useRef({ lx: 0.5, ly: 0.5, rx: 0.5, ry: 0.5, seen: false });

  const clockRef = useRef({ t: 0, last: 0 });
  const camStateRef = useRef<"off" | "requesting" | "live" | "denied" | "failed">("off");
  const bodySeenRef = useRef(false);
  const phaseRef = useRef<"idle" | "loading" | "running" | "error">("idle");

  const [webglOk, setWebglOk] = useState(true);
  const [phase, setPhase] = useState<"idle" | "loading" | "running" | "error">("idle");
  const [trackId, setTrackId] = useState<string>(WELCOME_HOME_TRACKS[2].id); // "Welcome Home"
  const [trackTitle, setTrackTitle] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const [camState, setCamState] = useState<"off" | "requesting" | "live" | "denied" | "failed">("off");
  const [bodySeen, setBodySeen] = useState(false);
  const [driver, setDriver] = useState<"pointer" | "tracking" | "idle">("idle");
  const driverRef = useRef<"pointer" | "tracking" | "idle">("idle");

  const { immersive, toggle } = useImmersive();

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    camStateRef.current = camState;
  }, [camState]);

  // ── read the body: gate ONLY on shoulders + wrists, mirror x ────────────────
  const readBody = useCallback((lm: Landmark[], dt: number): boolean => {
    const ls = lm[POSE_LM.leftShoulder];
    const rs = lm[POSE_LM.rightShoulder];
    if (!ls || !rs) return false;
    if ((ls.visibility ?? 1) < 0.3 || (rs.visibility ?? 1) < 0.3) return false;

    const lw = lm[POSE_LM.leftWrist];
    const rw = lm[POSE_LM.rightWrist];
    const lwv = lw?.visibility ?? 0;
    const rwv = rw?.visibility ?? 0;
    if ((!lw || lwv < 0.3) && (!rw || rwv < 0.3)) return false; // need at least one wrist

    const shoulderW = Math.hypot(ls.x - rs.x, ls.y - rs.y) + 1e-4;
    const scy = (ls.y + rs.y) / 2;
    const tgt = targetRef.current;

    const lOn = !!lw && lwv > 0.3;
    const rOn = !!rw && rwv > 0.3;
    if (lOn && lw) {
      tgt.ax = clamp01(1 - lw.x);
      tgt.ay = clamp01(lw.y);
    }
    tgt.aOn = lOn;
    if (rOn && rw) {
      tgt.bx = clamp01(1 - rw.x);
      tgt.by = clamp01(rw.y);
    }
    tgt.bOn = rOn;

    // reach-height → warmth (hands high above the shoulders warm toward gold)
    let elev = 0;
    let n = 0;
    if (lOn && lw) { elev += (scy - lw.y) / shoulderW; n++; }
    if (rOn && rw) { elev += (scy - rw.y) / shoulderW; n++; }
    tgt.warmth = clamp01(((n ? elev / n : 0) + 0.25) / 1.25);

    // arm-span → openness / turbulence
    if (lOn && rOn && lw && rw) {
      const span = Math.hypot(lw.x - rw.x, lw.y - rw.y);
      tgt.openness = clamp01((span / shoulderW - 0.75) / (2.6 - 0.75));
    }

    // hand velocity → energy (drives granular rate + grain density)
    const pr = prevWristRef.current;
    let vsum = 0;
    let vn = 0;
    if (lOn && lw) {
      if (pr.seen) { vsum += Math.hypot((1 - lw.x) - pr.lx, lw.y - pr.ly); vn++; }
      pr.lx = 1 - lw.x; pr.ly = lw.y;
    }
    if (rOn && rw) {
      if (pr.seen) { vsum += Math.hypot((1 - rw.x) - pr.rx, rw.y - pr.ry); vn++; }
      pr.rx = 1 - rw.x; pr.ry = rw.y;
    }
    pr.seen = true;
    const v = vn ? vsum / vn / Math.max(1e-3, dt) : 0; // normalized units / s
    tgt.energy = clamp01(v * 2.2);
    return true;
  }, []);

  // ── render + simulation loop ────────────────────────────────────────────────
  const loop = useCallback((nowMs: number) => {
    rafRef.current = requestAnimationFrame(loop);
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera) return;

    const clk = clockRef.current;
    const dt = clk.last ? Math.min(0.05, (nowMs - clk.last) / 1000) : 1 / 60;
    clk.last = nowMs;
    clk.t += dt;
    const t = clk.t;
    const tgt = targetRef.current;

    // ── resolve the ONE control from camera → pointer → idle ──
    let drv: "pointer" | "tracking" | "idle" = "idle";
    let bodyThisFrame = false;
    const video = videoRef.current;
    if (camWantRef.current && trackerRef.current && video && video.readyState >= 2) {
      let res: { landmarks: Landmark[][] } | null = null;
      try {
        res = trackerRef.current.detectForVideo(video, nowMs);
      } catch {
        res = null;
      }
      if (res && res.landmarks && res.landmarks[0]) {
        bodyThisFrame = readBody(res.landmarks[0], dt);
      }
      if (bodyThisFrame) drv = "tracking";
    }
    if (!bodyThisFrame) {
      prevWristRef.current.seen = false;
      if (camStateRef.current === "live") {
        drv = "tracking"; // camera on but body lost → ease controls toward calm
        tgt.aOn = false; tgt.bOn = false;
        tgt.energy = 0;
        tgt.openness = lerp(tgt.openness, 0.25, 0.02);
      } else {
        const p = pointerRef.current;
        if (p.active) {
          drv = "pointer";
          tgt.ax = p.x; tgt.ay = p.y; tgt.aOn = true; tgt.bOn = false;
          tgt.warmth = clamp01(1 - p.y); // high on screen = warm/gold
          tgt.openness = p.down ? 0.85 : 0.4;
          const spd = Math.hypot(p.x - p.px, p.y - p.py) / Math.max(1e-3, dt);
          tgt.energy = clamp01(spd * 2.4);
          p.px = p.x; p.py = p.y;
        } else {
          drv = "idle"; // alive, breathing, never static — field & music settle
          tgt.aOn = false; tgt.bOn = false;
          tgt.energy = lerp(tgt.energy, 0.05, 0.02);
          tgt.openness = 0.28 + 0.1 * Math.sin(t * 0.11);
          tgt.warmth = 0.34 + 0.14 * Math.sin(t * 0.047 + 1.0);
        }
      }
    }
    if (bodyThisFrame !== bodySeenRef.current) {
      bodySeenRef.current = bodyThisFrame;
      setBodySeen(bodyThisFrame);
    }
    if (drv !== driverRef.current) {
      driverRef.current = drv;
      setDriver(drv);
    }

    // ── smooth the control struct (~0.12s) ──
    const sc = scRef.current;
    const k = 1 - Math.exp(-dt / 0.12);
    sc.ax = lerp(sc.ax, tgt.ax, k);
    sc.ay = lerp(sc.ay, tgt.ay, k);
    sc.bx = lerp(sc.bx, tgt.bx, k);
    sc.by = lerp(sc.by, tgt.by, k);
    sc.warmth = lerp(sc.warmth, tgt.warmth, k);
    sc.openness = lerp(sc.openness, tgt.openness, k);
    sc.energy = lerp(sc.energy, tgt.energy, k);
    sc.aOn = tgt.aOn;
    sc.bOn = tgt.bOn;

    // ── audio: features, onset detection, grain scheduling ──
    let bright = 0.12;
    let bass = 0;
    const eng = engineRef.current;
    if (eng) {
      eng.master.analyser.getByteFrequencyData(eng.freq);
      const f = eng.freq;
      const nb = f.length;
      let sum = 0;
      for (let i = 0; i < nb; i++) sum += f[i];
      const energyAll = sum / nb / 255;
      let bsum = 0;
      const bassBins = Math.max(4, Math.floor(nb * 0.08));
      for (let i = 0; i < bassBins; i++) bsum += f[i];
      bass = bsum / bassBins / 255;
      bright = clamp01(energyAll * 1.4);

      const flux = energyAll - eng.prevEnergy;
      eng.prevEnergy = energyAll;
      const fld0 = fieldRef.current;
      if (fld0 && flux > 0.05 && t - eng.lastOnset > 0.28 && fld0.pulses.length < 5) {
        eng.lastOnset = t;
        const ox = sc.aOn ? (sc.ax - 0.5) * 2 * X_HALF : (Math.random() - 0.5) * X_HALF;
        const oy = sc.aOn ? (0.5 - sc.ay) * 2 * Y_HALF : (Math.random() - 0.5) * Y_HALF;
        fld0.pulses.push({ x: ox, y: oy, z: 2, r: 4, intensity: clamp01(flux * 6) });
      }

      scheduleGrains(eng, sc, dt);
    }

    // ── advance the field simulation ──
    const fld = fieldRef.current;
    if (fld) {
      advanceGrid(fld, dt, t);
      advanceEmbers(fld, sc, dt, t, bass, bright);
      fld.geom.getAttribute("position").needsUpdate = true;
      (fld.geom.getAttribute("aFlash") as THREE.BufferAttribute).needsUpdate = true;
      (fld.geom.getAttribute("aAlpha") as THREE.BufferAttribute).needsUpdate = true;
      (fld.geom.getAttribute("aSpeed") as THREE.BufferAttribute).needsUpdate = true;
      fld.mat.uniforms.uWarmth.value = sc.warmth;
      fld.mat.uniforms.uWarmBase.value = fld.warmBase;
      fld.mat.uniforms.uBrightness.value = bright;
      fld.mat.uniforms.uSizeScale.value = 1 + bright * 0.5 + bass * 0.3;
    }

    // ── camera: a slow breathing drift so the room is never dead-still ──
    const sway = Math.sin(t * 0.09);
    camera.position.set(
      Math.sin(t * 0.06) * 6 + (sc.ax - 0.5) * 8,
      4 + Math.sin(t * 0.045) * 3,
      96 + sway * 5,
    );
    camera.lookAt((sc.ax - 0.5) * 6, (0.5 - sc.ay) * 6, -36);

    renderer.render(scene, camera);
  }, [readBody]);

  // ── build the three.js scene on mount (the cloud is alive before audio) ───────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
      if (!renderer.getContext()) throw new Error("no gl");
    } catch {
      setWebglOk(false);
      return;
    }
    const w = mount.clientWidth || window.innerWidth;
    const h = mount.clientHeight || window.innerHeight;
    const pr = Math.min(2, window.devicePixelRatio || 1);
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    renderer.setClearColor(new THREE.Color(BG), 1);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "none";
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, w / h, 1, 600);
    camera.position.set(0, 4, 96);
    cameraRef.current = camera;

    const pos = new Float32Array(N * 3);
    const seed = new Float32Array(N);
    const flash = new Float32Array(N);
    const alpha = new Float32Array(N);
    const speed = new Float32Array(N);
    const age = new Float32Array(N);
    const maxAge = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 2 * X_HALF;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 2 * Y_HALF;
      pos[i * 3 + 2] = Z_FAR + Math.random() * Z_SPAN;
      seed[i] = Math.random();
      maxAge[i] = 10 + Math.random() * 16;
      age[i] = Math.random() * maxAge[i];
      alpha[i] = 0.4 + Math.random() * 0.4;
    }

    const gridCur = new Float32Array(GRID3 * 3);
    const gridNext = new Float32Array(GRID3 * 3);
    const scale0 = 0.018;
    buildCurlChunk(gridCur, 0, GRID3, scale0, (Math.random() * 1e6) | 0);

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geom.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    geom.setAttribute("aFlash", new THREE.BufferAttribute(flash, 1));
    geom.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1));
    geom.setAttribute("aSpeed", new THREE.BufferAttribute(speed, 1));

    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uPixelRatio: { value: pr },
        uSizeScale: { value: 1 },
        uFogDensity: { value: 0.0062 },
        uWarmth: { value: 0.35 },
        uWarmBase: { value: 0.14 },
        uBrightness: { value: 0.1 },
      },
    });
    const points = new THREE.Points(geom, mat);
    points.frustumCulled = false;
    scene.add(points);

    fieldRef.current = {
      pos, seed, flash, alpha, speed, age, maxAge,
      gridCur, gridNext, morph: 0, phase: "hold", buildIdx: 0, holdT: 0,
      nextSeed: 0, nextScale: scale0, scale: scale0,
      pulses: [], geom, mat, points, warmBase: 0.14,
    };

    rafRef.current = requestAnimationFrame(loop);

    const onResize = () => {
      const r = rendererRef.current;
      const cam = cameraRef.current;
      if (!r || !cam) return;
      const ww = mount.clientWidth || window.innerWidth;
      const hh = mount.clientHeight || window.innerHeight;
      r.setSize(ww, hh, false);
      cam.aspect = ww / hh;
      cam.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(rafRef.current);
      geom.dispose();
      mat.dispose();
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch { /* noop */ }
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [loop]);

  // ── Play: audio must always work; the cloud is already breathing ──────────────
  const start = useCallback(async () => {
    if (phaseRef.current === "loading" || phaseRef.current === "running") return;
    if (!webglOk) return;
    setErrMsg("");
    setPhase("loading");

    let ctx: AudioContext;
    try {
      const AC = window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
      await ctx.resume();
    } catch {
      setErrMsg("Web Audio is unavailable in this browser — the piece cannot sound here.");
      setPhase("error");
      return;
    }

    let loaded;
    try {
      loaded = await loadRealTrackBuffer(ctx, trackId);
    } catch {
      setErrMsg("Karel's recording could not load — check the connection and press Play again.");
      void ctx.close();
      setPhase("error");
      return;
    }
    setTrackTitle(loaded.title);

    const master = createSafeMaster(ctx);

    // warm tail: convolution IR is a decayed slice of HIS OWN recording
    const sr = ctx.sampleRate;
    const irLen = Math.min(loaded.buffer.length, Math.floor(sr * 1.8));
    const ir = ctx.createBuffer(loaded.buffer.numberOfChannels, irLen, sr);
    const srcOff = Math.floor(loaded.buffer.length * 0.35);
    for (let ch = 0; ch < loaded.buffer.numberOfChannels; ch++) {
      const inData = loaded.buffer.getChannelData(ch);
      const out = ir.getChannelData(ch);
      for (let i = 0; i < irLen; i++) {
        const s = srcOff + i < inData.length ? inData[srcOff + i] : 0;
        out[i] = s * Math.exp((-i / irLen) * 4.2);
      }
    }
    const convolver = ctx.createConvolver();
    convolver.normalize = true;
    convolver.buffer = ir;

    const grainBus = ctx.createGain();
    grainBus.gain.setValueAtTime(0.0001, ctx.currentTime);
    grainBus.gain.setTargetAtTime(0.85, ctx.currentTime, 1.4); // slow bloom-in

    const toneCap = ctx.createBiquadFilter();
    toneCap.type = "lowpass";
    toneCap.frequency.value = 2400;
    toneCap.Q.value = 0.6;

    const dryGain = ctx.createGain();
    dryGain.gain.value = 0.82;
    const wetGain = ctx.createGain();
    wetGain.gain.value = 0.26;

    grainBus.connect(toneCap);
    toneCap.connect(dryGain);
    toneCap.connect(convolver);
    convolver.connect(wetGain);
    dryGain.connect(master.input);
    wetGain.connect(master.input);

    const eng: Engine = {
      ctx, master, buffer: loaded.buffer, grainBus, toneCap, dryGain, wetGain, convolver,
      grains: [], head: loaded.buffer.duration * 0.04, nextGrainAt: ctx.currentTime + 0.05,
      rate: 0.1, freq: new Uint8Array(master.analyser.frequencyBinCount), prevEnergy: 0, lastOnset: 0,
    };
    engineRef.current = eng;
    setPhase("running");
  }, [trackId, webglOk]);

  // ── camera opt-in (embodied path; pointer stays fully playable) ──────────────
  const enableCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamState("failed");
      return;
    }
    setCamState("requesting");
    setErrMsg("");
    try {
      const tracker = await createPoseTracker(1);
      trackerRef.current = tracker;
      const video = videoRef.current;
      if (!video) throw new Error("no video element");
      const stream = await startCamera(video);
      streamRef.current = stream;
      camWantRef.current = true;
      setCamState("live");
    } catch (e) {
      camWantRef.current = false;
      try { trackerRef.current?.close(); } catch { /* noop */ }
      trackerRef.current = null;
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
      const msg = e instanceof Error ? e.message : "";
      setCamState(/denied|Permission|NotAllowed/i.test(msg) ? "denied" : "failed");
    }
  }, []);

  // ── pointer control — the primary, always-playable path ──────────────────────
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (camStateRef.current === "live") return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const p = pointerRef.current;
    p.x = clamp01((e.clientX - r.left) / Math.max(1, r.width));
    p.y = clamp01((e.clientY - r.top) / Math.max(1, r.height));
    p.active = true;
  }, []);
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (camStateRef.current === "live") return;
    pointerRef.current.down = true;
    onPointerMove(e);
  }, [onPointerMove]);
  const onPointerUp = useCallback(() => {
    pointerRef.current.down = false;
  }, []);
  const onPointerLeave = useCallback(() => {
    pointerRef.current.down = false;
    pointerRef.current.active = false;
  }, []);

  // keyboard (a11y) — nudges the same single attractor
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA")) return;
      const p = pointerRef.current;
      let handled = false;
      if (e.key === "ArrowLeft") { p.x = clamp01(p.x - 0.03); handled = true; }
      else if (e.key === "ArrowRight") { p.x = clamp01(p.x + 0.03); handled = true; }
      else if (e.key === "ArrowUp") { p.y = clamp01(p.y - 0.03); handled = true; }
      else if (e.key === "ArrowDown") { p.y = clamp01(p.y + 0.03); handled = true; }
      else if (e.key === " " || e.key === "Spacebar") { p.down = !p.down; handled = true; }
      if (handled && camStateRef.current !== "live") {
        p.active = true;
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── full audio / camera teardown ──────────────────────────────────────────────
  useEffect(() => {
    return () => {
      const eng = engineRef.current;
      if (eng) {
        for (const gr of eng.grains) {
          try { gr.src.stop(); } catch { /* noop */ }
          try { gr.g.disconnect(); } catch { /* noop */ }
        }
        eng.grains = [];
        try { eng.grainBus.disconnect(); } catch { /* noop */ }
        try { eng.toneCap.disconnect(); } catch { /* noop */ }
        try { eng.dryGain.disconnect(); } catch { /* noop */ }
        try { eng.wetGain.disconnect(); } catch { /* noop */ }
        try { eng.convolver.disconnect(); } catch { /* noop */ }
        eng.master.disconnect();
        if (eng.ctx.state !== "closed") void eng.ctx.close();
      }
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      try { trackerRef.current?.close(); } catch { /* noop */ }
    };
  }, []);

  // ── derived UI ──────────────────────────────────────────────────────────────
  const running = phase === "running";
  const camLive = camState === "live" && bodySeen;
  const camLost = camState === "live" && !bodySeen;
  const camBad = camState === "denied" || camState === "failed";

  const statusText = camLive
    ? "tracking · live"
    : camLost
      ? "stand back, shoulders in frame — pointer still stirs"
      : driver === "pointer"
        ? "pointer · drag to stir"
        : running
          ? "still · the field is settling"
          : "pointer · drag to stir";

  const labelCls = "font-mono text-xs uppercase tracking-[0.18em]";
  const btnPrimary =
    "min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90";
  const btnGhost =
    "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

  return (
    <main className="fixed inset-0 h-dvh overflow-hidden bg-background text-foreground">
      <div
        ref={mountRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ cursor: camState === "live" ? "default" : "crosshair" }}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
      />

      {/* mirrored camera preview — small corner, only when live */}
      <video
        ref={videoRef}
        className="pointer-events-none absolute right-3 top-3 z-20 h-24 w-32 scale-x-[-1] rounded-md border border-border/40 object-cover opacity-70"
        style={{ display: camState === "live" ? "block" : "none" }}
        playsInline
        muted
      />

      {!webglOk && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base text-destructive">
            WebGL is unavailable on this device, so the ember field cannot render.
            Nothing was started.
          </p>
        </div>
      )}

      {/* tracking / fallback status — stays visible in immersive too */}
      {webglOk && (
        <div
          className={`pointer-events-none absolute left-4 top-4 z-30 ${labelCls} ${
            camLost ? "text-destructive" : camLive ? "text-primary" : "text-muted-foreground"
          }`}
        >
          {statusText}
        </div>
      )}

      {phase === "error" && (
        <div className="absolute left-4 top-12 z-30 max-w-xs text-sm text-destructive">
          {errMsg || "Could not start audio."} Press Play to retry.
        </div>
      )}
      {camBad && (
        <div className="absolute left-4 top-12 z-30 max-w-xs text-sm text-muted-foreground">
          {camState === "denied" ? "Camera denied" : "Camera unavailable"} — stir the
          field with the pointer (drag for turbulence) or the arrow keys instead.
        </div>
      )}

      {/* write-up chrome — hidden while immersive */}
      {!immersive && (
        <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 bg-gradient-to-t from-background/90 via-background/70 to-transparent p-4 sm:p-6">
          <div className="max-w-xl">
            <p className={`${labelCls} text-muted-foreground`}>
              Curl-noise ember garden · granular time-stretch · cosmic-ambient
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              Ember Field
            </h1>
            <p className="mt-1 text-base leading-relaxed text-muted-foreground">
              A warm room you stand inside — Karel&apos;s piano as a slow, breathing
              ember-cloud you stir with your whole body. Reach high to warm it toward
              gold, open your arms to raise turbulence, grow still and both the field
              and the music settle toward near-silence.
              {running && trackTitle && (
                <span className="text-muted-foreground/70"> Now playing: {trackTitle}.</span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!running ? (
              <button type="button" onClick={start} className={btnPrimary} disabled={phase === "loading" || !webglOk}>
                {phase === "loading" ? "Loading…" : "Play"}
              </button>
            ) : (
              <span className={`${labelCls} text-primary`}>live · {trackTitle}</span>
            )}

            {camState !== "live" ? (
              <button type="button" onClick={enableCamera} className={btnGhost} disabled={camState === "requesting" || !webglOk}>
                {camState === "requesting" ? "Starting camera…" : "Use camera (whole body)"}
              </button>
            ) : (
              <span className={`${labelCls} text-primary`}>camera · live</span>
            )}

            <label className={`${labelCls} flex items-center gap-2 text-muted-foreground`}>
              <span className="sr-only">Track</span>
              <select
                value={trackId}
                onChange={(e) => setTrackId(e.target.value)}
                disabled={running || phase === "loading"}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground disabled:opacity-50"
              >
                {REAL_TRACKS.map((tk) => (
                  <option key={tk.id} value={tk.id}>{tk.title}</option>
                ))}
              </select>
            </label>

            <ImmersiveHud immersive={immersive} onToggle={toggle} title="Ember Field" description={DESCRIPTION} howTo={HOW_TO} />
          </div>
        </div>
      )}

      {/* while immersive: only art + status + HUD, plus a minimal Play */}
      {immersive && !running && phase !== "loading" && webglOk && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <button type="button" onClick={start} className={btnPrimary}>Play</button>
        </div>
      )}
      {immersive && (
        <ImmersiveHud immersive={immersive} onToggle={toggle} title="Ember Field" description={DESCRIPTION} howTo={HOW_TO} />
      )}
    </main>
  );
}
