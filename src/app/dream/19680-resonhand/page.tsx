"use client";

/* ── 19680 · RESONHAND ───────────────────────────────────────────────────────
 *
 *  ONE QUESTION: what if your two hands could reach into one of Karel's piano
 *  recordings and make its own harmony ring out — a resonant halo tuned to the
 *  exact chord he's playing in that moment?
 *
 *  This is an embodied, two-hand camera-conducting piece. The webcam tracks BOTH
 *  hands; a parallel bank of bandpass resonators is laid over Karel's REAL decoded
 *  recording, and that bank is retuned LIVE to the chord currently sounding in the
 *  track (read from its analysis data). So the person "rings out" the harmony that
 *  is actually in his music — not FFT noise, his chords.
 *
 *  THE CONDUCTING (all smoothed with setTargetAtTime(·, now, 0.1)):
 *    · left hand HEIGHT    → resonant-halo wet gain (bottom = dry take, up = halo)
 *    · left hand OPENNESS   → how many chord-tones ring (fist = root, spread = full
 *                             chord) AND the filter Q (open = sharper, singing)
 *    · right hand HEIGHT    → brightness tilt (raises the bank's center octave)
 *    · right hand CX        → stereo pan of the halo
 *    · distance between hands → space (feedback-delay tail wet amount)
 *
 *  AUDIO is pure Web Audio: his ONE decoded buffer loops through a dry path and a
 *  parallel 8-band bandpass resonator bank → halo gain → stereo panner → a
 *  feedback-delay space → the shared ear-safe master. No oscillators as a voice.
 *
 *  VISUAL is raw WebGL2: a field of vertical luminous filaments, one per chord-
 *  tone band, each glowing with its band's live amplitude; the two hands are
 *  luminous poles the filaments bend toward; a chord change ripples a hue shift
 *  across the field. Cold struck-metal palette. Canvas2D fallback if no WebGL2.
 *
 *  Lineage: Golan Levin & Zachary Lieberman, "Manual Input Sessions" (2004) —
 *  hands casting shapes that generate synchronized sound and graphics.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  createHandTracker,
  startCamera,
  computeHandFeatures,
  type Landmark,
  type HandResult,
  type HandLandmarkerInst,
} from "../_shared/cameraTracking";
import { COLLECTIONS, REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import {
  loadTrackAnalysis,
  chordRoot,
  chordIsMinor,
  pitchClassHue,
  type TrackChord,
} from "../_shared/trackAnalysis";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { useImmersive, ImmersiveHud } from "../_shared/immersive";

// ── small math ───────────────────────────────────────────────────────────────
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const N_BANDS = 8;

// ── harmony: read the chord sounding now, turn it into resonator pitches ───────
interface Chord {
  root: number; // pitch-class 0..11
  minor: boolean;
  symbol: string;
}

// A gentle fallback progression (vi–IV–I–V in C) so the piece still RINGS when a
// track has no analysis. Prefer his real chords whenever they load.
const FALLBACK_PROG: Chord[] = [
  { root: 9, minor: true, symbol: "Am" },
  { root: 5, minor: false, symbol: "F" },
  { root: 0, minor: false, symbol: "C" },
  { root: 7, minor: false, symbol: "G" },
];

function chordAt(chords: TrackChord[] | null, t: number): Chord {
  if (chords && chords.length) {
    // last chord whose onset is at or before the current loop time
    let idx = 0;
    for (let i = 0; i < chords.length; i++) {
      if (chords[i].time <= t) idx = i;
      else break;
    }
    const c = chords[idx];
    const r = chordRoot(c.chord);
    if (r != null) return { root: r, minor: chordIsMinor(c.chord), symbol: c.chord };
  }
  const p = FALLBACK_PROG[Math.floor(t / 3.5) % FALLBACK_PROG.length];
  return p;
}

// Chord → 8 semitone offsets from the root, ordered by musical priority so that
// opening the left hand (fist → spread) lights up the chord root-outward:
//   root · fifth · root+8ve · third · fifth+8ve · third+8ve · root+2·8ve · 7th.
function chordOffsets(minor: boolean): number[] {
  const third = minor ? 3 : 4;
  const seventh = minor ? 10 : 11;
  return [0, 7, 12, third, 19, third + 12, 24, seventh + 12];
}

// ── the conducting reading, from two hands OR the pointer fallback ─────────────
interface HandReading {
  present: boolean;
  cx: number; // mirrored, ~[-1.2, 1.2]
  open: number; // 0..1
  height: number; // 0..1
}
interface Conductor {
  left: HandReading; // the person's LEFT hand
  right: HandReading; // the person's RIGHT hand
  distance: number; // 0..1 between the two hands
}

const REST_HAND: HandReading = { present: false, cx: 0, open: 0.5, height: 0.42 };
const REST: Conductor = {
  left: { ...REST_HAND, cx: 0.45 },
  right: { ...REST_HAND, cx: -0.45 },
  distance: 0.4,
};

// Assign the (up to two) detected hands to the person's left / right. The webcam
// preview is mirrored, so the person's LEFT hand appears on the RIGHT of frame
// (larger cx). Prefer MediaPipe's handedness label when the two are distinct,
// else fall back to the robust center-x sort.
function readConductor(res: HandResult): Conductor {
  const hands = res.landmarks;
  if (!hands.length) return { ...REST };
  const feats = hands.slice(0, 2).map((lm: Landmark[]) => computeHandFeatures(lm));
  const handed = res.handednesses ?? res.handedness ?? [];

  const toReading = (f: (typeof feats)[number]): HandReading => ({
    present: true,
    cx: f.cx,
    open: f.open,
    height: f.height,
  });

  if (feats.length === 1) {
    // one hand conducts both roles at once
    const r = toReading(feats[0]);
    return { left: r, right: { ...r }, distance: 0.2 + feats[0].open * 0.4 };
  }

  const l0 = handed[0]?.[0]?.categoryName;
  const l1 = handed[1]?.[0]?.categoryName;
  let leftIdx: number;
  if (l0 && l1 && l0 !== l1) {
    leftIdx = l0 === "Left" ? 0 : 1; // categoryName "Left" = the person's left hand
  } else {
    leftIdx = feats[0].cx >= feats[1].cx ? 0 : 1; // larger cx = person's left hand
  }
  const left = toReading(feats[leftIdx]);
  const right = toReading(feats[1 - leftIdx]);
  const d = Math.hypot(feats[0].cx - feats[1].cx, feats[0].cy - feats[1].cy);
  return { left, right, distance: clamp01((d - 0.3) / (2.4 - 0.3)) };
}

// ── audio engine: his take + a live-tuned bandpass resonator bank ──────────────
interface BandNode {
  filter: BiquadFilterNode;
  gain: GainNode;
  analyser: AnalyserNode;
  data: Uint8Array<ArrayBuffer>;
}
interface Audio {
  ctx: AudioContext;
  master: SafeMaster;
  source: AudioBufferSourceNode;
  dry: GainNode;
  bankIn: GainNode;
  bands: BandNode[];
  wetSum: GainNode;
  halo: GainNode;
  panner: StereoPannerNode;
  spaceIn: GainNode;
  delay: DelayNode;
  feedback: GainNode;
  spaceWet: GainNode;
  startTime: number;
  duration: number;
  title: string;
}

function buildAudio(
  ctx: AudioContext,
  master: SafeMaster,
  buffer: AudioBuffer,
  title: string,
): Audio {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.playbackRate.value = 1;

  // dry path — his recording as-is, always audible.
  const dry = ctx.createGain();
  dry.gain.value = 0.85;
  source.connect(dry);
  dry.connect(master.input);

  // parallel resonator bank.
  const bankIn = ctx.createGain();
  bankIn.gain.value = 1;
  source.connect(bankIn);

  const wetSum = ctx.createGain();
  wetSum.gain.value = 0.9;

  const bands: BandNode[] = [];
  for (let i = 0; i < N_BANDS; i++) {
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 220 * (i + 1);
    filter.Q.value = 8;
    const gain = ctx.createGain();
    gain.gain.value = i === 0 ? 1 : 0; // fist = only the root band rings
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 32;
    analyser.smoothingTimeConstant = 0.6;
    bankIn.connect(filter);
    filter.connect(gain);
    gain.connect(wetSum);
    filter.connect(analyser); // per-band tap for the visuals (passive)
    bands.push({ filter, gain, analyser, data: new Uint8Array(analyser.fftSize) });
  }

  // halo swell → stereo pan → space tail → master.
  const halo = ctx.createGain();
  halo.gain.value = 0;
  wetSum.connect(halo);

  const panner = ctx.createStereoPanner();
  panner.pan.value = 0;
  halo.connect(panner);

  const spaceIn = ctx.createGain();
  spaceIn.gain.value = 1;
  panner.connect(spaceIn);
  spaceIn.connect(master.input); // the halo, close-miked

  const delay = ctx.createDelay(1.5);
  delay.delayTime.value = 0.33;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.2;
  const spaceWet = ctx.createGain();
  spaceWet.gain.value = 0;
  spaceIn.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay); // the regenerating tail of his own resonant halo
  delay.connect(spaceWet);
  spaceWet.connect(master.input);

  const startTime = ctx.currentTime + 0.05;
  source.start(startTime);

  return {
    ctx,
    master,
    source,
    dry,
    bankIn,
    bands,
    wetSum,
    halo,
    panner,
    spaceIn,
    delay,
    feedback,
    spaceWet,
    startTime,
    duration: buffer.duration,
    title,
  };
}

// Apply the conductor reading + the current chord to the audio bank. Everything
// that moves is smoothed with setTargetAtTime(target, now, 0.1).
function applyConductor(a: Audio, c: Conductor, chord: Chord): void {
  const now = a.ctx.currentTime;
  const TC = 0.1;

  // left height → halo wet swell (bottom = dry only).
  a.halo.gain.setTargetAtTime(clamp01(c.left.height) * 0.95, now, TC);

  // left openness → how many chord-tones ring + the Q (resonance sharpness).
  const activeCount = 1 + Math.round(clamp01(c.left.open) * (N_BANDS - 1));
  const q = 2 + clamp01(c.left.open) * 16;

  // right height → brightness tilt: raise the bank's base octave.
  const octaveBase = 2 + clamp01(c.right.height) * 2; // MIDI octave 2..4

  const offs = chordOffsets(chord.minor);
  for (let i = 0; i < N_BANDS; i++) {
    const rootMidi = (octaveBase + 1) * 12 + chord.root; // (oct+1)*12 + pc
    const hz = clamp(midiToHz(rootMidi + offs[i]), 40, 9000);
    a.bands[i].filter.frequency.setTargetAtTime(hz, now, TC);
    a.bands[i].filter.Q.setTargetAtTime(q, now, TC);
    a.bands[i].gain.gain.setTargetAtTime(i < activeCount ? 0.9 : 0, now, TC);
  }

  // right cx → stereo pan of the halo.
  a.panner.pan.setTargetAtTime(clamp(c.right.cx, -1, 1), now, TC);

  // distance between hands → space (feedback-delay tail wet amount).
  const space = clamp01(c.distance);
  a.spaceWet.gain.setTargetAtTime(space * 0.6, now, TC);
  a.feedback.gain.setTargetAtTime(0.15 + space * 0.45, now, TC);
}

function teardownAudio(a: Audio): void {
  try {
    a.source.stop();
  } catch {
    /* already stopped */
  }
  const nodes: AudioNode[] = [
    a.source,
    a.dry,
    a.bankIn,
    a.wetSum,
    a.halo,
    a.panner,
    a.spaceIn,
    a.delay,
    a.feedback,
    a.spaceWet,
  ];
  for (const b of a.bands) nodes.push(b.filter, b.gain, b.analyser);
  for (const n of nodes) {
    try {
      n.disconnect();
    } catch {
      /* ignore */
    }
  }
  a.master.disconnect();
}

