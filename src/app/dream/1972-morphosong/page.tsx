"use client";

// ════════════════════════════════════════════════════════════════════════════
// 1972 — Morphosong                                    state: psilocybin bloom
//                                                       pole:  INTENSE
//
// THE QUESTION: What if you could HUM a living organism into being — where your
// pitch breeds a different psychedelic Turing-pattern morphology, and the
// pattern you SEE is exactly the shimmer you HEAR?
//
// Mic hum → pitch (autocorrelation) + RMS → feed/kill of a WGSL-COMPUTE
// Gray–Scott reaction-diffusion → log-polar cortical render (form constants) →
// a compute reduction reads the field's spatial statistics back → they re-voice
// a bank of inharmonic partials. What swells on screen swells in your ears.
//
// See README.md / the "Read the design notes" modal.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  WebGpuOrganism,
  CanvasOrganism,
  morphoParams,
  type Organism,
} from "./sim";
import { MorphoVoice, carrierAt } from "./audio";
import { README_TEXT } from "./readme-text";

interface Hud {
  kind: "webgpu" | "canvas2d" | "—";
  source: "carrier" | "mic";
  pitchHz: number;
  pitchNorm: number;
  meanV: number;
  grad: number;
}

function morphName(p: number): string {
  if (p < 0.25) return "maze / stripes";
  if (p < 0.5) return "honeycomb / holes";
  if (p < 0.75) return "coral / worms";
  return "spots / mitosis";
}

