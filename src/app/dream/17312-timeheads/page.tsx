"use client";

/* ── 17312 · Timeheads ──────────────────────────────────────────────────────
 *
 *  ONE QUESTION: what if each of my two hands were an independent tape head
 *  reading a DIFFERENT moment of the SAME solo-piano recording at once — so I
 *  could weave live counterpoint out of one monophonic take, conducting it with
 *  my bare hands via webcam?
 *
 *  This is an EMBODIED CAMERA-CONDUCTING piece. Karel's one real piano take is
 *  loaded ONCE into an AudioBuffer. TWO independent granular playheads read it
 *  at the same time — one per hand — each continuously scheduling short grains
 *  (~40–120 ms) sliced live from HIS recording. Your hands do not make sound;
 *  they CONDUCT where in his take each head reads, how fast, how dense, and how
 *  the two voices harmonise. One monophonic take becomes a live two-voice canon.
 *
 *  Per hand, every frame (smoothed):
 *    · horizontal position → that head's PLAYHEAD position in the recording
 *                            (and its STEREO PAN: left hand left, right hand right)
 *    · height             → that head's grain PITCH / playbackRate (0.5×…2.0×)
 *    · openness           → that head's grain DENSITY (fist ≈ 6/s … open ≈ 60/s)
 *    · fist               → MUTE that voice (fades out; release brings it back)
 *    · vertical gap       → a musical INTERVAL added to the second voice, so the
 *                           two heads harmonise rather than clash — intentional
 *                           counterpoint, not noise.
 *
 *  VISUAL (three.js additive points): two braided light-streams of grain-motes —
 *  one silver, one brand-violet — riding on a shared faint "time ribbon" (the
 *  take's downsampled RMS), each at its playhead's X, Y = pitch, brightness =
 *  amplitude, trailing and fading. When the two heads CONVERGE (hands cross /
 *  same moment) the streams braid and brighten into a visible/audible unison.
 *
 *  Degrades gracefully: no camera → pointer drives head A, on-screen controls
 *  drive head B (counterpoint still demonstrable); no WebGL → Canvas2D motes;
 *  audio always plays through the shared safeMaster ear-safety bus.
 *
 *  References — see README.md.
 * ──────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as THREE from "three";
import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import {
  createHandTracker,
  startCamera,
  computeHandFeatures,
  type HandLandmarkerInst,
  type Landmark,
} from "../_shared/cameraTracking";
import { PrototypeNav } from "../_shared/prototype-nav";

// ── constants ────────────────────────────────────────────────────────────────
const DEFAULT_TRACK =
  REAL_TRACKS.find((t) => t.title === "Interplay")?.id ?? REAL_TRACKS[0].id;

const LOOKAHEAD = 0.1; // s — how far ahead grains are scheduled (latency budget)
const GRAIN_MIN = 0.05; // s
const GRAIN_MAX = 0.11; // s
const DENSITY_MIN = 6; // grains / sec (fist)
const DENSITY_MAX = 60; // grains / sec (open)
const VOICE_GAIN = 0.85;

const MOTE_COUNT = 2400;
const CONV_WIDTH = 0.16; // playhead-normalised distance under which heads "braid"

// cool two-tone palette — head A silver, head B brand violet
const COL_A: [number, number, number] = [0.72, 0.79, 0.9];
const COL_B: [number, number, number] = [0.58, 0.38, 0.99];

// consonant intervals (semitones) the hand-gap snaps to
const CONSONANT = [0, 3, 4, 5, 7, 9, 12];

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
// height 0..1 → playbackRate 0.5×..2.0× (exponential = musically even)
function rateFromHeight(h: number): number {
  return 0.5 * Math.pow(4, clamp01(h));
}
// rate 0.5..2 → normalised y 0..1
function rateToYNorm(rate: number): number {
  return clamp01((Math.log2(rate) + 1) / 2);
}
function intervalRatioFromGap(gap: number): number {
  const idx = Math.min(CONSONANT.length - 1, Math.floor(clamp01(gap) * CONSONANT.length));
  return Math.pow(2, CONSONANT[idx] / 12);
}

// ── per-head target + smoothed state ──────────────────────────────────────────
interface HeadTarget {
  present: boolean;
  posNorm: number; // 0..1 position in the buffer
  height: number; // 0..1 → pitch
  open: number; // 0..1 → density
  fist: boolean;
  pan: number; // -1..1
}
interface HeadState {
  gain: GainNode;
  nextGrain: number; // ctx time of next scheduled grain
  posNorm: number;
  height: number;
  open: number;
  pan: number;
  present: boolean;
  fist: boolean;
}

function makeHeadState(gain: GainNode, posNorm: number): HeadState {
  return {
    gain,
    nextGrain: 0,
    posNorm,
    height: 0.5,
    open: 0.55,
    pan: 0,
    present: false,
    fist: false,
  };
}

// ── grain scheduler — the gesture→sound path, fully synchronous ────────────────
interface Audio {
  ctx: AudioContext;
  master: SafeMaster;
  buffer: AudioBuffer;
  heads: [HeadState, HeadState];
  title: string;
}

// spawnMote is injected so the scheduler can energise a visual mote per grain.
function scheduleHead(
  a: Audio,
  headIdx: 0 | 1,
  intervalRatio: number,
  conv: number,
  now: number,
  spawnMote: (idx: 0 | 1, posNorm: number, rate: number, amp: number, conv: number) => void,
): void {
  const s = a.heads[headIdx];
  const active = s.present && !s.fist;
  s.gain.gain.setTargetAtTime(active ? VOICE_GAIN : 0, now, 0.08);
  if (!active) {
    // hold the head where it is; do not queue grains while muted / absent.
    s.nextGrain = Math.max(s.nextGrain, now);
    return;
  }
  const density = DENSITY_MIN + s.open * (DENSITY_MAX - DENSITY_MIN);
  const interval = 1 / density;
  if (s.nextGrain < now) s.nextGrain = now;
  const dur = a.buffer.duration;
  const rate = rateFromHeight(s.height) * (headIdx === 1 ? intervalRatio : 1);
  // denser grains are individually quieter so the voice stays balanced.
  const amp = 0.5 * Math.sqrt(10 / density);

  while (s.nextGrain < now + LOOKAHEAD) {
    const t = s.nextGrain;
    const gdur = GRAIN_MIN + Math.random() * (GRAIN_MAX - GRAIN_MIN);
    const jitter = (Math.random() - 0.5) * 0.01;
    let offset = s.posNorm * dur + jitter;
    offset = clamp(offset, 0, Math.max(0, dur - gdur * rate - 0.01));

    const src = a.ctx.createBufferSource();
    src.buffer = a.buffer;
    src.playbackRate.value = rate;
    const g = a.ctx.createGain();
    g.gain.value = 0;
    const pan = a.ctx.createStereoPanner();
    pan.pan.value = s.pan;
    src.connect(g);
    g.connect(pan);
    pan.connect(s.gain);
    // short raised-cosine-ish envelope
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + gdur * 0.4);
    g.gain.linearRampToValueAtTime(0, t + gdur);
    src.start(t, offset, gdur * rate + 0.02);
    src.stop(t + gdur + 0.03);
    src.onended = () => {
      try {
        src.disconnect();
        g.disconnect();
        pan.disconnect();
      } catch {
        /* already gone */
      }
    };

    spawnMote(headIdx, s.posNorm, rate, amp, conv);
    s.nextGrain += interval;
  }
}

