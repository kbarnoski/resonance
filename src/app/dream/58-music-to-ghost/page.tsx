"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const CAPTURE_DURATION = 8;

type Phase = "idle" | "capturing" | "generating" | "done" | "error";
type Quadrant = "energetic-bright" | "energetic-dark" | "calm-bright" | "calm-dark";

interface Frame {
  energy: number;
  chroma: number[];
  pitch: number;
  t: number;
}

// ──── audio helpers ────

function detectPitch(buf: Float32Array<ArrayBuffer>, sampleRate: number): number {
  const minLag = Math.floor(sampleRate / 900);
  const maxLag = Math.min(Math.floor(sampleRate / 70), Math.floor(buf.length / 2));
  const N = Math.min(1024, Math.floor(buf.length / 2));
  let bestR = 0;
  let bestLag = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let r = 0;
    for (let i = 0; i < N; i++) r += buf[i] * buf[i + lag];
    if (r > bestR) { bestR = r; bestLag = lag; }
  }
  if (bestR < 0.005 || bestLag === 0) return 0;
  return sampleRate / bestLag;
}

function pitchToHue(freq: number): number {
  if (freq <= 0) return 240;
  const t = Math.max(0, Math.min(1, Math.log2(freq / 60) / Math.log2(4000 / 60)));
  return (1 - t) * 260;
}

function pitchToY(freq: number, h: number): number {
  const midi = freq > 0 ? 12 * Math.log2(freq / 440) + 69 : 36;
  const clamped = Math.max(36, Math.min(90, midi));
  return h - ((clamped - 36) / 54) * h * 0.88 - h * 0.06;
}

function buildGhostPrompt(q: Quadrant): string {
  const scenes: Record<Quadrant, string> = {
    "energetic-bright":
      "vast infinite golden-white cosmic space, golden spiral galaxies and nebulae in all directions, " +
      "dense fibonacci spiral particle streams converging toward a single radiant point of pure light, " +
      "arms outstretched in transcendent flight, luminous and vast",
    "energetic-dark":
      "vast underground cavern with a glowing bioluminescent pool, turbulent dark water surging upward, " +
      "cosmic starlight filtering through cracks high above, fibonacci spiral particles rising from " +
      "the disturbed water surface, dramatic power and deep elemental tension, dark blue-violet light",
    "calm-bright":
      "ancient forest at dawn, tall trees with warm golden light filtering through the canopy, " +
      "dew drops on moss and ferns, white flowers blooming along a path, shaft of morning light " +
      "through ancient roots, peaceful and transcendent, soft mist",
    "calm-dark":
      "ancient dark stone castle chamber at night, tall arched stone window with cosmic void of " +
      "faint stars beyond, diagonal silver moonlight shaft across worn cracked stone floor with " +
      "ancient tree roots, deep dramatic shadows, single candle flame, meditative silence",
  };
  return scenes[q];
}

function classifyQuadrant(frames: Frame[]): { quadrant: Quadrant; chordLabel: string } {
  if (frames.length === 0) return { quadrant: "calm-dark", chordLabel: "ambient" };

  const avgEnergy = frames.reduce((s, f) => s + f.energy, 0) / frames.length;

  const chroma = new Array(12).fill(0) as number[];
  for (const f of frames) for (let i = 0; i < 12; i++) chroma[i] += f.chroma[i];
  const chromaMax = Math.max(...chroma);
  if (chromaMax > 0) for (let i = 0; i < 12; i++) chroma[i] /= chromaMax;

  let root = 0;
  for (let i = 1; i < 12; i++) if (chroma[i] > chroma[root]) root = i;
  const majorE = chroma[(root + 4) % 12];
  const minorE = chroma[(root + 3) % 12];
  const hasKey = chroma[root] > 0.4;

  let chordLabel: string;
  let valencePositive: boolean;
  if (!hasKey) {
    chordLabel = "ambient";
    valencePositive = false;
  } else if (majorE > minorE) {
    chordLabel = `${NOTE_NAMES[root]} major`;
    valencePositive = true;
  } else {
    chordLabel = `${NOTE_NAMES[root]} minor`;
    valencePositive = false;
  }

  const arousalHigh = avgEnergy > 0.35;
  let quadrant: Quadrant;
  if (arousalHigh && valencePositive) quadrant = "energetic-bright";
  else if (arousalHigh && !valencePositive) quadrant = "energetic-dark";
  else if (!arousalHigh && valencePositive) quadrant = "calm-bright";
  else quadrant = "calm-dark";

  return { quadrant, chordLabel };
}

