"use client";

import { useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { TollEngine, type Snapshot } from "./engine";

/**
 * 1656 · the toll — a piece you can only hear while you pay the price of
 * attention.
 *
 * A long-form generative score advances ONLY while you hold a single sustained
 * gesture (spacebar or pointer). Holding is the toll: a small, real, boring
 * cost of continuous attention. Release and the sound dissolves to silence and
 * the screen prints, receipt-style, exactly what you let go of. Held long
 * enough, the piece reaches a real tonic homecoming that almost no one hears.
 *
 * The visual is austere typography — type on a dark field, reacting to the
 * audio/attention state. No canvas, no WebGL, no particles.
 *
 * A deterministic "ghost hand" takes the toll if no human does within ~3s, so
 * the piece demonstrates its own mechanic unattended, then yields the instant a
 * real gesture arrives.
 */

// deterministic ghost schedule (seconds). Holds and releases on a fixed script
// — never random — so the unattended demo audibly climbs, decays, and prints.
const GHOST_SCRIPT: Array<{ held: boolean; dur: number }> = [
  { held: true, dur: 18 },
  { held: false, dur: 4 },
  { held: true, dur: 30 },
  { held: false, dur: 5 },
  { held: true, dur: 22 },
  { held: false, dur: 6 },
  { held: true, dur: 40 },
  { held: false, dur: 5 },
];
const GHOST_GRACE = 3; // seconds to wait for a human before the ghost begins

const ordinal = (n: number): string =>
  ["a single held tone", "first", "second", "third", "fourth", "fifth"][n] ?? `${n}th`;

export default function TollPage() {
  const [ready, setReady] = useState(false); // audio confirmed running
  const [needsBegin, setNeedsBegin] = useState(false); // autoplay blocked
  const [stageLabel, setStageLabel] = useState("a single held tone");
  const [receipts, setReceipts] = useState<string[]>([]);
  const [resolvedLine, setResolvedLine] = useState<string | null>(null);
  const [hasHuman, setHasHuman] = useState(false);
  const [ghostHolding, setGhostHolding] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // per-frame imperative targets (avoid re-rendering 60x/sec)
  const heroRef = useRef<HTMLHeadingElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const readoutRef = useRef<HTMLSpanElement | null>(null);
  const aheadRef = useRef<HTMLSpanElement | null>(null);
  // ref mirror so the RAF closure can dedupe ghost-badge state updates
  const ghostHoldingRef = useRef(false);

  useEffect(() => {
    let ctx: AudioContext | null = null;
    let engine: TollEngine | null = null;
    let raf = 0;
    let disposed = false;

    // ---- human vs ghost ownership of the toll ----------------------------
    const human = { engaged: false, held: false };
    const ghost = { armAt: 0, phaseStart: 0, index: 0, started: false };
    let lastReceiptId = 0;
    let lastStageIndex = -1;
    let lastResolved = false;
    let liveBegun = false;

    const AudioCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtor) {
      setNeedsBegin(true);
      return;
    }
    ctx = new AudioCtor();
    engine = new TollEngine(ctx);
    // Try to start unattended; if the browser blocks autoplay we surface Begin.
    ctx.resume().catch(() => {
      /* will retry on the Begin gesture */
    });

    const engageHuman = () => {
      if (!human.engaged) {
        human.engaged = true;
        setHasHuman(true);
        setGhostHolding(false);
      }
    };

    const setHumanHeld = (held: boolean) => {
      engageHuman();
      human.held = held;
    };

    // ---- keyboard: spacebar is the toll ----------------------------------
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault(); // never scroll the page
        if (e.repeat) return;
        setHumanHeld(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        setHumanHeld(false);
      }
    };

    // ---- pointer: press-and-hold anywhere on the field -------------------
    const onPointerDown = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && el.closest("button")) return; // let chrome buttons be buttons
      setHumanHeld(true);
    };
    const onPointerUp = () => {
      if (human.engaged) human.held = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    const frame = () => {
      if (disposed || !ctx || !engine) return;
      raf = requestAnimationFrame(frame);

      const running = ctx.state === "running";
      if (!running) {
        setNeedsBegin(true);
        return; // AudioContext.currentTime does not advance while suspended
      }
      if (!liveBegun) {
        liveBegun = true;
        engine.begin();
        setNeedsBegin(false);
        setReady(true);
        ghost.armAt = ctx.currentTime + GHOST_GRACE;
      }

      const now = ctx.currentTime;

      // ---- decide who is paying the toll this frame ----------------------
      let held: boolean;
      if (human.engaged) {
        held = human.held;
      } else if (now >= ghost.armAt) {
        if (!ghost.started) {
          ghost.started = true;
          ghost.phaseStart = now;
          ghost.index = 0;
        }
        const phase = GHOST_SCRIPT[ghost.index];
        if (now - ghost.phaseStart >= phase.dur) {
          ghost.index = (ghost.index + 1) % GHOST_SCRIPT.length;
          ghost.phaseStart = now;
        }
        held = GHOST_SCRIPT[ghost.index].held;
        if (held !== ghostHoldingRef.current) {
          ghostHoldingRef.current = held;
          setGhostHolding(held);
        }
      } else {
        held = false; // grace window: waiting for a human
      }

      engine.setHeld(held);
      const s = engine.tick();
      renderFrame(s);
    };

    const renderFrame = (s: Snapshot) => {
      // hero: opacity + tracking are the attention meter made typographic —
      // loose and faint when neglected, tight and present when paid for.
      if (heroRef.current) {
        const base = 0.32 + s.meter * 0.68;
        const op = s.held ? base : base * 0.55;
        heroRef.current.style.opacity = op.toFixed(3);
        heroRef.current.style.letterSpacing = `${((1 - s.meter) * 0.05).toFixed(3)}em`;
        heroRef.current.style.fontWeight = `${Math.round(400 + s.meter * 300)}`;
      }
      if (barRef.current) {
        barRef.current.style.width = `${(s.meter * 100).toFixed(2)}%`;
        barRef.current.style.opacity = s.held ? "1" : "0.5";
      }
      if (readoutRef.current) {
        readoutRef.current.textContent = `${s.progress.toFixed(0)}s paid · ${(
          s.meter * 100
        ).toFixed(0)}%${s.held ? "" : "  (eroding)"}`;
      }
      if (aheadRef.current) {
        aheadRef.current.textContent =
          s.nextStageLabel && s.secondsToNext !== null
            ? `${ordinal(s.stageIndex + 1)} movement — "${s.nextStageLabel}" — ${Math.round(
                s.secondsToNext
              )}s of attention away`
            : "you are home. the piece is complete.";
      }

      // low-frequency React updates: only on genuine change
      if (s.stageIndex !== lastStageIndex) {
        lastStageIndex = s.stageIndex;
        setStageLabel(s.stageLabel);
      }
      if (s.receiptId !== lastReceiptId && s.receiptText) {
        lastReceiptId = s.receiptId;
        const line = s.receiptText;
        setReceipts((prev) => [...prev.slice(-11), line]);
      }
      if (s.resolved !== lastResolved) {
        lastResolved = s.resolved;
        setResolvedLine(s.resolvedLine);
      }
    };

    raf = requestAnimationFrame(frame);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      if (engine) engine.dispose();
      if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});
    };
    // run-once setup; all mutable state lives in refs/closures above
  }, []);

  const beginAudio = () => {
    // a guaranteed user gesture — resumes a blocked AudioContext
    const w = window as unknown as {
      __resonanceAudioCleanup?: { contexts: Set<AudioContext> };
    };
    const set = w.__resonanceAudioCleanup?.contexts;
    if (set) for (const c of set) c.resume().catch(() => {});
    setNeedsBegin(false);
  };

  return (
    <div className="relative flex min-h-[calc(100vh-3rem)] w-full flex-col items-center justify-center overflow-hidden bg-background px-6 py-16 text-foreground select-none touch-none">
      {/* press-and-hold anywhere (except chrome buttons) pays the toll —
          wired via window pointer listeners in the effect above. */}
      {/* the badge: who holds the toll */}
      <div className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2">
        <span
          className={`font-mono text-[11px] uppercase tracking-[0.2em] ${
            hasHuman ? "text-primary" : "text-muted-foreground/70"
          }`}
        >
          {hasHuman
            ? "you have the toll"
            : ready
            ? ghostHolding
              ? "ghost is holding — press space to take over"
              : "ghost let go — press space to take over"
            : "waiting for sound"}
        </span>
      </div>

      {/* the hero: a single line of large type that IS the current state */}
      <div className="flex w-full max-w-2xl flex-col items-center gap-8 text-center">
        <h1
          ref={heroRef}
          className="text-3xl font-semibold tracking-tight text-foreground transition-[opacity,letter-spacing,font-weight] duration-500 sm:text-4xl"
          style={{ opacity: 0.32 }}
        >
          {stageLabel}
        </h1>

        {/* the meter: a thin bar. violet is the only accent. */}
        <div className="h-px w-full max-w-md overflow-hidden bg-border">
          <div
            ref={barRef}
            className="h-full bg-primary transition-[opacity] duration-500"
            style={{ width: "0%" }}
          />
        </div>

        <div className="flex flex-col items-center gap-1 font-mono text-[11px] text-muted-foreground">
          <span ref={readoutRef}>0s paid · 0%</span>
          <span ref={aheadRef} className="text-muted-foreground/70">
            the piece is waiting.
          </span>
        </div>

        <p className="max-w-md text-base leading-relaxed text-muted-foreground">
          Hold the spacebar — or press and hold this field — to pay attention.
          The music only advances while you hold. Let go and it dissolves. Almost
          no one holds long enough to hear the end.
        </p>

        {resolvedLine ? (
          <p className="max-w-md text-base font-medium leading-relaxed text-primary">
            {resolvedLine}
          </p>
        ) : null}
      </div>

      {/* the receipt: what you let go, accumulating quietly */}
      {receipts.length > 0 ? (
        <div className="pointer-events-none absolute bottom-16 left-1/2 w-full max-w-md -translate-x-1/2 px-6">
          <div className="flex flex-col gap-1 font-mono text-[11px] leading-relaxed text-muted-foreground/60">
            <span className="text-muted-foreground/40">— what you let go —</span>
            {receipts.map((r, i) => (
              <span
                key={`${i}-${r.slice(0, 8)}`}
                className={i === receipts.length - 1 ? "text-muted-foreground" : ""}
              >
                {r}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* Begin — only if the browser blocked unattended autoplay */}
      {needsBegin ? (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-background/90 backdrop-blur-sm">
          <p className="max-w-sm text-center text-base text-muted-foreground">
            This piece plays itself, but your browser needs one tap before it can
            make sound.
          </p>
          <button
            onClick={beginAudio}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Begin
          </button>
        </div>
      ) : null}

      {/* Design notes affordance */}
      <button
        onClick={() => setShowNotes((v) => !v)}
        className="absolute bottom-6 right-6 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 transition-colors hover:text-foreground"
      >
        {showNotes ? "close" : "design notes"}
      </button>
      {showNotes ? (
        <div className="absolute bottom-16 right-6 z-30 max-w-sm rounded-md border border-border bg-popover/95 p-4 text-sm leading-relaxed text-muted-foreground shadow-lg backdrop-blur">
          <p className="mb-2 font-medium text-foreground">the toll</p>
          <p className="mb-2">
            A long-form generative score that advances only while you hold a
            single gesture — the toll of sustained attention. Release and the
            sound dissolves; your earned progress erodes slowly, so a fickle
            listener slides backward instead of resetting.
          </p>
          <p className="mb-2">
            A real motif returns transformed across six named movements: it
            enters, is answered a fifth up, gains a countermelody, climbs, and
            finally comes home to the tonic — a resolution almost no one reaches.
          </p>
          <p>
            After John Cage&apos;s <em>4′33″</em>, Pauline Oliveros&apos;{" "}
            <em>Deep Listening</em>, and Jenny Odell&apos;s{" "}
            <em>How to Do Nothing</em>. A ghost hand demonstrates the mechanic if
            no one holds.
          </p>
        </div>
      ) : null}

      <PrototypeNav slugs={["1656-the-toll"]} />
    </div>
  );
}
