"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 20080-phosphorhelm — tilt your HEAD, twist the stereo field.
//
// Karel's real stereo piano always plays. Your head is the conductor:
//   · head ROLL  → a rotation matrix on the stereo [L,R] vector that genuinely
//                  re-pans / widens the image AND rotates the figure you watch.
//                  Sound-rotation and picture-rotation are one gesture (same θ).
//   · head YAW   → a gentle pan bias (StereoPannerNode).
//   · head PITCH → a tilt filter: look down and it darkens, look up and it
//                  brightens (low-shelf ↔ high-shelf balance).
//   · JAW OPEN   → opens a resonant peaking filter (brightness) and lengthens
//                  the phosphor trail.
//
// OUTPUT is a true X–Y VECTORSCOPE: the pre-master stereo signal is tapped into
// two time-domain analysers; each frame plots (L[i], R[i]) as a connected laser
// trace, rotated by head-roll, over a violet phosphor-decay trail on Canvas2D.
// A living Lissajous figure drawn in phosphor light.
//
// INPUT  webcam head-pose (MediaPipe FaceLandmarker: 478 landmarks + blendshapes)
//        — yaw / pitch / roll derived calibration-free; jawOpen blendshape.
// AUDIO  Karel's real catalog → mono→pseudo-stereo if needed (Haas split) →
//        4-gain rotation matrix → pitch tilt → jaw peaking → yaw panner →
//        createSafeMaster (NEVER ctx.destination). Rate stays 1.0, looped.
// DEMO   no camera / denied / model-fail → POINTER fallback (mouse X = roll,
//        mouse Y = pitch, hold = jaw) drives the IDENTICAL chain, clearly
//        labelled. Idle shows a slow breathing calibration ring — never blank.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { useImmersive, ImmersiveHud } from "../_shared/immersive";
import {
  WELCOME_HOME_TRACKS,
  SNOWFLAKE_TRACKS,
  loadRealTrackBuffer,
} from "../_shared/welcomeHome";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import {
  createFaceTracker,
  startCamera,
  type FaceLandmarkerInst,
  type FaceResult,
  type Landmark,
} from "../_shared/cameraTracking";

// ── small math helpers ───────────────────────────────────────────────────────
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// ── head pose, read calibration-free from face landmarks ─────────────────────
interface Pose {
  /** head-roll angle in radians, clamped ±ROLL_MAX. drives the rotation. */
  roll: number;
  /** −1 (turned left) … +1 (turned right), mirror-corrected. */
  yaw: number;
  /** −1 (looking down) … +1 (looking up). */
  pitch: number;
  /** 0 (shut) … 1 (wide), from the jawOpen blendshape. */
  jaw: number;
}
const NEUTRAL: Pose = { roll: 0, yaw: 0, pitch: 0, jaw: 0 };
const ROLL_MAX = 0.8; // ~46° — bounded so the stereo image never fully inverts

// MediaPipe FaceLandmarker mesh indices.
const NOSE = 1;
const EYE_L = 33; // left eye outer corner
const EYE_R = 263; // right eye outer corner
const FORE = 10; // forehead top
const CHIN = 152; // chin bottom
const PITCH_NEUTRAL = 0.3; // nose rests below the eye line — subtract to center

function computePose(res: FaceResult): Pose | null {
  const lm: Landmark[] | undefined = res.faceLandmarks?.[0];
  if (!lm || lm.length < 468) return null;
  const nose = lm[NOSE];
  const eyeL = lm[EYE_L];
  const eyeR = lm[EYE_R];
  const fore = lm[FORE];
  const chin = lm[CHIN];

  // roll: angle of the eye-corner line vs horizontal. Negate for the mirror so
  // tilting your head one way rotates the field the matching way.
  const rollRaw = -Math.atan2(eyeR.y - eyeL.y, eyeR.x - eyeL.x);
  const roll = clamp(rollRaw * 1.6, -ROLL_MAX, ROLL_MAX);

  const interEye = Math.abs(eyeR.x - eyeL.x) + 1e-4;
  const eyeMidX = (eyeL.x + eyeR.x) / 2;
  const eyeMidY = (eyeL.y + eyeR.y) / 2;
  const faceH = Math.abs(chin.y - fore.y) + 1e-4;

  // yaw: horizontal nose offset from eye midpoint, mirror-corrected.
  const yaw = clamp(-((nose.x - eyeMidX) / interEye) * 3.2, -1, 1);
  // pitch: vertical nose offset over face height; up → larger.
  const pitch = clamp(((nose.y - eyeMidY) / faceH - PITCH_NEUTRAL) * 5.0, -1, 1);

  let jaw = 0;
  const cats = res.faceBlendshapes?.[0]?.categories;
  if (cats) {
    for (const c of cats) {
      if (c.categoryName === "jawOpen") {
        jaw = clamp(c.score ?? 0, 0, 1);
        break;
      }
    }
  }
  return { roll, yaw, pitch, jaw };
}

