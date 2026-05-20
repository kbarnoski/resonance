"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import Link from "next/link";

// Six-band bloom colors — same palette as 1-live
const BAND_COLORS: ReadonlyArray<[number, number, number]> = [
  [88, 32, 192],   // sub-bass — deep violet
  [32, 168, 220],  // bass — cyan
  [80, 220, 100],  // low-mid — green
  [240, 220, 70],  // mid — yellow
  [255, 150, 40],  // high-mid — orange
  [255, 60, 120],  // high — magenta/red
];

const SECTION_TAGS = [
  "[Intro]", "[Verse]", "[Pre-Chorus]", "[Build Up]",
  "[Chorus]", "[Bridge]", "[Outro]", "[Inst]",
];

const DEFAULT_ARC = `[Intro] single piano note in vast reverb, long silence between phrases
[Build Up] low cello drone enters slowly, pad swells underneath, tension builds
[Chorus] full orchestral peak, bright major resolution, drums and strings
[Outro] instruments fade one by one, piano alone, then silence`;

const DEFAULT_STYLE = "cinematic orchestra, dark ambient, dramatic, 80 BPM";

type ArcPhase = "idle" | "generating" | "playing" | "error";

function peaksFrom(buffer: AudioBuffer, n: number): number[] {
  const ch = buffer.getChannelData(0);
  const step = Math.floor(ch.length / n);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    let max = 0;
    for (let j = 0; j < step; j++) {
      const v = Math.abs(ch[i * step + j] || 0);
      if (v > max) max = v;
    }
    out.push(max);
  }
  return out;
}