function teardownAudio(a: Audio): void {
  for (const h of a.heads) {
    try {
      h.gain.disconnect();
    } catch {
      /* ignore */
    }
  }
  a.master.disconnect();
}

// ── mote system — renderer-agnostic particle store (three OR canvas2d) ─────────
interface Motes {
  pos: Float32Array; // xyz in world units
  col: Float32Array; // current rgb (base * life)
  base: Float32Array; // rgb at spawn
  life: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  ring: number;
}
function makeMotes(): Motes {
  return {
    pos: new Float32Array(MOTE_COUNT * 3),
    col: new Float32Array(MOTE_COUNT * 3),
    base: new Float32Array(MOTE_COUNT * 3),
    life: new Float32Array(MOTE_COUNT),
    vx: new Float32Array(MOTE_COUNT),
    vy: new Float32Array(MOTE_COUNT),
    ring: 0,
  };
}
function spawnMoteInto(
  m: Motes,
  idx: 0 | 1,
  posNorm: number,
  rate: number,
  amp: number,
  conv: number,
  aspect: number,
): void {
  const i = m.ring;
  m.ring = (m.ring + 1) % MOTE_COUNT;
  const x = (posNorm * 2 - 1) * aspect * 0.9 + (Math.random() - 0.5) * 0.04;
  const y = (rateToYNorm(rate) * 2 - 1) * 0.82 + (Math.random() - 0.5) * 0.04;
  m.pos[i * 3] = x;
  m.pos[i * 3 + 1] = y;
  m.pos[i * 3 + 2] = 0;
  const c = idx === 0 ? COL_A : COL_B;
  // when the two heads converge, motes brighten toward a shared braid.
  const b = amp * (1.3 + conv * 2.2);
  const mix = conv * 0.5;
  m.base[i * 3] = (c[0] * (1 - mix) + 0.85 * mix) * b;
  m.base[i * 3 + 1] = (c[1] * (1 - mix) + 0.85 * mix) * b;
  m.base[i * 3 + 2] = (c[2] * (1 - mix) + 1.0 * mix) * b;
  m.life[i] = 1;
  m.vx[i] = (Math.random() - 0.5) * 0.14;
  m.vy[i] = 0.04 + Math.random() * 0.1;
}
function stepMotes(m: Motes, dt: number, decay: number, drift: number): void {
  for (let i = 0; i < MOTE_COUNT; i++) {
    const l = m.life[i];
    if (l <= 0.02) {
      m.col[i * 3] = 0;
      m.col[i * 3 + 1] = 0;
      m.col[i * 3 + 2] = 0;
      continue;
    }
    const nl = l * decay;
    m.life[i] = nl;
    m.pos[i * 3] += m.vx[i] * dt * drift;
    m.pos[i * 3 + 1] += m.vy[i] * dt * drift;
    m.col[i * 3] = m.base[i * 3] * nl;
    m.col[i * 3 + 1] = m.base[i * 3 + 1] * nl;
    m.col[i * 3 + 2] = m.base[i * 3 + 2] * nl;
  }
}

