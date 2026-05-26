"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────
type BarLen = 1 | 2 | 4;
type SlotState = "empty" | "recording" | "looping" | "muted" | "processing";

// ── Constants ──────────────────────────────────────────────────
const N = 4;
const BPM0 = 80;
const FADE = 0.08;
const HEX = ["#8b5cf6", "#10b981", "#f59e0b", "#06b6d4"] as const;
const LABELS = ["Sub bass", "Melody", "Arpeggio", "Rhythm"] as const;
const DEMO_BARS: BarLen[] = [2, 2, 1, 1];

// ── Helpers ────────────────────────────────────────────────────
function beatSec(bpm: number) { return 60 / bpm; }
function barSec(bpm: number) { return beatSec(bpm) * 4; }

function fadeEdges(data: Float32Array, sr: number) {
  const fs = Math.min(Math.round(FADE * sr), (data.length / 6) | 0);
  for (let i = 0; i < fs; i++) {
    data[i] *= i / fs;
    data[data.length - 1 - i] *= i / fs;
  }
}

function alignedStart(now: number, origin: number, bpm: number): number {
  const bd = barSec(bpm);
  const phase = ((now - origin) % bd + bd) % bd;
  const wait = phase < 0.015 ? 0 : bd - phase;
  const t = now + wait;
  return t < now + 0.02 ? t + bd : t;
}

function downsample(buf: AudioBuffer, pts: number): Float32Array {
  const src = buf.getChannelData(0);
  const out = new Float32Array(pts);
  const step = src.length / pts;
  for (let i = 0; i < pts; i++) {
    const a = Math.floor(i * step);
    const b = Math.floor((i + 1) * step);
    let peak = 0;
    for (let j = a; j < b; j++) { const v = Math.abs(src[j]); if (v > peak) peak = v; }
    out[i] = peak;
  }
  return out;
}

async function renderDemo(sr: number, sec: number, bpm: number, idx: number): Promise<AudioBuffer> {
  const nSamp = Math.round(sec * sr);
  const off = new OfflineAudioContext(1, nSamp, sr);
  const bs = beatSec(bpm);
  const totalBeats = Math.round(sec / bs);

  function sineNote(f: number, t: number, d: number, a: number) {
    const o = off.createOscillator(); const g = off.createGain();
    o.type = "sine"; o.frequency.value = f;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(a, t + 0.008);
    g.gain.setValueAtTime(a, t + d - Math.min(0.1, d * 0.28));
    g.gain.linearRampToValueAtTime(0, t + d);
    o.connect(g); g.connect(off.destination); o.start(t); o.stop(t + d);
  }

  function triNote(f: number, t: number, d: number, a: number) {
    const o = off.createOscillator(); const g = off.createGain();
    o.type = "triangle"; o.frequency.value = f;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(a, t + 0.005);
    g.gain.setValueAtTime(a, t + d - Math.min(0.08, d * 0.25));
    g.gain.linearRampToValueAtTime(0, t + d);
    o.connect(g); g.connect(off.destination); o.start(t); o.stop(t + d);
  }

  if (idx === 0) {
    // Sub-bass: C2 + G2 drone + C3 beat accents
    const d1 = off.createOscillator(); const d2 = off.createOscillator();
    const gd = off.createGain();
    d1.frequency.value = 65.41; d1.type = "sine";
    d2.frequency.value = 98.0; d2.type = "sine";
    gd.gain.value = 0.27;
    d1.connect(gd); d2.connect(gd); gd.connect(off.destination);
    d1.start(0); d2.start(0); d1.stop(sec); d2.stop(sec);
    for (let b = 0; b < totalBeats; b++) sineNote(130.81, b * bs, bs * 0.55, 0.16);
  } else if (idx === 1) {
    // Melody: C3–E3–G3–A3–C4–A3–G3–E3 over 2 bars
    const mfs = [261.63, 329.63, 392.0, 440.0, 523.25, 440.0, 392.0, 329.63];
    for (let i = 0; i < 8; i++) sineNote(mfs[i], i * bs, bs * 0.85, 0.35);
    for (let i = 0; i < 8; i++) sineNote(mfs[i] * 1.5, barSec(bpm) + i * bs, bs * 0.75, 0.13);
  } else if (idx === 2) {
    // Arpeggio: E4–G4–A4–C5, 16th-note triplets
    const afs = [329.63, 392.0, 440.0, 523.25];
    const nt = bs / 2;
    const cnt = Math.round(sec / nt);
    for (let i = 0; i < cnt; i++) triNote(afs[i % 4], i * nt, nt * 0.82, 0.26);
  } else {
    // Rhythm: kick on beats 1+3, hi-hat every 8th note
    for (let b = 0; b < totalBeats; b++) {
      const t = b * bs;
      if (b % 4 === 0 || b % 4 === 2) {
        const ok = off.createOscillator(); const gk = off.createGain();
        ok.frequency.setValueAtTime(110, t);
        ok.frequency.exponentialRampToValueAtTime(28, t + 0.08);
        gk.gain.setValueAtTime(0.6, t);
        gk.gain.exponentialRampToValueAtTime(0.001, t + 0.30);
        ok.connect(gk); gk.connect(off.destination); ok.start(t); ok.stop(t + 0.32);
      }
      for (const offset of [0, bs / 2]) {
        const hhLen = 0.055;
        const hb = off.createBuffer(1, Math.round(hhLen * sr), sr);
        const hd = hb.getChannelData(0);
        for (let i = 0; i < hd.length; i++) hd[i] = (Math.random() * 2 - 1) * (1 - i / hd.length);
        const hs = off.createBufferSource(); hs.buffer = hb;
        const hf = off.createBiquadFilter(); hf.type = "highpass"; hf.frequency.value = 7500;
        const hg = off.createGain();
        hg.gain.setValueAtTime(offset === 0 && (b % 4 === 0 || b % 4 === 2) ? 0.18 : 0.13, t + offset);
        hg.gain.exponentialRampToValueAtTime(0.001, t + offset + hhLen);
        hs.connect(hf); hf.connect(hg); hg.connect(off.destination); hs.start(t + offset);
      }
    }
  }

  const rendered = await off.startRendering();
  fadeEdges(rendered.getChannelData(0), sr);
  return rendered;
}

