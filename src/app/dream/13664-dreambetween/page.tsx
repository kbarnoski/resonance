"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 13664 · Dream Between
//
//   ONE QUESTION
//   What if a little mind held several of my real recordings at once and dreamed
//   the space between them in my own piano sound — and I could steer that dream
//   with my hand?
//
//   LINEAGE (cycle 4 of the reservoir line)
//     10984-echofold → 11376-recallorbit → 12976-dreammedley → 13664-dreambetween
//
//   A genuine Echo-State Network (Jaeger 2001; see reservoir.ts) is the DREAMING
//   NAVIGATOR: a fixed sparse random recurrent state driven by a phase clock,
//   whose 2-D projection wanders a "memory field" whose anchors are Karel's real
//   recordings. Crucially — and this is the rule-10 FIX vs. dreammedley, which
//   re-synthesized the blend through an FM voice — the SOUND here is his REAL
//   audio: each recording is a granular source (windowed AudioBufferSourceNode
//   slices of the decoded buffer, NO oscillators). An attention vector over the
//   recordings (softmax over cursor→anchor distance) sets per-source grain
//   density: near an anchor you hear mostly that recording's grains; in the
//   between-space overlapping real grains from 2+ recordings form a genuine
//   hybrid — all his piano. The reservoir navigates hands-off; drag the cursor to
//   STEER (action-conditioned, Music-JEPA arXiv:2607.22000); a "Recall ⟷ dream"
//   slider pushes the reservoir past the edge of chaos so the between-space wanders.
//
//   Echo-State-Transformer framing (arXiv:2507.02917): anchors are memory slots,
//   the softmax is attention over them.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  REAL_TRACKS,
  loadRealTrackBuffer,
  type WelcomeHomeBuffer,
} from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { prefersReducedMotion } from "../_shared/visionary/safeFlicker";
import {
  NavigatorReservoir,
  attentionFrom,
  mulberry32,
  type Vec2,
} from "./reservoir";

const SEED = 13664;
const SVG_NS = "http://www.w3.org/2000/svg";

// 4 CONTRASTING pieces so the dream between them is audible. IDs verified in
// REAL_TRACKS (Welcome Home + Snowflake collections).
const SOURCE_IDS = [
  "8dafed88-4761-4dd3-a0f4-93f310441093", // Welcome Home
  "dad56bd6-8e53-442f-bb19-75ce4cc3e11c", // Isolation
  "734a09ce-84df-4f1f-93c1-11b08d303681", // Snowflake
  "549fc519-f7fc-4c38-a771-adaad2edbc81", // Ghost
] as const;

const SOURCES = SOURCE_IDS.map(
  (id) => ({ id, title: REAL_TRACKS.find((t) => t.id === id)?.title ?? id }),
);
const K = SOURCES.length;

// Anchor layout: recordings placed evenly around a ring in the memory field.
const ANCHOR_RADIUS = 0.74;
const ANCHORS: Vec2[] = SOURCES.map((_, i) => {
  const a = (-90 + (360 / K) * i) * (Math.PI / 180);
  return { x: Math.cos(a) * ANCHOR_RADIUS, y: Math.sin(a) * ANCHOR_RADIUS };
});

// Field → SVG (y flips: field-up = svg-down).
const fx = (v: number) => v;
const fy = (v: number) => -v;

const SPARKS_PER_SRC = 6;
const MAX_GRAIN_RATE = 24; // total grains/sec across all sources
const GRAIN_DUR = 0.14;

type Status = "idle" | "loading" | "running";

