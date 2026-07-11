"use client";

/**
 * 423-kids-face-beat — Face Beat Drum Kit
 *
 * "What if a 4-year-old could make a BEAT with their FACE — open your mouth
 * for a boom, raise your eyebrows for a tick, big smile for a shaker?"
 *
 * This is the lab's first face→PERCUSSION mapping. All prior face pieces mapped
 * expression to pitch/melody; this one maps to a quantized drum kit. The
 * subject is RHYTHM, not tuning — no chords, no melody, no scale.
 *
 * INPUT  : webcam + MediaPipe FaceLandmarker blendshapes (CDN runtime load)
 * OUTPUT : raw WebGL2 — mirrored camera as a fullscreen quad texture + GPU
 *          particle bursts on each drum hit (additive blending)
 * AUDIO  : pure Web Audio percussion, look-ahead scheduler, brick-wall limiter
 *
 * Graceful degradation:
 *   Camera denied / absent → "ghost face" auto-demo runs through the SAME
 *   detector path, playing a fun beat within ~2s of Start — no camera needed.
 *   After 4s of a detected-but-still face, the ghost demo also kicks in.
 *   MediaPipe CDN fails → tappable on-screen drum pads (≥64px) remain.
 *   WebGL2 unavailable → text notice; audio still runs.
 *
 * Privacy: camera frames are analysed in-browser only — never recorded,
 * stored, or transmitted anywhere.
 *
 * References: Expotion (arXiv:2507.04955, 2025); Ekman & Friesen FACS 1978;
 * MediaPipe FaceLandmarker; Daniel Rozin soft-mirror lineage.
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { buildKit, Groove, type DrumKind, type DrumKit } from "./audio";
import {
  FaceDetector,
  ghostBlendshapes,
  type BlendshapeCategory,
} from "./face";

// ── README link ───────────────────────────────────────────────────────────────

const README_URL =
  "https://github.com/kbarnoski/resonance/blob/main/src/app/dream/423-kids-face-beat/README.md";

// ── MediaPipe types (CDN-loaded; not a static npm dep) ───────────────────────

interface FaceBlendshapeResult {
  faceBlendshapes: Array<{
    categories: BlendshapeCategory[];
  }>;
}

interface FaceLandmarkerInst {
  detectForVideo(video: HTMLVideoElement, ts: number): FaceBlendshapeResult;
  close(): void;
}

interface MediaPipeVision {
  FilesetResolver: {
    forVisionTasks(wasmPath: string): Promise<unknown>;
  };
  FaceLandmarker: {
    createFromOptions(
      fileset: unknown,
      opts: {
        baseOptions: { modelAssetPath: string; delegate?: "GPU" | "CPU" };
        runningMode: "VIDEO" | "IMAGE";
        numFaces?: number;
        outputFaceBlendshapes?: boolean;
      },
    ): Promise<FaceLandmarkerInst>;
  };
}

const MEDIAPIPE_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/vision_bundle.mjs";
const MEDIAPIPE_WASM =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm";
const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

// ── Pad / legend config ───────────────────────────────────────────────────────

interface PadDef {
  kind: DrumKind;
  emoji: string;
  word: string;
  color: string; // hex
  glColor: [number, number, number]; // GL 0..1 rgb
}

const PADS: PadDef[] = [
  { kind: "kick",   emoji: "😮", word: "BOOM",  color: "#f87171", glColor: [0.97, 0.44, 0.44] },
  { kind: "hat",    emoji: "🤨", word: "TICK",  color: "#34d399", glColor: [0.20, 0.83, 0.60] },
  { kind: "shaker", emoji: "😁", word: "SHAKE", color: "#fbbf24", glColor: [0.98, 0.75, 0.14] },
  { kind: "tom",    emoji: "😗", word: "POP",   color: "#a78bfa", glColor: [0.65, 0.54, 0.98] },
  { kind: "rim",    emoji: "😉", word: "TICK",  color: "#38bdf8", glColor: [0.22, 0.74, 0.97] },
];

const PAD_GL: Record<DrumKind, [number, number, number]> = Object.fromEntries(
  PADS.map((p) => [p.kind, p.glColor]),
) as Record<DrumKind, [number, number, number]>;

// ── WebGL2 helpers ────────────────────────────────────────────────────────────

function compileShader(
  gl: WebGL2RenderingContext,
  type: GLenum,
  src: string,
): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error("Shader: " + gl.getShaderInfoLog(sh));
  }
  return sh;
}

function linkProgram(
  gl: WebGL2RenderingContext,
  vs: WebGLShader,
  fs: WebGLShader,
): WebGLProgram {
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error("Link: " + gl.getProgramInfoLog(prog));
  }
  return prog;
}

// ── Quad vertex shader (shared by both programs) ─────────────────────────────

const QUAD_VERT = /* glsl */ `#version 300 es
precision mediump float;
in vec2 a_pos;      // -1..1 clip coords
out vec2 v_uv;
void main(){
  v_uv = a_pos * 0.5 + 0.5;   // 0..1 UV
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// ── Camera-quad fragment shader (mirrored, slightly dimmed) ──────────────────
// Flip U so the image is a mirror.

const CAM_FRAG = /* glsl */ `#version 300 es
precision mediump float;
uniform sampler2D u_tex;
uniform int u_hasCamera;
in vec2 v_uv;
out vec4 fragColor;
void main(){
  vec2 uv = vec2(1.0 - v_uv.x, v_uv.y); // mirror X
  if(u_hasCamera == 1){
    vec3 col = texture(u_tex, uv).rgb;
    fragColor = vec4(col * 0.6, 1.0);   // dim so bursts pop
  } else {
    // Soft dark violet vignette for ghost / no-camera mode
    float dist = length(v_uv - 0.5) * 1.6;
    float v = 1.0 - smoothstep(0.3, 1.0, dist);
    fragColor = vec4(mix(vec3(0.03,0.01,0.08), vec3(0.12,0.06,0.22), v), 1.0);
  }
}`;

// ── Particle / glow fragment shader ──────────────────────────────────────────
// Renders a radial soft glow at a given UV centre + colour.
// One draw call per active burst (cheap at ≤8 simultaneous bursts).

const GLOW_FRAG = /* glsl */ `#version 300 es
precision mediump float;
uniform vec2  u_center;   // 0..1 UV (Y down)
uniform vec3  u_color;
uniform float u_radius;   // 0..1 normalised radius
uniform float u_alpha;    // burst fade 0..1
in vec2 v_uv;
out vec4 fragColor;
void main(){
  float d = distance(v_uv, u_center) / max(u_radius, 0.001);
  float g = exp(-d * d * 4.0);    // soft Gaussian radial glow
  // Additional tight inner sparkle
  float spark = exp(-d * d * 30.0) * 0.5;
  float total = clamp((g + spark) * u_alpha, 0.0, 1.0);
  fragColor = vec4(u_color * total, total);
}`;

// ── GL state ──────────────────────────────────────────────────────────────────

interface GlState {
  gl: WebGL2RenderingContext;
  camProg: WebGLProgram;
  glowProg: WebGLProgram;
  quadVao: WebGLVertexArrayObject;
  tex: WebGLTexture;
  uCamHasCamera: WebGLUniformLocation;
  uCamTex: WebGLUniformLocation;
  uGlowCenter: WebGLUniformLocation;
  uGlowColor: WebGLUniformLocation;
  uGlowRadius: WebGLUniformLocation;
  uGlowAlpha: WebGLUniformLocation;
}

function initGL(canvas: HTMLCanvasElement): GlState | null {
  const gl = canvas.getContext("webgl2", { alpha: false });
  if (!gl) return null;

  const camVs = compileShader(gl, gl.VERTEX_SHADER, QUAD_VERT);
  const camFs = compileShader(gl, gl.FRAGMENT_SHADER, CAM_FRAG);
  const camProg = linkProgram(gl, camVs, camFs);

  const glowVs = compileShader(gl, gl.VERTEX_SHADER, QUAD_VERT);
  const glowFs = compileShader(gl, gl.FRAGMENT_SHADER, GLOW_FRAG);
  const glowProg = linkProgram(gl, glowVs, glowFs);

  // Fullscreen quad (two triangles)
  const verts = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

  const quadVao = gl.createVertexArray()!;
  gl.bindVertexArray(quadVao);
  const aPosCam = gl.getAttribLocation(camProg, "a_pos");
  gl.enableVertexAttribArray(aPosCam);
  gl.vertexAttribPointer(aPosCam, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  return {
    gl,
    camProg,
    glowProg,
    quadVao,
    tex,
    uCamHasCamera: gl.getUniformLocation(camProg, "u_hasCamera")!,
    uCamTex: gl.getUniformLocation(camProg, "u_tex")!,
    uGlowCenter: gl.getUniformLocation(glowProg, "u_center")!,
    uGlowColor: gl.getUniformLocation(glowProg, "u_color")!,
    uGlowRadius: gl.getUniformLocation(glowProg, "u_radius")!,
    uGlowAlpha: gl.getUniformLocation(glowProg, "u_alpha")!,
  };
}

// ── Burst (per-hit particle glow) ─────────────────────────────────────────────

interface Burst {
  kind: DrumKind;
  /** UV coords 0..1, Y down */
  cx: number;
  cy: number;
  born: number;
  life: number;
}

// ── App state ─────────────────────────────────────────────────────────────────

type Mode = "idle" | "loading" | "camera" | "ghost";

export default function KidsFaceBeatPage() {
  const [mode, setMode] = useState<Mode>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [noWebGL, setNoWebGL] = useState(false);
  const [litPads, setLitPads] = useState<Record<DrumKind, number>>({
    kick: 0, hat: 0, shaker: 0, tom: 0, rim: 0,
  });

  // Refs — no re-renders
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const glRef = useRef<GlState | null>(null);
  const kitRef = useRef<DrumKit | null>(null);
  const grooveRef = useRef<Groove | null>(null);
  const detectorRef = useRef<FaceDetector | null>(null);
  const landmarkerRef = useRef<FaceLandmarkerInst | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const burstsRef = useRef<Burst[]>([]);
  const ghostStartRef = useRef<number>(0);
  const startedRef = useRef(false);
  // Timestamp of last face activity (for auto-demo after 4s still)
  const lastFaceActivityRef = useRef<number>(0);
  // Whether ghost was already started due to still face
  const stillFaceGhostRef = useRef(false);
  // current mode stored in a ref so the RAF loop can read it without stale closure
  const modeRef = useRef<Mode>("idle");

  // Flash a pad + spawn a burst.
  const flash = useCallback(
    (kind: DrumKind, anchor: { x: number; y: number }) => {
      setLitPads((prev) => ({ ...prev, [kind]: performance.now() }));
      burstsRef.current.push({
        kind,
        cx: anchor.x,
        cy: anchor.y,
        born: performance.now(),
        life: kind === "kick" ? 500 : kind === "shaker" ? 420 : 320,
      });
    },
    [],
  );

  // ── WebGL render ─────────────────────────────────────────────────────────────

  const renderGL = useCallback((hasCamera: boolean) => {
    const gls = glRef.current;
    const canvas = canvasRef.current;
    if (!gls || !canvas) return;
    const { gl } = gls;

    // Resize canvas to CSS pixels × DPR
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const H = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    gl.viewport(0, 0, W, H);

    // Upload camera frame if available
    if (hasCamera) {
      const video = videoRef.current;
      if (video && video.readyState >= 2) {
        gl.bindTexture(gl.TEXTURE_2D, gls.tex);
        gl.texImage2D(
          gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video,
        );
      }
    }

    // Draw camera / vignette background
    gl.disable(gl.BLEND);
    gl.useProgram(gls.camProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, gls.tex);
    gl.uniform1i(gls.uCamTex, 0);
    gl.uniform1i(gls.uCamHasCamera, hasCamera ? 1 : 0);
    gl.bindVertexArray(gls.quadVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Draw bursts (additive blending — no harsh strobe)
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE); // additive
    gl.useProgram(gls.glowProg);

    const now = performance.now();
    burstsRef.current = burstsRef.current.filter((b) => {
      const age = now - b.born;
      if (age >= b.life) return false;
      const t = age / b.life;
      const alpha = (1 - t) * (1 - t) * 0.9; // quadratic fade
      const radius = 0.04 + t * 0.25; // expand outward

      const [r, g, bv] = PAD_GL[b.kind];
      // Flip Y for GL (UV origin at bottom-left, our anchor is Y-down)
      const cy = 1.0 - b.cy;
      gl.uniform2f(gls.uGlowCenter, b.cx, cy);
      gl.uniform3f(gls.uGlowColor, r, g, bv);
      gl.uniform1f(gls.uGlowRadius, radius);
      gl.uniform1f(gls.uGlowAlpha, alpha);
      gl.bindVertexArray(gls.quadVao);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      return true;
    });

    gl.disable(gl.BLEND);
  }, []);

  // ── Per-frame drive loop ───────────────────────────────────────────────────

  const driveFrame = useCallback(() => {
    const detector = detectorRef.current;
    const groove = grooveRef.current;
    if (!detector || !groove) return;

    const currentMode = modeRef.current;
    const nowMs = performance.now();
    let categories: BlendshapeCategory[] | null = null;

    if (currentMode === "camera" && landmarkerRef.current && videoRef.current) {
      const video = videoRef.current;
      if (video.readyState >= 2) {
        try {
          const res = landmarkerRef.current.detectForVideo(video, performance.now());
          if (res.faceBlendshapes && res.faceBlendshapes.length > 0) {
            categories = res.faceBlendshapes[0].categories;
          }
        } catch {
          // transient detect error — skip frame
        }
      }
    }

    if (currentMode === "ghost") {
      categories = ghostBlendshapes(nowMs - ghostStartRef.current);
    }

    if (categories && categories.length > 0) {
      const events = detector.update(categories, nowMs);
      groove.energy = detector.energy;

      // Check if any events came from live camera (non-ghost) mode
      if (currentMode === "camera" && events.length > 0) {
        lastFaceActivityRef.current = nowMs;
        stillFaceGhostRef.current = false;
      }

      for (const ev of events) {
        groove.trigger(ev.kind, ev.velocity);
        flash(ev.kind, ev.anchor);
      }
    }

    // After 4s of still face in camera mode, kick in ghost demo
    if (
      currentMode === "camera" &&
      !stillFaceGhostRef.current &&
      nowMs - lastFaceActivityRef.current > 4000 &&
      lastFaceActivityRef.current > 0
    ) {
      stillFaceGhostRef.current = true;
      ghostStartRef.current = nowMs;
      // Don't switch mode — just start ghost blendshapes feeding
      // the detector alongside the camera
    }

    // If still face ghost is running, blend ghost blendshapes in
    if (
      currentMode === "camera" &&
      stillFaceGhostRef.current
    ) {
      const ghostCats = ghostBlendshapes(nowMs - ghostStartRef.current);
      const events = detector.update(ghostCats, nowMs);
      groove.energy = Math.max(groove.energy, detector.energy);
      for (const ev of events) {
        groove.trigger(ev.kind, ev.velocity);
        flash(ev.kind, ev.anchor);
      }
    }
  }, [flash]);

  // ── rAF pump ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (mode !== "camera" && mode !== "ghost") return;
    modeRef.current = mode;
    const loop = () => {
      driveFrame();
      renderGL(mode === "camera");
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [mode, driveFrame, renderGL]);

  // ── Init WebGL on mount ───────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const gls = initGL(canvas);
      if (!gls) {
        setNoWebGL(true);
      } else {
        glRef.current = gls;
      }
    } catch {
      setNoWebGL(true);
    }
  }, []);

  // ── Resize ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  // ── Start (inside user gesture — AudioContext + camera) ───────────────────────

  const start = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setNotice(null);
    setMode("loading");
    modeRef.current = "loading";

    // Build audio kit inside gesture
    const kit = buildKit();
    if (kit.ctx.state === "suspended") {
      try { await kit.ctx.resume(); } catch { /* ok */ }
    }
    kitRef.current = kit;

    const detector = new FaceDetector();
    detectorRef.current = detector;

    const groove = new Groove(kit, {
      onHit: (kind) => {
        setLitPads((prev) => ({ ...prev, [kind]: performance.now() }));
      },
    });
    grooveRef.current = groove;
    groove.start();

    // Seed last activity so the 4s still-face timer starts from Start
    lastFaceActivityRef.current = performance.now();

    // Try camera + MediaPipe
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("no video element");
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();

      // Load MediaPipe at runtime (webpackIgnore keeps it out of the bundle)
      const vision = (await import(
        /* webpackIgnore: true */ MEDIAPIPE_CDN
      )) as unknown as MediaPipeVision;
      const fileset = await vision.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
      const landmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: FACE_MODEL, delegate: "GPU" },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true,
      });
      landmarkerRef.current = landmarker;
      modeRef.current = "camera";
      setMode("camera");
    } catch {
      // Camera denied or MediaPipe failed → ghost face drives the same detector
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setNotice(
        "No camera right now — a ghost face is playing the drums for you! Tap the coloured buttons too.",
      );
      ghostStartRef.current = performance.now();
      modeRef.current = "ghost";
      setMode("ghost");
    }
  }, []);

  // ── Tap pad (fallback + always-available) ──────────────────────────────────

  const tapPad = useCallback(
    (kind: DrumKind) => {
      const groove = grooveRef.current;
      if (!groove) return;
      groove.trigger(kind, 0.9);
      const pad = PADS.find((p) => p.kind === kind);
      if (pad) flash(kind, { x: 0.5, y: 0.5 });
    },
    [flash],
  );

  // ── Teardown ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      grooveRef.current?.stop();
      landmarkerRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      kitRef.current?.ctx.close().catch(() => {});
    };
  }, []);

  const nowMs = performance.now();

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#06030f] font-mono text-foreground">
      {/* WebGL2 canvas — fills the screen */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ display: noWebGL ? "none" : "block" }}
      />
      {/* Hidden source video (never shown; drawn into WebGL texture) */}
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* WebGL2 unavailable notice */}
      {noWebGL && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#06030f]">
          <p className="max-w-xs text-center text-base text-violet-300">
            WebGL2 is not available on this device. Audio still works — tap the
            drum buttons below!
          </p>
        </div>
      )}

      {/* Title bar */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex flex-col items-center pt-4">
        <h1 className="text-2xl font-bold tracking-tight text-foreground drop-shadow">
          🥁 Face Beat
        </h1>
        {mode !== "idle" && (
          <p className="mt-1 text-base text-muted-foreground">
            Make funny faces — play the drums!
          </p>
        )}
      </div>

      {/* Start overlay */}
      {mode === "idle" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-[#06030f]/90 px-6 text-center">
          <h2 className="text-3xl font-bold text-foreground">Face Beat Drum Kit</h2>
          <p className="max-w-sm text-xl text-foreground">
            Make funny faces to play the drums! Open your mouth, raise your
            eyebrows, flash a big smile…
          </p>

          {/* Face legend */}
          <div className="grid grid-cols-5 gap-3 rounded-2xl bg-muted px-4 py-3">
            {PADS.map((pad) => (
              <div key={pad.kind} className="flex flex-col items-center gap-1">
                <span className="text-3xl">{pad.emoji}</span>
                <span
                  className="text-sm font-bold"
                  style={{ color: pad.color }}
                >
                  {pad.word}
                </span>
              </div>
            ))}
          </div>

          <button
            onClick={start}
            className="min-h-[72px] rounded-3xl bg-violet-500/25 px-10 py-4 text-2xl font-bold text-foreground ring-2 ring-violet-300/60 transition active:scale-95"
          >
            Start the face beat 🥁
          </button>

          <p className="text-sm text-muted-foreground">
            Camera is analysis-only — never recorded or stored.
          </p>
        </div>
      )}

      {/* Loading overlay */}
      {mode === "loading" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#06030f]/70">
          <p className="text-xl text-foreground">Loading face tracker… 🥁</p>
        </div>
      )}

      {/* Degradation notice */}
      {notice && mode !== "idle" && (
        <div className="absolute left-1/2 top-16 z-10 w-[90%] max-w-md -translate-x-1/2 rounded-2xl bg-black/60 px-4 py-3 text-center">
          <p className="text-base text-violet-300">{notice}</p>
        </div>
      )}

      {/* Face legend overlay (while running) */}
      {(mode === "camera" || mode === "ghost") && (
        <div className="absolute left-3 top-14 z-10 flex flex-col gap-1.5 rounded-2xl bg-black/50 px-3 py-2 backdrop-blur-sm">
          {PADS.map((pad) => (
            <div key={pad.kind} className="flex items-center gap-2">
              <span className="text-2xl leading-none">{pad.emoji}</span>
              <span
                className="text-sm font-bold leading-none"
                style={{ color: pad.color }}
              >
                {pad.word}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Drum pads (tap targets ≥64px; always available after Start) */}
      {mode !== "idle" && mode !== "loading" && (
        <div className="absolute bottom-0 left-0 right-0 z-10 flex items-end justify-center gap-2 px-2 pb-4 sm:gap-3">
          {PADS.map((pad) => {
            const lit = nowMs - litPads[pad.kind] < 200;
            return (
              <button
                key={pad.kind}
                onClick={() => tapPad(pad.kind)}
                aria-label={pad.word + " drum pad"}
                className="flex flex-col items-center justify-center gap-1 rounded-2xl text-3xl transition-transform active:scale-90"
                style={{
                  width: 72,
                  height: 72,
                  background: lit
                    ? pad.color + "55"
                    : pad.color + "18",
                  boxShadow: lit
                    ? `0 0 24px 6px ${pad.color}99`
                    : `inset 0 0 0 2px ${pad.color}66`,
                  transform: lit ? "scale(1.1)" : "scale(1)",
                }}
              >
                {pad.emoji}
              </button>
            );
          })}
        </div>
      )}

      {/* Design notes link */}
      <Link
        href={README_URL}
        className="absolute bottom-2 right-3 z-20 text-base text-violet-300 underline decoration-violet-300/50 underline-offset-2"
        target="_blank"
        rel="noopener noreferrer"
      >
        Read the design notes
      </Link>

      {/* Privacy note (when running) */}
      {(mode === "camera" || mode === "ghost") && (
        <p className="pointer-events-none absolute bottom-14 left-0 right-0 z-10 text-center text-sm text-muted-foreground">
          Camera: analysis only — never recorded or uploaded.
        </p>
      )}
    </main>
  );
}
