"use client";

// 2314 · The Return
// "What if a room could REMEMBER your body and start to ANTICIPATE you —
//  so the music is driven by the GAP between where the room thinks you are
//  and where you actually are?"
//
// A mutual-regard room, staged with a camera. Four wired parts:
//   1. Capture       — webcam → hidden 96×72 luminance grid (frame-difference).
//   2. Two fields    — LIVE motion (where you are now) and PREDICTION (a slow
//                      EMA memory of where THIS body tends to move, warped
//                      toward a short-horizon extrapolation of your trajectory).
//   3. Audio         — driven by the ERROR between the two fields (audio.ts).
//   4. WebGL2 render — an oil-film / Newton's-rings interference field; the two
//                      fields are visually distinct and their mismatch blooms.
//
// The mechanic has NO master knob: LIVE and PREDICTION are independent arrays;
// their gap (prediction error / surprise) is what fractures the field and
// spikes the sound. Move as the room expects → fusion + consonance. Surprise it
// → flare + dissonance. Keep surprising it → memory relearns → it habituates.
//
// Degrades: no camera → a seeded phantom body (rng.ts) self-demos the whole
// learn→predict→surprise→habituate arc. No WebGL2 → a destructive notice.

import { useCallback, useEffect, useRef, useState } from "react";
import { ReturnAudio, type FieldDrive } from "./audio";
import { makeAutopilot, RETURN_SEED, type Autopilot } from "./rng";

// ── Field grid ──────────────────────────────────────────────────────────────
const GW = 96;
const GH = 72;
const N = GW * GH;

// Memory learns slowly (habit), prediction blends memory with a live blob.
const MEM_ALPHA = 0.016; // EMA rate of the persistent self-image
const MOTION_SMOOTH = 0.45; // temporal smoothing of live motion
const PRED_HORIZON = 8; // frames ahead the room reaches

type Mode = "autopilot" | "camera";

interface Metrics {
  mode: Mode;
  surprise: number;
  agreement: number;
  memory: number; // how much the room has learned (0..1)
}

// ── WebGL2 renderer (oil-film interference field) ────────────────────────────
interface FieldRenderer {
  render(
    bytes: Uint8Array,
    live: [number, number],
    pred: [number, number],
    surprise: number,
    timeSec: number,
  ): void;
  resize(): void;
  dispose(): void;
}

const VERT = `#version 300 es
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// Cool interference-fringe (Newton's-rings / oil-film) gamut — a deliberate
// break from the lab's violet→gold. LIVE reads as a bright cyan crest;
// PREDICTION reads as teal→indigo standing fringes; SURPRISE blooms magenta.
const FRAG = `#version 300 es
precision highp float;
out vec4 frag;

uniform vec2 uRes;
uniform float uTime;
uniform float uSurprise;
uniform vec2 uLive;   // screen uv, y up
uniform vec2 uPred;   // screen uv, y up
uniform sampler2D uField; // R=live G=pred B=memory A=error

float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  float a=hash(i), b=hash(i+vec2(1,0)), c=hash(i+vec2(0,1)), d=hash(i+vec2(1,1));
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}

