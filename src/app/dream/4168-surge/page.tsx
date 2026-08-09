"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/visionary/safeFlicker";
import { FRAG_SRC, VERT_SRC } from "./shaders";
import { PHASE_LABEL, sampleArc, TOTAL_SECONDS, type Phase } from "./arc";
import { makeSurgeAudio, type SurgeAudio } from "./audio";

type Stage = "preface" | "running" | "nogl";

interface GLRig {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  u: Record<string, WebGLUniformLocation | null>;
}

interface Readout {
  phase: Phase;
  label: string;
  energy: number;
  progress: number;
  elapsed: number;
  ended: boolean;
}

// warmth of the palette per phase — cool in the calm sections, hot in drops
const PHASE_WARM: Record<Phase, number> = {
  intro: 0.05,
  build1: 0.35,
  drop1: 0.8,
  breakdown: 0.15,
  build2: 0.5,
  drop2: 1.0,
  outro: 0.2,
};

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error("4168-surge shader error:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function makeGLRig(canvas: HTMLCanvasElement): GLRig | null {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    powerPreference: "low-power",
  });
  if (!gl) return null;

  const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  if (!vs || !fs) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("4168-surge link error:", gl.getProgramInfoLog(program));
    return null;
  }

  const vao = gl.createVertexArray();
  const buf = gl.createBuffer();
  if (!vao || !buf) return null;
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const loc = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const names = [
    "u_res",
    "u_time",
    "u_energy",
    "u_riser",
    "u_rms",
    "u_low",
    "u_flash",
    "u_warm",
    "u_reduce",
  ];
  const u: Record<string, WebGLUniformLocation | null> = {};
  for (const n of names) u[n] = gl.getUniformLocation(program, n);

  return { gl, program, vao, u };
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, "0")}`;
}

export default function Page() {
  const [stage, setStage] = useState<Stage>("preface");
  const [showNotes, setShowNotes] = useState(false);
  const [uuid, setUuid] = useState("");
  const [pianoMsg, setPianoMsg] = useState<string | null>(null);
  const [readout, setReadout] = useState<Readout>({
    phase: "intro",
    label: PHASE_LABEL.intro,
    energy: 0,
    progress: 0,
    elapsed: 0,
    ended: false,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rigRef = useRef<GLRig | null>(null);
  const ctx2dRef = useRef<CanvasRenderingContext2D | null>(null);
  const audioRef = useRef<SurgeAudio | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const startRef = useRef(0);
  const lastTsRef = useRef<number | null>(null);
  const reducedRef = useRef(false);
  const timeRef = useRef(0); // shader wall-clock (dt-accumulated)
  const readoutClockRef = useRef(0);
  const nogl = useRef(false);

  // ── the frame loop ────────────────────────────────────────────────────────
  const runFrame = useCallback((ts: number) => {
    if (!runningRef.current) return;
    if (lastTsRef.current == null) lastTsRef.current = ts;
    let dt = (ts - lastTsRef.current) / 1000;
    lastTsRef.current = ts;
    if (dt > 0.1) dt = 0.1;
    timeRef.current += dt;

    const tSec = (performance.now() - startRef.current) / 1000;
    const frame = sampleArc(tSec);
    const audio = audioRef.current;

    if (audio) {
      audio.setArc(frame.phase, frame.energy, frame.riser);
      audio.stepRiser(dt);
    }
    const rms = audio ? audio.getRms() : 0;
    const low = audio ? audio.getLow() : 0;
    const warm = PHASE_WARM[frame.phase];

    // ── render ──
    const rig = rigRef.current;
    const canvas = canvasRef.current;
    if (rig && canvas) {
      const { gl, u } = rig;
      gl.uniform2f(u.u_res, canvas.width, canvas.height);
      gl.uniform1f(u.u_time, timeRef.current);
      gl.uniform1f(u.u_energy, frame.energy);
      gl.uniform1f(u.u_riser, frame.riser);
      gl.uniform1f(u.u_rms, rms);
      gl.uniform1f(u.u_low, low);
      gl.uniform1f(u.u_flash, frame.dropFlash);
      gl.uniform1f(u.u_warm, warm);
      gl.uniform1f(u.u_reduce, reducedRef.current ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else if (ctx2dRef.current && canvas) {
      drawFallback(ctx2dRef.current, canvas, frame.energy, low, frame.dropFlash, warm, timeRef.current);
    }

    // ── readout (throttled to ~8fps) ──
    readoutClockRef.current += dt;
    if (readoutClockRef.current > 0.12) {
      readoutClockRef.current = 0;
      setReadout({
        phase: frame.phase,
        label: frame.label,
        energy: frame.energy,
        progress: frame.totalProgress,
        elapsed: Math.min(tSec, TOTAL_SECONDS),
        ended: frame.ended,
      });
    }

    if (frame.ended) {
      runningRef.current = false;
      if (audioRef.current) audioRef.current.stop();
      return;
    }
    rafRef.current = requestAnimationFrame(runFrame);
  }, []);

  // ── resize (devicePixelRatio-aware) ──
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      if (rigRef.current) rigRef.current.gl.viewport(0, 0, w, h);
    }
  }, []);

  const begin = useCallback(async () => {
    reducedRef.current = prefersReducedMotion();

    // audio context MUST be created + resumed inside this click handler
    const AC: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AC();
    audioCtxRef.current = ctx;
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        /* ignore */
      }
    }
    audioRef.current = makeSurgeAudio(ctx);

    setStage("running");

    // set up the canvas on the next tick (after it mounts)
    requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rig = makeGLRig(canvas);
      if (rig) {
        rigRef.current = rig;
        rig.gl.useProgram(rig.program);
        rig.gl.bindVertexArray(rig.vao);
      } else {
        nogl.current = true;
        setStage("nogl");
        const c2d = canvas.getContext("2d");
        if (c2d) ctx2dRef.current = c2d;
      }
      resize();

      startRef.current = performance.now();
      lastTsRef.current = null;
      timeRef.current = 0;
      runningRef.current = true;
      rafRef.current = requestAnimationFrame(runFrame);
    });
  }, [runFrame, resize]);

  const loadPiano = useCallback(async () => {
    const id = uuid.trim();
    const audio = audioRef.current;
    const ctx = audioCtxRef.current;
    if (!id || !audio || !ctx) return;
    setPianoMsg("loading…");
    try {
      const res = await fetch(`/api/audio/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error("lookup failed");
      const { url } = (await res.json()) as { url: string };
      const buf = await (await fetch(url)).arrayBuffer();
      const audioBuf = await ctx.decodeAudioData(buf);
      audio.setPianoBuffer(audioBuf);
      setPianoMsg("piano layered in");
    } catch {
      setPianoMsg("could not load that recording — the synth plays on");
    }
  }, [uuid]);

  // ── window resize + context-loss handling ──
  useEffect(() => {
    if (stage === "preface") return;
    const onResize = () => resize();
    window.addEventListener("resize", onResize);
    const canvas = canvasRef.current;
    const onLost = (e: Event) => {
      e.preventDefault();
      runningRef.current = false;
    };
    canvas?.addEventListener("webglcontextlost", onLost);
    return () => {
      window.removeEventListener("resize", onResize);
      canvas?.removeEventListener("webglcontextlost", onLost);
    };
  }, [stage, resize]);

  // ── full teardown on unmount ──
  useEffect(() => {
    return () => {
      runningRef.current = false;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      const audio = audioRef.current;
      if (audio) audio.stop();
      const rig = rigRef.current;
      if (rig) {
        const { gl } = rig;
        gl.deleteProgram(rig.program);
        gl.deleteVertexArray(rig.vao);
        const ext = gl.getExtension("WEBGL_lose_context");
        if (ext) ext.loseContext();
      }
      rigRef.current = null;
      const ctx = audioCtxRef.current;
      if (ctx && ctx.state !== "closed") {
        ctx.close().catch(() => {});
      }
      audioCtxRef.current = null;
      audioRef.current = null;
    };
  }, []);

  const running = stage === "running" || stage === "nogl";

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      {/* full-bleed art */}
      {running && (
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      )}

      {/* ── preface / begin ── */}
      {!running && (
        <div className="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Dream lab · 4168-surge
          </p>
          <h1 className="max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
            Surge — a self-composing EDM build-and-drop set
          </h1>
          <p className="mt-4 max-w-xl text-base text-muted-foreground">
            A seven-section, 7-minute arc that plays itself: a felt-piano motif
            stated bare, a Shepard riser winding the tension, and two drops —
            the second bigger, wider, hotter — where the motif returns.
          </p>
          <button
            onClick={begin}
            className="mt-8 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Drop in — begin the set
          </button>
          <button
            onClick={() => setShowNotes(true)}
            className="mt-4 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Read the design notes
          </button>
        </div>
      )}

      {/* ── running overlay: arc readout + controls ── */}
      {running && (
        <>
          <div className="pointer-events-none absolute left-4 top-4 z-10 max-w-[70%]">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Section {readout.ended ? "· complete" : ""}
            </p>
            <p className="mt-1 text-base font-medium text-foreground">
              {readout.label}
            </p>

            {/* energy meter */}
            <div className="mt-3 w-56 max-w-full">
              <div className="flex items-center justify-between font-mono text-xs text-muted-foreground">
                <span>energy</span>
                <span>{Math.round(readout.energy * 100)}%</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-150"
                  style={{ width: `${Math.round(readout.energy * 100)}%` }}
                />
              </div>
              {/* progress */}
              <div className="mt-2 flex items-center justify-between font-mono text-xs text-muted-foreground">
                <span>{fmtTime(readout.elapsed)}</span>
                <span>{fmtTime(TOTAL_SECONDS)}</span>
              </div>
              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-muted-foreground/60"
                  style={{ width: `${Math.round(readout.progress * 100)}%` }}
                />
              </div>
            </div>
          </div>

          {stage === "nogl" && (
            <p className="absolute bottom-16 left-4 z-10 max-w-xs text-sm text-destructive">
              WebGL2 unavailable — showing the Canvas2D energy field instead.
            </p>
          )}

          {/* optional real-piano layer */}
          <div className="absolute right-4 top-4 z-10 flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <input
                value={uuid}
                onChange={(e) => setUuid(e.target.value)}
                placeholder="paste a recording UUID (optional)"
                className="min-h-[44px] w-56 max-w-[50vw] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground placeholder:text-muted-foreground/70"
              />
              <button
                onClick={loadPiano}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Layer
              </button>
            </div>
            {pianoMsg && (
              <p
                className={`text-sm ${
                  pianoMsg.startsWith("could not")
                    ? "text-destructive"
                    : "text-muted-foreground"
                }`}
              >
                {pianoMsg}
              </p>
            )}
            <button
              onClick={() => setShowNotes(true)}
              className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              Design notes
            </button>
          </div>
        </>
      )}

      {/* ── design-notes overlay ── */}
      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight">
              Surge · design notes
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              An alternate journey engine for Resonance with a genuinely
              different energy from the calm psychedelic default: a long-form,
              self-playing EDM build-and-drop set. On begin it runs a
              seven-section state machine — Intro, Build 1, Drop 1, Breakdown,
              Build 2, Drop 2, Outro — totalling ~7m20s off a single{" "}
              <code className="font-mono">performance.now()</code> clock.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              A felt-piano motif is the memory of the piece: stated bare in the
              intro, it returns octave-stacked on a supersaw lead through a
              resonant filter that opens on each drop. Drop 2 is audibly larger
              than Drop 1 — more voices, an extra octave, a bright counter-arp.
              Each build winds a Shepard riser (octave-spaced sines under a
              sliding raised-cosine window) that seems to rise forever, then the
              drop releases it. The plasma field surges outward on the drop; all
              luminance change is a slow swell, never a strobe.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Reference: Roger Shepard&rsquo;s Shepard tone (1964) for the
              endless riser, over the canonical EDM build-and-drop song form.
              Everything is synthesised on the Web Audio API and seeded by a
              deterministic PRNG, so the set plays the same every time.
            </p>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-6 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["4168-surge"]} />
    </main>
  );
}

// ── Canvas2D fallback energy field (no WebGL2) ────────────────────────────
function drawFallback(
  c: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  energy: number,
  low: number,
  flash: number,
  warm: number,
  time: number,
): void {
  const w = canvas.width;
  const h = canvas.height;
  c.fillStyle = "rgba(8, 4, 18, 0.28)"; // violet wash, trails
  c.fillRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2;
  const bloom = 0.25 + 0.9 * energy + flash;
  const rings = 5;
  for (let i = 0; i < rings; i++) {
    const t = i / rings;
    const rad =
      (0.12 + 0.5 * t) * Math.min(w, h) *
      (1 + 0.25 * Math.sin(time * (0.6 + energy) + i) + 0.5 * flash);
    const hueR = Math.round(120 + 100 * warm);
    const hueG = Math.round(50 + 40 * warm);
    const a = (0.05 + 0.12 * bloom) * (1 - t) + 0.08 * low;
    c.beginPath();
    c.arc(cx, cy, Math.max(1, rad), 0, Math.PI * 2);
    c.fillStyle = `rgba(${hueR + 40 * t}, ${hueG}, ${230 - 60 * warm}, ${a})`;
    c.fill();
  }
}
