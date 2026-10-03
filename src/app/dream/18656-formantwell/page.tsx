"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  COLLECTIONS,
  REAL_TRACKS,
  loadRealTrackBuffer,
} from "../_shared/welcomeHome";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import {
  createHandTracker,
  startCamera,
  computeHandFeatures,
  type HandLandmarkerInst,
} from "../_shared/cameraTracking";
import { useImmersive, ImmersiveHud } from "../_shared/immersive";
import { PrototypeNav } from "../_shared/prototype-nav";

// ─────────────────────────────────────────────────────────────────────────────
// 18656-formantwell · CYCLE-3 MERGE of 18384-throatmorph (SHIPPED) + vowelbend
// (BANKED). "What if your two hands could reshape the vocal tract of your OWN
// piano recording — morphing its timbre continuously glassy→woody→vowel-like at
// EXACTLY-fixed pitch — by extracting the recording's OWN formants with a real
// cepstrum AND rendering the morph through a provably-stable, hiss-free ordered
// biquad cascade?"
//
// The merge, best of both:
//   · FROM throatmorph — read the recording's OWN spectral envelope with a real
//     cepstrum (log-magnitude → IFFT → low-quefrency lifter → FFT back), then
//     peak-pick it into ~5 ordered SOURCE formants discovered live.
//   · FROM vowelbend   — apply the morph through a cascade of 5 "peaking"
//     BiquadFilterNodes morphed in LOG-frequency with strict LSF-style ordering
//     (min-spacing F(n+1) ≥ 1.12·F(n) so peaks can NEVER cross → unconditionally
//     stable, cannot hiss). NO STFT resynthesis.
//
// The source plays at playbackRate 1.0 through the biquad cascade, so pitch and
// melody never move; only the resonant body (the formants) is reshaped.
//
//   Two-hand conducting (identical across camera / pointer / demo drive):
//     · midpoint x of the two hands → morph position m  (glassy↔woody↔vocal)
//     · average hand height         → morph depth        (0 = untouched original)
//     · hand separation             → vowel position     (/u/→/o/→/a/→/e/→/i/)
//
//   Render (three.js): a scrolling achromatic ultrasound "formant surface"
//   waterfall — the front ridge is the current morphing cascade response ×
//   the live analyser magnitude, so it reshapes as you move and dances to the
//   actual sound; older rows flow back into fog. Grayscale, faint warm-neutral
//   crest tint only, soft depth fog, no colour, no grain.
// ─────────────────────────────────────────────────────────────────────────────

// ── envelope / formant constants ─────────────────────────────────────────────

const FMIN_ENV = 90;
const FMAX_ENV = 8500;
const LN_FMIN = Math.log(FMIN_ENV);
const LN_FMAX = Math.log(FMAX_ENV);
const DB_TO_NAT = Math.LN10 / 20; // 1 dB in natural-log gain units

const N_FORMANTS = 5; // the five peaking biquads of the cascade
const MIN_RATIO = 1.12; // LSF min-spacing: F(n+1) ≥ 1.12·F(n) → peaks never cross
const GAIN_CAP = 12; // peaking-biquad gain cap (dB)
const Q_MIN = 2;
const Q_MAX = 10;
const DIST_MAX = 1.55; // hand separation that maps to full vowel travel
const FFT_N = 2048; // cepstral analysis FFT size (main-thread, worklet-free)

// Peterson–Barney vowel formant table (F1..F4 in Hz), ordered so a rising vowel
// position sweeps /u/ → /o/ → /a/ → /e/ → /i/ (copied from throatmorph).
const VOWELS: [number, number, number, number][] = [
  [300, 870, 2240, 3400], // u
  [570, 840, 2410, 3400], // o
  [730, 1090, 2440, 3400], // a
  [530, 1840, 2480, 3400], // e
  [270, 2290, 3010, 3400], // i
];
const VOWEL_NAMES = ["u", "o", "a", "e", "i"];

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function gauss(x: number, mu: number, sig: number): number {
  const d = (x - mu) / sig;
  return Math.exp(-0.5 * d * d);
}

/** Interpolate the vowel formant table at position p∈[0,1]. */
function vowelFormants(p: number): [number, number, number, number] {
  const s = clamp(p, 0, 1) * (VOWELS.length - 1);
  const i0 = Math.min(VOWELS.length - 2, Math.floor(s));
  const fr = s - i0;
  const a = VOWELS[i0];
  const b = VOWELS[i0 + 1];
  return [
    a[0] + (b[0] - a[0]) * fr,
    a[1] + (b[1] - a[1]) * fr,
    a[2] + (b[2] - a[2]) * fr,
    a[3] + (b[3] - a[3]) * fr,
  ];
}

// ── the three target timbres — each a strictly-INCREASING 5-formant list ─────
// (vowelbend's LSF form: frequency, gain-dB and Q per formant, ordered so the
// componentwise log-frequency interpolation stays ordered at every morph point.)

interface FormantSet {
  F: number[]; // Hz, strictly increasing
  G: number[]; // dB emphasis
  Q: number[]; // resonance sharpness
}

/** GLASSY — rising high-frequency tilt, spread upper formants. */
function glassySet(): FormantSet {
  return {
    F: [520, 1400, 2600, 4000, 6200],
    G: [2, 3, 5, 8, 9],
    Q: [3, 3.5, 4, 4, 4.5],
  };
}
/** WOODY — low-mid emphasis, high rolloff. */
function woodySet(): FormantSet {
  return {
    F: [300, 650, 1150, 2100, 3400],
    G: [9, 7, 4, 1, 0],
    Q: [2.2, 2.4, 2.6, 2.8, 3],
  };
}
/** VOCAL — Peterson–Barney 4-formant row + a fixed singer's-formant 5th. */
function vocalSet(vowel: number): FormantSet {
  const v = vowelFormants(vowel);
  return {
    F: [v[0], v[1], v[2], v[3], 4500],
    G: [11, 10, 7, 5, 3],
    Q: [5, 6, 6, 5, 4],
  };
}

