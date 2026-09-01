"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 16656 · tonguescript — a living manuscript that is also a loop-station.
//
//   "What if a page of writing became a LOOPING, LAYERED instrument — each line
//    you commit becomes a persistent voice of Karel's piano that keeps playing,
//    so a poem you type accumulates into a living multi-voice score that survives
//    even after you reload?"
//
//   You type a line and press Enter to commit it. It stacks up the page as a row
//   of word-glyphs AND becomes a voice: its words play as enveloped slices of
//   Karel's real takes and the whole line loops forever on its own cycle. Lines
//   of different lengths phase against each other (Reich). The manuscript persists
//   to localStorage — reload and the poem-instrument is still here.
//
//   DOM/CSS typographic surface only. No canvas, no WebGL, no oscillator: every
//   sound is a slice of HIS decoded AudioBuffers through createSafeMaster.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { createEngine, type Engine } from "./engine";
import { parseLine } from "./prosody";

const STORAGE_KEY = "tonguescript:manuscript:v1";
const MAX_LINES = 8;

// A cold open (empty storage) greets you with a short starter manuscript, so the
// layered, phasing loop-station is already alive on the first gesture — no need
// to type before you hear what the piece is. Clear or overwrite freely.
const SEED_LINES = [
  "a slow return to the room",
  "light on the far wall",
  "and the keys keep their own time",
];

type Phase = "idle" | "loading" | "running" | "error";

interface Line {
  id: string;
  text: string;
  muted: boolean;
  solo: boolean;
}