// soft radial sprite so additive points read as glowing motes, not squares
function makeDotTexture(): THREE.Texture {
  const s = 64;
  const cvs = document.createElement("canvas");
  cvs.width = s;
  cvs.height = s;
  const g = cvs.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.35, "rgba(255,255,255,0.55)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  }
  const tex = new THREE.Texture(cvs);
  tex.needsUpdate = true;
  return tex;
}

// ── three.js scene ─────────────────────────────────────────────────────────────
interface Scene3D {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  points: THREE.Points;
  material: THREE.PointsMaterial;
  ribbon: THREE.Line;
  ribbonMirror: THREE.Line;
  markerA: THREE.Line;
  markerB: THREE.Line;
  dot: THREE.Texture;
  aspect: number;
}

function buildRibbonGeometry(rms: Float32Array, aspect: number, sign: number): THREE.BufferGeometry {
  const n = rms.length;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = (i / (n - 1) * 2 - 1) * aspect * 0.9;
    arr[i * 3 + 1] = sign * rms[i] * 0.28;
    arr[i * 3 + 2] = 0;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
  return geo;
}

function buildScene(
  canvas: HTMLCanvasElement,
  m: Motes,
  rms: Float32Array,
  aspect: number,
): Scene3D {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  const dpr = Math.min(1.75, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
  renderer.setPixelRatio(dpr);
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.setClearColor(0x05060a, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, -10, 10);
  camera.position.z = 1;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(m.pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(m.col, 3));
  const dot = makeDotTexture();
  const material = new THREE.PointsMaterial({
    size: 9,
    map: dot,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    sizeAttenuation: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, material);
  scene.add(points);

  const ribbonMat = new THREE.LineBasicMaterial({
    color: 0x3a3f52,
    transparent: true,
    opacity: 0.42,
  });
  const ribbon = new THREE.Line(buildRibbonGeometry(rms, aspect, 1), ribbonMat);
  const ribbonMirror = new THREE.Line(buildRibbonGeometry(rms, aspect, -1), ribbonMat);
  scene.add(ribbon);
  scene.add(ribbonMirror);

  const mkMarker = (rgb: [number, number, number]): THREE.Line => {
    const arr = new Float32Array([0, -0.92, 0, 0, 0.92, 0]);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    const mat = new THREE.LineBasicMaterial({
      color: new THREE.Color(rgb[0], rgb[1], rgb[2]),
      transparent: true,
      opacity: 0.5,
    });
    return new THREE.Line(g, mat);
  };
  const markerA = mkMarker(COL_A);
  const markerB = mkMarker(COL_B);
  scene.add(markerA);
  scene.add(markerB);

  return {
    renderer,
    scene,
    camera,
    points,
    material,
    ribbon,
    ribbonMirror,
    markerA,
    markerB,
    dot,
    aspect,
  };
}

function updateMarker(line: THREE.Line, posNorm: number, aspect: number, visible: boolean): void {
  const x = (posNorm * 2 - 1) * aspect * 0.9;
  const attr = line.geometry.getAttribute("position") as THREE.BufferAttribute;
  attr.setX(0, x);
  attr.setX(1, x);
  attr.needsUpdate = true;
  line.visible = visible;
}

function destroyScene(s: Scene3D): void {
  s.points.geometry.dispose();
  s.material.dispose();
  s.dot.dispose();
  s.ribbon.geometry.dispose();
  s.ribbonMirror.geometry.dispose();
  (s.ribbon.material as THREE.Material).dispose();
  s.markerA.geometry.dispose();
  s.markerB.geometry.dispose();
  (s.markerA.material as THREE.Material).dispose();
  (s.markerB.material as THREE.Material).dispose();
  s.renderer.dispose();
}

// ── Canvas2D fallback renderer ────────────────────────────────────────────────
function drawFallback(
  ctx: CanvasRenderingContext2D,
  m: Motes,
  rms: Float32Array,
  w: number,
  h: number,
  aspect: number,
  headA: HeadState,
  headB: HeadState,
): void {
  ctx.fillStyle = "#05060a";
  ctx.fillRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2;
  const sx = (w / 2) / aspect;
  // faint time ribbon
  ctx.strokeStyle = "rgba(120,128,150,0.4)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < rms.length; i++) {
    const x = cx + (i / (rms.length - 1) * 2 - 1) * aspect * 0.9 * sx;
    const y = cy - rms[i] * 0.28 * (h / 2);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < rms.length; i++) {
    const x = cx + (i / (rms.length - 1) * 2 - 1) * aspect * 0.9 * sx;
    const y = cy + rms[i] * 0.28 * (h / 2);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  // playhead markers
  const marker = (head: HeadState, rgb: [number, number, number]) => {
    if (!head.present || head.fist) return;
    const x = cx + (head.posNorm * 2 - 1) * aspect * 0.9 * sx;
    ctx.strokeStyle = `rgba(${Math.round(rgb[0] * 255)},${Math.round(rgb[1] * 255)},${Math.round(rgb[2] * 255)},0.5)`;
    ctx.beginPath();
    ctx.moveTo(x, cy - 0.92 * (h / 2));
    ctx.lineTo(x, cy + 0.92 * (h / 2));
    ctx.stroke();
  };
  marker(headA, COL_A);
  marker(headB, COL_B);
  // motes
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < MOTE_COUNT; i++) {
    if (m.life[i] <= 0.04) continue;
    const px = cx + m.pos[i * 3] * sx;
    const py = cy - m.pos[i * 3 + 1] * (h / 2);
    const r = Math.round(clamp01(m.col[i * 3]) * 255);
    const g = Math.round(clamp01(m.col[i * 3 + 1]) * 255);
    const b = Math.round(clamp01(m.col[i * 3 + 2]) * 255);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.beginPath();
    ctx.arc(px, py, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
}

// ── downsample the buffer to a normalised RMS envelope ────────────────────────
function makeRms(buffer: AudioBuffer, count: number): Float32Array {
  const data = buffer.getChannelData(0);
  const out = new Float32Array(count);
  const step = data.length / count;
  let peak = 1e-4;
  for (let i = 0; i < count; i++) {
    const start = Math.floor(i * step);
    const end = Math.min(data.length, Math.floor((i + 1) * step));
    let s = 0;
    let n = 0;
    for (let j = start; j < end; j += 16) {
      s += data[j] * data[j];
      n++;
    }
    const v = n ? Math.sqrt(s / n) : 0;
    out[i] = v;
    if (v > peak) peak = v;
  }
  for (let i = 0; i < count; i++) out[i] = Math.min(1, out[i] / peak);
  return out;
}

// ── engine ────────────────────────────────────────────────────────────────────
interface Engine {
  ac: AudioContext;
  master: SafeMaster;
  audio: Audio;
  freq: Uint8Array<ArrayBuffer>;
  motes: Motes;
  rms: Float32Array;
  scene: Scene3D | null;
  ctx2d: CanvasRenderingContext2D | null;
  tracker: HandLandmarkerInst | null;
  stream: MediaStream | null;
  raf: number;
  lastMs: number;
  energy: number;
  aspect: number;
  reduce: boolean;
  usingPointer: boolean;
  // pointer / on-screen controls drive the fallback
  pointer: { x: number; y: number; active: boolean };
  bControl: { pos: number; height: number; muted: boolean };
  aMuted: boolean;
}

type Mode = "idle" | "loading" | "running";

export default function TimeheadsPage() {
  const [mode, setMode] = useState<Mode>("idle");
  const [trackId, setTrackId] = useState<string>(DEFAULT_TRACK);
  const [driver, setDriver] = useState<"pointer" | "hands">("pointer");
  const [using2D, setUsing2D] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [camNotice, setCamNotice] = useState<string | null>(null);
  const [glNotice, setGlNotice] = useState<string | null>(null);
  const [audioNotice, setAudioNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [bPos, setBPos] = useState(0.6);
  const [bHeight, setBHeight] = useState(0.62);
  const [bMuted, setBMuted] = useState(false);

  const glCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const twoDCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const modeRef = useRef<Mode>("idle");

  const latencyRef = useRef<HTMLSpanElement | null>(null);
  const convRef = useRef<HTMLSpanElement | null>(null);
  const voiceRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // keep the engine's B-control mirror in sync with the on-screen sliders
  useEffect(() => {
    const eng = engineRef.current;
    if (eng) eng.bControl = { pos: bPos, height: bHeight, muted: bMuted };
  }, [bPos, bHeight, bMuted]);

  const renderLoop = useCallback(
    (nowMs: number) => {
      const eng = engineRef.current;
      if (!eng) return;
      const dt = eng.lastMs ? Math.min(0.05, (nowMs - eng.lastMs) / 1000) : 1 / 60;
      eng.lastMs = nowMs;

      const heads = eng.audio.heads;
      let gestureMs = 0;

      // ── read the two hands (or fall back to pointer + on-screen head B) ──
      const targets: [HeadTarget, HeadTarget] = [
        { present: false, posNorm: heads[0].posNorm, height: heads[0].height, open: heads[0].open, fist: false, pan: heads[0].pan },
        { present: false, posNorm: heads[1].posNorm, height: heads[1].height, open: heads[1].open, fist: false, pan: heads[1].pan },
      ];

      let haveHands = false;
      const video = videoRef.current;
      if (eng.tracker && eng.stream && video && video.readyState >= 2) {
        let landmarks: Landmark[][] | null = null;
        const t0 = performance.now();
        try {
          landmarks = eng.tracker.detectForVideo(video, nowMs).landmarks;
        } catch {
          landmarks = null;
        }
        gestureMs = performance.now() - t0;
        if (landmarks && landmarks.length > 0) {
          const feats = landmarks.slice(0, 2).map((lm) => computeHandFeatures(lm));
          feats.sort((p, q) => p.cx - q.cx); // leftmost cx = head A, rightmost = head B
          const assign = (f: (typeof feats)[number], into: HeadTarget) => {
            into.present = true;
            into.posNorm = clamp01((f.cx + 1.2) / 2.4);
            into.height = f.height;
            into.open = f.open;
            into.fist = f.fist;
            into.pan = clamp(f.cx / 1.2, -1, 1);
          };
          if (feats.length >= 2) {
            assign(feats[0], targets[0]);
            assign(feats[1], targets[1]);
          } else {
            // one hand → drive the head on its side, leave the other silent
            const f = feats[0];
            if (f.cx < 0) assign(f, targets[0]);
            else assign(f, targets[1]);
          }
          haveHands = true;
          if (eng.usingPointer) {
            eng.usingPointer = false;
            setDriver("hands");
          }
        }
      }

      if (!haveHands) {
        // pointer drives head A; on-screen sliders (or a 2nd touch) drive head B
        const p = eng.pointer;
        if (p.active && !eng.aMuted) {
          targets[0].present = true;
          targets[0].posNorm = clamp01(p.x);
          targets[0].height = clamp01(1 - p.y);
          targets[0].open = 0.55;
          targets[0].fist = false;
          targets[0].pan = clamp((p.x * 2 - 1), -1, 1);
        }
        if (!eng.bControl.muted) {
          targets[1].present = true;
          targets[1].posNorm = clamp01(eng.bControl.pos);
          targets[1].height = clamp01(eng.bControl.height);
          targets[1].open = 0.55;
          targets[1].fist = false;
          targets[1].pan = 0.6;
        }
      }

      // ── smooth per-head state (conducting, not twitching) ──
      const k = 1 - Math.exp(-dt / 0.09);
      for (let i = 0; i < 2; i++) {
        const s = heads[i];
        const tg = targets[i];
        s.present = tg.present;
        s.fist = tg.fist;
        s.posNorm += (tg.posNorm - s.posNorm) * k;
        s.height += (tg.height - s.height) * k;
        s.open += (tg.open - s.open) * k;
        s.pan += (tg.pan - s.pan) * k;
      }

      // ── vertical gap between the two hands → harmonising interval on head B ──
      const gap = Math.abs(heads[0].height - heads[1].height);
      const intervalRatio = intervalRatioFromGap(gap);

      // ── convergence of the two playheads → braid / unison ──
      const conv =
        heads[0].present && heads[1].present
          ? clamp01(1 - Math.abs(heads[0].posNorm - heads[1].posNorm) / CONV_WIDTH)
          : 0;

      // ── energy from his live signal ──
      eng.master.analyser.getByteFrequencyData(eng.freq);
      let sum = 0;
      for (let i = 0; i < eng.freq.length; i++) sum += eng.freq[i];
      const avg = sum / eng.freq.length / 255;
      eng.energy += (avg - eng.energy) * 0.2;

      // ── schedule grains — the gesture→sound path, synchronous ──
      const now = eng.ac.currentTime;
      const spawn = (idx: 0 | 1, posNorm: number, rate: number, amp: number, c: number) =>
        spawnMoteInto(eng.motes, idx, posNorm, rate, amp, c, eng.aspect);
      scheduleHead(eng.audio, 0, intervalRatio, conv, now, spawn);
      scheduleHead(eng.audio, 1, intervalRatio, conv, now, spawn);

      // ── advance + render the motes ──
      const decay = eng.reduce ? 0.955 : 0.935;
      const drift = eng.reduce ? 0.45 : 1;
      stepMotes(eng.motes, dt, decay, drift);

      if (eng.scene) {
        const sc = eng.scene;
        (sc.points.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
        (sc.points.geometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
        sc.material.size = 7 + eng.energy * 12 + conv * 6;
        updateMarker(sc.markerA, heads[0].posNorm, eng.aspect, heads[0].present && !heads[0].fist);
        updateMarker(sc.markerB, heads[1].posNorm, eng.aspect, heads[1].present && !heads[1].fist);
        sc.renderer.render(sc.scene, sc.camera);
      } else if (eng.ctx2d) {
        const cv = twoDCanvasRef.current;
        if (cv) drawFallback(eng.ctx2d, eng.motes, eng.rms, cv.width, cv.height, eng.aspect, heads[0], heads[1]);
      }

      // ── readouts ──
      if (latencyRef.current) {
        const budget = LOOKAHEAD * 1000;
        latencyRef.current.textContent = haveHands
          ? `${gestureMs.toFixed(0)} ms read · ${budget.toFixed(0)} ms grain lookahead`
          : `${budget.toFixed(0)} ms grain lookahead`;
      }
      if (convRef.current) {
        convRef.current.textContent =
          conv > 0.7 ? "braided · unison" : conv > 0.25 ? "converging" : "two voices";
      }
      if (voiceRef.current) {
        const semis = Math.round(Math.log2(intervalRatio) * 12);
        const names = ["unison", "+m3", "+M3", "+P4", "+P5", "+M6", "+octave"];
        const idx = CONSONANT.indexOf(semis);
        voiceRef.current.textContent = idx >= 0 ? names[idx] : `${semis} st`;
      }

      eng.raf = requestAnimationFrame(renderLoop);
    },
    [],
  );

  const stopEverything = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    cancelAnimationFrame(eng.raf);
    if (eng.stream) eng.stream.getTracks().forEach((t) => t.stop());
    if (eng.tracker) {
      try {
        eng.tracker.close();
      } catch {
        /* ignore */
      }
    }
    teardownAudio(eng.audio);
    if (eng.scene) destroyScene(eng.scene);
    const ac = eng.ac;
    if (ac && ac.state !== "closed") {
      window.setTimeout(() => {
        if (ac.state !== "closed") void ac.close();
      }, 350);
    }
    engineRef.current = null;
  }, []);

  const tryCamera = useCallback(async () => {
    const eng = engineRef.current;
    if (!eng) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamNotice("No camera here — conducting with pointer + head-B controls.");
      return;
    }
    let tracker: HandLandmarkerInst;
    try {
      tracker = await createHandTracker(2);
    } catch {
      setCamNotice("Hand tracking could not load — conducting with pointer + head-B controls.");
      return;
    }
    const eng2 = engineRef.current;
    if (!eng2) {
      tracker.close();
      return;
    }
    const video = videoRef.current;
    if (!video) {
      tracker.close();
      return;
    }
    try {
      const stream = await startCamera(video);
      const eng3 = engineRef.current;
      if (!eng3) {
        stream.getTracks().forEach((t) => t.stop());
        tracker.close();
        return;
      }
      eng3.tracker = tracker;
      eng3.stream = stream;
      setShowPreview(true);
      setCamNotice(null);
    } catch {
      tracker.close();
      setCamNotice("Camera permission denied — conducting with pointer + head-B controls.");
    }
  }, []);

  const handleStart = useCallback(async () => {
    if (modeRef.current !== "idle") return;
    setCamNotice(null);
    setGlNotice(null);
    setAudioNotice(null);
    setUsing2D(false);
    setShowPreview(false);
    setDriver("pointer");
    setMode("loading");

    let ac: AudioContext;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ac = new AC();
      await ac.resume();
    } catch {
      setAudioNotice("Web Audio is unavailable in this browser — the piece cannot sound here.");
      setMode("idle");
      return;
    }

    let loaded;
    try {
      loaded = await loadRealTrackBuffer(ac, trackId);
    } catch {
      setAudioNotice("Karel's recording could not load — check the connection and try again.");
      void ac.close();
      setMode("idle");
      return;
    }

    const master = createSafeMaster(ac);
    const gainA = ac.createGain();
    const gainB = ac.createGain();
    gainA.gain.value = 0;
    gainB.gain.value = 0;
    gainA.connect(master.input);
    gainB.connect(master.input);
    const audio: Audio = {
      ctx: ac,
      master,
      buffer: loaded.buffer,
      heads: [makeHeadState(gainA, 0.32), makeHeadState(gainB, 0.6)],
      title: loaded.title,
    };

    const motes = makeMotes();
    const rms = makeRms(loaded.buffer, 480);

    // visual: three.js WebGL, else Canvas2D — never blocks audio
    const glCanvas = glCanvasRef.current;
    const twoD = twoDCanvasRef.current;
    let aspect = 16 / 9;
    if (glCanvas) aspect = Math.max(0.5, glCanvas.clientWidth / Math.max(1, glCanvas.clientHeight));

    let scene: Scene3D | null = null;
    let ctx2d: CanvasRenderingContext2D | null = null;
    if (glCanvas) {
      try {
        scene = buildScene(glCanvas, motes, rms, aspect);
      } catch {
        scene = null;
        setGlNotice("WebGL unavailable — showing the Canvas2D mote fallback.");
      }
    }
    if (!scene && twoD) {
      const dpr = Math.min(1.75, window.devicePixelRatio || 1);
      twoD.width = Math.floor(twoD.clientWidth * dpr);
      twoD.height = Math.floor(twoD.clientHeight * dpr);
      aspect = Math.max(0.5, twoD.clientWidth / Math.max(1, twoD.clientHeight));
      const g = twoD.getContext("2d");
      if (g) {
        ctx2d = g;
        setUsing2D(true);
      } else {
        setGlNotice("This browser cannot render the visuals — audio still plays.");
      }
    }

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const eng: Engine = {
      ac,
      master,
      audio,
      freq: new Uint8Array(master.analyser.frequencyBinCount),
      motes,
      rms,
      scene,
      ctx2d,
      tracker: null,
      stream: null,
      raf: 0,
      lastMs: 0,
      energy: 0,
      aspect,
      reduce,
      usingPointer: true,
      pointer: { x: 0.35, y: 0.5, active: false },
      bControl: { pos: bPos, height: bHeight, muted: bMuted },
      aMuted: false,
    };
    engineRef.current = eng;

    setMode("running");
    void tryCamera();
    eng.raf = requestAnimationFrame(renderLoop);
  }, [renderLoop, trackId, tryCamera, bPos, bHeight, bMuted]);

  const handleStop = useCallback(() => {
    stopEverything();
    setMode("idle");
    setDriver("pointer");
    setUsing2D(false);
    setShowPreview(false);
  }, [stopEverything]);

  // pointer drives head A (fallback)
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const eng = engineRef.current;
    if (!eng) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    eng.pointer.x = clamp01((e.clientX - rect.left) / rect.width);
    eng.pointer.y = clamp01((e.clientY - rect.top) / rect.height);
    eng.pointer.active = true;
  }, []);
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      onPointerMove(e);
    },
    [onPointerMove],
  );
  const onPointerLeave = useCallback(() => {
    const eng = engineRef.current;
    if (eng) eng.pointer.active = false;
  }, []);

  // resize handling
  useEffect(() => {
    if (mode !== "running") return;
    const onResize = () => {
      const eng = engineRef.current;
      if (!eng) return;
      const glCanvas = glCanvasRef.current;
      if (eng.scene && glCanvas) {
        const aspect = Math.max(0.5, glCanvas.clientWidth / Math.max(1, glCanvas.clientHeight));
        eng.aspect = aspect;
        eng.scene.aspect = aspect;
        eng.scene.camera.left = -aspect;
        eng.scene.camera.right = aspect;
        eng.scene.camera.updateProjectionMatrix();
        eng.scene.renderer.setSize(glCanvas.clientWidth, glCanvas.clientHeight, false);
        eng.scene.ribbon.geometry.dispose();
        eng.scene.ribbonMirror.geometry.dispose();
        eng.scene.ribbon.geometry = buildRibbonGeometry(eng.rms, aspect, 1);
        eng.scene.ribbonMirror.geometry = buildRibbonGeometry(eng.rms, aspect, -1);
      }
      const twoD = twoDCanvasRef.current;
      if (eng.ctx2d && twoD) {
        const dpr = Math.min(1.75, window.devicePixelRatio || 1);
        twoD.width = Math.floor(twoD.clientWidth * dpr);
        twoD.height = Math.floor(twoD.clientHeight * dpr);
        eng.aspect = Math.max(0.5, twoD.clientWidth / Math.max(1, twoD.clientHeight));
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [mode]);

  useEffect(() => {
    return () => stopEverything();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const running = mode === "running";
  const loading = mode === "loading";

  return (
    <main className="relative min-h-screen bg-background text-foreground">
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-30 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
        <Link
          href="/dream"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline"
        >
          ← back to the dream lab
        </Link>

        <p className="mt-4 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          17312 · timeheads · dual-playhead granular counterpoint
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          Timeheads
        </h1>
        <p className="mt-3 text-base leading-relaxed text-foreground">
          Each hand is an independent tape head reading a different moment of the same
          solo-piano take at once. Two granular playheads slice{" "}
          <span className="text-primary">one</span> monophonic recording into a live
          two-voice canon — you conduct where each head reads, its pitch, its density, and
          how the two voices harmonise, with your bare hands via webcam.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {!running ? (
            <button
              type="button"
              onClick={() => void handleStart()}
              disabled={loading}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {loading ? "Loading his take…" : "Play & conduct"}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStop}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Stop
            </button>
          )}

          <label className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            take
            <select
              value={trackId}
              onChange={(e) => setTrackId(e.target.value)}
              disabled={running || loading}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm normal-case tracking-normal text-foreground disabled:opacity-60"
            >
              {REAL_TRACKS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>

          {running && (
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              conducting:{" "}
              <span className="text-primary">{driver === "hands" ? "your two hands" : "pointer + head B"}</span>
            </span>
          )}
        </div>

        {!running && !loading && (
          <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            tap play — grant the camera for two-hand conducting, or conduct with pointer + sliders
          </p>
        )}
        {audioNotice && (
          <p className="mt-3 text-base leading-relaxed text-destructive">{audioNotice}</p>
        )}
        {running && driver === "pointer" && camNotice && (
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">{camNotice}</p>
        )}
        {glNotice && (
          <p className="mt-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {glNotice}
          </p>
        )}

        <div
          className="relative mt-5 aspect-video w-full touch-none overflow-hidden rounded-lg border border-border bg-black"
          onPointerMove={onPointerMove}
          onPointerDown={onPointerDown}
          onPointerLeave={onPointerLeave}
        >
          <canvas
            ref={glCanvasRef}
            className={`absolute inset-0 h-full w-full ${using2D ? "hidden" : ""}`}
          />
          <canvas
            ref={twoDCanvasRef}
            className={`absolute inset-0 h-full w-full ${using2D ? "" : "hidden"}`}
          />

          {/* mirrored webcam preview — video stays mounted so the stream never detaches */}
          <div
            className={`absolute right-2 top-2 h-[26%] w-[26%] overflow-hidden rounded-md border border-border bg-black/40 ${
              showPreview ? "" : "hidden"
            }`}
          >
            <video
              ref={videoRef}
              className="h-full w-full -scale-x-100 object-cover opacity-70"
              playsInline
              muted
            />
            <div className="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-background/80 px-1.5 py-0.5 backdrop-blur-sm">
              <span
                className={`h-1.5 w-1.5 rounded-full ${driver === "hands" ? "bg-primary" : "bg-muted-foreground"}`}
              />
              <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-foreground">
                {driver === "hands" ? "hands" : "waiting"}
              </span>
            </div>
          </div>

          {!running && !loading && (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-base text-muted-foreground">
              Press Play &amp; conduct to split one take into two live playheads.
            </div>
          )}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-base text-muted-foreground">
              Decoding his recording…
            </div>
          )}
        </div>

        {running && (
          <>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-border bg-background/50 p-3">
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  heads
                </span>
                <p className="mt-1 text-base text-foreground">
                  <span ref={convRef}>two voices</span>
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background/50 p-3">
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  interval (gap)
                </span>
                <p className="mt-1 text-base text-foreground">
                  <span ref={voiceRef}>unison</span>
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background/50 p-3">
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  immediacy
                </span>
                <p className="mt-1 text-sm text-foreground">
                  <span ref={latencyRef}>100 ms grain lookahead</span>
                </p>
              </div>
            </div>

            {driver === "pointer" && (
              <div className="mt-4 rounded-lg border border-border bg-background/50 p-4">
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  head B (violet) — no camera, drive the second voice here
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                    position in take
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.001}
                      value={bPos}
                      onChange={(e) => setBPos(parseFloat(e.target.value))}
                      className="accent-primary"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                    pitch
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.001}
                      value={bHeight}
                      onChange={(e) => setBHeight(parseFloat(e.target.value))}
                      className="accent-primary"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => setBMuted((v) => !v)}
                  className="mt-3 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {bMuted ? "Un-mute head B" : "Mute head B"}
                </button>
                <p className="mt-2 text-sm text-muted-foreground">
                  Move the pointer over the field to conduct head A (silver): left–right is the
                  playhead, up–down is pitch.
                </p>
              </div>
            )}
          </>
        )}

        {running && using2D && (
          <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            webgl absent · canvas 2d mote fallback
          </p>
        )}

        <p className="mt-8 text-sm text-muted-foreground">
          input: MediaPipe two-hand landmarks (pointer + slider fallback) · output: three.js
          additive points — two braided grain-streams on a shared time ribbon (Canvas2D fallback) ·
          audio: his one real decoded take, read by two independent granular playheads through the
          shared ear-safety bus.
        </p>
      </div>

      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[85vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">Design notes</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">Timeheads</span> asks what it would feel like if
                each of your two hands were an independent tape head reading a{" "}
                <span className="text-foreground">different</span> moment of the same solo-piano take
                at once. Karel&apos;s recording is loaded once into an AudioBuffer; two granular
                playheads then read it simultaneously, each firing short grains (~40–120&nbsp;ms)
                sliced live from his audio. Nothing you hear is synthesised — it is all his take,
                re-timed.
              </p>
              <p>
                Per head, per frame: your hand&apos;s{" "}
                <span className="text-foreground">horizontal position</span> sets the playhead&apos;s
                place in the recording (and its stereo pan — left hand left, right hand right, so the
                voices separate in space); <span className="text-foreground">height</span> sets grain
                pitch (<code>0.5×…2.0×</code>); <span className="text-foreground">openness</span> sets
                grain density (fist ≈ 6/s … open ≈ 60/s); a{" "}
                <span className="text-foreground">fist</span> mutes that voice. The{" "}
                <span className="text-foreground">vertical gap</span> between your two hands snaps to a
                consonant interval (m3, M3, P4, P5, M6, octave) added to the second voice&apos;s
                playbackRate, so the counterpoint harmonises on purpose rather than clashing.
              </p>
              <p>
                Two heads reading one monophonic line at offset positions is exactly a{" "}
                <span className="text-foreground">canon / round</span> — one melody, two voices
                offset in time. Move the heads apart and you hear his take in counterpoint against
                itself; bring your hands together and the playheads{" "}
                <span className="text-foreground">converge</span> — the two grain-streams braid and
                brighten into a visible, audible unison.
              </p>
              <p>
                The visual is two three.js additive point-streams — head A silver, head B brand
                violet — each grain that fires energising a mote at its playhead&apos;s X, with Y =
                pitch and brightness = amplitude, trailing and fading over a faint downsampled
                waveform so you see where each head reads. Convergence blends the two toward a bright
                braid.
              </p>
              <p>
                <span className="text-foreground">Latency is the craft.</span> The target
                (GestureSync, ACM Multimedia Systems Conference 2026) is ~50&nbsp;ms end-to-end for a
                gesture to feel immediate. Detection runs on the rAF loop; grains are scheduled with a
                minimal ~100&nbsp;ms lookahead; every audio parameter is smoothed with{" "}
                <code>setTargetAtTime(…, ~0.1&nbsp;s)</code>; there is no <code>await</code> anywhere
                in the gesture→sound path.
              </p>
              <p>
                No camera? The pointer conducts head A (X = playhead, Y = pitch) and on-screen sliders
                conduct head B, so the counterpoint stays demonstrable. No WebGL falls back to a
                Canvas2D mote render; audio always plays through the shared safeMaster bus. Full
                references are in the README.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["17312-timeheads", "15824-canon", "15760-conduct"]} />
    </main>
  );
}
