"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/* ─── GLSL source ────────────────────────────────────────────────────── */

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;

uniform vec2  u_res;
uniform float u_time;
uniform float u_bass;
uniform float u_treble;
uniform float u_centroid;  // 0 (low) → 1 (high)
uniform float u_onset;     // decays 0→1 flash

// ─── SDF primitives ────────────────────────────────────────────────────
float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float sdCapsule(vec3 p, float h, float r) {
  p.y -= clamp(p.y, 0.0, h);
  return length(p) - r;
}

float sdTorus(vec3 p, vec2 t) {
  vec2 q = vec2(length(p.xz) - t.x, p.y);
  return length(q) - t.y;
}

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5*(b-a)/k, 0.0, 1.0);
  return mix(b, a, h) - k*h*(1.0-h);
}

// Simple pseudo-random for noise
float hash(vec3 p) {
  p = fract(p * vec3(127.1, 311.7, 74.7));
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}

float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f*f*(3.0-2.0*f);
  return mix(
    mix(mix(hash(i),            hash(i+vec3(1,0,0)), f.x),
        mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)), f.x), f.y),
    mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)), f.x),
        mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)), f.x), f.y),
    f.z);
}

// ─── Scene SDF ─────────────────────────────────────────────────────────
float sceneSDF(vec3 p) {
  // Treble noise displacement on position
  float disp = 0.0;
  if (u_treble > 0.01) {
    disp = (noise3(p * 1.8 + u_time * 0.3) * 2.0 - 1.0) * u_treble * 0.22;
  }
  vec3 pd = p + disp;

  // Bass drives smin blend factor — walls melt together at high bass
  float k = 0.15 + u_bass * 0.55;

  // Cave room (rounded box, slightly larger than camera space)
  float room = -sdBox(pd, vec3(3.8, 2.0, 5.5));

  // Ceiling arch (torus at top of cave)
  vec3 archP = pd - vec3(0.0, 1.6, 0.0);
  float arch = sdTorus(archP, vec2(1.4, 0.35));

  // Stalactite columns via domain repetition on Z axis (period 2.2)
  vec3 rep = pd;
  rep.z = mod(rep.z + 1.1, 2.2) - 1.1;
  // Two columns per Z-period, offset in X
  float col1 = sdCapsule(rep - vec3(-1.3, -1.9, 0.0), 1.6, 0.18);
  float col2 = sdCapsule(rep - vec3( 1.3, -1.9, 0.0), 1.6, 0.18);
  float cols = min(col1, col2);

  // Ceiling stalactites (upside-down capsules from ceiling)
  vec3 repC = pd;
  repC.z = mod(repC.z + 2.3, 2.2) - 1.1;
  float stl = sdCapsule(vec3(abs(repC.x)-0.9, -(repC.y - 2.0), repC.z), 0.9, 0.12);

  // Blend room with arch using smin, then add columns as positive shapes
  float scene = smin(room, -arch, k);
  scene = smin(scene, cols, k);
  scene = smin(scene, stl, k);

  return scene;
}

// ─── Normal via central differences ────────────────────────────────────
vec3 calcNormal(vec3 p) {
  float e = 0.002;
  return normalize(vec3(
    sceneSDF(p + vec3(e,0,0)) - sceneSDF(p - vec3(e,0,0)),
    sceneSDF(p + vec3(0,e,0)) - sceneSDF(p - vec3(0,e,0)),
    sceneSDF(p + vec3(0,0,e)) - sceneSDF(p - vec3(0,0,e))
  ));
}

// ─── Soft shadow ────────────────────────────────────────────────────────
float softShadow(vec3 ro, vec3 rd, float mint, float maxt) {
  float res = 1.0;
  float t = mint;
  for (int i = 0; i < 12; i++) {
    float h = sceneSDF(ro + rd*t);
    if (h < 0.001) return 0.0;
    res = min(res, 6.0*h/t);
    t += clamp(h, 0.02, 0.25);
    if (t > maxt) break;
  }
  return clamp(res, 0.0, 1.0);
}

