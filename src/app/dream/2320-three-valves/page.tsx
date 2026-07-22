"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { FRAG_SRC, VERT_SRC } from "./shader";
import { ValveAudio } from "./audio";
import {
  autopilotAt,
  axisWord,
  clamp01,
  makeRng,
  octantName,
  type CGD,
} from "./valves";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";

// ════════════════════════════════════════════════════════════════════════════
// 2320 · Three Valves — the C×G×D reducing-valve cube.
//
// THE QUESTION: what if an altered state were not ONE dial from calm→peak, but a
// CUBE navigated along THREE genuinely independent axes, where the same three
// sliders in different combinations produce categorically DIFFERENT worlds —
// geometric hallucination vs. figurative imagery vs. real-and-out-there vs.
// imagined-and-in-here?  After the 2026 Frontiers "beyond the reducing valve"
// paper (see README): C = classifier constraint, G = generator prior, D =
// discriminator / reality-monitoring. THERE IS NO MASTER INTENSITY KNOB.
// ════════════════════════════════════════════════════════════════════════════

type Phase = "idle" | "running";

type AxisKey = "c" | "g" | "d";

const AXES: { key: AxisKey; label: string; name: string }[] = [
  { key: "c", label: "C", name: "classifier" },
  { key: "g", label: "G", name: "generator" },
  { key: "d", label: "D", name: "discriminator" },
];

