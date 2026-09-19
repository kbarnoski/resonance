"use client";

// ── MIRRORFOLD ────────────────────────────────────────────────────────────────
// "What if TWO people in front of ONE webcam share one of Karel's recordings, and
//  their MIRROR-SYMMETRY is the instrument — when they move as each other's mirror
//  image the take plays as one unified voice, and when they break symmetry it
//  splits into a two-voice CANON distributed across their two bodies?"
//
// INPUT  : ONE webcam, TWO tracked bodies (MediaPipe Pose, numPoses=2), sorted
//          left→right so "person A" and "person B" stay stable.
// OUTPUT : three.js additive line-figures + points — two glowing bodies (A deep
//          indigo-violet, B pale lilac) and a central BRAID that fuses to amethyst
//          at mirror-lock and tears into two streams at canon-split.
// CORE   : ONE looping buffer of Karel's real take feeds TWO AudioBufferSources.
//          Voice A → panner A. Voice B → delay → panner B. Their MIRROR-SYNCHRONY
//          collapses the pan+delay to a single central unison, or opens them into
//          a live round spread across the two bodies. Their vertical gap sets the
//          canon's delay; their shared conducting motion sets the intensity.
// SAFETY : every audio path terminates in createSafeMaster().input.

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  createPoseTracker,
  startCamera,
  POSE_LM,
  type PoseLandmarkerInst,
  type Landmark,
} from "../_shared/cameraTracking";
import { loadRealTrackBuffer, REAL_TRACKS } from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { useImmersive, ImmersiveToggle } from "../_shared/immersive";

// A solo take from Karel's verified catalog (Welcome Home — "Interplay").
const DEFAULT_TRACK_ID = REAL_TRACKS[0].id;

// ── Palette (art layer only — raw color allowed here) ──────────────────────────
const COL_A = 0x5a3cc4; // person A — deep indigo-violet
const COL_A_PT = 0x8a6bff;
const COL_B = 0xc9b8ff; // person B — pale lilac
const COL_B_PT = 0xe6dcff;
const COL_BRAID = 0x9a6bff; // shared amethyst at mirror-lock
const STAGE_BG = 0x0a0910;

// ── Pose model ────────────────────────────────────────────────────────────────
type Pt = { x: number; y: number; z: number; v: number };
interface PoseFeat {
  armSpan: number; // 0 (in) … 1 (wide)
  leftH: number; // left wrist height 0 (down) … 1 (up)
  rightH: number; // right wrist height 0 … 1
  lean: number; // torso lean, -1 … 1
  presence: number; // nearness 0 … 1
  cx: number; // shoulder-mid x (mirrored 0..1) — used to sort A/B
  cy: number; // shoulder-mid y 0..1
}
interface PoseData {
  pts: Record<number, Pt>;
  feat: PoseFeat;
}

const USED_LM = [
  POSE_LM.nose,
  POSE_LM.leftShoulder,
  POSE_LM.rightShoulder,
  POSE_LM.leftElbow,
  POSE_LM.rightElbow,
  POSE_LM.leftWrist,
  POSE_LM.rightWrist,
  POSE_LM.leftHip,
  POSE_LM.rightHip,
] as const;

const BONES: ReadonlyArray<readonly [number, number]> = [
  [POSE_LM.leftShoulder, POSE_LM.rightShoulder],
  [POSE_LM.leftShoulder, POSE_LM.leftElbow],
  [POSE_LM.leftElbow, POSE_LM.leftWrist],
  [POSE_LM.rightShoulder, POSE_LM.rightElbow],
  [POSE_LM.rightElbow, POSE_LM.rightWrist],
  [POSE_LM.leftShoulder, POSE_LM.leftHip],
  [POSE_LM.rightShoulder, POSE_LM.rightHip],
  [POSE_LM.leftHip, POSE_LM.rightHip],
  [POSE_LM.nose, POSE_LM.leftShoulder],
  [POSE_LM.nose, POSE_LM.rightShoulder],
];

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function clampS(v: number): number {
  return v < -1 ? -1 : v > 1 ? 1 : v;
}

function computeFeat(pts: Record<number, Pt>): PoseFeat {
  const lw = pts[POSE_LM.leftWrist];
  const rw = pts[POSE_LM.rightWrist];
  const ls = pts[POSE_LM.leftShoulder];
  const rs = pts[POSE_LM.rightShoulder];
  const lh = pts[POSE_LM.leftHip];
  const rh = pts[POSE_LM.rightHip];
  const armSpan = clamp01(Math.hypot(lw.x - rw.x, lw.y - rw.y) / 0.72);
  const leftH = clamp01((0.85 - lw.y) / 0.7);
  const rightH = clamp01((0.85 - rw.y) / 0.7);
  const cx = (ls.x + rs.x) / 2;
  const cy = (ls.y + rs.y) / 2;
  const hipMidX = (lh.x + rh.x) / 2;
  const lean = clampS((cx - hipMidX) * 3.2);
  const sw = Math.abs(ls.x - rs.x);
  const presence = clamp01((sw - 0.12) / 0.26);
  return { armSpan, leftH, rightH, lean, presence, cx, cy };
}