// ─── Ray march ─────────────────────────────────────────────────────────
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;

  // Onset camera shake
  float shake = u_onset * 0.03;
  uv += vec2(noise3(vec3(uv*10.0, u_time*20.0))-0.5,
             noise3(vec3(uv*10.0+5.0, u_time*20.0))-0.5) * shake;

  // Slow orbital camera — viewer drifts slowly around Z axis inside the cave
  float angle = u_time * 0.12;
  float camX = sin(angle) * 0.6;
  float camZ = cos(angle) * 0.5 - 1.5; // forward into cave
  float camY = -0.2;

  vec3 ro = vec3(camX, camY, camZ);
  vec3 target = vec3(0.0, 0.0, camZ - 3.0);
  vec3 forward = normalize(target - ro);
  vec3 right = normalize(cross(vec3(0,1,0), forward));
  vec3 up = cross(forward, right);
  vec3 rd = normalize(uv.x * right + uv.y * up + 1.6 * forward);

  // March
  float t = 0.0;
  float hit = -1.0;
  for (int i = 0; i < 96; i++) {
    float d = sceneSDF(ro + rd * t);
    if (d < 0.003) { hit = t; break; }
    if (t > 18.0) break;
    t += max(d * 0.85, 0.008);
  }

  // Cave light color driven by spectral centroid
  // Low centroid = warm amber-violet; high centroid = cold blue-cyan
  vec3 lightColorWarm = vec3(0.65, 0.30, 0.60); // violet-amber
  vec3 lightColorCool = vec3(0.25, 0.60, 0.95); // ice-blue
  vec3 lightCol = mix(lightColorWarm, lightColorCool, u_centroid);
  vec3 lightPos = vec3(0.0, 0.8, camZ - 2.5);

  vec3 col;
  if (hit > 0.0) {
    vec3 pos = ro + rd * hit;
    vec3 nor = calcNormal(pos);

    // Light
    vec3 ldir = normalize(lightPos - pos);
    float diff = max(dot(nor, ldir), 0.0);
    float shadow = softShadow(pos + nor*0.01, ldir, 0.1, 6.0);
    float dist = length(lightPos - pos);
    float atten = 1.0 / (1.0 + dist*dist * 0.18);

    // Ambient occlusion approximation (darken interior corners)
    float ao = clamp(sceneSDF(pos + nor*0.12) / 0.12, 0.0, 1.0);

    // Cave wall base color — dark stone with subtle blue-indigo tint
    vec3 stoneCol = vec3(0.04, 0.03, 0.06)
      + nor * 0.012  // normal-mapped shading hints
      + noise3(pos * 3.0) * 0.015; // stone texture variation

    // Bass resonance: inner walls faintly pulse with warm glow
    stoneCol += lightCol * u_bass * 0.06;

    col = stoneCol * (0.12 + diff * shadow * atten * 1.8) * lightCol;
    col *= 0.4 + ao * 0.6; // ao darkening

    // Atmospheric fog / depth
    float fog = exp(-hit * 0.09);
    col = mix(vec3(0.005, 0.003, 0.010), col, fog);

    // Onset flash (brief bright white wash)
    col += u_onset * 0.18 * vec3(0.9, 0.85, 1.0);
  } else {
    // Background void — deep cave darkness
    col = vec3(0.003, 0.002, 0.006);
    col += u_onset * 0.06 * vec3(0.7, 0.6, 1.0);
  }

  // Slight vignette
  float vign = 1.0 - dot(uv*1.2, uv*1.2) * 0.35;
  col *= vign;

  // Tone-map (ACES filmic approximation)
  col = col * (2.51*col + 0.03) / (col * (2.43*col + 0.59) + 0.14);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

/* ─── Demo LFO oscillators (no mic mode) ────────────────────────────── */

function makeDemoAudio() {
  const ctx = new AudioContext();

  const freqs = [55, 110, 165, 220, 330, 440];
  const phases = freqs.map((_, i) => i * 0.97);

  let t = 0;
  const getFrame = () => {
    t += 1 / 60;
    const bands = freqs.map((f, i) =>
      Math.max(0, Math.sin(t * f * 0.009 + phases[i]) * 0.5 + 0.5)
    );
    const bass = (bands[0] + bands[1]) * 0.5;
    const treble = (bands[4] + bands[5]) * 0.5;
    const centroid = (bands[2] * 2 + bands[3] * 3 + bands[4] * 5) / (bands[2] + bands[3] + bands[4] + 0.001) / 5;
    const onset = bands[0] > 0.9 ? Math.max(0, bands[0] - 0.89) * 5 : 0;
    return { bass, treble, centroid, onset };
  };

  return { ctx, getFrame, stop: () => ctx.close() };
}

/* ─── Main component ─────────────────────────────────────────────────── */

