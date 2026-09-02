"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 16720 · cadencemap — writing as a walk across Karel's real harmonic form.
//
//   "What if the page showed you Karel's REAL HARMONIC FORM as a walkable map —
//    the whole album's chord progression laid out — and your writing placed voices
//    ONTO that map, each voice reading the moment where its chord sounds, gently
//    pulled into consonance with it?"
//
//   A deepening of 16688-albumvoyage. albumvoyage rolled the manuscript across the
//   whole album, read a region of each assigned track, migrated every voice's read
//   position over minutes (read-drift), and tinted each glyph's HUE to the chord at
//   its read position. cadencemap keeps ALL of that and surfaces the harmony as the
//   HEADLINE: the album's real chord progression is drawn as a walkable DOM map —
//   one row per track, each chord a labelled, hue-tinted cell laid out by time — and
//   every committed voice is a marker sitting ON the chord it is currently reading,
//   walking the progression as the read-drift migrates. The chord under each marker
//   is highlighted, and each voice's slices are gently TUNED toward consonance with
//   that chord so the map is heard, not just seen.
//
//   DOM/CSS typographic surface only. No canvas, no WebGL, no oscillator: every
//   sound is a slice of HIS decoded album buffers through createSafeMaster.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { WELCOME_HOME_TRACKS } from "../_shared/welcomeHome";
import {
  chordRoot,
  chordIsMinor,
  pitchClassHue,
} from "../_shared/trackAnalysis";
import {
  createEngine,
  LINES_PER_TRACK,
  MAX_LINES,
  type AlbumMapTrack,
  type Engine,
} from "./engine";
import { parseLine } from "./prosody";

const STORAGE_KEY = "cadencemap:manuscript:v1";
const DRIFT_KEY = "cadencemap:drift:v1";
const TUNE_KEY = "cadencemap:tune:v1";

// A cold open greets you with a short starter manuscript so the walk is already
// alive on the first gesture — its three lines read within the opening track.
const SEED_LINES = [
  "a slow return to the room",
  "light crossing the far wall",
  "and the keys keep their own time",
];

type Phase = "idle" | "loading" | "running" | "error";

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

function loadNumber(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      const n = Number(raw);
      if (Number.isFinite(n)) return Math.min(1, Math.max(0, n));
    }
  } catch {
    /* storage unavailable */
  }
  return fallback;
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

/** Position + light a voice marker on the harmonic map. */
function drawMarker(
  el: HTMLDivElement,
  readFrac: number,
  active: boolean,
  ready: boolean,
  hue: number | null,
  rms: number,
): void {
  const h = hue !== null ? hue : 272;
  el.style.left = `${(readFrac * 100).toFixed(2)}%`;
  const scale = active ? (1 + Math.min(rms * 0.6, 0.45)).toFixed(3) : "1";
  el.style.transform = `translateX(-50%) scale(${scale})`;
  el.style.background = `hsl(${h} 90% ${active ? 72 : 58}% / ${ready ? 1 : 0.4})`;
  el.style.color = `hsl(${h} 60% 14%)`;
  const glow = active ? (0.45 + Math.min(rms * 0.8, 0.5)).toFixed(2) : "0.2";
  const blur = active ? (8 + rms * 22).toFixed(1) : "4";
  el.style.boxShadow = `0 0 ${blur}px hsl(${h} 95% 72% / ${glow})`;
  el.style.opacity = ready ? "1" : "0.5";
}

/** Ring a chord cell the moment a voice is reading it. */
function applyCellHighlight(el: HTMLDivElement, hue: number): void {
  el.style.outline = `1.5px solid hsl(${hue} 95% 80%)`;
  el.style.outlineOffset = "-1px";
  el.style.filter = "brightness(1.55)";
  el.style.zIndex = "4";
}

/** Release a chord cell back to its resting tint. */
function clearCellHighlight(el: HTMLDivElement): void {
  el.style.outline = "";
  el.style.outlineOffset = "";
  el.style.filter = "";
  el.style.zIndex = "";
}