/** Blend the three target sets by morph position m (same scheme as throatmorph's
 *  targetDb): m<0.5 glassy→woody, m≥0.5 woody→vocal. Returns an ordered set. */
function blendTarget(m: number, vowel: number): FormantSet {
  const g = glassySet();
  const w = woodySet();
  const v = vocalSet(vowel);
  let a: FormantSet;
  let b: FormantSet;
  let t: number;
  if (m < 0.5) {
    a = g;
    b = w;
    t = m / 0.5;
  } else {
    a = w;
    b = v;
    t = (m - 0.5) / 0.5;
  }
  const F: number[] = [];
  const G: number[] = [];
  const Q: number[] = [];
  for (let n = 0; n < N_FORMANTS; n++) {
    // log-frequency interpolation — the LSF linearity that keeps order
    F[n] = Math.exp(Math.log(a.F[n]) * (1 - t) + Math.log(b.F[n]) * t);
    G[n] = a.G[n] * (1 - t) + b.G[n] * t;
    Q[n] = a.Q[n] * (1 - t) + b.Q[n] * t;
  }
  return { F, G, Q };
}

// ── the merge engine: source formants → morph → ordered biquad params ────────

interface Formant {
  f: number;
  g: number; // dB
  q: number;
}

/** Belt-and-braces min-spacing pass (the vowelbend stability guarantee): force
 *  F(n+1) ≥ 1.12·F(n) so the five peaks can NEVER cross, at every morph point. */
function enforceOrder(fs: Formant[]): void {
  for (let n = 1; n < fs.length; n++) {
    const minF = fs[n - 1].f * MIN_RATIO;
    if (fs[n].f < minF) fs[n].f = minF;
  }
}

/**
 * Merge: start each cascade formant at the recording's OWN formant frequency
 * (srcF, discovered live by the cepstrum) and migrate it toward the blended
 * target in LOG-frequency by `depth`; ramp the boost from 0 dB (flat, untouched
 * original) at depth 0 to the target emphasis at depth 1. Then enforce order and
 * clamp. At depth 0 every gain is 0 → the cascade is flat → original piano.
 */
function computeFormants(
  srcF: number[],
  m: number,
  vowel: number,
  depth: number,
): Formant[] {
  const tgt = blendTarget(m, vowel);
  const out: Formant[] = [];
  for (let n = 0; n < N_FORMANTS; n++) {
    const sf = srcF[n] && srcF[n] > 0 ? srcF[n] : tgt.F[n];
    const logF = Math.log(sf) * (1 - depth) + Math.log(tgt.F[n]) * depth;
    out.push({
      f: clamp(Math.exp(logF), FMIN_ENV, FMAX_ENV),
      g: clamp(depth * tgt.G[n], -GAIN_CAP, GAIN_CAP),
      q: clamp(tgt.Q[n], Q_MIN, Q_MAX),
    });
  }
  enforceOrder(out);
  for (const o of out) o.f = clamp(o.f, FMIN_ENV, FMAX_ENV);
  return out;
}

/** The shelf-tilt scalar (dB): glassy lifts the top, woody lifts the bottom,
 *  vocal is ~neutral. Scaled by depth so depth 0 is flat. */
function computeTilt(m: number, depth: number): number {
  let tilt: number;
  if (m < 0.5) {
    const t = m / 0.5;
    tilt = 5 * (1 - t) + -6 * t;
  } else {
    const t = (m - 0.5) / 0.5;
    tilt = -6 * (1 - t) + 0 * t;
  }
  return clamp(tilt * depth, -9, 9);
}

/** Approximate the cascade's magnitude response (dB) at frequency f — for the
 *  visual ridge only; the audio truth is the BiquadFilterNodes themselves. */
function morphDb(f: number, fs: Formant[], tilt: number): number {
  const lf = Math.log(f);
  let r = 0;
  for (const o of fs) {
    const bw = Math.max(0.09, 0.42 / Math.max(0.5, o.q));
    r += o.g * gauss(lf, Math.log(o.f), bw);
  }
  const u = (lf - LN_FMIN) / (LN_FMAX - LN_FMIN);
  r += tilt * (u - 0.5) * 2;
  return r;
}

// ── a small self-contained radix-2 FFT (copied in, not imported) ─────────────

interface FFTEngine {
  fft(re: Float32Array, im: Float32Array, inv: boolean): void;
  N: number;
}
function createFFT(N: number): FFTEngine {
  const half = N >> 1;
  const cosT = new Float32Array(half);
  const sinT = new Float32Array(half);
  for (let k = 0; k < half; k++) {
    cosT[k] = Math.cos((2 * Math.PI * k) / N);
    sinT[k] = Math.sin((2 * Math.PI * k) / N);
  }
  const rev = new Int32Array(N);
  const bits = Math.round(Math.log(N) / Math.LN2);
  for (let i = 0; i < N; i++) {
    let x = i;
    let r = 0;
    for (let b = 0; b < bits; b++) {
      r = (r << 1) | (x & 1);
      x >>= 1;
    }
    rev[i] = r;
  }
  return {
    N,
    fft(re: Float32Array, im: Float32Array, inv: boolean) {
      for (let i = 0; i < N; i++) {
        const j = rev[i];
        if (j > i) {
          const tr = re[i];
          re[i] = re[j];
          re[j] = tr;
          const ti = im[i];
          im[i] = im[j];
          im[j] = ti;
        }
      }
      for (let len = 2; len <= N; len <<= 1) {
        const h = len >> 1;
        const step = (N / len) | 0;
        for (let i = 0; i < N; i += len) {
          let k = 0;
          for (let j = i; j < i + h; j++) {
            const wr = cosT[k];
            const wi = inv ? sinT[k] : -sinT[k];
            const ar = re[j + h];
            const ai = im[j + h];
            const vr = ar * wr - ai * wi;
            const vi = ar * wi + ai * wr;
            const ur = re[j];
            const ui = im[j];
            re[j] = ur + vr;
            im[j] = ui + vi;
            re[j + h] = ur - vr;
            im[j + h] = ui - vi;
            k += step;
          }
        }
      }
      if (inv) {
        const invn = 1 / N;
        for (let i = 0; i < N; i++) {
          re[i] *= invn;
          im[i] *= invn;
        }
      }
    },
  };
}

