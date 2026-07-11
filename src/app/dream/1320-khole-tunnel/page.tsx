"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { FRAG_SRC, VERT_SRC } from "./shaders";
import { createDesync, type DesyncEngine } from "./desync";
import { makeKholeAudio, type KholeAudio } from "./audio";

/* Base rate of the ~3 Hz dissociation pulse. SAFETY: never above 3 Hz for a
 * full-field luminance change. Reduced-motion → halved. */
const PULSE_HZ = 2.7;
const PULSE_HZ_REDUCED = 1.35;

/* Time dilation while held: the whole scene clock eases toward this. The pulse
 * clock stays steady (see below) so there is always real rhythmic TIME. */
const HELD_TIME_SCALE = 0.35;

type Phase = "idle" | "running";

interface GLRig {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  buffer: WebGLBuffer | null;
  uniforms: {
    res: WebGLUniformLocation | null;
    time: WebGLUniformLocation | null;
    pulse: WebGLUniformLocation | null;
    light: WebGLUniformLocation | null;
    vignette: WebGLUniformLocation | null;
    clarity: WebGLUniformLocation | null;
    dissoc: WebGLUniformLocation | null;
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

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
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
    buffer,
    uniforms: {
      res: gl.getUniformLocation(program, "u_res"),
      time: gl.getUniformLocation(program, "u_time"),
      pulse: gl.getUniformLocation(program, "u_pulse"),
      light: gl.getUniformLocation(program, "u_light"),
      vignette: gl.getUniformLocation(program, "u_vignette"),
      clarity: gl.getUniformLocation(program, "u_clarity"),
      dissoc: gl.getUniformLocation(program, "u_dissoc"),
      drift: gl.getUniformLocation(program, "u_drift"),
    },
  };
}