export default function CadenceMapPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [manuscript, setManuscript] = useState<Line[]>([]);
  const [draft, setDraft] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [drift, setDrift] = useState(0.4);
  const [tune, setTune] = useState(0.6);
  const [albumMap, setAlbumMap] = useState<AlbumMapTrack[]>([]);

  const engineRef = useRef<Engine | null>(null);
  const manuscriptRef = useRef<Line[]>([]);
  const rafRef = useRef<number | null>(null);
  const wordRefs = useRef<Map<string, HTMLSpanElement>>(new Map());
  const markerRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const cellRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const lastActiveRef = useRef<Map<string, string>>(new Map());
  const lastCellsRef = useRef<Set<string>>(new Set());
  const albumSigRef = useRef<string>("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Restore the manuscript + controls on mount (silent until a gesture gives voice).
  useEffect(() => {
    setManuscript(loadManuscript());
    setDrift(loadNumber(DRIFT_KEY, 0.4));
    setTune(loadNumber(TUNE_KEY, 0.6));
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
    try {
      localStorage.setItem(TUNE_KEY, String(tune));
    } catch {
      /* storage unavailable */
    }
  }, [tune]);

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

      const occupied = new Set<string>();

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

        // Map marker: walk it along the progression to the migrating read position.
        const marker = markerRefs.current.get(lv.id);
        if (marker) {
          drawMarker(
            marker,
            lv.readFrac,
            lv.active >= 0 && !isDim,
            lv.ready,
            lv.hue,
            view.rms,
          );
        }

        // The chord this voice is reading — highlight its cell on the map.
        if (lv.ready && lv.chordIndex >= 0 && !isDim) {
          occupied.add(`${lv.trackIndex}:${lv.chordIndex}`);
        }
      }

      // Diff the highlighted-cell set: release cells no voice reads, ring the rest.
      for (const key of lastCellsRef.current) {
        if (!occupied.has(key)) {
          const el = cellRefs.current.get(key);
          if (el) clearCellHighlight(el);
        }
      }
      for (const key of occupied) {
        const el = cellRefs.current.get(key);
        if (el) {
          const lv = view.lines.find(
            (x) => `${x.trackIndex}:${x.chordIndex}` === key,
          );
          applyCellHighlight(el, lv?.hue ?? 272);
        }
      }
      lastCellsRef.current = occupied;

      // Album harmonic form → React only when its signature changes.
      const sig = view.album
        .map(
          (t) =>
            `${t.index}:${t.chords ? t.chords.length : "-"}:${
              t.decoded ? "d" : t.failed ? "f" : t.loading ? "l" : "."
            }:${t.analysisPending ? "p" : "."}:${Math.round(t.trackLen)}`,
        )
        .join(",");
      if (sig !== albumSigRef.current) {
        albumSigRef.current = sig;
        setAlbumMap(view.album);
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
      engine.setTune(tune);
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
  }, [phase, runFrame, drift, tune]);

  const commit = useCallback(() => {
    const text = draft.trim();
    if (text.length === 0) return;
    if (manuscriptRef.current.length >= MAX_LINES) {
      setNotice(
        `The map holds ${MAX_LINES} voices at once — clear a line to add another.`,
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
    markerRefs.current.delete(id);
    setManuscript((prev) => prev.filter((l) => l.id !== id));
    engineRef.current?.removeLine(id);
  }, []);

  const clearAll = useCallback(() => {
    engineRef.current?.clearAll();
    lastActiveRef.current.clear();
    markerRefs.current.clear();
    lastCellsRef.current.clear();
    setManuscript([]);
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

  const onTune = useCallback((v: number) => {
    setTune(v);
    engineRef.current?.setTune(v);
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

  // Which manuscript lines sit on each album track, in order (marker placement).
  const linesByTrack = new Map<number, { line: Line; index: number }[]>();
  for (let i = 0; i < manuscript.length; i += 1) {
    const ti = Math.floor(i / LINES_PER_TRACK);
    const arr = linesByTrack.get(ti);
    if (arr) arr.push({ line: manuscript[i], index: i });
    else linesByTrack.set(ti, [{ line: manuscript[i], index: i }]);
  }
  const usedTracks = linesByTrack.size;

  const driftLabel =
    drift <= 0.02
      ? "still"
      : drift < 0.4
        ? "slow · a sweep in ~6 min"
        : drift < 0.75
          ? "migrating · ~3–4 min"
          : "migrating · ~2 min";

  const tuneLabel =
    tune <= 0.02
      ? "off · pure prosody"
      : tune < 0.5
        ? "gentle pull"
        : tune < 0.9
          ? "toward consonance"
          : "snapped to the chord";

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Dream 16720 · walkable harmonic map
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            cadencemap
          </h1>
          <p className="mt-1 max-w-xl text-base text-muted-foreground">
            Karel&rsquo;s real harmonic form, laid out as a walkable map: the whole
            album&rsquo;s chord progression, track by track. Each line you write
            becomes a voice that sits ON the chord it is reading and walks the
            progression as it drifts &mdash; gently tuned into consonance with it.
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
            {L > 0 ? "Place the voices on the map" : "Begin — write a line below"}
          </button>
        )}
        {phase === "loading" && (
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Loading Karel&rsquo;s album &amp; its harmony…
          </span>
        )}
        {phase === "running" && (
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Walking · {L}/{MAX_LINES} voices · {usedTracks} track
            {usedTracks === 1 ? "" : "s"} in play
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

      {/* Controls: read-drift + harmonic tuning */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-border px-6 py-3">
        <div className="flex items-center gap-4">
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
            className="h-1 w-44 max-w-full cursor-pointer accent-primary"
            aria-label="Read-drift rate, from still to a slow migration through the album over minutes"
          />
          <span className="font-mono text-xs tracking-[0.12em] text-muted-foreground/80">
            {driftLabel}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <label
            htmlFor="tune"
            className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground"
          >
            Harmonic tuning
          </label>
          <input
            id="tune"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={tune}
            onChange={(e) => onTune(Number(e.target.value))}
            className="h-1 w-44 max-w-full cursor-pointer accent-primary"
            aria-label="Harmonic tuning amount, from the pure untuned prosody to slices snapped into the sounding chord"
          />
          <span className="font-mono text-xs tracking-[0.12em] text-muted-foreground/80">
            {tuneLabel}
          </span>
        </div>
      </div>

      {/* THE HARMONIC MAP — the album's real chord progression, one row per track,
          each chord a labelled hue-tinted cell laid out by time; voices walk it. */}
      {phase === "running" && (
        <div className="border-b border-border px-6 py-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Karel&rsquo;s harmonic form · the whole album
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
              time &rarr; within each track · marker = a voice on its chord
            </span>
          </div>
          <div className="flex max-h-[46vh] flex-col gap-1.5 overflow-y-auto pr-1">
            {albumMap.map((track) => {
              const here = linesByTrack.get(track.index) ?? [];
              const hasVoices = here.length > 0;
              const len = track.trackLen > 0 ? track.trackLen : 1;
              const audioLabel = track.failed
                ? "no audio"
                : track.decoded
                  ? "reading"
                  : track.loading
                    ? "loading"
                    : hasVoices
                      ? "queued"
                      : "not in play";
              return (
                <div
                  key={track.index}
                  className={`flex items-stretch gap-3 rounded-md border px-2 py-1.5 ${
                    hasVoices
                      ? "border-primary/50 bg-primary/5"
                      : "border-border/50 bg-background/30"
                  }`}
                >
                  {/* Track label */}
                  <div className="flex w-40 shrink-0 flex-col justify-center">
                    <span
                      className={`truncate text-sm font-semibold tracking-tight ${
                        hasVoices ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      <span className="mr-1.5 font-mono text-[10px] text-muted-foreground/60">
                        {String(track.index + 1).padStart(2, "0")}
                      </span>
                      {track.title}
                    </span>
                    <span
                      className={`font-mono text-[9px] uppercase tracking-[0.14em] ${
                        track.failed
                          ? "text-destructive"
                          : "text-muted-foreground/60"
                      }`}
                    >
                      {audioLabel}
                    </span>
                  </div>

                  {/* Chord timeline */}
                  <div className="relative h-14 flex-1 overflow-hidden rounded-sm border border-border/40 bg-background/50">
                    {track.chords && track.chords.length > 0 ? (
                      track.chords.map((c, ci) => {
                        const root = chordRoot(c.chord);
                        const hue = root === null ? null : pitchClassHue(root);
                        const minor = chordIsMinor(c.chord);
                        const leftPct = (c.time / len) * 100;
                        const widthPct = Math.max((c.duration / len) * 100, 0.4);
                        const h = hue ?? 272;
                        return (
                          <div
                            key={ci}
                            ref={(el) => {
                              const key = `${track.index}:${ci}`;
                              if (el) cellRefs.current.set(key, el);
                              else cellRefs.current.delete(key);
                            }}
                            className="absolute inset-y-0 overflow-hidden border-r border-black/20"
                            style={{
                              left: `${leftPct}%`,
                              width: `${widthPct}%`,
                              background: `hsl(${h} ${minor ? 42 : 62}% ${
                                minor ? 26 : 34
                              }% / ${hasVoices ? 0.7 : 0.4})`,
                            }}
                            title={`${c.chord} · ${c.time.toFixed(1)}s`}
                          >
                            <span
                              className="pointer-events-none block truncate px-1 pt-0.5 font-mono text-xs"
                              style={{ color: `hsl(${h} 80% 86%)` }}
                            >
                              {c.chord}
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/50">
                        {track.analysisPending
                          ? "reading harmony…"
                          : "no analysis"}
                      </span>
                    )}

                    {/* Voice markers walking this track */}
                    {here.map((entry, slot) => (
                      <div
                        key={entry.line.id}
                        ref={(el) => {
                          if (el) markerRefs.current.set(entry.line.id, el);
                          else markerRefs.current.delete(entry.line.id);
                        }}
                        className="pointer-events-none absolute z-[3] flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-mono text-[9px] font-semibold"
                        style={{
                          left: "50%",
                          bottom: `${slot * 13 + 3}px`,
                          background: "hsl(272 90% 58%)",
                          color: "hsl(272 60% 14%)",
                          transform: "translateX(-50%)",
                        }}
                        title={`voice ${entry.index + 1}`}
                      >
                        {entry.index + 1}
                      </div>
                    ))}
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
            The page is blank. Write a line and press Enter — it lands on the opening
            of the first track; each line reads deeper, and past four lines the next
            voices walk onto the next recording of the album.
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
            placeholder="Write a line, then press Enter — it walks deeper into the album's harmony than the last…"
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
          Enter commits · every {LINES_PER_TRACK} lines the voices walk onto the
          next recording of the album
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
                The headline is the <strong>harmonic map</strong>: Karel&rsquo;s
                real chord progression for the <em>whole album</em>, one row per
                track, each chord a labelled cell laid out left&nbsp;&rarr;&nbsp;right
                by its time across the recording and tinted by its root around the
                circle of fifths (minor chords sit darker). The analysis is fetched
                for every track at once, so the entire record&rsquo;s harmonic form is
                legible at a glance — even before a voice reaches a given track.
              </p>
              <p>
                Every line you write becomes a <strong>voice — a marker on the
                map</strong>, sitting on the exact chord it is currently reading. A
                slow, always-on <strong>read-drift</strong> migrates each voice
                forward through its region over minutes (the Read-drift slider: still
                &harr; a sweep every ~2&ndash;6 min), so you watch the markers
                <em> walk</em> Karel&rsquo;s progression and the chord under each one
                lights up as it passes. Lines fill a track&rsquo;s budget of{" "}
                {LINES_PER_TRACK} and then the next voices step onto the next
                recording, so a long manuscript traverses the record.
              </p>
              <p>
                So the map is <strong>heard</strong>, not just seen, each
                slice&rsquo;s playback rate is gently <strong>tuned into
                consonance</strong> with the chord at its read position: the
                prosodic rate&rsquo;s implied semitone offset is pulled toward the
                nearest note of that chord&rsquo;s triad and converted back to a rate
                (clamped to a safe window). The Harmonic-tuning slider sets how hard
                the pull is — from the pure untuned prosody to slices snapped onto the
                chord. A track with no chord analysis keeps the untuned rate and reads
                &ldquo;no analysis&rdquo; on the map; it never falls silent.
              </p>
              <p>
                The underlying reading is <strong>prosody, not meaning</strong>: a
                word&rsquo;s length sets its slice duration, its letters seed the
                offset inside the region, its vowel ratio opens a lowpass and sets the
                base transpose, and terminal punctuation adds accents and rests. Lines
                of different lengths loop at different cycles and phase against one
                another (Reich). Each voice is placed in stereo as a choir. Every
                sound is a slice of Karel&rsquo;s decoded &ldquo;Welcome Home&rdquo;
                recordings — no synthesis. The whole score saves to your browser and
                encodes into the URL, so it can be shared and restored.
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

      <PrototypeNav slugs={["16720-cadencemap"]} />
    </div>
  );
}
