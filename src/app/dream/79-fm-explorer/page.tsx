"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMicAnalyser } from "../_shared/use-mic-analyser";

// ─── Bessel J_n(x) — Miller backward recurrence (stable for all x, n) ────────

function besselRange(x: number, N: number): number[] {
  if (x < 1e-9) {
    const r = new Array<number>(N + 1).fill(0);
    r[0] = 1;
    return r;
  }
  const M = Math.max(N + 40, Math.ceil(x) + 30);
  const f = new Array<number>(M + 2).fill(0);
  f[M - 1] = 1;
  for (let n = M - 1; n >= 1; n--) {
    f[n - 1] = (2 * n / x) * f[n] - f[n + 1];
    const a = Math.abs(f[n - 1]);
    if (a > 1e15) { const inv = 1 / a; for (let k = n - 1; k <= M; k++) f[k] *= inv; }
  }
  // Parseval: J_0^2 + 2*(J_1^2 + J_2^2 + ...) = 1
  let norm = f[0] * f[0];
  for (let n = 1; n < M; n++) norm += 2 * f[n] * f[n];
  const s = (f[0] > 0 ? 1 : -1) / Math.sqrt(norm);
  return Array.from({ length: N + 1 }, (_, i) => f[i] * s);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
function midiToHz(m: number) { return 440 * 2 ** ((m - 69) / 12); }
function midiLabel(m: number) { return NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1); }

// ─── Presets ──────────────────────────────────────────────────────────────────

const PRESETS = [
  { name: "DX Piano",  cmRatio: 1.00, modIndex:  2.5, midi: 60 },
  { name: "Bell",      cmRatio: 3.50, modIndex:  1.5, midi: 72 },
  { name: "Reed",      cmRatio: 0.67, modIndex:  3.5, midi: 60 },
  { name: "FM Bass",   cmRatio: 2.00, modIndex:  8.0, midi: 48 },
  { name: "Metallic",  cmRatio: 7.00, modIndex:  5.0, midi: 57 },
  { name: "Glass",     cmRatio: 0.25, modIndex:  1.0, midi: 84 },
] as const;

// ─── Draw sideband spectrum ───────────────────────────────────────────────────

function drawSpectrum(
  ctx: CanvasRenderingContext2D,
  beta: number,
  cmRatio: number,
  w: number,
  h: number,
) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#050508";
  ctx.fillRect(0, 0, w, h);
  if (w < 30 || h < 50) return;

  const N = Math.min(16, Math.floor((w - 60) / 14));
  if (N < 1) return;
  const total = 2 * N + 1;
  const barW = Math.max(4, Math.floor((w - 48) / total) - 2);
  const gap = 2;
  const startX = (w - total * (barW + gap)) / 2;
  const maxH = h - 46;

  const b = besselRange(beta, N);

  for (let i = 0; i < total; i++) {
    const n = i - N;
    const mag = Math.abs(b[Math.abs(n)]);
    const bh = Math.round(mag * maxH);
    const x = startX + i * (barW + gap);
    const y = h - 28 - bh;

    // Violet center → amber edges
    const t = Math.abs(n) / N;
    const hue = Math.round(265 - t * 220);

    if (bh > 0) {
      ctx.fillStyle = `hsl(${hue},80%,${40 + 18 * mag}%)`;
      ctx.fillRect(x, y, barW, bh);
      if (mag > 0.07) {
        ctx.shadowColor = `hsl(${hue},90%,70%)`;
        ctx.shadowBlur = barW + 3;
        ctx.fillStyle = `hsl(${hue},85%,${58 + 15 * mag}%)`;
        ctx.fillRect(x, y, barW, 2);
        ctx.shadowBlur = 0;
      }
    } else {
      ctx.fillStyle = "#0c0c16";
      ctx.fillRect(x, h - 28 - 1, barW, 2);
    }

    // Axis labels
    const showLabel = n === 0 || (Math.abs(n) <= 5 && mag > 0.03);
    if (showLabel) {
      ctx.fillStyle = n === 0 ? "rgba(200,150,255,0.9)" : "rgba(255,255,255,0.45)";
      ctx.font = `${barW >= 12 ? 10 : 8}px monospace`;
      ctx.textAlign = "center";
      const lbl = n === 0 ? "C" : (n > 0 ? `+${n}` : `${n}`);
      ctx.fillText(lbl, x + barW / 2, h - 10);
    }
  }

  // Top info line
  ctx.font = "11px monospace";
  ctx.fillStyle = "rgba(255,255,255,0.32)";
  ctx.textAlign = "left";
  ctx.fillText(`β = ${beta.toFixed(2)}  ·  C:M = 1:${cmRatio.toFixed(2)}`, 10, 16);

  // Bessel values readout
  const readout = b.slice(0, 4).map((v, i) => `J${i}=${Math.abs(v).toFixed(3)}`).join("  ");
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.fillText(readout, w - 10, 16);
}

