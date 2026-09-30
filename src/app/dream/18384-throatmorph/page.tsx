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
// 18384-throatmorph · "What if you could reshape the resonant BODY / vocal tract
// of your own piano recording with your two hands — morphing its timbre
// CONTINUOUSLY from glassy → woody → vowel-like, while pitch and melody stay
// EXACTLY the same — by extracting the recording's OWN spectral envelope and
// morphing THAT?"
//
// Cycle-2 deepening of 18320-timbrefold. timbrefold morphed between 5 discrete
// vowel presets with 4 static peaking biquads. Throatmorph goes lab-first: a
// CONTINUOUS cepstral-STFT spectral-envelope morph inside an AudioWorklet. Each
// 2048-pt frame we lift the recording's OWN log-spectral envelope via the real
// cepstrum, morph that envelope continuously toward glassy / woody / vocal
// targets, and apply the morph as a per-bin spectral GAIN — keeping the original
// phase and the fine harmonic structure untouched, so pitch and melody never
// move. Resynthesis by 75% Hann overlap-add.
//
//   Two-hand conducting (identical across camera / pointer / demo drive):
//     · midpoint x of the two hands → morph position m  (glassy↔woody↔vocal)
//     · average hand height         → morph depth        (0 = untouched original)
//     · hand separation             → vowel position     (/u/→/o/→/a/→/e/→/i/)
//
//   Render (three.js): a scrolling "formant surface" / vocal-tract waterfall,
//   an achromatic ultrasound scan — grayscale ridges with only a faint warm
//   tint in the brightest crests, soft depth fog. The current spectral envelope
//   reshapes the front ridge continuously as m / vowel / depth move, and the
//   crests dance to the master analyser.
//
//   Refs: Fant's source-filter model; NEUON — Cepstral Morph (Dystopian Waves,
//   2026-09-25) on cepstral spectral morphing / formant-vs-texture separation;
//   cepstral-coefficient interpolation as the most linear envelope morph; Grey
//   (1977) multidimensional timbre space.
// ─────────────────────────────────────────────────────────────────────────────

// ── envelope / target-shape constants (shared worklet ⇄ visuals) ─────────────

const FMIN_ENV = 90;
const FMAX_ENV = 8500;
const LN_FMIN = Math.log(FMIN_ENV);
const LN_FMAX = Math.log(FMAX_ENV);
const DB_TO_NAT = Math.LN10 / 20; // 1 dB in natural-log gain units

// Peterson–Barney vowel formant table (F1..F4 in Hz), ordered so a rising vowel
// position sweeps /u/ → /o/ → /a/ → /e/ → /i/.
const VOWELS: [number, number, number, number][] = [
  [300, 870, 2240, 3400], // u
  [570, 840, 2410, 3400], // o
  [730, 1090, 2440, 3400], // a
  [530, 1840, 2480, 3400], // e
  [270, 2290, 3010, 3400], // i
];
const VOWEL_NAMES = ["u", "o", "a", "e", "i"];

const DIST_MAX = 1.55; // hand separation that maps to full vowel travel

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

// The three target envelope SHAPES, in dB as a function of frequency. These are
// mirrored verbatim inside the worklet (as a JS string) so the audio and the
// visual ridge describe the exact same morph.
function glassyDb(f: number): number {
  const lf = Math.log(f);
  const u = (lf - LN_FMIN) / (LN_FMAX - LN_FMIN);
  const hfTilt = 11 * (u - 0.5); // rising high-frequency tilt
  const bumpA = 4.5 * gauss(lf, Math.log(3200), 0.13); // narrow upper formant
  const bumpB = 3.5 * gauss(lf, Math.log(4700), 0.13);
  return hfTilt + bumpA + bumpB;
}
function woodyDb(f: number): number {
  const lf = Math.log(f);
  const u = (lf - LN_FMIN) / (LN_FMAX - LN_FMIN);
  const low = 8 * gauss(lf, Math.log(480), 0.55); // low-mid emphasis
  const mid = 3 * gauss(lf, Math.log(1050), 0.4);
  const roll = -16 * Math.max(0, u - 0.34); // high-frequency rolloff
  return low + mid + roll;
}
function vocalDb(f: number, vowel: number): number {
  const lf = Math.log(f);
  const F = vowelFormants(vowel);
  const boost = [12, 10.5, 7, 5];
  const sig = [0.12, 0.12, 0.14, 0.15];
  let r = 0;
  for (let n = 0; n < 4; n++) r += boost[n] * gauss(lf, Math.log(F[n]), sig[n]);
  return r - 3; // gentle overall pull (zero-mean removes the offset anyway)
}

