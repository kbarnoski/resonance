"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 16208 · loomvoice — a live human voice conducts the balance of four of Karel's
// whole piano takes, woven into one cloth of sound.
//
//   "What if your voice were a shuttle on a loom — pitch choosing which take
//    rises to the surface, loudness pulling the weave tight or letting it spread
//    across the room — weaving four whole recordings into one cloth of sound?"
//
//   Four COMPLETE recordings loop simultaneously and forever. The mic is a
//   CONTROL layer only (rule 10): pitch picks the surfaced strand, loudness sets
//   weave-tightness + stereo spread. The only thing you hear is Karel's piano.
//   Mic denied → pointer control + a hands-free auto-demo keep the cloth alive.
//
//   Output is an inline-SVG woven cloth — four polychrome threads that actually
//   interlace over-under a neutral weft. No WebGL, no canvas, no shader, no grain.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  applyWeaveToAudio,
  attachMic,
  computeWeave,
  loadLoom,
  LOOM_TRACKS,
  pitchToSurface,
  readVoice,
  STRAND_COUNT,
  teardownLoom,
  type Control,
  type LoomAudio,
  type MicTap,
} from "./engine";

type Phase = "idle" | "loading" | "running" | "error";
type Mode = "voice" | "pointer" | "demo";

// ── SVG cloth layout (viewBox 0 0 100 132) ──────────────────────────────────────
const VB_W = 100;
const VB_H = 132;
const TOP_Y = 16; // room for labels
const BOT_Y = 126;
const FIELD_H = BOT_Y - TOP_Y;
const NW = 17; // neutral weft lines
const ROW_DY = FIELD_H / (NW - 1);
const WOBBLE = 1.15;
const FIELD_X0 = 8;
const FIELD_X1 = 92;
const SVGNS = "http://www.w3.org/2000/svg";

const threadX = (baseX: number, y: number, phase: number) =>
  baseX + WOBBLE * Math.sin((2 * Math.PI * (y - TOP_Y)) / (2 * ROW_DY) + phase);

