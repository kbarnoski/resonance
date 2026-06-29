"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { FRAG_SRC, VERT_SRC } from "./shader";
import { evalArc } from "./arc";
import { makeDroneAudio, type DroneAudio } from "./audio";

type Phase = "idle" | "running" | "paused";

interface GLRig {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  uniforms: {
    res: WebGLUniformLocation | null;
    time: WebGLUniformLocation | null;
    fall: WebGLUniformLocation | null;
    depth: WebGLUniformLocation | null;
    warp: WebGLUniformLocation | null;
    sat: WebGLUniformLocation | null;
    chroma: WebGLUniformLocation | null;
    glow: WebGLUniformLocation | null;
    peak: WebGLUniformLocation | null;
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
    uniforms: {
      res: gl.getUniformLocation(program, "u_res"),
      time: gl.getUniformLocation(program, "u_time"),
      fall: gl.getUniformLocation(program, "u_fall"),
      depth: gl.getUniformLocation(program, "u_depth"),
      warp: gl.getUniformLocation(program, "u_warp"),
      sat: gl.getUniformLocation(program, "u_sat"),
      chroma: gl.getUniformLocation(program, "u_chroma"),
      glow: gl.getUniformLocation(program, "u_glow"),
      peak: gl.getUniformLocation(program, "u_peak"),
    },
  };
}

