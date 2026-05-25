"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const BAND_COLORS: ReadonlyArray<[number, number, number]> = [
  [88, 32, 192],
  [32, 168, 220],
  [80, 220, 100],
  [240, 220, 70],
  [255, 150, 40],
  [255, 60, 120],
];

const THEMES = [
  { name: "Cosmic Homecoming", prompt: "vast cosmic ambient, reverbed piano, synthesizer drones, celestial ascent, 45 BPM, no percussion" },
  { name: "Earth Grounding", prompt: "deep earth resonance, low bass drone, forest ambience, slow cello, contemplative, 50 BPM" },
  { name: "Inner Sanctuary", prompt: "slow reverbed piano, soft cello drone, ancient forest, meditative, warm harmonics, 40 BPM" },
  { name: "Ocean Breath", prompt: "ocean waves, slow piano arpeggios, vast reverb, binaural tones, breathing pace, 35 BPM" },
  { name: "Snowflake", prompt: "crystalline piano, high register, delicate sparse notes, cold ambient drones, winter stillness" },
  { name: "Ghost", prompt: "mysterious minor piano, stone chamber reverb, ethereal atmosphere, single notes, distant echo, 50 BPM" },
  { name: "Inner Fire", prompt: "warm ceremonial drums, building tension, low bass, shamanic atmosphere, 80 BPM" },
  { name: "Mycelium Dream", prompt: "organic textures, slow evolving drones, underground resonance, psychedelic ambient, 45 BPM" },
];

const DURATIONS = [
  { label: "2 min", value: 120 },
  { label: "4 min", value: 240 },
  { label: "6 min", value: 360 },
];

type Phase = "idle" | "recording" | "recorded" | "generating" | "playing" | "ready" | "error";

function buildPeaks(buf: AudioBuffer, bins: number): number[] {
  const data = buf.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / bins));
  const peaks: number[] = [];
  for (let i = 0; i < bins; i++) {
    let pk = 0;
    const end = Math.min(data.length, (i + 1) * step);
    for (let j = i * step; j < end; j++) {
      const v = Math.abs(data[j]);
      if (v > pk) pk = v;
    }
    peaks.push(pk);
  }
  return peaks;
}

function drawPeaks(
  ctx: CanvasRenderingContext2D,
  peaks: number[],
  x0: number,
  width: number,
  cy: number,
  halfH: number,
  r: number,
  g: number,
  b: number
) {
  const bw = width / peaks.length;
  for (let i = 0; i < peaks.length; i++) {
    const h = Math.max(1, peaks[i] * halfH);
    ctx.fillStyle = `rgba(${r},${g},${b},0.82)`;
    ctx.fillRect(x0 + i * bw, cy - h, Math.max(1, bw - 1), h * 2);
  }
}

