"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { FRAG_SRC, VERT_SRC, MODE_CAP } from "./shaders";
import { computeModes, PLATE, type PlateMode } from "./modal";
import { createModalPlate, type ModalPlate } from "./audio";
import { README } from "./readme-text";

const MARGIN = 0.86; // must match the shader

interface GLRig {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  uniforms: {
    res: WebGLUniformLocation | null;
    time: WebGLUniformLocation | null;
    ar: WebGLUniformLocation | null;
    count: WebGLUniformLocation | null;
    modes: WebGLUniformLocation | null;
    strikePos: WebGLUniformLocation | null;
    strikeAge: WebGLUniformLocation | null;
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
  const gl = canvas.getContext("webgl2", { antialias: false });
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
      ar: gl.getUniformLocation(program, "u_ar"),
      count: gl.getUniformLocation(program, "u_count"),
      modes: gl.getUniformLocation(program, "u_modes"),
      strikePos: gl.getUniformLocation(program, "u_strikePos"),
      strikeAge: gl.getUniformLocation(program, "u_strikeAge"),
    },
  };
}

/** Map a pointer event to plate-local coordinates (0..1, y-up), matching the
 *  shader's centred-rectangle fit. Returns whether the point is on the plate. */
function pointToPlate(
  e: { clientX: number; clientY: number },
  rect: DOMRect,
  ar: number,
): { x: number; y: number; inside: boolean } {
  const availW = rect.width * MARGIN;
  const availH = rect.height * MARGIN;
  let pw: number, ph: number;
  if (availW / availH > ar) {
    ph = availH;
    pw = ph * ar;
  } else {
    pw = availW;
    ph = pw / ar;
  }
  const pminX = (rect.width - pw) / 2;
  const pminYtop = (rect.height - ph) / 2;
  const lx = (e.clientX - rect.left - pminX) / pw;
  const lyTop = (e.clientY - rect.top - pminYtop) / ph;
  return {
    x: lx,
    y: 1 - lyTop,
    inside: lx >= 0 && lx <= 1 && lyTop >= 0 && lyTop <= 1,
  };
}