export default function HyperbolicBloomPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [noWebGL, setNoWebGL] = useState(false);
  const [micOn, setMicOn] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rigRef = useRef<GLRig | null>(null);
  const audioRef = useRef<DroneAudio | null>(null);
  const acRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);

  const elapsedRef = useRef<number>(0);
  const lastTickRef = useRef<number>(0);
  const fallRef = useRef<number>(0);
  const phaseRef = useRef<Phase>("idle");

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const renderLoop = useCallback(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastTickRef.current) / 1000);
    lastTickRef.current = now;

    if (phaseRef.current === "running") {
      elapsedRef.current += dt;
    }
    const time = elapsedRef.current;
    const arc = evalArc(time);

    // FFT bands (mic if granted, else the drone) feed the visuals
    const lv = audioRef.current?.levels() ?? {
      bass: 0,
      mid: 0,
      high: 0,
      loud: 0,
    };
    const fallRate = arc.fall + lv.bass * 0.9; // bass → geodesic fall speed
    const warp = Math.min(1, arc.warp + lv.mid * 0.5); // mids → warp amplitude
    const chroma = Math.min(1, arc.chroma + lv.high * 0.4); // highs → iridescence
    const sat = Math.min(1, arc.sat + lv.loud * 0.35); // loudness → saturation

    // integrate the perpetual hyperbolic fall (never resets → no loop)
    if (phaseRef.current === "running") {
      fallRef.current += dt * (0.25 + fallRate * 0.9);
    }

    const rig = rigRef.current;
    if (rig) {
      const { gl, uniforms } = rig;
      gl.uniform2f(uniforms.res, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform1f(uniforms.time, time);
      gl.uniform1f(uniforms.fall, fallRef.current);
      gl.uniform1f(uniforms.depth, arc.depth);
      gl.uniform1f(uniforms.warp, warp);
      gl.uniform1f(uniforms.sat, sat);
      gl.uniform1f(uniforms.chroma, chroma);
      gl.uniform1f(uniforms.glow, arc.glow);
      gl.uniform1f(uniforms.peak, arc.peak);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    audioRef.current?.update(arc.glow, arc.sat, arc.fall, arc.peak);

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

    const rig = makeGLRig(canvas);
    if (rig) {
      rigRef.current = rig;
    } else {
      setNoWebGL(true);
    }
    resize();

    // audio inside the user gesture — drone is self-sufficient
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ac = new AC();
    await ac.resume();
    acRef.current = ac;
    audioRef.current = makeDroneAudio(ac, 0.15);

    // OPTIONAL analysis-only mic — never connected to destination
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
        if (audioRef.current?.attachMic(stream)) setMicOn(true);
      } catch {
        /* denied → the drone alone drives everything */
      }
    }

    elapsedRef.current = 0;
    fallRef.current = 0;
    lastTickRef.current = performance.now();
    setPhase("running");
  }, [phase, resize]);

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
    };
  }, []);

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      <canvas
        ref={canvasRef}
        className="fixed inset-0 h-full w-full touch-none"
      />

      <div className="fixed left-0 top-0 z-30 max-w-md p-5 sm:p-7">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-white/95 sm:text-3xl">
          Hyperbolic Bloom
        </h1>
        <p className="mt-2 text-base leading-relaxed text-white/80">
          A drug-free descent into the DMT &ldquo;hyperbolic
          hyperspace&rdquo;: a {"{7,3}"} tiling rendered on the Poincar&eacute;
          disk, where space stops being flat and becomes negatively curved
          &mdash; saddle sheets and jeweled heptagons streaming out toward the
          rim forever, never running out.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          {phase !== "running" && (
            <button
              onClick={handleStart}
              className="min-h-[44px] min-w-[44px] rounded-full bg-violet-400/95 px-4 py-2.5 text-base font-medium text-black transition hover:bg-violet-300"
            >
              {phase === "paused" ? "Resume the fall" : "Begin the descent"}
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
            tap to begin &middot; a generative drone plays with no permissions
            &middot; ~5 min, non-looping
          </p>
        )}
        {phase === "running" && (
          <p className="mt-3 font-mono text-sm text-violet-300">
            {micOn
              ? "mic listening (analysis only) · sound shapes the curvature"
              : "drone-driven · the geodesic falls outward forever"}
          </p>
        )}
        {phase === "paused" && (
          <p className="mt-3 font-mono text-sm text-violet-300">
            frozen &middot; silent &middot; Resume to continue the descent
          </p>
        )}

        {noWebGL && (
          <p className="mt-3 max-w-sm text-base text-rose-300">
            WebGL2 is unavailable here, so the hyperbolic tiling can&rsquo;t be
            drawn &mdash; but the generative drone still plays the full ~5
            minute descent.
          </p>
        )}
        {phase === "running" && !micOn && (
          <p className="mt-3 max-w-sm text-sm text-white/75">
            No microphone &mdash; the self-sufficient drone is driving the
            field. (If you allow the mic, it modulates the curvature; it is
            analysis-only and never played back.)
          </p>
        )}

        <details className="mt-4 max-w-sm text-sm text-white/75">
          <summary className="cursor-pointer text-violet-300 hover:text-violet-200">
            Read the design notes
          </summary>
          <div className="mt-2 space-y-2 leading-relaxed">
            <p>
              Each pixel is mapped to a complex point{" "}
              <span className="font-mono">z</span> in the Poincar&eacute; unit
              disk, dragged backward along a hyperbolic geodesic by an inverse
              M&ouml;bius transform (the endless &ldquo;fall&rdquo;), then
              folded into one cell of a{" "}
              <span className="font-mono">{"{7,3}"}</span> tiling by alternating
              seven-fold mirror reflections with circle inversions in a circle
              orthogonal to the disk. Fold count drives a jeweled cosine
              palette with thin-film iridescence and chromatic aberration.
            </p>
            <p>
              Phenomenology, not medicine. Inspired by QRI&rsquo;s{" "}
              <span className="italic">
                Hyperbolic Geometry of the DMT Experience
              </span>{" "}
              (G&oacute;mez-Emilsson), Bressloff&ndash;Cowan cortical
              form-constants, and Escher&rsquo;s{" "}
              <span className="italic">Circle Limit</span> prints. The{" "}
              <span className="font-mono">{"{7,3}"}</span> fold is an honest
              approximation &mdash; see <span className="font-mono">README.md</span>.
            </p>
          </div>
        </details>
      </div>

      <PrototypeNav slugs={["1044-hyperbolic-bloom"]} />
    </main>
  );
}
