"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import {
  loadRealTrackBuffer,
  WELCOME_HOME_TRACKS,
  SNOWFLAKE_TRACKS,
} from "../_shared/welcomeHome";

// ─────────────────────────────────────────────────────────────────────────────
// 16032-headnave · "What if your physical head — tracked by the webcam — were
// how you walk through a room of Karel's own recordings?"
//
//   GRADUATES 15536-antiphon: that piece scattered six of Karel's REAL takes
//   across a dark nave as HRTF-spatialised voices you steered with WASD. Here
//   the keyboard becomes your body. MediaPipe FaceLandmarker reads a 6DOF head
//   pose from the webcam — yaw + pitch + translation out of the facial
//   transformation matrix — and drives the WebAudio listener's facing and
//   position through the field. Turn your head and his catalog swings around
//   your skull; lean in and a take blooms out of the dark. The mix is nothing
//   but where your head is pointing and standing.
//
//   Camera is a SECONDARY control layer. On load you steer instantly with the
//   pointer (and WASD/arrows) — zero permission prompts, never a dead screen —
//   and opt into head tracking with one button. If the camera is denied, the
//   model fails, or no face is found, it falls back to the pointer and says so.
//
//   ZERO synthesis — every voice is one of Karel's real looping recordings.
//   All audio routes through the shared ear-safety master; nothing touches
//   ctx.destination directly. Palette is Ikeda black-white-red (datamatics).
// ─────────────────────────────────────────────────────────────────────────────

// ── MediaPipe FaceLandmarker via runtime CDN (build-safe indirect import) ──────
const MEDIAPIPE_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21";
const MEDIAPIPE_WASM =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";
const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

interface FaceLandmarkerInst {
  detectForVideo(
    video: HTMLVideoElement,
    ts: number,
  ): {
    faceLandmarks: { x: number; y: number; z: number }[][];
    facialTransformationMatrixes?: { data: number[] }[]; // 4x4 column-major
  };
  close(): void;
}
interface MediaPipeVision {
  FilesetResolver: { forVisionTasks(wasmPath: string): Promise<unknown> };
  FaceLandmarker: {
    createFromOptions(
      fileset: unknown,
      opts: {
        baseOptions: { modelAssetPath: string; delegate?: "GPU" | "CPU" };
        runningMode: "VIDEO" | "IMAGE";
        numFaces?: number;
        outputFacialTransformationMatrixes?: boolean;
        outputFaceBlendshapes?: boolean;
      },
    ): Promise<FaceLandmarkerInst>;
  };
}
async function createFaceLandmarker(): Promise<FaceLandmarkerInst> {
  const mod = (await (new Function(
    `return import("${MEDIAPIPE_CDN}")`,
  )() as Promise<unknown>)) as unknown as MediaPipeVision;
  const fileset = await mod.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
  return mod.FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: FACE_MODEL, delegate: "GPU" },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFacialTransformationMatrixes: true,
  });
}

// ── the six voices, at fixed 3D coordinates in the nave ────────────────────────
// (required verified anon-servable ids: WELCOME_HOME[0,2,3,6,7] + SNOWFLAKE[0])
interface VoiceDef {
  id: string;
  title: string;
  where: string;
  pos: [number, number, number];
}
const VOICES: readonly VoiceDef[] = [
  {
    id: WELCOME_HOME_TRACKS[0].id, // Interplay
    title: WELCOME_HOME_TRACKS[0].title,
    where: "left · front",
    pos: [-6, 0.3, -6],
  },
  {
    id: WELCOME_HOME_TRACKS[2].id, // Welcome Home
    title: WELCOME_HOME_TRACKS[2].title,
    where: "right · front",
    pos: [6, 0.3, -6],
  },
  {
    id: SNOWFLAKE_TRACKS[0].id, // Snowflake
    title: SNOWFLAKE_TRACKS[0].title,
    where: "the altar · far",
    pos: [0, 0.9, -15],
  },
  {
    id: WELCOME_HOME_TRACKS[6].id, // Playa
    title: WELCOME_HOME_TRACKS[6].title,
    where: "right · rear",
    pos: [6, 0.3, 4],
  },
  {
    id: WELCOME_HOME_TRACKS[3].id, // The Knife
    title: WELCOME_HOME_TRACKS[3].title,
    where: "left · rear",
    pos: [-6, 0.3, 4],
  },
  {
    id: WELCOME_HOME_TRACKS[7].id, // Isolation
    title: WELCOME_HOME_TRACKS[7].title,
    where: "narthex · behind",
    pos: [0, 0.4, 10],
  },
] as const;
const LEN = VOICES.length;

// ── audio distance field (inverse model → strong proximity, whisper floor) ─────
const REF_DIST = 3.6;
const ROLLOFF = 1.1;
const MAX_DIST = 60;

// ── the nave (listener clamp + navigation) ─────────────────────────────────────
const EYE_Y = 1.5;
const NAVE_X = 7.0;
const NAVE_Z_NEAR = 10;
const NAVE_Z_FAR = -13;
const START_Z = 7;
const SMOOTH_POS = 0.06; // per-frame lerp toward target position (calm)
const SMOOTH_YAW = 0.07;

