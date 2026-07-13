"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildFlood } from "./text";
import { GlossolaliaAudio } from "./audio";
import { PrototypeNav } from "../_shared/prototype-nav";

// ════════════════════════════════════════════════════════════════════════════
// 1588 — glossolalia
//
// THE QUESTION: "What if the whole field of vision flooded with language — the
// DMT 'everything is syntax' overload — and moving apertures of light resolved
// fragments of it into legible meaning, which you steer and sound?"
//
// THE TECHNIQUE — the CSS Custom Highlight API. The viewport is filled with many
// drifting rows of REAL generated pseudo-language living in ordinary Text nodes,
// painted DIM (near-noise). We pre-register 8 highlight "buckets" (lume0…lume7)
// styled bright→dim in a <style> tag via ::highlight(...). Each frame we compute
// moving aperture centers, build Range objects over the characters near each
// center, and distribute them across the buckets by distance (closest = the
// brightest bucket). Where a bucket paints, the dim flood RESOLVES into bright
// legible words — circular pools of clarity gliding across the language-field,
// with ZERO per-glyph DOM. All motion comes from RE-RANGING each frame, because
// ::highlight() may only restyle color / shadow / stroke, not position.
//
// Framed as the C×G×D computational-neurophenomenology model (Frontiers in
// Psychology, 2026, doi 10.3389/fpsyg.2026.1819038): text.ts is the top-down
// *Generator* replaying learned phonotactic structure (meaning-SHAPED, not
// noise); the aperture is the *Classifier* momentarily finding "effective
// causes" — legible words — in the flood. See README.md.
//
// Progressive enhancement: browsers without the Highlight API fall back to real
// <span class="hl-fallback"> nodes wrapped around the same aperture windows, so
// the piece is headless-verifiable. A corner badge reports which path is live.
// ════════════════════════════════════════════════════════════════════════════

const SEED = 0x1588;
const FONT_SIZE = 15;
const LINE_H = 18;
const N_BUCKETS = 8;
const TAU = Math.PI * 2;

// bright → dim gradient. bucket 0 is the centre of an aperture (legible);
// bucket 7 sits just above the flood floor.
const HL_COLORS = [
  "#f3fbff",
  "#d9f1ff",
  "#b9e2ff",
  "#9ec8ff",
  "#95b0f1",
  "#8b88de",
  "#7168b6",
  "#544c80",
];
const HL_SHADOW = [
  "0 0 7px rgba(150,225,255,.55)",
  "0 0 5px rgba(150,215,255,.4)",
  "0 0 4px rgba(150,200,255,.28)",
  "none",
  "none",
  "none",
  "none",
  "none",
];

// ── minimal typed shims for the Highlight API (avoid `any`) ──────────────────
interface HighlightLike {
  add(r: Range): void;
  clear(): void;
  priority: number;
}
type HighlightCtor = new (...ranges: Range[]) => HighlightLike;
interface HighlightRegistry {
  set(name: string, h: HighlightLike): void;
  delete(name: string): void;
}
const HighlightRef = (
  globalThis as unknown as { Highlight?: HighlightCtor }
).Highlight;
const highlightsRegistry =
  typeof CSS !== "undefined"
    ? (CSS as unknown as { highlights?: HighlightRegistry }).highlights
    : undefined;
const SUPPORTS_HL =
  typeof HighlightRef !== "undefined" && !!highlightsRegistry;

type Metrics = { charWidth: number; rows: number; cols: number };
type Ambient = {
  ax: number;
  ay: number;
  fx: number;
  fy: number;
  px: number;
  py: number;
  r: number;
};
type Burst = { x: number; y: number; born: number };
type Primary = { x: number; y: number; vx: number; vy: number };
type RingState = { wasSpace: boolean; lastRing: number };

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// probe the monospace advance width once (system-font dependent)
function measureCharWidth(): number {
  const probe = document.createElement("span");
  probe.style.cssText =
    "position:absolute;left:-9999px;top:-9999px;visibility:hidden;" +
    "white-space:pre;font-family:var(--font-mono),ui-monospace,monospace;" +
    `font-size:${FONT_SIZE}px;`;
  probe.textContent = "M".repeat(80);
  document.body.appendChild(probe);
  const w = probe.getBoundingClientRect().width / 80;
  document.body.removeChild(probe);
  return w > 1 ? w : 9;
}

