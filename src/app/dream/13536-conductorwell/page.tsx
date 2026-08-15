"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as THREE from "three";
import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { loadTrackAnalysis, type TrackNote } from "../_shared/trackAnalysis";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { README_TEXT } from "./readme-text";

// ─────────────────────────────────────────────────────────────────────────────
// 13536-conductorwell · "Conduct your own recording with a real beat."
//
//   Karel's recording is his orchestra; a circular beat-conducting gesture is the
//   baton. The angular velocity of the orbit sets the conducted tempo (faster
//   circling = faster; stop = a frozen shimmering sustain; reverse = reverse),
//   and the orbit radius sets dynamics — pitch never moves. The engine is a
//   real-time, pitch-preserving granular / overlap-add time-stretch; the output
//   is a three.js well of motes streaming through the baton ring into depth.
// ─────────────────────────────────────────────────────────────────────────────

const TWO_PI = Math.PI * 2;

// ── granular OLA engine constants ────────────────────────────────────────────
const GRAIN_DUR = 0.11; // seconds of his audio per grain (pitch = his, at rate 1)
const GRAIN_HOP = 0.045; // OUTPUT seconds between grain onsets (constant)
const LOOKAHEAD = 0.12; // schedule this far ahead of ctx.currentTime
const SCHED_MS = 25; // scheduler wake interval
const RATE_MIN = -2.5;
const RATE_MAX = 2.5;

// ── visual constants ─────────────────────────────────────────────────────────
const MOTE_COUNT = 1600;
const BASE_FLOW = 6.0; // world units/sec of depth flow at conducted rate 1
const GATE_Z = 3.0; // the baton-ring plane (mouth of the well)
const FAR_Z = -46.0; // deep back of the well
const NEAR_LIMIT = 6.6; // past-camera recycle line (for reverse flow)

const IDLE_MS = 2600; // hold-then-auto-beat window after releasing the baton
const AUTO_SPEED = 2.0; // rad/sec of the demo auto-beat orbit

// ── small deterministic helpers (no Math.random / Date.now) ──────────────────
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}
// shortest signed angular difference b - a, wrapped to (-PI, PI]
function angleDiff(b: number, a: number): number {
  let d = (b - a) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  if (d < -Math.PI) d += TWO_PI;
  return d;
}

// cool violet ramp on near-black (art only — never a className)
const RAMP: Array<[number, number, number]> = [
  [0.09, 0.11, 0.4], // deep indigo
  [0.28, 0.3, 0.85], // indigo
  [0.42, 0.36, 0.98], // violet
  [0.56, 0.51, 1.0], // periwinkle
  [0.78, 0.72, 1.0], // soft lilac
  [0.93, 0.92, 1.0], // near-white
];
function ramp(t: number): [number, number, number] {
  const x = clamp(t, 0, 1);
  const f = x * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(f));
  const k = f - i;
  const a = RAMP[i];
  const b = RAMP[i + 1];
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

// unit Hann window for grain envelopes (scaled per grain by dynamics)
const HANN_N = 64;
const HANN = new Float32Array(HANN_N);
for (let i = 0; i < HANN_N; i++) {
  HANN[i] = 0.5 - 0.5 * Math.cos((TWO_PI * i) / (HANN_N - 1));
}

// last note whose onset is <= t (binary search over time-sorted notes)
function findNoteIndex(notes: TrackNote[], t: number): number {
  let lo = 0;
  let hi = notes.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid].time <= t) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

const MIDI_LO = 33; // ~A1
const MIDI_HI = 96; // ~C7
function midiNorm(midi: number): number {
  return clamp((midi - MIDI_LO) / (MIDI_HI - MIDI_LO), 0, 1);
}

// rough pitch from the live spectrum, for tracks with no published note-roll
function peakFromSpectrum(
  freq: Uint8Array<ArrayBuffer>,
  sampleRate: number,
  fftSize: number,
): { norm: number; vel: number } {
  const binHz = sampleRate / fftSize;
  const lo = Math.max(1, Math.floor(70 / binHz));
  const hi = Math.min(freq.length - 1, Math.floor(2200 / binHz));
  let bi = lo;
  let bv = 0;
  for (let b = lo; b <= hi; b++) {
    if (freq[b] > bv) {
      bv = freq[b];
      bi = b;
    }
  }
  const f = bi * binHz;
  const midi = 69 + 12 * Math.log2(f / 440);
  return { norm: midiNorm(midi), vel: clamp(bv / 255, 0, 1) };
}

