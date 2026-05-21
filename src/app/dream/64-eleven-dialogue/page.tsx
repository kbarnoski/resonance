"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────────────

type Speaker = "ghost" | "visitor";

type DialogueLine = {
  speaker: Speaker;
  text: string;
};

type SceneData = {
  id: string;
  name: string;
  ghostAccent: string;
  visitorAccent: string;
  dialogue: DialogueLine[];
};

type Status = "idle" | "loading" | "playing" | "done" | "error";

// ── Voices ─────────────────────────────────────────────────────────────────────

const GHOST_VOICE = "Adam";   // deep, measured narrator quality
const VISITOR_VOICE = "Alice"; // lighter, questioning quality

// ── Scene definitions ──────────────────────────────────────────────────────────

const SCENES: SceneData[] = [
  {
    id: "stone",
    name: "Stone Chamber",
    ghostAccent: "#c4a882",
    visitorAccent: "#6ab5d4",
    dialogue: [
      {
        speaker: "ghost",
        text: "[slowly, reverently] The resonance here [pauses] is ancient.",
      },
      {
        speaker: "visitor",
        text: "[nervous, awed] I didn't know it would feel [pauses] this alive.",
      },
      {
        speaker: "ghost",
        text: "[whispers] Everything that ever sounded here — still does. [pauses] If you know how to listen.",
      },
    ],
  },
  {
    id: "root",
    name: "Root Portal",
    ghostAccent: "#6db56d",
    visitorAccent: "#7ab5d4",
    dialogue: [
      {
        speaker: "ghost",
        text: "[mysteriously, low] Something stirs beneath the roots. [pauses] A low note. Then silence.",
      },
      {
        speaker: "visitor",
        text: "[curious, uncertain] Is it always this quiet [pauses] just before?",
      },
      {
        speaker: "ghost",
        text: "[deep, resonant] The portal opens in the listening. [softly] Not in the sound.",
      },
    ],
  },
  {
    id: "pool",
    name: "Underground Pool",
    ghostAccent: "#4a9ab5",
    visitorAccent: "#9ab57a",
    dialogue: [
      {
        speaker: "ghost",
        text: "[measured, slow] The water remembers [pauses] every sound that has passed through this place.",
      },
      {
        speaker: "visitor",
        text: "[softly, amazed] How far does it go?",
      },
      {
        speaker: "ghost",
        text: "[whispers] As far as memory reaches. [pauses] Which is further than you think.",
      },
    ],
  },
  {
    id: "planet",
    name: "Tiny Planet",
    ghostAccent: "#d0a0f0",
    visitorAccent: "#a0d0f0",
    dialogue: [
      {
        speaker: "ghost",
        text: "[airy, vast] A single breath. [pauses] The horizon wraps [pauses] around you.",
      },
      {
        speaker: "visitor",
        text: "[breathless, wondering] I can see [pauses] everything.",
      },
      {
        speaker: "ghost",
        text: "[gently] And everything [pauses] can see you. [very slowly] That is what you have always wanted.",
      },
    ],
  },
  {
    id: "forest",
    name: "Forest Dawn",
    ghostAccent: "#7ab58a",
    visitorAccent: "#b5a87a",
    dialogue: [
      {
        speaker: "ghost",
        text: "[warm, clear] The first light is also the first sound. [pauses] They arrive together.",
      },
      {
        speaker: "visitor",
        text: "[lightly, curious] Is that why musicians wake early?",
      },
      {
        speaker: "ghost",
        text: "[amused, gently] Some do. [pauses] The others listen in dreams.",
      },
    ],
  },
  {
    id: "cosmic",
    name: "Cosmic Ascension",
    ghostAccent: "#8090e0",
    visitorAccent: "#9ad4b5",
    dialogue: [
      {
        speaker: "ghost",
        text: "[vast, transcendent] You are not rising. [pauses] The world is receding.",
      },
      {
        speaker: "visitor",
        text: "[awed, uncertain] Will I come back?",
      },
      {
        speaker: "ghost",
        text: "[infinite calm] You never left. [long pause] That is the secret.",
      },
    ],
  },
];

// ── Canvas helper — draw one speaker orb ──────────────────────────────────────

