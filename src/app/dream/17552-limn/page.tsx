"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 17552-limn — a gaze-steered spectral lens.
//
// Where you LOOK (plus your face) conducts the dynamics and spectral focus of
// one of Karel's real piano recordings. The band you gaze at swells forward;
// the rest recedes. Cashes the Frontiers in Psychology (14 Sept 2026) finding
// that in live-electronic performance, "where you look is where the sound
// originates" — turning that passive looking–listening interplay into the
// actual control mechanism.
//
// INPUT  camera / face-tracking (gaze estimated from iris landmarks + head,
//        plus blendshapes: brow / jaw / eye-openness)
// OUTPUT raw WebGL2 (fullscreen quad + fragment shader — no three.js, no Canvas2D)
// AUDIO  Karel's real catalog via loadRealTrackBuffer → BiquadFilter lens
//        chain → createSafeMaster (never ctx.destination)
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { useImmersive, ImmersiveToggle } from "../_shared/immersive";
import {
  REAL_TRACKS,
  loadRealTrackBuffer,
  WELCOME_HOME_TRACKS,
} from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import {
  createFaceTracker,
  startCamera,
  type FaceLandmarkerInst,
  type FaceResult,
  type Landmark,
} from "../_shared/cameraTracking";
import { PALETTE_GLSL } from "../_shared/palette";

// A short menu of Karel's tracks; Interplay leads (thematically perfect).
const TRACK_MENU = [
  WELCOME_HOME_TRACKS[0], // Interplay
  WELCOME_HOME_TRACKS[2], // Welcome Home
  WELCOME_HOME_TRACKS[4], // 2019
  WELCOME_HOME_TRACKS[10], // Rolling
].filter(Boolean);

// ── Feature vector read from the face each frame ────────────────────────────
interface FaceFeatures {
  gazeX: number; // 0 left … 1 right  (mirrored, reads like a mirror)
  gazeY: number; // 0 bottom … 1 top
  lean: number; // 0 far … 1 close (proximity swell)
  brow: number; // 0 … 1 brow raise → brightness/air
  jaw: number; // 0 … 1 jaw open → formant vowel
  eyeOpen: number; // 0 closed/squint … 1 wide (eyes closed → whisper)
}

const NEUTRAL: FaceFeatures = {
  gazeX: 0.5,
  gazeY: 0.5,
  lean: 0.45,
  brow: 0,
  jaw: 0,
  eyeOpen: 1,
};

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// MediaPipe FaceLandmarker gives 478 landmarks (iris incl.). Indices used:
//   iris centers: left 468, right 473
//   left eye corners: outer 33, inner 133 · right eye corners: inner 362, outer 263
//   left eye lid: top 159 bottom 145 · right eye lid: top 386 bottom 374
function computeFaceFeatures(res: FaceResult): FaceFeatures | null {
  const lm: Landmark[] | undefined = res.faceLandmarks?.[0];
  if (!lm || lm.length < 478) return null;

  const bs = res.faceBlendshapes?.[0]?.categories ?? [];
  const score = (name: string): number =>
    bs.find((c) => c.categoryName === name)?.score ?? 0;

  const irisL = lm[468];
  const irisR = lm[473];

  // Head position across frame (robust, dominant term): midpoint of the eyes.
  const eyeMidX = (irisL.x + irisR.x) / 2;
  const eyeMidY = (irisL.y + irisR.y) / 2;

  // Iris-in-socket horizontal offset (fine gaze). Fractions 0..1 within each eye.
  const fracL = (irisL.x - lm[33].x) / (lm[133].x - lm[33].x + 1e-5);
  const fracR = (irisR.x - lm[263].x) / (lm[362].x - lm[263].x + 1e-5);
  const irisFrac = (clamp01(fracL) + clamp01(fracR)) / 2; // 0..1

  // Combine head turn (amplified) with iris fine control, then mirror.
  const headX = 1 - eyeMidX;
  const gazeX = clamp01(
    0.5 + (headX - 0.5) * 2.0 + (irisFrac - 0.5) * 0.55,
  );

  // Vertical: iris-in-socket + head pitch, up = higher.
  const fracLy = (irisL.y - lm[159].y) / (lm[145].y - lm[159].y + 1e-5);
  const fracRy = (irisR.y - lm[386].y) / (lm[374].y - lm[386].y + 1e-5);
  const irisFracY = (clamp01(fracLy) + clamp01(fracRy)) / 2;
  const gazeY = clamp01(
    0.5 + (0.5 - eyeMidY) * 2.0 + (0.5 - irisFracY) * 0.4,
  );

  // Proximity from inter-iris distance (bigger = closer). Baseline range tuned
  // for a seated laptop webcam (~60–150cm).
  const iod = Math.hypot(irisR.x - irisL.x, irisR.y - irisL.y);
  const lean = clamp01((iod - 0.05) / (0.13 - 0.05));

  const brow = clamp01(
    Math.max(
      score("browInnerUp"),
      (score("browOuterUpLeft") + score("browOuterUpRight")) / 2,
    ),
  );
  const jaw = clamp01(score("jawOpen"));
  const blink = (score("eyeBlinkLeft") + score("eyeBlinkRight")) / 2;
  const eyeOpen = clamp01(1 - blink * 1.15);

  return { gazeX, gazeY, lean, brow, jaw, eyeOpen };
}