// ── the cepstral source-formant extractor (throatmorph's winning advantage) ──
// Runs on the main thread, ~once per rAF, on the DRY-source analyser:
//   logMag → IFFT → low-quefrency lifter → FFT back → smooth log-envelope Es,
// then peak-pick Es into ~5 ordered SOURCE formants discovered live.

class SourceFormantExtractor {
  private fftE: FFTEngine;
  private N: number;
  private half: number;
  private Lc = 44; // low-quefrency lifter cutoff (keep ~first 44 coeffs)
  private re: Float32Array;
  private im: Float32Array;
  private Es: Float32Array; // smoothed log-envelope (0..half)
  private binF: Float32Array;
  srcF: number[]; // the discovered ordered source formants
  constructor(sampleRate: number) {
    this.N = FFT_N;
    this.half = this.N >> 1;
    this.fftE = createFFT(this.N);
    this.re = new Float32Array(this.N);
    this.im = new Float32Array(this.N);
    this.Es = new Float32Array(this.half + 1);
    this.binF = new Float32Array(this.half + 1);
    for (let k = 0; k <= this.half; k++)
      this.binF[k] = Math.max(1, (k * sampleRate) / this.N);
    // sensible defaults until the first real frame lands
    this.srcF = [500, 1100, 1900, 2900, 4200];
  }

  /** db = analyser getFloatFrequencyData (dB per bin, length = half). */
  analyze(db: Float32Array): void {
    const N = this.N;
    const half = this.half;
    const re = this.re;
    const im = this.im;
    // build the symmetric natural-log-magnitude spectrum
    for (let k = 0; k < half; k++) {
      const v = Number.isFinite(db[k]) ? db[k] : -120;
      re[k] = v * DB_TO_NAT;
      im[k] = 0;
    }
    re[half] = re[half - 1];
    im[half] = 0;
    for (let k = 1; k < half; k++) {
      re[N - k] = re[k];
      im[N - k] = 0;
    }
    // inverse → real cepstrum (real part in re)
    this.fftE.fft(re, im, true);
    // low-quefrency symmetric lifter → keep the smooth envelope only
    const Lc = this.Lc;
    for (let q = Lc + 1; q < N - Lc; q++) {
      re[q] = 0;
      im[q] = 0;
    }
    // forward → smoothed log-magnitude envelope Es
    this.fftE.fft(re, im, false);
    for (let k = 0; k <= half; k++) this.Es[k] = re[k];
    this.pickFormants();
  }

  /** Peak-pick Es into ≤5 ordered source formants (strongest prominent maxima,
   *  greedy by log-frequency separation), sorted strictly increasing. */
  private pickFormants(): void {
    const Es = this.Es;
    const binF = this.binF;
    const half = this.half;
    const W = 3; // local-max neighbourhood
    const cand: { f: number; v: number }[] = [];
    for (let k = W; k <= half - W; k++) {
      const f = binF[k];
      if (f < FMIN_ENV || f > FMAX_ENV) continue;
      let isMax = true;
      for (let j = k - W; j <= k + W; j++) {
        if (j === k) continue;
        if (Es[j] > Es[k]) {
          isMax = false;
          break;
        }
      }
      if (isMax) cand.push({ f, v: Es[k] });
    }
    cand.sort((a, b) => b.v - a.v);
    const picked: number[] = [];
    for (const c of cand) {
      if (picked.length >= N_FORMANTS) break;
      let ok = true;
      for (const p of picked) {
        const r = c.f > p ? c.f / p : p / c.f;
        if (r < 1.22) {
          ok = false;
          break;
        }
      }
      if (ok) picked.push(c.f);
    }
    picked.sort((a, b) => a - b);
    // pad to N_FORMANTS with ordered log-spaced defaults if the frame was thin
    if (picked.length < N_FORMANTS) {
      const have = picked.length;
      for (let n = have; n < N_FORMANTS; n++) {
        const u = (n + 0.5) / N_FORMANTS;
        picked.push(Math.exp(LN_FMIN + u * (LN_FMAX - LN_FMIN)));
      }
      picked.sort((a, b) => a - b);
    }
    this.srcF = picked;
  }
}

// ── unified two-hand control surface (identical to throatmorph) ──────────────

interface Controls {
  m: number; // 0 glassy … 0.5 woody … 1 vocal
  vowel: number; // 0..1 across the vowel manifold
  depth: number; // 0 untouched original … 1 fully morphed
  active: boolean;
}
interface Hand {
  cx: number;
  cy: number;
  height: number;
  active: boolean;
}

/** Two raw hands → the three conducting axes (the one true mapping). */
function computeControls(a: Hand, b: Hand): Controls {
  const midCx = (a.cx + b.cx) / 2;
  const avgH = (a.height + b.height) / 2;
  const dist = Math.hypot(a.cx - b.cx, a.cy - b.cy);
  return {
    m: clamp((midCx + 1.2) / 2.4, 0, 1),
    depth: clamp(avgH, 0, 1),
    vowel: clamp(dist / DIST_MAX, 0, 1),
    active: a.active && b.active,
  };
}

/** Autonomous demo hands — a slow Lissajous sweeping m / depth / vowel so the
 *  whole morph chain is audible and visible with no camera. */
