"use client";

/**
 * 622 — Wolfram Rhythm
 * A single integer (the Wolfram rule, 0–255) composes the music. A 1D elementary
 * cellular automaton unfolds row by row on a musical clock; each newly born row's
 * live cells fire short, edged percussive events panned by column. The visual is
 * the iconic scrolling Wolfram diagram (WebGL2, with a Canvas2D fallback).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  PRESETS,
  type Row,
  stepRow,
  makeSeedCentered,
  makeSeedSoup,
  liveCount,
  rowsEqual,
  StagnationDetector,
  perturb,
} from "./engine";
import { WolframAudio, type Timbre } from "./audio";

const WIDTH = 96; // CA columns
const ROWS = 80; // visible diagram rows
const TIMBRES: Timbre[] = ["metal", "click", "pluck"];

// ── WebGL2 renderer ──────────────────────────────────────────────────────────
const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// Reads a grid texture (R = cell alive, G = age 0..1) and renders crisp cells.
const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform sampler2D uGrid;
uniform vec2 uDims;       // cols, rows
uniform float uPlayhead;  // row index (0..rows-1) of newest row
void main() {
  vec2 cell = floor(vec2(vUv.x * uDims.x, (1.0 - vUv.y) * uDims.y));
  vec2 uv = (cell + 0.5) / uDims;
  vec4 g = texture(uGrid, uv);
  float alive = g.r;
  float age = g.g; // 0 = just born, 1 = old

  // grid lines / sharp pixels
  vec2 f = fract(vec2(vUv.x * uDims.x, (1.0 - vUv.y) * uDims.y));
  float gap = step(0.04, f.x) * step(0.04, f.y);

  float playGlow = exp(-abs((cell.y) - uPlayhead) * 1.2);

  vec3 dead = vec3(0.03, 0.04, 0.06);
  // edged palette: cold steel -> hot born flash
  vec3 settled = vec3(0.30, 0.55, 0.78);
  vec3 born = vec3(0.95, 0.97, 1.0);
  vec3 live = mix(born, settled, smoothstep(0.0, 0.25, age));
  live *= mix(0.35, 1.0, 1.0 - age); // old rows fade

  vec3 col = mix(dead, live, alive);
  col += playGlow * 0.10 * vec3(0.4, 0.7, 1.0);
  col *= gap;
  frag = vec4(col, 1.0);
}`;

interface GLCtx {
  gl: WebGL2RenderingContext;
  prog: WebGLProgram;
  tex: WebGLTexture;
  data: Uint8Array; // cols*rows*4 (RGBA)
  uGrid: WebGLUniformLocation | null;
  uDims: WebGLUniformLocation | null;
  uPlay: WebGLUniformLocation | null;
}

function makeShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
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

function initGL(canvas: HTMLCanvasElement): GLCtx | null {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
  if (!gl) return null;
  const vs = makeShader(gl, gl.VERTEX_SHADER, VERT);
  const fs = makeShader(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const aPos = gl.getAttribLocation(prog, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const tex = gl.createTexture();
  if (!tex) return null;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const data = new Uint8Array(WIDTH * ROWS * 4);
  return {
    gl,
    prog,
    tex,
    data,
    uGrid: gl.getUniformLocation(prog, "uGrid"),
    uDims: gl.getUniformLocation(prog, "uDims"),
    uPlay: gl.getUniformLocation(prog, "uPlayhead"),
  };
}

function drawGL(ctx: GLCtx, grid: Row[], ages: Float32Array[]): void {
  const { gl, data } = ctx;
  // grid[0] is the NEWEST row; place it at the bottom (playhead).
  for (let r = 0; r < ROWS; r++) {
    const src = grid[r];
    const age = ages[r];
    const rowFromBottom = ROWS - 1 - r; // newest -> bottom texel row
    for (let c = 0; c < WIDTH; c++) {
      const i = (rowFromBottom * WIDTH + c) * 4;
      const alive = src ? src[c] : 0;
      data[i] = alive ? 255 : 0;
      data[i + 1] = age ? Math.min(255, Math.floor(age[c] * 255)) : 255;
      data[i + 2] = 0;
      data[i + 3] = 255;
    }
  }
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.useProgram(ctx.prog);
  gl.bindTexture(gl.TEXTURE_2D, ctx.tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, WIDTH, ROWS, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.uniform1i(ctx.uGrid, 0);
  gl.uniform2f(ctx.uDims, WIDTH, ROWS);
  gl.uniform1f(ctx.uPlay, 0); // newest at bottom row index 0 (cell.y)
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

// ── Canvas2D fallback renderer ────────────────────────────────────────────────
function draw2D(
  cv: HTMLCanvasElement,
  grid: Row[],
  ages: Float32Array[],
): void {
  const ctx = cv.getContext("2d");
  if (!ctx) return;
  const w = cv.width;
  const h = cv.height;
  ctx.fillStyle = "#08090c";
  ctx.fillRect(0, 0, w, h);
  const cw = w / WIDTH;
  const ch = h / ROWS;
  for (let r = 0; r < ROWS; r++) {
    const src = grid[r];
    const age = ages[r];
    if (!src) continue;
    const y = (ROWS - 1 - r) * ch;
    for (let c = 0; c < WIDTH; c++) {
      if (!src[c]) continue;
      const a = age ? age[c] : 1;
      const fade = 0.35 + 0.65 * (1 - a);
      const flash = a < 0.2 ? 1 : 0;
      const rC = Math.floor((0.3 + 0.65 * flash) * 255);
      const gC = Math.floor((0.55 + 0.42 * flash) * 255);
      const bC = Math.floor((0.78 + 0.22 * flash) * 255);
      ctx.fillStyle = `rgba(${rC},${gC},${bC},${fade})`;
      ctx.fillRect(c * cw + 0.5, y + 0.5, cw - 1, ch - 1);
    }
  }
}

// ── React component ───────────────────────────────────────────────────────────
interface SimState {
  grid: Row[]; // grid[0] = newest, length ROWS
  ages: Float32Array[]; // parallel ages, 0 = just born
  rule: number;
  bpm: number;
  audioOn: boolean;
  lastEvent: string;
}

export default function WolframRhythmPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [started, setStarted] = useState(false); // audio gate
  const [rule, setRule] = useState(110);
  const [bpm, setBpm] = useState(168);
  const [timbre, setTimbre] = useState<Timbre>("metal");
  const [usingGL, setUsingGL] = useState(true);
  const [glFailed, setGlFailed] = useState(false);
  const [lastEvent, setLastEvent] = useState("seeding");
  const [showNotes, setShowNotes] = useState(false);

  const audioRef = useRef<WolframAudio | null>(null);
  const sim = useRef<SimState>({
    grid: [],
    ages: [],
    rule: 110,
    bpm: 168,
    audioOn: false,
    lastEvent: "",
  });
  const detector = useRef(new StagnationDetector(8, 24));

  // keep refs in sync with controls
  useEffect(() => {
    sim.current.rule = rule;
  }, [rule]);
  useEffect(() => {
    sim.current.bpm = bpm;
  }, [bpm]);
  useEffect(() => {
    if (audioRef.current) audioRef.current.timbre = timbre;
  }, [timbre]);

  // seed the simulation immediately (visual runs without audio gate)
  const reseedAll = useCallback((mode: "single" | "soup") => {
    const seed = mode === "single" ? makeSeedCentered(WIDTH) : makeSeedSoup(WIDTH, 0.45);
    const grid: Row[] = [seed];
    const ages: Float32Array[] = [new Float32Array(WIDTH)];
    for (let i = 1; i < ROWS; i++) {
      grid.push(new Uint8Array(WIDTH));
      ages.push(new Float32Array(WIDTH).fill(1));
    }
    sim.current.grid = grid;
    sim.current.ages = ages;
    detector.current.reset();
  }, []);

  // changing the RULE re-seeds and transforms the music
  const applyRule = useCallback(
    (r: number) => {
      const clamped = Math.max(0, Math.min(255, Math.round(r)));
      setRule(clamped);
      sim.current.rule = clamped;
      reseedAll(Math.random() < 0.5 ? "single" : "soup");
      setLastEvent(`rule ${clamped} — re-seeded`);
    },
    [reseedAll],
  );

  // initial seed on mount
  useEffect(() => {
    reseedAll("single");
  }, [reseedAll]);

  // main sim + render loop. Visual always runs; audio fires only when started.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let glctx: GLCtx | null = null;
    let useGL = true;
    glctx = initGL(canvas);
    if (!glctx) {
      useGL = false;
      setGlFailed(true);
      setUsingGL(false);
    }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(2, Math.floor(rect.width * dpr));
      canvas.height = Math.max(2, Math.floor(rect.height * dpr));
    };
    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    let lastTick = performance.now();
    let lastFrame = performance.now();

    const tick = () => {
      const s = sim.current;
      const a = audioRef.current;
      const prev = s.grid[0];
      if (!prev) return;
      const next = stepRow(prev, s.rule);

      // age existing rows, shift down, insert new at front
      for (const ag of s.ages) {
        for (let i = 0; i < ag.length; i++) ag[i] = Math.min(1, ag[i] + 1 / ROWS);
      }
      s.grid.unshift(next);
      s.grid.pop();
      s.ages.unshift(new Float32Array(WIDTH)); // age 0 = just born
      s.ages.pop();

      // long-form watchdog → perturb / reseed so it never dies or freezes
      const stale = detector.current.push(next);
      if (stale) {
        if (stale === "dead") {
          reseedAll(Math.random() < 0.5 ? "single" : "soup");
          s.lastEvent = "dead → re-seeded";
        } else if (stale === "frozen" || rowsEqual(next, prev)) {
          reseedAll("soup");
          s.lastEvent = "frozen → soup re-seed";
        } else {
          perturb(s.grid[0], 4 + Math.floor(Math.random() * 5));
          detector.current.reset();
          s.lastEvent = "cycle → perturbed";
        }
        setLastEvent(s.lastEvent);
      }

      // sound: each live cell of the new row fires an event
      if (a && s.audioOn) {
        const row = s.grid[0];
        const live = liveCount(row);
        const intensity = Math.max(0.3, Math.min(1, 8 / Math.max(1, live)));
        const t = a.ctx.currentTime + 0.01;
        for (let c = 0; c < WIDTH; c++) {
          if (row[c]) a.fireCell(c, WIDTH, t, intensity);
        }
      }
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const beatMs = 60000 / sim.current.bpm;
      if (now - lastTick >= beatMs) {
        lastTick = now;
        tick();
      }
      // render ~ every frame (cap to 60fps render)
      if (now - lastFrame >= 14) {
        lastFrame = now;
        if (useGL && glctx) drawGL(glctx, sim.current.grid, sim.current.ages);
        else draw2D(canvas, sim.current.grid, sim.current.ages);
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [reseedAll]);

  const begin = useCallback(async () => {
    if (!audioRef.current) {
      const a = new WolframAudio();
      a.timbre = timbre;
      audioRef.current = a;
    }
    await audioRef.current.resume();
    sim.current.audioOn = true;
    setStarted(true);
    setLastEvent("audio live");
  }, [timbre]);

  // cleanup audio on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.close();
      audioRef.current = null;
    };
  }, []);

  const activePreset = PRESETS.find((p) => p.rule === rule);

  return (
    <main className="min-h-screen bg-[#06070a] text-foreground px-5 py-6 sm:px-8 sm:py-8 font-sans">
      <div className="mx-auto max-w-5xl flex flex-col gap-5">
        <header className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
              Wolfram Rhythm
            </h1>
            <p className="text-base text-muted-foreground max-w-2xl">
              A single integer composes the music: a 1D cellular automaton unfolds
              row by row on a beat, and each live cell sounds.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowNotes((v) => !v)}
            className="shrink-0 min-h-[44px] px-4 py-2.5 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground hover:border-border font-mono"
          >
            Design notes
          </button>
        </header>

        {/* big rule readout */}
        <div className="flex items-end gap-4 font-mono">
          <div className="flex flex-col">
            <span className="text-sm text-muted-foreground uppercase tracking-widest">rule</span>
            <span className="text-6xl sm:text-7xl font-bold tabular-nums text-foreground leading-none">
              {rule}
            </span>
          </div>
          <div className="flex flex-col pb-1 text-muted-foreground">
            <span className="text-base text-foreground">
              {activePreset ? activePreset.label : "custom"}
            </span>
            <span className="text-sm text-muted-foreground">
              {activePreset ? activePreset.blurb : "—"}
            </span>
          </div>
        </div>

        {/* canvas */}
        <div className="relative w-full rounded-lg overflow-hidden border border-border bg-black">
          <canvas
            ref={canvasRef}
            className="block w-full"
            style={{ height: "46vh", minHeight: 280, imageRendering: "pixelated" }}
          />
          {!started && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/55 backdrop-blur-[1px] gap-3">
              <p className="text-base text-muted-foreground text-center px-6 max-w-sm">
                The automaton is already drawing. Tap Begin to hear it.
              </p>
              <button
                type="button"
                onClick={begin}
                className="min-h-[44px] px-6 py-2.5 rounded-md bg-card text-black font-semibold text-base hover:bg-accent"
              >
                Begin
              </button>
            </div>
          )}
          {glFailed && (
            <div className="absolute top-2 left-2 text-xs font-mono text-violet-300 bg-black/60 px-2 py-1 rounded">
              WebGL2 unavailable — Canvas2D fallback
            </div>
          )}
          <div className="absolute bottom-2 right-2 text-xs font-mono text-muted-foreground bg-black/40 px-2 py-1 rounded">
            {usingGL ? "webgl2" : "canvas2d"} · {lastEvent}
          </div>
        </div>

        {/* the ONE lever: rule number */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => applyRule(rule - 1)}
              className="min-h-[44px] min-w-[44px] px-4 py-2.5 rounded-md border border-border text-foreground text-xl font-mono hover:border-border"
              aria-label="rule down"
            >
              −
            </button>
            <input
              type="range"
              min={0}
              max={255}
              value={rule}
              onChange={(e) => applyRule(Number(e.target.value))}
              className="flex-1 accent-violet-400 h-2"
              aria-label="rule number"
            />
            <button
              type="button"
              onClick={() => applyRule(rule + 1)}
              className="min-h-[44px] min-w-[44px] px-4 py-2.5 rounded-md border border-border text-foreground text-xl font-mono hover:border-border"
              aria-label="rule up"
            >
              +
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.rule}
                type="button"
                onClick={() => applyRule(p.rule)}
                className={`min-h-[44px] px-4 py-2.5 rounded-md border text-sm font-mono ${
                  rule === p.rule
                    ? "border-violet-400 bg-violet-400/15 text-foreground"
                    : "border-border text-muted-foreground hover:border-border"
                }`}
              >
                <span className="text-foreground">{p.rule}</span>{" "}
                <span className="text-muted-foreground">{p.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* tempo + timbre */}
        <section className="flex flex-wrap items-center gap-x-8 gap-y-3 font-mono">
          <label className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="uppercase tracking-widest text-muted-foreground">tempo</span>
            <input
              type="range"
              min={60}
              max={300}
              value={bpm}
              onChange={(e) => setBpm(Number(e.target.value))}
              className="accent-violet-400 w-40 h-2"
              aria-label="tempo"
            />
            <span className="tabular-nums text-foreground w-16">{bpm} bpm</span>
          </label>

          <div className="flex items-center gap-2">
            <span className="uppercase tracking-widest text-muted-foreground text-sm">voice</span>
            {TIMBRES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTimbre(t)}
                className={`min-h-[44px] px-4 py-2.5 rounded-md border text-sm ${
                  timbre === t
                    ? "border-violet-400 bg-violet-400/15 text-foreground"
                    : "border-border text-muted-foreground hover:border-border"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </section>

        {showNotes && (
          <aside className="rounded-lg border border-border bg-muted p-5 text-base text-muted-foreground flex flex-col gap-3">
            <h2 className="text-xl font-semibold text-foreground">Design notes</h2>
            <p>
              Each row of an elementary cellular automaton is a chord/rhythm. The
              8-bit <span className="text-foreground font-mono">rule number</span> (0–255)
              decides how each cell&apos;s left/self/right neighbourhood becomes the
              next row. That single integer is the composition.
            </p>
            <p>
              <span className="font-mono text-foreground">30</span> chaotic and noisy,{" "}
              <span className="font-mono text-foreground">90</span> a self-similar
              Sierpinski fractal, <span className="font-mono text-foreground">110</span>{" "}
              complex and Turing-complete (gliders collide). Live cells fire short,
              metallic/clicky FM blips panned by column over a whole-tone set —
              edged, not cozy.
            </p>
            <p className="text-muted-foreground">
              When a rule freezes, dies, or locks into a short cycle, the engine
              auto-perturbs (flips cells) or re-seeds, so the piece keeps evolving
              for minutes. Refs: Wolfram, <em>A New Kind of Science</em> (2002);
              Cook, Rule 110 Turing-completeness (2004); Xenakis, CA in composition.
            </p>
          </aside>
        )}
      </div>
    </main>
  );
}
