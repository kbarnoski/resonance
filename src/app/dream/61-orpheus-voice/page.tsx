"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── Scene definitions ──────────────────────────────────────────────────────────
// A = Gemini TTS, global style direction (baseline from 56-ghost-voice)
// B = Gemini TTS, experimental alternative style
// C = Orpheus TTS, phrase-level emotion tags embedded in text

const SCENES = [
  {
    id: "stone",
    name: "Stone Chamber",
    accent: "#c4a882",
    line: "The resonance here is ancient. Let yourself be absorbed by it.",
    styleA: "calm, androgynous, very slow, low pitch, ancient and measured, solemn",
    styleB: "whispered, breathy, intimate, barely audible, reverent — like a secret in a crypt",
    orpheusText:
      "The <reverent>resonance</reverent> here is ancient. Let yourself be <whispers>absorbed</whispers> by it.",
  },
  {
    id: "root",
    name: "Root Portal",
    accent: "#6db56d",
    line: "Something stirs beneath the roots. A low note. Then silence.",
    styleA: "calm, androgynous, slow, mysterious, deep resonance, slightly earthy",
    styleB: "low and slow, deliberate pauses, weighted — as if each word costs something",
    orpheusText:
      "Something <fearful>stirs</fearful> beneath the roots. A low note. Then <whispers>silence</whispers>.",
  },
  {
    id: "pool",
    name: "Underground Pool",
    accent: "#4a9ab5",
    line: "The water remembers every sound that has passed through this place.",
    styleA: "calm, androgynous, meditative, clear diction, slightly hollow, liquid quality",
    styleB: "ethereal, slightly dreamy, each word fading at the end like a reflection dissolving",
    orpheusText:
      "The water <sad>remembers</sad> every sound that has passed through this place.",
  },
  {
    id: "planet",
    name: "Tiny Planet",
    accent: "#d0a0f0",
    line: "A single breath. The horizon wraps around you.",
    styleA: "calm, androgynous, very slow, airy, vast open space, breathy",
    styleB: "small and wondering, almost childlike, warm surprise — the universe is new",
    orpheusText:
      "A single breath. The horizon <surprised>wraps</surprised> around you.",
  },
  {
    id: "forest",
    name: "Forest Dawn",
    accent: "#7ab58a",
    line: "The first light is also the first sound. They arrive together.",
    styleA: "calm, androgynous, clear, warm, peaceful, slightly bright and grateful",
    styleB: "soft and reverent, like the first words spoken after a long silence, unhurried",
    orpheusText:
      "The first light is also the first sound. They arrive <happy>together</happy>.",
  },
  {
    id: "cosmic",
    name: "Cosmic Ascension",
    accent: "#8090e0",
    line: "You are not rising. The world is receding.",
    styleA: "calm, androgynous, vast, ethereal, slow, deep and transcendent",
    styleB:
      "utterly flat, zero affect, infinite distance — the voice of something that has already arrived",
    orpheusText:
      "You are not <excited>rising</excited>. The world is <sad>receding</sad>.",
  },
] as const;

type VoteChoice = "A" | "B" | "C" | "all" | "retry";

interface VoteTally {
  A: number;
  B: number;
  C: number;
  all: number;
  retry: number;
}

