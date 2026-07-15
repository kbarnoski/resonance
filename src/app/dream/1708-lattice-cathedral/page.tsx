"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 1708-lattice-cathedral
// "What if the NDE / ketamine void were built from REAL 3-D architecture — a
//  receding cathedral-lattice of luminous wireframe girders and arches you fly
//  through — and each landmark structure SANG from its true 3-D position via
//  HRTF spatial audio?"
//
// This is NOT a raymarched SDF blob. It is genuine geometry: a nave of repeating
// arch/portal frames + continuous floor/ceiling rails marching toward a vanishing
// point, plus a handful of larger landmark structures (a great arch, a ring-
// portal, a saddle-vault, a girder pylon, a rose-gate). Vertices are generated
// deterministically; the camera view + perspective projection matrices are
// computed by hand and every vertex is transformed on the GPU, drawn as additive
// gl.LINES (soft point-glow at the joints faking bloom), distance-faded into
// black fog. Cold violet→neutral edge-glow on near-black.
//
// Each of the 5 landmark structures is a sounding BEACON: one PannerNode
// (panningModel="HRTF", distanceModel="inverse") positioned at that structure's
// real world coordinate relative to the moving listener, updated every frame so
// SIGHT AND SOUND READ THE IDENTICAL GEOMETRY — the arch you see on your right is
// heard on your right; flying through it sweeps front→back. Beacons route through
// a long convolution-void cavern reverb → compressor → master gain ~0.12.
//
// DETERMINISM: everything is driven by an integer frame counter — no Math.random,
// Date.now, new Date, or performance.now anywhere. A seeded LCG (mulberry32)
// places procedural jitter. On mount an automatic "ghost flight" (forward drift +
// Math.sin-of-frame yaw/pitch sweep) begins immediately, so the piece is never
// blank or silent without a user. Pointer-drag steers the gaze with inertia and
// auto-recenters on release. Any luminance pulse is gated through the shared
// safeFlicker engine (≤3 Hz, opt-in) — no strobe.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { createVoidReverb } from "../_shared/psych/convolutionVoid";
import { createSafeFlicker, prefersReducedMotion } from "../_shared/psych/safeFlicker";

// ── deterministic PRNG (seeded jitter only) ─────────────────────────────────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── nave constants (world units) ────────────────────────────────────────────
const SPACING = 7; // z-distance between portal bays
const BAYS = 34; // how many bays are drawn ahead (far ones fogged to black)
const EYE_Y = 0.4; // eye height above the nave mid-line
const FLOOR_Y = -2.6;
const SPRING_Y = 1.0; // where the arch springs from the legs
const HALF_W = 3.0; // half nave width

// ── 4×4 column-major matrix helpers ─────────────────────────────────────────
function perspective(fovy: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) * nf;
  m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}

function lookAt(
  ex: number, ey: number, ez: number,
  cx: number, cy: number, cz: number,
  ux: number, uy: number, uz: number,
): Float32Array {
  let zx = ex - cx, zy = ey - cy, zz = ez - cz;
  const zl = Math.hypot(zx, zy, zz) || 1;
  zx /= zl; zy /= zl; zz /= zl;
  // x = normalize(cross(up, z))
  let xx = uy * zz - uz * zy;
  let xy = uz * zx - ux * zz;
  let xz = ux * zy - uy * zx;
  const xl = Math.hypot(xx, xy, xz) || 1;
  xx /= xl; xy /= xl; xz /= xl;
  // y = cross(z, x)
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  const m = new Float32Array(16);
  m[0] = xx; m[1] = yx; m[2] = zx; m[3] = 0;
  m[4] = xy; m[5] = yy; m[6] = zy; m[7] = 0;
  m[8] = xz; m[9] = yz; m[10] = zz; m[11] = 0;
  m[12] = -(xx * ex + xy * ey + xz * ez);
  m[13] = -(yx * ex + yy * ey + yz * ez);
  m[14] = -(zx * ex + zy * ey + zz * ez);
  m[15] = 1;
  return m;
}

