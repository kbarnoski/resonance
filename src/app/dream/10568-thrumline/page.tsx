"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSafeMaster } from "../_shared/visionary/safeMaster";
import { PrototypeNav } from "../_shared/prototype-nav";

// ════════════════════════════════════════════════════════════════════════════
// Thrumline (10568)
//
// THE ONE QUESTION: "What if the world's live activity — every edit being made
// to every Wikipedia on Earth, right now — were a planetary carillon you could
// hear and re-perform?"
//
// A live data-sonification instrument. INPUT is the public, CORS-open, keyless
// Wikimedia recent-changes EventStream (Server-Sent Events). Each incoming edit
// is struck as an inharmonic bell and placed on a rotating 90-second SVG clock-
// face: angle = arrival time within the current sweep, radius = edit magnitude,
// hue = language mapped onto a violet→indigo→slate ramp, timbre = human vs bot.
//
// RE-PERFORMABLE: the last 90 seconds are kept as a ring buffer. Drag the sweep-
// hand backward and the bells it crosses re-sound — the live feed writes a score
// you can re-perform by hand. This is the instrument verb.
//
// A descendant of Hatnote's "Listen to Wikipedia" (Stephen LaPorte &
// Mahmoud Hashemi, 2013), re-imagined as a clock-face carillon rendered entirely
// in inline SVG (no canvas, no WebGL).
//
// FALLBACK: if EventSource errors or never connects within ~2.5s, a seeded
// synthetic stream (mulberry32(0x10568), deterministic) keeps the carillon alive
// with zero network, badged "offline — simulated stream". The whole piece reads
// on a muted phone: the clock rotates and bells bloom regardless of audio; audio
// is deferred to the first Start tap per browser autoplay policy.
// ════════════════════════════════════════════════════════════════════════════

const STREAM_URL = "https://stream.wikimedia.org/v2/stream/recentchange";
const SWEEP_MS = 90_000; // one full revolution = 90 seconds

// ── Deterministic PRNG (mulberry32) — the only source of "randomness" ──────────
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── The normalized shape we care about from a recentchange event ───────────────
interface WikiEvent {
  type: string; // "edit" | "new"
  wiki: string; // e.g. "enwiki"
  title: string;
  bot: boolean;
  delta: number; // signed byte change
  lang: string; // language-ish code extracted from wiki
}

interface RawChange {
  type?: string;
  wiki?: string;
  title?: string;
  bot?: boolean;
  length?: { old?: number; new?: number };
  meta?: { domain?: string };
}

function langFromWiki(wiki: string): string {
  const m = wiki.match(/^([a-z-]+)wiki/);
  return m ? m[1] : wiki || "??";
}

function parseChange(raw: RawChange): WikiEvent {
  const wiki = raw.wiki ?? "";
  const oldL = raw.length?.old ?? 0;
  const newL = raw.length?.new ?? oldL;
  return {
    type: raw.type ?? "edit",
    wiki,
    title: raw.title ?? "",
    bot: !!raw.bot,
    delta: newL - oldL,
    lang: langFromWiki(wiki),
  };
}

// 0..1 log-scaled edit magnitude.
function mag01(delta: number): number {
  return Math.min(1, Math.log10(1 + Math.abs(delta)) / 4);
}

// Flood-time significance: prefer new articles, then big edits, penalize bots.
function significance(ev: WikiEvent): number {
  return (
    Math.log10(1 + Math.abs(ev.delta)) +
    (ev.type === "new" ? 4 : 0) -
    (ev.bot ? 2 : 0)
  );
}

// Map a language deterministically onto the violet→indigo→slate ramp ONLY.
function langHue(lang: string): { hue: number; sat: number } {
  let h = 0;
  for (let i = 0; i < lang.length; i++) h = (h * 31 + lang.charCodeAt(i)) >>> 0;
  const hue = 244 + (h % 52); // 244..296 — indigo → violet
  const sat = 34 + ((h >> 4) % 30); // 34..64 — muted, never garish
  return { hue, sat };
}

