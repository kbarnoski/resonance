"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 14480-bodychoir — "What if your WHOLE BODY conducted your whole catalog —
// raise and spread your arms to swell and open each half of your recordings,
// lean to tilt the spectrum — and then RECORD a conducting pass so a translucent
// 'ghost body' keeps performing it while you layer another movement on top?"
//
//   THE SCENE — a near-black 3D space (three.js). Karel's 16 real recordings are
//   two facing wings of flowing particle streams: the LOWER half of the catalog
//   is the left/low wing, the UPPER half the right/high wing. Each stream carries
//   a DISTINCT hue evenly spaced around the FULL colour wheel (hue = i/16 · 360),
//   so the ensemble reads as a whole chromatic spectrum, not a warm or cool tint.
//   A stream's turbulence tracks that recording's own live analyser energy.
//
//   THE INSTRUMENT — your body, tracked by webcam (MediaPipe Pose, 33 landmarks):
//     · LEFT-arm elevation  → swell (gain) of the LOWER half of the catalog.
//     · RIGHT-arm elevation → swell of the UPPER half.
//     · two-arm SPREAD       → ensemble width + openness (the lowpass opens).
//     · torso LEAN           → spectral tilt (darker/bassy ↔ brighter) across the
//                              ladder. The streams bend toward the raised arm so
//                              the picture reads as "you are conducting light."
//
//   GHOST BODY — "Record conducting" captures ~10s of your control values into a
//   loop. While it loops a translucent, dim wireframe body replays that movement
//   and ITS contribution SUMS with your live body — so you build an ensemble of
//   your own conducting passes (up to two ghost layers, each clearable).
//
//   AUDIO — Karel's REAL catalog ONLY (13 Welcome Home + 3 Snowflake), zero synth.
//   Per track: BufferSource(loop) → gain → StereoPanner → lowpass → shared
//   ear-safety master (createSafeMaster). All 16 loop at once, loaded lazily.
//
//   GRACEFUL DEGRADATION — no camera / MediaPipe failure runs an autonomous
//   drifting "ghost conductor" that keeps the mix moving so the piece is alive.
//
//   REFERENCES — Theremin "Ghost Hands" MR add-on (Meta Quest, 2026-07-01);
//   Gesture Synth webcam instrument (2026-08-04); the orchestral conductor;
//   Imogen Heap's mi.mu gloves; "Beyond Faders: Understanding 6DoF Gesture
//   Ecologies in Music Mixing" (arXiv:2602.23090).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { PrototypeNav } from "../_shared/prototype-nav";
import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import {
  BONES,
  LM,
  createLandmarker,
  demoConductor,
  frameFromLandmarks,
  type BodyFrame,
  type ConductControls,
  type PoseLandmarkerInst,
  type Vec,
} from "./poseLoader";

const TRACKS = REAL_TRACKS;
const N = TRACKS.length; // 16
const HALF = N / 2; // 8 lower · 8 upper

// ── audio dynamics ───────────────────────────────────────────────────────────
const CUT_MIN = 320; // Hz, lowpass when the ensemble is closed
const CUT_MAX = 14000; // Hz, lowpass wide open
const TRACK_GAIN = 0.9;
const TILT_AMOUNT = 0.85; // how hard lean re-weights the ladder
const MAX_GHOSTS = 2;
const RECORD_MS = 10000; // ~10s conducting pass
const SAMPLE_MS = 33; // ghost snapshot cadence (~30 fps)

// ── skeleton joints drawn (subset of the 33 landmarks) ───────────────────────
const JOINTS = [
  LM.nose,
  LM.leftShoulder,
  LM.rightShoulder,
  LM.leftElbow,
  LM.rightElbow,
  LM.leftWrist,
  LM.rightWrist,
  LM.leftHip,
  LM.rightHip,
];

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

// One flowing recording-stream: a column of particles rising through the wing.
interface Stream {
  track: (typeof TRACKS)[number];
  isLower: boolean;
  baseX: number;
  baseY: number;
  hue: number; // 0..1 around the full wheel
  points: THREE.Points;
  geom: THREE.BufferGeometry;
  mat: THREE.PointsMaterial;
  positions: Float32Array;
  seed: Float32Array; // per-particle phase seeds
  // audio
  src: AudioBufferSourceNode | null;
  gain: GainNode | null;
  panner: StereoPannerNode | null;
  lowpass: BiquadFilterNode | null;
  analyser: AnalyserNode | null;
  data: Uint8Array<ArrayBuffer> | null;
  loaded: boolean;
  amp: number; // smoothed per-track energy (turbulence)
}

