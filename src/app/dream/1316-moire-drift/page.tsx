"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FRAG_SRC, VERT_SRC } from "./shader";
import { MoireAudio } from "./audio";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";

// ════════════════════════════════════════════════════════════════════════════
// 1316 — Moiré Drift
//
// THE QUESTION: What if you could TUNE a psychedelic trance by hand — sliding
// and rotating one fine op-art grating against another until their interference
// beats out living Klüver form-constants (tunnels, spirals, honeycombs) AND you
// hear the SAME beat-frequency in the sound?
//
// Two/three high-frequency gratings are summed in a WebGL2 fragment shader in
// cortical (log r, θ) space. Near-aligned but slightly detuned, they beat out
// huge slow moiré structures — the Bressloff–Cowan form constants. Horizontal
// drag rotates the movable layer (Δθ), vertical drag detunes it (Δk); the
// detune sets a temporal beat that BOTH drifts the moiré and beats a detuned
// oscillator pair, so the seen and heard beat are one number. See README.md.
// ════════════════════════════════════════════════════════════════════════════

const ARC_SECONDS = 180; // onset -> come-up -> peak -> settle

// Compile + link a WebGL2 program. (Not a hook — not named use*.)
function makeProgram(gl: WebGL2RenderingContext): WebGLProgram | null {
  const compile = (type: number, src: string): WebGLShader | null => {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error("shader compile:", gl.getShaderInfoLog(sh));
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
    console.error("program link:", gl.getProgramInfoLog(prog));
    return null;
  }
  return prog;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

type UniformMap = Record<string, WebGLUniformLocation | null>;

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<MoireAudio | null>(null);
  const rafRef = useRef<number | null>(null);

  const [started, setStarted] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [beatHzHud, setBeatHzHud] = useState(0.3);

  // Live, mutated-per-frame state (no re-render).
  const stateRef = useRef({
    // target interaction params (set by pointer / idle)
    dtheta: 0,
    detune: 0.12,
    shiftX: 0,
    shiftY: 0,
    // smoothed values fed to the shader
    sDtheta: 0,
    sDetune: 0.12,
    sShiftX: 0,
    sShiftY: 0,
    energy: 0,
    entropy: 0,
    startedAt: 0,
    pointerActive: false,
    lastPx: 0,
    lastPy: 0,
    reduced: false,
  });

  const startedRef = useRef(false);

  const handleBegin = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    try {
      const engine = new MoireAudio();
      await engine.resume();
      audioRef.current = engine;
    } catch (e) {
      console.error("audio init failed:", e);
    }
    const st = stateRef.current;
    st.startedAt = performance.now();
    st.entropy = 0;
    setStarted(true);
  }, []);

  // Pointer -> interaction params.
  const applyPointer = useCallback((clientX: number, clientY: number) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const nx = clamp01((clientX - rect.left) / Math.max(1, rect.width));
    const ny = clamp01((clientY - rect.top) / Math.max(1, rect.height));
    const st = stateRef.current;
    // horizontal -> rotation offset (Δθ); vertical -> spatial detune (Δk)
    st.dtheta = (nx - 0.5) * 1.8;
    st.detune = ny; // top = aligned/slow, bottom = detuned/fast
    st.shiftX = (nx - 0.5) * 0.5;
    st.shiftY = (ny - 0.5) * 0.5;
    // drag speed -> energy (pushes the entropy arc forward)
    if (st.pointerActive) {
      const dx = clientX - st.lastPx;
      const dy = clientY - st.lastPy;
      const speed = Math.hypot(dx, dy);
      st.energy = clamp01(st.energy + speed * 0.006);
    }
    st.lastPx = clientX;
    st.lastPy = clientY;
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const st = stateRef.current;
      st.pointerActive = true;
      st.lastPx = e.clientX;
      st.lastPy = e.clientY;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      applyPointer(e.clientX, e.clientY);
    },
    [applyPointer],
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      applyPointer(e.clientX, e.clientY);
    },
    [applyPointer],
  );
  const onPointerUp = useCallback((e: React.PointerEvent) => {
    stateRef.current.pointerActive = false;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  }, []);

  // Capability check (SSR-safe) once mounted.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const test = document.createElement("canvas");
      const gl = test.getContext("webgl2");
      setSupported(!!gl);
    } catch {
      setSupported(false);
    }
    stateRef.current.reduced = prefersReducedMotion();
  }, []);

  // Render loop — always on (idle drift before Begin so the page is alive).
  useEffect(() => {
    if (supported !== true) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
    if (!gl) {
      setSupported(false);
      return;
    }
    const prog = makeProgram(gl);
    if (!prog) {
      setSupported(false);
      return;
    }
    gl.useProgram(prog);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const names = [
      "uRes",
      "uTime",
      "uDtheta",
      "uDetune",
      "uBeatHz",
      "uEntropy",
      "uEnergy",
      "uShift",
      "uReduced",
    ];
    const u: UniformMap = {};
    for (const n of names) u[n] = gl.getUniformLocation(prog, n);

    let disposed = false;
    let lastT = performance.now();
    let hudT = 0;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.floor(canvas.clientWidth * dpr);
      const h = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    const frame = (now: number) => {
      if (disposed) return;
      const dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000));
      lastT = now;
      resize();
      const st = stateRef.current;

      // ── idle drift before Begin: slow autonomous tour of the field ──
      if (!startedRef.current) {
        const t = now / 1000;
        st.dtheta = Math.sin(t * 0.11) * 0.8;
        st.detune = 0.12 + 0.1 * (0.5 + 0.5 * Math.sin(t * 0.07));
        st.shiftX = Math.sin(t * 0.05) * 0.12;
        st.shiftY = Math.cos(t * 0.043) * 0.12;
      }

      // ── entropy arc: base ramp + pointer-energy pushes ──
      if (startedRef.current) {
        const elapsed = (now - st.startedAt) / 1000;
        const base = clamp01(elapsed / ARC_SECONDS);
        st.entropy = clamp01(Math.max(st.entropy, base) + st.energy * dt * 0.03);
      }
      // energy decays when not dragging
      st.energy *= st.pointerActive ? 1.0 : Math.exp(-dt * 0.8);
      st.energy = clamp01(st.energy - (st.pointerActive ? 0 : dt * 0.02));

      // smooth interaction params toward targets
      const k = 1 - Math.exp(-dt * (st.pointerActive ? 9 : 2.2));
      st.sDtheta += (st.dtheta - st.sDtheta) * k;
      st.sDetune += (st.detune - st.sDetune) * k;
      st.sShiftX += (st.shiftX - st.sShiftX) * k;
      st.sShiftY += (st.shiftY - st.sShiftY) * k;

      // beat frequency = the single number seen AND heard
      const reducedFactor = st.reduced ? 0.45 : 1;
      const beatHz = (0.12 + st.sDetune * 5.4) * reducedFactor;

      // drive audio
      const audio = audioRef.current;
      if (audio) {
        audio.setBeatHz(beatHz);
        audio.setDrive(st.entropy);
        audio.setPulseHz(0.7 + st.entropy * 1.3);
        audio.tick(dt);
      }

      // uniforms
      gl.uniform2f(u.uRes, canvas.width, canvas.height);
      gl.uniform1f(u.uTime, now / 1000);
      gl.uniform1f(u.uDtheta, st.sDtheta);
      gl.uniform1f(u.uDetune, st.sDetune);
      gl.uniform1f(u.uBeatHz, beatHz);
      gl.uniform1f(u.uEntropy, st.entropy);
      gl.uniform1f(u.uEnergy, st.energy);
      gl.uniform2f(u.uShift, st.sShiftX, st.sShiftY);
      gl.uniform1f(u.uReduced, st.reduced ? 1 : 0);

      gl.drawArrays(gl.TRIANGLES, 0, 3);

      hudT += dt;
      if (hudT > 0.2) {
        hudT = 0;
        setBeatHzHud(beatHz);
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      disposed = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      gl.deleteProgram(prog);
      gl.deleteVertexArray(vao);
    };
  }, [supported]);

  // Teardown audio on unmount.
  useEffect(() => {
    return () => {
      audioRef.current?.stop();
      audioRef.current = null;
    };
  }, []);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-black text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      {supported === false && (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base text-violet-300">
            This piece needs WebGL2, which this browser does not seem to
            provide. Try a recent desktop Chrome, Firefox or Safari.
          </p>
        </div>
      )}

      {/* Title + Begin overlay */}
      {!started && supported !== false && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-6 p-8 text-center">
          <h1 className="font-serif text-2xl text-foreground sm:text-4xl">
            Moiré Drift
          </h1>
          <p className="max-w-xl text-base text-muted-foreground">
            Two fine op-art gratings, nearly aligned. Slide and rotate one
            against the other until their interference beats out living tunnels,
            spirals and honeycombs — and hear the same beat-frequency in the
            sound.
          </p>
          <button
            type="button"
            onClick={handleBegin}
            className="pointer-events-auto min-h-[44px] rounded-full border border-border bg-muted px-4 py-2.5 text-base text-foreground backdrop-blur transition hover:bg-accent"
          >
            Begin
          </button>
          <p className="max-w-md text-base text-muted-foreground">
            Drag anywhere: left–right rotates the top layer, up–down detunes it.
            Drag faster to push the trance forward.
          </p>
        </div>
      )}

      {/* Live HUD once playing */}
      {started && (
        <div className="pointer-events-none absolute left-4 top-4 select-none text-base text-muted-foreground">
          <div>
            beat{" "}
            <span className="text-foreground">{beatHzHud.toFixed(2)} Hz</span>
            <span className="text-muted-foreground"> — seen &amp; heard</span>
          </div>
          <div className="text-muted-foreground">
            drag: ←→ rotate · ↕ detune · faster = deeper
          </div>
        </div>
      )}

      {/* Design-notes toggle */}
      <button
        type="button"
        onClick={() => setShowNotes((v) => !v)}
        className="pointer-events-auto absolute bottom-4 right-4 min-h-[44px] rounded-full border border-border bg-black/40 px-4 py-2.5 text-base text-muted-foreground backdrop-blur transition hover:text-foreground"
      >
        {showNotes ? "Close" : "Read the design notes"}
      </button>

      {showNotes && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6 backdrop-blur">
          <div className="max-w-lg space-y-4 text-base text-muted-foreground">
            <h2 className="font-serif text-xl text-foreground">
              What you are playing
            </h2>
            <p>
              Two (really three) high-frequency gratings are summed in a WebGL2
              shader in cortical{" "}
              <span className="text-foreground">(log r, θ)</span> space. Overlaid
              gratings add, and two nearly-equal frequencies beat at their
              difference — that slow emergent envelope is a Klüver form constant:
              concentric rings become tunnels, radial rays become spokes,
              diagonals become spirals.
            </p>
            <p>
              The detune you set with vertical drag drives a single beat
              frequency that BOTH drifts the visual moiré and beats a detuned
              oscillator pair in the audio — so the pattern you see pulsing and
              the roughness you hear are the same number.
            </p>
            <p className="text-muted-foreground">
              Lineage: Bridget Riley&apos;s op-art (kinetic interference on the
              retina) and the Bressloff–Cowan cortical model of Klüver&apos;s
              form constants. Full notes in the folder README. No strobe; all
              luminance change is smooth drift.
            </p>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="pointer-events-auto min-h-[44px] rounded-full border border-border bg-muted px-4 py-2.5 text-base text-foreground"
            >
              Back
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
