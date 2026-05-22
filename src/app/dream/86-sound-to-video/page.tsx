"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Phase = "idle" | "capturing" | "gen_image" | "gen_video" | "done" | "error";

const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

interface CaptureFrame {
  energy: number;
  centroid: number;
  zcr: number;
  chroma: number[];
  pitch: number;
}

function computePitch(buf: Float32Array<ArrayBuffer>, sampleRate: number): number {
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

interface SceneResult {
  summary: string;
  imagePrompt: string;
  motionPrompt: string;
}

function buildScene(frames: CaptureFrame[]): SceneResult {
  const mean = (arr: number[]) =>
    arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);

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

  const tLabel = avgZ < 0.1 ? "smooth tonal" : avgZ < 0.3 ? "textured" : "percussive";

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

  const pitchStr = medPitch > 0 ? `, centered around ${Math.round(medPitch)} Hz` : "";
  const summary = `${eLabel}, ${tLabel}, ${cLabel} — ${modeLabel}${pitchStr}`;

  // Scene selection: energy × spectral centroid matrix → 6 scene archetypes
  let sceneDesc: string;
  if (avgE < 0.25 && avgC < 700) {
    sceneDesc =
      "a deep stone chamber underground, single candle flame, ancient carved walls, mist rising from still dark water, profound weight and reverberant silence";
  } else if (avgE < 0.25 && avgC >= 700) {
    sceneDesc =
      "a misty ancient forest at first light, soft golden rays through tall trees, dew drops on green ferns, empty mossy clearing, timeless tranquility";
  } else if (avgE < 0.55 && avgC < 900) {
    sceneDesc =
      "a vast sea cave with glowing bioluminescent blue water, cathedral stalactite ceiling, absolute stillness, deep reflecting pool, mysterious light from below";
  } else if (avgE < 0.55 && avgC >= 900) {
    sceneDesc =
      "an ancient sunlit courtyard, warm golden stone, climbing roses, arched colonnade casting long shadows, Mediterranean afternoon, warm late light";
  } else if (avgC < 1200) {
    sceneDesc =
      "a wild headland at storm dusk, massive waves crashing against dark volcanic rocks, dramatic storm light on the horizon, raw elemental power, sea spray";
  } else {
    sceneDesc =
      "a vast luminous cosmic nebula in deep space, swirling gas clouds in deep purples and warm gold, brilliant star clusters, transcendent infinite scale, cosmic awe";
  }

  const imagePrompt = `${sceneDesc}. Cinematic widescreen 16:9 composition, dramatic atmospheric lighting, ultra-detailed photorealistic, no text, no people, 4K quality. Audio character: ${summary}.`;

  // Motion prompt: energy drives pace and intensity of movement
  let motionPrompt: string;
  if (avgE < 0.2) {
    motionPrompt =
      "extremely slow drift, barely perceptible movement, single long meditative camera exhale, absolute stillness and peace, 4K cinematic";
  } else if (avgE < 0.45) {
    motionPrompt =
      "slow gentle camera glide forward, soft mist drifting, subtle light shift, warm atmospheric breath, dreamlike cinematic";
  } else if (avgE < 0.7) {
    motionPrompt =
      "flowing cinematic push through atmosphere, volumetric light rays sweeping, dynamic cloud movement, building atmospheric energy, epic scale";
  } else {
    motionPrompt =
      "dynamic sweeping camera, powerful elemental motion, surging waves or swirling nebula, epic atmospheric upheaval, cinematic grandeur";
  }

  return { summary, imagePrompt, motionPrompt };
}

