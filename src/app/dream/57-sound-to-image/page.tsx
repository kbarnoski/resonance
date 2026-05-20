"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Phase = "idle" | "capturing" | "generating" | "done" | "error";

const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

interface CaptureFrame {
  energy: number;
  centroid: number;
  zcr: number;
  chroma: number[];
  pitch: number;
}

function detectPitch(buf: Float32Array<ArrayBuffer>, sampleRate: number): number {
  const minLag = Math.floor(sampleRate / 900);
  const maxLag = Math.min(Math.floor(sampleRate / 70), Math.floor(buf.length / 2));
  const N = Math.min(1024, Math.floor(buf.length / 2));
  let bestR = 0;
  let bestLag = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let r = 0;
    for (let i = 0; i < N; i++) r += buf[i] * buf[i + lag];
    if (r > bestR) {
      bestR = r;
      bestLag = lag;
    }
  }
  if (bestR < 0.005 || bestLag === 0) return 0;
  return sampleRate / bestLag;
}

function buildPrompt(frames: CaptureFrame[]): { text: string; prompt: string } {
  const mean = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const avgE = mean(frames.map((f) => f.energy));
  const avgC = mean(frames.map((f) => f.centroid));
  const avgZ = mean(frames.map((f) => f.zcr));

  const chroma = new Array(12).fill(0) as number[];
  for (const f of frames) for (let i = 0; i < 12; i++) chroma[i] += f.chroma[i];
  for (let i = 0; i < 12; i++) chroma[i] /= Math.max(1, frames.length);

  const pitched = frames.filter((f) => f.pitch > 60 && f.pitch < 2000);
  const medPitch =
    pitched.length > 0
      ? [...pitched.map((f) => f.pitch)].sort((a, b) => a - b)[
          Math.floor(pitched.length / 2)
        ]
      : 0;

  const eLabel =
    avgE < 0.12
      ? "whisper-quiet"
      : avgE < 0.3
        ? "soft"
        : avgE < 0.55
          ? "moderate"
          : avgE < 0.75
            ? "strong"
            : "powerful";

  const cLabel =
    avgC < 400
      ? "deep bass"
      : avgC < 900
        ? "warm bass-dominant"
        : avgC < 1800
          ? "clear mid-range"
          : avgC < 3500
            ? "bright upper-mid"
            : "crisp high-frequency";

  const tLabel =
    avgZ < 0.1 ? "smooth tonal" : avgZ < 0.3 ? "textured" : "percussive";

  let rootNote = 0;
  for (let i = 1; i < 12; i++) if (chroma[i] > chroma[rootNote]) rootNote = i;
  const majorE = chroma[(rootNote + 4) % 12];
  const minorE = chroma[(rootNote + 3) % 12];
  const hasKey = (chroma[rootNote] ?? 0) > 0.06;
  const modeLabel = !hasKey
    ? "ambient, atonal"
    : majorE > minorE
      ? `${NOTE_NAMES[rootNote]} major, hopeful`
      : `${NOTE_NAMES[rootNote]} minor, introspective`;

  const pitchStr = medPitch > 0 ? `, central pitch ${Math.round(medPitch)} Hz` : "";
  const text = `${eLabel}, ${tLabel}, ${cLabel} music — ${modeLabel}${pitchStr}`;

  let scene: string;
  if (avgE < 0.25 && avgC < 700) {
    scene =
      "a deep stone chamber underground, single candle flame, ancient carved walls, mist rising from still dark water, profound silence and weight";
  } else if (avgE < 0.25 && avgC >= 700) {
    scene =
      "a misty ancient forest at first light, soft golden rays through tall trees, dew drops on green ferns, empty clearing, timeless tranquility";
  } else if (avgE < 0.55 && avgC < 900) {
    scene =
      "a vast sea cave with glowing bioluminescent blue water, cathedral stalactite ceiling, absolute stillness, deep reflecting pool, mysterious glow";
  } else if (avgE < 0.55 && avgC >= 900) {
    scene =
      "an ancient sunlit courtyard, warm golden stone, climbing roses, arched colonnade casting long shadows, Mediterranean afternoon light";
  } else if (avgC < 1200) {
    scene =
      "a wild headland at dusk, massive waves crashing against dark volcanic rocks, storm light on the horizon, sea spray, raw elemental power";
  } else {
    scene =
      "a vast luminous cosmic nebula in deep space, swirling gas clouds in deep purples and warm gold, brilliant star clusters, transcendent infinite scale";
  }

  const prompt = `${text}. ${scene}. Photorealistic, cinematic composition, dramatic atmospheric lighting, hyper-detailed, no text, no words, no people visible.`;
  return { text, prompt };
}

