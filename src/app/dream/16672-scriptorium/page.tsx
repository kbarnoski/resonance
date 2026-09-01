"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 16672 · scriptorium — writing as a voyage through the ARC of one recording.
//
//   "What if writing WALKED you through the form of one of Karel's pieces — so
//    the manuscript is different at line 8 than at line 1 not just because more
//    voices layer, but because each new line reads from a LATER region of the
//    piece, and no word ever sounds exactly identical twice?"
//
//   A deepening of 16656-tonguescript. There is ONE piece. Line N of L reads only
//   from region [N/L, (N+1)/L] of its duration, so the first line reads the
//   opening and every later line reads deeper; adding a line re-slots the whole
//   ensemble so it always spans opening→end. A repeated word drifts its grain a
//   golden step each loop (identity kept, texture breathing). Each line is placed
//   in stereo as a spread choir. A form ribbon shows where every voice is reading.
//
//   DOM/CSS typographic surface only. No canvas, no WebGL, no oscillator: every
//   sound is a slice of HIS one decoded buffer through createSafeMaster.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { createEngine, type Engine } from "./engine";
import { parseLine } from "./prosody";

const STORAGE_KEY = "scriptorium:manuscript:v1";
const MAX_LINES = 8;

// A cold open greets you with a short starter manuscript so the voyage is already
// alive on the first gesture — its three lines already span opening→end of the piece.
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

