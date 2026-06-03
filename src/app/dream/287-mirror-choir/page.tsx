"use client";

/**
 * 287-mirror-choir — body-pose → vocal-formant choir + matte wooden-mirror.
 *
 * The lab's FIRST body-tracking piece. MediaPipe Pose Landmarker tracks 33
 * body landmarks in real time. Your live silhouette drives a four-voice formant
 * choir: left hand and right hand are two singing voices whose pitch follows a
 * D-Dorian chord stack voiced from their height in frame; shoulder span / limb
 * openness morphs the vowel continuously (closed → "oo/oh", open arms → "ah");
 * overall body height adjusts register (near top of frame = brighter/higher).
 * The visual output is a matte "wooden mirror" of your silhouette: tessellated
 * square tiles whose darkness mirrors your reflected shape — pure Canvas2D
 * source-over, drop-shadows only, NO glow, NO additive blending.
 *
 * Named refs:
 *   Daniel Rozin, Wooden Mirror (1999) — physical tile mirror
 *   MediaPipe Pose Landmarker (Google AI Edge) — 33 real-time body landmarks
 *   Klatt-style vocal formant synthesis — bandpass-shaped glottal pulses
 *
 * Degrades gracefully: if camera / MediaPipe fails, a "ghost dancer" pose
 * loops over hand-authored keyframes and drives the same choir + mirror.
 *
 * Fully client-side. No API route. No new npm dependencies.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// ── README URL ────────────────────────────────────────────────────────────────
const README_URL =
  "https://github.com/kbarnoski/resonance/blob/main/src/app/dream/287-mirror-choir/README.md";

// ── D-Dorian chord tones: D2 D3 F3 A3 C4 E4 G4 A4 (warm minor-7 spread) ─────
// Hz values for each scale step used for voice pitch mapping
const DORIAN_HZ = [73.42, 146.83, 174.61, 220.0, 261.63, 329.63, 392.0, 440.0];

// ── Vocal formant tables (F1, F2, F3 in Hz, gain factors) ────────────────────
// Classic Klatt/Peterson-Barney approximate values for sung vowels
type FormantRow = [number, number, number]; // F1, F2, F3
const FORMANTS: Record<string, FormantRow> = {
  oo: [300, 870, 2240],
  oh: [500, 1000, 2500],
  ah: [800, 1200, 2600],
  eh: [600, 1700, 2500],
  ee: [280, 2250, 3000],
};

// ── Landmark indices ──────────────────────────────────────────────────────────
const LM_NOSE = 0;
const LM_L_SHOULDER = 11;
const LM_R_SHOULDER = 12;
const LM_L_HIP = 23;
const LM_R_HIP = 24;
const LM_L_WRIST = 15;
const LM_R_WRIST = 16;
const LM_L_ANKLE = 27;
const LM_R_ANKLE = 28;

// ── Tile size for wooden mirror rendering ────────────────────────────────────
const TILE = 14; // px per tile

// ── Ghost dancer keyframe poses (normalized 0-1 coords, [x, y] per landmark) ─
// We store only the subset of landmarks we actually use.
interface GhostPose {
  nose: [number, number];
  lShoulder: [number, number];
  rShoulder: [number, number];
  lHip: [number, number];
  rHip: [number, number];
  lWrist: [number, number];
  rWrist: [number, number];
  lAnkle: [number, number];
  rAnkle: [number, number];
}

const GHOST_KEYFRAMES: GhostPose[] = [
  // Neutral standing
  {
    nose: [0.5, 0.12],
    lShoulder: [0.38, 0.26], rShoulder: [0.62, 0.26],
    lHip: [0.42, 0.52], rHip: [0.58, 0.52],
    lWrist: [0.32, 0.48], rWrist: [0.68, 0.48],
    lAnkle: [0.44, 0.88], rAnkle: [0.56, 0.88],
  },
  // Left arm raised
  {
    nose: [0.5, 0.12],
    lShoulder: [0.38, 0.26], rShoulder: [0.62, 0.26],
    lHip: [0.42, 0.52], rHip: [0.58, 0.52],
    lWrist: [0.22, 0.10], rWrist: [0.68, 0.50],
    lAnkle: [0.44, 0.88], rAnkle: [0.56, 0.88],
  },
  // Both arms wide open
  {
    nose: [0.5, 0.12],
    lShoulder: [0.36, 0.27], rShoulder: [0.64, 0.27],
    lHip: [0.42, 0.53], rHip: [0.58, 0.53],
    lWrist: [0.08, 0.28], rWrist: [0.92, 0.28],
    lAnkle: [0.43, 0.88], rAnkle: [0.57, 0.88],
  },
  // Right arm raised high
  {
    nose: [0.5, 0.12],
    lShoulder: [0.38, 0.26], rShoulder: [0.62, 0.26],
    lHip: [0.42, 0.52], rHip: [0.58, 0.52],
    lWrist: [0.35, 0.46], rWrist: [0.78, 0.08],
    lAnkle: [0.44, 0.88], rAnkle: [0.56, 0.88],
  },
  // Hands crossed low
  {
    nose: [0.5, 0.12],
    lShoulder: [0.38, 0.27], rShoulder: [0.62, 0.27],
    lHip: [0.42, 0.53], rHip: [0.58, 0.53],
    lWrist: [0.54, 0.68], rWrist: [0.46, 0.68],
    lAnkle: [0.44, 0.88], rAnkle: [0.56, 0.88],
  },
  // Slight lean right, one arm up
  {
    nose: [0.52, 0.13],
    lShoulder: [0.40, 0.27], rShoulder: [0.65, 0.25],
    lHip: [0.44, 0.53], rHip: [0.60, 0.52],
    lWrist: [0.30, 0.50], rWrist: [0.82, 0.12],
    lAnkle: [0.46, 0.88], rAnkle: [0.58, 0.88],
  },
  // Back to neutral
  {
    nose: [0.5, 0.12],
    lShoulder: [0.38, 0.26], rShoulder: [0.62, 0.26],
    lHip: [0.42, 0.52], rHip: [0.58, 0.52],
    lWrist: [0.32, 0.48], rWrist: [0.68, 0.48],
    lAnkle: [0.44, 0.88], rAnkle: [0.56, 0.88],
  },
];

const GHOST_CYCLE_S = 20; // total loop duration

// ── Landmark array shape (minimal) ───────────────────────────────────────────
interface Lm {
  x: number; y: number; z: number; visibility: number;
}

// ── Minimal local typings for the MediaPipe tasks-vision CDN module ──────────
// It is loaded at runtime from a CDN URL and is NOT an installed npm dependency,
// so we can't reference `typeof import("@mediapipe/tasks-vision")` (TS would try
// to resolve the module and fail the build). Declare only what we use.
interface PoseResult { landmarks: Lm[][]; }
interface PoseLandmarkerInst {
  detectForVideo(video: HTMLVideoElement, ts: number): PoseResult;
  close(): void;
}
interface MediaPipeVision {
  FilesetResolver: { forVisionTasks(wasmPath: string): Promise<unknown> };
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
// CDN module URL kept in a variable (non-literal specifier) so TypeScript does
// not attempt static module resolution on it; webpackIgnore keeps the bundler
// from trying to resolve/bundle it either.
const MEDIAPIPE_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/vision_bundle.mjs";
const MEDIAPIPE_WASM =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm";

// Full 33-landmark array; indices we don't use will be zeros
function makeLmArray(pose: GhostPose): Lm[] {
  const arr: Lm[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
  arr[LM_NOSE]       = { x: pose.nose[0],      y: pose.nose[1],      z: 0, visibility: 1 };
  arr[LM_L_SHOULDER] = { x: pose.lShoulder[0], y: pose.lShoulder[1], z: 0, visibility: 1 };
  arr[LM_R_SHOULDER] = { x: pose.rShoulder[0], y: pose.rShoulder[1], z: 0, visibility: 1 };
  arr[LM_L_HIP]      = { x: pose.lHip[0],      y: pose.lHip[1],      z: 0, visibility: 1 };
  arr[LM_R_HIP]      = { x: pose.rHip[0],      y: pose.rHip[1],      z: 0, visibility: 1 };
  arr[LM_L_WRIST]    = { x: pose.lWrist[0],    y: pose.lWrist[1],    z: 0, visibility: 1 };
  arr[LM_R_WRIST]    = { x: pose.rWrist[0],    y: pose.rWrist[1],    z: 0, visibility: 1 };
  arr[LM_L_ANKLE]    = { x: pose.lAnkle[0],    y: pose.lAnkle[1],    z: 0, visibility: 1 };
  arr[LM_R_ANKLE]    = { x: pose.rAnkle[0],    y: pose.rAnkle[1],    z: 0, visibility: 1 };
  return arr;
}

// ── Lerp helpers ──────────────────────────────────────────────────────────────
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpPose(a: GhostPose, b: GhostPose, t: number): GhostPose {
  const lerpPt = (pa: [number, number], pb: [number, number]): [number, number] =>
    [lerp(pa[0], pb[0], t), lerp(pa[1], pb[1], t)];
  return {
    nose:      lerpPt(a.nose, b.nose),
    lShoulder: lerpPt(a.lShoulder, b.lShoulder),
    rShoulder: lerpPt(a.rShoulder, b.rShoulder),
    lHip:      lerpPt(a.lHip, b.lHip),
    rHip:      lerpPt(a.rHip, b.rHip),
    lWrist:    lerpPt(a.lWrist, b.lWrist),
    rWrist:    lerpPt(a.rWrist, b.rWrist),
    lAnkle:    lerpPt(a.lAnkle, b.lAnkle),
    rAnkle:    lerpPt(a.rAnkle, b.rAnkle),
  };
}

// Smooth a scalar value toward target (one-pole lowpass: α = 1 - decay)
function smooth(current: number, target: number, alpha: number): number {
  return current + (target - current) * alpha;
}

// Interpolate between two formant rows
function lerpFormants(a: FormantRow, b: FormantRow, t: number): FormantRow {
  return [
    lerp(a[0], b[0], t),
    lerp(a[1], b[1], t),
    lerp(a[2], b[2], t),
  ];
}

// ── Map wrist Y (0=top, 1=bottom) to a Dorian Hz value ───────────────────────
function wristYToPitch(y: number): number {
  // y=0 (top of frame) → high pitch; y=1 (bottom) → low pitch
  const idx = Math.round((1 - y) * (DORIAN_HZ.length - 1));
  const clamped = Math.max(0, Math.min(DORIAN_HZ.length - 1, idx));
  return DORIAN_HZ[clamped];
}

// ── Compute vowel from body openness ─────────────────────────────────────────
// openness 0 = arms by sides → "oo"; 0.5 = medium → "oh/eh"; 1 = fully open → "ah"
function computeFormants(openness: number): FormantRow {
  const oo = FORMANTS.oo;
  const oh = FORMANTS.oh;
  const ah = FORMANTS.ah;
  const eh = FORMANTS.eh;
  if (openness < 0.33) {
    return lerpFormants(oo, oh, openness / 0.33);
  } else if (openness < 0.66) {
    return lerpFormants(oh, eh, (openness - 0.33) / 0.33);
  } else {
    return lerpFormants(eh, ah, (openness - 0.66) / 0.34);
  }
}

// ── Audio engine ──────────────────────────────────────────────────────────────

interface FormantVoice {
  pulseOsc: OscillatorNode;    // glottal pulse (sawtooth)
  bp1: BiquadFilterNode;       // formant F1
  bp2: BiquadFilterNode;       // formant F2
  bp3: BiquadFilterNode;       // formant F3
  gain: GainNode;              // voice amplitude
  masterGain: GainNode;        // soft envelope / mute
}

interface PadVoice {
  osc: OscillatorNode;
  gain: GainNode;
}

interface AudioEngine {
  ctx: AudioContext;
  voice1: FormantVoice;  // left wrist
  voice2: FormantVoice;  // right wrist
  voice3: FormantVoice;  // ambient left (pad)
  voice4: FormantVoice;  // ambient right (pad)
  padVoices: PadVoice[];
  masterGain: GainNode;
}

function makeFormantVoice(ctx: AudioContext, dest: AudioNode, freq: number, vol: number): FormantVoice {
  const pulseOsc = ctx.createOscillator();
  pulseOsc.type = "sawtooth";
  pulseOsc.frequency.value = freq;

  const bp1 = ctx.createBiquadFilter();
  bp1.type = "bandpass";
  bp1.frequency.value = FORMANTS.oh[0];
  bp1.Q.value = 8;

  const bp2 = ctx.createBiquadFilter();
  bp2.type = "bandpass";
  bp2.frequency.value = FORMANTS.oh[1];
  bp2.Q.value = 10;

  const bp3 = ctx.createBiquadFilter();
  bp3.type = "bandpass";
  bp3.frequency.value = FORMANTS.oh[2];
  bp3.Q.value = 12;

  const gain = ctx.createGain();
  gain.gain.value = 0.28;

  const masterGain = ctx.createGain();
  masterGain.gain.value = vol;

  // Chain: saw → bp1+bp2+bp3 (parallel) → gain → masterGain → dest
  // We split the saw into three parallel bandpass paths
  const splitterGain1 = ctx.createGain();
  splitterGain1.gain.value = 0.45;
  const splitterGain2 = ctx.createGain();
  splitterGain2.gain.value = 0.35;
  const splitterGain3 = ctx.createGain();
  splitterGain3.gain.value = 0.20;

  pulseOsc.connect(splitterGain1);
  pulseOsc.connect(splitterGain2);
  pulseOsc.connect(splitterGain3);

  splitterGain1.connect(bp1);
  splitterGain2.connect(bp2);
  splitterGain3.connect(bp3);

  bp1.connect(gain);
  bp2.connect(gain);
  bp3.connect(gain);

  gain.connect(masterGain);
  masterGain.connect(dest);

  pulseOsc.start();

  return { pulseOsc, bp1, bp2, bp3, gain, masterGain };
}

function buildAudio(): AudioEngine {
  const CtxCtor =
    window.AudioContext ??
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).webkitAudioContext as typeof AudioContext;
  const ctx = new CtxCtor();

  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.5;

  // Soft reverb via delay
  const delay = ctx.createDelay(2.0);
  delay.delayTime.value = 0.35;
  const delayFb = ctx.createGain();
  delayFb.gain.value = 0.38;
  const delayWet = ctx.createGain();
  delayWet.gain.value = 0.22;
  delay.connect(delayFb);
  delayFb.connect(delay);
  masterGain.connect(delay);
  delay.connect(delayWet);
  delayWet.connect(ctx.destination);
  masterGain.connect(ctx.destination);

  // Two active voices driven by wrists
  const voice1 = makeFormantVoice(ctx, masterGain, DORIAN_HZ[2], 0.75); // F3 = 174 Hz
  const voice2 = makeFormantVoice(ctx, masterGain, DORIAN_HZ[4], 0.75); // C4 = 261 Hz

  // Two softer pad voices for ambient chord
  const voice3 = makeFormantVoice(ctx, masterGain, DORIAN_HZ[1], 0.35); // D3
  const voice4 = makeFormantVoice(ctx, masterGain, DORIAN_HZ[5], 0.35); // E4

  // Warm sine pad (always on, very soft)
  const padVoices: PadVoice[] = [73.42, 110.0, 146.83, 220.0].map((f) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = 0.04;
    osc.connect(g);
    g.connect(masterGain);
    osc.start();
    return { osc, gain: g };
  });

  return { ctx, voice1, voice2, voice3, voice4, padVoices, masterGain };
}

function updateVoiceFormants(voice: FormantVoice, formants: FormantRow): void {
  voice.bp1.frequency.value = formants[0];
  voice.bp2.frequency.value = formants[1];
  voice.bp3.frequency.value = formants[2];
}

function setVoicePitch(voice: FormantVoice, hz: number): void {
  voice.pulseOsc.frequency.value = hz;
}

function setVoiceVol(voice: FormantVoice, vol: number): void {
  voice.masterGain.gain.value = vol;
}

// ── Canvas drawing: wooden-mirror style ──────────────────────────────────────

function drawMirror(
  ctx2d: CanvasRenderingContext2D,
  videoEl: HTMLVideoElement,
  landmarks: Lm[],
  W: number,
  H: number,
  isGhost: boolean,
): void {
  ctx2d.clearRect(0, 0, W, H);

  // Draw flipped video to offscreen, sample for silhouette
  // We draw tiles — each tile samples the (flipped) video brightness to
  // determine if it is "in" the body or background. Tiles inside the body
  // silhouette (approximated from landmarks) render as warm matte wood tones;
  // background tiles stay near-black.

  const cols = Math.ceil(W / TILE);
  const rows = Math.ceil(H / TILE);

  // Build a quick silhouette mask using landmark bounding hull + pixel brightness.
  // We draw the video mirrored into a small offscreen canvas to sample brightness.
  const offW = cols;
  const offH = rows;
  const off = new OffscreenCanvas(offW, offH);
  const offCtx = off.getContext("2d");
  if (!offCtx) return;

  // Draw flipped video thumbnail
  offCtx.save();
  offCtx.translate(offW, 0);
  offCtx.scale(-1, 1);
  offCtx.drawImage(videoEl, 0, 0, offW, offH);
  offCtx.restore();

  let pixelData: ImageData | null = null;
  try {
    pixelData = offCtx.getImageData(0, 0, offW, offH);
  } catch {
    // SecurityError in some contexts — fall through to landmark-only mask
  }

  // Build a landmark body polygon for mask in pixel space (mirrored x)
  // Key body points: shoulders, hips, wrists, ankles, nose
  const bodyPoints: [number, number][] = [
    LM_NOSE, LM_L_SHOULDER, LM_R_SHOULDER,
    LM_L_WRIST, LM_R_WRIST,
    LM_L_HIP, LM_R_HIP,
    LM_L_ANKLE, LM_R_ANKLE,
  ].map((idx) => {
    const lm = landmarks[idx];
    // Mirror x (1 - x) to match flipped camera display
    return [(1 - lm.x) * W, lm.y * H] as [number, number];
  });

  // Compute body bounding box + center for approximate hull
  const bx = bodyPoints.map((p) => p[0]);
  const by = bodyPoints.map((p) => p[1]);
  const bLeft  = Math.min(...bx);
  const bRight = Math.max(...bx);
  const bTop   = Math.min(...by);
  const bBot   = Math.max(...by);
  const bCx = (bLeft + bRight) / 2;
  const bCy = (bTop + bBot) / 2;
  // Inflate bounding box by ~30% to encompass full body width
  const bW2 = ((bRight - bLeft) / 2) * 1.35;
  const bH2 = ((bBot - bTop) / 2) * 1.25;

  // Draw tiles
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const px = col * TILE;
      const py = row * TILE;
      const cx = px + TILE / 2;
      const cy = py + TILE / 2;

      // Elliptical body test (rough silhouette)
      const dx = (cx - bCx) / (bW2 + 1);
      const dy = (cy - bCy) / (bH2 + 1);
      const inBody = dx * dx + dy * dy < 1.0;

      // Optionally refine with pixel brightness if we have image data
      let brightness = 0;
      if (pixelData) {
        const sx = Math.min(col, offW - 1);
        const sy = Math.min(row, offH - 1);
        const pi = (sy * offW + sx) * 4;
        const r = pixelData.data[pi];
        const g = pixelData.data[pi + 1];
        const b = pixelData.data[pi + 2];
        brightness = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
      }

      // Combine: body landmark hull OR pixel brightness suggests "person"
      const inSilhouette = inBody || brightness > 0.28;

      // Tile color — warm wood (cream/amber) if in silhouette, near-black if not
      // Vary lightness slightly per-tile for wooden texture feel
      const noise = ((col * 13 + row * 7) % 17) / 17;

      if (inSilhouette) {
        // Warm wood: amber-cream tile, slightly varied
        const l = isGhost
          ? Math.round(lerp(52, 72, noise))
          : Math.round(lerp(60, 82, noise));
        ctx2d.fillStyle = isGhost
          ? `hsl(260, 18%, ${l}%)`
          : `hsl(36, 42%, ${l}%)`;
        ctx2d.shadowColor = "rgba(0,0,0,0.35)";
        ctx2d.shadowBlur = 3;
      } else {
        // Background — near-black, very subtle variation
        const l = Math.round(lerp(6, 11, noise));
        ctx2d.fillStyle = `hsl(240, 8%, ${l}%)`;
        ctx2d.shadowColor = "transparent";
        ctx2d.shadowBlur = 0;
      }

      // Draw tile with 1px gap
      ctx2d.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
    }
  }

  // Reset shadow
  ctx2d.shadowBlur = 0;

  // Overlay wrist marker dots — subtle warm accent
  const wristIndices = [LM_L_WRIST, LM_R_WRIST];
  wristIndices.forEach((idx) => {
    const lm = landmarks[idx];
    if (lm.visibility < 0.4) return;
    const wx = (1 - lm.x) * W;
    const wy = lm.y * H;
    ctx2d.beginPath();
    ctx2d.arc(wx, wy, 7, 0, Math.PI * 2);
    ctx2d.fillStyle = isGhost ? "rgba(167,139,250,0.7)" : "rgba(251,191,36,0.75)";
    ctx2d.fill();
  });
}

// ── Smooth landmarks (one-pole lowpass) ───────────────────────────────────────
function smoothLandmarks(current: Lm[], target: Lm[], alpha: number): Lm[] {
  return current.map((c, i) => {
    const t = target[i];
    return {
      x: smooth(c.x, t.x, alpha),
      y: smooth(c.y, t.y, alpha),
      z: smooth(c.z, t.z, alpha),
      visibility: smooth(c.visibility, t.visibility, alpha),
    };
  });
}

// ── Compute body openness from landmarks ──────────────────────────────────────
function computeOpenness(lms: Lm[]): number {
  const ls = lms[LM_L_SHOULDER];
  const rs = lms[LM_R_SHOULDER];
  const lw = lms[LM_L_WRIST];
  const rw = lms[LM_R_WRIST];
  const shoulderSpan = Math.abs(rs.x - ls.x);           // 0..1
  const wristSpan   = Math.abs(rw.x - lw.x);            // 0..1
  // Openness: normalized ratio of wrist span vs shoulder span
  const raw = Math.min(1, wristSpan / Math.max(shoulderSpan + 0.01, 0.15));
  return Math.max(0, Math.min(1, raw));
}

// ── Compute body height (fraction of frame occupied vertically) ───────────────
function computeBodyHeight(lms: Lm[]): number {
  const nose  = lms[LM_NOSE];
  const lankl = lms[LM_L_ANKLE];
  const rankl = lms[LM_R_ANKLE];
  const topY    = nose.y;
  const bottomY = Math.max(lankl.y, rankl.y);
  return Math.max(0, Math.min(1, bottomY - topY));
}

// ── Ghost pose interpolation ──────────────────────────────────────────────────
function stepGhostPose(t: number): GhostPose {
  const n = GHOST_KEYFRAMES.length;
  const totalSegments = n - 1;
  const frac = (t % GHOST_CYCLE_S) / GHOST_CYCLE_S;
  const pos = frac * totalSegments;
  const idx = Math.floor(pos) % totalSegments;
  const segT = pos - Math.floor(pos);
  // Smooth step for soft easing
  const st = segT * segT * (3 - 2 * segT);
  return lerpPose(GHOST_KEYFRAMES[idx], GHOST_KEYFRAMES[idx + 1], st);
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MirrorChoirPage() {
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGhost, setIsGhost] = useState(false);

  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const videoRef     = useRef<HTMLVideoElement>(null);
  const audioRef     = useRef<AudioEngine | null>(null);
  const rafRef       = useRef<number>(0);
  const landmarkRef  = useRef<Lm[]>(makeLmArray(GHOST_KEYFRAMES[0]));
  const smoothLmRef  = useRef<Lm[]>(makeLmArray(GHOST_KEYFRAMES[0]));

  // Smoothed audio params (avoid zipper noise)
  const smOpenRef    = useRef(0.3);
  const smPitch1Ref  = useRef(DORIAN_HZ[2]);
  const smPitch2Ref  = useRef(DORIAN_HZ[4]);

  // Ghost dancer state
  const ghostStartRef = useRef<number>(0);

  // Camera stream for cleanup
  const streamRef    = useRef<MediaStream | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- only runs on `started` flip
  useEffect(() => {
    if (!started) return;

    let alive = true;

    async function run() {
      setLoading(true);

      // ── 1. Start AudioContext inside the click-triggered effect ──────────
      const audio = buildAudio();
      audioRef.current = audio;
      if (audio.ctx.state === "suspended") {
        await audio.ctx.resume();
      }

      // ── 2. Try camera + MediaPipe ─────────────────────────────────────────
      let usedCamera = false;
      let stream: MediaStream | null = null;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" },
          audio: false,
        });
        streamRef.current = stream;

        const videoEl = videoRef.current!;
        videoEl.srcObject = stream;
        videoEl.muted = true;
        await videoEl.play();

        // Load MediaPipe at runtime from CDN (non-literal specifier; see typings above)
        const vision = (await import(
          /* webpackIgnore: true */ MEDIAPIPE_CDN
        )) as unknown as MediaPipeVision;

        const { FilesetResolver, PoseLandmarker } = vision;
        const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
        const landmarker = await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numPoses: 1,
        });

        usedCamera = true;
        setLoading(false);

        // ── Camera animation loop ──────────────────────────────────────────
        function cameraTick() {
          if (!alive) return;
          rafRef.current = requestAnimationFrame(cameraTick);

          const result = landmarker.detectForVideo(videoEl, performance.now());
          if (result.landmarks && result.landmarks.length > 0) {
            landmarkRef.current = result.landmarks[0] as Lm[];
          }

          renderFrame(false);
        }
        cameraTick();

      } catch {
        // Camera or MediaPipe failed → fall back to ghost dancer
        if (stream) {
          stream.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        usedCamera = false;
      }

      if (!usedCamera) {
        setIsGhost(true);
        ghostStartRef.current = performance.now() / 1000;
        setLoading(false);

        // Ghost animation loop
        function ghostTick() {
          if (!alive) return;
          rafRef.current = requestAnimationFrame(ghostTick);

          const t = performance.now() / 1000 - ghostStartRef.current;
          const pose = stepGhostPose(t);
          landmarkRef.current = makeLmArray(pose);

          renderFrame(true);
        }
        ghostTick();
      }

      // ── Shared render function ─────────────────────────────────────────────
      function renderFrame(ghost: boolean) {
        const canvas = canvasRef.current;
        const video  = videoRef.current;
        if (!canvas || !video) return;

        const W = canvas.width;
        const H = canvas.height;
        const ctx2d = canvas.getContext("2d");
        if (!ctx2d) return;

        // Smooth landmarks
        smoothLmRef.current = smoothLandmarks(
          smoothLmRef.current,
          landmarkRef.current,
          0.14, // ~7fps tracking smoothness
        );
        const lms = smoothLmRef.current;

        // ── Compute audio params from landmarks ──────────────────────────
        const openness = computeOpenness(lms);
        const bodyH    = computeBodyHeight(lms);

        // Openness → vowel formants (shared by all voices)
        smOpenRef.current = smooth(smOpenRef.current, openness, 0.06);
        const formants = computeFormants(smOpenRef.current);

        // Wrist Y → pitch
        const lWristY  = lms[LM_L_WRIST].y;
        const rWristY  = lms[LM_R_WRIST].y;
        const targetP1 = wristYToPitch(lWristY);
        const targetP2 = wristYToPitch(rWristY);
        smPitch1Ref.current = smooth(smPitch1Ref.current, targetP1, 0.04);
        smPitch2Ref.current = smooth(smPitch2Ref.current, targetP2, 0.04);

        // Body height → register shift (0=low body = octave down, 1=tall = nominal)
        const registerShift = lerp(0.75, 1.0, Math.min(1, bodyH / 0.65));

        const audio = audioRef.current;
        if (audio) {
          setVoicePitch(audio.voice1, smPitch1Ref.current * registerShift);
          setVoicePitch(audio.voice2, smPitch2Ref.current * registerShift);
          // Pad voices track wrist voices at fixed interval (a 5th up)
          setVoicePitch(audio.voice3, smPitch1Ref.current * 1.5 * registerShift);
          setVoicePitch(audio.voice4, smPitch2Ref.current * 0.75 * registerShift);

          updateVoiceFormants(audio.voice1, formants);
          updateVoiceFormants(audio.voice2, formants);
          updateVoiceFormants(audio.voice3, formants);
          updateVoiceFormants(audio.voice4, formants);

          // Visibility gating — mute if wrists not visible (camera mode)
          const lVis = lms[LM_L_WRIST].visibility;
          const rVis = lms[LM_R_WRIST].visibility;
          const vol1 = ghost ? 0.75 : Math.max(0.1, Math.min(0.9, lVis));
          const vol2 = ghost ? 0.75 : Math.max(0.1, Math.min(0.9, rVis));
          setVoiceVol(audio.voice1, vol1);
          setVoiceVol(audio.voice2, vol2);
        }

        // ── Draw wooden mirror ─────────────────────────────────────────────
        drawMirror(ctx2d, video, lms, W, H, ghost);
      }
    }

    run();

    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioRef.current?.ctx.close();
      audioRef.current = null;
    };
  }, [started]);

  // Resize canvas to fill container
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  return (
    <div className="relative flex flex-col min-h-screen bg-[#0a0a0f] text-white font-mono overflow-hidden">

      {/* Top-right design notes link */}
      <div className="absolute top-4 right-4 z-20">
        <Link
          href={README_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/55 text-sm hover:text-white/80 transition-colors"
        >
          design notes
        </Link>
      </div>

      {/* Header */}
      <header className="px-6 pt-8 pb-4 z-10">
        <p className="text-white/55 text-xs tracking-widest uppercase mb-1">dream · 287</p>
        <h1 className="text-3xl font-bold tracking-tight text-white/95 mb-2">
          Mirror Choir
        </h1>
        <p className="text-base text-white/75 max-w-md leading-relaxed">
          Your body becomes a choir. Move and you sing — stand still and the voices hold a soft chord.
        </p>
      </header>

      {/* Main canvas area */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 pb-6 relative">

        {/* Canvas (always rendered; hidden until started) */}
        <div
          className="relative w-full max-w-2xl aspect-[4/3] rounded-xl overflow-hidden border border-white/10"
          style={{ display: started ? "block" : "none" }}
        >
          {/* Hidden video element for MediaPipe input */}
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ opacity: 0, pointerEvents: "none" }}
            playsInline
            muted
          />
          {/* Matte wooden mirror canvas */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
          />

          {/* Ghost notice */}
          {isGhost && (
            <div className="absolute bottom-4 left-0 right-0 flex justify-center z-10">
              <span className="text-rose-300 text-sm bg-black/60 rounded-full px-4 py-1">
                Camera unavailable — playing a ghost dancer demo
              </span>
            </div>
          )}

          {/* Loading overlay */}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0f]/80 z-10">
              <div className="text-center">
                <div className="text-violet-400 text-lg mb-2 animate-pulse">
                  summoning the choir…
                </div>
                <div className="text-white/55 text-sm">
                  loading pose model from CDN
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Pre-start card */}
        {!started && (
          <div className="flex flex-col items-center gap-6 max-w-md text-center">

            {/* Large decorative icon suggestion */}
            <div className="w-24 h-24 rounded-full border border-violet-500/30 flex items-center justify-center text-5xl select-none">
              🪞
            </div>

            <div>
              <h2 className="text-xl font-semibold text-white/95 mb-2">
                What if your body became a choir?
              </h2>
              <p className="text-base text-white/75 leading-relaxed">
                Allow camera access and stand back a few feet. Your hands are two
                singing voices — their height in frame sets the pitch. Spread your
                arms to open the vowel; close in to narrow it. Move and the choir
                moves with you.
              </p>
            </div>

            <div className="text-white/55 text-sm leading-relaxed space-y-1">
              <p>D-Dorian chord tones · Klatt-style formant synthesis</p>
              <p>Matte wooden-mirror rendering · 33-point pose tracking</p>
            </div>

            {error && (
              <p className="text-rose-300 text-sm">{error}</p>
            )}

            <button
              onClick={() => {
                setError(null);
                setStarted(true);
              }}
              className="min-h-[44px] px-8 py-2.5 bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white font-semibold rounded-lg transition-colors text-base"
            >
              Begin
            </button>

            <p className="text-white/40 text-xs">
              Camera permission requested · audio starts immediately · nothing is recorded
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="px-6 py-4 border-t border-white/8 text-white/40 text-xs flex justify-between items-center">
        <span>
          ref: Rozin <em>Wooden Mirror</em> (1999) · MediaPipe Pose · Klatt formants
        </span>
        <span>resonance lab</span>
      </footer>
    </div>
  );
}
