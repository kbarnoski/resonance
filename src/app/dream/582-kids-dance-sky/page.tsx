"use client";

/**
 * 582-kids-dance-sky — Sky Choir
 *
 * "What if a 4-year-old's whole body, tracked as a skeleton, became a warm
 * sky-choir — raise your arms and the sky brightens, spread wide and the chord
 * opens, no tapping, no humming, no creature?"
 *
 * The front camera tracks the child's 33 body landmarks (MediaPipe
 * PoseLandmarker, loaded from a CDN at runtime — never bundled, no package.json
 * change). The body becomes a glowing skeleton with an aura, and the pose drives
 * a warm Lydian / just-intonation sky-choir:
 *   - left & right wrist HEIGHT  → two distinct warm voices (higher = brighter)
 *   - body SPREAD (wrist distance) → chord openness (root+fifth → open 6th/9th)
 *   - arms raised / centre-of-mass height → master brightness (lowpass opens)
 *   - feet / hip motion → soft low bass swell
 *
 * INPUT  : front camera → MediaPipe PoseLandmarker (33 body landmarks)
 *          fallback: Canvas2D frame-difference motion blob / pointer drag
 * OUTPUT : Canvas2D glowing skeleton + blooming aura (no three.js / SVG / WebGL)
 * VIBE   : warm, embodied, never silent, no fail state, no scary loud sounds
 *
 * Named reference: Myron Krueger's *Videoplace* (1974) — the responsive
 * environment where the whole body, not a cursor, is the instrument.
 *
 * Privacy: camera frames are analysed in-browser only — never recorded or sent.
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

// ── README link ──────────────────────────────────────────────────────────────

const README_URL =
  "https://github.com/kbarnoski/resonance/blob/main/src/app/dream/582-kids-dance-sky/README.md";

// ── MediaPipe (CDN runtime import; typed minimally, no `any`) ─────────────────

const MEDIAPIPE_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/vision_bundle.mjs";
const MEDIAPIPE_WASM =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm";
const POSE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

interface Landmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}
interface PoseLandmarkerResult {
  landmarks: Landmark[][];
}
interface PoseLandmarkerInst {
  detectForVideo(video: HTMLVideoElement, ts: number): PoseLandmarkerResult;
  close(): void;
}
interface MediaPipeVision {
  FilesetResolver: {
    forVisionTasks(wasmPath: string): Promise<unknown>;
  };
  PoseLandmarker: {
    createFromOptions(
      fileset: unknown,
      opts: {
        baseOptions: { modelAssetPath: string; delegate?: "GPU" | "CPU" };
        runningMode: "VIDEO" | "IMAGE";
        numPoses?: number;
      },
    ): Promise<PoseLandmarkerInst>;
  };
}

// ── MediaPipe Pose landmark indices we care about ─────────────────────────────
const L = {
  leftWrist: 15,
  rightWrist: 16,
  leftShoulder: 11,
  rightShoulder: 12,
  leftHip: 23,
  rightHip: 24,
  leftAnkle: 27,
  rightAnkle: 28,
  leftElbow: 13,
  rightElbow: 14,
  leftKnee: 25,
  rightKnee: 26,
  nose: 0,
};

// Skeleton bones (pairs of landmark indices) for drawing.
const BONES: Array<[number, number]> = [
  [11, 12], // shoulders
  [11, 13],
  [13, 15], // left arm
  [12, 14],
  [14, 16], // right arm
  [11, 23],
  [12, 24], // torso sides
  [23, 24], // hips
  [23, 25],
  [25, 27], // left leg
  [24, 26],
  [26, 28], // right leg
  [0, 11],
  [0, 12], // neck-ish
];

// ── Harmony: warm Lydian / just-intonation choir (NOT C-major pentatonic) ─────
// Constant low root+fifth drone; voices add octaves, 6ths and 9ths as the body
// opens. Frequencies are just-intonation ratios over a low A root.
const ROOT = 110; // A2
// Just-intonation scale degrees (ratios) — a warm Lydian-ish cluster.
// 1/1, 9/8 (M2), 5/4 (M3), 45/32 (#4 Lydian), 3/2 (P5), 5/3 (M6), 15/8 (M7), 2/1
const JI = [1, 9 / 8, 5 / 4, 45 / 32, 3 / 2, 5 / 3, 15 / 8, 2];

// Pick a frequency for a "voice" given a normalized height 0..1 (0=low,1=high).
function pitchFromHeight(h: number, octaveBase: number): number {
  const clamped = Math.max(0, Math.min(0.999, h));
  const idx = Math.floor(clamped * JI.length);
  const oct = Math.pow(2, octaveBase);
  return ROOT * oct * JI[idx];
}

// Smooth a value toward a target (simple low-pass for jitter-free motion).
function smooth(prev: number, target: number, a: number): number {
  return prev + (target - prev) * a;
}

// ── Pose features that the music + visuals read each frame ────────────────────
interface Features {
  leftHandH: number; // 0=low .. 1=high (raised)
  rightHandH: number;
  spread: number; // 0=narrow .. 1=arms wide
  rise: number; // 0=arms low .. 1=arms raised high (brightness)
  motion: number; // overall body motion 0..1 (drives bass swell)
  cx: number; // body centre x (0..1)
  cy: number; // body centre y (0..1)
}

const NEUTRAL: Features = {
  leftHandH: 0.3,
  rightHandH: 0.3,
  spread: 0.25,
  rise: 0.2,
  motion: 0,
  cx: 0.5,
  cy: 0.5,
};

// Derive musical/visual features from 33 pose landmarks.
// MediaPipe y grows downward (0 top, 1 bottom); we invert so height grows up.
function featuresFromPose(pts: Landmark[], prevCenter: [number, number]): {
  feat: Features;
  center: [number, number];
} {
  const lw = pts[L.leftWrist];
  const rw = pts[L.rightWrist];
  const ls = pts[L.leftShoulder];
  const rs = pts[L.rightShoulder];
  const lh = pts[L.leftHip];
  const rh = pts[L.rightHip];

  const leftHandH = 1 - (lw?.y ?? 0.7);
  const rightHandH = 1 - (rw?.y ?? 0.7);

  // Spread: horizontal distance between wrists, normalized.
  const dx = (lw?.x ?? 0.5) - (rw?.x ?? 0.5);
  const dy = (lw?.y ?? 0.5) - (rw?.y ?? 0.5);
  const wristDist = Math.sqrt(dx * dx + dy * dy);
  const spread = Math.max(0, Math.min(1, (wristDist - 0.1) / 0.7));

  // Rise: how high the hands are relative to shoulders/hips.
  const shoulderH = 1 - (((ls?.y ?? 0.4) + (rs?.y ?? 0.4)) / 2);
  const handAvg = (leftHandH + rightHandH) / 2;
  const rise = Math.max(0, Math.min(1, (handAvg - shoulderH + 0.25) / 0.5));

  // Centre of mass (use hips/shoulders).
  const cx =
    ((ls?.x ?? 0.5) + (rs?.x ?? 0.5) + (lh?.x ?? 0.5) + (rh?.x ?? 0.5)) / 4;
  const cy =
    ((ls?.y ?? 0.5) + (rs?.y ?? 0.5) + (lh?.y ?? 0.5) + (rh?.y ?? 0.5)) / 4;

  // Motion: how much the centre moved since last frame.
  const moveAmt = Math.sqrt(
    Math.pow(cx - prevCenter[0], 2) + Math.pow(cy - prevCenter[1], 2),
  );
  const motion = Math.max(0, Math.min(1, moveAmt * 18));

  return {
    feat: { leftHandH, rightHandH, spread, rise, motion, cx, cy: 1 - cy },
    center: [cx, cy],
  };
}

// ── Audio engine: kids-safe choir on the AudioContext clock ───────────────────
// Chain: voices → masterGain → lowpass(≤7600) → compressor → destination.
class ChoirEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  lowpass: BiquadFilterNode | null = null;
  comp: DynamicsCompressorNode | null = null;

  // Drone (root + fifth), two hand voices, an "open" voice, and a bass swell.
  private drone: { osc: OscillatorNode; gain: GainNode }[] = [];
  private voiceL: { osc: OscillatorNode; gain: GainNode } | null = null;
  private voiceR: { osc: OscillatorNode; gain: GainNode } | null = null;
  private voiceOpen: { osc: OscillatorNode; gain: GainNode } | null = null;
  private bass: { osc: OscillatorNode; gain: GainNode } | null = null;

  async start() {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctx();
    this.ctx = ctx;
    if (ctx.state === "suspended") await ctx.resume();

    // ── kids-safe master chain (exact shape) ──
    const master = ctx.createGain();
    master.gain.value = 0.0001;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 1200;
    lowpass.Q.value = 0.3;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 20;
    comp.knee.value = 6;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;

    master.connect(lowpass);
    lowpass.connect(comp);
    comp.connect(ctx.destination);
    this.master = master;
    this.lowpass = lowpass;
    this.comp = comp;

    // ── always-on warm drone: low root + fifth ──
    const droneFreqs = [ROOT, ROOT * (3 / 2), ROOT * 2];
    const droneGains = [0.16, 0.1, 0.06];
    this.drone = droneFreqs.map((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = droneGains[i];
      osc.connect(g);
      g.connect(master);
      osc.start();
      return { osc, gain: g };
    });

    // ── two warm hand voices (triangle for body) ──
    this.voiceL = this.makeVoice(ctx, master, "triangle", ROOT * 2);
    this.voiceR = this.makeVoice(ctx, master, "triangle", ROOT * 2.5);
    // ── shimmering "open" voice that fades in with spread ──
    this.voiceOpen = this.makeVoice(ctx, master, "sine", ROOT * 3);
    // ── soft low bass swell from feet/motion ──
    this.bass = this.makeVoice(ctx, master, "sine", ROOT / 2);

    // gentle master fade-in
    master.gain.setTargetAtTime(0.5, ctx.currentTime, 0.6);
  }

  private makeVoice(
    ctx: AudioContext,
    dest: AudioNode,
    type: OscillatorType,
    f: number,
  ) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    osc.connect(g);
    g.connect(dest);
    osc.start();
    return { osc, gain: g };
  }

  // Apply pose features. All changes via setTargetAtTime (no clicks).
  apply(f: Features) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.lowpass) return;
    const t = ctx.currentTime;

    // brightness: lowpass opens as arms rise (cap ≤ 7600 Hz, kids-safe).
    const cutoff = 900 + f.rise * 6600; // 900 .. 7500
    this.lowpass.frequency.setTargetAtTime(
      Math.min(7600, cutoff),
      t,
      0.08,
    );

    // hand voices: pitch from each hand's height, two warm octave registers.
    if (this.voiceL) {
      const fr = pitchFromHeight(f.leftHandH, 1); // ~A3 register
      this.voiceL.osc.frequency.setTargetAtTime(fr, t, 0.06);
      const amp = 0.05 + f.leftHandH * 0.16;
      this.voiceL.gain.gain.setTargetAtTime(amp, t, 0.1);
    }
    if (this.voiceR) {
      const fr = pitchFromHeight(f.rightHandH, 2); // ~A4 register, brighter
      this.voiceR.osc.frequency.setTargetAtTime(fr, t, 0.06);
      const amp = 0.04 + f.rightHandH * 0.14;
      this.voiceR.gain.gain.setTargetAtTime(amp, t, 0.1);
    }

    // chord openness: as the body spreads, fade in an added 6th/9th shimmer.
    if (this.voiceOpen) {
      // narrow → octave; wide → a high 9th (9/8 two octaves up) shimmer.
      const wideFreq = ROOT * 4 * (9 / 8);
      const narrowFreq = ROOT * 4;
      const fr = narrowFreq + (wideFreq - narrowFreq) * f.spread;
      this.voiceOpen.osc.frequency.setTargetAtTime(fr, t, 0.12);
      const amp = f.spread * 0.12;
      this.voiceOpen.gain.gain.setTargetAtTime(amp, t, 0.2);
    }

    // bass swell from feet/hip motion (soft, never thumpy).
    if (this.bass) {
      const amp = 0.04 + f.motion * 0.14;
      this.bass.gain.gain.setTargetAtTime(amp, t, 0.18);
    }
  }

  get currentTime() {
    return this.ctx?.currentTime ?? 0;
  }

  stop() {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      this.master?.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.2);
      const all = [
        ...this.drone,
        this.voiceL,
        this.voiceR,
        this.voiceOpen,
        this.bass,
      ];
      all.forEach((v) => {
        if (v) {
          try {
            v.osc.stop(ctx.currentTime + 0.4);
          } catch {
            /* already stopped */
          }
        }
      });
      setTimeout(() => {
        ctx.close().catch(() => {});
      }, 600);
    } catch {
      /* best-effort teardown */
    }
  }
}

