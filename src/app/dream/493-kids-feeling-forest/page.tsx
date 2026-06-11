'use client';

import { useEffect, useRef, useState } from 'react';

// ─── MATH HELPERS ──────────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Inverse-distance-weighted blend (power=2) across anchor points
function computeWeights(px: number, py: number, anchors: AnchorPoint[]): number[] {
  const eps = 1e-6;
  const dists = anchors.map(a => {
    const dx = px - a.x;
    const dy = py - a.y;
    return Math.sqrt(dx * dx + dy * dy) + eps;
  });
  const minD = Math.min(...dists);
  if (minD < 0.02) {
    return anchors.map((_, i) => (dists[i] === minD ? 1 : 0));
  }
  const invDists = dists.map(d => 1 / (d * d));
  const total = invDists.reduce((s, v) => s + v, 0);
  return invDists.map(v => v / total);
}

function blendScalar(weights: number[], values: number[]): number {
  return weights.reduce((s, w, i) => s + w * values[i], 0);
}

// ─── MOOD ANCHORS ─────────────────────────────────────────────────────────────

interface AnchorPoint {
  id: string;
  x: number;          // 0..1 normalized position
  y: number;
  chordOffsets: number[];   // semitone offsets from root
  detuneAmt: number;        // cents of beating (0=pure, 22=rough)
  timbre: number;           // 0=sine, 0.5=triangle, 1=sawtooth
  filterHz: number;
  tremoloRate: number;      // Hz
  tremoloDepth: number;     // 0..1
  gainMult: number;
  hue: number;              // HSL hue for visual
  jagged: number;           // 0=smooth, 1=jagged/tense
}

const ANCHORS: AnchorPoint[] = [
  {
    // TOP-LEFT: Prickly/Storm — dissonant cluster, beating, dark, fast tremolo
    id: 'storm',
    x: 0.08, y: 0.08,
    chordOffsets: [0, 1, 6, 13],   // unison + m2 + tritone + m9 — genuinely harsh
    detuneAmt: 22,
    timbre: 0.85,
    filterHz: 380,
    tremoloRate: 5.8,
    tremoloDepth: 0.55,
    gainMult: 0.85,
    hue: 220,   // cold blue-grey
    jagged: 1.0,
  },
  {
    // TOP-RIGHT: Electric/Tense — augmented + dominant-7th flavour
    id: 'electric',
    x: 0.92, y: 0.08,
    chordOffsets: [0, 4, 8, 10],
    detuneAmt: 14,
    timbre: 0.65,
    filterHz: 600,
    tremoloRate: 3.2,
    tremoloDepth: 0.38,
    gainMult: 0.9,
    hue: 270,   // violet
    jagged: 0.7,
  },
  {
    // CENTER: Bittersweet/Suspended — sus2/quartal, ambiguous middle
    id: 'bittersweet',
    x: 0.50, y: 0.42,
    chordOffsets: [0, 2, 7, 14],   // sus2 + octave
    detuneAmt: 5,
    timbre: 0.25,
    filterHz: 900,
    tremoloRate: 0.8,
    tremoloDepth: 0.14,
    gainMult: 1.0,
    hue: 195,   // cyan-teal
    jagged: 0.3,
  },
  {
    // BOTTOM-LEFT: Dreamy/Whole-tone — floating, unresolved
    id: 'dream',
    x: 0.15, y: 0.82,
    chordOffsets: [0, 4, 8, 12],   // whole-tone stack
    detuneAmt: 7,
    timbre: 0.15,
    filterHz: 1200,
    tremoloRate: 1.4,
    tremoloDepth: 0.18,
    gainMult: 0.95,
    hue: 155,   // emerald green
    jagged: 0.2,
  },
  {
    // BOTTOM-RIGHT: Calm/Clear — open fifth + octave, most consonant
    id: 'calm',
    x: 0.88, y: 0.88,
    chordOffsets: [0, 7, 12, 19],  // open fifth stack
    detuneAmt: 0,
    timbre: 0.0,
    filterHz: 2200,
    tremoloRate: 0.0,
    tremoloDepth: 0.0,
    gainMult: 1.1,
    hue: 45,    // warm amber
    jagged: 0.0,
  },
  {
    // CENTER-BOTTOM: Sweet/Warm — major triad
    id: 'sweet',
    x: 0.55, y: 0.90,
    chordOffsets: [0, 4, 7, 12],
    detuneAmt: 2,
    timbre: 0.08,
    filterHz: 1800,
    tremoloRate: 0.4,
    tremoloDepth: 0.08,
    gainMult: 1.05,
    hue: 30,    // orange-warm
    jagged: 0.05,
  },
];

