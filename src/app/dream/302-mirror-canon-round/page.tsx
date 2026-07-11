"use client";

/**
 * 302-mirror-canon-round — Mirror Canon (Round)
 *
 * Conduct a four-voice round sung entirely by past versions of yourself.
 * Perform a body-phrase, tap to commit it, and a new "past you" enters a few
 * beats later singing the SAME material in CANON — until you have built and
 * conducted a stacked round (Frère Jacques / Frippertronics) of your own selves
 * in a matte wooden mirror.
 *
 * EXTENDS 287-mirror-choir (body-pose → vocal-formant choir + wooden mirror),
 * re-implemented here (engine in ./pose.ts + ./audio.ts, NOT imported from 287),
 * and adds the new layer: a stacked-round CANON MEMORY engine. Each committed
 * loop is a "past you" that enters offset by a fixed number of beats (a true
 * round, locked to one bar grid, no drift). Up to 4 voices; mute/solo/conduct
 * the stack live; clear the round.
 *
 * CYCLE 2 of the Mirror-Canon thread adds a ROUND ⇄ PHASE mode toggle: in PHASE
 * mode each voice loops at a slightly different rate (Steve Reich, Piano Phase)
 * so the past-yous gradually slip in and out of phase — the round never repeats
 * — with a live drift HUD showing each voice's loop position.
 *
 * INPUT   camera/body via MediaPipe Pose Landmarker (CDN, no npm dep), with a
 *         hands-free ghost-performer fallback that builds the round itself.
 * OUTPUT  matte wooden mirror — tessellated amber tiles, Canvas2D source-over
 *         only (NO additive, NO glow, NO bloom, NO three.js). Each canon voice
 *         is a dimmer, distinctly-tinted ghost-silhouette of a past-you.
 * SYNTH   Klatt-ish formant vocal synthesis through a limiter; the bar clock
 *         drives stacked-round canon playback.
 *
 * Named refs (see README): Daniel Rozin, Wooden Mirror (1999); the musical
 * round / canon tradition (Frère Jacques, Sumer Is Icumen In); Frippertronics /
 * Robert Fripp tape looping; Pauline Oliveros, Deep Listening; the loop-pedal
 * one-person-choir tradition (Jacob Collier / Ariana Grande's BOSS RC-505); and
 * LUMIA (arXiv:2512.17228, Dec 2025).
 *
 * Fully client-side. No API route. No new npm dependencies.
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  AudioEngine,
  buildAudio,
  disposeAudio,
  setVoiceFader,
  applyVoiceParams,
  VOICE_TINTS,
} from "./audio";
import {
  computeFormants,
  extractParams,
  GHOST_CYCLE_S,
  GHOST_KEYFRAMES,
  GHOST_PERF_KEYFRAMES,
  GhostPose,
  Lm,
  LM_L_WRIST,
  LM_R_WRIST,
  lerp,
  makeLmArray,
  ParamFrame,
  poseFromLms,
  smooth,
  smoothLandmarks,
  stepGhostPose,
} from "./pose";

// ── README URL ────────────────────────────────────────────────────────────────
const README_URL =
  "https://github.com/kbarnoski/resonance/blob/main/src/app/dream/302-mirror-canon-round/README.md";

// ── MediaPipe CDN (runtime dynamic import; NOT an npm dependency) ─────────────
const MEDIAPIPE_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
const MEDIAPIPE_WASM =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MEDIAPIPE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

// ── Minimal local typings for the CDN module ─────────────────────────────────
interface PoseResult {
  landmarks: Lm[][];
}
interface PoseLandmarkerInst {
  detectForVideo(video: HTMLVideoElement, ts: number): PoseResult;
  close(): void;
}
interface MediaPipeVision {
  FilesetResolver: { forVisionTasks(wasmPath: string): Promise<unknown> };
  PoseLandmarker: {
    createFromOptions(
      fileset: unknown,
      opts: {
        baseOptions: { modelAssetPath: string; delegate?: "GPU" | "CPU" };
        runningMode: "VIDEO" | "IMAGE";
        numPoses?: number;
      },
    ): Promise<PoseLandmarkerInst>;
  };
}

// ── Bar clock — the round grid ────────────────────────────────────────────────
const BPM = 72;
const BEATS_PER_BAR = 4;
const SEC_PER_BEAT = 60 / BPM;
const BAR_SEC = BEATS_PER_BAR * SEC_PER_BEAT; // one loop = one bar
const FRAMES_PER_BAR = 96; // recorded param resolution per bar (~28 fps capture)
// Each successive canon voice enters offset by this many beats (a true round).
const CANON_OFFSET_BEATS = 1;
// PHASE mode (Steve Reich, Piano Phase): each voice loops at a slightly
// different rate — voice n's bar is stretched by (1 + n·PHASE_DRIFT) — so the
// past-yous gradually drift in and out of phase. Voice 0 stays locked to the
// grid; later voices drift more. Tiny so the slip is musical, not chaotic.
const PHASE_DRIFT = 0.012;

const TILE = 14; // px per mirror tile

type CanonMode = "round" | "phase";

// ── A committed canon voice: a recorded one-bar param loop + canon offset ─────
interface CanonVoice {
  frames: ParamFrame[]; // FRAMES_PER_BAR snapshots
  offsetBeats: number; // canon entry offset (beats) — used in ROUND mode
  committedAtS: number; // wall-clock commit time — drift origin for PHASE mode
  muted: boolean;
  tintIdx: number;
}

// Sample a recorded loop at a normalized bar phase (0..1) with wrap + lerp.
function sampleLoop(frames: ParamFrame[], phase: number): ParamFrame {
  const n = frames.length;
  const fp = ((phase % 1) + 1) % 1;
  const pos = fp * n;
  const i = Math.floor(pos) % n;
  const j = (i + 1) % n;
  const t = pos - Math.floor(pos);
  const a = frames[i];
  const b = frames[j];
  return {
    pitch1: lerp(a.pitch1, b.pitch1, t),
    pitch2: lerp(a.pitch2, b.pitch2, t),
    openness: lerp(a.openness, b.openness, t),
    register: lerp(a.register, b.register, t),
    energy: lerp(a.energy, b.energy, t),
    pose: a.pose, // pose is for the ghost render; nearest is fine
  };
}

// ── Wooden-mirror render ──────────────────────────────────────────────────────
// Pure Canvas2D source-over. Live silhouette = brightest amber; each canon
// voice = a dimmer, tinted ghost-silhouette of a past-you, shifted across the
// mirror so the stacked round reads as a row of your selves.
function drawMirror(
  ctx2d: CanvasRenderingContext2D,
  videoEl: HTMLVideoElement | null,
  liveLms: Lm[],
  canonPoses: { pose: GhostPose; tintIdx: number; energy: number }[],
  W: number,
  H: number,
  useVideo: boolean,
): void {
  ctx2d.globalCompositeOperation = "source-over";
  ctx2d.clearRect(0, 0, W, H);

  const cols = Math.ceil(W / TILE);
  const rows = Math.ceil(H / TILE);

  // background board: near-black warm wood grain
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const noise = ((col * 13 + row * 7) % 17) / 17;
      const l = Math.round(lerp(6, 11, noise));
      ctx2d.fillStyle = `hsl(28, 10%, ${l}%)`;
      ctx2d.fillRect(col * TILE + 1, row * TILE + 1, TILE - 2, TILE - 2);
    }
  }

  // Optional brightness sample of the live video for a truer live silhouette.
  let pixelData: ImageData | null = null;
  if (useVideo && videoEl && videoEl.videoWidth > 0) {
    try {
      const off = new OffscreenCanvas(cols, rows);
      const offCtx = off.getContext("2d");
      if (offCtx) {
        offCtx.save();
        offCtx.translate(cols, 0);
        offCtx.scale(-1, 1);
        offCtx.drawImage(videoEl, 0, 0, cols, rows);
        offCtx.restore();
        pixelData = offCtx.getImageData(0, 0, cols, rows);
      }
    } catch {
      pixelData = null;
    }
  }

  // Elliptical silhouette mask for a compact pose, centred at (cx,cy) with a
  // horizontal shift in tile-space. brightnessMin scales overall tile lightness.
  const drawSilhouette = (
    pose: GhostPose,
    hue: number,
    shiftX: number,
    baseL: number,
    topL: number,
    sampleVideo: boolean,
  ) => {
    // mirror x (1 - x); pull a few key points to build a bbox hull
    const pts: [number, number][] = [
      pose.nose,
      pose.lShoulder,
      pose.rShoulder,
      pose.lWrist,
      pose.rWrist,
      pose.lHip,
      pose.rHip,
      pose.lAnkle,
      pose.rAnkle,
    ].map(([x, y]) => [(1 - x) * W + shiftX, y * H]);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const w2 = ((Math.max(...xs) - Math.min(...xs)) / 2) * 1.35 + 1;
    const h2 = ((Math.max(...ys) - Math.min(...ys)) / 2) * 1.2 + 1;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const px = col * TILE;
        const py = row * TILE;
        const tcx = px + TILE / 2;
        const tcy = py + TILE / 2;
        const dx = (tcx - cx) / w2;
        const dy = (tcy - cy) / h2;
        let inBody = dx * dx + dy * dy < 1.0;
        if (sampleVideo && pixelData) {
          const sx = Math.min(col, cols - 1);
          const sy = Math.min(row, rows - 1);
          const pi = (sy * cols + sx) * 4;
          const b =
            (pixelData.data[pi] * 0.299 +
              pixelData.data[pi + 1] * 0.587 +
              pixelData.data[pi + 2] * 0.114) /
            255;
          if (b > 0.3) inBody = true;
        }
        if (!inBody) continue;
        const noise = ((col * 13 + row * 7) % 17) / 17;
        const l = Math.round(lerp(baseL, topL, noise));
        ctx2d.fillStyle = `hsl(${hue}, 42%, ${l}%)`;
        ctx2d.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
      }
    }
  };

  // canon ghosts first (dimmer, behind), spread horizontally across the mirror
  const nGhosts = canonPoses.length;
  canonPoses.forEach((g, k) => {
    const tint = VOICE_TINTS[g.tintIdx % VOICE_TINTS.length];
    // spread positions: -.. fan out from centre so the round reads as a row
    const spread = nGhosts > 0 ? (k - (nGhosts - 1) / 2) : 0;
    const shiftX = spread * (W * 0.16);
    const dim = 26 + g.energy * 14;
    drawSilhouette(g.pose, tint.h, shiftX, dim, dim + 14, false);
  });

  // live performer on top — brightest amber
  drawSilhouette(poseFromLms(liveLms), VOICE_TINTS[0].h, 0, 58, 82, useVideo);

  // wrist accent dots for the live performer
  [LM_L_WRIST, LM_R_WRIST].forEach((idx) => {
    const lm = liveLms[idx];
    if (lm.visibility < 0.4) return;
    ctx2d.beginPath();
    ctx2d.arc((1 - lm.x) * W, lm.y * H, 6, 0, Math.PI * 2);
    ctx2d.fillStyle = "rgba(251,191,36,0.8)";
    ctx2d.fill();
  });
}

type Phase = "idle" | "loading" | "running";

export default function MirrorCanonRoundPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isGhost, setIsGhost] = useState(false);
  const [recording, setRecording] = useState(false);
  // UI mirror of the canon stack (kept in sync from the loop via setState)
  const [voiceCount, setVoiceCount] = useState(0);
  const [muted, setMuted] = useState<boolean[]>([false, false, false, false]);
  const [soloIdx, setSoloIdx] = useState<number | null>(null);
  const [beatPulse, setBeatPulse] = useState(0);
  const [mode, setMode] = useState<CanonMode>("round");
  // current loop phase (0..1) of each canon voice — drives the drift HUD
  const [phases, setPhases] = useState<number[]>([0, 0, 0, 0]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const rafRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  // live tracking state
  const targetLmRef = useRef<Lm[]>(makeLmArray(GHOST_KEYFRAMES[0]));
  const smoothLmRef = useRef<Lm[]>(makeLmArray(GHOST_KEYFRAMES[0]));
  const useVideoRef = useRef(false);
  const ghostStartRef = useRef(0);
  const startTimeRef = useRef(0);

  // smoothed live audio params
  const smOpenRef = useRef(0.3);

  // canon stack (mutable; UI state mirrors it)
  const canonRef = useRef<CanonVoice[]>([]);
  const mutedRef = useRef<boolean[]>([false, false, false, false]);
  const soloRef = useRef<number | null>(null);
  const modeRef = useRef<CanonMode>("round");
  const frameCountRef = useRef(0);

  // recording buffer
  const recordingRef = useRef(false);
  const recBufRef = useRef<ParamFrame[]>([]);
  const recStartBarRef = useRef(0);

  // ghost auto-commit scheduling (so the round builds itself, hands-free)
  const autoCommitAtRef = useRef<number[]>([]);

  // keep refs in sync with state setters
  mutedRef.current = muted;
  soloRef.current = soloIdx;
  modeRef.current = mode;

  // ── Commit current performance as a canon voice ──────────────────────────
  const commitVoice = useCallback(() => {
    if (canonRef.current.length >= 4) return;
    // begin recording one bar starting at the next bar boundary
    recBufRef.current = [];
    recStartBarRef.current = Math.floor(elapsedBars());
    recordingRef.current = true;
    setRecording(true);
  }, []);

  function elapsedBars(): number {
    return (performance.now() / 1000 - startTimeRef.current) / BAR_SEC;
  }

  const clearRound = useCallback(() => {
    const eng = audioRef.current;
    canonRef.current = [];
    if (eng) eng.canon.forEach((v) => setVoiceFader(eng.ctx, v, 0));
    setVoiceCount(0);
    setMuted([false, false, false, false]);
    setSoloIdx(null);
  }, []);

  const toggleMute = useCallback((i: number) => {
    setMuted((m) => {
      const next = [...m];
      next[i] = !next[i];
      return next;
    });
  }, []);

  const toggleSolo = useCallback((i: number) => {
    setSoloIdx((s) => (s === i ? null : i));
  }, []);

  const toggleMode = useCallback(() => {
    setMode((m) => (m === "round" ? "phase" : "round"));
  }, []);

  // ── Main start: audio + camera/ghost, all inside the click handler ────────
  const start = useCallback(async () => {
    setError(null);
    setPhase("loading");

    const audio = buildAudio();
    audioRef.current = audio;
    try {
      if (audio.ctx.state === "suspended") await audio.ctx.resume();
    } catch {
      /* ignore */
    }

    startTimeRef.current = performance.now() / 1000;

    let cameraOK = false;
    let stream: MediaStream | null = null;
    let landmarker: PoseLandmarkerInst | null = null;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      const videoEl = videoRef.current!;
      videoEl.srcObject = stream;
      videoEl.muted = true;
      await videoEl.play();

      const vision = (await import(
        /* webpackIgnore: true */ MEDIAPIPE_CDN
      )) as unknown as MediaPipeVision;
      const { FilesetResolver, PoseLandmarker } = vision;
      const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
      landmarker = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MEDIAPIPE_MODEL, delegate: "GPU" },
        runningMode: "VIDEO",
        numPoses: 1,
      });

      // Confirm we actually get a pose within ~3s, else fall back to ghost.
      const sawPose = await new Promise<boolean>((resolve) => {
        const deadline = performance.now() + 3000;
        const probe = () => {
          if (!landmarker) return resolve(false);
          try {
            const r = landmarker.detectForVideo(videoEl, performance.now());
            if (r.landmarks && r.landmarks.length > 0) return resolve(true);
          } catch {
            return resolve(false);
          }
          if (performance.now() > deadline) return resolve(false);
          requestAnimationFrame(probe);
        };
        probe();
      });
      cameraOK = sawPose;
    } catch {
      cameraOK = false;
    }

    if (!cameraOK) {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      landmarker = null;
      setIsGhost(true);
      setError(
        "Camera or pose model unavailable — a ghost performer is conducting the round for you.",
      );
      ghostStartRef.current = performance.now() / 1000;
      // schedule two auto-commits so the round demos itself
      autoCommitAtRef.current = [BAR_SEC * 1.2, BAR_SEC * 3.4];
    }

    useVideoRef.current = cameraOK;
    setIsGhost(!cameraOK);
    setPhase("running");

    // ── Animation loop ────────────────────────────────────────────────────
    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      const audioEng = audioRef.current;
      if (!audioEng) return;

      const nowS = performance.now() / 1000;

      // 1. update target landmarks (camera or ghost)
      if (cameraOK && landmarker) {
        const v = videoRef.current;
        if (v) {
          try {
            const r = landmarker.detectForVideo(v, performance.now());
            if (r.landmarks && r.landmarks.length > 0) {
              targetLmRef.current = r.landmarks[0] as Lm[];
            }
          } catch {
            /* transient detect error — keep last pose */
          }
        }
      } else {
        const gt = nowS - ghostStartRef.current;
        targetLmRef.current = makeLmArray(
          stepGhostPose(GHOST_PERF_KEYFRAMES, gt, GHOST_CYCLE_S * 0.75),
        );
        // hands-free auto-commit to build the round
        if (autoCommitAtRef.current.length > 0 && gt >= autoCommitAtRef.current[0]) {
          autoCommitAtRef.current.shift();
          if (canonRef.current.length < 4 && !recordingRef.current) {
            recBufRef.current = [];
            recStartBarRef.current = Math.floor(
              (nowS - startTimeRef.current) / BAR_SEC,
            );
            recordingRef.current = true;
            setRecording(true);
          }
        }
      }

      // 2. smooth landmarks
      smoothLmRef.current = smoothLandmarks(
        smoothLmRef.current,
        targetLmRef.current,
        0.14,
      );
      const lms = smoothLmRef.current;

      // 3. derive live params
      const live = extractParams(lms);
      smOpenRef.current = smooth(smOpenRef.current, live.openness, 0.06);
      const liveFormants = computeFormants(smOpenRef.current);

      // wrist-visibility gate (camera mode); ghost is always audible
      let liveLevel = live.energy;
      if (cameraOK) {
        const vis =
          (lms[LM_L_WRIST].visibility + lms[LM_R_WRIST].visibility) / 2;
        liveLevel = Math.max(0.12, Math.min(1, vis)) * live.energy;
      }
      applyVoiceParams(
        audioEng.ctx,
        audioEng.live,
        live.pitch1,
        live.pitch2,
        liveFormants,
        live.register,
        liveLevel,
      );

      // 4. bar clock + recording
      const barsElapsed = (nowS - startTimeRef.current) / BAR_SEC;
      const barPhase = barsElapsed % 1;

      // beat pulse for the UI
      const beat = Math.floor((barsElapsed * BEATS_PER_BAR) % BEATS_PER_BAR);
      setBeatPulse((prev) => (prev !== beat ? beat : prev));

      if (recordingRef.current) {
        const sinceStart = barsElapsed - recStartBarRef.current;
        // snap recording to begin at the next bar boundary, capture one full bar
        if (sinceStart >= 0) {
          const idx = Math.floor(((sinceStart % 1) * FRAMES_PER_BAR));
          // fill frames densely so every slot is populated
          while (recBufRef.current.length <= idx && recBufRef.current.length < FRAMES_PER_BAR) {
            recBufRef.current.push({ ...live, pose: poseFromLms(lms) });
          }
          if (recBufRef.current.length >= FRAMES_PER_BAR) {
            // one bar captured → commit as a canon voice
            const slot = canonRef.current.length;
            if (slot < 4) {
              const offsetBeats = (slot + 1) * CANON_OFFSET_BEATS;
              canonRef.current.push({
                frames: recBufRef.current.slice(0, FRAMES_PER_BAR),
                offsetBeats,
                committedAtS: nowS,
                muted: false,
                tintIdx: slot + 1,
              });
              setVoiceCount(canonRef.current.length);
            }
            recordingRef.current = false;
            setRecording(false);
          }
        }
      }

      // 5. play canon voices (the stacked round), apply conduct (mute/solo)
      const soloed = soloRef.current;
      const playMode = modeRef.current;
      const canonGhosts: {
        pose: GhostPose;
        tintIdx: number;
        energy: number;
      }[] = [];
      const phasesNow = [0, 0, 0, 0];
      canonRef.current.forEach((cv, i) => {
        const voice = audioEng.canon[i];
        // Each voice's loop phase depends on the mode:
        //  ROUND — bar phase shifted back by its canon offset; all voices share
        //          one locked bar grid (a true round, no drift).
        //  PHASE — Steve Reich Piano Phase: this voice's loop is stretched by
        //          (1 + i·PHASE_DRIFT) and clocked from its own commit time, so
        //          it slowly slips against the grid and the other voices.
        let loopPhase: number;
        if (playMode === "phase") {
          const period = BAR_SEC * (1 + i * PHASE_DRIFT);
          loopPhase = (nowS - cv.committedAtS) / period;
        } else {
          loopPhase = barPhase - cv.offsetBeats / BEATS_PER_BAR;
        }
        phasesNow[i] = ((loopPhase % 1) + 1) % 1;
        const f = sampleLoop(cv.frames, loopPhase);
        const formants = computeFormants(f.openness);
        applyVoiceParams(
          audioEng.ctx,
          voice,
          f.pitch1,
          f.pitch2,
          formants,
          f.register,
          f.energy,
        );
        // conduct: solo wins; otherwise honour mute
        const audible = soloed !== null ? soloed === i : !mutedRef.current[i];
        setVoiceFader(audioEng.ctx, voice, audible ? 0.6 : 0);
        if (audible) {
          canonGhosts.push({
            pose: f.pose,
            tintIdx: cv.tintIdx,
            energy: f.energy,
          });
        }
      });

      // surface the drift HUD at ~10 fps (cheap; canvas keeps its own rAF)
      frameCountRef.current += 1;
      if (frameCountRef.current % 6 === 0) {
        setPhases((prev) =>
          prev[0] === phasesNow[0] &&
          prev[1] === phasesNow[1] &&
          prev[2] === phasesNow[2] &&
          prev[3] === phasesNow[3]
            ? prev
            : phasesNow,
        );
      }

      // 6. render wooden mirror
      const canvas = canvasRef.current;
      const ctx2d = canvas?.getContext("2d");
      if (canvas && ctx2d) {
        drawMirror(
          ctx2d,
          videoRef.current,
          lms,
          canonGhosts,
          canvas.width,
          canvas.height,
          useVideoRef.current,
        );
      }
    };
    tick();
  }, []);

  // resize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [phase]);

  // teardown
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (audioRef.current) disposeAudio(audioRef.current);
      audioRef.current = null;
    };
  }, []);

  const running = phase === "running";

  return (
    <div className="relative flex flex-col min-h-screen bg-[#0a0a0a] text-foreground font-mono overflow-hidden">
      {/* design notes link */}
      <div className="absolute top-4 right-4 z-30">
        <Link
          href={README_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground text-sm hover:text-foreground transition-colors"
        >
          design notes
        </Link>
      </div>

      {/* header / hero */}
      <header className="px-6 pt-8 pb-3 z-10">
        <p className="text-muted-foreground text-xs tracking-[0.2em] uppercase mb-1">
          dream · 302
        </p>
        <h1 className="text-3xl sm:text-4xl font-serif font-semibold tracking-tight text-foreground mb-2">
          Mirror Canon
        </h1>
        <p className="text-base text-muted-foreground max-w-xl leading-relaxed">
          Conduct a round sung entirely by past versions of yourself. Perform a
          body-phrase, commit it, and a new past-you enters a few beats later in
          canon — a stacked round of your own selves in a wooden mirror.
        </p>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 pb-6 relative">
        {/* mirror + controls (shown once running) */}
        <div
          className="w-full max-w-3xl flex flex-col gap-4"
          style={{ display: running ? "flex" : "none" }}
        >
          <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden border border-border bg-black">
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover"
              style={{ opacity: 0, pointerEvents: "none" }}
              playsInline
              muted
            />
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

            {/* bar / beat indicator */}
            <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/50 rounded-full px-3 py-1.5">
              {[0, 1, 2, 3].map((b) => (
                <span
                  key={b}
                  className={`inline-block w-2 h-2 rounded-full transition-colors ${
                    b === beatPulse ? "bg-violet-300/95" : "bg-muted"
                  }`}
                />
              ))}
              <span className="text-muted-foreground text-xs ml-1">{BPM} bpm</span>
            </div>

            {/* voice count */}
            <div className="absolute top-3 right-3 bg-black/50 rounded-full px-3 py-1.5 text-sm text-muted-foreground">
              round: {voiceCount}/4 voices
            </div>

            {isGhost && error && (
              <div className="absolute bottom-3 left-0 right-0 flex justify-center px-4">
                <span className="text-violet-300 text-sm bg-black/65 rounded-lg px-4 py-2 max-w-md text-center">
                  {error}
                </span>
              </div>
            )}
          </div>

          {/* primary action: add a voice to the round */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={commitVoice}
              disabled={voiceCount >= 4 || recording}
              className="min-h-[44px] px-5 py-2.5 rounded-lg text-base font-semibold transition-colors bg-violet-600 hover:bg-violet-500 active:bg-violet-700 disabled:bg-muted disabled:text-muted-foreground/70 text-foreground"
            >
              {recording
                ? "recording one bar…"
                : voiceCount >= 4
                  ? "round is full (4/4)"
                  : "Add a voice to the round"}
            </button>
            <button
              onClick={clearRound}
              disabled={voiceCount === 0}
              className="min-h-[44px] px-4 py-2.5 rounded-lg text-base transition-colors border border-border hover:border-border disabled:opacity-40 text-foreground"
            >
              Clear round
            </button>
            {/* Round ⇄ Phase mode toggle (the cycle-2 deepening) */}
            <div className="flex items-center rounded-lg border border-border overflow-hidden">
              {(["round", "phase"] as CanonMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    if (mode !== m) toggleMode();
                  }}
                  className={`min-h-[44px] px-4 py-2.5 text-base transition-colors ${
                    mode === m
                      ? "bg-violet-600 text-foreground font-semibold"
                      : "bg-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m === "round" ? "Round" : "Phase"}
                </button>
              ))}
            </div>
            <p className="text-muted-foreground text-sm">
              {mode === "round"
                ? `each voice enters ${CANON_OFFSET_BEATS} beat${
                    CANON_OFFSET_BEATS === 1 ? "" : "s"
                  } later, locked in canon`
                : "voices loop at slightly different rates — they drift in and out of phase (Steve Reich)"}
            </p>
          </div>

          {/* phase-drift HUD — each voice's loop position, tinted; in Phase
              mode the markers slip apart, in Round mode they hold their offsets */}
          {voiceCount > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-muted-foreground text-sm">
                {mode === "phase" ? "Phase drift" : "Round positions"}
              </p>
              <div className="flex flex-col gap-1.5">
                {Array.from({ length: voiceCount }).map((_, i) => {
                  const tint = VOICE_TINTS[(i + 1) % VOICE_TINTS.length];
                  const rgb =
                    tint.name === "violet"
                      ? "rgb(167,139,250)"
                      : tint.name === "emerald"
                        ? "rgb(110,231,183)"
                        : tint.name === "rose"
                          ? "rgb(253,164,175)"
                          : "rgb(252,211,77)";
                  const audible =
                    soloIdx !== null ? soloIdx === i : !muted[i];
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs w-16 shrink-0">
                        past-you {i + 1}
                      </span>
                      <div className="relative flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <span
                          className="absolute top-0 bottom-0 w-1.5 rounded-full"
                          style={{
                            left: `calc(${(phases[i] ?? 0) * 100}% - 3px)`,
                            background: rgb,
                            opacity: audible ? 0.95 : 0.3,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* conduct: per-voice mute / solo */}
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground text-sm">Conduct the stack</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[0, 1, 2, 3].map((i) => {
                const active = i < voiceCount;
                const tint = VOICE_TINTS[(i + 1) % VOICE_TINTS.length];
                const accent =
                  tint.name === "violet"
                    ? "text-violet-300"
                    : tint.name === "emerald"
                      ? "text-violet-300/95"
                      : tint.name === "rose"
                        ? "text-violet-300"
                        : "text-violet-300/95";
                return (
                  <div
                    key={i}
                    className={`rounded-lg border p-2.5 flex flex-col gap-2 ${
                      active ? "border-border" : "border-border opacity-50"
                    }`}
                  >
                    <span className={`text-sm ${accent}`}>
                      past-you {i + 1}
                      {soloIdx === i ? " · solo" : muted[i] ? " · muted" : ""}
                    </span>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => toggleMute(i)}
                        disabled={!active}
                        className={`flex-1 min-h-[44px] rounded-md text-sm transition-colors disabled:opacity-40 ${
                          muted[i]
                            ? "bg-violet-500/30 text-violet-200"
                            : "bg-muted hover:bg-accent text-foreground"
                        }`}
                      >
                        mute
                      </button>
                      <button
                        onClick={() => toggleSolo(i)}
                        disabled={!active}
                        className={`flex-1 min-h-[44px] rounded-md text-sm transition-colors disabled:opacity-40 ${
                          soloIdx === i
                            ? "bg-violet-400/30 text-violet-200"
                            : "bg-muted hover:bg-accent text-foreground"
                        }`}
                      >
                        solo
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* pre-start hero card */}
        {!running && (
          <div className="flex flex-col items-center gap-6 max-w-md text-center">
            <div className="w-24 h-24 rounded-full border border-violet-500/30 flex items-center justify-center text-5xl select-none">
              🪞
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground mb-2">
                A round of your own selves
              </h2>
              <p className="text-base text-muted-foreground leading-relaxed">
                Your hands are two singing voices — their height sets the pitch,
                your openness shapes the vowel. Perform a phrase, tap{" "}
                <span className="text-violet-300">Add a voice</span>, and a past
                version of you joins the round a beat later, in canon. Stack up
                to four and conduct them — mute, solo, and switch the whole
                stack between a locked <span className="text-violet-300">Round</span>{" "}
                and a drifting <span className="text-violet-300">Phase</span>{" "}
                (Steve Reich) cloud.
              </p>
            </div>
            <div className="text-muted-foreground text-sm leading-relaxed space-y-1">
              <p>D-Dorian formant choir · round ⇄ phase canon memory</p>
              <p>matte wooden-mirror render · 33-point pose tracking</p>
            </div>

            {error && phase === "idle" && (
              <p className="text-violet-300 text-sm">{error}</p>
            )}

            <button
              onClick={start}
              disabled={phase === "loading"}
              className="min-h-[44px] px-8 py-2.5 bg-violet-600 hover:bg-violet-500 active:bg-violet-700 disabled:opacity-60 text-foreground font-semibold rounded-lg transition-colors text-base"
            >
              {phase === "loading" ? "summoning the round…" : "Begin"}
            </button>
            <p className="text-muted-foreground text-xs">
              Camera requested inside this tap · audio starts immediately ·
              nothing is recorded or uploaded
            </p>
          </div>
        )}
      </main>

      <footer className="px-6 py-4 border-t border-border text-muted-foreground text-xs flex flex-wrap gap-x-3 gap-y-1 justify-between items-center">
        <span>
          ref: Rozin <em>Wooden Mirror</em> (1999) · the musical round / canon ·
          Reich <em>Piano Phase</em> · Frippertronics · Oliveros{" "}
          <em>Deep Listening</em>
        </span>
        <span>resonance lab</span>
      </footer>
    </div>
  );
}
