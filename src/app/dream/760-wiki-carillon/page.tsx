"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { connectFeed, type EditEvent, type FeedHandle, type FeedStatus } from "./feed";
import {
  buildCarillonEngine,
  magnitudeOf,
  panForDomain,
  pitchForMagnitude,
  type BellSpec,
  type CarillonEngine,
} from "./audio";

// ─── Constants (pure) ─────────────────────────────────────────────────────────
const THROTTLE_MIN_MS = 170; // ~6 bells/sec ceiling
const QUEUE_CAP = 8; // drop the rest when a busy stream floods
const MAX_BLOOMS = 90; // live visual marks

type Phase = "intro" | "running";

type Bloom = {
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  r: number; // current radius (px-ish, scaled at draw)
  maxR: number;
  life: number; // 1 → 0
  hue: "ink" | "gold" | "violet" | "mute";
  born: number;
};

// Pure: a stable 0..1 y-position per domain, so each wiki keeps a band.
function computeY(domain: string): number {
  let h = 7;
  for (let i = 0; i < domain.length; i++) h = (h * 33 + domain.charCodeAt(i)) >>> 0;
  return 0.12 + ((h % 1000) / 1000) * 0.76;
}

// Pure: x from pan (-1..1) → 0..1.
function computeX(pan: number): number {
  return (pan + 1) / 2;
}

// Pure: build a bell spec + a bloom from an edit event.
function buildSpec(e: EditEvent): BellSpec {
  const mag = magnitudeOf(e.delta);
  const pan = panForDomain(e.domain);
  return {
    freq: pitchForMagnitude(mag),
    decay: 1.6 + mag * 3.4, // bigger edits ring longer
    gain: 0.18 + mag * 0.32,
    pan,
    bot: e.bot,
    swell: e.newUser && !e.bot,
  };
}

function buildBloom(e: EditEvent, t: number): Bloom {
  const mag = magnitudeOf(e.delta);
  const pan = panForDomain(e.domain);
  const hue: Bloom["hue"] = e.bot ? "mute" : e.newUser ? "violet" : mag > 0.5 ? "gold" : "ink";
  return {
    x: computeX(pan),
    y: computeY(e.domain),
    r: 2,
    maxR: 18 + mag * 120,
    life: 1,
    hue,
    born: t,
  };
}

function hueColor(hue: Bloom["hue"], alpha: number): string {
  switch (hue) {
    case "gold":
      return `rgba(184, 134, 11, ${alpha})`;
    case "violet":
      return `rgba(124, 92, 196, ${alpha})`;
    case "mute":
      return `rgba(120, 113, 108, ${alpha})`;
    default:
      return `rgba(41, 37, 36, ${alpha})`; // ink
  }
}

