"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

/* ── constants ──────────────────────────────────────────────────────── */

const C2_HZ     = 65.406;
const C7_HZ     = 2093.0;
const RATIO_MIN = 0.5;
const RATIO_MAX = 8.0;
const INDEX_MAX = 15;
const SCOPE_H   = 52; // waveform strip height (CSS px)

/* ── presets ─────────────────────────────────────────────────────────── */

type FmPreset = { label: string; hz: number; ratio: number; idx: number };
const PRESETS: FmPreset[] = [
  { label: "Bell",     hz: 329.63, ratio: 1.414, idx: 8   },
  { label: "Rhodes",   hz: 130.81, ratio: 2.0,   idx: 3.5 },
  { label: "Clangy",   hz: 196.00, ratio: 3.5,   idx: 12  },
  { label: "Sub",      hz:  55.00, ratio: 1.0,   idx: 2   },
  { label: "Metallic", hz: 146.83, ratio: 1.667, idx: 15  },
];

/* ── mapping helpers ────────────────────────────────────────────────── */

function xToHz(x: number): number {
  return C2_HZ * Math.pow(C7_HZ / C2_HZ, x);
}
function hzToX(hz: number): number {
  return Math.log(hz / C2_HZ) / Math.log(C7_HZ / C2_HZ);
}
// y=0 top = RATIO_MAX; y=1 bottom = RATIO_MIN
function yToRatio(y: number): number {
  return RATIO_MAX - y * (RATIO_MAX - RATIO_MIN);
}
function ratioToY(r: number): number {
  return (RATIO_MAX - r) / (RATIO_MAX - RATIO_MIN);
}

