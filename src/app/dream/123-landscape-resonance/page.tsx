"use client";
import { useRef, useEffect, useState, useCallback } from "react";

// ── Vertex shader ──────────────────────────────────────────────────────────────
const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

// ── Fragment shader ────────────────────────────────────────────────────────────
const FRAG = `
precision mediump float;
uniform vec2  uRes;
uniform float uTime;
uniform float uBass;
uniform float uTreble;
uniform float uOnset;
uniform float uAmp;

// ---- value noise + FBM -------------------------------------------------------
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float valueNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i),             hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
  for (int i = 0; i < 5; i++) { v += a * valueNoise(p); p = rot * p * 2.0; a *= 0.5; }
  return v;
}

// ---- terrain heightfield ----------------------------------------------------
float terrainH(vec2 xz) {
  float base   = fbm(xz * 0.35) * 0.72;
  float detail = fbm(xz * 1.40) * 0.22 * uTreble;
  return (base + detail) * (0.45 + uBass * 1.4) - 0.20;
}

// ---- sky colour -------------------------------------------------------------
vec3 skyCol(float hy) {
  return mix(vec3(0.07, 0.02, 0.14), vec3(0.03, 0.01, 0.08), clamp(hy * 4.0, 0.0, 1.0));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;

  // camera flies forward along Z; height tracks terrain amplitude
  float scaleH = 0.45 + uBass * 1.4;
  vec3 ro = vec3(0.0, scaleH * 0.85 + 0.32, uTime * 0.38);
  vec3 rd = normalize(vec3(uv.x, uv.y - 0.12, 1.15));

  float fogD = 0.050 + uAmp * 0.12;

  // ray march
  float t = 0.08; bool hit = false; float hitT = 0.0;
  for (int i = 0; i < 110; i++) {
    vec3 p = ro + t * rd;
    if (p.y < terrainH(p.xz)) { hit = true; hitT = t; break; }
    t += max(0.018, 0.008 * t);
    if (t > 18.0) break;
  }

  vec3 col;
  if (hit) {
    vec3  p   = ro + hitT * rd;
    float eps = 0.012;
    vec3  n   = normalize(vec3(
      terrainH(p.xz - vec2(eps, 0.0)) - terrainH(p.xz + vec2(eps, 0.0)),
      2.0 * eps,
      terrainH(p.xz - vec2(0.0, eps)) - terrainH(p.xz + vec2(0.0, eps))
    ));

    // height → color: deep violet (valleys) → emerald (slopes) → near-white (peaks)
    float normH = clamp((terrainH(p.xz) + 0.20) / scaleH, 0.0, 1.0);
    vec3 cLow  = vec3(0.17, 0.04, 0.36);
    vec3 cMid  = vec3(0.10, 0.70, 0.44);
    vec3 cHigh = vec3(0.93, 0.97, 1.00);
    vec3 tc;
    if (normH < 0.55) tc = mix(cLow, cMid,  normH / 0.55);
    else              tc = mix(cMid, cHigh, (normH - 0.55) / 0.45);

    float diff = clamp(dot(n, normalize(vec3(0.4, 0.9, 0.5))), 0.0, 1.0);
    tc *= 0.22 + 0.78 * diff;

    float fog = 1.0 - exp(-fogD * hitT * hitT * 0.35);
    col = mix(tc, skyCol(0.0), fog);
  } else {
    col  = skyCol(abs(rd.y));
    col += vec3(0.12, 0.04, 0.22) * exp(-abs(rd.y) * 8.0) * 0.38;
  }

  // onset: brief blue-white flash over the terrain
  col = mix(col, vec3(0.88, 0.93, 1.00), uOnset * 0.48);
  // vignette
  col *= 1.0 - 0.30 * dot(uv, uv);
  gl_FragColor = vec4(col, 1.0);
}
`;