// ── the audio rotation graph ─────────────────────────────────────────────────
// stereoSig → ChannelSplitter → 4 gains (rotation matrix) → ChannelMerger →
//   lowShelf+highShelf (pitch tilt) → peaking (jaw) → panner (yaw) → preMaster.
// preMaster feeds BOTH the scope taps and createSafeMaster.input (upstream).
interface Engine {
  src: AudioBufferSourceNode;
  stereoStage: AudioNode[]; // extra nodes for the mono pseudo-stereo path
  splitter: ChannelSplitterNode;
  gLL: GainNode;
  gRL: GainNode;
  gLR: GainNode;
  gRR: GainNode;
  merger: ChannelMergerNode;
  lowShelf: BiquadFilterNode;
  highShelf: BiquadFilterNode;
  peaking: BiquadFilterNode;
  panner: StereoPannerNode;
  preMaster: GainNode;
  scopeSplit: ChannelSplitterNode;
  analyserL: AnalyserNode;
  analyserR: AnalyserNode;
  sampleCount: number;
  dataL: Float32Array<ArrayBuffer>;
  dataR: Float32Array<ArrayBuffer>;
}

function applyAudio(ctx: AudioContext, eng: Engine, p: Pose) {
  const now = ctx.currentTime;
  const tc = 0.12; // ~0.12s easing, matches the visual smoothing
  const c = Math.cos(p.roll);
  const s = Math.sin(p.roll);
  // Lout = L·cosθ − R·sinθ ; Rout = L·sinθ + R·cosθ
  eng.gLL.gain.setTargetAtTime(c, now, tc);
  eng.gRL.gain.setTargetAtTime(-s, now, tc);
  eng.gLR.gain.setTargetAtTime(s, now, tc);
  eng.gRR.gain.setTargetAtTime(c, now, tc);

  // yaw → gentle pan bias
  eng.panner.pan.setTargetAtTime(clamp(p.yaw * 0.6, -0.9, 0.9), now, tc);

  // pitch → tilt: up brightens (highs up, lows down), down darkens
  eng.highShelf.gain.setTargetAtTime(clamp(p.pitch * 7, -8, 8), now, tc);
  eng.lowShelf.gain.setTargetAtTime(clamp(-p.pitch * 5, -8, 8), now, tc);

  // jaw → resonant brightness peak
  eng.peaking.gain.setTargetAtTime(clamp(p.jaw * 9, 0, 10), now, tc);
}