function noteFromHz(hz: number): string {
  const m = Math.round(69 + 12 * Math.log2(hz / 440));
  const NAMES = ["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"];
  return `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
}

/* ── timbral background ─────────────────────────────────────────────── */

/** 0-1: how close is ratio to a simple harmonic fraction? */
function harmonicScore(ratio: number): number {
  const SIMPLE = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8];
  let min = Infinity;
  for (const s of SIMPLE) min = Math.min(min, Math.abs(ratio - s));
  return Math.max(0, 1 - min / 0.4);
}

/** RGBA for background cell: green (harmonic) → amber (bell) → violet (metallic) */
function bgCellColor(ratio: number, idxNorm: number): string {
  const complexity = (1 - harmonicScore(ratio)) * (0.15 + idxNorm * 0.85);
  let r: number, g: number, b: number;
  if (complexity < 0.5) {
    const p = complexity * 2;
    r = Math.round(74  + (251 - 74)  * p);
    g = Math.round(222 + (191 - 222) * p);
    b = Math.round(128 + (36  - 128) * p);
  } else {
    const p = (complexity - 0.5) * 2;
    r = Math.round(251 + (139 - 251) * p);
    g = Math.round(191 + (92  - 191) * p);
    b = Math.round(36  + (246 - 36)  * p);
  }
  const alpha = 0.18 + idxNorm * 0.22;
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ── audio + canvas state types ─────────────────────────────────────── */

type FmSys = {
  ctx:         AudioContext;
  carrier:     OscillatorNode;
  mod:         OscillatorNode;
  modGain:     GainNode;
  analyser:    AnalyserNode;
  master:      GainNode;
  micAnalyser: AnalyserNode | null;
};

type CanvState = {
  nx:  number;  // 0-1 normalized canvas X (pitch)
  ny:  number;  // 0-1 normalized canvas Y (ratio, 0=top=high)
  idx: number;  // FM index 0-15
};

/* ══════════════════════════════════════════════════════════════════════ */

export default function FmExplorerPage() {
  const cvRef  = useRef<HTMLCanvasElement>(null);
  const sysRef = useRef<FmSys | null>(null);
  const stRef  = useRef<CanvState>({ nx: 0.5, ny: 0.5, idx: 5 });
  const bgRef  = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const micRef = useRef(false); // ref mirror of micMode for RAF closure

  const [started, setStarted] = useState(false);
  const [micMode, setMicMode] = useState(false);
  const [fmIndex, setFmIndex] = useState(5);
  const [hud, setHud] = useState({ hz: "—", note: "—", ratio: "—", idx: "5.0" });

  /* ── render timbral background to offscreen canvas ───────────────── */
  const renderBg = useCallback((idx: number) => {
    const cv = cvRef.current;
    if (!cv) return;
    const W = cv.offsetWidth;
    const H = cv.offsetHeight;
    if (W === 0 || H === 0) return;
    if (!bgRef.current) bgRef.current = document.createElement("canvas");
    const bg  = bgRef.current;
    bg.width  = W;
    bg.height = Math.max(1, H - SCOPE_H);
    const gc  = bg.getContext("2d");
    if (!gc) return;
    const ROWS  = 64;
    const rh    = (H - SCOPE_H) / ROWS;
    const iNorm = idx / INDEX_MAX;
    for (let row = 0; row < ROWS; row++) {
      const ratio = yToRatio((row + 0.5) / ROWS);
      gc.fillStyle = bgCellColor(ratio, iNorm);
      gc.fillRect(0, row * rh, W, rh + 0.5);
    }
    // subtle horizontal tint: cool-left (low pitch) → warm-right (high pitch)
    const grad = gc.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0,   "rgba(60,40,120,0.10)");
    grad.addColorStop(0.5, "rgba(0,0,0,0)");
    grad.addColorStop(1,   "rgba(120,60,20,0.10)");
    gc.fillStyle = grad;
    gc.fillRect(0, 0, W, H - SCOPE_H);
  }, []);

  /* ── apply FM params to audio nodes ─────────────────────────────── */
  const syncFm = useCallback((st: CanvState) => {
    const sys = sysRef.current;
    if (!sys) return;
    const carrHz = xToHz(st.nx);
    const modHz  = carrHz * yToRatio(st.ny);
    const depth  = st.idx * modHz; // deviation = index × mod_freq
    const t      = sys.ctx.currentTime;
    sys.carrier.frequency.setTargetAtTime(carrHz, t, 0.025);
    sys.mod.frequency.setTargetAtTime(modHz,  t, 0.025);
    sys.modGain.gain.setTargetAtTime(depth, t, 0.025);
  }, []);

  /* ── boot audio ──────────────────────────────────────────────────── */
  const boot = useCallback(async () => {
    const ctx      = new AudioContext();
    const carrier  = ctx.createOscillator();
    const mod      = ctx.createOscillator();
    const modGain  = ctx.createGain();
    const analyser = ctx.createAnalyser();
    const master   = ctx.createGain();

    analyser.fftSize  = 1024;
    master.gain.value = 0.5;
    carrier.type = "sine";
    mod.type     = "sine";

    // FM routing: mod → modGain → carrier.frequency (AudioParam)
    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(master);
    master.connect(analyser);
    analyser.connect(ctx.destination);

    const st     = stRef.current;
    const carrHz = xToHz(st.nx);
    const modHz  = carrHz * yToRatio(st.ny);
    carrier.frequency.value = carrHz;
    mod.frequency.value     = modHz;
    modGain.gain.value      = st.idx * modHz;

    mod.start();
    carrier.start();

    sysRef.current = { ctx, carrier, mod, modGain, analyser, master, micAnalyser: null };
    setStarted(true);
  }, []);

  /* ── toggle mic (RMS → FM index) ─────────────────────────────────── */
  const toggleMic = useCallback(async () => {
    const sys = sysRef.current;
    if (!sys) return;
    if (micRef.current) {
      micRef.current  = false;
      sys.micAnalyser = null;
      setMicMode(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const src    = sys.ctx.createMediaStreamSource(stream);
        const ma     = sys.ctx.createAnalyser();
        ma.fftSize   = 256;
        src.connect(ma); // do NOT connect src to output (no loopback)
        sys.micAnalyser = ma;
        micRef.current  = true;
        setMicMode(true);
      } catch (e) { void e; }
    }
  }, []);

  /* ── preset jump ─────────────────────────────────────────────────── */
  const applyPreset = useCallback((p: FmPreset) => {
    const nx = Math.max(0, Math.min(1, hzToX(p.hz)));
    const ny = Math.max(0, Math.min(1, ratioToY(p.ratio)));
    stRef.current = { nx, ny, idx: p.idx };
    setFmIndex(p.idx);
    syncFm(stRef.current);
    renderBg(p.idx);
  }, [syncFm, renderBg]);

  /* ── FM index slider ─────────────────────────────────────────────── */
  const onIndexChange = useCallback((v: number) => {
    stRef.current.idx = v;
    setFmIndex(v);
    syncFm(stRef.current);
    renderBg(v);
  }, [syncFm, renderBg]);

  /* ── pointer: move to position and sync FM ───────────────────────── */
  const moveTo = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = cvRef.current;
    if (!cv || !started) return;
    const rect = cv.getBoundingClientRect();
    const nx   = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny   = Math.max(0, Math.min(1, (e.clientY - rect.top)  / rect.height));
    stRef.current.nx = nx;
    stRef.current.ny = ny;
    syncFm(stRef.current);
  }, [started, syncFm]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    moveTo(e);
  }, [moveTo]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    moveTo(e);
  }, [moveTo]);

  /* ── RAF draw loop ───────────────────────────────────────────────── */
  useEffect(() => {
    if (!started) return;
    const cv  = cvRef.current;
    if (!cv) return;
    const gc  = cv.getContext("2d");
    if (!gc) return;
    const sys = sysRef.current;
    if (!sys) return;

    const td     = new Float32Array(sys.analyser.fftSize);
    const micBuf = new Uint8Array(128);
    let w = 0;
    let h = 0;
    let lastHud = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = cv.offsetWidth;
      h = cv.offsetHeight;
      cv.width  = w * dpr;
      cv.height = h * dpr;
      gc.scale(dpr, dpr);
      renderBg(stRef.current.idx);
    };
    resize();
    window.addEventListener("resize", resize);

    const drawFrame = (now: number) => {
      // mic RMS → FM index
      if (micRef.current && sys.micAnalyser) {
        sys.micAnalyser.getByteTimeDomainData(micBuf);
        let sumSq = 0;
        for (let i = 0; i < micBuf.length; i++) {
          const v = micBuf[i] / 128 - 1;
          sumSq += v * v;
        }
        const rms    = Math.sqrt(sumSq / micBuf.length);
        const target = Math.max(0, Math.min(INDEX_MAX, rms * INDEX_MAX * 3.5));
        stRef.current.idx = stRef.current.idx * 0.88 + target * 0.12;
        syncFm(stRef.current);
      }

      const st = stRef.current;

      // clear
      gc.fillStyle = "#06060f";
      gc.fillRect(0, 0, w, h);

      // timbral background
      const bg = bgRef.current;
      if (bg && bg.width > 0) {
        gc.drawImage(bg, 0, 0, w, h - SCOPE_H);
      }

      // crosshairs
      const cursorX = st.nx * w;
      const cursorY = st.ny * (h - SCOPE_H);
      gc.strokeStyle = "rgba(255,255,255,0.12)";
      gc.lineWidth   = 1;
      gc.setLineDash([3, 5]);
      gc.beginPath();
      gc.moveTo(cursorX, 0);  gc.lineTo(cursorX, h - SCOPE_H);
      gc.moveTo(0, cursorY);  gc.lineTo(w, cursorY);
      gc.stroke();
      gc.setLineDash([]);

      // cursor dot
      gc.beginPath();
      gc.arc(cursorX, cursorY, 8, 0, Math.PI * 2);
      gc.fillStyle   = "rgba(255,255,255,0.92)";
      gc.shadowColor = "#fff";
      gc.shadowBlur  = 22;
      gc.fill();
      gc.shadowBlur  = 0;

      // ratio axis labels (left edge)
      gc.fillStyle    = "rgba(255,255,255,0.35)";
      gc.font         = "10px ui-monospace, monospace";
      gc.textAlign    = "left";
      gc.textBaseline = "middle";
      const ratioTicks = [8, 6, 4, 3, 2, 1.5, 1, 0.5];
      for (const rt of ratioTicks) {
        const ty = ratioToY(rt) * (h - SCOPE_H);
        gc.fillText(`${rt}×`, 4, ty);
      }

      // pitch labels (top edge)
      const pitchTicks = [
        { label: "C2", hz: 65.4  }, { label: "C3", hz: 130.8  },
        { label: "C4", hz: 261.6 }, { label: "C5", hz: 523.3  },
        { label: "C6", hz: 1046.5 }, { label: "C7", hz: 2093  },
      ];
      gc.textBaseline = "top";
      for (const { label, hz } of pitchTicks) {
        const tx = hzToX(hz) * w;
        gc.textAlign = tx < w * 0.85 ? "center" : "right";
        gc.fillText(label, tx, 2);
      }

      // divider line above scope strip
      gc.strokeStyle = "rgba(255,255,255,0.08)";
      gc.lineWidth   = 1;
      gc.setLineDash([]);
      gc.beginPath();
      gc.moveTo(0, h - SCOPE_H); gc.lineTo(w, h - SCOPE_H);
      gc.stroke();

      // waveform scope strip
      sys.analyser.getFloatTimeDomainData(td);
      gc.fillStyle = "rgba(4,4,14,0.88)";
      gc.fillRect(0, h - SCOPE_H, w, SCOPE_H);
      gc.strokeStyle = "rgba(255,255,255,0.65)";
      gc.lineWidth   = 1.5;
      gc.beginPath();
      const smid  = h - SCOPE_H + SCOPE_H / 2;
      const sStep = Math.max(1, Math.floor(td.length / w));
      for (let si = 0; si < w; si++) {
        const v  = td[si * sStep] ?? 0;
        const sy = smid + v * (SCOPE_H / 2 - 4);
        si === 0 ? gc.moveTo(si, sy) : gc.lineTo(si, sy);
      }
      gc.stroke();

      // scope label
      gc.fillStyle    = "rgba(255,255,255,0.18)";
      gc.font         = "9px ui-monospace, monospace";
      gc.textAlign    = "right";
      gc.textBaseline = "bottom";
      gc.fillText("FM OUTPUT", w - 4, h - 2);

      // HUD update ~8 Hz
      if (now - lastHud > 120) {
        lastHud = now;
        const cHz   = xToHz(st.nx);
        const ratio = yToRatio(st.ny);
        setHud({
          hz:    Math.round(cHz).toString(),
          note:  noteFromHz(cHz),
          ratio: ratio.toFixed(2),
          idx:   st.idx.toFixed(1),
        });
      }

      rafRef.current = requestAnimationFrame(drawFrame);
    };

    rafRef.current = requestAnimationFrame(drawFrame);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [started, syncFm, renderBg]);

  /* ── cleanup ─────────────────────────────────────────────────────── */
  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    const sys = sysRef.current;
    if (!sys) return;
    try { sys.carrier.stop(); } catch (e) { void e; }
    try { sys.mod.stop();     } catch (e) { void e; }
    sys.ctx.close().catch((e) => { void e; });
  }, []);

  /* ─────────────────────────────────────────────────────────────────── */

  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col overflow-hidden">
      {/* header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 shrink-0">
        <h1 className="text-base font-serif text-white/95">FM Explorer</h1>
        <p className="text-xs text-white/55 font-mono">timbral landscape · cycle 249</p>
      </div>

      {!started ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 text-center">
          <p className="text-white/75 text-base max-w-xs leading-relaxed">
            Move over a 2D canvas to sweep through hundreds of FM timbres.
            X&nbsp;=&nbsp;pitch · Y&nbsp;=&nbsp;mod ratio · slider&nbsp;=&nbsp;FM depth.
            Green&nbsp;=&nbsp;harmonic · amber&nbsp;=&nbsp;bell · violet&nbsp;=&nbsp;metallic.
          </p>
          <button
            onClick={boot}
            className="px-8 py-3 rounded-full bg-violet-600 hover:bg-violet-500 active:scale-95 text-white text-base font-medium min-h-[44px] transition-all"
          >
            Start FM
          </button>
          <p className="text-white/40 text-xs max-w-xs">
            FM synthesis underlies the DX7 (1983), Rhodes piano, 808 bass, and bell tones —
            all from a single AudioParam connection.
          </p>
          <Link href="/dream" className="text-xs text-white/30 hover:text-white/60 font-mono mt-2">
            ← dream lab
          </Link>
        </div>
      ) : (
        <>
          <canvas
            ref={cvRef}
            className="flex-1 w-full touch-none cursor-crosshair"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
          />

          {/* controls */}
          <div className="shrink-0 border-t border-white/10 px-4 py-2.5 flex flex-col gap-2.5">
            <div className="flex items-center gap-3">
              <span className="text-xs text-white/55 font-mono w-28 shrink-0">
                index {fmIndex.toFixed(1)}
              </span>
              <input
                type="range"
                min={0}
                max={INDEX_MAX}
                step={0.5}
                value={fmIndex}
                onChange={(e) => onIndexChange(parseFloat(e.target.value))}
                className="flex-1 accent-violet-400"
              />
              <button
                onClick={toggleMic}
                className={`text-xs font-mono px-3 py-1.5 rounded border min-h-[36px] min-w-[56px] transition-all ${
                  micMode
                    ? "border-emerald-400/60 text-emerald-300"
                    : "border-white/20 text-white/55 hover:border-white/40"
                }`}
              >
                {micMode ? "mic ●" : "mic"}
              </button>
            </div>

            <div className="flex gap-1.5 flex-wrap">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => applyPreset(p)}
                  className="text-xs font-mono px-3 py-1.5 rounded border border-white/20 hover:border-violet-400/50 text-white/70 hover:text-white min-h-[36px] transition-all"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* HUD */}
          <div className="shrink-0 grid grid-cols-4 border-t border-white/10">
            {([
              { label: "carrier",  val: hud.note,        sub: `${hud.hz} Hz`,     color: "text-violet-300"  },
              { label: "ratio",    val: `${hud.ratio}×`, sub: "mod / carrier",    color: "text-amber-300"   },
              { label: "index",    val: hud.idx,          sub: "depth",            color: "text-rose-300"    },
              { label: "mode",     val: micMode ? "mic" : "free",
                                   sub: micMode ? "rms→idx" : "move to explore",
                                   color: micMode ? "text-emerald-300" : "text-white/55" },
            ] as const).map(({ label, val, sub, color }) => (
              <div key={label} className="flex flex-col items-center py-2 gap-0.5">
                <span className={`text-sm font-mono ${color}`}>{val}</span>
                <span className="text-[10px] text-white/55 font-mono">{sub}</span>
                <span className="text-[9px] text-white/35 font-mono uppercase tracking-wider">{label}</span>
              </div>
            ))}
          </div>

          <div className="absolute bottom-28 right-4 z-10">
            <Link href="/dream" className="font-mono text-xs text-white/40 hover:text-white/70">
              ← dream lab
            </Link>
          </div>
          <div className="absolute bottom-28 left-4 z-10">
            <Link href="/dream/215-fm-explorer/README.md" className="font-mono text-xs text-white/40 hover:text-white/70">
              design notes
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
