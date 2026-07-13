"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildCodex, type Codex } from "./verse";
import { LectioSynth } from "./synth";
import { OnsetReader } from "./onset";
import { PrototypeNav } from "../_shared/prototype-nav";

// ════════════════════════════════════════════════════════════════════════════
// 1596 — lectio-verse
//
// THE QUESTION: "What if each struck note of a real piano recording turned the
// next word of a page of luminous scripture — so the performance literally
// reads the text aloud, one word per note?"
//
// A tall vertical CODEX COLUMN of seeded pseudo-scripture (verse.ts) lives in an
// ordinary Text node, painted near-invisible on a near-black page. A bright
// READING LIGHT illuminates one word at a time (hot head → dim afterglow trail
// above it) via the CSS Custom Highlight API: eight pre-registered buckets
// read0…read7, all motion from RE-RANGING real Range objects — zero per-glyph
// DOM. Each word it lands on is spoken by a just-intonation FM "reader" synth.
//
// SCORE-FOLLOWER (the headline): load a real piano recording and a spectral-flux
// onset detector (onset.ts) advances the reading light one word per detected
// note attack — the piano's phrasing drives the reading. With no file it
// self-reads on a seeded internal pulse, so it is never blank and never silent.
//
// Progressive enhancement: without CSS.highlights it falls back to real <span
// data-read> class-toggling; a live badge reports which path is running.
// Determinism: mulberry32 + performance.now only — no wall-clock entropy.
// ════════════════════════════════════════════════════════════════════════════

const SEED = 0x1596;
const WORD_COUNT = 260;
const PITCH_STEPS = 21; // JI.length (7) × 3 octaves — see synth.ts
const N_BUCKETS = 8;
const RD_CLASSES = Array.from({ length: N_BUCKETS }, (_, b) => `rd${b}`);

