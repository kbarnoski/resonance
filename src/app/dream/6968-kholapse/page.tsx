"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { FRAG_SRC, PRESENT_SRC, VERT_SRC } from "./shaders";
import { makeKholeAudio, type KholeAudio } from "./audio";

// Local seeded PRNG for any visual-side jitter — never Math.random / Date.now,
// so the lab's build/resume determinism holds.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SceneUniforms {
  res: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
  d: WebGLUniformLocation | null;
  amp: WebGLUniformLocation | null;
  centroid: WebGLUniformLocation | null;
  bass: WebGLUniformLocation | null;
  mid: WebGLUniformLocation | null;
  treble: WebGLUniformLocation | null;
  reduce: WebGLUniformLocation | null;
  prev: WebGLUniformLocation | null;
}

interface GLRig {
  gl: WebGL2RenderingContext;
  sceneProg: WebGLProgram;
  presentProg: WebGLProgram;
  sceneU: SceneUniforms;
  presentU: {
    tex: WebGLUniformLocation | null;
    res: WebGLUniformLocation | null;
    d: WebGLUniformLocation | null;
  };
  vao: WebGLVertexArrayObject;
  textures: [WebGLTexture, WebGLTexture];
  fbos: [WebGLFramebuffer, WebGLFramebuffer];
  fboW: number;
  fboH: number;
}

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
    console.error("shader compile error:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function linkProgram(
  gl: WebGL2RenderingContext,
  vsSrc: string,
  fsSrc: string,
): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("program link error:", gl.getProgramInfoLog(prog));
    return null;
  }
  return prog;
}

function makeColorTexture(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
): WebGLTexture | null {
  const tex = gl.createTexture();
  if (!tex) return null;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  // RGBA8 — no float-buffer extension dependency.
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

function makeGLRig(canvas: HTMLCanvasElement): GLRig | null {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    powerPreference: "low-power",
    preserveDrawingBuffer: false,
  });
  if (!gl) return null;

  const sceneProg = linkProgram(gl, VERT_SRC, FRAG_SRC);
  const presentProg = linkProgram(gl, VERT_SRC, PRESENT_SRC);
  if (!sceneProg || !presentProg) return null;

  // Full-screen triangle VAO shared by both passes (a_pos is location 0 in each).
  const vao = gl.createVertexArray();
  if (!vao) return null;
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const sceneLoc = gl.getAttribLocation(sceneProg, "a_pos");
  gl.enableVertexAttribArray(sceneLoc);
  gl.vertexAttribPointer(sceneLoc, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const fboW = Math.max(2, gl.drawingBufferWidth);
  const fboH = Math.max(2, gl.drawingBufferHeight);

  const texA = makeColorTexture(gl, fboW, fboH);
  const texB = makeColorTexture(gl, fboW, fboH);
  const fboA = gl.createFramebuffer();
  const fboB = gl.createFramebuffer();
  if (!texA || !texB || !fboA || !fboB) return null;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fboA);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texA, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fboB);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texB, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  const sceneU: SceneUniforms = {
    res: gl.getUniformLocation(sceneProg, "u_res"),
    time: gl.getUniformLocation(sceneProg, "u_time"),
    d: gl.getUniformLocation(sceneProg, "u_d"),
    amp: gl.getUniformLocation(sceneProg, "u_amp"),
    centroid: gl.getUniformLocation(sceneProg, "u_centroid"),
    bass: gl.getUniformLocation(sceneProg, "u_bass"),
    mid: gl.getUniformLocation(sceneProg, "u_mid"),
    treble: gl.getUniformLocation(sceneProg, "u_treble"),
    reduce: gl.getUniformLocation(sceneProg, "u_reduce"),
    prev: gl.getUniformLocation(sceneProg, "u_prev"),
  };
  const presentU = {
    tex: gl.getUniformLocation(presentProg, "u_tex"),
    res: gl.getUniformLocation(presentProg, "u_res"),
    d: gl.getUniformLocation(presentProg, "u_d"),
  };

  return {
    gl,
    sceneProg,
    presentProg,
    sceneU,
    presentU,
    vao,
    textures: [texA, texB],
    fbos: [fboA, fboB],
    fboW,
    fboH,
  };
}

type Status =
  | { kind: "ok" }
  | { kind: "no-webgl" }
  | { kind: "decode-error"; msg: string };