/** Bright the sounding glyph, scaled by live master RMS. */
function bloomGlyph(el: HTMLSpanElement, rms: number): void {
  const s = 1 + Math.min(rms * 2.4, 0.85);
  el.style.color = "hsl(272 92% 82%)";
  el.style.opacity = "1";
  el.style.transform = `scale(${s.toFixed(3)})`;
  el.style.textShadow = `0 0 ${(6 + rms * 42).toFixed(1)}px hsl(272 95% 72% / ${(
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

export default function ScriptoriumPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [manuscript, setManuscript] = useState<Line[]>([]);
  const [draft, setDraft] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pieceTitle, setPieceTitle] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const engineRef = useRef<Engine | null>(null);
  const manuscriptRef = useRef<Line[]>([]);
  const rafRef = useRef<number | null>(null);
  const wordRefs = useRef<Map<string, HTMLSpanElement>>(new Map());
  const headRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const lastActiveRef = useRef<Map<string, string>>(new Map());
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Restore the manuscript on mount (silent until a gesture gives it voice).
  useEffect(() => {
    setManuscript(loadManuscript());
  }, []);

  // Keep a ref mirror + persist.
  useEffect(() => {
    manuscriptRef.current = manuscript;
    saveManuscript(manuscript);
  }, [manuscript]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [manuscript.length]);

  const runFrame = useCallback(() => {
    const engine = engineRef.current;
    if (engine) {
      const view = engine.getView();
      for (const lv of view.lines) {
        // Glyph playhead: bloom the sounding word in each line.
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
        // Ribbon playhead: move the marker to where this voice is reading now.
        const head = headRefs.current.get(lv.id);
        if (head) {
          head.style.left = `${(lv.readFrac * 100).toFixed(2)}%`;
          head.style.opacity = lv.active >= 0 ? "1" : "0.45";
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
      const { engine } = await createEngine();
      if (!engine.loaded) {
        engine.teardown();
        setPhase("error");
        setErrorMsg(
          "Karel's piece could not be loaded — check the connection and try again.",
        );
        return;
      }
      engineRef.current = engine;
      setPieceTitle(engine.pieceTitle);
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
    setManuscript((prev) => prev.filter((l) => l.id !== id));
    engineRef.current?.removeLine(id);
  }, []);

  const clearAll = useCallback(() => {
    engineRef.current?.clearAll();
    lastActiveRef.current.clear();
    headRefs.current.clear();
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

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Dream 16672 · form-voyage manuscript
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            scriptorium
          </h1>
          <p className="mt-1 max-w-xl text-base text-muted-foreground">
            Writing walks you through the arc of one of Karel&rsquo;s pieces. Each
            line reads a later region of the recording than the one above it, so the
            manuscript sweeps opening&nbsp;&rarr;&nbsp;end as it grows.
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
            Loading Karel&rsquo;s piece…
          </span>
        )}
        {phase === "running" && (
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {pieceTitle ? `Reading “${pieceTitle}”` : "Reading"} · {L}/{MAX_LINES} voices
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

      {/* Form ribbon — the whole piece opening→end, one lane per voice showing
          its region and a live playhead of where it is reading right now. */}
      {L > 0 && (
        <div className="border-b border-border px-6 py-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
              the piece · opening
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
              end
            </span>
          </div>
          <div className="flex flex-col gap-1">
            {manuscript.map((line, li) => {
              const start = (li / L) * 100;
              const width = (1 / L) * 100;
              const dimmed = line.muted || (anySolo && !line.solo);
              return (
                <div
                  key={line.id}
                  className="relative h-3 overflow-hidden rounded-sm border border-border/60 bg-background/40"
                >
                  {/* region block for this line */}
                  <div
                    className="absolute inset-y-0 rounded-sm transition-[left,width] duration-500 ease-out"
                    style={{
                      left: `${start}%`,
                      width: `${width}%`,
                      background: dimmed
                        ? "hsl(272 30% 40% / 0.18)"
                        : "hsl(272 70% 55% / 0.28)",
                    }}
                  />
                  {/* live read playhead */}
                  <div
                    ref={(el) => {
                      if (el) headRefs.current.set(line.id, el);
                      else headRefs.current.delete(line.id);
                    }}
                    className="pointer-events-none absolute top-1/2 h-3 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{
                      left: `${start + width / 2}%`,
                      background: "hsl(272 95% 78%)",
                      boxShadow: "0 0 6px hsl(272 95% 72% / 0.8)",
                    }}
                  />
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
            The page is blank. Write a line and press Enter — it will begin the voyage
            at the opening of the piece; each line after it reads deeper.
          </p>
        ) : (
          manuscript.map((line, li) => {
            const { words } = parseLine(line.text);
            const dimmed = line.muted || (anySolo && !line.solo);
            return (
              <div key={line.id} className="group flex items-baseline gap-3 py-1.5">
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
            placeholder="Write a line, then press Enter — it reads deeper into the piece than the last…"
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
          Enter commits · adding a line re-slots the ensemble across the whole arc
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
                The manuscript is a <strong>voyage through the form</strong> of a
                single one of Karel&rsquo;s pieces. With <em>L</em> lines committed,
                line <em>N</em> reads only from region [<em>N</em>/<em>L</em>,{" "}
                (<em>N</em>+1)/<em>L</em>] of the recording&rsquo;s duration — so the
                top line reads the opening and the bottom line reads the close. Adding
                a line re-slots every voice, so the ensemble always spans the whole arc
                opening&nbsp;&rarr;&nbsp;end. Minute-5 genuinely differs from minute-1:
                the choir sweeps through the shape of his recording as you write.
              </p>
              <p>
                A repeated word never cuts the same grain twice. Its pitch, brightness
                and duration stay keyed to the word (so it keeps its identity), but the
                read offset advances a golden-ratio step every loop cycle, wrapping
                inside the line&rsquo;s region — so each loop breathes instead of
                ticking. Each line is placed in stereo, spread across the field by its
                position and vowel density, so the page reads as a choir, not a stack.
              </p>
              <p>
                The mapping is <strong>prosody</strong>, not meaning: a word&rsquo;s
                length sets its slice duration, its letters seed the offset inside the
                region, its vowel ratio opens a lowpass and nudges the transpose, and
                terminal punctuation adds accents and rests. Lines of different lengths
                loop at different cycles and phase against one another (Steve Reich).
              </p>
              <p>
                The ribbon above is a graphic score after Cardew&rsquo;s{" "}
                <em>Treatise</em>: each lane marks where its voice reads in the piece,
                with a live playhead of the grain sounding right now, and the sounding
                word in every line brightens in time with its loop. The whole score
                saves to your browser and encodes into the URL, so it can be shared and
                restored note-for-note.
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

      <PrototypeNav slugs={["16672-scriptorium"]} />
    </div>
  );
}
