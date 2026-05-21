"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import Link from "next/link";

const BAND_COLORS: ReadonlyArray<[number, number, number]> = [
  [88, 32, 192],
  [32, 168, 220],
  [80, 220, 100],
  [240, 220, 70],
  [255, 150, 40],
  [255, 60, 120],
];

const SCENES = [
  {
    id: "stone",
    label: "Stone Chamber",
    tags: "stone chamber, single piano chord, long stone reverb, sparse, ancient, meditative",
  },
  {
    id: "root",
    label: "Root Portal",
    tags: "underground roots, deep bass drone, organic percussion, earthy forest, low frequency, grounded",
  },
  {
    id: "pool",
    label: "Underground Pool",
    tags: "underground cave, water droplets rhythm, deep cavern resonance, vast echo chamber, submerged",
  },
  {
    id: "planet",
    label: "Tiny Planet",
    tags: "music box, sparse piano, delicate wind, miniature world, high reverb, distant gentle",
  },
  {
    id: "forest",
    label: "Forest Dawn",
    tags: "forest dawn, ceremonial drums, reverbed piano, birdsong, morning light, ceremonial, hopeful",
  },
  {
    id: "cosmic",
    label: "Cosmic Ascension",
    tags: "cosmic, orchestral strings, 80 BPM, ascending, vast reverb, transcendent, epic",
  },
];

const MOODS = [
  "meditative",
  "dreaming",
  "ascending",
  "melancholic",
  "ethereal",
  "grounded",
  "tense",
  "vast",
];

type Phase = "idle" | "recording" | "recorded" | "generating" | "playing" | "error";

// Assemble ACE-Step tags from the three collage inputs.
function assembleTags(
  sceneIdx: number,
  moodIdx: number,
  contour: string | null
): string {
  const parts: string[] = [SCENES[sceneIdx].tags, MOODS[moodIdx]];
  if (contour) parts.push(contour);
  return parts.join(", ");
}

// Analyze decoded audio buffer → brief descriptor for the tags field.
// Measures amplitude + spectral brightness (ratio of high-frequency diff energy to total).
function analyzeAudio(buf: AudioBuffer): string {
  const data = buf.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / 8000));
  let sumSq = 0;
  let sumDiffSq = 0;
  let count = 0;
  for (let i = step; i < data.length; i += step) {
    const v = data[i];
    const d = data[i] - data[i - step];
    sumSq += v * v;
    sumDiffSq += d * d;
    count++;
  }
  if (count === 0) return "melodic reference";
  const rms = Math.sqrt(sumSq / count);
  const brightness = Math.sqrt(sumDiffSq / count) / (rms + 1e-6);

  const amp = rms < 0.03 ? "soft" : rms < 0.12 ? "moderate" : "expressive";
  const tone = brightness < 0.35 ? "bass-warm" : brightness < 0.75 ? "balanced" : "bright-treble";

  return `${amp} ${tone} melodic reference`;
}

// Build waveform peak array (abs-max per bin).
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
    ctx.fillStyle = `rgba(${r},${g},${b},0.82)`;
    ctx.fillRect(x0 + i * barW, cy - h, Math.max(1, barW - 1), h * 2);
  }
}