interface VariantState {
  input: string;
  loading: boolean;
  error: string | null;
  audioBuf: AudioBuffer | null;
  duration: number;
  playing: boolean;
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

function buildVariants(sc: (typeof SCENES)[number]): [VariantState, VariantState, VariantState] {
  const make = (input: string): VariantState => ({
    input,
    loading: false,
    error: null,
    audioBuf: null,
    duration: 0,
    playing: false,
  });
  return [make(sc.styleA), make(sc.styleB), make(sc.orpheusText)];
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

function clearWave(canvas: HTMLCanvasElement): void {
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

function tallyKey(id: string): string {
  return `orpheus-voice-tally-${id}`;
}

function loadTally(id: string): VoteTally {
  try {
    const raw = localStorage.getItem(tallyKey(id));
    if (!raw) return { A: 0, B: 0, C: 0, all: 0, retry: 0 };
    return JSON.parse(raw) as VoteTally;
  } catch {
    return { A: 0, B: 0, C: 0, all: 0, retry: 0 };
  }
}

const VARIANT_LABELS = ["A", "B", "C"] as const;
const VARIANT_ENGINES: ("gemini" | "orpheus")[] = ["gemini", "gemini", "orpheus"];
const VARIANT_INPUT_LABELS = [
  "style_instructions (Gemini)",
  "style_instructions (Gemini)",
  "tagged text (Orpheus)",
];
const VARIANT_PLACEHOLDERS = [
  "e.g. calm, androgynous, stone chamber reverb…",
  "e.g. whispered, breathy, intimate…",
  "e.g. The <reverent>resonance</reverent> here is <whispers>ancient</whispers>.",
];
const VARIANT_DESC = [
  "Gemini TTS · global style direction",
  "Gemini TTS · experimental style",
  "Orpheus TTS · phrase-level emotion tags",
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function OrpheusVoicePage() {
  const [sceneIdx, setSceneIdx] = useState(0);
  const [variants, setVariants] = useState<[VariantState, VariantState, VariantState]>(
    () => buildVariants(SCENES[0])
  );
  const [vote, setVote] = useState<VoteChoice | null>(null);
  const [tally, setTally] = useState<VoteTally>({ A: 0, B: 0, C: 0, all: 0, retry: 0 });

  // Three separate canvas refs — rule-of-hooks safe
  const canvasRef0 = useRef<HTMLCanvasElement>(null);
  const canvasRef1 = useRef<HTMLCanvasElement>(null);
  const canvasRef2 = useRef<HTMLCanvasElement>(null);

  // Audio refs (arrays are stable refs, not state)
  const srcRefs = useRef<(AudioBufferSourceNode | null)[]>([null, null, null]);
  const ctxRefs = useRef<(AudioContext | null)[]>([null, null, null]);

  const scene = SCENES[sceneIdx];

  // ── Reset when scene changes ───────────────────────────────────────────────
  useEffect(() => {
    for (let i = 0; i < 3; i++) {
      if (srcRefs.current[i]) {
        try { srcRefs.current[i]!.stop(); } catch { /* ok */ }
        srcRefs.current[i] = null;
      }
      if (ctxRefs.current[i]) {
        ctxRefs.current[i]!.close().catch(() => {});
        ctxRefs.current[i] = null;
      }
    }
    const sc = SCENES[sceneIdx];
    setVariants(buildVariants(sc));
    setVote(null);
    setTally(loadTally(sc.id));
    if (canvasRef0.current) clearWave(canvasRef0.current);
    if (canvasRef1.current) clearWave(canvasRef1.current);
    if (canvasRef2.current) clearWave(canvasRef2.current);
  }, [sceneIdx]);

  // ── Redraw waveforms when audioBufs change ────────────────────────────────
  useEffect(() => {
    if (!canvasRef0.current) return;
    if (variants[0].audioBuf) drawWaveform(canvasRef0.current, variants[0].audioBuf, scene.accent);
    else clearWave(canvasRef0.current);
  }, [variants[0].audioBuf, scene.accent]);

  useEffect(() => {
    if (!canvasRef1.current) return;
    if (variants[1].audioBuf) drawWaveform(canvasRef1.current, variants[1].audioBuf, scene.accent);
    else clearWave(canvasRef1.current);
  }, [variants[1].audioBuf, scene.accent]);

  useEffect(() => {
    if (!canvasRef2.current) return;
    if (variants[2].audioBuf) drawWaveform(canvasRef2.current, variants[2].audioBuf, scene.accent);
    else clearWave(canvasRef2.current);
  }, [variants[2].audioBuf, scene.accent]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      for (let i = 0; i < 3; i++) {
        if (srcRefs.current[i]) { try { srcRefs.current[i]!.stop(); } catch { /* ok */ } }
        if (ctxRefs.current[i]) { ctxRefs.current[i]!.close().catch(() => {}); }
      }
    };
  }, []);

  // ── Generate ──────────────────────────────────────────────────────────────
  async function handleGenerate(i: number) {
    // Stop any playing audio for this variant
    if (srcRefs.current[i]) {
      try { srcRefs.current[i]!.stop(); } catch { /* ok */ }
      srcRefs.current[i] = null;
    }
    if (ctxRefs.current[i]) {
      ctxRefs.current[i]!.close().catch(() => {});
      ctxRefs.current[i] = null;
    }

    const capturedInput = variants[i].input;
    const engine = VARIANT_ENGINES[i];
    const isOrpheus = engine === "orpheus";

    setVariants(prev => {
      const next = [...prev] as [VariantState, VariantState, VariantState];
      next[i] = { ...prev[i], loading: true, error: null, audioBuf: null, duration: 0, playing: false };
      return next;
    });

    try {
      const res = await fetch("/dream/61-orpheus-voice/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engine,
          text: isOrpheus ? capturedInput : scene.line,
          styleInstructions: isOrpheus ? undefined : capturedInput,
        }),
      });
      const json = (await res.json()) as { url?: string; error?: string; raw?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      if (!json.url) throw new Error("No audio URL in response");

      const audioRes = await fetch(json.url);
      if (!audioRes.ok) throw new Error(`Audio fetch: ${audioRes.status}`);
      const arrayBuf = await audioRes.arrayBuffer();

      const tmpCtx = new AudioContext();
      const audioBuf = await tmpCtx.decodeAudioData(arrayBuf);
      await tmpCtx.close();

      setVariants(prev => {
        const next = [...prev] as [VariantState, VariantState, VariantState];
        next[i] = { ...prev[i], loading: false, audioBuf, duration: audioBuf.duration, error: null };
        return next;
      });
    } catch (err) {
      setVariants(prev => {
        const next = [...prev] as [VariantState, VariantState, VariantState];
        next[i] = { ...prev[i], loading: false, error: String(err) };
        return next;
      });
    }
  }

