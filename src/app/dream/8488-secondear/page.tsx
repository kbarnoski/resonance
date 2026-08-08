"use client";

// 8488-secondear — "Second Ear".
// The machine is the SECOND taste in the room: a co-composer that never asks you
// to tune anything. It PROPOSES a 2-bar phrase; you give one bit — Keep or Pass —
// and from that stream it silently infers YOUR ear (an online logistic taste
// model, no ML lib) and composes toward it. Aesthetic selection, inverted.
// A seeded synthetic listener keeps the map alive on a muted phone; the moment
// you make a real Keep/Pass it hands over. See README / design notes for the
// TuneJury (arXiv:2606.21670) reference and the full mechanism.

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { README } from "./readme-text";
import { makeCandidates, mulberry32, type Phrase } from "./compose";
import {
  AXIS_X,
  AXIS_Y,
  bestCandidate,
  extractFeatures,
  learn,
  makeModel,
  makeSyntheticListener,
  predict,
  type TasteModel,
  type SyntheticListener,
} from "./taste";
import { SecondEarAudio } from "./audio";
import { drawScene, type Glyph, type Scene } from "./draw";

const BOLD_EVERY = 4;
const BPM = 132;
const GLYPH_CAP = 60;
const WINDOW_CAP = 16;
const TRAIL_CAP = 18;

interface Current {
  phrase: Phrase;
  feats: number[];
  glyph: Glyph;
}

interface Loop {
  model: TasteModel;
  rng: () => number;
  synth: SyntheticListener;
  glyphs: Glyph[];
  trail: { x: number; y: number }[];
  window: boolean[];
  current: Current | null;
  awaiting: boolean;
  mode: "demo" | "human";
  nextProposeAt: number;
  autoDecideAt: number;
  keepsSinceBold: number;
  pendingBold: boolean;
  phaseStart: number;
  reduced: boolean;
  knowsShown: number;
}