// pointer / keyboard mapping
const POINTER_YAW = 0.95; // rad at frame edge
const KEY_MOVE = 6.5; // m/s from WASD
const KEY_TURN = 1.7; // rad/s from Q·E / ← →

// head-pose mapping (relative to a captured calibration baseline)
const HEAD_YAW_GAIN = 1.5; // raw matrix yaw → listener yaw
const HEAD_X_GAIN = 22.0; // matrix translation x delta → nave x
const HEAD_Z_GAIN = 22.0; // matrix translation z delta (lean) → nave z
const HEAD_YAW_DEAD = 0.06;
const HEAD_TRANS_DEAD = 0.02;
const FACE_TIMEOUT_MS = 1600; // no face this long → fall back to pointer

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}
function lerp(a: number, b: number, k: number) {
  return a + (b - a) * k;
}
function applyDeadzone(v: number, dz: number) {
  if (v > dz) return v - dz;
  if (v < -dz) return v + dz;
  return 0;
}

// yaw (about Y) + pitch (about X) + translation from a column-major 4x4.
function readHeadPose(m: number[]): {
  yaw: number;
  pitch: number;
  tx: number;
  ty: number;
  tz: number;
} {
  // element [row + col*4]; rotation is the upper-left 3x3, translation is col 3.
  const r00 = m[0];
  const r10 = m[1];
  const r20 = m[2];
  const r12 = m[9];
  const r22 = m[10];
  const yaw = Math.atan2(-r20, Math.hypot(r10, r00));
  const pitch = Math.atan2(-r12, r22);
  return { yaw, pitch, tx: m[12], ty: m[13], tz: m[14] };
}

// ── WebGL2 field shaders ───────────────────────────────────────────────────────
const VERT = `#version 300 es
void main(){
  vec2 p = vec2((gl_VertexID == 2) ? 3.0 : -1.0, (gl_VertexID == 1) ? 3.0 : -1.0);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 uRes;
uniform vec4 uVoice[6];   // (px, py [top-left], intensity, focus 0/1)
uniform float uEnergy;    // global mix energy 0..1
uniform float uReady;     // 1 once audio is live

const vec3 BG   = vec3(0.020, 0.024, 0.039);
const vec3 BONE = vec3(0.930, 0.930, 0.905);
const vec3 RED  = vec3(0.831, 0.078, 0.227);

void main(){
  vec2 fc = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y); // top-left origin
  vec3 col = BG;

  // faint datamatics grid — precise thin ticks
  vec2 g = mod(fc, 46.0);
  float grid = step(min(g.x, g.y), 1.0);
  col += BONE * grid * 0.020;

  // horizon line through the eye level
  float horizon = 1.0 - smoothstep(0.0, 1.4, abs(fc.y - uRes.y * 0.5));
  col += BONE * horizon * 0.05;

  // the six voice nodes — bloom by intensity, focused one shifts to oxblood
  for (int i = 0; i < 6; i++) {
    vec4 v = uVoice[i];
    float amt = v.z;
    if (amt <= 0.001) continue;
    float d = distance(fc, v.xy);
    float coreR = 5.0 + amt * 9.0;
    float core = exp(-(d * d) / (2.0 * coreR * coreR));
    float halo = exp(-d / (34.0 + amt * 150.0));
    vec3 vc = mix(BONE, RED, v.w);
    col += vc * (core * 1.35 + halo * 0.28) * amt;
    // a precise ring at the node — datamatics reticle around each take
    float ring = 1.0 - smoothstep(0.0, 1.5, abs(d - (coreR + 6.0)));
    col += vc * ring * 0.18 * amt;
  }

  // central "you are here" reticle — oxblood, breathing with mix energy
  vec2 c = uRes * 0.5;
  float dx = abs(fc.x - c.x);
  float dy = abs(fc.y - c.y);
  float arm = 10.0 + uEnergy * 8.0;
  float cross =
      step(dx, 0.9) * step(dy, arm) + step(dy, 0.9) * step(dx, arm);
  col += RED * clamp(cross, 0.0, 1.0) * (0.35 + uReady * 0.55);

  // gentle vignette
  vec2 uv = fc / uRes;
  float vig = smoothstep(1.15, 0.35, distance(uv, vec2(0.5)));
  col *= 0.55 + 0.45 * vig;

  outColor = vec4(col, 1.0);
}`;

type Phase = "idle" | "loading" | "live";
type Control = "pointer" | "head";

interface Voice {
  def: VoiceDef;
  src: AudioBufferSourceNode | null;
  panner: PannerNode | null;
  gain: GainNode | null;
  analyser: AnalyserNode | null;
  data: Uint8Array | null;
  amp: number;
  // per-frame projected screen state
  sx: number;
  sy: number;
  inten: number;
  focus: number;
  loaded: boolean;
}

