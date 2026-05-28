"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

const BASE_FREQ = 220;
const MASTER_G  = 0.30;
const N_PTS     = 3000;
const SR        = 44100;
const WAV_SECS  = 5;

const RATIOS: [number, number, string][] = [
  [1, 1, "Unison"], [1, 2, "Octave"], [2, 3, "Perfect 5th"],
  [3, 4, "Perfect 4th"], [3, 5, "Major 6th"], [4, 5, "Major 3rd"], [5, 7, "Minor 7th"],
];

const PRESETS = [
  { name: "Circle",    rIdx: 0, phase: 90 },
  { name: "Figure-8",  rIdx: 1, phase: 0  },
  { name: "Trefoil",   rIdx: 2, phase: 0  },
  { name: "Rose",      rIdx: 3, phase: 0  },
  { name: "Starburst", rIdx: 4, phase: 36 },
];

const PUZZLES = [
  { rIdx: 1, phase: 90, hint: "1:2 · 90°"  },
  { rIdx: 2, phase: 60, hint: "2:3 · 60°"  },
  { rIdx: 3, phase: 45, hint: "3:4 · 45°"  },
];

function calcGcd(a: number, b: number): number { return b ? calcGcd(b, a % b) : a; }

function computeLissajous(
  num: number, den: number, phase_deg: number, bal: number
): [number, number][] {
  const phi = (phase_deg * Math.PI) / 180;
  const T   = (2 * Math.PI) / calcGcd(num, den);
  const mbMax = Math.max(bal, 100 - bal);
  const xA = bal / mbMax;
  const yA = (100 - bal) / mbMax;
  const pts: [number, number][] = [];
  for (let i = 0; i <= N_PTS; i++) {
    const t = (i / N_PTS) * T;
    pts.push([Math.sin(num * t + phi) * xA, Math.sin(den * t) * yA]);
  }
  return pts;
}

function paintFigure(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number,
  pts: [number, number][], color: string, alpha: number, lw: number
) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.globalAlpha  = alpha;
  ctx.lineWidth    = lw;
  ctx.lineCap      = "round";
  ctx.lineJoin     = "round";
  ctx.moveTo(cx + pts[0][0] * r, cy - pts[0][1] * r);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(cx + pts[i][0] * r, cy - pts[i][1] * r);
  }
  ctx.stroke();
  ctx.globalAlpha = 1.0;
}

function buildWav(num: number, den: number, phase_deg: number, bal: number): Blob {
  const ns  = SR * WAV_SECS;
  const L   = new Float32Array(ns);
  const R   = new Float32Array(ns);
  const phi = (phase_deg * Math.PI) / 180;
  const fL  = BASE_FREQ * num;
  const fR  = BASE_FREQ * den;
  const aL  = Math.min(1, bal / 50) * MASTER_G;
  const aR  = Math.min(1, (100 - bal) / 50) * MASTER_G;
  for (let i = 0; i < ns; i++) {
    const t = i / SR;
    L[i] = Math.sin(2 * Math.PI * fL * t + phi) * aL;
    R[i] = Math.sin(2 * Math.PI * fR * t) * aR;
  }
  const nc = 2, bps = 4, dLen = ns * nc * bps;
  const ab = new ArrayBuffer(44 + dLen);
  const dv = new DataView(ab);
  const ws = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i));
  };
  ws(0, "RIFF"); dv.setUint32(4, 36 + dLen, true); ws(8, "WAVE");
  ws(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 3, true);
  dv.setUint16(22, nc, true); dv.setUint32(24, SR, true);
  dv.setUint32(28, SR * nc * bps, true); dv.setUint16(32, nc * bps, true);
  dv.setUint16(34, 32, true);
  ws(36, "data"); dv.setUint32(40, dLen, true);
  let o = 44;
  for (let i = 0; i < ns; i++) {
    dv.setFloat32(o, L[i], true); o += 4;
    dv.setFloat32(o, R[i], true); o += 4;
  }
  return new Blob([ab], { type: "audio/wav" });
}

