"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── Constants ──────────────────────────────────────────────────────────────────

const N_PARTS = 2000;
const SPRING = 1.1;    // px/frame² — force toward node lines (normalized-grad magnitude is ≤1)
const DAMP = 0.89;     // velocity damping per frame
const NOISE_BASE = 0.06;  // px/frame minimum random jitter
const NOISE_AMP = 1.4;    // px/frame added jitter at max amplitude
const DEMO_SECS = 4.5;    // seconds per mode in demo auto-cycle

// ── Chladni mode catalogue ─────────────────────────────────────────────────────

interface CMode { m: number; n: number; name: string; freqHz: number }

const CMODES: CMode[] = [
  { m: 1, n: 2, name: "Ring",       freqHz: 95   },
  { m: 2, n: 3, name: "Clover",     freqHz: 175  },
  { m: 1, n: 4, name: "Cross",      freqHz: 285  },
  { m: 3, n: 4, name: "Asterisk",   freqHz: 430  },
  { m: 2, n: 5, name: "Lattice",    freqHz: 620  },
  { m: 3, n: 5, name: "Fine Star",  freqHz: 900  },
  { m: 4, n: 5, name: "Crystal",    freqHz: 1240 },
  { m: 5, n: 6, name: "Snowflake",  freqHz: 1680 },
];

// ── Physics helpers (module-level — not hooks) ─────────────────────────────────

/**
 * Chladni plate function and its gradient.
 * f(x,y) = cos(m·π·x)·cos(n·π·y) − cos(n·π·x)·cos(m·π·y)
 * Node lines where f = 0 are where sand accumulates on a real vibrating plate.
 * Domain: x, y ∈ [-1, 1].  Antisymmetric in x,y so f(x,x) = 0 always (diagonal).
 */
function evalChladni(m: number, n: number, x: number, y: number) {
  const mp = m * Math.PI, np = n * Math.PI;
  const cmx = Math.cos(mp * x), smx = Math.sin(mp * x);
  const cny = Math.cos(np * y), sny = Math.sin(np * y);
  const cnx = Math.cos(np * x), snx = Math.sin(np * x);
  const cmy = Math.cos(mp * y), smy = Math.sin(mp * y);
  return {
    f:  cmx * cny - cnx * cmy,
    gx: -mp * smx * cny + np * snx * cmy,
    gy: -np * cmx * sny + mp * cnx * smy,
  };
}

function scatterAll(
  px: Float32Array, py: Float32Array,
  vx: Float32Array, vy: Float32Array,
  W: number, H: number,
): void {
  for (let i = 0; i < N_PARTS; i++) {
    // Start particles in a circle to look like scattered sand
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * Math.min(W, H) * 0.48;
    px[i] = W * 0.5 + Math.cos(angle) * r;
    py[i] = H * 0.5 + Math.sin(angle) * r;
    vx[i] = (Math.random() - 0.5) * 4;
    vy[i] = (Math.random() - 0.5) * 4;
  }
}

function stepPhysics(
  px: Float32Array, py: Float32Array,
  vx: Float32Array, vy: Float32Array,
  W: number, H: number,
  m: number, n: number,
  amp: number,
): void {
  const hw = W * 0.5, hh = H * 0.5;
  const noise = NOISE_BASE + amp * NOISE_AMP;
  // Map canvas [0,W]×[0,H] → normalized [-0.88,0.88]×[-0.88,0.88]
  // (0.88 margin avoids domain edge artifacts)
  const invHw = 0.88 / hw, invHh = 0.88 / hh;

  for (let i = 0; i < N_PARTS; i++) {
    const nx = (px[i] - hw) * invHw;
    const ny = (py[i] - hh) * invHh;
    const { f, gx, gy } = evalChladni(m, n, nx, ny);
    // Force = -f · normalize(grad_f) · SPRING
    // = gradient descent of |f|, magnitude ∝ |f|, capped by normalization.
    const gnorm = Math.sqrt(gx * gx + gy * gy) + 1e-5;
    vx[i] += (-f * gx / gnorm) * SPRING;
    vy[i] += (-f * gy / gnorm) * SPRING;
    // Thermal noise — mimics plate vibration amplitude
    vx[i] += (Math.random() - 0.5) * noise;
    vy[i] += (Math.random() - 0.5) * noise;
    vx[i] *= DAMP;
    vy[i] *= DAMP;
    px[i] += vx[i];
    py[i] += vy[i];
    // Soft reflection at canvas boundary
    if (px[i] < 0)    { px[i] = 0;     vx[i] =  Math.abs(vx[i]) * 0.3; }
    if (px[i] >= W)   { px[i] = W - 1; vx[i] = -Math.abs(vx[i]) * 0.3; }
    if (py[i] < 0)    { py[i] = 0;     vy[i] =  Math.abs(vy[i]) * 0.3; }
    if (py[i] >= H)   { py[i] = H - 1; vy[i] = -Math.abs(vy[i]) * 0.3; }
  }
}

