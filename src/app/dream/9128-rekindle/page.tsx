"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { AudioEngine, type PlayMode } from "./audio";
import {
  reharmonize,
  STYLE_LABELS,
  type ChordEvent,
  type ReharmStyle,
} from "./reharmonize";
import {
  extractMelody,
  FALLBACK_PHRASE,
  runTranscription,
  type NoteEvent,
  type TranscribeMode,
} from "./transcribe";

// ── Art palette (cream / ink illuminated-manuscript). ART LAYER ONLY. ────────
const ART = {
  parchment: "#f4ead2",
  parchmentEdge: "#e7d8b3",
  grid: "#d8c69c",
  ink: "#2a2115",
  inkSoft: "#5a4a30",
  melody: "#241a0e",
  chord: "#b58a4e",
  chordRoot: "#8a5a25",
  head: "#9c3d1f",
  gold: "#c8a24a",
} as const;

// Resonance recording ids to probe (the /api/audio/[id] route is read-only).
const RESONANCE_IDS = ["1", "2", "3"];

const STYLES: ReharmStyle[] = ["warm", "modal", "cinematic", "sparse"];

interface Layout {
  w: number;
  h: number;
  padX: number;
  padTop: number;
  rollH: number;
  minMidi: number;
  maxMidi: number;
  total: number;
}

function computeLayout(
  melody: NoteEvent[],
  chords: ChordEvent[],
  total: number,
): Layout {
  let min = 127;
  let max = 0;
  for (const n of melody) {
    min = Math.min(min, n.midi);
    max = Math.max(max, n.midi);
  }
  for (const c of chords) {
    for (const m of c.voicing) {
      min = Math.min(min, m);
      max = Math.max(max, m);
    }
  }
  if (min > max) {
    min = 48;
    max = 72;
  }
  return {
    w: 1000,
    h: 380,
    padX: 24,
    padTop: 18,
    rollH: 344,
    minMidi: min - 2,
    maxMidi: max + 2,
    total: Math.max(total, 0.001),
  };
}

function xFor(t: number, L: Layout): number {
  return L.padX + (t / L.total) * (L.w - L.padX * 2);
}

function yFor(midi: number, L: Layout): number {
  const span = L.maxMidi - L.minMidi || 1;
  const frac = (midi - L.minMidi) / span;
  return L.padTop + (1 - frac) * L.rollH;
}