// Draw the bright "atlas" ground + faint latitude/longitude grid.
function drawGround(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#f7f3e9"); // pale parchment / soft sky
  g.addColorStop(1, "#efe7d6");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "rgba(120, 100, 60, 0.10)";
  ctx.lineWidth = 1;
  const cols = 12;
  const rows = 7;
  ctx.beginPath();
  for (let i = 1; i < cols; i++) {
    const x = (i / cols) * w;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let j = 1; j < rows; j++) {
    const y = (j / rows) * h;
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();
}

export default function WikiCarillonPage() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [showNotes, setShowNotes] = useState(false);
  const [status, setStatus] = useState<FeedStatus>({ mode: "demo", label: "connecting…" });
  const [stats, setStats] = useState({ rung: 0, perSec: 0, lastTitle: "", lastWiki: "" });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const engineRef = useRef<CarillonEngine | null>(null);
  const feedRef = useRef<FeedHandle | null>(null);
  const rafRef = useRef<number>(0);

  const bloomsRef = useRef<Bloom[]>([]);
  const queueRef = useRef<EditEvent[]>([]);
  const lastRingWallRef = useRef<number>(0);
  const rungTotalRef = useRef<number>(0);
  const rungWindowRef = useRef<number[]>([]); // timestamps for per-sec rate

  // ── Teardown ────────────────────────────────────────────────────────────────
  const teardown = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    feedRef.current?.stop();
    feedRef.current = null;
    engineRef.current?.dispose();
    engineRef.current = null;
    const c = ctxRef.current;
    if (c && c.state !== "closed") c.close().catch(() => {});
    ctxRef.current = null;
    queueRef.current = [];
    bloomsRef.current = [];
  }, []);

  useEffect(() => teardown, [teardown]);

  // ── Animation + throttled ringing loop ────────────────────────────────────────
  const loop = useCallback(() => {
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    if (!canvas || !engine) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }
    const c2d = canvas.getContext("2d");
    if (!c2d) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = canvas.clientWidth || 800;
    const cssH = canvas.clientHeight || 480;
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }
    const w = canvas.width;
    const h = canvas.height;

    const now = performance.now();

    // Throttle: ring at most one queued edit per THROTTLE_MIN_MS.
    if (queueRef.current.length > 0 && now - lastRingWallRef.current >= THROTTLE_MIN_MS) {
      const e = queueRef.current.shift() as EditEvent;
      lastRingWallRef.current = now;
      engine.ring(buildSpec(e));
      bloomsRef.current.push(buildBloom(e, now));
      if (bloomsRef.current.length > MAX_BLOOMS) {
        bloomsRef.current.splice(0, bloomsRef.current.length - MAX_BLOOMS);
      }
      rungTotalRef.current += 1;
      rungWindowRef.current.push(now);
      setStats((s) => ({
        rung: rungTotalRef.current,
        perSec: s.perSec,
        lastTitle: e.title,
        lastWiki: e.domain,
      }));
    }

    // bed level follows recent activity density
    rungWindowRef.current = rungWindowRef.current.filter((t) => now - t < 1500);
    const density = rungWindowRef.current.length;
    engine.setBedLevel(0.03 + Math.min(0.06, density * 0.008));

    // ── Draw ────────────────────────────────────────────────────────────────────
    drawGround(c2d, w, h);

    const blooms = bloomsRef.current;
    for (let i = blooms.length - 1; i >= 0; i--) {
      const b = blooms[i];
      const age = (now - b.born) / 1000;
      b.life = Math.max(0, 1 - age / 4.2);
      b.r = b.maxR * (1 - Math.pow(1 - Math.min(1, age / 2.6), 2));
      if (b.life <= 0) {
        blooms.splice(i, 1);
        continue;
      }
      const px = b.x * w;
      const py = b.y * h;
      const rr = b.r * dpr;

      // expanding ring
      c2d.beginPath();
      c2d.lineWidth = (b.hue === "gold" ? 2.4 : 1.6) * dpr;
      c2d.strokeStyle = hueColor(b.hue, b.life * 0.55);
      c2d.arc(px, py, rr, 0, Math.PI * 2);
      c2d.stroke();

      // soft inner fill
      const grad = c2d.createRadialGradient(px, py, 0, px, py, Math.max(1, rr));
      grad.addColorStop(0, hueColor(b.hue, b.life * 0.22));
      grad.addColorStop(1, hueColor(b.hue, 0));
      c2d.fillStyle = grad;
      c2d.beginPath();
      c2d.arc(px, py, Math.max(1, rr), 0, Math.PI * 2);
      c2d.fill();

      // struck-point dot
      c2d.beginPath();
      c2d.fillStyle = hueColor(b.hue, b.life * 0.9);
      c2d.arc(px, py, 2.4 * dpr, 0, Math.PI * 2);
      c2d.fill();
    }

    setStats((s) => (s.perSec === density ? s : { ...s, perSec: density }));

    rafRef.current = requestAnimationFrame(loop);
  }, []);

  // ── Start (user gesture unlocks AudioContext) ─────────────────────────────────
  const start = useCallback(async () => {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    ctxRef.current = ctx;
    try {
      await ctx.resume();
    } catch {
      /* best-effort resume */
    }

    engineRef.current = buildCarillonEngine(ctx);

    feedRef.current = connectFeed(
      (e) => {
        const q = queueRef.current;
        if (q.length >= QUEUE_CAP) q.shift(); // drop oldest to stay musical
        q.push(e);
      },
      (s) => setStatus(s),
    );

    setPhase("running");
    rafRef.current = requestAnimationFrame(loop);
  }, [loop]);

  const liveBadge = status.mode === "live";

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#efe7d6] text-stone-900">
      {/* Canvas atlas field */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />

      {/* Stage labels on the bright field (dark ink for contrast) */}
      <div className="pointer-events-none absolute left-5 top-5 z-10 max-w-md">
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-stone-900 drop-shadow-[0_1px_0_rgba(255,255,255,0.6)]">
          Wiki Carillon
        </h1>
        <p className="mt-1 text-base text-stone-700">
          The world writing itself, struck as bells over an atlas.
        </p>
      </div>

      {/* Status badge */}
      <div className="absolute right-5 top-5 z-10 flex items-center gap-2">
        <span
          className={[
            "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-base font-medium shadow-sm ring-1",
            liveBadge
              ? "bg-emerald-50 text-emerald-800 ring-emerald-300"
              : "bg-amber-50 text-amber-800 ring-amber-300",
          ].join(" ")}
        >
          <span
            className={[
              "h-2.5 w-2.5 rounded-full",
              liveBadge ? "bg-emerald-500" : "bg-amber-500",
            ].join(" ")}
            aria-hidden="true"
          />
          {status.label}
        </span>
      </div>

      {/* Live stats (translucent dark panel for readable contrast) */}
      {phase === "running" && (
        <div className="absolute bottom-5 left-5 z-10 rounded-xl bg-stone-900/80 px-4 py-3 text-base text-stone-100 backdrop-blur-sm">
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <span>
              <span className="text-stone-400">bells rung</span>{" "}
              <span className="font-semibold tabular-nums">{stats.rung}</span>
            </span>
            <span>
              <span className="text-stone-400">edits/sec</span>{" "}
              <span className="font-semibold tabular-nums">{stats.perSec}</span>
            </span>
          </div>
          {stats.lastTitle && (
            <div className="mt-1 max-w-sm truncate text-sm text-stone-300">
              <span className="text-amber-300">{stats.lastWiki}</span> · {stats.lastTitle}
            </div>
          )}
        </div>
      )}

      {/* Notes toggle */}
      <button
        type="button"
        onClick={() => setShowNotes((v) => !v)}
        className="absolute bottom-5 right-5 z-20 min-h-[44px] rounded-xl bg-stone-900/80 px-4 py-2.5 text-base font-medium text-stone-100 backdrop-blur-sm transition hover:bg-stone-900"
      >
        {showNotes ? "Close notes" : "Read the design notes"}
      </button>

      {/* Design notes panel */}
      {showNotes && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-stone-950/55 p-4 backdrop-blur-sm">
          <div className="max-h-[80vh] max-w-2xl overflow-auto rounded-2xl bg-stone-900 p-6 text-stone-100 shadow-2xl ring-1 ring-stone-700">
            <h2 className="font-serif text-2xl font-semibold text-amber-200">Design notes</h2>
            <p className="mt-3 text-base leading-relaxed text-stone-200">
              <span className="font-semibold">What does the world sound like as it writes
              itself?</span>{" "}
              Every public edit on Wikipedia rings a struck FM bell over a pale atlas field. Edit
              size sets pitch and decay (big edits ring low and long, small ones bright and short);
              each wiki keeps its own place on the stage by stereo pan and vertical band.
            </p>
            <ul className="mt-4 space-y-2 text-base text-stone-200">
              <li>
                <span className="font-semibold text-amber-200">Gold</span> rings — large edits.
                <span className="font-semibold text-violet-300"> Violet</span> swells — a brand-new
                or anonymous editor. <span className="font-semibold text-stone-400">Muted</span>{" "}
                woodblocks — bot edits.
              </li>
              <li>
                Input is the keyless, CORS-enabled Wikimedia EventStreams{" "}
                <code className="rounded bg-stone-800 px-1">recentchange</code> SSE feed, read
                directly client-side — nothing is sent or stored.
              </li>
              <li>
                If the live stream is blocked or slow, the piece transparently falls back to a
                synthetic Poisson edit generator so it always rings (badge turns amber).
              </li>
              <li>
                Edits are throttled to ~6 bells/sec with a voice cap and refractory, so a busy
                stream stays musical; pitches snap to a warm major pentatonic.
              </li>
            </ul>
            <p className="mt-4 text-sm text-stone-400">
              After Hatnote&rsquo;s <em>Listen to Wikipedia</em> (Stephen LaPorte &amp; Mahmoud
              Hashemi), Brian Eno&rsquo;s generative ambient, and KLING KLANG KLONG&rsquo;s{" "}
              <em>Sounds of the Unseen</em>.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-xl bg-amber-300 px-4 py-2.5 text-base font-semibold text-stone-900 transition hover:bg-amber-200"
              >
                Close
              </button>
              <Link
                href="/dream"
                className="min-h-[44px] rounded-xl px-4 py-2.5 text-base font-medium text-stone-300 underline-offset-4 hover:underline"
              >
                Back to the dream lab
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Start gate */}
      {phase === "intro" && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#efe7d6]/85 p-6 backdrop-blur-sm">
          <div className="max-w-lg text-center">
            <h2 className="font-serif text-4xl font-semibold tracking-tight text-stone-900">
              Wiki Carillon
            </h2>
            <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-stone-700">
              The live, public stream of Wikipedia edits, played as a bright civic carillon. Each
              edit strikes a bell; new editors swell; bots tap a muted woodblock. It accretes into
              an ever-shifting bell composition that never repeats.
            </p>
            <button
              type="button"
              onClick={start}
              className="mt-7 min-h-[44px] rounded-xl bg-stone-900 px-6 py-3 text-xl font-semibold text-amber-100 shadow-lg transition hover:bg-stone-800"
            >
              Ring the carillon
            </button>
            <p className="mt-4 text-sm text-stone-500">
              Sound on. Works offline with a synthetic edit stream.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