// Thin-film iridescence, biased to a cool teal→indigo→magenta gamut.
vec3 fringe(float ph){
  float a = ph * 6.2831853;
  vec3 c = vec3(
    0.50 + 0.50*sin(a + 3.9),
    0.50 + 0.50*sin(a + 1.3),
    0.50 + 0.50*sin(a + 0.1)
  );
  return c * vec3(0.72, 0.96, 1.08);
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 suv = vec2(uv.x, 1.0 - uv.y);      // sample field (row 0 = image top)
  float aspect = uRes.x / uRes.y;

  // Slow domain warp — the field breathes; more agitation under surprise.
  float t = uTime * 0.05;
  float warp = mix(0.010, 0.045, clamp(uSurprise,0.0,1.0));
  vec2 w = vec2(
    vnoise(uv*3.0 + vec2(t,0.0)) + 0.5*vnoise(uv*7.0 - vec2(0.0,t*1.3)),
    vnoise(uv*3.0 + vec2(9.0-t,4.0)) + 0.5*vnoise(uv*7.0 + vec2(t*1.1,0.0))
  ) - 0.75;
  vec2 fuv = clamp(suv + w * warp, 0.0, 1.0);

  vec4 F = texture(uField, fuv);
  float liveE = F.r;
  float predE = F.g;
  float memE  = F.b;
  float errE  = F.a;

  // Deep petrol base (NOT near-black-cosmic).
  vec3 col = vec3(0.015, 0.055, 0.075);

  // PREDICTION — standing interference fringes from the learned memory.
  // Coherent when calm, fractured (noise-displaced) under surprise.
  float frac = clamp(uSurprise,0.0,1.0);
  float disp = (vnoise(uv*14.0 + t*3.0) - 0.5) * frac * 0.8;
  float ph = predE*9.0 + memE*5.0 + length(uv-uPred)*8.0 + uTime*0.18 + disp;
  vec3 predCol = fringe(ph) * (0.35 + predE*1.4) * (0.35 + memE*0.9);
  col += predCol * (0.6 + 0.4*(1.0 - frac)); // fringes clarify when calm

  // LIVE — a bright cyan-white crest where you are moving right now.
  vec3 liveCol = vec3(0.55, 0.95, 1.05);
  col += liveCol * smoothstep(0.06, 0.55, liveE) * (0.6 + liveE*0.9);

  // SURPRISE bloom — hot magenta at the mismatch (thin-film magenta band).
  float shimmer = 0.75 + 0.25*sin(uTime*3.0 + uv.y*10.0); // ≤3 Hz
  vec3 errCol = vec3(1.05, 0.35, 0.72);
  col += errCol * smoothstep(0.05, 0.5, errE) * shimmer * 1.3;

  // Centroid markers make the GAP legible: a waiting RING at the prediction
  // centroid, a bright DOT at your live centroid, a faint tie between them.
  float dPred = length((uv-uPred)*vec2(aspect,1.0));
  float ring = smoothstep(0.045, 0.03, abs(dPred - 0.05));
  col += fringe(uTime*0.2) * ring * 0.9;

  float dLive = length((uv-uLive)*vec2(aspect,1.0));
  col += vec3(0.7,1.0,1.05) * smoothstep(0.03, 0.0, dLive) * 1.4;

  // The tie-line grows with the gap → a visible measure of prediction error.
  vec2 pa = uPred, pb = uLive;
  vec2 ab = pb - pa; float L2 = max(dot(ab,ab), 1e-5);
  float h = clamp(dot(uv-pa, ab)/L2, 0.0, 1.0);
  float dLine = length((uv - (pa + ab*h)) * vec2(aspect,1.0));
  float gap = length(ab);
  col += vec3(0.9,0.5,0.85) * smoothstep(0.012, 0.0, dLine) * clamp(gap*2.5,0.0,1.0) * 0.7;

  // Gentle vignette + tone.
  float vig = smoothstep(1.25, 0.25, length(uv-0.5));
  col *= 0.55 + 0.45*vig;
  col = col / (col + 0.85);          // soft filmic rolloff
  col = pow(col, vec3(0.85));
  frag = vec4(col, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile failed: " + log);
  }
  return sh;
}

function makeFieldRenderer(canvas: HTMLCanvasElement): FieldRenderer {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
  });
  if (!gl) throw new Error("WebGL2 unavailable");

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    throw new Error("program link failed: " + log);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  const vao = gl.createVertexArray();
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const uRes = gl.getUniformLocation(prog, "uRes");
  const uTime = gl.getUniformLocation(prog, "uTime");
  const uSurprise = gl.getUniformLocation(prog, "uSurprise");
  const uLive = gl.getUniformLocation(prog, "uLive");
  const uPred = gl.getUniformLocation(prog, "uPred");
  const uField = gl.getUniformLocation(prog, "uField");

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl!.viewport(0, 0, canvas.width, canvas.height);
  }
  resize();

  return {
    resize,
    render(bytes, live, pred, surprise, timeSec) {
      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        GW,
        GH,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        bytes,
      );
      gl.uniform1i(uField, 0);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, timeSec);
      gl.uniform1f(uSurprise, surprise);
      gl.uniform2f(uLive, live[0], live[1]);
      gl.uniform2f(uPred, pred[0], pred[1]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      gl.deleteTexture(tex);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(prog);
      const lose = gl.getExtension("WEBGL_lose_context");
      lose?.loseContext();
    },
  };
}