export default function Page() {
  const [lineCount, setLineCount] = useState(0);
  const [audioOn, setAudioOn] = useState(false);
  const [audioErr, setAudioErr] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  // resolved after mount so SSR and first client render agree (no hydration mismatch)
  const [hlLabel, setHlLabel] = useState<string | null>(null);

  // imperative state (mutated per frame, never triggers re-render)
  const floodRef = useRef<HTMLDivElement | null>(null);
  const lineElsRef = useRef<(HTMLDivElement | null)[]>([]);
  const linesRef = useRef<string[]>([]);
  const nodesRef = useRef<(Text | null)[]>([]);
  const metricsRef = useRef<Metrics>({ charWidth: 9, rows: 0, cols: 0 });
  const driftRef = useRef<{ amp: number; speed: number; phase: number }[]>([]);
  const driftPxRef = useRef<number[]>([]);
  const ambientRef = useRef<Ambient[]>([]);
  const primaryRef = useRef<Primary>({ x: 0, y: 0, vx: 0, vy: 0 });
  const burstsRef = useRef<Burst[]>([]);
  const ringRef = useRef<RingState[]>([]);
  const hlRef = useRef<HighlightLike[]>([]);
  const dirtyRef = useRef<Set<number>>(new Set());
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const lastInputRef = useRef<number>(0);
  const reducedRef = useRef<boolean>(false);
  const audioRef = useRef<GlossolaliaAudio | null>(null);
  const audioStartedRef = useRef<boolean>(false);

  // ── gesture-gated audio ────────────────────────────────────────────────────
  const ensureAudio = useCallback(() => {
    if (audioStartedRef.current) return;
    audioStartedRef.current = true;
    if (!audioRef.current) audioRef.current = new GlossolaliaAudio();
    audioRef.current
      .start()
      .then(() => setAudioOn(true))
      .catch(() => {
        setAudioErr("Audio is unavailable in this browser — visuals continue.");
      });
  }, []);

  // ── build / rebuild the flood on mount + resize ─────────────────────────────
  useEffect(() => {
    reducedRef.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    setHlLabel(SUPPORTS_HL ? "native" : "fallback");

    const build = () => {
      const cw = measureCharWidth();
      const W = window.innerWidth;
      const H = window.innerHeight;
      const rows = Math.ceil(H / LINE_H) + 2;
      const cols = Math.ceil(W / cw) + 20;
      metricsRef.current = { charWidth: cw, rows, cols };
      linesRef.current = buildFlood(SEED, rows, cols);
      lineElsRef.current = [];
      setLineCount(rows);
    };

    build();
    let tmr: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(tmr);
      tmr = setTimeout(build, 220);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      clearTimeout(tmr);
    };
  }, []);

  // ── per-frame engine (runs once lines exist; re-runs on rebuild) ────────────
  useEffect(() => {
    if (lineCount === 0) return;
    const { charWidth, rows } = metricsRef.current;
    const lines = linesRef.current;
    const reduced = reducedRef.current;

    // populate Text nodes imperatively (React owns no children of the lines)
    nodesRef.current = [];
    for (let i = 0; i < rows; i++) {
      const el = lineElsRef.current[i];
      if (!el) {
        nodesRef.current[i] = null;
        continue;
      }
      el.textContent = lines[i] ?? "";
      nodesRef.current[i] = el.firstChild as Text | null;
    }

    // seeded per-row horizontal drift (the flood "breathes" sideways)
    const rng = (() => {
      let a = (SEED ^ 0x51ed) >>> 0;
      return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    })();
    const ampMax = (reduced ? 2 : 5) * charWidth;
    driftRef.current = [];
    for (let i = 0; i < rows; i++) {
      driftRef.current[i] = {
        amp: (0.3 + rng() * 0.7) * ampMax,
        speed: (reduced ? 0.5 : 1) * (0.05 + rng() * 0.12),
        phase: rng() * TAU,
      };
    }
    driftPxRef.current = new Array(rows).fill(0);

    // ambient (self-demo) apertures on Lissajous paths
    const nAmbient = reduced ? 1 : 3;
    ambientRef.current = [];
    ringRef.current = [];
    for (let i = 0; i < nAmbient; i++) {
      ambientRef.current[i] = {
        ax: 0.34 + rng() * 0.08,
        ay: 0.32 + rng() * 0.08,
        fx: (reduced ? 0.5 : 1) * (0.09 + rng() * 0.11),
        fy: (reduced ? 0.5 : 1) * (0.1 + rng() * 0.11),
        px: rng() * TAU,
        py: rng() * TAU,
        r: reduced ? 118 : 96,
      };
      ringRef.current[i] = { wasSpace: true, lastRing: 0 };
    }
    // ring state slot for the primary aperture (index nAmbient)
    ringRef.current[nAmbient] = { wasSpace: true, lastRing: 0 };

    primaryRef.current = {
      x: window.innerWidth * 0.5,
      y: window.innerHeight * 0.5,
      vx: 0,
      vy: 0,
    };
    burstsRef.current = [];

    // register the 8 highlight buckets once (native path)
    if (SUPPORTS_HL && HighlightRef && highlightsRegistry) {
      hlRef.current = [];
      for (let b = 0; b < N_BUCKETS; b++) {
        const h = new HighlightRef();
        h.priority = N_BUCKETS - b; // brighter buckets win overlaps
        highlightsRegistry.set(`lume${b}`, h);
        hlRef.current[b] = h;
      }
    }

    const lineBaseLeft = -8 * charWidth;
    startRef.current = performance.now();
    dirtyRef.current = new Set();

    const pushRange = (
      bucket: number,
      node: Text,
      i: number,
      j: number
    ) => {
      const len = node.length;
      const a = Math.max(0, Math.min(i, len));
      const b = Math.max(0, Math.min(j, len));
      if (b <= a) return;
      const r = new Range();
      r.setStart(node, a);
      r.setEnd(node, b);
      hlRef.current[bucket].add(r);
    };

    const frame = () => {
      const now = performance.now();
      const t = (now - startRef.current) / 1000;
      const W = window.innerWidth;
      const H = window.innerHeight;
      const audio = audioRef.current;
      const idle = now - lastInputRef.current > 2600;

      // update per-row drift + apply transforms
      const drift = driftRef.current;
      const driftPx = driftPxRef.current;
      for (let i = 0; i < rows; i++) {
        const d = drift[i];
        const off = lineBaseLeft + d.amp * Math.sin(t * d.speed + d.phase);
        driftPx[i] = off;
        const el = lineElsRef.current[i];
        if (el) el.style.transform = `translateX(${off.toFixed(1)}px)`;
      }

      // assemble this frame's aperture list
      const aps: { cx: number; cy: number; r: number; ringIdx: number }[] = [];
      const amb = ambientRef.current;
      for (let i = 0; i < amb.length; i++) {
        const a = amb[i];
        aps.push({
          cx: W * (0.5 + a.ax * Math.sin(t * a.fx + a.px)),
          cy: H * (0.5 + a.ay * Math.sin(t * a.fy + a.py)),
          r: a.r,
          ringIdx: i,
        });
      }

      // primary aperture — steered, or self-drifting when idle
      const p = primaryRef.current;
      if (idle) {
        const tx = W * (0.5 + 0.33 * Math.sin(t * 0.13 + 1.1));
        const ty = H * (0.5 + 0.3 * Math.sin(t * 0.17 + 0.4));
        p.vx += (tx - p.x) * 0.006;
        p.vy += (ty - p.y) * 0.006;
      }
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.9;
      p.vy *= 0.9;
      p.x = Math.max(0, Math.min(W, p.x));
      p.y = Math.max(0, Math.min(H, p.y));
      aps.push({ cx: p.x, cy: p.y, r: reduced ? 122 : 108, ringIdx: amb.length });

      // burst apertures (taps) — grow-then-collapse bloom, no flash
      const ttl = reduced ? 1.6 : 2.4;
      const bursts = burstsRef.current;
      for (let i = bursts.length - 1; i >= 0; i--) {
        const age = (now - bursts[i].born) / 1000;
        if (age > ttl) {
          bursts.splice(i, 1);
          continue;
        }
        const env = Math.sin((age / ttl) * Math.PI);
        aps.push({
          cx: bursts[i].x,
          cy: bursts[i].y,
          r: 12 + (reduced ? 70 : 150) * env,
          ringIdx: -1,
        });
      }

      // ── word-crossing → JI mallet ─────────────────────────────────────────
      for (const ap of aps) {
        if (ap.ringIdx < 0 || !audio) continue;
        const row = Math.floor(ap.cy / LINE_H);
        if (row < 0 || row >= rows) continue;
        const line = lines[row] ?? "";
        const col = Math.round((ap.cx - driftPx[row]) / charWidth);
        const ch = col >= 0 && col < line.length ? line[col] : " ";
        const isSpace = ch === " " || ch === "";
        const rs = ringRef.current[ap.ringIdx];
        if (!isSpace && rs.wasSpace && now - rs.lastRing > 130) {
          audio.mallet(audio.freqFromFrac(ap.cy / H), 0.55);
          rs.lastRing = now;
        }
        rs.wasSpace = isSpace;
      }

      // ── paint the apertures ───────────────────────────────────────────────
      if (SUPPORTS_HL) {
        for (let b = 0; b < N_BUCKETS; b++) hlRef.current[b].clear();
        for (const ap of aps) {
          const rowMin = Math.max(0, Math.floor((ap.cy - ap.r) / LINE_H));
          const rowMax = Math.min(rows - 1, Math.floor((ap.cy + ap.r) / LINE_H));
          for (let row = rowMin; row <= rowMax; row++) {
            const node = nodesRef.current[row];
            if (!node) continue;
            const len = node.length;
            const yC = row * LINE_H + LINE_H / 2;
            const dy = ap.cy - yC;
            if (Math.abs(dy) > ap.r) continue;
            const halfW = Math.sqrt(ap.r * ap.r - dy * dy);
            const off = driftPx[row];
            const cMin = Math.max(0, Math.floor((ap.cx - halfW - off) / charWidth));
            const cMax = Math.min(
              len - 1,
              Math.ceil((ap.cx + halfW - off) / charWidth)
            );
            let runStart = -1;
            let runBucket = -1;
            for (let c = cMin; c <= cMax; c++) {
              const charX = off + (c + 0.5) * charWidth;
              const dist = Math.hypot(charX - ap.cx, yC - ap.cy) / ap.r;
              if (dist > 1) {
                if (runStart >= 0) {
                  pushRange(runBucket, node, runStart, c);
                  runStart = -1;
                }
                continue;
              }
              const bucket = Math.min(N_BUCKETS - 1, Math.floor(dist * N_BUCKETS));
              if (bucket !== runBucket) {
                if (runStart >= 0) pushRange(runBucket, node, runStart, c);
                runStart = c;
                runBucket = bucket;
              }
            }
            if (runStart >= 0) pushRange(runBucket, node, runStart, cMax + 1);
          }
        }
      } else {
        // fallback: wrap aperture windows in real <span class="hl-fallback bkN">
        const buckets = new Map<number, Int8Array>(); // row -> per-col bucket
        for (const ap of aps) {
          const rowMin = Math.max(0, Math.floor((ap.cy - ap.r) / LINE_H));
          const rowMax = Math.min(rows - 1, Math.floor((ap.cy + ap.r) / LINE_H));
          for (let row = rowMin; row <= rowMax; row++) {
            const line = lines[row] ?? "";
            const len = line.length;
            const yC = row * LINE_H + LINE_H / 2;
            const dy = ap.cy - yC;
            if (Math.abs(dy) > ap.r) continue;
            const halfW = Math.sqrt(ap.r * ap.r - dy * dy);
            const off = driftPx[row];
            const cMin = Math.max(0, Math.floor((ap.cx - halfW - off) / charWidth));
            const cMax = Math.min(len - 1, Math.ceil((ap.cx + halfW - off) / charWidth));
            let arr = buckets.get(row);
            if (!arr) {
              arr = new Int8Array(len).fill(-1);
              buckets.set(row, arr);
            }
            for (let c = cMin; c <= cMax; c++) {
              const charX = off + (c + 0.5) * charWidth;
              const dist = Math.hypot(charX - ap.cx, yC - ap.cy) / ap.r;
              if (dist > 1) continue;
              const bk = Math.min(N_BUCKETS - 1, Math.floor(dist * N_BUCKETS));
              if (arr[c] < 0 || bk < arr[c]) arr[c] = bk;
            }
          }
        }
        const touched = new Set<number>();
        buckets.forEach((arr, row) => {
          touched.add(row);
          const el = lineElsRef.current[row];
          if (!el) return;
          const line = lines[row] ?? "";
          let html = "";
          let c = 0;
          while (c < line.length) {
            const bk = arr[c];
            if (bk < 0) {
              let j = c;
              while (j < line.length && arr[j] < 0) j++;
              html += escapeHtml(line.slice(c, j));
              c = j;
            } else {
              let j = c;
              while (j < line.length && arr[j] === bk) j++;
              html += `<span class="hl-fallback bk${bk}">${escapeHtml(
                line.slice(c, j)
              )}</span>`;
              c = j;
            }
          }
          el.innerHTML = html;
        });
        // reset rows that were lit last frame but are clean now
        dirtyRef.current.forEach((row) => {
          if (!touched.has(row)) {
            const el = lineElsRef.current[row];
            if (el) el.textContent = lines[row] ?? "";
          }
        });
        dirtyRef.current = touched;
      }

      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (SUPPORTS_HL && highlightsRegistry) {
        for (let b = 0; b < N_BUCKETS; b++) highlightsRegistry.delete(`lume${b}`);
      }
    };
  }, [lineCount]);

  // ── input listeners (mount-only; read refs) ─────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      ensureAudio();
      lastInputRef.current = performance.now();
      const p = primaryRef.current;
      const step = reducedRef.current ? 3.2 : 5.5;
      let handled = true;
      switch (k) {
        case "ArrowLeft":
        case "a":
        case "A":
          p.vx -= step;
          break;
        case "ArrowRight":
        case "d":
        case "D":
          p.vx += step;
          break;
        case "ArrowUp":
        case "w":
        case "W":
          p.vy -= step;
          break;
        case "ArrowDown":
        case "s":
        case "S":
          p.vy += step;
          break;
        default:
          handled = false;
      }
      const audio = audioRef.current;
      if (audio) {
        audio.tick();
        // printable keys also spawn a note into the aperture
        if (!handled && k.length === 1) {
          p.vx += 1.4;
          audio.mallet(audio.freqFromFrac(p.y / window.innerHeight), 0.5);
        }
      }
      if (handled || k === " ") e.preventDefault();
    };

    const onPointer = (e: PointerEvent) => {
      // ignore taps on chrome (buttons / links / modal)
      const target = e.target as HTMLElement;
      if (target.closest("[data-chrome]")) return;
      ensureAudio();
      lastInputRef.current = performance.now();
      const H = window.innerHeight;
      if (!reducedRef.current || burstsRef.current.length < 2) {
        burstsRef.current.push({ x: e.clientX, y: e.clientY, born: performance.now() });
      }
      audioRef.current?.chord(e.clientY / H);
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [ensureAudio]);

  // ── teardown audio on unmount ───────────────────────────────────────────────
  useEffect(() => {
    return () => {
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  // build the <style> for buckets + fallback spans + flood floor
  const styleText = (() => {
    let s = `.glosso-flood{font-family:var(--font-mono),ui-monospace,monospace;font-size:${FONT_SIZE}px;line-height:${LINE_H}px;color:rgba(150,158,210,0.13);letter-spacing:0;}
.glosso-line{white-space:pre;height:${LINE_H}px;will-change:transform;}
`;
    for (let b = 0; b < N_BUCKETS; b++) {
      const rule = `color:${HL_COLORS[b]};text-shadow:${HL_SHADOW[b]};-webkit-text-stroke-color:${HL_COLORS[b]};`;
      s += `::highlight(lume${b}){${rule}}\n`;
      s += `.hl-fallback.bk${b}{${rule}}\n`;
    }
    return s;
  })();

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black text-foreground">
      <style>{styleText}</style>

      {/* the syntactic flood — many dim rows of real generated language */}
      <div
        ref={floodRef}
        className="glosso-flood pointer-events-none absolute inset-0 select-none overflow-hidden"
        aria-hidden
      >
        {Array.from({ length: lineCount }).map((_, i) => (
          <div
            key={i}
            ref={(el) => {
              lineElsRef.current[i] = el;
            }}
            className="glosso-line"
          />
        ))}
      </div>

      {/* live badge: which highlight path is running */}
      <div
        data-chrome
        className="pointer-events-none absolute right-4 top-4 rounded-md border border-border bg-background/70 px-2.5 py-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground backdrop-blur-sm"
      >
        highlights: {hlLabel ?? "…"}
      </div>

      {/* title + hint (top-left) */}
      <div
        data-chrome
        className="pointer-events-none absolute left-4 top-4 max-w-sm"
      >
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Resonance · Dream Lab · 1588
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          glossolalia
        </h1>
        <p className="mt-2 text-base leading-relaxed text-muted-foreground">
          A field flooded with language. Steer the apertures of light — they
          resolve the flood into legible words, and sound them.
        </p>
        {!audioOn && !audioErr && (
          <p className="mt-3 text-sm text-primary">
            Type, arrow / WASD to steer, or tap to sound.
          </p>
        )}
        {audioErr && (
          <p className="mt-3 text-sm text-destructive">{audioErr}</p>
        )}
      </div>

      {/* controls (bottom-left) */}
      <div
        data-chrome
        className="absolute bottom-4 left-4 flex items-center gap-3"
      >
        {!audioOn && !audioErr && (
          <button
            onClick={ensureAudio}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Begin the flood
          </button>
        )}
        <button
          onClick={() => setShowNotes(true)}
          className="min-h-[44px] text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Read the design notes
        </button>
      </div>

      {/* design-notes modal */}
      {showNotes && (
        <div
          data-chrome
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Design notes
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
              Apertures in a syntactic flood
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                The whole field is real generated pseudo-language living in
                ordinary Text nodes, painted near-invisible. Using the{" "}
                <span className="text-foreground">CSS Custom Highlight API</span>
                , eight pre-registered highlight buckets (bright → dim) restyle
                moving character-ranges each frame — pools of clarity gliding
                over the language, with zero per-glyph DOM.
              </p>
              <p>
                Framed by the C×G×D model of hallucination (Frontiers in
                Psychology, 2026): the flood is the brain&apos;s{" "}
                <span className="text-foreground">Generator</span> replaying
                learned structure top-down — meaning-shaped, not noise — and each
                aperture is the <span className="text-foreground">Classifier</span>{" "}
                momentarily finding effective causes in it.
              </p>
              <p>
                Words crossing an aperture ring a just-intonation bell (pitch from
                height); taps ignite a chord and a burst of legibility; a low JI
                pad drone keeps it from ever going silent. Left alone, seeded
                apertures drift on Lissajous paths — a finished piece with no
                input and no permissions.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-6 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
      <PrototypeNav slugs={["1588-glossolalia"]} />
    </main>
  );
}
