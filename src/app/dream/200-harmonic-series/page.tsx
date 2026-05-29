"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

// ── pitch detection (same autocorrelation as 13-piano-canvas) ─────────────

function detectPitch(buf: Float32Array, sampleRate: number): number {
  const n = buf.length;
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n);
  if (rms < 0.012) return 0;

  const ac = new Float32Array(n);
  for (let lag = 0; lag < n; lag++) {
    let s = 0;
    for (let i = 0; i < n - lag; i++) s += buf[i] * buf[i + lag];
    ac[lag] = s;
  }
  if (ac[0] === 0) return 0;

  const acn = new Float32Array(n);
  for (let i = 0; i < n; i++) acn[i] = ac[i] / ac[0];

  let minBin = 0;
  while (minBin < n - 1 && acn[minBin + 1] < acn[minBin]) minBin++;
  let maxVal = 0, maxBin = minBin;
  for (let i = minBin; i < n; i++) {
    if (acn[i] > maxVal) { maxVal = acn[i]; maxBin = i; }
  }
  if (maxVal < 0.82) return 0;

  const y0 = acn[Math.max(0, maxBin - 1)];
  const y1 = acn[maxBin];
  const y2 = acn[Math.min(n - 1, maxBin + 1)];
  const denom = 2 * (2 * y1 - y0 - y2);
  const refined = denom !== 0 ? maxBin + (y0 - y2) / denom : maxBin;
  const freq = sampleRate / refined;
  if (freq < 24 || freq > 4500) return 0;
  return freq;
}