// Live landmarks → mirrored PoseData, or null when the core body isn't visible.
// Gate ONLY on shoulders (≥0.3 visibility) so a waist-up desk framing works;
// hips are synthesized below the shoulders when out of frame (per bodycast).
function readPose(lms: Landmark[]): PoseData | null {
  if (!lms || lms.length <= POSE_LM.rightHip) return null;
  for (const i of [POSE_LM.leftShoulder, POSE_LM.rightShoulder]) {
    if ((lms[i]?.visibility ?? 0) < 0.3) return null;
  }
  const pts: Record<number, Pt> = {};
  for (const i of USED_LM) {
    const l = lms[i];
    pts[i] = { x: 1 - l.x, y: l.y, z: l.z ?? 0, v: l.visibility ?? 1 };
  }
  const hipDrop =
    Math.abs(pts[POSE_LM.leftShoulder].x - pts[POSE_LM.rightShoulder].x) * 1.4 + 0.18;
  for (const [hip, shoulder] of [
    [POSE_LM.leftHip, POSE_LM.leftShoulder],
    [POSE_LM.rightHip, POSE_LM.rightShoulder],
  ] as const) {
    if ((lms[hip]?.visibility ?? 0) < 0.3) {
      pts[hip] = {
        x: pts[shoulder].x,
        y: pts[shoulder].y + hipDrop,
        z: pts[shoulder].z,
        v: 0,
      };
    }
  }
  return { pts, feat: computeFeat(pts) };
}

// Build a synthetic waist-up pose (for the ghost demo + fallback figures).
function buildPose(
  centerX: number,
  spread: number,
  liftL: number,
  liftR: number,
  lean: number,
): PoseData {
  const shY = 0.42;
  const hipY = 0.72;
  const cx = centerX + lean;
  const mk = (x: number, y: number): Pt => ({ x, y, z: 0, v: 1 });
  const lwX = cx - 0.13 - spread;
  const rwX = cx + 0.13 + spread;
  const pts: Record<number, Pt> = {
    [POSE_LM.nose]: mk(cx, shY - 0.14),
    [POSE_LM.leftShoulder]: mk(cx - 0.1, shY),
    [POSE_LM.rightShoulder]: mk(cx + 0.1, shY),
    [POSE_LM.leftElbow]: mk((cx - 0.1 + lwX) / 2 - 0.02, shY + 0.12),
    [POSE_LM.rightElbow]: mk((cx + 0.1 + rwX) / 2 + 0.02, shY + 0.12),
    [POSE_LM.leftWrist]: mk(lwX, shY + 0.24 - liftL * 0.34),
    [POSE_LM.rightWrist]: mk(rwX, shY + 0.24 - liftR * 0.34),
    [POSE_LM.leftHip]: mk(centerX - 0.08, hipY),
    [POSE_LM.rightHip]: mk(centerX + 0.08, hipY),
  };
  return { pts, feat: computeFeat(pts) };
}

// Two autonomous ghost bodies — B mostly MIRRORS A, drifting in and out of
// symmetry so the mirror→canon behaviour is visibly alive before anyone steps in.
function makeDemoPair(t: number): { a: PoseData; b: PoseData } {
  const mirrorAmt = 0.5 + 0.5 * Math.sin(t * 0.09); // 0 (broken) … 1 (mirrored)
  const spreadA = 0.14 + 0.13 * (0.5 + 0.5 * Math.sin(t * 0.3));
  const liftLA = 0.5 + 0.4 * Math.sin(t * 0.22);
  const liftRA = 0.5 + 0.4 * Math.sin(t * 0.22 + 1.9);
  const leanA = 0.05 * Math.sin(t * 0.15);
  const a = buildPose(0.28, spreadA, liftLA, liftRA, leanA);

  // Mirrored target for B: swap L/R lifts, mirror the lean.
  const spreadBm = spreadA;
  const liftLBm = liftRA;
  const liftRBm = liftLA;
  const leanBm = -leanA;
  // Independent (broken-symmetry) motion for B.
  const spreadBi = 0.14 + 0.13 * (0.5 + 0.5 * Math.sin(t * 0.41 + 2));
  const liftLBi = 0.5 + 0.4 * Math.sin(t * 0.5 + 1);
  const liftRBi = 0.5 + 0.4 * Math.sin(t * 0.37);
  const leanBi = 0.05 * Math.sin(t * 0.27);
  const lerp = (x: number, y: number) => x + (y - x) * mirrorAmt;
  const b = buildPose(
    0.72,
    lerp(spreadBi, spreadBm),
    lerp(liftLBi, liftLBm),
    lerp(liftRBi, liftRBm),
    lerp(leanBi, leanBm),
  );
  return { a, b };
}

// ── The instrument: two poses → control signals ────────────────────────────────
interface Control {
  sync: number; // mirror-synchrony 0 (canon) … 1 (unison)
  gap: number; // vertical / arm-height gap 0 … 1 → canon delay
  level: number; // shared conducting intensity 0 … 1
}

// Mirror-synchrony: B is A's left-right mirror when their arm-spreads match, their
// wrist heights match ACROSS the body (A.left ↔ B.right), and they lean toward
// each other (opposite signs → sum ≈ 0).
function computeSync(a: PoseFeat, b: PoseFeat): number {
  const spreadMatch = 1 - Math.min(1, Math.abs(a.armSpan - b.armSpan));
  const heightMirror =
    1 -
    Math.min(1, (Math.abs(a.leftH - b.rightH) + Math.abs(a.rightH - b.leftH)) / 2);
  const leanMirror = 1 - Math.min(1, Math.abs(a.lean + b.lean));
  return clamp01(0.4 * spreadMatch + 0.45 * heightMirror + 0.15 * leanMirror);
}

function computeGap(a: PoseFeat, b: PoseFeat): number {
  const vertical = Math.abs(a.cy - b.cy) * 2;
  const armDiff = Math.abs(a.leftH + a.rightH - (b.leftH + b.rightH)) * 0.5;
  return clamp01(vertical + armDiff);
}

function computeLevel(a: PoseFeat, b: PoseFeat): number {
  const arms = (a.leftH + a.rightH + b.leftH + b.rightH) / 4;
  const spread = (a.armSpan + b.armSpan) / 2;
  return clamp01(arms * 0.7 + spread * 0.5);
}