export default function KholapsePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const rigRef = useRef<GLRig | null>(null);
  const audioRef = useRef<KholeAudio | null>(null);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const sliderRef = useRef<number>(0.15);
  const effectiveDRef = useRef<number>(0.15);
  const reduceRef = useRef<number>(0);
  const pingRef = useRef<number>(0); // which texture is the SOURCE

  const [status, setStatus] = useState<Status>({ kind: "ok" });
  const [entered, setEntered] = useState(false);
  const [sliderD, setSliderD] = useState(0.15);
  const [depthReadout, setDepthReadout] = useState(0.15);
  const [showNotes, setShowNotes] = useState(false);
  const [sourceLabel, setSourceLabel] = useState("seeded arpeggio");
  const [dragging, setDragging] = useState(false);

  // ── render loop ───────────────────────────────────────────────────────
  const renderFrame = useCallback(() => {
    const rig = rigRef.current;
    const audio = audioRef.current;
    if (!rig) return;
    const { gl } = rig;

    const now = performance.now();
    const time = (now - startTimeRef.current) / 1000;

    // Live analysis → effective depth easing.
    let amp = 0;
    let centroid = 0.4;
    let bass = 0;
    let mid = 0;
    let treble = 0;
    if (audio) {
      const a = audio.analyse();
      amp = a.amp;
      centroid = a.centroid;
      bass = a.bass;
      mid = a.mid;
      treble = a.treble;
    }
    // Loud transients SURFACE you (ease d down + implicit sharpen), silence
    // SINKS you (ease d up above the slider baseline).
    const loud = Math.min(1, amp * 3);
    const base = sliderRef.current;
    const target = Math.max(0, Math.min(1, base - 0.28 * loud + 0.12 * (1 - loud)));
    const ease = reduceRef.current > 0.5 ? 0.012 : 0.03;
    effectiveDRef.current += (target - effectiveDRef.current) * ease;
    const d = effectiveDRef.current;
    if (audio) audio.setDepth(d);

    const src = pingRef.current;
    const dst = 1 - src;

    // Pass 1: scene → destination FBO, sampling source texture.
    gl.bindFramebuffer(gl.FRAMEBUFFER, rig.fbos[dst]);
    gl.viewport(0, 0, rig.fboW, rig.fboH);
    gl.useProgram(rig.sceneProg);
    gl.bindVertexArray(rig.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, rig.textures[src]);
    gl.uniform1i(rig.sceneU.prev, 0);
    gl.uniform2f(rig.sceneU.res, rig.fboW, rig.fboH);
    gl.uniform1f(rig.sceneU.time, time);
    gl.uniform1f(rig.sceneU.d, d);
    gl.uniform1f(rig.sceneU.amp, amp);
    gl.uniform1f(rig.sceneU.centroid, centroid);
    gl.uniform1f(rig.sceneU.bass, bass);
    gl.uniform1f(rig.sceneU.mid, mid);
    gl.uniform1f(rig.sceneU.treble, treble);
    gl.uniform1f(rig.sceneU.reduce, reduceRef.current);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Pass 2: present destination texture to the screen.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.useProgram(rig.presentProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, rig.textures[dst]);
    gl.uniform1i(rig.presentU.tex, 0);
    gl.uniform2f(rig.presentU.res, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform1f(rig.presentU.d, d);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    pingRef.current = dst;

    // Throttle React state updates to keep the readout live but cheap.
    if (Math.floor(time * 4) !== Math.floor((time - 0.016) * 4)) {
      setDepthReadout(d);
    }

    rafRef.current = requestAnimationFrame(renderFrame);
  }, []);

  // ── mount: build rig, start visual drift immediately ────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduceRef.current = mq.matches ? 1 : 0;
    const onMq = () => (reduceRef.current = mq.matches ? 1 : 0);
    mq.addEventListener?.("change", onMq);

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const resize = () => {
      const w = Math.max(2, Math.floor(canvas.clientWidth * dpr));
      const h = Math.max(2, Math.floor(canvas.clientHeight * dpr));
      canvas.width = w;
      canvas.height = h;
    };
    resize();

    const rig = makeGLRig(canvas);
    if (!rig) {
      setStatus({ kind: "no-webgl" });
      mq.removeEventListener?.("change", onMq);
      return;
    }
    rigRef.current = rig;
    startTimeRef.current = performance.now();

    // Warm the seeded PRNG once so the seed is exercised deterministically
    // even before any grain jitter is requested (keeps 0x6968 in the graph).
    const warm = mulberry32(0x6968);
    warm();

    const onResize = () => {
      resize();
      // Rebuild FBO textures at the new drawing-buffer size.
      const gl = rig.gl;
      const w = Math.max(2, gl.drawingBufferWidth);
      const h = Math.max(2, gl.drawingBufferHeight);
      if (w === rig.fboW && h === rig.fboH) return;
      rig.fboW = w;
      rig.fboH = h;
      for (let i = 0; i < 2; i++) {
        gl.bindTexture(gl.TEXTURE_2D, rig.textures[i]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      }
      gl.bindTexture(gl.TEXTURE_2D, null);
    };
    window.addEventListener("resize", onResize);

    rafRef.current = requestAnimationFrame(renderFrame);

    return () => {
      window.removeEventListener("resize", onResize);
      mq.removeEventListener?.("change", onMq);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      audioRef.current?.dispose();
      audioRef.current = null;
      const gl = rig.gl;
      gl.deleteProgram(rig.sceneProg);
      gl.deleteProgram(rig.presentProg);
      gl.deleteVertexArray(rig.vao);
      gl.deleteTexture(rig.textures[0]);
      gl.deleteTexture(rig.textures[1]);
      gl.deleteFramebuffer(rig.fbos[0]);
      gl.deleteFramebuffer(rig.fbos[1]);
      rigRef.current = null;
    };
  }, [renderFrame]);

  // ── audio start (needs a user gesture) ──────────────────────────────────
  const ensureAudio = useCallback(async () => {
    if (!audioRef.current) {
      audioRef.current = makeKholeAudio();
    }
    await audioRef.current.start();
    audioRef.current.setDepth(effectiveDRef.current);
    setEntered(true);
  }, []);

  const decodeFile = useCallback(
    async (file: File) => {
      try {
        if (!audioRef.current) audioRef.current = makeKholeAudio();
        const audio = audioRef.current;
        const buf = await file.arrayBuffer();
        await audio.decode(buf);
        await ensureAudio();
        setSourceLabel(file.name);
        setStatus({ kind: "ok" });
      } catch (e) {
        setStatus({
          kind: "decode-error",
          msg: e instanceof Error ? e.message : "could not decode that file",
        });
      }
    },
    [ensureAudio],
  );

  const onFilePick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) void decodeFile(f);
    },
    [decodeFile],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files?.[0];
      if (f) void decodeFile(f);
    },
    [decodeFile],
  );

  const onSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    sliderRef.current = v;
    setSliderD(v);
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      {/* full-bleed art canvas */}
      <canvas
        ref={canvasRef}
        onClick={() => void ensureAudio()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className="absolute inset-0 h-full w-full"
        style={{ display: "block" }}
        aria-label="Folding wireframe tunnel visual"
      />

      {status.kind === "no-webgl" && (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base text-destructive">
            This piece needs WebGL2, which is unavailable in this browser. The
            folding tunnel cannot render here.
          </p>
        </div>
      )}

      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center border-2 border-dashed border-primary/60 bg-black/30">
          <p className="text-base text-foreground">Drop a recording to dissolve it</p>
        </div>
      )}

      {/* header + controls overlay */}
      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-5 sm:p-8">
        <div className="pointer-events-auto max-w-xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Dream lab · 6968-kholapse
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Kholapse
          </h1>
          <p className="mt-2 max-w-md text-base text-muted-foreground">
            Your own music dissolved into a ketamine k-hole — one dissociation
            depth smears time and folds space into a receding wireframe tunnel.
          </p>

          {status.kind === "decode-error" && (
            <p className="mt-3 text-sm text-destructive">
              Could not decode that file: {status.msg}. The seeded arpeggio is
              still playing.
            </p>
          )}
        </div>

        <div className="pointer-events-auto w-full max-w-xl space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            {!entered ? (
              <button
                onClick={() => void ensureAudio()}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Enter the k-hole
              </button>
            ) : (
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                source · {sourceLabel}
              </span>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Drop a recording
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={onFilePick}
              className="hidden"
            />
          </div>

          <div className="rounded-md border border-border bg-background/60 p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <label
                htmlFor="depth"
                className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground"
              >
                dissociation depth
              </label>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                d = {depthReadout.toFixed(2)}
              </span>
            </div>
            <input
              id="depth"
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={sliderD}
              onChange={onSlider}
              className="mt-3 w-full accent-primary"
            />
            <p className="mt-2 text-sm text-muted-foreground">
              Scrub the surface→k-hole arc by hand; loud transients surface you,
              silence sinks you deeper.
            </p>
          </div>
        </div>
      </div>

      {/* Design notes corner button */}
      <button
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-10 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Design notes
      </button>

      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                One question: <em>what does it feel like to hear your own music
                dissolve as you fall into a k-hole?</em> A single depth scalar{" "}
                <span className="font-mono">d ∈ [0,1]</span> drives everything.
              </p>
              <p>
                Following Bera, Looger, Proekt &amp; Cichon (<em>The
                Neuroscientist</em> 32(1), 2026), dissociation is the cortex
                suppressing feedforward stimulus-specific detail while feedback
                context and salience persist — and at depth generating internal
                patterns without input.
              </p>
              <p>
                <strong className="text-foreground">Feedforward (suppressed as
                d→1):</strong> grain detail, high-frequency content, pitch
                identity, wireline sharpness, the treble-tear of the shards.{" "}
                <strong className="text-foreground">Feedback (persists /
                amplifies):</strong> a granular playhead that freezes at{" "}
                <span className="font-mono">(1−d)</span> of real time, the void
                reverb, the drone bed, the tunnel&apos;s global motion and core
                glow. At <span className="font-mono">d→1</span> a seeded internal
                drift takes over as the real audio thins.
              </p>
              <p>
                Drop one of Karel&apos;s exported piano recordings, or let the
                deterministic just-intonation arpeggio (seeded{" "}
                <span className="font-mono">mulberry32(0x6968)</span>) carry it.
                No strobe: every luminance change is slow eased drift, and
                reduced-motion slows it further.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["6968-kholapse"]} />
    </main>
  );
}
