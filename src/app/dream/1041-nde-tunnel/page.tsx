"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { FRAG_SRC, VERT_SRC } from "./shaders";
import { evalTimeline } from "./timeline";
import { makeNdeAudio, type NdeAudio } from "./audio";

/* time dilation: stretch the whole clock slow. 1 = real-time. */
const TIME_SCALE = 0.62;

type Phase = "idle" | "running" | "paused";

interface GLRig {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  uniforms: {
    res: WebGLUniformLocation | null;
    time: WebGLUniformLocation | null;
    speed: WebGLUniformLocation | null;
    light: WebGLUniformLocation | null;
    vignette: WebGLUniformLocation | null;
    clarity: WebGLUniformLocation | null;
    open: WebGLUniformLocation | null;
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
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("program link error:", gl.getProgramInfoLog(program));
    return null;
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  // full-screen triangle
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
      speed: gl.getUniformLocation(program, "u_speed"),
      light: gl.getUniformLocation(program, "u_light"),
      vignette: gl.getUniformLocation(program, "u_vignette"),
      clarity: gl.getUniformLocation(program, "u_clarity"),
      open: gl.getUniformLocation(program, "u_open"),
      drift: gl.getUniformLocation(program, "u_drift"),
    },
  };
}

export default function NdeTunnelPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [noGL, setNoGL] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rigRef = useRef<GLRig | null>(null);
  const audioRef = useRef<NdeAudio | null>(null);
  const acRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);

  // wall-clock bookkeeping so Pause freezes the shared timeline cleanly
  const elapsedRef = useRef<number>(0); // scaled seconds of journey
  const lastTickRef = useRef<number>(0);
  const driftRef = useRef<[number, number]>([0, 0]);
  const driftTargetRef = useRef<[number, number]>([0, 0]);
  const phaseRef = useRef<Phase>("idle");

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  /* gentle optional pointer drift — a subtle camera nudge, never required */
  const onPointerMove = useCallback((e: PointerEvent) => {
    const x = (e.clientX / window.innerWidth) * 2 - 1;
    const y = (e.clientY / window.innerHeight) * 2 - 1;
    driftTargetRef.current = [x, -y];
  }, []);

  const onOrient = useCallback((e: DeviceOrientationEvent) => {
    const gx = Math.max(-1, Math.min(1, (e.gamma ?? 0) / 45));
    const gy = Math.max(-1, Math.min(1, ((e.beta ?? 0) - 45) / 45));
    driftTargetRef.current = [gx, -gy];
  }, []);

  /* ── render loop: one clock feeds shader uniforms + audio update ──── */
  const renderLoop = useCallback(() => {
    const rig = rigRef.current;
    const now = performance.now();
    const dt = (now - lastTickRef.current) / 1000;
    lastTickRef.current = now;

    if (phaseRef.current === "running") {
      elapsedRef.current += dt * TIME_SCALE;
    }
    const tl = evalTimeline(elapsedRef.current);

    // ease drift toward target (weightless)
    const d = driftRef.current;
    const dt2 = driftTargetRef.current;
    d[0] += (dt2[0] - d[0]) * 0.04;
    d[1] += (dt2[1] - d[1]) * 0.04;

    if (rig) {
      const { gl, uniforms } = rig;
      gl.uniform2f(uniforms.res, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform1f(uniforms.time, elapsedRef.current);
      gl.uniform1f(uniforms.speed, tl.speed);
      gl.uniform1f(uniforms.light, tl.light);
      gl.uniform1f(uniforms.vignette, tl.vignette);
      gl.uniform1f(uniforms.clarity, tl.clarity);
      gl.uniform1f(uniforms.open, tl.open);
      gl.uniform2f(uniforms.drift, d[0], d[1]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // audio follows the SAME timeline (lagged internally → desync)
    audioRef.current?.update(tl.light, tl.open, TIME_SCALE);

    rafRef.current = requestAnimationFrame(renderLoop);
  }, []);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const rig = rigRef.current;
    if (!canvas) return;
    const dpr = Math.min(1.75, window.devicePixelRatio || 1);
    const w = Math.floor(window.innerWidth * dpr);
    const h = Math.floor(window.innerHeight * dpr);
    canvas.width = w;
    canvas.height = h;
    if (rig) rig.gl.viewport(0, 0, w, h);
  }, []);

  /* ── Start: create GL rig + audio inside the user gesture ─────────── */
  const handleStart = useCallback(async () => {
    if (phase === "running") return;

    // resuming from pause: just unfreeze
    if (phase === "paused") {
      if (acRef.current?.state === "suspended") await acRef.current.resume();
      setPhase("running");
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rig = makeGLRig(canvas);
    if (!rig) {
      setNoGL(true);
      return;
    }
    rigRef.current = rig;
    resize();

    // audio
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ac = new AC();
    await ac.resume();
    acRef.current = ac;
    audioRef.current = makeNdeAudio(ac, 0.15);

    // optional gyro drift (best-effort; never required)
    const DOE = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    if (DOE && typeof DOE.requestPermission === "function") {
      try {
        const res = await DOE.requestPermission();
        if (res === "granted") {
          window.addEventListener("deviceorientation", onOrient);
        }
      } catch {
        /* gyro unavailable — pointer / auto-drift still works */
      }
    } else if (
      typeof window !== "undefined" &&
      "DeviceOrientationEvent" in window
    ) {
      window.addEventListener("deviceorientation", onOrient);
    }

    elapsedRef.current = 0;
    lastTickRef.current = performance.now();
    setPhase("running");
  }, [phase, resize, onOrient]);

  /* ── Pause: instantly freeze motion + silence audio ───────────────── */
  const handlePause = useCallback(async () => {
    if (phaseRef.current !== "running") return;
    setPhase("paused");
    if (acRef.current?.state === "running") {
      await acRef.current.suspend();
    }
  }, []);

  /* ── kick the RAF loop + listeners once running has ever begun ────── */
  useEffect(() => {
    if (phase === "idle") return;
    lastTickRef.current = performance.now();
    rafRef.current = requestAnimationFrame(renderLoop);
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, [phase, renderLoop, resize, onPointerMove]);

  /* ── full teardown on unmount ─────────────────────────────────────── */
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
    };
  }, [onOrient]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      {/* full-screen WebGL2 raymarch */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 h-full w-full touch-none"
      />

      {noGL && (
        <div className="fixed inset-0 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base text-rose-300">
            This piece needs WebGL2, which is not available in your browser.
            The near-death tunnel cannot be raymarched here — try a recent
            desktop Chrome, Firefox, or Safari.
          </p>
        </div>
      )}

      {/* corner UI */}
      <div className="fixed left-0 top-0 z-30 max-w-sm p-5 sm:p-7">
        <h1 className="font-serif text-2xl tracking-tight text-white/95 sm:text-3xl">
          NDE Tunnel
        </h1>
        <p className="mt-2 text-base leading-relaxed text-white/80">
          A drug-free raymarched descent down an endless wormhole toward the
          being of light — leaving the body, drifting the void, the gamma
          clarity-snap, the soft return. It plays itself; loops forever.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          {phase !== "running" && (
            <button
              onClick={handleStart}
              className="min-h-[44px] rounded-full bg-white/95 px-6 py-2.5 text-base font-medium text-black transition hover:bg-white"
            >
              {phase === "paused" ? "Resume" : "Start"}
            </button>
          )}
          {phase === "running" && (
            <button
              onClick={handlePause}
              className="min-h-[44px] rounded-full border border-white/25 bg-black/50 px-6 py-2.5 text-base font-medium text-white/95 backdrop-blur transition hover:bg-black/70"
            >
              Pause
            </button>
          )}
        </div>

        {phase === "idle" && (
          <p className="mt-3 font-mono text-sm text-violet-300">
            tap Start — sound + visuals begin together
          </p>
        )}
        {phase === "running" && (
          <p className="mt-3 font-mono text-sm text-violet-300">
            drifting · hands-free · move the pointer to nudge the drift
          </p>
        )}
        {phase === "paused" && (
          <p className="mt-3 font-mono text-sm text-violet-300">
            frozen · silent · Resume to continue the descent
          </p>
        )}
      </div>

      <PrototypeNav slugs={["1041-nde-tunnel"]} />
    </main>
  );
}