// compile + link the WebGL2 program (not a hook → not named useX).
function makeProgram(gl: WebGL2RenderingContext): WebGLProgram | null {
  const compile = (type: number, src: string): WebGLShader | null => {
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
  };
  const vs = compile(gl.VERTEX_SHADER, VERT_SRC);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG_SRC);
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

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const progRef = useRef<WebGLProgram | null>(null);
  const rafRef = useRef<number | null>(null);
  const startWallRef = useRef<number>(0);
  const lastHudRef = useRef<number>(0);
  const uLocRef = useRef<Record<string, WebGLUniformLocation | null>>({});

  const cgdRef = useRef<CGD>({ c: 0.2, g: 0.2, d: 0.5 });
  const autopilotRef = useRef<boolean>(true);
  const draggingRef = useRef<AxisKey | null>(null);
  const audioRef = useRef<ValveAudio | null>(null);
  const rngRef = useRef<() => number>(makeRng(0x2320));
  const reducedRef = useRef<boolean>(false);
  const sentRef = useRef<CGD>({ c: -1, g: -1, d: -1 });

  const [phase, setPhase] = useState<Phase>("idle");
  const [webglOk, setWebglOk] = useState(true);
  const [showNotes, setShowNotes] = useState(false);
  const [autopilot, setAutopilot] = useState(true);
  const [disp, setDisp] = useState<CGD>({ c: 0.2, g: 0.2, d: 0.5 });

  // ── set a valve manually (disengages autopilot) ────────────────────────────
  const setValve = useCallback((axis: AxisKey, value: number) => {
    const v = clamp01(value);
    cgdRef.current = { ...cgdRef.current, [axis]: v };
    if (autopilotRef.current) {
      autopilotRef.current = false;
      setAutopilot(false);
    }
    setDisp({ ...cgdRef.current });
  }, []);

  const onRange = useCallback(
    (axis: AxisKey) => (e: ChangeEvent<HTMLInputElement>) => {
      setValve(axis, parseFloat(e.target.value));
    },
    [setValve],
  );

  // vertical fader drag (pointer → works on mouse + touch)
  const onFaderPointer = useCallback(
    (axis: AxisKey) => (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.type === "pointerdown") {
        draggingRef.current = axis;
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      if (draggingRef.current !== axis) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const val = 1 - (e.clientY - rect.top) / rect.height;
      setValve(axis, val);
    },
    [setValve],
  );

  const onFaderRelease = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      draggingRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* no-op */
      }
    },
    [],
  );

  const toggleAutopilot = useCallback(() => {
    setAutopilot((a) => {
      const next = !a;
      autopilotRef.current = next;
      return next;
    });
  }, []);

  // ── render loop ─────────────────────────────────────────────────────────────
  const renderFrame = useCallback(() => {
    const gl = glRef.current;
    const prog = progRef.current;
    const canvas = canvasRef.current;
    if (!gl || !prog || !canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);

    const elapsed = (performance.now() - startWallRef.current) / 1000;

    // autopilot drives the valves until the user grabs a handle.
    if (autopilotRef.current) {
      const target = autopilotAt(elapsed, rngRef.current, 1);
      const cur = cgdRef.current;
      // gentle follow so the seeded jitter never twitches.
      cgdRef.current = {
        c: cur.c + (target.c - cur.c) * 0.08,
        g: cur.g + (target.g - cur.g) * 0.08,
        d: cur.d + (target.d - cur.d) * 0.08,
      };
    }
    const { c, g, d } = cgdRef.current;

    const loc = uLocRef.current;
    gl.useProgram(prog);
    gl.uniform2f(loc.uRes ?? null, canvas.width, canvas.height);
    gl.uniform1f(loc.uTime ?? null, elapsed);
    gl.uniform1f(loc.uC ?? null, c);
    gl.uniform1f(loc.uG ?? null, g);
    gl.uniform1f(loc.uD ?? null, d);
    gl.uniform1f(loc.uReduced ?? null, reducedRef.current ? 1 : 0);
    gl.uniform1f(loc.uLevel ?? null, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // drive audio only when a valve actually moved (avoids event spam).
    const audio = audioRef.current;
    if (audio) {
      const s = sentRef.current;
      if (Math.abs(c - s.c) > 0.002) {
        audio.setC(c);
        s.c = c;
      }
      if (Math.abs(g - s.g) > 0.002) {
        audio.setG(g);
        s.g = g;
      }
      if (Math.abs(d - s.d) > 0.002) {
        audio.setD(d);
        s.d = d;
      }
    }

    // throttle HUD (~8/s). While the user drags, disp is already live.
    if (autopilotRef.current && elapsed - lastHudRef.current > 0.12) {
      lastHudRef.current = elapsed;
      setDisp({ c, g, d });
    }

    rafRef.current = requestAnimationFrame(renderFrame);
  }, []);

  // ── WebGL2 init ─────────────────────────────────────────────────────────────
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    const canvas = canvasRef.current;
    if (!canvas) return;

    let gl: WebGL2RenderingContext | null = null;
    try {
      gl = canvas.getContext("webgl2", {
        antialias: true,
        powerPreference: "high-performance",
      });
    } catch {
      gl = null;
    }
    if (!gl) {
      setWebglOk(false);
      return;
    }
    const prog = makeProgram(gl);
    if (!prog) {
      setWebglOk(false);
      return;
    }

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
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

    for (const n of ["uRes", "uTime", "uC", "uG", "uD", "uReduced", "uLevel"]) {
      uLocRef.current[n] = gl.getUniformLocation(prog, n);
    }

    glRef.current = gl;
    progRef.current = prog;
    startWallRef.current = performance.now();
    rafRef.current = requestAnimationFrame(renderFrame);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      const gg = glRef.current;
      if (gg) {
        gg.deleteProgram(prog);
        gg.deleteBuffer(buf);
        gg.deleteVertexArray(vao);
        const lose = gg.getExtension("WEBGL_lose_context");
        if (lose) lose.loseContext();
      }
      glRef.current = null;
      progRef.current = null;
    };
  }, [renderFrame]);

  // dispose audio on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  const onStart = useCallback(async () => {
    if (!audioRef.current) {
      try {
        audioRef.current = new ValveAudio();
      } catch (err) {
        console.error(err);
      }
    }
    try {
      await audioRef.current?.start();
    } catch (err) {
      console.error(err);
    }
    setPhase("running");
  }, []);

  const octant = octantName(disp);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* WebGL unavailable → destructive notice + reduced fallback */}
      {!webglOk && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#14161a] p-8">
          <div className="max-w-md text-center">
            <p className="text-base font-medium text-destructive">
              WebGL2 is unavailable in this browser.
            </p>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              The C×G×D field shader cannot run. The instrument still describes a
              cube of three independent valves — classifier (geometry), generator
              (figuration) and discriminator (realness) — navigated together, with
              no master intensity dial. Try a recent desktop Chrome, Edge or
              Firefox to see it.
            </p>
          </div>
        </div>
      )}

      {/* top-left: octant readout */}
      {webglOk && (
        <div className="pointer-events-none absolute left-0 top-0 p-4 sm:p-6">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Resonance · Dream Lab · 2320
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Three Valves
          </h1>
          <p className="mt-1 text-base text-muted-foreground">
            octant:{" "}
            <span className="text-primary">{octant}</span>
          </p>
        </div>
      )}

      {/* top-right: notes toggle */}
      {webglOk && (
        <div className="absolute right-0 top-0 p-4 sm:p-6">
          <button
            onClick={() => setShowNotes((s) => !s)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {showNotes ? "Hide design notes" : "Read the design notes"}
          </button>
        </div>
      )}

      {/* design notes panel */}
      {webglOk && showNotes && (
        <div className="absolute right-4 top-20 z-10 max-w-sm rounded-lg border border-border bg-background/85 p-5 backdrop-blur-sm">
          <p className="text-sm leading-relaxed text-muted-foreground">
            After the 2026 Frontiers paper{" "}
            <span className="text-foreground">
              &ldquo;Beyond the reducing valve&rdquo;
            </span>
            , Huxley&rsquo;s single &ldquo;reducing valve&rdquo; is split into
            three independent computational functions. Relaxing{" "}
            <span className="text-foreground">C</span> (the classifier) lets
            hidden causes surface as Klüver form constants — tunnels, spirals,
            spokes, honeycomb. <span className="text-foreground">G</span> (the
            generator prior) turns flat abstract grain into figurative, almost-
            recognisable forms. <span className="text-foreground">D</span> (the
            discriminator / reality-monitoring threshold) decides whether the same
            imagery feels floating-and-unreal or bound-and-present. They are
            orthogonal: high-C + low-G + low-D is floating geometry that feels
            unreal; add D and it snaps solid; add G instead and figures bloom
            without any lattice. There is deliberately no master intensity knob —
            drag any two valves against each other and the world changes category,
            not just degree. See README.md for the full references.
          </p>
        </div>
      )}

      {/* bottom control bar */}
      {webglOk && (
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-4 sm:p-6">
          {/* left: start / autopilot */}
          <div className="flex flex-col gap-2">
            {phase === "idle" ? (
              <button
                onClick={onStart}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Start sound
              </button>
            ) : (
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                sound live
              </p>
            )}
            <button
              onClick={toggleAutopilot}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {autopilot ? "Autopilot: on" : "Autopilot: off"}
            </button>
            <p className="max-w-[15rem] text-sm text-muted-foreground">
              Drag any valve to take the wheel. Three independent axes — no master
              dial.
            </p>
          </div>

          {/* right: the three valves (live CGD readout + draggable faders) */}
          <div className="rounded-lg border border-border bg-background/70 p-4 backdrop-blur-sm">
            <p className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              C · G · D
            </p>
            <div className="flex items-end gap-5">
              {AXES.map((ax) => {
                const v = disp[ax.key];
                return (
                  <div key={ax.key} className="flex flex-col items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {(v * 100).toFixed(0)}
                    </span>
                    {/* draggable vertical fader = live bar readout */}
                    <div
                      role="slider"
                      aria-label={`${ax.label} ${ax.name}`}
                      aria-valuenow={Math.round(v * 100)}
                      tabIndex={0}
                      onPointerDown={onFaderPointer(ax.key)}
                      onPointerMove={onFaderPointer(ax.key)}
                      onPointerUp={onFaderRelease}
                      onPointerCancel={onFaderRelease}
                      className="relative h-24 w-4 cursor-ns-resize touch-none overflow-hidden rounded-md bg-muted"
                    >
                      <div
                        className="absolute inset-x-0 bottom-0 bg-primary"
                        style={{ height: `${v * 100}%` }}
                      />
                    </div>
                    <span className="font-mono text-sm font-semibold text-foreground">
                      {ax.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {axisWord(ax.key, v)}
                    </span>
                    {/* mobile / a11y fallback slider */}
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.001}
                      value={v}
                      onChange={onRange(ax.key)}
                      aria-label={`${ax.label} ${ax.name} fallback`}
                      className="w-16 accent-primary"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
