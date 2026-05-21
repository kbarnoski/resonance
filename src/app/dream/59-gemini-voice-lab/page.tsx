"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── Scene definitions ──────────────────────────────────────────────────────────
// styleA = the "official" voice used in 56-ghost-voice (baseline).
// styleB = an experimental alternative to compare against.

const SCENES = [
  {
    id: "stone",
    name: "Stone Chamber",
    accent: "#c4a882",
    line: "The resonance here is ancient. Let yourself be absorbed by it.",
    styleA: "calm, androgynous, very slow, low pitch, ancient and measured, solemn",
    styleB: "whispered, breathy, intimate, barely audible, reverent — like a secret in a crypt",
  },
  {
    id: "root",
    name: "Root Portal",
    accent: "#6db56d",
    line: "Something stirs beneath the roots. A low note. Then silence.",
    styleA: "calm, androgynous, slow, mysterious, deep resonance, slightly earthy",
    styleB: "low and slow, deliberate pauses, weighted — as if each word costs something",
  },
  {
    id: "pool",
    name: "Underground Pool",
    accent: "#4a9ab5",
    line: "The water remembers every sound that has passed through this place.",
    styleA: "calm, androgynous, meditative, clear diction, slightly hollow, liquid quality",
    styleB: "ethereal, slightly dreamy, each word fading at the end like a reflection dissolving",
  },
  {
    id: "planet",
    name: "Tiny Planet",
    accent: "#d0a0f0",
    line: "A single breath. The horizon wraps around you.",
    styleA: "calm, androgynous, very slow, airy, vast open space, breathy",
    styleB: "small and wondering, almost childlike, warm surprise — the universe is new",
  },
  {
    id: "forest",
    name: "Forest Dawn",
    accent: "#7ab58a",
    line: "The first light is also the first sound. They arrive together.",
    styleA: "calm, androgynous, clear, warm, peaceful, slightly bright and grateful",
    styleB: "soft and reverent, like the first words spoken after a long silence, unhurried",
  },
  {
    id: "cosmic",
    name: "Cosmic Ascension",
    accent: "#8090e0",
    line: "You are not rising. The world is receding.",
    styleA: "calm, androgynous, vast, ethereal, slow, deep and transcendent",
    styleB: "utterly flat, zero affect, infinite distance — the voice of something that has already arrived",
  },
] as const;

type VoteChoice = "A" | "B" | "both" | "neither";

interface VoteTally {
  A: number;
  B: number;
  both: number;
  neither: number;
}

interface VariantState {
  style: string;
  loading: boolean;
  error: string | null;
  audioBuf: AudioBuffer | null;
  duration: number;
  playing: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeVariant(style: string): VariantState {
  return { style, loading: false, error: null, audioBuf: null, duration: 0, playing: false };
}

function drawWaveform(canvas: HTMLCanvasElement, buf: AudioBuffer, accent: string): void {
  const gc = canvas.getContext("2d");
  if (!gc) return;
  const W = canvas.width;
  const H = canvas.height;
  const data = buf.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / W));
  const cy = H / 2;

  gc.fillStyle = "#0d0d0d";
  gc.fillRect(0, 0, W, H);

  gc.strokeStyle = accent + "30";
  gc.lineWidth = 1;
  gc.beginPath();
  gc.moveTo(0, cy);
  gc.lineTo(W, cy);
  gc.stroke();

  gc.fillStyle = accent + "99";
  for (let x = 0; x < W; x++) {
    let peak = 0;
    for (let s = 0; s < step; s++) {
      const idx = x * step + s;
      if (idx < data.length) {
        const v = Math.abs(data[idx]);
        if (v > peak) peak = v;
      }
    }
    const barH = peak * cy * 0.88;
    gc.fillRect(x, cy - barH, 1, barH * 2);
  }
}

function clearCanvas(canvas: HTMLCanvasElement): void {
  const gc = canvas.getContext("2d");
  if (!gc) return;
  gc.fillStyle = "#0d0d0d";
  gc.fillRect(0, 0, canvas.width, canvas.height);
  gc.strokeStyle = "rgba(255,255,255,0.08)";
  gc.lineWidth = 1;
  gc.beginPath();
  gc.moveTo(0, canvas.height / 2);
  gc.lineTo(canvas.width, canvas.height / 2);
  gc.stroke();
}

function storageTallyKey(id: string): string {
  return `gvl-tally-${id}`;
}