export default function LoomVoicePage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [micNotice, setMicNotice] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("demo");
  const [loadedCount, setLoadedCount] = useState(0);
  const [notesOpen, setNotesOpen] = useState(false);
  const [held, setHeld] = useState(false);

  const audioRef = useRef<LoomAudio | null>(null);
  const micRef = useRef<MicTap | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  // live control state, eased toward a target every frame
  const controlRef = useRef<Control>({ surface: 0.5, spread: 0.35 });
  const targetRef = useRef<Control>({ surface: 0.5, spread: 0.35 });
  const modeRef = useRef<Mode>("demo");
  const pointerRef = useRef<{ x: number; y: number; at: number } | null>(null);

  // hold-to-freeze bookkeeping
  const heldRef = useRef<Control | null>(null);
  const holdWinRef = useRef<number[]>([]);
  const holdSinceRef = useRef<number>(0);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // ── teardown (also on unmount) ────────────────────────────────────────────────
  const teardown = useCallback(() => {
    teardownLoom(audioRef.current, micRef.current);
    audioRef.current = null;
    micRef.current = null;
  }, []);
  useEffect(() => teardown, [teardown]);

  // ── Play: load four takes, then try mic; degrade to pointer + auto-demo ────────
  const start = useCallback(async () => {
    if (phase === "loading" || phase === "running") return;
    setPhase("loading");
    setErrorMsg(null);
    setMicNotice(null);

    const audio = await loadLoom();
    if (!audio) {
      setErrorMsg(
        "None of Karel's recordings could be reached right now. Please try again.",
      );
      setPhase("error");
      return;
    }
    audioRef.current = audio;
    setLoadedCount(audio.loadedCount);

    // Try the mic as a control-only layer. If it's refused we fall back cleanly.
    try {
      micRef.current = await attachMic(audio.ctx);
      setMode("voice");
    } catch {
      micRef.current = null;
      setMode("demo");
      setMicNotice(
        "Microphone unavailable — drag across the cloth to be the shuttle, or just watch it weave itself.",
      );
    }

    setPhase("running");
  }, [phase]);

  const releaseHold = useCallback(() => {
    heldRef.current = null;
    holdSinceRef.current = 0;
    holdWinRef.current = [];
    setHeld(false);
  }, []);

  // ── build the SVG cloth + run the animation loop ───────────────────────────────
  useEffect(() => {
    if (phase !== "running") return;
    const stage = stageRef.current;
    if (!stage) return;

    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    // ---- scaffold ----
    const svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("viewBox", `0 0 ${VB_W} ${VB_H}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.style.display = "block";

    const bg = document.createElementNS(SVGNS, "rect");
    bg.setAttribute("x", "0");
    bg.setAttribute("y", "0");
    bg.setAttribute("width", String(VB_W));
    bg.setAttribute("height", String(VB_H));
    bg.setAttribute("fill", "hsl(268 30% 6%)");
    svg.appendChild(bg);

    // neutral weft (the horizontal scaffold the colored threads weave through)
    const weftGroup = document.createElementNS(SVGNS, "g");
    for (let r = 0; r < NW; r++) {
      const y = TOP_Y + r * ROW_DY;
      const line = document.createElementNS(SVGNS, "line");
      line.setAttribute("x1", String(FIELD_X0));
      line.setAttribute("x2", String(FIELD_X1));
      line.setAttribute("y1", String(y));
      line.setAttribute("y2", String(y));
      line.setAttribute("stroke", "hsl(266 16% 46%)");
      line.setAttribute("stroke-width", "0.9");
      line.setAttribute("stroke-linecap", "round");
      line.setAttribute("opacity", "0.42");
      weftGroup.appendChild(line);
    }
    svg.appendChild(weftGroup);

    // per-strand group: the colored thread + weft "caps" that make it dip under
    const strandGroups: SVGGElement[] = [];
    const threadPaths: SVGPathElement[] = [];
    const capsByStrand: SVGRectElement[][] = [];
    const capParity: boolean[][] = [];

    for (let i = 0; i < STRAND_COUNT; i++) {
      const g = document.createElementNS(SVGNS, "g");
      const path = document.createElementNS(SVGNS, "path");
      path.setAttribute("fill", "none");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      g.appendChild(path);

      const caps: SVGRectElement[] = [];
      const parity: boolean[] = [];
      for (let r = 0; r < NW; r++) {
        // basket weave: this strand dips UNDER the weft when (i+r) is even
        const under = (i + r) % 2 === 0;
        parity.push(under);
        const cap = document.createElementNS(SVGNS, "rect");
        cap.setAttribute("fill", "hsl(266 16% 46%)");
        cap.setAttribute("opacity", under ? "0.85" : "0");
        cap.setAttribute("rx", "0.4");
        caps.push(cap);
        g.appendChild(cap);
      }
      svg.appendChild(g);
      strandGroups.push(g);
      threadPaths.push(path);
      capsByStrand.push(caps);
      capParity.push(parity);
    }

    // labels ride the top of each thread, always drawn on top
    const labelGroup = document.createElementNS(SVGNS, "g");
    const labels: SVGTextElement[] = [];
    for (let i = 0; i < STRAND_COUNT; i++) {
      const txt = document.createElementNS(SVGNS, "text");
      txt.setAttribute("y", "9");
      txt.setAttribute("text-anchor", "middle");
      txt.setAttribute("font-size", "3.1");
      txt.setAttribute(
        "font-family",
        "ui-monospace, SFMono-Regular, Menlo, monospace",
      );
      txt.setAttribute("letter-spacing", "0.15");
      txt.textContent = LOOM_TRACKS[i].title;
      labelGroup.appendChild(txt);
      labels.push(txt);
    }
    svg.appendChild(labelGroup);

    stage.appendChild(svg);

    // ---- pointer control ----
    const onPointer = (e: PointerEvent) => {
      const rect = svg.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      pointerRef.current = {
        x: Math.max(0, Math.min(1, nx)),
        y: Math.max(0, Math.min(1, ny)),
        at: performance.now(),
      };
      // pointer overrides voice/demo (unless the weave is being held)
      if (modeRef.current !== "voice") setMode("pointer");
    };
    svg.addEventListener("pointerdown", onPointer);
    svg.addEventListener("pointermove", onPointer);

    // ---- animation loop ----
    let raf = 0;
    const YSTEP = 3; // path sample spacing in viewBox units
    const demoSpeed = prefersReduced ? 0.45 : 1;

    const runFrame = (t: number) => {
      raf = requestAnimationFrame(runFrame);
      const now = t / 1000;

      // 1) decide the control target for this frame
      const audio = audioRef.current;
      const mic = micRef.current;
      const tgt = targetRef.current;
      let activeMode: Mode = "demo";

      const pointerFresh =
        pointerRef.current && performance.now() - pointerRef.current.at < 2600;

      if (mic) {
        activeMode = "voice";
        const v = readVoice(mic);
        tgt.spread = v.level;
        if (v.pitchHz != null) tgt.surface = pitchToSurface(v.pitchHz);
        // else: hold last surface (unvoiced room)
      } else if (pointerFresh && pointerRef.current) {
        activeMode = "pointer";
        tgt.surface = pointerRef.current.x;
        tgt.spread = 1 - pointerRef.current.y; // top = loud/spread, bottom = tight
      } else {
        activeMode = "demo";
        tgt.surface = 0.5 + 0.5 * Math.sin(now * 0.18 * demoSpeed);
        tgt.spread = 0.52 + 0.44 * Math.sin(now * 0.11 * demoSpeed + 1.3);
      }
      if (activeMode !== modeRef.current && activeMode !== "pointer") {
        setMode(activeMode);
      }

      // 2) hold-to-freeze: a steady, sustained voice locks the current balance
      if (activeMode === "voice") {
        const win = holdWinRef.current;
        win.push(tgt.surface);
        if (win.length > 90) win.shift(); // ~1.5 s at 60fps
        const steady =
          win.length >= 80 &&
          Math.max(...win) - Math.min(...win) < 0.05 &&
          tgt.spread > 0.16;
        if (steady && !heldRef.current) {
          if (holdSinceRef.current === 0) holdSinceRef.current = now;
          if (now - holdSinceRef.current > 2) {
            heldRef.current = { surface: tgt.surface, spread: tgt.spread };
            setHeld(true);
          }
        } else if (!steady) {
          holdSinceRef.current = 0;
          if (!heldRef.current) win.length = Math.min(win.length, 90);
        }
      }

      // 3) ease live control toward the target (or the frozen held point)
      const ctrl = controlRef.current;
      const goal = heldRef.current ?? tgt;
      const k = 0.06;
      ctrl.surface += (goal.surface - ctrl.surface) * k;
      ctrl.spread += (goal.spread - ctrl.spread) * k;

      const frame = computeWeave(ctrl);

      // 4) drive Karel's four takes
      if (audio) applyWeaveToAudio(audio, frame);

      // 5) draw the cloth
      for (let i = 0; i < STRAND_COUNT; i++) {
        const baseX = frame.x[i];
        const phase = (i % 2) * Math.PI;
        let d = "";
        for (let y = TOP_Y; y <= BOT_Y + 0.01; y += YSTEP) {
          const yy = Math.min(y, BOT_Y);
          const x = threadX(baseX, yy, phase);
          d += `${d ? "L" : "M"}${x.toFixed(2)} ${yy.toFixed(2)} `;
        }
        const p = threadPaths[i];
        p.setAttribute("d", d);
        const light = 30 + frame.bright[i] * 38;
        p.setAttribute("stroke", `hsl(${LOOM_TRACKS[i].hue} 78% ${light}%)`);
        p.setAttribute("stroke-width", frame.strokeW[i].toFixed(2));
        p.setAttribute("opacity", (0.5 + 0.5 * frame.bright[i]).toFixed(3));

        // caps that make the thread dip under the weft
        const caps = capsByStrand[i];
        const parity = capParity[i];
        const capW = Math.max(3.2, frame.strokeW[i] + 1.6);
        for (let r = 0; r < NW; r++) {
          const cap = caps[r];
          if (!parity[r]) continue;
          const y = TOP_Y + r * ROW_DY;
          const x = threadX(baseX, y, phase);
          cap.setAttribute("x", (x - capW / 2).toFixed(2));
          cap.setAttribute("y", (y - 0.75).toFixed(2));
          cap.setAttribute("width", capW.toFixed(2));
          cap.setAttribute("height", "1.5");
        }

        // label rides the thread top
        const lx = Math.max(FIELD_X0 + 1, Math.min(FIELD_X1 - 1, baseX));
        labels[i].setAttribute("x", lx.toFixed(2));
        labels[i].setAttribute(
          "fill",
          `hsl(${LOOM_TRACKS[i].hue} 70% ${(44 + frame.bright[i] * 30).toFixed(0)}%)`,
        );
        labels[i].setAttribute(
          "opacity",
          (0.4 + 0.6 * frame.bright[i]).toFixed(3),
        );
      }

      // 6) restack: dimmest thread first, surfaced thread on top; labels topmost
      for (const idx of frame.order) svg.appendChild(strandGroups[idx]);
      svg.appendChild(labelGroup);
    };
    raf = requestAnimationFrame(runFrame);

    return () => {
      cancelAnimationFrame(raf);
      svg.removeEventListener("pointerdown", onPointer);
      svg.removeEventListener("pointermove", onPointer);
      if (svg.parentNode) svg.parentNode.removeChild(svg);
    };
  }, [phase]);

  const modeLabel =
    mode === "voice"
      ? "voice · the shuttle"
      : mode === "pointer"
        ? "pointer · the shuttle"
        : "weaving itself";

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      {/* the cloth */}
      {phase === "running" && (
        <div
          ref={stageRef}
          className="absolute inset-0 flex items-center justify-center px-2 py-6 touch-none"
        />
      )}

      {/* idle / loading / error curtain */}
      {phase !== "running" && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="max-w-xl text-center">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">
              loomvoice
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
              Your voice, the shuttle
            </h1>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              Four of Karel&apos;s whole piano takes loop at once as four threads
              of one cloth. Your voice is the shuttle: pitch chooses which take
              rises to the surface, loudness pulls the weave tight or lets it
              spread wide across the stereo field.
            </p>

            {phase === "error" && (
              <p className="mt-6 text-sm text-destructive">{errorMsg}</p>
            )}

            <button
              onClick={start}
              disabled={phase === "loading"}
              className="mt-8 inline-flex min-h-[44px] items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {phase === "loading" ? "Threading the loom…" : "Play the cloth"}
            </button>

            <p className="mt-6 font-mono text-xs leading-relaxed text-muted-foreground/70">
              headphones recommended · the mic only conducts — you only ever hear
              Karel&apos;s piano
            </p>
          </div>
        </div>
      )}

      {/* running HUD */}
      {phase === "running" && (
        <>
          <div className="pointer-events-none absolute left-4 top-4 select-none font-mono text-xs leading-relaxed text-muted-foreground">
            <div className="uppercase tracking-[0.18em] text-foreground">
              {modeLabel}
            </div>
            <div className="text-muted-foreground/60">
              {loadedCount}/{STRAND_COUNT} takes woven
            </div>
            <div className="text-muted-foreground/50">
              pitch → surface · loudness → spread
            </div>
          </div>

          {micNotice && (
            <div className="pointer-events-none absolute bottom-16 left-1/2 w-[min(92vw,460px)] -translate-x-1/2 rounded-md border border-border bg-background/70 p-3 text-center backdrop-blur-md">
              <p className="text-sm text-destructive">{micNotice}</p>
            </div>
          )}

          {held && (
            <div className="absolute bottom-16 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-md border border-border bg-background/70 px-4 py-2 backdrop-blur-md">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
                weave held
              </span>
              <button
                onClick={releaseHold}
                className="min-h-[32px] rounded-md border border-border px-3 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                release
              </button>
            </div>
          )}

          <button
            onClick={() => setNotesOpen(true)}
            className="absolute right-4 top-4 min-h-[36px] rounded-md border border-border bg-background/60 px-3 text-xs text-muted-foreground backdrop-blur-md transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
        </>
      )}

      {/* design notes modal */}
      {notesOpen && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-h-[80dvh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-xl font-semibold tracking-tight">
                loomvoice — design notes
              </h2>
              <button
                onClick={() => setNotesOpen(false)}
                className="min-h-[32px] rounded-md border border-border px-3 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                close
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                One question: <em>what if your voice were a shuttle on a loom</em>{" "}
                — pitch choosing which of Karel&apos;s takes rises to the surface,
                loudness pulling the weave tight or letting it spread across the
                room — weaving four whole recordings into one cloth of sound?
              </p>
              <p>
                Four complete takes — Interplay, Bath, 2019 and Rolling — loop
                simultaneously and forever. None is ever chopped or granulated;
                each is a whole thread. A gain floor keeps every strand faintly
                present, so the cloth is always genuinely polyphonic.
              </p>
              <p>
                Your voice reads on two axes. <strong>Pitch</strong> sets the
                surface position: a low voice surfaces the first strand, a high
                voice the last, continuously between. The surfaced strand rises to
                the top of the cloth — louder, its lowpass thrown open, thick and
                bright — while the others recede, muffled and faint, but never
                silent. <strong>Loudness</strong> sets weave-tightness and stereo
                spread: a whisper collapses the four takes to a tight, centered
                weave; a strong voice fans their stereo panners across the field
                and pulls the threads wide apart on screen.
              </p>
              <p>
                Hold a steady note for a couple of seconds and the balance freezes
                into a saved weave you can return to; release it to pick the
                shuttle back up.
              </p>
              <p>
                <strong>The mic is control only.</strong> It is tapped for
                analysis and stops there — never routed to the speakers. The only
                sound is Karel&apos;s piano, through the shared ear-safety master.
                If the mic is refused, drag across the cloth to be the shuttle, or
                let the idle auto-demo trace its own slow path so the polyphony
                keeps playing hands-free.
              </p>
              <p className="text-muted-foreground/70">
                Extends the lab&apos;s multi-track-polyphony lineage (the
                &ldquo;spheres&rdquo; move — several whole takes held in
                relationship). A deliberate counterpoint to Mermerci et al.,{" "}
                <em>
                  Real-Time Control of a Virtual Orchestra by Recognition of
                  Conducting Gestures
                </em>{" "}
                (arXiv:2604.27957, 30 Apr 2026, KTH / Swedish National Museum of
                Science &amp; Technology), where a vision-tracked visitor conducts
                recorded music but controls only its <em>pace</em>. This is not a
                &ldquo;first&rdquo;; its precise novelty is voice-as-shuttle —
                pitch selects the surfaced strand, loudness controls
                weave-tightness and stereo spread — over a polyphonic braid of
                four whole takes, rendered as interlaced cloth.
              </p>
            </div>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["16208-loomvoice"]} />
    </main>
  );
}