// ── the vectorscope render ───────────────────────────────────────────────────
function drawScope(
  cv: HTMLCanvasElement,
  cx2d: CanvasRenderingContext2D,
  eng: Engine | null,
  p: Pose,
  t: number,
) {
  const W = cv.width;
  const H = cv.height;
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const minSide = Math.min(W, H);

  if (!eng) {
    // idle: a slow breathing calibration ring — alive, never blank.
    cx2d.globalCompositeOperation = "source-over";
    cx2d.fillStyle = "rgba(6,4,12,0.28)";
    cx2d.fillRect(0, 0, W, H);
    const breath = 0.5 + 0.5 * Math.sin(t * 0.0011);
    const r = minSide * (0.18 + 0.05 * breath);
    cx2d.globalCompositeOperation = "lighter";
    cx2d.strokeStyle = "#8b5cf6";
    cx2d.globalAlpha = 0.18 + 0.22 * breath;
    cx2d.lineWidth = 1.2 * dpr;
    cx2d.shadowColor = "#a78bfa";
    cx2d.shadowBlur = 16 * dpr;
    cx2d.beginPath();
    cx2d.arc(W / 2, H / 2, r, 0, Math.PI * 2);
    cx2d.stroke();
    // faint crosshair to read as a scope at rest
    cx2d.globalAlpha = 0.08;
    cx2d.beginPath();
    cx2d.moveTo(W / 2 - r, H / 2);
    cx2d.lineTo(W / 2 + r, H / 2);
    cx2d.moveTo(W / 2, H / 2 - r);
    cx2d.lineTo(W / 2, H / 2 + r);
    cx2d.stroke();
    cx2d.globalAlpha = 1;
    cx2d.shadowBlur = 0;
    return;
  }

  // phosphor persistence: jaw-open lengthens the trail (lower fade alpha);
  // a slight pitch-lean also nudges it. Bounded so it always refreshes.
  const fade = clamp(0.19 - p.jaw * 0.12 - Math.abs(p.pitch) * 0.025, 0.05, 0.22);
  cx2d.globalCompositeOperation = "source-over";
  cx2d.fillStyle = `rgba(6,4,12,${fade})`;
  cx2d.fillRect(0, 0, W, H);

  // pull the pre-master stereo signal, time-domain.
  eng.analyserL.getFloatTimeDomainData(eng.dataL);
  eng.analyserR.getFloatTimeDomainData(eng.dataR);
  const L = eng.dataL;
  const R = eng.dataR;
  const n = eng.sampleCount;

  const cx = W / 2;
  const cy = H / 2;
  const scale = minSide * 0.42;
  const c = Math.cos(p.roll);
  const s = Math.sin(p.roll);

  // additive violet laser trace, rotated by head-roll (same θ as the audio).
  cx2d.globalCompositeOperation = "lighter";
  cx2d.lineJoin = "round";
  cx2d.lineWidth = (1.1 + p.jaw * 0.9) * dpr;
  cx2d.strokeStyle = "#c4b5fd";
  cx2d.shadowColor = "#8b5cf6";
  cx2d.shadowBlur = (7 + p.jaw * 22) * dpr;
  cx2d.globalAlpha = 0.85;
  cx2d.beginPath();
  for (let i = 0; i < n; i++) {
    const lx = L[i] * scale;
    const ry = R[i] * scale;
    // rotate the (L,R) vector by θ; canvas y is down, so R points up.
    const rx = lx * c - ry * s;
    const ryr = lx * s + ry * c;
    const px = cx + rx;
    const py = cy - ryr;
    if (i === 0) cx2d.moveTo(px, py);
    else cx2d.lineTo(px, py);
  }
  cx2d.stroke();

  // bright hot core overlay for the laser look
  cx2d.lineWidth = 0.7 * dpr;
  cx2d.strokeStyle = "#ede9fe";
  cx2d.shadowBlur = 3 * dpr;
  cx2d.globalAlpha = 0.5;
  cx2d.stroke();

  cx2d.globalAlpha = 1;
  cx2d.shadowBlur = 0;
}

type AudioPhase = "idle" | "loading" | "running" | "error";
type CamState = "off" | "requesting" | "live" | "denied" | "failed";

const PICKER = [
  { group: "Welcome Home", tracks: WELCOME_HOME_TRACKS },
  { group: "Snowflake", tracks: SNOWFLAKE_TRACKS },
];

const DESCRIPTION =
  "Karel's real stereo piano, re-aimed by your head. Tilt (roll) rotates a matrix on the stereo [L,R] vector — the image literally twists — and the same angle rotates the Lissajous figure you watch, drawn as a laser trace in violet phosphor on an X–Y vectorscope. Turn to pan, look up to brighten, open your jaw to bloom and lengthen the trail.";

const HOW_TO = [
  "Allow the camera",
  "Sit so your face fills the frame",
  "Tilt your head to rotate the stereo field and the figure",
  "Open your jaw to brighten and lengthen the trail",
];

