"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 18064 · formfold — conduct the arrangement and navigate the form of your own
// recording with your whole body.
//
// A full-body EMBODIED CONDUCTING piece. A laptop/desk webcam sees you seated
// from the waist up; MediaPipe Pose tracks your shoulders/arms/torso. TWO body
// signals drive Karel's REAL recording (never a synth):
//
//   OPENNESS  — wrist-to-wrist span over shoulder width (arm-elevation fallback).
//               Arms in = a thin, quiet, mostly-midrange SOLO CORE. Arms wide =
//               the full arrangement BLOOMS: bass body swells (low-shelf), air
//               opens up (high-shelf), overall density lifts.
//   LEAN      — mirrored horizontal position of (nose + shoulder-centre). Lean
//               left↔right to TRAVEL the piece's FORM: each formal SECTION is a
//               separate looping AudioBufferSourceNode parked on a loopStart/
//               loopEnd span of the SAME buffer, and leaning does an equal-power
//               CROSSFADE between the two nearest section loops (no scrub clicks).
//
// The section boundaries are DERIVED from the analysis' musical DENSITY with a
// lightweight Foote-style novelty curve (self-similar frame diff), NOT by naive
// equal division. If analysis is missing we fall back to equal zones and say so.
//
// INPUT  webcam · MediaPipe Pose (1 body, SHOULDERS-only gate) · openness + lean
// AUDIO  Karel's real take → N section loops (crossfade) → core + full bloom → safeMaster
// OUTPUT Canvas2D figure of light travelling a horizontal FORM MAP · PRISMATIC palette
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { useImmersive, ImmersiveHud, ImmersiveToggle } from "../_shared/immersive";
import { PrototypeNav } from "../_shared/prototype-nav";
import { COLLECTIONS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { loadTrackAnalysis, type TrackAnalysis } from "../_shared/trackAnalysis";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import {
  createPoseTracker,
  startCamera,
  POSE_LM,
  type PoseLandmarkerInst,
  type Landmark,
} from "../_shared/cameraTracking";

// ── Track menu (Karel's real catalog only) ───────────────────────────────────
const WELCOME_HOME = COLLECTIONS[0].tracks;
const DEFAULT_TRACK =
  WELCOME_HOME.find((t) => t.title === "Welcome Home") ?? WELCOME_HOME[0];
const TRACK_MENU = [
  DEFAULT_TRACK,
  WELCOME_HOME.find((t) => t.title === "Interplay"),
  WELCOME_HOME.find((t) => t.title === "2019"),
  WELCOME_HOME.find((t) => t.title === "Isolation"),
  WELCOME_HOME.find((t) => t.title === "Rolling"),
  WELCOME_HOME.find((t) => t.title === "All Together"),
].filter((t): t is (typeof WELCOME_HOME)[number] => Boolean(t));

const LEAN_SENS = 2.6; // how far a lean sweeps the form map
const BG = "#0a0b0f"; // graphite / near-black ground

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// ── Prismatic / spectral palette (art layer — raw hue is fine here) ──────────
// deep violet → cyan → green → gold → red, stepped across sections.
function specHue(t: number): number {
  const stops = [278, 205, 148, 48, 8];
  const x = clamp01(t) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  return stops[i] + (stops[i + 1] - stops[i]) * f;
}

// ── Form derivation (Foote-style novelty over a note/chord feature timeline) ──
interface Section {
  start: number;
  end: number;
  label: string;
  hue: number;
}

function sectionLabel(labels: string[] | null, i: number): string {
  const l = labels?.[i]?.trim();
  if (l) return l;
  const roman = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
  return `Section ${roman[i] ?? i + 1}`;
}

function equalSections(
  duration: number,
  count: number,
  labels: string[] | null,
): Section[] {
  const secs: Section[] = [];
  for (let i = 0; i < count; i++) {
    secs.push({
      start: (duration * i) / count,
      end: (duration * (i + 1)) / count,
      label: sectionLabel(labels, i),
      hue: specHue(count === 1 ? 0 : i / (count - 1)),
    });
  }
  return secs;
}

function normalizeCols(feat: number[][]): void {
  if (feat.length === 0) return;
  const cols = feat[0].length;
  for (let c = 0; c < cols; c++) {
    let mn = Infinity;
    let mx = -Infinity;
    for (const row of feat) {
      if (row[c] < mn) mn = row[c];
      if (row[c] > mx) mx = row[c];
    }
    const span = mx - mn || 1;
    for (const row of feat) row[c] = (row[c] - mn) / span;
  }
}

function meanRange(feat: number[][], a: number, b: number): number[] {
  const cols = feat[0]?.length ?? 0;
  const acc = new Array(cols).fill(0);
  let n = 0;
  const lo = Math.max(0, a);
  const hi = Math.min(feat.length, b);
  for (let i = lo; i < hi; i++) {
    for (let c = 0; c < cols; c++) acc[c] += feat[i][c];
    n++;
  }
  if (n > 0) for (let c = 0; c < cols; c++) acc[c] /= n;
  return acc;
}

function vecDist(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
}

function pickPeaks(nov: number[], want: number, minSep: number): number[] {
  const order: [number, number][] = nov.map((v, i): [number, number] => [v, i]);
  order.sort((x, y) => y[0] - x[0]);
  const chosen: number[] = [];
  for (const [v, i] of order) {
    if (chosen.length >= want) break;
    if (v <= 0) continue;
    if (chosen.every((c) => Math.abs(c - i) >= minSep)) chosen.push(i);
  }
  return chosen;
}

function forceCount(times: number[], need: number, duration: number): number[] {
  const t = [...times].sort((a, b) => a - b);
  while (t.length < need) {
    const b = [0, ...t, duration].sort((x, y) => x - y);
    let best = 0;
    let bi = 0;
    for (let i = 0; i < b.length - 1; i++) {
      const g = b[i + 1] - b[i];
      if (g > best) {
        best = g;
        bi = i;
      }
    }
    t.push((b[bi] + b[bi + 1]) / 2);
    t.sort((x, y) => x - y);
  }
  return t.slice(0, need).sort((a, b) => a - b);
}

function deriveSections(
  analysis: TrackAnalysis | null,
  duration: number,
  labels: string[] | null,
): { sections: Section[]; approximate: boolean } {
  const wantCount = labels && labels.length >= 2 ? Math.min(8, labels.length) : 5;
  const notes = analysis?.notes ?? [];

  if (!analysis || notes.length < 8 || duration <= 0) {
    return { sections: equalSections(duration, wantCount, labels), approximate: true };
  }

  // 1. Coarse feature timeline: ~0.5s frames binning the note roll + chords.
  const frameDur = 0.5;
  const nF = Math.max(4, Math.ceil(duration / frameDur));
  const onset = new Array(nF).fill(0);
  const pitchSum = new Array(nF).fill(0);
  const velSum = new Array(nF).fill(0);
  const cnt = new Array(nF).fill(0);
  for (const n of notes) {
    const fi = Math.min(nF - 1, Math.max(0, Math.floor(n.time / frameDur)));
    onset[fi] += 1;
    pitchSum[fi] += n.midi;
    velSum[fi] += n.velocity;
    cnt[fi] += 1;
  }
  const chordFlag = new Array(nF).fill(0);
  for (const c of analysis.chords ?? []) {
    const fi = Math.min(nF - 1, Math.max(0, Math.floor(c.time / frameDur)));
    chordFlag[fi] = 1;
  }

  // features per frame: [onset-density, mean-pitch, mean-velocity, chord-change]
  const feat: number[][] = [];
  let lastPitch = 60;
  let lastVel = 64;
  for (let i = 0; i < nF; i++) {
    const mp = cnt[i] ? pitchSum[i] / cnt[i] : lastPitch;
    const mv = cnt[i] ? velSum[i] / cnt[i] : lastVel;
    lastPitch = mp;
    lastVel = mv;
    feat.push([onset[i], mp, mv, chordFlag[i]]);
  }
  normalizeCols(feat);

  // 2. Novelty curve: distance between the mean feature of the window BEFORE
  //    and the window AFTER each frame — a simplified Foote checkerboard.
  const L = 4; // ~2s half-window
  const nov = new Array(nF).fill(0);
  for (let t = 0; t < nF; t++) {
    nov[t] = vecDist(meanRange(feat, t - L, t), meanRange(feat, t, t + L));
  }

  // 3. Strongest peaks as boundaries; snap the count to the section labels.
  const minSep = Math.max(4, Math.round(3 / frameDur));
  const peakFrames = pickPeaks(nov, wantCount - 1, minSep);
  let times = peakFrames
    .map((p) => p * frameDur)
    .filter((tm) => tm > 1 && tm < duration - 1);
  times = forceCount(times, wantCount - 1, duration);

  const bounds = [0, ...times, duration];
  const N = bounds.length - 1;
  const sections: Section[] = [];
  for (let i = 0; i < N; i++) {
    sections.push({
      start: bounds[i],
      end: bounds[i + 1],
      label: sectionLabel(labels, i),
      hue: specHue(N === 1 ? 0 : i / (N - 1)),
    });
  }
  return { sections, approximate: false };
}

// ── Body reading (SHOULDERS-only gate; hips synthesized, never required) ─────
interface Skel {
  nose: [number, number];
  ls: [number, number];
  rs: [number, number];
  le: [number, number];
  re: [number, number];
  lw: [number, number];
  rw: [number, number];
  lh: [number, number];
  rh: [number, number];
}

interface BodyReading {
  openness: number;
  leanRaw: number;
  skel: Skel;
}

// A plausible seated figure built purely from openness (pointer/demo/missing limbs).
function synthSkeleton(openness: number, tilt = 0): Skel {
  const spread = 0.6 + openness * 1.9;
  const lift = openness * 1.35;
  const pts: Skel = {
    nose: [0, -1.15],
    ls: [-0.55, 0],
    rs: [0.55, 0],
    le: [-(0.55 + spread * 0.45), 0.15 - lift * 0.5],
    re: [0.55 + spread * 0.45, 0.15 - lift * 0.5],
    lw: [-(0.55 + spread), 0.3 - lift],
    rw: [0.55 + spread, 0.3 - lift],
    lh: [-0.32, 1.7],
    rh: [0.32, 1.7],
  };
  if (tilt !== 0) {
    const co = Math.cos(tilt);
    const si = Math.sin(tilt);
    (Object.keys(pts) as (keyof Skel)[]).forEach((k) => {
      const [x, y] = pts[k];
      pts[k] = [x * co - y * si, x * si + y * co];
    });
  }
  return pts;
}

function readBody(lm: Landmark[]): BodyReading | null {
  const ls = lm[POSE_LM.leftShoulder];
  const rs = lm[POSE_LM.rightShoulder];
  if (!ls || !rs) return null;
  const visL = ls.visibility ?? 1;
  const visR = rs.visibility ?? 1;
  // Gate on SHOULDERS only — never on hips/knees/ankles.
  if (visL < 0.3 || visR < 0.3) return null;

  const shoulderW = Math.hypot(ls.x - rs.x, ls.y - rs.y) + 1e-4;
  const scx = (ls.x + rs.x) / 2;
  const scy = (ls.y + rs.y) / 2;
  const nose = lm[POSE_LM.nose];

  // lean: mirrored horizontal of (nose + shoulder-centre) average.
  const avgX = ((nose?.x ?? scx) + scx) / 2;
  const leanRaw = 1 - avgX;

  const lw = lm[POSE_LM.leftWrist];
  const rw = lm[POSE_LM.rightWrist];
  const lwv = lw?.visibility ?? 0;
  const rwv = rw?.visibility ?? 0;

  let openness: number;
  if (lw && rw && lwv > 0.3 && rwv > 0.3) {
    const span = Math.hypot(lw.x - rw.x, lw.y - rw.y);
    openness = clamp01((span / shoulderW - 0.8) / (3.0 - 0.8));
  } else {
    // fallback: arm elevation = wrist/elbow height above shoulders.
    const le = lm[POSE_LM.leftElbow];
    const re = lm[POSE_LM.rightElbow];
    const pL = lw && lwv > 0.2 ? lw : le;
    const pR = rw && rwv > 0.2 ? rw : re;
    let elev = 0;
    let n = 0;
    if (pL) {
      elev += (scy - pL.y) / shoulderW;
      n++;
    }
    if (pR) {
      elev += (scy - pR.y) / shoulderW;
      n++;
    }
    openness = n ? clamp01((elev / n + 0.2) / 1.2) : 0.2;
  }

  // build a local, mirrored, scale-normalized skeleton; synthesize any low-vis
  // limb (and always the hips) so a bare shoulders-only frame still draws.
  const synth = synthSkeleton(openness);
  const scxM = 1 - scx;
  const local = (p: Landmark | undefined, fallback: [number, number]): [number, number] => {
    if (!p || (p.visibility ?? 1) < 0.3) return fallback;
    return [((1 - p.x) - scxM) / shoulderW, (p.y - scy) / shoulderW];
  };

  const skel: Skel = {
    nose: local(nose, synth.nose),
    ls: local(ls, synth.ls),
    rs: local(rs, synth.rs),
    le: local(lm[POSE_LM.leftElbow], synth.le),
    re: local(lm[POSE_LM.rightElbow], synth.re),
    lw: local(lw, synth.lw),
    rw: local(rw, synth.rw),
    lh: synth.lh, // hips ALWAYS synthesized — desk cam can't see them
    rh: synth.rh,
  };
  return { openness, leanRaw, skel };
}

// ── Audio engine ─────────────────────────────────────────────────────────────
interface Engine {
  ctx: AudioContext;
  master: SafeMaster;
  sources: AudioBufferSourceNode[];
  sectionGains: GainNode[];
  lowShelf: BiquadFilterNode;
  highShelf: BiquadFilterNode;
  fullGain: GainNode;
  coreGain: GainNode;
  freq: Uint8Array<ArrayBuffer>;
  n: number;
}

// ── The stage: figure of light travelling a horizontal FORM MAP ──────────────
function drawStage(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  sections: Section[],
  gains: number[],
  skel: Skel,
  openness: number,
  energy: number,
  position: number,
  activeHue: number,
  time: number,
  showLabels: boolean,
): void {
  // afterglow wash — motion trails, NOT film grain / noise.
  g.globalCompositeOperation = "source-over";
  g.fillStyle = "rgba(10, 11, 15, 0.30)";
  g.fillRect(0, 0, w, h);

  const N = sections.length;
  const marginX = w * 0.1;
  const usable = w - marginX * 2;
  const midY = h * 0.52;
  const stationX = (i: number): number =>
    marginX + (N === 1 ? 0.5 : i / (N - 1)) * usable;

  g.globalCompositeOperation = "lighter";
  g.lineCap = "round";
  g.lineJoin = "round";

  // 1. the form track — a faint spine linking the section stations
  g.strokeStyle = "rgba(150, 160, 190, 0.10)";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(stationX(0), midY);
  for (let i = 1; i < N; i++) g.lineTo(stationX(i), midY);
  g.stroke();

  // 2. each SECTION station — lights up with its crossfade gain (active brightest)
  for (let i = 0; i < N; i++) {
    const x = stationX(i);
    const gain = gains[i] ?? 0;
    const bright = 0.1 + gain * 0.9;
    const hue = sections[i].hue;
    const rad = 26 + gain * 64 + energy * 22 * gain;
    const rg = g.createRadialGradient(x, midY, 0, x, midY, rad);
    rg.addColorStop(0, `hsla(${hue}, 92%, ${60 + gain * 18}%, ${0.28 + bright * 0.55})`);
    rg.addColorStop(0.5, `hsla(${hue}, 90%, 55%, ${bright * 0.3})`);
    rg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = rg;
    g.beginPath();
    g.arc(x, midY, rad, 0, Math.PI * 2);
    g.fill();

    // pulse marker at the station core
    const core = 2 + gain * 5;
    g.fillStyle = `hsla(${hue}, 96%, ${72 + gain * 20}%, ${0.4 + bright * 0.5})`;
    g.beginPath();
    g.arc(x, midY, core, 0, Math.PI * 2);
    g.fill();

    if (showLabels) {
      g.globalCompositeOperation = "source-over";
      g.font = "600 11px ui-sans-serif, system-ui, sans-serif";
      g.textAlign = "center";
      g.fillStyle = `hsla(${hue}, 60%, 78%, ${0.35 + gain * 0.55})`;
      g.fillText(sections[i].label, x, midY + 46);
      g.globalCompositeOperation = "lighter";
    }
  }

  // 3. the figure of light — placed at the LEAN position on the map, posed by
  //    the tracked body, blooming with OPENNESS.
  const fx = marginX + position * usable;
  const fy = midY - h * 0.02;
  const scale = h * 0.15;
  const px = (p: [number, number]): [number, number] => [
    fx + p[0] * scale,
    fy + p[1] * scale,
  ];

  // ground bloom under the figure — grows with openness + audio energy
  const bloomR = scale * (1.1 + openness * 2.4 + energy * 0.8);
  const groundGrad = g.createRadialGradient(fx, fy + scale * 0.2, 0, fx, fy + scale * 0.2, bloomR);
  groundGrad.addColorStop(0, `hsla(${activeHue}, 88%, 62%, ${0.1 + openness * 0.28})`);
  groundGrad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = groundGrad;
  g.beginPath();
  g.arc(fx, fy + scale * 0.2, bloomR, 0, Math.PI * 2);
  g.fill();

  // limbs — glowing capsule strokes
  const bone = (a: [number, number], b: [number, number], width: number, alpha: number) => {
    const A = px(a);
    const B = px(b);
    g.strokeStyle = `hsla(${activeHue}, 90%, ${64 + openness * 16}%, ${alpha})`;
    g.lineWidth = width;
    g.beginPath();
    g.moveTo(A[0], A[1]);
    g.lineTo(B[0], B[1]);
    g.stroke();
  };
  const spine = openness;
  const midHip: [number, number] = [(skel.lh[0] + skel.rh[0]) / 2, (skel.lh[1] + skel.rh[1]) / 2];
  const midSh: [number, number] = [(skel.ls[0] + skel.rs[0]) / 2, (skel.ls[1] + skel.rs[1]) / 2];
  // torso fill (a soft luminous body)
  const T = [skel.ls, skel.rs, skel.rh, skel.lh].map(px);
  g.fillStyle = `hsla(${activeHue}, 82%, 58%, ${0.08 + spine * 0.16})`;
  g.beginPath();
  g.moveTo(T[0][0], T[0][1]);
  for (let i = 1; i < T.length; i++) g.lineTo(T[i][0], T[i][1]);
  g.closePath();
  g.fill();
  // glow pass then bright core pass for every limb
  const limbs: [keyof Skel | "midHip" | "midSh", keyof Skel | "midHip" | "midSh"][] = [
    ["ls", "rs"],
    ["ls", "le"],
    ["le", "lw"],
    ["rs", "re"],
    ["re", "rw"],
    ["midSh", "midHip"],
    ["lh", "rh"],
  ];
  const pt = (k: keyof Skel | "midHip" | "midSh"): [number, number] =>
    k === "midHip" ? midHip : k === "midSh" ? midSh : skel[k];
  for (const [a, b] of limbs) {
    bone(pt(a), pt(b), 10 + openness * 16, 0.1 + openness * 0.16);
    bone(pt(a), pt(b), 2.5 + openness * 3, 0.4 + openness * 0.4);
  }
  // luminous joints
  for (const k of ["nose", "ls", "rs", "le", "re", "lw", "rw"] as (keyof Skel)[]) {
    const P = px(skel[k]);
    const r = k === "nose" ? scale * 0.16 : k === "lw" || k === "rw" ? scale * 0.11 : scale * 0.07;
    const jg = g.createRadialGradient(P[0], P[1], 0, P[0], P[1], r * 2.2);
    jg.addColorStop(0, `hsla(${activeHue}, 96%, 82%, ${0.5 + openness * 0.4})`);
    jg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = jg;
    g.beginPath();
    g.arc(P[0], P[1], r * 2.2, 0, Math.PI * 2);
    g.fill();
  }

  // 4. bloom particles — density and reach scale with openness (idle = alive)
  const count = Math.round(28 + openness * 96);
  const chx = fx;
  const chy = fy + scale * 0.15;
  for (let k = 0; k < count; k++) {
    const ph = (k / count) * Math.PI * 2;
    const orbit = scale * (0.6 + openness * 2.1) * (0.55 + 0.45 * Math.sin(ph * 3 + time * 0.5 + k));
    const wob = time * (0.15 + (k % 5) * 0.03) + ph * 2;
    const x = chx + Math.cos(ph + time * 0.1) * orbit;
    const y = chy + Math.sin(ph + time * 0.1) * orbit * 0.7 + Math.sin(wob) * scale * 0.06;
    const hue = specHue(clamp01(position + Math.sin(ph) * 0.12));
    const r = 0.8 + openness * 2.4 + energy * 1.6;
    g.fillStyle = `hsla(${hue}, 92%, ${66 + energy * 20}%, ${0.06 + openness * 0.24})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
}

type Phase = "idle" | "loading" | "running" | "error";
type CamState = "off" | "requesting" | "live" | "lost" | "denied" | "failed";
type ControlLabel = "demo" | "live" | "pointer" | "lost";

export default function Formfold() {
  const { immersive, toggle } = useImmersive();
  const [phase, setPhase] = useState<Phase>("idle");
  const [camState, setCamState] = useState<CamState>("off");
  const [controlLabel, setControlLabel] = useState<ControlLabel>("demo");
  const [trackId, setTrackId] = useState<string>(DEFAULT_TRACK.id);
  const [trackTitle, setTrackTitle] = useState<string>(DEFAULT_TRACK.title);
  const [showNotes, setShowNotes] = useState(false);
  const [errMsg, setErrMsg] = useState<string>("");
  const [approximate, setApproximate] = useState(false);
  const [sectionMeta, setSectionMeta] = useState<{ label: string; hue: number }[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [no2d, setNo2d] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const engineRef = useRef<Engine | null>(null);
  const trackerRef = useRef<PoseLandmarkerInst | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const sectionsRef = useRef<Section[]>([]);

  const immersiveRef = useRef(immersive);
  useEffect(() => {
    immersiveRef.current = immersive;
  }, [immersive]);

  const camWantRef = useRef(false);
  const lastBodyRef = useRef<number>(0);
  const neutralRef = useRef<number | null>(null);
  const recenterRef = useRef(false);

  // smoothed control state
  const opennessRef = useRef(0.35);
  const positionRef = useRef(0.5);
  const skelRef = useRef<Skel>(synthSkeleton(0.35));
  const gainsRef = useRef<number[]>([]);

  const pointerRef = useRef<{ active: boolean; x: number; y: number }>({
    active: false,
    x: 0.5,
    y: 0.5,
  });

  const resize = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(c.clientWidth * dpr));
    const h = Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
  }, []);

  useEffect(() => {
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  const recenter = useCallback(() => {
    recenterRef.current = true;
  }, []);

  // ── single control + render loop ────────────────────────────────────────────
  const runFrame = useCallback(() => {
    const now = performance.now();
    const t = now / 1000;
    const eng = engineRef.current;

    let targetOpen = opennessRef.current;
    let targetPos = positionRef.current;
    let targetSkel: Skel | null = null;
    let label: ControlLabel = "demo";

    if (camWantRef.current && trackerRef.current && videoRef.current) {
      const video = videoRef.current;
      let body: BodyReading | null = null;
      if (video.readyState >= 2) {
        try {
          const res = trackerRef.current.detectForVideo(video, now);
          const lm = res.landmarks?.[0];
          if (lm && lm.length >= 13) body = readBody(lm);
        } catch {
          /* transient detector hiccup — hold last frame */
        }
      }
      if (body) {
        lastBodyRef.current = now;
        label = "live";
        setCamState((s) => (s === "live" ? s : "live"));
        // auto-calibrate neutral on first live frame (or on Recenter)
        if (neutralRef.current === null || recenterRef.current) {
          neutralRef.current = body.leanRaw;
          recenterRef.current = false;
        }
        targetOpen = body.openness;
        targetPos = clamp01(0.5 + (body.leanRaw - neutralRef.current) * LEAN_SENS);
        targetSkel = body.skel;
      } else if (now - lastBodyRef.current > 900) {
        label = "lost";
        setCamState((s) => (s === "lost" ? s : "lost"));
        // hold last openness/position; skeleton drifts gently
        targetSkel = synthSkeleton(opennessRef.current, Math.sin(t * 0.6) * 0.05);
      } else {
        label = "live";
        targetSkel = skelRef.current;
      }
    } else if (pointerRef.current.active) {
      // pointer fallback: mouse-x = lean/travel, mouse-y = openness.
      label = "pointer";
      targetPos = pointerRef.current.x;
      targetOpen = clamp01(1 - pointerRef.current.y);
      targetSkel = synthSkeleton(targetOpen);
    } else {
      // autonomous demo — slow auto-travel + breathing openness, clearly labelled.
      label = "demo";
      targetPos = 0.5 + 0.5 * Math.sin(t * 0.12);
      targetOpen = 0.5 + 0.42 * Math.sin(t * 0.19 + 1.1);
      targetSkel = synthSkeleton(targetOpen, Math.sin(t * 0.4) * 0.06);
    }
    setControlLabel((c) => (c === label ? c : label));

    // smooth (light — a body gesture reads within ~0.1–0.15s)
    opennessRef.current += (targetOpen - opennessRef.current) * 0.14;
    positionRef.current += (targetPos - positionRef.current) * 0.12;
    if (targetSkel) {
      const s = skelRef.current;
      const keys = Object.keys(s) as (keyof Skel)[];
      for (const k of keys) {
        s[k][0] += (targetSkel[k][0] - s[k][0]) * 0.25;
        s[k][1] += (targetSkel[k][1] - s[k][1]) * 0.25;
      }
    }

    const openness = opennessRef.current;
    const position = positionRef.current;

    // ── equal-power crossfade between the two nearest section loops ───────────
    const sections = sectionsRef.current;
    const N = sections.length;
    const gains = gainsRef.current;
    if (gains.length !== N) gainsRef.current = new Array(N).fill(0);
    const g2 = gainsRef.current;
    for (let i = 0; i < N; i++) g2[i] = 0;
    if (N > 0) {
      const f = position * (N - 1);
      const lo = Math.floor(f);
      const hi = Math.min(N - 1, lo + 1);
      const frac = f - lo;
      g2[lo] += Math.cos((frac * Math.PI) / 2);
      g2[hi] += Math.sin((frac * Math.PI) / 2);
      const near = frac < 0.5 ? lo : hi;
      setActiveIdx((a) => (a === near ? a : near));
    }

    // ── push to audio (setTargetAtTime ~0.14 → no clicks) ─────────────────────
    let energy = 0;
    if (eng) {
      const t0 = eng.ctx.currentTime;
      const tc = 0.14;
      for (let i = 0; i < eng.n; i++) {
        eng.sectionGains[i].gain.setTargetAtTime(g2[i] ?? 0, t0, tc);
      }
      // OPENNESS → arrangement density: bass body, air, and full-bloom gain.
      eng.lowShelf.gain.setTargetAtTime(-7 + openness * 11, t0, tc); // bass swell
      eng.highShelf.gain.setTargetAtTime(-9 + openness * 13, t0, tc); // air
      eng.fullGain.gain.setTargetAtTime(0.05 + openness * 0.85, t0, tc); // density
      eng.coreGain.gain.setTargetAtTime(0.34 + (1 - openness) * 0.16, t0, tc); // solo core
      // analyser energy for reactive glow
      eng.master.analyser.getByteFrequencyData(eng.freq);
      let sum = 0;
      for (let b = 0; b < eng.freq.length; b++) sum += eng.freq[b];
      energy = clamp01(sum / eng.freq.length / 170);
    }

    // ── draw ──────────────────────────────────────────────────────────────────
    const c = canvasRef.current;
    if (c && N > 0) {
      const gtx = c.getContext("2d");
      if (gtx) {
        const activeHue = specHue(position);
        drawStage(
          gtx,
          c.width,
          c.height,
          sections,
          g2,
          skelRef.current,
          openness,
          energy,
          position,
          activeHue,
          t,
          !immersiveRef.current,
        );
      }
    }

    rafRef.current = requestAnimationFrame(runFrame);
  }, []);

  // ── start audio + form + visuals (user gesture) ─────────────────────────────
  const begin = useCallback(async () => {
    if (phase === "loading" || phase === "running") return;
    setPhase("loading");
    setErrMsg("");
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      await ctx.resume();

      const master = createSafeMaster(ctx);
      const { buffer, title } = await loadRealTrackBuffer(ctx, trackId);
      setTrackTitle(title);

      // derive the FORM from musical density (Foote-style novelty)
      const analysis = await loadTrackAnalysis(trackId);
      const labels = analysis?.summary?.sections?.map((s) => s.label) ?? null;
      const { sections, approximate: approx } = deriveSections(
        analysis,
        buffer.duration,
        labels,
      );
      sectionsRef.current = sections;
      setApproximate(approx);
      setSectionMeta(sections.map((s) => ({ label: s.label, hue: s.hue })));

      // ── audio graph ──────────────────────────────────────────────────────
      // each SECTION = one looping source parked on a loopStart/loopEnd span of
      // the SAME buffer; a section gain crossfades them (lean → travel).
      const sources: AudioBufferSourceNode[] = [];
      const sectionGains: GainNode[] = [];

      // sum bus feeds two parallel processing paths (core + full bloom)
      const sumBus = ctx.createGain();
      sumBus.gain.value = 1;

      for (const sec of sections) {
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        src.loopStart = Math.max(0, Math.min(sec.start, buffer.duration - 0.05));
        src.loopEnd = Math.max(src.loopStart + 0.1, Math.min(sec.end, buffer.duration));
        const gain = ctx.createGain();
        gain.gain.value = 0;
        src.connect(gain);
        gain.connect(sumBus);
        sources.push(src);
        sectionGains.push(gain);
      }

      // CORE path: a midrange solo that is ALWAYS alive (dominates when closed)
      const coreFilter = ctx.createBiquadFilter();
      coreFilter.type = "bandpass";
      coreFilter.frequency.value = 900;
      coreFilter.Q.value = 0.85;
      const coreGain = ctx.createGain();
      coreGain.gain.value = 0.4;
      sumBus.connect(coreFilter);
      coreFilter.connect(coreGain);
      coreGain.connect(master.input);

      // FULL bloom path: openness swells bass body + air, then a density gain
      const lowShelf = ctx.createBiquadFilter();
      lowShelf.type = "lowshelf";
      lowShelf.frequency.value = 220;
      lowShelf.gain.value = -7;
      const highShelf = ctx.createBiquadFilter();
      highShelf.type = "highshelf";
      highShelf.frequency.value = 4200;
      highShelf.gain.value = -9;
      const fullGain = ctx.createGain();
      fullGain.gain.value = 0.05;
      sumBus.connect(lowShelf);
      lowShelf.connect(highShelf);
      highShelf.connect(fullGain);
      fullGain.connect(master.input);

      // start every section loop from its own span start, in sync
      for (let i = 0; i < sources.length; i++) {
        sources[i].start(0, sources[i].loopStart);
      }

      engineRef.current = {
        ctx,
        master,
        sources,
        sectionGains,
        lowShelf,
        highShelf,
        fullGain,
        coreGain,
        freq: new Uint8Array(master.analyser.frequencyBinCount),
        n: sources.length,
      };

      resize();
      setPhase("running");
      rafRef.current = requestAnimationFrame(runFrame);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "could not start audio");
      setPhase("error");
    }
  }, [phase, trackId, resize, runFrame]);

  // ── enable camera (separate opt-in for the permission prompt) ───────────────
  const enableCamera = useCallback(async () => {
    if (!videoRef.current) return;
    setCamState("requesting");
    try {
      const tracker = await createPoseTracker(1);
      trackerRef.current = tracker;
      const stream = await startCamera(videoRef.current);
      streamRef.current = stream;
      camWantRef.current = true;
      neutralRef.current = null; // recalibrate neutral on next live frame
      lastBodyRef.current = performance.now();
      setCamState("live");
    } catch (e) {
      camWantRef.current = false;
      const msg = e instanceof Error ? e.message : "";
      if (/denied|Permission|NotAllowed/i.test(msg)) setCamState("denied");
      else setCamState("failed");
    }
  }, []);

  // ── pointer fallback ────────────────────────────────────────────────────────
  const readPointer = useCallback((clientX: number, clientY: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    pointerRef.current.x = clamp01((clientX - r.left) / r.width);
    pointerRef.current.y = clamp01((clientY - r.top) / r.height);
  }, []);
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (camWantRef.current) return; // live body wins
      pointerRef.current.active = true;
      readPointer(e.clientX, e.clientY);
    },
    [readPointer],
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (camWantRef.current || !pointerRef.current.active) return;
      readPointer(e.clientX, e.clientY);
    },
    [readPointer],
  );
  const onPointerUp = useCallback(() => {
    pointerRef.current.active = false;
  }, []);

  // ── WebGL2/Canvas2D capability note ─────────────────────────────────────────
  useEffect(() => {
    const c = document.createElement("canvas");
    if (!c.getContext("2d")) setNo2d(true);
  }, []);

  // ── teardown ────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      const eng = engineRef.current;
      try {
        eng?.sources.forEach((s) => s.stop());
      } catch {
        /* already stopped */
      }
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      try {
        trackerRef.current?.close();
      } catch {
        /* noop */
      }
      if (eng) {
        eng.master.disconnect();
        if (eng.ctx.state !== "closed") eng.ctx.close().catch(() => {});
      }
    };
  }, []);

  const running = phase === "running";
  const camLive = camState === "live";
  const camBad = camState === "denied" || camState === "failed";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div
        ref={wrapRef}
        className="fixed inset-0 h-dvh w-full touch-none overflow-hidden"
        style={{ backgroundColor: BG }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        <video ref={videoRef} className="hidden" playsInline muted />

        {/* start overlay */}
        {!running && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-black/70 px-6 text-center backdrop-blur-sm">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              conduct the arrangement · navigate the form · with your whole body
            </p>
            <h1 className="max-w-2xl text-2xl font-semibold tracking-tight text-foreground">
              Open your arms to bloom the full arrangement of Karel&apos;s
              recording; pull them in for a quiet solo core. Lean left↔right to
              travel the piece&apos;s sections.
            </h1>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {TRACK_MENU.map((tk) => (
                <button
                  key={tk.id}
                  type="button"
                  onClick={() => setTrackId(tk.id)}
                  className={
                    "min-h-[44px] rounded-md border px-4 text-sm transition-colors " +
                    (trackId === tk.id
                      ? "border-primary bg-primary/15 text-foreground"
                      : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground")
                  }
                >
                  {tk.title}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={begin}
              disabled={phase === "loading"}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {phase === "loading" ? "loading Karel's recording…" : "Begin"}
            </button>
            {no2d && (
              <p className="max-w-md text-sm text-destructive">
                This browser has no 2D canvas — the visualization can&apos;t render here.
              </p>
            )}
            {phase === "error" && (
              <p className="max-w-md text-sm text-destructive">{errMsg}</p>
            )}
          </div>
        )}

        {/* tracking-status line — visible whenever running */}
        {running && (
          <div className="pointer-events-none absolute left-4 top-4 z-30 font-mono text-xs uppercase tracking-[0.18em]">
            {camLive && controlLabel === "live" ? (
              <span className="text-muted-foreground">
                tracking · live · section {activeIdx + 1}/{sectionMeta.length}
              </span>
            ) : controlLabel === "lost" ? (
              <span className="text-destructive">
                body lost · face the camera, shoulders in frame
              </span>
            ) : camBad ? (
              <span className="text-destructive">
                {camState === "denied" ? "camera denied · " : "camera failed · "}
                <span className="text-muted-foreground">
                  drag: x = lean/travel · y = openness
                </span>
              </span>
            ) : controlLabel === "pointer" ? (
              <span className="text-muted-foreground">
                pointer · drag x = travel form · drag up = open arrangement
              </span>
            ) : (
              <span className="text-muted-foreground">
                demo — no body detected · enable camera to conduct
              </span>
            )}
          </div>
        )}

        {/* approximate-form notice (Foote fallback) */}
        {running && approximate && (
          <div className="pointer-events-none absolute left-4 top-10 z-30 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground/70">
            form map approximate · analysis unavailable · equal zones
          </div>
        )}

        {/* chrome (hidden while immersive) */}
        {running && !immersive && (
          <>
            <div className="absolute right-4 top-4 z-30 flex items-center gap-2">
              <button
                type="button"
                onClick={recenter}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Recenter
              </button>
              {!camLive && (
                <button
                  type="button"
                  onClick={enableCamera}
                  disabled={camState === "requesting"}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
                >
                  {camState === "requesting" ? "starting camera…" : "Enable camera"}
                </button>
              )}
              <ImmersiveToggle immersive={immersive} onToggle={toggle} />
            </div>

            {/* form legend + copy strip below the fold */}
            <div className="absolute bottom-16 left-4 z-30 max-w-xl space-y-2">
              <div className="flex flex-wrap gap-2">
                {sectionMeta.map((s, i) => (
                  <span
                    key={i}
                    className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.18em]"
                    style={{ color: i === activeIdx ? `hsl(${s.hue} 70% 72%)` : undefined }}
                  >
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: `hsl(${s.hue} 85% 60%)`, opacity: i === activeIdx ? 1 : 0.4 }}
                    />
                    <span className={i === activeIdx ? "" : "text-muted-foreground/70"}>{s.label}</span>
                  </span>
                ))}
              </div>
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                18064 · formfold — {trackTitle}
              </p>
              <p className="text-base text-muted-foreground">
                Open your arms to bloom the full arrangement · pull in for a quiet
                solo core · lean left↔right to travel the derived sections · press
                Recenter if the neutral drifts.
              </p>
              <button
                type="button"
                onClick={() => setShowNotes(true)}
                className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                Read the design notes
              </button>
            </div>
          </>
        )}

        {/* immersive HUD */}
        {running && immersive && (
          <ImmersiveHud
            immersive={immersive}
            onToggle={toggle}
            title="Formfold"
            description="Conduct the arrangement and navigate the form of Karel's real recording with your whole body. Camera-tracked openness (arm span) blooms or contracts the arrangement — a quiet solo midrange core when your arms are in, the full texture with bass body and air when they are wide. Leaning left↔right travels the piece's sections, derived from musical density and crossfaded so the form is continuous and clean."
            howTo={[
              "Allow the camera",
              "Open your arms to bloom the full arrangement; pull them in for a solo core",
              "Lean left↔right to travel the piece's sections",
              "Press Recenter if the neutral drifts",
              "Press f for fullscreen, i for info",
            ]}
          />
        )}

        {/* design-notes modal */}
        {showNotes && (
          <div
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
            onClick={() => setShowNotes(false)}
          >
            <div
              className="max-h-[85vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="mb-3 text-xl font-semibold tracking-tight text-foreground">
                formfold — an embodied arrangement + form conductor
              </h2>
              <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
                <p>
                  A desk webcam sees you seated from the waist up. MediaPipe Pose
                  tracks one body, gated on your SHOULDERS only — hips, knees and
                  ankles are never required (the hips of the on-screen figure are
                  synthesized). Two whole-body signals transform Karel&apos;s real
                  recording; nothing here is synthesized audio.
                </p>
                <p>
                  OPENNESS is your wrist-to-wrist span over shoulder width (falling
                  back to arm-elevation when your wrists drop out of frame). Arms in
                  gives a thin, quiet, mostly-midrange solo core; arms wide blooms
                  the full arrangement — a low-shelf bass swell, a high-shelf air
                  lift and an overall density gain, all ramped with
                  <code> setTargetAtTime(…, 0.14)</code> so nothing clicks.
                </p>
                <p>
                  LEAN is the mirrored horizontal position of your nose and
                  shoulder-centre, auto-calibrated to a neutral centre on start
                  (with a Recenter button). Leaning travels the FORM: each formal
                  SECTION is a separate looping source parked on a loopStart/loopEnd
                  span of the SAME buffer, and leaning does an equal-power crossfade
                  between the two nearest section loops — no scrubbing, no clicks.
                </p>
                <p>
                  The section boundaries are DERIVED, not evenly divided. We bin the
                  analysis&apos; note roll and chords into ~0.5s frames (onset
                  density, mean pitch, mean velocity, chord-change), then compute a
                  Foote-style novelty curve — the feature distance between the
                  window before and after each frame — and take its strongest peaks
                  as boundaries, snapping the count to the analysis&apos; section
                  labels. If no analysis is available we fall back to equal zones and
                  say so on screen.
                </p>
                <p>
                  The visual is a figure of light — a luminous body built from your
                  tracked shoulders/arms/torso — travelling a horizontal form map
                  whose section stations light up as you enter them (the crossfading
                  pair brightest). Texture and particle density bloom with openness;
                  each section carries its own spectral hue, deep violet through
                  cyan, green and gold to red, on a graphite ground. With no camera
                  it degrades to a labelled auto-travel demo and a pointer fallback
                  (drag x = travel, up = open). Every audible node terminates in the
                  shared ear-safety master, never the raw destination.
                </p>
                <p className="text-muted-foreground/80">
                  Reference: J. Foote, &ldquo;Automatic Audio Segmentation Using a
                  Measure of Audio Novelty&rdquo; (IEEE ICME 2000) — the
                  self-similarity + checkerboard-kernel novelty method this form map
                  is a lightweight approximation of.
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
        )}
      </div>

      {!immersive && <PrototypeNav slugs={["18064-formfold"]} />}
    </main>
  );
}
