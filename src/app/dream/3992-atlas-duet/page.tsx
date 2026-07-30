"use client";

// ════════════════════════════════════════════════════════════════════════════
// ATLAS·DUET (3992) — "What if you weren't alone in a recording's timbre-space —
// what if a self-listening machine voice foraged the same cloud beside you, a
// duet partner that listens to the path you just traced and answers with its own
// complementary path through the sound?"
//
// A DEEP deepening of 3608-atlas (a real corpus-based concatenative-synthesis
// instrument). On load a CORPUS is built: an audio buffer is sliced into ~46 ms
// grains, real spectral descriptors are measured per grain (centroid, RMS,
// pitch/periodicity, flatness, spread) and every grain is PROJECTED to a 2-D
// position from those descriptors — x = brightness, y = pitch. That
// descriptor→space map is the shared instrument.
//
// Then the NEW layer: TWO voices forage that one cloud. You drive the HUMAN voice
// (bright violet halo, panned left). A self-listening AGENT voice (softer violet
// bead + trail, panned right) keeps a rolling memory of your recent trajectory
// and answers by three legible rules — complementarity, call-and-response, and
// pitch consonance — the MACataRT idea of an agent that self-listens and traces
// its own path through a CataRT corpus (arXiv 2502.00023, 2025). A connecting
// line brightens when the two voices harmonically agree.
//
// Demoable headless: a seeded human-stand-in (mulberry32(0x3992)) wanders on load
// so the duet is audibly happening the instant audio unlocks; your first drag
// hands the human voice to you (auto → you) and the agent keeps answering.
//
// References:
//   • Diemo Schwarz — CataRT / corpus-based concatenative synthesis (IRCAM).
//   • MACataRT — "Musical Agent Systems: MACAT and MACataRT" (arXiv 2502.00023,
//     2025): an audio-mosaicing agent that self-listens and traces its own path
//     through a CataRT corpus.
//   • TENOR 2023 — "Maps as Scores: Timbre-Space Representations."
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildCorpus,
  downmixToMono,
  mulberry32,
  renderDefaultPhrase,
  type Corpus,
} from "./duet-corpus";
import { DuetEngine } from "./duet-audio";
import { DuetRenderer } from "./duet-gl";
import { DuetAgent } from "./duet-agent";

type Phase = "building" | "ready" | "glfail";

interface Hud {
  grains: number;
  humanPitchHz: number;
  agentPitchHz: number;
  humanActive: number;
  agentActive: number;
  consonance: number;
  responding: boolean;
}