export default function PhosphorHelm() {
  const { immersive, toggle } = useImmersive();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const engineRef = useRef<Engine | null>(null);

  const trackerRef = useRef<FaceLandmarkerInst | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const camWantRef = useRef(false);
  const camStateRef = useRef<CamState>("off");

  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef(0);
  const lastFaceRef = useRef(0);

  const poseRef = useRef<Pose>({ ...NEUTRAL }); // smoothed, what actually drives
  const targetRef = useRef<Pose>({ ...NEUTRAL }); // raw target from face/pointer
  const pointerActiveRef = useRef(false);
  const pointerTargetRef = useRef<Pose>({ ...NEUTRAL });

  const [phase, setPhase] = useState<AudioPhase>("idle");
  const [camState, setCamState] = useState<CamState>("off");
  const [faceSeen, setFaceSeen] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [trackId, setTrackId] = useState<string>(WELCOME_HOME_TRACKS[0].id);
  const [trackTitle, setTrackTitle] = useState<string>(WELCOME_HOME_TRACKS[0].title);
  const [monoWidened, setMonoWidened] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

  camStateRef.current = camState;

  // ── canvas sizing ──────────────────────────────────────────────────────────
  const resize = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const w = cv.clientWidth || window.innerWidth;
    const h = cv.clientHeight || window.innerHeight;
    cv.width = Math.max(1, Math.round(w * dpr));
    cv.height = Math.max(1, Math.round(h * dpr));
  }, []);

  useEffect(() => {
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  // ── the frame loop ───────────────────────────────────────────────────────
  const runFrame = useCallback(() => {
    const now = performance.now();
    const prev = lastTimeRef.current || now;
    const dt = Math.min(0.1, (now - prev) / 1000);
    lastTimeRef.current = now;

    // 1. resolve the control target this frame.
    let haveFace = false;
    if (camWantRef.current && trackerRef.current && videoRef.current) {
      try {
        const res = trackerRef.current.detectForVideo(videoRef.current, now);
        const p = computePose(res);
        if (p) {
          targetRef.current = p;
          lastFaceRef.current = now;
          haveFace = true;
        }
      } catch {
        /* a dropped detect frame is harmless */
      }
      // face lost for >0.6s → relax toward neutral so it never freezes hard.
      if (!haveFace && now - lastFaceRef.current > 600) {
        targetRef.current = { ...NEUTRAL };
      }
      const live = now - lastFaceRef.current < 500;
      if (live !== faceSeen) setFaceSeen(live);
    } else if (pointerActiveRef.current) {
      targetRef.current = pointerTargetRef.current;
    } else {
      targetRef.current = { ...NEUTRAL };
    }

    // 2. smooth toward the target (~0.12s easing).
    const tau = 0.12;
    const a = 1 - Math.exp(-dt / tau);
    const cur = poseRef.current;
    const tgt = targetRef.current;
    cur.roll += (tgt.roll - cur.roll) * a;
    cur.yaw += (tgt.yaw - cur.yaw) * a;
    cur.pitch += (tgt.pitch - cur.pitch) * a;
    cur.jaw += (tgt.jaw - cur.jaw) * a;

    // 3. drive the sound.
    const ctx = ctxRef.current;
    const eng = engineRef.current;
    if (ctx && eng) applyAudio(ctx, eng, cur);

    // 4. draw the scope (or the idle breathing ring).
    const cv = canvasRef.current;
    const cx2d = cv?.getContext("2d");
    if (cv && cx2d) drawScope(cv, cx2d, eng, cur, now);

    rafRef.current = requestAnimationFrame(runFrame);
  }, [faceSeen]);

  // keep one rAF running for the whole lifetime so idle is always alive.
  useEffect(() => {
    lastTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(runFrame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [runFrame]);

  // ── start the audio (works with no camera — pointer drives it) ─────────────
  const begin = useCallback(async () => {
    if (phase === "loading" || phase === "running") return;
    setPhase("loading");
    setErrMsg("");
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AC();
      await ctx.resume();
      ctxRef.current = ctx;

      const master = createSafeMaster(ctx);
      masterRef.current = master;

      const { buffer, title } = await loadRealTrackBuffer(ctx, trackId);
      setTrackTitle(title);

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.playbackRate.value = 1.0;

      // Decorrelate mono recordings into a pseudo-stereo pair (a short Haas
      // delay on one side) so the X–Y figure still has width. This is NOT
      // synthesizing the source — it is a stereo spread of HIS audio.
      const stereoStage: AudioNode[] = [];
      let stereoSig: AudioNode = src;
      const mono = buffer.numberOfChannels === 1;
      setMonoWidened(mono);
      if (mono) {
        const merge = ctx.createChannelMerger(2);
        const delay = ctx.createDelay(0.05);
        delay.delayTime.value = 0.012; // ~12 ms Haas offset on the right
        src.connect(merge, 0, 0);
        src.connect(delay);
        delay.connect(merge, 0, 1);
        stereoSig = merge;
        stereoStage.push(merge, delay);
      }

      // rotation matrix on the [L,R] vector
      const splitter = ctx.createChannelSplitter(2);
      stereoSig.connect(splitter);
      const gLL = ctx.createGain();
      const gRL = ctx.createGain();
      const gLR = ctx.createGain();
      const gRR = ctx.createGain();
      gLL.gain.value = 1;
      gRL.gain.value = 0;
      gLR.gain.value = 0;
      gRR.gain.value = 1;
      splitter.connect(gLL, 0); // L → Lout
      splitter.connect(gLR, 0); // L → Rout
      splitter.connect(gRL, 1); // R → Lout
      splitter.connect(gRR, 1); // R → Rout
      const merger = ctx.createChannelMerger(2);
      gLL.connect(merger, 0, 0);
      gRL.connect(merger, 0, 0);
      gLR.connect(merger, 0, 1);
      gRR.connect(merger, 0, 1);

      // pitch tilt (low-shelf ↔ high-shelf)
      const lowShelf = ctx.createBiquadFilter();
      lowShelf.type = "lowshelf";
      lowShelf.frequency.value = 260;
      lowShelf.gain.value = 0;
      const highShelf = ctx.createBiquadFilter();
      highShelf.type = "highshelf";
      highShelf.frequency.value = 3200;
      highShelf.gain.value = 0;

      // jaw brightness peak
      const peaking = ctx.createBiquadFilter();
      peaking.type = "peaking";
      peaking.frequency.value = 2600;
      peaking.Q.value = 1.1;
      peaking.gain.value = 0;

      // yaw pan
      const panner = ctx.createStereoPanner();
      panner.pan.value = 0;

      const preMaster = ctx.createGain();
      preMaster.gain.value = 1;

      merger.connect(lowShelf);
      lowShelf.connect(highShelf);
      highShelf.connect(peaking);
      peaking.connect(panner);
      panner.connect(preMaster);

      // pre-master taps for the vectorscope (upstream of safeMaster)
      const scopeSplit = ctx.createChannelSplitter(2);
      preMaster.connect(scopeSplit);
      const analyserL = ctx.createAnalyser();
      const analyserR = ctx.createAnalyser();
      analyserL.fftSize = 2048;
      analyserR.fftSize = 2048;
      analyserL.smoothingTimeConstant = 0;
      analyserR.smoothingTimeConstant = 0;
      scopeSplit.connect(analyserL, 0);
      scopeSplit.connect(analyserR, 1);

      // into the ear-safety master — never ctx.destination
      preMaster.connect(master.input);

      const sampleCount = analyserL.fftSize;
      engineRef.current = {
        src,
        stereoStage,
        splitter,
        gLL,
        gRL,
        gLR,
        gRR,
        merger,
        lowShelf,
        highShelf,
        peaking,
        panner,
        preMaster,
        scopeSplit,
        analyserL,
        analyserR,
        sampleCount,
        dataL: new Float32Array(sampleCount),
        dataR: new Float32Array(sampleCount),
      };

      src.start();
      setPhase("running");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "could not start audio");
      setPhase("error");
    }
  }, [phase, trackId]);

  // ── camera opt-in: swap the pointer for live head-pose ─────────────────────
  const enableCamera = useCallback(async () => {
    if (!videoRef.current) return;
    setCamState("requesting");
    setErrMsg("");
    try {
      const tracker = await createFaceTracker(1);
      trackerRef.current = tracker;
      const stream = await startCamera(videoRef.current);
      streamRef.current = stream;
      camWantRef.current = true;
      pointerActiveRef.current = false;
      lastFaceRef.current = performance.now();
      setCamState("live");
    } catch (e) {
      camWantRef.current = false;
      const msg = e instanceof Error ? e.message : "";
      if (/denied|Permission|NotAllowed/i.test(msg)) setCamState("denied");
      else setCamState("failed");
    }
  }, []);

  // ── pointer fallback: mouse X = roll, mouse Y = pitch, hold = jaw ──────────
  const pointerMove = useCallback((e: React.PointerEvent) => {
    if (camStateRef.current === "live") return;
    pointerActiveRef.current = true;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const nx = (e.clientX - r.left) / Math.max(1, r.width); // 0..1
    const ny = (e.clientY - r.top) / Math.max(1, r.height); // 0..1
    const prev = pointerTargetRef.current;
    pointerTargetRef.current = {
      roll: clamp((nx - 0.5) * 2 * ROLL_MAX, -ROLL_MAX, ROLL_MAX),
      yaw: clamp((nx - 0.5) * 2, -1, 1),
      pitch: clamp((0.5 - ny) * 2, -1, 1),
      jaw: prev.jaw,
    };
  }, []);
  const pointerDown = useCallback((e: React.PointerEvent) => {
    if (camStateRef.current === "live") return;
    pointerActiveRef.current = true;
    pointerTargetRef.current = { ...pointerTargetRef.current, jaw: 1 };
    pointerMove(e);
  }, [pointerMove]);
  const pointerUp = useCallback(() => {
    pointerTargetRef.current = { ...pointerTargetRef.current, jaw: 0 };
  }, []);

  // ── teardown ────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      const eng = engineRef.current;
      if (eng) {
        try {
          eng.src.stop();
        } catch {
          /* already stopped */
        }
        const nodes: AudioNode[] = [
          ...eng.stereoStage,
          eng.src,
          eng.splitter,
          eng.gLL,
          eng.gRL,
          eng.gLR,
          eng.gRR,
          eng.merger,
          eng.lowShelf,
          eng.highShelf,
          eng.peaking,
          eng.panner,
          eng.preMaster,
          eng.scopeSplit,
          eng.analyserL,
          eng.analyserR,
        ];
        for (const nd of nodes) {
          try {
            nd.disconnect();
          } catch {
            /* noop */
          }
        }
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      try {
        trackerRef.current?.close();
      } catch {
        /* noop */
      }
      masterRef.current?.disconnect();
      ctxRef.current?.close().catch(() => {});
    };
  }, []);

  // ── derived UI state ───────────────────────────────────────────────────────
  const running = phase === "running";
  const camLive = camState === "live" && faceSeen;
  const camLost = camState === "live" && !faceSeen;
  const camBad = camState === "denied" || camState === "failed";
  const usingPointer = camState !== "live";

  const statusText = camLive
    ? "tracking · live"
    : camLost
      ? "face the camera, keep your head in frame"
      : usingPointer && running
        ? "pointer · demo — mouse drives the helm"
        : usingPointer
          ? "pointer · demo"
          : "";

  const btnPrimary =
    "min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90";
  const btnGhost =
    "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";
  const labelCls =
    "font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground";

  return (
    <main className="fixed inset-0 overflow-hidden bg-background text-foreground">
      {/* the vectorscope IS the page */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ background: "#040209", cursor: usingPointer ? "crosshair" : "default" }}
        onPointerMove={usingPointer ? pointerMove : undefined}
        onPointerDown={usingPointer ? pointerDown : undefined}
        onPointerUp={usingPointer ? pointerUp : undefined}
        onPointerLeave={usingPointer ? pointerUp : undefined}
      />

      {/* mirrored camera preview, small, corner */}
      <video
        ref={videoRef}
        className="pointer-events-none absolute right-3 top-3 z-20 h-24 w-32 scale-x-[-1] rounded-md border border-border/40 object-cover opacity-70"
        style={{ display: camState === "live" ? "block" : "none" }}
        playsInline
        muted
      />

      {/* status / error — functional, stays in immersive too */}
      {statusText && (
        <div
          className={`pointer-events-none absolute left-4 top-4 z-30 ${labelCls} ${
            camLost ? "text-destructive" : camLive ? "text-primary" : "text-muted-foreground"
          }`}
        >
          {statusText}
        </div>
      )}
      {phase === "error" && (
        <div className="absolute left-4 top-10 z-30 max-w-xs text-sm text-destructive">
          {errMsg || "could not start audio"} — tap Begin to retry.
        </div>
      )}
      {camBad && (
        <div className="absolute left-4 top-10 z-30 max-w-xs text-sm text-muted-foreground">
          {camState === "denied" ? "Camera denied" : "Camera unavailable"} — running on the
          pointer fallback (mouse = tilt, hold = jaw).
        </div>
      )}

      {/* FULL write-up chrome — hidden while immersive */}
      {!immersive && (
        <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 bg-gradient-to-t from-background/90 via-background/70 to-transparent p-4 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="max-w-xl">
              <p className={labelCls}>Head-pose · X–Y vectorscope</p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                Phosphor Helm
              </h1>
              <p className="mt-1 text-base leading-relaxed text-muted-foreground">
                Tilt your head to rotate Karel&rsquo;s stereo piano — and watch the same twist
                drawn as a Lissajous figure in violet phosphor.
                {running && (
                  <span className="text-muted-foreground/70">
                    {" "}
                    Now playing: {trackTitle}
                    {monoWidened ? " (mono, stereo-widened for the scope)" : ""}.
                  </span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNotesOpen(true)}
              className={`${btnGhost} shrink-0`}
            >
              Read the design notes
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!running ? (
              <button type="button" onClick={begin} className={btnPrimary} disabled={phase === "loading"}>
                {phase === "loading" ? "Loading…" : "Begin"}
              </button>
            ) : (
              <span className={`${labelCls} text-primary`}>live · {trackTitle}</span>
            )}

            {camState !== "live" ? (
              <button
                type="button"
                onClick={enableCamera}
                className={btnGhost}
                disabled={camState === "requesting"}
              >
                {camState === "requesting" ? "Starting camera…" : "Use camera"}
              </button>
            ) : (
              <span className={`${labelCls} text-primary`}>camera · live</span>
            )}

            {/* track picker */}
            <label className={`${labelCls} flex items-center gap-2`}>
              <span className="sr-only">Track</span>
              <select
                value={trackId}
                onChange={(e) => setTrackId(e.target.value)}
                disabled={running}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground disabled:opacity-50"
              >
                {PICKER.map((g) => (
                  <optgroup key={g.group} label={g.group}>
                    {g.tracks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <ImmersiveHud
              immersive={immersive}
              onToggle={toggle}
              title="Phosphor Helm"
              description={DESCRIPTION}
              howTo={HOW_TO}
            />
          </div>
        </div>
      )}

      {/* While immersive: only art + status + HUD. Give a minimal functional
          Begin if the audio has not started yet (so it stays demoable). */}
      {immersive && !running && phase !== "loading" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <button type="button" onClick={begin} className={btnPrimary}>
            Begin
          </button>
        </div>
      )}
      {immersive && (
        <ImmersiveHud
          immersive={immersive}
          onToggle={toggle}
          title="Phosphor Helm"
          description={DESCRIPTION}
          howTo={HOW_TO}
        />
      )}

      {/* design-notes modal */}
      {notesOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Phosphor Helm — design notes
              </h2>
              <button
                type="button"
                onClick={() => setNotesOpen(false)}
                className={btnGhost}
                aria-label="Close"
              >
                Close
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                An X–Y vectorscope plots the left channel against the right: for a stereo
                recording the dot traces a living Lissajous figure. Here your{" "}
                <span className="text-foreground">head is the conductor</span>.
              </p>
              <p>
                Head <span className="text-foreground">roll</span> applies a rotation matrix to
                the stereo [L,R] vector (Lout = L·cosθ − R·sinθ, Rout = L·sinθ + R·cosθ), built
                from a channel splitter, four gains and a merger. The image genuinely re-pans and
                the <span className="text-foreground">same angle</span> rotates the figure —
                sound-rotation and picture-rotation are one gesture. Yaw pans, pitch tilts the
                spectrum (down darkens, up brightens), and jaw-open opens a resonant peak and
                lengthens the phosphor trail.
              </p>
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground/80">
                Reference
              </p>
              <p>
                In the lineage of <span className="text-foreground">oscilloscope music</span> /
                X–Y vectorscope art — above all Jerobeam Fenderson&rsquo;s{" "}
                <span className="text-foreground">Oscilloscope Music</span>, the canonical modern
                practice of drawing shapes directly from a stereo waveform. This cycle&rsquo;s
                fresh anchor is <span className="text-foreground">DrawnBySound</span> (GitHub,
                updated 2026-10-04), which renders live audio into reactive oscilloscope shapes.
              </p>
              <p>
                Honest limits: the head estimate is calibration-free, so a hard initial tilt reads
                as a small offset; mono recordings are stereo-widened with a short Haas delay for
                the figure (a spread of Karel&rsquo;s audio, never a synthesized source). The
                pointer fallback is clearly labelled and never masquerades as live tracking.
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
