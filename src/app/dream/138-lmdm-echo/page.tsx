"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const BAND_COLORS: ReadonlyArray<[number, number, number]> = [
  [88, 32, 192], [32, 168, 220], [80, 220, 100],
  [240, 220, 70], [255, 150, 40], [255, 60, 120],
];

const MAJOR_T = [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0];
const MINOR_T = [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0];

type Phase = "idle" | "recording" | "analyzing" | "generating" | "playing" | "done" | "error";
interface Analysis { quality: "major" | "minor" | "neutral"; bpm: number; register: "low" | "mid" | "high" }

function buildPeaks(buf: AudioBuffer, bins: number): number[] {
  const ch = buf.getChannelData(0);
  const step = Math.max(1, Math.floor(ch.length / bins));
  return Array.from({ length: bins }, (_, i) => {
    let pk = 0;
    for (let j = i * step; j < Math.min(ch.length, (i + 1) * step); j++) {
      const v = Math.abs(ch[j]);
      if (v > pk) pk = v;
    }
    return pk;
  });
}

function extractChroma(fdata: Uint8Array, sr: number): number[] {
  const chroma = new Array(12).fill(0) as number[];
  const fpb = sr / (2 * fdata.length);
  for (let i = 5; i < fdata.length; i++) {
    const f = i * fpb;
    if (f > 5000) break;
    const m = fdata[i] / 255;
    const pc = ((Math.round(12 * Math.log2(f / 440) + 69) % 12) + 12) % 12;
    chroma[pc] += m;
  }
  return chroma;
}

function detectQuality(chroma: number[]): "major" | "minor" | "neutral" {
  const total = chroma.reduce((a, b) => a + b, 0) || 1;
  const n = chroma.map(v => v / total);
  let maj = 0, min = 0;
  for (let r = 0; r < 12; r++) {
    let m = 0, k = 0;
    for (let i = 0; i < 12; i++) {
      m += n[(r + i) % 12] * MAJOR_T[i];
      k += n[(r + i) % 12] * MINOR_T[i];
    }
    if (m > maj) maj = m;
    if (k > min) min = k;
  }
  if (Math.abs(maj - min) < 0.015) return "neutral";
  return maj > min ? "major" : "minor";
}

function buildTags(a: Analysis): string {
  const mood = a.quality === "major" ? "bright hopeful"
    : a.quality === "minor" ? "melancholic introspective"
    : "ambiguous floating";
  const tempo = a.bpm < 65 ? `slow contemplative ${a.bpm} BPM`
    : a.bpm < 100 ? `gentle moderate ${a.bpm} BPM`
    : `flowing ${a.bpm} BPM`;
  const reg = a.register === "low" ? "bass register warm low piano"
    : a.register === "high" ? "treble register crystalline piano"
    : "mid piano register vocal quality";
  return `solo piano, ${mood}, ${tempo}, ${reg}, reverb, instrumental`;
}

function WaveformStrip({ label, peaks, progress, color }: {
  label: string; peaks: number[]; progress: number; color: string;
}) {
  if (peaks.length === 0) return <div className="h-14 bg-white/[0.06] rounded animate-pulse" />;
  return (
    <div>
      <p className="text-white/55 text-xs font-mono mb-1 tracking-widest">{label}</p>
      <div className="relative h-14 bg-white/[0.06] rounded overflow-hidden">
        <div className="absolute inset-0 flex items-end justify-center gap-px px-1">
          {peaks.map((p, i) => {
            const lit = progress > 0 && i / peaks.length < progress;
            return (
              <div
                key={i}
                style={{
                  height: `${Math.max(3, p * 96)}%`,
                  flex: 1,
                  borderRadius: 1,
                  maxWidth: 3,
                  backgroundColor: lit ? color : color + "44",
                }}
              />
            );
          })}
        </div>
        {progress > 0 && progress < 1 && (
          <div
            className="absolute top-0 bottom-0 w-px bg-white/70"
            style={{ left: `${progress * 100}%` }}
          />
        )}
      </div>
    </div>
  );
}

