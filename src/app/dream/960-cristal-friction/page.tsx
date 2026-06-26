"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WORKLET_SOURCE } from "./worklet-source";

// ── Instrument tuning ──────────────────────────────────────────────
// A just-intoned pentatonic drone built on a low A. Always consonant,
// so the friction TIMBRE is the focus, not a harmony engine. Each rod
// gets a fundamental plus mildly inharmonic partials (glass/metal rods
// stretch their overtones slightly), and a Q that decides how long it
// rings (glassy rims ring much longer than struck metal).
const BASE = 146.83; // ~D3, a warm centre
const RATIOS = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2]; // just pentatonic + octave

type Partial = { freq: number; gain: number; qScale: number };
type Rod = { freq: number; partials: Partial[]; q: number; hue: number };

function makeRods(): Rod[] {
  return RATIOS.map((ratio, i) => {
    const f = BASE * ratio;
    // inharmonic partials: glass/metal rods are slightly stretched
    const partials: Partial[] = [
      { freq: f, gain: 1.0, qScale: 1.0 },
      { freq: f * 2.01, gain: 0.5, qScale: 0.8 },
      { freq: f * 3.04, gain: 0.28, qScale: 0.6 },
      { freq: f * 4.09, gain: 0.16, qScale: 0.45 },
    ];
    // hue sweep: amber (low) → rose → teal (high) — warm-glass palette
    const hue = 36 + (i / (RATIOS.length - 1)) * 150;
    return { freq: f, partials, q: 70 + i * 8, hue };
  });
}

const RODS = makeRods();
const N = RODS.length;

// ── WebGL2 fragment shader: luminous resonating rods ───────────────
const VERT = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2  uRes;
uniform float uTime;
uniform float uAmp[${N}];   // live amplitude per rod
uniform float uHue[${N}];   // hue per rod (degrees)
uniform vec2  uPointer;     // 0..1, y flipped to gl space
uniform float uPointerOn;   // 1 while pointer active
uniform float uSpark;       // friction spark intensity at pointer