function drawSpeakerOrb(
  gc: CanvasRenderingContext2D,
  x: number,
  cy: number,
  eff: number,
  color: string,
  active: boolean,
  now: number
) {
  const glowR = 38 + eff * 48;
  const grad = gc.createRadialGradient(x, cy, 0, x, cy, glowR);
  grad.addColorStop(0, color + (active ? "cc" : "44"));
  grad.addColorStop(0.4, color + (active ? "3a" : "14"));
  grad.addColorStop(1, "transparent");
  gc.fillStyle = grad;
  gc.beginPath();
  gc.arc(x, cy, glowR, 0, Math.PI * 2);
  gc.fill();

  const coreR = 11 + eff * 10;
  gc.beginPath();
  gc.arc(x, cy, coreR, 0, Math.PI * 2);
  gc.fillStyle = active ? color : color + "55";
  gc.fill();

  if (active) {
    const ringProgress = ((now * 0.001) % 1.8) / 1.8;
    const ringR = coreR + ringProgress * 58;
    gc.save();
    gc.globalAlpha = (1 - ringProgress) * 0.48;
    gc.strokeStyle = color;
    gc.lineWidth = 1.5;
    gc.beginPath();
    gc.arc(x, cy, ringR, 0, Math.PI * 2);
    gc.stroke();
    gc.restore();
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ElevenDialoguePage() {
  const [sceneIdx, setSceneIdx] = useState(0);
  const [editLines, setEditLines] = useState<string[]>(
    SCENES[0].dialogue.map((l) => l.text)
  );
  const [status, setStatus] = useState<Status>("idle");
  const [activeLineIdx, setActiveLineIdx] = useState(-1);
  const [errorMsg, setErrorMsg] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const activeSpeakerRef = useRef<Speaker>("ghost");
  const amplitudeRef = useRef(0);
  const isPlayingRef = useRef(false);
  const acRef = useRef<AudioContext | null>(null);

  const scene = SCENES[sceneIdx];

  // ── Reset on scene change ───────────────────────────────────────────────────
  useEffect(() => {
    setEditLines(SCENES[sceneIdx].dialogue.map((l) => l.text));
    setStatus("idle");
    setActiveLineIdx(-1);
    setErrorMsg("");
    isPlayingRef.current = false;
    analyserRef.current = null;
    amplitudeRef.current = 0;
    if (acRef.current) {
      acRef.current.close().catch(() => {/* safe */});
      acRef.current = null;
    }
  }, [sceneIdx]);

  // ── Canvas animation ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gc = canvas.getContext("2d");
    if (!gc) return;

    const { ghostAccent, visitorAccent } = SCENES[sceneIdx];

    const drawFrame = (now: number) => {
      const W = canvas.width;
      const H = canvas.height;
      const cy = H / 2;

      // Read live amplitude
      if (analyserRef.current) {
        const td = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteTimeDomainData(td);
        let sq = 0;
        for (let i = 0; i < td.length; i++) {
          const v = (td[i] - 128) / 128;
          sq += v * v;
        }
        amplitudeRef.current = Math.sqrt(sq / td.length);
      } else {
        amplitudeRef.current *= 0.92;
      }

      const amp = amplitudeRef.current;
      const breathe = 0.04 + 0.018 * Math.sin(now * 0.0007);
      const ghostActive = isPlayingRef.current && activeSpeakerRef.current === "ghost";
      const visitorActive = isPlayingRef.current && activeSpeakerRef.current === "visitor";
      const ghostEff = ghostActive ? Math.max(amp * 1.6, breathe * 0.4) : breathe;
      const visitorEff = visitorActive ? Math.max(amp * 1.6, breathe * 0.4) : breathe * 0.5;

      // Background
      gc.fillStyle = "#080808";
      gc.fillRect(0, 0, W, H);

      // Subtle divider
      gc.save();
      gc.globalAlpha = 0.07;
      gc.strokeStyle = "#ffffff";
      gc.lineWidth = 1;
      gc.beginPath();
      gc.moveTo(W / 2, 8);
      gc.lineTo(W / 2, H - 8);
      gc.stroke();
      gc.restore();

      // Ghost orb (left)
      drawSpeakerOrb(gc, W * 0.27, cy, ghostEff, ghostAccent, ghostActive, now);
      // Visitor orb (right)
      drawSpeakerOrb(gc, W * 0.73, cy, visitorEff, visitorAccent, visitorActive, now);

      // Speaker labels
      gc.save();
      gc.font = "9px monospace";
      gc.textAlign = "center";
      gc.globalAlpha = ghostActive ? 0.72 : 0.22;
      gc.fillStyle = ghostAccent;
      gc.fillText("GHOST", W * 0.27, H - 10);
      gc.globalAlpha = visitorActive ? 0.72 : 0.22;
      gc.fillStyle = visitorAccent;
      gc.fillText("VISITOR", W * 0.73, H - 10);
      gc.restore();

      animRef.current = requestAnimationFrame(drawFrame);
    };

    animRef.current = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(animRef.current);
  }, [sceneIdx]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animRef.current);
      if (acRef.current) {
        acRef.current.close().catch(() => {/* safe */});
      }
    };
  }, []);

  // ── Generate and perform all dialogue lines ────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (status === "loading" || status === "playing") return;

    setStatus("loading");
    setActiveLineIdx(-1);
    setErrorMsg("");
    isPlayingRef.current = false;
    analyserRef.current = null;

    if (acRef.current) {
      acRef.current.close().catch(() => {/* safe */});
      acRef.current = null;
    }

    const currentScene = SCENES[sceneIdx];
    const currentLines = editLines;

    try {
      // Generate all lines sequentially (one API call per speaker turn)
      const urls: string[] = [];
      for (let i = 0; i < currentScene.dialogue.length; i++) {
        const line = currentScene.dialogue[i];
        const voice = line.speaker === "ghost" ? GHOST_VOICE : VISITOR_VOICE;
        const text = currentLines[i]?.trim() || line.text;

        const res = await fetch("/dream/64-eleven-dialogue/api", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice }),
        });
        const json = (await res.json()) as {
          url?: string;
          error?: string;
          raw?: string;
        };

        if (!res.ok || json.error) {
          setStatus("error");
          setErrorMsg(
            json.error
              ? `Line ${i + 1}: ${json.error}${json.raw ? ` — ${json.raw.slice(0, 200)}` : ""}`
              : `HTTP ${res.status}`
          );
          return;
        }
        if (!json.url) {
          setStatus("error");
          setErrorMsg(`Line ${i + 1}: No audio URL in response`);
          return;
        }
        urls.push(json.url);
      }

      // Decode all audio buffers
      const ac = new AudioContext();
      acRef.current = ac;
      const audioBuffers: AudioBuffer[] = [];

      for (const url of urls) {
        const audioRes = await fetch(url);
        if (!audioRes.ok) throw new Error(`Audio fetch failed: ${audioRes.status}`);
        const arrayBuf = await audioRes.arrayBuffer();
        const decoded = await ac.decodeAudioData(arrayBuf);
        audioBuffers.push(decoded);
      }

      setStatus("playing");

      // Play lines sequentially
      for (let i = 0; i < audioBuffers.length; i++) {
        const lineData = currentScene.dialogue[i];
        activeSpeakerRef.current = lineData.speaker;
        isPlayingRef.current = true;
        setActiveLineIdx(i);

        const analyser = ac.createAnalyser();
        analyser.fftSize = 256;
        analyserRef.current = analyser;

        const src = ac.createBufferSource();
        src.buffer = audioBuffers[i];
        src.connect(analyser);
        analyser.connect(ac.destination);
        src.start();

        await new Promise<void>((resolve) => {
          src.onended = () => {
            analyserRef.current = null;
            amplitudeRef.current = 0;
            isPlayingRef.current = false;
            resolve();
          };
        });

        // Brief silence between lines
        if (i < audioBuffers.length - 1) {
          await new Promise((r) => setTimeout(r, 550));
        }
      }

      setActiveLineIdx(-1);
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setErrorMsg(String(err));
      isPlayingRef.current = false;
      analyserRef.current = null;
      amplitudeRef.current = 0;
    }
  }, [status, sceneIdx, editLines]);

  // ── Render ──────────────────────────────────────────────────────────────────

  const btnLabel =
    status === "loading"
      ? "Generating…"
      : status === "playing"
      ? "Speaking…"
      : status === "done"
      ? "↺ Perform again"
      : "▶ Perform scene";

  return (
    <div className="min-h-screen bg-[#080808] text-white font-mono px-5 py-8">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex justify-between items-baseline mb-1">
          <h1 className="text-lg font-bold tracking-wide">Eleven Dialogue</h1>
          <Link
            href="/dream"
            className="text-[11px] text-white/30 hover:text-white/60"
          >
            ← dream
          </Link>
        </div>
        <p className="text-[12px] text-white/40 mb-6 leading-relaxed">
          The Ghost is no longer alone. Six scenes as two-character dramatic exchanges —
          voiced by ElevenLabs V3 with inline emotional tags: [slowly], [whispers], [pauses].{" "}
          <span className="text-white/22">Headphones recommended.</span>
        </p>

        {/* Scene selector */}
        <div className="flex flex-wrap gap-2 mb-6">
          {SCENES.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setSceneIdx(i)}
              style={{
                borderColor: i === sceneIdx ? s.ghostAccent : undefined,
                background: i === sceneIdx ? s.ghostAccent + "1a" : undefined,
                color: i === sceneIdx ? s.ghostAccent : undefined,
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

        {/* Canvas — dual orb speaker visualization */}
        <div className="flex justify-center mb-5">
          <canvas
            ref={canvasRef}
            width={500}
            height={190}
            className="rounded-lg"
            style={{ maxWidth: "100%" }}
          />
        </div>

        {/* Dialogue lines — live highlight */}
        <div className="flex flex-col gap-1.5 mb-6">
          {scene.dialogue.map((line, i) => {
            const isActive = i === activeLineIdx;
            const color =
              line.speaker === "ghost" ? scene.ghostAccent : scene.visitorAccent;
            const label = line.speaker === "ghost" ? "GHOST" : "VISITOR";
            return (
              <div
                key={i}
                className="rounded px-3 py-2.5 transition-all duration-300"
                style={{
                  background: isActive ? color + "12" : "transparent",
                  borderLeft: `2px solid ${isActive ? color : color + "28"}`,
                }}
              >
                <div
                  className="text-[9px] tracking-widest mb-1 transition-all duration-300"
                  style={{ color: isActive ? color : color + "50" }}
                >
                  {label}
                </div>
                <p
                  className="text-[13px] leading-relaxed transition-all duration-300"
                  style={{
                    color: isActive ? color : "rgba(255,255,255,0.42)",
                  }}
                >
                  {editLines[i] || line.text}
                </p>
              </div>
            );
          })}
        </div>

        {/* Edit script */}
        <details className="mb-6">
          <summary className="text-[11px] text-white/30 cursor-pointer hover:text-white/55 select-none mb-3">
            ✏ Edit script — use V3 tags: [whispers] [pauses] [slowly] [awed] [resigned tone] …
          </summary>
          <div className="flex flex-col gap-3 mt-3">
            {scene.dialogue.map((line, i) => {
              const color =
                line.speaker === "ghost" ? scene.ghostAccent : scene.visitorAccent;
              const label = line.speaker === "ghost" ? "GHOST" : "VISITOR";
              return (
                <div key={i}>
                  <div
                    className="text-[9px] tracking-widest mb-1"
                    style={{ color }}
                  >
                    {label}
                  </div>
                  <textarea
                    value={editLines[i]}
                    onChange={(e) => {
                      const next = [...editLines];
                      next[i] = e.target.value;
                      setEditLines(next);
                    }}
                    rows={2}
                    className="w-full bg-white/5 border border-white/10 rounded px-3 py-2
                      text-[12px] text-white/75 resize-none focus:outline-none
                      focus:border-white/22"
                    placeholder={line.text}
                  />
                </div>
              );
            })}
          </div>
        </details>

        {/* Perform button */}
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={handleGenerate}
            disabled={status === "loading" || status === "playing"}
            style={{
              borderColor: scene.ghostAccent + "80",
              color:
                status === "loading" || status === "playing"
                  ? "rgba(255,255,255,0.28)"
                  : scene.ghostAccent,
            }}
            className="px-8 py-2.5 border rounded text-[13px] tracking-widest
              hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {btnLabel}
          </button>

          {status === "loading" && (
            <p className="text-[11px] text-white/28">
              Generating 3 voice lines — takes ~10s…
            </p>
          )}

          {status === "error" && (
            <div
              className="text-[10px] text-red-400 max-w-md text-center
                bg-red-950/30 rounded px-3 py-2 leading-relaxed"
            >
              {errorMsg.slice(0, 320)}
            </div>
          )}

          {status === "done" && (
            <p className="text-[11px] text-white/28">
              Scene complete — click to perform again
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 flex justify-between text-[10px] text-white/18">
          <span>ElevenLabs V3 via FAL_KEY · ~$0.02/scene · Adam + Alice voices</span>
          <span>design notes: src/app/dream/64-eleven-dialogue/README.md</span>
        </div>

      </div>
    </div>
  );
}
