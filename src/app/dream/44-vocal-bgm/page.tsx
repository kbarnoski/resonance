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

const GENRES = [
  { label: "jazz trio", tags: "jazz piano trio, warm, acoustic, 70 BPM, upright bass, brush drums" },
  { label: "ambient", tags: "ambient electronic, atmospheric, synth pads, no drums, slow, ethereal" },
  { label: "cinematic", tags: "cinematic orchestral strings, sweeping, emotional, film score, lush" },
  { label: "rock", tags: "indie rock band, electric guitar, bass guitar, drums, energetic, melodic" },
  { label: "folk", tags: "folk acoustic guitar, fingerpicking, double bass, simple, organic, warm" },
];

type Phase = "idle" | "recording" | "recorded" | "generating" | "playing" | "error";

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

function drawPeakBars(
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

function startBloom(analyser: AnalyserNode, canvas: HTMLCanvasElement, animRef: { current: number }) {
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

    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(0, 0, W, H);

    const binPerBand = Math.floor(fdata.length / BANDS);
    ctx.globalCompositeOperation = "lighter";
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
    ctx.globalCompositeOperation = "source-over";
  }
  cancelAnimationFrame(animRef.current);
  tick();
}

export default function VocalBGM() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [genreIdx, setGenreIdx] = useState(0);
  const [recSec, setRecSec] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [genUrl, setGenUrl] = useState<string | null>(null);

  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bloomCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const peaksOrigRef = useRef<number[]>([]);
  const peaksGenRef = useRef<number[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recStartRef = useRef(0);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

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
      // amber — your melody
      drawPeakBars(ctx, peaksOrigRef.current, 0, halfW - 2, cy, halfH, 255, 180, 60);
    }

    if (hasGen) {
      // blue — full arrangement
      drawPeakBars(ctx, peaksGenRef.current, halfW + 2, cw - halfW - 2, cy, halfH, 60, 160, 255);
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(halfW, 0);
      ctx.lineTo(halfW, ch);
      ctx.stroke();
    }
  }

  async function decodeToPeaks(blob: Blob, bins: number): Promise<number[]> {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    const ab = await blob.arrayBuffer();
    const buf = await audioCtxRef.current.decodeAudioData(ab);
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
        setErrorMsg("");

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
          if (elapsed >= 15) stopRecording();
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
    setErrorMsg("");

    const formData = new FormData();
    formData.append("audio", blobRef.current, "recording.webm");
    formData.append("genre", GENRES[genreIdx].tags);

    try {
      const res = await fetch("/dream/44-vocal-bgm/api", {
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

      const genResp = await fetch(json.url);
      const genBlob = await genResp.blob();
      const peaks = await decodeToPeaks(genBlob, 200);
      peaksGenRef.current = peaks;
      redrawWaveform();

      playAudio(json.url);
    } catch (err) {
      setErrorMsg(String(err));
      setPhase("error");
    }
  }

  function playAudio(url: string) {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    const ctx = audioCtxRef.current;

    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch { /* already stopped */ }
    }

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.85;
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
        if (bloomCanvas) startBloom(analyser, bloomCanvas, animRef);

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

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      if (sourceRef.current) try { sourceRef.current.stop(); } catch { /* ok */ }
    };
  }, []);

  useEffect(() => {
    const onResize = () => redrawWaveform();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  });

  const isRecording = phase === "recording";
  const isGenerating = phase === "generating";
  const isPlaying = phase === "playing";
  const canArrange = phase === "recorded" && !!blobRef.current;

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
        maxWidth: 680,
        margin: "0 auto",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: "-0.5px" }}>
          ◈ vocal-bgm
        </h1>
        <p style={{ fontSize: 13, color: "#888", margin: "6px 0 2px", lineHeight: 1.5 }}>
          Hum, sing, or play a melody · ACE-Step arranges a full band around it
        </p>
        <Link href="/dream" style={{ fontSize: 11, color: "#555", textDecoration: "none" }}>
          ← dream index
        </Link>
      </div>

      {/* Genre selector */}
      <div
        style={{
          border: "1px solid #1e1e2e",
          borderRadius: 8,
          padding: 14,
          marginBottom: 14,
          background: "#0c0c18",
        }}
      >
        <div style={{ fontSize: 11, color: "#666", marginBottom: 10, letterSpacing: "0.08em" }}>
          ARRANGEMENT STYLE
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {GENRES.map((g, i) => (
            <button
              key={i}
              onClick={() => setGenreIdx(i)}
              disabled={isGenerating || isPlaying}
              style={{
                background: genreIdx === i ? "#1a2a4a" : "transparent",
                color: genreIdx === i ? "#60a0ff" : "#666",
                border: `1px solid ${genreIdx === i ? "#2a4a8a" : "#222"}`,
                borderRadius: 4,
                padding: "5px 12px",
                fontFamily: "inherit",
                fontSize: 12,
                cursor: isGenerating || isPlaying ? "not-allowed" : "pointer",
                transition: "all 0.15s",
              }}
            >
              {g.label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "#444", marginTop: 8 }}>
          {GENRES[genreIdx].tags}
        </div>
      </div>

      {/* Record panel */}
      <div
        style={{
          border: "1px solid #1e1e2e",
          borderRadius: 8,
          padding: 16,
          marginBottom: 14,
          background: "#0c0c18",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          {(phase === "idle" || phase === "recorded" || phase === "error") ? (
            <button
              onClick={startRecording}
              style={{
                background: "#8b1a1a",
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
                background: "#333",
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

          <span style={{ fontSize: 13, color: "#888" }}>
            {isRecording
              ? `Recording… ${recSec}s / 15s`
              : phase === "recorded"
              ? `✓ Recorded ${recSec}s — ready to arrange`
              : phase === "idle"
              ? "Hum or sing a 5–15 second melody"
              : isGenerating
              ? "ACE-Step is arranging…"
              : isPlaying
              ? "Playing full arrangement…"
              : phase === "error"
              ? "Error — try again"
              : ""}
          </span>

          {isRecording && (
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: "50%",
                background: "#e53935",
                display: "inline-block",
                animation: "recpulse 1s ease-in-out infinite",
              }}
            />
          )}
        </div>

        {/* Waveform strip */}
        <canvas
          ref={waveCanvasRef}
          style={{
            width: "100%",
            height: 60,
            background: "#07070f",
            borderRadius: 4,
            display: "block",
          }}
        />

        {peaksGenRef.current.length > 0 && (
          <div style={{ display: "flex", gap: 20, marginTop: 6, fontSize: 11, color: "#555" }}>
            <span><span style={{ color: "#ffb43a" }}>▓</span> your melody</span>
            <span><span style={{ color: "#3ca0ff" }}>▓</span> full arrangement</span>
          </div>
        )}
      </div>

      {/* Arrange panel */}
      <div
        style={{
          border: "1px solid #1e1e2e",
          borderRadius: 8,
          padding: 16,
          marginBottom: 14,
          background: "#0c0c18",
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            onClick={sendToFal}
            disabled={!canArrange || isGenerating || isPlaying}
            style={{
              background:
                canArrange && !isGenerating && !isPlaying ? "#1a3a7a" : "#0f0f1e",
              color:
                canArrange && !isGenerating && !isPlaying ? "#c0d8ff" : "#333",
              border: "none",
              borderRadius: 4,
              padding: "9px 22px",
              fontFamily: "inherit",
              fontSize: 14,
              cursor:
                canArrange && !isGenerating && !isPlaying ? "pointer" : "not-allowed",
              transition: "all 0.15s",
            }}
          >
            {isGenerating ? "Arranging…" : "Arrange →"}
          </button>

          {genUrl && !isPlaying && (
            <button
              onClick={() => genUrl && playAudio(genUrl)}
              style={{
                background: "transparent",
                color: "#3ca0ff",
                border: "1px solid #1a3a6a",
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
            <span style={{ fontSize: 12, color: "#555" }}>~20–40s…</span>
          )}
        </div>

        {phase === "error" && errorMsg && (
          <div
            style={{
              marginTop: 12,
              padding: "8px 12px",
              background: "#110808",
              border: "1px solid #4a1010",
              borderRadius: 4,
              fontSize: 12,
              color: "#e57373",
              lineHeight: 1.5,
            }}
          >
            {errorMsg}
          </div>
        )}

        {!canArrange && phase !== "error" && phase !== "generating" && phase !== "playing" && (
          <p style={{ margin: "10px 0 0", fontSize: 12, color: "#444", lineHeight: 1.6 }}>
            Record a melody first. Your melodic contour becomes the lead motif —
            the AI adds drums, bass, chords, and harmony in the selected style.
            Different from <em style={{ color: "#666" }}>stable-extend</em> which continues
            your phrase forward: this wraps a full band <em style={{ color: "#666" }}>around</em> it.
          </p>
        )}
      </div>

      {/* Bloom visualizer */}
      {(isPlaying || genUrl) && (
        <div
          style={{
            border: "1px solid #1e1e2e",
            borderRadius: 8,
            overflow: "hidden",
            marginBottom: 14,
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
                color: "#333",
              }}
            >
              Press replay to see the bloom
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: "auto", paddingTop: 8, fontSize: 11, color: "#383848" }}>
        <Link
          href="/dream/44-vocal-bgm/README.md"
          style={{ color: "#383848", textDecoration: "none" }}
        >
          design notes
        </Link>
        {" · "}
        <span>$0.006/arrangement · fal-ai/ace-step/audio-to-audio</span>
      </div>

      <style>{`
        @keyframes recpulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.25; }
        }
      `}</style>
    </div>
  );
}