const ROOT_MIDI = 48;       // C3
const NUM_VOICES = 4;       // one oscillator pair per chord tone

// ─── AUDIO ENGINE ─────────────────────────────────────────────────────────────

interface PadVoice {
  osc: OscillatorNode;
  detuneOsc: OscillatorNode;
  voiceGain: GainNode;
  tremoloOsc: OscillatorNode;
  tremoloGain: GainNode;
  filter: BiquadFilterNode;
}

interface AudioEngine {
  actx: AudioContext;
  voices: PadVoice[];
  masterGain: GainNode;
  masterFilter: BiquadFilterNode;
}

function buildAudioEngine(): AudioEngine {
  const actx = new AudioContext();

  // Master chain: … → masterFilter → masterGain → limiter → destination
  const limiter = actx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  limiter.connect(actx.destination);

  const masterGain = actx.createGain();
  masterGain.gain.value = 0.0;   // start silent; fade in after start
  masterGain.connect(limiter);

  const masterFilter = actx.createBiquadFilter();
  masterFilter.type = 'lowpass';
  masterFilter.frequency.value = 2000;
  masterFilter.Q.value = 0.5;
  masterFilter.connect(masterGain);

  const voices: PadVoice[] = [];

  for (let i = 0; i < NUM_VOICES; i++) {
    // Signal path: osc ──┬──→ voiceGain → filter → masterFilter
    //              detuneOsc ──┘
    // Tremolo LFO:  tremoloOsc → tremoloGain → voiceGain.gain (AudioParam)

    const voiceGain = actx.createGain();
    voiceGain.gain.value = 0.001; // near-zero; real value set each frame

    const filter = actx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1000;
    filter.Q.value = 0.6;
    filter.connect(masterFilter);

    voiceGain.connect(filter);

    // Tremolo (amplitude LFO)
    const tremoloOsc = actx.createOscillator();
    tremoloOsc.type = 'sine';
    tremoloOsc.frequency.value = 0.5;
    const tremoloGain = actx.createGain();
    tremoloGain.gain.value = 0.0;
    tremoloOsc.connect(tremoloGain);
    tremoloGain.connect(voiceGain.gain); // modulate the gain AudioParam

    // Main oscillator
    const osc = actx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = midiToHz(ROOT_MIDI);
    osc.connect(voiceGain);

    // Detuned twin for beating
    const detuneOsc = actx.createOscillator();
    detuneOsc.type = 'sine';
    detuneOsc.frequency.value = midiToHz(ROOT_MIDI);
    detuneOsc.detune.value = 8;
    detuneOsc.connect(voiceGain);

    osc.start();
    detuneOsc.start();
    tremoloOsc.start();

    voices.push({ osc, detuneOsc, voiceGain, tremoloOsc, tremoloGain, filter });
  }

  return { actx, voices, masterGain, masterFilter };
}

