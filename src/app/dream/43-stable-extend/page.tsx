"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// Six-band color palette matching 1-live
const BAND_COLORS: ReadonlyArray<[number, number, number]> = [
  [88, 32, 192],
  [32, 168, 220],
  [80, 220, 100],
  [240, 220, 70],
  [255, 150, 40],
  [255, 60, 120],
];

type Phase =
  | "idle"
  | "recording"
  | "recorded"
  | "generating"
  | "playing"
  | "error";

// Downsample AudioBuffer channel 0 into N peak-amplitude bins
function buildPeaks(buf: AudioBuffer, bins: number): number[] {
  const data = buf.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / bins));
  const out: number[] = [];
  for (let i = 0; i < bins; i++) {
    let peak = 0;
    const end = Math.min(data.length, (i + 1) * step);
    for (let j = i * step; j < end; j++) {
      const v = Math.abs(data[j]);
      if (v > peak) peak = v;
    }
    out.push(peak);
  }
  return out;
}

// Draw a peak waveform (horizontal bar chart) on a canvas 2D context
function drawWaveformBars(
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
  const barW = width / peaks.length;
  for (let i = 0; i < peaks.length; i++) {
    const h = Math.max(1, peaks[i] * halfH);
    ctx.fillStyle = `rgba(${r},${g},${b},0.85)`;
    ctx.fillRect(x0 + i * barW, cy - h, Math.max(1, barW - 1), h * 2);
  }
}