function multiply(a: Float32Array, b: Float32Array): Float32Array {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

// ── geometry builders — each returns a flat xyz array of gl.LINES vertex pairs
function seg(a: number[], x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
  a.push(x0, y0, z0, x1, y1, z1);
}

/** One nave bay: an arch/portal frame plus rails + floor lattice reaching to the
 *  next bay (local z 0 → SPACING) so consecutive bays form continuous receding
 *  lines toward the vanishing point. */
function buildBay(): Float32Array {
  const a: number[] = [];
  const hw = HALF_W, fy = FLOOR_Y, sy = SPRING_Y, sp = SPACING;
  const peak = sy + hw; // semicircular arch peak
  // vertical legs
  seg(a, -hw, fy, 0, -hw, sy, 0);
  seg(a, hw, fy, 0, hw, sy, 0);
  // semicircular arch (left → over → right)
  const N = 20;
  for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N;
    const x0 = -hw * Math.cos(Math.PI * t0), y0 = sy + hw * Math.sin(Math.PI * t0);
    const x1 = -hw * Math.cos(Math.PI * t1), y1 = sy + hw * Math.sin(Math.PI * t1);
    seg(a, x0, y0, 0, x1, y1, 0);
  }
  // floor sill across the base
  seg(a, -hw, fy, 0, hw, fy, 0);
  // continuous rails to the next bay (the vanishing-point lines)
  seg(a, -hw, fy, 0, -hw, fy, sp); // floor left
  seg(a, hw, fy, 0, hw, fy, sp); // floor right
  seg(a, -hw, sy, 0, -hw, sy, sp); // springer left
  seg(a, hw, sy, 0, hw, sy, sp); // springer right
  seg(a, 0, peak, 0, 0, peak, sp); // ridge line along the peak
  // floor lattice X (girder cross-brace) — reads as built structure
  seg(a, -hw, fy, 0, hw, fy, sp);
  seg(a, hw, fy, 0, -hw, fy, sp);
  return new Float32Array(a);
}

/** Great arch: a larger double-ring portal you fly through. */
function buildGreatArch(): Float32Array {
  const a: number[] = [];
  const hw = 5.2, fy = -3.4, sy = 1.4;
  const N = 30;
  for (const scale of [1, 0.72]) {
    const w = hw * scale;
    seg(a, -w, fy, 0, -w, sy, 0);
    seg(a, w, fy, 0, w, sy, 0);
    for (let i = 0; i < N; i++) {
      const t0 = i / N, t1 = (i + 1) / N;
      const x0 = -w * Math.cos(Math.PI * t0), y0 = sy + w * Math.sin(Math.PI * t0);
      const x1 = -w * Math.cos(Math.PI * t1), y1 = sy + w * Math.sin(Math.PI * t1);
      seg(a, x0, y0, 0, x1, y1, 0);
    }
  }
  // radial ribs between outer and inner arch
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const ang = Math.PI * t;
    const ox = -hw * Math.cos(ang), oy = sy + hw * Math.sin(ang);
    const ix = -hw * 0.72 * Math.cos(ang), iy = sy + hw * 0.72 * Math.sin(ang);
    seg(a, ox, oy, 0, ix, iy, 0);
  }
  seg(a, -hw, fy, 0, hw, fy, 0);
  return new Float32Array(a);
}

/** Ring-portal: concentric rings in the x-y plane with spokes. */
function buildRing(): Float32Array {
  const a: number[] = [];
  const N = 44;
  for (const R of [3.0, 1.9]) {
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
      seg(a, R * Math.cos(a0), R * Math.sin(a0), 0, R * Math.cos(a1), R * Math.sin(a1), 0);
    }
  }
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    seg(a, 1.9 * Math.cos(ang), 1.9 * Math.sin(ang), 0, 3.0 * Math.cos(ang), 3.0 * Math.sin(ang), 0);
  }
  return new Float32Array(a);
}