export default function SecondEarPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  // dispatcher bridge: React handlers → the engine closure (set inside the effect)
  const dispatchRef = useRef<((kind: "keep" | "pass" | "skip") => void) | null>(null);

  const [started, setStarted] = useState(false);
  const [audioMsg, setAudioMsg] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [hud, setHud] = useState<{
    knows: number | null;
    samples: number;
    label: string;
  }>({ knows: null, samples: 0, label: "listening…" });

  // ── main engine (client-only, alive before any interaction) ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext("2d");
    if (!g) {
      setAudioMsg("Canvas2D is unavailable in this browser.");
      return;
    }

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const rng = mulberry32(0x5eed1a);
    const L: Loop = {
      model: makeModel(),
      rng,
      synth: makeSyntheticListener(mulberry32(0x2a17)),
      glyphs: [],
      trail: [],
      window: [],
      current: null,
      awaiting: false,
      mode: "demo",
      nextProposeAt: 0,
      autoDecideAt: 0,
      keepsSinceBold: 0,
      pendingBold: false,
      phaseStart: 0,
      reduced,
      knowsShown: 50,
    };

    const audio = new SecondEarAudio();

    let dpr = 1;
    let W = 0;
    let H = 0;
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = canvas.clientWidth || window.innerWidth;
      H = canvas.clientHeight || window.innerHeight;
      canvas.width = Math.max(1, Math.round(W * dpr));
      canvas.height = Math.max(1, Math.round(H * dpr));
    };
    resize();
    window.addEventListener("resize", resize);

    const trim = () => {
      while (L.glyphs.length > GLYPH_CAP) {
        const i = L.glyphs.findIndex((gl) => gl.state !== "current");
        if (i === -1) break;
        L.glyphs.splice(i, 1);
      }
    };

    const propose = (bold: boolean, now: number) => {
      const steps = bold ? 32 : 16;
      const n = bold ? 40 : 24;
      const cands = makeCandidates(L.rng, n, steps, bold);
      const feats = cands.map(extractFeatures);
      const idx = bestCandidate(L.model, feats);
      const f = feats[idx];
      const glyph: Glyph = {
        x: f[AXIS_X],
        y: f[AXIS_Y],
        state: "current",
        bold,
        age: 0,
      };
      L.glyphs.push(glyph);
      trim();
      L.current = { phrase: cands[idx], feats: f, glyph };
      L.awaiting = true;
      L.phaseStart = now;
      if (audio.ok) audio.playPhrase(cands[idx], BPM);
      if (L.mode === "demo") {
        L.autoDecideAt = now + (L.reduced ? 1150 : 680);
      }
    };

    const resolve = (keep: boolean, now: number) => {
      const c = L.current;
      if (!c) return;
      const p = predict(L.model, c.feats);
      const correct = (p >= 0.5) === keep;
      L.window.push(correct);
      if (L.window.length > WINDOW_CAP) L.window.shift();
      learn(L.model, c.feats, keep ? 1 : 0);
      c.glyph.state = keep ? "kept" : "passed";
      c.glyph.age = 0;
      L.trail.push({ x: c.glyph.x, y: c.glyph.y });
      if (L.trail.length > TRAIL_CAP) L.trail.shift();
      if (keep) {
        if (c.glyph.bold) L.keepsSinceBold = 0;
        else {
          L.keepsSinceBold++;
          if (L.keepsSinceBold >= BOLD_EVERY) {
            L.pendingBold = true;
            L.keepsSinceBold = 0;
          }
        }
      }
      L.current = null;
      L.awaiting = false;
      L.nextProposeAt = now + (L.mode === "demo" ? 230 : 340);
    };

    const skip = (now: number) => {
      const c = L.current;
      if (c) {
        c.glyph.state = "passed";
        c.glyph.age = 0;
        L.current = null;
        L.awaiting = false;
      }
      L.nextProposeAt = now;
    };

    // expose interaction into the closure via a ref-mounted dispatcher
    dispatchRef.current = (kind: "keep" | "pass" | "skip") => {
      const now = performance.now();
      if (L.mode === "demo") {
        L.mode = "human";
        void audio.ensure().then((okAudio) => {
          if (!okAudio) setAudioMsg("Audio could not start — the map keeps learning silently.");
        });
        setStarted(true);
      }
      if (kind === "skip") {
        skip(now);
        return;
      }
      if (L.awaiting) resolve(kind === "keep", now);
    };

    let hudAt = 0;
    const frame = (now: number) => {
      rafRef.current = requestAnimationFrame(frame);
      if (L.nextProposeAt === 0) L.nextProposeAt = now + 400;

      for (const gl of L.glyphs) gl.age++;

      if (L.awaiting) {
        if (L.mode === "demo" && now >= L.autoDecideAt && L.current) {
          resolve(L.synth.decide(L.current.feats), now);
        }
      } else if (now >= L.nextProposeAt) {
        const bold = L.pendingBold;
        L.pendingBold = false;
        propose(bold, now);
      }

      // knows-your-ear meter (windowed accuracy), eased for readability
      const target =
        L.window.length >= 3
          ? (L.window.reduce((a, b) => a + (b ? 1 : 0), 0) / L.window.length) * 100
          : 50;
      L.knowsShown += (target - L.knowsShown) * (L.reduced ? 0.05 : 0.12);

      const period = L.reduced ? 1600 : 900;
      const phase = ((now - L.phaseStart) / period) % 1;
      const scene: Scene = {
        glyphs: L.glyphs,
        trail: L.trail,
        model: L.model,
        phase,
        reduced: L.reduced,
      };
      drawScene(g, W, H, dpr, scene);

      if (now - hudAt > 180) {
        hudAt = now;
        setHud({
          knows: L.window.length >= 3 ? Math.round(L.knowsShown) : null,
          samples: L.model.count,
          label:
            L.mode === "demo"
              ? "self-demo · learning a synthetic ear"
              : "your ear · Keep or Pass",
        });
      }
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      dispatchRef.current = null;
      audio.close();
    };
  }, []);

  const dispatch = useCallback((kind: "keep" | "pass" | "skip") => {
    dispatchRef.current?.(kind);
  }, []);

  // keyboard: K keep · J/P pass · Space next
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (showNotes) return;
      const k = e.key.toLowerCase();
      if (k === "k") {
        dispatch("keep");
      } else if (k === "j" || k === "p") {
        dispatch("pass");
      } else if (e.code === "Space" || k === " ") {
        e.preventDefault();
        dispatch("skip");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch, showNotes]);

  const knowsPct = hud.knows ?? 50;

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* top-left: hero + meter */}
      <div className="pointer-events-none absolute left-0 top-0 z-10 max-w-md p-5 sm:p-7">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          8488 · aesthetic selection, inverted
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Second Ear</h1>
        <p className="mt-2 text-base text-muted-foreground">
          A co-composer that never asks you to tune anything — it proposes a phrase, you Keep or
          Pass, and from that one bit it infers your ear and composes toward it.
        </p>

        <div className="pointer-events-auto mt-4 max-w-xs">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              knows your ear
            </span>
            <span className="font-mono text-xs text-foreground">
              {hud.knows === null ? "…" : `${hud.knows}%`}
            </span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-200"
              style={{ width: `${knowsPct}%` }}
            />
          </div>
          <p className="mt-1.5 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {hud.label} · {hud.samples} bits
          </p>
        </div>
      </div>

      {/* design notes affordance */}
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-10 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {audioMsg ? (
        <p className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-md border border-border bg-background/70 px-3 py-1.5 text-sm text-destructive">
          {audioMsg}
        </p>
      ) : null}

      {/* bottom controls */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-3 p-5 pb-20 sm:pb-24">
        {!started ? (
          <button
            type="button"
            onClick={() => dispatch("keep")}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Take over with sound
          </button>
        ) : null}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => dispatch("keep")}
            className="min-h-[44px] min-w-[112px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Keep · K
          </button>
          <button
            type="button"
            onClick={() => dispatch("pass")}
            className="min-h-[44px] min-w-[112px] rounded-md border border-border bg-background/60 px-6 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Pass · J
          </button>
          <button
            type="button"
            onClick={() => dispatch("skip")}
            className="min-h-[44px] min-w-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Next · ␣
          </button>
        </div>
      </div>

      {/* design-notes modal */}
      {showNotes ? (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80dvh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-xl font-semibold tracking-tight">Design notes</h2>
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {README}
            </p>
          </div>
        </div>
      ) : null}

      <PrototypeNav slugs={["8488-secondear"]} />
    </main>
  );
}
