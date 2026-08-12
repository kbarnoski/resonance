"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 10536 · Inkmirror — a mirror that draws you as a living illuminated manuscript.
//
// THE ONE QUESTION: What if a mirror drew you as a living illuminated
// manuscript — tracing your silhouette in self-writing gold-ink calligraphy on
// vellum — and every stroke it laid down sounded a warm plucked voice?
//
// The live camera is reduced to a foreground silhouette; the OUTLINE of your
// figure is traced as an ordered contour; a calligraphic pen sweeps that
// contour and lays broad-nib gold strokes tangent to your edge on a warm vellum
// ground. Where your shape MOVES it writes denser, brighter strokes and plucks
// a warm gut-string voice — pitch from the stroke's height in a D-Dorian modal
// set. Older strokes illuminate then fade, so you are forever re-drawn.
//
// One of three approaches to a shared concept — a mirror that transforms you and
// generates music from the transformation (ref: Daito Manabe & Kyle McDonald,
// *Transformirror*, 2024–2026). This is the CONTOUR-ILLUMINATION lane. See
// README.md for the illuminated-manuscript lineage and degrade ladder.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { mulberry32 } from "./rng";
import { ContourEngine, MAX_STROKES, STROKE_STRIDE } from "./contour";
import {
  createAudio,
  pluck,
  updatePad,
  closeAudio,
  type AudioEngine,
} from "./audio";

const SEED = 0x10536;
const GW = 96;
const GH = 72;

// ── WebGL2 shaders (GLSL ES 3.00) ────────────────────────────────────────────