export default function SA3Journey() {
  const [mode, setMode] = useState<"write" | "extend">("write");
  const [prompt, setPrompt] = useState(THEMES[2].prompt);
  const [duration, setDuration] = useState(120);
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [recSec, setRecSec] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [genDuration, setGenDuration] = useState(0);

  const bloomRef = useRef<HTMLCanvasElement | null>(null);
  const waveRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef(0);
  const actxRef = useRef<AudioContext | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recStartRef = useRef(0);
  const origPeaksRef = useRef<number[]>([]);

  const startBloom = (analyser: AnalyserNode) => {
    const canvas = bloomRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;
    const fdata = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      animRef.current = requestAnimationFrame(tick);
      analyser.getByteFrequencyData(fdata);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
        canvas.width = cw * dpr;
        canvas.height = ch * dpr;
        ctx2d.scale(dpr, dpr);
      }
      const cx = cw / 2;
      const cy = ch / 2;
      ctx2d.fillStyle = "rgba(0,0,0,0.17)";
      ctx2d.fillRect(0, 0, cw, ch);
      const binPerBand = Math.floor(fdata.length / 6);
      for (let b = 0; b < 6; b++) {
        let sum = 0;
        for (let i = b * binPerBand; i < (b + 1) * binPerBand; i++) sum += fdata[i];
        const energy = sum / (binPerBand * 255);
        const [r, g, bl] = BAND_COLORS[b];
        const maxR = Math.min(cx, cy) * (0.28 + 0.72 * (1 - b / 6));
        const radius = Math.max(4, maxR * energy);
        const alpha = 0.11 + energy * 0.55;
        const grad = ctx2d.createRadialGradient(cx, cy, 0, cx, cy, radius);
        grad.addColorStop(0, `rgba(${r},${g},${bl},${alpha})`);
        grad.addColorStop(1, `rgba(${r},${g},${bl},0)`);
        ctx2d.beginPath();
        ctx2d.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx2d.fillStyle = grad;
        ctx2d.fill();
      }
    };
    cancelAnimationFrame(animRef.current);
    tick();
  };

  const redrawWave = (genPeaks?: number[]) => {
    const canvas = waveRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    ctx2d.scale(dpr, dpr);
    ctx2d.clearRect(0, 0, cw, ch);
    const cy = ch / 2;
    const halfH = ch * 0.42;
    const orig = origPeaksRef.current;
    const gen = genPeaks ?? [];
    const hasGen = gen.length > 0;
    const splitX = hasGen && orig.length > 0 ? Math.floor(cw / 2) : cw;
    if (orig.length > 0) drawPeaks(ctx2d, orig, 0, splitX - 2, cy, halfH, 255, 165, 50);
    if (hasGen) {
      drawPeaks(ctx2d, gen, splitX + 2, cw - splitX - 2, cy, halfH, 80, 160, 255);
      ctx2d.strokeStyle = "rgba(255,255,255,0.18)";
      ctx2d.lineWidth = 1;
      ctx2d.beginPath();
      ctx2d.moveTo(splitX, 0);
      ctx2d.lineTo(splitX, ch);
      ctx2d.stroke();
    }
  };

  const playAudio = (url: string, origPeaks?: number[]) => {
    const actx = actxRef.current ?? new AudioContext();
    actxRef.current = actx;
    if (srcRef.current) try { srcRef.current.stop(); } catch { /* ok */ }

    const analyser = actx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.85;
    analyser.connect(actx.destination);

    fetch(url)
      .then((r) => r.arrayBuffer())
      .then((ab) => actx.decodeAudioData(ab))
      .then((buf) => {
        const genPeaks = buildPeaks(buf, 300);
        redrawWave(origPeaks ? genPeaks : undefined);

        const src = actx.createBufferSource();
        src.buffer = buf;
        src.connect(analyser);
        src.start();
        srcRef.current = src;
        setPhase("playing");
        startBloom(analyser);
        src.onended = () => {
          cancelAnimationFrame(animRef.current);
          setPhase("ready");
        };
      })
      .catch((e) => { setErrorMsg(String(e)); setPhase("error"); });
  };

  const generate = async () => {
    setPhase("generating");
    setErrorMsg("");
    setAudioUrl(null);
    const genStart = Date.now();

    try {
      const res = await fetch("/dream/144-sa3-journey/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, duration }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setErrorMsg(json.error ?? "Unknown error");
        setPhase("error");
        return;
      }
      setAudioUrl(json.url);
      setGenDuration(Math.round((Date.now() - genStart) / 1000));
      playAudio(json.url);
    } catch (e) {
      setErrorMsg(String(e));
      setPhase("error");
    }
  };

  const startRec = () => {
    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then((stream) => {
        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus" : "audio/mp4";
        const rec = new MediaRecorder(stream, { mimeType });
        chunksRef.current = [];
        blobRef.current = null;
        origPeaksRef.current = [];
        setAudioUrl(null);

        rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunksRef.current, { type: mimeType });
          blobRef.current = blob;
          setPhase("recorded");
          const actx = actxRef.current ?? new AudioContext();
          actxRef.current = actx;
          blob.arrayBuffer()
            .then((ab) => actx.decodeAudioData(ab))
            .then((buf) => {
              origPeaksRef.current = buildPeaks(buf, 150);
              redrawWave();
            })
            .catch(() => { /* waveform optional */ });
        };

        rec.start(100);
        mediaRecRef.current = rec;
        recStartRef.current = Date.now();
        setRecSec(0);
        setPhase("recording");
        timerRef.current = setInterval(() => {
          const el = (Date.now() - recStartRef.current) / 1000;
          setRecSec(Math.floor(el));
          if (el >= 30) stopRec();
        }, 500);
      })
      .catch((e) => { setErrorMsg(String(e)); setPhase("error"); });
  };

  const stopRec = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (mediaRecRef.current && mediaRecRef.current.state !== "inactive") mediaRecRef.current.stop();
  };

  const extendWithSA3 = async () => {
    if (!blobRef.current) return;
    setPhase("generating");
    setErrorMsg("");
    const fd = new FormData();
    fd.append("audio", blobRef.current, "recording.webm");
    fd.append("prompt", prompt);
    fd.append("duration", String(duration));

    try {
      const res = await fetch("/dream/144-sa3-journey/api", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || json.error) { setErrorMsg(json.error ?? "Unknown error"); setPhase("error"); return; }
      setAudioUrl(json.url);
      playAudio(json.url, origPeaksRef.current);
    } catch (e) {
      setErrorMsg(String(e));
      setPhase("error");
    }
  };

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      if (srcRef.current) try { srcRef.current.stop(); } catch { /* ok */ }
    };
  }, []);

  useEffect(() => {
    const onResize = () => redrawWave();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  });

  const isGenerating = phase === "generating";
  const isPlaying = phase === "playing";
  const isRecording = phase === "recording";
  const canGenerate = !isGenerating && !isPlaying;
  const canExtend = phase === "recorded" && !!blobRef.current && !isGenerating && !isPlaying;

  const btn = (
    label: string,
    onClick: () => void,
    disabled: boolean,
    accent = "#2563eb"
  ) => (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? "#16162a" : accent,
        color: disabled ? "#444" : "#fff",
        border: "none",
        borderRadius: 6,
        padding: "10px 22px",
        fontFamily: "inherit",
        fontSize: 15,
        cursor: disabled ? "not-allowed" : "pointer",
        minHeight: 44,
        minWidth: 44,
        transition: "background 0.15s",
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{
      minHeight: "100vh",
      background: "#070711",
      color: "#e0e0f0",
      fontFamily: "'JetBrains Mono', 'Fira Mono', monospace",
      display: "flex",
      flexDirection: "column",
      padding: "20px",
      boxSizing: "border-box",
      maxWidth: 720,
      margin: "0 auto",
    }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "#fff" }}>
          ◈ SA3 Journey
        </h1>
        <p style={{ fontSize: 16, color: "rgba(255,255,255,0.75)", margin: "6px 0 4px" }}>
          Stable Audio 3 — generate up to 6 minutes of journey music, or extend your own playing.
        </p>
        <Link href="/dream" style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", textDecoration: "none" }}>
          ← dream index
        </Link>
      </div>

      {/* Mode tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {(["write", "extend"] as const).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setPhase("idle"); setErrorMsg(""); setAudioUrl(null); }}
            style={{
              background: mode === m ? "rgba(99,60,255,0.25)" : "transparent",
              color: mode === m ? "#a78bfa" : "rgba(255,255,255,0.5)",
              border: `1px solid ${mode === m ? "#7c5de0" : "#2a2a3a"}`,
              borderRadius: 6,
              padding: "8px 18px",
              fontFamily: "inherit",
              fontSize: 14,
              cursor: "pointer",
              minHeight: 44,
            }}
          >
            {m === "write" ? "✦ Write Journey" : "🎹 Extend Your Playing"}
          </button>
        ))}
      </div>

      {/* Mode A — Write Journey */}
      {mode === "write" && (
        <div style={{ border: "1px solid #1e1e30", borderRadius: 8, padding: 18, marginBottom: 16 }}>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", margin: "0 0 12px" }}>
            Pick a journey theme or write your own prompt:
          </p>
          {/* Theme presets */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            {THEMES.map((t) => (
              <button
                key={t.name}
                onClick={() => setPrompt(t.prompt)}
                style={{
                  background: prompt === t.prompt ? "rgba(99,60,255,0.22)" : "rgba(255,255,255,0.04)",
                  color: prompt === t.prompt ? "#a78bfa" : "rgba(255,255,255,0.7)",
                  border: `1px solid ${prompt === t.prompt ? "#7c5de0" : "#2a2a3a"}`,
                  borderRadius: 5,
                  padding: "6px 12px",
                  fontFamily: "inherit",
                  fontSize: 13,
                  cursor: "pointer",
                  minHeight: 44,
                }}
              >
                {t.name}
              </button>
            ))}
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isGenerating || isPlaying}
            rows={3}
            style={{
              width: "100%",
              background: "#0d0d1c",
              border: "1px solid #2a2a3a",
              borderRadius: 6,
              color: "rgba(255,255,255,0.85)",
              fontFamily: "inherit",
              fontSize: 14,
              padding: "10px 12px",
              boxSizing: "border-box",
              resize: "vertical",
              marginBottom: 14,
            }}
          />
          {/* Duration picker */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>Duration:</span>
            {DURATIONS.map((d) => (
              <button
                key={d.value}
                onClick={() => setDuration(d.value)}
                style={{
                  background: duration === d.value ? "rgba(37,99,235,0.3)" : "rgba(255,255,255,0.04)",
                  color: duration === d.value ? "#60a5fa" : "rgba(255,255,255,0.6)",
                  border: `1px solid ${duration === d.value ? "#3b82f6" : "#2a2a3a"}`,
                  borderRadius: 5,
                  padding: "6px 14px",
                  fontFamily: "inherit",
                  fontSize: 13,
                  cursor: "pointer",
                  minHeight: 44,
                }}
              >
                {d.label}
              </button>
            ))}
          </div>
          {btn(
            isGenerating ? `Generating ${duration / 60} min…` : `▶ Generate ${duration / 60}-min Journey`,
            generate,
            !canGenerate
          )}
          {isGenerating && (
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginTop: 10 }}>
              SA3 takes 1–3 min for long pieces — grab a coffee ☕
            </p>
          )}
        </div>
      )}

      {/* Mode B — Extend Your Playing */}
      {mode === "extend" && (
        <div style={{ border: "1px solid #1e1e30", borderRadius: 8, padding: 18, marginBottom: 16 }}>
          <p style={{ fontSize: 16, color: "rgba(255,255,255,0.75)", margin: "0 0 14px" }}>
            Record 5–30 s of piano. SA3 continues it for the selected duration.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            {(phase === "idle" || phase === "recorded" || phase === "error") && btn("● REC", startRec, false, "#c0392b")}
            {isRecording && btn("■ STOP", stopRec, false, "#555")}
            <span style={{ fontSize: 14, color: "rgba(255,255,255,0.6)" }}>
              {isRecording ? `Recording… ${recSec}s / 30s` : phase === "recorded" ? `Recorded: ${recSec}s` : "Ready to record"}
            </span>
            {isRecording && (
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#e74c3c", display: "inline-block", animation: "pulse 1s infinite" }} />
            )}
          </div>
          <canvas
            ref={waveRef}
            style={{ width: "100%", height: 56, background: "#0a0a18", borderRadius: 5, display: "block", marginBottom: 14 }}
          />
          {/* Style guidance */}
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isGenerating || isPlaying}
            placeholder="style guidance, e.g. continue as a cello duet…"
            style={{
              width: "100%",
              background: "#0d0d1c",
              border: "1px solid #2a2a3a",
              borderRadius: 5,
              color: "rgba(255,255,255,0.85)",
              fontFamily: "inherit",
              fontSize: 14,
              padding: "9px 12px",
              boxSizing: "border-box",
              marginBottom: 14,
            }}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>Continuation:</span>
            {DURATIONS.map((d) => (
              <button
                key={d.value}
                onClick={() => setDuration(d.value)}
                style={{
                  background: duration === d.value ? "rgba(37,99,235,0.3)" : "rgba(255,255,255,0.04)",
                  color: duration === d.value ? "#60a5fa" : "rgba(255,255,255,0.6)",
                  border: `1px solid ${duration === d.value ? "#3b82f6" : "#2a2a3a"}`,
                  borderRadius: 5,
                  padding: "6px 14px",
                  fontFamily: "inherit",
                  fontSize: 13,
                  cursor: "pointer",
                  minHeight: 44,
                }}
              >
                {d.label}
              </button>
            ))}
          </div>
          {btn(
            isGenerating ? "Extending with SA3…" : "Extend →",
            extendWithSA3,
            !canExtend
          )}
        </div>
      )}

      {/* Error */}
      {phase === "error" && errorMsg && (
        <div style={{
          padding: "10px 14px",
          background: "#1a0808",
          border: "1px solid #5a1a1a",
          borderRadius: 6,
          fontSize: 14,
          color: "#f87171",
          marginBottom: 16,
        }}>
          {errorMsg.includes("not found") || errorMsg.includes("404")
            ? "SA3 endpoint not yet live on fal.ai — the model launched May 20; the API may still be rolling out. Try again soon."
            : errorMsg}
        </div>
      )}

      {/* Bloom visualizer */}
      {(isPlaying || phase === "ready") && (
        <div style={{ border: "1px solid #1e1e30", borderRadius: 8, overflow: "hidden", marginBottom: 16 }}>
          <canvas
            ref={bloomRef}
            style={{ width: "100%", height: 240, display: "block", background: "#04040e" }}
          />
          {phase === "ready" && (
            <div style={{ padding: "10px 14px", display: "flex", gap: 12, alignItems: "center", borderTop: "1px solid #1a1a2e" }}>
              {audioUrl && btn("▶ Replay", () => playAudio(audioUrl), isPlaying)}
              {audioUrl && (
                <a
                  href={audioUrl}
                  download="sa3-journey.wav"
                  style={{ fontSize: 13, color: "#60a5fa", textDecoration: "none" }}
                >
                  ↓ Download
                </a>
              )}
              {genDuration > 0 && (
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
                  generated in {genDuration}s
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: "auto", paddingTop: 20, fontSize: 12, color: "rgba(255,255,255,0.3)", display: "flex", gap: 16 }}>
        <Link href="/dream/144-sa3-journey/README.md" style={{ color: "rgba(255,255,255,0.3)", textDecoration: "none" }}>
          design notes
        </Link>
        <span>Stable Audio 3 · fal-ai/stable-audio-3 · ~$0.20–0.50/generation</span>
      </div>

      <style>{`
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
      `}</style>
    </div>
  );
}