// ── Component ──────────────────────────────────────────────────
export default function LoopStation() {
  const ctxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micSrcRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const clockRef = useRef<number | null>(null);
  const gainNodesRef = useRef<GainNode[] | null>(null);
  const srcNodesRef = useRef<(AudioBufferSourceNode | null)[]>(Array(N).fill(null));
  const bufsRef = useRef<(AudioBuffer | null)[]>(Array(N).fill(null));
  const playAtRef = useRef<number[]>(Array(N).fill(0));
  const waveDataRef = useRef<(Float32Array | null)[]>(Array(N).fill(null));
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>(Array(N).fill(null));
  const rafRef = useRef(0);
  const bpmRef = useRef(BPM0);
  const tapTimesRef = useRef<number[]>([]);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recLevelRef = useRef(0);
  const recSlotRef = useRef(-1);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<BlobPart[]>([]);
  const barLensRef = useRef<BarLen[]>(DEMO_BARS.slice());
  const statesRef = useRef<SlotState[]>(Array(N).fill("empty") as SlotState[]);
  const timeDomBufRef = useRef<Float32Array | null>(null);

  const [bpm, setBpm] = useState(BPM0);
  const [states, setStates] = useState<SlotState[]>(Array(N).fill("empty") as SlotState[]);
  const [barLens, setBarLens] = useState<BarLen[]>(DEMO_BARS.slice());
  const [demoLoading, setDemoLoading] = useState(false);

  const pushState = useCallback((i: number, s: SlotState) => {
    statesRef.current = statesRef.current.map((c, j) => j === i ? s : c) as SlotState[];
    setStates([...statesRef.current]);
  }, []);

  const getCtx = useCallback((): AudioContext => {
    if (!ctxRef.current || ctxRef.current.state === "closed") {
      ctxRef.current = new AudioContext();
      gainNodesRef.current = Array.from({ length: N }, () => {
        const g = ctxRef.current!.createGain();
        g.connect(ctxRef.current!.destination);
        return g;
      });
    }
    if (ctxRef.current.state === "suspended") ctxRef.current.resume().catch(() => {});
    return ctxRef.current;
  }, []);

  const startLoop = useCallback((i: number, buf: AudioBuffer) => {
    const ctx = getCtx();
    srcNodesRef.current[i]?.stop();
    srcNodesRef.current[i] = null;
    bufsRef.current[i] = buf;
    waveDataRef.current[i] = downsample(buf, 200);
    gainNodesRef.current![i].gain.cancelScheduledValues(0);
    gainNodesRef.current![i].gain.value = 1;

    let startAt: number;
    if (clockRef.current === null) {
      startAt = ctx.currentTime + 0.05;
      clockRef.current = startAt;
    } else {
      startAt = alignedStart(ctx.currentTime, clockRef.current, bpmRef.current);
    }

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopStart = 0;
    src.loopEnd = buf.duration;
    src.connect(gainNodesRef.current![i]);
    src.start(startAt);
    srcNodesRef.current[i] = src;
    playAtRef.current[i] = startAt;
    pushState(i, "looping");
  }, [getCtx, pushState]);

  const loadDemo = useCallback(async () => {
    if (demoLoading) return;
    setDemoLoading(true);
    try {
      const ctx = getCtx();
      const sr = ctx.sampleRate;
      const bufs = await Promise.all(
        DEMO_BARS.map((bars, i) => renderDemo(sr, barSec(BPM0) * bars, BPM0, i))
      );
      // Reset clock so all demo loops share beat-1
      clockRef.current = null;
      bufs.forEach((b, i) => startLoop(i, b));
    } catch (err) {
      console.error("Demo render error:", err);
    }
    setDemoLoading(false);
  }, [demoLoading, getCtx, startLoop]);

  const changeBpm = useCallback((delta: number) => {
    setBpm(prev => {
      const nb = Math.max(40, Math.min(200, prev + delta));
      bpmRef.current = nb;
      return nb;
    });
  }, []);

  const tapTempo = useCallback(() => {
    const now = performance.now();
    tapTimesRef.current.push(now);
    if (tapTimesRef.current.length > 8) tapTimesRef.current.shift();
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => {
      const ts = tapTimesRef.current;
      if (ts.length >= 2) {
        const iois = ts.slice(1).map((t, i) => t - ts[i]).filter(d => d > 200 && d < 2000);
        if (iois.length > 0) {
          const sorted = iois.slice().sort((a, b) => a - b);
          const med = sorted[Math.floor(sorted.length / 2)];
          const nb = Math.round(Math.min(200, Math.max(40, 60000 / med)));
          bpmRef.current = nb;
          setBpm(nb);
        }
      }
      tapTimesRef.current = [];
    }, 1600);
  }, []);

  const toggleRec = useCallback(async (i: number) => {
    const curState = statesRef.current[i];
    if (curState === "recording") {
      recorderRef.current?.stop();
      return;
    }
    if (curState === "processing") return;

    // Clear existing loop on this slot
    if (curState === "looping" || curState === "muted") {
      srcNodesRef.current[i]?.stop();
      srcNodesRef.current[i] = null;
      bufsRef.current[i] = null;
      waveDataRef.current[i] = null;
    }

    const ctx = getCtx();
    if (!micStreamRef.current) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
        micStreamRef.current = stream;
        const micSrc = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        micSrc.connect(analyser);
        micSrcRef.current = micSrc;
        micAnalyserRef.current = analyser;
        timeDomBufRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
      } catch {
        return;
      }
    }

    const capturedBarLen = barLensRef.current[i];
    recSlotRef.current = i;
    recChunksRef.current = [];
    const recorder = new MediaRecorder(micStreamRef.current);
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recChunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      pushState(i, "processing");
      try {
        const blob = new Blob(recChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const ab = await blob.arrayBuffer();
        const decoded = await ctx.decodeAudioData(ab);
        const recSec = decoded.duration;
        const barsRec = Math.max(1, Math.round(recSec / barSec(bpmRef.current)));
        const targetBars = Math.min(Math.max(1, barsRec), capturedBarLen);
        const targetN = Math.round(targetBars * barSec(bpmRef.current) * decoded.sampleRate);
        const finalBuf = ctx.createBuffer(1, Math.max(targetN, 100), decoded.sampleRate);
        const srcData = decoded.getChannelData(0);
        const dstData = finalBuf.getChannelData(0);
        for (let j = 0; j < Math.min(targetN, srcData.length); j++) dstData[j] = srcData[j];
        fadeEdges(dstData, decoded.sampleRate);
        startLoop(i, finalBuf);
      } catch {
        pushState(i, "empty");
      }
    };

    recorder.start(100);
    pushState(i, "recording");
  }, [getCtx, pushState, startLoop]);

  const toggleMute = useCallback((i: number) => {
    const s = statesRef.current[i];
    if (s !== "looping" && s !== "muted") return;
    const g = gainNodesRef.current?.[i];
    if (!g || !ctxRef.current) return;
    if (s === "looping") {
      g.gain.setTargetAtTime(0, ctxRef.current.currentTime, 0.02);
      pushState(i, "muted");
    } else {
      g.gain.setTargetAtTime(1, ctxRef.current.currentTime, 0.02);
      pushState(i, "looping");
    }
  }, [pushState]);

  const clearSlot = useCallback((i: number) => {
    srcNodesRef.current[i]?.stop();
    srcNodesRef.current[i] = null;
    bufsRef.current[i] = null;
    waveDataRef.current[i] = null;
    const g = gainNodesRef.current?.[i];
    if (g && ctxRef.current) g.gain.setTargetAtTime(1, ctxRef.current.currentTime, 0.01);
    pushState(i, "empty");
  }, [pushState]);

  const pickBarLen = useCallback((i: number, bl: BarLen) => {
    barLensRef.current[i] = bl;
    setBarLens(prev => { const n = [...prev]; n[i] = bl; return n; });
  }, []);

  // Draw loop — reads refs only
  useEffect(() => {
    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const audioCtx = ctxRef.current;

      for (let i = 0; i < N; i++) {
        const canvas = canvasRefs.current[i];
        if (!canvas) continue;
        const c = canvas.getContext("2d");
        if (!c) continue;
        const W = canvas.width, H = canvas.height;
        c.fillStyle = "#08081a";
        c.fillRect(0, 0, W, H);

        const state = statesRef.current[i];
        const col = HEX[i];

        if (state === "empty") {
          c.fillStyle = "rgba(255,255,255,0.13)";
          c.font = `${(H * 0.3) | 0}px monospace`;
          c.textAlign = "center";
          c.fillText("— empty —", W / 2, H * 0.62);
        } else if (state === "recording") {
          const analyser = micAnalyserRef.current;
          const tbuf = timeDomBufRef.current;
          if (analyser && tbuf) {
            analyser.getFloatTimeDomainData(tbuf as unknown as Float32Array<ArrayBuffer>);
            let rms = 0;
            for (let j = 0; j < tbuf.length; j++) rms += tbuf[j] * tbuf[j];
            recLevelRef.current = recLevelRef.current * 0.82 + Math.sqrt(rms / tbuf.length) * 0.18;
          }
          const lvl = Math.min(1, recLevelRef.current * 7);
          c.fillStyle = col + "99";
          c.fillRect(0, H * 0.2, W * lvl, H * 0.6);
          c.fillStyle = "#f87171";
          c.font = `bold ${(H * 0.32) | 0}px monospace`;
          c.textAlign = "center";
          c.fillText("● REC", W / 2, H * 0.65);
        } else if (state === "processing") {
          c.fillStyle = "rgba(255,255,255,0.32)";
          c.font = `${(H * 0.28) | 0}px monospace`;
          c.textAlign = "center";
          c.fillText("processing…", W / 2, H * 0.62);
        } else {
          // looping or muted: static waveform + playhead
          const wave = waveDataRef.current[i];
          const buf = bufsRef.current[i];
          if (wave) {
            c.globalAlpha = state === "muted" ? 0.28 : 0.82;
            const bw = W / wave.length;
            for (let j = 0; j < wave.length; j++) {
              const bh = wave[j] * H * 0.88;
              c.fillStyle = col;
              c.fillRect(j * bw, (H - bh) / 2, Math.max(1, bw - 0.6), bh);
            }
            if (state === "looping" && buf && audioCtx) {
              const now = audioCtx.currentTime;
              const sa = playAtRef.current[i];
              if (now >= sa) {
                const px = ((now - sa) % buf.duration) / buf.duration * W;
                c.globalAlpha = 1;
                c.strokeStyle = "rgba(255,255,255,0.92)";
                c.lineWidth = 2;
                c.beginPath(); c.moveTo(px, 0); c.lineTo(px, H); c.stroke();
              }
            }
            c.globalAlpha = 1;
          }
        }
      }
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // Canvas sizing
  useEffect(() => {
    const resize = () => {
      canvasRefs.current.forEach(cv => {
        if (!cv) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        cv.width = cv.clientWidth * dpr;
        cv.height = cv.clientHeight * dpr;
      });
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      srcNodesRef.current.forEach(n => n?.stop());
      micStreamRef.current?.getTracks().forEach(t => t.stop());
      ctxRef.current?.close().catch(() => {});
    };
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-[#08081a] px-4 pt-5 pb-8 gap-4">
      {/* Header */}
      <div className="w-full max-w-md mx-auto">
        <h1 className="text-2xl font-mono tracking-tight text-white/95">Loop Station</h1>
        <p className="text-base text-white/75 mt-1 leading-snug">
          Build a multi-layer performance in real time. All loops snap to the beat grid
          and play phase-locked. Load the demo or tap REC to record.
        </p>
      </div>

      {/* BPM row */}
      <div className="w-full max-w-md mx-auto flex items-center gap-2">
        <span className="text-sm font-mono text-white/55 w-10">BPM</span>
        <button
          onClick={() => changeBpm(-2)}
          className="px-3 py-2 text-sm font-mono border border-white/15 rounded hover:border-white/35 text-white/75 min-h-[44px] min-w-[44px] transition"
        >−</button>
        <span className="text-lg font-mono text-white/95 w-12 text-center tabular-nums">{bpm}</span>
        <button
          onClick={() => changeBpm(2)}
          className="px-3 py-2 text-sm font-mono border border-white/15 rounded hover:border-white/35 text-white/75 min-h-[44px] min-w-[44px] transition"
        >+</button>
        <button
          onClick={tapTempo}
          className="px-4 py-2 text-sm font-mono border border-white/25 rounded hover:border-white/50 text-white/80 min-h-[44px] flex-1 transition"
        >TAP TEMPO</button>
      </div>

      {/* Slot rows */}
      <div className="w-full max-w-md mx-auto flex flex-col gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex flex-col gap-2 bg-white/[0.03] rounded-xl p-3 border border-white/[0.07]"
          >
            {/* Slot header */}
            <div className="flex items-center gap-2">
              <span
                className="text-xs font-mono font-semibold"
                style={{ color: HEX[i] }}
              >{LABELS[i]}</span>
              <div className="flex gap-1 ml-auto">
                {([1, 2, 4] as BarLen[]).map(bl => (
                  <button
                    key={bl}
                    onClick={() => pickBarLen(i, bl)}
                    className={`text-xs font-mono px-2 py-1 rounded transition min-h-[28px] min-w-[28px] ${
                      barLens[i] === bl
                        ? "text-white/90 border border-white/40 bg-white/5"
                        : "text-white/30 border border-white/10 hover:border-white/25 hover:text-white/60"
                    }`}
                  >{bl}b</button>
                ))}
              </div>
            </div>

            {/* Waveform canvas */}
            <canvas
              ref={el => { canvasRefs.current[i] = el; }}
              className="w-full rounded"
              style={{ height: "52px", background: "#08081a" }}
            />

            {/* Controls */}
            <div className="flex gap-2">
              <button
                onClick={() => toggleRec(i)}
                className={`px-4 py-2.5 text-sm font-mono rounded min-h-[44px] flex-1 transition border ${
                  states[i] === "recording"
                    ? "bg-rose-500/20 border-rose-400/80 text-rose-300"
                    : states[i] === "processing"
                    ? "border-white/15 text-white/35 cursor-not-allowed"
                    : "border-white/20 text-white/75 hover:border-white/45 hover:text-white/95"
                }`}
              >
                {states[i] === "recording" ? "■ STOP" : states[i] === "processing" ? "…" : "● REC"}
              </button>
              <button
                onClick={() => toggleMute(i)}
                disabled={states[i] !== "looping" && states[i] !== "muted"}
                className={`px-4 py-2.5 text-sm font-mono rounded min-h-[44px] border transition ${
                  states[i] === "muted"
                    ? "border-amber-400/70 text-amber-300 bg-amber-500/10"
                    : "border-white/15 text-white/55 hover:border-white/30 hover:text-white/80 disabled:opacity-25 disabled:cursor-not-allowed"
                }`}
              >MUTE</button>
              <button
                onClick={() => clearSlot(i)}
                className="px-3 py-2.5 text-sm font-mono rounded min-h-[44px] border border-white/10 text-white/40 hover:border-white/30 hover:text-white/75 transition"
              >✕</button>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="w-full max-w-md mx-auto flex items-center gap-3 flex-wrap pt-1">
        <button
          onClick={loadDemo}
          disabled={demoLoading}
          className="px-5 py-2.5 text-sm font-mono border border-violet-400/50 rounded text-violet-300 hover:border-violet-400 hover:bg-violet-500/10 transition min-h-[44px] disabled:opacity-50"
        >
          {demoLoading ? "Rendering…" : "Load demo"}
        </button>
        <Link
          href="/dream"
          className="text-xs text-white/30 hover:text-white/60 transition ml-auto"
        >
          ← dream lab
        </Link>
      </div>

      <Link
        href="/dream/172-loop-station/readme"
        className="text-[11px] text-white/25 hover:text-white/50 transition self-center"
      >
        design notes →
      </Link>
    </div>
  );
}
