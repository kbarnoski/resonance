"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  makeHandLandmarker,
  type HandLandmarkerLike,
  type HandResult,
} from "./handLoader";

/* ───────────────────────── The Motet Room (Reach) ─────────────────────────
   A fixed constellation of HRTF-spatialized choir voices around a fixed
   listener at room center. Your two hands act as conductor's magnets:
   reach toward a section to swell it, spread hands wide to bloom the whole
   field, bring them together to collapse to a resolved cluster, pinch to
   grab and re-sculpt where a single voice lives. Raw WebGL2 additive glow.
   ─────────────────────────────────────────────────────────────────────── */

const VOICE_COUNT = 18;
const ROOM_R = 3.2; // radius of the fixed constellation shell

// Tallis-flavoured sustained vowel-ish formant frequencies (just intonation-ish
// stack spread over a few octaves). Pulled from a slow rotating modal palette.
const SCALE_HZ = [
  98.0, 110.0, 123.5, 130.8, 146.8, 164.8, 174.6, 196.0, 220.0, 246.9, 261.6,
  293.7, 329.6, 349.2, 392.0, 440.0, 493.9, 523.3,
];

type V3 = { x: number; y: number; z: number };

interface Voice {
  // audio
  osc: OscillatorNode;
  osc2: OscillatorNode; // detuned partner for chorus body
  formant: BiquadFilterNode; // vowel formant
  bright: BiquadFilterNode; // lowpass for "open" brightness
  gain: GainNode;
  panner: PannerNode;
  baseHz: number;
  // spatial
  home: V3; // resting position on the shell
  pos: V3; // current (mutable / sculpted) position
  rest: V3; // sculpted resting spot (changes when you fling a voice)
  swell: number; // 0..1 amplification from hand proximity
  driftPhase: number;
}

interface HandState {
  active: boolean;
  // normalized screen space 0..1 (x mirrored already)
  sx: number;
  sy: number;
  // mapped room magnet point
  mag: V3;
  pinch: number; // 0..1 (1 = fully pinched)
  pinching: boolean;
  grabbed: number; // voice index or -1
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}
function ema(prev: number, next: number, a: number) {
  return prev + (next - prev) * a;
}
function dist3(a: V3, b: V3) {
  const dx = a.x - b.x,
    dy = a.y - b.y,
    dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Screen (0..1, y down) → room magnet point. Centered listener at origin,
// looking down -Z. x maps left/right, y maps up/down, depth pushed in front.
function screenToRoom(sx: number, sy: number, reach: number): V3 {
  return {
    x: (sx - 0.5) * 2 * ROOM_R * 1.1,
    y: (0.5 - sy) * 2 * ROOM_R * 0.8,
    z: -ROOM_R * (0.4 + reach * 0.9), // in front of the listener
  };
}

/* ── tiny mat4 perspective + lookAt-ish for our own projection ── */
function makePerspective(fovy: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  // column-major
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aColor;
layout(location=2) in float aSize;
uniform mat4 uProj;
uniform float uCamZ;
out vec3 vColor;
void main(){
  vec3 p = aPos;
  p.z += uCamZ;            // move camera back
  gl_Position = uProj * vec4(p, 1.0);
  float d = max(0.2, -p.z);
  gl_PointSize = aSize / d;
  vColor = aColor;
}`;

const FRAG = `#version 300 es
precision highp float;
in vec3 vColor;
out vec4 frag;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c);
  float glow = smoothstep(0.5, 0.0, r);
  glow = pow(glow, 1.6);
  frag = vec4(vColor * glow, glow);  // additive premultiplied-ish
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
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

function makeProgram(gl: WebGL2RenderingContext) {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const p = gl.createProgram();
  if (!p) return null;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    gl.deleteProgram(p);
    return null;
  }
  return p;
}