  // ── Play / stop ───────────────────────────────────────────────────────────
  function handlePlay(i: number) {
    const v = variants[i];
    if (!v.audioBuf) return;

    if (v.playing) {
      if (srcRefs.current[i]) {
        try { srcRefs.current[i]!.stop(); } catch { /* ok */ }
        srcRefs.current[i] = null;
      }
      if (ctxRefs.current[i]) {
        ctxRefs.current[i]!.close().catch(() => {});
        ctxRefs.current[i] = null;
      }
      setVariants(prev => {
        const next = [...prev] as [VariantState, VariantState, VariantState];
        next[i] = { ...prev[i], playing: false };
        return next;
      });
      return;
    }

    if (srcRefs.current[i]) {
      try { srcRefs.current[i]!.stop(); } catch { /* ok */ }
      srcRefs.current[i] = null;
    }
    if (ctxRefs.current[i]) {
      ctxRefs.current[i]!.close().catch(() => {});
      ctxRefs.current[i] = null;
    }

    const audioCtx = new AudioContext();
    ctxRefs.current[i] = audioCtx;
    const src = audioCtx.createBufferSource();
    src.buffer = v.audioBuf;
    src.connect(audioCtx.destination);
    srcRefs.current[i] = src;

    src.onended = () => {
      srcRefs.current[i] = null;
      setVariants(prev => {
        const next = [...prev] as [VariantState, VariantState, VariantState];
        next[i] = { ...prev[i], playing: false };
        return next;
      });
    };

    setVariants(prev => {
      const next = [...prev] as [VariantState, VariantState, VariantState];
      next[i] = { ...prev[i], playing: true };
      return next;
    });
    src.start();
  }

  // ── Vote ──────────────────────────────────────────────────────────────────
  function castVote(choice: VoteChoice) {
    setVote(choice);
    const next: VoteTally = {
      A: tally.A + (choice === "A" ? 1 : 0),
      B: tally.B + (choice === "B" ? 1 : 0),
      C: tally.C + (choice === "C" ? 1 : 0),
      all: tally.all + (choice === "all" ? 1 : 0),
      retry: tally.retry + (choice === "retry" ? 1 : 0),
    };
    setTally(next);
    localStorage.setItem(tallyKey(scene.id), JSON.stringify(next));
  }

  const totalVotes = tally.A + tally.B + tally.C + tally.all + tally.retry;

  // ── Render ────────────────────────────────────────────────────────────────
  const canvasRefs = [canvasRef0, canvasRef1, canvasRef2] as const;

