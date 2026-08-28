"use client";

/* ── 16256 · Revenant ───────────────────────────────────────────────────────
 *
 *  ONE IDEA: a canon that authors itself and then answers itself. ONE of Karel's
 *  real piano takes is band-split (a Linkwitz-Riley-ish crossover at ~380 Hz)
 *  into a BASS voice and a TREBLE voice — two looping reads of the SAME buffer.
 *  You conduct ONE voice live by dragging (Y = its time-base / playbackRate,
 *  X = its tone). Your conducting gesture is CAPTURED as an automation curve;
 *  on release it LOOPS BACK as a "revenant" — a translucent ghost presence that
 *  re-performs that voice exactly, on its own loop — and live control hands over
 *  to the SECOND voice, so you end up conducting a two-voice canon you played
 *  against yourself.
 *
 *  A baked authored curve drives the revenant on load, so his take plays in canon
 *  within ~1s of Play with zero input — the canon literally performs itself back.
 *
 *  AUDIO is pure Web Audio: his ONE decoded recording, band-split and time-bent.
 *  No oscillators, no synths, no grains, no generated tone — every audible node
 *  terminates in the shared safeMaster bus.
 *
 *  VISUAL is a three.js inhabited room: a dark loam-lit volumetric space you look
 *  into, where the two voices are two PRESENCES — your live voice a solid, near
 *  moss-body, the revenant a translucent olive ghost farther back that repeats,
 *  tracing the recorded conducting path. WebGL absent → on-brand notice + a
 *  Canvas2D two-presence fallback; audio never waits on the GPU. See README.md.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as THREE from "three";
import { COLLECTIONS, REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { PrototypeNav } from "../_shared/prototype-nav";

// ── tuning ───────────────────────────────────────────────────────────────────
const LOOP_LEN = 12; // seconds — the conducting-loop bar
const CROSSOVER_HZ = 380;
const BODY_POINTS = 2600;
const TRACE_SAMPLES = 56;

type Band = "bass" | "treble";

// earthy / organic palette — soil, moss, stone, bone (three.js colors only;
// all UI chrome uses Resonance semantic tokens elsewhere in this file)
const LOAM = 0x14100b; // deep umber-black ground + fog
const FLOOR = 0x241a10; // umber floor
const GRID = 0x3a3524; // dim olive-umber grid
const MOSS = 0x8a985a; // live presence — moss/olive-sage
const OLIVE = 0x55603a; // revenant ghost — muted olive
const BONE = 0xe8e0c8; // warm bone-cream — active focus highlight

// ── little math ──────────────────────────────────────────────────────────────
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
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

// ── the conducting-automation curve ───────────────────────────────────────────
// r = rate01 (time-base 0..1), o = tone01 (timbre 0..1), t = seconds into loop.
interface Keyframe {
  t: number;
  r: number;
  o: number;
}
type Curve = Keyframe[];

function sampleCurve(curve: Curve, tSec: number): { r: number; o: number } {
  if (curve.length === 0) return { r: 0.5, o: 0.5 };
  if (curve.length === 1) return { r: curve[0].r, o: curve[0].o };
  const p = ((tSec % LOOP_LEN) + LOOP_LEN) % LOOP_LEN;
  let a = curve[0];
  let b = curve[curve.length - 1];
  for (let i = 0; i < curve.length - 1; i++) {
    if (p >= curve[i].t && p <= curve[i + 1].t) {
      a = curve[i];
      b = curve[i + 1];
      break;
    }
  }
  const span = b.t - a.t || 1;
  const f = clamp01((p - a.t) / span);
  return { r: a.r + (b.r - a.r) * f, o: a.o + (b.o - a.o) * f };
}

// Hand-designed baked curves — the canon that plays itself back on load.
const BAKED_BASS: Curve = [
  { t: 0, r: 0.34, o: 0.26 },
  { t: 3, r: 0.6, o: 0.5 },
  { t: 6, r: 0.48, o: 0.72 },
  { t: 9, r: 0.72, o: 0.46 },
  { t: 12, r: 0.34, o: 0.26 },
];
const BAKED_TREBLE: Curve = [
  { t: 0, r: 0.56, o: 0.62 },
  { t: 4, r: 0.72, o: 0.78 },
  { t: 8, r: 0.44, o: 0.4 },
  { t: 12, r: 0.56, o: 0.62 },
];
function flatCurve(r: number, o: number): Curve {
  return [
    { t: 0, r, o },
    { t: LOOP_LEN, r, o },
  ];
}

// ── his one take, band-split into two conducted voices ─────────────────────────
interface Voice {
  source: AudioBufferSourceNode;
  toneLP: BiquadFilterNode;
  gain: GainNode;
  rateMin: number;
  rateMax: number;
  toneMin: number;
  toneMax: number;
}

function makeVoice(
  ctx: AudioContext,
  buffer: AudioBuffer,
  master: SafeMaster,
  band: Band,
): Voice {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  // Linkwitz-Riley-ish crossover: two cascaded Butterworth biquads per band.
  const type: BiquadFilterType = band === "bass" ? "lowpass" : "highpass";
  const x1 = ctx.createBiquadFilter();
  const x2 = ctx.createBiquadFilter();
  x1.type = x2.type = type;
  x1.frequency.value = x2.frequency.value = CROSSOVER_HZ;
  x1.Q.value = x2.Q.value = 0.7071;

  // conducted tone lowpass
  const toneLP = ctx.createBiquadFilter();
  toneLP.type = "lowpass";
  toneLP.frequency.value = band === "bass" ? 900 : 4000;
  toneLP.Q.value = 0.5;

  const gain = ctx.createGain();
  gain.gain.value = band === "bass" ? 0.95 : 0.8;

  source.connect(x1);
  x1.connect(x2);
  x2.connect(toneLP);
  toneLP.connect(gain);
  gain.connect(master.input);

  return {
    source,
    toneLP,
    gain,
    // bounded time-bases: bass 0.6–1.15×, treble 0.72–1.4×
    rateMin: band === "bass" ? 0.6 : 0.72,
    rateMax: band === "bass" ? 1.15 : 1.4,
    toneMin: band === "bass" ? 280 : 900,
    toneMax: band === "bass" ? 1700 : 7000,
  };
}

function applyVoice(ctx: AudioContext, v: Voice, rate01: number, tone01: number): void {
  const now = ctx.currentTime;
  const rate = v.rateMin + clamp01(rate01) * (v.rateMax - v.rateMin);
  v.source.playbackRate.setTargetAtTime(rate, now, 0.13);
  const cut = v.toneMin * Math.pow(v.toneMax / v.toneMin, clamp01(tone01));
  v.toneLP.frequency.setTargetAtTime(cut, now, 0.12);
}

function stopVoice(v: Voice): void {
  try {
    v.source.stop();
  } catch {
    /* already stopped */
  }
  for (const n of [v.source, v.toneLP, v.gain]) {
    try {
      n.disconnect();
    } catch {
      /* ignore */
    }
  }
}