export default function KholeTunnelPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [noGL, setNoGL] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rigRef = useRef<GLRig | null>(null);
  const audioRef = useRef<KholeAudio | null>(null);
  const acRef = useRef<AudioContext | null>(null);
  const desyncRef = useRef<DesyncEngine | null>(null);
  const rafRef = useRef<number>(0);
  const startedRef = useRef(false); // audio gate (Begin pressed)

  // clocks
  const lastTickRef = useRef(0);
  const journeyRef = useRef(0); // dilated scene time
  const pulseTimeRef = useRef(0); // STEADY pulse clock (undilated → real TIME)
  const pulseHzRef = useRef(PULSE_HZ);
  const reducedRef = useRef(false);

  // hold-to-dissociate eased state
  const heldRef = useRef(false);
  const dissocRef = useRef(0); // 0..1
  const timeScaleRef = useRef(1);
  const vignetteRef = useRef(0);
  const clarityRef = useRef(0);
  const arrivalRef = useRef(0); // seconds sustained at the light

  // disembodied look drift
  const driftRef = useRef<[number, number]>([0, 0]);
  const driftTargetRef = useRef<[number, number]>([0, 0]);

  const onPointerMove = useCallback((e: PointerEvent) => {
    const x = (e.clientX / window.innerWidth) * 2 - 1;
    const y = (e.clientY / window.innerHeight) * 2 - 1;
    driftTargetRef.current = [x, -y];
  }, []);

  const onPointerDown = useCallback(() => {
    heldRef.current = true;
  }, []);
  const onPointerUp = useCallback(() => {
    heldRef.current = false;
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
    const rig = rigRef.current;
    const now = performance.now();
    let dt = (now - lastTickRef.current) / 1000;
    lastTickRef.current = now;
    if (!(dt > 0) || dt > 0.1) dt = 0.016; // guard first frame / tab switches

    const held = heldRef.current;

    // ── ease the hold-to-dissociate state (weightless) ──
    // Rise slowly, fall a touch faster — being drawn in, then falling back.
    const riseK = 1 - Math.exp(-dt / 3.2);
    const fallK = 1 - Math.exp(-dt / 2.0);
    const k = held ? riseK : fallK;
    dissocRef.current += ((held ? 1 : 0) - dissocRef.current) * k;
    vignetteRef.current += ((held ? 1 : 0) - vignetteRef.current) * k;
    timeScaleRef.current +=
      ((held ? HELD_TIME_SCALE : 1) - timeScaleRef.current) *
      (1 - Math.exp(-dt / 1.6));

    const dissoc = dissocRef.current;

    // ── clocks ──
    // Scene time dilates; the PULSE clock stays steady so ~3 Hz TIME persists.
    journeyRef.current += dt * timeScaleRef.current;
    pulseTimeRef.current += dt;

    const pulseHz = pulseHzRef.current;
    const s = 0.5 + 0.5 * Math.sin(6.28318530718 * pulseHz * pulseTimeRef.current);
    // Shape into a clearer breath; contrast kept shallow downstream (safety).
    const contrast = reducedRef.current ? 0.6 : 1.0;
    const pulseDrive = Math.pow(s, 1.6) * contrast;

    // ── DESYNC: push the SEEN drive, read the (lagged) HEARD drive ──
    const desync = desyncRef.current;
    let laggedPulse = pulseDrive;
    if (desync) {
      desync.setDissociation(dissoc);
      desync.push(pulseDrive, dt);
      laggedPulse = desync.readLagged();
    }

    // ── gamma clarity-swell on sustained arrival at the light ──
    // Held + deep → accumulate arrival; clarity eases toward a soft 1-exp
    // ceiling (≤180 ms swell), never a strobe. Decays on release.
    if (held && dissoc > 0.8) {
      arrivalRef.current = Math.min(2.5, arrivalRef.current + dt);
    } else {
      arrivalRef.current = Math.max(0, arrivalRef.current - dt * 1.5);
    }
    const clarityTarget = Math.min(1, arrivalRef.current * 0.9) *
      (1 - Math.exp(-arrivalRef.current * 4.0));
    // ~180 ms smooth swell time-constant.
    clarityRef.current += (clarityTarget - clarityRef.current) * (1 - Math.exp(-dt / 0.18));

    // ease drift toward pointer target
    const d = driftRef.current;
    const dtgt = driftTargetRef.current;
    d[0] += (dtgt[0] - d[0]) * 0.03;
    d[1] += (dtgt[1] - d[1]) * 0.03;

    if (rig) {
      const { gl, uniforms } = rig;
      gl.uniform2f(uniforms.res, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform1f(uniforms.time, journeyRef.current);
      gl.uniform1f(uniforms.pulse, pulseDrive); // the SEEN pulse
      gl.uniform1f(uniforms.light, dissoc);
      gl.uniform1f(uniforms.vignette, vignetteRef.current);
      gl.uniform1f(uniforms.clarity, clarityRef.current);
      gl.uniform1f(uniforms.dissoc, dissoc);
      gl.uniform2f(uniforms.drift, d[0], d[1]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // audio hears the LAGGED pulse → the beat comes loose from the flash
    audioRef.current?.update(laggedPulse, dissoc, dt);

    rafRef.current = requestAnimationFrame(renderLoop);
  }, []);

  const handleBegin = useCallback(async () => {
    if (startedRef.current) return;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ac = new AC();
    await ac.resume();
    acRef.current = ac;
    audioRef.current = makeKholeAudio(ac);
    startedRef.current = true;
    setPhase("running");
  }, []);

  // ── boot the living void immediately (idle auto-drift before Begin) ──
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    pulseHzRef.current = reducedRef.current ? PULSE_HZ_REDUCED : PULSE_HZ;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rig = makeGLRig(canvas);
    if (!rig) {
      setNoGL(true);
      return;
    }
    rigRef.current = rig;
    desyncRef.current = createDesync();
    resize();

    lastTickRef.current = performance.now();
    rafRef.current = requestAnimationFrame(renderLoop);

    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);

      audioRef.current?.stop();
      audioRef.current = null;
      const ac = acRef.current;
      if (ac && ac.state !== "closed") {
        window.setTimeout(() => {
          if (ac.state !== "closed") void ac.close();
        }, 1000);
      }
      acRef.current = null;

      const rig2 = rigRef.current;
      if (rig2) {
        rig2.gl.deleteProgram(rig2.program);
        if (rig2.buffer) rig2.gl.deleteBuffer(rig2.buffer);
        const ext = rig2.gl.getExtension("WEBGL_lose_context");
        ext?.loseContext();
      }
      rigRef.current = null;
    };
  }, [renderLoop, resize, onPointerMove, onPointerDown, onPointerUp]);

  return (
    <main className="relative min-h-screen touch-none overflow-hidden bg-black text-foreground">
      <canvas ref={canvasRef} className="fixed inset-0 h-full w-full touch-none" />

      {noGL && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base leading-relaxed text-violet-300">
            This piece needs WebGL2, which is not available in your browser. The
            dissociative void cannot be raymarched here — try a recent desktop
            Chrome, Firefox, or Safari.
          </p>
        </div>
      )}

      {/* hero / controls */}
      <div className="fixed left-0 top-0 z-30 max-w-md p-5 sm:p-7">
        <h1 className="font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
          K-Hole Tunnel
        </h1>
        <p className="mt-3 text-base leading-relaxed text-foreground">
          A drug-free drift, disembodied, toward a distant being of light — where
          the beat you hear comes loose from the flash you see, and the world
          un-binds the deeper you go.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          {phase === "idle" ? (
            <button
              onClick={handleBegin}
              className="min-h-[44px] rounded-full bg-muted px-6 py-2.5 text-base font-medium text-black transition hover:bg-card"
            >
              Begin
            </button>
          ) : (
            <span className="rounded-full bg-violet-500/20 px-4 py-2.5 text-base font-medium text-violet-300">
              drifting
            </span>
          )}
        </div>

        <p className="mt-3 font-mono text-sm text-muted-foreground">
          {phase === "idle"
            ? "the void is alive · press Begin for sound"
            : "hold anywhere to be drawn toward the light · move to steer · release to fall back"}
        </p>
      </div>

      {/* design notes affordance */}
      <button
        onClick={() => setShowNotes((v) => !v)}
        className="fixed bottom-3 right-3 z-40 min-h-[44px] rounded-full border border-border bg-black/70 px-4 py-2.5 text-sm font-medium text-muted-foreground backdrop-blur transition hover:text-foreground"
      >
        {showNotes ? "close notes" : "design notes"}
      </button>

      {showNotes && (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/80 p-5 backdrop-blur-md sm:p-10">
          <div className="max-w-2xl py-6 text-foreground">
            <h2 className="font-serif text-2xl text-foreground sm:text-3xl">
              K-Hole Tunnel — design notes
            </h2>
            <p className="mt-4 text-base leading-relaxed text-foreground">
              <span className="text-violet-300">The one question:</span> what if a
              drug-free screen could evoke the ketamine k-hole / near-death
              tunnel-to-light — and make you feel the dissociative{" "}
              <em>unbinding of the senses</em>, where the sound you hear comes
              loose from the light you see?
            </p>

            <h3 className="mt-6 text-xl text-foreground">The desync engine</h3>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">
              A steady ~3 Hz pulse drives a shallow luminance breath in the void.
              Each frame that drive is pushed into a ring buffer; the audio does
              not read it directly — it reads the value from{" "}
              <code className="text-violet-300">lagSeconds</code> ago. The lag is a
              slow sine (~0.05 Hz) wandering between 0.3 s and 1.2 s, so the throb
              you hear trails the breath you see by a drifting offset. Holding
              toward the light raises a <code className="text-violet-300">dissociation</code>{" "}
              amount that widens the lag range and speeds its drift — the world
              un-binds more the deeper you go.
            </p>

            <h3 className="mt-6 text-xl text-foreground">Real ~3 Hz TIME</h3>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">
              The pulse rides its own steady clock, undilated. When you hold, the
              scene clock dilates toward 0.35× (time distension), yet the rhythmic
              pulse keeps ticking — the piece always has a beat. This mirrors the
              retrosplenial ~3 Hz rhythm implicated in dissociation.
            </p>

            <h3 className="mt-6 text-xl text-foreground">Phenomenology</h3>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">
              Disembodied forward drift, a hypoxic vignette constricting toward a
              warm being of light, and a smooth gamma clarity-swell on arrival —
              the reported shape of the k-hole and the near-death tunnel. Nothing
              strobes: full-field luminance change stays ≤ 3 Hz and continuous.
            </p>

            <h3 className="mt-6 text-xl text-foreground">References</h3>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">
              <span className="text-foreground">James Turrell</span> — Ganzfeld
              works, light as a physical object you inhabit rather than look at.
              <br />
              <span className="text-foreground">Bera et al. 2026</span> — &ldquo;Cortical
              Mechanisms Contributing to Ketamine-Induced Dissociation&rdquo;:
              dissociation as the uncoupling of sensory input from awareness,
              carried on a retrosplenial ~3 Hz rhythm. This desync engine is a
              literal enactment of that uncoupling.
            </p>

            <button
              onClick={() => setShowNotes(false)}
              className="mt-7 min-h-[44px] rounded-full border border-border bg-muted px-6 py-2.5 text-base font-medium text-foreground transition hover:bg-accent"
            >
              close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1320-khole-tunnel"]} />
    </main>
  );
}
