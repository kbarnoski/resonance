"use client";

// ════════════════════════════════════════════════════════════════════════════
// MOSAIC (3808) — "What if a recording could RESYNTHESIZE another sound — you
// feed it a target (your voice, or a dropped second recording) and it rebuilds
// that target's melody/phrase out of the FIRST recording's OWN grains, kept
// temporally coherent so it rebuilds the *phrase*, not just a texture wash?"
//
// A v2 / deepening of 3608-atlas. Atlas turns a recording into a navigable 2-D
// timbre-space you PLAY with a cursor — but its grain choice is timbre-nearest,
// so playback is texture, not the original phrase. Mosaic fixes exactly that: a
// TARGET drives the choice, and a tunable TRANSITION PRIOR ("coherence") biases
// each pick toward the grain that sequentially follows the last — audio-guided
// concatenative musaicing (The Concatenator, arXiv 2411.04366, 2024; and Zils &
// Pachet, "Musical Mosaicing", DAFx 2001). Slide coherence from 0→1 to move the
// output from scattered texture to phrase-preserving.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildCorpus,
  type Corpus,
  downmixToMono,
  renderAutoTarget,
  renderDefaultCorpus,
} from "./mosaic-corpus";
import { analyzeTargetClip, MicTarget, type TargetClip, type TargetFrame } from "./mosaic-target";
import { MosaicEngine } from "./mosaic-audio";
import { MosaicRenderer } from "./mosaic-gl";

type Phase = "building" | "ready" | "glfail";
type Source = "auto" | "mic" | "file";

interface Hud {
  active: number;
  centroidHz: number;
  pitchHz: number;
  jump: number;
}