export default function SdfCave() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef(0);
  const [started, setStarted] = useState(false);
  const [micMode, setMicMode] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", { antialias: false });
    if (!gl) return;

    // ─── Compile shader ───────────────────────────────────────────────
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    // ─── Full-screen quad ─────────────────────────────────────────────
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    // ─── Uniform locations ────────────────────────────────────────────
    const uRes      = gl.getUniformLocation(prog, "u_res");
    const uTime     = gl.getUniformLocation(prog, "u_time");
    const uBass     = gl.getUniformLocation(prog, "u_bass");
    const uTreble   = gl.getUniformLocation(prog, "u_treble");
    const uCentroid = gl.getUniformLocation(prog, "u_centroid");
    const uOnset    = gl.getUniformLocation(prog, "u_onset");

    // ─── Resize ───────────────────────────────────────────────────────
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width  = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width  = `${w}px`;
      canvas.style.height = `${h}px`;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    // ─── Audio setup ─────────────────────────────────────────────────
    let bass = 0, treble = 0, centroid = 0.3, onsetVal = 0;
    let analyser: AnalyserNode | null = null;
    let freqBuf: Uint8Array<ArrayBuffer> | null = null;
    let stream: MediaStream | null = null;
    let demoGetFrame: (() => { bass: number; treble: number; centroid: number; onset: number }) | null = null;

    if (micMode) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then(s => {
        stream = s;
        const actx = new AudioContext();
        const src = actx.createMediaStreamSource(s);
        analyser = actx.createAnalyser();
        analyser.fftSize = 2048;
        freqBuf = new Uint8Array(analyser.frequencyBinCount);
        src.connect(analyser);
      }).catch(() => setMicError("Mic unavailable — running demo mode"));
    } else {
      const demo = makeDemoAudio();
      demoGetFrame = demo.getFrame;
    }

    const SMOOTH = 0.88;
    let sBass = 0, sTreble = 0, sCentroid = 0.3;

    const getAudio = () => {
      if (analyser && freqBuf) {
        analyser.getByteFrequencyData(freqBuf);
        const binHz = 22050 / analyser.frequencyBinCount;
        const band = (lo: number, hi: number) => {
          let s = 0, c = 0;
          for (let b = Math.floor(lo/binHz); b < Math.min(Math.ceil(hi/binHz), freqBuf!.length); b++) {
            s += freqBuf![b]; c++;
          }
          return c > 0 ? s / c / 255 : 0;
        };
        bass     = band(20, 250);
        treble   = band(4000, 20000);
        let tot = 0, wsum = 0;
        for (let b = 0; b < freqBuf.length; b++) { const v = freqBuf[b]/255; tot += v; wsum += v * b * binHz; }
        centroid = tot > 0.01 ? Math.min(wsum / tot / 8000, 1) : sCentroid;
        const flux = bass + treble;
        onsetVal = flux > sBass + sTreble + 0.3 ? Math.min(1, flux - sBass - sTreble) : onsetVal * 0.88;
      } else if (demoGetFrame) {
        const f = demoGetFrame();
        bass = f.bass; treble = f.treble; centroid = f.centroid; onsetVal = f.onset;
      }
      sBass     = sBass     * SMOOTH + bass     * (1-SMOOTH);
      sTreble   = sTreble   * SMOOTH + treble   * (1-SMOOTH);
      sCentroid = sCentroid * SMOOTH + centroid * (1-SMOOTH);
      onsetVal  = Math.max(0, onsetVal * 0.86);
    };

    // ─── Render loop ──────────────────────────────────────────────────
    const startTime = performance.now();

    const render = () => {
      getAudio();
      const t = (performance.now() - startTime) / 1000;
      const { width: W, height: H } = canvas;

      gl.uniform2f(uRes, W, H);
      gl.uniform1f(uTime, t);
      gl.uniform1f(uBass, sBass);
      gl.uniform1f(uTreble, sTreble);
      gl.uniform1f(uCentroid, sCentroid);
      gl.uniform1f(uOnset, onsetVal);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      animRef.current = requestAnimationFrame(render);
    };
    animRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
      stream?.getTracks().forEach(t => t.stop());
    };
  }, [started, micMode]);

  if (!started) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-6 px-6 text-center">
        <h1 className="text-3xl font-mono text-white/95 tracking-tight">Cave</h1>
        <p className="text-base text-white/75 max-w-sm">
          A dark stone space that breathes with sound. Bass melts the walls. Treble
          roughens the stone. The light changes with your music.
        </p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            onClick={() => { setMicMode(false); setStarted(true); }}
            className="min-h-[44px] px-6 py-2.5 rounded-lg bg-violet-500/20 border border-violet-500/40
                       text-violet-300 text-base font-mono hover:bg-violet-500/30 transition-colors"
          >
            Enter (demo)
          </button>
          <button
            onClick={() => { setMicMode(true); setStarted(true); }}
            className="min-h-[44px] px-6 py-2.5 rounded-lg bg-white/5 border border-white/15
                       text-white/80 text-base font-mono hover:bg-white/10 transition-colors"
          >
            Enter with mic
          </button>
        </div>
        <p className="text-xs text-white/55">WebGL required</p>
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Overlay — top-left info */}
      <div className="absolute top-4 left-4 flex flex-col gap-1 pointer-events-none">
        <span className="font-mono text-xs text-white/55">
          206 — Cave
        </span>
        {micError && (
          <span className="text-xs text-rose-300">{micError}</span>
        )}
        {micMode && !micError && (
          <span className="text-xs text-emerald-300/95">● mic active</span>
        )}
        {!micMode && (
          <span className="text-xs text-white/55">demo mode</span>
        )}
      </div>

      {/* Bottom-right: nav link */}
      <div className="absolute bottom-4 right-4">
        <Link
          href="/dream"
          className="font-mono text-xs text-white/40 hover:text-white/70 transition-colors"
        >
          ← dream lab
        </Link>
      </div>

      {/* Design notes link */}
      <div className="absolute bottom-4 left-4">
        <Link
          href="/dream/206-sdf-cave/README.md"
          className="font-mono text-xs text-white/40 hover:text-white/70 transition-colors"
        >
          design notes
        </Link>
      </div>
    </div>
  );
}