// Run the 6-band radial bloom animation on a canvas.
function runBloom(
  analyser: AnalyserNode,
  canvas: HTMLCanvasElement,
  animRef: { current: number }
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const fdata = new Uint8Array(analyser.frequencyBinCount);

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
    const cx = cw / 2;
    const cy = ch / 2;

    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(0, 0, cw, ch);

    const binPerBand = Math.floor(fdata.length / 6);
    ctx.globalCompositeOperation = "lighter";
    for (let b = 0; b < 6; b++) {
      let sum = 0;
      const start = b * binPerBand;
      const end = start + binPerBand;
      for (let i = start; i < end; i++) sum += fdata[i];
      const energy = sum / (binPerBand * 255);
      const [r, g, bl] = BAND_COLORS[b];
      const maxR = Math.min(cx, cy) * (0.25 + 0.75 * (1 - b / 6));
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

export default function CollageCompose() {
  const [sceneIdx, setSceneIdx] = useState(0);
  const [moodIdx, setMoodIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [humCaptured, setHumCaptured] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const [contour, setContour] = useState<string | null>(null);
  const [genUrl, setGenUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const peaksHumRef = useRef<number[]>([]);
  const peaksGenRef = useRef<number[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recStartRef = useRef(0);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const animRef = useRef(0);
  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bloomCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const tags = assembleTags(sceneIdx, moodIdx, contour);
  const busy = phase === "recording" || phase === "generating" || phase === "playing";

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
    const hasHum = peaksHumRef.current.length > 0;
    const hasGen = peaksGenRef.current.length > 0;

    if (hasHum && hasGen) {
      const mid = Math.floor(cw / 2);
      drawPeakBars(ctx, peaksHumRef.current, 0, mid - 2, cy, halfH, 255, 180, 60);
      drawPeakBars(ctx, peaksGenRef.current, mid + 2, cw - mid - 2, cy, halfH, 60, 160, 255);
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(mid, 0);
      ctx.lineTo(mid, ch);
      ctx.stroke();
    } else if (hasHum) {
      drawPeakBars(ctx, peaksHumRef.current, 0, cw, cy, halfH, 255, 180, 60);
    } else if (hasGen) {
      drawPeakBars(ctx, peaksGenRef.current, 0, cw, cy, halfH, 60, 160, 255);
    }
  }

  async function decodeBlob(blob: Blob): Promise<AudioBuffer> {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    const ab = await blob.arrayBuffer();
    return audioCtxRef.current.decodeAudioData(ab);
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
        peaksHumRef.current = [];
        peaksGenRef.current = [];
        setGenUrl(null);
        setContour(null);
        setHumCaptured(false);
        setErrorMsg("");

        rec.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunksRef.current, { type: mimeType });
          blobRef.current = blob;
          decodeBlob(blob)
            .then((buf) => {
              setContour(analyzeAudio(buf));
              peaksHumRef.current = buildPeaks(buf, 200);
              redrawWaveform();
              setHumCaptured(true);
              setPhase("recorded");
            })
            .catch(() => {
              setHumCaptured(true);
              setPhase("recorded");
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

  async function compose() {
    setPhase("generating");
    setErrorMsg("");
    peaksGenRef.current = [];

    const formData = new FormData();
    formData.append("tags", tags);
    if (blobRef.current) {
      formData.append("audio", blobRef.current, "hum.webm");
    }

    try {
      const res = await fetch("/dream/62-collage-compose/api", {
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
      const buf = await decodeBlob(genBlob);
      peaksGenRef.current = buildPeaks(buf, 200);
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
      try {
        sourceRef.current.stop();
      } catch {
        /* already stopped */
      }
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
        if (bloomCanvas) runBloom(analyser, bloomCanvas, animRef);

        src.onended = () => {
          cancelAnimationFrame(animRef.current);
          setPhase(humCaptured ? "recorded" : "idle");
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
  const hasGenerated = !!genUrl;

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
          ◈ collage-compose
        </h1>
        <p style={{ fontSize: 13, color: "#888", margin: "6px 0 2px", lineHeight: 1.5 }}>
          Scene · mood · melody → ACE-Step generates a 30s composition
        </p>
        <Link href="/dream" style={{ fontSize: 11, color: "#555", textDecoration: "none" }}>
          ← dream index
        </Link>
      </div>

      {/* Scene selector */}
      <SectionBox label="GHOST SCENE">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {SCENES.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setSceneIdx(i)}
              disabled={busy}
              style={{
                background: sceneIdx === i ? "#1a2a4a" : "transparent",
                color: sceneIdx === i ? "#60a0ff" : "#666",
                border: `1px solid ${sceneIdx === i ? "#2a4a8a" : "#222"}`,
                borderRadius: 4,
                padding: "5px 12px",
                fontFamily: "inherit",
                fontSize: 12,
                cursor: busy ? "not-allowed" : "pointer",
                transition: "all 0.15s",
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </SectionBox>

      {/* Mood selector */}
      <SectionBox label="MOOD">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {MOODS.map((m, i) => (
            <button
              key={m}
              onClick={() => setMoodIdx(i)}
              disabled={busy}
              style={{
                background: moodIdx === i ? "#2a1a4a" : "transparent",
                color: moodIdx === i ? "#b060ff" : "#666",
                border: `1px solid ${moodIdx === i ? "#5a2a8a" : "#222"}`,
                borderRadius: 4,
                padding: "5px 12px",
                fontFamily: "inherit",
                fontSize: 12,
                cursor: busy ? "not-allowed" : "pointer",
                transition: "all 0.15s",
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </SectionBox>

      {/* Hum recorder */}
      <SectionBox label="YOUR MELODY — optional, hum or play piano">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
          {phase === "idle" || phase === "recorded" || phase === "error" ? (
            <button
              onClick={startRecording}
              style={{
                background: "#3a1010",
                color: "#ff9090",
                border: "1px solid #5a2020",
                borderRadius: 4,
                padding: "7px 16px",
                fontFamily: "inherit",
                fontSize: 13,
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
                border: "1px solid #555",
                borderRadius: 4,
                padding: "7px 16px",
                fontFamily: "inherit",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              ■ STOP
            </button>
          ) : null}

          <span style={{ fontSize: 12, color: "#666" }}>
            {isRecording
              ? `● ${recSec}s / 15s`
              : humCaptured
              ? `✓ melody captured${contour ? ` · ${contour}` : ""}`
              : isGenerating
              ? "composing…"
              : isPlaying
              ? "playing…"
              : "No melody — compose from scene + mood only"}
          </span>

          {isRecording && (
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#e53935",
                display: "inline-block",
                animation: "recpulse 1s ease-in-out infinite",
              }}
            />
          )}
        </div>

        <canvas
          ref={waveCanvasRef}
          style={{
            width: "100%",
            height: 52,
            background: "#07070f",
            borderRadius: 4,
            display: "block",
          }}
        />

        {peaksGenRef.current.length > 0 && (
          <div style={{ display: "flex", gap: 20, marginTop: 5, fontSize: 11, color: "#555" }}>
            {peaksHumRef.current.length > 0 && (
              <span>
                <span style={{ color: "#ffb43a" }}>▓</span> your melody
              </span>
            )}
            <span>
              <span style={{ color: "#3ca0ff" }}>▓</span> generated track
            </span>
          </div>
        )}
      </SectionBox>

      {/* Prompt preview */}
      <SectionBox label="ACE-STEP PROMPT">
        <div
          style={{
            fontSize: 11,
            color: "#4a5a6a",
            lineHeight: 1.6,
            wordBreak: "break-word",
          }}
        >
          {tags}
        </div>
      </SectionBox>

      {/* Compose button */}
      <div
        style={{
          border: "1px solid #1e1e2e",
          borderRadius: 8,
          padding: 14,
          marginBottom: 14,
          background: "#0c0c18",
          display: "flex",
          gap: 10,
          alignItems: "center",
        }}
      >
        <button
          onClick={compose}
          disabled={isRecording || isGenerating || isPlaying}
          style={{
            background: !busy ? "#1a3a7a" : "#0f0f1e",
            color: !busy ? "#c0d8ff" : "#333",
            border: "none",
            borderRadius: 4,
            padding: "9px 22px",
            fontFamily: "inherit",
            fontSize: 14,
            cursor: !busy ? "pointer" : "not-allowed",
            transition: "all 0.15s",
          }}
        >
          {isGenerating ? "Composing…" : "Compose →"}
        </button>

        {hasGenerated && !isPlaying && (
          <button
            onClick={() => genUrl && playAudio(genUrl)}
            style={{
              background: "transparent",
              color: "#3ca0ff",
              border: "1px solid #1a3a6a",
              borderRadius: 4,
              padding: "8px 14px",
              fontFamily: "inherit",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            ▶ replay
          </button>
        )}

        {isGenerating && (
          <span style={{ fontSize: 12, color: "#555" }}>~20–40s</span>
        )}
      </div>

      {/* Error */}
      {phase === "error" && errorMsg && (
        <div
          style={{
            padding: "10px 14px",
            background: "#110808",
            border: "1px solid #4a1010",
            borderRadius: 6,
            fontSize: 12,
            color: "#e57373",
            marginBottom: 14,
            lineHeight: 1.5,
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* Bloom visualizer */}
      {(isPlaying || hasGenerated) && (
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
                fontSize: 12,
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
          href="/dream/62-collage-compose/README.md"
          style={{ color: "#383848", textDecoration: "none" }}
        >
          design notes
        </Link>
        {" · "}
        <span>
          $0.006/track ·{" "}
          {humCaptured
            ? "fal-ai/ace-step/audio-to-audio"
            : "fal-ai/ace-step"}
        </span>
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

function SectionBox({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px solid #1e1e2e",
        borderRadius: 8,
        padding: 14,
        marginBottom: 14,
        background: "#0c0c18",
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "#666",
          marginBottom: 10,
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}