interface StoredLine {
  text: string;
  muted: boolean;
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function loadManuscript(): Line[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredLine[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((l) => l && typeof l.text === "string" && l.text.trim().length > 0)
      .slice(0, MAX_LINES)
      .map((l) => ({
        id: newId(),
        text: l.text,
        muted: Boolean(l.muted),
        solo: false,
      }));
  } catch {
    return [];
  }
}

function saveManuscript(lines: Line[]): void {
  try {
    const stored: StoredLine[] = lines.map((l) => ({
      text: l.text,
      muted: l.muted,
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    /* storage unavailable — run in-memory */
  }
}

/** Bright the sounding glyph, scaled by live master RMS. */
function bloomGlyph(el: HTMLSpanElement, rms: number): void {
  const s = 1 + Math.min(rms * 2.4, 0.85);
  el.style.color = "hsl(272 92% 80%)";
  el.style.opacity = "1";
  el.style.transform = `scale(${s.toFixed(3)})`;
  el.style.textShadow = `0 0 ${(6 + rms * 44).toFixed(1)}px hsl(272 95% 72% / ${(
    0.35 +
    rms * 0.5
  ).toFixed(3)})`;
}

/** Release the glyph back to the manuscript's resting ink. */
function relaxGlyph(el: HTMLSpanElement): void {
  el.style.color = "";
  el.style.opacity = "";
  el.style.transform = "";
  el.style.textShadow = "";
}

export default function TonguescriptPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [manuscript, setManuscript] = useState<Line[]>([]);
  const [draft, setDraft] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadedCount, setLoadedCount] = useState(0);
  const [notesOpen, setNotesOpen] = useState(false);

  const engineRef = useRef<Engine | null>(null);
  const manuscriptRef = useRef<Line[]>([]);
  const rafRef = useRef<number | null>(null);
  const wordRefs = useRef<Map<string, HTMLSpanElement>>(new Map());
  const lastActiveRef = useRef<Map<string, string>>(new Map());
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Restore the manuscript on mount (silent until a gesture gives it voice).
  useEffect(() => {
    const restored = loadManuscript();
    if (restored.length > 0) {
      setManuscript(restored);
    } else {
      setManuscript(
        SEED_LINES.map((text) => ({
          id: newId(),
          text,
          muted: false,
          solo: false,
        })),
      );
    }
  }, []);

  // Keep a ref mirror for use inside audio callbacks + gesture handlers.
  useEffect(() => {
    manuscriptRef.current = manuscript;
    saveManuscript(manuscript);
  }, [manuscript]);

  // Autoscroll so the newest committed line stays near the input.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [manuscript.length]);

  const runFrame = useCallback(() => {
    const engine = engineRef.current;
    if (engine) {
      const view = engine.getView();
      for (const lv of view.lines) {
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
          if (ne) bloomGlyph(ne, view.rms);
        }
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
      const { engine, loadErrors } = await createEngine();
      if (engine.loadedCount === 0) {
        engine.teardown();
        setPhase("error");
        setErrorMsg(
          "None of Karel's takes could be loaded — check the connection and try again.",
        );
        return;
      }
      engineRef.current = engine;
      setLoadedCount(engine.loadedCount);
      if (loadErrors > 0) {
        setNotice(
          `${loadErrors} take${loadErrors > 1 ? "s" : ""} failed to load — playing with ${engine.loadedCount}.`,
        );
      }
      // Give every restored / already-typed line its looping voice.
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
  }, [phase, runFrame]);

  const commit = useCallback(() => {
    const text = draft.trim();
    if (text.length === 0) return;
    if (manuscriptRef.current.length >= MAX_LINES) {
      setNotice(
        `The manuscript holds ${MAX_LINES} voices at once — clear a line to add another.`,
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
    setManuscript((prev) =>
      prev.map((l) => (l.id === id ? { ...l, muted: !l.muted } : l)),
    );
    const engine = engineRef.current;
    if (engine) {
      const cur = manuscriptRef.current.find((l) => l.id === id);
      engine.setMuted(id, !(cur?.muted ?? false));
    }
  }, []);

  const toggleSolo = useCallback((id: string) => {
    setManuscript((prev) =>
      prev.map((l) => (l.id === id ? { ...l, solo: !l.solo } : l)),
    );
    const engine = engineRef.current;
    if (engine) {
      const cur = manuscriptRef.current.find((l) => l.id === id);
      engine.setSolo(id, !(cur?.solo ?? false));
    }
  }, []);

  const removeLine = useCallback((id: string) => {
    for (const key of Array.from(lastActiveRef.current.keys())) {
      if (key === id) lastActiveRef.current.delete(key);
    }
    setManuscript((prev) => prev.filter((l) => l.id !== id));
    const engine = engineRef.current;
    if (engine) engine.removeLine(id);
  }, []);

  const clearAll = useCallback(() => {
    const engine = engineRef.current;
    if (engine) engine.clearAll();
    lastActiveRef.current.clear();
    setManuscript([]);
    setNotice(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
  }, []);

  // Full teardown on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      const engine = engineRef.current;
      if (engine) engine.teardown();
      engineRef.current = null;
    };
  }, []);

  const anySolo = manuscript.some((l) => l.solo);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Dream 16656 · loop-station manuscript
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            tonguescript
          </h1>
          <p className="mt-1 max-w-xl text-base text-muted-foreground">
            Every line you commit becomes a persistent, looping voice of Karel&rsquo;s
            piano. The poem you write is the score, and it stays here between visits.
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
            {manuscript.length > 0
              ? "Give the manuscript its voice"
              : "Begin — write a line below"}
          </button>
        )}
        {phase === "loading" && (
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Loading Karel&rsquo;s takes…
          </span>
        )}
        {phase === "running" && (
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {loadedCount} takes · {manuscript.length}/{MAX_LINES} voices looping
          </span>
        )}
        {manuscript.length > 0 && (
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

      {/* Manuscript surface */}
      <main
        ref={scrollRef}
        className="flex flex-1 flex-col justify-end gap-1 overflow-y-auto px-6 py-8"
      >
        {manuscript.length === 0 ? (
          <p className="text-base italic text-muted-foreground/70">
            The page is blank. Write a line and press Enter — it will stack here and
            begin to loop.
          </p>
        ) : (
          manuscript.map((line, li) => {
            const { words } = parseLine(line.text);
            const dimmed = line.muted || (anySolo && !line.solo);
            return (
              <div
                key={line.id}
                className="group flex items-baseline gap-3 py-1.5"
              >
                {/* line index */}
                <span className="w-8 shrink-0 select-none pt-0.5 text-right font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/50">
                  {String(li + 1).padStart(2, "0")}
                </span>

                {/* word-glyph timeline */}
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

                {/* per-line controls */}
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
            );
          })
        )}
      </main>

      {/* Input line */}
      <div className="border-t border-border px-6 py-4">
        <div className="flex items-end gap-3">
          <span className="select-none pb-2.5 font-mono text-xs text-primary">
            ›
          </span>
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
            placeholder="Write a line, then press Enter to commit it as a looping voice…"
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
          Enter commits · Shift+Enter for a soft break · lines loop and layer
        </p>
      </div>

      {/* Design-notes modal */}
      {notesOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">
              Design notes
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                A page of writing is read here as a loop-station. Each committed
                line becomes a persistent voice: its words play as short, enveloped
                slices of Karel&rsquo;s real piano takes, and the whole line loops
                forever on its own cycle. Because lines of different lengths have
                different loop durations, they drift against one another and never
                quite realign — a phasing texture in the spirit of Steve Reich and
                Brian Eno&rsquo;s <em>Music for Airports</em>.
              </p>
              <p>
                The mapping is <strong>prosody</strong>, not meaning. A word&rsquo;s
                length sets its slice duration; the sum of its letters picks which
                take it&rsquo;s cut from and a golden-ratio offset into that
                recording; its vowel ratio opens or closes a lowpass filter and
                nudges the transpose; terminal punctuation adds accents and rests.
                The line&rsquo;s overall vowel density biases its whole register, so
                different lines settle into different bands.
              </p>
              <p>
                The surface is a manuscript, after graphic text-scores like
                Cardew&rsquo;s <em>Treatise</em>: the sounding word in each line
                brightens and swells in time with its loop, so you can see which
                word is speaking in every voice at once. The whole manuscript is
                saved to your browser, so the instrument you build is still here
                when you return.
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

      <PrototypeNav slugs={["16656-tonguescript"]} />
    </div>
  );
}