function freqToNoteName(freq: number): string {
  if (freq <= 0) return "—";
  const midi = Math.round(69 + 12 * Math.log2(freq / 440));
  const names = ["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"];
  return `${names[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

// ── harmonic colors (same band palette as 1-live) ────────────────────────

const HARMONIC_COLORS: ReadonlyArray<[number,number,number]> = [
  [88,32,192],[88,32,192],[32,168,220],[32,168,220],  // 1–4: violet, cyan
  [80,220,100],[80,220,100],[240,220,70],[240,220,70], // 5–8: green, yellow
  [255,150,40],[255,150,40],[255,80,60],[255,80,60],   // 9–12: orange, red
  [255,60,120],[255,60,120],[200,60,200],[200,60,200], // 13–16: magenta, purple
];

// Inharmonicity factor for each preset (index i → partial_freq = fund × (i+1) × factor[i])
// For most presets = 1.0 (harmonic). Bell uses stretched series.
interface Preset {
  name: string;
  label: string;
  amps: number[]; // 16 values, 0–1
}

// Amplitude profile for each instrument preset
const PRESETS: Preset[] = [
  {
    name: "Natural",
    label: "Natural (1/n)",
    amps: Array.from({length:16},(_,i)=>1/(i+1)),
  },
  {
    name: "Flute",
    label: "Flute",
    amps: [1, 0.1, 0.05, 0.02, 0.01, 0.005, 0.002, 0.001, 0,0,0,0,0,0,0,0],
  },
  {
    name: "Clarinet",
    label: "Clarinet (odd)",
    amps: [1,0,0.75,0,0.5,0,0.3,0,0.18,0,0.1,0,0.05,0,0.02,0],
  },
  {
    name: "Violin",
    label: "Violin",
    amps: [1,0.9,0.8,0.7,0.6,0.5,0.4,0.3,0.2,0.15,0.1,0.07,0.05,0.03,0.02,0.01],
  },
  {
    name: "Organ",
    label: "Pipe Organ",
    amps: [1,1,1,1,0.8,0.8,0.6,0.6,0.4,0.4,0.2,0.2,0.1,0.1,0.05,0.05],
  },
  {
    name: "Bell",
    label: "Bell (inharmonic)",
    amps: [1,0,0.9,0,0.8,0,0.7,0,0,0.4,0,0,0.2,0,0,0.1],
  },
  {
    name: "Brass",
    label: "Brass",
    amps: [0.3,1,0.9,0.8,0.7,0.5,0.3,0.2,0.1,0.05,0.02,0.01,0,0,0,0],
  },
  {
    name: "Oboe",
    label: "Oboe",
    amps: [0.8,1,0.6,0.9,0.4,0.7,0.3,0.5,0.2,0.3,0.1,0.15,0.05,0.07,0.02,0.03],
  },
];

// Bell partial multipliers (slightly inharmonic like a real bell)
const BELL_RATIOS = [1, 1.5, 2, 2.47, 2.98, 3.5, 4.0, 4.44, 5.0, 5.56, 6.14, 6.72, 7.3, 7.9, 8.5, 9.1];

const NUM_PARTIALS = 16;

export default function HarmonicSeries() {
  const [mode, setMode] = useState<"idle"|"demo"|"mic">("idle");
  const [presetIdx, setPresetIdx] = useState(0);
  const [active, setActive] = useState<boolean[]>(Array(NUM_PARTIALS).fill(true));
  const [amps, setAmps] = useState<number[]>(PRESETS[0].amps.slice());
  const [fundamental, setFundamental] = useState(130.81); // C3
  const [noteName, setNoteName] = useState("C3");
  const [error, setError] = useState<string|null>(null);
  const [levels, setLevels] = useState<number[]>(Array(NUM_PARTIALS).fill(0));

  const actxRef = useRef<AudioContext|null>(null);
  const oscsRef = useRef<OscillatorNode[]>([]);
  const gainsRef = useRef<GainNode[]>([]);
  const masterRef = useRef<GainNode|null>(null);
  const analyserRef = useRef<AnalyserNode|null>(null);
  const timeBufRef = useRef<Float32Array|null>(null);
  const streamRef = useRef<MediaStream|null>(null);
  const animRef = useRef(0);
  const fundRef = useRef(130.81);
  const activeRef = useRef<boolean[]>(Array(NUM_PARTIALS).fill(true));
  const ampsRef = useRef<number[]>(PRESETS[0].amps.slice());
  const isBellRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement|null>(null);
  const demoLfoRef = useRef(0);

  // Sync refs
  useEffect(() => { fundRef.current = fundamental; }, [fundamental]);
  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { ampsRef.current = amps; }, [amps]);

  // Build the audio graph
  const buildGraph = useCallback((actx: AudioContext) => {
    // Tear down old
    oscsRef.current.forEach(o => { try { o.stop(); o.disconnect(); } catch(_){} });
    oscsRef.current = [];
    gainsRef.current.forEach(g => g.disconnect());
    gainsRef.current = [];
    if (masterRef.current) { masterRef.current.disconnect(); masterRef.current = null; }

    const master = actx.createGain();
    master.gain.value = 0.18;
    master.connect(actx.destination);
    masterRef.current = master;

    const isBell = isBellRef.current;
    const fund = fundRef.current;
    const ampArr = ampsRef.current;
    const actArr = activeRef.current;

    for (let i = 0; i < NUM_PARTIALS; i++) {
      const osc = actx.createOscillator();
      osc.type = "sine";
      const ratio = isBell ? BELL_RATIOS[i] : (i + 1);
      osc.frequency.value = fund * ratio;

      const gain = actx.createGain();
      gain.gain.value = actArr[i] ? ampArr[i] * 0.5 : 0;

      osc.connect(gain);
      gain.connect(master);
      osc.start();
      oscsRef.current.push(osc);
      gainsRef.current.push(gain);
    }
  }, []);

  // Update oscillator frequencies when fundamental changes
  const applyFundamental = useCallback((freq: number) => {
    const isBell = isBellRef.current;
    oscsRef.current.forEach((osc, i) => {
      const ratio = isBell ? BELL_RATIOS[i] : (i + 1);
      osc.frequency.setTargetAtTime(freq * ratio, oscsRef.current[0].context.currentTime, 0.04);
    });
  }, []);

  // Update gain for a partial
  const applyPartialGain = useCallback((i: number, isActive: boolean, amp: number) => {
    const g = gainsRef.current[i];
    if (!g) return;
    const target = isActive ? amp * 0.5 : 0;
    g.gain.setTargetAtTime(target, g.context.currentTime, 0.02);
  }, []);

  const startDemo = useCallback(async () => {
    const Ctx: typeof AudioContext = window.AudioContext || (window as unknown as {webkitAudioContext: typeof AudioContext}).webkitAudioContext;
    const actx = new Ctx();
    actxRef.current = actx;
    isBellRef.current = presetIdx === 5; // Bell preset
    buildGraph(actx);
    setMode("demo");
    setError(null);
  }, [buildGraph, presetIdx]);

  const startMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });
      streamRef.current = stream;
      const Ctx: typeof AudioContext = window.AudioContext || (window as unknown as {webkitAudioContext: typeof AudioContext}).webkitAudioContext;
      const actx = new Ctx();
      actxRef.current = actx;

      const source = actx.createMediaStreamSource(stream);
      const analyser = actx.createAnalyser();
      analyser.fftSize = 4096;
      source.connect(analyser);
      analyserRef.current = analyser;
      timeBufRef.current = new Float32Array(4096);

      isBellRef.current = presetIdx === 5;
      buildGraph(actx);
      setMode("mic");
      setError(null);
    } catch(e) {
      setError(e instanceof Error ? e.message : "Mic unavailable");
    }
  }, [buildGraph, presetIdx]);

  const stop = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    oscsRef.current.forEach(o => { try { o.stop(); o.disconnect(); } catch(_){} });
    oscsRef.current = [];
    gainsRef.current.forEach(g => g.disconnect());
    gainsRef.current = [];
    if (masterRef.current) { masterRef.current.disconnect(); masterRef.current = null; }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    void actxRef.current?.close();
    actxRef.current = null;
    analyserRef.current = null;
    setMode("idle");
    setLevels(Array(NUM_PARTIALS).fill(0));
  }, []);

  useEffect(() => () => stop(), [stop]);

  // Animation + pitch detection loop
  useEffect(() => {
    if (mode === "idle") return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");

    let t = 0;
    const tick = () => {
      animRef.current = requestAnimationFrame(tick);
      t += 1;

      // Mic pitch detection
      if (mode === "mic" && analyserRef.current && timeBufRef.current) {
        analyserRef.current.getFloatTimeDomainData(timeBufRef.current as unknown as Float32Array<ArrayBuffer>);
        const sr = actxRef.current?.sampleRate ?? 44100;
        const detected = detectPitch(timeBufRef.current, sr);
        if (detected > 0 && Math.abs(detected - fundRef.current) > 2) {
          fundRef.current = detected;
          setFundamental(detected);
          setNoteName(freqToNoteName(detected));
          applyFundamental(detected);
        }
      }

      // Demo: slow LFO on fundamental pitch (wobble ±1%)
      if (mode === "demo") {
        demoLfoRef.current += 0.004;
        const wobble = fundRef.current * (1 + 0.008 * Math.sin(demoLfoRef.current));
        applyFundamental(wobble);
      }

      // Compute "instantaneous level" per partial = how loud it would be
      const newLevels = ampsRef.current.map((a, i) => activeRef.current[i] ? a : 0);
      setLevels(newLevels);

      // Draw sine traces on canvas
      if (!ctx || !canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        ctx.scale(dpr, dpr);
      }
      ctx.clearRect(0, 0, W, H);

      const rowH = H / NUM_PARTIALS;
      for (let i = 0; i < NUM_PARTIALS; i++) {
        const amp = activeRef.current[i] ? ampsRef.current[i] : 0;
        if (amp === 0) continue;
        const [r,g,b] = HARMONIC_COLORS[i];
        const cy = (i + 0.5) * rowH;
        const freq = (i + 1); // relative frequency for animation speed
        const visAmp = Math.max(0.06, amp) * rowH * 0.38;

        ctx.beginPath();
        ctx.strokeStyle = `rgba(${r},${g},${b},${0.4 + amp * 0.5})`;
        ctx.lineWidth = 1.5;
        for (let x = 0; x <= W; x += 2) {
          const phase = (t * 0.04 * freq) + (x / W) * Math.PI * 2 * Math.min(freq, 8);
          const y = cy + Math.sin(phase) * visAmp;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [mode, applyFundamental]);

  // Apply preset
  const applyPreset = useCallback((idx: number) => {
    const p = PRESETS[idx];
    const newAmps = p.amps.slice();
    const newActive = newAmps.map(a => a > 0);
    setPresetIdx(idx);
    setAmps(newAmps);
    setActive(newActive);
    ampsRef.current = newAmps;
    activeRef.current = newActive;
    isBellRef.current = idx === 5;

    // Rebuild graph if running (to apply inharmonicity change for Bell)
    if (actxRef.current) {
      isBellRef.current = idx === 5;
      buildGraph(actxRef.current);
    } else {
      newAmps.forEach((a, i) => applyPartialGain(i, newActive[i], a));
    }
  }, [buildGraph, applyPartialGain]);

  // Toggle a partial
  const togglePartial = useCallback((i: number) => {
    setActive(prev => {
      const next = [...prev];
      next[i] = !next[i];
      activeRef.current = next;
      applyPartialGain(i, next[i], ampsRef.current[i]);
      return next;
    });
  }, [applyPartialGain]);

  const isRunning = mode !== "idle";

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <div className="px-5 pt-6 pb-2 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-mono font-semibold text-white/95">Harmonic Series</h1>
          <p className="text-base text-white/75 mt-1 max-w-lg">
            Every sound is a sum of sine waves. Toggle partials to hear WHY different instruments sound different.
          </p>
        </div>
        <Link href="/dream" className="text-sm text-white/55 hover:text-white/80 transition-colors shrink-0 ml-4 mt-1">
          ← dream lab
        </Link>
      </div>

      {/* Controls row */}
      <div className="px-5 py-3 flex flex-wrap gap-3 items-center border-b border-white/10">
        {/* Preset buttons */}
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p, i) => (
            <button
              key={p.name}
              onClick={() => applyPreset(i)}
              className={`px-3 py-2 text-sm font-mono rounded min-h-[36px] transition-colors
                ${presetIdx === i
                  ? "bg-violet-500/30 text-violet-200 border border-violet-400/50"
                  : "bg-white/5 text-white/70 border border-white/10 hover:bg-white/10"}`}
            >
              {p.name}
            </button>
          ))}
        </div>

        {/* Fundamental display */}
        <div className="ml-auto text-right shrink-0">
          <div className="text-xl font-mono text-white/95">{noteName}</div>
          <div className="text-xs text-white/55">{fundamental.toFixed(1)} Hz</div>
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Partial rows */}
        <div className="flex flex-col flex-1 min-w-0">
          {Array.from({length: NUM_PARTIALS}, (_, i) => {
            const amp = amps[i];
            const on = active[i];
            const [r,g,b] = HARMONIC_COLORS[i];
            const isBell = presetIdx === 5;
            const ratio = isBell ? BELL_RATIOS[i] : (i + 1);
            const partialHz = fundamental * ratio;
            const levelPct = on ? Math.round(amp * 100) : 0;
            return (
              <button
                key={i}
                onClick={() => togglePartial(i)}
                className={`flex items-center gap-3 px-4 border-b border-white/5 flex-1 min-h-[40px]
                  transition-colors text-left
                  ${on ? "hover:bg-white/5" : "hover:bg-white/[0.03] opacity-40"}`}
              >
                {/* Partial number */}
                <span
                  className="text-sm font-mono w-6 shrink-0 text-right"
                  style={{ color: `rgb(${r},${g},${b})` }}
                >
                  {i + 1}
                </span>

                {/* Freq label */}
                <span className="text-xs font-mono text-white/55 w-20 shrink-0">
                  {partialHz < 1000
                    ? `${partialHz.toFixed(0)} Hz`
                    : `${(partialHz/1000).toFixed(2)} kHz`}
                </span>

                {/* Level bar */}
                <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-none"
                    style={{
                      width: `${levelPct}%`,
                      backgroundColor: `rgba(${r},${g},${b},${on ? 0.85 : 0.3})`,
                    }}
                  />
                </div>

                {/* Amplitude % */}
                <span className="text-xs font-mono text-white/55 w-10 text-right shrink-0">
                  {levelPct > 0 ? `${levelPct}%` : "—"}
                </span>

                {/* On/off indicator */}
                <span className={`w-2 h-2 rounded-full shrink-0 ${on ? "bg-white/60" : "bg-white/15"}`} />
              </button>
            );
          })}
        </div>

        {/* Sine wave canvas */}
        <div className="w-48 sm:w-64 border-l border-white/10 relative">
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
          {mode === "idle" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs text-white/30 font-mono text-center px-3">
                start to see<br />sine traces
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Footer / start buttons */}
      <div className="px-5 py-4 border-t border-white/10 flex flex-wrap gap-3 items-center">
        {!isRunning ? (
          <>
            <button
              onClick={startDemo}
              className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-base font-mono rounded min-h-[44px] transition-colors"
            >
              ▶ Start demo
            </button>
            <button
              onClick={startMic}
              className="px-5 py-2.5 bg-white/10 hover:bg-white/15 text-white text-base font-mono rounded min-h-[44px] transition-colors"
            >
              🎤 Start mic
            </button>
            <span className="text-sm text-white/55">
              Mic mode locks the fundamental to your detected pitch.
            </span>
          </>
        ) : (
          <>
            <button
              onClick={stop}
              className="px-5 py-2.5 bg-white/10 hover:bg-white/15 text-white text-base font-mono rounded min-h-[44px] transition-colors"
            >
              ■ Stop
            </button>
            <span className="text-sm text-white/75">
              {mode === "mic" ? `Listening · ${noteName}` : `Demo · ${noteName}`}
            </span>
            <span className="text-xs text-white/55 ml-auto">Click any row to toggle that partial</span>
          </>
        )}
        {error && <span className="text-rose-300 text-sm">{error}</span>}
      </div>

      {/* Footer meta */}
      <div className="px-5 pb-4 flex justify-between items-center">
        <span className="text-xs text-white/40">
          cycle 233 · harmonic series · zero deps
        </span>
        <Link href="/dream/200-harmonic-series/README.md" className="text-xs text-white/40 hover:text-white/70">
          design notes ↗
        </Link>
      </div>
    </div>
  );
}