export default function MorphosongPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const organismRef = useRef<Organism | null>(null);
  const voiceRef = useRef<MorphoVoice | null>(null);
  const rafRef = useRef<number | null>(null);
  const frameRef = useRef(0);
  const roRef = useRef<ResizeObserver | null>(null);

  const [running, setRunning] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);
  const [noRender, setNoRender] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const [hud, setHud] = useState<Hud>({
    kind: "—",
    source: "carrier",
    pitchHz: 0,
    pitchNorm: 0.5,
    meanV: 0,
    grad: 0,
  });

  // ── the render + coupling loop (runs from mount, audio optional) ────────────
  useEffect(() => {
    let cancelled = false;
    const reduced = prefersReducedMotion();

    (async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      let org: Organism | null = await WebGpuOrganism.create(canvas);
      if (!org) {
        org = CanvasOrganism.create(canvas);
        if (org) setUsingFallback(true);
      }
      if (!org) {
        setNoRender(true);
        return;
      }
      if (cancelled) {
        org.destroy();
        return;
      }
      organismRef.current = org;
      const kind = org.kind;

      const ro = new ResizeObserver(() => org?.resize());
      ro.observe(canvas);
      roRef.current = ro;

      let hudTick = 0;

      const loop = () => {
        rafRef.current = requestAnimationFrame(loop);
        const organism = organismRef.current;
        if (!organism) return;

        const frame = frameRef.current++;
        // deterministic "seconds" from the frame counter — no perf.now/Date in
        // the state path. Reduced motion → a slower clock (less warp drift).
        const timeSec = reduced ? frame / 150 : frame / 60;

        const voice = voiceRef.current
          ? voiceRef.current.analyse(frame)
          : carrierAt(frame);

        organism.step(morphoParams(voice.pitchNorm, voice.rms, timeSec));

        // SEE ≈ HEAR: hand the field's morphology back to the partial bank.
        voiceRef.current?.setMorphology(organism.stats);

        if (frame - hudTick >= 10) {
          hudTick = frame;
          const s = organism.stats;
          setHud({
            kind,
            source: voiceRef.current?.inputMode ?? "carrier",
            pitchHz: voice.pitchHz,
            pitchNorm: voice.pitchNorm,
            meanV: s.meanV,
            grad: s.grad,
          });
        }
      };
      rafRef.current = requestAnimationFrame(loop);
    })();

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      roRef.current?.disconnect();
      roRef.current = null;
      organismRef.current?.destroy();
      organismRef.current = null;
      voiceRef.current?.dispose();
      voiceRef.current = null;
    };
  }, []);

  // ── audio bring-up (must be inside a user gesture) ──────────────────────────
  const ensureVoice = useCallback(async (): Promise<MorphoVoice | null> => {
    if (voiceRef.current) return voiceRef.current;
    let v: MorphoVoice;
    try {
      v = new MorphoVoice();
    } catch {
      setAudioError(true);
      return null;
    }
    try {
      await v.start();
    } catch {
      v.dispose();
      setAudioError(true);
      return null;
    }
    setAudioError(false);
    voiceRef.current = v;
    return v;
  }, []);

  const enableMic = useCallback(async () => {
    const v = await ensureVoice();
    if (!v) return;
    const ok = await v.enableMic();
    setMicDenied(!ok);
    setRunning(true);
  }, [ensureVoice]);

  const humForMe = useCallback(async () => {
    const v = await ensureVoice();
    if (!v) return;
    setRunning(true);
  }, [ensureVoice]);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* the organism renders here (WebGPU, or Canvas2D fallback) */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block h-full w-full"
        aria-hidden
      />

      {/* subtle top gradient so chrome text stays legible over the bloom */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-background/70 to-transparent"
        aria-hidden
      />

      {/* ── idle overlay ───────────────────────────────────────────────────── */}
      {!running && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="max-w-lg rounded-lg border border-border bg-background/70 p-6 text-center backdrop-blur-sm">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              psilocybin bloom · intense
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
              Morphosong
            </h1>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Hum a living organism into being. Your pitch breeds a different
              Turing-pattern morphology — mazes, honeycomb, coral, spots — grown
              live in a WebGPU reaction-diffusion field and warped into psychedelic
              form constants. The pattern you see re-voices the drone you hear.
            </p>
            {noRender && (
              <p className="mt-4 text-base text-destructive">
                Neither WebGPU nor a 2D canvas is available here, so the organism
                cannot render.
              </p>
            )}
            {audioError && (
              <p className="mt-4 text-base text-destructive">
                This browser could not open an audio context — visuals run, but
                there is no sound.
              </p>
            )}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={enableMic}
                className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Enable microphone
              </button>
              <button
                type="button"
                onClick={humForMe}
                className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Hum for me (demo)
              </button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              The field is already alive and breathing — enable the mic to breed it
              with your voice, or let the demo hum for you.
            </p>
          </div>
        </div>
      )}

      {/* ── running chrome ─────────────────────────────────────────────────── */}
      {running && (
        <div className="pointer-events-none absolute left-4 top-4 select-none space-y-1">
          <p className="text-sm text-muted-foreground">
            Substrate:{" "}
            <span className="text-foreground">
              {hud.kind === "webgpu"
                ? "WebGPU compute"
                : hud.kind === "canvas2d"
                  ? "Canvas2D fallback"
                  : "—"}
            </span>
          </p>
          <p className="text-sm text-muted-foreground">
            Voice:{" "}
            <span className="text-foreground">
              {hud.source === "mic" ? "your hum" : "seeded carrier"}
            </span>
            {hud.pitchHz > 0 && (
              <span className="text-muted-foreground">
                {" "}
                · {hud.pitchHz.toFixed(0)} Hz
              </span>
            )}
          </p>
          <p className="text-sm text-muted-foreground">
            Morphology:{" "}
            <span className="text-foreground">{morphName(hud.pitchNorm)}</span>
          </p>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            bloom {(hud.meanV * 100).toFixed(0)}% · edges{" "}
            {(hud.grad * 100).toFixed(0)}%
          </p>
        </div>
      )}

      {/* fallback / mic notices */}
      <div className="absolute right-4 top-4 flex max-w-[16rem] flex-col items-end gap-2 text-right">
        {usingFallback && (
          <p className="text-sm text-destructive">
            WebGPU is unavailable — running the lightweight Canvas2D fallback.
          </p>
        )}
        {micDenied && (
          <p className="text-sm text-destructive">
            No microphone access — the seeded carrier keeps humming for you.
          </p>
        )}
      </div>

      {/* design-notes affordance */}
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="absolute bottom-4 right-4 inline-flex min-h-[44px] items-center justify-center rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {/* ── design-notes modal ─────────────────────────────────────────────── */}
      {showNotes && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80dvh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-xl font-semibold tracking-tight">
                Design notes
              </h2>
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {README_TEXT}
            </p>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1972-morphosong"]} />
    </main>
  );
}