export default function SoundToImage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [countdown, setCountdown] = useState(10);
  const [featureText, setFeatureText] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imgOpacity, setImgOpacity] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [isMic, setIsMic] = useState(false);
  const [frameCount, setFrameCount] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const actxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);
  const framesRef = useRef<CaptureFrame[]>([]);
  const promptRef = useRef("");

  function drawWave(timeBuf: Float32Array<ArrayBuffer>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#05050f";
    ctx.fillRect(0, 0, w, h);
    ctx.beginPath();
    ctx.strokeStyle = "#3a7aaa";
    ctx.lineWidth = 1.2;
    const step = Math.max(1, Math.floor(timeBuf.length / w));
    for (let i = 0; i < w; i++) {
      const sample = timeBuf[i * step] ?? 0;
      const y = h / 2 + sample * h * 0.42;
      if (i === 0) ctx.moveTo(i, y);
      else ctx.lineTo(i, y);
    }
    ctx.stroke();
  }

  async function finalize() {
    void actxRef.current?.close();
    actxRef.current = null;

    const frames = framesRef.current;
    if (frames.length === 0) {
      setErrorMsg("No frames captured — try again");
      setPhase("error");
      return;
    }

    const { text, prompt } = buildPrompt(frames);
    setFeatureText(text);
    promptRef.current = prompt;
    setPhase("generating");

    try {
      const res = await fetch("/dream/57-sound-to-image/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || json.error) {
        setErrorMsg(json.error ?? "API error");
        setPhase("error");
        return;
      }
      if (!json.url) {
        setErrorMsg("No image URL in response");
        setPhase("error");
        return;
      }
      setImageUrl(json.url);
      setImgOpacity(0);
      setPhase("done");
      setTimeout(() => setImgOpacity(1), 80);
    } catch (err) {
      setErrorMsg(String(err));
      setPhase("error");
    }
  }

  async function startCapture(mic: boolean) {
    cancelAnimationFrame(rafRef.current);
    void actxRef.current?.close();
    actxRef.current = null;

    setIsMic(mic);
    setPhase("capturing");
    setCountdown(10);
    setImageUrl(null);
    setFeatureText("");
    setErrorMsg("");
    setFrameCount(0);
    framesRef.current = [];

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Ctx = window.AudioContext ?? ((window as any).webkitAudioContext as typeof AudioContext);
      const actx = new Ctx();
      actxRef.current = actx;

      const analyser = actx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.0;

      const freqBuf = new Float32Array(new ArrayBuffer(analyser.frequencyBinCount * 4));
      const timeBuf = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
      const sampleRate = actx.sampleRate;
      const binHz = sampleRate / analyser.fftSize;
      const DURATION = 10;

      if (mic) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
        const src = actx.createMediaStreamSource(stream);
        src.connect(analyser);
      } else {
        const master = actx.createGain();
        master.gain.value = 0.35;
        master.connect(analyser);
        master.connect(actx.destination);
        const demoNotes = [261.63, 329.63, 392.0, 523.25, 220.0];
        for (const freq of demoNotes) {
          const osc = actx.createOscillator();
          const g = actx.createGain();
          osc.type = "triangle";
          osc.frequency.value = freq;
          g.gain.value = 0.07;
          osc.connect(g);
          g.connect(master);
          osc.start();
        }
      }

      const startT = actx.currentTime;
      let lastAnalyzeT = -1;

      function tick() {
        const elapsed = actx.currentTime - startT;
        setCountdown(Math.max(0, Math.ceil(DURATION - elapsed)));

        analyser.getFloatTimeDomainData(timeBuf as unknown as Float32Array<ArrayBuffer>);
        drawWave(timeBuf as unknown as Float32Array<ArrayBuffer>);

        if (elapsed - lastAnalyzeT >= 0.1) {
          lastAnalyzeT = elapsed;
          analyser.getFloatFrequencyData(freqBuf as unknown as Float32Array<ArrayBuffer>);

          // RMS energy
          let rms = 0;
          for (let i = 0; i < timeBuf.length; i++) rms += timeBuf[i] * timeBuf[i];
          rms = Math.sqrt(rms / timeBuf.length);
          const energy = Math.min(1, rms * 6);

          // Spectral centroid
          let wSum = 0;
          let wTot = 0;
          for (let i = 1; i < freqBuf.length; i++) {
            const lin = Math.pow(10, freqBuf[i] / 20);
            wSum += i * binHz * lin;
            wTot += lin;
          }
          const centroid = wTot > 0 ? wSum / wTot : 500;

          // Zero-crossing rate
          let zcr = 0;
          for (let i = 1; i < timeBuf.length; i++) {
            if ((timeBuf[i] ?? 0) >= 0 !== (timeBuf[i - 1] ?? 0) >= 0) zcr++;
          }

          // 12-bin chroma
          const chroma = new Array(12).fill(0) as number[];
          let chromaTot = 0;
          for (let i = 1; i < freqBuf.length; i++) {
            const hz = i * binHz;
            if (hz < 60 || hz > 4000) continue;
            const lin = Math.pow(10, freqBuf[i] / 20);
            const noteF = 12 * Math.log2(hz / 440) + 69;
            const pc = ((Math.round(noteF) % 12) + 12) % 12;
            chroma[pc] += lin;
            chromaTot += lin;
          }
          if (chromaTot > 0) for (let i = 0; i < 12; i++) chroma[i] /= chromaTot;

          const pitch = detectPitch(timeBuf as unknown as Float32Array<ArrayBuffer>, sampleRate);

          framesRef.current.push({
            energy,
            centroid,
            zcr: zcr / timeBuf.length,
            chroma,
            pitch,
          });
          setFrameCount(framesRef.current.length);
        }

        if (elapsed < DURATION) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          void finalize();
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Microphone unavailable");
      setPhase("error");
    }
  }

  function handleStart(mic: boolean) {
    startCapture(mic).catch((err: unknown) => {
      setErrorMsg(String(err));
      setPhase("error");
    });
  }

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      void actxRef.current?.close();
    };
  }, []);

  const canStart = phase === "idle" || phase === "done" || phase === "error";
  const isCapturing = phase === "capturing";
  const isGenerating = phase === "generating";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#080810",
        color: "#e8e8f0",
        fontFamily: "'JetBrains Mono','Fira Mono',monospace",
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
          ◈ sound-to-image
        </h1>
        <p style={{ fontSize: 13, color: "#888", margin: "6px 0 2px", lineHeight: 1.5 }}>
          10 seconds of audio → acoustic fingerprint → scene image of what your music looks like
        </p>
        <Link href="/dream" style={{ fontSize: 11, color: "#555", textDecoration: "none" }}>
          ← dream index
        </Link>
      </div>

      {/* Controls */}
      <div
        style={{
          border: "1px solid #1e1e2e",
          borderRadius: 8,
          padding: 16,
          marginBottom: 14,
          background: "#0c0c18",
        }}
      >
        <div
          style={{ fontSize: 11, color: "#666", marginBottom: 12, letterSpacing: "0.08em" }}
        >
          CAPTURE
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button
            onClick={() => handleStart(false)}
            disabled={!canStart}
            style={{
              background: canStart ? "#151530" : "#0f0f1e",
              color: canStart ? "#7090d0" : "#333",
              border: `1px solid ${canStart ? "#252550" : "#111"}`,
              borderRadius: 4,
              padding: "9px 20px",
              fontFamily: "inherit",
              fontSize: 13,
              cursor: canStart ? "pointer" : "not-allowed",
              transition: "all 0.15s",
            }}
          >
            ▶ Demo
          </button>
          <button
            onClick={() => handleStart(true)}
            disabled={!canStart}
            style={{
              background: canStart ? "#0f2010" : "#0f0f1e",
              color: canStart ? "#60c860" : "#333",
              border: `1px solid ${canStart ? "#1a3520" : "#111"}`,
              borderRadius: 4,
              padding: "9px 20px",
              fontFamily: "inherit",
              fontSize: 13,
              cursor: canStart ? "pointer" : "not-allowed",
              transition: "all 0.15s",
            }}
          >
            🎤 Start mic
          </button>
          {isCapturing && (
            <span style={{ fontSize: 13, color: "#7090d0" }}>
              {countdown > 0
                ? `${countdown}s remaining · ${frameCount} frames`
                : "analyzing…"}
            </span>
          )}
          {isGenerating && (
            <span style={{ fontSize: 13, color: "#c0a8e0" }}>generating image… ~5–10s</span>
          )}
        </div>
        <p style={{ margin: "10px 0 0", fontSize: 11, color: "#444", lineHeight: 1.5 }}>
          {canStart && !isCapturing && !isGenerating
            ? "Play anything for 10 seconds — melody, chords, noise, rhythm. The acoustic fingerprint determines the scene."
            : isCapturing
              ? `Listening to ${isMic ? "microphone" : "demo chord (C major, 5 triangle oscillators)"}…`
              : isGenerating
                ? `Sending: "${promptRef.current.slice(0, 90)}…"`
                : ""}
        </p>
      </div>

      {/* Waveform — visible during capture */}
      <div
        style={{
          border: "1px solid #1e1e2e",
          borderRadius: 8,
          overflow: "hidden",
          marginBottom: 14,
          display: isCapturing ? "block" : "none",
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: 72, display: "block", background: "#05050f" }}
        />
      </div>

      {/* Acoustic fingerprint readout */}
      {featureText && (
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
            style={{ fontSize: 11, color: "#666", marginBottom: 8, letterSpacing: "0.08em" }}
          >
            ACOUSTIC FINGERPRINT
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "#a0a8c0", lineHeight: 1.6 }}>
            {featureText}
          </p>
        </div>
      )}

      {/* Generated image */}
      {imageUrl && (
        <div
          style={{
            border: "1px solid #1e1e2e",
            borderRadius: 8,
            overflow: "hidden",
            marginBottom: 14,
            opacity: imgOpacity,
            transition: "opacity 1.8s ease",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Scene generated from acoustic fingerprint"
            style={{ width: "100%", display: "block" }}
          />
          <div
            style={{
              padding: "8px 14px",
              background: "#07070f",
              fontSize: 11,
              color: "#444",
            }}
          >
            What your music looks like · Flux Schnell · ~$0.02
          </div>
        </div>
      )}

      {/* Error */}
      {phase === "error" && errorMsg && (
        <div
          style={{
            border: "1px solid #4a1010",
            borderRadius: 8,
            padding: 12,
            marginBottom: 14,
            background: "#110808",
            fontSize: 12,
            color: "#e07070",
            lineHeight: 1.5,
            wordBreak: "break-all",
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: "auto", paddingTop: 8, fontSize: 11, color: "#383848" }}>
        <Link
          href="/dream/57-sound-to-image/README.md"
          style={{ color: "#383848", textDecoration: "none" }}
        >
          design notes
        </Link>
        {" · "}
        <span>fal-ai/flux/schnell · FAL_KEY in use · ~$0.01–0.04/image</span>
        {" · "}
        <span>⚠ endpoint best-guess — paste any error text for a fix next cycle</span>
      </div>
    </div>
  );
}