// Pan a language across the stereo field ("longitude of language").
function langPan(lang: string): number {
  let h = 0;
  for (let i = 0; i < lang.length; i++) h = (h * 17 + lang.charCodeAt(i)) >>> 0;
  return ((h % 1000) / 1000) * 1.4 - 0.7; // -0.7..0.7
}

// ── Bell geometry + voice parameters, derived once at strike time ──────────────
interface BellRecord {
  t: number; // arrival time (performance.now, ms)
  x: number; // SVG coords in a 0..100 viewBox
  y: number;
  mag: number;
  hue: number;
  sat: number;
  light: number;
  maxR: number;
  life: number;
  freq: number;
  isBot: boolean;
  isNew: boolean;
  pan: number;
  lang: string;
}

function makeBellRecord(ev: WikiEvent, t: number): BellRecord {
  const mag = mag01(ev.delta);
  const { hue, sat } = langHue(ev.lang);
  const isNew = ev.type === "new";
  const phase = (t % SWEEP_MS) / SWEEP_MS;
  const ang = phase * Math.PI * 2; // 0 at top, clockwise
  const rr = 15 + mag * 25; // bigger edit → outer ring
  const x = 50 + rr * Math.sin(ang);
  const y = 50 - rr * Math.cos(ang);
  // bigger edit → lower / deeper bell
  let freq = 820 * Math.pow(150 / 820, mag);
  if (isNew) freq *= 0.8;
  return {
    t,
    x,
    y,
    mag,
    hue,
    sat,
    light: 56 + mag * 12,
    maxR: 2 + mag * 6,
    life: (isNew ? 3900 : 2400) + mag * 3000,
    freq,
    isBot: ev.bot,
    isNew,
    pan: langPan(ev.lang),
    lang: ev.lang,
  };
}

// ── Inharmonic struck-bell voices — human vs bot ──────────────────────────────
const HUMAN_RATIOS = [1, 2.76, 5.4, 8.93];
const HUMAN_GAINS = [1, 0.5, 0.3, 0.16];
const BOT_RATIOS = [1, 2.0, 3.01];
const BOT_GAINS = [1, 0.42, 0.22];

interface AudioBus {
  ctx: AudioContext;
  bus: GainNode;
  safe: ReturnType<typeof createSafeMaster>;
  voices: number[]; // endsAt timestamps (performance.now ms)
  muted: boolean;
}

function strikeVoice(audio: AudioBus, rec: BellRecord): void {
  if (audio.muted) return;
  const { ctx, bus, voices } = audio;
  const now = ctx.currentTime;
  const nowMs = performance.now();
  for (let i = voices.length - 1; i >= 0; i--) {
    if (voices[i] <= nowMs) voices.splice(i, 1);
  }
  if (voices.length >= 18) return; // voice cap — visuals still bloom elsewhere

  const isBot = rec.isBot;
  const ratios = isBot ? BOT_RATIOS : HUMAN_RATIOS;
  const gains = isBot ? BOT_GAINS : HUMAN_GAINS;
  const attack = 0.002;
  const decay = isBot ? 0.26 : 0.42; // ≤ 0.5s, fast-decaying
  const peak = (isBot ? 0.3 : 0.48) * (0.7 + rec.mag * 0.5);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, now);
  env.gain.exponentialRampToValueAtTime(Math.max(0.02, peak), now + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);

  let sink: AudioNode = bus;
  if (ctx.createStereoPanner) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, rec.pan));
    panner.connect(bus);
    sink = panner;
  }
  env.connect(sink);

  for (let i = 0; i < ratios.length; i++) {
    const osc = ctx.createOscillator();
    osc.type = isBot ? "triangle" : "sine";
    osc.frequency.value = rec.freq * ratios[i];
    const g = ctx.createGain();
    g.gain.value = gains[i];
    osc.connect(g);
    g.connect(env);
    osc.start(now);
    osc.stop(now + attack + decay + 0.05);
  }
  voices.push(nowMs + (attack + decay + 0.12) * 1000);
}