const GROUND_VS = `#version 300 es
in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

// Warm vellum / parchment ground: aged cream with fibrous grain and a gilt
// vignette. Multi-hue and luminous, in the spirit of a Book of Hours page.
const GROUND_FS = `#version 300 es
precision highp float;
out vec4 frag;
uniform vec2 uRes;
uniform float uTime;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){
  vec2 i=floor(p), f=fract(p);
  vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),
             mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 cream = vec3(0.925, 0.865, 0.735);
  vec3 deep  = vec3(0.855, 0.775, 0.615);
  float rad = length(uv - 0.5);
  vec3 col = mix(cream, deep, smoothstep(0.1, 0.95, rad));
  // fibrous parchment grain (a few octaves, cheap)
  float f = noise(uv * vec2(uRes.x/6.0, uRes.y/6.0)) * 0.6
          + noise(uv * vec2(uRes.x/2.0, uRes.y/2.0)) * 0.4;
  col *= 0.94 + 0.10 * f;
  // faint warm foxing flecks (aged illumination), very subtle
  float fl = smoothstep(0.86, 1.0, noise(uv * 40.0 + 3.0));
  col = mix(col, vec3(0.62,0.42,0.20), fl * 0.10);
  // gilt vignette — deeper toward the edges of the sheet
  float vig = smoothstep(1.05, 0.25, rad * 1.35);
  col *= mix(0.80, 1.02, vig);
  frag = vec4(col, 1.0);
}`;

const STROKE_VS = `#version 300 es
layout(location=0) in vec2 aCorner;   // unit quad [-1,1]
layout(location=1) in vec2 iCenter;   // fig space [0,1], y-up
layout(location=2) in vec2 iDir;      // unit tangent
layout(location=3) in vec2 iSize;     // halfLen, halfWidth (fig units)
layout(location=4) in vec4 iAux;      // age, hue, shimmer, illum
uniform vec2 uFigScale;               // clip units per fig-unit
out vec2 vCorner;
out vec4 vAux;
void main(){
  vec2 perp = vec2(-iDir.y, iDir.x);
  vec2 off = aCorner.x * iSize.x * iDir + aCorner.y * iSize.y * perp;
  vec2 fig = iCenter + off;
  vec2 clip = (fig - 0.5) * 2.0 * uFigScale;
  gl_Position = vec4(clip, 0.0, 1.0);
  vCorner = aCorner;
  vAux = iAux;
}`;

// Broad-nib calligraphic mark: a soft tapered lozenge shaded like gold leaf
// (dark inked edge → luminous core), with jewel-toned accent voices and a
// short illumination flash just after the stroke is laid. Premultiplied out.
const STROKE_FS = `#version 300 es
precision highp float;
in vec2 vCorner;
in vec4 vAux;
out vec4 frag;
void main(){
  float age = vAux.x, hue = vAux.y, shimmer = vAux.z, illum = vAux.w;
  float across = smoothstep(0.0, 0.6, 1.0 - abs(vCorner.y));
  float along  = smoothstep(0.0, 0.28, 1.0 - abs(vCorner.x));
  float mark = across * along;
  if (mark <= 0.002) discard;
  // life envelope: quick fade-in, illuminate, gentle fade-out
  float env = smoothstep(0.0, 0.06, age) * (1.0 - smoothstep(0.55, 1.0, age));
  float core = pow(mark, 0.6);
  // gold leaf: inked edge -> luminous gilt core
  vec3 goldEdge = vec3(0.40, 0.26, 0.05);
  vec3 goldCore = vec3(0.99, 0.83, 0.44);
  vec3 col = mix(goldEdge, goldCore, core);
  if (hue > 0.5 && hue < 1.5) {           // deep ultramarine
    col = mix(vec3(0.09,0.13,0.42), vec3(0.36,0.47,0.86), core);
  } else if (hue >= 1.5) {                // vermilion
    col = mix(vec3(0.46,0.10,0.07), vec3(0.95,0.44,0.28), core);
  }
  // illumination flash right after the stroke is laid (gilt glint)
  float flash = illum * exp(-9.0 * age);
  col += vec3(0.95, 0.80, 0.42) * flash * 0.55;
  col += vec3(0.14) * shimmer * mark;
  float a = mark * env * 0.95;
  frag = vec4(col * a, a);              // premultiplied
}`;

// ── engine (mutable, lives across frames without re-render) ───────────────────
interface Engine {
  gl: WebGL2RenderingContext | null;
  canvas: HTMLCanvasElement | null;
  groundProg: WebGLProgram | null;
  strokeProg: WebGLProgram | null;
  groundVAO: WebGLVertexArrayObject | null;
  strokeVAO: WebGLVertexArrayObject | null;
  instBuf: WebGLBuffer | null;
  uRes: WebGLUniformLocation | null;
  uTime: WebGLUniformLocation | null;
  uFigScale: WebGLUniformLocation | null;
  contour: ContourEngine;
  audio: AudioEngine | null;
  video: HTMLVideoElement | null;
  stream: MediaStream | null;
  sampleCanvas: HTMLCanvasElement | null;
  sampleCtx: CanvasRenderingContext2D | null;
  luma: Float32Array;
  mode: "camera" | "synthetic";
  reduced: boolean;
  raf: number;
  start: number;
  last: number;
}

function makeProgram(
  gl: WebGL2RenderingContext,
  vs: string,
  fs: string,
): WebGLProgram | null {
  const compile = (type: number, src: string) => {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  };
  const v = compile(gl.VERTEX_SHADER, vs);
  const f = compile(gl.FRAGMENT_SHADER, fs);
  if (!v || !f) return null;
  const p = gl.createProgram();
  if (!p) return null;
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    gl.deleteProgram(p);
    return null;
  }
  return p;
}

export default function InkmirrorPage() {
  const engineRef = useRef<Engine | null>(null);
  const [phase, setPhase] = useState<"auto" | "live">("auto");
  const [source, setSource] = useState<"camera" | "synthetic">("synthetic");
  const [hasWebGL2, setHasWebGL2] = useState(true);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // ── the frame loop ─────────────────────────────────────────────────────────
  const frame = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    const nowMs = performance.now();
    const t = (nowMs - e.start) / 1000;
    let dt = (nowMs - e.last) / 1000;
    e.last = nowMs;
    if (dt > 0.1) dt = 0.1; // clamp big gaps (tab switches)

    // 1. update the contour from the live source
    if (e.mode === "camera" && e.video && e.sampleCtx && e.video.readyState >= 2) {
      const sc = e.sampleCtx;
      sc.save();
      sc.translate(GW, 0);
      sc.scale(-1, 1); // mirror — it is a mirror
      sc.drawImage(e.video, 0, 0, GW, GH);
      sc.restore();
      const img = sc.getImageData(0, 0, GW, GH).data;
      const luma = e.luma;
      for (let i = 0; i < GW * GH; i++) {
        const j = i * 4;
        luma[i] = (img[j] * 0.299 + img[j + 1] * 0.587 + img[j + 2] * 0.114) / 255;
      }
      e.contour.updateFromLuma(luma, GW, GH);
    } else {
      e.contour.updateSynthetic(t);
    }

    // 2. sweep the pen, lay strokes, collect pluck events
    const events = e.contour.advance(t, dt, e.reduced);

    // 3. sonify
    if (e.audio) {
      updatePad(e.audio, e.audio.ctx.currentTime);
      for (const ev of events) pluck(e.audio, ev.x, ev.y, ev.speed, ev.hue);
    }

    // 4. render vellum + strokes on the GPU
    const gl = e.gl;
    if (gl && e.canvas && e.groundProg && e.strokeProg) {
      const canvas = e.canvas;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = Math.floor(canvas.clientWidth * dpr) || 2;
      const ch = Math.floor(canvas.clientHeight * dpr) || 2;
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);

      // ground
      gl.disable(gl.BLEND);
      gl.useProgram(e.groundProg);
      gl.uniform2f(e.uRes, canvas.width, canvas.height);
      gl.uniform1f(e.uTime, t);
      gl.bindVertexArray(e.groundVAO);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // strokes (premultiplied over)
      const { data, count } = e.contour.buildInstances(t);
      if (count > 0) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(e.strokeProg);
        const square = Math.min(canvas.width, canvas.height) * 0.92;
        gl.uniform2f(e.uFigScale, square / canvas.width, square / canvas.height);
        gl.bindVertexArray(e.strokeVAO);
        gl.bindBuffer(gl.ARRAY_BUFFER, e.instBuf);
        gl.bufferSubData(
          gl.ARRAY_BUFFER,
          0,
          data.subarray(0, count * STROKE_STRIDE),
        );
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
      }
      gl.bindVertexArray(null);
    }

    e.raf = requestAnimationFrame(frame);
  }, []);

  // ── build WebGL2 + start the synthetic auto-demo (no audio, no camera) ──────
  const initGL = useCallback((): boolean => {
    const canvas = document.getElementById(
      "inkmirror-canvas",
    ) as HTMLCanvasElement | null;
    if (!canvas) return false;
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: true,
      premultipliedAlpha: true,
    });
    if (!gl) return false;

    const groundProg = makeProgram(gl, GROUND_VS, GROUND_FS);
    const strokeProg = makeProgram(gl, STROKE_VS, STROKE_FS);
    if (!groundProg || !strokeProg) return false;

    // fullscreen triangle for the ground
    const groundBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, groundBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const groundVAO = gl.createVertexArray();
    gl.bindVertexArray(groundVAO);
    const gPos = gl.getAttribLocation(groundProg, "aPos");
    gl.enableVertexAttribArray(gPos);
    gl.vertexAttribPointer(gPos, 2, gl.FLOAT, false, 0, 0);

    // unit quad (two triangles) for stroke corners
    const quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]),
      gl.STATIC_DRAW,
    );
    const instBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      MAX_STROKES * STROKE_STRIDE * 4,
      gl.DYNAMIC_DRAW,
    );

    const strokeVAO = gl.createVertexArray();
    gl.bindVertexArray(strokeVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
    const stride = STROKE_STRIDE * 4;
    const attrs: Array<[number, number, number]> = [
      [1, 2, 0], // iCenter
      [2, 2, 8], // iDir
      [3, 2, 16], // iSize
      [4, 4, 24], // iAux
    ];
    for (const [loc, size, off] of attrs) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, off);
      gl.vertexAttribDivisor(loc, 1);
    }
    gl.bindVertexArray(null);

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    engineRef.current = {
      gl,
      canvas,
      groundProg,
      strokeProg,
      groundVAO,
      strokeVAO,
      instBuf,
      uRes: gl.getUniformLocation(groundProg, "uRes"),
      uTime: gl.getUniformLocation(groundProg, "uTime"),
      uFigScale: gl.getUniformLocation(strokeProg, "uFigScale"),
      contour: new ContourEngine(mulberry32(SEED)),
      audio: null,
      video: null,
      stream: null,
      sampleCanvas: null,
      sampleCtx: null,
      luma: new Float32Array(GW * GH),
      mode: "synthetic",
      reduced: !!reduced,
      raf: 0,
      start: performance.now(),
      last: performance.now(),
    };
    engineRef.current.raf = requestAnimationFrame(frame);
    return true;
  }, [frame]);

  // mount: draw the illuminated figure immediately (auto, silent, no camera)
  useEffect(() => {
    const ok = initGL();
    if (!ok) setHasWebGL2(false);
    return () => {
      const e = engineRef.current;
      if (!e) return;
      cancelAnimationFrame(e.raf);
      if (e.stream) e.stream.getTracks().forEach((tr) => tr.stop());
      if (e.audio) closeAudio(e.audio);
      const gl = e.gl;
      if (gl) {
        if (e.groundProg) gl.deleteProgram(e.groundProg);
        if (e.strokeProg) gl.deleteProgram(e.strokeProg);
        if (e.instBuf) gl.deleteBuffer(e.instBuf);
        if (e.groundVAO) gl.deleteVertexArray(e.groundVAO);
        if (e.strokeVAO) gl.deleteVertexArray(e.strokeVAO);
      }
      engineRef.current = null;
    };
  }, [initGL]);

  // ── Start: audio (user gesture) + attempt the camera ───────────────────────
  const start = useCallback(async () => {
    const e = engineRef.current;
    if (!e) return;
    setNotice(null);

    // audio must be created inside the gesture (autoplay policy)
    try {
      e.audio = createAudio(mulberry32(SEED ^ 0x5a5a));
      if (e.audio.ctx.state === "suspended") await e.audio.ctx.resume();
    } catch {
      e.audio = null;
    }

    // attempt the camera — degrade gracefully to the synthetic figure
    let gotCamera = false;
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 320, height: 240 },
          audio: false,
        });
        const video = document.createElement("video");
        video.playsInline = true;
        video.muted = true;
        video.srcObject = stream;
        await video.play().catch(() => {});
        const sampleCanvas = document.createElement("canvas");
        sampleCanvas.width = GW;
        sampleCanvas.height = GH;
        const sampleCtx = sampleCanvas.getContext("2d", {
          willReadFrequently: true,
        });
        e.stream = stream;
        e.video = video;
        e.sampleCanvas = sampleCanvas;
        e.sampleCtx = sampleCtx;
        gotCamera = !!sampleCtx;
      } catch {
        gotCamera = false;
      }
    }

    e.mode = gotCamera ? "camera" : "synthetic";
    setSource(gotCamera ? "camera" : "synthetic");
    if (!gotCamera) {
      setNotice(
        "Camera unavailable — illuminating a seeded ghost figure instead. The plucked voices still play.",
      );
    }
    setPhase("live");
  }, []);

  // ── Stop: release camera + audio, fall back to the silent auto-demo ─────────
  const stop = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    if (e.stream) {
      e.stream.getTracks().forEach((tr) => tr.stop());
      e.stream = null;
    }
    e.video = null;
    e.sampleCtx = null;
    e.sampleCanvas = null;
    if (e.audio) {
      closeAudio(e.audio);
      e.audio = null;
    }
    e.mode = "synthetic";
    setSource("synthetic");
    setNotice(null);
    setPhase("auto");
  }, []);

  useEffect(() => () => stop(), [stop]);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      <canvas
        id="inkmirror-canvas"
        className="fixed inset-0 -z-10 h-full w-full"
        style={{ background: "#e8dcc2" }}
      />

      {/* WebGL2 unavailable — art layer can't draw, but audio can still run */}
      {!hasWebGL2 && (
        <div className="pointer-events-none fixed inset-x-0 top-6 z-20 flex justify-center px-4">
          <p className="max-w-md text-center text-sm text-destructive">
            WebGL2 is unavailable on this device, so the illumination cannot be
            drawn — start anyway and the warm plucked voices will still play.
          </p>
        </div>
      )}

      {/* auto (mount): hero over the living self-writing figure */}
      {phase === "auto" && (
        <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 text-center">
          <p className="mb-4 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            10536 · contour-illumination mirror · auto
          </p>
          <h1 className="max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
            Inkmirror
          </h1>
          <p className="mt-4 max-w-xl text-base text-muted-foreground">
            A mirror draws you as a living illuminated manuscript: it traces your
            silhouette in self-writing gold-ink calligraphy on vellum, and every
            stroke it lays sounds a warm plucked voice. This seeded ghost figure
            is being drawn right now — grant the camera to be drawn yourself.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={start}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Begin the illumination
            </button>
            <button
              onClick={() => setNotesOpen(true)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Read the design notes
            </button>
          </div>
        </div>
      )}

      {/* live: minimal running chrome */}
      {phase === "live" && (
        <div className="relative z-10 flex min-h-screen flex-col justify-between p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="rounded-md bg-background/40 px-3 py-1.5 backdrop-blur-sm">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {source === "camera"
                  ? "illuminating from camera"
                  : "camera denied — illuminating a seeded figure"}
              </p>
            </div>
            <button
              onClick={() => setNotesOpen(true)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Notes
            </button>
          </div>

          <div className="flex flex-col items-center gap-3">
            {notice && (
              <p className="max-w-md text-center text-sm text-muted-foreground">
                {notice}
              </p>
            )}
            <button
              onClick={stop}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Stop
            </button>
          </div>
        </div>
      )}

      {/* design notes */}
      {notesOpen && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-popover p-6 shadow-lg"
            onClick={(ev) => ev.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              design notes
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">
              A mirror that writes you in gold
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                The camera is reduced to a small luminance grid. A slowly
                adapting background estimate gives a foreground presence mask —
                wherever you recently moved lights up and lingers about a second
                before fading. From the mask centroid the mirror casts rays and
                reads the boundary radius at each angle: an ordered, closed
                silhouette outline of your figure.
              </p>
              <p>
                A calligraphic pen then sweeps that outline continuously. Each
                point it crosses it lays a broad-nib gold stroke tangent to your
                edge — thick across the nib, thin along it, like a real quill.
                Where your contour has moved since the last frame it writes
                denser, brighter strokes; older strokes illuminate with a gilt
                glint and then fade, so you are perpetually re-drawn on the
                vellum. Deep ultramarine and vermilion accents mark the sharpest
                curves, the way a Book of Hours gilds its most turned corners.
              </p>
              <p>
                Every laid stroke sounds a warm plucked voice — a gut-string /
                vielle colour with a short finger-noise attack and gently
                inharmonic partials. Pitch comes from the stroke&rsquo;s height
                on the page in a D-Dorian modal set; the faster your edge moves,
                the harder and denser it is plucked. Underneath, a soft warm pad
                breathes and glides between modal centres — it moves, it is not a
                static drone.
              </p>
              <p>
                Reference: Daito Manabe &amp; Kyle McDonald, <em>Transformirror</em>{" "}
                (2024–2026) — a real-time mirror that transforms visitors and
                sonifies the transformation — crossed with the illuminated
                manuscript tradition (the Book of Hours, gold-leaf figure
                drawing on vellum).
              </p>
              <p>
                With no camera it falls back to a seeded, deterministic breathing
                ghost figure through the exact same contour → calligraphy → sound
                pipeline, so a muted phone with the camera denied still watches a
                living figure being written in gold.
              </p>
            </div>
            <button
              onClick={() => setNotesOpen(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["10536-inkmirror"]} />
    </main>
  );
}
