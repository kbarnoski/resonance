"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMicAnalyser } from "../_shared/use-mic-analyser";

// ── GLSL shaders ───────────────────────────────────────────────────────────────

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`.trim();

const FRAG = `
precision mediump float;
uniform vec2  uRes;
uniform float uTime;
uniform float uBass;
uniform float uTreble;
uniform float uCent;
uniform float uOnset;
uniform vec2  uShake;

/* ---- SDF primitives ---- */
float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5*(b-a)/k, 0.0, 1.0);
  return mix(b, a, h) - k*h*(1.0-h);
}

/* ---- Value noise ---- */
float hash3(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}

float vnoise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p);
  f = f*f*(3.0 - 2.0*f);
  return mix(
    mix(mix(hash3(i),           hash3(i+vec3(1,0,0)), f.x),
        mix(hash3(i+vec3(0,1,0)), hash3(i+vec3(1,1,0)), f.x), f.y),
    mix(mix(hash3(i+vec3(0,0,1)), hash3(i+vec3(1,0,1)), f.x),
        mix(hash3(i+vec3(0,1,1)), hash3(i+vec3(1,1,1)), f.x), f.y),
    f.z);
}

/* ---- Cave SDF ---- */
/* Returns positive in "air", negative inside solid geometry.
   Camera orbit stays inside the positive (air) region. */
float cave(vec3 p) {
  /* Surface roughness driven by treble */
  float nd = (vnoise(p * 2.5) - 0.5) * uTreble * 0.16;

  /* Interior of cave room: negate sdBox → positive inside */
  float room = -sdBox(p, vec3(4.2, 2.3, 5.8)) + nd * 0.45;

  /* Stalactites (12 capsules, hanging from ceiling y≈+2.3) */
  float stD = 9.9;
  for (int ix = 0; ix < 4; ix++) {
    for (int iz = 0; iz < 3; iz++) {
      float xi = float(ix) * 2.7 - 4.05;
      float zi = float(iz) * 4.2 - 4.2;
      float h  = 0.45 + hash3(vec3(float(ix), float(iz), 0.71)) * 1.05;
      float r  = 0.065 + hash3(vec3(xi, zi, 1.32)) * 0.045;
      vec3  sp = p - vec3(xi, 2.3 - h*0.5, zi);
      sp.y -= clamp(sp.y, -h*0.5, h*0.5);
      stD = min(stD, length(sp) - r);
    }
  }

  /* Stalagmites (5 capsules, rising from floor y≈-2.3) */
  float sgD = 9.9;
  for (int k = 0; k < 5; k++) {
    float xk = float(k) * 1.9 - 3.8;
    float h  = 0.28 + hash3(vec3(float(k)*1.13, 3.07, 0.0)) * 0.48;
    vec3  sp = p - vec3(xk, -2.3 + h*0.5, 0.7 + hash3(vec3(float(k),0.0,0.0))*1.5);
    sp.y -= clamp(sp.y, -h*0.5, h*0.5);
    sgD = min(sgD, length(sp) - 0.09);
  }

  /* Bass drives smin blend — walls melt/crystallise with the beat */
  float bk = mix(0.05, 0.68, uBass);
  float c  = smin(room, stD, bk);
  c = smin(c, sgD, bk * 0.5);
  return c;
}