function drawParticles(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  px: Float32Array, py: Float32Array,
): void {
  ctx.fillStyle = "#050212";
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "lighter";
  // Warm amber sand — additive blending makes dense clusters glow bright
  ctx.fillStyle = "rgba(220,172,78,0.19)";
  for (let i = 0; i < N_PARTS; i++) {
    ctx.beginPath();
    ctx.arc(px[i], py[i], 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
}

/** Map spectral centroid (Hz) to nearest Chladni mode index. */
function centroidToModeIdx(hz: number): number {
  if (hz < 135)  return 0;
  if (hz < 230)  return 1;
  if (hz < 358)  return 2;
  if (hz < 525)  return 3;
  if (hz < 760)  return 4;
  if (hz < 1070) return 5;
  if (hz < 1460) return 6;
  return 7;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function CymaticsPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef(0);
  const audioRef = useRef<{
    ctx: AudioContext;
    analyser: AnalyserNode;
    freqBuf: Float32Array;
    stream?: MediaStream;
    osc?: OscillatorNode;
  } | null>(null);
  const partRef = useRef({
    px: new Float32Array(N_PARTS),
    py: new Float32Array(N_PARTS),
    vx: new Float32Array(N_PARTS),
    vy: new Float32Array(N_PARTS),
  });
  const loopRef = useRef({
    status: "idle" as "idle" | "demo" | "mic",
    modeIdx: 0,
    frame: 0,
    demoTimer: 0,
    pendingModeIdx: 0,
    pendingCount: 0,
    W: 500,
    H: 500,
  });

  const [status, setStatus] = useState<"idle" | "demo" | "mic">("idle");
  const [modeIdx, setModeIdx] = useState(0);
  const [ampPct, setAmpPct] = useState(0);
  const [centHz, setCentHz] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // ── Audio teardown ────────────────────────────────────────────────────────────

  const stop = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    const a = audioRef.current;
    if (a) {
      a.osc?.stop();
      a.stream?.getTracks().forEach((t) => t.stop());
      void a.ctx.close();
      audioRef.current = null;
    }
    loopRef.current.status = "idle";
    setStatus("idle");
  }, []);

  // ── Manual mode selection ─────────────────────────────────────────────────────

  const pickMode = useCallback((idx: number) => {
    const loop = loopRef.current;
    loop.modeIdx = idx;
    loop.pendingModeIdx = idx;
    loop.pendingCount = 0;
    const { px, py, vx, vy } = partRef.current;
    scatterAll(px, py, vx, vy, loop.W, loop.H);
    setModeIdx(idx);
  }, []);

  // ── Render / physics loop ─────────────────────────────────────────────────────

  const startLoop = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    const DEMO_OSC_FREQS = CMODES.map((c) => c.freqHz);

    const tick = (now: number) => {
      animRef.current = requestAnimationFrame(tick);
      const audio = audioRef.current;
      const loop = loopRef.current;
      if (!audio) return;

      const W = loop.W, H = loop.H;
      const { px, py, vx, vy } = partRef.current;

      // Read frequency data (dB scale, -∞..0)
      audio.analyser.getFloatFrequencyData(
        audio.freqBuf as unknown as Float32Array<ArrayBuffer>,
      );
      const bins = audio.freqBuf.length;
      let energy = 0, centNum = 0;
      for (let i = 0; i < bins; i++) {
        const db = audio.freqBuf[i];
        if (db < -80) continue;  // ignore noise floor
        const lin = Math.pow(10, db / 20);
        energy += lin;
        centNum += i * lin;
      }
      const centroidHz = energy > 1e-4
        ? (centNum / energy) * (audio.ctx.sampleRate * 0.5) / bins
        : 0;
      // Normalize amplitude: rough heuristic from dB sum
      const normAmp = Math.min(1, energy / bins * 0.08);

      // ── Mode selection ──────────────────────────────────────────────────────
      if (loop.status === "demo") {
        loop.demoTimer += 1 / 60;
        const rawIdx = Math.floor(
          (loop.demoTimer % (DEMO_SECS * CMODES.length)) / DEMO_SECS,
        ) % CMODES.length;
        if (rawIdx !== loop.modeIdx) {
          loop.modeIdx = rawIdx;
          setModeIdx(rawIdx);
          scatterAll(px, py, vx, vy, W, H);
          if (audio.osc) {
            const target = DEMO_OSC_FREQS[rawIdx] ?? 300;
            audio.osc.frequency.setTargetAtTime(target, audio.ctx.currentTime, 0.6);
          }
        }
      } else if (loop.status === "mic" && normAmp > 0.02) {
        // Debounce mode changes: require 45 consecutive frames in new mode (~0.75s)
        const suggested = centroidToModeIdx(centroidHz);
        if (suggested !== loop.modeIdx) {
          if (suggested === loop.pendingModeIdx) {
            loop.pendingCount++;
            if (loop.pendingCount > 45) {
              loop.modeIdx = suggested;
              loop.pendingCount = 0;
              setModeIdx(suggested);
              scatterAll(px, py, vx, vy, W, H);
            }
          } else {
            loop.pendingModeIdx = suggested;
            loop.pendingCount = 0;
          }
        } else {
          loop.pendingCount = 0;
        }
      }

      // ── Physics + render ────────────────────────────────────────────────────
      const { m, n } = CMODES[loop.modeIdx];
      stepPhysics(px, py, vx, vy, W, H, m, n, normAmp);
      drawParticles(ctx2d, W, H, px, py);

      // Throttle React state updates to avoid render overhead
      if ((loop.frame & 7) === 0) {
        setAmpPct(Math.round(normAmp * 100));
        setCentHz(Math.round(centroidHz));
      }
      loop.frame++;
    };

    animRef.current = requestAnimationFrame(tick);
  }, []);

  // ── Demo start ────────────────────────────────────────────────────────────────

  const startDemo = useCallback(() => {
    stop();
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Ctx: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const actx = new Ctx();
      const analyser = actx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.25;
      const freqBuf = new Float32Array(new ArrayBuffer(analyser.frequencyBinCount * 4));
      const osc = actx.createOscillator();
      const g = actx.createGain();
      g.gain.value = 0.5;
      osc.type = "sine";
      osc.frequency.value = CMODES[0].freqHz;
      osc.connect(g);
      g.connect(analyser);
      // NOT connected to destination — silent
      osc.start();
      audioRef.current = { ctx: actx, analyser, freqBuf, osc };
      const loop = loopRef.current;
      loop.status = "demo";
      loop.modeIdx = 0;
      loop.frame = 0;
      loop.demoTimer = 0;
      loop.pendingCount = 0;
      setStatus("demo");
      setModeIdx(0);
      setError(null);
      scatterAll(
        partRef.current.px, partRef.current.py,
        partRef.current.vx, partRef.current.vy,
        loop.W, loop.H,
      );
      startLoop();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start audio");
    }
  }, [stop, startLoop]);

  // ── Mic start ─────────────────────────────────────────────────────────────────

  const startMic = useCallback(async () => {
    stop();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Ctx: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const actx = new Ctx();
      const src = actx.createMediaStreamSource(stream);
      const analyser = actx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.3;
      const freqBuf = new Float32Array(new ArrayBuffer(analyser.frequencyBinCount * 4));
      src.connect(analyser);
      audioRef.current = { ctx: actx, analyser, freqBuf, stream };
      const loop = loopRef.current;
      loop.status = "mic";
      loop.modeIdx = 0;
      loop.frame = 0;
      loop.demoTimer = 0;
      loop.pendingModeIdx = 0;
      loop.pendingCount = 0;
      setStatus("mic");
      setModeIdx(0);
      setError(null);
      scatterAll(
        partRef.current.px, partRef.current.py,
        partRef.current.vx, partRef.current.vy,
        loop.W, loop.H,
      );
      startLoop();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Microphone unavailable. Check permissions.",
      );
    }
  }, [stop, startLoop]);

  // ── Canvas sizing ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssSize = Math.min(
        window.innerWidth - 32,
        window.innerHeight - 220,
        580,
      );
      canvas.width = Math.round(cssSize * dpr);
      canvas.height = Math.round(cssSize * dpr);
      canvas.style.width = `${cssSize}px`;
      canvas.style.height = `${cssSize}px`;
      loopRef.current.W = Math.round(cssSize * dpr);
      loopRef.current.H = Math.round(cssSize * dpr);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => () => stop(), [stop]);

  const mode = CMODES[modeIdx];

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col items-center px-4 pb-6" style={{ minHeight: "calc(100vh - 3rem)" }}>
      <canvas
        ref={canvasRef}
        className="block mt-4 rounded"
        style={{ background: "#050212" }}
      />

      {/* ── Idle landing ─────────────────────────────────────────────────── */}
      {status === "idle" && (
        <div className="flex flex-col items-center text-center mt-10">
          <h1 className="text-2xl md:text-3xl mb-2 tracking-tight" style={{ color: "#d4a050" }}>
            Cymatics
          </h1>
          <p className="text-sm text-muted-foreground max-w-sm mb-8 leading-relaxed">
            Sand settling into the standing wave geometry of a vibrating plate. Each
            frequency produces a unique pattern — the hidden shape of sound.
          </p>
          <div className="flex gap-4 mb-4">
            <button
              onClick={startDemo}
              className="px-6 py-3 text-sm tracking-wider uppercase border border-border rounded hover:bg-accent hover:border-border transition"
            >
              Start demo
            </button>
            <button
              onClick={startMic}
              className="px-6 py-3 text-sm tracking-wider uppercase border border-border rounded hover:bg-accent hover:border-border transition"
            >
              Start mic
            </button>
          </div>
          {error && <p className="text-xs text-violet-300/80 max-w-sm mt-1">{error}</p>}
          <Link href="/dream" className="mt-8 text-[11px] text-muted-foreground/70 hover:text-muted-foreground">
            ← back to dream sandbox
          </Link>
        </div>
      )}

      {/* ── Active controls ──────────────────────────────────────────────── */}
      {status !== "idle" && (
        <>
          {/* Status bar */}
          <div className="flex items-center gap-4 mt-3 mb-2 text-[11px] tracking-wider">
            <span style={{ color: "#d4a050" }}>
              ({mode.m},{mode.n}) {mode.name.toUpperCase()}
            </span>
            <span className="text-muted-foreground/70">
              {status === "demo" ? "DEMO" : `MIC · ${centHz > 0 ? centHz + " Hz" : "listening…"}`}
            </span>
            {/* Amplitude meter */}
            <div className="w-16 h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-75"
                style={{ width: `${ampPct}%`, background: "#d4a050" }}
              />
            </div>
          </div>

          {/* Mode buttons */}
          <div className="flex flex-wrap gap-2 justify-center mb-3 max-w-lg">
            {CMODES.map((cm, i) => (
              <button
                key={i}
                onClick={() => pickMode(i)}
                className={`text-[10px] px-2 py-1 rounded border transition ${
                  i === modeIdx
                    ? "border-violet-600/70 text-violet-400 bg-violet-900/20"
                    : "border-border text-muted-foreground/70 hover:border-border hover:text-muted-foreground"
                }`}
              >
                ({cm.m},{cm.n}) {cm.name}
              </button>
            ))}
          </div>

          {/* Bottom controls */}
          <div className="flex items-center gap-4 text-[10px]">
            <button
              onClick={stop}
              className="tracking-wider uppercase text-muted-foreground hover:text-foreground border border-border hover:border-border px-3 py-1 rounded transition"
            >
              stop
            </button>
            <Link href="/dream" className="text-muted-foreground/70 hover:text-muted-foreground">
              ← back
            </Link>
            <a
              href="/dream/19-cymatics/README.md"
              className="text-muted-foreground/70 hover:text-muted-foreground"
              target="_blank"
              rel="noreferrer"
            >
              design notes ↗
            </a>
          </div>
        </>
      )}
    </div>
  );
}