export default function DreamBetweenPage() {
  const svgWrapRef = useRef<HTMLDivElement | null>(null);

  const [status, setStatus] = useState<Status>("idle");
  const [muted, setMuted] = useState(false);
  const [dream, setDream] = useState(0.35);
  const [showNotes, setShowNotes] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [loadNote, setLoadNote] = useState<string | null>(null);
  const [nearest, setNearest] = useState<string>(SOURCES[0].title);

  // Live refs (never trigger re-render in the animation loop).
  const dreamRef = useRef(dream);
  const draggingRef = useRef(false);
  const dragPosRef = useRef<Vec2>({ x: 0, y: 0 });
  const cursorRef = useRef<Vec2>({ x: 0, y: 0 });
  const attnRef = useRef<number[]>(new Array(K).fill(1 / K));

  // Audio refs.
  const ctxRef = useRef<AudioContext | null>(null);
  const safeRef = useRef<SafeMaster | null>(null);
  const buffersRef = useRef<(WelcomeHomeBuffer | null)[]>(new Array(K).fill(null));
  const audioReadyRef = useRef(false);
  const grainNextRef = useRef<number[]>(new Array(K).fill(0));
  const grainRngRef = useRef<() => number>(mulberry32(SEED ^ 0xa1b2c3));
  const activeGrainsRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  useEffect(() => {
    dreamRef.current = dream;
  }, [dream]);

  // ── Main mount effect: reservoir + SVG constellation + rAF (visual on frame 1)
  useEffect(() => {
    const wrap = svgWrapRef.current;
    if (!wrap) return;
    const reduced = prefersReducedMotion();

    const res = new NavigatorReservoir(SEED, {
      N: 120,
      nHarm: 6,
      loopSteps: 256,
      rhoBase: 0.9,
      leak: 0.28,
      projGain: 1.75,
    });

    // ── Build the SVG constellation imperatively ──────────────────────────────
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "-1.2 -1.2 2.4 2.4");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.style.width = "100%";
    svg.style.height = "100%";
    svg.style.display = "block";
    svg.style.touchAction = "none";
    svg.style.cursor = "grab";

    const bg = document.createElementNS(SVG_NS, "rect");
    bg.setAttribute("x", "-1.2");
    bg.setAttribute("y", "-1.2");
    bg.setAttribute("width", "2.4");
    bg.setAttribute("height", "2.4");
    bg.setAttribute("fill", "#08060f");
    svg.appendChild(bg);

    // Faint field guide ring.
    const ring = document.createElementNS(SVG_NS, "circle");
    ring.setAttribute("cx", "0");
    ring.setAttribute("cy", "0");
    ring.setAttribute("r", String(ANCHOR_RADIUS));
    ring.setAttribute("fill", "none");
    ring.setAttribute("stroke", "#2a2350");
    ring.setAttribute("stroke-width", "0.004");
    svg.appendChild(ring);

    // Filaments cursor→anchor (drawn under nodes).
    const filaments: SVGLineElement[] = [];
    for (let k = 0; k < K; k++) {
      const l = document.createElementNS(SVG_NS, "line");
      l.setAttribute("stroke", "#8b78e8");
      l.setAttribute("stroke-linecap", "round");
      l.setAttribute("x2", String(fx(ANCHORS[k].x)));
      l.setAttribute("y2", String(fy(ANCHORS[k].y)));
      svg.appendChild(l);
      filaments.push(l);
    }

    // Grain sparks flowing anchor→cursor.
    const sparks: SVGCircleElement[][] = [];
    for (let k = 0; k < K; k++) {
      const arr: SVGCircleElement[] = [];
      for (let s = 0; s < SPARKS_PER_SRC; s++) {
        const c = document.createElementNS(SVG_NS, "circle");
        c.setAttribute("r", "0.012");
        c.setAttribute("fill", "#ddd6fe");
        svg.appendChild(c);
        arr.push(c);
      }
      sparks.push(arr);
    }

    // Anchor nodes (glow + core + label).
    const glows: SVGCircleElement[] = [];
    const cores: SVGCircleElement[] = [];
    for (let k = 0; k < K; k++) {
      const g = document.createElementNS(SVG_NS, "circle");
      g.setAttribute("cx", String(fx(ANCHORS[k].x)));
      g.setAttribute("cy", String(fy(ANCHORS[k].y)));
      g.setAttribute("fill", "#7c5cff");
      svg.appendChild(g);
      glows.push(g);

      const c = document.createElementNS(SVG_NS, "circle");
      c.setAttribute("cx", String(fx(ANCHORS[k].x)));
      c.setAttribute("cy", String(fy(ANCHORS[k].y)));
      c.setAttribute("r", "0.03");
      c.setAttribute("fill", "#c4b5fd");
      svg.appendChild(c);
      cores.push(c);

      const label = document.createElementNS(SVG_NS, "text");
      const outward = 1.18;
      label.setAttribute("x", String(fx(ANCHORS[k].x * outward)));
      label.setAttribute("y", String(fy(ANCHORS[k].y * outward) + 0.02));
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("font-size", "0.072");
      label.setAttribute("font-family", "ui-monospace, monospace");
      label.setAttribute("fill", "#9a8cd6");
      label.textContent = SOURCES[k].title;
      svg.appendChild(label);
    }

    // Cursor: the roving light.
    const cursorGlow = document.createElementNS(SVG_NS, "circle");
    cursorGlow.setAttribute("r", "0.11");
    cursorGlow.setAttribute("fill", "#a78bfa");
    cursorGlow.setAttribute("opacity", "0.35");
    svg.appendChild(cursorGlow);
    const cursorCore = document.createElementNS(SVG_NS, "circle");
    cursorCore.setAttribute("r", "0.032");
    cursorCore.setAttribute("fill", "#ede9fe");
    svg.appendChild(cursorCore);

    wrap.appendChild(svg);

    // ── Pointer steering (the primary verb) ───────────────────────────────────
    const toField = (clientX: number, clientY: number): Vec2 => {
      const r = svg.getBoundingClientRect();
      const nx = (clientX - r.left) / r.width;
      const ny = (clientY - r.top) / r.height;
      const fxv = -1.2 + nx * 2.4;
      const fyv = -(-1.2 + ny * 2.4); // flip back to field-up
      return {
        x: Math.max(-1, Math.min(1, fxv)),
        y: Math.max(-1, Math.min(1, fyv)),
      };
    };
    const onDown = (e: PointerEvent) => {
      draggingRef.current = true;
      dragPosRef.current = toField(e.clientX, e.clientY);
      svg.style.cursor = "grabbing";
      svg.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      dragPosRef.current = toField(e.clientX, e.clientY);
    };
    const onUp = (e: PointerEvent) => {
      draggingRef.current = false;
      svg.style.cursor = "grab";
      try {
        svg.releasePointerCapture(e.pointerId);
      } catch {
        /* pointer already gone */
      }
    };
    svg.addEventListener("pointerdown", onDown);
    svg.addEventListener("pointermove", onMove);
    svg.addEventListener("pointerup", onUp);
    svg.addEventListener("pointercancel", onUp);

    // ── Grain scheduler (REAL audio only — no oscillators) ────────────────────
    const scheduleGrains = () => {
      const ctx = ctxRef.current;
      const safe = safeRef.current;
      if (!audioReadyRef.current || !ctx || !safe) return;
      const now = ctx.currentTime;
      const ahead = now + 0.12;
      const rng = grainRngRef.current;
      const att = attnRef.current;
      const next = grainNextRef.current;
      const bufs = buffersRef.current;
      for (let k = 0; k < K; k++) {
        const wb = bufs[k];
        if (!wb) continue;
        const rate = MAX_GRAIN_RATE * att[k];
        if (rate < 0.05) {
          if (next[k] < now) next[k] = now;
          continue;
        }
        const interval = 1 / rate;
        while (next[k] < ahead) {
          if (next[k] < now) next[k] = now;
          const t = next[k];
          const b = wb.buffer;
          const src = ctx.createBufferSource();
          src.buffer = b;
          const g = ctx.createGain();
          const maxOff = Math.max(0, b.duration - GRAIN_DUR - 0.05);
          const off = rng() * maxOff;
          const peak = 0.5 * Math.min(1, 0.45 + att[k]);
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(peak, t + 0.03);
          g.gain.setValueAtTime(peak, t + GRAIN_DUR - 0.05);
          g.gain.linearRampToValueAtTime(0, t + GRAIN_DUR);
          src.connect(g);
          g.connect(safe.input);
          src.start(t, off, GRAIN_DUR);
          src.stop(t + GRAIN_DUR + 0.02);
          const set = activeGrainsRef.current;
          set.add(src);
          src.onended = () => {
            set.delete(src);
            try {
              src.disconnect();
              g.disconnect();
            } catch {
              /* already torn down */
            }
          };
          next[k] += interval * (0.7 + 0.6 * rng()); // jitter → not metronomic
        }
      }
    };

    // ── Animation loop ────────────────────────────────────────────────────────
    const stepRate = reduced ? 16 : 42; // reservoir microsteps / second
    let stepAcc = 0;
    let last = performance.now();
    let raf = 0;
    const nearestRef = { current: SOURCES[0].title };

    const loop = (tms: number) => {
      const dt = Math.min(0.05, (tms - last) / 1000);
      last = tms;

      res.setDream(dreamRef.current);
      stepAcc += dt * stepRate;
      let nsteps = Math.floor(stepAcc);
      stepAcc -= nsteps;
      if (nsteps > 8) nsteps = 8;
      for (let i = 0; i < nsteps; i++) res.step();

      const auto = res.cursor();
      const cur = draggingRef.current ? dragPosRef.current : auto;
      cursorRef.current = cur;

      // Attention over recordings — sharper toward recall, spread toward dream.
      const temp = 0.09 + dreamRef.current * 0.85;
      const att = attentionFrom(cur, ANCHORS, temp);
      attnRef.current = att;

      scheduleGrains();

      // ── Update visuals ──────────────────────────────────────────────────────
      const cx = fx(cur.x);
      const cy = fy(cur.y);
      cursorGlow.setAttribute("cx", String(cx));
      cursorGlow.setAttribute("cy", String(cy));
      cursorCore.setAttribute("cx", String(cx));
      cursorCore.setAttribute("cy", String(cy));
      const energy = res.energy();
      cursorGlow.setAttribute("opacity", String(0.25 + Math.min(0.5, energy)));

      let bestK = 0;
      let bestW = -1;
      for (let k = 0; k < K; k++) {
        const w = att[k];
        if (w > bestW) {
          bestW = w;
          bestK = k;
        }
        const ax = fx(ANCHORS[k].x);
        const ay = fy(ANCHORS[k].y);
        // Filament.
        filaments[k].setAttribute("x1", String(cx));
        filaments[k].setAttribute("y1", String(cy));
        filaments[k].setAttribute("stroke-width", String(0.004 + w * 0.03));
        filaments[k].setAttribute("opacity", String(0.08 + w * 0.7));
        // Anchor glow + core respond to attention.
        glows[k].setAttribute("r", String(0.05 + w * 0.16));
        glows[k].setAttribute("opacity", String(0.12 + w * 0.45));
        cores[k].setAttribute("r", String(0.026 + w * 0.03));
        cores[k].setAttribute("opacity", String(0.5 + w * 0.5));
        // Sparks flowing anchor→cursor (grain activity).
        const arr = sparks[k];
        for (let s = 0; s < SPARKS_PER_SRC; s++) {
          const offset = s / SPARKS_PER_SRC;
          const t = reduced
            ? offset
            : ((tms * 0.00022 * (0.8 + w) + offset) % 1 + 1) % 1;
          const px = ax + (cx - ax) * t;
          const py = ay + (cy - ay) * t;
          const env = Math.sin(Math.PI * t);
          arr[s].setAttribute("cx", String(px));
          arr[s].setAttribute("cy", String(py));
          arr[s].setAttribute(
            "opacity",
            String(reduced ? w * 0.4 : w * env * 0.95),
          );
          arr[s].setAttribute("r", String(0.008 + w * 0.012));
        }
      }
      if (SOURCES[bestK].title !== nearestRef.current) {
        nearestRef.current = SOURCES[bestK].title;
        setNearest(SOURCES[bestK].title);
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // ── Teardown ──────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(raf);
      svg.removeEventListener("pointerdown", onDown);
      svg.removeEventListener("pointermove", onMove);
      svg.removeEventListener("pointerup", onUp);
      svg.removeEventListener("pointercancel", onUp);
      const set = activeGrainsRef.current;
      set.forEach((s) => {
        try {
          s.stop();
          s.disconnect();
        } catch {
          /* already stopped */
        }
      });
      set.clear();
      audioReadyRef.current = false;
      try {
        safeRef.current?.disconnect();
      } catch {
        /* no-op */
      }
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});
      ctxRef.current = null;
      safeRef.current = null;
      if (svg.parentNode) svg.parentNode.removeChild(svg);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Begin: one gesture unlocks audio, loads his real recordings ─────────────
  const begin = useCallback(async () => {
    if (status !== "idle") return;
    setStatus("loading");
    setAudioError(null);
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctor();
      await ctx.resume();
      const safe = createSafeMaster(ctx);
      ctxRef.current = ctx;
      safeRef.current = safe;

      const results = await Promise.allSettled(
        SOURCES.map((s) => loadRealTrackBuffer(ctx, s.id)),
      );
      let ok = 0;
      results.forEach((r, i) => {
        if (r.status === "fulfilled") {
          buffersRef.current[i] = r.value;
          ok++;
        } else {
          buffersRef.current[i] = null;
        }
      });
      if (ok === 0) {
        throw new Error("none of his recordings could be loaded");
      }
      if (ok < K) {
        setLoadNote(`${ok}/${K} recordings loaded — dreaming with what arrived.`);
      }
      const now = ctx.currentTime;
      grainNextRef.current = grainNextRef.current.map(() => now + 0.05);
      audioReadyRef.current = true;
      setStatus("running");
    } catch (err) {
      setAudioError(
        err instanceof Error ? err.message : "audio failed to start",
      );
      // Visuals keep running regardless.
      setStatus("idle");
      audioReadyRef.current = false;
    }
  }, [status]);

  const toggleMute = useCallback(() => {
    const safe = safeRef.current;
    if (!safe) return;
    const nextMuted = !muted;
    safe.setGain(nextMuted ? 0 : 0.85);
    setMuted(nextMuted);
  }, [muted]);

  return (
    <main className="min-h-screen bg-background px-5 py-8 sm:px-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            13664 · dream between · cycle 4 of the reservoir line
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Dream Between
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground">
            A little mind holds four of Karel&apos;s real recordings at once and
            dreams the space between them — in his own piano sound. Drag the light
            to steer the dream; let go and the reservoir wanders on its own.
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-3">
          {status !== "running" ? (
            <button
              type="button"
              onClick={begin}
              disabled={status === "loading"}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {status === "loading" ? "Loading his recordings…" : "Begin (sound on)"}
            </button>
          ) : (
            <button
              type="button"
              onClick={toggleMute}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {muted ? "Unmute" : "Mute sound"}
            </button>
          )}

          <label className="flex min-h-[44px] items-center gap-3 rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground">
            <span className="font-mono text-[11px] uppercase tracking-[0.14em]">
              recall
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={dream}
              onChange={(e) => setDream(parseFloat(e.target.value))}
              className="h-1 w-32 cursor-pointer accent-primary"
              aria-label="Recall to dream"
            />
            <span className="font-mono text-[11px] uppercase tracking-[0.14em]">
              dream
            </span>
          </label>

          <button
            type="button"
            onClick={() => setShowNotes((v) => !v)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {showNotes ? "Hide design notes" : "Read the design notes"}
          </button>
        </div>

        {audioError && (
          <p className="text-base text-destructive">
            Sound couldn&apos;t start ({audioError}). The dream keeps drifting
            silently — press Begin to try again.
          </p>
        )}
        {loadNote && !audioError && (
          <p className="text-base text-muted-foreground">{loadNote}</p>
        )}

        <div
          ref={svgWrapRef}
          className="relative aspect-square w-full overflow-hidden rounded-md border border-border bg-background"
        />

        <p className="text-base text-muted-foreground">
          Nearest memory:{" "}
          <span className="text-foreground">{nearest}</span>
          <span className="text-muted-foreground">
            {" "}
            — brighter filaments and denser sparks mark the recordings you&apos;re
            currently hearing.
          </span>
        </p>

        {showNotes && (
          <section className="flex flex-col gap-4 rounded-md border border-border bg-background/40 p-5 text-base text-muted-foreground">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <p>
              <span className="text-foreground">The question.</span> What if a
              little mind held several of Karel&apos;s real recordings at once and
              dreamed the space between them in his own piano sound — and he could
              steer that dream with his hand?
            </p>
            <p>
              <span className="text-foreground">The navigator.</span> A genuine
              Echo-State Network (Jaeger 2001): a fixed sparse random recurrent
              state <span className="font-mono">x∈R¹²⁰</span>, rescaled to a target
              spectral radius by power iteration, driven only by a phase clock. Its
              2-D projection is the roving light. This is a real dynamical system,
              not a random walk. The &quot;Recall ⟷ dream&quot; slider pushes the
              spectral radius past the edge of chaos and injects state noise, so the
              orbit unwinds and wanders the between-space.
            </p>
            <p>
              <span className="text-foreground">The sound (rule-10 fix).</span> The
              four anchors are Karel&apos;s real recordings, each a granular source:
              short windowed slices of the decoded buffer, played as real audio —
              no oscillators, no FM voice. A softmax attention over cursor→anchor
              distance sets each source&apos;s grain density. Near an anchor you hear
              mostly that piece; in the between-space, overlapping real grains from
              two or more recordings form a genuine hybrid — all his piano. This is
              the resurrect of{" "}
              <span className="font-mono">12976-dreammedley</span>, which wandered
              the same latent space but re-synthesized the blend through an FM voice
              (a rule-10 violation: the output was no longer his real sound).
            </p>
            <p>
              <span className="text-foreground">Steering (action-conditioned).</span>{" "}
              The reservoir navigates hands-off. Drag the cursor and your hand
              overrides it; release and the reservoir resumes from its live state.
              Framing after Music-JEPA (arXiv:2607.22000): a world model of piano
              sound that responds to your action.
            </p>
            <p>
              <span className="text-foreground">Lineage.</span> Cycle 4 of the
              reservoir line: 10984-echofold → 11376-recallorbit →
              12976-dreammedley → 13664-dreambetween.
            </p>
            <p className="text-sm">
              References: Jaeger 2001 (Echo-State Network); Echo State Transformer
              (arXiv:2507.02917, reservoirs/readouts as attention memory slots);
              Music-JEPA (arXiv:2607.22000, action-conditioned world model of piano
              sound).
            </p>
            <Link
              href="/dream"
              className="text-sm text-primary hover:underline"
            >
              ← back to the dream lab
            </Link>
          </section>
        )}
      </div>
    </main>
  );
}