  return (
    <div className="min-h-screen bg-[#080808] text-white font-mono px-4 py-8">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex justify-between items-baseline mb-1">
          <h1 className="text-lg font-bold tracking-wide">Orpheus Voice Lab</h1>
          <Link href="/dream" className="text-[11px] text-white/30 hover:text-white/60">
            ← dream
          </Link>
        </div>
        <p className="text-[12px] text-white/40 mb-6 leading-relaxed">
          Three-way Ghost voice comparison: Gemini TTS global style (A) · Gemini TTS experimental (B) ·
          Orpheus TTS phrase-level emotion tags (C).{" "}
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

        {/* A / B / C columns */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {VARIANT_LABELS.map((label, i) => {
            const v = variants[i];
            const isWinner = vote === label || vote === "all";
            return (
              <div
                key={label}
                className="border rounded-lg p-4 flex flex-col gap-3 transition"
                style={{
                  borderColor: isWinner ? scene.accent + "70" : "rgba(255,255,255,0.10)",
                  background: isWinner ? scene.accent + "08" : undefined,
                }}
              >
                {/* Variant header */}
                <div className="flex justify-between items-start">
                  <div>
                    <span
                      className="text-[15px] font-bold tracking-widest block"
                      style={{ color: scene.accent }}
                    >
                      {label}
                    </span>
                    <span className="text-[9px] text-white/30 block leading-tight mt-0.5">
                      {VARIANT_DESC[i]}
                    </span>
                  </div>
                  <div className="flex gap-2 items-center">
                    {isWinner && (
                      <span className="text-[10px]" style={{ color: scene.accent }}>
                        ✓
                      </span>
                    )}
                    {v.audioBuf && (
                      <span className="text-[10px] text-white/30">
                        {v.duration.toFixed(1)}s
                      </span>
                    )}
                  </div>
                </div>

                {/* Input textarea */}
                <div>
                  <label className="text-[10px] text-white/35 block mb-1">
                    {VARIANT_INPUT_LABELS[i]}
                  </label>
                  <textarea
                    value={v.input}
                    onChange={e => {
                      const val = e.target.value;
                      setVariants(prev => {
                        const next = [...prev] as [VariantState, VariantState, VariantState];
                        next[i] = { ...prev[i], input: val };
                        return next;
                      });
                    }}
                    rows={3}
                    className={
                      "w-full bg-[#141414] border rounded px-2 py-1.5 " +
                      "text-[11px] text-white/70 leading-relaxed resize-none " +
                      "focus:outline-none focus:border-white/25 transition"
                    }
                    style={{ borderColor: "rgba(255,255,255,0.10)" }}
                    placeholder={VARIANT_PLACEHOLDERS[i]}
                  />
                </div>

                {/* Generate button */}
                <button
                  onClick={() => { void handleGenerate(i); }}
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
                  {v.loading ? "Synthesizing…" : `Generate ${label}`}
                </button>

                {/* Waveform canvas */}
                <div className="relative">
                  <canvas
                    ref={canvasRefs[i]}
                    width={480}
                    height={64}
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

                {/* Play / stop */}
                {v.audioBuf && (
                  <button
                    onClick={() => handlePlay(i)}
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
                    {v.error.slice(0, 280)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Vote */}
        <div className="border border-white/8 rounded-lg p-4 mb-6">
          <p className="text-[11px] text-white/40 mb-3">
            Which voice best captures the Ghost character for this scene?
          </p>
          <div className="flex flex-wrap gap-2 mb-4">
            {(
              [
                ["A", "A wins"],
                ["B", "B wins"],
                ["C", "C wins"],
                ["all", "All good"],
                ["retry", "Try again"],
              ] as [VoteChoice, string][]
            ).map(([choice, lbl]) => (
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
                {lbl}
              </button>
            ))}
          </div>

          {totalVotes > 0 && (
            <div className="flex flex-wrap gap-5 text-[10px] text-white/35">
              <span>A: {tally.A}</span>
              <span>B: {tally.B}</span>
              <span>C: {tally.C}</span>
              <span>All: {tally.all}</span>
              <span>Retry: {tally.retry}</span>
              <span className="text-white/20">({totalVotes} total for this scene)</span>
            </div>
          )}

          {vote === "retry" && (
            <p className="mt-3 text-[11px] text-white/35">
              Edit the style instructions or Orpheus tags above and generate again. Textareas are
              fully editable — try completely different directions.
            </p>
          )}
        </div>

        {/* Orpheus tag reference */}
        <div className="text-[10px] text-white/25 leading-relaxed mb-6 border-l-2 border-white/8 pl-3">
          <p className="mb-1 text-white/35">Orpheus emotion tags (column C only):</p>
          <p className="font-mono mb-1 text-white/30">
            {"<reverent> <whispers> <sad> <fearful> <happy> <excited> <surprised> <disgusted>"}
          </p>
          <p className="mb-1">
            Wrap a word or phrase:{" "}
            <span className="text-white/40 font-mono">
              The &lt;reverent&gt;resonance&lt;/reverent&gt; here is ancient.
            </span>
          </p>
          <p>
            Gemini (A/B) applies style globally — the whole sentence gets the same character.
            Orpheus (C) shifts tone word-by-word: one word can whisper while the next is fearful.
          </p>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap justify-between gap-2 text-[10px] text-white/20">
          <span>
            Gemini TTS · fal-ai/gemini-tts · Orpheus TTS · fal-ai/orpheus-tts · FAL_KEY ·
            ~$0.01–0.02/row
          </span>
          <span>design notes: src/app/dream/61-orpheus-voice/README.md</span>
        </div>

      </div>
    </div>
  );
}