export default function OscComposerPage() {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const actxRef    = useRef<AudioContext | null>(null);
  const oscLRef    = useRef<OscillatorNode | null>(null);
  const oscRRef    = useRef<OscillatorNode | null>(null);
  const gainLRef   = useRef<GainNode | null>(null);
  const gainRRef   = useRef<GainNode | null>(null);
  const mergerRef  = useRef<ChannelMergerNode | null>(null);
  const masterRef  = useRef<GainNode | null>(null);
  const rafRef     = useRef(0);
  const spotRef    = useRef(0);
  const prevTRef   = useRef(0);

  const [playing,    setPlaying]    = useState(false);
  const [rIdx,       setRIdx]       = useState(0);
  const [phase,      setPhase]      = useState(90);
  const [balance,    setBalance]    = useState(50);
  const [puzzleMode, setPuzzleMode] = useState(false);
  const [puzzleIdx,  setPuzzleIdx]  = useState(0);
  const [revealed,   setRevealed]   = useState(false);

  const rIdxRef    = useRef(rIdx);
  const phaseRef   = useRef(phase);
  const balRef     = useRef(balance);
  const puzzleRef  = useRef(puzzleMode);
  const pzIdxRef   = useRef(puzzleIdx);
  const playingRef = useRef(false);

  useEffect(() => { rIdxRef.current   = rIdx;       }, [rIdx]);
  useEffect(() => { phaseRef.current  = phase;      }, [phase]);
  useEffect(() => { balRef.current    = balance;    }, [balance]);
  useEffect(() => { puzzleRef.current = puzzleMode; }, [puzzleMode]);
  useEffect(() => { pzIdxRef.current  = puzzleIdx;  }, [puzzleIdx]);

  // mount-only canvas loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.offsetWidth > 0) {
        canvas.width  = canvas.offsetWidth  * dpr;
        canvas.height = canvas.offsetHeight * dpr;
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const tick = (now: number) => {
      const dt = Math.min((now - prevTRef.current) / 1000, 0.05);
      prevTRef.current = now;
      if (playingRef.current) spotRef.current = (spotRef.current + dt * 0.16) % 1;

      const W  = canvas.offsetWidth;
      const H  = canvas.offsetHeight;
      const cx = W / 2;
      const cy = H / 2;
      const r  = Math.min(W, H) * 0.34;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.fillStyle = "rgba(5,2,16,0.28)";
      ctx.fillRect(0, 0, W, H);

      const ri  = rIdxRef.current;
      const [num, den] = RATIOS[ri];
      const pts = computeLissajous(num, den, phaseRef.current, balRef.current);

      // ghost target in puzzle mode
      if (puzzleRef.current) {
        const pz = PUZZLES[pzIdxRef.current];
        const [pn, pd] = RATIOS[pz.rIdx];
        const gPts = computeLissajous(pn, pd, pz.phase, 50);
        ctx.shadowColor = "rgba(80,200,255,0.4)";
        ctx.shadowBlur  = 12;
        paintFigure(ctx, cx, cy, r, gPts, "rgba(80,200,255,0.25)", 1, 2);
        ctx.shadowBlur = 0;
      }

      // glow pass
      ctx.shadowColor = "rgba(160,100,255,0.55)";
      ctx.shadowBlur  = 22;
      paintFigure(ctx, cx, cy, r, pts, "rgba(175,110,255,0.45)", 1, 5);
      ctx.shadowBlur = 0;

      // crisp pass
      paintFigure(ctx, cx, cy, r, pts, "rgba(225,185,255,0.88)", 1, 1.5);

      // traveling dot while playing
      if (playingRef.current && pts.length > 1) {
        const idx     = Math.floor(spotRef.current * (pts.length - 1));
        const [sx, sy] = pts[idx];
        ctx.beginPath();
        ctx.arc(cx + sx * r, cy - sy * r, 5, 0, Math.PI * 2);
        ctx.fillStyle   = "rgba(255,255,255,0.95)";
        ctx.shadowColor = "rgba(255,210,255,0.95)";
        ctx.shadowBlur  = 14;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // HUD
      const fz = Math.max(11, W * 0.021);
      ctx.fillStyle    = "rgba(255,255,255,0.58)";
      ctx.font         = `${fz}px monospace`;
      ctx.textAlign    = "left";
      ctx.textBaseline = "top";
      ctx.fillText(`${RATIOS[ri][0]}:${RATIOS[ri][1]}  ${RATIOS[ri][2]}`, 16, 16);
      ctx.fillStyle = "rgba(200,175,255,0.45)";
      ctx.fillText(`phase ${phaseRef.current}°`, 16, 16 + fz + 4);

      ctx.fillStyle    = "rgba(255,255,255,0.18)";
      ctx.font         = "11px monospace";
      ctx.textAlign    = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(`X  ${RATIOS[ri][0] * BASE_FREQ} Hz`, cx, cy - r - 10);
      ctx.textAlign    = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(`Y  ${RATIOS[ri][1] * BASE_FREQ} Hz`, cx + r + 10, cy);

      ctx.restore();
      rafRef.current = requestAnimationFrame(tick);
    };

    prevTRef.current   = performance.now();
    rafRef.current     = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  const launchOscillators = useCallback((ri: number) => {
    const actx = actxRef.current;
    if (!actx || !gainLRef.current || !gainRRef.current) return;
    try { oscLRef.current?.stop(); } catch { /* already stopped */ }
    try { oscRRef.current?.stop(); } catch { /* already stopped */ }
    oscLRef.current?.disconnect();
    oscRRef.current?.disconnect();
    const [num, den] = RATIOS[ri];
    const t  = actx.currentTime;
    const oL = actx.createOscillator();
    const oR = actx.createOscillator();
    oL.type = "sine"; oR.type = "sine";
    oL.frequency.setValueAtTime(BASE_FREQ * num, t);
    oR.frequency.setValueAtTime(BASE_FREQ * den, t);
    oL.connect(gainLRef.current);
    oR.connect(gainRRef.current);
    oL.start(t); oR.start(t);
    oscLRef.current = oL;
    oscRRef.current = oR;
  }, []);

  useEffect(() => {
    if (!playing) return;
    launchOscillators(rIdx);
  }, [rIdx, playing, launchOscillators]);

  useEffect(() => {
    if (!playing) return;
    const actx = actxRef.current;
    if (!actx) return;
    const t = actx.currentTime;
    gainLRef.current?.gain.setTargetAtTime(balance / 50, t, 0.03);
    gainRRef.current?.gain.setTargetAtTime((100 - balance) / 50, t, 0.03);
  }, [balance, playing]);

  function handlePlay() {
    if (actxRef.current) return;
    const actx = new AudioContext();
    if (actx.state === "suspended") void actx.resume();
    actxRef.current = actx;

    const merger = actx.createChannelMerger(2);
    const master = actx.createGain();
    master.gain.setValueAtTime(MASTER_G, actx.currentTime);
    merger.connect(master);
    master.connect(actx.destination);
    mergerRef.current = merger;
    masterRef.current = master;

    const gL = actx.createGain();
    const gR = actx.createGain();
    gL.gain.setValueAtTime(balance / 50,       actx.currentTime);
    gR.gain.setValueAtTime((100 - balance) / 50, actx.currentTime);
    gL.connect(merger, 0, 0);
    gR.connect(merger, 0, 1);
    gainLRef.current = gL;
    gainRRef.current = gR;

    playingRef.current = true;
    setPlaying(true);
    launchOscillators(rIdx);
  }

  function handleStop() {
    playingRef.current = false;
    setPlaying(false);
    try { oscLRef.current?.stop(); } catch { /* already stopped */ }
    try { oscRRef.current?.stop(); } catch { /* already stopped */ }
    if (masterRef.current && actxRef.current)
      masterRef.current.gain.setValueAtTime(0, actxRef.current.currentTime);
    void actxRef.current?.close();
    actxRef.current  = null;
    oscLRef.current  = null;
    oscRRef.current  = null;
    gainLRef.current = null;
    gainRRef.current = null;
    mergerRef.current = null;
    masterRef.current = null;
  }

  function handleDownload() {
    const [num, den] = RATIOS[rIdx];
    const blob = buildWav(num, den, phase, balance);
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `lissajous-${num}-${den}-${Math.round(phase)}deg.wav`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function applyPreset(p: { rIdx: number; phase: number }) {
    setRIdx(p.rIdx);
    setPhase(p.phase);
  }

  const [num, den, intervalName] = RATIOS[rIdx];

  return (
    <div className="relative h-screen w-full overflow-hidden" style={{ background: "#050210" }}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-start justify-between px-5 pt-5 pointer-events-none">
        <div>
          <h1 className="text-2xl font-serif text-white/95">Oscilloscope Composer</h1>
          <p className="text-base text-white/75 mt-0.5">Design a Lissajous figure — download the audio that draws it</p>
        </div>
        <Link href="/dream" className="text-sm text-white/55 hover:text-white/80 transition-colors pointer-events-auto">
          ← dream lab
        </Link>
      </div>

      {/* Controls */}
      <div className="absolute bottom-0 left-0 right-0 z-10 pb-5 px-4 space-y-3">
        {/* Presets */}
        <div className="flex flex-wrap gap-2 justify-center">
          {PRESETS.map((p, i) => (
            <button
              key={i}
              onClick={() => applyPreset(p)}
              className={`px-3 py-1.5 rounded-full text-sm transition-colors min-h-[36px] ${
                rIdx === p.rIdx && phase === p.phase
                  ? "bg-violet-600/80 text-white/95"
                  : "bg-white/10 text-white/60 hover:bg-white/20"
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>

        {/* Sliders */}
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-white/55 text-xs">Ratio</span>
            <select
              value={rIdx}
              onChange={e => setRIdx(Number(e.target.value))}
              className="bg-white/10 text-white/90 rounded px-2 py-1 text-sm border border-white/20 focus:outline-none"
            >
              {RATIOS.map(([n, d, name], i) => (
                <option key={i} value={i} className="bg-neutral-900">
                  {n}:{d} — {name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-white/55 text-xs">Phase</span>
            <input
              type="range" min={0} max={360} step={1} value={phase}
              onChange={e => setPhase(Number(e.target.value))}
              className="w-28 accent-violet-400"
            />
            <span className="text-white/55 text-xs w-9">{phase}°</span>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-white/55 text-xs">X</span>
            <input
              type="range" min={10} max={90} step={1} value={balance}
              onChange={e => setBalance(Number(e.target.value))}
              className="w-20 accent-violet-400"
            />
            <span className="text-white/55 text-xs">Y</span>
          </label>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 justify-center">
          {!playing ? (
            <button
              onClick={handlePlay}
              className="px-6 py-2.5 rounded-full bg-violet-600 hover:bg-violet-500 text-white/95 text-sm transition-colors min-h-[44px]"
            >
              ▶ Play {num * BASE_FREQ} Hz × {den * BASE_FREQ} Hz
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="px-6 py-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white/80 text-sm transition-colors min-h-[44px]"
            >
              ■ Stop
            </button>
          )}
          <button
            onClick={handleDownload}
            className="px-5 py-2.5 rounded-full bg-emerald-800/60 hover:bg-emerald-700/70 text-emerald-200 text-sm transition-colors min-h-[44px]"
          >
            ↓ WAV
          </button>
          <button
            onClick={() => { setPuzzleMode(prev => !prev); setRevealed(false); }}
            className={`px-5 py-2.5 rounded-full text-sm transition-colors min-h-[44px] ${
              puzzleMode
                ? "bg-amber-700/60 text-white/90"
                : "bg-white/10 text-white/60 hover:bg-white/20"
            }`}
          >
            {puzzleMode ? "Exit Puzzle" : "Puzzle"}
          </button>
        </div>

        {/* Puzzle controls */}
        {puzzleMode && (
          <div className="flex flex-wrap gap-2 justify-center">
            {PUZZLES.map((_, i) => (
              <button
                key={i}
                onClick={() => { setPuzzleIdx(i); setRevealed(false); }}
                className={`px-3 py-1.5 rounded-full text-sm min-h-[36px] ${
                  puzzleIdx === i
                    ? "bg-amber-600/70 text-white/90"
                    : "bg-white/10 text-white/50 hover:bg-white/20"
                }`}
              >
                #{i + 1}
              </button>
            ))}
            <button
              onClick={() => setRevealed(prev => !prev)}
              className="px-3 py-1.5 rounded-full bg-white/10 text-white/55 text-sm hover:bg-white/20 min-h-[36px]"
            >
              {revealed ? "Hide" : "Hint"}
            </button>
            {revealed && (
              <span className="self-center text-sm text-amber-300">
                {PUZZLES[puzzleIdx].hint}
              </span>
            )}
          </div>
        )}

        <p className="text-center text-white/30 text-xs">
          {intervalName} — {num}:{den} · stereo · no permissions needed
        </p>
      </div>
    </div>
  );
}