/* ---- Surface normal via central differences ---- */
vec3 caveNorm(vec3 p) {
  float e = 0.003;
  return normalize(vec3(
    cave(p + vec3(e,0,0)) - cave(p - vec3(e,0,0)),
    cave(p + vec3(0,e,0)) - cave(p - vec3(0,e,0)),
    cave(p + vec3(0,0,e)) - cave(p - vec3(0,0,e))));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5*uRes) / uRes.y;

  /* Camera orbit (you are inside the cave) */
  float ang = uTime * 0.004;
  vec3  ro  = vec3(sin(ang)*2.7, -0.3, cos(ang)*3.1) + vec3(uShake, 0.0);
  vec3  tgt = vec3(0.0, 0.15, 0.0);
  vec3  fwd = normalize(tgt - ro);
  vec3  rgt = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
  vec3  up2 = cross(rgt, fwd);
  vec3  rd  = normalize(uv.x*rgt + uv.y*up2 + fwd*1.35);

  /* Sphere-tracing ray march (64 steps) */
  float t  = 0.05;
  float ht = -1.0;
  for (int i = 0; i < 64; i++) {
    float d = cave(ro + rd*t);
    if (d < 0.004) { ht = t; break; }
    if (t > 16.0)  break;
    t += max(d * 0.65, 0.004);
  }

  vec3 col;
  if (ht > 0.0) {
    vec3 hp = ro + rd*ht;
    vec3 n  = caveNorm(hp);

    /* Warm amber key light from cave centre */
    vec3  lp   = vec3(0.0, 1.5, 0.6);
    vec3  ldir = normalize(lp - hp);
    float diff = max(dot(n, ldir), 0.0);
    float att  = 1.0 / (1.0 + 0.08*dot(lp-hp, lp-hp));

    /* Cool fill from below */
    float fill = max(dot(n, vec3(0.0, -1.0, 0.0)), 0.0) * 0.18;

    /* Spectral centroid shifts cave glow: violet(bass) → ice-blue(treble) */
    vec3 warmAccent = vec3(0.52, 0.18, 1.00);
    vec3 coolAccent = vec3(0.08, 0.62, 1.00);
    vec3 accent     = mix(warmAccent, coolAccent, uCent);

    vec3 stone = vec3(0.10, 0.08, 0.17);
    col  = stone * (0.22 + diff*att*2.9 + fill);
    col += accent * diff * att * 0.70;
    col += vec3(uOnset * 0.20);            /* onset white pulse */

    /* Depth fog: far surfaces sink into near-black */
    col = mix(vec3(0.01, 0.005, 0.02), col, exp(-ht * 0.09));
  } else {
    /* Ray escaped — deep void */
    col = vec3(0.01, 0.005, 0.02);
  }

  /* Gamma encode (sRGB ≈ x^(1/2.2)) */
  gl_FragColor = vec4(pow(max(col, 0.0), vec3(0.4545)), 1.0);
}
`.trim();

// ── Component ──────────────────────────────────────────────────────────────────

type Phase = "idle" | "demo" | "mic";

interface GLState {
  gl:      WebGLRenderingContext;
  uRes:    WebGLUniformLocation | null;
  uTime:   WebGLUniformLocation | null;
  uBass:   WebGLUniformLocation | null;
  uTreble: WebGLUniformLocation | null;
  uCent:   WebGLUniformLocation | null;
  uOnset:  WebGLUniformLocation | null;
  uShake:  WebGLUniformLocation | null;
  startMs: number;
  cw:      number;
  ch:      number;
}

export default function SdfCavePage() {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase]   = useState<Phase>("idle");
  const [errMsg, setErrMsg] = useState("");

  const { running, error: micErr, start: startMic, getFrame } = useMicAnalyser({
    smoothing: 0.82,
    gain: 2.0,
    onsetThreshold: 1.75,
  });

  const glRef      = useRef<GLState | null>(null);
  const initRef    = useRef(false);           // guard: init WebGL only once
  const rafRef     = useRef(0);
  const runRef     = useRef(false);           // mirrors `running` for render closure
  const smRef      = useRef({ bass: 0.42, treble: 0.20, cent: 0.50, onset: 0, sx: 0, sy: 0 });

  // Sync running into a ref (avoids stale closure in render loop)
  useEffect(() => { runRef.current = running; }, [running]);
  // Surface mic permission errors
  useEffect(() => { if (micErr) setErrMsg(micErr); }, [micErr]);

  // WebGL init + render loop: fires once on first non-idle phase
  useEffect(() => {
    if (phase === "idle" || initRef.current) return;
    initRef.current = true;

    const canvasMaybe = canvasRef.current;
    if (!canvasMaybe) return;
    const canvas = canvasMaybe; // non-null alias

    const glMaybe = canvas.getContext("webgl");
    if (!glMaybe) { setErrMsg("WebGL unavailable — try Chrome or Firefox"); return; }
    const gl = glMaybe; // non-null alias — TypeScript narrows here but not inside inner fns

    function compileShader(type: number, src: string): WebGLShader | null {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error("Shader compile error:", gl.getShaderInfoLog(sh));
        return null;
      }
      return sh;
    }

    const vs = compileShader(gl.VERTEX_SHADER, VERT);
    const fs = compileShader(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) { setErrMsg("Shader compilation failed"); return; }

    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      setErrMsg("Shader link failed");
      return;
    }
    gl.useProgram(prog);

    // Fullscreen quad (TRIANGLE_STRIP covers the NDC square)
    const vbuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPosLoc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPosLoc);
    gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);

    const g: GLState = {
      gl,
      uRes:    gl.getUniformLocation(prog, "uRes"),
      uTime:   gl.getUniformLocation(prog, "uTime"),
      uBass:   gl.getUniformLocation(prog, "uBass"),
      uTreble: gl.getUniformLocation(prog, "uTreble"),
      uCent:   gl.getUniformLocation(prog, "uCent"),
      uOnset:  gl.getUniformLocation(prog, "uOnset"),
      uShake:  gl.getUniformLocation(prog, "uShake"),
      startMs: performance.now(),
      cw: 0,
      ch: 0,
    };
    glRef.current = g;

    function resize() {
      // Render at ~55% resolution; CSS scales up — keeps frame rate comfortable
      const dpr = Math.min(window.devicePixelRatio ?? 1, 1.5) * 0.55;
      g.cw = Math.max(1, Math.floor(window.innerWidth  * dpr));
      g.ch = Math.max(1, Math.floor(window.innerHeight * dpr));
      canvas.width  = g.cw;
      canvas.height = g.ch;
      canvas.style.width  = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      gl.viewport(0, 0, g.cw, g.ch);
    }
    resize();
    window.addEventListener("resize", resize);

    let prevBeat = -1;

    function renderFrame(ts: number) {
      rafRef.current = requestAnimationFrame(renderFrame);
      const g2 = glRef.current;
      if (!g2) return;

      const elapsed = (ts - g2.startMs) / 1000;
      const sm = smRef.current;
      const α  = 0.13;

      if (runRef.current) {
        // Mic mode: read smoothed bands from the shared analyser
        const fr = getFrame();
        if (fr) {
          sm.bass   += α * ((fr.bands[0] + fr.bands[1]) * 0.5 - sm.bass);
          sm.treble += α * ((fr.bands[4] + fr.bands[5]) * 0.5 - sm.treble);
          sm.cent   += α * (Math.min(fr.centroid / 5000, 1) - sm.cent);
          if (fr.onset) {
            sm.onset = 1.0;
            sm.sx = (Math.random() - 0.5) * 0.055;
            sm.sy = (Math.random() - 0.5) * 0.032;
          }
        }
      } else {
        // Demo: slow LFOs simulate a breathing cave
        sm.bass   = 0.42 + 0.38 * Math.sin(elapsed * 0.68);
        sm.treble = 0.18 + 0.17 * Math.sin(elapsed * 1.35 + 1.5);
        sm.cent   = 0.42 + 0.28 * Math.sin(elapsed * 0.52 + 2.1);
        // Demo onset every ~4 s
        const beatIdx = Math.floor(elapsed / 4.0);
        if (beatIdx !== prevBeat) {
          prevBeat  = beatIdx;
          sm.onset  = 1.0;
          sm.sx     = Math.sin(elapsed * 19) * 0.042;
          sm.sy     = Math.cos(elapsed * 17) * 0.026;
        }
      }

      // Decay
      sm.onset *= 0.87;
      sm.sx    *= 0.76;
      sm.sy    *= 0.76;

      const gc = g2.gl;
      gc.uniform2f(g2.uRes,    g2.cw, g2.ch);
      gc.uniform1f(g2.uTime,   elapsed);
      gc.uniform1f(g2.uBass,   Math.min(Math.max(sm.bass,   0), 1));
      gc.uniform1f(g2.uTreble, Math.min(Math.max(sm.treble, 0), 1));
      gc.uniform1f(g2.uCent,   Math.min(Math.max(sm.cent,   0), 1));
      gc.uniform1f(g2.uOnset,  Math.min(sm.onset, 1));
      gc.uniform2f(g2.uShake,  sm.sx, sm.sy);
      gc.drawArrays(gc.TRIANGLE_STRIP, 0, 4);
    }

    rafRef.current = requestAnimationFrame(renderFrame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      glRef.current = null;
    };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleDemo() {
    setPhase("demo");
  }

  async function handleMic() {
    if (phase === "idle") setPhase("demo");
    try {
      await startMic();
      setPhase("mic");
    } catch {
      setErrMsg("Mic access denied — check browser permissions");
    }
  }

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden">
      {/* WebGL canvas — full screen, scaled up from lower render resolution */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ width: "100%", height: "100%", imageRendering: "auto" }}
      />

      {/* ── Idle splash ── */}
      {phase === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 z-10 px-6">
          <h1 className="text-3xl font-mono text-foreground tracking-wide">Cave</h1>
          <p className="text-base text-muted-foreground max-w-xs text-center leading-relaxed">
            You are inside a stone chamber that breathes with your music.
            Bass melts the walls together; treble roughens the stone; spectral
            colour shifts from deep violet to ice blue.
          </p>
          <p className="text-sm text-muted-foreground max-w-xs text-center">
            SDF ray-marching — a visual paradigm new to the sandbox.
          </p>
          <div className="flex gap-3 mt-2">
            <button
              onClick={handleDemo}
              className="px-5 py-3 min-h-[44px] min-w-[80px] bg-muted hover:bg-accent border border-border text-foreground text-base font-mono rounded-lg transition-colors"
            >
              Demo
            </button>
            <button
              onClick={handleMic}
              className="px-5 py-3 min-h-[44px] min-w-[110px] bg-violet-500/20 hover:bg-violet-500/30 border border-violet-400/30 text-violet-300 text-base font-mono rounded-lg transition-colors"
            >
              Start mic
            </button>
          </div>
          {errMsg && <p className="text-violet-300 text-base">{errMsg}</p>}
        </div>
      )}

      {/* ── Active: title bar ── */}
      {phase !== "idle" && (
        <div className="absolute top-4 left-5 z-10 pointer-events-none select-none">
          <p className="text-xl font-mono text-foreground">Cave</p>
          <p className="text-sm text-muted-foreground mt-0.5">SDF ray-march · audio-reactive</p>
        </div>
      )}

      {/* ── Active: bottom bar ── */}
      {phase !== "idle" && (
        <div className="absolute bottom-4 left-5 right-5 flex items-center justify-between z-10">
          <p className="text-xs text-muted-foreground font-mono select-none">
            {running ? "🎤 mic" : "demo mode · LFO"}
          </p>
          <div className="flex items-center gap-4">
            {!running && (
              <button
                onClick={handleMic}
                className="text-sm text-violet-300 font-mono border border-violet-400/30 px-4 py-1.5 min-h-[36px] rounded hover:bg-violet-500/15 transition-colors"
              >
                Add mic →
              </button>
            )}
            <Link
              href="/dream"
              className="text-sm text-muted-foreground/70 font-mono hover:text-muted-foreground transition-colors"
            >
              ← dream lab
            </Link>
          </div>
        </div>
      )}

      {/* ── Error (active phase) ── */}
      {errMsg && phase !== "idle" && (
        <div className="absolute top-16 left-5 z-10">
          <p className="text-violet-300 text-base font-mono">{errMsg}</p>
        </div>
      )}
    </div>
  );
}