// ── the granular overlap-add time-stretch engine ─────────────────────────────
// One read-head walks his recording at the CONDUCTED rate; a constant stream of
// short grains (each played at speed 1 → his pitch) is overlap-added back into
// continuous sound. Decoupling read-head speed from grain-emit rate = pitch-safe
// time stretch. rate 0 → a frozen shimmering sustain; rate < 0 → reverse.
class GranularEngine {
  private ctx: AudioContext;
  private buffer: AudioBuffer;
  private lowpass: BiquadFilterNode;
  private rng = makeRng(0x51ac33);
  private scratch = new Float32Array(HANN_N);

  readPos = 0; // seconds into the buffer (public: visuals read it)
  private rate = 1; // smoothed conducted rate
  private dyn = 0.5; // smoothed dynamics 0..1
  private bright = 0.6; // smoothed brightness 0..1
  private tRate = 1;
  private tDyn = 0.5;
  private tBright = 0.6;

  private nextGrainTime = 0;
  private timer: number | null = null;
  private running = false;

  constructor(ctx: AudioContext, buffer: AudioBuffer, dest: AudioNode) {
    this.ctx = ctx;
    this.buffer = buffer;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 12000;
    lp.Q.value = 0.7;
    lp.connect(dest);
    this.lowpass = lp;
  }

  setTarget(rate: number, dyn: number, bright: number): void {
    this.tRate = clamp(rate, RATE_MIN, RATE_MAX);
    this.tDyn = clamp(dyn, 0, 1);
    this.tBright = clamp(bright, 0, 1);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.nextGrainTime = this.ctx.currentTime + 0.06;
    this.timer = window.setInterval(this.tick, SCHED_MS);
  }

  private tick = (): void => {
    if (!this.running) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const dur = this.buffer.duration;

    // brightness → lowpass cutoff, smoothed
    const cutoff = 420 + this.bright * 11000;
    this.lowpass.frequency.setTargetAtTime(cutoff, now, 0.05);

    while (this.nextGrainTime < now + LOOKAHEAD) {
      // per-grain smoothing so params glide even between UI frames
      const k = 0.14;
      this.rate += (this.tRate - this.rate) * k;
      this.dyn += (this.tDyn - this.dyn) * k;
      this.bright += (this.tBright - this.bright) * k;

      this.scheduleGrain(Math.max(this.nextGrainTime, now + 0.004));

      // advance the read-head at the CONDUCTED rate (this is the time-stretch)
      this.readPos += this.rate * GRAIN_HOP;
      if (this.readPos >= dur) this.readPos -= dur;
      if (this.readPos < 0) this.readPos += dur;

      this.nextGrainTime += GRAIN_HOP; // OUTPUT hop is constant
    }
  };

  private scheduleGrain(when: number): void {
    const ctx = this.ctx;
    const dur = this.buffer.duration;
    let rp = this.readPos;
    // near-freeze: jitter the read position a few ms so a held chord shimmers
    if (Math.abs(this.rate) < 0.06) {
      rp += (this.rng() - 0.5) * 0.01;
    }
    rp = clamp(rp, 0, Math.max(0, dur - GRAIN_DUR - 0.05));

    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    src.playbackRate.value = 1; // <-- pitch stays exactly his

    const g = ctx.createGain();
    const peak = Math.max(0.0001, this.dyn * 0.5);
    for (let i = 0; i < HANN_N; i++) this.scratch[i] = HANN[i] * peak;
    g.gain.setValueCurveAtTime(this.scratch, when, GRAIN_DUR);

    src.connect(g);
    g.connect(this.lowpass);
    src.onended = () => {
      try {
        src.disconnect();
        g.disconnect();
      } catch {
        /* already gone */
      }
    };
    src.start(when, rp, GRAIN_DUR + 0.02);
  }

  dispose(): void {
    this.running = false;
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    try {
      this.lowpass.disconnect();
    } catch {
      /* ctx closing */
    }
  }
}

