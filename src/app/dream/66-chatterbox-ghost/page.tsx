"use client";

import { useRef, useState } from "react";
import Link from "next/link";

// ── Scene definitions ──────────────────────────────────────────────────────────
// Paralinguistic tags [sigh], [gasp], [laugh softly], [slowly], [flatly] etc.
// are embedded in the text. Chatterbox Turbo treats these as physical vocal actions.

const SCENES = [
  {
    id: "stone",
    name: "Stone Chamber",
    accent: "#c4a882",
    defaultLine:
      "The resonance here is ancient. [sigh] Let yourself be absorbed by it.",
  },
  {
    id: "root",
    name: "Root Portal",
    accent: "#6db56d",
    defaultLine:
      "[slowly] Something stirs beneath the roots. [gasp] A low note. Then silence.",
  },
  {
    id: "pool",
    name: "Underground Pool",
    accent: "#4a9ab5",
    defaultLine:
      "The water remembers every sound [sigh] that has passed through this place.",
  },
  {
    id: "planet",
    name: "Tiny Planet",
    accent: "#d0a0f0",
    defaultLine:
      "A single breath. [laugh softly] The horizon wraps around you.",
  },
  {
    id: "forest",
    name: "Forest Dawn",
    accent: "#7ab58a",
    defaultLine:
      "The first light is also the first sound. [softly] They arrive together.",
  },
  {
    id: "cosmic",
    name: "Cosmic Ascension",
    accent: "#8090e0",
    defaultLine:
      "[flatly] You are not rising. [long pause] The world is receding.",
  },
] as const;

type SceneResult = {
  status: "idle" | "loading" | "done" | "error";
  url?: string;
  error?: string;
};

// ── Waveform drawing helper (defined outside component — no state access) ──────