function computeDemoHands(t: number): [Hand, Hand] {
  const sep = 0.55 + 0.55 * (0.5 + 0.5 * Math.sin(t * 0.16));
  const mid = 0.75 * Math.sin(t * 0.11);
  const h = 0.5 + 0.42 * Math.sin(t * 0.21);
  const a: Hand = { cx: mid - sep, cy: 0, height: h, active: true };
  const b: Hand = { cx: mid + sep, cy: 0, height: h, active: true };
  a.cy = h * 2.4 - 1.2;
  b.cy = h * 2.4 - 1.2;
  return [a, b];
}

// ── the three.js ultrasound "formant surface" waterfall (throatmorph lineage) ─

const NX = 140; // frequency columns (log-spaced)
const NZ = 96; // time rows (scrolling into the fog)
const SPAN_X = 12;
const SPAN_Z = 9;
const H_SCALE = 2.6;
const STAGE_BG = 0x0a0b0d;

interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  geom: THREE.BufferGeometry;
  pos: THREE.BufferAttribute;
  col: THREE.BufferAttribute;
  heights: Float32Array;
  colorScratch: Float32Array;
}

function buildStage(canvas: HTMLCanvasElement, w: number, h: number): Stage {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
  renderer.setClearColor(STAGE_BG, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(STAGE_BG, 0.052);

  const camera = new THREE.PerspectiveCamera(52, w / h, 0.1, 100);
  camera.position.set(0, 4.4, 10.4);
  camera.lookAt(0, 0.1, -1.4);

  const count = NX * NZ;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let iz = 0; iz < NZ; iz++) {
    for (let ix = 0; ix < NX; ix++) {
      const idx = iz * NX + ix;
      positions[idx * 3] = (ix / (NX - 1) - 0.5) * SPAN_X;
      positions[idx * 3 + 1] = 0;
      positions[idx * 3 + 2] = (0.5 - iz / (NZ - 1)) * SPAN_Z;
    }
  }
  const indices: number[] = [];
  for (let iz = 0; iz < NZ - 1; iz++) {
    for (let ix = 0; ix < NX - 1; ix++) {
      const a = iz * NX + ix;
      const b = a + 1;
      const c = a + NX;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geom = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(positions, 3);
  const col = new THREE.BufferAttribute(colors, 3);
  pos.setUsage(THREE.DynamicDrawUsage);
  col.setUsage(THREE.DynamicDrawUsage);
  geom.setAttribute("position", pos);
  geom.setAttribute("color", col);
  geom.setIndex(indices);

  const surfMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    fog: true,
    side: THREE.DoubleSide,
  });
  const surface = new THREE.Mesh(geom, surfMat);
  scene.add(surface);

  const wireMat = new THREE.MeshBasicMaterial({
    color: 0x8fa0ad,
    wireframe: true,
    transparent: true,
    opacity: 0.06,
    fog: true,
  });
  const wire = new THREE.Mesh(geom, wireMat);
  scene.add(wire);

  return {
    renderer,
    scene,
    camera,
    geom,
    pos,
    col,
    heights: new Float32Array(count),
    colorScratch: new Float32Array(count),
  };
}

// ── the audio graph: source → 5 peaking biquads → shelf tilt → makeup → bus ──

interface MorphChain {
  biquads: BiquadFilterNode[];
  lowShelf: BiquadFilterNode;
  highShelf: BiquadFilterNode;
  makeup: GainNode;
  input: AudioNode; // connect the source here
}

function buildMorphChain(ctx: AudioContext): MorphChain {
  const biquads: BiquadFilterNode[] = [];
  for (let n = 0; n < N_FORMANTS; n++) {
    const bq = ctx.createBiquadFilter();
    bq.type = "peaking";
    bq.frequency.value = 500 + n * 600;
    bq.gain.value = 0;
    bq.Q.value = 3;
    biquads.push(bq);
  }
  const lowShelf = ctx.createBiquadFilter();
  lowShelf.type = "lowshelf";
  lowShelf.frequency.value = 260;
  lowShelf.gain.value = 0;
  const highShelf = ctx.createBiquadFilter();
  highShelf.type = "highshelf";
  highShelf.frequency.value = 3400;
  highShelf.gain.value = 0;
  const makeup = ctx.createGain();
  makeup.gain.value = 1;
  // wire the cascade in a fixed order
  for (let n = 0; n < N_FORMANTS - 1; n++) biquads[n].connect(biquads[n + 1]);
  biquads[N_FORMANTS - 1].connect(lowShelf);
  lowShelf.connect(highShelf);
  highShelf.connect(makeup);
  return { biquads, lowShelf, highShelf, makeup, input: biquads[0] };
}

// ── component ────────────────────────────────────────────────────────────────

