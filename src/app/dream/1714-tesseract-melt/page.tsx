"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { FRAG_SRC, VERT_SRC, MAX_EDGES } from "./shader";
import { makeMeltAudio, type MeltAudio } from "./audio";
import { makeFallbackRig, type FallbackRig } from "./fallback";
import {
  buildTesseract,
  rotate4,
  project4,
  type Tesseract,
  type Angles6,
} from "./rotate4d";
import {
  createSafeFlicker,
  prefersReducedMotion,
  type SafeFlicker,
} from "../_shared/psych/safeFlicker";

type Phase = "idle" | "running" | "paused";

const DIST_W = 3.0;
const DIST_Z = 4.0;
const SCALE = 1.12;

interface GLRig {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  u: {
    res: WebGLUniformLocation | null;
    time: WebGLUniformLocation | null;
    edgeCount: WebGLUniformLocation | null;
    edges: WebGLUniformLocation | null;
    edgeMeta: WebGLUniformLocation | null;
    flick: WebGLUniformLocation | null;
    kfold: WebGLUniformLocation | null;
    intensity: WebGLUniformLocation | null;
  };
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

function makeGLRig(canvas: HTMLCanvasElement): GLRig | null {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    powerPreference: "high-performance",
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
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("program link error:", gl.getProgramInfoLog(program));
    return null;
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const loc = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  gl.useProgram(program);
  return {
    gl,
    program,
    u: {
      res: gl.getUniformLocation(program, "u_res"),
      time: gl.getUniformLocation(program, "u_time"),
      edgeCount: gl.getUniformLocation(program, "u_edgeCount"),
      edges: gl.getUniformLocation(program, "u_edges"),
      edgeMeta: gl.getUniformLocation(program, "u_edgeMeta"),
      flick: gl.getUniformLocation(program, "u_flick"),
      kfold: gl.getUniformLocation(program, "u_kfold"),
      intensity: gl.getUniformLocation(program, "u_intensity"),
    },
  };
}

/** Rotate the tesseract in 4D and project its edges into the flat buffers.
 *  edges: (ax,ay,bx,by) per edge; meta: (wColor, depth) per edge. */
function computeEdges(
  poly: Tesseract,
  ang: Angles6,
  edges: Float32Array,
  meta: Float32Array,
): number {
  const pts = poly.verts.map((v) => project4(rotate4(v, ang), DIST_W, DIST_Z));
  const count = Math.min(poly.edges.length, MAX_EDGES);
  for (let e = 0; e < count; e++) {
    const [i, j] = poly.edges[e];
    const a = pts[i];
    const b = pts[j];
    const o = e * 4;
    edges[o] = a.sx * SCALE;
    edges[o + 1] = a.sy * SCALE;
    edges[o + 2] = b.sx * SCALE;
    edges[o + 3] = b.sy * SCALE;
    meta[e * 2] = (a.w + b.w) * 0.5;
    meta[e * 2 + 1] = (a.depth + b.depth) * 0.5;
  }
  return count;
}

export default function TesseractMeltPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [usingFallback, setUsingFallback] = useState(false);
  const [tiltOn, setTiltOn] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rigRef = useRef<GLRig | null>(null);
  const fbRef = useRef<FallbackRig | null>(null);
  const audioRef = useRef<MeltAudio | null>(null);
  const acRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const polyRef = useRef<Tesseract>(buildTesseract());
  const flickRef = useRef<SafeFlicker | null>(null);

  const phaseRef = useRef<Phase>("idle");
  const frameRef = useRef<number>(0);

  // Accumulated 4D angle offsets driven by tilt / pointer (rate-integrated).
  const accumXWRef = useRef<number>(0);
  const accumYWRef = useRef<number>(0);
  // Current input "rate" from tilt or drag: [xw, yw] in ~[-1,1].
  const rateRef = useRef<[number, number]>([0, 0]);
  const dragOriginRef = useRef<[number, number] | null>(null);