// ── WebGL2 filament field ──────────────────────────────────────────────────────
const VERT = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID == 2) ? 3.0 : -1.0, (gl_VertexID == 1) ? 3.0 : -1.0);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
out vec4 frag;
uniform vec2 uRes;
uniform float uTime;
uniform float uAmp[8];
uniform vec4 uHands;    // left.xy, right.xy  (0..1, y up)
uniform vec2 uPresent;  // left, right present (0/1)
uniform float uHue;     // 0..1 cold hue nudge
uniform float uBright;  // 0..1 brightness tilt
uniform float uRipple;  // chord-change ripple, decays to 0
uniform float uDrive;   // overall energy 0..1

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  vec3 col = vec3(0.012, 0.016, 0.022); // near-black cold ground

  vec2 L = uHands.xy;
  vec2 R = uHands.zw;

  for (int i = 0; i < 8; i++) {
    float fx = (float(i) + 0.5) / 8.0;
    // idle shimmer so the field is never blank / dead
    float idle = 0.05 + 0.035 * sin(uTime * 0.6 + float(i) * 1.37);
    float amp = max(uAmp[i], idle);

    // bend the filament toward each present hand pole, strongest near its height
    float bend = 0.0;
    if (uPresent.x > 0.5) {
      bend += (L.x - fx) * 0.4 * exp(-pow((uv.y - L.y) * 2.2, 2.0));
    }
    if (uPresent.y > 0.5) {
      bend += (R.x - fx) * 0.4 * exp(-pow((uv.y - R.y) * 2.2, 2.0));
    }
    bend += 0.013 * sin(uTime * 0.5 + uv.y * 4.0 + float(i)); // gentle sway

    float lineX = fx + bend;
    float dx = (uv.x - lineX) * aspect;
    float w = 0.009 + amp * 0.05;
    float glow = exp(-(dx * dx) / (w * w));
    float vprof = smoothstep(0.0, 0.14, uv.y) * smoothstep(0.0, 0.14, 1.0 - uv.y);
    float inten = glow * vprof * (0.22 + amp * 1.7);

    // struck-metal: steel-blue body → incandescent near-white core
    vec3 steel = mix(vec3(0.15, 0.30, 0.47), vec3(0.33, 0.49, 0.60), uHue);
    vec3 hot = vec3(0.95, 0.97, 1.0);
    vec3 c = mix(steel, hot, smoothstep(0.3, 1.1, inten + amp * 0.4 + uBright * 0.15));
    col += c * inten;
  }

  // hands as soft luminous vertical poles
  if (uPresent.x > 0.5) {
    float d = abs(uv.x - L.x) * aspect;
    col += vec3(0.28, 0.50, 0.64) * exp(-(d * d) / 0.0010) * 0.45;
  }
  if (uPresent.y > 0.5) {
    float d = abs(uv.x - R.x) * aspect;
    col += vec3(0.40, 0.56, 0.70) * exp(-(d * d) / 0.0010) * 0.45;
  }

  // chord-change ripple: a cool brightening wave sweeping across the field
  float wave = sin(uv.x * 6.2831 - uTime * 2.2) * 0.5 + 0.5;
  col += vec3(0.42, 0.56, 0.70) * uRipple * wave * 0.18;

  col *= (0.8 + uDrive * 0.6);
  col = col / (1.0 + col);          // reinhard tone map
  col = pow(max(col, vec3(0.0)), vec3(0.72));
  frag = vec4(col, 1.0);
}`;

interface GlState {
  gl: WebGL2RenderingContext;
  prog: WebGLProgram;
  loc: Record<string, WebGLUniformLocation | null>;
}

function buildGl(canvas: HTMLCanvasElement): GlState | null {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
  if (!gl) return null;
  const mk = (type: number, src: string): WebGLShader | null => {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  };
  const vs = mk(gl.VERTEX_SHADER, VERT);
  const fs = mk(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  const names = ["uRes", "uTime", "uAmp", "uHands", "uPresent", "uHue", "uBright", "uRipple", "uDrive"];
  const loc: Record<string, WebGLUniformLocation | null> = {};
  for (const n of names) loc[n] = gl.getUniformLocation(prog, n);
  return { gl, prog, loc };
}

interface FieldParams {
  time: number;
  amps: Float32Array;
  hands: [number, number, number, number];
  present: [number, number];
  hue: number;
  bright: number;
  ripple: number;
  drive: number;
}

function drawGl(s: GlState, p: FieldParams): void {
  const { gl, loc } = s;
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.useProgram(s.prog);
  gl.uniform2f(loc.uRes, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.uniform1f(loc.uTime, p.time);
  gl.uniform1fv(loc.uAmp, p.amps);
  gl.uniform4f(loc.uHands, p.hands[0], p.hands[1], p.hands[2], p.hands[3]);
  gl.uniform2f(loc.uPresent, p.present[0], p.present[1]);
  gl.uniform1f(loc.uHue, p.hue);
  gl.uniform1f(loc.uBright, p.bright);
  gl.uniform1f(loc.uRipple, p.ripple);
  gl.uniform1f(loc.uDrive, p.drive);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

// ── Canvas2D fallback — the same filaments, drawn cheaply ──────────────────────
function drawCanvas2D(
  ctx: CanvasRenderingContext2D,
  p: FieldParams,
  w: number,
  h: number,
): void {
  ctx.fillStyle = "rgb(3,4,6)";
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < N_BANDS; i++) {
    const fx = (i + 0.5) / N_BANDS;
    const amp = Math.max(p.amps[i], 0.06);
    const steps = 24;
    ctx.beginPath();
    for (let j = 0; j <= steps; j++) {
      const yn = j / steps;
      let bend = 0;
      if (p.present[0] > 0.5) bend += (p.hands[0] - fx) * 0.4 * Math.exp(-Math.pow((yn - p.hands[1]) * 2.2, 2));
      if (p.present[1] > 0.5) bend += (p.hands[2] - fx) * 0.4 * Math.exp(-Math.pow((yn - p.hands[3]) * 2.2, 2));
      bend += 0.013 * Math.sin(p.time * 0.5 + yn * 4 + i);
      const x = (fx + bend) * w;
      const y = (1 - yn) * h;
      if (j === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    const g = 60 + amp * 170;
    const b = 90 + amp * 160;
    ctx.strokeStyle = `rgba(${Math.round(40 + amp * 180)},${Math.round(g)},${Math.round(b)},${0.3 + amp * 0.6})`;
    ctx.lineWidth = 2 + amp * 10;
    ctx.stroke();
  }
  // hand poles
  const pole = (nx: number) => {
    const grad = ctx.createLinearGradient(nx * w - 20, 0, nx * w + 20, 0);
    grad.addColorStop(0, "rgba(70,130,165,0)");
    grad.addColorStop(0.5, "rgba(90,150,180,0.4)");
    grad.addColorStop(1, "rgba(70,130,165,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(nx * w - 20, 0, 40, h);
  };
  if (p.present[0] > 0.5) pole(p.hands[0]);
  if (p.present[1] > 0.5) pole(p.hands[2]);
  ctx.globalCompositeOperation = "source-over";
}

// ── engine wiring ──────────────────────────────────────────────────────────────
interface Engine {
  ac: AudioContext;
  master: SafeMaster;
  audio: Audio;
  masterData: Uint8Array<ArrayBuffer>;
  gl: GlState | null;
  ctx2d: CanvasRenderingContext2D | null;
  landmarker: HandLandmarkerInst | null;
  stream: MediaStream | null;
  chords: TrackChord[] | null;
  raf: number;
  time: number;
  lastMs: number;
  drive: number;
  amps: Float32Array;
  hands: [number, number, number, number];
  present: [number, number];
  hue: number;
  ripple: number;
  lastChord: string;
  smooth: Conductor;
  usingPointer: boolean;
  pointer: { x: number; y: number; down: boolean; active: boolean };
}

type Mode = "idle" | "loading" | "running";

const DEFAULT_TRACK =
  REAL_TRACKS.find((t) => t.title === "Bath")?.id ?? REAL_TRACKS[0].id;

function lerpHand(sm: HandReading, t: HandReading, k: number): void {
  sm.present = t.present;
  sm.cx += (t.cx - sm.cx) * k;
  sm.open += (t.open - sm.open) * k;
  sm.height += (t.height - sm.height) * k;
}

export default function ResonhandPage() {
  const { immersive, toggle } = useImmersive();
  const [mode, setMode] = useState<Mode>("idle");
  const [trackId, setTrackId] = useState<string>(DEFAULT_TRACK);
  const [driver, setDriver] = useState<"pointer" | "hands">("pointer");
  const [using2D, setUsing2D] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [glNotice, setGlNotice] = useState<string | null>(null);
  const [camNotice, setCamNotice] = useState<string | null>(null);
  const [audioNotice, setAudioNotice] = useState<string | null>(null);
  const [chordLabel, setChordLabel] = useState<string>("—");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const modeRef = useRef<Mode>("idle");
  const statusRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(1.6, window.devicePixelRatio || 1);
    const w = Math.max(2, Math.floor(window.innerWidth * dpr));
    const h = Math.max(2, Math.floor(window.innerHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }, []);

  const setStatus = useCallback((text: string, lost: boolean) => {
    const el = statusRef.current;
    if (!el) return;
    el.textContent = text;
    el.className = `font-mono text-xs ${lost ? "text-destructive" : "text-muted-foreground"}`;
  }, []);

  const renderLoop = useCallback(
    (nowMs: number) => {
      const eng = engineRef.current;
      if (!eng) return;
      eng.lastMs = eng.lastMs || nowMs;
      const dt = Math.min(0.05, (nowMs - eng.lastMs) / 1000);
      eng.lastMs = nowMs;
      eng.time += dt;

      // ── read the conducting gesture (hands, else pointer) ──
      let target = REST;
      let handsSeen = 0;
      if (
        eng.landmarker &&
        eng.stream &&
        videoRef.current &&
        videoRef.current.readyState >= 2
      ) {
        let res: HandResult | null = null;
        try {
          res = eng.landmarker.detectForVideo(videoRef.current, nowMs);
        } catch {
          res = null;
        }
        if (res && res.landmarks && res.landmarks.length > 0) {
          target = readConductor(res);
          handsSeen = res.landmarks.length;
          if (eng.usingPointer) {
            eng.usingPointer = false;
            setDriver("hands");
          }
        } else if (!eng.usingPointer) {
          // camera live, but no hand this frame — hold, fade presence
          target = {
            left: { ...eng.smooth.left, present: false },
            right: { ...eng.smooth.right, present: false },
            distance: eng.smooth.distance,
          };
        }
      }
      if (eng.usingPointer) {
        const p = eng.pointer;
        if (p.active) {
          const cx = (p.x * 2 - 1) * 1.1;
          const height = clamp01(1 - p.y);
          const open = p.down ? 0.95 : clamp01(p.x);
          const r: HandReading = { present: true, cx, open, height };
          target = {
            left: r,
            right: { ...r },
            distance: clamp01(Math.abs(p.x - 0.5) * 2),
          };
        } else {
          target = { ...REST };
        }
      }

      // ── smooth the reading (conducting, not twitching) ──
      const k = 0.16;
      const sm = eng.smooth;
      lerpHand(sm.left, target.left, k);
      lerpHand(sm.right, target.right, k);
      sm.distance += (target.distance - sm.distance) * k;

      // ── walk the chord list against the current playback time ──
      const t = (eng.ac.currentTime - eng.audio.startTime);
      const loopT = t > 0 ? t % eng.audio.duration : 0;
      const chord = chordAt(eng.chords, loopT);
      if (chord.symbol !== eng.lastChord) {
        eng.lastChord = chord.symbol;
        eng.ripple = 1;
        eng.hue = pitchClassHue(chord.root) / 360;
        setChordLabel(chord.symbol);
      }
      eng.ripple *= 0.94;

      applyConductor(eng.audio, sm, chord);

      // ── live amplitudes: per band (filaments) + overall drive ──
      for (let i = 0; i < N_BANDS; i++) {
        const b = eng.audio.bands[i];
        b.analyser.getByteTimeDomainData(b.data);
        let s = 0;
        for (let j = 0; j < b.data.length; j++) {
          const v = (b.data[j] - 128) / 128;
          s += v * v;
        }
        const rms = Math.sqrt(s / b.data.length);
        // weight by whether this band is lit (openness) via its gain target
        const lit = eng.audio.bands[i].gain.gain.value;
        const targetAmp = Math.min(1, rms * 6) * (0.25 + lit);
        eng.amps[i] += (targetAmp - eng.amps[i]) * 0.3;
      }
      eng.master.analyser.getByteTimeDomainData(eng.masterData);
      let sum = 0;
      for (let i = 0; i < eng.masterData.length; i++) {
        const v = (eng.masterData[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / eng.masterData.length);
      eng.drive += (Math.min(1, rms * 3.2) - eng.drive) * 0.2;

      // ── hand screen positions for the poles (cx/cy space → 0..1, y up) ──
      const toScreenX = (cx: number) => clamp01(cx / 2.4 + 0.5);
      eng.hands = [
        toScreenX(sm.left.cx),
        clamp01(sm.left.height),
        toScreenX(sm.right.cx),
        clamp01(sm.right.height),
      ];
      eng.present = [sm.left.present ? 1 : 0, sm.right.present ? 1 : 0];

      const fp: FieldParams = {
        time: eng.time,
        amps: eng.amps,
        hands: eng.hands,
        present: eng.present,
        hue: eng.hue,
        bright: clamp01(sm.right.height),
        ripple: eng.ripple,
        drive: eng.drive,
      };

      if (eng.gl) {
        drawGl(eng.gl, fp);
      } else if (eng.ctx2d) {
        const c = canvasRef.current;
        if (c) drawCanvas2D(eng.ctx2d, fp, c.width, c.height);
      }

      // ── tracking status line ──
      if (!eng.usingPointer) {
        if (handsSeen >= 2) setStatus("tracking · live · both hands", false);
        else if (handsSeen === 1) setStatus("tracking · live · one hand — raise the other", false);
        else setStatus("tracking lost · show both hands, palms to camera", true);
      } else {
        setStatus("pointer fallback · drag across the field to conduct", false);
      }

      eng.raf = requestAnimationFrame(renderLoop);
    },
    [setStatus],
  );

  const stopEverything = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    cancelAnimationFrame(eng.raf);
    if (eng.stream) eng.stream.getTracks().forEach((tr) => tr.stop());
    if (eng.landmarker) {
      try {
        eng.landmarker.close();
      } catch {
        /* ignore */
      }
    }
    teardownAudio(eng.audio);
    if (eng.gl) {
      try {
        eng.gl.gl.getExtension("WEBGL_lose_context")?.loseContext();
      } catch {
        /* ignore */
      }
    }
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
      setCamNotice("No camera here — conducting with the pointer instead.");
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    let stream: MediaStream;
    try {
      stream = await startCamera(video);
    } catch {
      setCamNotice("Camera unavailable or blocked — conducting with the pointer instead.");
      return;
    }
    const eng2 = engineRef.current;
    if (!eng2) {
      stream.getTracks().forEach((tr) => tr.stop());
      return;
    }
    eng2.stream = stream;
    try {
      const lm = await createHandTracker(2);
      const eng3 = engineRef.current;
      if (!eng3) {
        lm.close();
        return;
      }
      eng3.landmarker = lm;
      setShowPreview(true);
      setCamNotice(null);
    } catch {
      setCamNotice("Hand model could not load — conducting with the pointer instead.");
    }
  }, []);

  const handleStart = useCallback(async () => {
    if (modeRef.current !== "idle") return;
    setGlNotice(null);
    setCamNotice(null);
    setAudioNotice(null);
    setUsing2D(false);
    setShowPreview(false);
    setDriver("pointer");
    setMode("loading");

    // audio first — it must always work
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
    const audio = buildAudio(ac, master, loaded.buffer, loaded.title);

    // harmony analysis (best-effort; falls back to a fixed progression)
    let chords: TrackChord[] | null = null;
    try {
      const analysis = await loadTrackAnalysis(trackId);
      chords = analysis?.chords?.length ? analysis.chords : null;
    } catch {
      chords = null;
    }

    // visuals: WebGL2, else Canvas2D — never blocks audio
    sizeCanvas();
    const canvas = canvasRef.current;
    let gl: GlState | null = null;
    let ctx2d: CanvasRenderingContext2D | null = null;
    if (canvas) {
      gl = buildGl(canvas);
      if (!gl) {
        const g2 = canvas.getContext("2d");
        if (g2) {
          ctx2d = g2;
          setUsing2D(true);
          setGlNotice("WebGL2 unavailable — showing the Canvas2D filament fallback.");
        }
      }
    }

    const eng: Engine = {
      ac,
      master,
      audio,
      masterData: new Uint8Array(master.analyser.fftSize),
      gl,
      ctx2d,
      landmarker: null,
      stream: null,
      chords,
      raf: 0,
      time: 0,
      lastMs: 0,
      drive: 0,
      amps: new Float32Array(N_BANDS),
      hands: [0.69, 0.42, 0.31, 0.42],
      present: [0, 0],
      hue: 0.58,
      ripple: 0,
      lastChord: "",
      smooth: {
        left: { ...REST.left },
        right: { ...REST.right },
        distance: REST.distance,
      },
      usingPointer: true,
      pointer: { x: 0.5, y: 0.5, down: false, active: false },
    };
    engineRef.current = eng;

    setMode("running");
    void tryCamera();
    eng.raf = requestAnimationFrame(renderLoop);
  }, [renderLoop, sizeCanvas, trackId, tryCamera]);

  const handleStop = useCallback(() => {
    stopEverything();
    setMode("idle");
    setDriver("pointer");
    setShowPreview(false);
    setUsing2D(false);
  }, [stopEverything]);

  // pointer as the always-available conducting sensor
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
      const eng = engineRef.current;
      if (!eng) return;
      eng.pointer.down = true;
      eng.pointer.active = true;
      onPointerMove(e);
    },
    [onPointerMove],
  );
  const onPointerUp = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.pointer.down = false;
  }, []);

  useEffect(() => {
    if (mode !== "running") return;
    const onResize = () => sizeCanvas();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [mode, sizeCanvas]);

  useEffect(() => {
    return () => stopEverything();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const running = mode === "running";
  const loading = mode === "loading";

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* the art fills the viewport */}
      <div
        className="absolute inset-0 touch-none"
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <canvas ref={canvasRef} className="h-full w-full" />
      </div>

      {/* mirrored webcam preview — stays mounted so the stream never detaches */}
      <div
        className={`absolute right-3 top-3 z-20 h-[20vh] max-h-40 w-[26vw] max-w-56 overflow-hidden rounded-md border border-border bg-black/40 ${
          showPreview && running ? "" : "hidden"
        }`}
      >
        <video
          ref={videoRef}
          className="h-full w-full -scale-x-100 object-cover opacity-70"
          playsInline
          muted
        />
      </div>

      {/* tracking-status line — visible whenever running */}
      {running && (
        <div className="pointer-events-none absolute left-4 top-4 z-20">
          <span ref={statusRef} className="font-mono text-xs text-muted-foreground">
            starting…
          </span>
          {chordLabel !== "—" && (
            <span className="ml-3 font-mono text-xs text-primary">chord · {chordLabel}</span>
          )}
        </div>
      )}

      {/* functional error notices stay visible even in immersive */}
      {(audioNotice || (running && driver === "pointer" && camNotice)) && (
        <div className="absolute inset-x-0 top-12 z-20 flex justify-center px-4">
          <p className="rounded-md border border-border bg-background/70 px-3 py-2 text-base text-destructive backdrop-blur-sm">
            {audioNotice ?? camNotice}
          </p>
        </div>
      )}

      {/* write-up chrome — hidden entirely while immersive */}
      {!immersive && (
        <>
          <div className="absolute left-4 top-10 z-10 max-w-xl">
            <Link
              href="/dream"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline"
            >
              ← back to the dream lab
            </Link>
            <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              19680 · resonhand · two-hand resonant conducting
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Resonhand
            </h1>
            {!running && (
              <p className="mt-3 text-base leading-relaxed text-foreground">
                Reach into one of Karel&apos;s piano recordings with both hands and ring out its own
                harmony — a resonant halo tuned live to the exact chord he&apos;s playing. Your{" "}
                <span className="text-primary">left hand</span> swells the halo and lights the chord
                tones; your <span className="text-primary">right hand</span> tilts its brightness and
                pans it; the space between your hands opens the room.
              </p>
            )}
          </div>

          <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-3 bg-gradient-to-t from-background/90 to-transparent p-4 pt-10">
            <div className="flex flex-wrap items-center gap-3">
              {!running ? (
                <button
                  type="button"
                  onClick={() => void handleStart()}
                  disabled={loading}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                >
                  {loading ? "Loading his take…" : "Ring out the harmony"}
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
                  {COLLECTIONS.map((col) => (
                    <optgroup key={col.name} label={col.name}>
                      {col.tracks.map((tk) => (
                        <option key={tk.id} value={tk.id}>
                          {tk.title}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              {running && (
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  conducting:{" "}
                  <span className="text-primary">{driver === "hands" ? "your hands" : "pointer"}</span>
                </span>
              )}
              {running && using2D && (
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  canvas 2d fallback
                </span>
              )}
              <ImmersiveHud
                immersive={immersive}
                onToggle={toggle}
                title="Resonhand"
                description="Two hands reach into one of Karel's piano recordings and ring out its own harmony — a resonant halo tuned live to the chord he's playing in that moment."
                howTo={[
                  "Stand so the camera sees both hands, palms toward you.",
                  "Raise your left hand to swell the shimmering halo; spread its fingers to light the full chord.",
                  "Raise your right hand to brighten the halo; move it side to side to pan it.",
                  "Move your hands apart to open the room; bring them together to close it.",
                  "No camera? Drag across the field with the pointer to conduct.",
                ]}
              />
            </div>

            {!running && !loading && (
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                tap ring out — grant the camera for two-hand conducting, or conduct with the pointer
              </p>
            )}
            {glNotice && (
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {glNotice}
              </p>
            )}
            {running && (
              <p className="max-w-3xl text-sm text-muted-foreground">
                input: MediaPipe two-hand landmarks (pointer fallback) · harmony: his track&apos;s
                live chord analysis retunes an 8-band bandpass resonator bank · output: raw WebGL2
                filament field (Canvas2D fallback) · audio: his real decoded take + a resonant halo →
                stereo pan → feedback-delay space → ear-safe master.
              </p>
            )}
          </div>
        </>
      )}

      {/* in immersive, only the HUD pills (plus the status line + errors above) */}
      {immersive && (
        <ImmersiveHud
          immersive={immersive}
          onToggle={toggle}
          title="Resonhand"
          description="Two hands reach into one of Karel's piano recordings and ring out its own harmony — a resonant halo tuned live to the chord he's playing in that moment."
          howTo={[
            "Stand so the camera sees both hands, palms toward you.",
            "Raise your left hand to swell the halo; spread its fingers for the full chord.",
            "Raise your right hand to brighten the halo; move it to pan it.",
            "Move your hands apart to open the room.",
            "No camera? Drag across the field to conduct.",
          ]}
        />
      )}
    </main>
  );
}