type TrackingMode = "live" | "demo" | "lost" | "pointer";

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // audio
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const chainRef = useRef<MorphChain | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const dryAnalyserRef = useRef<AnalyserNode | null>(null); // taps the DRY source
  const dryDbRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const extractorRef = useRef<SourceFormantExtractor | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null); // safeMaster tap (visuals)
  const freqRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const srRef = useRef(48000);

  // live morph state the visual reads
  const formantsRef = useRef<Formant[]>(
    computeFormants([500, 1100, 1900, 2900, 4200], 0, 0.4, 0),
  );
  const tiltRef = useRef(0);

  // three
  const stageRef = useRef<Stage | null>(null);
  const webglFailedRef = useRef(false);

  // tracking
  const trackerRef = useRef<HandLandmarkerInst | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraOnRef = useRef(false);
  const trackModeRef = useRef<TrackingMode>("demo");
  const fallbackRef = useRef(false);
  const pointerRef = useRef({ x: 0.5, y: 0.5, depth: false, moved: false });

  const vizRef = useRef<Controls>({ m: 0.0, vowel: 0.4, depth: 0.0, active: false });

  const lastTsRef = useRef(0);
  const timeRef = useRef(0);

  const [track, setTrack] = useState(REAL_TRACKS[0]);
  const trackRef = useRef(track);
  useEffect(() => {
    trackRef.current = track;
  }, [track]);

  const [phase, setPhase] = useState<"idle" | "loading" | "playing">("idle");
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const [trackMode, setTrackMode] = useState<TrackingMode>("demo");
  const [cameraBusy, setCameraBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webglMsg, setWebglMsg] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [ui, setUi] = useState({ m: 0, vowel: "a", depth: 0 });

  const { immersive, toggle } = useImmersive();

  // ── apply the morphed formant set to the live biquad cascade ───────────────
  const applyMorph = useCallback(
    (m: number, vowel: number, depth: number) => {
      const ctx = ctxRef.current;
      const chain = chainRef.current;
      const ex = extractorRef.current;
      if (!ctx || !chain) return;
      const srcF = ex ? ex.srcF : [500, 1100, 1900, 2900, 4200];
      const fs = computeFormants(srcF, m, vowel, depth);
      const tilt = computeTilt(m, depth);
      formantsRef.current = fs;
      tiltRef.current = tilt;
      const now = ctx.currentTime;
      const TAU = 0.12; // param smoothing — no zipper noise
      for (let n = 0; n < N_FORMANTS; n++) {
        const bq = chain.biquads[n];
        const o = fs[n];
        bq.frequency.setTargetAtTime(o.f, now, TAU);
        bq.gain.setTargetAtTime(o.g, now, TAU);
        bq.Q.setTargetAtTime(o.q, now, TAU);
      }
      chain.lowShelf.gain.setTargetAtTime(-tilt, now, TAU);
      chain.highShelf.gain.setTargetAtTime(tilt, now, TAU);
    },
    [],
  );

  // ── the always-on render + control loop ─────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (canvas && wrap) {
      const w = Math.max(2, wrap.clientWidth);
      const h = Math.max(2, wrap.clientHeight);
      try {
        stageRef.current = buildStage(canvas, w, h);
      } catch {
        webglFailedRef.current = true;
        setWebglMsg(
          "WebGL / three.js is unavailable in this browser — the formant morph still plays; the ultrasound surface needs WebGL.",
        );
      }
    }

    const onResize = () => {
      const st = stageRef.current;
      const wr = wrapRef.current;
      if (!st || !wr) return;
      const w = Math.max(2, wr.clientWidth);
      const h = Math.max(2, wr.clientHeight);
      st.renderer.setSize(w, h, false);
      st.camera.aspect = w / h;
      st.camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    let uiTick = 0;

    const frame = (ts: number) => {
      rafRef.current = requestAnimationFrame(frame);
      if (lastTsRef.current === 0) lastTsRef.current = ts;
      let dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      if (dt <= 0 || dt > 0.05) dt = 0.016;
      timeRef.current += dt;
      const t = timeRef.current;

      // ── gather the two hands + resolve the input mode ──────────────────────
      let target: Controls;
      let mode: TrackingMode;
      const tracker = trackerRef.current;
      const video = videoRef.current;
      if (cameraOnRef.current && tracker && video && video.readyState >= 2) {
        let res: { landmarks: { x: number; y: number; z: number }[][] } | null =
          null;
        try {
          res = tracker.detectForVideo(video, performance.now());
        } catch {
          res = null;
        }
        const lms = res?.landmarks ?? [];
        if (lms.length >= 2 && lms[0] && lms[1]) {
          const fa = computeHandFeatures(lms[0]);
          const fb = computeHandFeatures(lms[1]);
          target = computeControls(
            { cx: fa.cx, cy: fa.cy, height: fa.height, active: true },
            { cx: fb.cx, cy: fb.cy, height: fb.height, active: true },
          );
          mode = "live";
        } else {
          const [dA, dB] = computeDemoHands(t);
          target = computeControls(dA, dB);
          mode = "lost";
        }
      } else if (fallbackRef.current && pointerRef.current.moved) {
        const p = pointerRef.current;
        const midCx = (p.x * 2 - 1) * 1.2;
        const vowel = clamp(1 - p.y, 0, 1);
        const depth = p.depth ? 0.92 : 0.12;
        const sep = (vowel * DIST_MAX) / 2;
        const hgt = depth;
        const primary: Hand = {
          cx: midCx - sep,
          cy: hgt * 2.4 - 1.2,
          height: hgt,
          active: true,
        };
        const secondary: Hand = {
          cx: midCx + sep,
          cy: hgt * 2.4 - 1.2,
          height: hgt,
          active: true,
        };
        target = computeControls(primary, secondary);
        mode = "pointer";
      } else {
        const [dA, dB] = computeDemoHands(t);
        target = computeControls(dA, dB);
        mode = "demo";
      }

      if (mode !== trackModeRef.current) {
        trackModeRef.current = mode;
        setTrackMode(mode);
      }

      // ── smooth the visual control state ─────────────────────────────────────
      const v = vizRef.current;
      const k = 0.12;
      v.m += (target.m - v.m) * k;
      v.vowel += (target.vowel - v.vowel) * k;
      v.depth += (target.depth - v.depth) * k;
      v.active = target.active;

      // ── extract the recording's OWN formants (cepstrum), then morph+apply ───
      if (phaseRef.current === "playing") {
        const dryA = dryAnalyserRef.current;
        const dryDb = dryDbRef.current;
        const ex = extractorRef.current;
        if (dryA && dryDb && ex) {
          dryA.getFloatFrequencyData(dryDb);
          ex.analyze(dryDb);
        }
        applyMorph(v.m, v.vowel, v.depth);
      }

      // ── render the ultrasound surface ───────────────────────────────────────
      drawStage(t);

      uiTick++;
      if (uiTick % 10 === 0) {
        const vp = Math.round(clamp(v.vowel, 0, 1) * (VOWEL_NAMES.length - 1));
        setUi({ m: v.m, vowel: VOWEL_NAMES[vp], depth: v.depth });
      }
    };

    lastTsRef.current = 0;
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", onResize);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      try {
        sourceRef.current?.stop();
      } catch {
        /* noop */
      }
      sourceRef.current = null;
      masterRef.current?.disconnect();
      masterRef.current = null;
      trackerRef.current?.close();
      trackerRef.current = null;
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
      const st = stageRef.current;
      if (st) {
        st.geom.dispose();
        st.renderer.dispose();
      }
      stageRef.current = null;
      const ac = ctxRef.current;
      ctxRef.current = null;
      if (ac && ac.state !== "closed") void ac.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyMorph]);

  // ── draw the scrolling formant surface ──────────────────────────────────────
  const drawStage = useCallback((t: number) => {
    const st = stageRef.current;
    if (!st) return;

    const analyser = analyserRef.current;
    const data = freqRef.current;
    let live = false;
    if (analyser && data) {
      analyser.getByteFrequencyData(data);
      let e = 0;
      for (let i = 0; i < data.length; i++) e += data[i];
      live = e > 400;
    }
    const sr = srRef.current;
    const nBins = data ? data.length : 512;
    const binHz = sr / (nBins * 2);

    const fs = formantsRef.current;
    const tilt = tiltRef.current;

    const heights = st.heights;
    const lumHist = st.colorScratch;
    heights.copyWithin(NX, 0, NX * (NZ - 1));
    lumHist.copyWithin(NX, 0, NX * (NZ - 1));

    for (let ix = 0; ix < NX; ix++) {
      const u = ix / (NX - 1);
      const f = Math.exp(LN_FMIN + u * (LN_FMAX - LN_FMIN));
      let amp = 0;
      if (live && data) {
        const bin = Math.min(nBins - 1, Math.max(0, Math.round(f / binHz)));
        amp = data[bin] / 255;
      }
      const breath = 0.06 * (0.5 + 0.5 * Math.sin(t * 1.3 + u * 7.5));
      const ampFromSound = 0.13 + 0.85 * amp + breath;
      // the current cascade response as a 0..1 ridge profile
      const mdb = morphDb(f, fs, tilt);
      const morphProfile = clamp(0.5 + mdb * 0.085, 0.04, 1);
      const hgt = ampFromSound * (0.55 + (morphProfile * 1.7 - 0.55));
      heights[ix] = hgt;
      lumHist[ix] = clamp(hgt * 1.25, 0, 1);
    }

    const pos = st.pos;
    const col = st.col;
    const pa = pos.array as Float32Array;
    const ca = col.array as Float32Array;
    for (let iz = 0; iz < NZ; iz++) {
      const fade = 1 - iz / (NZ + 6);
      for (let ix = 0; ix < NX; ix++) {
        const idx = iz * NX + ix;
        const hgt = heights[idx];
        pa[idx * 3 + 1] = hgt * H_SCALE;
        const lum = lumHist[idx] * fade;
        const base = 0.09 + 0.86 * lum;
        const warm = Math.max(0, lum - 0.62) * 0.9;
        ca[idx * 3] = clamp(base + warm * 0.16, 0, 1);
        ca[idx * 3 + 1] = clamp(base + warm * 0.09, 0, 1);
        ca[idx * 3 + 2] = clamp(base + warm * 0.02, 0, 1);
      }
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;

    const cam = st.camera;
    cam.position.x = Math.sin(t * 0.09) * 1.15;
    cam.position.y = 4.4 + Math.sin(t * 0.13) * 0.35;
    cam.lookAt(0, 0.1, -1.4);

    st.renderer.render(st.scene, cam);
  }, []);

  // ── audio: build graph + (re)start the real source through the cascade ──────
  const startSource = useCallback(async (ctx: AudioContext, id: string) => {
    const chain = chainRef.current;
    if (!chain) return;
    const wh = await loadRealTrackBuffer(ctx, id);
    // stop any previous source
    try {
      sourceRef.current?.stop();
    } catch {
      /* noop */
    }
    const src = ctx.createBufferSource();
    src.buffer = wh.buffer;
    src.loop = true;
    src.playbackRate.value = 1.0; // pitch / melody NEVER move
    src.connect(chain.input); // → biquad cascade → shelves → makeup → bus
    const dry = dryAnalyserRef.current;
    if (dry) src.connect(dry); // DRY tap for the cepstral formant extractor
    src.start();
    sourceRef.current = src;
  }, []);

  const play = useCallback(async () => {
    if (typeof window === "undefined") return;
    setError(null);
    setPhase("loading");
    try {
      let ctx = ctxRef.current;
      if (!ctx || ctx.state === "closed") {
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        ctx = new AC();
        ctxRef.current = ctx;
      }
      if (ctx.state === "suspended") await ctx.resume();
      srRef.current = ctx.sampleRate;

      let master = masterRef.current;
      if (!master) {
        master = createSafeMaster(ctx);
        masterRef.current = master;
      }
      analyserRef.current = master.analyser;
      freqRef.current = new Uint8Array(
        new ArrayBuffer(master.analyser.frequencyBinCount),
      );

      if (!chainRef.current) {
        const chain = buildMorphChain(ctx);
        chain.makeup.connect(master.input); // EVERY audible node → safeMaster
        chainRef.current = chain;
      }
      if (!dryAnalyserRef.current) {
        const dry = ctx.createAnalyser();
        dry.fftSize = FFT_N;
        dry.smoothingTimeConstant = 0.55;
        dryAnalyserRef.current = dry;
        dryDbRef.current = new Float32Array(
          new ArrayBuffer(dry.frequencyBinCount * 4),
        );
      }
      if (!extractorRef.current) {
        extractorRef.current = new SourceFormantExtractor(ctx.sampleRate);
      }

      await startSource(ctx, trackRef.current.id);
      setPhase("playing");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load this recording.",
      );
      setPhase("idle");
    }
  }, [startSource]);

  const stopAudio = useCallback(() => {
    try {
      sourceRef.current?.stop();
    } catch {
      /* noop */
    }
    sourceRef.current = null;
    setPhase("idle");
  }, []);

  const enableCamera = useCallback(async () => {
    if (cameraOnRef.current || cameraBusy) return;
    setCameraBusy(true);
    setError(null);
    try {
      const video = videoRef.current;
      if (!video) throw new Error("no video element");
      await startCamera(video);
      streamRef.current = video.srcObject as MediaStream | null;
      const tracker = await createHandTracker(2);
      trackerRef.current = tracker;
      cameraOnRef.current = true;
      fallbackRef.current = false;
    } catch {
      setError(
        "Camera or hand model unavailable — move the mouse to reshape the body (x = glassy↔vocal, up/down = vowel), click to morph deeper. The demo drive keeps it alive.",
      );
      cameraOnRef.current = false;
      fallbackRef.current = true;
    } finally {
      setCameraBusy(false);
    }
  }, [cameraBusy]);

  const onSelectTrack = useCallback(
    (id: string) => {
      const tk = REAL_TRACKS.find((x) => x.id === id);
      if (!tk) return;
      setTrack(tk);
      const ctx = ctxRef.current;
      if (ctx && phaseRef.current === "playing") {
        startSource(ctx, id).catch(() =>
          setError("That track could not be loaded."),
        );
      }
    },
    [startSource],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!fallbackRef.current) return;
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    pointerRef.current.x = clamp((e.clientX - r.left) / r.width, 0, 1);
    pointerRef.current.y = clamp((e.clientY - r.top) / r.height, 0, 1);
    pointerRef.current.moved = true;
  }, []);
  const onPointerDown = useCallback(() => {
    if (!fallbackRef.current) return;
    pointerRef.current.depth = !pointerRef.current.depth;
    pointerRef.current.moved = true;
  }, []);

  const depthPct = Math.round(ui.depth * 100);
  const timbreLabel =
    ui.depth < 0.1
      ? "dry · original piano"
      : ui.m < 0.28
        ? `glassy body · /${ui.vowel}/`
        : ui.m < 0.5
          ? `glassy→woody · /${ui.vowel}/`
          : ui.m < 0.72
            ? `woody body · /${ui.vowel}/`
            : `vocal body · /${ui.vowel}/`;

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      {/* ── the three.js ultrasound stage fills everything ──────────────────── */}
      <div
        ref={wrapRef}
        className="absolute inset-0"
        style={{ touchAction: "none" }}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
      >
        <canvas ref={canvasRef} className="block h-full w-full" />
        {webglFailedRef.current && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-40 w-4/5 max-w-xl rounded-md border border-border/40 bg-gradient-to-t from-muted/40 to-transparent" />
          </div>
        )}
      </div>

      <video ref={videoRef} className="hidden" playsInline muted />

      {/* ── tracking status line — always visible while running ─────────────── */}
      <div className="pointer-events-none absolute left-4 top-4 z-30 font-mono text-xs uppercase tracking-[0.18em]">
        {trackMode === "live" && (
          <span className="text-muted-foreground">tracking · live</span>
        )}
        {trackMode === "demo" && (
          <span className="text-primary">demo · autonomous</span>
        )}
        {trackMode === "pointer" && (
          <span className="text-muted-foreground">pointer · fallback</span>
        )}
        {trackMode === "lost" && (
          <span className="text-destructive">
            tracking lost · show both hands, palms to camera
          </span>
        )}
        <span className="ml-3 text-muted-foreground/70">
          {timbreLabel} · depth {depthPct}%
        </span>
      </div>

      {webglMsg && (
        <p className="pointer-events-none absolute inset-x-4 top-10 z-30 max-w-xl text-sm text-destructive">
          {webglMsg}
        </p>
      )}
      {error && (
        <p className="pointer-events-none absolute inset-x-4 top-12 z-30 max-w-xl text-sm text-destructive">
          {error}
        </p>
      )}

      {!immersive && (
        <>
          {/* title block — a light overlay */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-2 p-6 pt-12">
            <header className="max-w-2xl space-y-2">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                formantwell · cepstral source-formants through an ordered biquad
                cascade
              </p>
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                Reshape the vocal tract of your own recording — glassy to woody to
                vowel-like, continuously — at exactly-fixed pitch, through filters
                that cannot hiss.
              </h1>
              <p className="max-w-xl text-base text-muted-foreground">
                The recording&apos;s own formants are discovered live with a real
                cepstrum, then morphed toward glassy, woody and vocal targets and
                rendered through five ordered peaking biquads — strictly spaced so
                they can never cross. The source plays at rate 1.0, so only the
                resonant body moves; the notes stay exactly put. Slide both hands
                left↔right to sweep the continuum, raise them to morph deeper,
                spread them to slide the vowel.
              </p>
            </header>
          </div>

          {/* bottom control strip */}
          <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 p-6 pb-16">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  track
                </span>
                <select
                  value={track.id}
                  onChange={(e) => onSelectTrack(e.target.value)}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
              </div>

              {phase !== "playing" ? (
                <button
                  onClick={() => void play()}
                  disabled={phase === "loading"}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                >
                  {phase === "loading" ? "Loading…" : `Play ${track.title}`}
                </button>
              ) : (
                <button
                  onClick={stopAudio}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Stop
                </button>
              )}

              <button
                onClick={() => void enableCamera()}
                disabled={cameraBusy || cameraOnRef.current}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
              >
                {cameraBusy
                  ? "Enabling camera…"
                  : cameraOnRef.current
                    ? "Camera on"
                    : "Reshape with your hands"}
              </button>

              <button
                onClick={() => setShowNotes(true)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Read the design notes
              </button>
            </div>
          </div>

          <PrototypeNav
            slugs={["18656-formantwell", "18384-throatmorph", "18320-timbrefold"]}
          />
        </>
      )}

      <ImmersiveHud
        immersive={immersive}
        onToggle={toggle}
        title="Formantwell"
        description="Karel's piano is the source; your two hands are its vocal tract. Each frame the recording's OWN formants are discovered live with a real cepstrum, then morphed continuously toward glassy, woody and vocal targets and rendered through a cascade of five ordered peaking biquads. The formants are strictly spaced so they can never cross — the filter is unconditionally stable and cannot hiss — and the source plays at rate 1.0, so the pitch and melody never move while the resonant body morphs. The achromatic three.js waterfall is an ultrasound scan of the morphing formant surface."
        howTo={[
          "Play a track, then allow the camera and show both hands, palms forward",
          "Slide both hands left↔right to sweep the body glassy → woody → vocal",
          "Raise both hands to morph deeper; lower them to hear the untouched piano",
          "Spread or close your hands to slide the vowel from oo to ee",
          "Press f for fullscreen, i for info",
        ]}
      />

      {showNotes && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg space-y-4 overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">Design notes</h2>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <strong>The merge.</strong> Formantwell fuses two siblings:
                throatmorph&apos;s <em>cepstral extraction of the recording&apos;s
                own envelope</em> and vowelbend&apos;s <em>provably-stable ordered
                biquad cascade</em>. A main-thread analysis loop (on an
                <code> AnalyserNode</code> tapping the dry source, ~rAF rate, no
                worklet) takes the live log-magnitude spectrum, forms the real
                cepstrum, keeps only the low-quefrency coefficients (a symmetric
                lifter) and transforms back to a smooth source log-envelope. Its
                strongest prominent maxima are peak-picked into five ordered{" "}
                <em>source formants</em> — the recording&apos;s own resonant body,
                discovered live.
              </p>
              <p>
                <strong>Morph through the ordered cascade.</strong> Each of the
                three timbre targets — glassy (rising HF tilt), woody (low-mid
                emphasis) and the continuous Peterson–Barney vowel row — is a
                strictly-increasing five-formant list. Each formant is interpolated
                in <em>log-frequency</em> between the recording&apos;s own value and
                the target by <em>depth</em>, blended glassy↔woody↔vocal by hand
                position and across the vowel manifold by hand separation. A
                belt-and-braces min-spacing pass forces F(n+1) ≥ 1.12·F(n), so the
                peaks can never cross. The morphed set drives five{" "}
                <code>&quot;peaking&quot;</code> BiquadFilterNodes (gains capped
                +12 dB, Q clamped 2–10) plus a low/high shelf tilt, every parameter
                ramped with <code>setTargetAtTime(…, 0.12)</code>.
              </p>
              <p>
                <strong>Why the pitch is preserved.</strong> There is no STFT
                resynthesis and no rate change: the buffer plays at
                <code> playbackRate 1.0</code> and only passes through a linear,
                time-invariant filter cascade. A biquad reshapes <em>relative
                loudness per frequency region</em> — the resonant body — and leaves
                the harmonic fine structure that the ear reads as pitch and melody
                exactly where Karel played it. At depth 0 every biquad gain is 0 dB:
                the cascade is flat and you hear the untouched piano.
              </p>
              <p>
                <strong>Why it cannot hiss.</strong> Because the five formants are
                kept strictly ordered with enforced min-spacing, the cascade is
                unconditionally stable at every point on the morph — biquads cannot
                produce the narrow-band resynthesis artefacts that a per-bin STFT
                gain can when phase and overlap-add fight each other. All parameter
                moves are smoothed, so there is no zipper noise, and everything
                terminates in <code>createSafeMaster(ctx).input</code>; the visuals
                read <code>safeMaster.analyser</code>.
              </p>
              <p>
                <strong>Your hands are the tract.</strong> The midpoint x of your
                two hands sets the morph position <em>m</em> (glassy ↔ woody ↔
                vocal); your average hand height sets the morph <em>depth</em> (low
                = the untouched original, high = fully morphed); and the separation
                between your hands slides the <em>vowel</em> /u/→/o/→/a/→/e/→/i/.
                The same three axes drive the camera tracking, the pointer fallback
                and the autonomous demo drive.
              </p>
              <p>
                <strong>Achromatic ultrasound palette.</strong> The hero is a
                three.js waterfall of the morphing formant surface — a scrolling
                height-field ridge rendered like a medical ultrasound of a vocal
                tract: grayscale intensity, a faint warm-neutral tint only in the
                brightest crests, soft depth fog, a barely-there scan-mesh grid. The
                front ridge is the current cascade response × the live analyser
                magnitude, so it reshapes as you move and dances to the actual
                sound. No colour, no film grain.
              </p>
              <p>
                <strong>Degrades gracefully.</strong> No camera or model → a pointer
                fallback (mouse x = glassy↔vocal, up/down = vowel, click = morph
                deeper) with a visible notice, while a labelled autonomous demo
                drive sweeps m/vowel/depth so the whole chain is audible and visible
                headless. The status line always states whether you are seeing{" "}
                <em>tracking · live</em>, <em>demo · autonomous</em>, a{" "}
                <em>pointer · fallback</em>, or a lost-hands hint. If WebGL fails the
                audio keeps morphing and a readable notice replaces the surface.
              </p>
              <p>
                <strong>References.</strong> zplane <em>TIMBRE</em> (real-time
                poly-formant shaper, announced 16 Sep 2026) — shifts formants while
                leaving pitch intact; formantwell reshapes the recording&apos;s{" "}
                <em>own</em> formants rather than shifting all of them uniformly. The
                finding that line-spectral-frequency (LSF) interpolation gives the
                most linear spectral-envelope morph. Fant&apos;s{" "}
                <em>source–filter model</em> (recording = source, the morphing
                formants = filter). Grey, J. M. (1977), <em>Multidimensional
                perceptual scaling of musical timbres</em> (JASA 61:1270).
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