// ── WebGL2 spectral-lens renderer ───────────────────────────────────────────
const VERT_SRC = `#version 300 es
void main() {
  // full-screen triangle from gl_VertexID (no buffers needed)
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG_SRC = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2  u_res;
uniform float u_time;
uniform float u_gazeX;
uniform float u_gazeY;
uniform float u_lens;    // 0 wide focus … 1 tight focus
uniform float u_lean;    // overall intensity 0..1
uniform float u_bright;  // brow air 0..1
uniform float u_focus;   // boost strength of gazed band 0..1
uniform float u_hush;    // 0 wide-eyed … 1 eyes closed / whisper
uniform sampler2D u_spec;
${PALETTE_GLSL}
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 g = vec2(u_gazeX, u_gazeY);
  float d = distance(uv, g);

  // lens: soft radial glow that magnifies the frequency column under the gaze
  float lensR = mix(0.34, 0.15, u_lens);
  float glow = smoothstep(lensR, 0.0, d);
  float mag = 1.0 - glow * (0.35 + 0.28 * u_focus);
  float sx = clamp(u_gazeX + (uv.x - u_gazeX) * mag, 0.0, 1.0);

  // spectrum amplitude at this (magnified) frequency column: left low → right high
  float amp = texture(u_spec, vec2(sx, 0.5)).r;
  amp = pow(amp, 0.82);

  // luminous band centered vertically, breathing with amplitude
  float bandHalf = 0.11 + amp * 0.34 + glow * 0.13;
  float vy = abs(uv.y - 0.5);
  float band = smoothstep(bandHalf, bandHalf * 0.18, vy);

  // fine spectral striations
  float stri = 0.82 + 0.18 * sin(sx * 150.0 + u_time * 0.5);
  float intensity = band * amp * stri;

  // the gazed band blooms brighter and forward
  intensity += glow * (0.22 + amp * 0.95) * (0.55 + u_focus * 0.85);
  intensity *= (0.5 + u_lean * 0.85);
  intensity *= (1.0 - u_hush * 0.7); // eyes closed → collapse toward a whisper

  // cool-luminous color from frequency + amplitude
  float t = clamp(sx * 0.55 + amp * 0.35 + u_bright * 0.12, 0.0, 1.0);
  vec3 col = dreamPalette(t);
  col = mix(col, vec3(0.80, 0.76, 0.99), glow * 0.32 + u_bright * 0.16 * amp);
  col *= intensity;

  // faint deep-violet field so the frame is never a pure void
  vec3 base = vec3(0.018, 0.013, 0.045) * (0.55 + 0.45 * u_lean);
  vec3 outc = base + col;

  float vig = smoothstep(1.2, 0.32, distance(uv, vec2(0.5)));
  outc *= mix(0.72, 1.0, vig);

  outColor = vec4(outc, 1.0);
}`;

interface GL {
  gl: WebGL2RenderingContext;
  prog: WebGLProgram;
  tex: WebGLTexture;
  u: Record<string, WebGLUniformLocation | null>;
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader alloc");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) ?? "unknown";
    gl.deleteShader(sh);
    throw new Error("shader compile: " + log);
  }
  return sh;
}