export default function ArcComposePage() {
  const [arc, setArc] = useState(DEFAULT_ARC);
  const [style, setStyle] = useState(DEFAULT_STYLE);
  const [arcPhase, setArcPhase] = useState<ArcPhase>("idle");
  const [errMsg, setErrMsg] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [peaks, setPeaks] = useState<number[]>([]);
  const [playhead, setPlayhead] = useState(0);
  const [duration, setDuration] = useState(0);

  const bloomRef = useRef<HTMLCanvasElement | null>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef(0);
  const arcPhaseRef = useRef<ArcPhase>("idle");
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const startTimeRef = useRef(0);

  useEffect(() => { arcPhaseRef.current = arcPhase; }, [arcPhase]);

  // Waveform canvas: redraw on peaks or playhead change
  useEffect(() => {
    const canvas = waveCanvasRef.current;
    if (!canvas || peaks.length === 0) return;
    const gc = canvas.getContext("2d");
    if (!gc) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    gc.scale(dpr, dpr);
    gc.fillStyle = "#000";
    gc.fillRect(0, 0, w, h);
    const bw = w / peaks.length;
    const cy = h / 2;
    peaks.forEach((p, i) => {
      const bh = p * h * 0.85;
      const played = i / peaks.length < playhead;
      gc.fillStyle = played ? "rgba(32,168,220,0.85)" : "rgba(255,255,255,0.18)";
      gc.fillRect(i * bw, cy - bh / 2, Math.max(1, bw - 1), bh);
    });
  }, [peaks, playhead]);

  // Bloom animation during playback
  useEffect(() => {
    if (arcPhase !== "playing") return;
    const canvas = bloomRef.current;
    if (!canvas) return;
    const gc = canvas.getContext("2d");
    if (!gc) return;
    const analyser = analyserRef.current;
    const audioCtx = audioCtxRef.current;
    if (!analyser || !audioCtx) return;

    let w = 0, h = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.offsetWidth;
      h = canvas.offsetHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      gc.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const freqData = new Uint8Array(analyser.frequencyBinCount);
    const BANDS: [number, number][] = [[0,5],[5,15],[15,40],[40,100],[100,200],[200,400]];

    const tick = () => {
      if (arcPhaseRef.current !== "playing") {
        window.removeEventListener("resize", resize);
        return;
      }
      analyser.getByteFrequencyData(freqData);
      const bands = BANDS.map(([lo, hi]) => {
        let s = 0;
        for (let i = lo; i < hi; i++) s += freqData[i];
        return s / ((hi - lo) * 255);
      });

      gc.fillStyle = "rgba(0,0,0,0.15)";
      gc.fillRect(0, 0, w, h);
      gc.globalCompositeOperation = "lighter";
      const cx = w / 2, cy = h / 2;
      const maxR = Math.min(w, h) * 0.48;
      bands.forEach((energy, i) => {
        if (energy < 0.02) return;
        const outer = maxR * (1 - i / bands.length);
        const inner = maxR * (1 - (i + 1) / bands.length);
        const [r, g, b] = BAND_COLORS[i];
        const alpha = Math.min(0.95, 0.12 + energy * 1.2);
        const gr = gc.createRadialGradient(
          cx, cy, inner * (0.6 + 0.4 * energy),
          cx, cy, outer * (1 + 0.15 * energy)
        );
        gr.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
        gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
        gc.fillStyle = gr;
        gc.beginPath();
        gc.arc(cx, cy, outer * (1 + 0.15 * energy), 0, Math.PI * 2);
        gc.fill();
      });
      gc.globalCompositeOperation = "source-over";

      const elapsed = audioCtx.currentTime - startTimeRef.current;
      const dur = bufferRef.current?.duration ?? 1;
      setPlayhead(Math.min(1, elapsed / dur));

      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [arcPhase]);

  const stopPlayback = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch {}
      sourceRef.current = null;
    }
  }, []);

  const beginPlayback = useCallback((buf: AudioBuffer, ctx: AudioContext) => {
    stopPlayback();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.8;
    analyserRef.current = analyser;

    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.connect(analyser);
    analyser.connect(ctx.destination);
    sourceRef.current = source;
    startTimeRef.current = ctx.currentTime;
    source.start();
    setPlayhead(0);
    setArcPhase("playing");
    source.onended = () => {
      setArcPhase("idle");
      setPlayhead(1);
    };
  }, [stopPlayback]);

  const compose = useCallback(async () => {
    if (!arc.trim() || arcPhase === "generating") return;
    stopPlayback();
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close().catch(() => {});
    }
    setArcPhase("generating");
    setErrMsg("");
    setAudioUrl("");
    setPeaks([]);
    setPlayhead(0);
    setDuration(0);

    try {
      const res = await fetch("/dream/48-arc-compose/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arc: arc.trim(), style: style.trim() }),
      });
      const json: { url?: string; error?: string } = await res.json();
      if (!res.ok || json.error) {
        setErrMsg(json.error ?? `HTTP ${res.status}`);
        setArcPhase("error");
        return;
      }
      if (!json.url) {
        setErrMsg("No audio URL in response");
        setArcPhase("error");
        return;
      }

      setAudioUrl(json.url);
      const ac = new AudioContext();
      audioCtxRef.current = ac;
      const resp = await fetch(json.url);
      const ab = await resp.arrayBuffer();
      const decoded = await ac.decodeAudioData(ab);
      bufferRef.current = decoded;
      setDuration(decoded.duration);
      setPeaks(peaksFrom(decoded, 200));
      beginPlayback(decoded, ac);
    } catch (e) {
      setErrMsg(String(e));
      setArcPhase("error");
    }
  }, [arc, style, arcPhase, stopPlayback, beginPlayback]);

  const replay = useCallback(() => {
    const buf = bufferRef.current;
    let ac = audioCtxRef.current;
    if (!buf) return;
    if (!ac || ac.state === "closed") {
      ac = new AudioContext();
      audioCtxRef.current = ac;
    }
    if (ac.state === "suspended") {
      ac.resume().catch(() => {});
    }
    beginPlayback(buf, ac);
  }, [beginPlayback]);

  const addTag = useCallback((tag: string) => {
    setArc(prev => {
      const t = prev.trimEnd();
      return t + (t ? "\n" : "") + tag + " ";
    });
  }, []);

  const isGenerating = arcPhase === "generating";
  const isPlaying = arcPhase === "playing";

  return (
    <div className="min-h-screen bg-black text-white/90 font-mono flex flex-col">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-white/10 flex-none">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h1 className="text-lg tracking-tight">Arc Compose</h1>
            <p className="text-[11px] text-white/40 mt-0.5">
              Write a journey arc with section tags → MiniMax Music 2.6 generates a structured piece ·{" "}
              <span className="text-white/25">$0.03 · FAL_KEY</span>
            </p>
          </div>
          <Link href="/dream" className="text-[11px] text-white/30 hover:text-white/60">
            ← dream
          </Link>
        </div>
      </div>

      {/* Two-column main */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2">
        {/* Left: arc editor */}
        <div className="p-6 border-r border-white/10 flex flex-col gap-4">
          {/* Section tag buttons */}
          <div>
            <p className="text-[10px] text-white/35 tracking-wider uppercase mb-2">Insert section tag</p>
            <div className="flex flex-wrap gap-1.5">
              {SECTION_TAGS.map(tag => (
                <button
                  key={tag}
                  onClick={() => addTag(tag)}
                  className="text-[10px] px-2 py-1 border border-white/20 rounded hover:border-white/50 hover:text-white transition text-white/55"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Arc textarea */}
          <div className="flex flex-col gap-1.5 flex-1">
            <p className="text-[10px] text-white/35 tracking-wider uppercase">Journey arc</p>
            <textarea
              value={arc}
              onChange={e => setArc(e.target.value)}
              className="flex-1 min-h-[200px] bg-white/[0.04] border border-white/15 rounded p-3 text-[12px] text-white/80 leading-relaxed resize-none focus:outline-none focus:border-white/30"
              spellCheck={false}
            />
          </div>

          {/* Style field */}
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] text-white/35 tracking-wider uppercase">Style / genre</p>
            <input
              value={style}
              onChange={e => setStyle(e.target.value)}
              className="bg-white/[0.04] border border-white/15 rounded px-3 py-2 text-[12px] text-white/80 focus:outline-none focus:border-white/30"
              placeholder="cinematic orchestra, 80 BPM, dark ambient"
            />
          </div>

          {/* Compose button */}
          <button
            onClick={compose}
            disabled={isGenerating || !arc.trim()}
            className="py-3 text-sm tracking-wider uppercase border border-white/30 rounded hover:bg-white/5 hover:border-white/60 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isGenerating ? "Composing…" : "▶ Compose"}
          </button>

          {isGenerating && (
            <p className="text-[11px] text-white/35 text-center animate-pulse">
              Reading your arc — 20–40 seconds
            </p>
          )}

          {arcPhase === "error" && (
            <div className="bg-rose-950/30 border border-rose-500/30 rounded p-3 space-y-2">
              <p className="text-[11px] text-rose-300/80 break-all leading-relaxed">{errMsg}</p>
              <p className="text-[10px] text-white/25">
                ⚠ If this is an API error, paste the message and the agent fixes the endpoint next cycle.
              </p>
            </div>
          )}

          <Link
            href="/dream"
            className="text-[10px] text-white/20 hover:text-white/50 transition text-center"
          >
            design notes in README.md ↗
          </Link>
        </div>

        {/* Right: output */}
        <div className="flex flex-col">
          {/* Bloom canvas */}
          <div className="relative flex-1 min-h-[280px]">
            <canvas
              ref={bloomRef}
              className="absolute inset-0 w-full h-full"
              style={{ background: "#000" }}
            />
            {!isPlaying && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <p className="text-[12px] text-white/20 tracking-wider">
                  {isGenerating ? "generating your arc…" : "compose an arc to hear it"}
                </p>
              </div>
            )}
          </div>

          {/* Waveform + controls */}
          {peaks.length > 0 && (
            <div className="p-4 border-t border-white/10 space-y-3">
              <canvas
                ref={waveCanvasRef}
                className="w-full rounded"
                style={{ height: 56 }}
              />
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-white/35">
                  {Math.round(duration)}s · MiniMax Music 2.6
                </p>
                <div className="flex gap-2">
                  {!isPlaying && (
                    <button
                      onClick={replay}
                      className="text-[10px] tracking-wider uppercase text-white/50 hover:text-white border border-white/20 hover:border-white/50 px-3 py-1 rounded transition"
                    >
                      ▶ replay
                    </button>
                  )}
                  {audioUrl && (
                    <a
                      href={audioUrl}
                      download="arc-compose.mp3"
                      className="text-[10px] tracking-wider uppercase text-white/50 hover:text-white border border-white/20 hover:border-white/50 px-3 py-1 rounded transition"
                    >
                      ↓ mp3
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