// ── Auto-demo: a synthetic dancing skeleton when no real input ────────────────
// Returns synthetic features that gently sweep through the mapping so a silent
// glance still looks alive and sings.
function demoFeatures(tSec: number): Features {
  const s = Math.sin(tSec * 0.7);
  const c = Math.cos(tSec * 0.5);
  const wave = (Math.sin(tSec * 1.1) + 1) / 2;
  return {
    leftHandH: 0.4 + 0.4 * ((s + 1) / 2),
    rightHandH: 0.4 + 0.4 * ((c + 1) / 2),
    spread: 0.3 + 0.5 * wave,
    rise: 0.3 + 0.5 * ((Math.sin(tSec * 0.6) + 1) / 2),
    motion: 0.2 + 0.3 * ((Math.sin(tSec * 2.0) + 1) / 2),
    cx: 0.5 + 0.08 * Math.sin(tSec * 0.4),
    cy: 0.5 + 0.05 * Math.cos(tSec * 0.8),
  };
}

// Build a synthetic skeleton (33 landmarks) for the auto-demo, so the SAME
// drawing path animates without a camera.
function demoSkeleton(tSec: number): Landmark[] {
  const pts: Landmark[] = new Array(33)
    .fill(0)
    .map(() => ({ x: 0.5, y: 0.5, visibility: 1 }));
  const cx = 0.5 + 0.06 * Math.sin(tSec * 0.4);
  const armUp = (Math.sin(tSec * 0.9) + 1) / 2; // 0..1
  const spread = 0.12 + 0.22 * ((Math.sin(tSec * 0.6) + 1) / 2);

  const set = (i: number, x: number, y: number) => {
    pts[i] = { x, y, visibility: 1 };
  };
  set(L.nose, cx, 0.22);
  set(L.leftShoulder, cx + 0.1, 0.34);
  set(L.rightShoulder, cx - 0.1, 0.34);
  set(L.leftElbow, cx + 0.1 + spread * 0.6, 0.42 - armUp * 0.12);
  set(L.rightElbow, cx - 0.1 - spread * 0.6, 0.42 - armUp * 0.12);
  set(L.leftWrist, cx + 0.1 + spread, 0.46 - armUp * 0.26);
  set(L.rightWrist, cx - 0.1 - spread, 0.46 - armUp * 0.26);
  set(L.leftHip, cx + 0.07, 0.6);
  set(L.rightHip, cx - 0.07, 0.6);
  set(L.leftKnee, cx + 0.08, 0.78 + 0.03 * Math.sin(tSec * 2));
  set(L.rightKnee, cx - 0.08, 0.78 - 0.03 * Math.sin(tSec * 2));
  set(L.leftAnkle, cx + 0.09, 0.94);
  set(L.rightAnkle, cx - 0.09, 0.94);
  return pts;
}