export default function Page() {
  const [showNotes, setShowNotes] = useState(false);
  const [glFailed, setGlFailed] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rigRef = useRef<GLRig | null>(null);
  const acRef = useRef<AudioContext | null>(null);
  const plateRef = useRef<ModalPlate | null>(null);
  const rafRef = useRef<number>(0);
  const lastTickRef = useRef<number>(0);
  const pressedRef = useRef<boolean>(false);
  const readoutRef = useRef<HTMLSpanElement | null>(null);

  const modesRef = useRef<PlateMode[]>(computeModes());
  const packedRef = useRef<Float32Array>(
    new Float32Array(MODE_CAP * 4), // (m, n, A, 0) per mode
  );
  const strikePosRef = useRef<[number, number]>([0.5, 0.5]);
  const strikeTimeRef = useRef<number>(-10);
  const startRef = useRef<number>(0);

  const aspect = PLATE.a / PLATE.b;

  // seed the static (m,n) fields of the packed uniform once
  useEffect(() => {
    const modes = modesRef.current;
    const packed = packedRef.current;
    for (let k = 0; k < modes.length; k++) {
      packed[k * 4] = modes[k].m;
      packed[k * 4 + 1] = modes[k].n;
      packed[k * 4 + 2] = 0;
      packed[k * 4 + 3] = 0;
    }
  }, []);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const rig = rigRef.current;
    if (!canvas || !rig) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.floor(window.innerWidth * dpr);
    const h = Math.floor(window.innerHeight * dpr);
    canvas.width = w;
    canvas.height = h;
    rig.gl.viewport(0, 0, w, h);
  }, []);

  const renderLoop = useCallback(() => {
    const rig = rigRef.current;
    if (!rig) return;
    const now = performance.now();
    const dt = (now - lastTickRef.current) / 1000;
    lastTickRef.current = now;
    const time = (now - startRef.current) / 1000;

    const modes = modesRef.current;
    const packed = packedRef.current;
    const plate = plateRef.current;
    if (plate) {
      const energies = plate.tick(dt);
      for (let k = 0; k < modes.length; k++) packed[k * 4 + 2] = energies[k];

      // dominant-mode readout (no React re-render)
      const el = readoutRef.current;
      if (el) {
        let best = -1;
        let bestMag = 0.02;
        for (let k = 0; k < modes.length; k++) {
          const mag = Math.abs(energies[k]);
          if (mag > bestMag) {
            bestMag = mag;
            best = k;
          }
        }
        el.textContent =
          best >= 0
            ? `mode (${modes[best].m},${modes[best].n}) · ${Math.round(
                modes[best].freq,
              )} Hz`
            : "silent · strike to ring";
      }
    }

    const { gl, uniforms } = rig;
    gl.uniform2f(uniforms.res, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform1f(uniforms.time, time);
    gl.uniform1f(uniforms.ar, aspect);
    gl.uniform1i(uniforms.count, modes.length);
    gl.uniform4fv(uniforms.modes, packed);
    gl.uniform2f(uniforms.strikePos, strikePosRef.current[0], strikePosRef.current[1]);
    gl.uniform1f(uniforms.strikeAge, time - strikeTimeRef.current);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    rafRef.current = requestAnimationFrame(renderLoop);
  }, [aspect]);

  const ensureAudio = useCallback(async () => {
    if (plateRef.current) {
      await plateRef.current.resume();
      return;
    }
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ac = new AC();
    await ac.resume();
    acRef.current = ac;
    plateRef.current = createModalPlate(ac, modesRef.current);
  }, []);

  const onPointerDown = useCallback(
    async (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.setPointerCapture(e.pointerId);
      await ensureAudio();
      const rect = canvas.getBoundingClientRect();
      const p = pointToPlate(e, rect, aspect);
      if (!p.inside) return;
      pressedRef.current = true;
      strikePosRef.current = [p.x, p.y];
      strikeTimeRef.current = (performance.now() - startRef.current) / 1000;
      plateRef.current?.strike(p.x, p.y, 1);
    },
    [aspect, ensureAudio],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!pressedRef.current) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const p = pointToPlate(e, rect, aspect);
      if (p.inside) plateRef.current?.bow(p.x, p.y);
    },
    [aspect],
  );

  const endPress = useCallback(() => {
    pressedRef.current = false;
    plateRef.current?.releaseBow();
  }, []);

  // set up WebGL + the render loop on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rig = makeGLRig(canvas);
    if (!rig) {
      setGlFailed(true);
      return;
    }
    rigRef.current = rig;
    startRef.current = performance.now();
    lastTickRef.current = performance.now();
    resize();
    window.addEventListener("resize", resize);
    rafRef.current = requestAnimationFrame(renderLoop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [renderLoop, resize]);

  // teardown audio + GL context on unmount
  useEffect(() => {
    return () => {
      plateRef.current?.destroy();
      plateRef.current = null;
      const ac = acRef.current;
      if (ac && ac.state !== "closed") void ac.close();
      acRef.current = null;
      const rig = rigRef.current;
      if (rig) {
        rig.gl.deleteProgram(rig.program);
        rig.gl.getExtension("WEBGL_lose_context")?.loseContext();
      }
      rigRef.current = null;
    };
  }, []);

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {!glFailed && (
        <canvas
          ref={canvasRef}
          className="fixed inset-0 h-full w-full touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPress}
          onPointerCancel={endPress}
          onPointerLeave={endPress}
        />
      )}

      <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-5 sm:p-7">
        <header className="pointer-events-auto max-w-md">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            1922 · dream lab
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            Chladni Plate
          </h1>
          <p className="mt-2 text-base leading-relaxed text-muted-foreground">
            A struck-and-bowed metal plate, synthesized as a bank of damped
            inharmonic modes. Sand collects on the nodal lines while you hear
            its true modal voice.
          </p>

          {!glFailed && (
            <>
              <p className="mt-3 text-base font-medium text-foreground">
                Strike the plate.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Tap to strike · press and drag to bow. Where you hit changes
                both the figure and the tone.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => setShowNotes(true)}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  Read the design notes
                </button>
                <span
                  ref={readoutRef}
                  className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground"
                >
                  silent · strike to ring
                </span>
              </div>
            </>
          )}

          {glFailed && (
            <div className="mt-4 rounded-lg border border-border bg-muted p-4">
              <p className="text-base text-destructive">
                WebGL2 is unavailable in this browser.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                This prototype renders its Chladni figure with a WebGL2 shader
                and needs it to run. Try a current desktop browser with
                hardware acceleration enabled.
              </p>
            </div>
          )}
        </header>
      </div>

      {showNotes && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Design notes
              </h2>
              <button
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            <p className="mt-4 whitespace-pre-wrap text-base leading-relaxed text-muted-foreground">
              {README}
            </p>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1922-chladni-plate"]} />
    </main>
  );
}
