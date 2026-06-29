"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { FRAG_SRC, VERT_SRC, MAX_EDGES } from "./shaders";
import { evalTimeline } from "./timeline";
import { makeBloomAudio, type BloomAudio } from "./audio";
import { makeFallbackRig, type FallbackRig } from "./fallback";
import {
  build24Cell,
  rotate4,
  project4to3,
  type Polytope,
  type Angles6,
} from "./polytope";

type Phase = "idle" | "running" | "paused";

interface GLRig {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  edgeBuf: Float32Array; // MAX_EDGES*2 vec3 endpoints
  uniforms: {
    res: WebGLUniformLocation | null;
    time: WebGLUniformLocation | null;
    speed: WebGLUniformLocation | null;
    glow: WebGLUniformLocation | null;
    sat: WebGLUniformLocation | null;
    bloom: WebGLUniformLocation | null;
    peak: WebGLUniformLocation | null;
    edgeCount: WebGLUniformLocation | null;
    edges: WebGLUniformLocation | null;
    drift: WebGLUniformLocation | null;
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
    edgeBuf: new Float32Array(MAX_EDGES * 2 * 3),
    uniforms: {
      res: gl.getUniformLocation(program, "u_res"),
      time: gl.getUniformLocation(program, "u_time"),
      speed: gl.getUniformLocation(program, "u_speed"),
      glow: gl.getUniformLocation(program, "u_glow"),
      sat: gl.getUniformLocation(program, "u_sat"),
      bloom: gl.getUniformLocation(program, "u_bloom"),
      peak: gl.getUniformLocation(program, "u_peak"),
      edgeCount: gl.getUniformLocation(program, "u_edgeCount"),
      edges: gl.getUniformLocation(program, "u_edges"),
      drift: gl.getUniformLocation(program, "u_drift"),
    },
  };
}

/** Rotate the polytope in 4D and project its edges into the flat edge buffer
 *  (xa,ya,za, xb,yb,zb, ...). Returns the edge count actually written. */
function projectEdges(
  poly: Polytope,
  ang: Angles6,
  out: Float32Array,
  bloom: number,
): number {
  const projDist = 2.6 - bloom * 1.0; // smaller dist → harder balloon
  const pts = poly.verts.map((v) => project4to3(rotate4(v, ang), projDist));
  const count = Math.min(poly.edges.length, MAX_EDGES);
  for (let e = 0; e < count; e++) {
    const [i, j] = poly.edges[e];
    const a = pts[i];
    const b = pts[j];
    const o = e * 6;
    out[o] = a[0];
    out[o + 1] = a[1];
    out[o + 2] = a[2];
    out[o + 3] = b[0];
    out[o + 4] = b[1];
    out[o + 5] = b[2];
  }
  return count;
}

