"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 16688 · albumvoyage — writing as a voyage through the whole of Karel's album.
//
//   "What if writing a long enough manuscript walked you through the form of
//    Karel's ENTIRE album — track by track — and the choir slowly drifted deeper
//    through it as you listened, so minute-5 differs from minute-1 by TIME, not
//    just by how many lines you have typed?"
//
//   A deepening of 16672-scriptorium. Instead of ONE recording there is the whole
//   "Welcome Home" album in running order. Each track holds a budget of lines;
//   as the manuscript grows past a track's budget the newest lines roll onto the
//   NEXT recording, so a short manuscript reads inside the opening track and a
//   long one traverses several. On TOP of the per-loop grain step, an always-on
//   read-drift slowly migrates every voice forward through its region over
//   minutes, at a rate you set. A DOM filmstrip of the album shows which
//   recording and which region each voice is reading, and its migrating playhead.
//
//   DOM/CSS typographic surface only. No canvas, no WebGL, no oscillator: every
//   sound is a slice of HIS decoded album buffers through createSafeMaster.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { WELCOME_HOME_TRACKS } from "../_shared/welcomeHome";
import { createEngine, LINES_PER_TRACK, MAX_LINES, type Engine } from "./engine";
import { parseLine } from "./prosody";

const STORAGE_KEY = "albumvoyage:manuscript:v1";
const DRIFT_KEY = "albumvoyage:drift:v1";

// A cold open greets you with a short starter manuscript so the voyage is already
// alive on the first gesture — its three lines read within the opening track.
const SEED_LINES = [
  "a slow return to the room",
  "light crossing the far wall",
  "and the keys keep their own time",
];

type Phase = "idle" | "loading" | "running" | "error";
type TrackState = "loading" | "ready" | "failed";

interface Line {
  id: string;
  text: string;
  muted: boolean;
  solo: boolean;
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

/** Encode the manuscript's text into a URL-hash-safe token (unicode-safe). */
function encodeScore(texts: string[]): string {
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(texts));
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  } catch {
    return "";
  }
}

/** Decode a score token back to text lines, or [] on any malformed input. */
function decodeScore(token: string): string[] {
  try {
    const bin = atob(token);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
      .slice(0, MAX_LINES);
  } catch {
    return [];
  }
}

function textsToLines(texts: string[]): Line[] {
  return texts.map((text) => ({ id: newId(), text, muted: false, solo: false }));
}

/** Restore order: URL hash score → localStorage → seed. */
function loadManuscript(): Line[] {
  try {
    const hash = window.location.hash.replace(/^#/, "");
    const m = hash.match(/(?:^|&)s=([^&]+)/);
    if (m) {
      const fromUrl = decodeScore(decodeURIComponent(m[1]));
      if (fromUrl.length > 0) return textsToLines(fromUrl);
    }
  } catch {
    /* ignore */
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { text: string; muted?: boolean }[];
      if (Array.isArray(parsed)) {
        const lines = parsed
          .filter((l) => l && typeof l.text === "string" && l.text.trim().length > 0)
          .slice(0, MAX_LINES)
          .map((l) => ({
            id: newId(),
            text: l.text,
            muted: Boolean(l.muted),
            solo: false,
          }));
        if (lines.length > 0) return lines;
      }
    }
  } catch {
    /* storage unavailable */
  }
  return textsToLines(SEED_LINES);
}

function saveManuscript(lines: Line[]): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(lines.map((l) => ({ text: l.text, muted: l.muted }))),
    );
  } catch {
    /* storage unavailable — run in-memory */
  }
}

function loadDrift(): number {
  try {
    const raw = localStorage.getItem(DRIFT_KEY);
    if (raw !== null) {
      const n = Number(raw);
      if (Number.isFinite(n)) return Math.min(1, Math.max(0, n));
    }
  } catch {
    /* storage unavailable */
  }
  return 0.4;
}

