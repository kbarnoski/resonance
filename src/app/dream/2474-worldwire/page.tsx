"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createEngine, deltaToWish, snapToScale, type Engine } from "./audio";

// ════════════════════════════════════════════════════════════════════════════
// Worldwire (2474)  —  route /dream/2474-worldwire
//
// THE ONE QUESTION: "What does the whole world editing its shared encyclopedia,
// right now, sound like?"
//
// A live sonification of the global Wikimedia recent-changes stream. Each edit
// anywhere on Earth strikes a just-intoned bell (big edits ring LOW, tiny edits
// ring HIGH); each brand-new article blooms a warm sustained swell. The visitor
// does not play it — the world does. You only shape the listening.
//
// A Resonance-grade descendant of Hatnote's "Listen to Wikipedia" (Stephen
// LaPorte & Mahmoud Hashemi, 2013 — listen.hatnote.com). What is different here:
// a strict 7-limit just-intonation lattice, a Resonance ripple-field visual, and
// a deterministic synthetic fallback so the piece is always alive with zero net.
// ════════════════════════════════════════════════════════════════════════════

// ── Event shape we care about ────────────────────────────────────────────────
interface WikiEvent {
  type: string; // "edit" | "new" | "log" | "categorize"
  wiki: string; // e.g. "enwiki"
  title: string;
  bot: boolean;
  delta: number; // signed byte change
  ts: number; // arrival time (ms)
}

const STREAM_URL = "https://stream.wikimedia.org/v2/stream/recentchange";
const OPEN_TIMEOUT_MS = 7000;

// Language filter options — value is the `wiki` prefix to keep ("" = all).
const LANG_OPTIONS: { label: string; value: string }[] = [
  { label: "All wikis", value: "" },
  { label: "English", value: "enwiki" },
  { label: "German", value: "dewiki" },
  { label: "French", value: "frwiki" },
  { label: "Spanish", value: "eswiki" },
  { label: "Japanese", value: "jawiki" },
  { label: "Commons", value: "commonswiki" },
];

// ── Deterministic RNG for the synthetic fallback (mulberry32) ─────────────────
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SYN_WIKIS = ["enwiki", "dewiki", "frwiki", "eswiki", "jawiki", "commonswiki"];
const SYN_WORDS = [
  "River",
  "Dynasty",
  "Sonata",
  "Nebula",
  "Harbor",
  "Protocol",
  "Meridian",
  "Lichen",
  "Cathedral",
  "Isotope",
  "Monsoon",
  "Foxglove",
  "Cartography",
  "Quartet",
  "Estuary",
  "Almanac",
];

function synTitle(rng: () => number): string {
  const a = SYN_WORDS[Math.floor(rng() * SYN_WORDS.length)];
  const b = SYN_WORDS[Math.floor(rng() * SYN_WORDS.length)];
  return rng() > 0.5 ? `${a} ${b}` : a;
}

