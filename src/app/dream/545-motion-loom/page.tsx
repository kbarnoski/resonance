"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

const N_VOICES = 5;
// D pentatonic across 2 octaves
const PENTATONIC_NOTES: number[] = [
  293.66, 329.63, 369.99, 440.0, 493.88,
  587.33, 659.25, 739.99, 880.0, 987.77,
];
const CELL_INDICES: number[] = [0, 2, 4, 3, 6, 5, 1, 3];
const CELL_LEN = CELL_INDICES.length;

const SCHEDULE_INTERVAL_MS = 25;
const LOOKAHEAD_S = 0.12;

// Ikeda palette: violet / blue / emerald / cyan / purple
const VOICE_COLORS_HEX: string[] = [
  "#a78bfa", "#60a5fa", "#34d399", "#67e8f9", "#c084fc",
];
const VOICE_COLORS_THREE: number[] = [
  0xa78bfa, 0x60a5fa, 0x34d399, 0x67e8f9, 0xc084fc,
];

// Motion / tempo
const MOTION_BUFFER_LEN = 360; // ~6s at 60fps
const BPM_SMOOTH_TAU = 1.5;    // seconds
const GHOST_BPM_A = 72.0;      // left ghost
const GHOST_BPM_B = 72.0 * Math.SQRT2; // right ghost ≈ 101.8
const NO_MOTION_TIMEOUT = 4000; // ms before ghost resumes
const FRAME_W = 64;
const FRAME_H = 48;
const MIN_PERIOD_S = 0.35; // 170 BPM
const MAX_PERIOD_S = 1.5;  // 40  BPM

// Three.js loom geometry
const THREAD_SEGMENTS = 200;
const THREAD_SPREAD = 2.0;    // half-width of thread fan
const THREAD_DEPTH = 6.0;     // z range
const MAX_NODES_PER_VOICE = 32;

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

interface VoiceEngineState {
  cellPos: number;
  nextBeatTime: number;
  beatPeriodS: number;
  beatCount: number;
}

interface NodePulse {
  pos: THREE.Vector3;
  birth: number;  // AudioContext time or performance.now/1000
  voiceIdx: number;
  decay: number;
}

interface ConductorState {
  motionBuffer: Float32Array;
  bufferHead: number;
  bufferFilled: number;
  lastMotionMs: number;
  smoothBpm: number;
}

// ---------------------------------------------------------------------------
// AUDIO HELPERS
// ---------------------------------------------------------------------------

function scheduleNote(
  ac: AudioContext,
  dest: AudioNode,
  freq: number,
  t: number
): void {
  const env = ac.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(0.15, t + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
  env.connect(dest);

  const osc = ac.createOscillator();
  osc.type = "sine";
  osc.frequency.value = freq;
  osc.connect(env);
  osc.start(t);
  osc.stop(t + 1.7);

  const env2 = ac.createGain();
  env2.gain.setValueAtTime(0, t);
  env2.gain.linearRampToValueAtTime(0.055, t + 0.002);
  env2.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
  env2.connect(dest);

  const osc2 = ac.createOscillator();
  osc2.type = "sine";
  osc2.frequency.value = freq * 2.756;
  osc2.connect(env2);
  osc2.start(t);
  osc2.stop(t + 0.75);
}

// ---------------------------------------------------------------------------
// TEMPO EXTRACTION: autocorrelation on motion-energy buffer
// ---------------------------------------------------------------------------

function computeAutocorrBpm(
  buffer: Float32Array,
  filled: number,
  sampleRate: number
): number | null {
  if (filled < 60) return null;

  const n = filled;
  const data = new Float32Array(n);
  let mean = 0;
  for (let i = 0; i < n; i++) mean += buffer[i];
  mean /= n;
  for (let i = 0; i < n; i++) data[i] = buffer[i] - mean;

  const minLag = Math.round(MIN_PERIOD_S * sampleRate);
  const maxLag = Math.min(Math.round(MAX_PERIOD_S * sampleRate), n - 1);

  if (minLag >= maxLag) return null;

  let bestLag = minLag;
  let bestVal = -Infinity;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    const count = n - lag;
    for (let i = 0; i < count; i++) {
      sum += data[i] * data[i + lag];
    }
    const val = sum / count;
    if (val > bestVal) {
      bestVal = val;
      bestLag = lag;
    }
  }

  if (bestVal <= 0) return null;
  const periodS = bestLag / sampleRate;
  return 60 / periodS;
}

// ---------------------------------------------------------------------------
// GHOST MOTION GENERATOR: two incommensurate sinusoidal "conductors"
// ---------------------------------------------------------------------------