export default function HyperspaceBloomPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [usingFallback, setUsingFallback] = useState(false);
  const [tiltOn, setTiltOn] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rigRef = useRef<GLRig | null>(null);
  const fbRef = useRef<FallbackRig | null>(null);
  const audioRef = useRef<BloomAudio | null>(null);
  const acRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const polyRef = useRef<Polytope>(build24Cell());

  const elapsedRef = useRef<number>(0);
  const lastTickRef = useRef<number>(0);
  const driftRef = useRef<[number, number]>([0, 0]);
  const driftTargetRef = useRef<[number, number]>([0, 0]);
  const phaseRef = useRef<Phase>("idle");

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const onOrient = useCallback((e: DeviceOrientationEvent) => {
    const gx = Math.max(-1, Math.min(1, (e.gamma ?? 0) / 45));
    const gy = Math.max(-1, Math.min(1, ((e.beta ?? 0) - 45) / 45));
    driftTargetRef.current = [gx, -gy];
  }, []);

  const renderLoop = useCallback(() => {
    const now = performance.now();
    const dt = (now - lastTickRef.current) / 1000;
    lastTickRef.current = now;

    if (phaseRef.current === "running") {
      elapsedRef.current += dt;
    }
    const time = elapsedRef.current;
    const tl = evalTimeline(time);

    // audio FFT bands feed back into the visual gains
    const lv = audioRef.current?.levels() ?? { bass: 0, high: 0, loud: 0 };
    const flow = tl.speed + lv.bass * 0.8; // bass → rotation/flow
    const glow = Math.min(1.4, tl.glow + lv.loud * 0.6); // loudness → neon gain
    const sat = Math.min(1, tl.sat + lv.high * 0.4); // highs → saturation

    // ease drift toward target
    const d = driftRef.current;
    const dtg = driftTargetRef.current;
    d[0] += (dtg[0] - d[0]) * 0.05;
    d[1] += (dtg[1] - d[1]) * 0.05;

    // ── continuous 4D rotation, w-planes animated → impossible morph ──
    const r = time * (0.18 + 0.25 * flow);
    const ang: Angles6 = {
      xy: r * 0.5 + 0.2,
      xz: r * 0.33,
      xw: r * 0.85, // hyper plane
      yz: r * 0.42,
      yw: r * 0.66, // hyper plane
      zw: r * 0.74, // hyper plane
    };

    const rig = rigRef.current;
    if (rig) {
      const { gl, uniforms, edgeBuf } = rig;
      const count = projectEdges(polyRef.current, ang, edgeBuf, tl.bloom);
      gl.uniform2f(uniforms.res, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform1f(uniforms.time, time);
      gl.uniform1f(uniforms.speed, flow);
      gl.uniform1f(uniforms.glow, glow);
      gl.uniform1f(uniforms.sat, sat);
      gl.uniform1f(uniforms.bloom, tl.bloom);
      gl.uniform1f(uniforms.peak, tl.peak);
      gl.uniform1i(uniforms.edgeCount, count);
      gl.uniform3fv(uniforms.edges, edgeBuf);
      gl.uniform2f(uniforms.drift, d[0], d[1]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else if (fbRef.current) {
      fbRef.current.draw(time, tl.peak, sat);
    }

    audioRef.current?.update(tl.glow, tl.sat, tl.speed, tl.peak);

    rafRef.current = requestAnimationFrame(renderLoop);
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

    // try WebGL2; fall back to Canvas2D wireframe
    const rig = makeGLRig(canvas);
    if (rig) {
      rigRef.current = rig;
    } else {
      const fb = makeFallbackRig(canvas, polyRef.current);
      if (fb) {
        fbRef.current = fb;
        setUsingFallback(true);
      }
    }
    resize();

    // audio (inside the user gesture)
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ac = new AC();
    await ac.resume();
    acRef.current = ac;
    audioRef.current = makeBloomAudio(ac, 0.16);

    // optional device-tilt enhancement (auto-journey drives everything)
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
        /* denied → auto-journey only */
      }
    } else if (
      typeof window !== "undefined" &&
      "DeviceOrientationEvent" in window
    ) {
      window.addEventListener("deviceorientation", onOrient);
      setTiltOn(true);
    }

    elapsedRef.current = 0;
    lastTickRef.current = performance.now();
    setPhase("running");
  }, [phase, resize, onOrient]);

  const handlePause = useCallback(async () => {
    if (phaseRef.current !== "running") return;
    setPhase("paused");
    if (acRef.current?.state === "running") await acRef.current.suspend();
  }, []);

  useEffect(() => {
    if (phase === "idle") return;
    lastTickRef.current = performance.now();
    rafRef.current = requestAnimationFrame(renderLoop);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [phase, renderLoop, resize]);

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
        }, 1700);
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
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      <canvas
        ref={canvasRef}
        className="fixed inset-0 h-full w-full touch-none"
      />

      <div className="fixed left-0 top-0 z-30 max-w-md p-5 sm:p-7">
        <h1 className="text-2xl font-semibold tracking-tight text-white/95 sm:text-3xl">
          Hyperspace Bloom
        </h1>
        <p className="mt-2 text-base leading-relaxed text-white/80">
          A drug-free fall toward the DMT &ldquo;breakthrough&rdquo;: a 24-cell
          polytope rotating through six planes of four-dimensional space,
          stereographically projected and raymarched as glowing neon-jeweled
          structure. The hidden <span className="font-mono">w</span> rotations
          make flat edges balloon and turn inside-out &mdash; the eye reads it
          as impossible morphing.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          {phase !== "running" && (
            <button
              onClick={handleStart}
              className="min-h-[44px] min-w-[44px] rounded-full bg-violet-400/95 px-4 py-2.5 text-base font-medium text-black transition hover:bg-violet-300"
            >
              {phase === "paused" ? "Resume" : "Begin descent"}
            </button>
          )}
          {phase === "running" && (
            <button
              onClick={handlePause}
              className="min-h-[44px] min-w-[44px] rounded-full border border-white/25 bg-black/50 px-4 py-2.5 text-base font-medium text-white/95 backdrop-blur transition hover:bg-black/70"
            >
              Pause
            </button>
          )}
        </div>

        {phase === "idle" && (
          <p className="mt-3 font-mono text-sm text-violet-300">
            tap to begin &middot; sound + visuals rise into the breakthrough
            together (~75s, then loops)
          </p>
        )}
        {phase === "running" && (
          <p className="mt-3 font-mono text-sm text-violet-300">
            {tiltOn ? "tilt to steer · " : ""}hands-free auto-journey &middot;
            no pointer needed
          </p>
        )}
        {phase === "paused" && (
          <p className="mt-3 font-mono text-sm text-violet-300">
            frozen &middot; silent &middot; Resume to continue the descent
          </p>
        )}

        {usingFallback && (
          <p className="mt-3 max-w-sm text-base text-rose-300">
            WebGL2 is unavailable here, so this is a lighter Canvas2D
            wireframe of the same rotating 24-cell. The audio and the
            four-dimensional morph still play.
          </p>
        )}

        <details className="mt-4 max-w-sm text-sm text-white/75">
          <summary className="cursor-pointer text-violet-300 hover:text-violet-200">
            Read the design notes
          </summary>
          <div className="mt-2 space-y-2 leading-relaxed">
            <p>
              Technique: a regular 24-cell (24 vertices, 96 edges) is rotated
              by all six 4D rotation planes &mdash; the animated{" "}
              <span className="font-mono">xw, yw, zw</span> planes are what
              make the projected 3D slice bloom &mdash; then{" "}
              <span className="font-mono">stereographically projected</span>{" "}
              4D&rarr;3D and raymarched as a glowing capsule union.
            </p>
            <p>
              Phenomenology, not medicine: inspired by the &ldquo;hyperbolic
              geometry of DMT&rdquo; thesis (QRI / Andr&eacute;s
              G&oacute;mez-Emilsson), Bressloff&ndash;Cowan cortical
              form-constants, and the classic 4D-rotation + stereographic
              projection raymarch lineage. Full notes in{" "}
              <span className="font-mono">README.md</span>.
            </p>
          </div>
        </details>
      </div>

      <PrototypeNav slugs={["1042-hyperspace-bloom"]} />
    </main>
  );
}