// ── Component ────────────────────────────────────────────────────────────────
export default function TheReturnPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const rendererRef = useRef<FieldRenderer | null>(null);
  const audioRef = useRef<ReturnAudio | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const grabRef = useRef<HTMLCanvasElement | null>(null);
  const autopilotRef = useRef<Autopilot>(makeAutopilot(RETURN_SEED));

  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const modeRef = useRef<Mode>("autopilot");
  const audioOnRef = useRef<boolean>(false);

  // Field arrays (the two independent state variables + supporting memory).
  const lumPrevRef = useRef<Float32Array>(new Float32Array(N));
  const motionRef = useRef<Float32Array>(new Float32Array(N));
  const memoryRef = useRef<Float32Array>(new Float32Array(N));
  const predRef = useRef<Float32Array>(new Float32Array(N));
  const bytesRef = useRef<Uint8Array>(new Uint8Array(N * 4));
  const firstFrameRef = useRef<boolean>(true);

  // Trajectory tracking for the short-horizon predictor.
  const liveCentroidRef = useRef<[number, number]>([0.5, 0.5]);
  const velRef = useRef<[number, number]>([0, 0]);
  const predCentroidRef = useRef<[number, number]>([0.5, 0.5]);
  const memMassRef = useRef<number>(0);

  const [audioOn, setAudioOn] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<"off" | "loading" | "on">(
    "off",
  );
  const [notesOpen, setNotesOpen] = useState(false);
  const [glError, setGlError] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Metrics>({
    mode: "autopilot",
    surprise: 0,
    agreement: 0,
    memory: 0,
  });

  // Compute the LIVE motion field from the camera (frame difference) or, in
  // autopilot, paint a soft blob at the phantom position.
  const buildLiveField = useCallback((tSec: number) => {
    const motion = motionRef.current;
    if (modeRef.current === "camera" && streamRef.current) {
      const grab = grabRef.current!;
      const g2d = grab.getContext("2d", { willReadFrequently: true })!;
      // Mirror horizontally (selfie view).
      g2d.save();
      g2d.scale(-1, 1);
      g2d.drawImage(videoRef.current!, -GW, 0, GW, GH);
      g2d.restore();
      const img = g2d.getImageData(0, 0, GW, GH).data;
      const prev = lumPrevRef.current;
      const first = firstFrameRef.current;
      for (let i = 0; i < N; i++) {
        const r = img[i * 4],
          gg = img[i * 4 + 1],
          b = img[i * 4 + 2];
        const lum = (0.299 * r + 0.587 * gg + 0.114 * b) / 255;
        const diff = first ? 0 : Math.abs(lum - prev[i]);
        // Threshold + gain so idle sensor noise doesn't read as motion.
        const m = diff > 0.06 ? Math.min(1, (diff - 0.04) * 3.2) : 0;
        motion[i] = motion[i] * MOTION_SMOOTH + m * (1 - MOTION_SMOOTH);
        prev[i] = lum;
      }
      firstFrameRef.current = false;
    } else {
      // Autopilot: seeded phantom body → soft Gaussian motion blob.
      const p = autopilotRef.current.step(tSec);
      const cx = p.x * GW;
      const cy = p.y * GH;
      const rad = 7 + p.energy * 4;
      const inv = 1 / (2 * rad * rad);
      for (let y = 0; y < GH; y++) {
        for (let x = 0; x < GW; x++) {
          const dx = x - cx,
            dy = y - cy;
          const g = Math.exp(-(dx * dx + dy * dy) * inv) * p.energy;
          const i = y * GW + x;
          motion[i] = motion[i] * MOTION_SMOOTH + g * (1 - MOTION_SMOOTH);
        }
      }
    }
  }, []);

  // Centroid of a field (returns normalized coords + total mass).
  const centroid = useCallback((f: Float32Array) => {
    let sx = 0,
      sy = 0,
      s = 0;
    for (let y = 0; y < GH; y++) {
      for (let x = 0; x < GW; x++) {
        const v = f[y * GW + x];
        sx += x * v;
        sy += y * v;
        s += v;
      }
    }
    if (s < 1e-4) return { x: 0.5, y: 0.5, mass: 0 };
    return { x: sx / s / GW, y: sy / s / GH, mass: s };
  }, []);

  // Advance the whole model one step and return the drive for audio.
  const stepModel = useCallback(
    (tSec: number): FieldDrive => {
      buildLiveField(tSec);
      const motion = motionRef.current;
      const memory = memoryRef.current;
      const pred = predRef.current;

      // LIVE centroid + velocity (for the short-horizon predictor).
      const lc = centroid(motion);
      const prevC = liveCentroidRef.current;
      const vel = velRef.current;
      if (lc.mass > 0.02) {
        vel[0] = vel[0] * 0.8 + (lc.x - prevC[0]) * 0.2;
        vel[1] = vel[1] * 0.8 + (lc.y - prevC[1]) * 0.2;
        prevC[0] = lc.x;
        prevC[1] = lc.y;
      }

      // MEMORY — persistent self-image: slow EMA of where this body moves.
      let memMass = 0;
      for (let i = 0; i < N; i++) {
        memory[i] += (motion[i] - memory[i]) * MEM_ALPHA;
        memMass += memory[i];
      }
      memMassRef.current = memMass;

      // PREDICTION — the room's expectation: the learned memory, warped toward
      // a blob at the extrapolated next position (trajectory reach). This is a
      // genuinely separate array from LIVE motion.
      const px = Math.max(0, Math.min(1, prevC[0] + vel[0] * PRED_HORIZON));
      const py = Math.max(0, Math.min(1, prevC[1] + vel[1] * PRED_HORIZON));
      const bcx = px * GW,
        bcy = py * GH;
      const brad = 9;
      const binv = 1 / (2 * brad * brad);
      // Confidence in the reach grows as memory accumulates.
      const conf = Math.min(1, memMass / 120);
      for (let y = 0; y < GH; y++) {
        for (let x = 0; x < GW; x++) {
          const i = y * GW + x;
          const dx = x - bcx,
            dy = y - bcy;
          const blob = Math.exp(-(dx * dx + dy * dy) * binv);
          // memory habit + anticipatory reach
          const target = Math.min(1, memory[i] * 6 + blob * 0.7 * conf);
          pred[i] += (target - pred[i]) * 0.25;
        }
      }
      const pc = centroid(pred);
      predCentroidRef.current = [pc.x, pc.y];

      // PREDICTION ERROR field (surprise): motion that the room did NOT expect.
      const bytes = bytesRef.current;
      let errSum = 0;
      let liveSum = 0;
      for (let i = 0; i < N; i++) {
        const live = motion[i];
        const expect = pred[i];
        const err = Math.max(0, live - expect); // surprise where unexpected
        errSum += err;
        liveSum += live;
        bytes[i * 4] = Math.min(255, live * 255) | 0;
        bytes[i * 4 + 1] = Math.min(255, expect * 255) | 0;
        bytes[i * 4 + 2] = Math.min(255, memory[i] * 6 * 255) | 0;
        bytes[i * 4 + 3] = Math.min(255, err * 320) | 0;
      }
      // Normalized surprise = fraction of live motion that was unexpected.
      const surprise = liveSum > 0.05 ? Math.min(1, errSum / liveSum) : 0;
      const agreement = 1 - surprise;

      return {
        surprise,
        liveX: lc.x,
        liveY: lc.y,
        predX: pc.x,
        predY: pc.y,
        agreement,
      };
    },
    [buildLiveField, centroid],
  );

  // Mount: set up renderer + run loop. Autopilot runs immediately (visual demo
  // before Start). Audio stays silent until the user starts it.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    grabRef.current = document.createElement("canvas");
    grabRef.current.width = GW;
    grabRef.current.height = GH;

    let renderer: FieldRenderer;
    try {
      renderer = makeFieldRenderer(canvas);
    } catch {
      setGlError(true);
      return;
    }
    rendererRef.current = renderer;

    const onResize = () => renderer.resize();
    window.addEventListener("resize", onResize);

    startTimeRef.current = performance.now();
    let metricTick = 0;

    const loop = () => {
      const tSec = (performance.now() - startTimeRef.current) / 1000;
      const drive = stepModel(tSec);

      renderer.render(
        bytesRef.current,
        [drive.liveX, 1 - drive.liveY],
        [drive.predX, 1 - drive.predY],
        drive.surprise,
        tSec,
      );

      if (audioOnRef.current) audioRef.current?.update(drive);

      if (++metricTick % 8 === 0) {
        setMetrics({
          mode: modeRef.current,
          surprise: drive.surprise,
          agreement: drive.agreement,
          memory: Math.min(1, memMassRef.current / 120),
        });
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      renderer.dispose();
      rendererRef.current = null;
      void audioRef.current?.dispose();
      audioRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const beginAudio = useCallback(async () => {
    if (audioOnRef.current) return;
    try {
      const a = new ReturnAudio();
      await a.start();
      audioRef.current = a;
      audioOnRef.current = true;
      setAudioOn(true);
    } catch {
      setNotice("Audio could not start in this browser.");
    }
  }, []);

  const enableCamera = useCallback(async () => {
    if (cameraStatus === "on" || cameraStatus === "loading") return;
    setCameraStatus("loading");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();
      firstFrameRef.current = true;
      modeRef.current = "camera";
      setCameraStatus("on");
      setNotice(null);
    } catch (err) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      modeRef.current = "autopilot";
      setCameraStatus("off");
      const denied =
        err instanceof DOMException && err.name === "NotAllowedError";
      setNotice(
        denied
          ? "Camera denied — the room is learning a seeded phantom body instead (watch it learn, predict, then be surprised)."
          : "No camera available — a seeded phantom body is self-demoing the full arc.",
      );
    }
  }, [cameraStatus]);

  return (
    <div className="relative min-h-[calc(100vh-3rem)] w-full overflow-hidden bg-background">
      {/* Art canvas — WebGL2 oil-film interference field (raw palette here). */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <video ref={videoRef} className="hidden" playsInline muted autoPlay />

      {/* Chrome overlay — semantic tokens only. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="max-w-md">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              2314 · The Return
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              A room that learns to expect you
            </h1>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">
              The room remembers where your body tends to move and glows ahead,
              anticipating you. The music is the gap between where it thinks you
              are and where you actually are — move as expected and it resolves;
              surprise it and it flares, then slowly learns your new habit.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setNotesOpen(true)}
            className="pointer-events-auto min-h-[44px] shrink-0 rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {glError && (
            <p className="max-w-xl text-sm leading-relaxed text-destructive">
              WebGL2 is unavailable in this browser, so the interference field
              cannot render. Try a current desktop browser with hardware
              acceleration enabled.
            </p>
          )}
          {notice && !glError && (
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
              {notice}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <div className="pointer-events-auto flex flex-wrap items-center gap-3">
              {!audioOn ? (
                <button
                  type="button"
                  onClick={beginAudio}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Start — let the room listen
                </button>
              ) : (
                <button
                  type="button"
                  onClick={enableCamera}
                  disabled={
                    cameraStatus === "on" || cameraStatus === "loading"
                  }
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {cameraStatus === "loading"
                    ? "Enabling camera…"
                    : cameraStatus === "on"
                      ? "Camera live — let it get to know you"
                      : "Enable camera (or keep watching the phantom)"}
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
              <span>mode: {metrics.mode === "camera" ? "camera" : "phantom"}</span>
              <span>surprise: {metrics.surprise.toFixed(2)}</span>
              <span>known: {metrics.agreement.toFixed(2)}</span>
              <span>memory: {metrics.memory.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      {notesOpen && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-h-[85vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Design notes
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
              The Return
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The room is a small predictive-processing agent. It builds a
              persistent self-image of you — an exponential moving-average
              heatmap of your motion — and from it forms a{" "}
              <em>prediction field</em>: where it expects you, warped toward a
              short-horizon extrapolation of your recent trajectory. It renders
              that expectation as a glow that reaches ahead of you.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              There is no master knob. Two independent fields — your{" "}
              <em>live motion</em> and the room&apos;s <em>prediction</em> —
              conflict, and the sound is driven by their gap. Match the
              prediction and the two voices fuse into a consonant D-Lydian pad;
              surprise it and the prediction error blooms magenta and the second
              voice detunes into dissonance. Keep surprising it and the memory
              relearns, so the surprising thing becomes expected — the room
              habituates. Being predicted is a form of being regarded.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Palette: a cool oil-film / Newton&apos;s-rings interference gamut
              (a deliberate break from the lab&apos;s violet-and-gold). Live
              motion is a bright cyan crest; the learned prediction is teal-to-
              indigo standing fringes; surprise is a hot magenta band.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              No camera? A seeded phantom body demos the whole arc: it wanders
              (the room learns), holds still (the prediction glows ahead,
              waiting), breaks the pattern (a flare), then settles until the
              room learns the new habit too.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              After Andy Clark, <em>Surfing Uncertainty</em> (perception as
              prediction-error minimization); Blanke &amp; Mohr on heautoscopy
              (being regarded by a reduplicated self in extrapersonal space);
              and Memo Akten&apos;s <em>Learning to See</em> (a machine that can
              only see through what it has already learned).
            </p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setNotesOpen(false)}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
