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

const PRESETS = [
  {
    label: "Forest Dawn",
    tags: "forest dawn ceremony, 70 BPM, ceremonial frame drums, reverbed piano, morning mist, birdsong, ambient",
  },
  {
    label: "Stone Chamber",
    tags: "stone chamber reverb, single piano chord, long decay, deep resonance, 50 BPM, meditative, minimal",
  },
  {
    label: "Underground Pool",
    tags: "underground cave ambience, water drip rhythm, low drone, ethereal pads, bass resonance, 40 BPM, dark ambient",
  },
  {
    label: "Cosmic Ascension",
    tags: "cosmic journey, vast orchestral strings, ascending phrases, 80 BPM, transcendent, cinematic, epic",
  },
  {
    label: "Tiny Planet",
    tags: "wonder and smallness, delicate music box bells, wind atmosphere, sparse piano, ambient floating, 55 BPM",
  },
];

type Phase = "idle" | "generating" | "playing" | "done" | "error";

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

function drawWaveform(
  canvas: HTMLCanvasElement,
  peaks: number[],
  playFrac: number
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;
  if (cw === 0 || ch === 0) return;
  canvas.width = cw * dpr;
  canvas.height = ch * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cw, ch);

  const cy = ch / 2;
  const halfH = ch * 0.42;
  const barW = cw / peaks.length;
  const cursorX = playFrac * cw;

  for (let i = 0; i < peaks.length; i++) {
    const x = i * barW;
    const h = Math.max(1, peaks[i] * halfH);
    ctx.fillStyle = x < cursorX ? "rgba(96,160,255,0.9)" : "rgba(96,160,255,0.28)";
    ctx.fillRect(x, cy - h, Math.max(1, barW - 1), h * 2);
  }

  if (playFrac > 0 && playFrac < 1) {
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cursorX, 0);
    ctx.lineTo(cursorX, ch);
    ctx.stroke();
  }
}

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
    if (cw === 0 || ch === 0) return;
    if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
      ctx.scale(dpr, dpr);
    }
    const cx = cw / 2;
    const cy = ch / 2;

    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(0, 0, cw, ch);

    const BANDS = 6;
    const binPerBand = Math.floor(fdata.length / BANDS);
    ctx.globalCompositeOperation = "lighter";
    for (let b = 0; b < BANDS; b++) {
      let sum = 0;
      const bStart = b * binPerBand;
      const bEnd = bStart + binPerBand;
      for (let i = bStart; i < bEnd; i++) sum += fdata[i];
      const energy = sum / (binPerBand * 255);
      if (energy < 0.01) continue;

      const [r, g, bl] = BAND_COLORS[b];
      const maxR = Math.min(cx, cy) * (0.3 + 0.7 * (1 - b / BANDS));
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

export default function Compose() {
  const [presetIdx, setPresetIdx] = useState(0);
  const [tags, setTags] = useState(PRESETS[0].tags);
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [genUrl, setGenUrl] = useState<string | null>(null);
  const [playFrac, setPlayFrac] = useState(0);

  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bloomCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bloomAnimRef = useRef(0);
  const playAnimRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const bufRef = useRef<AudioBuffer | null>(null);
  const startTimeRef = useRef(0);
  const peaksRef = useRef<number[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);

  function redrawWave(frac: number) {
    const canvas = waveCanvasRef.current;
    if (canvas && peaksRef.current.length > 0) {
      drawWaveform(canvas, peaksRef.current, frac);
    }
  }

  function selectPreset(idx: number) {
    setPresetIdx(idx);
    setTags(PRESETS[idx].tags);
  }

  function playBuffer() {
    const actx = audioCtxRef.current;
    const buf = bufRef.current;
    if (!actx || !buf) return;

    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch { /* already stopped */ }
    }
    cancelAnimationFrame(playAnimRef.current);

    const analyser = actx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.85;
    analyser.connect(actx.destination);
    analyserRef.current = analyser;

    const src = actx.createBufferSource();
    src.buffer = buf;
    src.connect(analyser);
    src.start();
    sourceRef.current = src;
    startTimeRef.current = actx.currentTime;
    setPhase("playing");
    setPlayFrac(0);

    const bloomCanvas = bloomCanvasRef.current;
    if (bloomCanvas) runBloom(analyser, bloomCanvas, bloomAnimRef);

    const duration = buf.duration;
    function tickPlayhead() {
      const frac = Math.min(1, (actx!.currentTime - startTimeRef.current) / duration);
      setPlayFrac(frac);
      redrawWave(frac);
      if (frac < 1) {
        playAnimRef.current = requestAnimationFrame(tickPlayhead);
      }
    }
    playAnimRef.current = requestAnimationFrame(tickPlayhead);

    src.onended = () => {
      cancelAnimationFrame(playAnimRef.current);
      cancelAnimationFrame(bloomAnimRef.current);
      setPlayFrac(1);
      redrawWave(1);
      setPhase("done");
    };
  }

  async function generate() {
    setPhase("generating");
    setErrorMsg("");
    setGenUrl(null);
    setPlayFrac(0);
    peaksRef.current = [];

    try {
      const res = await fetch("/dream/6-compose/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags, duration: 30 }),
      });
      const json = (await res.json()) as { url?: string; error?: string };

      if (!res.ok || json.error) {
        setErrorMsg(json.error ?? "Unknown error");
        setPhase("error");
        return;
      }
      if (!json.url) {
        setErrorMsg("No audio URL in response");
        setPhase("error");
        return;
      }

      setGenUrl(json.url);

      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      const resp = await fetch(json.url);
      const ab = await resp.arrayBuffer();
      const audioBuf = await audioCtxRef.current.decodeAudioData(ab);
      bufRef.current = audioBuf;

      const peaks = buildPeaks(audioBuf, 300);
      peaksRef.current = peaks;
      redrawWave(0);

      playBuffer();
    } catch (err) {
      setErrorMsg(String(err));
      setPhase("error");
    }
  }

  useEffect(() => {
    return () => {
      cancelAnimationFrame(bloomAnimRef.current);
      cancelAnimationFrame(playAnimRef.current);
      if (sourceRef.current) try { sourceRef.current.stop(); } catch { /* ok */ }
    };
  }, []);

  const isGenerating = phase === "generating";
  const isPlaying = phase === "playing";
  const hasResult = genUrl !== null;
  const canGenerate = !isGenerating && !isPlaying;

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
          ◈ compose
        </h1>
        <p style={{ fontSize: 13, color: "#888", margin: "6px 0 2px", lineHeight: 1.5 }}>
          Describe a mood or scene · ACE-Step generates 30 seconds of music
        </p>
        <Link href="/dream" style={{ fontSize: 11, color: "#555", textDecoration: "none" }}>
          ← dream index
        </Link>
      </div>

      {/* Ghost scene presets */}
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
          GHOST SCENE PRESETS
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {PRESETS.map((p, i) => (
            <button
              key={i}
              onClick={() => selectPreset(i)}
              disabled={!canGenerate}
              style={{
                background: presetIdx === i ? "#1a2a1a" : "transparent",
                color: presetIdx === i ? "#80c080" : "#666",
                border: `1px solid ${presetIdx === i ? "#2a4a2a" : "#222"}`,
                borderRadius: 4,
                padding: "5px 12px",
                fontFamily: "inherit",
                fontSize: 12,
                cursor: canGenerate ? "pointer" : "not-allowed",
                transition: "all 0.15s",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tags editor */}
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
            marginBottom: 8,
            letterSpacing: "0.08em",
          }}
        >
          STYLE TAGS — sent directly to ACE-Step as the music description
        </div>
        <textarea
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          disabled={!canGenerate}
          rows={3}
          style={{
            width: "100%",
            background: "#07070f",
            color: "#c8c8d8",
            border: "1px solid #1a1a2e",
            borderRadius: 4,
            padding: "8px 10px",
            fontFamily: "inherit",
            fontSize: 12,
            lineHeight: 1.6,
            resize: "vertical",
            boxSizing: "border-box",
          }}
        />
        <p
          style={{
            margin: "6px 0 0",
            fontSize: 11,
            color: "#444",
            lineHeight: 1.5,
          }}
        >
          Try: &ldquo;jazz piano trio, 90 BPM, upright bass&rdquo; ·{" "}
          &ldquo;ambient drone, deep reverb, no melody&rdquo; ·{" "}
          &ldquo;solo classical guitar, fingerstyle, meditative&rdquo;
        </p>
      </div>

      {/* Generate + actions */}
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
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={generate}
            disabled={!canGenerate}
            style={{
              background: canGenerate ? "#1a3a2a" : "#0f0f1e",
              color: canGenerate ? "#80d0a0" : "#333",
              border: "none",
              borderRadius: 4,
              padding: "9px 24px",
              fontFamily: "inherit",
              fontSize: 14,
              cursor: canGenerate ? "pointer" : "not-allowed",
              transition: "all 0.15s",
            }}
          >
            {isGenerating ? "Composing…" : "▶ Compose"}
          </button>

          {hasResult && !isPlaying && !isGenerating && (
            <button
              onClick={playBuffer}
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

          {genUrl && !isPlaying && !isGenerating && (
            <a
              href={genUrl}
              download="compose.mp3"
              style={{
                color: "#555",
                fontSize: 13,
                textDecoration: "none",
                border: "1px solid #222",
                borderRadius: 4,
                padding: "8px 14px",
              }}
            >
              ↓ mp3
            </a>
          )}

          {isGenerating && (
            <span style={{ fontSize: 12, color: "#555" }}>~20–40s…</span>
          )}
          {isPlaying && (
            <span style={{ fontSize: 12, color: "#80d0a0" }}>Playing…</span>
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
              wordBreak: "break-all",
            }}
          >
            {errorMsg}
          </div>
        )}

        {phase === "idle" && (
          <p
            style={{
              margin: "10px 0 0",
              fontSize: 12,
              color: "#444",
              lineHeight: 1.6,
            }}
          >
            Pick a Ghost scene or edit the tags. ACE-Step generates 30 seconds
            of music matching your description. &ldquo;Forest Dawn&rdquo; is a good first try.
          </p>
        )}
      </div>

      {/* Waveform strip */}
      {hasResult && (
        <div
          style={{
            border: "1px solid #1e1e2e",
            borderRadius: 8,
            overflow: "hidden",
            marginBottom: 14,
          }}
        >
          <canvas
            ref={waveCanvasRef}
            style={{
              width: "100%",
              height: 60,
              display: "block",
              background: "#07070f",
            }}
          />
        </div>
      )}

      {/* Bloom visualizer */}
      <div
        style={{
          border: "1px solid #1e1e2e",
          borderRadius: 8,
          overflow: "hidden",
          marginBottom: 14,
          display: hasResult ? "block" : "none",
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
        {!isPlaying && hasResult && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              color: "#333",
              pointerEvents: "none",
            }}
          >
            Press replay to see the bloom
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          marginTop: "auto",
          paddingTop: 8,
          fontSize: 11,
          color: "#383848",
        }}
      >
        <Link
          href="/dream/6-compose/README.md"
          style={{ color: "#383848", textDecoration: "none" }}
        >
          design notes
        </Link>
        {" · "}
        <span>$0.006/track · fal-ai/ace-step</span>
        {" · "}
        <span>
          ⚠ endpoint is best-guess from naming conventions — paste any error text
          for a fix next cycle
        </span>
      </div>
    </div>
  );
}