// ── Audio engine ──────────────────────────────────────────────────────────────
// ONE buffer → TWO looping sources. Voice A direct; Voice B through a DelayNode.
// At sync=1 the delay and pan collapse to 0 → the two identical, phase-locked
// streams sum into ONE central unison. As sync falls the pan spreads to the two
// sides and the delay opens into a live canon/round of the same take.
class MirrorEngine {
  readonly ctx: AudioContext;
  private master: SafeMaster;
  private srcA: AudioBufferSourceNode;
  private srcB: AudioBufferSourceNode;
  private gainA: GainNode;
  private gainB: GainNode;
  private panA: StereoPannerNode;
  private panB: StereoPannerNode;
  private delayB: DelayNode;
  private filterA: BiquadFilterNode;
  private filterB: BiquadFilterNode;
  private anA: AnalyserNode;
  private anB: AnalyserNode;
  private lvlA = 0;
  private lvlB = 0;

  constructor(ctx: AudioContext, buffer: AudioBuffer) {
    this.ctx = ctx;
    this.master = createSafeMaster(ctx);

    const mk = () => {
      const s = ctx.createBufferSource();
      s.buffer = buffer;
      s.loop = true;
      return s;
    };
    this.srcA = mk();
    this.srcB = mk();

    this.gainA = ctx.createGain();
    this.gainB = ctx.createGain();
    this.gainA.gain.value = 0.6;
    this.gainB.gain.value = 0.6;

    this.filterA = ctx.createBiquadFilter();
    this.filterB = ctx.createBiquadFilter();
    for (const f of [this.filterA, this.filterB]) {
      f.type = "lowpass";
      f.frequency.value = 1400;
      f.Q.value = 0.6;
    }

    this.panA = ctx.createStereoPanner();
    this.panB = ctx.createStereoPanner();

    this.delayB = ctx.createDelay(1.0);
    this.delayB.delayTime.value = 0;

    this.anA = ctx.createAnalyser();
    this.anB = ctx.createAnalyser();
    this.anA.fftSize = 256;
    this.anB.fftSize = 256;

    // Voice A: src → filter → gain → panner → master (+ analyser tap).
    this.srcA.connect(this.filterA);
    this.filterA.connect(this.gainA);
    this.gainA.connect(this.panA);
    this.gainA.connect(this.anA);
    this.panA.connect(this.master.input);

    // Voice B: src → delay → filter → gain → panner → master (+ analyser tap).
    this.srcB.connect(this.delayB);
    this.delayB.connect(this.filterB);
    this.filterB.connect(this.gainB);
    this.gainB.connect(this.panB);
    this.gainB.connect(this.anB);
    this.panB.connect(this.master.input);

    // Start both together so at delay 0 they are phase-locked → true unison.
    const t0 = ctx.currentTime + 0.02;
    this.srcA.start(t0);
    this.srcB.start(t0);
  }

  update(c: Control) {
    const now = this.ctx.currentTime;
    const tau = 0.12; // latency-as-craft smoothing
    const split = 1 - c.sync;

    // Pan spreads to the two sides as symmetry breaks; collapses to centre at lock.
    this.panA.pan.setTargetAtTime(-split * 0.9, now, tau);
    this.panB.pan.setTargetAtTime(split * 0.9, now, tau);

    // Canon delay: the vertical gap sets the interval, opened by the split amount.
    const delay = split * (0.08 + c.gap * 0.5);
    this.delayB.delayTime.setTargetAtTime(delay, now, 0.15);

    // Shared conducting motion opens the tone and lifts the level.
    const cutoff = 700 + c.level * 5500;
    this.filterA.frequency.setTargetAtTime(cutoff, now, tau);
    this.filterB.frequency.setTargetAtTime(cutoff, now, tau);

    // Gentle rate around 1.0 for tempo-feel — applied EQUALLY so the two voices
    // stay phase-locked (the delay is the only offset at unison).
    const rate = 0.97 + c.level * 0.08;
    this.srcA.playbackRate.setTargetAtTime(rate, now, tau);
    this.srcB.playbackRate.setTargetAtTime(rate, now, tau);

    this.master.setGain(0.42 + c.level * 0.5);
  }

  // Per-voice live level off the passive taps, smoothed — drives figure glow.
  readLevels(): [number, number] {
    const rms = (an: AnalyserNode) => {
      const data = new Uint8Array(an.fftSize);
      an.getByteTimeDomainData(data);
      let s = 0;
      for (let k = 0; k < data.length; k++) {
        const d = (data[k] - 128) / 128;
        s += d * d;
      }
      return clamp01(Math.sqrt(s / data.length) * 3.2);
    };
    this.lvlA = this.lvlA * 0.8 + rms(this.anA) * 0.2;
    this.lvlB = this.lvlB * 0.8 + rms(this.anB) * 0.2;
    return [this.lvlA, this.lvlB];
  }

  stop() {
    try {
      this.srcA.stop();
      this.srcB.stop();
    } catch {
      /* already stopped */
    }
    try {
      this.master.disconnect();
    } catch {
      /* closing */
    }
    if (this.ctx.state !== "closed") this.ctx.close().catch(() => {});
  }
}

// ── three.js scene ────────────────────────────────────────────────────────────
const BRAID_N = 64;