export default function AtlasDuetPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [phase, setPhase] = useState<Phase>("building");
  const [control, setControl] = useState<"auto" | "you">("auto");
  const [audioReady, setAudioReady] = useState(false);
  const [source, setSource] = useState("Generated piano phrase");
  const [dropError, setDropError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [presence, setPresence] = useState(0.7);
  const [hud, setHud] = useState<Hud>({
    grains: 0,
    humanPitchHz: 0,
    agentPitchHz: 0,
    humanActive: 0,
    agentActive: 0,
    consonance: 0,
    responding: false,
  });

  const ctxRef = useRef<AudioContext | null>(null);
  const engineRef = useRef<DuetEngine | null>(null);
  const rendererRef = useRef<DuetRenderer | null>(null);
  const agentRef = useRef<DuetAgent | null>(null);
  const corpusRef = useRef<Corpus | null>(null);
  const rafRef = useRef(0);
  const userControlRef = useRef(false);
  const cursorRef = useRef<[number, number]>([0, 0]);
  const startMsRef = useRef(0);
  const lastFrameMsRef = useRef(0);
  const tourPhasesRef = useRef<number[]>([]);
  const presenceRef = useRef(0.7);
  const lastHudRef = useRef(0);

  // ── Audio-unlock plumbing ────────────────────────────────────────────────────
  const resumeAudio = useCallback(() => {
    const ctx = ctxRef.current;
    if (ctx && ctx.state === "suspended") {
      void ctx.resume().then(() => setAudioReady(ctx.state === "running"));
    } else if (ctx) {
      setAudioReady(ctx.state === "running");
    }
  }, []);

  const rebuildFromBuffer = useCallback((buffer: AudioBuffer, label: string) => {
    const mono = downmixToMono(buffer);
    const corpus = buildCorpus(buffer, mono, buffer.sampleRate, label);
    corpusRef.current = corpus;
    engineRef.current?.setCorpus(corpus);
    agentRef.current?.setCorpus(corpus);
    agentRef.current?.reset();
    rendererRef.current?.setCorpus(corpus.positions, corpus.colorT, corpus.loud, corpus.n);
    setSource(label);
    setHud((h) => ({ ...h, grains: corpus.n }));
  }, []);

  // ── Presence → agent output level ────────────────────────────────────────────
  useEffect(() => {
    presenceRef.current = presence;
    engineRef.current?.setAgentPresence(presence);
  }, [presence]);

  // ── Mount: GL, audio, agent, default corpus, render loop ─────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = DuetRenderer.create(canvas);
    if (!renderer) {
      setPhase("glfail");
    } else {
      rendererRef.current = renderer;
      renderer.resize();
    }

    agentRef.current = new DuetAgent();

    let engine: DuetEngine | null = null;
    try {
      const AC: typeof AudioContext =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AC();
      ctxRef.current = ctx;
      engine = new DuetEngine(ctx);
      engine.setAgentPresence(presenceRef.current);
      engineRef.current = engine;
      void ctx.resume().then(() => setAudioReady(ctx.state === "running"));
    } catch {
      ctxRef.current = null;
    }

    // Seeded human-stand-in phase offsets (deterministic wander, seeded PRNG only).
    const rng = mulberry32(0x3992);
    tourPhasesRef.current = [
      rng() * 6.283,
      rng() * 6.283,
      rng() * 6.283,
      rng() * 6.283,
      rng() * 6.283,
      rng() * 6.283,
    ];
    startMsRef.current = performance.now();
    lastFrameMsRef.current = startMsRef.current;

    let disposed = false;

    const sampleRate = ctxRef.current?.sampleRate ?? 44100;
    renderDefaultPhrase(sampleRate)
      .then((buffer) => {
        if (disposed) return;
        rebuildFromBuffer(buffer, "Generated piano phrase");
        setPhase((p) => (p === "glfail" ? p : "ready"));
      })
      .catch(() => {
        if (!disposed) setPhase((p) => (p === "glfail" ? p : "ready"));
      });

    const onResize = () => rendererRef.current?.resize();
    window.addEventListener("resize", onResize);

    const unlock = () => resumeAudio();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);

    const loop = () => {
      const nowMs = performance.now();
      const tSec = (nowMs - startMsRef.current) / 1000;
      const dt = Math.min(0.05, Math.max(0.001, (nowMs - lastFrameMsRef.current) / 1000));
      lastFrameMsRef.current = nowMs;

      // HUMAN cursor: seeded stand-in until the visitor takes over. The product
      // of slow + fast sines gives real speed variation — so the stand-in makes
      // occasional "phrases" the agent can hear and answer.
      if (!userControlRef.current) {
        const [p0, p1, p2, p3, p4, p5] = tourPhasesRef.current;
        const gesture = 0.5 + 0.5 * Math.sin(tSec * 0.09 + p4); // slow arousal env
        const x =
          0.66 * Math.sin(tSec * 0.19 + p0) * Math.cos(tSec * 0.071 + p1) +
          0.22 * gesture * Math.sin(tSec * 0.83 + p5);
        const y =
          0.66 * Math.sin(tSec * 0.14 + p2) * Math.cos(tSec * 0.051 + p3) +
          0.22 * gesture * Math.cos(tSec * 0.77 + p4);
        cursorRef.current = [Math.max(-0.98, Math.min(0.98, x)), Math.max(-0.98, Math.min(0.98, y))];
      }
      const [hx, hy] = cursorRef.current;

      const engineNow = engineRef.current;
      const agentNow = agentRef.current;

      let humanActive = 0;
      let agentActive = 0;
      let humanPitch = 0;
      let agentPitch = 0;

      if (engineNow) {
        engineNow.setHumanCursor(hx, hy);
        const hHud = engineNow.humanHud();
        humanActive = hHud.active;
        humanPitch = hHud.voicedPitchHz;
        const aHud = engineNow.agentHud();
        agentPitch = aHud.voicedPitchHz;
      }

      let ax = hx;
      let ay = hy;
      if (agentNow) {
        agentNow.update(dt, hx, hy, humanPitch, agentPitch, presenceRef.current, tSec);
        [ax, ay] = agentNow.pos;
      }

      if (engineNow) {
        engineNow.setAgentCursor(ax, ay);
        engineNow.tick();
        agentActive = engineNow.agentHud().active;
      }

      const consonance = agentNow ? agentNow.consonance : 0;
      const tail = agentNow ? agentNow.getTail() : { arr: new Float32Array(0), count: 0 };
      rendererRef.current?.render({
        human: [hx, hy],
        humanActive,
        agent: [ax, ay],
        agentActive,
        tail: tail.arr,
        tailCount: tail.count,
        consonance,
        presence: presenceRef.current,
        timeSec: tSec,
      });

      if (nowMs - lastHudRef.current > 120) {
        lastHudRef.current = nowMs;
        setHud({
          grains: corpusRef.current?.n ?? 0,
          humanPitchHz: humanPitch,
          agentPitchHz: agentPitch,
          humanActive,
          agentActive,
          consonance,
          responding: agentNow ? agentNow.gestureRecent > 0.35 : false,
        });
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      engineRef.current?.dispose();
      rendererRef.current?.dispose();
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") void ctx.close();
      ctxRef.current = null;
      engineRef.current = null;
      rendererRef.current = null;
      agentRef.current = null;
    };
  }, [rebuildFromBuffer, resumeAudio]);

  // ── Pointer navigation over the atlas (drives the HUMAN voice) ───────────────
  const handlePointer = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const renderer = rendererRef.current;
      const canvas = canvasRef.current;
      if (!renderer || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      const [ax, ay] = renderer.screenToAtlas(e.clientX - rect.left, e.clientY - rect.top, rect);
      cursorRef.current = [Math.max(-1, Math.min(1, ax)), Math.max(-1, Math.min(1, ay))];
      if (!userControlRef.current) {
        userControlRef.current = true;
        setControl("you");
      }
      resumeAudio();
    },
    [resumeAudio],
  );

  // ── Drop your own sound ──────────────────────────────────────────────────────
  const decodeFile = useCallback(
    async (file: File) => {
      setDropError(null);
      const ctx = ctxRef.current;
      if (!ctx) {
        setDropError("Audio engine unavailable — cannot decode a file here.");
        return;
      }
      try {
        const arr = await file.arrayBuffer();
        const buffer = await ctx.decodeAudioData(arr.slice(0));
        setRebuilding(true);
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        rebuildFromBuffer(buffer, file.name);
        resumeAudio();
      } catch {
        setDropError(`Could not decode "${file.name}". Keeping the current atlas.`);
      } finally {
        setRebuilding(false);
      }
    },
    [rebuildFromBuffer, resumeAudio],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void decodeFile(file);
    },
    [decodeFile],
  );

  const onFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void decodeFile(file);
      e.target.value = "";
    },
    [decodeFile],
  );

  return (
    <main
      className="relative h-dvh w-full overflow-hidden bg-background text-foreground"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <canvas
        ref={canvasRef}
        onPointerMove={handlePointer}
        onPointerDown={handlePointer}
        className="absolute inset-0 h-full w-full touch-none"
      />

      {/* Title + one-line description */}
      <div className="pointer-events-none absolute left-0 top-0 z-10 flex flex-col gap-1 p-5">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          A duet inside a recording&apos;s timbre-space
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Atlas · Duet</h1>
        <p className="max-w-sm text-base text-muted-foreground">
          You forage a recording&apos;s sound by moving through it — and a
          self-listening machine voice forages the same cloud beside you, answering
          the path you trace.
        </p>
      </div>

      {/* AUTO → YOU badge */}
      <div className="pointer-events-none absolute right-5 top-20 z-10 flex items-center gap-2 sm:top-5 sm:right-40">
        <span
          className={`font-mono text-xs uppercase tracking-[0.18em] ${
            control === "auto" ? "text-primary" : "text-muted-foreground"
          }`}
        >
          auto
        </span>
        <span className="font-mono text-xs text-muted-foreground">→</span>
        <span
          className={`font-mono text-xs uppercase tracking-[0.18em] ${
            control === "you" ? "text-primary" : "text-muted-foreground"
          }`}
        >
          you
        </span>
      </div>

      {/* Design notes trigger */}
      <button
        type="button"
        onClick={() => setNotesOpen(true)}
        className="absolute right-5 top-5 z-10 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Design notes
      </button>

      {/* Bottom-left HUD readouts */}
      <div className="pointer-events-none absolute bottom-5 left-5 z-10 flex flex-col gap-1.5 font-mono text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="uppercase tracking-[0.14em]">corpus</span>
          <span className="text-foreground">{hud.grains} grains</span>
          <span className="max-w-[40vw] truncate text-muted-foreground">· {source}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="uppercase tracking-[0.14em]">you</span>
          <span className="text-foreground">{Math.round(hud.humanPitchHz)} Hz</span>
          <span className="uppercase tracking-[0.14em]">agent</span>
          <span className="text-foreground">{Math.round(hud.agentPitchHz)} Hz</span>
          {hud.responding && <span className="text-primary">· answering</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="uppercase tracking-[0.14em]">consonance</span>
          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-100"
              style={{ width: `${Math.round(hud.consonance * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Bottom-right: presence + drop-your-own + status */}
      <div className="absolute bottom-5 right-5 z-10 flex flex-col items-end gap-2">
        {!audioReady && phase !== "glfail" && (
          <button
            type="button"
            onClick={resumeAudio}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tap for sound
          </button>
        )}
        <div className="flex w-56 flex-col gap-1.5 rounded-md border border-border bg-background/60 px-4 py-2.5">
          <div className="flex items-center justify-between font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
            <span>agent presence</span>
            <span className="text-foreground">{Math.round(presence * 100)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={presence}
            onChange={(e) => setPresence(parseFloat(e.target.value))}
            aria-label="Agent presence"
            className="h-1.5 w-full cursor-pointer accent-primary"
          />
        </div>
        <label className="min-h-[44px] cursor-pointer rounded-md border border-border bg-background/60 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          Drop your own audio
          <input type="file" accept="audio/*" onChange={onFileInput} className="hidden" />
        </label>
        {dropError && <p className="max-w-xs text-right text-sm text-destructive">{dropError}</p>}
      </div>

      {/* Building overlay */}
      {phase === "building" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            building the atlas — slicing + analyzing grains…
          </p>
        </div>
      )}

      {/* WebGL2 failure — audio still plays */}
      {phase === "glfail" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 p-6 text-center backdrop-blur-sm">
          <div className="max-w-md">
            <p className="text-base text-destructive">
              WebGL2 is unavailable here, so the point cloud can&apos;t render.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              The duet still sounds — the seeded human stand-in is navigating the
              timbre-space and the agent voice is answering it. Drop an audio file to
              hear the duet become your sound.
            </p>
          </div>
        </div>
      )}

      {/* Rebuilding-from-dropped-file overlay */}
      {rebuilding && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            rebuilding the atlas from your sound…
          </p>
        </div>
      )}

      {/* Drag-over hint */}
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center border-2 border-dashed border-primary/60 bg-primary/10 backdrop-blur-sm">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
            drop to rebuild the atlas from your sound
          </p>
        </div>
      )}

      {/* Design notes modal */}
      {notesOpen && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">
              Atlas · Duet — a partner in the timbre-space
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                On load the piece slices an audio buffer into ~46 ms grains and measures
                real spectral descriptors for each — spectral centroid (brightness), RMS
                loudness, a pitch/periodicity estimate by autocorrelation, plus spectral
                flatness and spread. Every grain is projected to a point whose x is its
                brightness and y is its pitch. That descriptor→space map is the shared
                instrument both voices forage.
              </p>
              <p>
                You drive the HUMAN voice (bright halo, panned left) by moving through the
                cloud — the nearest grains are triggered as overlapping Hann windows. A
                self-listening AGENT voice (softer bead + trail, panned right) forages the
                same cloud and decides where to move by three legible rules over a rolling
                memory of your path: <span className="text-foreground">complementarity</span>{" "}
                (it fills the region you are not in),{" "}
                <span className="text-foreground">call-and-response</span> (after a fast
                gesture it echoes a time- and space-shifted version of your path a beat
                later), and <span className="text-foreground">consonance</span> (it steers
                toward a grain whose pitch forms a just interval with the pitch you are
                sounding). The connecting line brightens as the two voices agree.
              </p>
              <p>
                With no input a seeded human stand-in wanders the cloud so the duet is
                already happening; your first move hands the human voice to you (auto →
                you) and the agent keeps answering. The presence slider sets how loud the
                agent is and how far it strays. Drop your own audio to duet inside your own
                recording.
              </p>
              <p>
                After Diemo Schwarz&apos;s CataRT / corpus-based concatenative synthesis
                (IRCAM); the self-listening co-creative agent after MACataRT — &quot;Musical
                Agent Systems: MACAT and MACataRT&quot; (arXiv 2502.00023, 2025); and TENOR
                2023, &quot;Maps as Scores: Timbre-Space Representations.&quot;
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNotesOpen(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