  const edgeBufRef = useRef<Float32Array>(new Float32Array(MAX_EDGES * 4));
  const metaBufRef = useRef<Float32Array>(new Float32Array(MAX_EDGES * 2));

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const onOrient = useCallback((e: DeviceOrientationEvent) => {
    const gx = Math.max(-1, Math.min(1, (e.gamma ?? 0) / 45));
    const gy = Math.max(-1, Math.min(1, ((e.beta ?? 0) - 40) / 45));
    rateRef.current = [gx, gy];
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragOriginRef.current = [e.clientX, e.clientY];
  }, []);
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const o = dragOriginRef.current;
    if (!o) return;
    rateRef.current = [
      Math.max(-1, Math.min(1, (e.clientX - o[0]) / 150)),
      Math.max(-1, Math.min(1, (e.clientY - o[1]) / 150)),
    ];
  }, []);
  const onPointerUp = useCallback(() => {
    dragOriginRef.current = null;
    rateRef.current = [0, 0];
  }, []);

  const runLoop = useCallback(() => {
    if (phaseRef.current === "running") {
      frameRef.current += 1;
    }
    // Deterministic time base: integer frames at a fixed 60fps clock.
    const t = frameRef.current / 60;
    const dt = 1 / 60;

    // Integrate user-driven XW/YW rotation (zero when there is no input →
    // fully deterministic ghost self-demo).
    const rate = rateRef.current;
    accumXWRef.current += rate[0] * dt * 1.5;
    accumYWRef.current += rate[1] * dt * 1.5;
    const tiltMag = Math.min(1, Math.abs(rate[0]) + Math.abs(rate[1]));

    // Ghost auto-rotation (always runs) + user offsets on the w-planes.
    const ang: Angles6 = {
      xy: t * 0.1 + 0.2,
      xz: t * 0.06,
      yz: t * 0.045,
      xw: t * 0.15 + accumXWRef.current, // hyperplane — tilt L/R
      yw: t * 0.115 + accumYWRef.current, // hyperplane — tilt fwd/back
      zw: t * 0.08,
    };

    const edges = edgeBufRef.current;
    const meta = metaBufRef.current;
    const count = computeEdges(polyRef.current, ang, edges, meta);

    const flickVal = flickRef.current ? flickRef.current.value(t) : 1;
    const kfold = 6.0 + 2.0 * (0.5 + 0.5 * Math.sin(t * 0.03));
    const intensity = 1.15 + tiltMag * 0.5 + 0.15 * Math.sin(t * 0.07);

    const rig = rigRef.current;
    if (rig) {
      const { gl, u } = rig;
      gl.uniform2f(u.res, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform1f(u.time, t);
      gl.uniform1i(u.edgeCount, count);
      gl.uniform4fv(u.edges, edges);
      gl.uniform2fv(u.edgeMeta, meta);
      gl.uniform1f(u.flick, flickVal);
      gl.uniform1f(u.kfold, kfold);
      gl.uniform1f(u.intensity, intensity);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else if (fbRef.current) {
      fbRef.current.draw(edges, meta, count, flickVal);
    }

    // Audio tracks the summed w-rotation phase → rotating through W re-tunes.
    audioRef.current?.update(ang.xw + ang.yw + ang.zw, tiltMag);

    rafRef.current = requestAnimationFrame(runLoop);
  }, []);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(1.6, window.devicePixelRatio || 1);
    const w = Math.floor(window.innerWidth * dpr);
    const h = Math.floor(window.innerHeight * dpr);
    canvas.width = w;
    canvas.height = h;
    rigRef.current?.gl.viewport(0, 0, w, h);
  }, []);

  const handleStart = useCallback(async () => {
    if (phase === "running") return;

    if (phase === "paused") {
      if (acRef.current?.state === "suspended") await acRef.current.resume();
      setPhase("running");
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rig = makeGLRig(canvas);
    if (rig) {
      rigRef.current = rig;
    } else {
      const fb = makeFallbackRig(canvas);
      if (fb) {
        fbRef.current = fb;
        setUsingFallback(true);
      }
    }
    resize();

    flickRef.current = createSafeFlicker({
      maxHz: 3,
      defaultHz: prefersReducedMotion() ? 0.15 : 0.4,
      floor: 0.78,
    });
    flickRef.current.enable();

    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ac = new AC();
    await ac.resume();
    acRef.current = ac;
    audioRef.current = makeMeltAudio(ac, 0.12);

    // iOS needs an explicit permission tap; elsewhere just attach the listener.
    const DOE = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    if (DOE && typeof DOE.requestPermission === "function") {
      try {
        const res = await DOE.requestPermission();
        if (res === "granted") {
          window.addEventListener("deviceorientation", onOrient);
          setTiltOn(true);
        }
      } catch {
        /* denied → pointer / ghost only */
      }
    } else if (
      typeof window !== "undefined" &&
      "DeviceOrientationEvent" in window
    ) {
      window.addEventListener("deviceorientation", onOrient);
      setTiltOn(true);
    }

    setPhase("running");
  }, [phase, resize, onOrient]);

  const handlePause = useCallback(async () => {
    if (phaseRef.current !== "running") return;
    setPhase("paused");
    if (acRef.current?.state === "running") await acRef.current.suspend();
  }, []);

  useEffect(() => {
    if (phase === "idle") return;
    rafRef.current = requestAnimationFrame(runLoop);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [phase, runLoop, resize]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("deviceorientation", onOrient);
      audioRef.current?.stop();
      audioRef.current = null;
      const ac = acRef.current;
      if (ac && ac.state !== "closed") {
        window.setTimeout(() => {
          if (ac.state !== "closed") void ac.close();
        }, 1600);
      }
      acRef.current = null;
      const rig = rigRef.current;
      if (rig) {
        rig.gl.deleteProgram(rig.program);
        const ext = rig.gl.getExtension("WEBGL_lose_context");
        ext?.loseContext();
      }
      rigRef.current = null;
      fbRef.current = null;
    };
  }, [onOrient]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-foreground">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        className="fixed inset-0 h-full w-full touch-none"
      />

      <div className="fixed left-0 top-0 z-30 max-w-md p-5 sm:p-7">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          DMT-breakthrough · hyperdimensional
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          Tesseract Melt
        </h1>
        <p className="mt-2 text-base leading-relaxed text-foreground">
          A four-dimensional tesseract rotating through hyperspace — steered by
          tilting your device (or dragging on desktop). The hidden{" "}
          <span className="font-mono">w</span>-plane rotations have no
          three-dimensional analogue, so the projected cage turns inside-out and
          melts: a drug-free evocation of the &ldquo;more axes than physical
          reality allows&rdquo; phenomenology.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          {phase !== "running" && (
            <button
              onClick={handleStart}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {phase === "paused"
                ? "Resume"
                : tiltOn
                  ? "Enter hyperspace"
                  : "Enable tilt · enter hyperspace"}
            </button>
          )}
          {phase === "running" && (
            <button
              onClick={handlePause}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Pause
            </button>
          )}
        </div>

        {phase !== "idle" && (
          <p className="mt-3 text-base text-muted-foreground">
            {tiltOn
              ? "Tilt to steer through the 4th dimension."
              : "Tilt on mobile; drag on desktop to steer."}{" "}
            Leave it be and it melts on its own.
          </p>
        )}

        {usingFallback && (
          <p className="mt-3 max-w-sm text-base text-muted-foreground">
            WebGL2 is unavailable here, so this is a lighter Canvas2D wireframe
            of the same rotating tesseract. The audio and the four-dimensional
            melt still play.
          </p>
        )}

        <details className="mt-4 max-w-sm text-sm text-muted-foreground">
          <summary className="cursor-pointer text-primary hover:text-primary/80">
            Design notes
          </summary>
          <div className="mt-2 space-y-2 leading-relaxed">
            <p>
              A regular tesseract (8-cell: 16 vertices, 32 edges) is rotated by
              all six 4D planes — the animated{" "}
              <span className="font-mono">xw, yw, zw</span> hyperplanes are what
              make it melt — then projected 4D&rarr;3D&rarr;2D by two perspective
              divides. A fragment shader renders the edges as a thin-film
              iridescent glow with chromatic aberration inside an N-fold
              kaleidoscope. An inharmonic partial bank detunes with the
              w-rotation angle. Full notes and references in{" "}
              <span className="font-mono">README.md</span>.
            </p>
            <p>
              Phenomenology, not medicine — no neural claim is made. Slow, soft
              luminance drift only; no strobe.
            </p>
          </div>
        </details>
      </div>

      <PrototypeNav slugs={["1714-tesseract-melt"]} />
    </main>
  );
}