// Stable hash → normalized [0,1) position, so the same article always lands in
// the same spot on the field.
function hashPos(title: string): { x: number; y: number } {
  let h = 2166136261;
  for (let i = 0; i < title.length; i++) {
    h ^= title.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const x = ((h >>> 0) % 10000) / 10000;
  let h2 = h ^ 0x9e3779b9;
  h2 = Math.imul(h2 ^ (h2 >>> 13), 0x85ebca6b);
  const y = ((h2 >>> 0) % 10000) / 10000;
  return { x, y };
}

// ── A visible bloom on the field ─────────────────────────────────────────────
interface Bloom {
  x: number; // 0..1 normalized
  y: number; // 0..1 normalized
  maxR: number; // px at full field size
  born: number; // ms
  life: number; // ms
  title: string;
  isNew: boolean;
  bot: boolean;
  mag: number; // |delta|, for label ranking
}

type FeedMode = "connecting" | "live" | "demo";

export default function WorldwirePage() {
  const [started, setStarted] = useState(false);
  const [audioUnavailable, setAudioUnavailable] = useState(false);
  const [feedMode, setFeedMode] = useState<FeedMode>("connecting");
  const [showNotes, setShowNotes] = useState(false);
  const [lang, setLang] = useState("");
  const [hideBots, setHideBots] = useState(false);
  const [readout, setReadout] = useState({ eps: 0, langs: 0, total: 0 });

  // Mutable refs (read inside the long-lived loop without re-subscribing).
  const langRef = useRef(lang);
  const hideBotsRef = useRef(hideBots);
  useEffect(() => {
    langRef.current = lang;
  }, [lang]);
  useEffect(() => {
    hideBotsRef.current = hideBots;
  }, [hideBots]);

  // Feed-mode ref mirror so the render effect can read the latest without deps.
  const feedModeRef = useRef<FeedMode>("connecting");
  useEffect(() => {
    feedModeRef.current = feedMode;
  }, [feedMode]);

  const engineRef = useRef<Engine | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bloomsRef = useRef<Bloom[]>([]);
  const epsBufRef = useRef<number[]>([]);
  const langsSeenRef = useRef<Set<string>>(new Set());
  const totalRef = useRef(0);

  // ── Handle one incoming (already-parsed) event ─────────────────────────────
  const ingest = useCallback((ev: WikiEvent) => {
    // Filter by language + bots.
    const wantWiki = langRef.current;
    if (wantWiki && ev.wiki !== wantWiki) return;
    if (hideBotsRef.current && ev.bot) return;
    if (ev.type !== "edit" && ev.type !== "new") return;

    langsSeenRef.current.add(ev.wiki);
    totalRef.current += 1;
    epsBufRef.current.push(ev.ts);

    const mag = Math.abs(ev.delta);
    const eng = engineRef.current;
    if (eng) {
      const isNew = ev.type === "new";
      const wish = deltaToWish(ev.delta);
      const freq = snapToScale(wish);
      const velocity = 0.35 + Math.min(0.6, Math.log1p(mag) / 12);
      if (isNew) {
        // New articles ring an octave down for a warmer swell.
        eng.swell(freq * 0.5, velocity);
      } else {
        eng.bell(freq, velocity, ev.bot);
      }
    }

    const { x, y } = hashPos(ev.title);
    bloomsRef.current.push({
      x,
      y,
      maxR: 14 + Math.min(120, Math.log1p(mag) * 14),
      born: ev.ts,
      life: ev.type === "new" ? 5200 : 3600,
      title: ev.title,
      isNew: ev.type === "new",
      bot: ev.bot,
      mag,
    });
    // Keep the field bounded.
    if (bloomsRef.current.length > 260) {
      bloomsRef.current.splice(0, bloomsRef.current.length - 260);
    }
  }, []);

  // ── Start: audio context + feed + render loop ──────────────────────────────
  const handleStart = useCallback(async () => {
    if (started) return;
    const eng = createEngine();
    if (!eng) {
      setAudioUnavailable(true);
      return;
    }
    engineRef.current = eng;
    try {
      await eng.resume();
    } catch {
      /* resume best-effort */
    }
    setStarted(true);
  }, [started]);

  // ── The long-lived effect: only mounts once `started` flips true ───────────
  useEffect(() => {
    if (!started) return;

    let raf = 0;
    let disposed = false;
    let source: EventSource | null = null;
    let synTimer: number | null = null;
    let openTimer: number | null = null;

    // --- synthetic fallback generator (Poisson-ish, deterministic seed) ---
    const rng = makeRng(0x2474);
    const startSynthetic = () => {
      if (disposed) return;
      setFeedMode("demo");
      const tick = () => {
        if (disposed) return;
        const roll = rng();
        const type = roll > 0.94 ? "new" : "edit";
        const bot = type === "edit" && rng() > 0.72;
        // Edit sizes: mostly small, occasionally large (heavy tail).
        const base = rng();
        const delta = Math.round(
          (rng() > 0.5 ? 1 : -1) * (base < 0.8 ? base * 400 : 400 + base * 12000),
        );
        ingest({
          type,
          wiki: SYN_WIKIS[Math.floor(rng() * SYN_WIKIS.length)],
          title: synTitle(rng),
          bot,
          delta: type === "new" ? Math.abs(delta) + 800 : delta,
          ts: performance.timeOrigin + performance.now(),
        });
        // Mean ~2.5 events/sec; exponential inter-arrival.
        const wait = -Math.log(1 - rng()) * 400 + 40;
        synTimer = window.setTimeout(tick, wait);
      };
      synTimer = window.setTimeout(tick, 200);
    };

    // --- live feed ---
    try {
      source = new EventSource(STREAM_URL);
      openTimer = window.setTimeout(() => {
        // Never opened in time → fall back.
        if (!disposed && feedModeRef.current !== "live") {
          try {
            source?.close();
          } catch {
            /* ignore */
          }
          source = null;
          startSynthetic();
        }
      }, OPEN_TIMEOUT_MS);

      source.onopen = () => {
        if (disposed) return;
        feedModeRef.current = "live";
        setFeedMode("live");
        if (openTimer) window.clearTimeout(openTimer);
      };
      source.onmessage = (msg: MessageEvent) => {
        if (disposed) return;
        try {
          const d = JSON.parse(msg.data as string);
          const oldLen = d?.length?.old ?? 0;
          const newLen = d?.length?.new ?? 0;
          ingest({
            type: typeof d?.type === "string" ? d.type : "edit",
            wiki: typeof d?.wiki === "string" ? d.wiki : "unknown",
            title: typeof d?.title === "string" ? d.title : "(untitled)",
            bot: Boolean(d?.bot),
            delta: (newLen || 0) - (oldLen || 0),
            ts: performance.timeOrigin + performance.now(),
          });
        } catch {
          /* skip malformed frame */
        }
      };
      source.onerror = () => {
        // If we never connected, degrade to synthetic. If we WERE live, the
        // browser auto-reconnects, so leave it be.
        if (disposed) return;
        if (feedModeRef.current !== "live" && !synTimer) {
          try {
            source?.close();
          } catch {
            /* ignore */
          }
          source = null;
          if (openTimer) window.clearTimeout(openTimer);
          startSynthetic();
        }
      };
    } catch {
      startSynthetic();
    }

    // --- render loop ---
    const canvas = canvasRef.current;
    const ctx2d = canvas?.getContext("2d") ?? null;

    const sizeCanvas = () => {
      if (!canvas) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    };
    sizeCanvas();
    window.addEventListener("resize", sizeCanvas);

    let lastReadout = 0;

    const frame = () => {
      if (disposed) return;
      const now = performance.timeOrigin + performance.now();

      if (ctx2d && canvas) {
        const W = canvas.width;
        const H = canvas.height;
        // Trailing fade rather than hard clear → soft comet tails.
        ctx2d.fillStyle = "rgba(8, 6, 16, 0.16)";
        ctx2d.fillRect(0, 0, W, H);

        const blooms = bloomsRef.current;
        // Rank the largest live blooms to label a few.
        const labelable = blooms
          .filter((b) => now - b.born < b.life)
          .sort((a, b) => b.mag - a.mag)
          .slice(0, 4);

        for (let i = blooms.length - 1; i >= 0; i--) {
          const b = blooms[i];
          const age = now - b.born;
          if (age > b.life) {
            blooms.splice(i, 1);
            continue;
          }
          const t = age / b.life; // 0..1
          const r = b.maxR * (0.15 + t * 0.85) * (Math.min(W, H) / 720);
          const cx = b.x * W;
          const cy = b.y * H;
          const fade = 1 - t;

          // Colour: violet family. New articles brightest; bots dim/desaturated.
          let hue = 268;
          let light = 66;
          let alpha = fade * 0.5;
          if (b.isNew) {
            hue = 276;
            light = 78;
            alpha = fade * 0.72;
          } else if (b.bot) {
            hue = 258;
            light = 46;
            alpha = fade * 0.28;
          }

          ctx2d.beginPath();
          ctx2d.arc(cx, cy, r, 0, Math.PI * 2);
          ctx2d.strokeStyle = `hsla(${hue}, 72%, ${light}%, ${alpha})`;
          ctx2d.lineWidth = (b.isNew ? 2.4 : 1.4) * (Math.min(W, H) / 720);
          ctx2d.stroke();

          // Soft core dot at the seed point.
          const coreA = fade * (b.isNew ? 0.5 : b.bot ? 0.14 : 0.3);
          ctx2d.beginPath();
          ctx2d.arc(cx, cy, 2.2 * (Math.min(W, H) / 720), 0, Math.PI * 2);
          ctx2d.fillStyle = `hsla(${hue}, 80%, ${light + 6}%, ${coreA})`;
          ctx2d.fill();
        }

        // Labels for the biggest few.
        ctx2d.font = `${12 * (Math.min(W, H) / 720)}px ui-sans-serif, system-ui, sans-serif`;
        ctx2d.textBaseline = "middle";
        for (const b of labelable) {
          const age = now - b.born;
          const fade = 1 - age / b.life;
          const cx = b.x * W;
          const cy = b.y * H;
          const label =
            b.title.length > 28 ? b.title.slice(0, 27) + "…" : b.title;
          ctx2d.fillStyle = `hsla(276, 40%, 88%, ${fade * 0.8})`;
          ctx2d.fillText(label, cx + 10, cy);
        }
      }

      // Update the readout ~4x/sec.
      if (now - lastReadout > 250) {
        lastReadout = now;
        const cutoff = now - 1000;
        epsBufRef.current = epsBufRef.current.filter((t) => t > cutoff);
        setReadout({
          eps: epsBufRef.current.length,
          langs: langsSeenRef.current.size,
          total: totalRef.current,
        });
      }

      raf = window.requestAnimationFrame(frame);
    };
    raf = window.requestAnimationFrame(frame);

    // --- cleanup ---
    return () => {
      disposed = true;
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", sizeCanvas);
      if (synTimer) window.clearTimeout(synTimer);
      if (openTimer) window.clearTimeout(openTimer);
      try {
        source?.close();
      } catch {
        /* ignore */
      }
    };
    // ingest is stable (useCallback, empty deps); feed mode read via ref.
  }, [started, ingest]);

  // Dispose the audio engine on unmount.
  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="relative min-h-[calc(100vh-3rem)] w-full overflow-hidden bg-background">
      {/* Art layer */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full max-w-full"
        aria-hidden
      />

      {/* Foreground UI */}
      <div className="relative z-10 flex min-h-[calc(100vh-3rem)] flex-col p-5 sm:p-8">
        {/* Header row */}
        <header className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Worldwire
            </h1>
            <FeedBadge mode={feedMode} started={started} />
          </div>
          <p className="max-w-xl text-base text-muted-foreground">
            The whole world editing its shared encyclopedia, right now, as a
            field of just-intoned bells.
          </p>
        </header>

        {/* Live readout */}
        {started && (
          <div className="mt-5 flex flex-wrap gap-x-8 gap-y-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <span>
              <span className="text-foreground">{readout.eps}</span> edits/sec
            </span>
            <span>
              <span className="text-foreground">{readout.langs}</span> wikis seen
            </span>
            <span>
              <span className="text-foreground">{readout.total}</span> heard
            </span>
          </div>
        )}

        {/* Spacer pushes controls to the bottom */}
        <div className="flex-1" />

        {/* Start gate / controls */}
        {!started ? (
          <div className="flex flex-col items-start gap-4">
            {audioUnavailable ? (
              <p className="max-w-md text-base text-destructive">
                Web Audio is unavailable in this browser, so Worldwire cannot
                sound. Everything here needs the audio engine — try a current
                desktop browser.
              </p>
            ) : (
              <>
                <p className="max-w-md text-base text-muted-foreground">
                  Nothing plays until you ask it to (browser autoplay policy).
                  Press start and the world begins to ring.
                </p>
                <button
                  type="button"
                  onClick={handleStart}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Start listening
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-mono text-xs uppercase tracking-[0.18em]">
                Wiki
              </span>
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground transition-colors hover:bg-accent"
              >
                {LANG_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={() => setHideBots((v) => !v)}
              aria-pressed={hideBots}
              className={
                "min-h-[44px] rounded-md border border-border px-4 text-sm transition-colors " +
                (hideBots
                  ? "bg-primary/15 text-foreground hover:bg-primary/25"
                  : "bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground")
              }
            >
              {hideBots ? "Bots hidden" : "Bots audible"}
            </button>
          </div>
        )}
      </div>

      {/* Corner: design notes */}
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="absolute bottom-4 right-4 z-10 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {showNotes && <NotesModal onClose={() => setShowNotes(false)} />}
    </div>
  );
}

// ── Feed status badge ─────────────────────────────────────────────────────────
function FeedBadge({ mode, started }: { mode: FeedMode; started: boolean }) {
  if (!started) return null;
  const label =
    mode === "live"
      ? "live feed"
      : mode === "demo"
        ? "demo stream (feed unavailable)"
        : "connecting…";
  return (
    <span className="flex items-center gap-1.5 rounded-md border border-border bg-background/60 px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
      <span
        className={
          "inline-block h-1.5 w-1.5 rounded-full " +
          (mode === "live"
            ? "bg-primary"
            : mode === "demo"
              ? "bg-muted-foreground"
              : "bg-muted-foreground/50")
        }
        aria-hidden
      />
      {label}
    </span>
  );
}

// ── Design-notes modal ────────────────────────────────────────────────────────
function NotesModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Worldwire — design notes
        </h2>
        <div className="mt-4 space-y-3 text-base text-muted-foreground">
          <p>
            Worldwire sonifies Wikimedia&apos;s live global{" "}
            <span className="text-foreground">recent-changes</span> stream. Every
            edit anywhere on Earth strikes a bell; every brand-new article opens a
            warm sustained swell. You do not play it — the world does.
          </p>
          <p>
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Mapping
            </span>
            <br />
            Pitch is <span className="text-foreground">inversely</span>{" "}
            proportional to edit size: a huge edit rings low, a one-byte tweak
            rings high. Bots wear a lowpass &ldquo;cloth over the bell&rdquo; —
            duller and quieter — or you can hide them. New articles ring an octave
            down as a richer pad.
          </p>
          <p>
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Scale
            </span>
            <br />
            Every bell snaps to a strict 7-limit{" "}
            <span className="text-foreground">just-intonation</span> lattice
            (1/1, 9/8, 5/4, 3/2, 5/3) across five octaves, so however the world
            edits, the field stays consonant. Polyphony is capped at 16 voices and
            passed through a limiter so bursts never clip.
          </p>
          <p>
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Layout &amp; fallback
            </span>
            <br />
            Each event blooms a ripple whose radius tracks edit size; its position
            is a stable hash of the title, so the same article always lands in the
            same place. If the stream cannot connect (offline, blocked, CORS), a
            deterministic synthetic generator keeps the piece fully alive — the
            badge switches to <span className="text-foreground">demo stream</span>.
          </p>
          <p>
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Lineage
            </span>
            <br />
            A descendant of Hatnote&apos;s{" "}
            <span className="text-foreground">
              &ldquo;Listen to Wikipedia&rdquo;
            </span>{" "}
            (Stephen LaPorte &amp; Mahmoud Hashemi, 2013 — listen.hatnote.com).
            Worldwire differs in its just-intoned scale, its Resonance ripple
            field, and its offline synthetic fallback. It is an outward-facing
            piece: about the world, not about the visitor.
          </p>
        </div>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
