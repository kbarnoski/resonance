"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 23040-priorbody — a closed-loop spatial-hearing trainer. Karel's ONE piano
// take is placed at a HIDDEN direction on a sphere around you. You point your
// body (or the pointer) toward where you HEAR it; when you commit a guess the
// piece measures its prediction error, splits it into LATERAL (left/right),
// POLAR (up/down) and HEMIFIELD (front/back) parts, and updates three precisions
// by a variational-free-energy gradient step. As your precisions climb across
// trials, the SAME recording sharpens from an omnidirectional smear into a
// pinpoint HRTF source, and the volumetric belief-field collapses from a diffuse
// ice-blue cloud into a tight beam — your ear and the light sharpen together.
//
// This is the action-perception loop that Barumerli, Meyer-Kahlen & Picinali
// name as future work in "Framing Spatial Hearing within the Free Energy
// Principle" (arXiv:2610.23196, 2026): the body is the ACTION, the visual
// feedback is the OBSERVATION, the three precisions descend VFE live.
//
// AUDIO (never synthesis): one real take (loadRealTrackBuffer) → one looping
// BufferSource fanned into (a) a DIRECT HRTF PannerNode at the true direction,
// (b) a DIFFUSE decorrelated send (dual pre-delays → merger, non-localized), and
// (c) a FLARE send through a second HRTF panner at the true direction that swells
// on commit by the prediction-error magnitude. Crossfade diffuse→direct and the
// panner cone tighten with precision. Everything terminates at createSafeMaster.
//
// RENDER: raw WebGL2 fragment-shader RAYMARCH of a volumetric density — a belief
// lobe along your pointing direction (width set by precision), a faint clinical
// az/el shell grid, and a warm prediction-error marker/burst at the true
// direction. No three.js, no Canvas2D, no grain. Cool clinical palette (slate /
// ice-blue / white) with ONE warm accent reserved for prediction-error flares.
//
// INPUT (graceful): full-body pose (MediaPipe PoseLandmarker) — shoulder-line +
// reaching wrist → azimuth/elevation; sustained point auto-commits. A pointer +
// keyboard fallback drives the IDENTICAL action (drag to aim, click/Enter to
// commit, arrows nudge) so the whole loop is audible+visible with no camera.
// ─────────────────────────────────────────────────────────────────────────────

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useImmersive, ImmersiveHud, ImmersiveToggle } from "../_shared/immersive";
import { COLLECTIONS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import {
  createPoseTracker,
  startCamera,
  POSE_LM,
  type PoseLandmarkerInst,
  type Landmark,
} from "../_shared/cameraTracking";

// ── constants ────────────────────────────────────────────────────────────────
const DEFAULT_TRACK = "eba95845-cdbf-41d8-9c5d-8679686811ad"; // "Bath"
const SRC_RADIUS = 3.0; // metres the HRTF source sits at
const COMMIT_COOLDOWN = 1300; // ms lock-out after a guess
const BODY_HOLD_MS = 600; // sustained point → auto-commit
const BODY_STABLE = 0.11; // max aim drift (unit-vec dist) to count as "held"

// ── small maths ──────────────────────────────────────────────────────────────
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
// azimuth (0 = front, +right), elevation (+up) → unit vector; matches the shader
function dirVec(az: number, el: number): [number, number, number] {
  const ce = Math.cos(el);
  return [Math.sin(az) * ce, Math.sin(el), -Math.cos(az) * ce];
}
function vecDist(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

interface Aim {
  az: number; // radians, -PI..PI
  el: number; // radians, -PI/2..PI/2
}
interface Precision {
  lat: number; // lateral (left/right)
  pol: number; // polar (up/down)
  hemi: number; // front/back disambiguation
}

// combined sharpness that drives BOTH audio crossfade and visual beam width
function sharpness(p: Precision): number {
  return clamp01(0.45 * p.lat + 0.4 * p.pol + 0.15 * p.hemi);
}

// ── VFE-style precision update on one trial ──────────────────────────────────
// Prediction error split into lateral / polar / hemifield; each precision takes
// a gradient step toward 1 when its error is small. The paper's finding — polar
// improves MOST for listeners who started lowest — is encoded as a learning-rate
// boost that is largest when polar precision is currently low.
interface TrialResult {
  latErrN: number;
  polErrN: number;
  hemiErr: number;
  total: number; // normalized total error → flare magnitude
}
function scoreTrial(indicated: Aim, truth: Aim): TrialResult {
  const vi = dirVec(indicated.az, indicated.el);
  const vt = dirVec(truth.az, truth.el);
  // lateral = ear-axis (x) coordinate; range of the difference is 0..2
  const latErrN = clamp01(Math.abs(vi[0] - vt[0]) / 2);
  // polar = elevation difference, 0..1
  const polErrN = clamp01(Math.abs(indicated.el - truth.el) / Math.PI);
  // hemifield = front/back agreement (cos az sign); lenient near the ±90° cusp
  const fbI = Math.cos(indicated.az);
  const fbT = Math.cos(truth.az);
  let hemiErr: number;
  if (Math.abs(fbI) < 0.3 || Math.abs(fbT) < 0.3) hemiErr = 0.5;
  else hemiErr = fbI * fbT < 0 ? 1 : 0;
  const total = clamp01(0.4 * latErrN + 0.4 * polErrN + 0.2 * hemiErr);
  return { latErrN, polErrN, hemiErr, total };
}
function updatePrecision(p: Precision, r: TrialResult): Precision {
  const eta = 0.14;
  const polBoost = 1 + 1.2 * (1 - p.pol); // lowest polar learns fastest
  return {
    lat: clamp01(p.lat + eta * (1 - r.latErrN - 0.5)),
    pol: clamp01(p.pol + eta * polBoost * (1 - r.polErrN - 0.5)),
    hemi: clamp01(p.hemi + eta * (1 - r.hemiErr - 0.5)),
  };
}

// ── pose → indicated direction ────────────────────────────────────────────────
// Only landmarks a seated laptop webcam reliably sees: shoulders (11/12) + the
// reaching wrist (15/16). Mirror-x throughout (webcam is mirrored). NEVER gate
// on hips/ankles.
function poseToAim(lms: Landmark[] | undefined): Aim | null {
  if (!lms || lms.length <= POSE_LM.rightWrist) return null;
  const ls = lms[POSE_LM.leftShoulder];
  const rs = lms[POSE_LM.rightShoulder];
  const lw = lms[POSE_LM.leftWrist];
  const rw = lms[POSE_LM.rightWrist];
  if (!ls || !rs) return null;
  if ((ls.visibility ?? 0) < 0.3 || (rs.visibility ?? 0) < 0.3) return null;

  // mirror x so pointing left moves the beam left
  const lsx = 1 - ls.x,
    rsx = 1 - rs.x;
  const midX = (lsx + rsx) / 2;
  const midY = (ls.y + rs.y) / 2;
  const shW = Math.abs(lsx - rsx) + 1e-3;

  // pick the reaching wrist: the more-visible, more-raised one (default right)
  const lVis = lw?.visibility ?? 0;
  const rVis = rw?.visibility ?? 0;
  let wrist: Landmark | undefined;
  if (lVis < 0.25 && rVis < 0.25) wrist = undefined;
  else if (rVis >= lVis) wrist = rw;
  else wrist = lw;
  if (!wrist) return null;
  const wx = 1 - wrist.x;
  const wy = wrist.y;

  // torso yaw from shoulder depth asymmetry (MediaPipe z), mirrored
  const torsoYaw = clamp((rs.z - ls.z) * 2.2, -1, 1);

  // azimuth: reaching-wrist horizontal offset (dominant) + torso yaw, full ±180°
  const wristOff = clamp((wx - midX) / (shW * 0.75), -1.6, 1.6);
  const azNorm = clamp(wristOff * 0.72 + torsoYaw * 0.5, -1, 1);
  const az = azNorm * Math.PI;

  // elevation: reaching-wrist height above shoulder line, scaled by shoulder width
  const elNorm = clamp(((midY - wy) / shW) * 0.9, -1, 1);
  const el = elNorm * (Math.PI * 0.5);

  return { az, el };
}

// ── GLSL raymarch ─────────────────────────────────────────────────────────────
const QUAD_VS = /* glsl */ `#version 300 es
precision highp float;
in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

const RAYMARCH_FS = /* glsl */ `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uBelief;   // unit vector, where the listener is pointing
uniform vec3 uTrue;     // unit vector, true source direction
uniform float uSharp;   // 0 diffuse … 1 pinpoint
uniform float uReveal;  // 0..1 true-direction reveal on feedback
uniform float uFlare;   // 0..1 prediction-error burst
uniform float uLevel;   // live audio level

const float R0 = 2.6;
const float BR = 4.3;

float gauss(float x, float s){ return exp(-(x*x)/(2.0*s*s)); }

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*uRes)/uRes.y;
  vec3 ro = vec3(0.0, 0.0, 6.4);
  vec3 rd = normalize(vec3(uv, -1.75));
  // slow auto-orbit for depth (well under 3 Hz, a gentle drift)
  float a = uTime*0.045;
  float ca = cos(a), sa = sin(a);
  mat3 rot = mat3(ca,0.0,sa, 0.0,1.0,0.0, -sa,0.0,ca);
  ro = rot*ro; rd = rot*rd;

  float b = dot(ro, rd);
  float c = dot(ro,ro) - BR*BR;
  float disc = b*b - c;

  vec3 col = vec3(0.0);
  if(disc > 0.0){
    float sq = sqrt(disc);
    float t0 = max(-b - sq, 0.0);
    float t1 = -b + sq;
    const int STEPS = 60;
    float dt = (t1 - t0)/float(STEPS);
    float t = t0 + dt*0.5;

    float perpSig = mix(1.20, 0.10, uSharp);
    float lenSig  = mix(1.30, 0.42, uSharp);
    vec3 iceB  = vec3(0.40, 0.66, 0.95);
    vec3 white = vec3(0.86, 0.95, 1.0);
    vec3 beliefCol = mix(iceB, white, uSharp*0.85);
    vec3 warm = vec3(1.0, 0.56, 0.26); // reserved for prediction error only

    for(int i=0;i<STEPS;i++){
      vec3 p = ro + rd*t;
      float rr = length(p);

      // belief lobe along the pointing direction
      float along = dot(p, uBelief);
      float pd = length(p - along*uBelief);
      float lobe = gauss(along - R0, lenSig) * gauss(pd, perpSig);
      // a shaft that condenses into a beam as precision rises
      float shaft = gauss(pd, mix(0.55, 0.055, uSharp))
                  * smoothstep(0.0, R0, along) * step(along, R0+0.25)
                  * uSharp * 0.55;
      col += beliefCol * (lobe + shaft) * (0.85 + uLevel*1.6) * dt;

      // true-direction marker + warm error burst
      float td = length(p - uTrue*R0);
      float tsig = mix(0.15, 0.95, uFlare);
      float truem = gauss(td, tsig) * (uReveal*0.85 + uFlare*1.1);
      col += warm * truem * dt * 1.7;

      // faint clinical az/el shell grid at R0
      float shell = gauss(rr - R0, 0.055);
      vec3 dir = p/max(rr, 1e-3);
      float az = atan(dir.x, -dir.z);
      float el = asin(clamp(dir.y, -1.0, 1.0));
      float gA = smoothstep(0.09, 0.0, abs(fract(az/(3.14159/6.0)+0.5)-0.5));
      float gE = smoothstep(0.09, 0.0, abs(fract(el/(3.14159/6.0)+0.5)-0.5));
      col += iceB * max(gA,gE) * shell * 0.045 * dt * 6.0;

      t += dt;
    }
  }

  col *= 1.9;                 // integration trim
  col = col/(1.0+col);        // reinhard
  col = pow(col, vec3(0.88));
  col += vec3(0.020, 0.028, 0.044); // slate base
  o = vec4(col, 1.0);
}`;

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

interface GLEngine {
  gl: WebGL2RenderingContext;
  prog: WebGLProgram;
  vao: WebGLVertexArrayObject;
  buf: WebGLBuffer;
  u: Record<string, WebGLUniformLocation | null>;
}

function initGL(canvas: HTMLCanvasElement): GLEngine | null {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    powerPreference: "high-performance",
  });
  if (!gl) return null;
  const vs = compileShader(gl, gl.VERTEX_SHADER, QUAD_VS);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, RAYMARCH_FS);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    gl.deleteProgram(prog);
    return null;
  }
  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const loc = gl.getAttribLocation(prog, "aPos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  const u = {
    uRes: gl.getUniformLocation(prog, "uRes"),
    uTime: gl.getUniformLocation(prog, "uTime"),
    uBelief: gl.getUniformLocation(prog, "uBelief"),
    uTrue: gl.getUniformLocation(prog, "uTrue"),
    uSharp: gl.getUniformLocation(prog, "uSharp"),
    uReveal: gl.getUniformLocation(prog, "uReveal"),
    uFlare: gl.getUniformLocation(prog, "uFlare"),
    uLevel: gl.getUniformLocation(prog, "uLevel"),
  };
  return { gl, prog, vao, buf, u };
}

// ── audio graph ────────────────────────────────────────────────────────────────
interface AudioGraph {
  ctx: AudioContext;
  master: SafeMaster;
  src: AudioBufferSourceNode;
  directGain: GainNode;
  diffuseGain: GainNode;
  flareGain: GainNode;
  pannerDirect: PannerNode;
  pannerFlare: PannerNode;
  delayL: DelayNode;
  delayR: DelayNode;
  merger: ChannelMergerNode;
  splitPre: GainNode;
  level: Uint8Array<ArrayBuffer>;
}

function setPanner(p: PannerNode, pos: [number, number, number], towardListener: boolean): void {
  const ori: [number, number, number] = towardListener
    ? [-pos[0], -pos[1], -pos[2]]
    : [pos[0], pos[1], pos[2]];
  const n = Math.hypot(ori[0], ori[1], ori[2]) || 1;
  if ("positionX" in p) {
    p.positionX.value = pos[0];
    p.positionY.value = pos[1];
    p.positionZ.value = pos[2];
    p.orientationX.value = ori[0] / n;
    p.orientationY.value = ori[1] / n;
    p.orientationZ.value = ori[2] / n;
  } else {
    const legacy = p as unknown as {
      setPosition: (x: number, y: number, z: number) => void;
      setOrientation: (x: number, y: number, z: number) => void;
    };
    legacy.setPosition(pos[0], pos[1], pos[2]);
    legacy.setOrientation(ori[0] / n, ori[1] / n, ori[2] / n);
  }
}

// ── component ────────────────────────────────────────────────────────────────
type Phase = "idle" | "loading" | "running" | "error";
type CamState = "off" | "requesting" | "live" | "lost" | "denied" | "failed";

export default function PriorBodyPage() {
  const { immersive, toggle } = useImmersive();

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const engineRef = useRef<GLEngine | null>(null);
  const audioRef = useRef<AudioGraph | null>(null);
  const trackerRef = useRef<PoseLandmarkerInst | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const camWantRef = useRef(false);
  const camStateRef = useRef<CamState>("off");
  const lastPoseRef = useRef(0);

  const rafRef = useRef(0);
  const lastTsRef = useRef(0);

  // instrument state (refs so the frame loop reads the freshest values)
  const aimRef = useRef<Aim>({ az: 0, el: 0 }); // smoothed, drives visuals + commit
  const aimTargetRef = useRef<Aim>({ az: 0, el: 0 }); // from input
  const trueRef = useRef<Aim>({ az: 0.9, el: 0.2 }); // smoothed source position
  const trueTargetRef = useRef<Aim>({ az: 0.9, el: 0.2 });
  const precRef = useRef<Precision>({ lat: 0.25, pol: 0.12, hemi: 0.3 });
  const revealRef = useRef(0);
  const flareRef = useRef(0);
  const levelRef = useRef(0);
  const trialRef = useRef(0);
  const lastCommitRef = useRef(0);
  const stableSinceRef = useRef(0);
  const lastStableAimRef = useRef<[number, number, number]>([0, 0, -1]);
  const keysRef = useRef<Set<string>>(new Set());
  const pointerActiveRef = useRef(false);
  const runningRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [errMsg, setErrMsg] = useState("");
  const [glFailed, setGlFailed] = useState(false);
  const [camState, setCamState] = useState<CamState>("off");
  const [trackId, setTrackId] = useState(DEFAULT_TRACK);
  const [trackTitle, setTrackTitle] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  // mirrored readout (updated on each commit so the bars grow across the session)
  const [prec, setPrec] = useState<Precision>({ lat: 0.25, pol: 0.12, hemi: 0.3 });
  const [trial, setTrial] = useState(0);
  const [lastErr, setLastErr] = useState<number | null>(null);

  // keep a ref copy of camera state for the rAF loop (closure reads stale state)
  useEffect(() => {
    camStateRef.current = camState;
  }, [camState]);

  // ── resize ─────────────────────────────────────────────────────────────────
  const resize = useCallback(() => {
    const c = canvasRef.current;
    const wrap = wrapRef.current;
    if (!c || !wrap) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(wrap.clientWidth * dpr));
    const h = Math.max(1, Math.floor(wrap.clientHeight * dpr));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const eng = engineRef.current;
    if (eng) eng.gl.viewport(0, 0, c.width, c.height);
  }, []);

  // ── choose a fresh hidden source direction (new trial) ──────────────────────
  const reseedSource = useCallback(() => {
    trueTargetRef.current = {
      az: (Math.random() * 2 - 1) * Math.PI,
      el: (Math.random() * 2 - 1) * (Math.PI * 0.42),
    };
  }, []);

  // ── commit a guess: score it, step the precisions, flare, reveal, re-seed ───
  const commit = useCallback(() => {
    if (!runningRef.current) return;
    const now = performance.now();
    if (now - lastCommitRef.current < COMMIT_COOLDOWN) return;
    lastCommitRef.current = now;

    const indicated = { ...aimRef.current };
    const truth = { ...trueRef.current };
    const r = scoreTrial(indicated, truth);
    const next = updatePrecision(precRef.current, r);
    precRef.current = next;
    trialRef.current += 1;

    // feedback: reveal the truth, flare by prediction-error magnitude
    revealRef.current = 1;
    flareRef.current = r.total;

    // audible transient of his take at the TRUE direction, scaled by error
    const audio = audioRef.current;
    if (audio) {
      const t = audio.ctx.currentTime;
      const amp = 0.25 + r.total * 0.85;
      const g = audio.flareGain.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(amp, t + 0.04);
      g.setTargetAtTime(0.0001, t + 0.05, 0.28);
    }

    setPrec(next);
    setTrial(trialRef.current);
    setLastErr(r.total);

    // the source re-drifts to a new hidden direction for the next trial
    reseedSource();
  }, [reseedSource]);

  // ── frame loop ───────────────────────────────────────────────────────────────
  const runFrame = useCallback(
    (ts: number) => {
      const eng = engineRef.current;
      if (!eng) return;
      const dtRaw = lastTsRef.current ? (ts - lastTsRef.current) / 1000 : 0.016;
      lastTsRef.current = ts;
      const dt = clamp(dtRaw, 0.001, 0.05);
      const gl = eng.gl;

      // 1) POSE (if camera live) → aim target
      if (camWantRef.current && trackerRef.current && videoRef.current) {
        const video = videoRef.current;
        if (video.readyState >= 2) {
          try {
            const res = trackerRef.current.detectForVideo(video, ts);
            const aim = poseToAim(res.landmarks?.[0]);
            if (aim) {
              aimTargetRef.current = aim;
              lastPoseRef.current = ts;
              if (camStateRef.current !== "live") setCamState("live");
            } else if (ts - lastPoseRef.current > 850 && camStateRef.current !== "lost") {
              setCamState("lost");
            }
          } catch {
            /* detector hiccup — keep last aim */
          }
        }
      }

      // 2) keyboard nudges (identical action, fallback path)
      const keys = keysRef.current;
      if (keys.size) {
        const tg = aimTargetRef.current;
        if (keys.has("ArrowLeft")) tg.az = clamp(tg.az - dt * 1.6, -Math.PI, Math.PI);
        if (keys.has("ArrowRight")) tg.az = clamp(tg.az + dt * 1.6, -Math.PI, Math.PI);
        if (keys.has("ArrowUp")) tg.el = clamp(tg.el + dt * 1.2, -Math.PI / 2, Math.PI / 2);
        if (keys.has("ArrowDown")) tg.el = clamp(tg.el - dt * 1.2, -Math.PI / 2, Math.PI / 2);
      }

      // 3) smooth aim (~0.12s) — this value drives BOTH the belief visual and commit
      const kAim = 1 - Math.exp(-dt / 0.12);
      const aim = aimRef.current;
      const aimT = aimTargetRef.current;
      aim.az += (aimT.az - aim.az) * kAim;
      aim.el += (aimT.el - aim.el) * kAim;

      // 4) drift the hidden source slowly toward its target (+ faint wander)
      const kTrue = 1 - Math.exp(-dt / 2.6);
      const tr = trueRef.current;
      const trT = trueTargetRef.current;
      tr.az += (trT.az - tr.az) * kTrue;
      tr.el += (trT.el - tr.el) * kTrue;
      tr.az += Math.sin(ts / 1000 * 0.21) * 0.0016;
      tr.el += Math.cos(ts / 1000 * 0.17) * 0.0011;

      // 5) body auto-commit on a sustained point
      if (runningRef.current && camWantRef.current && camStateRef.current === "live") {
        const av = dirVec(aim.az, aim.el);
        const moved = vecDist(av, lastStableAimRef.current);
        if (moved > BODY_STABLE) {
          lastStableAimRef.current = av;
          stableSinceRef.current = ts;
        } else if (
          ts - stableSinceRef.current > BODY_HOLD_MS &&
          ts - lastCommitRef.current > COMMIT_COOLDOWN
        ) {
          commit();
          stableSinceRef.current = ts;
        }
      }

      // 6) decay feedback envelopes
      revealRef.current = Math.max(0, revealRef.current - dt / 1.4);
      flareRef.current = Math.max(0, flareRef.current - dt / 0.9);

      // 7) audio: level tap + crossfade + panner follow + cone tighten
      const audio = audioRef.current;
      const prec2 = precRef.current;
      const sharp = sharpness(prec2);
      if (audio) {
        audio.master.analyser.getByteFrequencyData(audio.level);
        let sum = 0;
        for (let i = 0; i < audio.level.length; i++) sum += audio.level[i];
        const lvl = clamp01(sum / audio.level.length / 160);
        levelRef.current += (lvl - levelRef.current) * 0.25;

        const now = audio.ctx.currentTime;
        // diffuse → direct crossfade as precision rises
        audio.directGain.gain.setTargetAtTime(0.14 + 0.86 * sharp, now, 0.12);
        audio.diffuseGain.gain.setTargetAtTime(0.9 - 0.72 * sharp, now, 0.12);
        // HRTF source sits at the TRUE direction; cone tightens with precision
        const pos = dirVec(tr.az, tr.el);
        const p: [number, number, number] = [
          pos[0] * SRC_RADIUS,
          pos[1] * SRC_RADIUS,
          pos[2] * SRC_RADIUS,
        ];
        setPanner(audio.pannerDirect, p, true);
        setPanner(audio.pannerFlare, p, true);
        audio.pannerDirect.coneInnerAngle = 360 - 290 * sharp;
      } else {
        // pre-start idle: let the field breathe a little
        levelRef.current += (0.12 - levelRef.current) * 0.04;
      }

      // 8) render the volumetric belief field
      const c = canvasRef.current!;
      const bv = dirVec(aim.az, aim.el);
      const tv = dirVec(tr.az, tr.el);
      gl.useProgram(eng.prog);
      gl.uniform2f(eng.u.uRes, c.width, c.height);
      gl.uniform1f(eng.u.uTime, ts / 1000);
      gl.uniform3f(eng.u.uBelief, bv[0], bv[1], bv[2]);
      gl.uniform3f(eng.u.uTrue, tv[0], tv[1], tv[2]);
      gl.uniform1f(eng.u.uSharp, sharp);
      gl.uniform1f(eng.u.uReveal, revealRef.current);
      gl.uniform1f(eng.u.uFlare, flareRef.current);
      gl.uniform1f(eng.u.uLevel, levelRef.current);
      gl.bindVertexArray(eng.vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);

      rafRef.current = requestAnimationFrame(runFrame);
    },
    [commit],
  );

  // ── init GL at mount ─────────────────────────────────────────────────────────
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const eng = initGL(c);
    if (!eng) {
      setGlFailed(true);
      return;
    }
    engineRef.current = eng;
    resize();
    const onResize = () => resize();
    window.addEventListener("resize", onResize);
    const onLost = (e: Event) => e.preventDefault();
    c.addEventListener("webglcontextlost", onLost);
    rafRef.current = requestAnimationFrame(runFrame);
    return () => {
      window.removeEventListener("resize", onResize);
      c.removeEventListener("webglcontextlost", onLost);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resize]);

  // ── keyboard: arrows nudge aim, Enter commits ───────────────────────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        keysRef.current.add(e.key);
        e.preventDefault();
      } else if (e.key === "Enter") {
        commit();
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.key);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [commit]);

  // ── pointer: drag to aim (identical action); camera owns aim when live ──────
  const applyPointer = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (camWantRef.current) return; // live tracking owns the aim
    const wrap = wrapRef.current;
    if (!wrap) return;
    const r = wrap.getBoundingClientRect();
    const px = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
    const py = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1);
    aimTargetRef.current.az = px * Math.PI; // full ±180° so behind is reachable
    aimTargetRef.current.el = -py * (Math.PI * 0.5);
  }, []);
  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (pointerActiveRef.current || e.pointerType === "mouse") applyPointer(e);
    },
    [applyPointer],
  );
  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      pointerActiveRef.current = true;
      applyPointer(e);
    },
    [applyPointer],
  );
  const onPointerUp = useCallback(() => {
    pointerActiveRef.current = false;
    commit(); // click / tap = commit a guess (identical action to the body hold)
  }, [commit]);

  // ── start audio (user gesture) ───────────────────────────────────────────────
  const begin = useCallback(async () => {
    if (phase === "loading" || phase === "running") return;
    setPhase("loading");
    setErrMsg("");
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      await ctx.resume();

      const master = createSafeMaster(ctx);
      const { buffer, title } = await loadRealTrackBuffer(ctx, trackId);
      setTrackTitle(title);

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;

      // DIRECT: HRTF-panned copy at the true direction (localizable)
      const directGain = ctx.createGain();
      directGain.gain.value = 0.2;
      const pannerDirect = ctx.createPanner();
      pannerDirect.panningModel = "HRTF";
      pannerDirect.distanceModel = "inverse";
      pannerDirect.refDistance = 1.4;
      pannerDirect.rolloffFactor = 0.6;
      pannerDirect.coneInnerAngle = 360;
      pannerDirect.coneOuterAngle = 360;
      pannerDirect.coneOuterGain = 0.55;

      // DIFFUSE: decorrelated, non-localized smear (dual pre-delays → merger)
      const diffuseGain = ctx.createGain();
      diffuseGain.gain.value = 0.85;
      const splitPre = ctx.createGain();
      const delayL = ctx.createDelay(0.1);
      delayL.delayTime.value = 0.013;
      const delayR = ctx.createDelay(0.1);
      delayR.delayTime.value = 0.027;
      const merger = ctx.createChannelMerger(2);

      // FLARE: a second HRTF copy at the true direction, swelling on commit
      const flareGain = ctx.createGain();
      flareGain.gain.value = 0.0001;
      const pannerFlare = ctx.createPanner();
      pannerFlare.panningModel = "HRTF";
      pannerFlare.distanceModel = "inverse";
      pannerFlare.refDistance = 1.4;
      pannerFlare.rolloffFactor = 0.6;

      // wire it up
      src.connect(directGain);
      directGain.connect(pannerDirect);
      pannerDirect.connect(master.input);

      src.connect(diffuseGain);
      diffuseGain.connect(splitPre);
      splitPre.connect(delayL);
      splitPre.connect(delayR);
      delayL.connect(merger, 0, 0);
      delayR.connect(merger, 0, 1);
      merger.connect(master.input);

      src.connect(flareGain);
      flareGain.connect(pannerFlare);
      pannerFlare.connect(master.input);

      // place the HRTF sources at the current hidden direction
      const pos = dirVec(trueRef.current.az, trueRef.current.el);
      const p: [number, number, number] = [
        pos[0] * SRC_RADIUS,
        pos[1] * SRC_RADIUS,
        pos[2] * SRC_RADIUS,
      ];
      setPanner(pannerDirect, p, true);
      setPanner(pannerFlare, p, true);

      src.start();
      audioRef.current = {
        ctx,
        master,
        src,
        directGain,
        diffuseGain,
        flareGain,
        pannerDirect,
        pannerFlare,
        delayL,
        delayR,
        merger,
        splitPre,
        level: new Uint8Array(new ArrayBuffer(master.analyser.frequencyBinCount)),
      };
      runningRef.current = true;
      lastCommitRef.current = performance.now();
      reseedSource();
      setPhase("running");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "could not load Karel's recording");
      setPhase("error");
    }
  }, [phase, trackId, reseedSource]);

  // ── camera opt-in ──────────────────────────────────────────────────────────
  const enableCamera = useCallback(async () => {
    if (!videoRef.current) return;
    setCamState("requesting");
    try {
      const tracker = await createPoseTracker(1);
      trackerRef.current = tracker;
      const stream = await startCamera(videoRef.current);
      streamRef.current = stream;
      camWantRef.current = true;
      lastPoseRef.current = performance.now();
      setCamState("live");
    } catch (e) {
      camWantRef.current = false;
      const msg = e instanceof Error ? e.message : "";
      if (/denied|Permission|NotAllowed/i.test(msg)) setCamState("denied");
      else setCamState("failed");
    }
  }, []);

  // ── teardown ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      const audio = audioRef.current;
      if (audio) {
        try {
          audio.src.stop();
        } catch {
          /* already stopped */
        }
        for (const n of [
          audio.src,
          audio.directGain,
          audio.diffuseGain,
          audio.flareGain,
          audio.pannerDirect,
          audio.pannerFlare,
          audio.delayL,
          audio.delayR,
          audio.merger,
          audio.splitPre,
        ]) {
          try {
            n.disconnect();
          } catch {
            /* noop */
          }
        }
        audio.master.disconnect();
        audio.ctx.close().catch(() => {});
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      try {
        trackerRef.current?.close();
      } catch {
        /* noop */
      }
      const eng = engineRef.current;
      if (eng) {
        const gl = eng.gl;
        try {
          gl.deleteProgram(eng.prog);
          gl.deleteBuffer(eng.buf);
          gl.deleteVertexArray(eng.vao);
        } catch {
          /* context gone */
        }
      }
    };
  }, []);

  const running = phase === "running";
  const camLive = camState === "live";
  const camBad = camState === "denied" || camState === "failed";
  const pct = (v: number) => `${Math.round(clamp01(v) * 100)}%`;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div
        ref={wrapRef}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={() => (pointerActiveRef.current = false)}
        className="fixed inset-0 h-dvh w-full touch-none overflow-hidden bg-black"
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        <video ref={videoRef} className="hidden" playsInline muted />

        {/* WebGL2 unavailable — designed notice; audio still works */}
        {glFailed && (
          <div className="absolute inset-0 z-30 flex items-center justify-center px-6 text-center">
            <p className="max-w-md text-base text-destructive">
              This perception lab needs WebGL2 for its volumetric belief-field,
              which this browser or device does not provide. The spatial-hearing
              audio loop still works — try a recent desktop browser to see the
              field sharpen.
            </p>
          </div>
        )}

        {/* start overlay */}
        {!running && !glFailed && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-black/70 px-6 text-center backdrop-blur-sm">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              a closed-loop spatial-hearing lab · one take
            </p>
            <h1 className="max-w-xl text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              Point your body toward where you hear Karel&apos;s piano in 3-D.
              Commit your guess; the piece learns your localization and sharpens
              the sound and the light as your ear sharpens.
            </h1>
            <div className="flex max-w-2xl flex-col gap-3">
              {COLLECTIONS.map((col) => (
                <div key={col.name} className="flex flex-col items-center gap-1.5">
                  <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    {col.name}
                  </span>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {col.tracks.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTrackId(t.id)}
                        className={
                          "min-h-[44px] rounded-md border px-4 text-sm transition-colors " +
                          (trackId === t.id
                            ? "border-primary bg-primary/15 text-foreground"
                            : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground")
                        }
                      >
                        {t.title}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={begin}
              disabled={phase === "loading"}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {phase === "loading" ? "loading Karel's recording…" : "Begin the first trial"}
            </button>
            <p className="max-w-md text-base text-muted-foreground">
              Works on the pointer alone — drag to aim your beam, click or press
              Enter to commit a guess, arrow keys nudge. Add the camera to point
              with your real body.
            </p>
            {phase === "error" && (
              <p className="max-w-md text-sm text-destructive">
                {errMsg} — the recording could not load, so there is no loop to
                run. No synthesized stand-in is used.
              </p>
            )}
          </div>
        )}

        {/* functional telemetry: tracking status + precision readout (kept in
            immersive — this is the instrument's core state, not write-up chrome) */}
        {running && (
          <div className="pointer-events-none absolute left-4 top-4 z-30 space-y-2">
            <div className="font-mono text-xs uppercase tracking-[0.18em]">
              {camLive ? (
                <span className="text-foreground">body · tracking · live</span>
              ) : camState === "lost" ? (
                <span className="text-destructive">
                  no body · face the camera, shoulders in frame
                </span>
              ) : camBad ? (
                <span className="text-destructive">
                  {camState === "denied" ? "camera denied · " : "camera failed · "}
                  <span className="text-muted-foreground">pointer steers the aim</span>
                </span>
              ) : (
                <span className="text-muted-foreground">camera off — pointer steers the aim</span>
              )}
            </div>
            <div className="w-52 space-y-1.5 rounded-md border border-border/40 bg-background/30 p-3 backdrop-blur-sm">
              <div className="flex items-center justify-between font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                <span>precision</span>
                <span className="text-foreground">trial {trial}</span>
              </div>
              {(
                [
                  ["lateral", prec.lat],
                  ["polar", prec.pol],
                  ["front-back", prec.hemi],
                ] as const
              ).map(([label, v]) => (
                <div key={label} className="space-y-0.5">
                  <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    <span>{label}</span>
                    <span>{pct(v)}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/50">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
                      style={{ width: pct(v) }}
                    />
                  </div>
                </div>
              ))}
              {lastErr !== null && (
                <p className="pt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  last error {Math.round(lastErr * 100)}%
                </p>
              )}
            </div>
          </div>
        )}

        {/* chrome (hidden while immersive) */}
        {running && !immersive && (
          <>
            <div className="absolute right-4 top-4 z-30 flex items-center gap-2">
              {!camLive && (
                <button
                  type="button"
                  onClick={enableCamera}
                  disabled={camState === "requesting"}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
                >
                  {camState === "requesting" ? "starting camera…" : "Use body (camera)"}
                </button>
              )}
              <ImmersiveToggle immersive={immersive} onToggle={toggle} />
            </div>

            <div className="absolute bottom-16 left-4 z-30 max-w-md space-y-1">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                23040 · prior body — {trackTitle}
              </p>
              <p className="text-base text-muted-foreground">
                Aim toward where the piano sounds, then commit (hold your point ~0.6s
                with the camera, or click / press Enter). The warm burst reveals the
                true direction; your lateral / polar / front-back precision climbs,
                and his take grows from a smear into a pinpoint.
              </p>
              <button
                type="button"
                onClick={() => setShowNotes(true)}
                className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                Read the design notes
              </button>
            </div>
          </>
        )}

        {/* immersive HUD */}
        {running && immersive && (
          <ImmersiveHud
            immersive={immersive}
            onToggle={toggle}
            title="Prior Body"
            description="A closed-loop spatial-hearing lab. Karel's one piano take is hidden at a direction on a sphere around you; you point your body toward where you hear it. Each committed guess measures prediction error, splits it into lateral / polar / front-back parts, and updates three precisions by a free-energy gradient step. As your precisions climb, the same recording sharpens from an omnidirectional smear into a pinpoint HRTF source, and the volumetric belief-field collapses from a diffuse cloud into a tight beam — see and hear sharpen together."
            howTo={[
              "Listen for where the piano sits in 3-D around you",
              "Point your reaching arm toward it (or drag the pointer)",
              "Hold your point for ~0.6s to commit — or click / press Enter",
              "Watch the warm burst reveal the true direction and your error",
              "Keep going: minute five is calmer and sharper than minute one",
              "Press i for info, f for fullscreen",
            ]}
          />
        )}

        {/* design-notes modal */}
        {showNotes && (
          <div
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
            onClick={() => setShowNotes(false)}
          >
            <div
              className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="mb-3 text-xl font-semibold tracking-tight text-foreground">
                prior body — the loop the paper leaves open
              </h2>
              <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
                <p>
                  One of Karel&apos;s real piano recordings loops, pitch-clean, placed
                  at a hidden direction on a sphere that slowly drifts. It is panned
                  binaurally with a Web Audio HRTF PannerNode (the direct, localizable
                  copy) and simultaneously smeared through a decorrelated, non-localized
                  diffuse send. Nothing is synthesised.
                </p>
                <p>
                  You are the action. Your shoulders and reaching arm (MediaPipe
                  PoseLandmarker) — or the pointer — give an indicated azimuth and
                  elevation. When you commit, the piece measures the angular prediction
                  error and splits it into lateral (left/right), polar (up/down) and
                  hemifield (front/back) components, then takes a variational-free-energy
                  gradient step on three precisions. Polar precision — lowest at the
                  start, as in the source paper&apos;s listeners — is given the largest
                  learning rate, so it gains the most.
                </p>
                <p>
                  See equals hear, exactly. The same combined precision crossfades the
                  audio from diffuse to direct and tightens the HRTF cone, AND collapses
                  the raymarched belief-field from a wide ice-blue cloud into a tight
                  beam. The prediction-error magnitude at each commit flares both an
                  audible swell of his take at the true direction AND a warm visible
                  burst there — the one colour this cool clinical palette reserves for
                  error.
                </p>
                <p>
                  Precision is persistent session state: trial by trial the field
                  calms and sharpens, so minute five localizes where minute one only
                  smeared. With no camera the pointer and keyboard drive the identical
                  action, so the whole audible-and-visible loop runs without a webcam.
                </p>
                <p>
                  Grounding: Barumerli, Meyer-Kahlen &amp; Picinali, &ldquo;Framing
                  Spatial Hearing within the Free Energy Principle: A Hierarchical Model
                  of Perceptual Learning&rdquo; (arXiv:2610.23196, 2026) — which names
                  this closed action-perception loop as future work — on the foundation
                  of Karl Friston&apos;s free-energy principle.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