// hot head (candlelight gold) → dim amber afterglow trail
const HL_COLORS = [
  "#fff6df",
  "#ffe7b0",
  "#f6cf85",
  "#e0b164",
  "#c1904b",
  "#9d7038",
  "#775229",
  "#54391c",
];
const HL_SHADOW = [
  "0 0 12px rgba(255,222,150,.72), 0 0 26px rgba(255,196,110,.4)",
  "0 0 8px rgba(255,214,140,.5)",
  "0 0 5px rgba(240,190,120,.32)",
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
const SUPPORTS_HL = typeof HighlightRef !== "undefined" && !!highlightsRegistry;

export default function Page() {
  const [ready, setReady] = useState(false);
  const [audioOn, setAudioOn] = useState(false);
  const [audioErr, setAudioErr] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [paused, setPaused] = useState(false);
  const [source, setSource] = useState<"pulse" | "onset">("pulse");
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // resolved after mount so SSR and first client render agree
  const [hlLabel, setHlLabel] = useState<string | null>(null);

  // imperative state (mutated per frame / advance, never triggers re-render)
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const textElRef = useRef<HTMLDivElement | null>(null);
  const codexRef = useRef<Codex | null>(null);
  const wordSpansRef = useRef<HTMLSpanElement[]>([]);
  const hlRef = useRef<HighlightLike[]>([]);
  const litRef = useRef<number[]>([]);
  const headRef = useRef<number>(0);
  const lastAdvanceRef = useRef<number>(0);
  const lastPulseRef = useRef<number>(0);
  const targetScrollRef = useRef<number>(0);
  const curScrollRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const reducedRef = useRef<boolean>(false);
  const pausedRef = useRef<boolean>(false);
  const sourceRef = useRef<"pulse" | "onset">("pulse");
  const synthRef = useRef<LectioSynth | null>(null);
  const onsetRef = useRef<OnsetReader | null>(null);
  const audioStartedRef = useRef<boolean>(false);

  // ── gesture-gated audio ─────────────────────────────────────────────────────
  const ensureAudio = useCallback(async (): Promise<boolean> => {
    if (audioStartedRef.current) return true;
    audioStartedRef.current = true;
    if (!synthRef.current) synthRef.current = new LectioSynth();
    try {
      await synthRef.current.start();
      setAudioOn(true);
      return true;
    } catch {
      setAudioErr("Audio is unavailable in this browser — the reading continues.");
      return false;
    }
  }, []);

  // ── paint the reading light: head brightest, trail fading above ─────────────
  const paintHead = useCallback((head: number) => {
    const codex = codexRef.current;
    if (!codex) return;
    const words = codex.words;

    if (SUPPORTS_HL) {
      const node = textElRef.current?.firstChild as Text | null;
      if (!node) return;
      const len = node.length;
      for (let b = 0; b < N_BUCKETS; b++) hlRef.current[b]?.clear();
      for (let k = 0; k < N_BUCKETS; k++) {
        const wi = head - k;
        if (wi < 0) break;
        const w = words[wi];
        const a = Math.max(0, Math.min(w.start, len));
        const e = Math.max(0, Math.min(w.end + w.tail.length, len));
        if (e <= a) continue;
        const r = new Range();
        r.setStart(node, a);
        r.setEnd(node, e);
        hlRef.current[k]?.add(r);
      }
    } else {
      const spans = wordSpansRef.current;
      for (const wi of litRef.current) {
        spans[wi]?.classList.remove(...RD_CLASSES);
      }
      const nowLit: number[] = [];
      for (let k = 0; k < N_BUCKETS; k++) {
        const wi = head - k;
        if (wi < 0) break;
        spans[wi]?.classList.add(`rd${k}`);
        nowLit.push(wi);
      }
      litRef.current = nowLit;
    }
  }, []);

  // ── recompute the scroll target so the head word sits mid-column ────────────
  const retarget = useCallback((head: number) => {
    const scroller = scrollerRef.current;
    const textEl = textElRef.current;
    if (!scroller || !textEl) return;
    const codex = codexRef.current;
    if (!codex) return;
    const w = codex.words[head];
    let contentY: number | null = null;
    const scRect = scroller.getBoundingClientRect();

    if (SUPPORTS_HL) {
      const node = textEl.firstChild as Text | null;
      if (node) {
        const r = new Range();
        r.setStart(node, Math.min(w.start, node.length));
        r.setEnd(node, Math.min(w.end, node.length));
        const rr = r.getBoundingClientRect();
        contentY = rr.top - scRect.top + curScrollRef.current + rr.height / 2;
      }
    } else {
      const span = wordSpansRef.current[head];
      if (span) contentY = span.offsetTop + span.offsetHeight / 2;
    }
    if (contentY == null) return;
    const maxScroll = Math.max(0, textEl.scrollHeight - scroller.clientHeight);
    let target = contentY - scroller.clientHeight / 2;
    target = Math.max(0, Math.min(maxScroll, target));
    targetScrollRef.current = target;
  }, []);

  // ── advance the reading light one word (rate-capped, sounds the word) ───────
  const advance = useCallback(
    (vel: number) => {
      const codex = codexRef.current;
      if (!codex) return;
      const now = performance.now();
      const minGap = reducedRef.current ? 320 : 70; // caps visual advance rate
      if (now - lastAdvanceRef.current < minGap) return;
      lastAdvanceRef.current = now;

      const head = (headRef.current + 1) % codex.words.length;
      headRef.current = head;
      synthRef.current?.speak(codex.words[head].pitch, vel);
      paintHead(head);
      retarget(head);
    },
    [paintHead, retarget]
  );

  // ── build the codex once, mount-only ────────────────────────────────────────
  useEffect(() => {
    reducedRef.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    setHlLabel(SUPPORTS_HL ? "native" : "fallback");
    codexRef.current = buildCodex(SEED, WORD_COUNT, PITCH_STEPS);
    setReady(true);
  }, []);

  // ── populate DOM + register buckets + run the reading loop ──────────────────
  useEffect(() => {
    if (!ready) return;
    const codex = codexRef.current;
    const textEl = textElRef.current;
    if (!codex || !textEl) return;

    // populate the codex text imperatively (React owns no children here)
    if (SUPPORTS_HL) {
      textEl.textContent = codex.text;
      if (HighlightRef && highlightsRegistry) {
        hlRef.current = [];
        for (let b = 0; b < N_BUCKETS; b++) {
          const h = new HighlightRef();
          h.priority = N_BUCKETS - b; // brighter head wins overlaps
          highlightsRegistry.set(`read${b}`, h);
          hlRef.current[b] = h;
        }
      }
    } else {
      // fallback: real <span data-read> per word (+ tail), separators as text
      textEl.textContent = "";
      const spans: HTMLSpanElement[] = [];
      const frag = document.createDocumentFragment();
      const words = codex.words;
      for (let i = 0; i < words.length; i++) {
        const w = words[i];
        const span = document.createElement("span");
        span.className = "lectio-word";
        span.setAttribute("data-read", "");
        span.textContent = w.text + w.tail;
        frag.appendChild(span);
        spans[i] = span;
        if (i < words.length - 1) {
          const nextNewLine = words[i + 1].line > w.line;
          frag.appendChild(document.createTextNode(nextNewLine ? "\n" : " "));
        }
      }
      textEl.appendChild(frag);
      wordSpansRef.current = spans;
    }

    headRef.current = 0;
    litRef.current = [];
    lastPulseRef.current = performance.now();
    lastAdvanceRef.current = 0;
    paintHead(0);
    retarget(0);
    curScrollRef.current = targetScrollRef.current;

    const frame = () => {
      const now = performance.now();
      const reduced = reducedRef.current;

      if (!pausedRef.current) {
        const onset = onsetRef.current;
        if (sourceRef.current === "onset" && onset && onset.active) {
          // one word per detected note attack
          if (onset.update()) advance(0.55 + Math.min(0.45, onset.level * 6));
        } else {
          // hands-free internal pulse (the seeded self-reading)
          const interval = reduced ? 900 : 520;
          if (now - lastPulseRef.current >= interval) {
            lastPulseRef.current = now;
            advance(0.8);
          }
        }
      }

      // ease the column toward the head word (gentle, never a strobe)
      const ease = reduced ? 0.16 : 0.11;
      const cur = curScrollRef.current;
      const next = cur + (targetScrollRef.current - cur) * ease;
      curScrollRef.current = next;
      textEl.style.transform = `translateY(${-next.toFixed(1)}px)`;

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (SUPPORTS_HL && highlightsRegistry) {
        for (let b = 0; b < N_BUCKETS; b++) highlightsRegistry.delete(`read${b}`);
      }
    };
  }, [ready, advance, paintHead, retarget]);

  // ── load an audio file → onset-driven reading ───────────────────────────────
  const loadFile = useCallback(
    async (file: File) => {
      setAudioErr(null);
      const ok = await ensureAudio();
      const synth = synthRef.current;
      if (!ok || !synth || !synth.context || !synth.externalInput) {
        setAudioErr("Audio is unavailable — the reading continues on its pulse.");
        return;
      }
      onsetRef.current?.dispose();
      const reader = new OnsetReader({
        ctx: synth.context,
        destination: synth.externalInput,
        onError: (m) => setAudioErr(m),
      });
      onsetRef.current = reader;
      await reader.load(file);
      if (reader.active) {
        setFileName(file.name);
        setSource("onset");
        sourceRef.current = "onset";
        synth.setDucked(true); // piano leads, synth becomes under-bed
      }
    },
    [ensureAudio]
  );

  // ── secondary keyboard affordance (space = pause/resume) ────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === " ") {
        e.preventDefault();
        void ensureAudio();
        pausedRef.current = !pausedRef.current;
        setPaused(pausedRef.current);
        lastPulseRef.current = performance.now();
      } else if (e.key === "ArrowRight" || e.key === "n") {
        // manual step — a keyboard reader for the text
        void ensureAudio();
        advance(0.8);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ensureAudio, advance]);

  // ── teardown on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      onsetRef.current?.dispose();
      onsetRef.current = null;
      void synthRef.current?.dispose();
      synthRef.current = null;
    };
  }, []);

  // drag-drop wiring
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void loadFile(file);
    },
    [loadFile]
  );

  // the <style> for buckets + fallback classes + codex floor
  const styleText = (() => {
    let s = `.lectio-scroller{font-family:var(--font-mono),ui-monospace,monospace;font-size:18px;line-height:30px;letter-spacing:0.02em;color:rgba(196,170,120,0.11);white-space:pre-wrap;}
.lectio-col{will-change:transform;}
.lectio-word{transition:color .18s ease, text-shadow .18s ease;}
`;
    for (let b = 0; b < N_BUCKETS; b++) {
      const rule = `color:${HL_COLORS[b]};text-shadow:${HL_SHADOW[b]};`;
      s += `::highlight(read${b}){${rule}}\n`;
      s += `.lectio-word.rd${b}{${rule}}\n`;
    }
    return s;
  })();

  return (
    <main
      className="relative h-screen w-screen overflow-hidden bg-black text-foreground"
      onDragOver={(e) => {
        e.preventDefault();
        if (!dragging) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <style>{styleText}</style>

      {/* the codex column — a tall page of dim seeded pseudo-scripture */}
      <div
        ref={scrollerRef}
        className="lectio-scroller pointer-events-none absolute inset-0 flex justify-center overflow-hidden px-6"
        aria-hidden
      >
        <div ref={textElRef} className="lectio-col max-w-[34rem]" />
      </div>

      {/* soft vignette top+bottom so the column reads as a lit page */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.95), rgba(0,0,0,0) 22%, rgba(0,0,0,0) 78%, rgba(0,0,0,0.95))",
        }}
        aria-hidden
      />

      {/* drop overlay */}
      {dragging && (
        <div
          data-chrome
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        >
          <p className="rounded-lg border border-primary/60 bg-background/80 px-6 py-4 text-base text-foreground">
            Drop a piano recording — its notes will read the verse.
          </p>
        </div>
      )}

      {/* live badges (top-right): highlight path + reading source */}
      <div
        data-chrome
        className="pointer-events-none absolute right-4 top-4 flex flex-col items-end gap-1.5"
      >
        <span className="rounded-md border border-border bg-background/70 px-2.5 py-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground backdrop-blur-sm">
          highlights: {hlLabel ?? "…"}
        </span>
        <span className="rounded-md border border-border bg-background/70 px-2.5 py-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground backdrop-blur-sm">
          reading: {source === "onset" ? "piano onsets" : "internal pulse"}
          {paused ? " · paused" : ""}
        </span>
      </div>

      {/* title + description (top-left) */}
      <div data-chrome className="pointer-events-none absolute left-4 top-4 max-w-sm">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Resonance · Dream Lab · 1596
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          lectio
        </h1>
        <p className="mt-2 text-base leading-relaxed text-muted-foreground">
          A page of luminous scripture read one word per struck note. Load a
          piano recording and its onsets advance the reading light — the
          performance reads the text aloud.
        </p>
        {audioErr && <p className="mt-3 text-sm text-destructive">{audioErr}</p>}
        {!audioErr && source === "onset" && fileName && (
          <p className="mt-3 truncate text-sm text-primary">
            reading to: {fileName}
          </p>
        )}
      </div>

      {/* controls (bottom-left) */}
      <div
        data-chrome
        className="absolute bottom-4 left-4 flex flex-wrap items-center gap-3"
      >
        {!audioOn && (
          <button
            onClick={() => void ensureAudio()}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Begin the reading
          </button>
        )}
        <label className="inline-flex min-h-[44px] cursor-pointer items-center rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          Load audio
          <input
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void loadFile(f);
              e.target.value = "";
            }}
          />
        </label>
        {audioOn && (
          <button
            onClick={() => {
              pausedRef.current = !pausedRef.current;
              setPaused(pausedRef.current);
              lastPulseRef.current = performance.now();
            }}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {paused ? "Resume" : "Pause"}
          </button>
        )}
        <button
          onClick={() => setShowNotes(true)}
          className="min-h-[44px] text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          Read the design notes
        </button>
      </div>

      {/* design-notes modal */}
      {showNotes && (
        <div
          data-chrome
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Design notes
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
              One note, one word
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                The whole page is real seeded pseudo-scripture living in an
                ordinary Text node, painted near-invisible. Using the{" "}
                <span className="text-foreground">CSS Custom Highlight API</span>,
                eight pre-registered buckets (candlelight head → dim afterglow)
                restyle moving character-ranges — a reading light gliding down the
                codex, with zero per-glyph DOM.
              </p>
              <p>
                Load a real piano recording and a{" "}
                <span className="text-foreground">spectral-flux onset detector</span>{" "}
                (Bello et al., 2005) advances the reading light one word per
                detected note attack, with an adaptive threshold and a refractory
                window. It is a lightweight cousin of real-time score-following —
                Online Time Warping (Dixon, 2005) and Matchmaker (2025) — reading
                a monotonic cursor from the performance rather than aligning to a
                known score.
              </p>
              <p>
                With no file it self-reads on a seeded internal pulse and a
                just-intonation FM voice speaks each word — never blank, never
                silent. Without the Highlight API it degrades to real{" "}
                <span className="text-foreground">&lt;span data-read&gt;</span>{" "}
                class-toggling. Space pauses; → steps a word by hand. Cycle-2 of
                the 1588 banked plan; cycle-3 folds in Karel&apos;s recorded Path
                piano.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-6 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
      <PrototypeNav slugs={["1596-lectio-verse"]} />
    </main>
  );
}
