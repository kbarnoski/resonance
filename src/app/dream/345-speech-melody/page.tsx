"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 345 · Speech Melody — type a line; hear your words SUNG.
//
// Resonance's first natural-language → music piece. A typed sentence is compiled
// (deterministically) into a Janáček-style "speech melody": each word's vowels
// become pitches, its consonants percussion, the sentence's prosody the phrasing.
// A raw WebGL2 pitch-contour ribbon glows behind the words; each word LIGHTS UP
// in a DOM layer as it sounds, its glow rising with pitch — so you recognise
// your own words being sung.
//
// References (see README): Leoš Janáček nápěvky mluvy; Alvin Lucier "I Am Sitting
// in a Room"; Fluxus text/event scores; Jaap Blonk sound poetry.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  compileMelody,
  EXAMPLE_LINES,
  WELCOME_LINE,
  type SpeechMelody,
} from "./text-music";
import {
  ensureEngine,
  runMelody,
  applyState,
  getState,
  disposeEngine,
} from "./audio";

// ── WebGL2 ribbon shaders ─────────────────────────────────────────────────────
// The contour is drawn as a glowing point field: a long strip of points whose
// vertical position is the pitch-height at that fraction of the phrase, brightened
// near the playhead.

const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos;   // x in 0..1 (phrase fraction), y = height 0..1
layout(location=1) in float a_bright;
uniform float u_time;
uniform float u_playhead;  // 0..1 progress
uniform vec2  u_res;
out float v_glow;
out float v_bright;
out float v_x;
void main(){
  float x = a_pos.x;
  float y = a_pos.y;
  // gentle vertical drift / shimmer
  float wob = sin(u_time*1.3 + x*22.0) * 0.006;
  vec2 ndc = vec2(x*2.0-1.0, (y*0.7+0.13)*2.0-1.0 + wob);
  gl_Position = vec4(ndc, 0.0, 1.0);
  float d = abs(x - u_playhead);
  float near = smoothstep(0.10, 0.0, d);
  float passed = x <= u_playhead ? 1.0 : 0.28;
  v_glow = passed * (0.5 + near*1.6);
  v_bright = a_bright;
  v_x = x;
  float sz = 3.0 + near*16.0 + a_bright*4.0;
  gl_PointSize = sz * (u_res.y/900.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in float v_glow;
in float v_bright;
in float v_x;
uniform float u_time;
out vec4 o;
void main(){
  vec2 pc = gl_PointCoord - 0.5;
  float r = length(pc);
  float a = smoothstep(0.5, 0.0, r);
  a *= a;
  // warm violet→amber palette keyed to brightness
  vec3 cold = vec3(0.55, 0.42, 0.95);
  vec3 warm = vec3(1.0, 0.78, 0.42);
  vec3 col = mix(cold, warm, v_bright);
  col += 0.15*sin(vec3(0.0,1.0,2.0) + u_time*0.5 + v_x*8.0);
  float g = clamp(v_glow, 0.0, 2.2);
  o = vec4(col * g, a * g * 0.9);
}`;

interface GL {
  gl: WebGL2RenderingContext;
  prog: WebGLProgram;
  vao: WebGLVertexArrayObject;
  posBuf: WebGLBuffer;
  count: number;
  uTime: WebGLUniformLocation | null;
  uPlay: WebGLUniformLocation | null;
  uRes: WebGLUniformLocation | null;
}

function compileShader(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type);
  if (!s) throw new Error("createShader failed");
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error("shader: " + log);
  }
  return s;
}

function initGL(canvas: HTMLCanvasElement): GL | null {
  const gl = canvas.getContext("webgl2", {
    antialias: true,
    premultipliedAlpha: false,
    alpha: true,
  });
  if (!gl) return null;

  const vs = compileShader(gl, gl.VERTEX_SHADER, VERT);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG);
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

  const vao = gl.createVertexArray();
  const posBuf = gl.createBuffer();
  if (!vao || !posBuf) return null;

  return {
    gl,
    prog,
    vao,
    posBuf,
    count: 0,
    uTime: gl.getUniformLocation(prog, "u_time"),
    uPlay: gl.getUniformLocation(prog, "u_playhead"),
    uRes: gl.getUniformLocation(prog, "u_res"),
  };
}

// Sample the melody's pitch-height contour into a dense point strip.
function buildContour(mel: SpeechMelody): Float32Array {
  const N = 480;
  // interleaved: x, y, bright per point
  const arr = new Float32Array(N * 3);
  const dur = mel.duration;
  for (let i = 0; i < N; i++) {
    const x = i / (N - 1);
    const tt = x * dur;
    // find active note (or nearest)
    let h = 0.5;
    let b = 0.4;
    for (const n of mel.notes) {
      if (tt >= n.onset && tt < n.onset + n.dur * 1.3) {
        h = n.height;
        b = n.bright;
        break;
      }
      if (n.onset > tt) {
        h = n.height;
        b = n.bright;
        break;
      }
    }
    arr[i * 3] = x;
    arr[i * 3 + 1] = h;
    arr[i * 3 + 2] = b;
  }
  return arr;
}

function uploadContour(g: GL, data: Float32Array) {
  const { gl } = g;
  gl.bindVertexArray(g.vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, g.posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 12, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 12, 8);
  gl.bindVertexArray(null);
  g.count = data.length / 3;
}

function drawFrame(g: GL, time: number, playhead: number, w: number, h: number) {
  const { gl } = g;
  gl.viewport(0, 0, w, h);
  gl.clearColor(0.03, 0.03, 0.06, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // additive glow
  gl.useProgram(g.prog);
  gl.uniform1f(g.uTime, time);
  gl.uniform1f(g.uPlay, playhead);
  gl.uniform2f(g.uRes, w, h);
  gl.bindVertexArray(g.vao);
  gl.drawArrays(gl.POINTS, 0, g.count);
  gl.bindVertexArray(null);
}

function disposeGL(g: GL) {
  const { gl } = g;
  gl.deleteBuffer(g.posBuf);
  gl.deleteVertexArray(g.vao);
  gl.deleteProgram(g.prog);
}

// ── component ─────────────────────────────────────────────────────────────────

export default function SpeechMelodyPage() {
  const [text, setText] = useState(WELCOME_LINE);
  const [playing, setPlaying] = useState(false);
  const [activeWord, setActiveWord] = useState(-1);
  const [progress, setProgress] = useState(0);
  const [glError, setGlError] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [mel, setMel] = useState<SpeechMelody>(() => compileMelody(WELCOME_LINE));

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<GL | null>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0); // ctx time when melody started
  const melRef = useRef<SpeechMelody>(mel);
  const playingRef = useRef(false);

  melRef.current = mel;

  // ── GL setup + render loop ──────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let g: GL | null = null;
    try {
      g = initGL(canvas);
    } catch {
      g = null;
    }
    if (!g) {
      setGlError(true);
      return;
    }
    glRef.current = g;
    uploadContour(g, buildContour(melRef.current));

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    };
    resize();
    window.addEventListener("resize", resize);

    const loop = () => {
      const gg = glRef.current;
      if (!gg) return;
      const t = performance.now() / 1000;
      let ph = 0;
      const eng = getState();
      const m = melRef.current;
      if (playingRef.current && eng) {
        // derive elapsed from audio-aligned start using a wall clock fallback:
        // we update progress in a separate tick (below), reuse it here.
        ph = phaseRef.current;
        // find active note for live state + word highlight
        const tt = ph * m.duration;
        let lvl = 0;
        let hgt = 0.5;
        let brt = 0.4;
        let wi = -1;
        for (const n of m.notes) {
          if (tt >= n.onset && tt < n.onset + n.dur) {
            const into = (tt - n.onset) / n.dur;
            lvl = Math.sin(Math.min(1, into) * Math.PI) * (0.5 + n.accent * 0.5);
            hgt = n.height;
            brt = n.bright;
            wi = n.wordIndex;
            break;
          }
        }
        applyState({ level: lvl, height: hgt, bright: brt });
        if (wi !== lastWordRef.current) {
          lastWordRef.current = wi;
          setActiveWord(wi);
        }
      }
      drawFrame(
        gg,
        t,
        ph,
        canvas.width,
        canvas.height,
      );
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (glRef.current) {
        disposeGL(glRef.current);
        glRef.current = null;
      }
    };
  }, []);

  // phase (0..1 progress) updated on its own rAF tied to audio start time
  const phaseRef = useRef(0);
  const lastWordRef = useRef(-1);
  const progRafRef = useRef<number | null>(null);

  // teardown audio on unmount
  useEffect(() => {
    return () => {
      if (progRafRef.current) cancelAnimationFrame(progRafRef.current);
      disposeEngine();
    };
  }, []);

  // re-upload contour whenever the melody changes
  useEffect(() => {
    const g = glRef.current;
    if (g) uploadContour(g, buildContour(mel));
  }, [mel]);

  const stopPlayback = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    if (progRafRef.current) cancelAnimationFrame(progRafRef.current);
    lastWordRef.current = -1;
    setActiveWord(-1);
  }, []);

  const play = useCallback(
    async (lineOverride?: string) => {
      const line = (lineOverride ?? text).trim() || WELCOME_LINE;
      const m = compileMelody(line);
      setMel(m);
      melRef.current = m;
      setNeedsTap(false);

      let eng;
      try {
        eng = await ensureEngine();
      } catch {
        setNeedsTap(true);
        return;
      }
      const startAt = runMelody(eng, m);
      startRef.current = startAt;
      playingRef.current = true;
      setPlaying(true);
      lastWordRef.current = -1;

      const ctx = eng.ctx;
      const tick = () => {
        const elapsed = ctx.currentTime - startRef.current;
        const p = Math.max(0, Math.min(1, elapsed / m.duration));
        phaseRef.current = p;
        setProgress(p);
        if (elapsed >= m.duration + 0.4) {
          stopPlayback();
          phaseRef.current = 0;
          setProgress(0);
          return;
        }
        progRafRef.current = requestAnimationFrame(tick);
      };
      if (progRafRef.current) cancelAnimationFrame(progRafRef.current);
      progRafRef.current = requestAnimationFrame(tick);
    },
    [text, stopPlayback],
  );

  // ── auto-play the welcome line on load (gracefully blocked → tap Play) ───────
  useEffect(() => {
    let cancelled = false;
    const id = window.setTimeout(async () => {
      if (cancelled) return;
      try {
        const eng = await ensureEngine();
        if (eng.ctx.state !== "running") {
          setNeedsTap(true);
          return;
        }
        play(WELCOME_LINE);
      } catch {
        setNeedsTap(true);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const words = mel.words;
  const curWordText =
    activeWord >= 0 && words[activeWord] ? words[activeWord].text : "—";

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#08080d] text-foreground">
      {/* WebGL2 contour canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-hidden
      />

      {/* design notes link */}
      <Link
        href="/dream/345-speech-melody/README.md"
        className="absolute right-4 top-4 z-30 text-base text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground"
      >
        Read the design notes
      </Link>

      <div className="relative z-20 mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-5 py-8">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Speech Melody
          </h1>
          <p className="text-base text-muted-foreground">
            Type a line — a poem, a memory — and hear its{" "}
            <span className="text-violet-300">speech</span> become{" "}
            <span className="text-violet-300/95">music</span>. Vowels sing,
            consonants tap, your words light up as they sound.
          </p>
        </header>

        {glError && (
          <p className="text-base text-violet-300">
            WebGL2 isn&apos;t available on this device — the contour visuals are
            off, but the audio and the word highlights still play.
          </p>
        )}

        {/* the sung words — large, readable, light up word-by-word */}
        <div className="rounded-xl border border-border bg-black/30 p-5 backdrop-blur-sm">
          <p className="mb-3 font-mono text-base text-muted-foreground">the sung line</p>
          <p className="flex flex-wrap gap-x-3 gap-y-2 text-xl leading-relaxed sm:text-2xl">
            {words.length === 0 && (
              <span className="text-muted-foreground">type a line below…</span>
            )}
            {words.map((w) => {
              const on = w.index === activeWord;
              return (
                <span
                  key={w.index}
                  className={
                    "transition-all duration-150 " +
                    (on
                      ? "text-violet-200 drop-shadow-[0_0_18px_rgba(251,191,36,0.7)]"
                      : w.index < activeWord
                        ? "text-violet-200/90"
                        : "text-muted-foreground")
                  }
                  style={
                    on
                      ? { transform: "translateY(-4px) scale(1.06)" }
                      : undefined
                  }
                >
                  {w.text}
                </span>
              );
            })}
          </p>
        </div>

        {/* input */}
        <div className="space-y-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            spellCheck={false}
            placeholder="Type or paste a phrase…"
            className="w-full resize-none rounded-xl border border-border bg-black/40 px-4 py-3 text-base text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-violet-400/60"
          />

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => (playing ? stopPlayback() : play())}
              className="min-h-[44px] rounded-lg bg-violet-500/90 px-4 py-2.5 text-base font-medium text-foreground hover:bg-violet-400"
            >
              {playing ? "Stop" : "Play"}
            </button>
            {needsTap && (
              <span className="text-base text-violet-300/95">
                tap Play to begin
              </span>
            )}
          </div>

          {/* example phrases */}
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_LINES.map((ex) => (
              <button
                key={ex}
                onClick={() => {
                  setText(ex);
                  play(ex);
                }}
                className="min-h-[44px] rounded-lg border border-border bg-muted px-4 py-2.5 text-base text-muted-foreground hover:border-violet-400/50 hover:text-foreground"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>

        {/* legible readout */}
        <div className="mt-auto grid grid-cols-3 gap-3 font-mono text-base">
          <div className="rounded-lg border border-border bg-black/30 px-3 py-2">
            <div className="text-muted-foreground">mode / key</div>
            <div className="text-violet-300/95">
              {mel.modeName} · {mel.keyName}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-black/30 px-3 py-2">
            <div className="text-muted-foreground">now sounding</div>
            <div className="truncate text-violet-300/95">{curWordText}</div>
          </div>
          <div className="rounded-lg border border-border bg-black/30 px-3 py-2">
            <div className="text-muted-foreground">progress</div>
            <div className="text-violet-300">
              {Math.round(progress * 100)}%
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