// ── the three.js well ────────────────────────────────────────────────────────
interface SceneParams {
  rate: number;
  dyn: number;
  batonAngle: number;
  noteMidiNorm: number;
  noteVel: number;
  level: number;
  time: number;
}

const MOTE_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uPixel;
  uniform float uShimmer;
  varying vec3 vColor;
  varying float vSoft;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float shimmer = 1.0 - uShimmer * 0.25 + uShimmer * 0.25 * sin(uTime * 3.0 + aPhase);
    gl_PointSize = aSize * shimmer * uPixel * (34.0 / max(0.5, -mv.z));
    // fade into the depth of the well (mv.z more negative = deeper)
    float depthFade = clamp((-mv.z - 4.0) / 40.0, 0.0, 1.0);
    vColor = aColor * (1.0 - depthFade * 0.85);
    vSoft = shimmer;
    gl_PointSize = clamp(gl_PointSize, 0.0, 90.0);
  }
`;

const MOTE_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vSoft;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d);
    if (r > 0.5) discard;
    float a = smoothstep(0.5, 0.0, r);
    gl_FragColor = vec4(vColor * (0.6 + 0.4 * vSoft), a);
  }
`;

class ConductorScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private mount: HTMLElement;

  private geo: THREE.BufferGeometry;
  private mat: THREE.ShaderMaterial;
  private positions: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;
  private posAttr: THREE.BufferAttribute;
  private colAttr: THREE.BufferAttribute;
  private sizeAttr: THREE.BufferAttribute;
  private count: number;

  private batonGroup: THREE.Group;
  private batonMat: THREE.MeshBasicMaterial;
  private markerMat: THREE.MeshBasicMaterial;
  private gateMat: THREE.MeshBasicMaterial;
  private disposables: Array<{ dispose: () => void }> = [];

  private rng = makeRng(0x9e3779b9);
  private uniforms: { uTime: { value: number }; uPixel: { value: number }; uShimmer: { value: number } };
  private cur = { dyn: 0.5, nMidi: 0.5, nVel: 0.5 };
  private dirty = false;

  constructor(mount: HTMLElement, count: number, shimmer: number) {
    this.mount = mount;
    this.count = count;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    if (!renderer.getContext()) throw new Error("no webgl context");
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0x06060e, 1);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x06060e, 0.02);
    this.scene = scene;

    const w = mount.clientWidth || window.innerWidth;
    const h = mount.clientHeight || window.innerHeight;
    renderer.setSize(w, h);
    mount.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 120);
    camera.position.set(0, 0.6, 7.4);
    camera.lookAt(0, 0, -6);
    this.camera = camera;

    // ── mote field ──
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    this.positions = positions;
    this.colors = colors;
    this.sizes = sizes;

    for (let i = 0; i < count; i++) {
      // spread initial motes across the depth of the well
      const z = FAR_Z + this.rng() * (GATE_Z - FAR_Z);
      this.emitAt(i, z);
      phases[i] = this.rng() * TWO_PI;
    }

    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(positions, 3);
    this.colAttr = new THREE.BufferAttribute(colors, 3);
    this.sizeAttr = new THREE.BufferAttribute(sizes, 1);
    geo.setAttribute("position", this.posAttr);
    geo.setAttribute("aColor", this.colAttr);
    geo.setAttribute("aSize", this.sizeAttr);
    geo.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    this.geo = geo;
    this.disposables.push(geo);

    this.uniforms = {
      uTime: { value: 0 },
      uPixel: { value: renderer.getPixelRatio() },
      uShimmer: { value: shimmer },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: MOTE_VERT,
      fragmentShader: MOTE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mat = mat;
    this.disposables.push(mat);
    scene.add(new THREE.Points(geo, mat));

    // ── faint fixed gate ring (a reference at the mouth of the well) ──
    const gateGeo = new THREE.TorusGeometry(1.5, 0.012, 8, 96);
    const gateMat = new THREE.MeshBasicMaterial({
      color: 0x2a2360,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.gateMat = gateMat;
    this.disposables.push(gateGeo, gateMat);
    const gate = new THREE.Mesh(gateGeo, gateMat);
    gate.position.z = GATE_Z;
    scene.add(gate);

    // ── the baton: a bright orbit ring + a marker that spins to the beat ──
    const batonGroup = new THREE.Group();
    batonGroup.position.z = GATE_Z;
    this.batonGroup = batonGroup;

    const ringGeo = new THREE.TorusGeometry(1, 0.035, 12, 128);
    const batonMat = new THREE.MeshBasicMaterial({
      color: 0x8b5cf6,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.batonMat = batonMat;
    this.disposables.push(ringGeo, batonMat);
    batonGroup.add(new THREE.Mesh(ringGeo, batonMat));

    const markGeo = new THREE.SphereGeometry(0.11, 16, 16);
    const markerMat = new THREE.MeshBasicMaterial({
      color: 0xd8d4ff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.markerMat = markerMat;
    this.disposables.push(markGeo, markerMat);
    const marker = new THREE.Mesh(markGeo, markerMat);
    marker.position.set(1, 0, 0); // on the ring; group scale/rotation moves it
    batonGroup.add(marker);

    scene.add(batonGroup);
  }

  private ringRadius(): number {
    return 0.6 + this.cur.dyn * 1.9;
  }

  private emitAt(i: number, zStart: number): void {
    const r = this.rng;
    const a = r() * TWO_PI;
    const rad = this.ringRadius() * (0.45 + r() * 0.7);
    const x = Math.cos(a) * rad + (this.cur.nMidi - 0.5) * 3.2;
    const y = Math.sin(a) * rad + (this.cur.nMidi - 0.5) * 1.2;
    const p = this.positions;
    p[i * 3] = x;
    p[i * 3 + 1] = y;
    p[i * 3 + 2] = zStart + (r() - 0.5) * 0.8;
    this.sizes[i] = 5 + this.cur.nVel * 20 + r() * 4;
    const c = ramp(this.cur.nMidi);
    const b = 0.5 + this.cur.nVel * 0.6;
    this.colors[i * 3] = c[0] * b;
    this.colors[i * 3 + 1] = c[1] * b;
    this.colors[i * 3 + 2] = c[2] * b;
    this.dirty = true;
  }

  resize(): void {
    const w = this.mount.clientWidth || window.innerWidth;
    const h = this.mount.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.uniforms.uPixel.value = this.renderer.getPixelRatio();
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number, params: SceneParams): void {
    this.cur.dyn = params.dyn;
    this.cur.nMidi = params.noteMidiNorm;
    this.cur.nVel = params.noteVel;

    // flow the motes into (or out of) the depth at the conducted rate
    const dz = -params.rate * BASE_FLOW * dt;
    if (Math.abs(dz) > 1e-6) {
      const p = this.positions;
      for (let i = 0; i < this.count; i++) {
        const z = p[i * 3 + 2] + dz;
        if (dz < 0) {
          if (z < FAR_Z) {
            this.emitAt(i, GATE_Z); // recycle to the gate, pouring inward
            continue;
          }
        } else if (z > NEAR_LIMIT) {
          this.emitAt(i, FAR_Z); // reverse: recycle to the back
          continue;
        }
        p[i * 3 + 2] = z;
      }
      this.dirty = true;
    }
    if (this.dirty) {
      this.posAttr.needsUpdate = true;
      this.colAttr.needsUpdate = true;
      this.sizeAttr.needsUpdate = true;
      this.dirty = false;
    }

    // baton: widen with dynamics, spin to the beat, brighten with tempo + level
    const rad = this.ringRadius();
    this.batonGroup.scale.setScalar(rad);
    this.batonGroup.rotation.z = params.batonAngle;
    const glow = clamp(0.35 + Math.min(1, Math.abs(params.rate)) * 0.9 + params.level * 0.5, 0, 1.6);
    this.batonMat.color.setRGB(0.35 * glow, 0.28 * glow, 0.7 * glow);
    this.batonMat.opacity = clamp(0.5 + glow * 0.4, 0, 1);
    this.markerMat.color.setRGB(0.7 * glow, 0.68 * glow, glow);

    this.uniforms.uTime.value = params.time;
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    for (const d of this.disposables) {
      try {
        d.dispose();
      } catch {
        /* noop */
      }
    }
    try {
      this.renderer.dispose();
      const el = this.renderer.domElement;
      el.parentNode?.removeChild(el);
    } catch {
      /* noop */
    }
  }
}

// ── page ─────────────────────────────────────────────────────────────────────
type Phase = "idle" | "loading" | "playing";
type Mode = "conduct" | "hold" | "auto";

const MODE_LABEL: Record<Mode, string> = {
  conduct: "conducting — your hand is the beat",
  hold: "held — a frozen, shimmering sustain",
  auto: "auto-beat — grab the baton to take over",
};

function dynWord(d: number): string {
  if (d < 0.33) return "piano";
  if (d < 0.55) return "mezzo-piano";
  if (d < 0.75) return "mezzo-forte";
  return "forte";
}

export default function ConductorWellPage() {
  const mountRef = useRef<HTMLDivElement>(null);

  const [track, setTrack] = useState(REAL_TRACKS[0]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [analysisMissing, setAnalysisMissing] = useState(false);
  const [webglOk, setWebglOk] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [hud, setHud] = useState<{ rate: number; dyn: number; mode: Mode }>({
    rate: 0,
    dyn: 0.5,
    mode: "auto",
  });

  // audio graph
  const ctxRef = useRef<AudioContext | null>(null);
  const safeRef = useRef<SafeMaster | null>(null);
  const engineRef = useRef<GranularEngine | null>(null);
  const analyserBufRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const notesRef = useRef<TrackNote[]>([]);

  // three
  const sceneRef = useRef<ConductorScene | null>(null);

  // gesture + loop state
  const gestureRef = useRef({ active: false, angle: 0, radius: 0, minDim: 1 });
  const prevAngleRef = useRef(0);
  const angVelRef = useRef(0);
  const autoAngleRef = useRef(0);
  const lastInteractRef = useRef(0);
  const dynHeldRef = useRef(0.5);
  const dispRateRef = useRef(0);
  const dispDynRef = useRef(0.5);
  const visReadRef = useRef(0);
  const levelRef = useRef(0);
  const reducedRef = useRef(false);

  const rafRef = useRef(0);
  const lastTsRef = useRef(0);
  const hudTickRef = useRef(0);
  const phaseRef = useRef<Phase>("idle");

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // ── the animation / conducting loop (runs from mount, audio or not) ────────
  const frame = useCallback((tsMs: number) => {
    rafRef.current = requestAnimationFrame(frame);
    const ts = tsMs / 1000;
    if (lastTsRef.current === 0) lastTsRef.current = ts;
    let dt = ts - lastTsRef.current;
    lastTsRef.current = ts;
    if (!(dt > 0) || dt > 0.05) dt = 0.016;

    const now = tsMs;
    const g = gestureRef.current;

    let targetRate: number;
    let targetDyn: number;
    let targetBright: number;
    let batonAngle: number;
    let mode: Mode;

    if (g.active) {
      // angular velocity of the orbit = conducted tempo; radius = dynamics
      const dA = angleDiff(g.angle, prevAngleRef.current);
      prevAngleRef.current = g.angle;
      const angVel = dA / dt;
      angVelRef.current = lerp(angVelRef.current, angVel, clamp(dt * 9, 0, 1));
      targetRate = clamp(angVelRef.current / 2.3, RATE_MIN, RATE_MAX);
      const rNorm = clamp(g.radius / (0.34 * (g.minDim || 1)), 0, 1);
      targetDyn = 0.2 + rNorm * 0.75;
      targetBright = 0.35 + rNorm * 0.6;
      batonAngle = g.angle;
      dynHeldRef.current = targetDyn;
      lastInteractRef.current = now;
      mode = "conduct";
    } else if (now - lastInteractRef.current > IDLE_MS) {
      // gentle auto-beat demo so the well is never silent
      const spd = reducedRef.current ? AUTO_SPEED * 0.55 : AUTO_SPEED;
      autoAngleRef.current += spd * dt;
      angVelRef.current = lerp(angVelRef.current, spd, clamp(dt * 3, 0, 1));
      targetRate = reducedRef.current ? 0.6 : 0.85;
      targetDyn = 0.55;
      targetBright = 0.6;
      batonAngle = autoAngleRef.current;
      mode = "auto";
    } else {
      // just released: hold the last breath — a frozen shimmering sustain
      angVelRef.current = lerp(angVelRef.current, 0, clamp(dt * 6, 0, 1));
      targetRate = 0;
      targetDyn = dynHeldRef.current;
      targetBright = 0.3 + dynHeldRef.current * 0.4;
      batonAngle = prevAngleRef.current;
      mode = "hold";
    }

    dispRateRef.current = lerp(dispRateRef.current, targetRate, clamp(dt * 5, 0, 1));
    dispDynRef.current = lerp(dispDynRef.current, targetDyn, clamp(dt * 5, 0, 1));
    visReadRef.current += dispRateRef.current * dt;

    engineRef.current?.setTarget(targetRate, targetDyn, targetBright);

    // audio level for the glow
    let level = 0;
    const safe = safeRef.current;
    const buf = analyserBufRef.current;
    if (safe && buf) {
      safe.analyser.getByteFrequencyData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i];
      level = sum / (buf.length * 255);
    }
    levelRef.current = lerp(levelRef.current, level, clamp(dt * 6, 0, 1));

    // current note → mote pitch / brightness
    let nMidi = 0.5;
    let nVel = 0.5;
    const engine = engineRef.current;
    const notes = notesRef.current;
    if (engine && notes.length > 0) {
      const n = notes[findNoteIndex(notes, engine.readPos)];
      if (n) {
        nMidi = midiNorm(n.midi);
        nVel = clamp(n.velocity / 127, 0, 1);
      }
    } else if (engine && safe && buf) {
      const p = peakFromSpectrum(buf, safe.analyser.context.sampleRate, safe.analyser.fftSize);
      nMidi = p.norm;
      nVel = 0.3 + p.vel * 0.7;
    } else {
      nMidi = 0.5 + 0.4 * Math.sin(visReadRef.current * 0.6);
      nVel = 0.45 + 0.2 * Math.sin(visReadRef.current * 1.7 + 1);
    }

    sceneRef.current?.update(dt, {
      rate: dispRateRef.current,
      dyn: dispDynRef.current,
      batonAngle,
      noteMidiNorm: nMidi,
      noteVel: nVel,
      level: levelRef.current,
      time: ts,
    });

    hudTickRef.current++;
    if (hudTickRef.current % 8 === 0) {
      setHud({ rate: dispRateRef.current, dyn: dispDynRef.current, mode });
    }
  }, []);

  // ── boot: three scene + reduced-motion probe + rAF ─────────────────────────
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      reducedRef.current = mq.matches;
    }
    const mount = mountRef.current;
    if (mount) {
      try {
        sceneRef.current = new ConductorScene(
          mount,
          reducedRef.current ? 900 : MOTE_COUNT,
          reducedRef.current ? 0 : 1,
        );
      } catch {
        setWebglOk(false);
      }
    }
    // auto-beat active immediately (before first interaction)
    lastInteractRef.current = -1e9;

    const onResize = () => sceneRef.current?.resize();
    window.addEventListener("resize", onResize);
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", onResize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [frame]);

  // ── audio teardown on unmount ──────────────────────────────────────────────
  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
      safeRef.current?.disconnect();
      safeRef.current = null;
      const ac = ctxRef.current;
      ctxRef.current = null;
      if (ac && ac.state !== "closed") void ac.close();
    };
  }, []);

  // ── pointer: press + circle to conduct ─────────────────────────────────────
  const updateGesture = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const gest = gestureRef.current;
    gest.angle = Math.atan2(dy, dx);
    gest.radius = Math.hypot(dx, dy);
    gest.minDim = Math.min(rect.width, rect.height);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      updateGesture(e);
      const gest = gestureRef.current;
      gest.active = true;
      prevAngleRef.current = gest.angle;
      lastInteractRef.current = performance.now();
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    [updateGesture],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!gestureRef.current.active) return;
      updateGesture(e);
      lastInteractRef.current = performance.now();
    },
    [updateGesture],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    gestureRef.current.active = false;
    lastInteractRef.current = performance.now();
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      /* noop */
    }
  }, []);

  // ── transport ──────────────────────────────────────────────────────────────
  const stop = useCallback(() => {
    engineRef.current?.dispose();
    engineRef.current = null;
    setPhase("idle");
  }, []);

  const play = useCallback(async () => {
    setError(null);
    setPhase("loading");
    try {
      let ctx = ctxRef.current;
      if (!ctx || ctx.state === "closed") {
        ctx = new AudioContext();
        ctxRef.current = ctx;
      }
      if (ctx.state === "suspended") await ctx.resume();

      let safe = safeRef.current;
      if (!safe) {
        safe = createSafeMaster(ctx);
        safeRef.current = safe;
        analyserBufRef.current = new Uint8Array(safe.analyser.frequencyBinCount);
      }

      const [analysis, wh] = await Promise.all([
        loadTrackAnalysis(track.id).catch(() => null),
        loadRealTrackBuffer(ctx, track.id),
      ]);

      if (analysis && analysis.notes.length > 0) {
        notesRef.current = analysis.notes;
        setAnalysisMissing(false);
      } else {
        notesRef.current = [];
        setAnalysisMissing(true);
      }

      engineRef.current?.dispose();
      const engine = new GranularEngine(ctx, wh.buffer, safe.input);
      engine.readPos = 0;
      visReadRef.current = 0;
      engine.start();
      engineRef.current = engine;
      setPhase("playing");
    } catch (err) {
      setError(
        err instanceof Error
          ? `Audio could not load (${err.message}). The well still conducts a silent demo — pick another track and try again.`
          : "Audio could not load. Pick another track and try again.",
      );
      notesRef.current = [];
      engineRef.current?.dispose();
      engineRef.current = null;
      setPhase("idle");
    }
  }, [track]);

  const onSelectTrack = useCallback(
    (id: string) => {
      const t = REAL_TRACKS.find((x) => x.id === id);
      if (!t) return;
      setTrack(t);
      if (phaseRef.current === "playing") stop();
      notesRef.current = [];
    },
    [stop],
  );

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      {/* the well — three.js canvas mounts here; this div also catches the baton */}
      <div
        ref={mountRef}
        className="absolute inset-0 touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      {/* chrome */}
      <Link
        href="/dream"
        className="absolute left-4 top-4 z-30 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← dream lab
      </Link>
      <button
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-30 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
      >
        Read the design notes
      </button>

      {/* title */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-2 p-6 pt-14">
        <header className="max-w-xl space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            13536 · conductorwell · granular time-stretch
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Conduct his recording
          </h1>
          <p className="text-base text-muted-foreground">
            Press and circle the well like a baton: your orbit&apos;s speed is the
            tempo, its width the dynamics. His piano rushes, broadens, freezes and
            reverses to your beat — the pitch never moves.
          </p>
          <p className="text-sm text-primary">
            Circle to conduct · faster rushes · stop to hold · reverse the circle to
            rewind · wide is forte, tight is piano.
          </p>
        </header>
      </div>

      {/* center read-out */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 translate-y-24 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          conducted tempo
        </p>
        <p className="text-xl font-semibold tracking-tight text-primary">
          {hud.rate >= 0 ? "×" : "rev ×"}
          {Math.abs(hud.rate).toFixed(2)}
        </p>
      </div>

      {/* bottom controls */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-3 p-6">
        {error && <p className="max-w-2xl text-sm text-destructive">{error}</p>}
        {!webglOk && (
          <p className="max-w-2xl text-sm text-muted-foreground">
            WebGL is unavailable, so the well isn&apos;t drawn — but you can still
            press Play and conduct his recording by ear.
          </p>
        )}
        {analysisMissing && !error && (
          <p className="max-w-2xl text-sm text-muted-foreground">
            No published note-roll for this piece — the motes are following the live
            spectrum of his sound instead.
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          {MODE_LABEL[hud.mode]} · {dynWord(hud.dyn)}
        </p>

        <div className="pointer-events-auto flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              track
            </span>
            <select
              value={track.id}
              onChange={(e) => onSelectTrack(e.target.value)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {REAL_TRACKS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>

          {phase !== "playing" ? (
            <button
              onClick={() => void play()}
              disabled={phase === "loading"}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {phase === "loading" ? "Loading…" : "Play his recording"}
            </button>
          ) : (
            <button
              onClick={stop}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Stop
            </button>
          )}
        </div>
      </div>

      {/* design notes modal */}
      {showNotes && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg space-y-4 overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">Design notes</h2>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              {README_TEXT.split("\n\n").map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