function loadTally(id: string): VoteTally {
  try {
    const raw = localStorage.getItem(storageTallyKey(id));
    if (!raw) return { A: 0, B: 0, both: 0, neither: 0 };
    return JSON.parse(raw) as VoteTally;
  } catch {
    return { A: 0, B: 0, both: 0, neither: 0 };
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GeminiVoiceLabPage() {
  const [sceneIdx, setSceneIdx] = useState(0);
  const [vA, setVA] = useState<VariantState>(() => makeVariant(SCENES[0].styleA));
  const [vB, setVB] = useState<VariantState>(() => makeVariant(SCENES[0].styleB));
  const [vote, setVote] = useState<VoteChoice | null>(null);
  const [tally, setTally] = useState<VoteTally>({ A: 0, B: 0, both: 0, neither: 0 });

  const canvasARef = useRef<HTMLCanvasElement>(null);
  const canvasBRef = useRef<HTMLCanvasElement>(null);
  const srcARef = useRef<AudioBufferSourceNode | null>(null);
  const srcBRef = useRef<AudioBufferSourceNode | null>(null);
  const ctxARef = useRef<AudioContext | null>(null);
  const ctxBRef = useRef<AudioContext | null>(null);

  const scene = SCENES[sceneIdx];

  // ── Reset on scene change ─────────────────────────────────────────────────
  useEffect(() => {
    if (srcARef.current) { try { srcARef.current.stop(); } catch { /* ok */ } srcARef.current = null; }
    if (srcBRef.current) { try { srcBRef.current.stop(); } catch { /* ok */ } srcBRef.current = null; }
    if (ctxARef.current) { ctxARef.current.close().catch(() => {}); ctxARef.current = null; }
    if (ctxBRef.current) { ctxBRef.current.close().catch(() => {}); ctxBRef.current = null; }

    const sc = SCENES[sceneIdx];
    setVA(makeVariant(sc.styleA));
    setVB(makeVariant(sc.styleB));
    setVote(null);
    setTally(loadTally(sc.id));

    // Clear canvases
    if (canvasARef.current) clearCanvas(canvasARef.current);
    if (canvasBRef.current) clearCanvas(canvasBRef.current);
  }, [sceneIdx]);

  // ── Draw waveform A ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!canvasARef.current) return;
    if (vA.audioBuf) {
      drawWaveform(canvasARef.current, vA.audioBuf, SCENES[sceneIdx].accent);
    } else {
      clearCanvas(canvasARef.current);
    }
  }, [vA.audioBuf, sceneIdx]);

  // ── Draw waveform B ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!canvasBRef.current) return;
    if (vB.audioBuf) {
      drawWaveform(canvasBRef.current, vB.audioBuf, SCENES[sceneIdx].accent);
    } else {
      clearCanvas(canvasBRef.current);
    }
  }, [vB.audioBuf, sceneIdx]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (srcARef.current) { try { srcARef.current.stop(); } catch { /* ok */ } }
      if (srcBRef.current) { try { srcBRef.current.stop(); } catch { /* ok */ } }
      if (ctxARef.current) { ctxARef.current.close().catch(() => {}); }
      if (ctxBRef.current) { ctxBRef.current.close().catch(() => {}); }
    };
  }, []);

  // ── Generate ──────────────────────────────────────────────────────────────
  async function handleGenerate(variant: "A" | "B") {
    const style = variant === "A" ? vA.style : vB.style;
    const setV = variant === "A" ? setVA : setVB;
    const srcRef = variant === "A" ? srcARef : srcBRef;
    const ctxRef = variant === "A" ? ctxARef : ctxBRef;

    if (srcRef.current) { try { srcRef.current.stop(); } catch { /* ok */ } srcRef.current = null; }
    if (ctxRef.current) { ctxRef.current.close().catch(() => {}); ctxRef.current = null; }

    setV(prev => ({ ...prev, loading: true, error: null, audioBuf: null, duration: 0, playing: false }));

    try {
      const res = await fetch("/dream/59-gemini-voice-lab/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: scene.line, styleInstructions: style }),
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      if (!json.url) throw new Error("No audio URL in response");

      const audioRes = await fetch(json.url);
      if (!audioRes.ok) throw new Error(`Audio fetch: ${audioRes.status}`);
      const arrayBuf = await audioRes.arrayBuffer();

      const tmpCtx = new AudioContext();
      const audioBuf = await tmpCtx.decodeAudioData(arrayBuf);
      await tmpCtx.close();

      setV(prev => ({
        ...prev,
        loading: false,
        audioBuf,
        duration: audioBuf.duration,
        error: null,
      }));
    } catch (err) {
      setV(prev => ({ ...prev, loading: false, error: String(err) }));
    }
  }

  // ── Play / stop ───────────────────────────────────────────────────────────
  function handlePlay(variant: "A" | "B") {
    const v = variant === "A" ? vA : vB;
    const setV = variant === "A" ? setVA : setVB;
    const srcRef = variant === "A" ? srcARef : srcBRef;
    const ctxRef = variant === "A" ? ctxARef : ctxBRef;

    if (!v.audioBuf) return;

    if (v.playing) {
      if (srcRef.current) { try { srcRef.current.stop(); } catch { /* ok */ } srcRef.current = null; }
      if (ctxRef.current) { ctxRef.current.close().catch(() => {}); ctxRef.current = null; }
      setV(prev => ({ ...prev, playing: false }));
      return;
    }

    if (srcRef.current) { try { srcRef.current.stop(); } catch { /* ok */ } srcRef.current = null; }
    if (ctxRef.current) { ctxRef.current.close().catch(() => {}); ctxRef.current = null; }

    const audioCtx = new AudioContext();
    ctxRef.current = audioCtx;

    const src = audioCtx.createBufferSource();
    src.buffer = v.audioBuf;
    src.connect(audioCtx.destination);
    srcRef.current = src;

    src.onended = () => {
      srcRef.current = null;
      setV(prev => ({ ...prev, playing: false }));
    };

    setV(prev => ({ ...prev, playing: true }));
    src.start();
  }

  // ── Vote ──────────────────────────────────────────────────────────────────
  function castVote(choice: VoteChoice) {
    setVote(choice);
    const next: VoteTally = {
      A: tally.A + (choice === "A" ? 1 : 0),
      B: tally.B + (choice === "B" ? 1 : 0),
      both: tally.both + (choice === "both" ? 1 : 0),
      neither: tally.neither + (choice === "neither" ? 1 : 0),
    };
    setTally(next);
    localStorage.setItem(storageTallyKey(scene.id), JSON.stringify(next));
  }

  const totalVotes = tally.A + tally.B + tally.both + tally.neither;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#080808] text-white font-mono px-4 py-8">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="flex justify-between items-baseline mb-1">
          <h1 className="text-lg font-bold tracking-wide">Ghost Voice Lab</h1>
          <Link href="/dream" className="text-[11px] text-white/30 hover:text-white/60">
            ← dream
          </Link>
        </div>
        <p className="text-[12px] text-white/40 mb-6 leading-relaxed">
          A/B style test for Gemini TTS. Edit the style instructions, generate each variant,
          compare them, and vote. Votes accumulate per scene across sessions.{" "}
          <span className="text-white/25">Wear headphones.</span>
        </p>

        {/* Scene selector */}
        <div className="flex flex-wrap gap-2 mb-5">
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

        {/* Quote */}
        <div className="text-center mb-6 py-3 px-4 border border-white/8 rounded-lg">
          <p className="text-[14px] italic leading-relaxed" style={{ color: scene.accent + "cc" }}>
            &ldquo;{scene.line}&rdquo;
          </p>
        </div>

        {/* A/B columns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {(["A", "B"] as const).map((variant) => {
            const v = variant === "A" ? vA : vB;
            const setV = variant === "A" ? setVA : setVB;
            const isWinner = vote === variant || vote === "both";
            return (
              <div
                key={variant}
                className="border rounded-lg p-4 flex flex-col gap-3 transition"
                style={{
                  borderColor: isWinner ? scene.accent + "70" : "rgba(255,255,255,0.10)",
                  background: isWinner ? scene.accent + "08" : undefined,
                }}
              >
                {/* Variant header */}
                <div className="flex justify-between items-center">
                  <span
                    className="text-[14px] font-bold tracking-widest"
                    style={{ color: scene.accent }}
                  >
                    {variant}
                  </span>
                  <div className="flex gap-2 items-center">
                    {isWinner && (
                      <span className="text-[10px]" style={{ color: scene.accent }}>
                        ✓ preferred
                      </span>
                    )}
                    {v.audioBuf && (
                      <span className="text-[10px] text-white/30">
                        {v.duration.toFixed(1)}s
                      </span>
                    )}
                  </div>
                </div>

                {/* Style instructions textarea */}
                <div>
                  <label className="text-[10px] text-white/35 block mb-1">
                    style_instructions
                  </label>
                  <textarea
                    value={v.style}
                    onChange={e => setV(prev => ({ ...prev, style: e.target.value }))}
                    rows={3}
                    className={
                      "w-full bg-[#141414] border rounded px-2 py-1.5 " +
                      "text-[11px] text-white/70 leading-relaxed resize-none " +
                      "focus:outline-none focus:border-white/25 transition"
                    }
                    style={{ borderColor: "rgba(255,255,255,0.10)" }}
                    placeholder="e.g. calm, androgynous, stone chamber reverb…"
                  />
                </div>

                {/* Generate button */}
                <button
                  onClick={() => { void handleGenerate(variant); }}
                  disabled={v.loading}
                  className={
                    "px-3 py-2 border rounded text-[12px] tracking-wide " +
                    "transition cursor-pointer hover:bg-white/5 " +
                    "disabled:opacity-40 disabled:cursor-not-allowed"
                  }
                  style={{
                    borderColor: scene.accent + "60",
                    color: v.loading ? "rgba(255,255,255,0.3)" : scene.accent,
                  }}
                >
                  {v.loading ? "Generating…" : `Generate ${variant}`}
                </button>

                {/* Waveform canvas */}
                <div className="relative">
                  <canvas
                    ref={variant === "A" ? canvasARef : canvasBRef}
                    width={640}
                    height={72}
                    className="w-full rounded"
                    style={{ background: "#0d0d0d" }}
                  />
                  {!v.audioBuf && !v.loading && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="text-[10px] text-white/20">no audio yet</span>
                    </div>
                  )}
                  {v.loading && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="text-[10px] text-white/35 animate-pulse">synthesizing…</span>
                    </div>
                  )}
                </div>

                {/* Play / stop button */}
                {v.audioBuf && (
                  <button
                    onClick={() => handlePlay(variant)}
                    className={
                      "px-3 py-1.5 border border-white/12 rounded text-[11px] " +
                      "text-white/55 hover:text-white/90 hover:border-white/30 " +
                      "transition cursor-pointer"
                    }
                    style={v.playing ? { borderColor: scene.accent + "50", color: scene.accent } : {}}
                  >
                    {v.playing ? "■ stop" : "▶ play"}
                  </button>
                )}

                {/* Error */}
                {v.error && (
                  <div className="text-[10px] text-red-400 bg-red-950/30 rounded px-2 py-1.5 leading-relaxed">
                    {v.error.slice(0, 260)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Vote section */}
        <div className="border border-white/8 rounded-lg p-4 mb-6">
          <p className="text-[11px] text-white/40 mb-3">
            Which style better captures the Ghost character for this scene?
          </p>
          <div className="flex flex-wrap gap-2 mb-4">
            {(
              [
                ["A", "A wins"],
                ["both", "Both fine"],
                ["B", "B wins"],
                ["neither", "Try again"],
              ] as [VoteChoice, string][]
            ).map(([choice, label]) => (
              <button
                key={choice}
                onClick={() => castVote(choice)}
                className={
                  "px-4 py-1.5 rounded text-[12px] border transition cursor-pointer " +
                  (vote === choice
                    ? "border-white/40 text-white bg-white/10"
                    : "border-white/12 text-white/50 hover:border-white/30 hover:text-white/70")
                }
              >
                {label}
              </button>
            ))}
          </div>

          {totalVotes > 0 && (
            <div className="flex flex-wrap gap-5 text-[10px] text-white/35">
              <span>A: {tally.A}</span>
              <span>B: {tally.B}</span>
              <span>Both: {tally.both}</span>
              <span>Try again: {tally.neither}</span>
              <span className="text-white/20">({totalVotes} total for this scene)</span>
            </div>
          )}

          {vote === "neither" && (
            <p className="mt-3 text-[11px] text-white/35">
              Edit the style instructions above and generate again.
              The textarea is fully editable — try completely different directions.
            </p>
          )}
        </div>

        {/* Usage tips */}
        <div className="text-[10px] text-white/25 leading-relaxed mb-6 border-l-2 border-white/8 pl-3">
          <p className="mb-1">Try swapping the default styles between A and B to isolate what each parameter does.</p>
          <p className="mb-1">Useful contrasts: slow/formal vs. breathy/intimate · flat affect vs. expressive · direct vs. distant.</p>
          <p>Votes are stored per-scene in localStorage — they persist across sessions.</p>
        </div>

        {/* Footer */}
        <div className="flex justify-between text-[10px] text-white/20">
          <span>Gemini TTS · fal-ai/gemini-tts · FAL_KEY · ~$0.01 per generation pair</span>
          <span>design notes: src/app/dream/59-gemini-voice-lab/README.md</span>
        </div>

      </div>
    </div>
  );
}