/** Continuous morph across the three target shapes. m<0.5 blends glassy→woody,
 *  m≥0.5 blends woody→vocal. Returned in dB (not yet zero-meaned). */
function targetDb(f: number, m: number, vowel: number): number {
  if (m < 0.5) {
    const t = m / 0.5;
    return glassyDb(f) * (1 - t) + woodyDb(f) * t;
  }
  const t = (m - 0.5) / 0.5;
  return woodyDb(f) * (1 - t) + vocalDb(f, vowel) * t;
}

// ── the cepstral spectral-envelope-morph AudioWorklet (Blob-URL registered) ──
// A streaming STFT: 2048-pt frames, 512 hop, 75% Hann analysis+synthesis
// overlap-add (COLA norm = 1/1.5). Per frame: forward FFT → magnitude → real
// cepstrum → low-quefrency lifter → smoothed source log-envelope Es. A target
// envelope Et (glassy/woody/vocal blend) is built over the same bins. The
// per-bin gain g = exp(depth·(Et − Es)) reshapes ONLY the envelope; the original
// complex phase is preserved (re,im are just scaled by the real gain), so the
// fine harmonic structure — the pitch and melody — is untouched. Anti-hiss:
// liftered (already smooth) gain, a further moving-average across bins, a bounded
// spectral floor/ceiling, and per-block one-pole smoothing of all controls.
const WORKLET_SOURCE = `
const LN_FMIN = ${LN_FMIN};
const LN_FMAX = ${LN_FMAX};
const DB_TO_NAT = ${DB_TO_NAT};
const VOWELS = ${JSON.stringify(VOWELS)};
function gauss(x, mu, sig){ const d=(x-mu)/sig; return Math.exp(-0.5*d*d); }
function vowelFormants(p){
  const s = Math.max(0,Math.min(1,p)) * (VOWELS.length-1);
  const i0 = Math.min(VOWELS.length-2, Math.floor(s));
  const fr = s - i0; const a = VOWELS[i0], b = VOWELS[i0+1];
  return [a[0]+(b[0]-a[0])*fr, a[1]+(b[1]-a[1])*fr, a[2]+(b[2]-a[2])*fr, a[3]+(b[3]-a[3])*fr];
}
function glassyDb(f){ const lf=Math.log(f); const u=(lf-LN_FMIN)/(LN_FMAX-LN_FMIN);
  return 11*(u-0.5) + 4.5*gauss(lf,Math.log(3200),0.13) + 3.5*gauss(lf,Math.log(4700),0.13); }
function woodyDb(f){ const lf=Math.log(f); const u=(lf-LN_FMIN)/(LN_FMAX-LN_FMIN);
  return 8*gauss(lf,Math.log(480),0.55) + 3*gauss(lf,Math.log(1050),0.4) - 16*Math.max(0,u-0.34); }
function vocalDb(f,vowel){ const lf=Math.log(f); const F=vowelFormants(vowel);
  const boost=[12,10.5,7,5], sig=[0.12,0.12,0.14,0.15]; let r=0;
  for(let n=0;n<4;n++) r += boost[n]*gauss(lf,Math.log(F[n]),sig[n]); return r-3; }
function targetDb(f,m,vowel){
  if(m<0.5){ const t=m/0.5; return glassyDb(f)*(1-t)+woodyDb(f)*t; }
  const t=(m-0.5)/0.5; return woodyDb(f)*(1-t)+vocalDb(f,vowel)*t;
}

class ThroatMorph extends AudioWorkletProcessor {
  constructor(){
    super();
    this.N = 2048; this.Hs = 512; this.half = this.N >> 1;
    this.eps = 1e-6;
    this.Lc = 48;                 // cepstral lifter cutoff (low-quefrency kept)
    this.GMIN = -18 * DB_TO_NAT;  // spectral floor
    this.GMAX =  12 * DB_TO_NAT;  // spectral ceiling
    this.loaded = false;

    // Hann window (used for BOTH analysis and synthesis → COLA at 75% overlap)
    this.win = new Float32Array(this.N);
    for(let i=0;i<this.N;i++) this.win[i]=0.5-0.5*Math.cos((2*Math.PI*i)/this.N);
    this.norm = 1/1.5;

    // twiddles + bit-reversal for the radix-2 FFT
    this.cosT = new Float32Array(this.half); this.sinT = new Float32Array(this.half);
    for(let k=0;k<this.half;k++){ this.cosT[k]=Math.cos((2*Math.PI*k)/this.N); this.sinT[k]=Math.sin((2*Math.PI*k)/this.N); }
    this.rev = new Int32Array(this.N);
    const bits = Math.round(Math.log(this.N)/Math.LN2);
    for(let i=0;i<this.N;i++){ let x=i,r=0; for(let b=0;b<bits;b++){ r=(r<<1)|(x&1); x>>=1; } this.rev[i]=r; }

    this.re = new Float32Array(this.N);   this.im = new Float32Array(this.N);   // signal spectrum
    this.cre = new Float32Array(this.N);  this.cim = new Float32Array(this.N);  // cepstrum scratch
    this.logEs = new Float32Array(this.half+1);
    this.gain = new Float32Array(this.half+1);
    this.gsm = new Float32Array(this.half+1);
    this.tgt = new Float32Array(this.half+1); // target envelope, zero-mean nats
    this.binF = new Float32Array(this.half+1);

    this.accL = new Float32Array(this.N); this.accR = new Float32Array(this.N);
    this.ta = 0;
    this.CAP = this.N * 8;
    this.fifoL = new Float32Array(this.CAP); this.fifoR = new Float32Array(this.CAP);
    this.wr=0; this.rd=0; this.avail=0;
    this.left=null; this.right=null; this.len=0;

    // controls (targets + smoothed) — the two-hand conducting state
    this.mT=0.0; this.vowelT=0.4; this.depthT=0.0;
    this.m=0.0;  this.vowel=0.4;  this.depth=0.0;

    this.port.onmessage = (e) => {
      const d = e.data;
      if(!d) return;
      if(d.type==='load'){
        this.left=d.left; this.right=d.right; this.len=d.left.length;
        this.ta=0; this.accL.fill(0); this.accR.fill(0);
        this.wr=0; this.rd=0; this.avail=0;
        for(let k=0;k<=this.half;k++) this.binF[k] = Math.max(1, k*d.sampleRate/this.N);
        this.loaded = this.len > this.N;
      } else if(d.type==='ctrl'){
        if(typeof d.m==='number') this.mT=d.m;
        if(typeof d.vowel==='number') this.vowelT=d.vowel;
        if(typeof d.depth==='number') this.depthT=d.depth;
      }
    };
  }

  fft(re, im, inv){
    const n=this.N, rev=this.rev, cosT=this.cosT, sinT=this.sinT;
    for(let i=0;i<n;i++){ const j=rev[i]; if(j>i){ const tr=re[i]; re[i]=re[j]; re[j]=tr; const ti=im[i]; im[i]=im[j]; im[j]=ti; } }
    for(let len=2;len<=n;len<<=1){
      const half=len>>1, step=(n/len)|0;
      for(let i=0;i<n;i+=len){ let k=0;
        for(let j=i;j<i+half;j++){
          const wr=cosT[k], wi=inv?sinT[k]:-sinT[k];
          const ar=re[j+half], ai=im[j+half];
          const vr=ar*wr-ai*wi, vi=ar*wi+ai*wr;
          const ur=re[j], ui=im[j];
          re[j]=ur+vr; im[j]=ui+vi; re[j+half]=ur-vr; im[j+half]=ui-vi; k+=step;
        }
      }
    }
    if(inv){ const invn=1/n; for(let i=0;i<n;i++){ re[i]*=invn; im[i]*=invn; } }
  }

  buildTarget(){
    const half=this.half, binF=this.binF, tgt=this.tgt;
    let mean=0;
    for(let k=1;k<=half;k++){
      const db = targetDb(binF[k], this.m, this.vowel);
      tgt[k] = db; mean += db;
    }
    mean /= half;
    tgt[0] = tgt[1];
    for(let k=0;k<=half;k++) tgt[k] = (tgt[k]-mean) * DB_TO_NAT; // zero-mean nats
  }

  processChannel(input, acc){
    const N=this.N, half=this.half, re=this.re, im=this.im, win=this.win, len=this.len;
    const cre=this.cre, cim=this.cim, eps=this.eps;
    const ta=this.ta;
    // windowed analysis frame from the looping recording
    for(let i=0;i<N;i++){ let p=(ta+i)%len; if(p<0)p+=len; re[i]=input[p]*win[i]; im[i]=0; }
    this.fft(re,im,false); // forward → signal spectrum (re,im kept for resynth)

    // real cepstrum of the log-magnitude
    for(let k=0;k<=half;k++){ const mg=Math.sqrt(re[k]*re[k]+im[k]*im[k]); cre[k]=Math.log(mg+eps); cim[k]=0; }
    for(let k=1;k<half;k++){ cre[N-k]=cre[k]; cim[N-k]=0; }
    this.fft(cre,cim,true);  // inverse → cepstrum (real part in cre)
    // low-quefrency lifter → smooth source envelope
    const Lc=this.Lc;
    for(let q=Lc+1;q<N-Lc;q++){ cre[q]=0; cim[q]=0; }
    this.fft(cre,cim,false); // forward → smoothed log-magnitude (source envelope)

    let meanS=0; for(let k=1;k<=half;k++) meanS+=cre[k]; meanS/=half;

    const depth=this.depth, tgt=this.tgt, gain=this.gain, GMIN=this.GMIN, GMAX=this.GMAX;
    for(let k=0;k<=half;k++){
      const sHat = cre[k]-meanS;            // source envelope shape (zero-mean nats)
      let g = depth * (tgt[k] - sHat);      // flatten source resonances, impose target
      if(g<GMIN)g=GMIN; else if(g>GMAX)g=GMAX;
      gain[k]=g;
    }
    // extra anti-hiss: moving-average smoothing of the gain across bins
    const gsm=this.gsm, R=3;
    for(let k=0;k<=half;k++){
      let s=0,c=0; for(let j=k-R;j<=k+R;j++){ if(j<0||j>half)continue; s+=gain[j]; c++; }
      gsm[k]=s/c;
    }
    // apply as a real per-bin gain — phase preserved (pitch/melody untouched)
    for(let k=0;k<=half;k++){ const g=Math.exp(gsm[k]); re[k]*=g; im[k]*=g; }
    for(let k=1;k<half;k++){ re[N-k]=re[k]; im[N-k]=-im[k]; }
    im[0]=0; im[half]=0;
    this.fft(re,im,true); // inverse → time
    const norm=this.norm;
    for(let i=0;i<N;i++) acc[i]+= re[i]*win[i]*norm;
  }

  generateHop(){
    // per-block one-pole control smoothing (no zipper noise)
    const s=0.12;
    this.m     += (this.mT-this.m)*s;
    this.vowel += (this.vowelT-this.vowel)*s;
    this.depth += (this.depthT-this.depth)*s;
    this.buildTarget();

    const N=this.N, Hs=this.Hs, CAP=this.CAP;
    this.processChannel(this.left, this.accL);
    this.processChannel(this.right, this.accR);
    for(let i=0;i<Hs;i++){ this.fifoL[this.wr]=this.accL[i]; this.fifoR[this.wr]=this.accR[i]; this.wr=(this.wr+1)%CAP; }
    this.avail += Hs;
    this.accL.copyWithin(0,Hs,N); this.accL.fill(0,N-Hs,N);
    this.accR.copyWithin(0,Hs,N); this.accR.fill(0,N-Hs,N);
    let ta=this.ta+Hs; ta%=this.len; if(ta<0)ta+=this.len; this.ta=ta;
  }

  process(inputs, outputs){
    const out=outputs[0]; const L=out[0]; const R=out[1]||out[0];
    const frames=L.length;
    if(!this.loaded){ for(let i=0;i<frames;i++){ L[i]=0; if(R!==L)R[i]=0; } return true; }
    let guard=0;
    while(this.avail<frames && guard<128){ this.generateHop(); guard++; }
    const CAP=this.CAP;
    for(let i=0;i<frames;i++){ L[i]=this.fifoL[this.rd]; if(R!==L)R[i]=this.fifoR[this.rd]; this.rd=(this.rd+1)%CAP; this.avail--; }
    return true;
  }
}
registerProcessor('throatmorph', ThroatMorph);
`;