/** Saddle-vault: hyperbolic-paraboloid roof wireframe (u-lines + v-lines). */
function buildSaddle(): Float32Array {
  const a: number[] = [];
  const S = 3.4, k = 0.9, G = 8;
  const h = (u: number, v: number) => (u * u - v * v) * k * S;
  for (let iv = 0; iv <= G; iv++) {
    const v = (iv / G) * 2 - 1;
    for (let iu = 0; iu < G; iu++) {
      const u0 = (iu / G) * 2 - 1, u1 = ((iu + 1) / G) * 2 - 1;
      seg(a, u0 * S, h(u0, v), v * S, u1 * S, h(u1, v), v * S);
    }
  }
  for (let iu = 0; iu <= G; iu++) {
    const u = (iu / G) * 2 - 1;
    for (let iv = 0; iv < G; iv++) {
      const v0 = (iv / G) * 2 - 1, v1 = ((iv + 1) / G) * 2 - 1;
      seg(a, u * S, h(u, v0), v0 * S, u * S, h(u, v1), v1 * S);
    }
  }
  return new Float32Array(a);
}

/** Girder pylon: square-section lattice tower with rungs and X-diagonals. */
function buildPylon(): Float32Array {
  const a: number[] = [];
  const r = 1.3, y0 = -3.2, y1 = 4.0, rungs = 6;
  const corners = [
    [-r, -r], [r, -r], [r, r], [-r, r],
  ];
  // verticals
  for (const [cx, cz] of corners) seg(a, cx, y0, cz, cx, y1, cz);
  for (let i = 0; i <= rungs; i++) {
    const y = y0 + ((y1 - y0) * i) / rungs;
    // square rung
    for (let c = 0; c < 4; c++) {
      const [ax, az] = corners[c];
      const [bx, bz] = corners[(c + 1) % 4];
      seg(a, ax, y, az, bx, y, bz);
    }
    // X-diagonals on the front face for each segment
    if (i < rungs) {
      const yn = y0 + ((y1 - y0) * (i + 1)) / rungs;
      seg(a, -r, y, -r, r, yn, -r);
      seg(a, r, y, -r, -r, yn, -r);
    }
  }
  return new Float32Array(a);
}

/** Rose-gate: concentric rotated squares + radial spokes (a rose-window gate). */
function buildRoseGate(): Float32Array {
  const a: number[] = [];
  const radii = [3.2, 2.3, 1.4];
  radii.forEach((R, idx) => {
    const rot = (idx * Math.PI) / 6;
    const pts: number[][] = [];
    for (let i = 0; i < 4; i++) {
      const ang = rot + (i / 4) * Math.PI * 2 + Math.PI / 4;
      pts.push([R * Math.cos(ang), R * Math.sin(ang)]);
    }
    for (let i = 0; i < 4; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[(i + 1) % 4];
      seg(a, ax, ay, 0, bx, by, 0);
    }
  });
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2;
    seg(a, 0, 0, 0, 3.2 * Math.cos(ang), 3.2 * Math.sin(ang), 0);
  }
  return new Float32Array(a);
}

// ── landmark beacon configuration ───────────────────────────────────────────
// Each landmark is BOTH a drawn structure and a sounding HRTF beacon. x/y are its
// fixed offset from the nave axis; the z-position recycles endlessly as the
// camera advances so the same 5 structures keep re-appearing down the nave.
type BeaconKind = "arch" | "ring" | "saddle" | "pylon" | "rose";
interface BeaconCfg {
  kind: BeaconKind;
  x: number;
  y: number;
  scale: number;
  period: number; // z-recycle period
  phase: number; // z-offset within the period
  freq: number; // fundamental (Hz) — inharmonic set
  tint: [number, number, number]; // cold violet-neutral
}
const BEACONS: BeaconCfg[] = [
  { kind: "arch", x: 0, y: 0, scale: 1, period: 52, phase: 22, freq: 58.27, tint: [0.70, 0.62, 1.0] },
  { kind: "ring", x: 7.5, y: 1.6, scale: 1, period: 61, phase: 9, freq: 77.78, tint: [0.52, 0.58, 1.0] },
  { kind: "saddle", x: -7.5, y: 3.0, scale: 1, period: 47, phase: 34, freq: 92.5, tint: [0.64, 0.50, 0.96] },
  { kind: "pylon", x: 10.5, y: -0.6, scale: 1, period: 67, phase: 51, freq: 116.54, tint: [0.58, 0.55, 0.98] },
  { kind: "rose", x: -10.5, y: 3.6, scale: 1, period: 43, phase: 3, freq: 138.59, tint: [0.66, 0.60, 1.0] },
];

