"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── Scene definitions ─────────────────────────────────────────────────────────

const SCENES = [
  {
    id: "stone",
    name: "Stone Chamber",
    accent: "#c4a882",
    line: "The resonance here is ancient. Let yourself be absorbed by it.",
    voice: "calm, androgynous, very slow, low pitch, stone chamber reverb, ancient and measured",
  },
  {
    id: "root",
    name: "Root Portal",
    accent: "#6db56d",
    line: "Something stirs beneath the roots. A low note. Then silence.",
    voice: "calm, androgynous, slow, mysterious, slightly muffled, deep underground resonance",
  },
  {
    id: "pool",
    name: "Underground Pool",
    accent: "#4a9ab5",
    line: "The water remembers every sound that has passed through this place.",
    voice: "calm, androgynous, slow, cave reverb, meditative, clear diction, liquid quality",
  },
  {
    id: "planet",
    name: "Tiny Planet",
    accent: "#d0a0f0",
    line: "A single breath. The horizon wraps around you.",
    voice: "calm, androgynous, very slow, airy, vast open space, breathy, gentle whisper quality",
  },
  {
    id: "forest",
    name: "Forest Dawn",
    accent: "#7ab58a",
    line: "The first light is also the first sound. They arrive together.",
    voice: "calm, androgynous, clear, warm, morning light, peaceful, slightly bright tone",
  },
  {
    id: "cosmic",
    name: "Cosmic Ascension",
    accent: "#8090e0",
    line: "You are not rising. The world is receding.",
    voice: "calm, androgynous, vast, ethereal, slow, deep cosmic reverb, transcendent quality",
  },
] as const;

type Status = "idle" | "loading" | "playing" | "done" | "error";

// ── Component ─────────────────────────────────────────────────────────────────