function applyAudioPosition(eng: AudioEngine, px: number, py: number): void {
  const weights = computeWeights(px, py, ANCHORS);
  const t = eng.actx.currentTime;
  const tc = 0.12; // smooth time-constant (seconds)

  const blendedTimbre       = blendScalar(weights, ANCHORS.map(a => a.timbre));
  const blendedFilterHz     = blendScalar(weights, ANCHORS.map(a => a.filterHz));
  const blendedDetuneAmt    = blendScalar(weights, ANCHORS.map(a => a.detuneAmt));
  const blendedTremoloRate  = blendScalar(weights, ANCHORS.map(a => a.tremoloRate));
  const blendedTremoloDepth = blendScalar(weights, ANCHORS.map(a => a.tremoloDepth));
  const blendedGainMult     = blendScalar(weights, ANCHORS.map(a => a.gainMult));

  // Interpolate chord offsets across all anchors
  const blendedOffsets: number[] = [];
  for (let v = 0; v < NUM_VOICES; v++) {
    let offset = 0;
    for (let a = 0; a < ANCHORS.length; a++) {
      const anchOff = ANCHORS[a].chordOffsets[Math.min(v, ANCHORS[a].chordOffsets.length - 1)];
      offset += weights[a] * anchOff;
    }
    blendedOffsets.push(offset);
  }

  // Map blendedTimbre → OscillatorType
  let oscType: OscillatorType = 'sine';
  if (blendedTimbre > 0.65) oscType = 'sawtooth';
  else if (blendedTimbre > 0.3) oscType = 'triangle';

  // Base gain per voice
  const baseGain = (blendedGainMult * 0.18) / NUM_VOICES;
  // Tremolo depth must stay below baseGain to avoid negative gain
  const treGainAmt = baseGain * blendedTremoloDepth * 0.75;

  eng.masterFilter.frequency.setTargetAtTime(clamp(blendedFilterHz * 1.4, 200, 8000), t, tc);

  for (let v = 0; v < NUM_VOICES; v++) {
    const voice = eng.voices[v];
    const hz = midiToHz(ROOT_MIDI + blendedOffsets[v]);

    voice.osc.frequency.setTargetAtTime(hz, t, tc);
    voice.detuneOsc.frequency.setTargetAtTime(hz, t, tc);
    voice.detuneOsc.detune.setTargetAtTime(blendedDetuneAmt * (v === 0 ? 0.5 : 1.0), t, tc);

    if (voice.osc.type !== oscType) {
      voice.osc.type = oscType;
      voice.detuneOsc.type = oscType;
    }

    voice.voiceGain.gain.setTargetAtTime(baseGain, t, tc);
    voice.filter.frequency.setTargetAtTime(clamp(blendedFilterHz * (1 + v * 0.12), 200, 6000), t, tc);
    voice.tremoloOsc.frequency.setTargetAtTime(blendedTremoloRate, t, tc);
    voice.tremoloGain.gain.setTargetAtTime(treGainAmt, t, tc);
  }
}

function fadeInAudio(eng: AudioEngine): void {
  const t = eng.actx.currentTime;
  eng.masterGain.gain.setValueAtTime(0, t);
  eng.masterGain.gain.linearRampToValueAtTime(0.72, t + 1.4);
}

function closeAudioEngine(eng: AudioEngine): void {
  try { eng.actx.close(); } catch { /* ignore */ }
}

// ─── VISUAL HELPERS ────────────────────────────────────────────────────────────

interface RegionColor { h: number; s: number; l: number; jagged: number }

function computeRegionColor(px: number, py: number): RegionColor {
  const weights = computeWeights(px, py, ANCHORS);
  const h = blendScalar(weights, ANCHORS.map(a => a.hue));
  const j = blendScalar(weights, ANCHORS.map(a => a.jagged));
  const s = lerp(35, 70, 1 - j);
  const l = lerp(8, 18, 1 - j);
  return { h, s, l, jagged: j };
}

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number;
  hue: number;
  size: number;
}

interface TrailPt { x: number; y: number; t: number }

// Draw the continuous color-gradient background
function drawBackground(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  creatureX: number, creatureY: number,
  frameCount: number
): void {
  const COLS = 8;
  const ROWS = 8;
  const cw = W / COLS;
  const ch = H / ROWS;

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const nx = (col + 0.5) / COLS;
      const ny = (row + 0.5) / ROWS;
      const r = computeRegionColor(nx, ny);
      let jitterL = 0;
      if (r.jagged > 0.5) {
        jitterL = (Math.sin(frameCount * 0.18 + col * 2.3 + row * 1.7) * 0.5 + 0.5)
          * r.jagged * 6;
      }
      ctx.fillStyle = `hsl(${r.h},${r.s}%,${r.l + jitterL}%)`;
      ctx.fillRect(col * cw - 1, row * ch - 1, cw + 2, ch + 2);
    }
  }

  // Soft glow from creature's current position
  const gx = creatureX * W;
  const gy = creatureY * H;
  const region = computeRegionColor(creatureX, creatureY);
  const glowR = Math.min(W, H) * 0.32;
  const grd = ctx.createRadialGradient(gx, gy, 0, gx, gy, glowR);
  grd.addColorStop(0, `hsla(${region.h},80%,35%,0.38)`);
  grd.addColorStop(0.5, `hsla(${region.h},60%,20%,0.18)`);
  grd.addColorStop(1, `hsla(${region.h},40%,10%,0)`);
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(gx, gy, glowR, 0, Math.PI * 2);
  ctx.fill();
}