// ── WebGL helpers ──────────────────────────────────────────────────────────────
function buildGLProgram(
  gl: WebGLRenderingContext,
  vert: string,
  frag: string,
): WebGLProgram {
  const compile = (type: number, src: string): WebGLShader => {
    const sh = gl.createShader(type) as WebGLShader;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    return sh;
  };
  const prog = gl.createProgram() as WebGLProgram;
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vert));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(prog);
  return prog;
}

function spawnDemoLFOs(ctx: AudioContext, dest: AudioNode): void {
  const layers = [
    { hz: 55,  lfoHz: 0.08, type: "sine"     as OscillatorType, g: 0.08 },
    { hz: 180, lfoHz: 0.25, type: "triangle" as OscillatorType, g: 0.07 },
    { hz: 440, lfoHz: 0.63, type: "sine"     as OscillatorType, g: 0.05 },
  ];
  layers.forEach(({ hz, lfoHz, type, g }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const lfo  = ctx.createOscillator();
    const lg   = ctx.createGain();
    osc.type = type;
    osc.frequency.value = hz;
    lfo.frequency.value = lfoHz;
    lg.gain.value   = g * 0.75;
    gain.gain.value = g;
    lfo.connect(lg);
    lg.connect(gain.gain);
    osc.connect(gain);
    gain.connect(dest);
    osc.start();
    lfo.start();
  });
}

// ── Shared state (mutable, no re-render needed) ────────────────────────────────
interface RS {
  gl:       WebGLRenderingContext | null;
  prog:     WebGLProgram          | null;
  uLoc:     Record<string, WebGLUniformLocation | null>;
  analyser: AnalyserNode | null;
  audioCtx: AudioContext | null;
  fftBuf:   Uint8Array<ArrayBuffer> | null;
  rafId:    number;
  prevBass: number;
  onsetDec: number;
  startMs:  number;
}

type Phase = "idle" | "demo" | "mic" | "error";