interface Figure {
  group: THREE.Group;
  joints: Map<number, THREE.Mesh>;
  bones: THREE.LineSegments;
  bonePos: Float32Array;
  boneMat: THREE.LineBasicMaterial;
  jointMat: THREE.MeshBasicMaterial;
  jointGeo: THREE.SphereGeometry;
}
interface SceneRefs {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  root: THREE.Group;
  figA: Figure;
  figB: Figure;
  strandA: THREE.Line;
  strandB: THREE.Line;
  ptsA: THREE.Points;
  ptsB: THREE.Points;
  braidPosA: Float32Array;
  braidPosB: Float32Array;
  braidMatA: THREE.LineBasicMaterial;
  braidMatB: THREE.LineBasicMaterial;
  braidPtMatA: THREE.PointsMaterial;
  braidPtMatB: THREE.PointsMaterial;
}

function toWorld(p: Pt): THREE.Vector3 {
  return new THREE.Vector3((p.x - 0.5) * 5.0, (0.5 - p.y) * 3.4 + 0.3, -(p.z || 0) * 2.0);
}

function makeFigure(scene: THREE.Group, boneColor: number, jointColor: number): Figure {
  const group = new THREE.Group();
  scene.add(group);

  const jointGeo = new THREE.SphereGeometry(0.075, 12, 12);
  const jointMat = new THREE.MeshBasicMaterial({
    color: jointColor,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const joints = new Map<number, THREE.Mesh>();
  for (const idx of USED_LM) {
    const m = new THREE.Mesh(jointGeo, jointMat);
    group.add(m);
    joints.set(idx, m);
  }

  const bonePos = new Float32Array(BONES.length * 2 * 3);
  const boneGeo = new THREE.BufferGeometry();
  boneGeo.setAttribute("position", new THREE.BufferAttribute(bonePos, 3));
  const boneMat = new THREE.LineBasicMaterial({
    color: boneColor,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const bones = new THREE.LineSegments(boneGeo, boneMat);
  group.add(bones);

  return { group, joints, bones, bonePos, boneMat, jointMat, jointGeo };
}

function makeStrand(
  scene: THREE.Scene,
  lineColor: number,
): { line: THREE.Line; points: THREE.Points; pos: Float32Array; lineMat: THREE.LineBasicMaterial; ptMat: THREE.PointsMaterial } {
  const pos = new Float32Array(BRAID_N * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const lineMat = new THREE.LineBasicMaterial({
    color: lineColor,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const line = new THREE.Line(geo, lineMat);
  scene.add(line);
  const ptMat = new THREE.PointsMaterial({
    color: lineColor,
    size: 0.12,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, ptMat);
  scene.add(points);
  return { line, points, pos, lineMat, ptMat };
}

function drawFigure(fig: Figure, pose: PoseData, level: number) {
  for (const [idx, mesh] of fig.joints) {
    mesh.position.copy(toWorld(pose.pts[idx]));
    mesh.scale.setScalar(0.75 + level * 0.9 + pose.feat.presence * 0.3);
  }
  let oi = 0;
  for (const [ai, bi] of BONES) {
    const wa = toWorld(pose.pts[ai]);
    const wb = toWorld(pose.pts[bi]);
    fig.bonePos[oi++] = wa.x;
    fig.bonePos[oi++] = wa.y;
    fig.bonePos[oi++] = wa.z;
    fig.bonePos[oi++] = wb.x;
    fig.bonePos[oi++] = wb.y;
    fig.bonePos[oi++] = wb.z;
  }
  fig.bones.geometry.attributes.position.needsUpdate = true;
  fig.boneMat.opacity = 0.45 + level * 0.5;
  fig.jointMat.opacity = 0.6 + level * 0.4;
}

const TMP_COL = new THREE.Color();
const AMETHYST = new THREE.Color(COL_BRAID);

// Central braid: at sync=1 both strands weave together as ONE amethyst rope
// between the two chests; at sync=0 they slide apart toward each body — the
// single take torn into a two-voice canon distributed across A and B.
function drawBraid(s: SceneRefs, a: PoseData, b: PoseData, c: Control, time: number) {
  const chestA = toWorld({
    x: a.feat.cx,
    y: a.feat.cy + 0.06,
    z: 0,
    v: 1,
  });
  const chestB = toWorld({
    x: b.feat.cx,
    y: b.feat.cy + 0.06,
    z: 0,
    v: 1,
  });
  const split = 1 - c.sync;
  const weaveAmp = 0.18 + 0.22 * c.sync; // tight, coherent weave when locked
  const twists = 3;
  for (let i = 0; i < BRAID_N; i++) {
    const u = i / (BRAID_N - 1);
    const bx = chestA.x + (chestB.x - chestA.x) * u;
    const by = chestA.y + (chestB.y - chestA.y) * u;
    const bz = chestA.z + (chestB.z - chestA.z) * u;
    const ph = u * Math.PI * 2 * twists + time * 1.4;
    const wy = Math.cos(ph) * weaveAmp * c.sync;
    const wz = Math.sin(ph) * weaveAmp * c.sync;
    // Separation pulls whole strands toward their owner as symmetry breaks.
    const sep = split * 1.0;
    const j = i * 3;
    s.braidPosA[j] = bx - sep * 0.8;
    s.braidPosA[j + 1] = by + wy - split * 0.25;
    s.braidPosA[j + 2] = bz + wz;
    s.braidPosB[j] = bx + sep * 0.8;
    s.braidPosB[j + 1] = by - wy - split * 0.25;
    s.braidPosB[j + 2] = bz - wz;
  }
  (s.strandA.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  (s.strandB.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;

  // Colour: fuse to amethyst at lock, split back to each body's hue at canon.
  s.braidMatA.color.copy(TMP_COL.copy(new THREE.Color(COL_A)).lerp(AMETHYST, c.sync));
  s.braidMatB.color.copy(TMP_COL.copy(new THREE.Color(COL_B)).lerp(AMETHYST, c.sync));
  s.braidPtMatA.color.copy(s.braidMatA.color);
  s.braidPtMatB.color.copy(s.braidMatB.color);

  const vis = 0.2 + 0.55 * c.level;
  const lockGlow = 0.4 + 0.6 * c.sync;
  s.braidMatA.opacity = vis * lockGlow;
  s.braidMatB.opacity = vis * lockGlow;
  s.braidPtMatA.opacity = (0.35 + 0.5 * c.level) * lockGlow;
  s.braidPtMatB.opacity = (0.35 + 0.5 * c.level) * lockGlow;
}

// ── Canvas2D fallback (no WebGL) ───────────────────────────────────────────────
interface Scene2D {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}
function to2D(p: Pt, w: number, h: number): [number, number] {
  return [p.x * w, p.y * h];
}
function drawScene2D(
  s2d: Scene2D,
  a: PoseData,
  b: PoseData | null,
  c: Control,
  levels: [number, number],
) {
  const { ctx, canvas } = s2d;
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = "#0a0910";
  ctx.fillRect(0, 0, w, h);
  const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

  const drawBody = (pose: PoseData, color: number, jointColor: number, lvl: number) => {
    ctx.lineWidth = 2 + lvl * 4;
    ctx.strokeStyle = color === COL_A ? "rgba(122,92,255," : "rgba(201,184,255,";
    ctx.strokeStyle += `${(0.45 + lvl * 0.5).toFixed(2)})`;
    ctx.beginPath();
    for (const [ai, bi] of BONES) {
      const [x1, y1] = to2D(pose.pts[ai], w, h);
      const [x2, y2] = to2D(pose.pts[bi], w, h);
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();
    ctx.fillStyle = hex(jointColor);
    for (const idx of USED_LM) {
      const [x, y] = to2D(pose.pts[idx], w, h);
      ctx.beginPath();
      ctx.arc(x, y, 3 + lvl * 5, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  drawBody(a, COL_A, COL_A_PT, levels[0]);
  if (b) drawBody(b, COL_B, COL_B_PT, levels[1]);

  // braid between the two chests
  if (b) {
    const [ax, ay] = to2D({ x: a.feat.cx, y: a.feat.cy + 0.04, z: 0, v: 1 }, w, h);
    const [bx, by] = to2D({ x: b.feat.cx, y: b.feat.cy + 0.04, z: 0, v: 1 }, w, h);
    const split = 1 - c.sync;
    ctx.lineWidth = 1.5 + c.level * 3;
    ctx.strokeStyle = `rgba(154,107,255,${(0.25 + 0.55 * c.sync).toFixed(2)})`;
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const u = i / 40;
      const px = ax + (bx - ax) * u;
      const py =
        ay + (by - ay) * u + Math.sin(u * Math.PI * 6) * (18 * c.sync) - split * 22;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
}

type Phase = "idle" | "loading" | "running";

export default function MirrorfoldPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [trackId, setTrackId] = useState<string>(DEFAULT_TRACK_ID);
  const [trackTitle, setTrackTitle] = useState<string>("");
  const [cameraOn, setCameraOn] = useState(false);
  const [demoMode, setDemoMode] = useState(true);
  const [present, setPresent] = useState(0); // people detected
  const [fallback, setFallback] = useState(false); // pointer/slider mode
  const { immersive, toggle: toggleImmersive } = useImmersive();
  const [notice, setNotice] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [sliderSync, setSliderSync] = useState(0.85);
  const [sliderLevel, setSliderLevel] = useState(0.5);

  const mountRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const sceneRef = useRef<SceneRefs | null>(null);
  const scene2dRef = useRef<Scene2D | null>(null);
  const engineRef = useRef<MirrorEngine | null>(null);
  const landmarkerRef = useRef<PoseLandmarkerInst | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const startedAtRef = useRef<number>(0);
  const lastPoseAtRef = useRef<number>(0);
  const smoothARef = useRef<PoseData | null>(null);
  const smoothBRef = useRef<PoseData | null>(null);
  const smoothCtrlRef = useRef<Control>({ sync: 0.85, level: 0.4, gap: 0.2 });

  const cameraOnRef = useRef(false);
  const fallbackRef = useRef(false);
  const demoRef = useRef(true);
  const presentRef = useRef(0);
  const sliderSyncRef = useRef(0.85);
  const sliderLevelRef = useRef(0.5);

  const setDemoSafe = useCallback((v: boolean) => {
    if (demoRef.current !== v) {
      demoRef.current = v;
      setDemoMode(v);
    }
  }, []);
  const setPresentSafe = useCallback((v: number) => {
    if (presentRef.current !== v) {
      presentRef.current = v;
      setPresent(v);
    }
  }, []);

  // Exponential-smooth a pose toward a target (liquid motion).
  const smoothPose = useCallback(
    (ref: React.MutableRefObject<PoseData | null>, target: PoseData): PoseData => {
      const prev = ref.current;
      if (!prev) {
        ref.current = target;
        return target;
      }
      const a = 0.35;
      const merged: Record<number, Pt> = {};
      for (const idx of USED_LM) {
        const np = target.pts[idx];
        const pp = prev.pts[idx] ?? np;
        merged[idx] = {
          x: pp.x + (np.x - pp.x) * a,
          y: pp.y + (np.y - pp.y) * a,
          z: pp.z + (np.z - pp.z) * a,
          v: np.v,
        };
      }
      const out = { pts: merged, feat: computeFeat(merged) };
      ref.current = out;
      return out;
    },
    [],
  );

  const buildScene = useCallback((): boolean => {
    const mount = mountRef.current;
    if (!mount || sceneRef.current || scene2dRef.current) return true;
    const w = mount.clientWidth || window.innerWidth;
    const h = mount.clientHeight || window.innerHeight;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      // Canvas2D fallback
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      const ctx2d = canvas.getContext("2d");
      if (!ctx2d) return false;
      mount.appendChild(canvas);
      scene2dRef.current = { canvas, ctx: ctx2d };
      return true;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(STAGE_BG, 1);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(STAGE_BG, 0.045);
    const camera = new THREE.PerspectiveCamera(58, w / h, 0.1, 100);
    camera.position.set(0, 0.35, 7.2);
    camera.lookAt(0, 0.15, -1);

    const root = new THREE.Group();
    scene.add(root);

    const grid = new THREE.GridHelper(28, 28, 0x2a2050, 0x140f28);
    grid.position.y = -3.0;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.25;
    scene.add(grid);

    const figA = makeFigure(root, COL_A, COL_A_PT);
    const figB = makeFigure(root, COL_B, COL_B_PT);
    const sa = makeStrand(scene, COL_A);
    const sb = makeStrand(scene, COL_B);

    sceneRef.current = {
      renderer,
      scene,
      camera,
      root,
      figA,
      figB,
      strandA: sa.line,
      strandB: sb.line,
      ptsA: sa.points,
      ptsB: sb.points,
      braidPosA: sa.pos,
      braidPosB: sb.pos,
      braidMatA: sa.lineMat,
      braidMatB: sb.lineMat,
      braidPtMatA: sa.ptMat,
      braidPtMatB: sb.ptMat,
    };
    return true;
  }, []);

  const render = useCallback(
    (
      poseA: PoseData,
      poseB: PoseData | null,
      ctrl: Control,
      levels: [number, number],
      time: number,
    ) => {
      const s = sceneRef.current;
      if (s) {
        drawFigure(s.figA, poseA, levels[0]);
        s.figA.group.visible = true;
        if (poseB) {
          drawFigure(s.figB, poseB, levels[1]);
          s.figB.group.visible = true;
          drawBraid(s, poseA, poseB, ctrl, time);
          s.strandA.visible = true;
          s.strandB.visible = true;
          s.ptsA.visible = true;
          s.ptsB.visible = true;
        } else {
          s.figB.group.visible = false;
          s.strandA.visible = false;
          s.strandB.visible = false;
          s.ptsA.visible = false;
          s.ptsB.visible = false;
        }
        s.root.rotation.y = Math.sin(time * 0.06) * 0.08;
        s.renderer.render(s.scene, s.camera);
        return;
      }
      const s2d = scene2dRef.current;
      if (s2d) drawScene2D(s2d, poseA, poseB, ctrl, levels);
    },
    [],
  );

  const loop = useCallback(() => {
    rafRef.current = requestAnimationFrame(loop);
    const now = performance.now();
    const t = (now - startedAtRef.current) / 1000;

    let poseA: PoseData | null = null;
    let poseB: PoseData | null = null;
    let live = false;

    const lm = landmarkerRef.current;
    const video = videoRef.current;
    if (cameraOnRef.current && lm && video && video.readyState >= 2) {
      try {
        const res = lm.detectForVideo(video, now);
        const found: PoseData[] = [];
        for (const person of res.landmarks ?? []) {
          const p = readPose(person);
          if (p) found.push(p);
        }
        // Stable identity: sort by shoulder-mid X (mirrored) — A left, B right.
        found.sort((p, q) => p.feat.cx - q.feat.cx);
        if (found.length >= 2) {
          poseA = found[0];
          poseB = found[1];
          live = true;
        } else if (found.length === 1) {
          poseA = found[0];
          poseB = null;
          live = true;
        }
        if (live) lastPoseAtRef.current = now;
      } catch {
        /* detection hiccup — fall through */
      }
    }

    let ctrl: Control;

    if (live && poseA) {
      setDemoSafe(false);
      const sA = smoothPose(smoothARef, poseA);
      if (poseB) {
        const sB = smoothPose(smoothBRef, poseB);
        setPresentSafe(2);
        ctrl = {
          sync: computeSync(sA.feat, sB.feat),
          gap: computeGap(sA.feat, sB.feat),
          level: computeLevel(sA.feat, sB.feat),
        };
        poseA = sA;
        poseB = sB;
      } else {
        // One person → drive voice A; voice B rides a gentle auto-canon.
        setPresentSafe(1);
        smoothBRef.current = null;
        const arms = (sA.feat.leftH + sA.feat.rightH) / 2;
        ctrl = { sync: 0.35, gap: 0.4, level: clamp01(arms * 0.7 + sA.feat.armSpan * 0.5) };
        poseA = sA;
        poseB = null;
      }
    } else if (fallbackRef.current) {
      // Pointer / slider mode: sliders drive both bodies' symmetry + intensity.
      setDemoSafe(false);
      setPresentSafe(0);
      const sync = sliderSyncRef.current;
      const level = sliderLevelRef.current;
      const { a, b } = makeDemoPair(t);
      // Bend the demo pair toward the slider's symmetry so the figures match.
      poseA = smoothPose(smoothARef, a);
      poseB = smoothPose(smoothBRef, b);
      ctrl = { sync, gap: (1 - sync) * 0.6 + 0.1, level };
    } else {
      // Idle → autonomous ghost demo (two bodies, B mirrors A).
      const lostFor = now - lastPoseAtRef.current;
      if (cameraOnRef.current && lastPoseAtRef.current > 0 && lostFor < 1500) {
        // brief dropout — hold last smoothed poses
        poseA = smoothARef.current;
        poseB = smoothBRef.current;
        ctrl = smoothCtrlRef.current;
      } else {
        setDemoSafe(true);
        if (cameraOnRef.current) setPresentSafe(0);
        const { a, b } = makeDemoPair(t);
        poseA = smoothPose(smoothARef, a);
        poseB = smoothPose(smoothBRef, b);
        ctrl = {
          sync: computeSync(poseA.feat, poseB.feat),
          gap: computeGap(poseA.feat, poseB.feat),
          level: computeLevel(poseA.feat, poseB.feat),
        };
      }
    }

    if (!poseA) return;

    // Smooth the control signal itself (a second latency-craft pass).
    const pc = smoothCtrlRef.current;
    const cs = 0.15;
    ctrl = {
      sync: pc.sync + (ctrl.sync - pc.sync) * cs,
      gap: pc.gap + (ctrl.gap - pc.gap) * cs,
      level: pc.level + (ctrl.level - pc.level) * cs,
    };
    smoothCtrlRef.current = ctrl;

    const engine = engineRef.current;
    let levels: [number, number];
    if (engine) {
      engine.update(ctrl);
      levels = engine.readLevels();
    } else {
      const g = 0.3 + 0.2 * (0.5 + 0.5 * Math.sin(t * 0.7));
      levels = [g, g * (0.6 + 0.4 * ctrl.sync)];
    }
    render(poseA, poseB, ctrl, levels, t);
  }, [render, smoothPose, setDemoSafe, setPresentSafe]);

  const play = useCallback(async () => {
    if (phase !== "idle") return;
    setPhase("loading");
    setAudioError(null);
    const AudioCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtor();
    try {
      await ctx.resume();
      const { buffer, title } = await loadRealTrackBuffer(ctx, trackId);
      setTrackTitle(title);
      engineRef.current = new MirrorEngine(ctx, buffer);
      setPhase("running");
    } catch {
      try {
        await ctx.close();
      } catch {
        /* ignore */
      }
      setAudioError("Karel's take could not be loaded in this browser — please try again.");
      setPhase("idle");
    }
  }, [phase, trackId]);

  const enableCamera = useCallback(async () => {
    if (cameraOnRef.current) return;
    const video = videoRef.current;
    if (!video) return;
    try {
      streamRef.current = await startCamera(video);
    } catch {
      fallbackRef.current = true;
      setFallback(true);
      setNotice(
        "No camera — drag the sliders below to fold and split the two voices yourself.",
      );
      return;
    }
    try {
      landmarkerRef.current = await createPoseTracker(2);
      cameraOnRef.current = true;
      setCameraOn(true);
      setNotice(null);
    } catch {
      fallbackRef.current = true;
      setFallback(true);
      const stream = streamRef.current;
      if (stream) {
        stream.getTracks().forEach((tr) => tr.stop());
        streamRef.current = null;
      }
      setNotice(
        "Body tracking couldn't load — drag the sliders below to fold and split the two voices.",
      );
    }
  }, []);

  // Build the stage + run the preview loop immediately (alive before Play).
  useEffect(() => {
    if (!buildScene()) return;
    startedAtRef.current = performance.now();
    rafRef.current = requestAnimationFrame(loop);
    const onResize = () => {
      const s = sceneRef.current;
      const mount = mountRef.current;
      if (mount && s) {
        const w = mount.clientWidth;
        const h = mount.clientHeight;
        s.camera.aspect = w / h;
        s.camera.updateProjectionMatrix();
        s.renderer.setSize(w, h);
      }
      const s2d = scene2dRef.current;
      if (mount && s2d) {
        s2d.canvas.width = mount.clientWidth;
        s2d.canvas.height = mount.clientHeight;
      }
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the loop closure fresh.
  useEffect(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [loop]);

  // Full teardown on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      const lm = landmarkerRef.current;
      if (lm) {
        try {
          lm.close();
        } catch {
          /* ignore */
        }
        landmarkerRef.current = null;
      }
      const stream = streamRef.current;
      if (stream) {
        stream.getTracks().forEach((tr) => tr.stop());
        streamRef.current = null;
      }
      const engine = engineRef.current;
      if (engine) {
        engine.stop();
        engineRef.current = null;
      }
      const s = sceneRef.current;
      if (s) {
        for (const fig of [s.figA, s.figB]) {
          fig.jointGeo.dispose();
          fig.jointMat.dispose();
          (fig.bones.geometry as THREE.BufferGeometry).dispose();
          fig.boneMat.dispose();
        }
        for (const line of [s.strandA, s.strandB]) {
          (line.geometry as THREE.BufferGeometry).dispose();
          (line.material as THREE.Material).dispose();
        }
        s.braidPtMatA.dispose();
        s.braidPtMatB.dispose();
        s.renderer.dispose();
        if (s.renderer.domElement.parentNode) {
          s.renderer.domElement.parentNode.removeChild(s.renderer.domElement);
        }
        sceneRef.current = null;
      }
    };
  }, []);

  const statusLine = (() => {
    if (demoMode) return { text: "demo · two ghost bodies mirroring", tone: "muted" as const };
    if (present >= 2) return { text: "2 of 2 present · live", tone: "muted" as const };
    if (present === 1)
      return {
        text: "1 of 2 — waiting for a second person",
        tone: "muted" as const,
      };
    return {
      text: "tracking lost — face the camera, shoulders in frame",
      tone: "lost" as const,
    };
  })();

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <div ref={mountRef} className="absolute inset-0" />
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* header — hidden while immersive */}
      {!immersive && (
        <div className="pointer-events-none absolute left-0 top-0 max-w-md p-5 sm:p-7">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Resonance dream lab
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            Mirrorfold
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            Two people, one webcam, one of Karel&apos;s takes. Move as each
            other&apos;s mirror image and the take folds into a single voice; break
            the symmetry and it splits into a two-voice canon across your bodies.
          </p>
          {phase === "running" && (
            <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {trackTitle ? `now folding — ${trackTitle}` : "now folding"}
            </p>
          )}
        </div>
      )}

      {/* fold/split meter */}
      {phase === "running" && !immersive && (
        <div className="pointer-events-none absolute right-4 top-4 flex flex-col gap-1.5 rounded-md border border-border bg-background/60 p-3 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: `#${COL_A.toString(16).padStart(6, "0")}` }}
            />
            <span className="text-sm text-muted-foreground">person A · voice A</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: `#${COL_B.toString(16).padStart(6, "0")}` }}
            />
            <span className="text-sm text-muted-foreground">person B · voice B</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: `#${COL_BRAID.toString(16).padStart(6, "0")}` }}
            />
            <span className="text-sm text-muted-foreground">mirror-lock braid</span>
          </div>
        </div>
      )}

      {audioError && (
        <div className="pointer-events-none absolute bottom-28 left-1/2 w-[min(90vw,40rem)] -translate-x-1/2 p-4 text-center">
          <p className="text-base text-destructive">{audioError}</p>
        </div>
      )}
      {notice && !immersive && (
        <div className="pointer-events-none absolute bottom-28 left-1/2 w-[min(90vw,40rem)] -translate-x-1/2 p-4 text-center">
          <p className="text-base text-muted-foreground">{notice}</p>
        </div>
      )}

      {/* idle: track picker + Play */}
      {phase !== "running" && (
        <div className="absolute inset-0 flex flex-col items-center justify-end gap-4 pb-16 sm:justify-center sm:pb-0">
          <label className="pointer-events-auto flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-mono text-xs uppercase tracking-[0.18em]">take</span>
            <select
              value={trackId}
              onChange={(e) => setTrackId(e.target.value)}
              disabled={phase === "loading"}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground backdrop-blur-sm"
            >
              {REAL_TRACKS.map((tk) => (
                <option key={tk.id} value={tk.id}>
                  {tk.title}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={play}
            disabled={phase === "loading"}
            className="pointer-events-auto min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {phase === "loading" ? "Loading the take…" : "Play"}
          </button>
        </div>
      )}

      {/* running: invite the two bodies onto the stage */}
      {phase === "running" && !cameraOn && !fallback && (
        <div className="absolute inset-x-0 bottom-16 flex justify-center sm:bottom-8">
          <button
            onClick={enableCamera}
            className="pointer-events-auto min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
          >
            Step onto the stage — two people, enable body tracking
          </button>
        </div>
      )}

      {/* fallback sliders (no camera / model failed) */}
      {phase === "running" && fallback && !immersive && (
        <div className="absolute inset-x-0 bottom-14 flex justify-center px-4 sm:bottom-10">
          <div className="pointer-events-auto flex w-[min(92vw,30rem)] flex-col gap-3 rounded-md border border-border bg-background/70 p-4 backdrop-blur-sm">
            <label className="flex flex-col gap-1 text-sm text-muted-foreground">
              <span className="font-mono text-xs uppercase tracking-[0.18em]">
                mirror-synchrony · unison ↔ canon
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={sliderSync}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setSliderSync(v);
                  sliderSyncRef.current = v;
                }}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-muted-foreground">
              <span className="font-mono text-xs uppercase tracking-[0.18em]">
                conducting intensity
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={sliderLevel}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setSliderLevel(v);
                  sliderLevelRef.current = v;
                }}
              />
            </label>
          </div>
        </div>
      )}

      {/* tracking status — always visible whenever the camera is on */}
      {cameraOn && (
        <p
          className={`pointer-events-none absolute bottom-4 left-4 font-mono text-xs uppercase tracking-[0.18em] ${
            statusLine.tone === "lost" ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {statusLine.text}
        </p>
      )}
      {cameraOn && !immersive && (
        <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          camera stays on-device · nothing stored or sent
        </p>
      )}

      {/* design notes + fullscreen */}
      {!immersive && (
        <div className="absolute bottom-4 right-4 flex gap-2">
          <ImmersiveToggle immersive={immersive} onToggle={toggleImmersive} />
          <button
            onClick={() => setShowNotes(true)}
            className="pointer-events-auto min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
        </div>
      )}
      {immersive && <ImmersiveToggle immersive={immersive} onToggle={toggleImmersive} />}

      {showNotes && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Mirrorfold — design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                One looping buffer of Karel&apos;s real take feeds two
                AudioBufferSources. Voice A plays direct; voice B runs through a
                delay. Both start together, so when your mirror-synchrony is high
                the pan and delay collapse to zero and the two identical,
                phase-locked streams sum into a single central voice — the take
                folded in half.
              </p>
              <p>
                Break the symmetry and the pan spreads the voices to your two
                sides while the delay opens: one monophonic take becomes a live
                two-voice canon, distributed across your bodies. The vertical gap
                between you sets the canon&apos;s interval; your shared conducting
                motion opens the tone and lifts the level. A central braid of
                light fuses to amethyst at mirror-lock and tears into two streams
                as you diverge.
              </p>
              <p>
                It grows from the lab&apos;s two-hand / two-person conducting
                pieces (<em>canon</em>, <em>duetlink</em>) and the musical
                canon/round form. It nods to Vrengt (arXiv:2010.03779, a shared
                body–machine instrument for music-dance) and Myron Krueger&apos;s{" "}
                <em>Videoplace</em> (two people responsive in one frame). And it
                inverts SoundMHPE (arXiv:2609.04902), which predicts multi-person
                3D pose FROM sound — here two poses shape the sound.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