// Draw jagged tension lines in prickly zones
function drawTensionLines(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  frameCount: number
): void {
  for (let s = 0; s < 5; s++) {
    const nx = (s + 0.5) / 5;
    const r = computeRegionColor(nx, 0.12);
    if (r.jagged > 0.4) {
      const x = nx * W;
      const amp = r.jagged * 8 * Math.sin(frameCount * 0.22 + s * 0.8);
      ctx.beginPath();
      ctx.moveTo(x + amp, 0);
      ctx.lineTo(x - amp, H * 0.22);
      ctx.strokeStyle = `hsla(${r.h},50%,40%,${r.jagged * 0.1})`;
      ctx.lineWidth = r.jagged * 1.2;
      ctx.stroke();
    }
  }
}

function drawTrail(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  trail: TrailPt[],
  nowMs: number,
  regionHue: number
): void {
  const maxAge = 1800;
  for (const pt of trail) {
    const age = nowMs - pt.t;
    if (age > maxAge) continue;
    const frac = 1 - age / maxAge;
    const r = Math.max(1, 6 * frac);
    ctx.beginPath();
    ctx.arc(pt.x * W, pt.y * H, r, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${regionHue},70%,65%,${frac * 0.55})`;
    ctx.fill();
  }
}

function drawParticles(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  particles: Particle[]
): void {
  for (const p of particles) {
    ctx.beginPath();
    ctx.arc(p.x * W, p.y * H, p.size * p.life, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${p.hue},75%,65%,${p.life * 0.7})`;
    ctx.fill();
  }
}