// per-grain "voice" envelope of his waveform — his take made visible.
function makeWaveSamples(buffer: AudioBuffer, count: number): Float32Array {
  const data = buffer.getChannelData(0);
  const out = new Float32Array(count);
  const step = data.length / count;
  let peak = 1e-4;
  for (let i = 0; i < count; i++) {
    const start = Math.floor(i * step);
    const end = Math.min(data.length, Math.floor((i + 1) * step));
    let s = 0;
    let m = 0;
    for (let j = start; j < end; j += 8) {
      s += Math.abs(data[j]);
      m++;
    }
    const v = m ? s / m : 0;
    out[i] = v;
    if (v > peak) peak = v;
  }
  for (let i = 0; i < count; i++) out[i] = Math.min(1, (out[i] / peak) * 1.3);
  return out;
}

// ── the inhabited room (three.js) ──────────────────────────────────────────────
interface PresenceParams {
  rate01: number;
  tone01: number;
}
interface StepParams {
  live: PresenceParams;
  revenant: PresenceParams;
  energy: number;
  curve: Curve;
  curveVersion: number;
  phase: number; // seconds into revenant loop
  pointerX: number;
  pointerY: number;
  time: number;
  reduce: boolean;
}

interface SceneHandle {
  step(p: StepParams): void;
  resize(w: number, h: number): void;
  dispose(): void;
}

const BODY_VERT = /* glsl */ `
  uniform float uHeight;
  uniform float uSpread;
  uniform float uEnergy;
  uniform float uTime;
  uniform float uSize;
  attribute float aSeed;
  attribute float aWave;
  varying float vWave;
  varying float vAlphaMul;
  void main() {
    vWave = aWave;
    vec3 p = position;
    float br = sin(uTime * 1.25 + aSeed * 6.2831) * 0.5 + 0.5;
    p *= 1.0 + uEnergy * 0.10 * br;
    p.x *= 0.62 + uSpread * 0.85;
    p.z *= 0.62 + uSpread * 0.85;
    p.y += (uHeight - 0.5) * 1.7;
    vAlphaMul = 0.55 + br * 0.45;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (1.0 + uEnergy * 0.8) * (300.0 / -mv.z);
  }
`;