// ─── ADSR slider sub-component ────────────────────────────────────────────────

function ADSRRow({ label, val, onSet, min, max, step, unit }: {
  label: string; val: number; onSet: (v: number) => void;
  min: number; max: number; step: number; unit: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-white/55 text-xs font-mono w-4 shrink-0">{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={val}
        onChange={e => onSet(Number(e.target.value))}
        className="flex-1 h-1 accent-emerald-500"
      />
      <span className="text-white/75 text-xs font-mono w-12 text-right shrink-0">
        {val < 1 ? val.toFixed(2) : val.toFixed(1)}{unit}
      </span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FMExplorer() {
  const [cmRatio,      setCmRatio]     = useState(1.0);
  const [modIndex,     setModIndex]    = useState(2.5);
  const [midiNote,     setMidiNote]    = useState(60);
  const [attack,       setAttack]      = useState(0.01);
  const [decay,        setDecay]       = useState(0.30);
  const [sustain,      setSustain]     = useState(0.60);
  const [release,      setRelease]     = useState(1.20);
  const [playing,      setPlaying]     = useState(false);
  const [micMode,      setMicMode]     = useState(false);
  const [activePreset, setActivePreset] = useState(0);

  const acRef        = useRef<AudioContext | null>(null);
  const carrierRef   = useRef<OscillatorNode | null>(null);
  const modulatorRef = useRef<OscillatorNode | null>(null);
  const modDepthRef  = useRef<GainNode | null>(null);
  const adsrRef      = useRef<GainNode | null>(null);
  const rafRef       = useRef<number>(0);
  const canvasRef    = useRef<HTMLCanvasElement | null>(null);

  // Live refs to avoid stale closures in audio + animation callbacks
  const cmRef  = useRef(cmRatio);   cmRef.current  = cmRatio;
  const miRef  = useRef(modIndex);  miRef.current  = modIndex;
  const midiRef = useRef(midiNote); midiRef.current = midiNote;
  const atkRef  = useRef(attack);   atkRef.current  = attack;
  const dcyRef  = useRef(decay);    dcyRef.current  = decay;
  const susRef  = useRef(sustain);  susRef.current  = sustain;
  const relRef  = useRef(release);  relRef.current  = release;

  const mic = useMicAnalyser({ smoothing: 0.72 });

  // ── Create FM audio graph ────────────────────────────────────────────────

  const ensureAudio = useCallback(() => {
    if (acRef.current) return;
    const ac = new AudioContext();
    acRef.current = ac;

    const carrier = ac.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = midiToHz(midiRef.current);

    const modulator = ac.createOscillator();
    modulator.type = "sine";
    modulator.frequency.value = midiToHz(midiRef.current) * cmRef.current;

    const modDepth = ac.createGain();
    modDepth.gain.value = miRef.current * midiToHz(midiRef.current);

    const adsr = ac.createGain();
    adsr.gain.value = 0;

    const master = ac.createGain();
    master.gain.value = 0.26;

    // FM: modulator → modDepth → carrier.frequency
    //     carrier → adsr → master → destination
    modulator.connect(modDepth);
    modDepth.connect(carrier.frequency);
    carrier.connect(adsr);
    adsr.connect(master);
    master.connect(ac.destination);

    carrier.start();
    modulator.start();

    carrierRef.current   = carrier;
    modulatorRef.current = modulator;
    modDepthRef.current  = modDepth;
    adsrRef.current      = adsr;
  }, []);

  // ── Note on / off ────────────────────────────────────────────────────────

  const triggerNote = useCallback(() => {
    ensureAudio();
    const ac   = acRef.current;
    const adsr = adsrRef.current;
    if (!ac || !adsr) return;
    const now = ac.currentTime;
    adsr.gain.cancelScheduledValues(now);
    adsr.gain.setValueAtTime(0, now);
    adsr.gain.linearRampToValueAtTime(1, now + atkRef.current);
    adsr.gain.linearRampToValueAtTime(susRef.current, now + atkRef.current + dcyRef.current);
    setPlaying(true);
  }, [ensureAudio]);

  const releaseNote = useCallback(() => {
    const ac   = acRef.current;
    const adsr = adsrRef.current;
    if (!ac || !adsr) return;
    const now = ac.currentTime;
    const cur = adsr.gain.value;
    adsr.gain.cancelScheduledValues(now);
    adsr.gain.setValueAtTime(cur, now);
    adsr.gain.linearRampToValueAtTime(0, now + relRef.current);
    setPlaying(false);
  }, []);

  // ── Sync FM params when sliders move ────────────────────────────────────

  useEffect(() => {
    const ac       = acRef.current;
    const carrier  = carrierRef.current;
    const mod      = modulatorRef.current;
    const modDepth = modDepthRef.current;
    if (!ac || !carrier || !mod || !modDepth) return;
    const now = ac.currentTime;
    const f = midiToHz(midiNote);
    carrier.frequency.setTargetAtTime(f, now, 0.02);
    mod.frequency.setTargetAtTime(f * cmRatio, now, 0.02);
    modDepth.gain.setTargetAtTime(modIndex * f, now, 0.02);
  }, [cmRatio, modIndex, midiNote]);

  // ── Animation + audio-reactive loop ────────────────────────────────────

  useEffect(() => {
    let lfoT = 0;

    function animate() {
      rafRef.current = requestAnimationFrame(animate);
      const cv = canvasRef.current;
      if (!cv) return;
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      const w = cv.width;
      const h = cv.height;
      if (w < 10 || h < 10) return;

      let beta = miRef.current;
      let onset = false;

      if (micMode && mic.running) {
        const frame = mic.getFrame();
        if (frame) {
          // Bass energy pushes beta up (more harmonics when louder)
          beta = miRef.current + frame.bands[1] * 14;
          onset = frame.onset;
        }
      } else {
        // Demo: gentle LFO breathes beta between 50%–130% of dial value
        lfoT += 0.005;
        const lfo = Math.sin(lfoT) * 0.5 + 0.5;
        beta = miRef.current * (0.5 + lfo * 0.8);
      }

      beta = Math.max(0, Math.min(20, beta));

      // Push live beta to audio engine
      const ac       = acRef.current;
      const modDepth = modDepthRef.current;
      if (ac && modDepth) {
        const f = midiToHz(midiRef.current);
        modDepth.gain.setTargetAtTime(beta * f, ac.currentTime, 0.08);
      }

      // Onset in mic mode re-triggers the note
      if (micMode && onset) triggerNote();

      drawSpectrum(ctx, beta, cmRef.current, w, h);
    }

    animate();
    return () => cancelAnimationFrame(rafRef.current);
  }, [micMode, mic, triggerNote]);

  // ── Keyboard spacebar ───────────────────────────────────────────────────

  useEffect(() => {
    const dn = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) { e.preventDefault(); triggerNote(); }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") { e.preventDefault(); releaseNote(); }
    };
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); };
  }, [triggerNote, releaseNote]);

  // ── Canvas resize ────────────────────────────────────────────────────────

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ro = new ResizeObserver(() => {
      cv.width  = cv.clientWidth;
      cv.height = cv.clientHeight;
    });
    ro.observe(cv);
    cv.width  = cv.clientWidth;
    cv.height = cv.clientHeight;
    return () => ro.disconnect();
  }, []);

  // ── Cleanup ──────────────────────────────────────────────────────────────

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    try { carrierRef.current?.stop(); } catch { /* already stopped */ }
    try { modulatorRef.current?.stop(); } catch { /* already stopped */ }
    void acRef.current?.close();
  }, []);

  // ── Apply preset ─────────────────────────────────────────────────────────

  const applyPreset = useCallback((i: number) => {
    const p = PRESETS[i];
    setActivePreset(i);
    setCmRatio(p.cmRatio);
    setModIndex(p.modIndex);
    setMidiNote(p.midi);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  const fHz   = Math.round(midiToHz(midiNote));
  const fmHz  = Math.round(midiToHz(midiNote) * cmRatio);
  const depth = Math.round(modIndex * midiToHz(midiNote));

  return (
    <div className="min-h-screen bg-black text-white flex flex-col" style={{ userSelect: "none" }}>

      {/* Header */}
      <div className="flex items-start justify-between px-5 pt-4 pb-3 border-b border-white/10">
        <div>
          <h1 className="text-2xl font-mono font-bold text-white">FM Explorer</h1>
          <p className="text-white/75 text-base mt-1 max-w-md">
            2-operator frequency modulation. C:M ratio and modulation index
            control everything — electric piano to metallic clang.
          </p>
        </div>
        <Link href="/dream" className="text-white/55 text-sm hover:text-white/80 transition-colors mt-1 ml-4 shrink-0">
          ← dream
        </Link>
      </div>

      {/* Presets */}
      <div className="flex items-center gap-2 px-5 py-2.5 border-b border-white/10 overflow-x-auto">
        <span className="text-white/55 text-sm font-mono shrink-0">preset:</span>
        {PRESETS.map((p, i) => (
          <button
            key={p.name}
            onClick={() => applyPreset(i)}
            className={`px-3 py-1.5 rounded text-sm font-mono transition-colors shrink-0 min-h-[36px] border ${
              activePreset === i
                ? "bg-violet-500/30 text-violet-300 border-violet-400/50"
                : "bg-white/5 text-white/70 hover:bg-white/10 border-white/10"
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex flex-col lg:flex-row flex-1 min-h-0">

        {/* Controls */}
        <div className="lg:w-72 shrink-0 px-5 py-4 space-y-5 border-b lg:border-b-0 lg:border-r border-white/10 overflow-y-auto">

          {/* C:M Ratio */}
          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-white/75 text-sm font-mono">C:M Ratio</label>
              <span className="text-violet-300 text-sm font-mono">1:{cmRatio.toFixed(2)}</span>
            </div>
            <input
              type="range" min={0.1} max={8} step={0.01} value={cmRatio}
              onChange={e => setCmRatio(Number(e.target.value))}
              className="w-full h-1.5 accent-violet-500"
            />
            <div className="flex justify-between text-white/40 text-xs font-mono mt-1">
              <span>brass</span><span>piano·bell</span><span>metal</span>
            </div>
          </div>

          {/* Modulation Index */}
          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-white/75 text-sm font-mono">Mod Index &#946;</label>
              <span className="text-cyan-300 text-sm font-mono">{modIndex.toFixed(1)}</span>
            </div>
            <input
              type="range" min={0} max={20} step={0.1} value={modIndex}
              onChange={e => setModIndex(Number(e.target.value))}
              className="w-full h-1.5 accent-cyan-500"
            />
            <div className="flex justify-between text-white/40 text-xs font-mono mt-1">
              <span>pure</span><span>warm</span><span>rich</span><span>noise</span>
            </div>
          </div>

          {/* Carrier Note */}
          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-white/75 text-sm font-mono">Carrier Note</label>
              <span className="text-amber-300 text-sm font-mono">{midiLabel(midiNote)} · {fHz} Hz</span>
            </div>
            <input
              type="range" min={36} max={84} step={1} value={midiNote}
              onChange={e => setMidiNote(Number(e.target.value))}
              className="w-full h-1.5 accent-amber-500"
            />
            <div className="flex justify-between text-white/40 text-xs font-mono mt-1">
              <span>C2</span><span>C4</span><span>C6</span>
            </div>
          </div>

          {/* Envelope */}
          <div className="space-y-2.5">
            <p className="text-white/55 text-xs font-mono uppercase tracking-widest">Envelope ADSR</p>
            <ADSRRow label="A" val={attack}  onSet={setAttack}  min={0.005} max={2}   step={0.005} unit="s" />
            <ADSRRow label="D" val={decay}   onSet={setDecay}   min={0.01}  max={3}   step={0.01}  unit="s" />
            <ADSRRow label="S" val={sustain} onSet={setSustain} min={0}     max={1}   step={0.01}  unit=""  />
            <ADSRRow label="R" val={release} onSet={setRelease} min={0.05}  max={6}   step={0.05}  unit="s" />
          </div>

          {/* Play + mode */}
          <div className="space-y-2">
            <button
              onPointerDown={triggerNote}
              onPointerUp={releaseNote}
              onPointerLeave={releaseNote}
              onPointerCancel={releaseNote}
              className={`w-full py-3 rounded font-mono text-base font-bold transition-all min-h-[48px] border ${
                playing
                  ? "bg-violet-500/30 text-violet-200 border-violet-400/60 shadow-lg shadow-violet-500/20"
                  : "bg-violet-600 hover:bg-violet-500 text-white border-violet-400/30"
              }`}
            >
              {playing ? "● sustaining" : "▶ Play note"}
            </button>
            <p className="text-white/40 text-xs font-mono text-center">or hold Space</p>

            <div className="flex gap-2">
              <button
                onClick={() => { setMicMode(false); if (mic.running) mic.stop(); }}
                className={`flex-1 py-2 rounded text-sm font-mono min-h-[40px] transition-colors border ${
                  !micMode
                    ? "bg-violet-500/20 text-violet-300 border-violet-400/40"
                    : "bg-white/5 text-white/50 hover:bg-white/10 border-white/10"
                }`}
              >
                Demo
              </button>
              <button
                onClick={async () => { setMicMode(true); if (!mic.running) await mic.start(); }}
                className={`flex-1 py-2 rounded text-sm font-mono min-h-[40px] transition-colors border ${
                  micMode
                    ? "bg-cyan-500/20 text-cyan-300 border-cyan-400/40"
                    : "bg-white/5 text-white/50 hover:bg-white/10 border-white/10"
                }`}
              >
                Mic
              </button>
            </div>

            {mic.error && (
              <p className="text-rose-300 text-sm">{mic.error}</p>
            )}
          </div>
        </div>

        {/* Spectrum canvas */}
        <div className="flex-1 flex flex-col p-4 gap-2 min-h-[300px]">
          <div className="flex justify-between items-center">
            <p className="text-white/75 text-sm font-mono">
              Sideband spectrum — |J&#8345;(&#946;)|
            </p>
            <span className="text-white/40 text-xs font-mono">
              {micMode && mic.running ? "● mic · bass drives β" : "○ demo LFO"}
            </span>
          </div>

          <canvas
            ref={canvasRef}
            className="flex-1 rounded-lg border border-white/10 min-h-[220px]"
          />

          <p className="text-white/55 text-sm font-mono">
            <span className="text-violet-300">C</span> = carrier at {fHz} Hz &nbsp;·&nbsp;
            f&#x2098; = {fmHz} Hz &nbsp;·&nbsp;
            depth = &#946; &times; f&#x2c = {depth} Hz
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-2.5 border-t border-white/10 flex justify-between items-center">
        <span className="text-white/40 text-xs font-mono">
          Yamaha DX7 algorithm · modulator &#8594; carrier.frequency · Web Audio · zero deps
        </span>
        <Link href="/dream/79-fm-explorer/README.md" className="text-white/40 text-xs hover:text-white/60 transition-colors">
          design notes &#8599;
        </Link>
      </div>
    </div>
  );
}