function drawCreature(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  cx: number, cy: number,
  frameCount: number,
  region: RegionColor
): void {
  const x = cx * W;
  const y = cy * H;
  const pulse = 0.5 + 0.5 * Math.sin(frameCount * 0.08);
  const baseR = Math.min(W, H) * 0.038;
  const jitter = region.jagged * 3.5 * Math.sin(frameCount * 0.31);

  // Outer soft glow
  const outerR = baseR * (3.5 + pulse * 0.6);
  const glowGrd = ctx.createRadialGradient(
    x + jitter, y + jitter * 0.7, 0,
    x + jitter, y + jitter * 0.7, outerR
  );
  glowGrd.addColorStop(0, `hsla(${region.h},${region.s + 20}%,80%,0.55)`);
  glowGrd.addColorStop(0.4, `hsla(${region.h},${region.s}%,65%,0.22)`);
  glowGrd.addColorStop(1, `hsla(${region.h},${region.s}%,50%,0)`);
  ctx.beginPath();
  ctx.arc(x + jitter, y + jitter * 0.7, outerR, 0, Math.PI * 2);
  ctx.fillStyle = glowGrd;
  ctx.fill();

  // Core body
  const bodyR = baseR * (1 + pulse * 0.12);
  ctx.save();
  ctx.shadowBlur = 18;
  ctx.shadowColor = `hsla(${region.h},90%,75%,0.9)`;
  ctx.beginPath();
  ctx.arc(x + jitter * 0.4, y + jitter * 0.3, bodyR, 0, Math.PI * 2);
  ctx.fillStyle = `hsl(${region.h},${region.s + 30}%,82%)`;
  ctx.fill();
  ctx.restore();

  // White sparkle highlight
  ctx.beginPath();
  ctx.arc(
    x + jitter * 0.3 - bodyR * 0.2,
    y + jitter * 0.25 - bodyR * 0.2,
    bodyR * 0.3, 0, Math.PI * 2
  );
  ctx.fillStyle = `rgba(255,255,255,${0.75 + pulse * 0.2})`;
  ctx.fill();

  // Spiky rays in tense zones
  if (region.jagged > 0.35) {
    const numSpikes = 6;
    const spikeLen = baseR * 1.8 * region.jagged;
    ctx.save();
    ctx.strokeStyle = `hsla(${region.h},60%,60%,${region.jagged * 0.45})`;
    ctx.lineWidth = 1.0;
    for (let s = 0; s < numSpikes; s++) {
      const angle = (s / numSpikes) * Math.PI * 2 + frameCount * 0.04;
      const wobble = Math.sin(frameCount * 0.19 + s * 1.1) * region.jagged * 4;
      const ex = x + jitter + Math.cos(angle) * (spikeLen + wobble);
      const ey = y + jitter * 0.7 + Math.sin(angle) * (spikeLen + wobble);
      ctx.beginPath();
      ctx.moveTo(x + jitter * 0.5, y + jitter * 0.35);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawCameraIndicator(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  markerX: number,
  markerY: number
): void {
  const iw = 36; const ih = 27;
  const ix = W - iw - 8;
  const iy = 10;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(ix, iy, iw, ih);
  const dotX = ix + markerX * iw;
  const dotY = iy + markerY * ih;
  ctx.fillStyle = 'rgba(52,211,153,0.9)';
  ctx.beginPath();
  ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ─── AUTO-DEMO PATH ────────────────────────────────────────────────────────────

function computeDemoPos(elapsedSec: number): { x: number; y: number } {
  const period = 14.0;
  const phase = (elapsedSec % period) / period;

  // Keyframes: prickly → electric → bittersweet → sweet → calm → dream → back
  const kf = [
    { p: 0.00, x: 0.12, y: 0.12 },
    { p: 0.18, x: 0.88, y: 0.12 },
    { p: 0.38, x: 0.50, y: 0.42 },
    { p: 0.55, x: 0.55, y: 0.90 },
    { p: 0.72, x: 0.88, y: 0.88 },
    { p: 0.85, x: 0.15, y: 0.82 },
    { p: 1.00, x: 0.12, y: 0.12 },
  ];

  let seg = 0;
  for (let i = 0; i < kf.length - 1; i++) {
    if (phase >= kf[i].p && phase < kf[i + 1].p) { seg = i; break; }
  }
  const kf0 = kf[seg];
  const kf1 = kf[seg + 1];
  const sp = (phase - kf0.p) / (kf1.p - kf0.p);
  const sm = sp * sp * (3 - 2 * sp); // smooth step
  return { x: lerp(kf0.x, kf1.x, sm), y: lerp(kf0.y, kf1.y, sm) };
}

// ─── MEDIAPIPE LOADER ─────────────────────────────────────────────────────────

// Minimal types for dynamically loaded MediaPipe
interface MPLandmark { x: number; y: number }
interface MPResult {
  poseLandmarks?: MPLandmark[][];
  landmarks?: MPLandmark[][];
}
interface MPTask {
  detectForVideo(video: HTMLVideoElement, ts: number): MPResult;
  close(): void;
}

// Returns a cleanup function
async function startCameraInput(
  videoEl: HTMLVideoElement,
  onPosition: (nx: number, ny: number) => void,
  onFail: () => void
): Promise<() => void> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } },
    });
  } catch {
    onFail();
    return () => {};
  }

  videoEl.srcObject = stream;
  videoEl.playsInline = true;
  videoEl.muted = true;

  let videoReady = false;
  await new Promise<void>(res => {
    videoEl.onloadedmetadata = () => { videoEl.play().then(() => { videoReady = true; res(); }).catch(() => res()); };
    videoEl.onerror = () => res();
    setTimeout(res, 8000);
  });

  if (!videoReady) { onFail(); return () => { stream.getTracks().forEach(t => t.stop()); }; }

  // Try to load MediaPipe PoseLandmarker from CDN
  let task: MPTask | null = null;
  try {
    const mpVer = '0.10.14';
    await new Promise<void>((res, rej) => {
      if (document.querySelector(`script[data-mp="${mpVer}"]`)) { res(); return; }
      const s = document.createElement('script');
      s.src = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${mpVer}/wasm/vision_bundle.mjs`;
      s.type = 'module';
      s.dataset.mp = mpVer;
      s.onload = () => res();
      s.onerror = rej;
      document.head.appendChild(s);
      setTimeout(rej, 12000);
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mpNs = (window as any).mediapipeTasks ?? (window as any);
    const { PoseLandmarker, FilesetResolver } = mpNs;
    if (!PoseLandmarker) throw new Error('PoseLandmarker not found');

    const cdnBase = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${mpVer}/wasm`;
    const vision = await FilesetResolver.forVisionTasks(cdnBase);
    task = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numPoses: 1,
    }) as MPTask;
  } catch {
    // MediaPipe CDN failed — still provide drag fallback below
    task = null;
  }

  let running = true;
  let lastTs = 0;

  const loop = () => {
    if (!running) return;
    requestAnimationFrame(loop);
    const now = performance.now();
    if (now - lastTs < 33) return;
    lastTs = now;

    if (!task) return;
    try {
      const result = task.detectForVideo(videoEl, now);
      const lmks = result.poseLandmarks?.[0] ?? result.landmarks?.[0];
      if (lmks && lmks.length > 0) {
        const nose = lmks[0];
        // Mirror x (selfie camera)
        onPosition(clamp(1 - nose.x, 0, 1), clamp(nose.y, 0, 1));
      }
    } catch { /* per-frame errors are normal */ }
  };
  loop();

  return () => {
    running = false;
    try { task?.close(); } catch { /* ignore */ }
    stream.getTracks().forEach(t => t.stop());
  };
}