// Map a beacon's fixed phase to the nearest instance z at/near the camera. The
// instance may trail slightly behind (BEHIND_FRAC) before recycling far ahead,
// so the fly-through sweeps front→back and recycles only where distance-gain is
// already low (minimal audible pop).
const BEHIND_FRAC = 0.18;
function beaconZ(cfg: BeaconCfg, camZ: number): number {
  const P = cfg.period;
  const rel = cfg.phase - camZ;
  let m = ((rel % P) + P) % P; // 0..P
  if (m > P * (1 - BEHIND_FRAC)) m -= P; // allow trailing behind
  return camZ + m;
}

// ── GL program ──────────────────────────────────────────────────────────────
const VERT = `#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform vec3 uOffset;
uniform vec3 uScale;
uniform vec3 uColor;
uniform float uBright;
uniform float uDensity;
uniform float uFlick;
uniform float uPointBase;
out float vFog;
out vec3 vCol;
void main(){
  vec3 world = aPos * uScale + uOffset;
  vec4 clip = uViewProj * vec4(world, 1.0);
  gl_Position = clip;
  float depth = max(clip.w, 0.001);
  vFog = clamp(exp(-depth * uDensity), 0.0, 1.0);
  gl_PointSize = clamp(uPointBase / depth, 0.0, 24.0);
  // violet→neutral: distant edges drift toward a cool neutral before fading out
  vec3 neutral = vec3(0.72, 0.74, 0.82);
  vec3 tint = mix(uColor, neutral, clamp(depth * 0.010, 0.0, 0.6));
  vCol = tint * uBright * uFlick;
}`;