// ── Clock-face angular helpers ────────────────────────────────────────────────
function phaseFromPoint(x: number, y: number): number {
  const ang = Math.atan2(x - 50, -(y - 50)); // 0 at top, clockwise
  return (ang / (Math.PI * 2) + 1) % 1;
}

// Most recent past timestamp (within one sweep) whose phase equals `phase`.
function mapPhaseToTime(phase: number, now: number): number {
  const pn = (now % SWEEP_MS) / SWEEP_MS;
  const d = ((pn - phase) % 1 + 1) % 1;
  return now - d * SWEEP_MS;
}

// ── Synthetic titles / languages for the seeded fallback stream ────────────────
const SYNTH_LANGS = ["en", "de", "fr", "es", "ja", "ru", "it", "zh", "pt", "nl", "sv", "ar"];
const SYNTH_TITLES = [
  "Aurora borealis",
  "Coral reef",
  "History of tea",
  "Murmuration",
  "Bioluminescence",
  "List of lighthouses",
  "Glacier",
  "Migration of birds",
  "Quantum entanglement",
  "Typewriter",
];

// ════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ════════════════════════════════════════════════════════════════════════════

type Source = "connecting" | "live" | "simulated";
type Mode = "live" | "scrub";

interface Bloom extends BellRecord {
  id: number;
  born: number;
}