// ── unified two-hand control surface ─────────────────────────────────────────

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

/** Autonomous demo hands — a slow Lissajous that sweeps m / depth / vowel so the
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

// ── the three.js ultrasound "formant surface" waterfall ──────────────────────

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
  heights: Float32Array; // NZ*NX rolling history
  colorScratch: Float32Array; // NZ*NX rolling luminance history
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

  // grid of NX*NZ vertices; y displaced per frame, vertex-coloured grayscale.
  const count = NX * NZ;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let iz = 0; iz < NZ; iz++) {
    for (let ix = 0; ix < NX; ix++) {
      const idx = iz * NX + ix;
      positions[idx * 3] = (ix / (NX - 1) - 0.5) * SPAN_X;
      positions[idx * 3 + 1] = 0;
      // iz 0 = newest row, nearest the camera (front); older rows flow back
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

  // faint scan-mesh overlay (the sonogram grid)
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
  const nodeRef = useRef<AudioWorkletNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const freqRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const srRef = useRef(48000);

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

  // smoothed visual controls (mirror of the worklet's own smoothing)
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

  // ── the always-on render + control loop ─────────────────────────────────────
  useEffect(() => {
    // build the three stage (graceful WebGL degrade)
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
          "WebGL / three.js is unavailable in this browser — the envelope morph still plays; the ultrasound surface needs WebGL.",
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
        // pointer: x → m (glassy↔vocal), y → vowel, click toggles depth
        const midCx = (p.x * 2 - 1) * 1.2;
        const vowel = clamp(1 - p.y, 0, 1);
        const depth = p.depth ? 0.92 : 0.12;
        const sep = (vowel * DIST_MAX) / 2;
        const hgt = depth;
        const primary: Hand = { cx: midCx - sep, cy: hgt * 2.4 - 1.2, height: hgt, active: true };
        const secondary: Hand = { cx: midCx + sep, cy: hgt * 2.4 - 1.2, height: hgt, active: true };
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

      // ── drive the worklet (pitch untouched, only the envelope morphs) ───────
      const node = nodeRef.current;
      if (phaseRef.current === "playing" && node) {
        node.port.postMessage({
          type: "ctrl",
          m: target.m,
          vowel: target.vowel,
          depth: target.depth,
        });
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
        nodeRef.current?.disconnect();
      } catch {
        /* noop */
      }
      nodeRef.current = null;
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
  }, []);

  // ── draw the scrolling formant surface ──────────────────────────────────────
  const drawStage = useCallback((t: number) => {
    const st = stageRef.current;
    if (!st) return;
    const v = vizRef.current;

    // analyser magnitude (drives the crests to the real sound)
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

    const heights = st.heights;
    const lumHist = st.colorScratch;
    // scroll history one row back (toward the fog), newest into row 0
    heights.copyWithin(NX, 0, NX * (NZ - 1));
    lumHist.copyWithin(NX, 0, NX * (NZ - 1));

    // build the newest row = current morphing envelope × the live sound
    for (let ix = 0; ix < NX; ix++) {
      const u = ix / (NX - 1);
      const f = Math.exp(LN_FMIN + u * (LN_FMAX - LN_FMIN));
      let amp = 0;
      if (live && data) {
        const bin = Math.min(nBins - 1, Math.max(0, Math.round(f / binHz)));
        amp = data[bin] / 255;
      }
      // keep the ridge breathing even when silent / pre-start
      const breath = 0.06 * (0.5 + 0.5 * Math.sin(t * 1.3 + u * 7.5));
      const ampFromSound = 0.13 + 0.85 * amp + breath;
      // the target timbre shape, as a 0..1 ridge profile
      const tdb = targetDb(f, v.m, v.vowel);
      const morphProfile = clamp(0.5 + tdb * 0.085, 0.04, 1);
      const hgt = ampFromSound * (0.55 + (morphProfile * 1.7 - 0.55) * v.depth);
      heights[ix] = hgt;
      lumHist[ix] = clamp(hgt * 1.25, 0, 1);
    }

    // push heights + grayscale (faint warm crest) into the geometry
    const pos = st.pos;
    const col = st.col;
    const pa = pos.array as Float32Array;
    const ca = col.array as Float32Array;
    for (let iz = 0; iz < NZ; iz++) {
      const fade = 1 - iz / (NZ + 6); // gentle far-row dimming (fog does the rest)
      for (let ix = 0; ix < NX; ix++) {
        const idx = iz * NX + ix;
        const hgt = heights[idx];
        pa[idx * 3 + 1] = hgt * H_SCALE;
        const lum = lumHist[idx] * fade;
        // achromatic base with a faint warm-neutral tint only in the crests
        const base = 0.09 + 0.86 * lum;
        const warm = Math.max(0, lum - 0.62) * 0.9;
        ca[idx * 3] = clamp(base + warm * 0.16, 0, 1);
        ca[idx * 3 + 1] = clamp(base + warm * 0.09, 0, 1);
        ca[idx * 3 + 2] = clamp(base + warm * 0.02, 0, 1);
      }
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;

    // slow breathing camera — never blank, always alive
    const cam = st.camera;
    cam.position.x = Math.sin(t * 0.09) * 1.15;
    cam.position.y = 4.4 + Math.sin(t * 0.13) * 0.35;
    cam.lookAt(0, 0.1, -1.4);

    st.renderer.render(st.scene, cam);
  }, []);

  // ── audio: worklet → safeMaster ─────────────────────────────────────────────
  const loadIntoWorklet = useCallback(async (ctx: AudioContext, id: string) => {
    const node = nodeRef.current;
    if (!node) return;
    const wh = await loadRealTrackBuffer(ctx, id);
    const chL = wh.buffer.getChannelData(0);
    const L = new Float32Array(chL);
    const chR = wh.buffer.numberOfChannels > 1 ? wh.buffer.getChannelData(1) : chL;
    const R = new Float32Array(chR);
    node.port.postMessage(
      { type: "load", left: L, right: R, sampleRate: ctx.sampleRate },
      [L.buffer, R.buffer],
    );
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

      if (!nodeRef.current) {
        if (typeof ctx.audioWorklet === "undefined")
          throw new Error("AudioWorklet unavailable in this browser.");
        const url = URL.createObjectURL(
          new Blob([WORKLET_SOURCE], { type: "application/javascript" }),
        );
        await ctx.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);
        const node = new AudioWorkletNode(ctx, "throatmorph", {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [2],
        });
        nodeRef.current = node;
        node.connect(master.input);
      }

      await loadIntoWorklet(ctx, trackRef.current.id);
      setPhase("playing");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load this recording.",
      );
      setPhase("idle");
    }
  }, [loadIntoWorklet]);

  const stopAudio = useCallback(() => {
    const ctx = ctxRef.current;
    if (ctx) void ctx.suspend();
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
        "Camera or hand model unavailable — move the mouse to sculpt the throat (x = glassy↔vocal, up/down = vowel), click to morph deeper. The demo drive keeps it alive.",
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
        loadIntoWorklet(ctx, id).catch(() =>
          setError("That track could not be loaded."),
        );
      }
    },
    [loadIntoWorklet],
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
                throatmorph · continuous cepstral spectral-envelope morph
              </p>
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                Reshape the resonant body of your own recording — glassy to woody
                to vowel-like, continuously — while pitch and melody stay exactly
                the same.
              </h1>
              <p className="max-w-xl text-base text-muted-foreground">
                The recording&apos;s own spectral envelope is lifted with the real
                cepstrum and morphed toward glassy, woody and vocal targets, then
                applied as a per-bin gain. Only the envelope moves — the harmonic
                fine structure that carries the notes is left untouched. Slide both
                hands left↔right to sweep the whole continuum, raise them to morph
                deeper, spread them to slide the vowel.
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
                    : "Sculpt with your hands"}
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
            slugs={["18384-throatmorph", "18320-timbrefold", "18296-slowbloom"]}
          />
        </>
      )}

      <ImmersiveHud
        immersive={immersive}
        onToggle={toggle}
        title="Throatmorph"
        description="Karel's piano is the source; your two hands are its vocal tract. Each frame the recording's own log-spectral envelope is lifted with the real cepstrum and morphed continuously toward glassy, woody and vocal targets, then applied as a per-bin spectral gain. Because only the envelope is reshaped and the original phase is kept, the pitch and melody never move — the timbre morphs while every note stays exactly put. The achromatic three.js waterfall is an ultrasound scan of the morphing formant surface."
        howTo={[
          "Play a track, then allow the camera and show both hands, palms forward",
          "Slide both hands left↔right to sweep the timbre glassy → woody → vocal",
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
                <strong>Cepstral spectral-envelope morph.</strong> Each 2048-point
                STFT frame is forward-transformed; from its magnitude we take
                <em> log(mag)</em> and the real cepstrum, then keep only the
                low-quefrency coefficients (a symmetric lifter, ~48 of 1024) and
                transform back. That recovers the recording&apos;s <em>own</em>
                smooth spectral envelope <em>Es</em> — the resonant body under the
                notes. A target envelope <em>Et</em> is built continuously as a
                blend of three shapes: glassy (rising high tilt + narrow upper
                bumps), woody (low-mid emphasis, high rolloff) and a four-formant
                vocal tract whose F1–F4 slide across a Peterson–Barney vowel
                manifold. The per-bin gain is <em>exp(depth · (Et − Es))</em>,
                flattening the source&apos;s own resonances and imposing the
                target&apos;s.
              </p>
              <p>
                <strong>Why the pitch is preserved.</strong> The gain is a
                <em> real</em> multiplier per bin, so the complex phase is kept and
                the harmonic fine structure — the exact partials the ear reads as
                pitch and melody — is never touched. We reshape only the relative
                loudness per region (the envelope). The read head advances one
                synthesis hop per frame with no rate change, so the notes stay
                exactly where Karel played them while the body morphs continuously
                from glassy to woody to vowel-like.
              </p>
              <p>
                <strong>Anti-hiss defences.</strong> A Hann window on both analysis
                and synthesis with COLA-correct 75% overlap (norm 1/1.5); the gain
                is inherently smooth because it is the difference of two liftered
                envelopes, and it is further moving-averaged across bins so no
                single bin spikes into musical noise; a bounded spectral floor and
                ceiling (−18 dB … +12 dB); and per-block one-pole smoothing of the
                morph, vowel and depth controls so there is no zipper noise.
                Everything terminates in <code>createSafeMaster(ctx).input</code>;
                the visuals read <code>safeMaster.analyser</code>.
              </p>
              <p>
                <strong>Your hands are the tract.</strong> The midpoint x of your
                two hands sets the morph position <em>m</em> (glassy ↔ woody ↔
                vocal); your average hand height sets the morph <em>depth</em>
                (low = the untouched original, high = fully morphed); and the
                separation between your hands slides the <em>vowel</em>
                /u/→/o/→/a/→/e/→/i/. Every axis reaches the worklet by
                <code> port.postMessage</code> and is smoothed there.
              </p>
              <p>
                <strong>Achromatic ultrasound palette.</strong> The hero is a
                three.js waterfall of the morphing formant surface — a scrolling
                height-field ridge rendered like a medical ultrasound / X-ray of a
                vocal tract: grayscale intensity, a faint warm-neutral tint only in
                the brightest crests, soft depth fog, a barely-there scan-mesh grid.
                The front ridge is the current envelope × the live analyser
                magnitude, so it reshapes as you move and dances to the actual
                sound. No colour, no film grain.
              </p>
              <p>
                <strong>Degrades gracefully.</strong> No camera or model → a pointer
                fallback (mouse x = glassy↔vocal, up/down = vowel, click = morph
                deeper) with a visible notice, while a labelled autonomous demo
                drive sweeps m/vowel/depth so the whole chain is audible and
                visible headless. The status line always states whether you are
                seeing <em>tracking · live</em>, <em>demo · autonomous</em>, a
                <em> pointer · fallback</em>, or a lost-hands hint. If WebGL fails
                the audio keeps morphing and a readable notice replaces the surface.
              </p>
              <p>
                <strong>References.</strong> NEUON — <em>Cepstral Morph</em>
                (Dystopian Waves, 25 Sep 2026): cepstral spectral morphing and the
                separation of formant structure from spectral texture. The finding
                that cepstral-coefficient interpolation gives the most linear
                temporal-envelope morph. Fant&apos;s <em>source-filter model</em> of
                sound production. Grey, J. M. (1977), <em>Multidimensional
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