const BODY_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uHighlight;
  uniform float uAlpha;
  uniform float uFocus;
  varying float vWave;
  varying float vAlphaMul;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float soft = smoothstep(0.5, 0.04, d);
    vec3 col = mix(uColor, uHighlight, clamp(vWave * uFocus, 0.0, 1.0) * 0.85);
    float a = uAlpha * soft * vAlphaMul * (0.45 + vWave * 0.75);
    gl_FragColor = vec4(col, a);
  }
`;

function buildBody(
  wave: Float32Array,
): { geom: THREE.BufferGeometry } {
  const rand = mulberry32(0x16256);
  const pos = new Float32Array(BODY_POINTS * 3);
  const seeds = new Float32Array(BODY_POINTS);
  const waves = new Float32Array(BODY_POINTS);
  for (let i = 0; i < BODY_POINTS; i++) {
    const u = rand() * 2 - 1;
    const phi = rand() * Math.PI * 2;
    const r = Math.pow(rand(), 0.5);
    const sr = Math.sqrt(Math.max(0, 1 - u * u));
    pos[i * 3] = Math.cos(phi) * sr * r * 0.55;
    pos[i * 3 + 1] = u * r * 0.95; // taller than wide — a standing body
    pos[i * 3 + 2] = Math.sin(phi) * sr * r * 0.55;
    seeds[i] = rand() * 10;
    waves[i] = wave[Math.floor(rand() * wave.length)];
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geom.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  geom.setAttribute("aWave", new THREE.BufferAttribute(waves, 1));
  return { geom };
}

function makeBodyMaterial(color: number, highlight: number, alpha: number, focus: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uHeight: { value: 0.5 },
      uSpread: { value: 0.5 },
      uEnergy: { value: 0 },
      uTime: { value: 0 },
      uSize: { value: 0.9 },
      uColor: { value: new THREE.Color(color) },
      uHighlight: { value: new THREE.Color(highlight) },
      uAlpha: { value: alpha },
      uFocus: { value: focus },
    },
    vertexShader: BODY_VERT,
    fragmentShader: BODY_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
  });
}

const LIVE_POS = new THREE.Vector3(-1.25, 0.15, 1.1);
const GHOST_POS = new THREE.Vector3(1.45, 0.15, -1.9);

function buildScene(canvas: HTMLCanvasElement, wave: Float32Array): SceneHandle {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(1.7, window.devicePixelRatio || 1));
  renderer.setClearColor(LOAM, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(LOAM, 0.075);

  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 100);
  camera.position.set(0, 1.25, 7.2);
  camera.lookAt(0, 0.4, 0);

  // floor + grid → an inhabited room with depth
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshBasicMaterial({ color: FLOOR }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.45;
  scene.add(floor);

  const grid = new THREE.GridHelper(48, 48, GRID, GRID);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.22;
  grid.position.y = -1.44;
  scene.add(grid);

  // two presences
  const { geom: liveGeom } = buildBody(wave);
  const { geom: ghostGeom } = buildBody(wave);
  const liveMat = makeBodyMaterial(MOSS, BONE, 0.9, 1.0);
  const ghostMat = makeBodyMaterial(OLIVE, BONE, 0.42, 0.35);
  const livePts = new THREE.Points(liveGeom, liveMat);
  const ghostPts = new THREE.Points(ghostGeom, ghostMat);
  livePts.position.copy(LIVE_POS);
  ghostPts.position.copy(GHOST_POS);
  scene.add(livePts);
  scene.add(ghostPts);

  // recorded-conducting trace the ghost re-performs (a looping ribbon of points)
  const tracePos = new Float32Array(TRACE_SAMPLES * 3);
  const traceGeom = new THREE.BufferGeometry();
  traceGeom.setAttribute("position", new THREE.BufferAttribute(tracePos, 3));
  const traceMat = new THREE.LineBasicMaterial({
    color: OLIVE,
    transparent: true,
    opacity: 0.5,
  });
  const trace = new THREE.Line(traceGeom, traceMat);
  scene.add(trace);

  // marker riding the loop — makes the self-repeating loop legible
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 12, 12),
    new THREE.MeshBasicMaterial({ color: BONE }),
  );
  scene.add(marker);

  let lastVersion = -1;
  const camTarget = new THREE.Vector3(0, 0.4, 0);

  const traceX = (t: number) => GHOST_POS.x + (t / LOOP_LEN - 0.5) * 2.6;
  const traceY = (r: number) => GHOST_POS.y + (r - 0.5) * 1.7;

  function rebuildTrace(curve: Curve): void {
    const attr = traceGeom.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < TRACE_SAMPLES; i++) {
      const t = (i / (TRACE_SAMPLES - 1)) * LOOP_LEN;
      const s = sampleCurve(curve, t);
      attr.setXYZ(i, traceX(t), traceY(s.r), GHOST_POS.z);
    }
    attr.needsUpdate = true;
  }

  return {
    step(p: StepParams) {
      if (p.curveVersion !== lastVersion) {
        rebuildTrace(p.curve);
        lastVersion = p.curveVersion;
      }
      liveMat.uniforms.uHeight.value = p.live.rate01;
      liveMat.uniforms.uSpread.value = p.live.tone01;
      liveMat.uniforms.uEnergy.value = p.energy;
      liveMat.uniforms.uTime.value = p.time;
      ghostMat.uniforms.uHeight.value = p.revenant.rate01;
      ghostMat.uniforms.uSpread.value = p.revenant.tone01;
      ghostMat.uniforms.uEnergy.value = p.energy * 0.8;
      ghostMat.uniforms.uTime.value = p.time;

      // marker rides the current phase of the revenant loop
      const s = sampleCurve(p.curve, p.phase);
      marker.position.set(traceX(p.phase % LOOP_LEN), traceY(s.r), GHOST_POS.z);

      // slow drift + pointer parallax → the room breathes and you lean into it
      const drift = p.reduce ? 0 : 1;
      const tx = (p.pointerX - 0.5) * 1.6 + Math.sin(p.time * 0.15) * 0.35 * drift;
      const ty = 1.25 + (0.5 - p.pointerY) * 0.7 + Math.sin(p.time * 0.11) * 0.15 * drift;
      camera.position.x += (tx - camera.position.x) * 0.04;
      camera.position.y += (ty - camera.position.y) * 0.04;
      camera.lookAt(camTarget);

      renderer.render(scene, camera);
    },
    resize(w: number, h: number) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    dispose() {
      liveGeom.dispose();
      ghostGeom.dispose();
      traceGeom.dispose();
      liveMat.dispose();
      ghostMat.dispose();
      traceMat.dispose();
      (floor.geometry as THREE.BufferGeometry).dispose();
      (floor.material as THREE.Material).dispose();
      (marker.geometry as THREE.BufferGeometry).dispose();
      (marker.material as THREE.Material).dispose();
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      renderer.dispose();
    },
  };
}

// ── Canvas2D fallback — the identical two-presence model, no WebGL ─────────────
interface FallbackHandle {
  step(p: StepParams, w: number, h: number): void;
}
function buildFallback(ctx: CanvasRenderingContext2D): FallbackHandle {
  const hex = (n: number) =>
    `rgb(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255})`;
  return {
    step(p: StepParams, w: number, h: number) {
      ctx.fillStyle = hex(LOAM);
      ctx.fillRect(0, 0, w, h);
      // faint floor horizon
      ctx.strokeStyle = `rgba(58,53,36,0.35)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h * 0.72);
      ctx.lineTo(w, h * 0.72);
      ctx.stroke();

      const blob = (
        cx: number,
        rate01: number,
        tone01: number,
        color: number,
        alpha: number,
      ) => {
        const cy = h * (0.72 - rate01 * 0.5);
        const rad = (0.06 + tone01 * 0.06 + p.energy * 0.05) * Math.min(w, h);
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
        const c = hex(color);
        g.addColorStop(0, c);
        g.addColorStop(1, "rgba(20,16,11,0)");
        ctx.globalAlpha = alpha;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rad * (0.7 + tone01 * 0.5), rad * 1.15, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      };
      // ghost (far, translucent) then live (near, solid)
      blob(w * 0.64, p.revenant.rate01, p.revenant.tone01, OLIVE, 0.5);
      blob(w * 0.36, p.live.rate01, p.live.tone01, MOSS, 0.92);
    },
  };
}