export default function SoundToVideo() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [countdown, setCountdown] = useState(10);
  const [frameCount, setFrameCount] = useState(0);
  const [isMic, setIsMic] = useState(false);
  const [summary, setSummary] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageOpacity, setImageOpacity] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const actxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);
  const framesRef = useRef<CaptureFrame[]>([]);

  function renderWave(timeBuf: Float32Array<ArrayBuffer>) {
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
    ctx.strokeStyle = "#4a7acc";
    ctx.lineWidth = 1.5;
    const step = Math.max(1, Math.floor(timeBuf.length / w));
    for (let i = 0; i < w; i++) {
      const sample = timeBuf[i * step] ?? 0;
      const y = h / 2 + sample * h * 0.42;
      if (i === 0) ctx.moveTo(i, y);
      else ctx.lineTo(i, y);
    }
    ctx.stroke();
  }

  async function generateScenes(frames: CaptureFrame[]) {
    const { summary: sum, imagePrompt, motionPrompt } = buildScene(frames);
    setSummary(sum);
    setPhase("gen_image");

    try {
      // ── Phase 1: image ──
      const imgRes = await fetch("/dream/86-sound-to-video/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "image", prompt: imagePrompt }),
      });
      const imgJson = (await imgRes.json()) as { imageUrl?: string; error?: string };
      if (!imgRes.ok || imgJson.error) {
        setErrorMsg(imgJson.error ?? "Image generation failed");
        setPhase("error");
        return;
      }
      const newImageUrl = imgJson.imageUrl;
      if (!newImageUrl) {
        setErrorMsg("No image URL returned");
        setPhase("error");
        return;
      }
      setImageUrl(newImageUrl);
      setImageOpacity(0);
      setPhase("gen_video");
      setTimeout(() => setImageOpacity(1), 80);

      // ── Phase 2: video (image already visible to user) ──
      const vidRes = await fetch("/dream/86-sound-to-video/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "video",
          imageUrl: newImageUrl,
          motionPrompt,
        }),
      });
      const vidJson = (await vidRes.json()) as { videoUrl?: string; error?: string };
      if (!vidRes.ok || vidJson.error) {
        setErrorMsg(vidJson.error ?? "Video generation failed");
        setPhase("error");
        return;
      }
      const newVideoUrl = vidJson.videoUrl;
      if (!newVideoUrl) {
        setErrorMsg("No video URL returned");
        setPhase("error");
        return;
      }
      setVideoUrl(newVideoUrl);
      setPhase("done");
    } catch (err) {
      setErrorMsg(String(err));
      setPhase("error");
    }
  }

  async function captureAudio(mic: boolean) {
    cancelAnimationFrame(rafRef.current);
    void actxRef.current?.close();
    actxRef.current = null;

    setIsMic(mic);
    setPhase("capturing");
    setCountdown(10);
    setImageUrl(null);
    setVideoUrl(null);
    setSummary("");
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
        master.gain.value = 0.3;
        master.connect(analyser);
        master.connect(actx.destination);
        // C major chord across three octaves — clear tonal signal for demo
        for (const freq of [130.81, 164.81, 196.0, 261.63, 329.63, 392.0, 523.25]) {
          const osc = actx.createOscillator();
          const g = actx.createGain();
          osc.type = "triangle";
          osc.frequency.value = freq;
          g.gain.value = 0.05;
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
        renderWave(timeBuf as unknown as Float32Array<ArrayBuffer>);

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
            const lin = Math.pow(10, (freqBuf[i] ?? -100) / 20);
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
            const lin = Math.pow(10, (freqBuf[i] ?? -100) / 20);
            const noteF = 12 * Math.log2(hz / 440) + 69;
            const pc = ((Math.round(noteF) % 12) + 12) % 12;
            chroma[pc] += lin;
            chromaTot += lin;
          }
          if (chromaTot > 0) for (let i = 0; i < 12; i++) chroma[i] /= chromaTot;

          framesRef.current.push({
            energy,
            centroid,
            zcr: zcr / timeBuf.length,
            chroma,
            pitch: computePitch(timeBuf as unknown as Float32Array<ArrayBuffer>, sampleRate),
          });
          setFrameCount(framesRef.current.length);
        }

        if (elapsed < DURATION) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          void actxRef.current?.close();
          actxRef.current = null;
          const captured = framesRef.current;
          if (captured.length === 0) {
            setErrorMsg("No audio data captured — try again");
            setPhase("error");
          } else {
            generateScenes(captured).catch((err: unknown) => {
              setErrorMsg(String(err));
              setPhase("error");
            });
          }
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Microphone unavailable");
      setPhase("error");
    }
  }

  function handleStart(mic: boolean) {
    captureAudio(mic).catch((err: unknown) => {
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
  const isGenImage = phase === "gen_image";
  const isGenVideo = phase === "gen_video";
  const isDone = phase === "done";

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
        maxWidth: 720,
        margin: "0 auto",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: "-0.5px" }}>
          ◈ sound → image → video
        </h1>
        <p
          style={{
            fontSize: 16,
            color: "rgba(255,255,255,0.75)",
            margin: "8px 0 4px",
            lineHeight: 1.5,
          }}
        >
          10 seconds of audio → acoustic fingerprint → FLUX.2 scene → LTX animated clip
        </p>
        <Link
          href="/dream"
          style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", textDecoration: "none" }}
        >
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
          style={{
            fontSize: 12,
            color: "rgba(255,255,255,0.55)",
            marginBottom: 12,
            letterSpacing: "0.08em",
          }}
        >
          CAPTURE · 10 SECONDS
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button
            onClick={() => handleStart(false)}
            disabled={!canStart}
            style={{
              background: canStart ? "#151530" : "#0f0f1e",
              color: canStart ? "#7090d0" : "#333",
              border: `1px solid ${canStart ? "#252550" : "#111"}`,
              borderRadius: 6,
              padding: "10px 22px",
              fontFamily: "inherit",
              fontSize: 14,
              cursor: canStart ? "pointer" : "not-allowed",
              minHeight: 44,
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
              borderRadius: 6,
              padding: "10px 22px",
              fontFamily: "inherit",
              fontSize: 14,
              cursor: canStart ? "pointer" : "not-allowed",
              minHeight: 44,
              transition: "all 0.15s",
            }}
          >
            🎤 Start mic
          </button>

          {isCapturing && (
            <span style={{ fontSize: 14, color: "rgba(255,255,255,0.80)" }}>
              {countdown > 0
                ? `${countdown}s remaining · ${frameCount} frames`
                : "analyzing…"}
            </span>
          )}
          {isGenImage && (
            <span style={{ fontSize: 14, color: "#c0a8e0" }}>
              Generating scene image…
            </span>
          )}
          {isGenVideo && (
            <span style={{ fontSize: 14, color: "#8888e8" }}>
              Animating scene (LTX-Video)…
            </span>
          )}
          {isDone && (
            <span style={{ fontSize: 14, color: "#60c060" }}>
              ✓ Done
            </span>
          )}
        </div>

        <p
          style={{
            margin: "10px 0 0",
            fontSize: 14,
            color: "rgba(255,255,255,0.55)",
            lineHeight: 1.5,
          }}
        >
          {canStart
            ? "Play piano, sing, or use Demo. Your sound becomes a cinematic image, then a 5-second animated video."
            : isCapturing
              ? `Listening to ${isMic ? "microphone" : "demo C-major oscillators"}…`
              : isGenImage
                ? "FLUX.2 Dev · landscape 16:9 · ~15–25s"
                : isGenVideo
                  ? "LTX-Video · image → 5s clip · ~20–45s · image visible above"
                  : ""}
        </p>
      </div>

      {/* Waveform — only during capture */}
      {isCapturing && (
        <div
          style={{
            border: "1px solid #1e1e2e",
            borderRadius: 8,
            overflow: "hidden",
            marginBottom: 14,
          }}
        >
          <canvas
            ref={canvasRef}
            style={{ width: "100%", height: 72, display: "block", background: "#05050f" }}
          />
        </div>
      )}

      {/* Acoustic fingerprint readout */}
      {summary && (
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
              fontSize: 12,
              color: "rgba(255,255,255,0.55)",
              marginBottom: 8,
              letterSpacing: "0.08em",
            }}
          >
            ACOUSTIC FINGERPRINT
          </div>
          <p
            style={{
              margin: 0,
              fontSize: 15,
              color: "rgba(255,255,255,0.75)",
              lineHeight: 1.6,
            }}
          >
            {summary}
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
            opacity: imageOpacity,
            transition: "opacity 1.6s ease",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Cinematic scene generated from acoustic fingerprint"
            style={{ width: "100%", display: "block" }}
          />
          <div
            style={{
              padding: "8px 14px",
              background: "#07070f",
              fontSize: 13,
              color: "rgba(255,255,255,0.45)",
            }}
          >
            {isGenVideo
              ? "FLUX.2 Dev · scene ready · animating below…"
              : "FLUX.2 Dev · cinematic scene from your audio"}
          </div>
        </div>
      )}

      {/* Generated video */}
      {isDone && videoUrl && (
        <div
          style={{
            border: "1px solid #1e1e2e",
            borderRadius: 8,
            overflow: "hidden",
            marginBottom: 14,
          }}
        >
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            src={videoUrl}
            autoPlay
            loop
            muted
            playsInline
            controls
            style={{ width: "100%", display: "block", background: "#000" }}
          />
          <div
            style={{
              padding: "8px 14px",
              background: "#07070f",
              fontSize: 13,
              color: "rgba(255,255,255,0.45)",
            }}
          >
            LTX-Video · 5 seconds · the audio was the brush; this is the canvas
          </div>
        </div>
      )}

      {/* Error message */}
      {phase === "error" && errorMsg && (
        <div
          style={{
            border: "1px solid #4a1010",
            borderRadius: 8,
            padding: 14,
            marginBottom: 14,
            background: "#110808",
            fontSize: 14,
            color: "#e07070",
            lineHeight: 1.5,
            wordBreak: "break-all",
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          marginTop: "auto",
          paddingTop: 12,
          fontSize: 12,
          color: "rgba(255,255,255,0.30)",
          lineHeight: 1.8,
        }}
      >
        <Link
          href="/dream/86-sound-to-video/README.md"
          style={{ color: "rgba(255,255,255,0.30)", textDecoration: "none" }}
        >
          design notes
        </Link>
        {" · "}
        <span>FLUX.2 Dev ~$0.05 · LTX-Video ~$0.20 · FAL_KEY in use · ~$0.25/generation</span>
        <br />
        <span>⚠ endpoints best-guess — paste errors for next-cycle fix</span>
      </div>
    </div>
  );
}