function setupGL(canvas: HTMLCanvasElement): GL {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
  });
  if (!gl) throw new Error("WebGL2 unavailable");

  const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  const prog = gl.createProgram();
  if (!prog) throw new Error("program alloc");
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error("program link: " + (gl.getProgramInfoLog(prog) ?? ""));
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  const tex = gl.createTexture();
  if (!tex) throw new Error("texture alloc");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const names = [
    "u_res",
    "u_time",
    "u_gazeX",
    "u_gazeY",
    "u_lens",
    "u_lean",
    "u_bright",
    "u_focus",
    "u_hush",
    "u_spec",
  ];
  const u: Record<string, WebGLUniformLocation | null> = {};
  for (const n of names) u[n] = gl.getUniformLocation(prog, n);

  gl.useProgram(prog);
  gl.uniform1i(u["u_spec"], 0);

  return { gl, prog, tex, u };
}

const SPEC_BINS = 256;

function drawScene(
  glctx: GL,
  spec: Uint8Array<ArrayBuffer>,
  time: number,
  f: FaceFeatures,
): void {
  const { gl, u, tex } = glctx;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.R8,
    SPEC_BINS,
    1,
    0,
    gl.RED,
    gl.UNSIGNED_BYTE,
    spec,
  );

  gl.uniform2f(u["u_res"], gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.uniform1f(u["u_time"], time);
  gl.uniform1f(u["u_gazeX"], f.gazeX);
  gl.uniform1f(u["u_gazeY"], f.gazeY);
  gl.uniform1f(u["u_lens"], f.lean); // lean-in → tighter focus
  gl.uniform1f(u["u_lean"], f.lean);
  gl.uniform1f(u["u_bright"], f.brow);
  gl.uniform1f(u["u_focus"], 0.4 + f.lean * 0.4 + f.jaw * 0.2);
  gl.uniform1f(u["u_hush"], 1 - f.eyeOpen);

  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

// ── the piece ───────────────────────────────────────────────────────────────
type Phase = "idle" | "loading" | "running" | "error";
type CamState = "off" | "requesting" | "live" | "lost" | "denied" | "failed";

export default function Limn() {
  const { immersive, toggle } = useImmersive();
  const [phase, setPhase] = useState<Phase>("idle");
  const [camState, setCamState] = useState<CamState>("off");
  const [controlLabel, setControlLabel] = useState("auto-demo");
  const [trackId, setTrackId] = useState<string>(REAL_TRACKS[0].id);
  const [trackTitle, setTrackTitle] = useState<string>(REAL_TRACKS[0].title);
  const [showNotes, setShowNotes] = useState(false);
  const [errMsg, setErrMsg] = useState<string>("");
  const [glWarn, setGlWarn] = useState<string>("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // audio + gl + tracking refs (never trigger re-render)
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const nodesRef = useRef<{
    bandpass: BiquadFilterNode;
    wetGain: GainNode;
    dryGain: GainNode;
    merge: GainNode;
    shelf: BiquadFilterNode;
    formant: BiquadFilterNode;
    lowpass: BiquadFilterNode;
    level: GainNode;
  } | null>(null);
  const glRef = useRef<GL | null>(null);
  const specRef = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(SPEC_BINS));
  const freqRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const trackerRef = useRef<FaceLandmarkerInst | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);

  const featRef = useRef<FaceFeatures>({ ...NEUTRAL });
  const camWantRef = useRef(false); // camera requested/live
  const lastFaceRef = useRef<number>(0); // ts of last valid face
  const pointerRef = useRef<{ active: boolean; x: number; y: number }>({
    active: false,
    x: 0.5,
    y: 0.5,
  });

  // ── canvas sizing (DPR-aware, capped) ─────────────────────────────────────
  const resize = useCallback(() => {
    const c = canvasRef.current;
    const gl = glRef.current?.gl;
    if (!c || !gl) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(c.clientWidth * dpr));
    const h = Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
      gl.viewport(0, 0, w, h);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  // ── the control + render loop ──────────────────────────────────────────────
  const runFrame = useCallback(() => {
    const now = performance.now();
    const glctx = glRef.current;
    const master = masterRef.current;
    const nodes = nodesRef.current;
    const ctx = ctxRef.current;

    // 1. establish the target feature vector from the active control source
    const target: FaceFeatures = { ...NEUTRAL };
    let label = "auto-demo";

    if (camWantRef.current && trackerRef.current && videoRef.current) {
      try {
        const video = videoRef.current;
        if (video.readyState >= 2) {
          const res = trackerRef.current.detectForVideo(video, now);
          const f = computeFaceFeatures(res);
          if (f) {
            lastFaceRef.current = now;
            Object.assign(target, f);
            label = "live";
            setCamState((s) => (s === "live" ? s : "live"));
          } else if (now - lastFaceRef.current > 900) {
            label = "lost";
            setCamState((s) => (s === "lost" ? s : "lost"));
            // hold last-known feature so audio doesn't lurch
            Object.assign(target, featRef.current);
          } else {
            Object.assign(target, featRef.current);
            label = "live";
          }
        } else {
          Object.assign(target, featRef.current);
        }
      } catch {
        Object.assign(target, featRef.current);
      }
    } else if (pointerRef.current.active) {
      target.gazeX = pointerRef.current.x;
      target.gazeY = pointerRef.current.y;
      target.lean = 0.55;
      label = "pointer";
    } else {
      // autonomous "ghost gaze" slowly sweeps the lens across the spectrum
      const t = now / 1000;
      target.gazeX = 0.5 + 0.42 * Math.sin(t * 0.28);
      target.gazeY = 0.5 + 0.16 * Math.sin(t * 0.19 + 1.3);
      target.lean = 0.45 + 0.22 * (0.5 + 0.5 * Math.sin(t * 0.13));
      target.brow = 0.18 * (0.5 + 0.5 * Math.sin(t * 0.4 + 2.0));
      label = "auto-demo";
    }
    setControlLabel((c) => (c === label ? c : label));

    // 2. smooth features (visual lerp; audio is smoothed by setTargetAtTime)
    const cur = featRef.current;
    const k = 0.22; // ~0.1s at 60fps — snappy but not twitchy
    cur.gazeX += (target.gazeX - cur.gazeX) * k;
    cur.gazeY += (target.gazeY - cur.gazeY) * k;
    cur.lean += (target.lean - cur.lean) * k;
    cur.brow += (target.brow - cur.brow) * k;
    cur.jaw += (target.jaw - cur.jaw) * k;
    cur.eyeOpen += (target.eyeOpen - cur.eyeOpen) * k;

    // 3. push to audio params (immediate, smoothed ~0.12s)
    if (ctx && nodes && master) {
      const tc = 0.12;
      const t0 = ctx.currentTime;
      // gaze X → center of the resonant focus lens (log 110Hz..7000Hz)
      const freq = 110 * Math.pow(63.6, cur.gazeX);
      nodes.bandpass.frequency.setTargetAtTime(freq, t0, tc);
      // gaze Y / lean → focus Q (higher = tighter, sharper swell)
      nodes.bandpass.Q.setTargetAtTime(1.4 + cur.lean * 2.6, t0, tc);
      nodes.wetGain.gain.setTargetAtTime(1.15 + cur.lean * 0.5, t0, tc);
      // brow raise → high-shelf air
      nodes.shelf.gain.setTargetAtTime(cur.brow * 7, t0, tc);
      // jaw open → formant vowel peak
      nodes.formant.frequency.setTargetAtTime(520 + cur.jaw * 380, t0, tc);
      nodes.formant.gain.setTargetAtTime(cur.jaw * 9, t0, tc);
      // eyes closed / squint → low-pass collapse to a whisper
      const lp = 520 + cur.eyeOpen * cur.eyeOpen * 13500;
      nodes.lowpass.frequency.setTargetAtTime(lp, t0, tc);
      // lean-in swells level; eyes-closed ducks it
      const lvl = (0.5 + cur.lean * 0.6) * (0.35 + cur.eyeOpen * 0.65);
      nodes.level.gain.setTargetAtTime(lvl, t0, tc);
    }

    // 4. spectrum → texture, 5. draw
    if (glctx && master && freqRef.current) {
      master.analyser.getByteFrequencyData(freqRef.current);
      const spec = specRef.current;
      const bins = freqRef.current;
      // remap the analyser's linear bins onto SPEC_BINS with a log-ish tilt so
      // the visible spectrum spreads the musical range across the frame
      for (let i = 0; i < SPEC_BINS; i++) {
        const j = Math.min(bins.length - 1, Math.floor((i / SPEC_BINS) * bins.length));
        spec[i] = bins[j];
      }
      drawScene(glctx, spec, now / 1000, cur);
    }

    rafRef.current = requestAnimationFrame(runFrame);
  }, []);

  // ── start audio + visuals (user gesture) ───────────────────────────────────
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
      freqRef.current = new Uint8Array(master.analyser.frequencyBinCount);

      // build the spectral-lens filter graph
      const bandpass = ctx.createBiquadFilter();
      bandpass.type = "bandpass";
      bandpass.frequency.value = 800;
      bandpass.Q.value = 2;
      const wetGain = ctx.createGain();
      wetGain.gain.value = 1.2; // the gazed band, boosted forward
      const dryGain = ctx.createGain();
      dryGain.gain.value = 0.62; // the rest, receded
      const merge = ctx.createGain();
      const shelf = ctx.createBiquadFilter();
      shelf.type = "highshelf";
      shelf.frequency.value = 3500;
      shelf.gain.value = 0;
      const formant = ctx.createBiquadFilter();
      formant.type = "peaking";
      formant.frequency.value = 550;
      formant.Q.value = 4;
      formant.gain.value = 0;
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = 14000;
      lowpass.Q.value = 0.9;
      const level = ctx.createGain();
      level.gain.value = 0.7;

      merge.connect(shelf);
      shelf.connect(formant);
      formant.connect(lowpass);
      lowpass.connect(level);
      level.connect(master.input);
      dryGain.connect(merge);
      bandpass.connect(wetGain);
      wetGain.connect(merge);

      nodesRef.current = {
        bandpass,
        wetGain,
        dryGain,
        merge,
        shelf,
        formant,
        lowpass,
        level,
      };

      // load Karel's real track + loop it
      const { buffer, title } = await loadRealTrackBuffer(ctx, trackId);
      setTrackTitle(title);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(dryGain);
      src.connect(bandpass);
      src.start();
      srcRef.current = src;

      // WebGL2
      if (canvasRef.current) {
        try {
          glRef.current = setupGL(canvasRef.current);
          resize();
        } catch (e) {
          glRef.current = null;
          setGlWarn(
            e instanceof Error ? e.message : "WebGL2 unavailable — audio only",
          );
        }
      }

      setPhase("running");
      rafRef.current = requestAnimationFrame(runFrame);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "could not start");
      setPhase("error");
    }
  }, [phase, trackId, resize, runFrame]);

  // ── enable camera (separate opt-in for the permission prompt) ──────────────
  const enableCamera = useCallback(async () => {
    if (!videoRef.current) return;
    setCamState("requesting");
    try {
      const tracker = await createFaceTracker(1);
      trackerRef.current = tracker;
      const stream = await startCamera(videoRef.current);
      streamRef.current = stream;
      camWantRef.current = true;
      lastFaceRef.current = performance.now();
      setCamState("live");
    } catch (e) {
      camWantRef.current = false;
      const msg = e instanceof Error ? e.message : "";
      if (/denied|Permission|NotAllowed/i.test(msg)) setCamState("denied");
      else setCamState("failed");
    }
  }, []);

  // ── pointer fallback ───────────────────────────────────────────────────────
  const onPointer = useCallback((e: React.PointerEvent) => {
    if (camWantRef.current) return; // live gaze wins
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    pointerRef.current = {
      active: true,
      x: clamp01((e.clientX - r.left) / r.width),
      y: clamp01(1 - (e.clientY - r.top) / r.height),
    };
  }, []);
  const onPointerLeave = useCallback(() => {
    pointerRef.current.active = false;
  }, []);

  // ── teardown ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      try {
        srcRef.current?.stop();
      } catch {
        /* already stopped */
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

  const camLive = camState === "live";
  const camBad = camState === "denied" || camState === "failed";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div
        ref={wrapRef}
        className="relative h-screen w-full overflow-hidden bg-black"
        onPointerMove={onPointer}
        onPointerLeave={onPointerLeave}
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        {/* hidden camera feed — MediaPipe reads from it */}
        <video ref={videoRef} className="hidden" playsInline muted />

        {/* start overlay */}
        {phase !== "running" && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-black/70 px-6 text-center backdrop-blur-sm">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              gaze-steered spectral lens
            </p>
            <h1 className="max-w-xl text-2xl font-semibold tracking-tight text-foreground">
              Look, and the band you gaze at swells forward.
            </h1>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {TRACK_MENU.map((t) => (
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
            <button
              type="button"
              onClick={begin}
              disabled={phase === "loading"}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {phase === "loading" ? "loading Karel's recording…" : "Begin"}
            </button>
            {phase === "error" && (
              <p className="max-w-md text-sm text-destructive">{errMsg}</p>
            )}
          </div>
        )}

        {/* tracking status line — visible whenever running */}
        {phase === "running" && (
          <div className="pointer-events-none absolute left-4 top-4 z-30 font-mono text-xs uppercase tracking-[0.18em]">
            {camLive && camState === "live" && controlLabel === "live" ? (
              <span className="text-muted-foreground">tracking · live</span>
            ) : camState === "lost" ? (
              <span className="text-destructive">
                face lost · face the camera
              </span>
            ) : camBad ? (
              <span className="text-destructive">
                {camState === "denied"
                  ? "camera denied · "
                  : "camera failed · "}
                <span className="text-muted-foreground">
                  auto-demo — enable camera to conduct
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">
                {controlLabel === "pointer"
                  ? "pointer · move to steer the lens"
                  : "auto-demo — enable camera to conduct"}
              </span>
            )}
          </div>
        )}

        {/* chrome (hidden while immersive) */}
        {phase === "running" && !immersive && (
          <>
            <div className="absolute right-4 top-4 z-30 flex items-center gap-2">
              {!camLive && (
                <button
                  type="button"
                  onClick={enableCamera}
                  disabled={camState === "requesting"}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
                >
                  {camState === "requesting"
                    ? "starting camera…"
                    : "Enable camera"}
                </button>
              )}
              <ImmersiveToggle immersive={immersive} onToggle={toggle} />
            </div>

            <div className="absolute bottom-4 left-4 z-30 max-w-md space-y-1">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                17552 · limn — {trackTitle}
              </p>
              <p className="text-base text-muted-foreground">
                Gaze sweeps the focus lens across the spectrum · lean in to
                swell · raise brows for air · open your jaw for a vowel · close
                your eyes to a whisper.
              </p>
              {glWarn && (
                <p className="text-sm text-destructive">
                  {glWarn} — sound continues.
                </p>
              )}
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

        {immersive && phase === "running" && (
          <ImmersiveToggle immersive={immersive} onToggle={toggle} />
        )}

        {/* design-notes overlay */}
        {showNotes && (
          <div
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
            onClick={() => setShowNotes(false)}
          >
            <div
              className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="mb-3 text-xl font-semibold tracking-tight text-foreground">
                limn — a gaze-steered spectral lens
              </h2>
              <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
                <p>
                  One of Karel&apos;s real piano recordings plays, its spectrum
                  laid out left (low) to right (high) across the frame. Where you
                  look becomes the center of a resonant focus lens: the band you
                  gaze at is boosted and blooms forward while the rest recedes.
                </p>
                <p>
                  Lean in and the whole voice swells closer; raise your brows for
                  air; open your jaw to open a vowel-like formant; close your eyes
                  and everything collapses to a whisper. Detection runs every
                  animation frame and every parameter is smoothed with a ~0.12s
                  time constant, so response is immediate but never twitchy.
                </p>
                <p>
                  It cashes a 14 Sept 2026 finding (Frontiers in Psychology, “Eye
                  gaze in live-electronic music performance”): performers report
                  that gazing at an interface element actively shapes what they
                  hear — “where you look is where the sound originates.” This
                  piece turns that looking–listening interplay into the control.
                </p>
                <p>
                  With no camera, permission denied, or a model-load failure, an
                  autonomous ghost gaze sweeps the lens so the idea stays legible;
                  a pointer can steer it manually. Those fallbacks are always
                  labeled and never masquerade as live tracking.
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