export default function LmdmEcho() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [recSec, setRecSec] = useState(0);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [origPeaks, setOrigPeaks] = useState<number[]>([]);
  const [echoPeaks, setEchoPeaks] = useState<number[]>([]);
  const [playPct, setPlayPct] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");

  const acRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mrRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const storedBlobRef = useRef<Blob | null>(null);
  const chromaRef = useRef<number[]>(new Array(12).fill(0) as number[]);
  const onsetTimesRef = useRef<number[]>([]);
  const centAccRef = useRef({ sum: 0, cnt: 0 });
  const prevRmsRef = useRef(0);
  const lastOnsetRef = useRef(0);
  const loopRef = useRef(0);
  const bloomRef = useRef<HTMLCanvasElement | null>(null);
  const bloomAnimRef = useRef(0);
  const src1Ref = useRef<AudioBufferSourceNode | null>(null);
  const src2Ref = useRef<AudioBufferSourceNode | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playStartRef = useRef(0);
  const playDurRef = useRef(0);
  const storedAnalysisRef = useRef<Analysis | null>(null);
  const playTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    clearInterval(timerRef.current!);
    clearTimeout(playTimeoutRef.current!);
    cancelAnimationFrame(loopRef.current);
    cancelAnimationFrame(bloomAnimRef.current);
    try { src1Ref.current?.stop(); } catch {}
    try { src2Ref.current?.stop(); } catch {}
    acRef.current?.close().catch(() => {});
    mrRef.current?.stream.getTracks().forEach(t => t.stop());
  }, []);

  function stopAll() {
    clearInterval(timerRef.current!);
    clearTimeout(playTimeoutRef.current!);
    cancelAnimationFrame(loopRef.current);
    cancelAnimationFrame(bloomAnimRef.current);
    try { src1Ref.current?.stop(); } catch {}
    try { src2Ref.current?.stop(); } catch {}
    src1Ref.current = null;
    src2Ref.current = null;
    mrRef.current?.stream.getTracks().forEach(t => t.stop());
  }

  async function handleStart() {
    try {
      const oldAc = acRef.current;
      if (oldAc) { oldAc.close().catch(() => {}); acRef.current = null; }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ac = new AudioContext({ sampleRate: 44100 });
      acRef.current = ac;

      const micSrc = ac.createMediaStreamSource(stream);
      const analyser = ac.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.5;
      micSrc.connect(analyser);
      analyserRef.current = analyser;

      chromaRef.current = new Array(12).fill(0) as number[];
      onsetTimesRef.current = [];
      centAccRef.current = { sum: 0, cnt: 0 };
      prevRmsRef.current = 0;
      lastOnsetRef.current = 0;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = handleMrStop;
      mr.start(200);
      mrRef.current = mr;

      let elapsed = 0;
      setRecSec(0);
      timerRef.current = setInterval(() => {
        elapsed++;
        setRecSec(elapsed);
        if (elapsed >= 15) handleStop();
      }, 1000);

      setPhase("recording");
      runLoop();
    } catch (e) {
      setErrorMsg(`Mic error: ${e}`);
      setPhase("error");
    }
  }

  function runLoop() {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const fdata = new Uint8Array(analyser.frequencyBinCount);
    const tdata = new Uint8Array(analyser.frequencyBinCount);
    const fpb = analyser.context.sampleRate / (2 * analyser.frequencyBinCount);

    function tick() {
      if (!analyser || !mrRef.current || mrRef.current.state !== "recording") return;
      loopRef.current = requestAnimationFrame(tick);
      analyser.getByteFrequencyData(fdata);
      analyser.getByteTimeDomainData(tdata);

      const chroma = extractChroma(fdata, analyser.context.sampleRate);
      chromaRef.current = chromaRef.current.map((v, i) => v + chroma[i]);

      let num = 0, den = 0;
      for (let i = 0; i < fdata.length; i++) { num += i * fpb * fdata[i]; den += fdata[i]; }
      if (den > 0) { centAccRef.current.sum += num / den; centAccRef.current.cnt++; }

      let rms = 0;
      for (let i = 0; i < tdata.length; i++) { const s = (tdata[i] - 128) / 128; rms += s * s; }
      rms = Math.sqrt(rms / tdata.length);
      const now = performance.now() / 1000;
      if (rms > 0.05 && prevRmsRef.current < 0.03 && now - lastOnsetRef.current > 0.25) {
        onsetTimesRef.current.push(now);
        lastOnsetRef.current = now;
      }
      prevRmsRef.current = rms;
    }
    loopRef.current = requestAnimationFrame(tick);
  }

  function handleStop() {
    clearInterval(timerRef.current!);
    cancelAnimationFrame(loopRef.current);
    const mr = mrRef.current;
    if (mr && mr.state === "recording") mr.stop();
    mr?.stream.getTracks().forEach(t => t.stop());
  }

  function handleMrStop() {
    setPhase("analyzing");
    const type = chunksRef.current[0]?.type ?? "audio/webm";
    const blob = new Blob(chunksRef.current, { type });
    storedBlobRef.current = blob;

    const quality = detectQuality(chromaRef.current);
    const onsets = onsetTimesRef.current;
    let bpm = 72;
    if (onsets.length >= 4) {
      const iors: number[] = [];
      for (let i = 1; i < Math.min(onsets.length, 16); i++) iors.push(onsets[i] - onsets[i - 1]);
      iors.sort((a, b) => a - b);
      const med = iors[Math.floor(iors.length / 2)];
      if (med > 0.2 && med < 3) bpm = Math.max(40, Math.min(160, Math.round(60 / med)));
    }
    const centroid = centAccRef.current.cnt > 0 ? centAccRef.current.sum / centAccRef.current.cnt : 600;
    const register: "low" | "mid" | "high" = centroid < 400 ? "low" : centroid > 1400 ? "high" : "mid";
    const a: Analysis = { quality, bpm, register };
    setAnalysis(a);
    storedAnalysisRef.current = a;
    void doGenerate(blob, a);
  }

  async function doGenerate(blob: Blob, a: Analysis) {
    setPhase("generating");
    try {
      const res = await fetch("/dream/138-lmdm-echo/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: buildTags(a) }),
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!json.url) throw new Error(json.error ?? "No URL returned");
      await startPlayback(blob, json.url);
    } catch (e) {
      setErrorMsg(String(e));
      setPhase("error");
    }
  }

  async function startPlayback(blob: Blob, echoUrl: string) {
    const ac = acRef.current ?? new AudioContext();
    acRef.current = ac;
    if (ac.state === "suspended") await ac.resume();

    const [origBuf, echoBuf] = await Promise.all([
      blob.arrayBuffer().then(ab => ac.decodeAudioData(ab)),
      fetch(echoUrl).then(r => r.arrayBuffer()).then(ab => ac.decodeAudioData(ab)),
    ]);

    setOrigPeaks(buildPeaks(origBuf, 100));
    setEchoPeaks(buildPeaks(echoBuf, 100));

    const analyser = ac.createAnalyser();
    analyser.fftSize = 1024;
    analyserRef.current = analyser;
    analyser.connect(ac.destination);

    const pan1 = ac.createStereoPanner(); pan1.pan.value = -0.35;
    const g1 = ac.createGain(); g1.gain.value = 0.65;
    const pan2 = ac.createStereoPanner(); pan2.pan.value = 0.35;
    const g2 = ac.createGain(); g2.gain.value = 0.50;

    const s1 = ac.createBufferSource(); s1.buffer = origBuf;
    s1.connect(g1); g1.connect(pan1); pan1.connect(analyser);
    const s2 = ac.createBufferSource(); s2.buffer = echoBuf;
    s2.connect(g2); g2.connect(pan2); pan2.connect(analyser);

    s1.start(); s2.start();
    src1Ref.current = s1;
    src2Ref.current = s2;

    const dur = Math.max(origBuf.duration, echoBuf.duration);
    playDurRef.current = dur;
    playStartRef.current = ac.currentTime;
    setPhase("playing");
    startBloom(analyser, ac);

    playTimeoutRef.current = setTimeout(() => {
      setPhase("done");
      cancelAnimationFrame(bloomAnimRef.current);
      setPlayPct(1);
    }, dur * 1000 + 800);
  }

  function startBloom(analyser: AnalyserNode, ac: AudioContext) {
    const canvas = bloomRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const fdata = new Uint8Array(analyser.frequencyBinCount);
    const N = fdata.length;
    const ranges: [number, number][] = [[0, 3], [3, 12], [12, 25], [25, 100], [100, 200], [200, N]];

    function tick() {
      bloomAnimRef.current = requestAnimationFrame(tick);
      if (!canvas || !ctx) return;
      analyser.getByteFrequencyData(fdata);

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = canvas.clientWidth, ch = canvas.clientHeight;
      if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
        canvas.width = cw * dpr; canvas.height = ch * dpr;
        ctx.scale(dpr, dpr);
      }
      const W = canvas.clientWidth, H = canvas.clientHeight;
      const cx = W / 2, cy = H / 2;
      const R = Math.min(W, H) * 0.36;

      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.fillRect(0, 0, W, H);

      const bands = ranges.map(([lo, hi]) => {
        let s = 0;
        for (let i = lo; i < Math.min(hi, N); i++) s += fdata[i];
        return s / ((hi - lo) * 255);
      });

      for (let b = 0; b < 6; b++) {
        const e = bands[b];
        const a0 = (b / 6) * Math.PI * 2 - Math.PI / 2;
        const a1 = ((b + 1) / 6) * Math.PI * 2 - Math.PI / 2;
        const [r, g, bl] = BAND_COLORS[b];
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, R + e * R * 0.65, a0, a1);
        ctx.closePath();
        ctx.fillStyle = `rgba(${r},${g},${bl},${0.12 + e * 0.55})`;
        ctx.fill();
      }

      const elapsed = ac.currentTime - playStartRef.current;
      setPlayPct(Math.min(1, elapsed / playDurRef.current));
    }
    bloomAnimRef.current = requestAnimationFrame(tick);
  }

  function handleEchoAgain() {
    stopAll();
    const blob = storedBlobRef.current;
    const a = storedAnalysisRef.current;
    if (!blob || !a) { setPhase("idle"); return; }
    setOrigPeaks([]);
    setEchoPeaks([]);
    setPlayPct(0);
    void doGenerate(blob, a);
  }

  function handleNewRecording() {
    stopAll();
    acRef.current?.close().catch(() => {});
    acRef.current = null;
    setPhase("idle");
    setAnalysis(null);
    setOrigPeaks([]);
    setEchoPeaks([]);
    setPlayPct(0);
    setErrorMsg("");
    storedBlobRef.current = null;
    chunksRef.current = [];
  }

  if (phase === "idle") return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-6 p-8 text-center">
      <div>
        <h1 className="font-serif text-3xl text-white/95 mb-2">Echo Chamber</h1>
        <p className="text-base text-white/75 max-w-xs mx-auto leading-relaxed">
          Record a piano phrase — the system listens to your harmony and tempo, then echoes it back transformed.
        </p>
      </div>
      <button
        onClick={() => { void handleStart(); }}
        className="bg-violet-600 hover:bg-violet-500 text-white font-medium px-6 py-3 rounded-lg min-h-[44px] text-base transition-colors"
      >
        Start Mic
      </button>
      <p className="text-white/40 text-sm">up to 15 s · headphones recommended · ~$0.006 / echo</p>
      <Link href="/dream" className="mt-4 text-white/40 text-sm hover:text-white/70 transition-colors">
        ← dream lab
      </Link>
    </div>
  );

  if (phase === "recording") return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="flex items-center gap-3">
        <span className="w-3 h-3 bg-rose-400 rounded-full animate-pulse" />
        <span className="text-rose-300 font-mono text-lg">
          {String(Math.floor(recSec / 60)).padStart(2, "0")}:{String(recSec % 60).padStart(2, "0")} / 0:15
        </span>
      </div>
      <p className="text-white/75 text-base">Play something — stop when ready</p>
      <button
        onClick={handleStop}
        className="bg-rose-700 hover:bg-rose-600 text-white font-medium px-6 py-3 rounded-lg min-h-[44px] text-base transition-colors"
      >
        ■ Stop
      </button>
    </div>
  );

  if (phase === "analyzing") return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="w-8 h-8 border-2 border-violet-400/60 border-t-violet-400 rounded-full animate-spin" />
      <p className="text-white/75 text-base">Analyzing phrase...</p>
    </div>
  );

  if (phase === "generating") return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4 p-8 text-center">
      {analysis && (
        <p className="text-white/55 text-sm font-mono">
          {analysis.quality} · {analysis.bpm} BPM · {analysis.register} register
        </p>
      )}
      <div className="w-8 h-8 border-2 border-violet-400/60 border-t-violet-400 rounded-full animate-spin" />
      <p className="text-white/75 text-base">Generating echo...</p>
      <p className="text-white/40 text-sm">~20–40 s · ACE-Step</p>
    </div>
  );

  if (phase === "error") return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-5 p-8 text-center">
      <p className="text-rose-300 text-base max-w-xs">{errorMsg || "Something went wrong."}</p>
      <button
        onClick={handleNewRecording}
        className="bg-white/10 hover:bg-white/20 text-white/90 font-medium px-5 py-2.5 rounded-lg min-h-[44px] text-base transition-colors"
      >
        Try Again
      </button>
      <Link href="/dream" className="text-white/40 text-sm hover:text-white/70 transition-colors">
        ← dream lab
      </Link>
    </div>
  );

  return (
    <div className="min-h-screen bg-black flex flex-col p-5 gap-4">
      <div className="text-center pt-2">
        <h1 className="font-serif text-2xl text-white/95 mb-1">Echo Chamber</h1>
        {analysis && (
          <p className="text-white/55 text-sm font-mono">
            {analysis.quality} · {analysis.bpm} BPM · {analysis.register}
          </p>
        )}
      </div>

      <canvas
        ref={bloomRef}
        className="w-full rounded-xl"
        style={{ aspectRatio: "1 / 1", maxHeight: 220 }}
      />

      <div className="flex flex-col gap-3">
        <WaveformStrip label="YOUR PHRASE" peaks={origPeaks} progress={playPct} color="#f59e0b" />
        <WaveformStrip label="ECHO" peaks={echoPeaks} progress={playPct} color="#60a5fa" />
      </div>

      {phase === "playing" && (
        <p className="text-center text-white/55 text-sm font-mono">
          ♪ playing · original left · echo right
        </p>
      )}

      <div className="flex gap-3 justify-center mt-1 flex-wrap">
        <button
          onClick={handleEchoAgain}
          className="bg-white/10 hover:bg-white/20 text-white/90 font-medium px-5 py-2.5 rounded-lg min-h-[44px] text-base transition-colors"
        >
          ↺ Echo Again
        </button>
        <button
          onClick={handleNewRecording}
          className="bg-violet-700 hover:bg-violet-600 text-white font-medium px-5 py-2.5 rounded-lg min-h-[44px] text-base transition-colors"
        >
          + New Recording
        </button>
      </div>

      <Link href="/dream" className="text-center text-white/40 text-sm hover:text-white/70 transition-colors mt-1">
        ← dream lab
      </Link>
    </div>
  );
}