const FRAG = `#version 300 es
precision highp float;
in float vFog;
in vec3 vCol;
uniform int uMode; // 0 = lines, 1 = point-glow
out vec4 frag;
void main(){
  float a = 1.0;
  if (uMode == 1) {
    vec2 d = gl_PointCoord - 0.5;
    a = smoothstep(0.5, 0.0, length(d)) * 0.55; // soft joint bloom
  }
  frag = vec4(vCol * vFog * a, a * vFog);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader alloc");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile: " + log);
  }
  return sh;
}
function link(gl: WebGL2RenderingContext): WebGLProgram {
  const v = compile(gl, gl.VERTEX_SHADER, VERT);
  const f = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  const p = gl.createProgram();
  if (!p) throw new Error("program alloc");
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error("program link: " + log);
  }
  return p;
}

// ── audio: one HRTF beacon per landmark, → void reverb → comp → master ──────
interface BeaconVoice {
  cfg: BeaconCfg;
  panner: PannerNode;
}
class Cathedral {
  ctx: AudioContext;
  master: GainNode;
  comp: DynamicsCompressorNode;
  reverb: ReturnType<typeof createVoidReverb>;
  voices: BeaconVoice[] = [];
  private oscs: OscillatorNode[] = [];

  constructor() {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.12; // ≤ ~0.12 master
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 20;
    this.comp.ratio.value = 3;
    this.comp.attack.value = 0.01;
    this.comp.release.value = 0.3;
    this.reverb = createVoidReverb(this.ctx, { seconds: 6.5, decay: 2.2, wet: 0.82 });
    this.reverb.output.connect(this.comp);
    this.comp.connect(this.master);
    this.master.connect(this.ctx.destination);

    for (const cfg of BEACONS) {
      const panner = this.ctx.createPanner();
      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
      panner.refDistance = 4;
      panner.rolloffFactor = 1.8;
      panner.maxDistance = 80;
      panner.connect(this.reverb.input);

      const voiceGain = this.ctx.createGain();
      voiceGain.gain.value = 0.34;
      voiceGain.connect(panner);

      // two slightly detuned oscillators — a soft sustained pad
      const oscA = this.ctx.createOscillator();
      oscA.type = "sine";
      oscA.frequency.value = cfg.freq;
      const oscB = this.ctx.createOscillator();
      oscB.type = "triangle";
      oscB.frequency.value = cfg.freq * 1.006; // gentle detune / inharmonicity
      const bGain = this.ctx.createGain();
      bGain.gain.value = 0.5;
      oscA.connect(voiceGain);
      oscB.connect(bGain);
      bGain.connect(voiceGain);

      // slow breathing LFO on the voice gain (deterministic on the audio clock)
      const lfo = this.ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.04 + cfg.freq * 0.0006;
      const lfoDepth = this.ctx.createGain();
      lfoDepth.gain.value = 0.14;
      lfo.connect(lfoDepth);
      lfoDepth.connect(voiceGain.gain);

      oscA.start();
      oscB.start();
      lfo.start();
      this.oscs.push(oscA, oscB, lfo);
      this.voices.push({ cfg, panner });
    }
  }

  async resume() {
    if (this.ctx.state !== "running") {
      try {
        await this.ctx.resume();
      } catch {
        /* needs another gesture */
      }
    }
  }

  // Set the listener from the camera, and each beacon panner to its true world
  // position — sight and sound read the identical geometry.
  updateSpatial(
    ex: number, ey: number, ez: number,
    fx: number, fy: number, fz: number,
    ux: number, uy: number, uz: number,
    camZ: number,
  ) {
    const t = this.ctx.currentTime;
    const L = this.ctx.listener as unknown as {
      positionX?: AudioParam; positionY?: AudioParam; positionZ?: AudioParam;
      forwardX?: AudioParam; forwardY?: AudioParam; forwardZ?: AudioParam;
      upX?: AudioParam; upY?: AudioParam; upZ?: AudioParam;
      setPosition?: (x: number, y: number, z: number) => void;
      setOrientation?: (fx: number, fy: number, fz: number, ux: number, uy: number, uz: number) => void;
    };
    if (L.positionX) {
      L.positionX.setTargetAtTime(ex, t, 0.03);
      L.positionY!.setTargetAtTime(ey, t, 0.03);
      L.positionZ!.setTargetAtTime(ez, t, 0.03);
      L.forwardX!.setTargetAtTime(fx, t, 0.03);
      L.forwardY!.setTargetAtTime(fy, t, 0.03);
      L.forwardZ!.setTargetAtTime(fz, t, 0.03);
      L.upX!.setTargetAtTime(ux, t, 0.03);
      L.upY!.setTargetAtTime(uy, t, 0.03);
      L.upZ!.setTargetAtTime(uz, t, 0.03);
    } else {
      L.setPosition?.(ex, ey, ez);
      L.setOrientation?.(fx, fy, fz, ux, uy, uz);
    }
    for (const v of this.voices) {
      const bz = beaconZ(v.cfg, camZ);
      const p = v.panner as unknown as {
        positionX?: AudioParam; positionY?: AudioParam; positionZ?: AudioParam;
        setPosition?: (x: number, y: number, z: number) => void;
      };
      if (p.positionX) {
        p.positionX.setTargetAtTime(v.cfg.x, t, 0.05);
        p.positionY!.setTargetAtTime(v.cfg.y, t, 0.05);
        p.positionZ!.setTargetAtTime(bz, t, 0.05);
      } else {
        p.setPosition?.(v.cfg.x, v.cfg.y, bz);
      }
    }
  }

  dispose() {
    for (const o of this.oscs) {
      try { o.stop(); } catch { /* already stopped */ }
      o.disconnect();
    }
    for (const v of this.voices) v.panner.disconnect();
    this.reverb.input.disconnect();
    this.reverb.output.disconnect();
    this.comp.disconnect();
    this.master.disconnect();
    if (this.ctx.state !== "closed") this.ctx.close().catch(() => {});
  }
}

type Status = "pending" | "ok" | "nowebgl";

export default function LatticeCathedralPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<Status>("pending");
  const [running, setRunning] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [mode, setMode] = useState<"ghost" | "steering">("ghost");

  const audioRef = useRef<Cathedral | null>(null);
  const runningRef = useRef(false);
  const rafRef = useRef(0);

  // interaction state
  const dragRef = useRef(false);
  const lastPtrRef = useRef({ x: 0, y: 0 });
  const userYawRef = useRef(0);
  const userPitchRef = useRef(0);

  const flickRef = useRef(createSafeFlicker({ maxHz: 2.4, defaultHz: 0.7, floor: 0.72 }));
  const pulseRef = useRef(false);

  const startAudio = useCallback(async () => {
    if (!audioRef.current) audioRef.current = new Cathedral();
    await audioRef.current.resume();
    runningRef.current = true;
    setRunning(true);
  }, []);

  const togglePulse = useCallback(() => {
    const next = !pulseRef.current;
    pulseRef.current = next;
    if (next) flickRef.current.enable();
    else flickRef.current.disable();
    setPulse(next);
  }, []);

  const onDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = true;
    lastPtrRef.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
    if (!runningRef.current) void startAudio();
  }, [startAudio]);

  const onMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - lastPtrRef.current.x;
    const dy = e.clientY - lastPtrRef.current.y;
    lastPtrRef.current = { x: e.clientX, y: e.clientY };
    userYawRef.current += dx * 0.0032; // drag right → look right
    userPitchRef.current = Math.max(-1.05, Math.min(1.05, userPitchRef.current - dy * 0.0032));
  }, []);

  const onUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
  }, []);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const gl = cv.getContext("webgl2", { alpha: false, antialias: true, premultipliedAlpha: false });
    if (!gl) {
      setStatus("nowebgl");
      return;
    }
    let prog: WebGLProgram;
    try {
      prog = link(gl);
    } catch {
      setStatus("nowebgl");
      return;
    }
    setStatus("ok");

    const uViewProj = gl.getUniformLocation(prog, "uViewProj");
    const uOffset = gl.getUniformLocation(prog, "uOffset");
    const uScale = gl.getUniformLocation(prog, "uScale");
    const uColor = gl.getUniformLocation(prog, "uColor");
    const uBright = gl.getUniformLocation(prog, "uBright");
    const uDensity = gl.getUniformLocation(prog, "uDensity");
    const uFlick = gl.getUniformLocation(prog, "uFlick");
    const uPointBase = gl.getUniformLocation(prog, "uPointBase");
    const uMode = gl.getUniformLocation(prog, "uMode");
    const aPos = gl.getAttribLocation(prog, "aPos");

    // build all vertex buffers once
    const makeMesh = (data: Float32Array) => {
      const buf = gl.createBuffer()!;
      const vao = gl.createVertexArray()!;
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
      return { buf, vao, count: data.length / 3 };
    };
    const bayMesh = makeMesh(buildBay());
    const beaconMeshes: Record<BeaconKind, ReturnType<typeof makeMesh>> = {
      arch: makeMesh(buildGreatArch()),
      ring: makeMesh(buildRing()),
      saddle: makeMesh(buildSaddle()),
      pylon: makeMesh(buildPylon()),
      rose: makeMesh(buildRoseGate()),
    };

    // seeded jitter: give each nave bay a faint deterministic sway phase
    const rng = mulberry32(0x1708c47);
    const swayPhase = new Float32Array(BAYS + 4);
    for (let i = 0; i < swayPhase.length; i++) swayPhase[i] = rng() * Math.PI * 2;

    const reduced = prefersReducedMotion();
    const sweepScale = reduced ? 0.18 : 1;
    const speed = reduced ? 0.035 : 0.055; // forward drift per frame

    // smoothed camera orientation
    let yaw = 0, pitch = 0;
    let camZ = 0;
    let frame = 0;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.floor(cv.clientWidth * dpr);
      const h = Math.floor(cv.clientHeight * dpr);
      if (w > 0 && h > 0 && (cv.width !== w || cv.height !== h)) {
        cv.width = w;
        cv.height = h;
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const bayCol: [number, number, number] = [0.55, 0.42, 1.0];

    const drawMesh = (
      mesh: { vao: WebGLVertexArrayObject; count: number },
      ox: number, oy: number, oz: number,
      sx: number, sy: number, sz: number,
      col: [number, number, number], bright: number,
    ) => {
      gl.uniform3f(uOffset, ox, oy, oz);
      gl.uniform3f(uScale, sx, sy, sz);
      gl.uniform3f(uColor, col[0], col[1], col[2]);
      gl.uniform1f(uBright, bright);
      gl.bindVertexArray(mesh.vao);
      gl.uniform1i(uMode, 0);
      gl.drawArrays(gl.LINES, 0, mesh.count);
      gl.uniform1i(uMode, 1);
      gl.drawArrays(gl.POINTS, 0, mesh.count);
      gl.bindVertexArray(null);
    };

    const tick = () => {
      frame++;
      camZ += speed;

      // ── ghost flight sweep (deterministic) + user steer with inertia ──
      const gYaw =
        (0.32 * Math.sin(frame * 0.0033) + 0.11 * Math.sin(frame * 0.0072 + 1.3)) * sweepScale;
      const gPitch = (0.13 * Math.sin(frame * 0.0025 + 0.6)) * sweepScale;
      if (!dragRef.current) {
        // auto re-center: user offset decays back toward the ghost sweep
        userYawRef.current *= 0.96;
        userPitchRef.current *= 0.96;
      }
      const tgtYaw = gYaw + userYawRef.current;
      const tgtPitch = Math.max(-1.1, Math.min(1.1, gPitch + userPitchRef.current));
      yaw += (tgtYaw - yaw) * 0.06;
      pitch += (tgtPitch - pitch) * 0.06;

      // camera basis
      const cp = Math.cos(pitch), sp = Math.sin(pitch);
      const fx = Math.sin(yaw) * cp, fy = sp, fz = Math.cos(yaw) * cp;
      const ex = 0, ey = EYE_Y, ez = camZ;

      const aspect = cv.width / Math.max(1, cv.height);
      const proj = perspective(1.15, aspect, 0.1, 400);
      const view = lookAt(ex, ey, ez, ex + fx, ey + fy, ez + fz, 0, 1, 0);
      const vp = multiply(proj, view);

      // ── luminance drift (opt-in, ≤3 Hz, gated through safeFlicker) ──
      const flick = flickRef.current.value(frame / 60);

      // ── render ──
      gl.viewport(0, 0, cv.width, cv.height);
      gl.clearColor(0.008, 0.008, 0.018, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // additive
      gl.useProgram(prog);
      gl.uniformMatrix4fv(uViewProj, false, vp);
      gl.uniform1f(uDensity, 0.014);
      gl.uniform1f(uFlick, flick);
      gl.uniform1f(uPointBase, 9 * dpr);

      // nave bays from just behind the camera out to the fog
      const startK = Math.floor((camZ - SPACING) / SPACING);
      for (let i = 0; i < BAYS; i++) {
        const k = startK + i;
        const bz = k * SPACING;
        const sway = 0.05 * Math.sin(frame * 0.01 + swayPhase[i % swayPhase.length]) * sweepScale;
        drawMesh(bayMesh, sway, 0, bz, 1, 1, 1, bayCol, 0.9);
      }

      // landmark beacons (also the sounding structures)
      for (const cfg of BEACONS) {
        const bz = beaconZ(cfg, camZ);
        drawMesh(
          beaconMeshes[cfg.kind],
          cfg.x, cfg.y, bz,
          cfg.scale, cfg.scale, cfg.scale,
          cfg.tint, 1.1,
        );
      }

      // ── spatial audio: listener + panners from the SAME camera/world ──
      if (runningRef.current && audioRef.current) {
        audioRef.current.updateSpatial(ex, ey, ez, fx, fy, fz, 0, 1, 0, camZ);
      }

      // low-rate UI
      if (frame % 12 === 0) setMode(dragRef.current ? "steering" : "ghost");

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      gl.deleteBuffer(bayMesh.buf);
      gl.deleteVertexArray(bayMesh.vao);
      for (const m of Object.values(beaconMeshes)) {
        gl.deleteBuffer(m.buf);
        gl.deleteVertexArray(m.vao);
      }
      gl.deleteProgram(prog);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      audioRef.current?.dispose();
      audioRef.current = null;
      runningRef.current = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-black text-foreground">
      <div className="mx-auto max-w-3xl px-5 py-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Lattice Cathedral
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          A receding cathedral-lattice of luminous wireframe arches and girders,
          flown endlessly toward a vanishing point. Five landmark structures each
          sing from their true 3-D position — the arch on your right is heard on
          your right, and flying through it sweeps front to back.
        </p>

        {status === "nowebgl" ? (
          <p className="mt-6 text-base text-destructive">
            This piece needs WebGL2, which this browser or device does not provide.
            Audio can still start below, but the flown lattice will not render — try
            a recent desktop Chrome, Firefox, or Safari.
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={startAudio}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {running ? "Sounding" : "Enter the cathedral"}
          </button>
          <button
            type="button"
            onClick={togglePulse}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {pulse ? "Luminance drift: on" : "Luminance drift: off"}
          </button>
          <span className="font-mono text-xs text-muted-foreground">
            {mode === "steering" ? "STEERING" : "GHOST FLIGHT"} · drag to steer
          </span>
        </div>

        <p className="mt-3 text-sm text-muted-foreground">🎧 Best with headphones — the HRTF beacons deepen dramatically, but stereo speakers still carry the left/right and distance movement.</p>

        <div className="relative mt-4 overflow-hidden rounded-lg border border-border bg-black">
          <canvas
            ref={canvasRef}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            className="block aspect-[16/10] w-full touch-none cursor-grab active:cursor-grabbing"
          />
          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="absolute right-3 top-3 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
        </div>

        <p className="mt-3 text-base text-muted-foreground">
          Drag to swing your gaze (yaw &amp; pitch, smoothed inertia); release and
          it re-centers on its own. A slow forward drift always carries you deeper.
          Left untouched, a ghost flight sweeps and drifts on its own.
        </p>
      </div>

      {showNotes ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Design notes</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                The void here is <span className="text-foreground">real architecture</span>, not a
                raymarched blob. A nave of semicircular portal arches plus continuous floor,
                springer and ridge rails is generated as actual 3-D vertices; hand-built view and
                perspective matrices transform every vertex on the GPU, drawn as additive
                <span className="text-foreground"> gl.LINES</span> with a soft point-glow at the
                joints faking bloom. Distance fogs edges from violet toward cool neutral, then into
                black — the cue that reads as receding toward a vanishing point.
              </p>
              <p>
                Five landmark structures — a great arch, a ring-portal, a saddle-vault, a girder
                pylon and a rose-gate — are each a sounding <span className="text-foreground">beacon</span>:
                one <span className="text-foreground">HRTF PannerNode</span> (inverse distance) placed
                at the structure&apos;s true world coordinate relative to the moving listener, updated
                every frame from the very same camera the visuals use. Sight and sound therefore read
                identical geometry. Beacons are soft, inharmonic sustained pads routed through a long
                convolution-void cavern reverb, a compressor, and a master gain of ~0.12.
              </p>
              <p>
                Fully deterministic: an integer frame counter drives the forward drift and a
                sine-of-frame ghost sweep, so it is never blank or silent without a user. Any
                luminance drift is opt-in and gated below 3&nbsp;Hz — no strobe.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

      <PrototypeNav slugs={["1708-lattice-cathedral"]} />
    </main>
  );
}