function drawWave(
  canvas: HTMLCanvasElement,
  buf: AudioBuffer,
  accent: string
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, w, h);
  const data = buf.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / w));
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let x = 0; x < w; x++) {
    let lo = 1, hi = -1;
    for (let j = 0; j < step; j++) {
      const v = data[x * step + j] ?? 0;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const yHi = ((1 - hi) / 2) * h;
    const yLo = ((1 - lo) / 2) * h;
    ctx.moveTo(x, yHi);
    ctx.lineTo(x, yLo);
  }
  ctx.stroke();
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ChatterboxGhostPage() {
  const [recording, setRecording] = useState(false);
  const [refBlob, setRefBlob] = useState<Blob | null>(null);
  const [refDuration, setRefDuration] = useState(0);
  const [exaggeration, setExaggeration] = useState(0.5);
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<SceneResult[]>(
    SCENES.map(() => ({ status: "idle" as const }))
  );
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);
  const [lines, setLines] = useState<string[]>(SCENES.map((s) => s.defaultLine));

  const mrRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refUrlRef = useRef<string | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const waveRefs = useRef<(HTMLCanvasElement | null)[]>([]);

  // ── Recording ────────────────────────────────────────────────────────────────

  async function startRecord() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mrRef.current = mr;
      chunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setRefBlob(blob);
        refUrlRef.current = null;
        setRecording(false);
        if (timerRef.current) clearInterval(timerRef.current);
      };

      mr.start(100);
      setRecording(true);
      setRefDuration(0);
      timerRef.current = setInterval(
        () => setRefDuration((d) => parseFloat((d + 0.1).toFixed(1))),
        100
      );
    } catch {
      // mic permission denied — silent fallback
    }
  }

  function stopRecord() {
    mrRef.current?.stop();
  }

  function clearRef() {
    setRefBlob(null);
    refUrlRef.current = null;
    setRefDuration(0);
  }

  // ── Generation ───────────────────────────────────────────────────────────────

  async function generate() {
    setGenerating(true);
    setResults(SCENES.map(() => ({ status: "loading" as const })));

    // Upload reference audio once and cache the URL for all 6 calls.
    let voiceUrl: string | undefined;
    if (refBlob) {
      if (refUrlRef.current) {
        voiceUrl = refUrlRef.current;
      } else {
        try {
          const form = new FormData();
          form.append("audio", refBlob, "reference.webm");
          const r = await fetch("/dream/66-chatterbox-ghost/api/upload", {
            method: "POST",
            body: form,
          });
          const d = (await r.json()) as { url?: string };
          if (d.url) {
            refUrlRef.current = d.url;
            voiceUrl = d.url;
          }
        } catch {
          // continue without voice clone
        }
      }
    }

    // Fire all 6 scene generation requests concurrently.
    await Promise.all(
      lines.map(async (line, i) => {
        try {
          const r = await fetch("/dream/66-chatterbox-ghost/api", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: line, voice_url: voiceUrl, exaggeration }),
          });
          const d = (await r.json()) as { url?: string; error?: string };
          setResults((prev) => {
            const next = [...prev];
            next[i] = d.url
              ? { status: "done", url: d.url }
              : { status: "error", error: d.error ?? "No audio URL" };
            return next;
          });
        } catch (err) {
          setResults((prev) => {
            const next = [...prev];
            next[i] = { status: "error", error: String(err) };
            return next;
          });
        }
      })
    );

    setGenerating(false);
  }

  // ── Playback ─────────────────────────────────────────────────────────────────

  async function playScene(idx: number, url: string) {
    srcRef.current?.stop();
    srcRef.current = null;

    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioContext();
    }
    const actx = audioCtxRef.current;
    if (actx.state === "suspended") await actx.resume();

    setPlayingIdx(idx);

    const res = await fetch(url);
    const ab = await res.arrayBuffer();
    const audioBuf = await actx.decodeAudioData(ab);

    const canvas = waveRefs.current[idx];
    if (canvas) drawWave(canvas, audioBuf, SCENES[idx].accent);

    const src = actx.createBufferSource();
    src.buffer = audioBuf;
    src.connect(actx.destination);
    src.onended = () => setPlayingIdx(null);
    src.start();
    srcRef.current = src;
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const allDone = results.every((r) => r.status === "done" || r.status === "error");
  const hasRef = Boolean(refBlob);

  return (
    <div className="min-h-screen bg-black text-foreground p-6">
      <div className="max-w-2xl mx-auto font-mono">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-lg tracking-tight mb-2">Chatterbox Ghost</h1>
          <p className="text-xs text-muted-foreground/70 leading-relaxed">
            Hear the Ghost narrate six scenes in a cloned voice. Record 5–10 seconds
            of any voice as a reference — Chatterbox Turbo renders the Ghost&apos;s lines
            in that voice, with physical acting tags embedded in the text.
          </p>
        </div>

        {/* Voice reference card */}
        <div className="border border-border rounded p-4 mb-5">
          <div className="text-[10px] text-muted-foreground/70 uppercase tracking-widest mb-3">
            Voice reference (optional)
          </div>

          {!hasRef ? (
            <div className="flex flex-wrap items-center gap-4">
              <button
                onClick={() => { void (recording ? stopRecord() : startRecord()); }}
                className={`px-4 py-2 text-xs tracking-wider uppercase border rounded transition ${
                  recording
                    ? "border-violet-400/60 text-violet-300 bg-violet-400/10 animate-pulse"
                    : "border-border hover:border-border hover:bg-accent"
                }`}
              >
                {recording
                  ? `■ stop — ${refDuration.toFixed(1)}s`
                  : "● record 5–10s reference"}
              </button>
              <span className="text-[11px] text-muted-foreground/70">
                {recording
                  ? "speak naturally — one sentence is enough"
                  : "without reference, Chatterbox uses its default voice"}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <span className="text-xs text-muted-foreground">
                ✓ {refDuration.toFixed(1)}s reference recorded
              </span>
              <button
                onClick={clearRef}
                className="text-[11px] text-muted-foreground/70 hover:text-muted-foreground border border-border hover:border-border px-2 py-1 rounded transition"
              >
                clear
              </button>
            </div>
          )}
        </div>

        {/* Exaggeration slider */}
        <div className="flex items-center gap-4 mb-5">
          <span className="text-[10px] text-muted-foreground/70 uppercase tracking-widest shrink-0">
            Exaggeration
          </span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={exaggeration}
            onChange={(e) => setExaggeration(parseFloat(e.target.value))}
            className="w-40 accent-primary"
          />
          <span className="text-[11px] text-muted-foreground/70">
            {exaggeration.toFixed(2)} — {exaggeration < 0.35 ? "neutral" : exaggeration < 0.7 ? "expressive" : "dramatic"}
          </span>
        </div>

        {/* Generate button */}
        <button
          onClick={() => { void generate(); }}
          disabled={generating}
          className="mb-8 px-6 py-3 text-sm tracking-wider uppercase border border-border rounded hover:bg-accent hover:border-border transition disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {generating ? "Generating…" : "Generate Ghost voices"}
        </button>

        {/* Scene cards */}
        <div className="space-y-3">
          {SCENES.map((scene, i) => {
            const result = results[i];
            const isPlaying = playingIdx === i;

            return (
              <div
                key={scene.id}
                className="border border-border rounded p-4"
                style={isPlaying ? { borderColor: `${scene.accent}40` } : undefined}
              >
                {/* Scene header row */}
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div className="shrink-0 text-[10px] uppercase tracking-widest" style={{ color: scene.accent }}>
                    {scene.name}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {result.status === "loading" && (
                      <span className="text-[11px] text-muted-foreground/70 animate-pulse">
                        generating…
                      </span>
                    )}
                    {result.status === "done" && result.url && (
                      <button
                        onClick={() => { void playScene(i, result.url as string); }}
                        className="text-[11px] tracking-wider uppercase border px-3 py-1 rounded transition"
                        style={{
                          borderColor: isPlaying ? scene.accent : "rgba(255,255,255,0.2)",
                          color: isPlaying ? scene.accent : "rgba(255,255,255,0.55)",
                        }}
                      >
                        {isPlaying ? "▶ playing" : "▶ play"}
                      </button>
                    )}
                  </div>
                </div>

                {/* Editable line */}
                <textarea
                  value={lines[i]}
                  onChange={(e) =>
                    setLines((prev) => {
                      const next = [...prev];
                      next[i] = e.target.value;
                      return next;
                    })
                  }
                  className="w-full text-xs text-muted-foreground bg-transparent resize-none outline-none leading-relaxed mb-3"
                  rows={2}
                  spellCheck={false}
                />

                {/* Waveform / status strip */}
                {result.status === "done" && (
                  <canvas
                    ref={(el) => { waveRefs.current[i] = el; }}
                    width={560}
                    height={36}
                    className="w-full rounded"
                    style={{ background: "#0a0a0a" }}
                  />
                )}
                {result.status === "idle" && (
                  <div className="h-9 rounded bg-muted flex items-center px-3">
                    <div className="w-full h-px bg-muted" />
                  </div>
                )}
                {result.status === "loading" && (
                  <div className="h-9 rounded bg-muted flex items-center px-3">
                    <div
                      className="h-px animate-pulse"
                      style={{ width: "100%", background: `${scene.accent}40` }}
                    />
                  </div>
                )}
                {result.status === "error" && (
                  <div className="h-9 rounded bg-violet-900/10 flex items-center px-3">
                    <span className="text-[10px] text-violet-300/60 truncate">{result.error}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Summary note after generation */}
        {allDone && results.some((r) => r.status === "error") && (
          <div className="mt-4 text-[11px] text-muted-foreground/70 leading-relaxed">
            ⚠ Some scenes failed. Paste the error text and the agent will fix the endpoint
            parameters next cycle. Endpoint used:{" "}
            <code className="text-muted-foreground">fal-ai/chatterbox/text-to-speech</code>
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 flex flex-wrap items-center gap-6">
          <Link href="/dream" className="text-[11px] text-muted-foreground/70 hover:text-muted-foreground">
            ← back
          </Link>
          <a
            href="src/app/dream/66-chatterbox-ghost/README.md"
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-muted-foreground/70 hover:text-muted-foreground"
          >
            design notes
          </a>
          <span className="text-[11px] text-muted-foreground/70">
            Chatterbox Turbo · fal.ai · $0.025/1000 chars
            {hasRef ? " · voice-clone mode" : " · default voice"}
          </span>
        </div>
      </div>
    </div>
  );
}