vec3 hsv(float h, float s, float v) {
  h /= 360.0;
  vec3 k = mod(vec3(5.0, 3.0, 1.0) + h * 6.0, 6.0);
  vec3 c = v - v * s * clamp(min(k, 4.0 - k), 0.0, 1.0);
  return c;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 col = vec3(0.0);

  // warm candle-lit vignette background
  float vig = smoothstep(1.25, 0.15, length(uv - 0.5));
  col += hsv(28.0, 0.55, 0.05) * vig;

  float n = float(${N});
  for (int i = 0; i < ${N}; i++) {
    float fi = float(i);
    float cx = (fi + 0.5) / n;             // rod centre x
    float amp = clamp(uAmp[i], 0.0, 1.0);
    float hue = uHue[i];

    // rod body: a soft vertical bar whose width breathes with amplitude
    float w = 0.012 + amp * 0.03;
    float dx = abs(uv.x - cx);
    float bar = smoothstep(w, 0.0, dx);

    // Chladni-like standing-wave shimmer along the rod, stronger w/ amp
    float modes = 6.0 + fi;
    float shimmer = 0.5 + 0.5 * sin(uv.y * modes * 6.28318 + uTime * (1.5 + amp * 6.0));
    shimmer = mix(1.0, shimmer, 0.35 + amp * 0.55);

    // vertical envelope so rods glow from a base "rim" and fade up
    float vEnv = smoothstep(0.0, 0.25, uv.y) * smoothstep(1.05, 0.55, uv.y);

    // bloom halo around the rod
    float halo = smoothstep(w * 9.0, 0.0, dx) * (0.08 + amp * 0.5);

    float lum = (bar * (0.25 + amp * 1.6) * shimmer + halo) * vEnv;
    vec3 rodCol = hsv(hue, 0.65 - amp * 0.3, 1.0);
    col += rodCol * lum;
  }

  // pointer highlight + friction spark trail
  if (uPointerOn > 0.5) {
    vec2 pp = uPointer;
    float d = length((uv - pp) * vec2(uRes.x / uRes.y, 1.0));
    float glow = smoothstep(0.16, 0.0, d) * (0.15 + uSpark * 0.6);
    // sparkle grain
    float grain = fract(sin(dot(uv * uRes + uTime * 60.0, vec2(12.99, 78.23))) * 43758.5);
    float spark = smoothstep(0.05, 0.0, d) * step(0.93, grain) * uSpark;
    col += hsv(45.0, 0.4, 1.0) * (glow + spark * 2.0);
  }

  // gentle filmic tone-map so it never clips harshly
  col = col / (col + 0.7);
  outColor = vec4(col, 1.0);
}`;

type GLState = {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  uRes: WebGLUniformLocation | null;
  uTime: WebGLUniformLocation | null;
  uAmp: WebGLUniformLocation | null;
  uHue: WebGLUniformLocation | null;
  uPointer: WebGLUniformLocation | null;
  uPointerOn: WebGLUniformLocation | null;
  uSpark: WebGLUniformLocation | null;
};

function makeGL(canvas: HTMLCanvasElement): GLState | null {
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false });
  if (!gl) return null;

  const compile = (type: number, src: string): WebGLShader | null => {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error("shader error", gl.getShaderInfoLog(sh));
      return null;
    }
    return sh;
  };

  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("link error", gl.getProgramInfoLog(program));
    return null;
  }

  // fullscreen triangle
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW
  );
  const loc = gl.getAttribLocation(program, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  return {
    gl,
    program,
    uRes: gl.getUniformLocation(program, "uRes"),
    uTime: gl.getUniformLocation(program, "uTime"),
    uAmp: gl.getUniformLocation(program, "uAmp"),
    uHue: gl.getUniformLocation(program, "uHue"),
    uPointer: gl.getUniformLocation(program, "uPointer"),
    uPointerOn: gl.getUniformLocation(program, "uPointerOn"),
    uSpark: gl.getUniformLocation(program, "uSpark"),
  };
}

// ── Canvas2D fallback drawing ──────────────────────────────────────
function drawCanvas2D(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  amps: Float32Array,
  time: number
) {
  ctx.fillStyle = "#0a0705";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < N; i++) {
    const cx = ((i + 0.5) / N) * w;
    const amp = Math.min(1, amps[i]);
    const hue = RODS[i].hue;
    const barW = 6 + amp * 26;
    const grad = ctx.createLinearGradient(cx, h, cx, h * 0.4);
    grad.addColorStop(0, `hsla(${hue}, 70%, 60%, ${0.2 + amp * 0.8})`);
    grad.addColorStop(1, `hsla(${hue}, 70%, 70%, 0)`);
    ctx.fillStyle = grad;
    const shimmer = 0.7 + 0.3 * Math.sin(time * (1 + amp * 5) + i);
    ctx.globalAlpha = shimmer;
    ctx.fillRect(cx - barW / 2, h * 0.4, barW, h * 0.6);
    ctx.globalAlpha = 1;
  }
}

type BowState = { vel: number; force: number };

export default function CristalFrictionPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [started, setStarted] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [noWorklet, setNoWorklet] = useState(false);
  const [noGL, setNoGL] = useState(false);

  // audio + visual refs (kept off React state to avoid re-renders)
  const ctxRef = useRef<AudioContext | null>(null);
  const nodeRef = useRef<AudioWorkletNode | null>(null);
  const fallbackRef = useRef<{
    oscs: { osc: OscillatorNode; gain: GainNode; filt: BiquadFilterNode }[];
  } | null>(null);
  const ampsRef = useRef<Float32Array>(new Float32Array(N));
  const bowsRef = useRef<BowState[]>(
    Array.from({ length: N }, () => ({ vel: 0, force: 0 }))
  );
  const pointerRef = useRef({ x: 0.5, y: 0.5, on: false, spark: 0 });
  const lastPointRef = useRef({ x: 0.5, y: 0.5, t: 0 });
  const rafRef = useRef<number>(0);
  const autoRef = useRef<{ active: boolean; t0: number }>({
    active: false,
    t0: 0,
  });
  const userMovedRef = useRef(false);

  const pushBows = useCallback(() => {
    const node = nodeRef.current;
    if (node) {
      node.port.postMessage({ type: "bow", bows: bowsRef.current });
    }
    // also drive the oscillator fallback if present
    const fb = fallbackRef.current;
    const ctx = ctxRef.current;
    if (fb && ctx) {
      for (let i = 0; i < N; i++) {
        const b = bowsRef.current[i];
        // bow speed maps to brightness + a little drive; force → loudness
        const target = Math.min(0.18, b.vel * b.force * 0.5);
        fb.oscs[i].gain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
        fb.oscs[i].filt.frequency.setTargetAtTime(
          800 + b.vel * 4000,
          ctx.currentTime,
          0.08
        );
      }
    }
  }, []);

  // ── pointer bowing: velocity → bow speed, vertical position → force ─
  const handlePointer = useCallback(
    (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    const now = performance.now();
    const last = lastPointRef.current;
    const dt = Math.max(1, now - last.t);
    // pointer speed in screen-fractions per ms → bow speed
    const speed = Math.hypot(x - last.x, y - last.y) / dt;
    lastPointRef.current = { x, y, t: now };

    pointerRef.current.x = x;
    pointerRef.current.y = 1 - y; // flip to GL space
    pointerRef.current.on = true;
    pointerRef.current.spark = Math.min(1, speed * 220);

    if (!userMovedRef.current) {
      userMovedRef.current = true;
      autoRef.current.active = false; // user took over: stop auto-demo
    }

    // which rod is under the cursor → that rod gets bowed
    const idx = Math.min(N - 1, Math.max(0, Math.floor(x * N)));
    // bow speed: scale pointer velocity; cap so it stays musical
    const bowVel = Math.min(0.9, speed * 26);
    // bow force: pressing toward the bottom (high y) = heavier bow.
    // lighter at top → thin whistling; heavier low → fuller singing.
    const force = 0.25 + (1 - pointerRef.current.y) * 1.1;

    for (let i = 0; i < N; i++) {
      const b = bowsRef.current[i];
      if (i === idx) {
        b.vel = bowVel;
        b.force = force;
      } else {
        // neighbouring rods get a touch of sympathetic excitation
        const near = Math.abs(i - idx) === 1 ? 0.18 : 0;
        b.vel = bowVel * near;
        b.force = force * near;
      }
    }
      pushBows();
    },
    [pushBows]
  );

  // gently release the bow when the pointer leaves / lifts
  const releaseBow = useCallback(() => {
    pointerRef.current.on = false;
    for (let i = 0; i < N; i++) {
      bowsRef.current[i].vel = 0;
      bowsRef.current[i].force = 0;
    }
    pushBows();
  }, [pushBows]);

  // ── start audio (must be inside a user gesture) ────────────────────
  const start = useCallback(async () => {
    if (started) return;
    setStatus("Lighting the rods…");
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctx();
      ctxRef.current = ctx;
      await ctx.resume();

      // master chain: gain ≤ 0.25 → lowpass ≤ 8k → compressor → out
      const master = ctx.createGain();
      master.gain.value = 0.22;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 7200;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 4;
      comp.attack.value = 0.005;
      comp.release.value = 0.25;
      master.connect(lp).connect(comp).connect(ctx.destination);

      const hasWorklet =
        typeof ctx.audioWorklet !== "undefined" &&
        typeof AudioWorkletNode !== "undefined";

      if (hasWorklet) {
        const blob = new Blob([WORKLET_SOURCE], {
          type: "application/javascript",
        });
        const url = URL.createObjectURL(blob);
        try {
          await ctx.audioWorklet.addModule(url);
          const node = new AudioWorkletNode(ctx, "friction-processor", {
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [2],
            processorOptions: {
              rods: RODS.map((r) => ({ partials: r.partials, q: r.q })),
            },
          });
          node.port.onmessage = (e) => {
            if (e.data?.type === "amps") {
              ampsRef.current = e.data.amps as Float32Array;
            }
          };
          node.connect(master);
          nodeRef.current = node;
        } finally {
          URL.revokeObjectURL(url);
        }
      } else {
        // ── oscillator fallback so it still sings ────────────────────
        setNoWorklet(true);
        const oscs = RODS.map((r) => {
          const osc = ctx.createOscillator();
          osc.type = "sawtooth";
          osc.frequency.value = r.freq;
          const filt = ctx.createBiquadFilter();
          filt.type = "lowpass";
          filt.frequency.value = 1200;
          filt.Q.value = 6;
          const gain = ctx.createGain();
          gain.gain.value = 0;
          osc.connect(filt).connect(gain).connect(master);
          osc.start();
          return { osc, gain, filt };
        });
        fallbackRef.current = { oscs };
      }

      setStarted(true);
      setStatus("");

      // ── auto-demo: a gentle 2s bow sweep across two rods ───────────
      autoRef.current = { active: true, t0: performance.now() };
    } catch (err) {
      console.error(err);
      setStatus("Audio could not start in this browser.");
    }
  }, [started]);

  // ── render + auto-demo loop ────────────────────────────────────────
  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let glState: GLState | null = null;
    let ctx2d: CanvasRenderingContext2D | null = null;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
      if (glState) glState.gl.viewport(0, 0, canvas.width, canvas.height);
    };

    glState = makeGL(canvas);
    if (!glState) {
      setNoGL(true);
      ctx2d = canvas.getContext("2d");
    }
    resize();
    window.addEventListener("resize", resize);

    const hueArr = new Float32Array(RODS.map((r) => r.hue));
    const start0 = performance.now();

    const frame = () => {
      const t = (performance.now() - start0) / 1000;

      // auto-demo bow sweep
      const auto = autoRef.current;
      if (auto.active) {
        const dt = (performance.now() - auto.t0) / 1000;
        if (dt > 2.4 || userMovedRef.current) {
          auto.active = false;
          releaseBow();
        } else {
          // sweep a gentle slow bow across rods 1→3 (steady = singing)
          const sweep = 0.15 + (dt / 2.4) * 0.55; // x position
          const idx = Math.min(N - 1, Math.floor(sweep * N));
          for (let i = 0; i < N; i++) {
            const b = bowsRef.current[i];
            if (i === idx || i === idx + 1) {
              b.vel = 0.16; // slow, steady → pure tone
              b.force = 0.95;
            } else {
              b.vel = 0;
              b.force = 0;
            }
          }
          pointerRef.current.x = sweep;
          pointerRef.current.y = 0.5;
          pointerRef.current.on = true;
          pointerRef.current.spark = 0.4;
          pushBows();
        }
      }

      // decay the visual spark
      pointerRef.current.spark *= 0.9;

      const amps = ampsRef.current;

      if (glState) {
        const { gl } = glState;
        gl.useProgram(glState.program);
        gl.uniform2f(glState.uRes, canvas.width, canvas.height);
        gl.uniform1f(glState.uTime, t);
        gl.uniform1fv(glState.uAmp, amps);
        gl.uniform1fv(glState.uHue, hueArr);
        gl.uniform2f(
          glState.uPointer,
          pointerRef.current.x,
          pointerRef.current.y
        );
        gl.uniform1f(glState.uPointerOn, pointerRef.current.on ? 1 : 0);
        gl.uniform1f(glState.uSpark, pointerRef.current.spark);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      } else if (ctx2d) {
        drawCanvas2D(ctx2d, canvas.width, canvas.height, amps, t);
      }

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      if (glState) {
        const lose = glState.gl.getExtension("WEBGL_lose_context");
        if (lose) lose.loseContext();
      }
    };
  }, [started, pushBows, releaseBow]);

  // ── teardown audio on unmount ──────────────────────────────────────
  useEffect(() => {
    return () => {
      try {
        nodeRef.current?.disconnect();
        fallbackRef.current?.oscs.forEach((o) => {
          try {
            o.osc.stop();
          } catch {
            /* already stopped */
          }
          o.osc.disconnect();
        });
        const ctx = ctxRef.current;
        if (ctx && ctx.state !== "closed") ctx.close();
      } catch {
        /* ignore teardown errors */
      }
    };
  }, []);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#0a0705] text-white">
      {/* visual stage */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerMove={(e) => handlePointer(e.clientX, e.clientY)}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          handlePointer(e.clientX, e.clientY);
        }}
        onPointerUp={releaseBow}
        onPointerLeave={releaseBow}
      />

      {/* overlay UI */}
      <div className="pointer-events-none absolute inset-0 flex flex-col">
        <header className="pointer-events-auto p-5 sm:p-7">
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Cristal Friction
          </h1>
          <p className="mt-1 max-w-2xl text-base text-white/75">
            Bow glass and metal with your cursor. The singing comes from a
            real stick-slip friction model, not a sample.
          </p>
          {started && (
            <p className="mt-2 max-w-2xl text-base text-white/75">
              Drag slowly and steadily for pure tones; high and light for
              whistling wolf tones. Lower on a rod presses harder.
            </p>
          )}
          {noWorklet && (
            <p className="mt-2 text-base text-rose-300">
              AudioWorklet is unavailable here — using a simpler oscillator
              voice. The friction model needs a worklet to sing fully.
            </p>
          )}
          {noGL && (
            <p className="mt-2 text-base text-rose-300">
              WebGL2 is unavailable — falling back to a Canvas2D view.
            </p>
          )}
          {status && !started && (
            <p className="mt-2 text-base text-white/75">{status}</p>
          )}
          <p className="mt-3 text-base text-white/75">
            Read the design notes:{" "}
            <span className="text-white/95">
              src/app/dream/960-cristal-friction/README.md
            </span>
          </p>
        </header>

        <div className="flex-1" />

        {!started && (
          <div className="pointer-events-auto flex items-center justify-center pb-16">
            <button
              onClick={start}
              className="rounded-full bg-amber-300/90 px-8 py-3.5 text-lg font-medium text-[#1a0f06] shadow-lg transition-colors hover:bg-amber-200"
              style={{ minHeight: 44 }}
            >
              Light the rods & bow
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
