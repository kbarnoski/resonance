"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createSafeFlicker } from "../_shared/psych/safeFlicker";
import { FRAG_GLSL, UNIFORM_NAMES, VERT_GLSL } from "./shader";
import {
  HyperbolicAudio,
  freqForDegree,
  mulberry32,
  pitchNorm,
} from "./audio";

/**
 * 2114 · Hyperbolic Curvature — a playable curvature dial.
 *
 * ONE question: what if a DMT breakthrough weren't "more shapes" but a change
 * in the CURVATURE of space itself — and you could turn that dial? κ warps a
 * WebGL2 raymarched field from a calm Euclidean tiling (κ=0) toward a folding,
 * proliferating hyperbolic ({7,3}-style Poincaré) jewel-lattice (κ→1). Each key
 * both nudges the curvature/rotation AND strikes an FM voice on a just
 * pentatonic scale. state: DMT-breakthrough / hyperbolic-curvature · pole: intense.
 */

// Home row → 10 stacked just-pentatonic degrees. Keyboard is the play gesture.
const KEYS = ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";"] as const;
const KEY_LABELS = ["A", "S", "D", "F", "G", "H", "J", "K", "L", ";"] as const;

type Phase = "idle" | "running";

function runCompile(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader-alloc");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader-compile: " + log);
  }
  return sh;
}

interface GlCtx {
  gl: WebGL2RenderingContext;
  prog: WebGLProgram;
  uni: Record<string, WebGLUniformLocation | null>;
}

function buildGl(canvas: HTMLCanvasElement): GlCtx {
  const gl = canvas.getContext("webgl2", { antialias: false });
  if (!gl) throw new Error("no-webgl2");
  const vs = runCompile(gl, gl.VERTEX_SHADER, VERT_GLSL);
  const fs = runCompile(gl, gl.FRAGMENT_SHADER, FRAG_GLSL);
  const prog = gl.createProgram();
  if (!prog) throw new Error("program");
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error("link: " + gl.getProgramInfoLog(prog));
  }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const uni: Record<string, WebGLUniformLocation | null> = {};
  UNIFORM_NAMES.forEach((n) => {
    uni[n] = gl.getUniformLocation(prog, n);
  });
  return { gl, prog, uni };
}