export default function ThrumlinePage() {
  const [source, setSource] = useState<Source>("connecting");
  const [mode, setMode] = useState<Mode>("live");
  const [audioOn, setAudioOn] = useState(false);
  const [muted, setMuted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [stats, setStats] = useState({ perMin: 0, total: 0 });
  const [, setTick] = useState(0);

  // Refs the animation / event loops read without re-rendering.
  const audioRef = useRef<AudioBus | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const synthTimerRef = useRef<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const pendingRef = useRef<WikiEvent[]>([]);
  const bloomsRef = useRef<Bloom[]>([]);
  const bufferRef = useRef<BellRecord[]>([]); // rolling 90s score
  const rateRef = useRef<number[]>([]);
  const countRef = useRef(0);
  const idRef = useRef(0);

  const rafRef = useRef(0);
  const lastSpawnRef = useRef(0);
  const handPhaseRef = useRef(0);
  const modeRef = useRef<Mode>("live");
  const scrubRef = useRef({ phase: 0, time: 0 });

  // ── Ingest a normalized event into the pending queue (bounded) ──
  const ingest = useCallback((ev: WikiEvent) => {
    const q = pendingRef.current;
    q.push(ev);
    if (q.length > 80) q.splice(0, q.length - 80);
  }, []);

  // ── Strike one bell: pluck audio (if enabled) + spawn a visual bloom ──
  const emitBell = useCallback((rec: BellRecord, doBuffer: boolean) => {
    const audio = audioRef.current;
    if (audio) strikeVoice(audio, rec);
    const arr = bloomsRef.current;
    arr.push({ ...rec, id: ++idRef.current, born: performance.now() });
    if (arr.length > 120) arr.splice(0, arr.length - 120);
    if (doBuffer) {
      const buf = bufferRef.current;
      buf.push(rec);
      if (buf.length > 260) buf.splice(0, buf.length - 260);
      countRef.current++;
      rateRef.current.push(rec.t);
    }
  }, []);

  // ── Seeded synthetic stream (deterministic zero-network fallback) ──
  const startSynthetic = useCallback(() => {
    setSource("simulated");
    const rng = makeRng(0x10568);
    const gen = (): WikiEvent => {
      const r = rng();
      const lang = SYNTH_LANGS[(rng() * SYNTH_LANGS.length) | 0];
      const bot = rng() < 0.4;
      const isNew = r < 0.12;
      const big = rng() < 0.22;
      const base = big ? 300 + rng() * 9000 : rng() * 250;
      const delta = Math.round(
        (rng() < 0.5 ? -1 : 1) * (isNew ? 400 + rng() * 6000 : base),
      );
      return {
        type: isNew ? "new" : "edit",
        wiki: `${lang}wiki`,
        title: SYNTH_TITLES[(rng() * SYNTH_TITLES.length) | 0],
        bot: isNew ? false : bot,
        delta,
        lang,
      };
    };
    const schedule = () => {
      const gap = -Math.log(1 - rng()) * 95; // Poisson-ish arrivals
      synthTimerRef.current = window.setTimeout(
        () => {
          const burst = rng() < 0.12 ? 2 + ((rng() * 3) | 0) : 1;
          for (let i = 0; i < burst; i++) ingest(gen());
          schedule();
        },
        Math.max(20, gap),
      );
    };
    schedule();
  }, [ingest]);

  // ── Connect the live SSE feed, with the seeded fallback ──
  const connectStream = useCallback(() => {
    setSource("connecting");
    if (typeof window === "undefined" || !("EventSource" in window)) {
      startSynthetic();
      return;
    }
    let settled = false;
    let es: EventSource;
    try {
      es = new EventSource(STREAM_URL);
    } catch {
      startSynthetic();
      return;
    }
    esRef.current = es;
    const fallback = window.setTimeout(() => {
      if (!settled) {
        try {
          es.close();
        } catch {
          /* noop */
        }
        esRef.current = null;
        startSynthetic();
      }
    }, 2500);
    es.onmessage = (msg) => {
      if (!settled) {
        settled = true;
        window.clearTimeout(fallback);
        setSource("live");
      }
      try {
        const raw = JSON.parse(msg.data) as RawChange;
        if (raw.type === "edit" || raw.type === "new") {
          ingest(parseChange(raw));
        }
      } catch {
        /* malformed line — ignore */
      }
    };
    es.onerror = () => {
      if (!settled) {
        window.clearTimeout(fallback);
        try {
          es.close();
        } catch {
          /* noop */
        }
        esRef.current = null;
        startSynthetic();
      }
      // if already live, EventSource auto-reconnects; leave it.
    };
  }, [ingest, startSynthetic]);

  // ── Connect the stream on mount (visual-only until audio is started) ──
  useEffect(() => {
    connectStream();
    return () => {
      if (esRef.current) {
        try {
          esRef.current.close();
        } catch {
          /* noop */
        }
        esRef.current = null;
      }
      if (synthTimerRef.current) window.clearTimeout(synthTimerRef.current);
    };
  }, [connectStream]);

  // ── The animation / strike heartbeat (rAF) ──
  useEffect(() => {
    const loop = () => {
      const now = performance.now();
      if (modeRef.current === "scrub") {
        handPhaseRef.current = scrubRef.current.phase;
      } else {
        handPhaseRef.current = (now % SWEEP_MS) / SWEEP_MS;
        const q = pendingRef.current;
        if (q.length && now - lastSpawnRef.current >= 70) {
          let bi = 0;
          let bs = -Infinity;
          for (let i = 0; i < q.length; i++) {
            const s = significance(q[i]);
            if (s > bs) {
              bs = s;
              bi = i;
            }
          }
          const ev = q[bi];
          pendingRef.current = q.slice(bi + 1); // stay current, drop the burst
          lastSpawnRef.current = now;
          emitBell(makeBellRecord(ev, now), true);
        }
      }
      // prune expired blooms
      const bl = bloomsRef.current;
      for (let i = bl.length - 1; i >= 0; i--) {
        if (now - bl[i].born >= bl[i].life) bl.splice(i, 1);
      }
      // prune buffer to the last sweep
      const buf = bufferRef.current;
      while (buf.length && buf[0].t < now - SWEEP_MS) buf.shift();
      // prune rate window to the last minute
      const rw = rateRef.current;
      while (rw.length && rw[0] < now - 60_000) rw.shift();

      setTick((t) => (t + 1) & 0xffff);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [emitBell]);

  // ── Stats ticker (cheap, off the rAF path) ──
  useEffect(() => {
    const id = window.setInterval(() => {
      setStats({ perMin: rateRef.current.length, total: countRef.current });
    }, 500);
    return () => window.clearInterval(id);
  }, []);

  // ── Full audio teardown on unmount ──
  useEffect(() => {
    return () => {
      const a = audioRef.current;
      if (a) {
        try {
          a.safe.disconnect();
        } catch {
          /* noop */
        }
        try {
          a.ctx.close();
        } catch {
          /* noop */
        }
      }
    };
  }, []);

  // ── Start: create + resume AudioContext on the user gesture ──
  const handleStart = useCallback(async () => {
    if (audioRef.current) return;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AC();
    try {
      await ctx.resume();
    } catch {
      /* resumes on the gesture regardless */
    }
    const safe = createSafeMaster(ctx, { gain: 0.85 });
    const bus = ctx.createGain();
    bus.gain.value = 0.15; // modest master
    bus.connect(safe.input);
    audioRef.current = { ctx, bus, safe, voices: [], muted: false };
    setAudioOn(true);
  }, []);

  const toggleMute = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    a.muted = !a.muted;
    a.bus.gain.setTargetAtTime(a.muted ? 0 : 0.15, a.ctx.currentTime, 0.04);
    setMuted(a.muted);
  }, []);

  // ── Pointer → scrub interaction (re-perform the last 90 seconds) ──
  const pointToSvg = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    };
  };

  const onScrubDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = pointToSvg(e.clientX, e.clientY);
    if (!p) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    const phase = phaseFromPoint(p.x, p.y);
    modeRef.current = "scrub";
    setMode("scrub");
    scrubRef.current = { phase, time: mapPhaseToTime(phase, performance.now()) };
    handPhaseRef.current = phase;
  };

  const onScrubMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (modeRef.current !== "scrub") return;
    const p = pointToSvg(e.clientX, e.clientY);
    if (!p) return;
    const phase = phaseFromPoint(p.x, p.y);
    const cur = mapPhaseToTime(phase, performance.now());
    const prev = scrubRef.current.time;
    const lo = Math.min(prev, cur);
    const hi = Math.max(prev, cur);
    const hits = bufferRef.current.filter((r) => r.t > lo && r.t <= hi);
    // cap re-plucks per crossing so a busy stretch never roars
    hits.sort((a, b) => b.mag - a.mag);
    for (let i = 0; i < Math.min(hits.length, 8); i++) emitBell(hits[i], false);
    scrubRef.current = { phase, time: cur };
    handPhaseRef.current = phase;
  };

  const onScrubUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (modeRef.current !== "scrub") return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    modeRef.current = "live";
    setMode("live");
    pendingRef.current = []; // drop the backlog accrued while scrubbing
    lastSpawnRef.current = performance.now();
  };

  // ── Derived render values ──
  const now = performance.now();
  const handPhase = handPhaseRef.current;
  const handAng = handPhase * Math.PI * 2;
  const handX = 50 + 44 * Math.sin(handAng);
  const handY = 50 - 44 * Math.cos(handAng);
  const blooms = bloomsRef.current;
  const buffer = bufferRef.current;

  return (
    <main className="relative min-h-screen w-full bg-background text-foreground">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 pb-24 pt-10 sm:px-8">
        {/* ── Header ── */}
        <header className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                10568 · Thrumline
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                Planetary carillon
              </h1>
            </div>
            <button
              onClick={() => setShowNotes(true)}
              className="min-h-[44px] shrink-0 rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Read the design notes
            </button>
          </div>
          <p className="max-w-2xl text-base text-muted-foreground">
            Every edit being made to every Wikipedia on Earth, right now, struck
            as a bell on a 90-second clock-face. Press Start, then drag the
            sweep-hand back to re-perform the last minute and a half.
          </p>

          {/* ── Status line ── */}
          <div className="flex flex-wrap items-center gap-3">
            {!audioOn ? (
              <button
                onClick={handleStart}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Start
              </button>
            ) : (
              <button
                onClick={toggleMute}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {muted ? "Unmute" : "Mute"}
              </button>
            )}
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {source === "live"
                ? "live · stream.wikimedia.org"
                : source === "connecting"
                  ? "connecting…"
                  : "offline — simulated stream"}
            </span>
            {source === "simulated" && (
              <span className="rounded-md bg-destructive/15 px-2 py-1 font-mono text-xs uppercase tracking-[0.18em] text-destructive">
                simulated
              </span>
            )}
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {stats.perMin}/min · {stats.total} struck
            </span>
            {mode === "scrub" && (
              <span className="rounded-md bg-primary/20 px-2 py-1 font-mono text-xs uppercase tracking-[0.18em] text-primary">
                re-performing
              </span>
            )}
          </div>
        </header>

        {/* ── The clock-face carillon (inline SVG) ── */}
        <div className="mx-auto w-full max-w-xl">
          <div className="aspect-square w-full overflow-hidden rounded-lg border border-border">
            <svg
              ref={svgRef}
              viewBox="0 0 100 100"
              className="h-full w-full touch-none select-none"
              style={{ cursor: mode === "scrub" ? "grabbing" : "grab" }}
              onPointerDown={onScrubDown}
              onPointerMove={onScrubMove}
              onPointerUp={onScrubUp}
              onPointerCancel={onScrubUp}
              role="img"
              aria-label="Rotating 90-second clock-face of live Wikipedia edits struck as bells"
            >
              <defs>
                <radialGradient id="tl-ground" cx="50%" cy="50%" r="60%">
                  <stop offset="0%" stopColor="hsl(250 30% 12%)" />
                  <stop offset="70%" stopColor="hsl(250 32% 8%)" />
                  <stop offset="100%" stopColor="hsl(250 40% 5%)" />
                </radialGradient>
                <radialGradient id="tl-hub" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="hsl(262 60% 78%)" />
                  <stop offset="100%" stopColor="hsl(258 45% 40%)" />
                </radialGradient>
              </defs>

              {/* ground */}
              <rect x="0" y="0" width="100" height="100" fill="url(#tl-ground)" />

              {/* graticule — concentric rings */}
              {[15, 27, 40].map((r) => (
                <circle
                  key={`ring-${r}`}
                  cx="50"
                  cy="50"
                  r={r}
                  fill="none"
                  stroke="hsl(255 30% 60%)"
                  strokeOpacity={0.12}
                  strokeWidth={0.25}
                />
              ))}
              <circle
                cx="50"
                cy="50"
                r="44"
                fill="none"
                stroke="hsl(255 35% 65%)"
                strokeOpacity={0.22}
                strokeWidth={0.4}
              />

              {/* graticule — radial spokes every 30° (12 hours) */}
              {Array.from({ length: 12 }, (_, i) => {
                const a = (i / 12) * Math.PI * 2;
                return (
                  <line
                    key={`spoke-${i}`}
                    x1={50 + 12 * Math.sin(a)}
                    y1={50 - 12 * Math.cos(a)}
                    x2={50 + 44 * Math.sin(a)}
                    y2={50 - 44 * Math.cos(a)}
                    stroke="hsl(255 30% 60%)"
                    strokeOpacity={i % 3 === 0 ? 0.16 : 0.07}
                    strokeWidth={i % 3 === 0 ? 0.3 : 0.18}
                  />
                );
              })}

              {/* buffered "score" — faint dots where scrubbing will strike */}
              {buffer.map((r, i) => (
                <circle
                  key={`buf-${i}`}
                  cx={r.x}
                  cy={r.y}
                  r={0.55}
                  fill={`hsl(${r.hue} ${r.sat}% ${r.light}%)`}
                  fillOpacity={0.22}
                />
              ))}

              {/* live blooms — each plucks its voice as it is born */}
              {blooms.map((b) => {
                const age = (now - b.born) / b.life;
                if (age >= 1) return null;
                const ease = 1 - Math.pow(1 - age, 2.2);
                const r = 1 + (b.maxR - 1) * ease;
                const op = 1 - age;
                const stroke = `hsl(${b.hue} ${b.sat}% ${Math.min(90, b.light + 22)}%)`;
                const fill = `hsl(${b.hue} ${b.sat}% ${b.light}%)`;
                return (
                  <g key={b.id}>
                    <circle
                      cx={b.x}
                      cy={b.y}
                      r={r}
                      fill={fill}
                      fillOpacity={op * 0.18}
                    />
                    <circle
                      cx={b.x}
                      cy={b.y}
                      r={r}
                      fill="none"
                      stroke={stroke}
                      strokeOpacity={op * (b.isNew ? 0.8 : 0.6)}
                      strokeWidth={b.isNew ? 0.5 : 0.35}
                    />
                    {age < 0.2 && (
                      <circle
                        cx={b.x}
                        cy={b.y}
                        r={0.8}
                        fill={`hsl(${b.hue} ${b.sat}% 92%)`}
                        fillOpacity={(1 - age / 0.2) * 0.9}
                      />
                    )}
                  </g>
                );
              })}

              {/* sweep-hand marking "now" (drag it back to re-perform) */}
              <line
                x1="50"
                y1="50"
                x2={handX}
                y2={handY}
                stroke="hsl(262 65% 80%)"
                strokeOpacity={0.85}
                strokeWidth={mode === "scrub" ? 0.9 : 0.55}
                strokeLinecap="round"
              />
              <circle
                cx={handX}
                cy={handY}
                r={mode === "scrub" ? 2.4 : 1.8}
                fill="url(#tl-hub)"
                stroke="hsl(262 70% 88%)"
                strokeOpacity={0.9}
                strokeWidth={0.3}
              />
              {/* center hub */}
              <circle cx="50" cy="50" r="2.2" fill="url(#tl-hub)" />
              <circle
                cx="50"
                cy="50"
                r="2.2"
                fill="none"
                stroke="hsl(258 45% 30%)"
                strokeWidth={0.3}
              />
            </svg>
          </div>

          {/* legend */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <span>angle = arrival · radius = size</span>
            <span>hue = language</span>
            <span>outer ring = larger edit · deeper bell</span>
          </div>
        </div>

        {!audioOn && (
          <p className="text-center text-sm text-muted-foreground">
            The clock rotates and bells bloom on a muted phone; audio begins when
            you press Start.
          </p>
        )}
      </div>

      {/* ── Design-notes dialog ── */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[82vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                Design notes
              </h2>
              <button
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The question:</span> what if
                the world&apos;s live activity — every edit being made to every
                Wikipedia on Earth, right now — were a planetary carillon you
                could hear and re-perform?
              </p>
              <p>
                <span className="text-foreground">Live source:</span> the public,
                CORS-open, keyless Wikimedia recent-changes EventStream (Server-
                Sent Events), read client-side with the browser EventSource API.
                If it errors or never connects within ~2.5 seconds, a seeded
                synthetic stream (deterministic mulberry32) keeps the carillon
                alive with zero network, badged &ldquo;offline — simulated
                stream&rdquo;.
              </p>
              <p>
                <span className="text-foreground">The mapping:</span> each edit
                is a struck bell on a rotating 90-second clock-face. Its angle is
                its arrival time within the current sweep; its radius comes from
                the edit&apos;s byte-magnitude (bigger edit rides the outer ring
                and rings a deeper bell); its hue maps the language onto a violet
                → indigo → slate ramp. Human and bot edits use two distinct
                inharmonic bell voices (partial ratios 1 : 2.76 : 5.40 : 8.93),
                panned by language.
              </p>
              <p>
                <span className="text-foreground">Re-performable:</span> the last
                90 seconds are held as a ring buffer — the faint dots on the
                face. Drag the sweep-hand backward and the bells it crosses
                re-sound. The live feed writes a score; your hand re-performs it.
              </p>
              <p>
                Everything — clock, graticule, sweep-hand and bells — is rendered
                as real inline SVG elements, animated via requestAnimationFrame.
                No canvas, no WebGL.
              </p>
              <p>
                <span className="text-foreground">Named reference:</span> Hatnote
                — <em>Listen to Wikipedia</em>, Stephen LaPorte &amp; Mahmoud
                Hashemi, 2013.
              </p>
            </div>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["10568-thrumline"]} />
    </main>
  );
}