export default function GhostVoicePage() {
  const [sceneIdx, setSceneIdx] = useState(0);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [revealedChars, setRevealedChars] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const amplitudeRef = useRef(0);
  const isPlayingRef = useRef(false);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const subtitleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scene = SCENES[sceneIdx];

  // ── Canvas animation — restarts when scene changes ─────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gc = canvas.getContext("2d");
    if (!gc) return;

    const accent = SCENES[sceneIdx].accent;
    const rings: { r: number; maxR: number }[] = [];
    let lastSpawn = 0;

    const drawFrame = (now: number) => {
      if (!canvas) return;
      const W = canvas.width;
      const H = canvas.height;
      const cx = W / 2;
      const cy = H / 2;
      const maxR = Math.min(cx, cy) * 0.84;

      // Read amplitude from analyser each frame
      if (analyserRef.current) {
        const td = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteTimeDomainData(td);
        let sq = 0;
        for (let j = 0; j < td.length; j++) {
          const v = (td[j] - 128) / 128;
          sq += v * v;
        }
        amplitudeRef.current = Math.sqrt(sq / td.length);
      }

      const amp = amplitudeRef.current;
      const breathe = 0.05 + 0.025 * Math.sin(now * 0.0009);
      const playing = isPlayingRef.current;
      const eff = playing ? Math.max(amp * 1.6, breathe * 0.4) : breathe;

      // Spawn new ring
      const spawnMs = playing ? Math.max(160, 640 - eff * 2400) : 2000;
      if (now - lastSpawn > spawnMs) {
        rings.push({ r: 0, maxR });
        lastSpawn = now;
      }

      // Background
      gc.fillStyle = "#080808";
      gc.fillRect(0, 0, W, H);

      // Accent ambient radial glow
      const bg = gc.createRadialGradient(cx, cy, 0, cx, cy, maxR * 1.45);
      bg.addColorStop(0, accent + "18");
      bg.addColorStop(0.55, accent + "07");
      bg.addColorStop(1, "transparent");
      gc.fillStyle = bg;
      gc.fillRect(0, 0, W, H);

      // Expanding rings
      gc.save();
      for (let i = rings.length - 1; i >= 0; i--) {
        const ring = rings[i];
        ring.r += playing ? 1.0 + eff * 3.2 : 0.36;
        if (ring.r > ring.maxR) { rings.splice(i, 1); continue; }
        const prog = ring.r / ring.maxR;
        gc.globalAlpha = (1 - prog) * (playing ? 0.62 : 0.28);
        gc.lineWidth = 1 + eff * 0.8;
        gc.beginPath();
        gc.arc(cx, cy, ring.r, 0, Math.PI * 2);
        gc.strokeStyle = accent;
        gc.stroke();
      }
      gc.restore();

      // Outer orb glow
      const glowR = 46 + eff * 52;
      const og = gc.createRadialGradient(cx, cy, 0, cx, cy, glowR);
      og.addColorStop(0, accent + "cc");
      og.addColorStop(0.4, accent + "42");
      og.addColorStop(1, "transparent");
      gc.fillStyle = og;
      gc.beginPath();
      gc.arc(cx, cy, glowR, 0, Math.PI * 2);
      gc.fill();

      // Orb core
      const orbR = 15 + eff * 11;
      gc.beginPath();
      gc.arc(cx, cy, orbR, 0, Math.PI * 2);
      gc.fillStyle = accent;
      gc.fill();

      // Position label — small, below canvas center
      gc.save();
      gc.globalAlpha = 0.26;
      gc.fillStyle = accent;
      gc.font = "9px monospace";
      gc.textAlign = "center";
      gc.textBaseline = "bottom";
      gc.fillText("▲ front-center — ear level", cx, H - 10);
      gc.restore();

      animRef.current = requestAnimationFrame(drawFrame);
    };

    animRef.current = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(animRef.current);
  }, [sceneIdx]);

  // ── Stop audio when scene changes ─────────────────────────────────────────
  useEffect(() => {
    if (srcRef.current) {
      try { srcRef.current.stop(); } catch { /* already stopped */ }
      srcRef.current = null;
    }
    isPlayingRef.current = false;
    analyserRef.current = null;
    amplitudeRef.current = 0;
    if (subtitleTimerRef.current) {
      clearInterval(subtitleTimerRef.current);
      subtitleTimerRef.current = null;
    }
    setStatus("idle");
    setRevealedChars(0);
    setErrorMsg("");
  }, [sceneIdx]);

  // ── Narrate ───────────────────────────────────────────────────────────────
  const handleNarrate = useCallback(async () => {
    if (status === "loading" || status === "playing") return;

    // Stop any previous playback
    if (srcRef.current) {
      try { srcRef.current.stop(); } catch { /* safe */ }
      srcRef.current = null;
    }
    if (subtitleTimerRef.current) {
      clearInterval(subtitleTimerRef.current);
      subtitleTimerRef.current = null;
    }

    setStatus("loading");
    setErrorMsg("");
    setRevealedChars(0);

    // Capture current scene at call time
    const capturedIdx = sceneIdx;
    const sc = SCENES[capturedIdx];

    try {
      const res = await fetch("/dream/56-ghost-voice/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sc.line, voice: sc.voice }),
      });

      const json = await res.json() as { url?: string; error?: string; raw?: string };

      if (!res.ok || json.error) {
        setStatus("error");
        setErrorMsg(json.error ?? `HTTP ${res.status}`);
        return;
      }
      if (!json.url) {
        setStatus("error");
        setErrorMsg("No audio URL in response");
        return;
      }

      // Fetch and decode audio
      const audioRes = await fetch(json.url);
      if (!audioRes.ok) throw new Error(`Audio fetch failed: ${audioRes.status}`);
      const arrayBuf = await audioRes.arrayBuffer();

      if (ctxRef.current) {
        try { await ctxRef.current.close(); } catch { /* safe */ }
        ctxRef.current = null;
      }
      const audioCtx = new AudioContext();
      ctxRef.current = audioCtx;

      const audioBuf = await audioCtx.decodeAudioData(arrayBuf);

      // Analyser for amplitude-driven animation
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      // HRTF Panner — directly ahead, ear level (az=0°, el=0°)
      const pan = audioCtx.createPanner();
      pan.panningModel = "HRTF";
      pan.distanceModel = "inverse";
      pan.refDistance = 1;
      pan.rolloffFactor = 1;
      pan.positionX.value = 0;
      pan.positionY.value = 0;
      pan.positionZ.value = -1; // forward in Web Audio convention

      // Routing: source → analyser → panner → output
      const src = audioCtx.createBufferSource();
      src.buffer = audioBuf;
      src.connect(analyser);
      analyser.connect(pan);
      pan.connect(audioCtx.destination);

      srcRef.current = src;
      isPlayingRef.current = true;
      setStatus("playing");

      // Subtitle reveal — spread across ~85% of audio duration
      const line = sc.line;
      let char = 0;
      const charMs = Math.max(40, Math.min(90, (audioBuf.duration * 850) / line.length));
      subtitleTimerRef.current = setInterval(() => {
        char++;
        setRevealedChars(char);
        if (char >= line.length) {
          clearInterval(subtitleTimerRef.current!);
          subtitleTimerRef.current = null;
        }
      }, charMs);

      src.onended = () => {
        if (subtitleTimerRef.current) {
          clearInterval(subtitleTimerRef.current);
          subtitleTimerRef.current = null;
        }
        setRevealedChars(line.length);
        isPlayingRef.current = false;
        analyserRef.current = null;
        amplitudeRef.current = 0;
        setStatus("done");
      };

      src.start();
    } catch (err) {
      setStatus("error");
      setErrorMsg(String(err));
      isPlayingRef.current = false;
      analyserRef.current = null;
      amplitudeRef.current = 0;
    }
  }, [status, sceneIdx]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animRef.current);
      if (srcRef.current) { try { srcRef.current.stop(); } catch { /* safe */ } }
      if (ctxRef.current) { ctxRef.current.close().catch(() => { /* safe */ }); }
      if (subtitleTimerRef.current) clearInterval(subtitleTimerRef.current);
    };
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  const subtitle = scene.line.slice(0, revealedChars);
  const showCursor = status === "playing" && revealedChars < scene.line.length;

  return (
    <div className="min-h-screen bg-[#080808] text-white font-mono px-5 py-8">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex justify-between items-baseline mb-1">
          <h1 className="text-lg font-bold tracking-wide">Ghost Voice</h1>
          <Link href="/dream" className="text-[11px] text-white/30 hover:text-white/60">
            ← dream
          </Link>
        </div>
        <p className="text-[12px] text-white/40 mb-6 leading-relaxed">
          The Ghost speaks — each scene narrated from front-center.{" "}
          <span className="text-white/25">Wear headphones.</span>
        </p>

        {/* Scene selector */}
        <div className="flex flex-wrap gap-2 mb-6">
          {SCENES.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setSceneIdx(i)}
              style={{
                borderColor: i === sceneIdx ? s.accent : undefined,
                background: i === sceneIdx ? s.accent + "1a" : undefined,
                color: i === sceneIdx ? s.accent : undefined,
              }}
              className={
                "px-3 py-1.5 rounded text-[12px] border transition cursor-pointer " +
                (i !== sceneIdx
                  ? "border-white/12 text-white/50 hover:border-white/30 hover:text-white/70"
                  : "")
              }
            >
              {s.name}
            </button>
          ))}
        </div>

        {/* Canvas — atmospheric orb centered at ear level */}
        <div className="flex justify-center mb-5">
          <canvas
            ref={canvasRef}
            width={500}
            height={260}
            className="rounded-lg"
            style={{ maxWidth: "100%" }}
          />
        </div>

        {/* Narration text */}
        <div className="min-h-[3rem] flex items-center justify-center px-4 mb-5">
          {subtitle ? (
            <p
              className="text-[15px] text-center tracking-wide leading-relaxed"
              style={{ color: scene.accent }}
            >
              &ldquo;{subtitle}
              {showCursor && <span className="opacity-60">|</span>}
              &rdquo;
            </p>
          ) : (
            <p className="text-[12px] text-white/22 italic text-center">
              &ldquo;{scene.line}&rdquo;
            </p>
          )}
        </div>

        {/* Narrate button */}
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={handleNarrate}
            disabled={status === "loading" || status === "playing"}
            style={{
              borderColor: scene.accent + "80",
              color:
                status === "loading" || status === "playing"
                  ? "rgba(255,255,255,0.3)"
                  : scene.accent,
            }}
            className="px-8 py-2.5 border rounded text-[13px] tracking-widest
              hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {status === "loading"
              ? "Generating…"
              : status === "playing"
              ? "Speaking…"
              : "🎙  Narrate"}
          </button>

          {status === "error" && (
            <div className="text-[10px] text-red-400 max-w-md text-center
              bg-red-950/30 rounded px-3 py-2 leading-relaxed">
              API error — {errorMsg.slice(0, 250)}
              <br />
              <span className="text-red-400/55">
                ⚠ endpoint `fal-ai/inworld/tts` is a naming-convention guess —
                paste this to Karel for a next-cycle fix.
              </span>
            </div>
          )}

          {status === "done" && (
            <p className="text-[11px] text-white/30">
              ↺ click Narrate to generate again
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 flex justify-between text-[10px] text-white/20">
          <span>FAL_KEY · ~$0.01–0.02 / narration · HRTF front-center</span>
          <span>design notes: src/app/dream/56-ghost-voice/README.md</span>
        </div>

      </div>
    </div>
  );
}