// ── Component ──────────────────────────────────────────────────────────────────
export default function LandscapeResonancePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rs = useRef<RS>({
    gl: null, prog: null, uLoc: {}, analyser: null, audioCtx: null,
    fftBuf: null, rafId: 0, prevBass: 0, onsetDec: 0, startMs: Date.now(),
  });
  const [phase, setPhase] = useState<Phase>("idle");
  const [errMsg, setErrMsg] = useState("");

  // ── WebGL setup ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl");
    if (!gl) return;

    const prog = buildGLProgram(gl, VERT, FRAG);
    gl.useProgram(prog);

    // fullscreen quad
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const names = ["uRes","uTime","uBass","uTreble","uOnset","uAmp"];
    const uLoc: Record<string, WebGLUniformLocation | null> = {};
    names.forEach(n => { uLoc[n] = gl.getUniformLocation(prog, n); });

    const s = rs.current;
    s.gl = gl; s.prog = prog; s.uLoc = uLoc;

    const sizeGL = () => {
      canvas.width  = canvas.clientWidth  || window.innerWidth;
      canvas.height = canvas.clientHeight || window.innerHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uLoc.uRes, canvas.width, canvas.height);
    };
    sizeGL();
    const ro = new ResizeObserver(sizeGL);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // ── Render loop ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const s = rs.current;

    const loop = () => {
      s.rafId = requestAnimationFrame(loop);
      const { gl, prog, uLoc } = s;
      if (!gl || !prog) return;

      let bass = 0, treble = 0, amp = 0;

      if (s.analyser && s.fftBuf) {
        s.analyser.getByteFrequencyData(s.fftBuf);
        const len   = s.fftBuf.length;
        const binHz = (s.audioCtx?.sampleRate ?? 44100) / 1024;
        let bS = 0, bN = 0, tS = 0, tN = 0, aS = 0;
        for (let i = 0; i < len; i++) {
          const v = s.fftBuf[i] / 255;
          const f = i * binHz;
          aS += v;
          if (f >= 20   && f < 250  ) { bS += v; bN++; }
          if (f >= 4000 && f < 14000) { tS += v; tN++; }
        }
        bass   = bN ? (bS / bN) * 2.4 : 0;
        treble = tN ? (tS / tN) * 2.8 : 0;
        amp    = Math.min((aS / len) * 5.0, 1.0);
      }

      // onset detection: sharp rise in bass triggers 100ms flash decay
      if (bass > s.prevBass + 0.28) s.onsetDec = 1.0;
      s.onsetDec = Math.max(0, s.onsetDec - 0.016 / 0.10);
      s.prevBass = bass;

      const t = (Date.now() - s.startMs) / 1000;
      gl.uniform1f(uLoc.uTime,   t);
      gl.uniform1f(uLoc.uBass,   Math.min(bass,       1.4));
      gl.uniform1f(uLoc.uTreble, Math.min(treble,     1.4));
      gl.uniform1f(uLoc.uOnset,  Math.min(s.onsetDec, 1.0));
      gl.uniform1f(uLoc.uAmp,    amp);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    loop();
    return () => cancelAnimationFrame(s.rafId);
  }, []);

  // ── Audio: demo ──────────────────────────────────────────────────────────────
  const startDemo = useCallback(async () => {
    const ctx      = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.82;
    spawnDemoLFOs(ctx, analyser);
    analyser.connect(ctx.destination);
    const s = rs.current;
    s.audioCtx = ctx; s.analyser = analyser;
    s.fftBuf = new Uint8Array(analyser.frequencyBinCount);
    setPhase("demo");
  }, []);

  // ── Audio: mic ───────────────────────────────────────────────────────────────
  const startMic = useCallback(async () => {
    try {
      const stream   = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const ctx      = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.78;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const s = rs.current;
      s.audioCtx = ctx; s.analyser = analyser;
      s.fftBuf = new Uint8Array(analyser.frequencyBinCount);
      setPhase("mic");
    } catch {
      setErrMsg("Mic access denied — try Demo mode");
      setPhase("error");
    }
  }, []);

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* header */}
      <div className="absolute top-0 left-0 right-0 flex items-start justify-between p-4 pointer-events-none">
        <div>
          <h1 className="text-2xl font-mono font-bold text-foreground tracking-wide">
            Landscape Resonance
          </h1>
          <p className="text-base text-muted-foreground mt-0.5 max-w-xs">
            Audio-reactive terrain — bass lifts mountains, treble adds surface detail
          </p>
        </div>
        {(phase === "demo" || phase === "mic") && (
          <span className="text-xs font-mono text-muted-foreground bg-black/40 px-2 py-1 rounded mt-1">
            {phase === "mic" ? "🎙 mic" : "◎ demo"}
          </span>
        )}
      </div>

      {/* start buttons */}
      {phase === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <button
            onClick={startMic}
            className="min-h-[44px] px-7 py-3 bg-violet-600/85 hover:bg-violet-500 text-foreground font-mono font-semibold text-base rounded-xl border border-violet-400/50 transition-colors"
          >
            Start mic
          </button>
          <button
            onClick={startDemo}
            className="min-h-[44px] px-7 py-3 bg-muted hover:bg-accent text-foreground font-mono text-base rounded-xl border border-border transition-colors"
          >
            Demo mode
          </button>
        </div>
      )}

      {/* error + fallback */}
      {phase === "error" && (
        <div className="absolute bottom-6 inset-x-4 flex flex-col items-center gap-3">
          <p className="text-violet-300 font-mono text-base text-center">{errMsg}</p>
          <button
            onClick={startDemo}
            className="min-h-[44px] px-6 py-3 bg-muted hover:bg-accent text-foreground font-mono text-base rounded-xl border border-border transition-colors"
          >
            Demo mode
          </button>
        </div>
      )}

      {/* footer hint */}
      {(phase === "demo" || phase === "mic") && (
        <div className="absolute bottom-3 inset-x-0 flex justify-center pointer-events-none">
          <p className="text-xs font-mono text-muted-foreground">
            bass = height · treble = surface detail · onset = flash
          </p>
        </div>
      )}
    </div>
  );
}