export default function RekindlePage() {
  const [style, setStyle] = useState<ReharmStyle>("warm");
  const [density, setDensity] = useState(0.5);
  const [playMode, setPlayMode] = useState<PlayMode>("reharmonized");
  const [melody, setMelody] = useState<NoteEvent[]>(FALLBACK_PHRASE);
  const [mode, setMode] = useState<TranscribeMode>("fallback");
  const [status, setStatus] = useState("Seeded demo — built-in phrase");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [audioOn, setAudioOn] = useState(false);
  const [head, setHead] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const engineRef = useRef<AudioEngine | null>(null);
  const visualRaf = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { key, chords } = useMemo(
    () => reharmonize(melody, style, density),
    [melody, style, density],
  );

  const total = useMemo(() => {
    const mEnd = melody.length
      ? Math.max(...melody.map((n) => n.start + n.dur))
      : 0;
    const cEnd = chords.length
      ? Math.max(...chords.map((c) => c.start + c.dur))
      : 0;
    return Math.max(mEnd, cEnd, 0.5) + 0.3;
  }, [melody, chords]);

  const layout = useMemo(
    () => computeLayout(melody, chords, total),
    [melody, chords, total],
  );

  const getEngine = useCallback((): AudioEngine => {
    if (!engineRef.current) engineRef.current = new AudioEngine();
    return engineRef.current;
  }, []);

  // Seeded, silent visual demo: sweep the play-head on loop whenever audio
  // is not driving it. Uses performance.now() only for timing.
  useEffect(() => {
    if (audioOn) return;
    let last = performance.now();
    let acc = head % total;
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      acc = (acc + dt) % total;
      setHead(acc);
      visualRaf.current = requestAnimationFrame(loop);
    };
    visualRaf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(visualRaf.current);
    // head intentionally omitted: we seed from it once, then self-advance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioOn, total]);

  // Full teardown.
  useEffect(() => {
    return () => {
      cancelAnimationFrame(visualRaf.current);
      engineRef.current?.dispose();
    };
  }, []);

  const startPlayback = useCallback(async () => {
    const engine = getEngine();
    setError(null);
    try {
      await engine.ensure();
    } catch {
      setError("Could not start audio on this device.");
      return;
    }
    setAudioOn(true);
    await engine.play({
      melody,
      chords,
      mode: playMode,
      onTick: (elapsed) => setHead(Math.min(elapsed, total)),
      onEnd: () => {
        setAudioOn(false);
        setHead(0);
      },
    });
  }, [getEngine, melody, chords, playMode, total]);

  const stopPlayback = useCallback(() => {
    engineRef.current?.stop();
    setAudioOn(false);
  }, []);

  const togglePlay = useCallback(() => {
    if (audioOn) stopPlayback();
    else void startPlayback();
  }, [audioOn, startPlayback, stopPlayback]);

  const transcribeBuffer = useCallback(
    async (buffer: AudioBuffer, label: string) => {
      setBusy(true);
      setProgress(0);
      setError(null);
      setStatus(`Transcribing ${label} with basic-pitch…`);
      try {
        const notes = await runTranscription(buffer, (f) =>
          setProgress(Math.round(f * 100)),
        );
        const mel = extractMelody(notes);
        if (mel.length === 0) throw new Error("no melody detected");
        setMelody(mel);
        setMode("model");
        setStatus(`Transcribed ${label} — ${notes.length} notes (basic-pitch)`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(
          `Neural transcription unavailable (${msg}). Model download may be slow or blocked — showing the built-in phrase instead.`,
        );
        setMelody(FALLBACK_PHRASE);
        setMode("fallback");
        setStatus("Seeded demo — built-in phrase");
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const handleFile = useCallback(
    async (file: File) => {
      const engine = getEngine();
      setError(null);
      try {
        await engine.ensure();
        const data = await file.arrayBuffer();
        const buffer = await engine.decode(data);
        if (!buffer) throw new Error("could not decode this audio file");
        await transcribeBuffer(buffer, file.name);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Couldn't load that file (${msg}). Keeping the built-in phrase.`);
        setMelody(FALLBACK_PHRASE);
        setMode("fallback");
      }
    },
    [getEngine, transcribeBuffer],
  );

  const handleTryResonance = useCallback(async () => {
    const engine = getEngine();
    setBusy(true);
    setError(null);
    setStatus("Fetching a Resonance recording…");
    try {
      await engine.ensure();
      let loaded = false;
      for (const id of RESONANCE_IDS) {
        try {
          const res = await fetch(`/api/audio/${id}`);
          if (!res.ok) continue;
          const json = (await res.json()) as { url?: string };
          if (!json.url) continue;
          const audioRes = await fetch(json.url);
          if (!audioRes.ok) continue;
          const data = await audioRes.arrayBuffer();
          const buffer = await engine.decode(data);
          if (!buffer) continue;
          await transcribeBuffer(buffer, `Resonance #${id}`);
          loaded = true;
          break;
        } catch {
          // try the next id
        }
      }
      if (!loaded) {
        setError(
          "No reachable Resonance recording (404 / CORS / auth). Drop your own audio, or keep the built-in phrase.",
        );
        setStatus("Seeded demo — built-in phrase");
      }
    } finally {
      setBusy(false);
    }
  }, [getEngine, transcribeBuffer]);

  const resetToDemo = useCallback(() => {
    stopPlayback();
    setMelody(FALLBACK_PHRASE);
    setMode("fallback");
    setError(null);
    setStatus("Seeded demo — built-in phrase");
    setHead(0);
  }, [stopPlayback]);

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  const headX = xFor(Math.min(head, total), layout);

  return (
    <main className="mx-auto min-h-dvh max-w-5xl px-5 pb-28 pt-10 sm:px-8">
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="fixed right-4 top-4 z-30 rounded-md border border-border bg-background/70 px-3 py-1.5 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground backdrop-blur hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      <header className="mb-8">
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Resonance dream lab · 9128-rekindle
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Rekindle — transcribe a piano recording, then hear it reharmonized
        </h1>
        <p className="mt-3 max-w-2xl text-base text-muted-foreground">
          Drop in a real piano recording. A neural net (Spotify&apos;s
          basic-pitch) transcribes it to notes live in your browser, then the
          melody is re-voiced under a fresh harmony you steer — new chords,
          same tune. Watch the manuscript below morph as you change the
          reharmonization; tap play to hear it.
        </p>
      </header>

      {/* Source controls */}
      <section className="mb-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void handleTryResonance()}
          disabled={busy}
          className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Try a Resonance recording
        </button>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          Load an audio file…
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = "";
          }}
        />

        {mode === "model" && (
          <button
            type="button"
            onClick={resetToDemo}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Back to demo phrase
          </button>
        )}
      </section>

      {/* Drop zone hint */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`mb-6 rounded-md border border-dashed px-4 py-3 text-sm transition-colors ${
          dragOver
            ? "border-primary bg-accent text-foreground"
            : "border-border text-muted-foreground"
        }`}
      >
        Drag &amp; drop a WAV / MP3 anywhere on this panel to transcribe it.
      </div>

      {/* Status / errors */}
      <div className="mb-6 space-y-1">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {busy ? `${status} ${progress ? `(${progress}%)` : ""}` : status}
        </p>
        <p className="text-sm text-foreground">
          Estimated key:{" "}
          <span className="font-medium text-primary">{key.name}</span> ·{" "}
          <span className="text-muted-foreground">
            {melody.length} melody notes · {chords.length} reharmonized chords ·
            mode: {mode === "model" ? "neural (basic-pitch)" : "built-in phrase"}
          </span>
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {/* Piano roll (SVG art layer, cream/ink) */}
      <figure className="mb-8 overflow-x-auto rounded-md border border-border">
        <svg
          viewBox={`0 0 ${layout.w} ${layout.h}`}
          className="block w-full"
          role="img"
          aria-label="Piano-roll: melody notes above, reharmonized chords beneath, with a sweeping play-head."
        >
          <rect x={0} y={0} width={layout.w} height={layout.h} fill={ART.parchment} />
          <rect
            x={2}
            y={2}
            width={layout.w - 4}
            height={layout.h - 4}
            fill="none"
            stroke={ART.parchmentEdge}
            strokeWidth={3}
          />

          {/* Faint pitch grid lines every octave */}
          {Array.from({ length: 11 }, (_, i) => 24 + i * 12)
            .filter((m) => m >= layout.minMidi && m <= layout.maxMidi)
            .map((m) => (
              <line
                key={`g${m}`}
                x1={layout.padX}
                x2={layout.w - layout.padX}
                y1={yFor(m, layout)}
                y2={yFor(m, layout)}
                stroke={ART.grid}
                strokeWidth={1}
                opacity={0.5}
              />
            ))}

          {/* Reharmonized chord blocks (beneath) */}
          {chords.map((c, ci) =>
            c.voicing.map((m, vi) => {
              const x = xFor(c.start, layout);
              const w = Math.max(3, xFor(c.start + c.dur, layout) - x - 2);
              const active = head >= c.start && head < c.start + c.dur;
              return (
                <rect
                  key={`c${ci}-${vi}`}
                  x={x}
                  y={yFor(m, layout) - 4}
                  width={w}
                  height={8}
                  rx={2}
                  fill={vi === 0 ? ART.chordRoot : ART.chord}
                  opacity={active ? 0.85 : 0.4}
                />
              );
            }),
          )}

          {/* Chord symbol labels */}
          {chords.map((c, ci) => (
            <text
              key={`cl${ci}`}
              x={xFor(c.start, layout) + 3}
              y={layout.h - 10}
              fontSize={12}
              fontFamily="ui-monospace, monospace"
              fill={
                head >= c.start && head < c.start + c.dur
                  ? ART.chordRoot
                  : ART.inkSoft
              }
              opacity={head >= c.start && head < c.start + c.dur ? 1 : 0.6}
            >
              {c.symbol}
            </text>
          ))}

          {/* Melody notes (ink, on top) */}
          {melody.map((n, ni) => {
            const x = xFor(n.start, layout);
            const w = Math.max(4, xFor(n.start + n.dur, layout) - x - 2);
            const active = head >= n.start && head < n.start + n.dur;
            return (
              <rect
                key={`n${ni}`}
                x={x}
                y={yFor(n.midi, layout) - 6}
                width={w}
                height={12}
                rx={3}
                fill={ART.melody}
                stroke={active ? ART.gold : "none"}
                strokeWidth={active ? 2.5 : 0}
                opacity={0.55 + n.vel * 0.45}
              />
            );
          })}

          {/* Play-head */}
          <line
            x1={headX}
            x2={headX}
            y1={layout.padTop - 6}
            y2={layout.padTop + layout.rollH + 6}
            stroke={ART.head}
            strokeWidth={2}
          />
          <circle cx={headX} cy={layout.padTop - 6} r={4} fill={ART.head} />
        </svg>
      </figure>

      {/* Reharmonization controls */}
      <section className="mb-6 grid gap-6 sm:grid-cols-2">
        <div>
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Reharmonization style
          </p>
          <div className="flex flex-wrap gap-2">
            {STYLES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStyle(s)}
                className={`min-h-[44px] rounded-md px-4 text-sm ${
                  style === s
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {STYLE_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label
            htmlFor="density"
            className="mb-2 block font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground"
          >
            Harmonic density — {Math.round(density * 100)}%
          </label>
          <input
            id="density"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={density}
            onChange={(e) => setDensity(parseFloat(e.target.value))}
            className="h-2 w-full cursor-pointer accent-primary"
          />
          <p className="mt-2 text-sm text-muted-foreground">
            More density inserts ii–V motion, borrowed chords and tritone subs.
          </p>
        </div>
      </section>

      {/* Playback + A/B */}
      <section className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {audioOn ? "Stop" : "Play"}
        </button>

        <div className="inline-flex overflow-hidden rounded-md border border-border">
          {(["reharmonized", "original"] as PlayMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setPlayMode(m);
                if (audioOn) {
                  stopPlayback();
                }
              }}
              className={`min-h-[44px] px-4 text-sm ${
                playMode === m
                  ? "bg-accent text-foreground"
                  : "bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {m === "reharmonized" ? "Reharmonized (A)" : "Original melody (B)"}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          First tap starts audio. A/B toggles between the new harmony and the
          bare melody.
        </p>
      </section>

      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                <span className="text-foreground">The question:</span> what if
                you could drop in a real piano recording, have a neural net
                transcribe it to notes live in your browser, and then hear it
                reharmonized — the same melody re-voiced under a new harmony you
                steer?
              </p>
              <p>
                <span className="text-foreground">Transcription:</span> Spotify
                basic-pitch (Bittner et al., ICASSP 2022) — a lightweight
                instrument-agnostic TF.js model — turns audio into note events.
                The model downloads at runtime; if that&apos;s slow or blocked,
                a built-in phrase keeps the piece fully self-demoing.
              </p>
              <p>
                <span className="text-foreground">Reharmonization:</span> the key
                is estimated by Krumhansl–Schmuckler pitch-class correlation,
                then a new functional progression is generated with the{" "}
                <span className="text-foreground">tonal</span> library — ii–V
                insertion, modal interchange, tritone subs and pedal-ish
                voicings, steered by style + density.
              </p>
              <p>
                All randomness is seeded (mulberry32, 0x9128); timing uses
                performance.now / AudioContext.currentTime. No Math.random, no
                drone bed.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["9128-rekindle"]} />
    </main>
  );
}