// A recorded conducting pass replaying as a translucent ghost body.
interface Ghost {
  id: number;
  frames: BodyFrame[];
  startMs: number;
  lines: THREE.LineSegments;
  lineGeom: THREE.BufferGeometry;
  lineMat: THREE.LineBasicMaterial;
  linePos: Float32Array;
}

const PARTICLES = 90; // per stream

// Map a normalised body point [-1,1] into scene space (skeleton stands front-centre).
function toScene(p: Vec, out: THREE.Vector3): THREE.Vector3 {
  out.set(p.x * 3.4, p.y * 3.4 + 0.3, 5.2);
  return out;
}

export default function BodyChoirPage() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // audio graph
  const ctxRef = useRef<AudioContext | null>(null);
  const safeRef = useRef<SafeMaster | null>(null);
  const enteredRef = useRef(false);

  // scene + pose state shared with the render loop
  const streamsRef = useRef<Stream[]>([]);
  const rafRef = useRef(0);
  const landmarkerRef = useRef<PoseLandmarkerInst | null>(null);
  const streamMediaRef = useRef<MediaStream | null>(null);
  const liveFrameRef = useRef<BodyFrame | null>(null); // latest detected body
  const cameraLiveRef = useRef(false);
  const ghostsRef = useRef<Ghost[]>([]);
  const ghostSeqRef = useRef(0);
  const sceneRef = useRef<THREE.Scene | null>(null);

  // recording state (refs for the loop, mirror into React for the UI)
  const recordingRef = useRef(false);
  const recStartRef = useRef(0);
  const recBufRef = useRef<BodyFrame[]>([]);
  const lastSampleRef = useRef(0);

  // UI state
  const [started, setStarted] = useState(false);
  const [audioOn, setAudioOn] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [camState, setCamState] = useState<"off" | "live" | "demo">("off");
  const [recording, setRecording] = useState(false);
  const [ghostCount, setGhostCount] = useState(0);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [glError, setGlError] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // ── camera + MediaPipe (best-effort; failure → autonomous demo) ─────────────
  const runDetectLoop = useCallback(() => {
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !landmarker) return;
    const tick = () => {
      if (!cameraLiveRef.current) return;
      const lmk = landmarkerRef.current;
      const vid = videoRef.current;
      if (lmk && vid && vid.readyState >= 2) {
        try {
          const res = lmk.detectForVideo(vid, performance.now());
          if (res.landmarks.length > 0) {
            liveFrameRef.current = frameFromLandmarks(res.landmarks[0]);
          }
        } catch {
          /* transient detector hiccup — keep the last frame */
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, []);

  const startCamera = useCallback(async () => {
    if (cameraLiveRef.current) return;
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function"
    ) {
      setCamState("demo");
      setNotice(
        "No camera API here — an autonomous ghost conductor is performing the mix.",
      );
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: true });
      streamMediaRef.current = media;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = media;
      video.muted = true;
      video.playsInline = true;
      await video.play();

      landmarkerRef.current = await createLandmarker();
      cameraLiveRef.current = true;
      setCamState("live");
      setNotice(null);
      runDetectLoop();
    } catch {
      cameraLiveRef.current = false;
      const media = streamMediaRef.current;
      if (media) {
        for (const t of media.getTracks()) t.stop();
        streamMediaRef.current = null;
      }
      setCamState("demo");
      setNotice(
        "Camera or body-tracking unavailable — an autonomous ghost conductor is performing the mix.",
      );
    }
  }, [runDetectLoop]);

  // ── begin: unlock audio, load catalog, try the camera ───────────────────────
  const begin = useCallback(async () => {
    if (enteredRef.current) return;

    let ctx = ctxRef.current;
    if (!ctx) {
      try {
        const Ctor: typeof AudioContext =
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!Ctor) {
          setAudioError("Web Audio is unavailable — visuals only.");
          setStarted(true);
          return;
        }
        ctx = new Ctor();
        ctxRef.current = ctx;
      } catch {
        setAudioError("Audio failed to start — visuals continue silently.");
        setStarted(true);
        return;
      }
    }
    try {
      if (ctx.state === "suspended") await ctx.resume();
    } catch {
      /* the click gesture should have covered this */
    }

    let safe = safeRef.current;
    if (!safe) {
      safe = createSafeMaster(ctx);
      safeRef.current = safe;
    }

    enteredRef.current = true;
    setStarted(true);
    setAudioOn(true);

    // start the camera in parallel — the mix must not wait on it
    void startCamera();

    // ── progressive load: all 16 loop simultaneously, first sound ~1–2s in ────
    const streams = streamsRef.current;
    let anyOk = false;
    let anyFail = false;
    for (let i = 0; i < streams.length; i++) {
      if (!ctxRef.current || ctxRef.current.state === "closed") break;
      if (!enteredRef.current) break;
      const stream = streams[i];
      try {
        const { buffer } = await loadRealTrackBuffer(ctx, stream.track.id);
        if (!enteredRef.current || !ctxRef.current) break;

        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;

        const gain = ctx.createGain();
        gain.gain.value = 0.0001;
        const panner = ctx.createStereoPanner();
        panner.pan.value = stream.isLower ? -0.4 : 0.4;
        const lowpass = ctx.createBiquadFilter();
        lowpass.type = "lowpass";
        lowpass.frequency.value = CUT_MIN;
        lowpass.Q.value = 0.5;

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.85;

        // source → gain → panner → lowpass → safe master ; passive analyser tap
        src.connect(gain);
        gain.connect(panner);
        panner.connect(lowpass);
        lowpass.connect(safe.input);
        src.connect(analyser);

        // stagger loop offsets so 16 piano loops don't phase-lock
        src.start(ctx.currentTime, (i * 3.7) % Math.max(1, buffer.duration));

        stream.src = src;
        stream.gain = gain;
        stream.panner = panner;
        stream.lowpass = lowpass;
        stream.analyser = analyser;
        stream.data = new Uint8Array(analyser.frequencyBinCount);
        stream.loaded = true;
        anyOk = true;
        setLoadedCount((c) => c + 1);
      } catch {
        anyFail = true;
      }
    }

    if (!anyOk) {
      setAudioError(
        "None of the recordings could load right now. Check your connection and press Begin again.",
      );
    } else if (anyFail) {
      setNotice(
        (n) =>
          n ??
          "Some recordings couldn't load and were skipped — the rest are singing.",
      );
    }
  }, [startCamera]);

  // ── teardown the audio graph ────────────────────────────────────────────────
  const stopAudio = useCallback(() => {
    enteredRef.current = false;
    for (const s of streamsRef.current) {
      try {
        s.src?.stop();
      } catch {
        /* already stopped */
      }
      s.src = null;
      s.gain = null;
      s.panner = null;
      s.lowpass = null;
      s.analyser = null;
      s.data = null;
      s.loaded = false;
      s.amp = 0;
    }
    try {
      safeRef.current?.disconnect();
    } catch {
      /* closing */
    }
    const ctx = ctxRef.current;
    safeRef.current = null;
    ctxRef.current = null;
    if (ctx) void ctx.close();
    setAudioOn(false);
    setLoadedCount(0);
  }, []);

  // ── recording controls ──────────────────────────────────────────────────────
  const startRecording = useCallback(() => {
    if (recordingRef.current) return;
    if (ghostsRef.current.length >= MAX_GHOSTS) {
      setNotice(
        "Two ghost layers already performing — clear one to record another.",
      );
      return;
    }
    recBufRef.current = [];
    recStartRef.current = performance.now();
    lastSampleRef.current = 0;
    recordingRef.current = true;
    setRecording(true);
    setNotice(null);
  }, []);

  const finishRecording = useCallback(() => {
    recordingRef.current = false;
    setRecording(false);
    const frames = recBufRef.current;
    recBufRef.current = [];
    const scene = sceneRef.current;
    if (!scene || frames.length < 4) return;
    if (ghostsRef.current.length >= MAX_GHOSTS) return;

    // build the ghost's dim wireframe body
    const segCount = BONES.length;
    const linePos = new Float32Array(segCount * 2 * 3);
    const lineGeom = new THREE.BufferGeometry();
    lineGeom.setAttribute("position", new THREE.BufferAttribute(linePos, 3));
    const lineMat = new THREE.LineBasicMaterial({
      color: new THREE.Color().setHSL(0.0, 0.0, 0.85),
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const lines = new THREE.LineSegments(lineGeom, lineMat);
    scene.add(lines);

    const id = ++ghostSeqRef.current;
    ghostsRef.current = [
      ...ghostsRef.current,
      {
        id,
        frames,
        startMs: performance.now(),
        lines,
        lineGeom,
        lineMat,
        linePos,
      },
    ];
    setGhostCount(ghostsRef.current.length);
  }, []);

  const clearGhosts = useCallback(() => {
    const scene = sceneRef.current;
    for (const g of ghostsRef.current) {
      scene?.remove(g.lines);
      g.lineGeom.dispose();
      g.lineMat.dispose();
    }
    ghostsRef.current = [];
    setGhostCount(0);
  }, []);

  // ── build + run the three.js world ──────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setGlError(true);
      return;
    }

    const reduced = prefersReducedMotion();
    let w = mount.clientWidth || window.innerWidth;
    let h = mount.clientHeight || window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(0x05060a, 1); // near-black
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05060a, 0.028);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 200);
    camera.position.set(0, 0.6, 14);
    camera.lookAt(0, 0.4, 0);

    // ── the 16 recording streams — two facing wings, full chromatic spectrum ──
    const streams: Stream[] = [];
    for (let i = 0; i < N; i++) {
      const isLower = i < HALF;
      const k = isLower ? i : i - HALF; // 0..7 within the wing
      // lower wing → left & low; upper wing → right & high (a diagonal ladder)
      const dir = isLower ? -1 : 1;
      const baseX = dir * (1.4 + k * 1.15);
      const baseY = (isLower ? -1.3 : 1.3) + (k - 3.5) * 0.16;
      const hue = i / N; // full colour wheel

      const positions = new Float32Array(PARTICLES * 3);
      const seed = new Float32Array(PARTICLES);
      for (let p = 0; p < PARTICLES; p++) {
        seed[p] = Math.random();
        positions[p * 3] = baseX;
        positions[p * 3 + 1] = baseY - 2 + seed[p] * 5;
        positions[p * 3 + 2] = -2 - Math.random() * 2;
      }
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.PointsMaterial({
        color: new THREE.Color().setHSL(hue, 0.85, 0.55),
        size: 0.16,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      });
      const points = new THREE.Points(geom, mat);
      scene.add(points);

      streams.push({
        track: TRACKS[i],
        isLower,
        baseX,
        baseY,
        hue,
        points,
        geom,
        mat,
        positions,
        seed,
        src: null,
        gain: null,
        panner: null,
        lowpass: null,
        analyser: null,
        data: null,
        loaded: false,
        amp: 0,
      });
    }
    streamsRef.current = streams;

    // ── the live conductor skeleton (bright) ──────────────────────────────────
    const liveSegPos = new Float32Array(BONES.length * 2 * 3);
    const liveGeom = new THREE.BufferGeometry();
    liveGeom.setAttribute("position", new THREE.BufferAttribute(liveSegPos, 3));
    const liveMat = new THREE.LineBasicMaterial({
      color: new THREE.Color().setHSL(0.0, 0.0, 1.0),
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const liveLines = new THREE.LineSegments(liveGeom, liveMat);
    scene.add(liveLines);

    // scratch
    const va = new THREE.Vector3();
    const vb = new THREE.Vector3();
    const tmpCol = new THREE.Color();

    // write a BodyFrame's skeleton into a line-segment position buffer
    const drawSkeleton = (frame: BodyFrame, pos: Float32Array) => {
      let o = 0;
      for (const [a, b] of BONES) {
        const pa = frame.pts[a];
        const pb = frame.pts[b];
        if (pa) toScene(pa, va);
        else va.set(0, 0, 5.2);
        if (pb) toScene(pb, vb);
        else vb.set(0, 0, 5.2);
        pos[o++] = va.x;
        pos[o++] = va.y;
        pos[o++] = va.z;
        pos[o++] = vb.x;
        pos[o++] = vb.y;
        pos[o++] = vb.z;
      }
    };

    // sample a ghost's controls + skeleton at the current loop phase
    const sampleGhost = (g: Ghost, nowMs: number): ConductControls => {
      const n = g.frames.length;
      const span = n * SAMPLE_MS;
      const phase = span > 0 ? ((nowMs - g.startMs) % span) / SAMPLE_MS : 0;
      const idx = clamp(Math.floor(phase), 0, n - 1);
      const frame = g.frames[idx];
      drawSkeleton(frame, g.linePos);
      g.lineGeom.attributes.position.needsUpdate = true;
      return frame.ctrl;
    };

    let prev = performance.now();
    let demoT = 0;

    const frame = (ts: number) => {
      const dt = Math.min(0.05, Math.max(0, (ts - prev) / 1000));
      prev = ts;
      if (!reduced) demoT += dt;

      // ── choose the live control source ──────────────────────────────────────
      let live: BodyFrame;
      if (cameraLiveRef.current && liveFrameRef.current) {
        live = liveFrameRef.current;
        liveMat.opacity = 0.9;
      } else {
        // autonomous ghost conductor drives the mix when no body is tracked
        live = demoConductor(demoT);
        liveMat.opacity = 0.5;
      }
      drawSkeleton(live, liveSegPos);
      liveGeom.attributes.position.needsUpdate = true;

      // record the live control values into the pending ghost loop
      if (recordingRef.current) {
        if (ts - lastSampleRef.current >= SAMPLE_MS) {
          lastSampleRef.current = ts;
          // deep-ish copy so mutation of the shared live frame can't corrupt it
          const ptsCopy: Record<number, Vec> = {};
          for (const j of JOINTS) {
            const p = live.pts[j];
            if (p) ptsCopy[j] = { x: p.x, y: p.y, z: p.z, v: p.v };
          }
          recBufRef.current.push({ pts: ptsCopy, ctrl: { ...live.ctrl } });
        }
        if (ts - recStartRef.current >= RECORD_MS) finishRecording();
      }

      // ── aggregate live + ghost controls into the summed ensemble ────────────
      let sumLeft = live.ctrl.leftElev;
      let sumRight = live.ctrl.rightElev;
      let spreadAcc = live.ctrl.spread;
      let leanAcc = live.ctrl.lean;
      let contributors = 1;
      for (const g of ghostsRef.current) {
        const c = sampleGhost(g, ts);
        sumLeft += c.leftElev;
        sumRight += c.rightElev;
        spreadAcc += c.spread;
        leanAcc += c.lean;
        contributors++;
      }
      // ensemble swell builds toward a safe ceiling as passes stack
      const lowerSwell = 1 - Math.exp(-sumLeft);
      const upperSwell = 1 - Math.exp(-sumRight);
      const openness = clamp(spreadAcc / contributors, 0, 1);
      const lean = clamp(leanAcc / contributors, -1, 1);
      const cutoff = CUT_MIN * Math.pow(CUT_MAX / CUT_MIN, openness);

      // ── drive the audio + the streams ───────────────────────────────────────
      const ctx = ctxRef.current;
      for (let i = 0; i < streams.length; i++) {
        const s = streams[i];
        const ladder = i / (N - 1); // 0 (low) .. 1 (high)
        const swell = s.isLower ? lowerSwell : upperSwell;
        // spectral tilt: lean re-weights the ladder (right → boost highs)
        const tilt = clamp(1 + lean * (ladder - 0.5) * 2 * TILT_AMOUNT, 0, 1.6);

        // per-track turbulence from its own analyser
        if (s.analyser && s.data) {
          s.analyser.getByteTimeDomainData(s.data);
          let acc = 0;
          for (let j = 0; j < s.data.length; j++) {
            const v = (s.data[j] - 128) / 128;
            acc += v * v;
          }
          const rms = Math.sqrt(acc / s.data.length);
          s.amp += (rms - s.amp) * 0.2;
        }

        const level = clamp(swell * tilt, 0, 1);
        if (ctx && s.gain && s.panner && s.lowpass) {
          const t = ctx.currentTime;
          s.gain.gain.setTargetAtTime(level * TRACK_GAIN, t, 0.08);
          // width: spread pushes the wings apart in the stereo field
          const pan = (s.isLower ? -1 : 1) * (0.2 + openness * 0.7);
          s.panner.pan.setTargetAtTime(clamp(pan, -1, 1), t, 0.1);
          s.lowpass.frequency.setTargetAtTime(cutoff, t, 0.1);
        }

        // ── visuals: flow the particles, bend toward the raised arm ───────────
        // streams bend toward whichever arm is higher on their wing
        const raise = s.isLower ? lowerSwell : upperSwell;
        const bend = (s.isLower ? -1 : 1) * raise * 1.6;
        const turb = 0.15 + s.amp * 2.2 + raise * 0.4;
        const pos = s.positions;
        for (let p = 0; p < PARTICLES; p++) {
          const ph = s.seed[p];
          // rise and recycle
          let y = pos[p * 3 + 1] + dt * (0.4 + raise * 1.2 + s.amp * 2.0);
          const top = s.baseY + 2.6 + raise * 1.4;
          const bot = s.baseY - 2.2;
          if (y > top) y = bot;
          pos[p * 3 + 1] = y;
          const climb = (y - bot) / (top - bot); // 0..1 up the column
          const wob = Math.sin(ts * 0.001 * (1 + ph * 2) + ph * 6.28) * turb;
          pos[p * 3] = s.baseX + wob + bend * climb;
          pos[p * 3 + 2] = -2 - ph * 2 + Math.cos(ts * 0.0007 + ph * 6.28) * turb;
        }
        s.geom.attributes.position.needsUpdate = true;

        // colour: hold the distinct hue, brighten with swell + energy
        const lit = clamp(0.32 + swell * 0.4 + s.amp * 0.8, 0.12, 0.9);
        tmpCol.setHSL(s.hue, 0.85, lit);
        s.mat.color.copy(tmpCol);
        s.mat.opacity = clamp(0.28 + swell * 0.55 + s.amp * 0.6, 0.15, 1);
        s.mat.size = 0.13 + swell * 0.12 + s.amp * 0.3;
      }

      // ghost bodies flicker faintly with the ensemble
      for (const g of ghostsRef.current) {
        g.lineMat.opacity = 0.22 + (lowerSwell + upperSwell) * 0.06;
      }

      renderer.render(scene, camera);
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    // ── resize ────────────────────────────────────────────────────────────────
    const onResize = () => {
      w = mount.clientWidth || window.innerWidth;
      h = mount.clientHeight || window.innerHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    // ── teardown ────────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);

      for (const s of streams) {
        s.geom.dispose();
        s.mat.dispose();
      }
      for (const g of ghostsRef.current) {
        scene.remove(g.lines);
        g.lineGeom.dispose();
        g.lineMat.dispose();
      }
      ghostsRef.current = [];
      liveGeom.dispose();
      liveMat.dispose();
      renderer.dispose();
      sceneRef.current = null;
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [finishRecording]);

  // ── full teardown on unmount (audio + camera + detector) ────────────────────
  useEffect(() => {
    return () => {
      enteredRef.current = false;
      cameraLiveRef.current = false;
      for (const s of streamsRef.current) {
        try {
          s.src?.stop();
        } catch {
          /* already stopped */
        }
      }
      try {
        safeRef.current?.disconnect();
      } catch {
        /* closing */
      }
      const ctx = ctxRef.current;
      safeRef.current = null;
      ctxRef.current = null;
      if (ctx) void ctx.close();

      try {
        landmarkerRef.current?.close();
      } catch {
        /* already closed */
      }
      landmarkerRef.current = null;
      const media = streamMediaRef.current;
      if (media) {
        for (const t of media.getTracks()) t.stop();
        streamMediaRef.current = null;
      }
    };
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      {/* three.js world */}
      <div
        ref={mountRef}
        className="absolute inset-0 touch-none select-none"
        aria-hidden
      />
      {/* hidden webcam feed the pose detector reads */}
      <video ref={videoRef} className="hidden" playsInline muted aria-hidden />

      {glError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-8">
          <div className="max-w-md space-y-3 text-center">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              webgl unavailable
            </p>
            <p className="text-base text-muted-foreground">
              This piece renders its choir of recordings in WebGL, which is not
              available in this browser. Try a different browser to conduct the
              spectrum.
            </p>
          </div>
        </div>
      )}

      {/* chrome — semantic tokens only */}
      <div
        data-chrome
        className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-3 p-5 sm:p-7"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="pointer-events-auto max-w-md">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Body Choir
            </h1>
            <p className="mt-1 text-base text-muted-foreground">
              Conduct Karel&rsquo;s whole catalog with your whole body. Raise an
              arm to swell that half of the choir, spread wide to open it, lean
              to tilt the spectrum — then record a pass and let a ghost body keep
              performing it while you layer another.
            </p>
          </div>
          <div className="pointer-events-auto flex flex-wrap items-center gap-2">
            {!audioOn ? (
              <button
                type="button"
                onClick={begin}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {started ? "Begin again" : "Begin"}
              </button>
            ) : (
              <button
                type="button"
                onClick={stopAudio}
                className="min-h-[44px] rounded-md border border-border bg-muted px-5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                Mute
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowNotes(true)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Read the design notes
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          <span>
            body ·{" "}
            {camState === "live"
              ? "you"
              : camState === "demo"
                ? "auto ghost"
                : "waiting"}
          </span>
          {audioOn && (
            <span>
              loaded · {loadedCount} / {N}
            </span>
          )}
          {audioOn && (
            <span className={ghostCount > 0 ? "text-foreground" : undefined}>
              ghosts · {ghostCount} / {MAX_GHOSTS}
            </span>
          )}
          {recording && <span className="text-foreground">recording…</span>}
          {notice && <span className="text-muted-foreground/80">{notice}</span>}
          {audioError && <span className="text-destructive">{audioError}</span>}
        </div>
      </div>

      {/* record / ghost controls */}
      {audioOn && (
        <div
          data-chrome
          className="pointer-events-none absolute inset-x-0 bottom-16 z-20 flex justify-center px-6"
        >
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2">
            {!recording ? (
              <button
                type="button"
                onClick={startRecording}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                ⦿ Record conducting
              </button>
            ) : (
              <button
                type="button"
                onClick={finishRecording}
                className="min-h-[44px] rounded-md border border-border bg-muted px-5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                ■ Stop &amp; keep the pass
              </button>
            )}
            {ghostCount > 0 && (
              <button
                type="button"
                onClick={clearGhosts}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Clear ghosts
              </button>
            )}
          </div>
        </div>
      )}

      {!started && (
        <div
          data-chrome
          className="pointer-events-none absolute inset-x-0 bottom-24 z-20 flex justify-center px-6"
        >
          <p className="max-w-md text-center text-base text-muted-foreground">
            Press <span className="text-foreground">Begin</span> — allow the
            camera to conduct with your body, or let the autonomous ghost
            conductor perform the choir for you.
          </p>
        </div>
      )}

      {/* design-notes modal */}
      {showNotes && (
        <div
          data-chrome
          className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg space-y-3 rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              design notes
            </p>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Your whole body conducts the whole catalog
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              All {N} of Karel&rsquo;s real recordings (13 Welcome Home + 3
              Snowflake) hang as two facing wings of flowing particle streams —
              the lower half of the catalog on the left/low, the upper half on
              the right/high — each stream a distinct hue evenly spaced around
              the full colour wheel. Left-arm elevation swells the lower wing,
              right-arm elevation swells the upper; spreading your arms opens the
              ensemble (the lowpass lifts) and widens its stereo image; leaning
              tilts the spectrum darker or brighter across the ladder. The
              streams bend toward the raised arm, so the picture reads as
              conducting light.
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Record a ~10-second conducting pass and a translucent ghost body
              keeps performing it, its contribution summing with your live body,
              so you build an ensemble of your own passes (up to two, each
              clearable). Every sound is Karel&rsquo;s real catalog looping
              through a shared ear-safety master — zero synthesis. With no camera
              or if body-tracking fails, an autonomous drifting ghost conductor
              performs the choir so the piece is always alive.
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              After the Theremin &ldquo;Ghost Hands&rdquo; MR add-on, the Gesture
              Synth webcam instrument, the tradition of the orchestral conductor,
              Imogen Heap&rsquo;s mi.mu gloves, and &ldquo;Beyond Faders:
              Understanding 6DoF Gesture Ecologies in Music Mixing&rdquo;
              (arXiv:2602.23090).
            </p>
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["14480-bodychoir"]} />
    </main>
  );
}