export default function HyperbolicCurvaturePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HyperbolicAudio | null>(null);
  const flickerRef = useRef(
    createSafeFlicker({ maxHz: 3, defaultHz: 0.2, floor: 0.76 }),
  );

  // mutable render state (refs → no per-frame React churn / no stale closures)
  const kappaRef = useRef(0.12); // slider base curvature
  const energyRef = useRef(0);
  const rotRef = useRef(0);
  const pitchRef = useRef(0.5);
  const autoRef = useRef(false);

  // deterministic autopilot state — seeded PRNG + accumulated frame clock only
  const rngRef = useRef<() => number>(mulberry32(0x2114abc));
  const autoClockRef = useRef(0);
  const autoNextRef = useRef(0.4);
  const lastTsRef = useRef<number | null>(null);

  const heldRef = useRef<Set<string>>(new Set());

  const [phase, setPhase] = useState<Phase>("idle");
  const [glError, setGlError] = useState(false);
  const [autopilot, setAutopilot] = useState(false);
  const [midiOn, setMidiOn] = useState(false);
  const [kappaSlider, setKappaSlider] = useState(0.12);
  const [kappaLive, setKappaLive] = useState(0.12);
  const [pressed, setPressed] = useState<Set<string>>(new Set());
  const [showNotes, setShowNotes] = useState(false);

  /* ------------------------------ striking -------------------------------- */
  const strikeDegree = useCallback((degree: number, velocity: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.strike(freqForDegree(degree), velocity);
    // each key nudges curvature (via energy bloom) AND rotation
    energyRef.current = Math.min(1.4, energyRef.current + 0.32 * velocity);
    rotRef.current += 0.045 * (degree % 2 === 0 ? 1 : -1);
    pitchRef.current = pitchNorm(degree, KEYS.length);
  }, []);

  const strikeFreq = useCallback(
    (freq: number, velocity: number, norm: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.strike(freq, velocity);
      energyRef.current = Math.min(1.4, energyRef.current + 0.3 * velocity);
      rotRef.current += 0.04;
      pitchRef.current = norm;
    },
    [],
  );

  /* ------------------------------- start ---------------------------------- */
  const handleStart = useCallback(async () => {
    if (audioRef.current) {
      await audioRef.current.resume();
      setPhase("running");
      return;
    }
    try {
      const audio = new HyperbolicAudio();
      await audio.resume();
      audioRef.current = audio;
      flickerRef.current.enable(); // gentle 0.2Hz luminance breathing (safe)
      setPhase("running");
    } catch {
      // audio unavailable — visuals still run; leave phase idle-ish
      setPhase("running");
    }
  }, []);

  /* --------------------------- autopilot toggle --------------------------- */
  const toggleAutopilot = useCallback(() => {
    setAutopilot((prev) => {
      const next = !prev;
      autoRef.current = next;
      if (next) {
        // reseed deterministically each engage → reproducible demo
        rngRef.current = mulberry32(0x2114abc);
        autoClockRef.current = 0;
        autoNextRef.current = 0.4;
      }
      return next;
    });
  }, []);

  /* ------------------------------ MIDI setup ------------------------------ */
  const enableMidi = useCallback(() => {
    const nav = navigator as Navigator & {
      requestMIDIAccess?: () => Promise<MIDIAccess>;
    };
    if (typeof nav.requestMIDIAccess !== "function") return;
    nav
      .requestMIDIAccess()
      .then((access) => {
        setMidiOn(true);
        const attach = (input: MIDIInput) => {
          input.onmidimessage = (ev: MIDIMessageEvent) => {
            const data = ev.data;
            if (!data || data.length < 3) return;
            const status = data[0] & 0xf0;
            const note = data[1];
            const vel = data[2];
            if (status === 0x90 && vel > 0) {
              const freq = 440 * Math.pow(2, (note - 69) / 12);
              const norm = Math.max(0, Math.min(1, (note - 40) / 48));
              strikeFreq(freq, vel / 127, norm);
            }
          };
        };
        access.inputs.forEach(attach);
        access.onstatechange = () => access.inputs.forEach(attach);
      })
      .catch(() => {
        /* no MIDI — keyboard still fully works */
      });
  }, [strikeFreq]);

  /* --------------------------- keyboard handlers -------------------------- */
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const key = e.key.toLowerCase();
      const idx = KEYS.indexOf(key as (typeof KEYS)[number]);
      if (idx < 0) return;
      e.preventDefault();
      if (heldRef.current.has(key)) return;
      heldRef.current.add(key);
      setPressed(new Set(heldRef.current));
      strikeDegree(idx, 0.95);
    };
    const onUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (!heldRef.current.has(key)) return;
      heldRef.current.delete(key);
      setPressed(new Set(heldRef.current));
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [strikeDegree]);

  /* ------------------------- GL setup + render loop ----------------------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let ctx: GlCtx;
    try {
      ctx = buildGl(canvas);
    } catch {
      setGlError(true);
      return;
    }
    const { gl, uni } = ctx;

    let raf = 0;
    let readoutTick = 0;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.floor(window.innerWidth * dpr);
      const h = Math.floor(window.innerHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    const render = (ts: number) => {
      raf = requestAnimationFrame(render);
      const tSec = ts * 0.001;
      const dt =
        lastTsRef.current == null
          ? 0.016
          : Math.min(0.05, (ts - lastTsRef.current) * 0.001);
      lastTsRef.current = ts;

      // energy decays smoothly → strikes bloom then settle (build-up, not strobe)
      energyRef.current *= Math.pow(0.5, dt / 0.55);
      rotRef.current += dt * 0.02;

      // effective curvature
      let effKappa = kappaRef.current;
      if (autoRef.current) {
        autoClockRef.current += dt;
        // slow deterministic κ sweep — builds structure up and eases back
        const c = autoClockRef.current;
        const sweep =
          0.55 + 0.42 * Math.sin(c * 0.13) * Math.sin(c * 0.041 + 0.7);
        effKappa = Math.max(0.05, Math.min(0.98, sweep));
        // deterministic note scheduling via seeded PRNG
        if (autoClockRef.current >= autoNextRef.current) {
          const r = rngRef.current();
          const degree = Math.floor(r * KEYS.length);
          const vel = 0.6 + rngRef.current() * 0.35;
          strikeDegree(degree, vel);
          autoNextRef.current =
            autoClockRef.current + 0.22 + rngRef.current() * 0.5;
        }
      }

      const lum = flickerRef.current.value(tSec);

      gl.uniform2f(uni.uRes, canvas.width, canvas.height);
      gl.uniform1f(uni.uTime, tSec);
      gl.uniform1f(uni.uKappa, effKappa);
      gl.uniform1f(uni.uEnergy, energyRef.current);
      gl.uniform1f(uni.uRot, rotRef.current);
      gl.uniform1f(uni.uPitch, pitchRef.current);
      gl.uniform1f(uni.uLum, lum);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // throttle the React live readout (~8x/sec)
      readoutTick += dt;
      if (readoutTick > 0.12) {
        readoutTick = 0;
        setKappaLive(effKappa);
      }
    };
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [strikeDegree]);

  // keep slider value in the ref for the render loop
  useEffect(() => {
    kappaRef.current = kappaSlider;
  }, [kappaSlider]);

  // teardown audio on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  const started = phase === "running";

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* full-bleed art canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {glError && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              WebGL2 unavailable
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">
              This instrument needs WebGL2
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Your browser or device could not provide a WebGL2 context, so the
              raymarched curvature field can&apos;t render. Try a recent desktop
              browser with hardware acceleration enabled.
            </p>
          </div>
        </div>
      )}

      {/* chrome overlay */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-6">
        {/* header */}
        <header className="pointer-events-auto max-w-xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Dream 2114 · DMT-breakthrough
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            Hyperbolic Curvature
          </h1>
          <p className="mt-1 max-w-md text-base text-muted-foreground">
            Turn the dial on the curvature of space itself: κ bends a calm
            Euclidean tiling toward a proliferating hyperbolic jewel-lattice.
          </p>
        </header>

        {/* footer controls */}
        <div className="pointer-events-auto flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-4">
            {!started ? (
              <button
                onClick={handleStart}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Begin
              </button>
            ) : (
              <button
                onClick={toggleAutopilot}
                className={
                  autopilot
                    ? "min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                    : "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                }
              >
                {autopilot ? "Autopilot: on" : "Autopilot: off"}
              </button>
            )}

            {/* κ curvature control (chrome, not the play gesture) */}
            <div className="min-w-[220px]">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="kappa"
                  className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground"
                >
                  Curvature κ
                </label>
                <span className="font-mono text-xs text-primary">
                  {autopilot ? `auto ${kappaLive.toFixed(2)}` : kappaLive.toFixed(2)}
                </span>
              </div>
              <input
                id="kappa"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={kappaSlider}
                onChange={(e) => setKappaSlider(parseFloat(e.target.value))}
                disabled={autopilot}
                className="mt-2 w-full accent-primary disabled:opacity-40"
              />
            </div>

            {!midiOn && started && (
              <button
                onClick={enableMidi}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Connect MIDI
              </button>
            )}

            <button
              onClick={() => setShowNotes(true)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Read the design notes
            </button>
          </div>

          {/* play hint + key row */}
          <div className="flex flex-col gap-2">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {midiOn
                ? "MIDI connected — or play the home row"
                : "Play the home row — each key bends space and strikes a voice"}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {KEY_LABELS.map((label, i) => {
                const isDown = pressed.has(KEYS[i]);
                return (
                  <span
                    key={label}
                    className={
                      isDown
                        ? "flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground"
                        : "flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background/60 text-sm text-muted-foreground"
                    }
                  >
                    {label}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* notes modal */}
      {showNotes && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Design notes
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">
              Hyperbolic Curvature
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                The question: what if a DMT breakthrough weren&apos;t &ldquo;more
                shapes&rdquo; but a change in the curvature of space itself — and
                you could turn that dial?
              </p>
              <p>
                κ warps a WebGL2 raymarched folded distance field. At κ=0 the
                field is an open, near-Euclidean tiling; as κ rises the box and
                sphere folds flip toward a negative scale with a tighter
                inversion radius, so space crowds and folds inward toward a
                Poincaré-disk-like boundary — jeweled cells proliferate with more
                axes than reality allows. The scene builds structure up; it does
                not dissolve.
              </p>
              <p>
                Shading is thin-film iridescence plus an N-fold kaleidoscope
                whose symmetry count grows with κ. Voices are 2-operator FM
                (harmonic ratio) struck across a just major-pentatonic scale.
              </p>
              <p>
                Reference: Andrés Gómez Emilsson / QRI,{" "}
                <em>The Hyperbolic Geometry of DMT Experiences</em>, and the
                DMTLand atlas.
              </p>
              <p className="text-muted-foreground/80">
                Safety: luminance change is a gentle ≤3 Hz drift — no strobe.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <Link
        href="/dream"
        className="pointer-events-auto absolute right-6 top-6 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
      >
        ← index
      </Link>
    </main>
  );
}