// ── the runtime engine ─────────────────────────────────────────────────────────
interface Engine {
  ac: AudioContext;
  master: SafeMaster;
  analyserData: Uint8Array<ArrayBuffer>;
  bass: Voice;
  treble: Voice;
  revenantBand: Band; // which voice the ghost re-performs
  revenantCurve: Curve;
  revenantStart: number; // ctx time
  liveCurve: Curve; // idle motion for the live voice when the pointer is off
  liveStart: number;
  curveVersion: number;
  liveVis: PresenceParams; // smoothed for visuals
  revVis: PresenceParams;
  energy: number;
  pointers: Map<number, { x: number; y: number }>;
  pointer: { x: number; y: number };
  armed: boolean;
  recording: Keyframe[] | null;
  recordStart: number;
  lastRecT: number;
  scene: SceneHandle | null;
  fb: FallbackHandle | null;
  ctx2d: CanvasRenderingContext2D | null;
  raf: number;
  lastMs: number;
  time: number;
  reduce: boolean;
}

function liveBand(eng: Engine): Band {
  return eng.revenantBand === "bass" ? "treble" : "bass";
}
function voiceFor(eng: Engine, band: Band): Voice {
  return band === "bass" ? eng.bass : eng.treble;
}

function readPointers(
  eng: Engine,
): PresenceParams | null {
  if (eng.pointers.size === 0) return null;
  let topY = 1;
  let sx = 0;
  let n = 0;
  let minX = 1;
  let maxX = 0;
  for (const p of eng.pointers.values()) {
    topY = Math.min(topY, p.y);
    sx += p.x;
    n++;
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
  }
  let tone = sx / n;
  if (n >= 2) tone = clamp01(tone + (maxX - minX) * 0.5); // two-finger spread opens tone
  return { rate01: clamp01(1 - topY), tone01: clamp01(tone) };
}