export default function HeadNavePage() {
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const hudCanvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [control, setControl] = useState<Control>("pointer");
  const [webglOk, setWebglOk] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [camBusy, setCamBusy] = useState(false);
  const [hud, setHud] = useState<{ focus: string; loaded: number }>({
    focus: "—",
    loaded: 0,
  });

  // audio
  const ctxRef = useRef<AudioContext | null>(null);
  const safeRef = useRef<SafeMaster | null>(null);
  const enteredRef = useRef(false);
  const voicesRef = useRef<Voice[]>(
    VOICES.map((def) => ({
      def,
      src: null,
      panner: null,
      gain: null,
      analyser: null,
      data: null,
      amp: 0,
      sx: 0,
      sy: 0,
      inten: 0,
      focus: 0,
      loaded: false,
    })),
  );

  // GL
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const progRef = useRef<WebGLProgram | null>(null);
  const uniRef = useRef<{
    res: WebGLUniformLocation | null;
    voice: WebGLUniformLocation | null;
    energy: WebGLUniformLocation | null;
    ready: WebGLUniformLocation | null;
  } | null>(null);
  const vaoRef = useRef<WebGLVertexArrayObject | null>(null);

  // navigation — a single target the active control writes, smoothed each frame
  const targetRef = useRef({ x: 0, z: START_Z, yaw: 0 });
  const curRef = useRef({ x: 0, z: START_Z, yaw: 0 });
  const keysRef = useRef<Set<string>>(new Set());
  const pointerRef = useRef<{ nx: number; ny: number; on: boolean }>({
    nx: 0,
    ny: 0,
    on: false,
  });

  // head tracking
  const controlRef = useRef<Control>("pointer");
  const landmarkerRef = useRef<FaceLandmarkerInst | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const headBaseRef = useRef<{
    yaw: number;
    tx: number;
    tz: number;
  } | null>(null);
  const lastFaceRef = useRef(0);
  const lastVideoTsRef = useRef(-1);
  const faceLostNotedRef = useRef(false);

  const rafRef = useRef(0);
  const lastTsRef = useRef(0);
  const hudTickRef = useRef(0);
  const phaseRef = useRef<Phase>("idle");

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    controlRef.current = control;
  }, [control]);

  // ── GL init + the render/navigate loop (alive before any audio) ──────────────
  useEffect(() => {
    const glCanvas = glCanvasRef.current;
    const hudCanvas = hudCanvasRef.current;
    const wrap = wrapRef.current;
    if (!glCanvas || !hudCanvas || !wrap) return;

    let gl: WebGL2RenderingContext | null = null;
    try {
      gl = glCanvas.getContext("webgl2", {
        antialias: true,
        alpha: false,
        premultipliedAlpha: false,
      });
    } catch {
      gl = null;
    }
    if (!gl) {
      setWebglOk(false);
    } else {
      glRef.current = gl;
      const compile = (type: number, src: string): WebGLShader | null => {
        const sh = gl!.createShader(type);
        if (!sh) return null;
        gl!.shaderSource(sh, src);
        gl!.compileShader(sh);
        if (!gl!.getShaderParameter(sh, gl!.COMPILE_STATUS)) {
          gl!.deleteShader(sh);
          return null;
        }
        return sh;
      };
      const vs = compile(gl.VERTEX_SHADER, VERT);
      const fs = compile(gl.FRAGMENT_SHADER, FRAG);
      const prog = gl.createProgram();
      if (vs && fs && prog) {
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (gl.getProgramParameter(prog, gl.LINK_STATUS)) {
          progRef.current = prog;
          gl.useProgram(prog);
          uniRef.current = {
            res: gl.getUniformLocation(prog, "uRes"),
            voice: gl.getUniformLocation(prog, "uVoice"),
            energy: gl.getUniformLocation(prog, "uEnergy"),
            ready: gl.getUniformLocation(prog, "uReady"),
          };
          vaoRef.current = gl.createVertexArray();
        } else {
          setWebglOk(false);
        }
      } else {
        setWebglOk(false);
      }
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
    }

    const hudCtx = hudCanvas.getContext("2d");
    const voiceBuf = new Float32Array(LEN * 4);

    const resize = () => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      for (const cv of [glCanvas, hudCanvas]) {
        cv.width = Math.max(1, Math.floor(w * dpr));
        cv.height = Math.max(1, Math.floor(h * dpr));
        cv.style.width = "100%";
        cv.style.height = "100%";
      }
      if (gl) gl.viewport(0, 0, glCanvas.width, glCanvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    const applyListener = (
      ctx: AudioContext,
      x: number,
      z: number,
      fwd: { x: number; z: number },
    ) => {
      const l = ctx.listener;
      const now = ctx.currentTime;
      if (l.positionX) {
        l.positionX.setTargetAtTime(x, now, 0.03);
        l.positionY.setTargetAtTime(EYE_Y, now, 0.03);
        l.positionZ.setTargetAtTime(z, now, 0.03);
        l.forwardX.setTargetAtTime(fwd.x, now, 0.03);
        l.forwardY.setTargetAtTime(0, now, 0.03);
        l.forwardZ.setTargetAtTime(fwd.z, now, 0.03);
        l.upX.setTargetAtTime(0, now, 0.03);
        l.upY.setTargetAtTime(1, now, 0.03);
        l.upZ.setTargetAtTime(0, now, 0.03);
      } else {
        const ld = l as unknown as {
          setPosition(x: number, y: number, z: number): void;
          setOrientation(
            fx: number,
            fy: number,
            fz: number,
            ux: number,
            uy: number,
            uz: number,
          ): void;
        };
        ld.setPosition(x, EYE_Y, z);
        ld.setOrientation(fwd.x, 0, fwd.z, 0, 1, 0);
      }
    };

    // read the webcam → head pose → nav target (head control only)
    const runHeadTracking = (tNow: number) => {
      const lm = landmarkerRef.current;
      const video = videoRef.current;
      if (!lm || !video || video.readyState < 2) return;
      const vts = video.currentTime;
      if (vts === lastVideoTsRef.current) return; // no new frame
      lastVideoTsRef.current = vts;

      let res: ReturnType<FaceLandmarkerInst["detectForVideo"]>;
      try {
        res = lm.detectForVideo(video, performance.now());
      } catch {
        return;
      }
      const mtx = res.facialTransformationMatrixes?.[0]?.data;
      const hasFace = res.faceLandmarks?.[0]?.length ? true : false;
      if (!mtx || mtx.length < 16 || !hasFace) return;

      lastFaceRef.current = tNow;
      if (faceLostNotedRef.current) {
        faceLostNotedRef.current = false;
        setNotice(null);
      }
      const pose = readHeadPose(mtx);
      if (!headBaseRef.current) {
        headBaseRef.current = { yaw: pose.yaw, tx: pose.tx, tz: pose.tz };
      }
      const base = headBaseRef.current;

      const dYaw = applyDeadzone(pose.yaw - base.yaw, HEAD_YAW_DEAD);
      const dX = applyDeadzone(pose.tx - base.tx, HEAD_TRANS_DEAD);
      const dZ = applyDeadzone(pose.tz - base.tz, HEAD_TRANS_DEAD);

      // turn your head right → face right; lean left/right → step across the
      // nave; lean toward the screen → walk forward toward the altar.
      targetRef.current.yaw = clamp(dYaw * HEAD_YAW_GAIN, -1.4, 1.4);
      targetRef.current.x = clamp(dX * HEAD_X_GAIN, -NAVE_X, NAVE_X);
      targetRef.current.z = clamp(START_Z - dZ * HEAD_Z_GAIN, NAVE_Z_FAR, NAVE_Z_NEAR);
    };

    const frame = (tsMs: number) => {
      rafRef.current = requestAnimationFrame(frame);
      const ts = tsMs / 1000;
      if (lastTsRef.current === 0) lastTsRef.current = ts;
      let dt = ts - lastTsRef.current;
      lastTsRef.current = ts;
      if (!(dt > 0) || dt > 0.05) dt = 0.016;

      const activeControl = controlRef.current;

      // 1) gather control input → write nav target
      if (activeControl === "head") {
        runHeadTracking(tsMs);
        // face-loss watchdog
        if (
          landmarkerRef.current &&
          lastFaceRef.current > 0 &&
          tsMs - lastFaceRef.current > FACE_TIMEOUT_MS &&
          !faceLostNotedRef.current
        ) {
          faceLostNotedRef.current = true;
          setNotice("No face found — steer with your pointer while you re-centre.");
        }
      } else {
        // pointer + keyboard drive the target
        const pt = pointerRef.current;
        const keys = keysRef.current;
        const held = (a: string, b?: string) =>
          keys.has(a) || (b !== undefined && keys.has(b));

        if (pt.on) {
          targetRef.current.yaw = clamp(pt.nx * POINTER_YAW, -1.4, 1.4);
          targetRef.current.x = clamp(pt.nx * NAVE_X * 0.92, -NAVE_X, NAVE_X);
          // top of frame → forward (toward the altar, -z); bottom → narthex
          const fwd01 = (1 - pt.ny) * 0.5; // 0 bottom .. 1 top
          targetRef.current.z = clamp(
            lerp(NAVE_Z_NEAR, NAVE_Z_FAR, fwd01),
            NAVE_Z_FAR,
            NAVE_Z_NEAR,
          );
        }

        // keyboard nudges the target (walk + turn)
        let mf = 0;
        let mr = 0;
        let turn = 0;
        if (held("w", "arrowup")) mf += 1;
        if (held("s", "arrowdown")) mf -= 1;
        if (held("d")) mr += 1;
        if (held("a")) mr -= 1;
        if (held("q", "arrowleft")) turn += 1;
        if (held("e", "arrowright")) turn -= 1;
        if (mf || mr || turn) {
          const yaw = targetRef.current.yaw + turn * KEY_TURN * dt;
          const f = { x: Math.sin(yaw), z: -Math.cos(yaw) };
          const r = { x: Math.cos(yaw), z: Math.sin(yaw) };
          targetRef.current.yaw = clamp(yaw, -1.4, 1.4);
          targetRef.current.x = clamp(
            targetRef.current.x + (f.x * mf + r.x * mr) * KEY_MOVE * dt,
            -NAVE_X,
            NAVE_X,
          );
          targetRef.current.z = clamp(
            targetRef.current.z + (f.z * mf + r.z * mr) * KEY_MOVE * dt,
            NAVE_Z_FAR,
            NAVE_Z_NEAR,
          );
        }
      }

      // 2) smooth current toward target (calm, never jittery)
      const kPos = clamp(SMOOTH_POS * (dt / 0.016), 0, 1);
      const kYaw = clamp(SMOOTH_YAW * (dt / 0.016), 0, 1);
      const cur = curRef.current;
      const tgt = targetRef.current;
      cur.x = lerp(cur.x, tgt.x, kPos);
      cur.z = lerp(cur.z, tgt.z, kPos);
      cur.yaw = lerp(cur.yaw, tgt.yaw, kYaw);
      const fwd = { x: Math.sin(cur.yaw), z: -Math.cos(cur.yaw) };
      const right = { x: Math.cos(cur.yaw), z: Math.sin(cur.yaw) };

      // 3) drive the WebAudio listener from head/pointer position + facing
      const ctx = ctxRef.current;
      if (ctx && enteredRef.current) applyListener(ctx, cur.x, cur.z, fwd);

      // 4) per-voice: analyser amp + first-person projection + audio emphasis
      const voices = voicesRef.current;
      const W = glCanvas.width;
      const H = glCanvas.height;
      const aspect = W / Math.max(1, H);
      let focusIdx = -1;
      let focusScore = 0;
      let energy = 0;
      let loadedN = 0;

      for (let i = 0; i < voices.length; i++) {
        const v = voices[i];
        if (v.loaded) loadedN++;
        if (v.analyser && v.data) {
          v.analyser.getByteFrequencyData(v.data as Uint8Array<ArrayBuffer>);
          let sum = 0;
          for (let k = 0; k < v.data.length; k++) sum += v.data[k];
          const a = sum / (v.data.length * 255);
          v.amp = lerp(v.amp, a, clamp(dt * 5, 0, 1));
          energy += v.amp;
        } else if (phaseRef.current !== "live") {
          // idle: gentle breathing so the field is alive before audio
          v.amp = 0.12 + 0.08 * (0.5 + 0.5 * Math.sin(ts * 0.5 + i));
        }

        const [vx, vy, vz] = v.def.pos;
        const dx = vx - cur.x;
        const dz = vz - cur.z;
        const camZ = dx * fwd.x + dz * fwd.z; // ahead when > 0
        const camX = dx * right.x + dz * right.z;
        const dist = Math.hypot(dx, dz) + 1e-3;
        const proximity = clamp(REF_DIST / dist, 0, 1.6);
        const front = clamp(camZ / dist, 0, 1);

        // projection to screen (top-left normalised → pixels)
        const near = 0.4;
        let su: number;
        let sv: number;
        if (camZ > near) {
          const focal = 1.15;
          const ndcX = (camX / camZ) * focal;
          const ndcY = ((vy - EYE_Y) / camZ) * focal;
          su = 0.5 + (0.5 * ndcX) / aspect;
          sv = 0.5 - 0.5 * ndcY - 0.06; // nudge nodes above dead-centre
        } else {
          // behind you — pin to the lower edge on the correct side
          su = camX > 0 ? 0.94 : 0.06;
          sv = 0.9;
        }
        v.sx = clamp(su, 0.02, 0.98) * W;
        v.sy = clamp(sv, 0.02, 0.98) * H;

        const live = phaseRef.current === "live" ? 1 : 0.55;
        v.inten =
          (0.1 + v.amp * 0.5 + proximity * 0.34) *
          (0.32 + 0.68 * front) *
          live;

        const score = front * proximity;
        if (camZ > near && score > focusScore) {
          focusScore = score;
          focusIdx = i;
        }

        // audio emphasis: mostly HRTF/distance, a gentle lift toward focus
        if (v.gain && ctx) {
          const target = clamp(0.5 + front * proximity * 0.28, 0, 0.9);
          v.gain.gain.setTargetAtTime(target, ctx.currentTime, 0.25);
        }
      }
      for (let i = 0; i < voices.length; i++) {
        voices[i].focus = i === focusIdx ? 1 : 0;
      }
      energy = clamp(energy / LEN, 0, 1);

      // 5) render the WebGL2 field
      if (gl && progRef.current && uniRef.current && vaoRef.current) {
        for (let i = 0; i < voices.length; i++) {
          voiceBuf[i * 4] = voices[i].sx;
          voiceBuf[i * 4 + 1] = voices[i].sy;
          voiceBuf[i * 4 + 2] = clamp(voices[i].inten, 0, 2);
          voiceBuf[i * 4 + 3] = voices[i].focus;
        }
        gl.useProgram(progRef.current);
        gl.bindVertexArray(vaoRef.current);
        gl.uniform2f(uniRef.current.res, W, H);
        if (uniRef.current.voice) gl.uniform4fv(uniRef.current.voice, voiceBuf);
        gl.uniform1f(uniRef.current.energy, energy);
        gl.uniform1f(uniRef.current.ready, phaseRef.current === "live" ? 1 : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      // 6) Canvas2D HUD overlay — datamatics numeric readouts + frame ticks
      if (hudCtx) {
        drawHud(hudCtx, W, H, cur, voices, focusIdx, activeControl);
      }

      // 7) throttled React HUD
      hudTickRef.current++;
      if (hudTickRef.current % 15 === 0) {
        setHud({
          focus: focusIdx >= 0 ? voices[focusIdx].def.title : "—",
          loaded: loadedN,
        });
      }
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const g = glRef.current;
      if (g) {
        if (progRef.current) g.deleteProgram(progRef.current);
        if (vaoRef.current) g.deleteVertexArray(vaoRef.current);
      }
      progRef.current = null;
      vaoRef.current = null;
      glRef.current = null;
    };
  }, []);

  // ── pointer over the field ──────────────────────────────────────────────────
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
    pointerRef.current = { nx: clamp(nx, -1, 1), ny: clamp(ny, -1, 1), on: true };
  }, []);
  const onPointerLeave = useCallback(() => {
    pointerRef.current.on = false;
  }, []);

  // ── keyboard ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const nav = new Set([
      "w",
      "a",
      "s",
      "d",
      "q",
      "e",
      "arrowup",
      "arrowdown",
      "arrowleft",
      "arrowright",
    ]);
    const down = (ev: KeyboardEvent) => {
      const k = ev.key.toLowerCase();
      if (nav.has(k)) {
        keysRef.current.add(k);
        if (phaseRef.current === "live" && controlRef.current === "pointer") {
          ev.preventDefault();
        }
      }
    };
    const up = (ev: KeyboardEvent) => {
      keysRef.current.delete(ev.key.toLowerCase());
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // ── Enter: start audio, load the six real takes, attach panners ─────────────
  const enter = useCallback(async () => {
    if (phaseRef.current !== "idle") return;
    setError(null);
    setNotice(null);
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
      }
      enteredRef.current = true;
      setPhase("live");

      let anyOk = false;
      let anyFail = false;
      for (const v of voicesRef.current) {
        if (!ctxRef.current || ctxRef.current.state === "closed") break;
        if (!enteredRef.current) break;
        try {
          const { buffer } = await loadRealTrackBuffer(ctx, v.def.id);
          if (!enteredRef.current) break;

          const src = ctx.createBufferSource();
          src.buffer = buffer;
          src.loop = true;

          const panner = ctx.createPanner();
          try {
            panner.panningModel = "HRTF";
          } catch {
            panner.panningModel = "equalpower";
          }
          panner.distanceModel = "inverse";
          panner.refDistance = REF_DIST;
          panner.rolloffFactor = ROLLOFF;
          panner.maxDistance = MAX_DIST;
          if (panner.positionX) {
            panner.positionX.value = v.def.pos[0];
            panner.positionY.value = v.def.pos[1];
            panner.positionZ.value = v.def.pos[2];
          } else {
            (
              panner as unknown as {
                setPosition(x: number, y: number, z: number): void;
              }
            ).setPosition(v.def.pos[0], v.def.pos[1], v.def.pos[2]);
          }

          const gain = ctx.createGain();
          gain.gain.value = 0.5;

          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          analyser.smoothingTimeConstant = 0.85;

          // src → panner → gain → safeMaster.input ; src → analyser (passive)
          src.connect(panner);
          panner.connect(gain);
          gain.connect(safe.input);
          src.connect(analyser);
          src.start();

          v.src = src;
          v.panner = panner;
          v.gain = gain;
          v.analyser = analyser;
          v.data = new Uint8Array(analyser.frequencyBinCount);
          v.loaded = true;
          anyOk = true;
        } catch {
          anyFail = true;
        }
      }

      if (!anyOk) {
        enteredRef.current = false;
        setError(
          "None of Karel's takes could load right now. Check your connection and try entering again.",
        );
        setPhase("idle");
        return;
      }
      if (anyFail) {
        setNotice(
          "Some takes couldn't load and were skipped — the rest of the field is sounding.",
        );
      }
    } catch (err) {
      enteredRef.current = false;
      setError(
        err instanceof Error
          ? `The nave could not open (${err.message}). Try again.`
          : "The nave could not open. Try again.",
      );
      setPhase("idle");
    }
  }, []);

  // ── enable head tracking (secondary control layer) ──────────────────────────
  const enableHead = useCallback(async () => {
    if (camBusy || controlRef.current === "head") return;
    setCamBusy(true);
    setError(null);
    setNotice(null);
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false,
      });
    } catch {
      setNotice("Camera unavailable — steer with your pointer.");
      setCamBusy(false);
      return;
    }
    streamRef.current = stream;
    const video = videoRef.current;
    if (video) {
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        /* autoplay quirk — the RAF loop reads frames regardless */
      }
    }

    try {
      const lm = await createFaceLandmarker();
      landmarkerRef.current = lm;
    } catch {
      // model failed to load — release the camera, stay on pointer
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (video) video.srcObject = null;
      setNotice(
        "Head tracker couldn't load — steer with your pointer.",
      );
      setCamBusy(false);
      return;
    }

    headBaseRef.current = null; // recalibrate to wherever your head rests now
    lastFaceRef.current = 0;
    faceLostNotedRef.current = false;
    setControl("head");
    setNotice(
      "Head tracking on — hold still a moment to calibrate, then lean and turn.",
    );
    setCamBusy(false);
  }, [camBusy]);

  const backToPointer = useCallback(() => {
    setControl("pointer");
    setNotice(null);
    const lm = landmarkerRef.current;
    landmarkerRef.current = null;
    try {
      lm?.close();
    } catch {
      /* noop */
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) video.srcObject = null;
    headBaseRef.current = null;
  }, []);

  // ── full teardown on unmount ────────────────────────────────────────────────
  useEffect(() => {
    const voices = voicesRef.current;
    return () => {
      enteredRef.current = false;
      for (const v of voices) {
        try {
          v.src?.stop();
        } catch {
          /* already stopped */
        }
        try {
          v.src?.disconnect();
          v.gain?.disconnect();
          v.panner?.disconnect();
          v.analyser?.disconnect();
        } catch {
          /* ctx closing */
        }
      }
      try {
        landmarkerRef.current?.close();
      } catch {
        /* noop */
      }
      landmarkerRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      safeRef.current?.disconnect();
      safeRef.current = null;
      const ac = ctxRef.current;
      ctxRef.current = null;
      if (ac && ac.state !== "closed") void ac.close();
    };
  }, []);

  const live = phase === "live";

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      {/* the WebGL2 field + Canvas2D datamatics overlay */}
      <div
        ref={wrapRef}
        className="absolute inset-0 touch-none"
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
      >
        <canvas
          ref={glCanvasRef}
          className="absolute inset-0 block h-full w-full"
        />
        <canvas
          ref={hudCanvasRef}
          className="pointer-events-none absolute inset-0 block h-full w-full"
        />
      </div>

      {/* hidden webcam feed for MediaPipe */}
      <video
        ref={videoRef}
        className="hidden"
        muted
        playsInline
        autoPlay
        width={640}
        height={480}
      />

      {!webglOk && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 flex justify-center">
          <p className="max-w-md rounded-md border border-border bg-background/70 px-4 py-2 text-sm text-destructive">
            WebGL2 is unavailable in this browser — the field can&apos;t render,
            but the spatial audio still follows your pointer or head.
          </p>
        </div>
      )}

      {/* header / title */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-2 p-6">
        <header className="max-w-xl space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            16032 · headnave · webcam 6DOF · graduates 15536-antiphon
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Walk his nave with your head
          </h1>
          <p className="text-base text-muted-foreground">
            Six of Karel&apos;s real takes stand at fixed points in a dark room.
            Your head is the listener — lean and turn to move through them. The
            mix is nothing but where your head is pointing and standing.
          </p>
          {live && (
            <p className="text-sm text-primary">
              {control === "head" ? "Head" : "Pointer"} · facing ·{" "}
              {hud.focus} · {hud.loaded}/{LEN} takes sounding
            </p>
          )}
        </header>
      </div>

      {/* top-right: design notes */}
      <button
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-6 z-30 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
      >
        Read the design notes
      </button>

      {/* bottom controls */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-3 p-6 pb-16">
        {error && <p className="max-w-2xl text-sm text-destructive">{error}</p>}
        {notice && !error && (
          <p
            className={`max-w-2xl text-sm ${
              notice.startsWith("Camera unavailable") ||
              notice.startsWith("Head tracker") ||
              notice.startsWith("No face")
                ? "text-destructive"
                : "text-muted-foreground"
            }`}
          >
            {notice}
          </p>
        )}
        {!live && (
          <p className="max-w-2xl text-sm text-muted-foreground">
            Enter, then steer with your pointer (or WASD / arrows) right away —
            no camera needed. Turn on head tracking whenever you want your body
            to be the controller.
          </p>
        )}
        {live && control === "pointer" && (
          <p className="max-w-2xl text-sm text-muted-foreground">
            Move your pointer across the field to turn and walk · WASD / arrows
            also steer · Q · E turn.
          </p>
        )}
        {live && control === "head" && (
          <p className="max-w-2xl text-sm text-muted-foreground">
            Turn your head to face a take · lean left / right to step across the
            room · lean toward the screen to walk forward toward the altar.
          </p>
        )}

        <div className="pointer-events-auto flex flex-wrap items-center gap-3">
          {!live && (
            <button
              onClick={() => void enter()}
              disabled={phase === "loading"}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {phase === "loading" ? "Opening the nave…" : "Enter"}
            </button>
          )}
          {live && control === "pointer" && (
            <button
              onClick={() => void enableHead()}
              disabled={camBusy}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
            >
              {camBusy ? "Starting camera…" : "Enable head tracking (webcam)"}
            </button>
          )}
          {live && control === "head" && (
            <button
              onClick={backToPointer}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Back to pointer
            </button>
          )}
        </div>
      </div>

      {/* design-notes modal */}
      {showNotes && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg space-y-4 overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight">
              Design notes
            </h2>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <strong className="text-foreground">The one question:</strong>{" "}
                what if your physical head — tracked by the webcam — were how you
                walk through a room of Karel&apos;s own recordings?
              </p>
              <p>
                Six of his real takes are placed at fixed 3D points in a dark
                nave — left/right front, the altar far ahead, left/right rear,
                and the narthex behind you. Each loops its own buffer forever,
                HRTF-spatialised by its own <code>PannerNode</code> on an inverse
                distance model. An <code>AudioListener</code> is your body. It is
                driven from a 6DOF head pose: MediaPipe FaceLandmarker&apos;s
                facial transformation matrix gives head yaw, pitch and
                translation; yaw becomes the listener&apos;s facing, lean-x steps
                you across the room, and leaning toward the camera walks you
                forward toward the altar. Small deadzones and heavy smoothing
                keep it calm, not twitchy.
              </p>
              <p>
                This graduates{" "}
                <strong className="text-foreground">15536-antiphon</strong>:
                that piece scattered the same kind of field but you steered it
                with the keyboard. Here the keyboard becomes your actual head —
                embodied navigation instead of arrow keys. It builds on the
                webcam-head-tracker-for-binaural-auralization line (MediaPipe
                FaceMesh 468-landmark 6DOF head tracking driving a binaural
                listener) and on{" "}
                <strong className="text-foreground">
                  Navig-AI-tion (CHI 2026)
                </strong>
                , where spatial-audio directional cues let you navigate a space
                by orientation alone.
              </p>
              <p>
                The camera is a{" "}
                <strong className="text-foreground">secondary</strong> control
                layer. The default is a pointer/keyboard fallback that drives the
                exact same listener — so the field responds instantly with zero
                permission prompts. If the camera is denied, the model fails, or
                no face is found, it falls back to the pointer and says so.
              </p>
              <p>
                Palette is Ikeda black-white-red (datamatics): near-black ground,
                bone-white nodes, one oxblood-red accent for the focused voice and
                the &ldquo;you are here&rdquo; reticle. Thin ticks, a precise
                grid, monospace numeric readouts baked into the canvas. It is
                rule-10 clean — only Karel&apos;s real takes, zero synthesis — and
                everything routes through the shared ear-safety master; nothing
                touches the speakers directly.
              </p>
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

      <PrototypeNav slugs={["16032-headnave"]} />
    </main>
  );
}

// ── Canvas2D datamatics overlay: thin frame ticks + monospace readouts ─────────
function drawHud(
  g: CanvasRenderingContext2D,
  W: number,
  H: number,
  cur: { x: number; z: number; yaw: number },
  voices: Voice[],
  focusIdx: number,
  control: Control,
) {
  const RED = "#d4143a";
  const BONE = "rgba(233,233,231,0.72)";
  const DIM = "rgba(233,233,231,0.32)";
  g.clearRect(0, 0, W, H);
  const s = Math.min(2, Math.max(1, W / 900)); // scale ticks with resolution
  g.lineWidth = Math.max(1, s);

  // corner ticks (datamatics frame)
  const m = 18 * s;
  const t = 12 * s;
  g.strokeStyle = DIM;
  g.beginPath();
  // top-left
  g.moveTo(m, m + t);
  g.lineTo(m, m);
  g.lineTo(m + t, m);
  // top-right
  g.moveTo(W - m - t, m);
  g.lineTo(W - m, m);
  g.lineTo(W - m, m + t);
  // bottom-left
  g.moveTo(m, H - m - t);
  g.lineTo(m, H - m);
  g.lineTo(m + t, H - m);
  // bottom-right
  g.moveTo(W - m - t, H - m);
  g.lineTo(W - m, H - m);
  g.lineTo(W - m, H - m - t);
  g.stroke();

  // numeric readouts, bottom-left
  const fs = Math.round(12 * s);
  g.font = `${fs}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  g.textBaseline = "alphabetic";
  const yawDeg = ((cur.yaw * 180) / Math.PI).toFixed(0).padStart(4, " ");
  const px = cur.x >= 0 ? `+${cur.x.toFixed(1)}` : cur.x.toFixed(1);
  const pz = cur.z >= 0 ? `+${cur.z.toFixed(1)}` : cur.z.toFixed(1);
  const bx = m + 4 * s;
  let by = H - m - t - 8 * s;
  const lh = fs * 1.5;
  g.fillStyle = BONE;
  g.fillText(`SRC ${control.toUpperCase().padEnd(7)} ${voices.length} TAKES`, bx, by);
  by -= lh;
  g.fillText(`POS x${px}  z${pz}`, bx, by);
  by -= lh;
  g.fillStyle = RED;
  g.fillText(`YAW ${yawDeg} DEG`, bx, by);

  // focused-voice label near the reticle
  if (focusIdx >= 0) {
    const v = voices[focusIdx];
    g.fillStyle = RED;
    g.font = `${fs}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    const label = v.def.title.toUpperCase();
    const tw = g.measureText(label).width;
    g.fillText(label, v.sx - tw / 2, v.sy - 16 * s);
  }

  // faint index ticks for every take, wherever it projects
  g.font = `${Math.round(10 * s)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  for (let i = 0; i < voices.length; i++) {
    const v = voices[i];
    if (i === focusIdx) continue;
    g.fillStyle = DIM;
    g.fillText(String(i + 1).padStart(2, "0"), v.sx - 6 * s, v.sy + 22 * s);
  }
}