/** Bright the sounding glyph, scaled by live master RMS, tinted by harmony. */
function bloomGlyph(el: HTMLSpanElement, rms: number, hue: number | null): void {
  const h = hue !== null ? hue : 272;
  const s = 1 + Math.min(rms * 2.4, 0.85);
  const blur = (6 + rms * 42).toFixed(1);
  const alpha = (0.35 + rms * 0.5).toFixed(3);
  el.style.color = `hsl(${h} ${hue !== null ? 88 : 92}% 80%)`;
  el.style.opacity = "1";
  el.style.transform = `scale(${s.toFixed(3)})`;
  el.style.textShadow = `0 0 ${blur}px hsl(${h} 95% 72% / ${alpha})`;
}

/** Release the glyph back to the manuscript's resting ink. */
function relaxGlyph(el: HTMLSpanElement): void {
  el.style.color = "";
  el.style.opacity = "";
  el.style.transform = "";
  el.style.textShadow = "";
}

export default function AlbumVoyagePage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [manuscript, setManuscript] = useState<Line[]>([]);
  const [draft, setDraft] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [drift, setDrift] = useState(0.4);
  const [trackStates, setTrackStates] = useState<Record<number, TrackState>>({});

  const engineRef = useRef<Engine | null>(null);
  const manuscriptRef = useRef<Line[]>([]);
  const rafRef = useRef<number | null>(null);
  const wordRefs = useRef<Map<string, HTMLSpanElement>>(new Map());
  const headRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const regionRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const lastActiveRef = useRef<Map<string, string>>(new Map());
  const trackSigRef = useRef<string>("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Restore the manuscript + drift on mount (silent until a gesture gives voice).
  useEffect(() => {
    setManuscript(loadManuscript());
    setDrift(loadDrift());
  }, []);

  // Keep a ref mirror + persist.
  useEffect(() => {
    manuscriptRef.current = manuscript;
    saveManuscript(manuscript);
  }, [manuscript]);

  useEffect(() => {
    try {
      localStorage.setItem(DRIFT_KEY, String(drift));
    } catch {
      /* storage unavailable */
    }
  }, [drift]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [manuscript.length]);

  const runFrame = useCallback(() => {
    const engine = engineRef.current;
    if (engine) {
      const view = engine.getView();
      const ms = manuscriptRef.current;
      const anySolo = ms.some((l) => l.solo);
      const dimmed = (id: string): boolean => {
        const l = ms.find((x) => x.id === id);
        return !l || l.muted || (anySolo && !l.solo);
      };

      for (const lv of view.lines) {
        // Glyph playhead: bloom the sounding word in each line, tinted by harmony.
        const desired = lv.active >= 0 ? `${lv.id}#${lv.active}` : null;
        const prev = lastActiveRef.current.get(lv.id) ?? null;
        if (prev !== desired) {
          if (prev) {
            const pe = wordRefs.current.get(prev);
            if (pe) relaxGlyph(pe);
          }
          if (desired) lastActiveRef.current.set(lv.id, desired);
          else lastActiveRef.current.delete(lv.id);
        }
        if (desired) {
          const ne = wordRefs.current.get(desired);
          if (ne) bloomGlyph(ne, view.rms, lv.hue);
        }

        const isDim = dimmed(lv.id);

        // Filmstrip region block: tint by the chord at the read position.
        const region = regionRefs.current.get(lv.id);
        if (region) {
          const base =
            lv.hue !== null ? `hsl(${lv.hue} 62% 52%)` : "hsl(272 70% 55%)";
          const alpha = !lv.ready ? 0.1 : isDim ? 0.16 : 0.3;
          region.style.background = base
            .replace("hsl(", "hsla(")
            .replace(")", `, ${alpha})`);
        }

        // Filmstrip playhead: move within the track cell to the migrating read.
        const head = headRefs.current.get(lv.id);
        if (head) {
          head.style.left = `${(lv.readFrac * 100).toFixed(2)}%`;
          head.style.opacity = !lv.ready ? "0.2" : lv.active >= 0 ? "1" : "0.5";
          head.style.background =
            lv.hue !== null ? `hsl(${lv.hue} 95% 78%)` : "hsl(272 95% 78%)";
        }
      }

      // Track load states → React (only when the signature changes).
      const sig = view.tracks
        .map(
          (t) =>
            `${t.index}:${t.failed ? "f" : t.loaded ? "r" : "l"}`,
        )
        .join(",");
      if (sig !== trackSigRef.current) {
        trackSigRef.current = sig;
        const next: Record<number, TrackState> = {};
        for (const t of view.tracks) {
          next[t.index] = t.failed ? "failed" : t.loaded ? "ready" : "loading";
        }
        setTrackStates(next);
      }
    }
    rafRef.current = requestAnimationFrame(runFrame);
  }, []);

  const start = useCallback(async () => {
    if (phase === "loading" || phase === "running") return;
    setPhase("loading");
    setErrorMsg(null);
    setNotice(null);
    try {
      const { engine } = await createEngine();
      if (!engine.loaded) {
        engine.teardown();
        setPhase("error");
        setErrorMsg(
          "Karel's album could not be loaded — check the connection and try again.",
        );
        return;
      }
      engineRef.current = engine;
      engine.setDrift(drift);
      for (const line of manuscriptRef.current) {
        const ok = engine.addLine(line.id, line.text, line.muted);
        if (ok && line.muted) engine.setMuted(line.id, true);
      }
      setPhase("running");
      rafRef.current = requestAnimationFrame(runFrame);
    } catch {
      setPhase("error");
      setErrorMsg("Audio could not start in this browser.");
    }
  }, [phase, runFrame, drift]);

  const commit = useCallback(() => {
    const text = draft.trim();
    if (text.length === 0) return;
    if (manuscriptRef.current.length >= MAX_LINES) {
      setNotice(
        `The voyage holds ${MAX_LINES} voices at once — clear a line to add another.`,
      );
      return;
    }
    setNotice(null);
    const line: Line = { id: newId(), text, muted: false, solo: false };
    setManuscript((prev) => [...prev, line]);
    setDraft("");
    const engine = engineRef.current;
    if (engine) engine.addLine(line.id, line.text, false);
  }, [draft]);

  const toggleMute = useCallback((id: string) => {
    let next = false;
    setManuscript((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        next = !l.muted;
        return { ...l, muted: next };
      }),
    );
    engineRef.current?.setMuted(id, next);
  }, []);

  const toggleSolo = useCallback((id: string) => {
    let next = false;
    setManuscript((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        next = !l.solo;
        return { ...l, solo: next };
      }),
    );
    engineRef.current?.setSolo(id, next);
  }, []);

  const removeLine = useCallback((id: string) => {
    lastActiveRef.current.delete(id);
    headRefs.current.delete(id);
    regionRefs.current.delete(id);
    setManuscript((prev) => prev.filter((l) => l.id !== id));
    engineRef.current?.removeLine(id);
  }, []);

  const clearAll = useCallback(() => {
    engineRef.current?.clearAll();
    lastActiveRef.current.clear();
    headRefs.current.clear();
    regionRefs.current.clear();
    trackSigRef.current = "";
    setManuscript([]);
    setTrackStates({});
    setNotice(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
    try {
      history.replaceState(null, "", window.location.pathname);
    } catch {
      /* ignore */
    }
  }, []);

  const onDrift = useCallback((v: number) => {
    setDrift(v);
    engineRef.current?.setDrift(v);
  }, []);

  const copyScore = useCallback(() => {
    const token = encodeScore(manuscriptRef.current.map((l) => l.text));
    let url = "";
    try {
      url = `${window.location.origin}${window.location.pathname}#s=${encodeURIComponent(token)}`;
      history.replaceState(null, "", `#s=${encodeURIComponent(token)}`);
    } catch {
      /* ignore */
    }
    try {
      void navigator.clipboard?.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the hash is still in the address bar */
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  }, []);

  // Full teardown on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      engineRef.current?.teardown();
      engineRef.current = null;
    };
  }, []);

  const anySolo = manuscript.some((l) => l.solo);
  const L = manuscript.length;

  // Build the album filmstrip layout deterministically from the manuscript:
  // group lines by their track, and within a track split it into equal regions.
  const trackGroups: {
    trackIndex: number;
    title: string;
    lines: { line: Line; slot: number; count: number }[];
  }[] = [];
  for (let i = 0; i < manuscript.length; i += 1) {
    const trackIndex = Math.floor(i / LINES_PER_TRACK);
    let group = trackGroups.find((g) => g.trackIndex === trackIndex);
    if (!group) {
      group = {
        trackIndex,
        title: WELCOME_HOME_TRACKS[trackIndex]?.title ?? `Track ${trackIndex + 1}`,
        lines: [],
      };
      trackGroups.push(group);
    }
    group.lines.push({ line: manuscript[i], slot: 0, count: 0 });
  }
  for (const g of trackGroups) {
    const count = g.lines.length;
    g.lines.forEach((entry, k) => {
      entry.slot = k;
      entry.count = count;
    });
  }

  const driftLabel =
    drift <= 0.02
      ? "still"
      : drift < 0.4
        ? "slow · a sweep in ~6 min"
        : drift < 0.75
          ? "migrating · ~3–4 min"
          : "migrating · ~2 min";

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Dream 16688 · whole-album voyage
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            albumvoyage
          </h1>
          <p className="mt-1 max-w-xl text-base text-muted-foreground">
            Writing walks you through the form of Karel&rsquo;s whole album. Lines
            fill the opening track, then roll onto the next recording as the
            manuscript grows &mdash; and a slow read-drift walks the choir deeper
            over minutes, even when you stop typing.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setNotesOpen(true)}
          className="min-h-[44px] shrink-0 rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Read the design notes
        </button>
      </header>

      {/* Status strip */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-3">
        {phase === "idle" && (
          <button
            type="button"
            onClick={() => void start()}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {L > 0 ? "Give the manuscript its voice" : "Begin — write a line below"}
          </button>
        )}
        {phase === "loading" && (
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Loading Karel&rsquo;s album…
          </span>
        )}
        {phase === "running" && (
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Voyaging · {L}/{MAX_LINES} voices · {trackGroups.length} track
            {trackGroups.length === 1 ? "" : "s"}
          </span>
        )}
        {L > 0 && (
          <button
            type="button"
            onClick={copyScore}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {copied ? "Score link copied" : "Copy score link"}
          </button>
        )}
        {L > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Clear manuscript
          </button>
        )}
        {errorMsg && (
          <span className="text-sm text-destructive" role="alert">
            {errorMsg}
          </span>
        )}
        {notice && !errorMsg && (
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {notice}
          </span>
        )}
      </div>

      {/* Read-drift control */}
      <div className="flex flex-wrap items-center gap-4 border-b border-border px-6 py-3">
        <label
          htmlFor="drift"
          className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground"
        >
          Read-drift
        </label>
        <input
          id="drift"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={drift}
          onChange={(e) => onDrift(Number(e.target.value))}
          className="h-1 w-52 max-w-full cursor-pointer accent-primary"
          aria-label="Read-drift rate, from still to a slow migration through the album over minutes"
        />
        <span className="font-mono text-xs tracking-[0.12em] text-muted-foreground/80">
          {driftLabel}
        </span>
      </div>

      {/* Album filmstrip — one cell per track that has lines, each showing the
          track title, its voices' region blocks, and their migrating playheads. */}
      {L > 0 && (
        <div className="border-b border-border px-6 py-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
              the album · running order &rarr;
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
              opening &rarr; end within each track
            </span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {trackGroups.map((g) => {
              const st = trackStates[g.trackIndex];
              return (
                <div
                  key={g.trackIndex}
                  className="flex w-56 shrink-0 flex-col gap-2 rounded-md border border-border/70 bg-background/40 p-3"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold tracking-tight">
                      <span className="mr-1.5 font-mono text-[10px] text-muted-foreground/60">
                        {String(g.trackIndex + 1).padStart(2, "0")}
                      </span>
                      {g.title}
                    </span>
                    <span
                      className={`shrink-0 font-mono text-[9px] uppercase tracking-[0.14em] ${
                        st === "failed"
                          ? "text-destructive"
                          : "text-muted-foreground/60"
                      }`}
                    >
                      {st === "ready"
                        ? "reading"
                        : st === "failed"
                          ? "no audio"
                          : "loading"}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {g.lines.map((entry) => {
                      const startPct = (entry.slot / entry.count) * 100;
                      const widthPct = (1 / entry.count) * 100;
                      const li = manuscript.indexOf(entry.line);
                      return (
                        <div
                          key={entry.line.id}
                          className="relative h-3 overflow-hidden rounded-sm border border-border/50 bg-background/50"
                          title={`line ${li + 1} · ${g.title}`}
                        >
                          {/* region block for this voice within the track */}
                          <div
                            ref={(el) => {
                              if (el) regionRefs.current.set(entry.line.id, el);
                              else regionRefs.current.delete(entry.line.id);
                            }}
                            className="absolute inset-y-0 rounded-sm"
                            style={{
                              left: `${startPct}%`,
                              width: `${widthPct}%`,
                              background: "hsl(272 70% 55% / 0.28)",
                            }}
                          />
                          {/* migrating read playhead */}
                          <div
                            ref={(el) => {
                              if (el) headRefs.current.set(entry.line.id, el);
                              else headRefs.current.delete(entry.line.id);
                            }}
                            className="pointer-events-none absolute top-1/2 h-3 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                            style={{
                              left: `${startPct + widthPct / 2}%`,
                              background: "hsl(272 95% 78%)",
                              boxShadow: "0 0 6px hsl(272 95% 72% / 0.8)",
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Manuscript surface */}
      <main
        ref={scrollRef}
        className="flex flex-1 flex-col justify-end gap-1 overflow-y-auto px-6 py-8"
      >
        {L === 0 ? (
          <p className="text-base italic text-muted-foreground/70">
            The page is blank. Write a line and press Enter — it begins at the
            opening of the first track; each line reads deeper, and past four lines
            the manuscript rolls onto the next recording of the album.
          </p>
        ) : (
          manuscript.map((line, li) => {
            const { words } = parseLine(line.text);
            const dimmed = line.muted || (anySolo && !line.solo);
            const trackIndex = Math.floor(li / LINES_PER_TRACK);
            const trackTitle =
              WELCOME_HOME_TRACKS[trackIndex]?.title ?? `Track ${trackIndex + 1}`;
            const isTrackHead = li % LINES_PER_TRACK === 0;
            return (
              <div key={line.id}>
                {isTrackHead && (
                  <div
                    className={`mb-1 flex items-center gap-2 ${li === 0 ? "mt-0" : "mt-3"}`}
                  >
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary/80">
                      {String(trackIndex + 1).padStart(2, "0")} · {trackTitle}
                    </span>
                    <span className="h-px flex-1 bg-border/60" />
                  </div>
                )}
                <div className="group flex items-baseline gap-3 py-1.5">
                  <span className="w-8 shrink-0 select-none pt-0.5 text-right font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/50">
                    {String(li + 1).padStart(2, "0")}
                  </span>

                  <div className="flex flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
                    {words.map((w, wi) => (
                      <span
                        key={`${line.id}#${wi}`}
                        ref={(el) => {
                          const key = `${line.id}#${wi}`;
                          if (el) wordRefs.current.set(key, el);
                          else wordRefs.current.delete(key);
                        }}
                        className={`inline-block origin-bottom text-xl transition-[transform,color,text-shadow,opacity] duration-300 ease-out ${
                          w.isRest
                            ? "text-muted-foreground/40"
                            : dimmed
                              ? "text-muted-foreground/45"
                              : "text-foreground/90"
                        }`}
                      >
                        {w.text}
                      </span>
                    ))}
                  </div>

                  <div className="flex shrink-0 items-center gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => toggleMute(line.id)}
                      aria-pressed={line.muted}
                      title={line.muted ? "Unmute this voice" : "Mute this voice"}
                      className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 font-mono text-[10px] uppercase tracking-[0.14em] ${
                        line.muted
                          ? "border-border bg-muted text-muted-foreground"
                          : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                      }`}
                    >
                      {line.muted ? "muted" : "mute"}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleSolo(line.id)}
                      aria-pressed={line.solo}
                      title={line.solo ? "Release solo" : "Solo this voice"}
                      className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 font-mono text-[10px] uppercase tracking-[0.14em] ${
                        line.solo
                          ? "border-primary bg-primary/20 text-primary"
                          : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                      }`}
                    >
                      solo
                    </button>
                    <button
                      type="button"
                      onClick={() => removeLine(line.id)}
                      title="Remove this line"
                      className="inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-border bg-background/60 px-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </main>

      {/* Input line */}
      <div className="border-t border-border px-6 py-4">
        <div className="flex items-end gap-3">
          <span className="select-none pb-2.5 font-mono text-xs text-primary">›</span>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                commit();
              }
            }}
            rows={1}
            placeholder="Write a line, then press Enter — it reads deeper into the album than the last…"
            className="min-h-[44px] flex-1 resize-none rounded-md border border-border bg-background/60 px-4 py-2.5 text-base text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
          />
          <button
            type="button"
            onClick={commit}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Commit
          </button>
        </div>
        <p className="mt-2 pl-6 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
          Enter commits · every {LINES_PER_TRACK} lines the manuscript rolls onto
          the next recording of the album
        </p>
      </div>

      {/* Design-notes modal */}
      {notesOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">Design notes</h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                The manuscript is a <strong>voyage through the whole album</strong>,
                not one piece. Each of Karel&rsquo;s tracks holds a budget of{" "}
                {LINES_PER_TRACK} lines; the first lines read the opening track, and
                as the manuscript grows past that budget the newest lines{" "}
                <strong>roll onto the next recording</strong> in album order. Within
                a track, its <em>m</em> lines split that recording into regions
                [<em>k</em>/<em>m</em>, (<em>k</em>+1)/<em>m</em>], so a track&rsquo;s
                voices still sweep it opening&nbsp;&rarr;&nbsp;end. The next track is
                preloaded so a roll is seamless.
              </p>
              <p>
                On top of that, an always-on <strong>read-drift</strong> slowly
                migrates every voice forward through its region over minutes — a slow
                ramp of the read position that wraps at the region edge, at the rate
                you set with the slider (still&nbsp;&harr;&nbsp;a sweep every ~2–6
                minutes). Leave the page running and minute-5 genuinely differs from
                minute-1 <em>by time</em>: the choir has walked deeper into the album
                even if you stopped typing. A repeated word still never cuts the same
                grain twice — the golden-ratio per-loop step rides on top of the drift.
              </p>
              <p>
                The mapping is <strong>prosody</strong>, not meaning: a word&rsquo;s
                length sets its slice duration, its letters seed the offset inside the
                region, its vowel ratio opens a lowpass and nudges the transpose, and
                terminal punctuation adds accents and rests. Lines of different lengths
                loop at different cycles and phase against one another (Steve Reich).
                Each line is placed in stereo, spread as a choir.
              </p>
              <p>
                The <strong>filmstrip</strong> above is a graphic score of the album:
                one cell per recording that has lines, each showing its voices&rsquo;
                region blocks and a live playhead migrating with the read-drift — so
                you can SEE, at a glance, which recording and which region every voice
                is reading right now. When a track&rsquo;s harmonic analysis is
                available, each voice is tinted by the chord sounding at its read
                position; absent, it stays the house violet. The whole score saves to
                your browser and encodes into the URL, so it can be shared and restored.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNotesOpen(false)}
              className="mt-6 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["16688-albumvoyage"]} />
    </div>
  );
}