type Mode = "idle" | "loading" | "running";

const DEFAULT_TRACK =
  REAL_TRACKS.find((t) => t.title === "Bath")?.id ?? REAL_TRACKS[0].id;

export default function RevenantPage() {
  const [mode, setMode] = useState<Mode>("idle");
  const [trackId, setTrackId] = useState<string>(DEFAULT_TRACK);
  const [using2D, setUsing2D] = useState(false);
  const [glNotice, setGlNotice] = useState<string | null>(null);
  const [audioNotice, setAudioNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [armed, setArmed] = useState(false);
  const [liveLabel, setLiveLabel] = useState<Band>("treble");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const modeRef = useRef<Mode>("idle");

  const liveRateRef = useRef<HTMLSpanElement | null>(null);
  const ghostRateRef = useRef<HTMLSpanElement | null>(null);
  const loopRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const box = canvas?.parentElement;
    const eng = engineRef.current;
    if (!canvas || !box) return;
    const w = box.clientWidth;
    const h = box.clientHeight;
    if (eng?.scene) {
      eng.scene.resize(w, h);
    } else if (eng?.ctx2d) {
      const dpr = Math.min(1.6, window.devicePixelRatio || 1);
      canvas.width = Math.max(2, Math.floor(w * dpr));
      canvas.height = Math.max(2, Math.floor(h * dpr));
      eng.ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }, []);

  const renderLoop = useCallback((nowMs: number) => {
    const eng = engineRef.current;
    if (!eng) return;
    const dt = eng.lastMs ? Math.min(0.05, (nowMs - eng.lastMs) / 1000) : 1 / 60;
    eng.lastMs = nowMs;
    eng.time += dt;
    const now = eng.ac.currentTime;

    // ── the LIVE voice: pointer target, else its idle baked curve ──
    const fromPointer = readPointers(eng);
    const liveTarget: PresenceParams =
      fromPointer ?? sampleCurveP(eng.liveCurve, now - eng.liveStart);
    if (fromPointer) {
      eng.pointer.x = [...eng.pointers.values()][0]?.x ?? eng.pointer.x;
      eng.pointer.y = [...eng.pointers.values()][0]?.y ?? eng.pointer.y;
    }

    // ── capture the conducting gesture while armed ──
    if (eng.armed && eng.recording) {
      const t = now - eng.recordStart;
      if (t - eng.lastRecT >= 0.04) {
        eng.recording.push({ t: Math.min(LOOP_LEN, t), r: liveTarget.rate01, o: liveTarget.tone01 });
        eng.lastRecT = t;
      }
      if (t >= LOOP_LEN) finalizeCapture(eng, setArmed, setLiveLabel);
    }

    // ── the REVENANT voice: sample its looped curve ──
    const phase = now - eng.revenantStart;
    const revTarget = sampleCurveP(eng.revenantCurve, phase);

    // apply to the correct band
    const lb = liveBand(eng);
    applyVoice(eng.ac, voiceFor(eng, lb), liveTarget.rate01, liveTarget.tone01);
    applyVoice(eng.ac, voiceFor(eng, eng.revenantBand), revTarget.rate01, revTarget.tone01);

    // ── his live energy ──
    eng.master.analyser.getByteTimeDomainData(eng.analyserData);
    let sum = 0;
    for (let i = 0; i < eng.analyserData.length; i++) {
      const v = (eng.analyserData[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / eng.analyserData.length);
    eng.energy += (Math.min(1, rms * 3.2) - eng.energy) * 0.2;

    // ── smooth for visuals ──
    const k = 0.16;
    eng.liveVis.rate01 += (liveTarget.rate01 - eng.liveVis.rate01) * k;
    eng.liveVis.tone01 += (liveTarget.tone01 - eng.liveVis.tone01) * k;
    eng.revVis.rate01 += (revTarget.rate01 - eng.revVis.rate01) * k;
    eng.revVis.tone01 += (revTarget.tone01 - eng.revVis.tone01) * k;

    const sp: StepParams = {
      live: eng.liveVis,
      revenant: eng.revVis,
      energy: eng.energy,
      curve: eng.revenantCurve,
      curveVersion: eng.curveVersion,
      phase,
      pointerX: eng.pointer.x,
      pointerY: eng.pointer.y,
      time: eng.time,
      reduce: eng.reduce,
    };
    if (eng.scene) {
      eng.scene.step(sp);
    } else if (eng.ctx2d && eng.fb) {
      const canvas = canvasRef.current;
      eng.fb.step(sp, canvas?.clientWidth ?? 1, canvas?.clientHeight ?? 1);
    }

    if (liveRateRef.current) {
      const lv = voiceFor(eng, lb);
      const rate = lv.rateMin + eng.liveVis.rate01 * (lv.rateMax - lv.rateMin);
      liveRateRef.current.textContent = `${rate.toFixed(2)}×`;
    }
    if (ghostRateRef.current) {
      const gv = voiceFor(eng, eng.revenantBand);
      const rate = gv.rateMin + eng.revVis.rate01 * (gv.rateMax - gv.rateMin);
      ghostRateRef.current.textContent = `${rate.toFixed(2)}×`;
    }
    if (loopRef.current) {
      loopRef.current.textContent = `${(phase % LOOP_LEN).toFixed(1)} / ${LOOP_LEN}s`;
    }

    eng.raf = requestAnimationFrame(renderLoop);
  }, []);

  const stopEverything = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    cancelAnimationFrame(eng.raf);
    stopVoice(eng.bass);
    stopVoice(eng.treble);
    if (eng.scene) eng.scene.dispose();
    eng.master.disconnect();
    const ac = eng.ac;
    if (ac && ac.state !== "closed") {
      window.setTimeout(() => {
        if (ac.state !== "closed") void ac.close();
      }, 350);
    }
    engineRef.current = null;
  }, []);

  const handleStart = useCallback(async () => {
    if (modeRef.current !== "idle") return;
    setGlNotice(null);
    setAudioNotice(null);
    setUsing2D(false);
    setArmed(false);
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
    const bass = makeVoice(ac, loaded.buffer, master, "bass");
    const treble = makeVoice(ac, loaded.buffer, master, "treble");
    const t0 = ac.currentTime + 0.06;
    bass.source.start(t0);
    treble.source.start(t0);

    // visuals — WebGL room, else Canvas2D two-presence fallback
    sizeCanvas();
    const canvas = canvasRef.current;
    const wave = makeWaveSamples(loaded.buffer, 4096);
    let scene: SceneHandle | null = null;
    let ctx2d: CanvasRenderingContext2D | null = null;
    let fb: FallbackHandle | null = null;
    if (canvas) {
      try {
        scene = buildScene(canvas, wave);
        scene.resize(canvas.parentElement?.clientWidth ?? 1, canvas.parentElement?.clientHeight ?? 1);
      } catch {
        scene = null;
        setGlNotice("WebGL is unavailable here — showing the Canvas2D presence fallback.");
      }
    }
    if (!scene && canvas) {
      const g2 = canvas.getContext("2d");
      if (g2) {
        ctx2d = g2;
        fb = buildFallback(g2);
        setUsing2D(true);
        const dpr = Math.min(1.6, window.devicePixelRatio || 1);
        canvas.width = Math.max(2, Math.floor((canvas.parentElement?.clientWidth ?? 2) * dpr));
        canvas.height = Math.max(2, Math.floor((canvas.parentElement?.clientHeight ?? 2) * dpr));
        g2.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    }

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // AUTO-DEMO: baked canon drives the ghost immediately, live voice idles on a
    // baked phrase — his take is in canon with zero input.
    const eng: Engine = {
      ac,
      master,
      analyserData: new Uint8Array(master.analyser.fftSize) as Uint8Array<ArrayBuffer>,
      bass,
      treble,
      revenantBand: "bass",
      revenantCurve: BAKED_BASS,
      revenantStart: ac.currentTime,
      liveCurve: BAKED_TREBLE,
      liveStart: ac.currentTime,
      curveVersion: 0,
      liveVis: { rate01: 0.5, tone01: 0.6 },
      revVis: { rate01: 0.35, tone01: 0.26 },
      energy: 0,
      pointers: new Map(),
      pointer: { x: 0.5, y: 0.5 },
      armed: false,
      recording: null,
      recordStart: 0,
      lastRecT: 0,
      scene,
      fb,
      ctx2d,
      raf: 0,
      lastMs: 0,
      time: 0,
      reduce,
    };
    engineRef.current = eng;
    setLiveLabel("treble");

    setMode("running");
    eng.raf = requestAnimationFrame(renderLoop);
  }, [renderLoop, sizeCanvas, trackId]);

  const handleStop = useCallback(() => {
    stopEverything();
    setMode("idle");
    setUsing2D(false);
    setArmed(false);
  }, [stopEverything]);

  // arm & conduct → capture; release → loop back as the revenant, hand live to
  // the second voice.
  const toggleArm = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    if (!eng.armed) {
      eng.armed = true;
      eng.recording = [];
      eng.recordStart = eng.ac.currentTime;
      eng.lastRecT = -1;
      setArmed(true);
    } else {
      finalizeCapture(eng, setArmed, setLiveLabel);
    }
  }, []);

  const reAuthor = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.armed = false;
    eng.recording = null;
    eng.revenantBand = "bass";
    eng.revenantCurve = BAKED_BASS;
    eng.liveCurve = BAKED_TREBLE;
    eng.revenantStart = eng.ac.currentTime;
    eng.liveStart = eng.ac.currentTime;
    eng.curveVersion++;
    setArmed(false);
    setLiveLabel("treble");
  }, []);

  // pointer = the conducting sensor (touch or mouse); drag conducts the live voice
  const rectXY = (e: React.PointerEvent): { x: number; y: number } => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return {
      x: clamp01((e.clientX - rect.left) / rect.width),
      y: clamp01((e.clientY - rect.top) / rect.height),
    };
  };
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const eng = engineRef.current;
    if (!eng) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    eng.pointers.set(e.pointerId, rectXY(e));
  }, []);
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const eng = engineRef.current;
    if (!eng || !eng.pointers.has(e.pointerId)) return;
    eng.pointers.set(e.pointerId, rectXY(e));
  }, []);
  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.pointers.delete(e.pointerId);
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
    <main className="relative min-h-screen bg-background text-foreground">
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-30 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
        <Link
          href="/dream"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline"
        >
          ← back to the dream lab
        </Link>

        <p className="mt-4 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          16256 · revenant · self-answering canon
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Revenant
        </h1>
        <p className="mt-3 text-base leading-relaxed text-foreground">
          A canon that authors itself and then answers itself. One of Karel&apos;s takes is
          band-split into a bass voice and a treble voice; you conduct one voice live by
          dragging — up bends its time forward, sideways opens its tone. Arm &amp; conduct, then
          release: your gesture loops back as a translucent ghost re-performing that voice
          exactly, and you conduct the second voice against your own recorded first pass.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {!running ? (
            <button
              type="button"
              onClick={() => void handleStart()}
              disabled={loading}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {loading ? "Decoding his take…" : "Play the canon"}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={toggleArm}
                className={`min-h-[44px] rounded-md px-6 text-sm font-medium transition-colors ${
                  armed
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "border border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {armed ? "Release → loop it back" : "Arm & conduct"}
              </button>
              <button
                type="button"
                onClick={reAuthor}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Clear / re-author
              </button>
              <button
                type="button"
                onClick={handleStop}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Stop
              </button>
            </>
          )}

          <label className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            take
            <select
              value={trackId}
              onChange={(e) => setTrackId(e.target.value)}
              disabled={running || loading}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm normal-case tracking-normal text-foreground disabled:opacity-60"
            >
              {COLLECTIONS.map((c) => (
                <optgroup key={c.name} label={c.name}>
                  {c.tracks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        </div>

        {!running && !loading && (
          <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            press play — the canon performs itself; drag to take over the live voice
          </p>
        )}
        {audioNotice && (
          <p className="mt-3 text-base leading-relaxed text-destructive">{audioNotice}</p>
        )}
        {glNotice && (
          <p className="mt-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {glNotice}
          </p>
        )}

        <div
          className="relative mt-5 aspect-video w-full touch-none overflow-hidden rounded-lg border border-border bg-black"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
          {!running && !loading && (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-base text-muted-foreground">
              Press Play — two presences wake in the room, his take already in canon.
            </div>
          )}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-base text-muted-foreground">
              Decoding his recording…
            </div>
          )}
          {running && (
            <p className="pointer-events-none absolute bottom-2 left-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              live voice: <span className="text-primary">{liveLabel}</span> · ghost re-performs the{" "}
              {liveLabel === "treble" ? "bass" : "treble"}
            </p>
          )}
        </div>

        {running && (
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border bg-background/50 p-3">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                live time-base
              </span>
              <p className="mt-1 text-base text-foreground">
                <span ref={liveRateRef}>1.00×</span>
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background/50 p-3">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                ghost time-base
              </span>
              <p className="mt-1 text-base text-foreground">
                <span ref={ghostRateRef}>1.00×</span>
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background/50 p-3">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                loop
              </span>
              <p className="mt-1 text-base text-foreground">
                <span ref={loopRef}>0.0 / {LOOP_LEN}s</span>
              </p>
            </div>
          </div>
        )}

        {running && armed && (
          <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-primary">
            armed · conducting the {liveLabel} — drag now; release to loop it back as the ghost
          </p>
        )}
        {running && using2D && (
          <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            webgl absent · canvas 2d presence fallback
          </p>
        )}

        <p className="mt-8 text-sm text-muted-foreground">
          input: multi-touch / pointer drag conducts the live voice · output: a three.js inhabited
          room, two presences in depth (Canvas2D fallback) · audio: his real take, band-split at
          ~380 Hz into two conducted time-bases — no synths, no grains.
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
                <span className="text-foreground">Revenant</span> asks whether a canon can author
                itself and then answer itself. One of Karel&apos;s real piano takes is band-split by
                a Linkwitz-Riley-ish crossover at ~380&nbsp;Hz (two cascaded biquads per band) into a{" "}
                <span className="text-foreground">bass voice</span> and a{" "}
                <span className="text-foreground">treble voice</span> — two looping reads of the
                same buffer.
              </p>
              <p>
                You conduct one voice by dragging: <span className="text-foreground">Y</span> bends
                its time-base (<code>playbackRate</code>, bounded per voice), <span className="text-foreground">X</span>{" "}
                sweeps its tone lowpass; a second finger widens it. Everything is smoothed with{" "}
                <code>setTargetAtTime</code> so it conducts rather than twitches.
              </p>
              <p>
                <span className="text-foreground">Arm &amp; conduct</span> records that gesture as a
                time-stamped automation curve over a {LOOP_LEN}s bar. On release it loops back and
                drives that voice on its own loop — the translucent{" "}
                <span className="text-foreground">revenant</span> ghost, re-performing your captured
                pass exactly while a marker rides the recorded path. Live control hands to the second
                voice, so you play a two-voice canon against yourself. A baked authored curve drives
                the ghost on load, so his take is in canon within a second, zero input.
              </p>
              <p>
                The room is a three.js perspective scene — loam fog, an umber floor, two point-cloud
                presences at different depths seeded from his waveform: the live voice solid and near
                in moss, the revenant translucent and far in olive, a bone-cream core marking the
                active focus. Earthy on purpose — soil, moss, stone, bone.
              </p>
              <p>
                <span className="text-foreground">Honest novelty.</span> Gesture record/replay is not
                new — see The Living Looper (NIME 2023), Steve Reich&apos;s phase pieces, BachDuet,
                and Real-Time Human–AI Musical Co-Performance (arXiv:2604.07612). What&apos;s specific
                here is the coupling: a conducting-automation curve of a band-split of{" "}
                <span className="text-foreground">his</span> take, looped as a self-answering canon
                voice. No ML agent — it re-performs a real gesture, and answers with his own audio.
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

      <PrototypeNav
        slugs={["16256-revenant", "15760-conduct", "1622-tidal-canon", "15536-antiphon"]}
      />
    </main>
  );
}

// ── module helpers that touch the engine (kept out of the component) ───────────
function sampleCurveP(curve: Curve, tSec: number): PresenceParams {
  const s = sampleCurve(curve, tSec);
  return { rate01: s.r, tone01: s.o };
}

function finalizeCapture(
  eng: Engine,
  setArmed: (v: boolean) => void,
  setLiveLabel: (b: Band) => void,
): void {
  const rec = eng.recording;
  eng.armed = false;
  eng.recording = null;
  setArmed(false);
  if (!rec || rec.length < 2) return;

  // ensure the curve spans the full bar so the loop is seamless
  const curve = rec.slice().sort((a, b) => a.t - b.t);
  if (curve[curve.length - 1].t < LOOP_LEN) {
    curve.push({ t: LOOP_LEN, r: curve[0].r, o: curve[0].o });
  }

  const conducted = liveBand(eng); // the voice we just conducted becomes the ghost
  const held = sampleCurve(eng.liveCurve, 0);
  eng.revenantBand = conducted;
  eng.revenantCurve = curve;
  eng.revenantStart = eng.ac.currentTime;
  // the other voice is now live — hold it steady until the user drags it
  eng.liveCurve = flatCurve(held.r, held.o);
  eng.liveStart = eng.ac.currentTime;
  eng.curveVersion++;
  setLiveLabel(liveBand(eng));
}