function ghostMotionEnergy(tSec: number, side: "left" | "right"): number {
  const bpm = side === "left" ? GHOST_BPM_A : GHOST_BPM_B;
  const f = bpm / 60;
  // Compound sinusoidal "body motion" — varied enough to give autocorr a peak
  const v =
    0.5 * (Math.sin(2 * Math.PI * f * tSec) + 1) +
    0.3 * (Math.sin(2 * Math.PI * f * 1.618 * tSec) + 1) +
    0.2 * (Math.sin(2 * Math.PI * f * 0.5 * tSec) + 1);
  return Math.max(0, v / 2.0); // [0, 1]
}

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------

export default function MotionLoomPage() {
  const [started, setStarted] = useState(false);
  const [cameraGranted, setCameraGranted] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);

  // Display readouts (updated via interval, not every frame)
  const [bpmA, setBpmA] = useState<number>(GHOST_BPM_A);
  const [bpmB, setBpmB] = useState<number>(GHOST_BPM_B);
  const [ratio, setRatio] = useState<string>((GHOST_BPM_B / GHOST_BPM_A).toFixed(4));

  // DOM refs
  const mountRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Three.js refs
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraThreeRef = useRef<THREE.PerspectiveCamera | null>(null);
  const threadLinesRef = useRef<THREE.Line[]>([]);
  const nodePoolRef = useRef<NodePulse[]>([]);
  const nodeMeshesRef = useRef<THREE.Mesh[]>([]);
  const nodeMaterialsRef = useRef<THREE.MeshBasicMaterial[]>([]);
  const rafRef = useRef<number>(0);

  // Audio refs
  const acRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const startedRef = useRef(false);
  const schedulerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const voiceEnginesRef = useRef<VoiceEngineState[]>([]);

  // Motion/tempo conductor refs
  const conductorARef = useRef<ConductorState>({
    motionBuffer: new Float32Array(MOTION_BUFFER_LEN),
    bufferHead: 0,
    bufferFilled: 0,
    lastMotionMs: 0,
    smoothBpm: GHOST_BPM_A,
  });
  const conductorBRef = useRef<ConductorState>({
    motionBuffer: new Float32Array(MOTION_BUFFER_LEN),
    bufferHead: 0,
    bufferFilled: 0,
    lastMotionMs: 0,
    smoothBpm: GHOST_BPM_B,
  });

  // Camera / frame-diff refs
  const prevPixelsRef = useRef<Uint8ClampedArray | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const motionRafRef = useRef<number>(0);
  const frameRateRef = useRef(30); // estimated frame rate for autocorr sample rate
  const frameTsRef = useRef<number>(0);

  // For display readout polling
  const displayIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clock source: either AudioContext.currentTime or performance.now / 1000
  const audioLiveRef = useRef(false);
  const getNow = useCallback((): number => {
    if (audioLiveRef.current && acRef.current) return acRef.current.currentTime;
    return performance.now() / 1000;
  }, []);

  // -----------------------------------------------------------------------
  // THREE.JS SETUP
  // -----------------------------------------------------------------------
  const initThree = useCallback(() => {
    const container = mountRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setWebglError("WebGL unavailable — cannot render 3D loom");
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x020208, 1);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const cam = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / container.clientHeight,
      0.01,
      100
    );
    cam.position.set(0, 1.2, 8);
    cameraThreeRef.current = cam;

    // Ambient + point lights for glow effect
    const ambient = new THREE.AmbientLight(0x111122, 0.5);
    scene.add(ambient);

    // Build 5 thread lines (TubeGeometry-based ribbon through 3D space)
    threadLinesRef.current = [];
    for (let vi = 0; vi < N_VOICES; vi++) {
      const color = VOICE_COLORS_THREE[vi];
      // Create a curve for the thread — sinusoidal path in XYZ
      const points: THREE.Vector3[] = [];
      for (let s = 0; s <= THREAD_SEGMENTS; s++) {
        const t = s / THREAD_SEGMENTS;
        const z = -THREAD_DEPTH / 2 + t * THREAD_DEPTH;
        const yOff = ((vi - 2) / 2) * THREAD_SPREAD * 0.4;
        const xOff = Math.sin(t * Math.PI * 4 + vi * 1.2) * 0.3;
        points.push(new THREE.Vector3(xOff, yOff, z));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.55,
        linewidth: 1,
      });
      const line = new THREE.Line(geo, mat);
      scene.add(line);
      threadLinesRef.current.push(line);
    }

    // Pre-create node meshes pool (reused)
    nodeMeshesRef.current = [];
    nodeMaterialsRef.current = [];
    const nodeSphere = new THREE.SphereGeometry(0.045, 8, 6);
    for (let i = 0; i < MAX_NODES_PER_VOICE * N_VOICES; i++) {
      const vi = i % N_VOICES;
      const mat = new THREE.MeshBasicMaterial({
        color: VOICE_COLORS_THREE[vi],
        transparent: true,
        opacity: 0,
      });
      const mesh = new THREE.Mesh(nodeSphere, mat);
      mesh.visible = false;
      scene.add(mesh);
      nodeMeshesRef.current.push(mesh);
      nodeMaterialsRef.current.push(mat);
    }

    // Handle resize
    const onResize = () => {
      if (!container || !renderer || !cam) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    // Store cleanup
    (renderer as THREE.WebGLRenderer & { _resizeCleanup?: () => void })._resizeCleanup = () => {
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // -----------------------------------------------------------------------
  // THREAD GEOMETRY UPDATE — warp threads based on current BPM
  // -----------------------------------------------------------------------
  const updateThreadGeometry = useCallback((tSec: number) => {
    const cA = conductorARef.current;
    const cB = conductorBRef.current;

    // Each voice has a phase offset driven by its BPM — creates visual drift
    for (let vi = 0; vi < N_VOICES; vi++) {
      const line = threadLinesRef.current[vi];
      if (!line) continue;

      // Voices 0-1 → conductor A, voices 2-4 → conductor B
      const bpm = vi < 2 ? cA.smoothBpm : cB.smoothBpm;
      // Voice-specific sub-ratio
      const subRatios = [1, 1 / Math.SQRT2, 1, 1 / 1.6180339887, 1.6180339887 / 2];
      const effectiveBpm = bpm * subRatios[vi];
      const phase = (tSec * effectiveBpm) / 60;

      const posAttr = line.geometry.attributes.position;
      const arr = posAttr.array as Float32Array;
      const yBase = ((vi - 2) / 2) * THREAD_SPREAD * 0.4;

      for (let s = 0; s <= THREAD_SEGMENTS; s++) {
        const t = s / THREAD_SEGMENTS;
        const z = -THREAD_DEPTH / 2 + t * THREAD_DEPTH;
        // Thread weaves in X-Y based on its phase
        const waveX =
          Math.sin(t * Math.PI * 3 + phase * 1.3 + vi * 0.9) * 0.5 +
          Math.sin(t * Math.PI * 7 + phase * 0.7) * 0.15;
        const waveY =
          yBase + Math.sin(t * Math.PI * 5 + phase * 0.8 + vi * 1.4) * 0.18;
        arr[s * 3] = waveX;
        arr[s * 3 + 1] = waveY;
        arr[s * 3 + 2] = z;
      }
      posAttr.needsUpdate = true;
    }
  }, []);

  // -----------------------------------------------------------------------
  // SPAWN NODE PULSE on beat
  // -----------------------------------------------------------------------
  const spawnNodePulse = useCallback((voiceIdx: number, tSec: number) => {
    const cA = conductorARef.current;
    const cB = conductorBRef.current;
    const bpm = voiceIdx < 2 ? cA.smoothBpm : cB.smoothBpm;
    const subRatios = [1, 1 / Math.SQRT2, 1, 1 / 1.6180339887, 1.6180339887 / 2];
    const effectiveBpm = bpm * subRatios[voiceIdx];
    const phase = (tSec * effectiveBpm) / 60;

    // Pick a point along the thread — near the "now" plane (z ~ 0)
    const z = (Math.random() - 0.5) * 0.8; // near center
    const t = (z + THREAD_DEPTH / 2) / THREAD_DEPTH;
    const yBase = ((voiceIdx - 2) / 2) * THREAD_SPREAD * 0.4;
    const waveX =
      Math.sin(t * Math.PI * 3 + phase * 1.3 + voiceIdx * 0.9) * 0.5 +
      Math.sin(t * Math.PI * 7 + phase * 0.7) * 0.15;
    const waveY =
      yBase + Math.sin(t * Math.PI * 5 + phase * 0.8 + voiceIdx * 1.4) * 0.18;

    const pulse: NodePulse = {
      pos: new THREE.Vector3(waveX, waveY, z),
      birth: tSec,
      voiceIdx,
      decay: 1.8, // seconds to fully decay
    };
    nodePoolRef.current.push(pulse);
    if (nodePoolRef.current.length > MAX_NODES_PER_VOICE * N_VOICES) {
      nodePoolRef.current.shift();
    }
  }, []);

  // -----------------------------------------------------------------------
  // UPDATE NODE MESHES each frame
  // -----------------------------------------------------------------------
  const updateNodeMeshes = useCallback((tSec: number) => {
    const meshes = nodeMeshesRef.current;
    const mats = nodeMaterialsRef.current;
    const pool = nodePoolRef.current;

    // Hide all
    for (let i = 0; i < meshes.length; i++) {
      meshes[i].visible = false;
      mats[i].opacity = 0;
    }

    // Map live pulses onto meshes
    const maxMesh = meshes.length;
    for (let pi = 0; pi < pool.length && pi < maxMesh; pi++) {
      const pulse = pool[pi];
      const age = tSec - pulse.birth;
      if (age > pulse.decay) continue;

      const t = age / pulse.decay;
      // Pulse: rise quickly, fall slowly
      const intensity = t < 0.05
        ? t / 0.05
        : Math.pow(1 - (t - 0.05) / 0.95, 1.5);
      if (intensity < 0.01) continue;

      const mesh = meshes[pi % maxMesh];
      const mat = mats[pi % maxMesh];

      // Pick the mesh matching voice color
      // (pool is append-only so indices wrap; we assign based on pool index)
      mesh.position.copy(pulse.pos);
      const scale = 0.5 + intensity * 2.0;
      mesh.scale.setScalar(scale);
      mat.color.setHex(VOICE_COLORS_THREE[pulse.voiceIdx]);
      mat.opacity = intensity * 0.9;
      mesh.visible = true;
    }
  }, []);

  // -----------------------------------------------------------------------
  // THREE.JS RENDER LOOP
  // -----------------------------------------------------------------------
  const renderLoop = useCallback(() => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const cam = cameraThreeRef.current;
    if (!renderer || !scene || !cam) {
      rafRef.current = requestAnimationFrame(renderLoop);
      return;
    }

    const tSec = getNow();

    // Slow camera orbit
    const orbitT = tSec * 0.07;
    cam.position.x = Math.sin(orbitT) * 1.2;
    cam.position.y = 1.0 + Math.sin(orbitT * 0.5) * 0.4;
    cam.position.z = 7.0 + Math.cos(orbitT * 0.3) * 1.5;
    cam.lookAt(0, 0, 0);

    updateThreadGeometry(tSec);
    updateNodeMeshes(tSec);

    renderer.render(scene, cam);
    rafRef.current = requestAnimationFrame(renderLoop);
  }, [getNow, updateThreadGeometry, updateNodeMeshes]);

  // -----------------------------------------------------------------------
  // MOTION ENERGY EXTRACTION — called per video frame
  // -----------------------------------------------------------------------
  const processVideoFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = offscreenCanvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      motionRafRef.current = requestAnimationFrame(processVideoFrame);
      return;
    }

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      motionRafRef.current = requestAnimationFrame(processVideoFrame);
      return;
    }

    // Measure frame rate
    const nowMs = performance.now();
    if (frameTsRef.current > 0) {
      const dt = (nowMs - frameTsRef.current) / 1000;
      frameRateRef.current = frameRateRef.current * 0.97 + (1 / dt) * 0.03;
    }
    frameTsRef.current = nowMs;

    ctx.drawImage(video, 0, 0, FRAME_W, FRAME_H);
    const imageData = ctx.getImageData(0, 0, FRAME_W, FRAME_H);
    const pixels = imageData.data;

    const halfW = FRAME_W / 2;
    let energyLeft = 0;
    let energyRight = 0;

    if (prevPixelsRef.current) {
      const prev = prevPixelsRef.current;
      for (let y = 0; y < FRAME_H; y++) {
        for (let x = 0; x < FRAME_W; x++) {
          const idx = (y * FRAME_W + x) * 4;
          const luma =
            0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
          const prevLuma =
            0.299 * prev[idx] + 0.587 * prev[idx + 1] + 0.114 * prev[idx + 2];
          const diff = Math.abs(luma - prevLuma);
          if (x < halfW) energyLeft += diff;
          else energyRight += diff;
        }
      }
      // Normalize: max possible diff per pixel = 255, divide by pixel count per half
      const nPixHalf = halfW * FRAME_H;
      energyLeft = energyLeft / (nPixHalf * 255);
      energyRight = energyRight / (nPixHalf * 255);
    }

    // Store copy of current frame
    if (!prevPixelsRef.current || prevPixelsRef.current.length !== pixels.length) {
      prevPixelsRef.current = new Uint8ClampedArray(pixels.length);
    }
    prevPixelsRef.current.set(pixels);

    // Push into conductors' motion buffers
    const cA = conductorARef.current;
    const cB = conductorBRef.current;

    cA.motionBuffer[cA.bufferHead] = energyLeft;
    cA.bufferHead = (cA.bufferHead + 1) % MOTION_BUFFER_LEN;
    if (cA.bufferFilled < MOTION_BUFFER_LEN) cA.bufferFilled++;

    cB.motionBuffer[cB.bufferHead] = energyRight;
    cB.bufferHead = (cB.bufferHead + 1) % MOTION_BUFFER_LEN;
    if (cB.bufferFilled < MOTION_BUFFER_LEN) cB.bufferFilled++;

    // Track last real motion time
    const motionThreshold = 0.003;
    if (energyLeft > motionThreshold || energyRight > motionThreshold) {
      cA.lastMotionMs = nowMs;
      cB.lastMotionMs = nowMs;
    }

    // Decide if camera motion is stale (>4s) → fall back to ghost
    const useGhost = (nowMs - cA.lastMotionMs) > NO_MOTION_TIMEOUT;

    if (!useGhost && cA.bufferFilled > 60) {
      // Extract BPM from motion via autocorrelation
      const estFps = Math.max(10, Math.min(90, frameRateRef.current));

      // Flatten ring buffer into linear array
      const linA = new Float32Array(cA.bufferFilled);
      for (let i = 0; i < cA.bufferFilled; i++) {
        const idx = (cA.bufferHead - cA.bufferFilled + i + MOTION_BUFFER_LEN) % MOTION_BUFFER_LEN;
        linA[i] = cA.motionBuffer[idx];
      }
      const bpmA = computeAutocorrBpm(linA, cA.bufferFilled, estFps);

      const linB = new Float32Array(cB.bufferFilled);
      for (let i = 0; i < cB.bufferFilled; i++) {
        const idx = (cB.bufferHead - cB.bufferFilled + i + MOTION_BUFFER_LEN) % MOTION_BUFFER_LEN;
        linB[i] = cB.motionBuffer[idx];
      }
      const bpmB = computeAutocorrBpm(linB, cB.bufferFilled, estFps);

      // One frame dt for smoothing alpha
      const dtFrameS = 1 / estFps;
      const alpha = dtFrameS / (dtFrameS + BPM_SMOOTH_TAU);

      if (bpmA !== null) {
        cA.smoothBpm = cA.smoothBpm * (1 - alpha) + bpmA * alpha;
        cA.smoothBpm = Math.max(40, Math.min(170, cA.smoothBpm));
      }
      if (bpmB !== null) {
        cB.smoothBpm = cB.smoothBpm * (1 - alpha) + bpmB * alpha;
        cB.smoothBpm = Math.max(40, Math.min(170, cB.smoothBpm));
      }
    } else {
      // Ghost motion: inject synthetic motion-energy samples
      const tSec = nowMs / 1000;
      const ghostA = ghostMotionEnergy(tSec, "left");
      const ghostB = ghostMotionEnergy(tSec, "right");

      cA.smoothBpm = cA.smoothBpm * 0.995 + GHOST_BPM_A * 0.005;
      cB.smoothBpm = cB.smoothBpm * 0.995 + GHOST_BPM_B * 0.005;

      // Also feed ghost into motion buffer so autocorr can find ghost period
      cA.motionBuffer[cA.bufferHead] = ghostA;
      cA.bufferHead = (cA.bufferHead + 1) % MOTION_BUFFER_LEN;
      if (cA.bufferFilled < MOTION_BUFFER_LEN) cA.bufferFilled++;

      cB.motionBuffer[cB.bufferHead] = ghostB;
      cB.bufferHead = (cB.bufferHead + 1) % MOTION_BUFFER_LEN;
      if (cB.bufferFilled < MOTION_BUFFER_LEN) cB.bufferFilled++;
    }

    motionRafRef.current = requestAnimationFrame(processVideoFrame);
  }, []);

  // -----------------------------------------------------------------------
  // GHOST MOTION LOOP — runs before camera permission
  // -----------------------------------------------------------------------
  const ghostLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startGhostMotion = useCallback(() => {
    if (ghostLoopRef.current) return;
    // Feed ghost motion at ~30fps
    ghostLoopRef.current = setInterval(() => {
      const tSec = performance.now() / 1000;
      const cA = conductorARef.current;
      const cB = conductorBRef.current;

      const ghostA = ghostMotionEnergy(tSec, "left");
      const ghostB = ghostMotionEnergy(tSec, "right");

      cA.motionBuffer[cA.bufferHead] = ghostA;
      cA.bufferHead = (cA.bufferHead + 1) % MOTION_BUFFER_LEN;
      if (cA.bufferFilled < MOTION_BUFFER_LEN) cA.bufferFilled++;

      cB.motionBuffer[cB.bufferHead] = ghostB;
      cB.bufferHead = (cB.bufferHead + 1) % MOTION_BUFFER_LEN;
      if (cB.bufferFilled < MOTION_BUFFER_LEN) cB.bufferFilled++;

      cA.smoothBpm = cA.smoothBpm * 0.998 + GHOST_BPM_A * 0.002;
      cB.smoothBpm = cB.smoothBpm * 0.998 + GHOST_BPM_B * 0.002;
    }, 33);
  }, []);

  // -----------------------------------------------------------------------
  // CAMERA INIT
  // -----------------------------------------------------------------------
  const initCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 30 } },
        audio: false,
      });
      cameraStreamRef.current = stream;

      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play().catch(() => {/* ignore */});

      // Stop ghost loop, start real motion processing
      if (ghostLoopRef.current) {
        clearInterval(ghostLoopRef.current);
        ghostLoopRef.current = null;
      }

      setCameraGranted(true);
      setCameraError(null);

      // Reset motion tracking
      conductorARef.current.lastMotionMs = performance.now();
      conductorBRef.current.lastMotionMs = performance.now();

      motionRafRef.current = requestAnimationFrame(processVideoFrame);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setCameraError(msg);
      // Keep ghost motion running
    }
  }, [processVideoFrame]);

  // -----------------------------------------------------------------------
  // AUDIO SCHEDULER
  // -----------------------------------------------------------------------
  const runAudioScheduler = useCallback(() => {
    const ac = acRef.current;
    const master = masterGainRef.current;
    if (!ac || !master) return;

    const now = ac.currentTime;
    const cA = conductorARef.current;
    const cB = conductorBRef.current;
    const subRatios = [1, 1 / Math.SQRT2, 1, 1 / 1.6180339887, 1.6180339887 / 2];

    for (let vi = 0; vi < N_VOICES; vi++) {
      const voice = voiceEnginesRef.current[vi];
      if (!voice) continue;

      const baseBpm = vi < 2 ? cA.smoothBpm : cB.smoothBpm;
      const bpm = baseBpm * subRatios[vi];
      const beatPeriodS = 60 / bpm;
      voice.beatPeriodS = beatPeriodS;

      while (voice.nextBeatTime < now + LOOKAHEAD_S) {
        const freq = PENTATONIC_NOTES[CELL_INDICES[voice.cellPos]];
        scheduleNote(ac, master, freq, voice.nextBeatTime);

        // Spawn visual node at scheduled time
        const beatTimeCopy = voice.nextBeatTime;
        const viCopy = vi;
        const beatAheadMs = (voice.nextBeatTime - now) * 1000;
        setTimeout(() => {
          if (audioLiveRef.current && acRef.current) {
            spawnNodePulse(viCopy, acRef.current.currentTime - 0.01);
          } else {
            spawnNodePulse(viCopy, beatTimeCopy);
          }
        }, Math.max(0, beatAheadMs));

        voice.cellPos = (voice.cellPos + 1) % CELL_LEN;
        voice.nextBeatTime += beatPeriodS;
        voice.beatCount++;
      }
    }
  }, [spawnNodePulse]);

  // -----------------------------------------------------------------------
  // START HANDLER
  // -----------------------------------------------------------------------
  const handleStart = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    setStarted(true);

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ac = new AudioCtx();

      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.knee.value = 4;
      comp.ratio.value = 20;
      comp.attack.value = 0.003;
      comp.release.value = 0.15;
      comp.connect(ac.destination);

      const master = ac.createGain();
      master.gain.value = 0.45;
      master.connect(comp);

      acRef.current = ac;
      masterGainRef.current = master;

      const nowAc = ac.currentTime;
      const subRatios = [1, 1 / Math.SQRT2, 1, 1 / 1.6180339887, 1.6180339887 / 2];
      voiceEnginesRef.current = Array.from({ length: N_VOICES }, (_, vi) => {
        const bpm =
          vi < 2
            ? conductorARef.current.smoothBpm
            : conductorBRef.current.smoothBpm;
        const beatPeriodS = (60 / bpm) * (1 / subRatios[vi]);
        return {
          cellPos: vi % CELL_LEN,
          nextBeatTime: nowAc + vi * 0.08,
          beatPeriodS,
          beatCount: 0,
        };
      });

      audioLiveRef.current = true;
      runAudioScheduler();
      schedulerRef.current = setInterval(runAudioScheduler, SCHEDULE_INTERVAL_MS);
    } catch (err) {
      console.error("AudioContext error:", err);
    }

    // Attempt camera after audio started
    initCamera();
  }, [runAudioScheduler, initCamera]);

  // -----------------------------------------------------------------------
  // VISUAL NODE SPAWN LOOP (pre-audio, uses performance.now())
  // -----------------------------------------------------------------------
  const visualSchedulerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runVisualScheduler = useCallback(() => {
    if (audioLiveRef.current) return; // audio took over
    const tSec = performance.now() / 1000;
    const cA = conductorARef.current;
    const cB = conductorBRef.current;
    const subRatios = [1, 1 / Math.SQRT2, 1, 1 / 1.6180339887, 1.6180339887 / 2];

    for (let vi = 0; vi < N_VOICES; vi++) {
      const voice = voiceEnginesRef.current[vi];
      if (!voice) continue;

      const baseBpm = vi < 2 ? cA.smoothBpm : cB.smoothBpm;
      const bpm = baseBpm * subRatios[vi];
      const beatPeriodS = 60 / bpm;
      voice.beatPeriodS = beatPeriodS;

      while (voice.nextBeatTime < tSec + LOOKAHEAD_S) {
        spawnNodePulse(vi, voice.nextBeatTime);
        voice.cellPos = (voice.cellPos + 1) % CELL_LEN;
        voice.nextBeatTime += beatPeriodS;
        voice.beatCount++;
      }
    }
  }, [spawnNodePulse]);

  // -----------------------------------------------------------------------
  // DISPLAY READOUT POLL
  // -----------------------------------------------------------------------
  const pollDisplay = useCallback(() => {
    const cA = conductorARef.current;
    const cB = conductorBRef.current;
    const a = cA.smoothBpm;
    const b = cB.smoothBpm;
    setBpmA(a);
    setBpmB(b);
    const r = b > 0 && a > 0 ? (b / a).toFixed(4) : "—";
    setRatio(r);
  }, []);

  // -----------------------------------------------------------------------
  // MOUNT / UNMOUNT
  // -----------------------------------------------------------------------
  useEffect(() => {
    // Init three.js
    initThree();

    // Init visual-only voice engines
    const subRatios = [1, 1 / Math.SQRT2, 1, 1 / 1.6180339887, 1.6180339887 / 2];
    const t0 = performance.now() / 1000;
    voiceEnginesRef.current = Array.from({ length: N_VOICES }, (_, vi) => {
      const bpm =
        vi < 2 ? conductorARef.current.smoothBpm : conductorBRef.current.smoothBpm;
      const beatPeriodS = 60 / (bpm * subRatios[vi]);
      return {
        cellPos: vi % CELL_LEN,
        nextBeatTime: t0 + vi * 0.1,
        beatPeriodS,
        beatCount: 0,
      };
    });

    // Create offscreen canvas for motion sampling
    const canvas = document.createElement("canvas");
    canvas.width = FRAME_W;
    canvas.height = FRAME_H;
    offscreenCanvasRef.current = canvas;

    // Start ghost motion feed
    startGhostMotion();

    // Start visual pre-audio scheduler
    visualSchedulerRef.current = setInterval(runVisualScheduler, SCHEDULE_INTERVAL_MS);

    // Display readout poll
    displayIntervalRef.current = setInterval(pollDisplay, 250);

    // Start render loop
    rafRef.current = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      cancelAnimationFrame(motionRafRef.current);
      if (schedulerRef.current) clearInterval(schedulerRef.current);
      if (ghostLoopRef.current) clearInterval(ghostLoopRef.current);
      if (visualSchedulerRef.current) clearInterval(visualSchedulerRef.current);
      if (displayIntervalRef.current) clearInterval(displayIntervalRef.current);

      // Stop camera
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => t.stop());
        cameraStreamRef.current = null;
      }

      // Close audio
      acRef.current?.close();

      // Dispose three.js
      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      if (scene) {
        threadLinesRef.current.forEach((line) => {
          line.geometry.dispose();
          (line.material as THREE.Material).dispose();
        });
        nodeMeshesRef.current.forEach((mesh) => {
          (mesh.material as THREE.Material).dispose();
        });
        // Shared sphere geometry — dispose once
        if (nodeMeshesRef.current.length > 0) {
          nodeMeshesRef.current[0].geometry.dispose();
        }
        scene.clear();
      }
      if (renderer) {
        const r = renderer as THREE.WebGLRenderer & { _resizeCleanup?: () => void };
        r._resizeCleanup?.();
        renderer.dispose();
        renderer.domElement.remove();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -----------------------------------------------------------------------
  // RENDER
  // -----------------------------------------------------------------------

  const ratioNum = parseFloat(ratio);
  const ratioDisplay = isNaN(ratioNum) ? ratio : ratioNum.toFixed(4) + "…";

  return (
    <div className="relative flex flex-col min-h-full bg-[#020208] text-foreground overflow-hidden">
      {/* Hidden video element for camera feed */}
      <video
        ref={videoRef}
        className="hidden"
        muted
        playsInline
        aria-hidden="true"
      />

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="relative z-10 px-6 pt-8 pb-3 pointer-events-none">
        <h1 className="text-2xl font-mono font-semibold tracking-tight text-foreground">
          Motion Loom
        </h1>
        <p className="text-base text-muted-foreground mt-1.5 max-w-xl leading-relaxed">
          The room conducts a Nancarrow polytempo canon. Left and right motion
          each carry their own tempo — extracted from camera frame-differences,
          no ML — and because two real motions never lock to a clean ratio, the
          canon drifts forever.
        </p>
      </div>

      {/* ── three.js canvas mount ──────────────────────────────── */}
      <div
        ref={mountRef}
        className="relative w-full"
        style={{ height: "420px" }}
        aria-label="Three.js polytempo loom — five woven threads in 3D"
      />

      {webglError && (
        <div className="px-6 py-3">
          <p className="text-violet-300 text-base font-mono border border-violet-400/30 rounded px-4 py-3 bg-violet-950/30">
            {webglError}
          </p>
        </div>
      )}

      {/* ── Overlay readouts ─────────────────────────────────── */}
      <div className="relative z-10 px-6 py-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* Conductor A */}
        <div className="border border-violet-400/20 rounded-lg px-4 py-3 bg-[#0a0a18]/80">
          <div className="text-muted-foreground text-xs font-mono uppercase tracking-widest mb-1">
            Left motion → Conductor A
          </div>
          <div className="text-violet-300 text-xl font-mono font-semibold">
            {bpmA.toFixed(1)} BPM
          </div>
          <div className="text-muted-foreground text-xs font-mono mt-1">
            voices 0, 1 (×1, ×1/√2)
          </div>
        </div>

        {/* Conductor B */}
        <div className="border border-violet-400/20 rounded-lg px-4 py-3 bg-[#0a0a18]/80">
          <div className="text-muted-foreground text-xs font-mono uppercase tracking-widest mb-1">
            Right motion → Conductor B
          </div>
          <div className="text-violet-300 text-xl font-mono font-semibold">
            {bpmB.toFixed(1)} BPM
          </div>
          <div className="text-muted-foreground text-xs font-mono mt-1">
            voices 2, 3, 4 (×1, ×1/φ, ×φ/2)
          </div>
        </div>

        {/* Ratio */}
        <div className="border border-violet-400/20 rounded-lg px-4 py-3 bg-[#0a0a18]/80">
          <div className="text-muted-foreground text-xs font-mono uppercase tracking-widest mb-1">
            Live ratio B/A
          </div>
          <div className="text-violet-300 text-xl font-mono font-semibold">
            {ratioDisplay}
          </div>
          <div className="text-muted-foreground text-xs font-mono mt-1">
            never rational — the drift is permanent
          </div>
        </div>
      </div>

      {/* ── Controls ─────────────────────────────────────────── */}
      <div className="relative z-10 px-6 pb-6 flex flex-col gap-4">
        {/* Status / Start */}
        {!started ? (
          <div className="flex flex-col items-start gap-2">
            <button
              onClick={handleStart}
              className="min-h-[44px] px-6 py-2.5 rounded-full bg-violet-500/20 border border-violet-400/40 text-violet-300 text-base font-mono hover:bg-violet-500/30 transition-colors"
            >
              Start
            </button>
            <p className="text-muted-foreground text-sm font-mono">
              Audio + camera require a gesture. The loom weaves visually until you start.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse shrink-0" />
            <span className="text-violet-300 font-mono text-sm">
              running — {cameraGranted ? "camera conducting" : "ghost motion conducting"}
            </span>
            {!cameraGranted && !cameraError && (
              <button
                onClick={initCamera}
                className="min-h-[44px] px-4 py-2.5 rounded-full border border-border text-muted-foreground text-sm font-mono hover:border-border transition-colors"
              >
                Grant camera
              </button>
            )}
          </div>
        )}

        {/* Camera status */}
        {cameraGranted && (
          <p className="text-muted-foreground text-sm font-mono">
            Camera active — left/right frame-difference energy → tempo autocorrelation → BPM
          </p>
        )}
        {cameraError && (
          <p className="text-violet-300 text-sm font-mono border border-violet-400/30 rounded px-3 py-2 bg-violet-950/30">
            Camera unavailable — ghost motion playing: {cameraError}
          </p>
        )}
      </div>

      {/* ── Voice legend ──────────────────────────────────────── */}
      <div className="relative z-10 px-6 pb-8">
        <div className="grid grid-cols-5 gap-1.5">
          {VOICE_COLORS_HEX.map((col, i) => {
            const subRatios = ["1", "1/√2", "1", "1/φ", "φ/2"];
            const conductors = ["A", "A", "B", "B", "B"];
            return (
              <div
                key={i}
                className="flex flex-col items-center gap-0.5 rounded px-1.5 py-2 border"
                style={{ borderColor: col + "2a" }}
              >
                <span
                  className="text-sm font-mono font-semibold leading-none"
                  style={{ color: col }}
                >
                  V{i}
                </span>
                <span className="text-muted-foreground text-xs font-mono leading-none mt-0.5">
                  ×{subRatios[i]}
                </span>
                <span className="text-muted-foreground text-[10px] font-mono leading-none">
                  {conductors[i]}
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-muted-foreground text-xs font-mono mt-3 max-w-xl">
          Thread weave drift = tempo drift. The two conducted groups never lock to a
          rational ratio because real motion is never metronomic. The drift is structural.
        </p>
      </div>
    </div>
  );
}