// ──── canvas ────

function renderTrail(
  canvas: HTMLCanvasElement,
  frames: Frame[],
  elapsed: number,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  ctx.fillStyle = "#03030d";
  ctx.fillRect(0, 0, w, h);

  // Faint horizontal reference lines at C notes
  ctx.strokeStyle = "#141428";
  ctx.lineWidth = 1;
  for (let midi = 36; midi <= 84; midi += 12) {
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const y = pitchToY(freq, h);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Pitch dots
  for (const f of frames) {
    if (f.pitch <= 0) continue;
    const x = (f.t / CAPTURE_DURATION) * w;
    const y = pitchToY(f.pitch, h);
    const hue = pitchToHue(f.pitch);
    const age = elapsed - f.t;
    const alpha = Math.max(0, 1 - age / (CAPTURE_DURATION * 0.9));
    const radius = 2.5 + f.energy * 3.5;

    ctx.globalAlpha = alpha * 0.22;
    ctx.beginPath();
    ctx.arc(x, y, radius * 2.8, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${hue}, 70%, 55%)`;
    ctx.fill();

    ctx.globalAlpha = alpha * 0.85;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${hue}, 80%, 65%)`;
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Playhead
  if (elapsed < CAPTURE_DURATION) {
    const px = (elapsed / CAPTURE_DURATION) * w;
    ctx.strokeStyle = "#2a2a4a";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, h);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

// ──── component ────

const QUADRANT_LABELS: Record<Quadrant, string> = {
  "energetic-bright": "energetic · bright → cosmic ascension",
  "energetic-dark":   "energetic · dark → underground pool",
  "calm-bright":      "calm · bright → forest dawn",
  "calm-dark":        "calm · dark → stone chamber",
};

export default function MusicToGhost() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [countdown, setCountdown] = useState(CAPTURE_DURATION);
  const [frameCount, setFrameCount] = useState(0);
  const [quadrant, setQuadrant] = useState<Quadrant | null>(null);
  const [chordLabel, setChordLabel] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imgOpacity, setImgOpacity] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const actxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);
  const framesRef = useRef<Frame[]>([]);

  async function finalize() {
    void actxRef.current?.close();
    actxRef.current = null;

    const frames = framesRef.current;
    if (frames.length === 0) {
      setErrorMsg("No frames captured — try again");
      setPhase("error");
      return;
    }

    const { quadrant: q, chordLabel: cl } = classifyQuadrant(frames);
    setQuadrant(q);
    setChordLabel(cl);
    setPhase("generating");

    try {
      const res = await fetch("/dream/58-music-to-ghost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: buildGhostPrompt(q) }),
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

    setPhase("capturing");
    setCountdown(CAPTURE_DURATION);
    setImageUrl(null);
    setErrorMsg("");
    setQuadrant(null);
    setChordLabel("");
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

      if (mic) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
        actx.createMediaStreamSource(stream).connect(analyser);
      } else {
        // Demo: C major chord
        const master = actx.createGain();
        master.gain.value = 0.3;
        master.connect(analyser);
        master.connect(actx.destination);
        for (const freq of [261.63, 329.63, 392.0, 523.25, 196.0]) {
          const osc = actx.createOscillator();
          const g = actx.createGain();
          osc.type = "triangle";
          osc.frequency.value = freq;
          g.gain.value = 0.06;
          osc.connect(g);
          g.connect(master);
          osc.start();
        }
      }

      const startT = actx.currentTime;
      let lastAnalyzeT = -1;

      function tick() {
        const elapsed = actx.currentTime - startT;
        setCountdown(Math.max(0, Math.ceil(CAPTURE_DURATION - elapsed)));

        if (canvasRef.current) {
          renderTrail(canvasRef.current, framesRef.current, elapsed);
        }

        if (elapsed - lastAnalyzeT >= 0.1) {
          lastAnalyzeT = elapsed;
          analyser.getFloatFrequencyData(freqBuf as unknown as Float32Array<ArrayBuffer>);
          analyser.getFloatTimeDomainData(timeBuf as unknown as Float32Array<ArrayBuffer>);

          let rms = 0;
          for (let i = 0; i < timeBuf.length; i++) rms += timeBuf[i] * timeBuf[i];
          rms = Math.sqrt(rms / timeBuf.length);
          const energy = Math.min(1, rms * 6);

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

          framesRef.current.push({ energy, chroma, pitch, t: elapsed });
          setFrameCount(framesRef.current.length);
        }

        if (elapsed < CAPTURE_DURATION) {
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
  const showResult = phase === "done" || (phase === "generating" && quadrant !== null);

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
          ◈ music-to-ghost
        </h1>
        <p style={{ fontSize: 13, color: "#888", margin: "6px 0 2px", lineHeight: 1.5 }}>
          play for {CAPTURE_DURATION}s — chord quality + energy → Ghost scene
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
        <div style={{ fontSize: 11, color: "#666", marginBottom: 12, letterSpacing: "0.08em" }}>
          LISTEN
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
              {countdown > 0 ? `${countdown}s · ${frameCount} frames` : "analyzing…"}
            </span>
          )}
          {isGenerating && (
            <span style={{ fontSize: 13, color: "#c0a8e0" }}>
              Ghost LoRA generating… ~20–40s
            </span>
          )}
        </div>
        <p style={{ margin: "10px 0 0", fontSize: 11, color: "#444", lineHeight: 1.5 }}>
          {canStart
            ? "Major chord → bright scene. Minor chord → dark scene. Energy level → calm or cosmic."
            : isCapturing
              ? "Pitch trail below — each dot is a detected note, colored violet (bass) → red (treble)."
              : isGenerating && quadrant
                ? `Detected ${chordLabel} · ${QUADRANT_LABELS[quadrant]}`
                : ""}
        </p>
      </div>

      {/* Pitch trail canvas */}
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
          style={{ width: "100%", height: 148, display: "block", background: "#03030d" }}
        />
        <div style={{ padding: "5px 12px", background: "#07070f", fontSize: 10, color: "#2a2a3a" }}>
          pitch trail · vertical = MIDI note · color = frequency · dot size = energy
        </div>
      </div>

      {/* Detected emotion + scene */}
      {showResult && quadrant && (
        <div
          style={{
            border: "1px solid #1e1e2e",
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 12,
            background: "#0c0c18",
            fontSize: 13,
          }}
        >
          <span style={{ fontSize: 11, color: "#444", letterSpacing: "0.08em" }}>DETECTED &nbsp;</span>
          {chordLabel && <strong style={{ color: "#a0c0e0" }}>{chordLabel}</strong>}
          <span style={{ color: "#555" }}> · {QUADRANT_LABELS[quadrant]}</span>
        </div>
      )}

      {/* Ghost image */}
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
            alt="Ghost scene matching your music's emotional character"
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
            Ghost LoRA · fal-ai/flux-lora · ~$0.02
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
          href="/dream/58-music-to-ghost/README.md"
          style={{ color: "#383848", textDecoration: "none" }}
        >
          design notes
        </Link>
        {" · "}
        <span>fal-ai/flux-lora · Ghost LoRA · FAL_KEY in use · ~$0.02/image</span>
        {" · "}
        <span>⚠ endpoint best-guess — paste any error for a fix next cycle</span>
      </div>
    </div>
  );
}
