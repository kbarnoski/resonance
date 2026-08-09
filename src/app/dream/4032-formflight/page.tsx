"use client";

// ════════════════════════════════════════════════════════════════════════════
// 4032 — Formflight
//
// THE QUESTION: "What if you took no drug and watched no strobe — and the MUSIC
// itself walked your visual cortex through Klüver's four form constants
// (tunnels · radial spokes · spirals · honeycomb lattice)?"
//
// A full-screen WebGL2 fragment shader runs the shared log-polar / form-constant
// engine. The audio's spectral CENTROID selects a point on the form-constant
// axis and we cross-blend the two neighbours; spectral FLUX melts the lattice
// (fBm domain-warp = symmetry-loosening); RMS drives saturation + the optional
// safe flicker's depth. A built-in evolving drone self-demos with zero devices;
// an optional mic augments the analysis. See README.md for references.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import { FRAG_SRC, VERT_SRC } from "./shader";
import { FormflightAudio, type AudioFeatures } from "./audio";
import { createSafeFlicker } from "../_shared/visionary/safeFlicker";
import { FORM_CONSTANTS, FORM_LABEL } from "../_shared/visionary/logpolar";

// Compile + link the WebGL2 program. (Not a hook — must not be named useX.)
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

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Label for a form-axis position in [0,3]: nearest constant + how it is blending.
function formReadout(axis: number): string {
  const clamped = Math.max(0, Math.min(3, axis));
  const idx = Math.round(clamped);
  const primary = FORM_LABEL[FORM_CONSTANTS[idx]];
  const frac = clamped - Math.floor(clamped);
  const nearEdge = frac < 0.22 || frac > 0.78;
  if (nearEdge || idx === 3) return primary;
  const nextIdx = Math.min(3, Math.floor(clamped) + 1);
  const a = FORM_LABEL[FORM_CONSTANTS[Math.floor(clamped)]];
  const b = FORM_LABEL[FORM_CONSTANTS[nextIdx]];
  return `${a} → ${b}`;
}

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<FormflightAudio | null>(null);
  const flickerRef = useRef(createSafeFlicker({ maxHz: 3, defaultHz: 1.5, floor: 0.55 }));
  const rafRef = useRef<number | null>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const progRef = useRef<WebGLProgram | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const startWallRef = useRef(0);
  const lastFrameRef = useRef(0);
  const lastHudRef = useRef(0);

  // smoothed uniform + phase state (mutated per frame, no re-render)
  const uRef = useRef({ form: 0.0, flux: 0, level: 0, phase: 0 });

  const [running, setRunning] = useState(false);
  const [webglOk, setWebglOk] = useState(true);
  const [showNotes, setShowNotes] = useState(false);
  const [flickerOn, setFlickerOn] = useState(false);
  const [flickerHz, setFlickerHz] = useState(flickerRef.current.rateHz);
  const [micOn, setMicOn] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [formLabel, setFormLabel] = useState(FORM_LABEL[FORM_CONSTANTS[0]]);
  const [feat, setFeat] = useState<AudioFeatures>({ centroid: 0, flux: 0, rms: 0 });

  // ── render loop ────────────────────────────────────────────────────────────
  const renderFrame = useCallback(() => {
    const gl = glRef.current;
    const prog = progRef.current;
    const canvas = canvasRef.current;
    if (!gl || !prog || !canvas) return;

    const now = performance.now();
    const dt = lastFrameRef.current ? (now - lastFrameRef.current) / 1000 : 0.016;
    lastFrameRef.current = now;
    const elapsed = (now - startWallRef.current) / 1000;

    // DPR-capped backing store
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);

    // audio -> targets (idle drift before Begin so the field still breathes)
    const audio = audioRef.current;
    let f: AudioFeatures = { centroid: 0, flux: 0, rms: 0 };
    if (audio) {
      audio.tick();
      f = audio.read();
    } else {
      f = {
        centroid: 0.5 + 0.42 * Math.sin(elapsed * 0.05),
        flux: 0.05 + 0.05 * (0.5 + 0.5 * Math.sin(elapsed * 0.11)),
        rms: 0.18 + 0.08 * Math.sin(elapsed * 0.3),
      };
    }

    const u = uRef.current;
    const k = 0.07; // smoothing (transitions never abrupt)
    // centroid (brightness) -> position on the form axis [0..3]
    u.form = lerp(u.form, f.centroid * 3.0, k * 0.6);
    // flux -> melt / symmetry-loosening
    u.flux = lerp(u.flux, f.flux, k);
    // RMS -> saturation / neural gain
    u.level = lerp(u.level, f.rms, k);
    // flux -> morph/motion speed (integrated phase)
    u.phase += dt * (0.55 + u.flux * 3.4 + u.level * 0.8);

    // SAFETY: luminance flicker only ever through SafeFlicker; RMS scales its
    // dip depth but can never breach the engine's floor.
    const base = flickerRef.current.value(elapsed);
    const flickerMul = 1 - (1 - base) * (0.35 + 0.65 * u.level);

    gl.useProgram(prog);
    const set1 = (name: string, v: number) =>
      gl.uniform1f(gl.getUniformLocation(prog, name), v);
    gl.uniform2f(gl.getUniformLocation(prog, "uRes"), canvas.width, canvas.height);
    set1("uTime", elapsed);
    set1("uForm", u.form);
    set1("uFlux", u.flux);
    set1("uLevel", u.level);
    set1("uFreq", 7.0 + u.level * 3.5);
    set1("uPhase", u.phase);
    set1("uFlicker", flickerMul);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // throttle React HUD updates (~7/s)
    if (elapsed - lastHudRef.current > 0.14) {
      lastHudRef.current = elapsed;
      setFormLabel(formReadout(u.form));
      setFeat(f);
    }

    rafRef.current = requestAnimationFrame(renderFrame);
  }, []);

  // ── WebGL2 init (once) ───────────────────────────────────────────────────────
  useEffect(() => {
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

    // single full-screen triangle
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    glRef.current = gl;
    progRef.current = prog;
    startWallRef.current = performance.now();
    lastFrameRef.current = 0;

    const onLost = (e: Event) => {
      e.preventDefault();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      setWebglOk(false);
    };
    canvas.addEventListener("webglcontextlost", onLost);

    const ro = new ResizeObserver(() => {
      /* backing store is resized inside renderFrame from clientWidth */
    });
    ro.observe(canvas);
    roRef.current = ro;

    rafRef.current = requestAnimationFrame(renderFrame);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      canvas.removeEventListener("webglcontextlost", onLost);
      roRef.current?.disconnect();
      roRef.current = null;
      const g = glRef.current;
      if (g) {
        g.deleteProgram(prog);
        g.deleteBuffer(buf);
        g.deleteVertexArray(vao);
        const lose = g.getExtension("WEBGL_lose_context");
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

  const onBegin = useCallback(async () => {
    setAudioError(null);
    if (audioRef.current) {
      setRunning(true);
      return;
    }
    try {
      const a = new FormflightAudio();
      await a.begin();
      audioRef.current = a;
      setRunning(true);
    } catch (err) {
      console.error(err);
      setAudioError("Audio is unavailable in this browser.");
    }
  }, []);

  const onToggleMic = useCallback(async () => {
    const a = audioRef.current;
    if (!a) return;
    setMicError(null);
    if (a.micActive) {
      a.disableMic();
      setMicOn(false);
      return;
    }
    try {
      await a.enableMic();
      setMicOn(true);
    } catch (err) {
      console.error(err);
      setMicOn(false);
      setMicError(
        "Microphone denied — the built-in drone keeps driving the visuals.",
      );
    }
  }, []);

  const onToggleFlicker = useCallback(() => {
    const fl = flickerRef.current;
    fl.toggle();
    setFlickerOn(fl.enabled);
    setFlickerHz(fl.rateHz);
  }, []);

  const onKillFlicker = useCallback(() => {
    flickerRef.current.kill();
    setFlickerOn(false);
  }, []);

  const monoLabel = "font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground";

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <main className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {!webglOk && (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base text-destructive">
            WebGL2 is unavailable (or its context was lost), so the form-constant
            engine cannot run. Try a recent desktop Chrome, Edge, or Firefox.
          </p>
        </div>
      )}

      {/* Pre-Begin intro */}
      {!running && webglOk && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="max-w-xl rounded-lg border border-border bg-background/70 p-6 backdrop-blur-sm">
            <p className={monoLabel}>Resonance · Dream Lab · 4032</p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
              Formflight
            </h1>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              No drug, no strobe — the music itself walks your visual cortex
              through Klüver&apos;s four form constants: tunnels, radial spokes,
              spirals, and the honeycomb lattice.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                onClick={onBegin}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Begin
              </button>
              <button
                onClick={() => setShowNotes(true)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Read the design notes
              </button>
            </div>
            {audioError && (
              <p className="mt-4 text-sm text-destructive">{audioError}</p>
            )}
          </div>
        </div>
      )}

      {/* Running HUD */}
      {running && webglOk && (
        <>
          {/* top-left: live form-constant readout + audio features */}
          <div className="pointer-events-none absolute left-4 top-4 rounded-lg border border-border bg-background/60 p-3 backdrop-blur-sm">
            <p className={monoLabel}>Form constant</p>
            <p className="mt-1 text-base text-foreground">{formLabel}</p>
            <div className="mt-3 grid grid-cols-3 gap-x-4 gap-y-1">
              {(
                [
                  ["centroid", feat.centroid],
                  ["flux", feat.flux],
                  ["rms", feat.rms],
                ] as const
              ).map(([name, v]) => (
                <div key={name}>
                  <p className={monoLabel}>{name}</p>
                  <div className="mt-1 h-1 w-16 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${Math.round(Math.min(1, v) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              centroid → axis · flux → melt · rms → gain
            </p>
          </div>

          {/* top-right: design notes link */}
          <div className="absolute right-4 top-4">
            <button
              onClick={() => setShowNotes(true)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Read the design notes
            </button>
          </div>

          {/* bottom: controls */}
          <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={onToggleMic}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {micOn ? "Mic on — using mic" : "Use mic"}
              </button>
              <button
                onClick={onToggleFlicker}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {flickerOn ? "Flicker on" : "Add safe flicker"}
              </button>
              {flickerOn && (
                <>
                  <span className={monoLabel}>
                    {flickerHz.toFixed(1)} Hz
                  </span>
                  <button
                    onClick={onKillFlicker}
                    className="min-h-[44px] rounded-md border border-destructive/60 bg-background/60 px-4 text-sm text-destructive transition-colors hover:bg-destructive/10"
                  >
                    Stop flicker
                  </button>
                </>
              )}
            </div>
            {micError && (
              <p className="text-sm text-destructive">{micError}</p>
            )}
          </div>
        </>
      )}

      {/* Design-notes modal */}
      {showNotes && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className={monoLabel}>Design notes</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">Formflight</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                The retina→V1 cortical map is approximately a complex logarithm
                (Bressloff–Cowan, on Klüver&apos;s form constants). So tunnels,
                spokes, spirals and honeycombs are{" "}
                <span className="text-foreground">one</span> periodic pattern seen
                through a log-polar warp. This shader builds plane waves and a hex
                lattice in cortical{" "}
                <span className="font-mono text-foreground">(log r, θ)</span> space
                and inverts the warp back to the screen.
              </p>
              <p>
                The audio&apos;s spectral{" "}
                <span className="text-foreground">centroid</span> (brightness)
                slides a point along the form axis — dark, sustained tone → tunnels;
                bright → honeycomb — cross-blending neighbours. Spectral{" "}
                <span className="text-foreground">flux</span> adds an fBm
                domain-warp so the lattice melts (symmetry-loosening; the REBUS
                &quot;entropy rises at peak&quot; idea). Loudness{" "}
                <span className="text-foreground">(RMS)</span> drives saturation and
                the depth of the optional flicker.
              </p>
              <p>
                Any luminance flicker is routed through the shared SafeFlicker
                (hard 8 Hz wall, 3 Hz max, never blacks out, honours
                prefers-reduced-motion) and is off by default. Lineage: Gysin &amp;
                Sommerville&apos;s <span className="italic">Dreamachine</span>{" "}
                (1959) and the 2026 bioRxiv stroboscopic-hallucination CV-map.
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
    </main>
  );
}