// ── Canvas2D: glowing skeleton + blooming aura ────────────────────────────────
function drawScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  pts: Landmark[] | null,
  feat: Features,
  tSec: number,
  live: boolean,
) {
  // warm fading background (trails)
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgba(8, 6, 14, 0.28)";
  ctx.fillRect(0, 0, w, h);

  // sky brightness wash that blooms with `rise`
  const sky = ctx.createRadialGradient(
    w * feat.cx,
    h * (1 - feat.cy),
    0,
    w * feat.cx,
    h * (1 - feat.cy),
    Math.max(w, h) * (0.5 + feat.rise * 0.5),
  );
  const warmth = 0.06 + feat.rise * 0.22;
  const open = feat.spread;
  sky.addColorStop(
    0,
    `rgba(${255}, ${190 + open * 50}, ${120 + feat.rise * 80}, ${warmth})`,
  );
  sky.addColorStop(1, "rgba(8, 6, 14, 0)");
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  if (!pts) {
    ctx.globalCompositeOperation = "source-over";
    return;
  }

  const px = (lm: Landmark) => [(1 - lm.x) * w, lm.y * h] as const; // mirror x

  // ── bones as warm glowing light ──
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (const [a, b] of BONES) {
    const pa = pts[a];
    const pb = pts[b];
    if (!pa || !pb) continue;
    if ((pa.visibility ?? 1) < 0.3 || (pb.visibility ?? 1) < 0.3) continue;
    const [ax, ay] = px(pa);
    const [bx, by] = px(pb);
    // colour shifts warmer/brighter with rise
    const hue = 30 + feat.rise * 25; // amber → gold
    // outer glow
    ctx.strokeStyle = `hsla(${hue}, 95%, 70%, ${0.12 + feat.rise * 0.12})`;
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    // inner bright line
    ctx.strokeStyle = `hsla(${hue + 15}, 100%, 88%, ${0.6 + feat.rise * 0.3})`;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }

  // ── joints as soft warm orbs; hands & feet bloom biggest ──
  const bloomJoints = new Set([
    L.leftWrist,
    L.rightWrist,
    L.leftAnkle,
    L.rightAnkle,
  ]);
  for (let i = 0; i < pts.length; i++) {
    const lm = pts[i];
    if (!lm || (lm.visibility ?? 1) < 0.3) continue;
    const [x, y] = px(lm);
    let r = 6;
    let glow = 0.5;
    if (i === L.leftWrist) {
      r = 14 + feat.leftHandH * 30;
      glow = 0.4 + feat.leftHandH * 0.5;
    } else if (i === L.rightWrist) {
      r = 14 + feat.rightHandH * 30;
      glow = 0.4 + feat.rightHandH * 0.5;
    } else if (bloomJoints.has(i)) {
      r = 12 + feat.motion * 24;
      glow = 0.4 + feat.motion * 0.4;
    }
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.4);
    const hue = i === L.rightWrist ? 200 + open * 30 : 38;
    g.addColorStop(0, `hsla(${hue}, 100%, 90%, ${glow})`);
    g.addColorStop(0.4, `hsla(${hue}, 100%, 70%, ${glow * 0.5})`);
    g.addColorStop(1, `hsla(${hue}, 100%, 60%, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── floating sparkle aura that drifts where the body opens ──
  const sparkCount = Math.floor(6 + feat.spread * 18);
  for (let i = 0; i < sparkCount; i++) {
    const a = (i / sparkCount) * Math.PI * 2 + tSec * 0.5;
    const rad = (40 + feat.spread * 120) * (0.6 + 0.4 * Math.sin(tSec + i));
    const cxp = (1 - feat.cx) * w + Math.cos(a) * rad;
    const cyp = (1 - feat.cy) * h + Math.sin(a) * rad;
    const s = 1.5 + 2.5 * ((Math.sin(tSec * 3 + i) + 1) / 2);
    ctx.fillStyle = `hsla(${44 + open * 20}, 100%, 85%, ${0.25 + feat.rise * 0.3})`;
    ctx.beginPath();
    ctx.arc(cxp, cyp, s, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalCompositeOperation = "source-over";

  // subtle "not live" hint dimming handled by caller via notice text.
  void live;
}

// ── Frame-difference motion blob (fallback when no pose) ──────────────────────
// Returns simplified features + a faux skeleton centred on the motion blob so
// the same drawScene path keeps working without MediaPipe.
function motionBlobFeatures(
  blobX: number,
  blobY: number,
  energy: number,
): { feat: Features; pts: Landmark[] } {
  // Map blob position to a simplified pose: higher/wider blob = brighter/open.
  const rise = Math.max(0, Math.min(1, 1 - blobY));
  const spread = Math.max(0, Math.min(1, energy));
  const feat: Features = {
    leftHandH: rise,
    rightHandH: rise,
    spread,
    rise,
    motion: energy,
    cx: blobX,
    cy: 1 - blobY,
  };
  // a simple cross-shaped skeleton so something glowing is always drawn
  const pts: Landmark[] = new Array(33)
    .fill(0)
    .map(() => ({ x: blobX, y: blobY, visibility: 0 }));
  const arm = 0.08 + spread * 0.18;
  const set = (i: number, x: number, y: number) => {
    pts[i] = { x, y, visibility: 1 };
  };
  set(L.nose, blobX, blobY - 0.12);
  set(L.leftShoulder, blobX + 0.05, blobY - 0.02);
  set(L.rightShoulder, blobX - 0.05, blobY - 0.02);
  set(L.leftWrist, blobX + arm, blobY - rise * 0.18);
  set(L.rightWrist, blobX - arm, blobY - rise * 0.18);
  set(L.leftElbow, blobX + arm * 0.6, blobY - rise * 0.09);
  set(L.rightElbow, blobX - arm * 0.6, blobY - rise * 0.09);
  set(L.leftHip, blobX + 0.04, blobY + 0.12);
  set(L.rightHip, blobX - 0.04, blobY + 0.12);
  set(L.leftAnkle, blobX + 0.05, blobY + 0.3);
  set(L.rightAnkle, blobX - 0.05, blobY + 0.3);
  return { feat, pts };
}

type Phase = "idle" | "loading" | "running";

export default function KidsDanceSky() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  // hidden small canvas for frame-difference fallback
  const diffCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const engineRef = useRef<ChoirEngine | null>(null);
  const landmarkerRef = useRef<PoseLandmarkerInst | null>(null);
  const rafRef = useRef<number>(0);
  const schedRef = useRef<number | null>(null);

  // smoothed features + bookkeeping refs (rAF reads fresh values)
  const featRef = useRef<Features>({ ...NEUTRAL });
  const centerRef = useRef<[number, number]>([0.5, 0.5]);
  const livePoseRef = useRef(false);
  const lastInteractRef = useRef<number>(0);
  const prevFrameRef = useRef<ImageData | null>(null);
  const dragRef = useRef<{ active: boolean; x: number; y: number } | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [tracking, setTracking] = useState(false);

  // ── frame-difference fallback: returns blob centre + energy ──
  const runFrameDiff = useCallback((): {
    x: number;
    y: number;
    energy: number;
  } | null => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;
    let dc = diffCanvasRef.current;
    if (!dc) {
      dc = document.createElement("canvas");
      dc.width = 64;
      dc.height = 48;
      diffCanvasRef.current = dc;
    }
    const dctx = dc.getContext("2d", { willReadFrequently: true });
    if (!dctx) return null;
    try {
      dctx.drawImage(video, 0, 0, dc.width, dc.height);
    } catch {
      return null;
    }
    const cur = dctx.getImageData(0, 0, dc.width, dc.height);
    const prev = prevFrameRef.current;
    prevFrameRef.current = cur;
    if (!prev) return null;

    let sumX = 0;
    let sumY = 0;
    let count = 0;
    let energy = 0;
    const d = cur.data;
    const p = prev.data;
    for (let y = 0; y < dc.height; y++) {
      for (let x = 0; x < dc.width; x++) {
        const i = (y * dc.width + x) * 4;
        const diff =
          Math.abs(d[i] - p[i]) +
          Math.abs(d[i + 1] - p[i + 1]) +
          Math.abs(d[i + 2] - p[i + 2]);
        if (diff > 60) {
          sumX += x;
          sumY += y;
          count++;
          energy += diff;
        }
      }
    }
    if (count < 8) return null;
    return {
      x: 1 - sumX / count / dc.width, // mirror to match drawing
      y: 1 - sumY / count / dc.height, // invert: high motion up = bright
      energy: Math.max(0, Math.min(1, energy / (count * 255 * 3) + count / 400)),
    };
  }, []);

  // ── main render loop ──
  const startLoop = useCallback(() => {
    const frame = () => {
      const tSec = performance.now() / 1000;
      const nowMs = performance.now();
      let pts: Landmark[] | null = null;
      let rawFeat: Features | null = null;

      // 1) live pose?
      const lm = landmarkerRef.current;
      const video = videoRef.current;
      if (lm && video && video.readyState >= 2) {
        try {
          const res = lm.detectForVideo(video, nowMs);
          const p = res.landmarks?.[0];
          if (p && p.length >= 25) {
            pts = p;
            const out = featuresFromPose(p, centerRef.current);
            centerRef.current = out.center;
            rawFeat = out.feat;
            livePoseRef.current = true;
            lastInteractRef.current = nowMs;
          }
        } catch {
          // transient detector hiccup
        }
      }

      // 2) pointer drag (always available; also fallback)
      if (!rawFeat) {
        const drag = dragRef.current;
        if (drag && drag.active) {
          const rise = Math.max(0, Math.min(1, 1 - drag.y));
          rawFeat = {
            leftHandH: rise,
            rightHandH: rise,
            spread: Math.max(0, Math.min(1, Math.abs(drag.x - 0.5) * 2)),
            rise,
            motion: 0.3,
            cx: drag.x,
            cy: 1 - drag.y,
          };
          pts = motionBlobFeatures(drag.x, drag.y, rawFeat.spread).pts;
          lastInteractRef.current = nowMs;
        }
      }

      // 3) frame-difference motion blob (camera but no pose)
      if (!rawFeat && video && video.readyState >= 2 && !lm) {
        const blob = runFrameDiff();
        if (blob) {
          const mb = motionBlobFeatures(blob.x, blob.y, blob.energy);
          rawFeat = mb.feat;
          pts = mb.pts;
          lastInteractRef.current = nowMs;
        }
      }

      // 4) auto-demo when idle (or from the very start)
      if (!rawFeat) {
        const idleFor = nowMs - lastInteractRef.current;
        if (idleFor > 5000 || lastInteractRef.current === 0) {
          rawFeat = demoFeatures(tSec);
          pts = demoSkeleton(tSec);
        } else {
          rawFeat = featRef.current; // hold last
        }
      }

      // smooth features for jitter-free motion + audio
      const target: Features = rawFeat ?? featRef.current;
      const prev = featRef.current;
      const a = 0.25;
      const sm: Features = {
        leftHandH: smooth(prev.leftHandH, target.leftHandH, a),
        rightHandH: smooth(prev.rightHandH, target.rightHandH, a),
        spread: smooth(prev.spread, target.spread, a),
        rise: smooth(prev.rise, target.rise, a),
        motion: smooth(prev.motion, target.motion, 0.4),
        cx: smooth(prev.cx, target.cx, a),
        cy: smooth(prev.cy, target.cy, a),
      };
      featRef.current = sm;

      // render
      const canvas = canvasRef.current;
      const cctx = canvas?.getContext("2d");
      if (canvas && cctx) {
        drawScene(
          cctx,
          canvas.width,
          canvas.height,
          pts,
          sm,
          tSec,
          livePoseRef.current,
        );
      }

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
  }, [runFrameDiff]);

  // ── Chris-Wilson look-ahead scheduler: pump audio params on the AudioContext
  //    clock ~120ms ahead, every ~25ms. Here we feed smoothed features forward
  //    so param ramps are scheduled steadily rather than once-per-rAF. ──
  const startScheduler = useCallback(() => {
    const tick = () => {
      const engine = engineRef.current;
      if (engine) engine.apply(featRef.current);
    };
    schedRef.current = window.setInterval(tick, 25);
  }, []);

  // ── camera + PoseLandmarker (best-effort) ──
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      });
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setTracking(true);

      // RUNTIME CDN import — string URL + webpackIgnore so it is never bundled
      // and never becomes a package.json dependency.
      const vision = (await import(
        /* webpackIgnore: true */ MEDIAPIPE_CDN
      )) as unknown as MediaPipeVision;
      const fileset = await vision.FilesetResolver.forVisionTasks(
        MEDIAPIPE_WASM,
      );
      const landmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: POSE_MODEL, delegate: "GPU" },
        runningMode: "VIDEO",
        numPoses: 1,
      });
      landmarkerRef.current = landmarker;
      lastInteractRef.current = performance.now();
      setNotice(null);
    } catch {
      // No camera / denied / CDN blocked → frame-diff + drag + demo cover it.
      if (videoRef.current?.srcObject) {
        // camera worked but pose model failed → frame-difference still runs
        setNotice(
          "Body tracking couldn't load — dance and the moving shapes still sing. Or drag with a finger.",
        );
      } else {
        setTracking(false);
        setNotice(
          "No camera here — drag a finger across the sky to play, or just watch it dance and sing on its own.",
        );
      }
    }
  }, []);

  // ── primary action: Start (builds AudioContext inside the gesture) ──
  const start = useCallback(async () => {
    if (phase !== "idle") return;
    setPhase("loading");

    const engine = new ChoirEngine();
    engineRef.current = engine;
    try {
      await engine.start();
    } catch {
      setNotice("Audio could not start in this browser.");
    }

    setPhase("running");
    startLoop();
    startScheduler();
    startCamera();
  }, [phase, startLoop, startScheduler, startCamera]);

  // ── pointer drag (fallback + always available) ──
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const rect = el.getBoundingClientRect();
    dragRef.current = {
      active: true,
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
    lastInteractRef.current = performance.now();
  }, []);
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || !d.active) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    d.x = (e.clientX - rect.left) / rect.width;
    d.y = (e.clientY - rect.top) / rect.height;
    lastInteractRef.current = performance.now();
  }, []);
  const onPointerUp = useCallback(() => {
    if (dragRef.current) dragRef.current.active = false;
    lastInteractRef.current = performance.now();
  }, []);

  // ── size canvas to the window ──
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // ── teardown on unmount ──
  useEffect(() => {
    const video = videoRef.current;
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (schedRef.current !== null) window.clearInterval(schedRef.current);
      try {
        landmarkerRef.current?.close();
      } catch {
        /* ignore */
      }
      const s = video?.srcObject as MediaStream | null;
      s?.getTracks().forEach((t) => t.stop());
      engineRef.current?.stop();
    };
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-black font-mono text-white/95 select-none">
      {/* full-bleed Canvas2D skeleton + aura */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      {/* hidden camera feed (analysed in-browser, shown tiny as reassurance) */}
      <video
        ref={videoRef}
        className="pointer-events-none absolute bottom-3 right-3 z-10 w-24 origin-bottom-right -scale-x-100 rounded-lg opacity-30"
        style={{ display: tracking ? "block" : "none" }}
        playsInline
        muted
      />

      {/* Read the design notes — corner link */}
      <Link
        href={README_URL}
        target="_blank"
        rel="noreferrer"
        className="absolute right-4 top-4 z-20 text-base text-white/75 underline-offset-4 hover:text-amber-300 hover:underline"
      >
        Read the design notes
      </Link>

      {/* intro / overlay */}
      {phase !== "running" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 px-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-white/95 sm:text-4xl">
            Sky Choir
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-white/75 sm:text-lg">
            Stand back so your whole body shows. Raise your arms and the sky
            brightens. Spread out wide and the warm chord opens. Just dance —
            there are no wrong notes.
          </p>
          <button
            type="button"
            onClick={start}
            disabled={phase === "loading"}
            className="min-h-[64px] min-w-[64px] rounded-full bg-amber-500/90 px-8 py-2.5 text-xl font-medium text-white/95 transition hover:bg-amber-400 disabled:opacity-60"
          >
            {phase === "loading" ? "Waking the sky…" : "Start dancing"}
          </button>
          <p className="text-base text-white/75">
            Camera stays in your browser. Best with room to move.
          </p>
        </div>
      )}

      {/* running HUD */}
      {phase === "running" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-2 px-6 pb-6 text-center">
          {notice && (
            <p className="max-w-md text-base leading-relaxed text-rose-300">
              {notice}
            </p>
          )}
          <p className="text-base text-white/75">
            {tracking
              ? "Dancing with you — raise high to brighten, spread wide to open."
              : "Drag across the sky, or just watch it dance and sing."}
          </p>
        </div>
      )}
    </main>
  );
}