export default function StableExtend() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [prompt, setPrompt] = useState(
    "continue this piano phrase, same style and mood"
  );
  const [recSec, setRecSec] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [genUrl, setGenUrl] = useState<string | null>(null);

  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bloomCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const peaksOrigRef = useRef<number[]>([]);
  const peaksGenRef = useRef<number[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recStartRef = useRef(0);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Bloom animation — radial six-band visualizer from 1-live
  function runBloom(analyser: AnalyserNode, canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const fdata = new Uint8Array(analyser.frequencyBinCount);
    const BANDS = 6;

    function tick() {
      animRef.current = requestAnimationFrame(tick);
      if (!ctx) return;
      analyser.getByteFrequencyData(fdata);

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
        canvas.width = cw * dpr;
        canvas.height = ch * dpr;
        ctx.scale(dpr, dpr);
      }
      const W = cw;
      const H = ch;
      const cx = W / 2;
      const cy = H / 2;

      // Dark trail
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(0, 0, W, H);

      // Compute per-band energy
      const binPerBand = Math.floor(fdata.length / BANDS);
      for (let b = 0; b < BANDS; b++) {
        let sum = 0;
        const start = b * binPerBand;
        const end = start + binPerBand;
        for (let i = start; i < end; i++) sum += fdata[i];
        const energy = sum / (binPerBand * 255);

        const [r, g, bl] = BAND_COLORS[b];
        const maxR = Math.min(cx, cy) * (0.25 + 0.75 * (1 - b / BANDS));
        const radius = Math.max(4, maxR * energy);
        const alpha = 0.12 + energy * 0.55;

        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        grad.addColorStop(0, `rgba(${r},${g},${bl},${alpha})`);
        grad.addColorStop(1, `rgba(${r},${g},${bl},0)`);
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      }
    }
    cancelAnimationFrame(animRef.current);
    tick();
  }

  // Draw waveform canvas: original (amber) left half, generated (blue) right half
  function redrawWaveform() {
    const canvas = waveCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cw, ch);

    const cy = ch / 2;
    const halfH = ch * 0.42;
    const hasGen = peaksGenRef.current.length > 0;
    const halfW = hasGen ? Math.floor(cw / 2) : cw;

    if (peaksOrigRef.current.length > 0) {
      drawWaveformBars(ctx, peaksOrigRef.current, 0, halfW - 2, cy, halfH, 255, 180, 60);
    }

    if (hasGen) {
      drawWaveformBars(
        ctx,
        peaksGenRef.current,
        halfW + 2,
        cw - halfW - 2,
        cy,
        halfH,
        60,
        160,
        255
      );
      // divider line
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(halfW, 0);
      ctx.lineTo(halfW, ch);
      ctx.stroke();
    }
  }

  // Decode a Blob to AudioBuffer and compute waveform peaks
  async function decodeToPeaks(blob: Blob, bins: number): Promise<number[]> {
    const ctx = audioCtxRef.current ?? new AudioContext();
    if (!audioCtxRef.current) audioCtxRef.current = ctx;
    const ab = await blob.arrayBuffer();
    const buf = await ctx.decodeAudioData(ab);
    return buildPeaks(buf, bins);
  }

  function startRecording() {
    navigator.mediaDevices
      .getUserMedia({ audio: true, video: false })
      .then((stream) => {
        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/mp4";

        const rec = new MediaRecorder(stream, { mimeType });
        chunksRef.current = [];
        blobRef.current = null;
        peaksOrigRef.current = [];
        peaksGenRef.current = [];
        setGenUrl(null);

        rec.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunksRef.current, { type: mimeType });
          blobRef.current = blob;
          setPhase("recorded");

          decodeToPeaks(blob, 200).then((peaks) => {
            peaksOrigRef.current = peaks;
            redrawWaveform();
          });
        };

        rec.start(100);
        mediaRecRef.current = rec;
        recStartRef.current = Date.now();
        setRecSec(0);
        setPhase("recording");

        timerRef.current = setInterval(() => {
          const elapsed = (Date.now() - recStartRef.current) / 1000;
          setRecSec(Math.floor(elapsed));
          if (elapsed >= 30) stopRecording();
        }, 500);
      })
      .catch((err) => {
        setErrorMsg(String(err));
        setPhase("error");
      });
  }

  function stopRecording() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecRef.current && mediaRecRef.current.state !== "inactive") {
      mediaRecRef.current.stop();
    }
  }

  async function sendToFal() {
    if (!blobRef.current) return;
    setPhase("generating");

    const formData = new FormData();
    formData.append("audio", blobRef.current, "recording.webm");
    formData.append("prompt", prompt);

    try {
      const res = await fetch("/dream/43-stable-extend/api", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();

      if (!res.ok || json.error) {
        setErrorMsg(json.error ?? "Unknown error");
        setPhase("error");
        return;
      }

      setGenUrl(json.url);

      // Decode generated audio for waveform
      const genResp = await fetch(json.url);
      const genBlob = await genResp.blob();
      const peaks = await decodeToPeaks(genBlob, 200);
      peaksGenRef.current = peaks;
      redrawWaveform();

      // Auto-play
      playAudio(json.url);
    } catch (err) {
      setErrorMsg(String(err));
      setPhase("error");
    }
  }

  function playAudio(url: string) {
    const ctx = audioCtxRef.current ?? new AudioContext();
    if (!audioCtxRef.current) audioCtxRef.current = ctx;

    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch { /* already stopped */ }
    }

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.85;
    analyserRef.current = analyser;
    analyser.connect(ctx.destination);

    fetch(url)
      .then((r) => r.arrayBuffer())
      .then((ab) => ctx.decodeAudioData(ab))
      .then((buf) => {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(analyser);
        src.start();
        sourceRef.current = src;
        setPhase("playing");

        const bloomCanvas = bloomCanvasRef.current;
        if (bloomCanvas) runBloom(analyser, bloomCanvas);

        src.onended = () => {
          cancelAnimationFrame(animRef.current);
          setPhase("recorded");
        };
      })
      .catch((err) => {
        setErrorMsg(String(err));
        setPhase("error");
      });
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      if (sourceRef.current) try { sourceRef.current.stop(); } catch { /* ok */ }
    };
  }, []);

  // Redraw waveform on window resize
  useEffect(() => {
    const onResize = () => redrawWaveform();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  });

  const isRecording = phase === "recording";
  const isGenerating = phase === "generating";
  const isPlaying = phase === "playing";
  const canExtend = phase === "recorded" && !!blobRef.current;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#080810",
        color: "#e8e8f0",
        fontFamily: "'JetBrains Mono', 'Fira Mono', monospace",
        display: "flex",
        flexDirection: "column",
        padding: "20px",
        boxSizing: "border-box",
        maxWidth: 700,
        margin: "0 auto",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
          ◈ stable-extend
        </h1>
        <p style={{ fontSize: 13, color: "#888", margin: "6px 0 0" }}>
          Record a piano phrase · AI extends it into a 30s continuation
        </p>
        <Link
          href="/dream"
          style={{ fontSize: 11, color: "#555", textDecoration: "none" }}
        >
          ← dream index
        </Link>
      </div>

      {/* Record controls */}
      <div
        style={{
          border: "1px solid #222",
          borderRadius: 8,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 12,
          }}
        >
          {phase === "idle" || phase === "recorded" || phase === "error" ? (
            <button
              onClick={startRecording}
              style={{
                background: "#c0392b",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                padding: "8px 18px",
                fontFamily: "inherit",
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              ● REC
            </button>
          ) : isRecording ? (
            <button
              onClick={stopRecording}
              style={{
                background: "#444",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                padding: "8px 18px",
                fontFamily: "inherit",
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              ■ STOP
            </button>
          ) : null}

          <span style={{ fontSize: 13, color: "#aaa" }}>
            {isRecording
              ? `Recording… ${recSec}s / 30s max`
              : phase === "recorded"
              ? `Recorded: ${recSec}s`
              : phase === "idle"
              ? "Ready to record"
              : phase === "generating"
              ? "Extending with AI…"
              : phase === "playing"
              ? "Playing extended audio…"
              : phase === "error"
              ? "Error — try again"
              : ""}
          </span>

          {isRecording && (
            <span
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "#e74c3c",
                animation: "pulse 1s infinite",
              }}
            />
          )}
        </div>

        {/* Waveform canvas — amber original | blue generated */}
        <canvas
          ref={waveCanvasRef}
          style={{
            width: "100%",
            height: 64,
            background: "#0d0d1a",
            borderRadius: 4,
            display: "block",
          }}
        />
        {peaksGenRef.current.length > 0 && (
          <div
            style={{
              display: "flex",
              gap: 16,
              marginTop: 6,
              fontSize: 11,
              color: "#666",
            }}
          >
            <span>
              <span style={{ color: "#ffb43a" }}>▓</span> your recording
            </span>
            <span>
              <span style={{ color: "#3ca0ff" }}>▓</span> AI extension
            </span>
          </div>
        )}
      </div>

      {/* Generation panel */}
      <div
        style={{
          border: "1px solid #222",
          borderRadius: 8,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <label
          style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 6 }}
        >
          style guidance (optional)
        </label>
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={isGenerating || isPlaying}
          placeholder="e.g. continue as a jazz ballad, add cello, …"
          style={{
            width: "100%",
            background: "#111",
            border: "1px solid #333",
            borderRadius: 4,
            color: "#ddd",
            fontFamily: "inherit",
            fontSize: 13,
            padding: "7px 10px",
            boxSizing: "border-box",
            marginBottom: 12,
          }}
        />

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            onClick={sendToFal}
            disabled={!canExtend || isGenerating || isPlaying}
            style={{
              background: canExtend && !isGenerating && !isPlaying ? "#2563eb" : "#1a1a2e",
              color: canExtend && !isGenerating && !isPlaying ? "#fff" : "#555",
              border: "none",
              borderRadius: 4,
              padding: "9px 22px",
              fontFamily: "inherit",
              fontSize: 14,
              cursor: canExtend && !isGenerating && !isPlaying ? "pointer" : "not-allowed",
            }}
          >
            {isGenerating ? "Extending…" : "Extend →"}
          </button>

          {genUrl && !isPlaying && (
            <button
              onClick={() => playAudio(genUrl)}
              style={{
                background: "transparent",
                color: "#3ca0ff",
                border: "1px solid #3ca0ff",
                borderRadius: 4,
                padding: "8px 16px",
                fontFamily: "inherit",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              ▶ replay
            </button>
          )}

          {isGenerating && (
            <span style={{ fontSize: 12, color: "#666" }}>
              ~10–30s depending on length…
            </span>
          )}
        </div>

        {phase === "error" && errorMsg && (
          <div
            style={{
              marginTop: 12,
              padding: "8px 12px",
              background: "#1a0a0a",
              border: "1px solid #5a1a1a",
              borderRadius: 4,
              fontSize: 12,
              color: "#e57373",
            }}
          >
            {errorMsg}
          </div>
        )}
      </div>

      {/* Bloom visualizer — shown during playback */}
      {(isPlaying || genUrl) && (
        <div
          style={{
            border: "1px solid #222",
            borderRadius: 8,
            overflow: "hidden",
            marginBottom: 16,
            position: "relative",
          }}
        >
          <canvas
            ref={bloomCanvasRef}
            style={{
              width: "100%",
              height: 220,
              display: "block",
              background: "#050508",
            }}
          />
          {!isPlaying && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                color: "#444",
              }}
            >
              Press replay to see the bloom
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: "auto", fontSize: 11, color: "#444" }}>
        <Link
          href="/dream/43-stable-extend/README.md"
          style={{ color: "#444", textDecoration: "none" }}
        >
          design notes
        </Link>
        {" · "}
        <span>$0.20/generation · fal-ai/stable-audio-25</span>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
