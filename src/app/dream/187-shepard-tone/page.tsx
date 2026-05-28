"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── Constants ─────────────────────────────────────────────────────────────────
const N        = 8;       // octave count: A1 (55 Hz) through A8 (7040 Hz)
const A1_HZ    = 55.0;
const BELL_SIG = 1.5;     // bell-curve σ in octave-units; centered at pos 4 (≈ A5)
const MASTER_G = 0.14;    // overall gain (8 simultaneous sines sum to ≈ 0.45)

const NOTE_TAGS = ["A1","A2","A3","A4","A5","A6","A7","A8"] as const;

// ── Pure helpers (no "use" prefix — not hooks) ────────────────────────────────

/** Perceptual weight for an oscillator at octave-position `pos` ∈ [0, N). */
function bellWeight(pos: number): number {
  const d = pos - N / 2;
  return Math.exp(-0.5 * (d / BELL_SIG) ** 2);
}

/** Frequency of oscillator at continuous octave-position `pos`. */
function posToHz(pos: number): number {
  return A1_HZ * Math.pow(2, pos);
}

/** Hz → compact display string. */
function hzLabel(hz: number): string {
  return hz >= 1000 ? `${(hz / 1000).toFixed(1)}k` : `${Math.round(hz)}`;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ShepardTonePage() {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const actxRef      = useRef<AudioContext | null>(null);
  const oscsRef      = useRef<OscillatorNode[]>([]);
  const gainNodesRef = useRef<GainNode[]>([]);
  const masterRef    = useRef<GainNode | null>(null);
  const analyserRef  = useRef<AnalyserNode | null>(null);
  const micRef       = useRef<MediaStream | null>(null);
  const phaseRef     = useRef(0);    // octave-position in [0, N), advances over time
  const prevTRef     = useRef(0);
  const rafRef       = useRef(0);

  // Refs for values read inside the rAF loop (avoid stale closures)
  const runningRef   = useRef(false);
  const frozenRef    = useRef(false);
  const ascRef       = useRef(true);
  const rateRef      = useRef(4);    // display speed 0.5–10

  // UI state (for rendering only; synced to refs via effects)
  const [running, setRunning]     = useState(false);
  const [frozen,  setFrozen]      = useState(false);
  const [ascending, setAscending] = useState(true);
  const [rate,    setRate]        = useState(4);
  const [micMode, setMicMode]     = useState(false);
  const [micErr,  setMicErr]      = useState("");

  useEffect(() => { runningRef.current  = running;  }, [running]);
  useEffect(() => { frozenRef.current   = frozen;   }, [frozen]);
  useEffect(() => { ascRef.current      = ascending; }, [ascending]);
  useEffect(() => { rateRef.current     = rate;     }, [rate]);

  // ── Connect / disconnect mic ───────────────────────────────────────────────
  useEffect(() => {
    if (!running) return;
    const ctx = actxRef.current;
    if (!ctx) return;

    if (micMode) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        micRef.current = stream;
        const src = ctx.createMediaStreamSource(stream);
        const ana = ctx.createAnalyser();
        ana.fftSize = 256;
        ana.smoothingTimeConstant = 0.7;
        src.connect(ana);
        analyserRef.current = ana;
        setMicErr("");
      }).catch(() => {
        setMicErr("Mic unavailable — amplitude modulation disabled");
      });
    } else {
      micRef.current?.getTracks().forEach(t => t.stop());
      micRef.current   = null;
      analyserRef.current = null;
      setMicErr("");
    }

    return () => {
      micRef.current?.getTracks().forEach(t => t.stop());
      micRef.current   = null;
      analyserRef.current = null;
    };
  }, [micMode, running]);

  // ── Main canvas + audio loop (mounts once, reads refs) ────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2 = canvas.getContext("2d");
    if (!ctx2) return;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.offsetWidth > 0 && canvas.offsetHeight > 0) {
        canvas.width  = canvas.offsetWidth  * dpr;
        canvas.height = canvas.offsetHeight * dpr;
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const micBuf = new Uint8Array(256);

    const tick = (now: number) => {
      const dt = Math.min((now - prevTRef.current) / 1000, 0.05);
      prevTRef.current = now;

      if (runningRef.current && !frozenRef.current) {
        // octaves per second = rate / 60
        let octPerSec = rateRef.current / 60;

        if (analyserRef.current) {
          analyserRef.current.getByteTimeDomainData(micBuf);
          let sq = 0;
          for (let b = 0; b < micBuf.length; b++) {
            const v = (micBuf[b] - 128) / 128;
            sq += v * v;
          }
          octPerSec *= 1 + Math.sqrt(sq / micBuf.length) * 6;
        }

        const dir = ascRef.current ? 1 : -1;
        phaseRef.current = ((phaseRef.current + dir * octPerSec * dt) % N + N) % N;
      }

      // Update oscillator frequencies + gains
      const actx  = actxRef.current;
      const oscs  = oscsRef.current;
      const gains = gainNodesRef.current;
      if (actx && oscs.length === N) {
        const t = actx.currentTime;
        for (let i = 0; i < N; i++) {
          const pos  = (i + phaseRef.current) % N;
          oscs[i].frequency.setValueAtTime(posToHz(pos), t);
          gains[i].gain.setValueAtTime(bellWeight(pos), t);
        }
      }

      // ── Draw ──────────────────────────────────────────────────────────────
      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;
      ctx2.save();
      ctx2.scale(dpr, dpr);

      ctx2.fillStyle = "rgba(5,2,14,0.28)";
      ctx2.fillRect(0, 0, W, H);

      const phase = phaseRef.current;

      // ── Left column: 8 oscillator circles ──────────────────────────────
      const colX = W * 0.3;
      const topY = H * 0.12;
      const rowH = (H * 0.76) / (N - 1);

      for (let i = 0; i < N; i++) {
        const pos = (i + phase) % N;
        const g   = bellWeight(pos);
        const cy  = topY + (N - 1 - i) * rowH;  // A8 at top, A1 at bottom
        const r   = 10 + g * 20;

        // Glow halo
        const grd = ctx2.createRadialGradient(colX, cy, 0, colX, cy, r * 3.5);
        grd.addColorStop(0,    `rgba(195,135,255,${(g * 0.85).toFixed(2)})`);
        grd.addColorStop(0.45, `rgba(100,50,195,${(g * 0.40).toFixed(2)})`);
        grd.addColorStop(1,    "rgba(28,4,58,0)");
        ctx2.beginPath();
        ctx2.arc(colX, cy, r * 3.5, 0, Math.PI * 2);
        ctx2.fillStyle = grd;
        ctx2.fill();

        // Core disc
        ctx2.beginPath();
        ctx2.arc(colX, cy, r, 0, Math.PI * 2);
        ctx2.fillStyle = `rgba(215,165,255,${(0.18 + g * 0.82).toFixed(2)})`;
        ctx2.fill();

        // Note label (left of circle)
        const la = 0.3 + g * 0.65;
        ctx2.fillStyle    = `rgba(255,255,255,${la.toFixed(2)})`;
        ctx2.font         = "12px monospace";
        ctx2.textAlign    = "right";
        ctx2.textBaseline = "middle";
        ctx2.fillText(NOTE_TAGS[i], colX - r - 9, cy);

        // Hz label (right of circle)
        ctx2.textAlign    = "left";
        ctx2.fillStyle    = `rgba(195,155,255,${(la * 0.72).toFixed(2)})`;
        ctx2.font         = "10px monospace";
        ctx2.fillText(hzLabel(posToHz(pos)) + " Hz", colX + r + 7, cy);
      }

      // ── Right: circular octave dial ─────────────────────────────────────
      const dialX = W * 0.70;
      const dialY = H * 0.48;
      const dialR = Math.min(W * 0.22, H * 0.30);

      // Outer ring
      ctx2.beginPath();
      ctx2.arc(dialX, dialY, dialR, 0, Math.PI * 2);
      ctx2.strokeStyle = "rgba(100,50,165,0.25)";
      ctx2.lineWidth   = 1.5;
      ctx2.stroke();

      // Inner ring
      ctx2.beginPath();
      ctx2.arc(dialX, dialY, dialR * 0.5, 0, Math.PI * 2);
      ctx2.strokeStyle = "rgba(75,30,120,0.18)";
      ctx2.lineWidth   = 1;
      ctx2.stroke();

      // 8 sector spokes + rim labels
      for (let i = 0; i < N; i++) {
        const angle = (i / N) * Math.PI * 2 - Math.PI / 2;
        const pos   = (i + phase) % N;
        const g     = bellWeight(pos);
        const r0    = dialR * 0.52;
        const r1    = dialR * (0.56 + g * 0.44);

        ctx2.beginPath();
        ctx2.moveTo(dialX + Math.cos(angle) * r0, dialY + Math.sin(angle) * r0);
        ctx2.lineTo(dialX + Math.cos(angle) * r1, dialY + Math.sin(angle) * r1);
        ctx2.strokeStyle = `rgba(210,150,255,${(0.15 + g * 0.85).toFixed(2)})`;
        ctx2.lineWidth   = 2.5 + g * 5;
        ctx2.lineCap     = "round";
        ctx2.stroke();

        const lr = dialR * 1.18;
        ctx2.fillStyle    = `rgba(255,255,255,${(0.22 + g * 0.53).toFixed(2)})`;
        ctx2.font         = "10px monospace";
        ctx2.textAlign    = "center";
        ctx2.textBaseline = "middle";
        ctx2.fillText(NOTE_TAGS[i], dialX + Math.cos(angle) * lr, dialY + Math.sin(angle) * lr);
      }

      // Sweeping needle
      const needleAngle = (phase / N) * Math.PI * 2 - Math.PI / 2;
      const nx0 = dialX + Math.cos(needleAngle) * dialR * 0.28;
      const ny0 = dialY + Math.sin(needleAngle) * dialR * 0.28;
      const nx1 = dialX + Math.cos(needleAngle) * dialR * 0.90;
      const ny1 = dialY + Math.sin(needleAngle) * dialR * 0.90;

      ctx2.beginPath();
      ctx2.moveTo(nx0, ny0);
      ctx2.lineTo(nx1, ny1);
      ctx2.strokeStyle = "rgba(255,220,255,0.92)";
      ctx2.lineWidth   = 2.5;
      ctx2.lineCap     = "round";
      ctx2.stroke();

      // Needle tip glow
      const tg = ctx2.createRadialGradient(nx1, ny1, 0, nx1, ny1, 15);
      tg.addColorStop(0, "rgba(255,200,255,0.8)");
      tg.addColorStop(1, "rgba(80,20,120,0)");
      ctx2.beginPath();
      ctx2.arc(nx1, ny1, 15, 0, Math.PI * 2);
      ctx2.fillStyle = tg;
      ctx2.fill();

      // Center dot
      ctx2.beginPath();
      ctx2.arc(dialX, dialY, 5, 0, Math.PI * 2);
      ctx2.fillStyle = "rgba(200,150,255,0.8)";
      ctx2.fill();

      // Current Hz label under dial
      if (runningRef.current) {
        const currHz = posToHz(phase);
        const hzStr  = currHz >= 1000 ? `${(currHz / 1000).toFixed(2)}k Hz` : `${Math.round(currHz)} Hz`;
        ctx2.fillStyle    = "rgba(255,255,255,0.60)";
        ctx2.font         = "13px monospace";
        ctx2.textAlign    = "center";
        ctx2.textBaseline = "top";
        ctx2.fillText(hzStr, dialX, dialY + dialR * 0.55);
      }

      // "↑" / "↓" direction indicator inside dial
      if (runningRef.current) {
        ctx2.fillStyle    = "rgba(210,170,255,0.70)";
        ctx2.font         = "18px monospace";
        ctx2.textAlign    = "center";
        ctx2.textBaseline = "middle";
        ctx2.fillText(ascRef.current ? "↑" : "↓", dialX, dialY - dialR * 0.18);
      }

      ctx2.restore();
      rafRef.current = requestAnimationFrame(tick);
    };

    prevTRef.current = performance.now();
    rafRef.current   = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);  // mount only; reads all mutable state via refs

  // ── Start / Stop handlers ──────────────────────────────────────────────────
  function handleStart() {
    if (actxRef.current) return;
    const ctx = new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    actxRef.current = ctx;

    const master = ctx.createGain();
    master.gain.setValueAtTime(MASTER_G, ctx.currentTime);
    master.connect(ctx.destination);
    masterRef.current = master;

    const oscs: OscillatorNode[] = [];
    const gs: GainNode[] = [];
    for (let i = 0; i < N; i++) {
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.type  = "sine";
      osc.frequency.value = posToHz(i);
      g.gain.value        = bellWeight(i);
      osc.connect(g);
      g.connect(master);
      osc.start();
      oscs.push(osc);
      gs.push(g);
    }
    oscsRef.current      = oscs;
    gainNodesRef.current = gs;

    runningRef.current = true;
    setRunning(true);
  }

  function handleStop() {
    runningRef.current = false;
    setRunning(false);
    setMicMode(false);
    setMicErr("");
    micRef.current?.getTracks().forEach(t => t.stop());
    micRef.current   = null;
    analyserRef.current = null;
    const ctx = actxRef.current;
    if (ctx) {
      masterRef.current?.gain.setValueAtTime(0, ctx.currentTime);
      void ctx.close();
    }
    actxRef.current      = null;
    oscsRef.current      = [];
    gainNodesRef.current = [];
    masterRef.current    = null;
    phaseRef.current     = 0;
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="relative h-screen w-full overflow-hidden" style={{ background: "#060310" }}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-start justify-between px-6 pt-5 pointer-events-none">
        <div>
          <h1 className="text-2xl font-serif text-white/95 leading-tight">Shepard Tone</h1>
          <p className="text-base text-white/75 mt-0.5">An auditory illusion: the endless staircase</p>
        </div>
        <Link
          href="/dream"
          className="text-sm text-white/55 hover:text-white/80 transition-colors pointer-events-auto"
        >
          ← dream lab
        </Link>
      </div>

      {/* Pre-start overlay */}
      {!running && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 px-8 text-center">
          <p className="text-white/75 text-base max-w-sm leading-relaxed">
            Eight overlapping sine tones, each one octave apart — weighted by a bell curve
            so only the middle range is audible. Together they create a pitch that
            rises (or falls) forever without ever reaching a higher note.
          </p>
          <button
            onClick={handleStart}
            className="px-8 py-3 rounded-full bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white/95 text-base font-medium transition-colors min-h-[44px]"
          >
            Start
          </button>
          <p className="text-white/40 text-sm">
            Shepard (1964) · pure Web Audio · no permissions needed
          </p>
        </div>
      )}

      {/* Controls */}
      {running && (
        <div className="absolute bottom-0 left-0 right-0 z-10 pb-5 px-4">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={handleStop}
              className="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white/90 text-sm transition-colors min-h-[44px]"
            >
              Stop
            </button>

            <div className="flex gap-2">
              <button
                onClick={() => setAscending(true)}
                className={`px-4 py-2.5 rounded-full text-sm transition-colors min-h-[44px] ${
                  ascending
                    ? "bg-violet-600 text-white/95"
                    : "bg-white/10 text-white/60 hover:bg-white/20"
                }`}
              >
                ↑ Rising
              </button>
              <button
                onClick={() => setAscending(false)}
                className={`px-4 py-2.5 rounded-full text-sm transition-colors min-h-[44px] ${
                  !ascending
                    ? "bg-violet-600 text-white/95"
                    : "bg-white/10 text-white/60 hover:bg-white/20"
                }`}
              >
                ↓ Falling
              </button>
            </div>

            <label className="flex items-center gap-2 text-sm text-white/65">
              <span>Slow</span>
              <input
                type="range" min={0.5} max={10} step={0.5} value={rate}
                onChange={e => setRate(Number(e.target.value))}
                className="w-24 accent-violet-400"
              />
              <span>Fast</span>
            </label>

            <button
              onClick={() => setFrozen(f => !f)}
              className={`px-4 py-2.5 rounded-full text-sm transition-colors min-h-[44px] ${
                frozen
                  ? "bg-amber-600/70 text-white/95"
                  : "bg-white/10 text-white/60 hover:bg-white/20"
              }`}
            >
              {frozen ? "● Frozen" : "Freeze"}
            </button>

            <button
              onClick={() => setMicMode(m => !m)}
              className={`px-4 py-2.5 rounded-full text-sm transition-colors min-h-[44px] ${
                micMode
                  ? "bg-emerald-700/70 text-white/90"
                  : "bg-white/10 text-white/60 hover:bg-white/20"
              }`}
            >
              {micMode ? "Mic on" : "Mic mode"}
            </button>
          </div>

          {micErr && (
            <p className="text-center text-rose-300 text-sm mt-2">{micErr}</p>
          )}
        </div>
      )}
    </div>
  );
}