export default function MosaicPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [phase, setPhase] = useState<Phase>("building");
  const [source, setSource] = useState<Source>("auto");
  const [audioReady, setAudioReady] = useState(false);
  const [coherence, setCoherence] = useState(0.6);
  const [micState, setMicState] = useState<"off" | "on" | "denied">("off");
  const [targetLabel, setTargetLabel] = useState("Auto melody (seeded)");
  const [dropError, setDropError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [hud, setHud] = useState<Hud>({ active: 0, centroidHz: 0, pitchHz: 0, jump: 0 });

  const ctxRef = useRef<AudioContext | null>(null);
  const engineRef = useRef<MosaicEngine | null>(null);
  const rendererRef = useRef<MosaicRenderer | null>(null);
  const corpusRef = useRef<Corpus | null>(null);
  const autoClipRef = useRef<TargetClip | null>(null);
  const fileClipRef = useRef<TargetClip | null>(null);
  const micTargetRef = useRef<MicTarget | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const sourceRef = useRef<Source>("auto");
  const coherenceRef = useRef(0.6);
  const rafRef = useRef(0);
  const startMsRef = useRef(0);
  const targetStartMsRef = useRef(0);
  const lastHudRef = useRef(0);

  // ── Lazily create the live AudioContext inside a user gesture. ───────────────
  const ensureAudio = useCallback(() => {
    if (!ctxRef.current) {
      try {
        const AC: typeof AudioContext =
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- vendor-prefixed fallback for older Safari
          window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AC();
        ctxRef.current = ctx;
        engineRef.current?.attachAudio(ctx);
      } catch {
        ctxRef.current = null;
        return null;
      }
    }
    const ctx = ctxRef.current;
    if (ctx && ctx.state === "suspended") {
      void ctx.resume().then(() => setAudioReady(ctx.state === "running"));
    } else if (ctx) {
      setAudioReady(ctx.state === "running");
    }
    return ctx;
  }, []);

  // ── Mount: renderer, offline corpus + auto target, matcher, render loop. ─────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = MosaicRenderer.create(canvas);
    if (!renderer) {
      setPhase("glfail");
    } else {
      rendererRef.current = renderer;
      renderer.resize();
    }

    const engine = new MosaicEngine();
    engineRef.current = engine;
    engine.setCoherence(coherenceRef.current);

    startMsRef.current = performance.now();
    targetStartMsRef.current = performance.now();
    let disposed = false;

    // Build the default corpus (the instrument) + seeded auto target offline.
    const sampleRate = 44100;
    Promise.all([renderDefaultCorpus(sampleRate), renderAutoTarget(sampleRate)])
      .then(([corpusBuf, targetBuf]) => {
        if (disposed) return;
        const corpus = buildCorpus(corpusBuf, downmixToMono(corpusBuf), sampleRate, "Generated bell/drone bed");
        corpusRef.current = corpus;
        engine.setCorpus(corpus);
        rendererRef.current?.setCorpus(corpus.positions, corpus.colorT, corpus.loud, corpus.n);
        autoClipRef.current = analyzeTargetClip(
          downmixToMono(targetBuf),
          sampleRate,
          corpus.norm,
          corpus.hopSec,
          "Auto melody (seeded)",
        );
        setPhase((p) => (p === "glfail" ? p : "ready"));
      })
      .catch(() => {
        if (!disposed) setPhase((p) => (p === "glfail" ? p : "ready"));
      });

    const onResize = () => rendererRef.current?.resize();
    window.addEventListener("resize", onResize);

    const loop = () => {
      const nowMs = performance.now();
      const tSec = (nowMs - startMsRef.current) / 1000;
      const eng = engineRef.current;
      const corpus = corpusRef.current;

      if (eng && corpus) {
        eng.setCoherence(coherenceRef.current);

        // Resolve the current target frame from the active source.
        let frame: TargetFrame | null = null;
        const mode = sourceRef.current;
        if (mode === "mic" && micTargetRef.current) {
          frame = micTargetRef.current.frame(corpus.norm);
        } else {
          const clip = mode === "file" ? fileClipRef.current : autoClipRef.current;
          if (clip && clip.frames.length > 0) {
            const idx =
              Math.floor((nowMs - targetStartMsRef.current) / 1000 / clip.hopSec) %
              clip.frames.length;
            frame = clip.frames[idx < 0 ? 0 : idx];
          }
        }
        eng.setTarget(frame);
        eng.tick(nowMs);

        // Feed newly-chosen grains into the visual trail.
        const chosen = eng.drainPending();
        const r = rendererRef.current;
        if (r) {
          for (const gi of chosen) {
            r.pushTrail(corpus.positions[gi * 2], corpus.positions[gi * 2 + 1], corpus.colorT[gi]);
          }
        }

        const playhead = eng.chosenPos();
        const targetPos = frame ? frame.pos : ([0, 0] as [number, number]);
        const h = eng.hud();
        rendererRef.current?.render(playhead, targetPos, h.active, tSec);

        if (nowMs - lastHudRef.current > 120) {
          lastHudRef.current = nowMs;
          setHud({ active: h.active, centroidHz: h.centroidHz, pitchHz: h.pitchHz, jump: h.jump });
        }
      } else {
        rendererRef.current?.render([0, 0], [0, 0], 0, tSec);
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      engineRef.current?.dispose();
      rendererRef.current?.dispose();
      micNodeRef.current?.disconnect();
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") void ctx.close();
      ctxRef.current = null;
      engineRef.current = null;
      rendererRef.current = null;
      micTargetRef.current = null;
      micStreamRef.current = null;
      micNodeRef.current = null;
    };
    // Mount-only: refs carry all mutable state; coherence is mirrored via ref.
  }, []);

  // ── Coherence control (slider + ←/→). ────────────────────────────────────────
  const applyCoherence = useCallback((v: number) => {
    const c = Math.max(0, Math.min(1, v));
    coherenceRef.current = c;
    setCoherence(c);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        applyCoherence(coherenceRef.current + 0.05);
      } else if (e.key === "ArrowLeft") {
        applyCoherence(coherenceRef.current - 0.05);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [applyCoherence]);

  // ── Use your voice (mic). ────────────────────────────────────────────────────
  const enableMic = useCallback(async () => {
    const ctx = ensureAudio();
    if (!ctx) {
      setMicState("denied");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
      });
      micStreamRef.current = stream;
      const srcNode = ctx.createMediaStreamSource(stream);
      micNodeRef.current = srcNode;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0;
      srcNode.connect(analyser); // read-only — NOT connected to destination
      micTargetRef.current = new MicTarget(analyser, ctx.sampleRate);
      setMicState("on");
      setTargetLabel("Your voice (mic)");
      sourceRef.current = "mic";
      setSource("mic");
    } catch {
      setMicState("denied");
    }
  }, [ensureAudio]);

  // ── Drop a second recording as the target. ───────────────────────────────────
  const decodeTarget = useCallback(async (file: File) => {
    setDropError(null);
    const corpus = corpusRef.current;
    if (!corpus) return;
    // Decode with an offline context so a file can be loaded before audio is
    // unlocked; a live ctx is only needed to hear the result.
    let ctx = ctxRef.current;
    let temporary = false;
    if (!ctx) {
      try {
        const AC: typeof AudioContext =
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- vendor-prefixed fallback for older Safari
          window.AudioContext || (window as any).webkitAudioContext;
        ctx = new AC();
        temporary = true;
      } catch {
        setDropError("Audio engine unavailable — cannot decode a file here.");
        return;
      }
    }
    try {
      const arr = await file.arrayBuffer();
      const buffer = await ctx.decodeAudioData(arr.slice(0));
      setRebuilding(true);
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      fileClipRef.current = analyzeTargetClip(
        downmixToMono(buffer),
        buffer.sampleRate,
        corpus.norm,
        corpus.hopSec,
        file.name,
      );
      targetStartMsRef.current = performance.now();
      sourceRef.current = "file";
      setSource("file");
      setTargetLabel(file.name);
    } catch {
      setDropError(`Could not decode "${file.name}". Keeping the current target.`);
    } finally {
      setRebuilding(false);
      if (temporary && ctx && ctx !== ctxRef.current && ctx.state !== "closed") void ctx.close();
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void decodeTarget(file);
    },
    [decodeTarget],
  );

  const onFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void decodeTarget(file);
      e.target.value = "";
    },
    [decodeTarget],
  );

  const control: "auto" | "you" = source === "auto" ? "auto" : "you";

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
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Title + one-line description */}
      <div className="pointer-events-none absolute left-0 top-0 z-10 flex flex-col gap-1 p-5">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Audio-guided concatenative musaicing
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Mosaic</h1>
        <p className="max-w-sm text-base text-muted-foreground">
          One recording sings back another. Feed it a target and it rebuilds that
          melody out of its own grains — coherently enough to trace the phrase.
        </p>
      </div>

      {/* AUTO → YOU badge */}
      <div className="pointer-events-none absolute right-5 top-20 z-10 flex items-center gap-2 sm:top-5 sm:right-44">
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
          <span className="text-foreground">{corpusRef.current?.n ?? 0} grains</span>
          <span className="max-w-[36vw] truncate">· {corpusRef.current?.label ?? "…"}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="uppercase tracking-[0.14em]">target</span>
          <span className="max-w-[36vw] truncate text-foreground">{targetLabel}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="uppercase tracking-[0.14em]">grain</span>
          <span className="text-foreground">{Math.round(hud.pitchHz)} Hz</span>
          <span>jump {hud.jump}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="uppercase tracking-[0.14em]">voice</span>
          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-100"
              style={{ width: `${Math.round(hud.active * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Coherence control */}
      <div className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1.5">
        <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
          <span>texture</span>
          <span className="text-primary">coherence {coherence.toFixed(2)}</span>
          <span>phrase</span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={coherence}
          onChange={(e) => applyCoherence(parseFloat(e.target.value))}
          aria-label="coherence — transition-prior strength"
          className="h-1.5 w-64 cursor-pointer appearance-none rounded-full bg-muted accent-primary"
        />
      </div>

      {/* Bottom-right: actions + status */}
      <div className="absolute bottom-5 right-5 z-10 flex flex-col items-end gap-2">
        {!audioReady && phase !== "glfail" && (
          <button
            type="button"
            onClick={ensureAudio}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tap for sound
          </button>
        )}
        <button
          type="button"
          onClick={enableMic}
          className={`min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm transition-colors hover:bg-accent hover:text-foreground ${
            micState === "on" ? "text-primary" : "text-muted-foreground"
          }`}
        >
          {micState === "on" ? "Mic live" : "Use your voice (mic)"}
        </button>
        <label className="min-h-[44px] cursor-pointer rounded-md border border-border bg-background/60 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          Drop a recording
          <input type="file" accept="audio/*" onChange={onFileInput} className="hidden" />
        </label>
        {micState === "denied" && (
          <p className="max-w-xs text-right text-sm text-destructive">
            Mic access was denied — the auto target keeps the mosaic running.
          </p>
        )}
        {dropError && <p className="max-w-xs text-right text-sm text-destructive">{dropError}</p>}
      </div>

      {/* Building overlay */}
      {phase === "building" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            analyzing the corpus — slicing + measuring grains…
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
              The mosaic still sounds — the seeded auto target keeps driving the
              matcher and triggering corpus grains. Tap for sound to hear it.
            </p>
          </div>
        </div>
      )}

      {/* Rebuilding-from-dropped-file overlay */}
      {rebuilding && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            analyzing your recording as the target…
          </p>
        </div>
      )}

      {/* Drag-over hint */}
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center border-2 border-dashed border-primary/60 bg-primary/10 backdrop-blur-sm">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
            drop a recording — the corpus will sing its melody
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
              Mosaic — a recording that sings another sound
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                On load the piece slices a corpus recording (the “instrument”) into
                ~46 ms grains and measures real spectral descriptors for each —
                spectral centroid (brightness), a pitch/periodicity estimate,
                flatness, spread and loudness. Each grain becomes a point in a 2-D
                timbre-space (x = brightness, y = pitch) and a normalized feature
                vector.
              </p>
              <p>
                A <span className="text-foreground">target</span> — the seeded auto
                melody, your voice, or a dropped recording — is windowed into frames
                and given the very same descriptors. For each target frame the
                matcher finds the corpus grain that best reconstructs it, but biases
                the choice toward the grain that <span className="text-foreground">
                sequentially follows</span> the last one played. That transition
                prior is the load-bearing idea: with coherence at 0 you get
                nearest-timbre dust (Atlas-style texture); push it toward 1 and
                playback marches through the corpus in order, rebuilding the
                <span className="text-foreground"> phrase</span>.
              </p>
              <p>
                The bright playhead is the grain sounding now; its comet trail is the
                path the phrase is carving; the cool ring is where the target
                “wants” to be. When coherence pulls the playhead off that ring, you
                are watching continuity win over timbre.
              </p>
              <p>
                After Tralie, Kitchen &amp; Tralie, “The Concatenator: A Bayesian
                Approach to Real Time Concatenative Musaicing” (arXiv:2411.04366,
                2024) — corpus indices as hidden states, target as observation, a
                tunable transition prior — and Zils &amp; Pachet, “Musical
                Mosaicing” (DAFx 2001). It deepens 3608-atlas, whose grain choice was
                timbre-nearest and therefore texture, not phrase.
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