// ─── MAIN COMPONENT ────────────────────────────────────────────────────────────

type InputMode = 'none' | 'camera' | 'drag' | 'auto';

export default function KidsFeelingForest() {
  const [started, setStarted]         = useState(false);
  const [inputMode, setInputMode]     = useState<InputMode>('none');
  const [cameraError, setCameraError] = useState('');
  const [cameraAsked, setCameraAsked] = useState(false);

  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const videoRef   = useRef<HTMLVideoElement>(null);
  const audioRef   = useRef<AudioEngine | null>(null);
  const cleanupCam = useRef<(() => void) | null>(null);

  // Mutable state updated each frame (not React state)
  const rawPos         = useRef({ x: 0.5, y: 0.5 });
  const smoothPos      = useRef({ x: 0.5, y: 0.5 });
  const userControlled = useRef(false);
  const inputModeRef   = useRef<InputMode>('none');
  const autoT0         = useRef(0);
  const particlesRef   = useRef<Particle[]>([]);
  const trailRef       = useRef<TrailPt[]>([]);
  const frameRef       = useRef(0);
  const cameraMarker   = useRef<{ x: number; y: number } | null>(null);

  // Keep modeRef in sync
  useEffect(() => { inputModeRef.current = inputMode; }, [inputMode]);

  // ── Main render/audio loop ─────────────────────────────────────────────────
  useEffect(() => {
    if (!started) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const eng = buildAudioEngine();
    audioRef.current = eng;
    fadeInAudio(eng);
    autoT0.current = performance.now() / 1000;

    let W = canvas.offsetWidth || 1;
    let H = canvas.offsetHeight || 1;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const doResize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.offsetWidth;
      H = canvas.offsetHeight;
      canvas.width  = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    doResize();
    const ro = new ResizeObserver(doResize);
    ro.observe(canvas);

    // ── Drag / pointer input ───────────────────────────────────────────────
    let dragging = false;

    const getPosNorm = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: clamp((clientX - rect.left) / rect.width, 0, 1),
        y: clamp((clientY - rect.top) / rect.height, 0, 1),
      };
    };

    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      dragging = true;
      userControlled.current = true;
      if (inputModeRef.current === 'none' || inputModeRef.current === 'auto') {
        setInputMode('drag');
      }
      rawPos.current = getPosNorm(e.clientX, e.clientY);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      rawPos.current = getPosNorm(e.clientX, e.clientY);
    };
    const onUp = () => { dragging = false; };

    canvas.addEventListener('pointerdown', onDown, { passive: false });
    canvas.addEventListener('pointermove', onMove, { passive: false });
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    // ── Render loop ────────────────────────────────────────────────────────
    let rafId = 0;
    let lastMs = performance.now();

    const tick = (nowMs: number) => {
      rafId = requestAnimationFrame(tick);
      const dt = clamp((nowMs - lastMs) / 1000, 0, 0.05);
      lastMs = nowMs;
      frameRef.current++;
      const fc = frameRef.current;

      // Auto-demo: wander while no user input
      if (!userControlled.current && inputModeRef.current !== 'camera') {
        const demo = computeDemoPos(nowMs / 1000 - autoT0.current);
        rawPos.current.x = lerp(rawPos.current.x, demo.x, dt * 0.9);
        rawPos.current.y = lerp(rawPos.current.y, demo.y, dt * 0.9);
        if (inputModeRef.current === 'none') setInputMode('auto');
      }

      // Exponential smooth (~150 ms)
      const alpha = 1 - Math.exp(-dt / 0.15);
      smoothPos.current.x = lerp(smoothPos.current.x, rawPos.current.x, alpha);
      smoothPos.current.y = lerp(smoothPos.current.y, rawPos.current.y, alpha);

      const { x: cx, y: cy } = smoothPos.current;
      const region = computeRegionColor(cx, cy);

      // Update audio
      if (eng.actx.state === 'running') {
        applyAudioPosition(eng, cx, cy);
      }

      // Spawn particles
      if (fc % 3 === 0) {
        const spd = region.jagged > 0.5 ? 0.9 : 0.3;
        const ang = Math.random() * Math.PI * 2;
        particlesRef.current.push({
          x: cx + (Math.random() - 0.5) * 0.06,
          y: cy + (Math.random() - 0.5) * 0.06,
          vx: Math.cos(ang) * spd * 0.003,
          vy: Math.sin(ang) * spd * 0.003 - 0.001,
          life: 1.0,
          hue: region.h,
          size: 2.5 + Math.random() * 2,
        });
      }

      // Update particles
      particlesRef.current = particlesRef.current
        .map(p => ({ ...p, x: p.x + p.vx * dt, y: p.y + p.vy * dt, life: p.life - dt * (0.6 + region.jagged * 0.4) }))
        .filter(p => p.life > 0.01 && p.x >= -0.05 && p.x <= 1.05);

      // Trail
      trailRef.current.push({ x: cx, y: cy, t: nowMs });
      if (trailRef.current.length > 150) trailRef.current.shift();
      const cutMs = nowMs - 2200;
      while (trailRef.current.length > 0 && trailRef.current[0].t < cutMs) {
        trailRef.current.shift();
      }

      // ── Draw ────────────────────────────────────────────────────────────
      drawBackground(ctx, W, H, cx, cy, fc);
      drawTensionLines(ctx, W, H, fc);
      drawTrail(ctx, W, H, trailRef.current, nowMs, region.h);
      drawParticles(ctx, W, H, particlesRef.current);
      drawCreature(ctx, W, H, cx, cy, fc, region);

      const cm = cameraMarker.current;
      if (cm) drawCameraIndicator(ctx, W, H, cm.x, cm.y);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      closeAudioEngine(eng);
      audioRef.current = null;
      cleanupCam.current?.();
      cleanupCam.current = null;
    };
  }, [started]);

  // ── Camera ─────────────────────────────────────────────────────────────────
  const handleStartCamera = async () => {
    setCameraAsked(true);
    const videoEl = videoRef.current;
    if (!videoEl) return;

    const cleanup = await startCameraInput(
      videoEl,
      (nx, ny) => {
        rawPos.current = { x: nx, y: ny };
        cameraMarker.current = { x: nx, y: ny };
        userControlled.current = true;
        setInputMode('camera');
      },
      () => {
        setCameraError('Camera not available — drag the creature instead!');
        setInputMode('drag');
      }
    );
    cleanupCam.current = cleanup;
    setInputMode('camera');
  };

  const handleStart = () => {
    setStarted(true);
    setInputMode('auto'); // auto-demo begins immediately
  };

  // ─── PRE-START SCREEN ──────────────────────────────────────────────────────

  if (!started) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-white px-6 py-10">
        <div className="max-w-sm w-full text-center space-y-8">
          <div>
            <h1 className="text-2xl font-mono font-bold text-white tracking-tight">
              Feeling Forest
            </h1>
            <p className="text-white/75 text-base mt-2 leading-relaxed">
              Move through a world of feelings —{' '}
              <span className="text-violet-300">prickly and stormy</span> in one corner,{' '}
              <span className="text-amber-300/95">calm and warm</span> in another.
            </p>
          </div>

          {/* Mini preview map */}
          <div
            className="relative w-full max-w-[240px] mx-auto rounded-xl overflow-hidden border border-white/10"
            style={{ aspectRatio: '1' }}
          >
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(135deg, hsl(220,40%,10%) 0%, hsl(195,45%,14%) 50%, hsl(45,60%,14%) 100%)',
              }}
            />
            {ANCHORS.map(a => (
              <div
                key={a.id}
                className="absolute rounded-full"
                style={{
                  left: `${a.x * 100}%`,
                  top: `${a.y * 100}%`,
                  width: 12, height: 12,
                  transform: 'translate(-50%,-50%)',
                  background: `hsl(${a.hue},70%,65%)`,
                  boxShadow: `0 0 8px hsl(${a.hue},70%,60%)`,
                  opacity: 0.85,
                }}
              />
            ))}
          </div>

          {/* Grown-up instruction */}
          <p className="text-white/75 text-sm font-mono leading-relaxed">
            For grown-ups: tap <em>Use Camera</em> to walk by moving your body,
            or drag the glowing spirit with a finger.
          </p>

          <button
            onPointerDown={handleStart}
            className="w-full min-h-[64px] py-4 px-6 rounded-2xl text-xl font-bold text-zinc-950 transition-all hover:opacity-90 active:scale-95"
            style={{
              background: 'linear-gradient(135deg, hsl(45,85%,62%), hsl(30,80%,55%))',
            }}
          >
            Enter the Forest
          </button>

          <p className="text-white/55 text-xs font-mono">
            Camera optional · touch + mouse · sound always gentle
          </p>
        </div>
      </div>
    );
  }

  // ─── ACTIVE VIEW ───────────────────────────────────────────────────────────

  return (
    <div className="w-full h-screen flex flex-col bg-zinc-950 overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 shrink-0 bg-black/30 border-b border-white/8">
        <div className="flex items-center gap-3">
          <span className="text-white text-base font-mono font-semibold">Feeling Forest</span>
          <span className="text-white/55 text-xs font-mono hidden sm:inline">
            {inputMode === 'camera' ? '● camera'
              : inputMode === 'drag' ? '○ drag'
              : inputMode === 'auto' ? '◈ demo' : ''}
          </span>
        </div>

        {!cameraAsked && (
          <button
            onClick={handleStartCamera}
            className="text-violet-300 text-xs font-mono px-3 py-1.5 rounded-lg border border-violet-400/30 hover:bg-violet-400/10 min-h-[44px] transition-colors"
          >
            Use Camera
          </button>
        )}
        {inputMode === 'camera' && (
          <span className="text-emerald-300/95 text-xs font-mono">camera active</span>
        )}

        <span className="text-white/30 text-xs font-mono">493</span>
      </div>

      {/* Camera error */}
      {cameraError && (
        <div className="px-4 py-2 bg-rose-950/50 border-b border-rose-500/30 shrink-0">
          <p className="text-rose-300 text-sm font-mono">{cameraError}</p>
        </div>
      )}

      {/* Main canvas */}
      <canvas
        ref={canvasRef}
        className="flex-1 w-full cursor-crosshair touch-none"
        style={{ display: 'block' }}
      />

      {/* Hidden video element for camera feed */}
      <video
        ref={videoRef}
        className="hidden"
        playsInline
        muted
        aria-hidden="true"
      />

      {/* Auto-demo hint */}
      {inputMode === 'auto' && (
        <div className="absolute bottom-8 inset-x-0 flex justify-center pointer-events-none">
          <span className="text-white/55 text-sm font-mono bg-black/40 px-4 py-2 rounded-full">
            drag to walk · or tap Use Camera
          </span>
        </div>
      )}
    </div>
  );
}