export default function MotetRoomReach() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<
    "idle" | "camera" | "auto-demo" | "pointer"
  >("idle");
  const [showNotes, setShowNotes] = useState(false);

  // mutable engine refs (avoid re-renders in the hot loop)
  const engineRef = useRef<{
    audio: AudioContext;
    master: GainNode;
    voices: Voice[];
    hands: HandState[];
    spread: number; // 0 (collapsed) .. 1 (bloomed)
    raf: number;
    gl: WebGL2RenderingContext | null;
    program: WebGLProgram | null;
    vbo: WebGLBuffer | null;
    landmarker: HandLandmarkerLike | null;
    stream: MediaStream | null;
    mode: "camera" | "auto-demo" | "pointer";
    pointer: { down: boolean; x: number; y: number };
    t0: number;
    proj: Float32Array;
  } | null>(null);

  // pointer fallback wiring (always attached when running)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !running) return;
    function rel(e: PointerEvent) {
      const r = canvas!.getBoundingClientRect();
      return {
        x: clamp((e.clientX - r.left) / r.width, 0, 1),
        y: clamp((e.clientY - r.top) / r.height, 0, 1),
      };
    }
    function down(e: PointerEvent) {
      const eng = engineRef.current;
      if (!eng) return;
      const p = rel(e);
      eng.pointer = { down: true, x: p.x, y: p.y };
      if (eng.mode === "auto-demo") {
        eng.mode = "pointer";
        setInputMode("pointer");
      }
    }
    function move(e: PointerEvent) {
      const eng = engineRef.current;
      if (!eng) return;
      const p = rel(e);
      eng.pointer.x = p.x;
      eng.pointer.y = p.y;
    }
    function up() {
      const eng = engineRef.current;
      if (!eng) return;
      eng.pointer.down = false;
    }
    canvas.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [running]);

  function stopEverything() {
    const eng = engineRef.current;
    if (!eng) return;
    cancelAnimationFrame(eng.raf);
    if (eng.stream) eng.stream.getTracks().forEach((t) => t.stop());
    if (eng.landmarker) {
      try {
        eng.landmarker.close();
      } catch {
        /* ignore */
      }
    }
    const gl = eng.gl;
    if (gl) {
      if (eng.vbo) gl.deleteBuffer(eng.vbo);
      if (eng.program) gl.deleteProgram(eng.program);
    }
    try {
      eng.audio.close();
    } catch {
      /* ignore */
    }
    engineRef.current = null;
  }

  useEffect(() => {
    return () => stopEverything();
  }, []);

  async function start() {
    if (running) return;
    setNotice(null);

    // ── Audio graph ──
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const audio = new AC();
    await audio.resume();

    const master = audio.createGain();
    master.gain.value = 0.0; // fade in
    const limiter = audio.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.25;
    master.connect(limiter);
    limiter.connect(audio.destination);

    // listener fixed at origin, looking -Z
    const lis = audio.listener;
    if (lis.positionX) {
      lis.positionX.value = 0;
      lis.positionY.value = 0;
      lis.positionZ.value = 0;
      lis.forwardX.value = 0;
      lis.forwardY.value = 0;
      lis.forwardZ.value = -1;
      lis.upX.value = 0;
      lis.upY.value = 1;
      lis.upZ.value = 0;
    } else {
      // deprecated fallback
      const l = lis as unknown as {
        setPosition?: (x: number, y: number, z: number) => void;
        setOrientation?: (
          fx: number,
          fy: number,
          fz: number,
          ux: number,
          uy: number,
          uz: number,
        ) => void;
      };
      l.setPosition?.(0, 0, 0);
      l.setOrientation?.(0, 0, -1, 0, 1, 0);
    }

    const voices: Voice[] = [];
    for (let i = 0; i < VOICE_COUNT; i++) {
      // distribute on a sphere shell (fibonacci-ish), biased to front hemisphere
      const t = i / VOICE_COUNT;
      const phi = Math.acos(1 - 2 * t);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const hx = Math.sin(phi) * Math.cos(theta);
      let hy = Math.cos(phi);
      let hz = Math.sin(phi) * Math.sin(theta);
      // lift listener-plane spread, keep some in front
      hz = -Math.abs(hz) * 0.6 - 0.2;
      hy *= 0.7;
      const home: V3 = { x: hx * ROOM_R, y: hy * ROOM_R, z: hz * ROOM_R };
      const pos: V3 = { ...home };
      const rest: V3 = { ...home };

      const baseHz = SCALE_HZ[i % SCALE_HZ.length];

      const osc = audio.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = baseHz;
      const osc2 = audio.createOscillator();
      osc2.type = "sawtooth";
      osc2.frequency.value = baseHz;
      osc2.detune.value = 6 + Math.random() * 6;

      // vowel formant (bandpass) — gives a choral "ah/oo" colour
      const formant = audio.createBiquadFilter();
      formant.type = "bandpass";
      formant.frequency.value = 500 + (i % 4) * 220; // vowel cluster
      formant.Q.value = 2.5;

      const bright = audio.createBiquadFilter();
      bright.type = "lowpass";
      bright.frequency.value = 1400;
      bright.Q.value = 0.7;

      const gain = audio.createGain();
      gain.gain.value = 0.0001;

      const panner = audio.createPanner();
      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
      panner.refDistance = 1.0;
      panner.maxDistance = 20;
      panner.rolloffFactor = 0.6;
      panner.positionX.value = pos.x;
      panner.positionY.value = pos.y;
      panner.positionZ.value = pos.z;

      osc.connect(formant);
      osc2.connect(formant);
      formant.connect(bright);
      bright.connect(gain);
      gain.connect(panner);
      panner.connect(master);

      osc.start();
      osc2.start();

      voices.push({
        osc,
        osc2,
        formant,
        bright,
        gain,
        panner,
        baseHz,
        home,
        pos,
        rest,
        swell: 0,
        driftPhase: Math.random() * Math.PI * 2,
      });
    }

    // ── WebGL2 ──
    const canvas = canvasRef.current!;
    const gl = canvas.getContext("webgl2", {
      antialias: true,
      premultipliedAlpha: false,
    });
    let program: WebGLProgram | null = null;
    let vbo: WebGLBuffer | null = null;
    if (!gl) {
      setNotice(
        "WebGL2 is unavailable in this browser — audio still plays, but the visual field is hidden.",
      );
    } else {
      program = makeProgram(gl);
      if (!program) {
        setNotice("WebGL2 shader compile failed — audio still plays.");
      } else {
        vbo = gl.createBuffer();
      }
    }

    const hands: HandState[] = [0, 1].map(() => ({
      active: false,
      sx: 0.5,
      sy: 0.5,
      mag: { x: 0, y: 0, z: -1 },
      pinch: 0,
      pinching: false,
      grabbed: -1,
    }));

    const aspect = canvas.width / canvas.height || 16 / 9;
    const proj = makePerspective((55 * Math.PI) / 180, aspect, 0.1, 60);

    engineRef.current = {
      audio,
      master,
      voices,
      hands,
      spread: 0.5,
      raf: 0,
      gl: gl ?? null,
      program,
      vbo,
      landmarker: null,
      stream: null,
      mode: "auto-demo",
      pointer: { down: false, x: 0.5, y: 0.5 },
      t0: performance.now(),
      proj,
    };

    setRunning(true);
    setInputMode("auto-demo");

    // fade in master (≤ 0.3)
    master.gain.setTargetAtTime(0.28, audio.currentTime, 1.2);

    // ── try camera + MediaPipe (non-blocking, falls back to auto-demo) ──
    void tryCamera();

    // ── main loop ──
    const loop = () => {
      const eng = engineRef.current;
      if (!eng) return;
      runFrame();
      eng.raf = requestAnimationFrame(loop);
    };
    engineRef.current.raf = requestAnimationFrame(loop);
  }

  async function tryCamera() {
    const eng = engineRef.current;
    if (!eng) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setNotice(
        "No camera API here — running the AUTO-DEMO (two virtual hands conduct the choir). Or use your mouse: drag = pinch-grab a voice.",
      );
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
    } catch {
      setNotice(
        "Camera unavailable or denied — running the AUTO-DEMO. Or use your mouse: drag = pinch-grab.",
      );
      return;
    }
    const eng2 = engineRef.current;
    if (!eng2) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    eng2.stream = stream;
    const video = videoRef.current;
    if (video) {
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        /* ignore */
      }
    }
    try {
      const lm = await makeHandLandmarker();
      const e3 = engineRef.current;
      if (!e3) {
        lm.close();
        return;
      }
      e3.landmarker = lm;
      e3.mode = "camera";
      setInputMode("camera");
      setNotice(null);
    } catch {
      setNotice(
        "Hand-tracking model failed to load — running the AUTO-DEMO. Or use your mouse: drag = pinch-grab.",
      );
    }
  }

  /* ── per-frame: read input → update hands → conduct voices → render ── */
  function runFrame() {
    const eng = engineRef.current;
    if (!eng) return;
    const now = performance.now();
    const tSec = (now - eng.t0) / 1000;

    // 1) gather raw hand targets
    const raw: {
      sx: number;
      sy: number;
      pinch: number;
      active: boolean;
    }[] = [
      { sx: 0.5, sy: 0.5, pinch: 0, active: false },
      { sx: 0.5, sy: 0.5, pinch: 0, active: false },
    ];

    if (eng.mode === "camera" && eng.landmarker && videoRef.current) {
      let res: HandResult | null = null;
      try {
        res = eng.landmarker.detectForVideo(videoRef.current, now);
      } catch {
        res = null;
      }
      if (res && res.landmarks) {
        for (let h = 0; h < Math.min(2, res.landmarks.length); h++) {
          const lm = res.landmarks[h];
          if (!lm || lm.length < 9) continue;
          const wrist = lm[0];
          const thumb = lm[4];
          const index = lm[8];
          // mirror x (selfie)
          const sx = 1 - (wrist.x + index.x) * 0.5;
          const sy = (wrist.y + index.y) * 0.5;
          const pd = Math.hypot(thumb.x - index.x, thumb.y - index.y);
          const pinch = clamp(1 - pd / 0.12, 0, 1);
          raw[h] = { sx, sy, pinch, active: true };
        }
      }
    } else if (eng.mode === "pointer") {
      raw[0] = {
        sx: eng.pointer.x,
        sy: eng.pointer.y,
        pinch: eng.pointer.down ? 1 : 0,
        active: true,
      };
      // second virtual hand keeps gently drifting to keep field alive
      raw[1] = {
        sx: 0.5 + 0.35 * Math.sin(tSec * 0.27),
        sy: 0.5 + 0.25 * Math.cos(tSec * 0.19),
        pinch: 0,
        active: true,
      };
    } else {
      // auto-demo: two hands that drift, spread/close, and periodically pinch
      const openClose = 0.5 + 0.45 * Math.sin(tSec * 0.18);
      const lx = 0.5 - openClose * 0.42;
      const rx = 0.5 + openClose * 0.42;
      const ly = 0.5 + 0.22 * Math.sin(tSec * 0.33);
      const ry = 0.5 + 0.22 * Math.cos(tSec * 0.29);
      // pinch on left hand once every ~9s for a couple seconds
      const cyc = (tSec % 9) / 9;
      const lp = cyc > 0.55 && cyc < 0.78 ? 1 : 0;
      raw[0] = { sx: lx, sy: ly, pinch: lp, active: true };
      raw[1] = { sx: rx, sy: ry, pinch: 0, active: true };
    }

    // 2) smooth hand state + map to room magnets
    for (let h = 0; h < 2; h++) {
      const hs = eng.hands[h];
      const r = raw[h];
      const aOn = r.active ? 0.35 : 0.08;
      hs.active = r.active;
      hs.sx = ema(hs.sx, r.sx, aOn);
      hs.sy = ema(hs.sy, r.sy, aOn);
      hs.pinch = ema(hs.pinch, r.pinch, 0.3);
      const reach = clamp(1 - hs.sy, 0, 1); // higher hand = reach further in
      const m = screenToRoom(hs.sx, hs.sy, reach);
      hs.mag = m;

      const wasPinch = hs.pinching;
      const nowPinch = hs.pinch > 0.6 && hs.active;
      if (nowPinch && !wasPinch) {
        // grab nearest voice (if not already grabbed by other hand)
        let best = -1;
        let bestD = Infinity;
        for (let i = 0; i < eng.voices.length; i++) {
          if (eng.hands[1 - h].grabbed === i) continue;
          const d = dist3(eng.voices[i].pos, m);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
        if (best >= 0 && bestD < ROOM_R * 1.4) hs.grabbed = best;
      } else if (!nowPinch && wasPinch) {
        // release → drop the voice at current spot (re-sculpt rest position)
        if (hs.grabbed >= 0) {
          const v = eng.voices[hs.grabbed];
          v.rest = { ...v.pos };
        }
        hs.grabbed = -1;
      }
      hs.pinching = nowPinch;
    }

    // 3) global spread from distance between two active hands
    let targetSpread = 0.5;
    if (eng.hands[0].active && eng.hands[1].active) {
      const d = Math.hypot(
        eng.hands[0].sx - eng.hands[1].sx,
        eng.hands[0].sy - eng.hands[1].sy,
      );
      targetSpread = clamp((d - 0.12) / 0.6, 0, 1);
    }
    eng.spread = ema(eng.spread, targetSpread, 0.06);
    const spread = eng.spread;

    // 4) conduct each voice
    const ac = eng.audio;
    const tA = ac.currentTime;
    for (let i = 0; i < eng.voices.length; i++) {
      const v = eng.voices[i];

      // is this voice grabbed?
      let grabbedBy = -1;
      if (eng.hands[0].grabbed === i) grabbedBy = 0;
      else if (eng.hands[1].grabbed === i) grabbedBy = 1;

      // target spatial position
      let tx: number, ty: number, tz: number;
      if (grabbedBy >= 0) {
        const m = eng.hands[grabbedBy].mag;
        tx = m.x;
        ty = m.y;
        tz = m.z;
      } else {
        // base = sculpted rest, scaled by spread (collapse toward center when low)
        const collapse = 0.18 + spread * 0.9; // 0..~1
        const drift = 0.12;
        const dp = v.driftPhase;
        tx = v.rest.x * collapse + Math.sin(tSec * 0.21 + dp) * drift;
        ty = v.rest.y * collapse + Math.cos(tSec * 0.17 + dp) * drift;
        tz = v.rest.z * collapse + Math.sin(tSec * 0.13 + dp) * drift;

        // lean toward nearest reaching hand
        for (let h = 0; h < 2; h++) {
          const hs = eng.hands[h];
          if (!hs.active) continue;
          const d = dist3(v.pos, hs.mag);
          const pull = clamp(1 - d / (ROOM_R * 0.9), 0, 1) * 0.35;
          tx += (hs.mag.x - tx) * pull;
          ty += (hs.mag.y - ty) * pull;
          tz += (hs.mag.z - tz) * pull;
        }
      }

      // smooth current visual position
      const aPos = grabbedBy >= 0 ? 0.4 : 0.08;
      v.pos.x = ema(v.pos.x, tx, aPos);
      v.pos.y = ema(v.pos.y, ty, aPos);
      v.pos.z = ema(v.pos.z, tz, aPos);

      // push to panner (smoothed in audio thread too)
      v.panner.positionX.setTargetAtTime(v.pos.x, tA, 0.08);
      v.panner.positionY.setTargetAtTime(v.pos.y, tA, 0.08);
      v.panner.positionZ.setTargetAtTime(v.pos.z, tA, 0.08);

      // swell from hand proximity (the conductor pulling a section forward)
      let prox = 0;
      for (let h = 0; h < 2; h++) {
        const hs = eng.hands[h];
        if (!hs.active) continue;
        const d = dist3(v.pos, hs.mag);
        prox = Math.max(prox, clamp(1 - d / (ROOM_R * 0.8), 0, 1));
      }
      if (grabbedBy >= 0) prox = Math.max(prox, 0.9);
      v.swell = ema(v.swell, prox, 0.15);

      // base breathing swell so the field is alive at rest
      const breathe = 0.5 + 0.5 * Math.sin(tSec * 0.25 + v.driftPhase);
      const baseLevel = 0.05 + breathe * 0.05; // quiet bed
      const level = baseLevel + v.swell * 0.16;
      v.gain.gain.setTargetAtTime(clamp(level, 0, 0.24), tA, 0.12);

      // brightness opens with spread + swell
      const brightHz = 900 + spread * 1600 + v.swell * 1800;
      v.bright.frequency.setTargetAtTime(brightHz, tA, 0.2);

      // gentle pitch drift for living tuning
      const detune = Math.sin(tSec * 0.07 + v.driftPhase) * 4;
      v.osc.detune.setTargetAtTime(detune, tA, 0.5);
    }

    drawScene();
  }

  /* ── raw WebGL2 additive render of voice-orbs + hand cursors ── */
  function drawScene() {
    const eng = engineRef.current;
    if (!eng) return;
    const gl = eng.gl;
    const program = eng.program;
    const vbo = eng.vbo;
    const canvas = canvasRef.current;
    if (!gl || !program || !vbo || !canvas) return;

    // resize to display
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      eng.proj = makePerspective(
        (55 * Math.PI) / 180,
        w / h || 16 / 9,
        0.1,
        60,
      );
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.02, 0.02, 0.05, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // additive

    // build interleaved buffer: pos(3) color(3) size(1)
    const n = eng.voices.length + 2; // + 2 hand cursors
    const stride = 7;
    const data = new Float32Array(n * stride);
    let o = 0;
    const spread = eng.spread;
    for (let i = 0; i < eng.voices.length; i++) {
      const v = eng.voices[i];
      data[o++] = v.pos.x;
      data[o++] = v.pos.y;
      data[o++] = v.pos.z;
      // color: cool violet bed → warm gold when swelling (conductor's focus)
      const s = v.swell;
      const r = 0.45 + s * 0.55;
      const g = 0.35 + s * 0.45 + spread * 0.1;
      const b = 0.85 - s * 0.25;
      const k = 0.35 + s * 0.9;
      data[o++] = r * k;
      data[o++] = g * k;
      data[o++] = b * k;
      data[o++] = 120 + s * 260 + spread * 60; // size
    }
    // hand cursors (faint glowing)
    for (let hnd = 0; hnd < 2; hnd++) {
      const hs = eng.hands[hnd];
      const m = hs.mag;
      data[o++] = m.x;
      data[o++] = m.y;
      data[o++] = m.z;
      const grab = hs.grabbed >= 0 ? 1 : 0;
      const intensity = hs.active ? 0.5 + hs.pinch * 0.5 + grab * 0.3 : 0.0;
      data[o++] = (1.0) * intensity;
      data[o++] = (0.8 + grab * 0.2) * intensity;
      data[o++] = (0.95) * intensity;
      data[o++] = 90 + hs.pinch * 120 + grab * 120;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    const fb = Float32Array.BYTES_PER_ELEMENT;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride * fb, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride * fb, 3 * fb);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride * fb, 6 * fb);

    gl.useProgram(program);
    const uProj = gl.getUniformLocation(program, "uProj");
    const uCamZ = gl.getUniformLocation(program, "uCamZ");
    gl.uniformMatrix4fv(uProj, false, eng.proj);
    gl.uniform1f(uCamZ, -8.5); // pull camera back so the room is visible

    gl.drawArrays(gl.POINTS, 0, n);
  }

  function stopAndReset() {
    stopEverything();
    setRunning(false);
    setInputMode("idle");
    setNotice(null);
  }

  const modeLabel =
    inputMode === "camera"
      ? "Hand-tracking (camera) live"
      : inputMode === "pointer"
        ? "Mouse mode — drag to pinch-grab a voice"
        : inputMode === "auto-demo"
          ? "AUTO-DEMO — two virtual hands conducting"
          : "idle";

  return (
    <div className="min-h-screen bg-[#070611] text-foreground px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/dream"
          className="text-violet-300 text-sm hover:underline"
        >
          ← back to the dream lab
        </Link>

        <h1 className="mt-4 font-semibold text-3xl sm:text-4xl text-foreground">
          The Motet Room <span className="text-violet-300">(Reach)</span>
        </h1>
        <p className="mt-3 text-base text-foreground leading-relaxed">
          Stand at the still center of a fixed constellation of forty-ish
          spatialized voices and conduct it with your bare hands — reach toward
          a section to swell it, spread your arms to bloom the whole choir open
          around your ears, draw your hands together to collapse it to a
          resolved cluster, pinch to grab a single voice and fling it to a new
          place in the room.
        </p>

        <button
          type="button"
          onClick={() => setShowNotes((s) => !s)}
          className="mt-2 text-violet-300 text-sm underline-offset-2 hover:underline"
        >
          {showNotes ? "Hide the design notes" : "Read the design notes"}
        </button>

        {showNotes && (
          <div className="mt-3 rounded-lg border border-violet-500/20 bg-violet-500/5 p-4 text-base text-foreground leading-relaxed space-y-2">
            <p>
              Every voice lives at a fixed 3D coordinate on a shell around you
              and is rendered through its own <code>PannerNode</code> with
              HRTF binaural panning; the listener never moves. Your hands are
              conductor&apos;s magnets: the nearest voices swell and lean toward
              a reaching hand; two-hand spread opens or collapses the entire
              field; a pinch grabs the closest voice so you can re-sculpt where
              it permanently lives.
            </p>
            <p>
              In the lineage of object-/scene-based spatial audio (pulling
              sections forward by hand) and Janet Cardiff&apos;s{" "}
              <em>The Forty Part Motet</em> (2001), a 40-speaker installation of
              Tallis&apos; <em>Spem in Alium</em> that lets you walk among the
              singers. Visuals are raw WebGL2 additive glow point-sprites with
              a hand-rolled perspective projection — no three.js, no Canvas2D.
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {!running ? (
            <button
              type="button"
              onClick={() => void start()}
              className="min-h-[44px] px-4 py-2.5 rounded-md bg-violet-500/20 text-violet-200 border border-violet-400/40 hover:bg-violet-500/30 transition-colors"
            >
              Enter the room
            </button>
          ) : (
            <button
              type="button"
              onClick={stopAndReset}
              className="min-h-[44px] px-4 py-2.5 rounded-md bg-muted text-foreground border border-border hover:bg-accent transition-colors"
            >
              Leave the room
            </button>
          )}
          {running && (
            <span className="text-sm text-violet-300/90 font-mono">
              {modeLabel}
            </span>
          )}
        </div>

        {notice && (
          <p className="mt-4 text-violet-300 text-base leading-relaxed">
            {notice}
          </p>
        )}

        <div className="mt-5 relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-black">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full touch-none"
          />
          {!running && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-base">
              Enter the room to wake the choir.
            </div>
          )}
        </div>

        {/* hidden video element feeds MediaPipe; never shown */}
        <video ref={videoRef} className="hidden" playsInline muted />

        {running && (
          <p className="mt-4 text-base text-foreground leading-relaxed">
            No camera here? You&apos;re hearing the auto-demo conduct itself.
            Move your mouse over the field and drag to pinch-grab the nearest
            voice and fling it somewhere new — it stays where you drop it.
          </p>
        )}

        <p className="mt-8 text-xs text-muted-foreground/70 font-mono">
          input: hand-tracking-camera · output: raw-WebGL2 · technique:
          HRTF-spatial-sculpting · vibe: installation / sacred-ambient
        </p>
      </div>
    </div>
  );
}
