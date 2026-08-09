"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { FRAG_SRC, VERT_SRC } from "./shaders";
import {
  autoHolding,
  createArc,
  PHASE_LABEL,
  stepArc,
  type ArcState,
  type Phase,
} from "./arc";
import { makeSurgeAudio, type SurgeAudio } from "./audio";

// base hue per phase — cool in the calm sections, hot toward the drop
const PHASE_HUE: Record<Phase, number> = {
  intro: 0.66, // indigo
  build: 0.74, // violet, heats toward magenta as energy climbs
  peak: 0.82, // magenta
  drop: 0.92, // hot pink / red
  groove: 0.58, // electric blue-violet
  breakdown: 0.62, // cooling blue
};

interface GLRig {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  u: Record<string, WebGLUniformLocation | null>;
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

  const names = [
    "u_res",
    "u_time",
    "u_travel",
    "u_comp",
    "u_bright",
    "u_pump",
    "u_flash",
    "u_energy",
    "u_hue",
    "u_reduce",
  ];
  const u: Record<string, WebGLUniformLocation | null> = {};
  for (const n of names) u[n] = gl.getUniformLocation(program, n);

  return { gl, program, u };
}

type Mode = "idle" | "running" | "paused";

export default function SurgePage() {
  const [mode, setMode] = useState<Mode>("idle");
  const [noGL, setNoGL] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [driver, setDriver] = useState<"auto" | "you">("auto");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rigRef = useRef<GLRig | null>(null);
  const acRef = useRef<AudioContext | null>(null);
  const audioRef = useRef<SurgeAudio | null>(null);
  const rafRef = useRef<number>(0);

  const arcRef = useRef<ArcState>(createArc());
  const travelRef = useRef<number>(0);
  const lastTickRef = useRef<number>(0);
  const modeRef = useRef<Mode>("idle");

  const holdingRef = useRef<boolean>(false); // human key currently down
  const autoRef = useRef<boolean>(true); // auto-pilot still driving?
  const reduceRef = useRef<boolean>(false);

  // DOM refs for the HUD (updated per-frame without React re-renders)
  const phaseElRef = useRef<HTMLSpanElement | null>(null);
  const energyElRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    reduceRef.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
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

  const renderLoop = useCallback(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastTickRef.current) / 1000);
    lastTickRef.current = now;

    const arc = arcRef.current;
    const reduce = reduceRef.current;

    if (modeRef.current === "running") {
      // choose the charge input: auto-pilot until the human first presses
      const holding = autoRef.current
        ? autoHolding(arc)
        : holdingRef.current;
      stepArc(arc, dt, holding);
      audioRef.current?.setArc(arc.phase, arc.energy, arc.dropPower);
    }

    // ── map arc → visual parameters ──────────────────────────────────────
    const e = arc.energy;
    const flash = arc.dropFlash;
    const grooving = arc.phase === "groove" || arc.phase === "drop";
    const motion = reduce ? 0.32 : 1;

    const speed =
      (0.3 + e * 1.5 + (grooving ? 0.9 : 0) + flash * 2.6) * motion;
    if (modeRef.current === "running") travelRef.current += dt * speed;

    const ac = acRef.current;
    const pumpRaw = ac ? (audioRef.current?.visualPump(ac.currentTime) ?? 0) : 0;
    const pump = pumpRaw * (reduce ? 0.4 : 1);

    const comp = e * 1.1 - flash * (reduce ? 0.7 : 1.7);
    const bright =
      0.5 + pump * 0.5 + flash * (reduce ? 0.3 : 0.85) + (grooving ? 0.22 : 0);
    const hue = PHASE_HUE[arc.phase];

    const rig = rigRef.current;
    if (rig) {
      const { gl, u } = rig;
      gl.uniform2f(u.u_res, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform1f(u.u_time, now / 1000);
      gl.uniform1f(u.u_travel, travelRef.current);
      gl.uniform1f(u.u_comp, comp);
      gl.uniform1f(u.u_bright, bright);
      gl.uniform1f(u.u_pump, pump);
      gl.uniform1f(u.u_flash, flash);
      gl.uniform1f(u.u_energy, e);
      gl.uniform1f(u.u_hue, hue);
      gl.uniform1f(u.u_reduce, reduce ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // ── HUD (direct DOM writes, no re-render) ────────────────────────────
    if (phaseElRef.current) {
      phaseElRef.current.textContent = PHASE_LABEL[arc.phase];
    }
    if (energyElRef.current) {
      energyElRef.current.style.width = `${Math.round(e * 100)}%`;
    }

    rafRef.current = requestAnimationFrame(renderLoop);
  }, []);

  const engageHuman = useCallback(() => {
    if (autoRef.current) {
      autoRef.current = false;
      setDriver("you");
    }
  }, []);

  const handleStart = useCallback(async () => {
    if (mode === "running") return;

    if (mode === "paused") {
      if (acRef.current?.state === "suspended") await acRef.current.resume();
      setMode("running");
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      setNoGL(true);
    } else {
      const rig = makeGLRig(canvas);
      if (!rig) {
        setNoGL(true);
      } else {
        rigRef.current = rig;
        resize();
      }
    }

    // AudioContext MUST be created inside this user gesture
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ac = new AC();
    await ac.resume();
    acRef.current = ac;
    audioRef.current = makeSurgeAudio(ac, 0.19);

    arcRef.current = createArc();
    travelRef.current = 0;
    autoRef.current = true;
    holdingRef.current = false;
    setDriver("auto");
    lastTickRef.current = performance.now();
    setMode("running");
  }, [mode, resize]);

  const handlePause = useCallback(async () => {
    if (modeRef.current !== "running") return;
    setMode("paused");
    holdingRef.current = false;
    if (acRef.current?.state === "running") await acRef.current.suspend();
  }, []);

  // keyboard: hold Space to charge, release to drop
  useEffect(() => {
    const down = (ev: KeyboardEvent) => {
      if (ev.code !== "Space" && ev.key !== " ") return;
      ev.preventDefault();
      if (ev.repeat) return;
      if (modeRef.current !== "running") return;
      engageHuman();
      holdingRef.current = true;
    };
    const up = (ev: KeyboardEvent) => {
      if (ev.code !== "Space" && ev.key !== " ") return;
      ev.preventDefault();
      holdingRef.current = false;
    };
    const blur = () => {
      holdingRef.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [engageHuman]);

  // pointer HOLD affordance (secondary; keyboard is primary input)
  const onPadDown = useCallback(() => {
    if (modeRef.current !== "running") return;
    engageHuman();
    holdingRef.current = true;
  }, [engageHuman]);
  const onPadUp = useCallback(() => {
    holdingRef.current = false;
  }, []);

  useEffect(() => {
    if (mode === "idle") return;
    lastTickRef.current = performance.now();
    rafRef.current = requestAnimationFrame(renderLoop);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [mode, renderLoop, resize]);

  // full teardown on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      audioRef.current?.stop();
      audioRef.current = null;
      const ac = acRef.current;
      if (ac && ac.state !== "closed") {
        window.setTimeout(() => {
          if (ac.state !== "closed") void ac.close();
        }, 400);
      }
      acRef.current = null;
      const rig = rigRef.current;
      if (rig) {
        rig.gl.deleteProgram(rig.program);
        rig.gl.getExtension("WEBGL_lose_context")?.loseContext();
      }
      rigRef.current = null;
    };
  }, []);

  const running = mode === "running";

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-foreground">
      <canvas
        ref={canvasRef}
        className="fixed inset-0 h-full w-full touch-none"
      />

      {noGL && (
        <div className="fixed inset-0 z-20 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base leading-relaxed text-muted-foreground">
            WebGL2 is not available in this browser, so the energy tunnel
            cannot render. The audio arc — build, drop, sidechain pump and
            groove — still plays. Try a recent desktop Chrome, Firefox or
            Safari for the visuals.
          </p>
        </div>
      )}

      {/* top-left: title + controls */}
      <div className="fixed left-0 top-0 z-30 max-w-md p-5 sm:p-7">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Surge
        </h1>
        <p className="mt-2 text-base leading-relaxed text-foreground">
          An EDM build-and-drop journey engine. Hold to charge the build; let
          go to trigger the drop. You ride and release the tension — the drop
          always lands, so there is nothing to fail.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          {!running && (
            <button
              onClick={handleStart}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {mode === "paused" ? "Resume" : "Start"}
            </button>
          )}
          {running && (
            <button
              onClick={handlePause}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Pause
            </button>
          )}
          <button
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Design notes
          </button>
        </div>

        {mode === "idle" && (
          <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            tap start — sound + tunnel begin together
          </p>
        )}
      </div>

      {/* top-right: live driver badge */}
      {running && (
        <div className="fixed right-0 top-0 z-30 flex items-center gap-2 p-5 sm:p-7">
          <span className="flex items-center gap-2 rounded-md border border-border bg-background/60 px-3 py-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
            {driver === "auto" ? "live · auto-pilot" : "live · you"}
          </span>
        </div>
      )}

      {/* bottom: HUD — phase, energy meter, ride-and-release affordance */}
      {running && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex flex-col items-center gap-3 p-5 sm:p-7">
          <div className="flex w-full max-w-md flex-col gap-2">
            <div className="flex items-center justify-between font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <span ref={phaseElRef}>intro</span>
              <span>energy</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
              <div
                ref={energyElRef}
                className="h-full bg-primary transition-[width] duration-100"
                style={{ width: "0%" }}
              />
            </div>
          </div>

          <button
            onPointerDown={onPadDown}
            onPointerUp={onPadUp}
            onPointerLeave={onPadUp}
            onPointerCancel={onPadUp}
            className="min-h-[44px] select-none rounded-md border border-border bg-background/60 px-6 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:bg-primary active:text-primary-foreground"
          >
            HOLD to charge · RELEASE to drop
          </button>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            spacebar is the real control
          </p>
        </div>
      )}

      {/* design notes modal */}
      {showNotes && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Surge asks what a Resonance journey engine would feel like if
                it followed an EDM build-and-drop arc instead of the
                visionary six-phase one. The form is{" "}
                <span className="text-foreground">
                  intro → build → peak → drop → groove → breakdown
                </span>
                , looping forever.
              </p>
              <p>
                Your role is <span className="text-foreground">ride and
                release</span>, not performance. During the build you hold the
                spacebar to charge: energy climbs, a white-noise riser sweeps
                a bandpass upward, the snare roll accelerates and the tunnel
                compresses inward. Release and the drop lands — a
                four-on-the-floor kick slams in and sidechain-pumps the sub
                and supersaw so the pads breathe around every kick. The drop
                always lands; you only choose when, and how charged.
              </p>
              <p>
                Under the hood: an arc state machine, a multi-voice sidechain
                synth graph (kick, sub, seven-oscillator supersaw, snare,
                riser) scheduled by a 25ms lookahead clock, and a raw WebGL2
                fragment shader. References: EDM song structure; sidechain
                &quot;pumping&quot; a la deadmau5 / Eric Prydz; and the
                jadujoel AudioWorklet sidechain-compressor as the canonical
                technique.
              </p>
              <p>
                With no input, an auto-pilot rides the same engine so the
                piece demos itself; your first spacebar hands you the wheel.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["3456-surge"]} />
    </main>
  );
}
