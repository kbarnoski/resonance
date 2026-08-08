"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  FormEvent as ReactFormEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { VerseEngine, classify, contextFor, type VoiceHandle } from "./audio-engine";

// --- seeded PRNG (no Math.random / Date allowed) ----------------------------
function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// deterministic per-glyph jitter so entrance motion is stable across renders
function glyphSeed(i: number): number {
  let x = (i * 2654435761) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 2246822519);
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}

const PASSAGE = [
  "in the hush of typing, each letter finds a voice.",
  "vowels bloom and hold; consonants fall like rain.",
  "the sentence learns to sing itself, slowly.",
  "write, and the page becomes a score.",
].join("\n");

const MAX_CHARS = 600;

function ghostDelay(ch: string, r: number): number {
  if (ch === "\n") return 620 + r * 120;
  if (ch === " ") return 120 + r * 60;
  if (ch === "." ) return 520 + r * 160;
  if (ch === "," || ch === ";" || ch === ":") return 320 + r * 120;
  if (ch === "!" || ch === "?") return 420 + r * 140;
  return 78 + r * 60;
}

type GhostPhase = "type" | "hold" | "erase" | "rest";

export default function VerseCastPage() {
  const [text, setText] = useState("");
  const [audioReady, setAudioReady] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [userActive, setUserActive] = useState(false);
  const [reduced, setReduced] = useState(false);

  const engineRef = useRef<VerseEngine | null>(null);
  const rngRef = useRef<() => number>(mulberry32(0x9e3779b9));
  const textRef = useRef("");
  const voiceStackRef = useRef<VoiceHandle[]>([]);
  const userActiveRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const ghostRef = useRef<{ phase: GhostPhase; idx: number; nextAt: number }>(
    { phase: "type", idx: 0, nextAt: 0 },
  );
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // lazily create the engine (no AudioContext until a user gesture)
  const engine = () => {
    if (!engineRef.current) engineRef.current = new VerseEngine(rngRef.current);
    return engineRef.current;
  };

  // --- model mutations (shared by ghost writer and the visitor) -------------
  const appendChar = useCallback((ch: string) => {
    if (textRef.current.length >= MAX_CHARS) {
      textRef.current = textRef.current.slice(textRef.current.length - MAX_CHARS + 1);
      voiceStackRef.current = voiceStackRef.current.slice(-(MAX_CHARS - 1));
    }
    const cx = contextFor(textRef.current);
    const eng = engineRef.current;
    const handle = eng && eng.available ? eng.trigger(ch, cx) : null;
    voiceStackRef.current.push(handle);
    textRef.current += ch;
    setText(textRef.current);
  }, []);

  const backspace = useCallback(() => {
    if (textRef.current.length === 0) return;
    const handle = voiceStackRef.current.pop();
    handle?.release?.();
    textRef.current = textRef.current.slice(0, -1);
    setText(textRef.current);
  }, []);

  const markActive = useCallback(() => {
    if (!userActiveRef.current) {
      userActiveRef.current = true;
      setUserActive(true);
    }
  }, []);

  const ensureAudio = useCallback(async () => {
    const eng = engine();
    const ok = await eng.unlock();
    if (ok) {
      setAudioReady(true);
      setAudioError(false);
    } else {
      setAudioError(true);
    }
  }, []);

  // --- reduced motion --------------------------------------------------------
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // --- ghost writer + rAF loop (visual self-demo within ~1s) -----------------
  useEffect(() => {
    ghostRef.current = { phase: "type", idx: 0, nextAt: performance.now() + 700 };
    const tick = (now: number) => {
      if (!userActiveRef.current) {
        const g = ghostRef.current;
        if (now >= g.nextAt) {
          const r = rngRef.current();
          if (g.phase === "type") {
            if (g.idx >= PASSAGE.length) {
              g.phase = "hold";
              g.nextAt = now + 3600;
            } else {
              const ch = PASSAGE[g.idx++];
              appendChar(ch);
              g.nextAt = now + ghostDelay(ch, r);
            }
          } else if (g.phase === "hold") {
            g.phase = "erase";
            g.nextAt = now;
          } else if (g.phase === "erase") {
            if (textRef.current.length === 0) {
              g.phase = "rest";
              g.nextAt = now + 950;
            } else {
              backspace();
              g.nextAt = now + 42 + r * 34;
            }
          } else if (g.phase === "rest") {
            g.phase = "type";
            g.idx = 0;
            g.nextAt = now;
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [appendChar, backspace]);

  // --- teardown --------------------------------------------------------------
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      voiceStackRef.current = [];
      engineRef.current?.close();
      engineRef.current = null;
    };
  }, []);

  // --- input handling --------------------------------------------------------
  const onKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "Backspace") {
      e.preventDefault();
      markActive();
      backspace();
    } else if (e.key === "Enter") {
      e.preventDefault();
      markActive();
      appendChar("\n");
    } else if (e.key.length === 1) {
      e.preventDefault();
      markActive();
      appendChar(e.key);
    }
  };

  // mobile / IME fallback (keydown reports "Unidentified" there)
  const onBeforeInput = (e: ReactFormEvent<HTMLTextAreaElement>) => {
    const ie = e.nativeEvent as InputEvent;
    if (ie.inputType === "insertText" && ie.data) {
      e.preventDefault();
      markActive();
      for (const ch of ie.data) appendChar(ch);
    } else if (
      ie.inputType === "deleteContentBackward" ||
      ie.inputType === "deleteContent"
    ) {
      e.preventDefault();
      markActive();
      backspace();
    }
  };

  const onFieldPointerDown = () => {
    markActive();
    if (!audioReady && !audioError) void ensureAudio();
    textareaRef.current?.focus();
  };

  // --- derived glyph model ---------------------------------------------------
  const lines = useMemo(() => {
    const raw = text.split("\n");
    let gi = 0;
    return raw.map((line) => {
      const chars = Array.from(line).map((ch) => {
        const info = classify(ch);
        return { ch, role: info.role, idx: gi++ };
      });
      // account for the newline character in the running index
      gi += 1;
      return chars;
    });
  }, [text]);
  const total = text.length;

  return (
    <main className="relative flex min-h-screen flex-col bg-background text-foreground">
      <style>{styles}</style>

      {/* header / chrome */}
      <header className="z-10 flex flex-col gap-2 px-6 pt-6 sm:px-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Dream lab · 8264
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              VerseCast
            </h1>
            <p className="mt-1 max-w-xl text-base text-muted-foreground">
              Type prose and the words become the score — every keystroke a
              voice, the living typography its only notation.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] shrink-0 rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-3">
          {!audioReady && (
            <button
              type="button"
              onClick={() => void ensureAudio()}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Begin
            </button>
          )}
          <p className="text-sm text-muted-foreground">
            {audioReady
              ? userActive
                ? "Your composition — keep typing, backspace to erase a voice."
                : "Listening to the ghost writer… click the field to take over."
              : "Press Begin to unlock sound, then click the field and write."}
          </p>
          {audioError && (
            <p className="text-sm text-destructive">
              Web Audio is unavailable — the typography still writes itself, but
              there will be no sound.
            </p>
          )}
        </div>
      </header>

      {/* the composition field: the living typography IS the picture */}
      <section
        onPointerDown={onFieldPointerDown}
        className="relative mx-4 mt-6 mb-2 flex-1 cursor-text overflow-hidden rounded-lg border border-border sm:mx-10"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 0%, oklch(0.24 0.03 285) 0%, oklch(0.16 0.015 285) 45%, oklch(0.13 0.01 285) 100%)",
        }}
        aria-label="Typographic composition field. Click and type."
      >
        <div
          className={`vc-field ${reduced ? "vc-reduced" : ""}`}
          data-reduced={reduced}
        >
          {lines.map((chars, li) => (
            <div
              key={li}
              className="vc-line"
              style={{ animationDelay: `${(li % 6) * 0.7}s` }}
            >
              {chars.map((g) => {
                const age = total - 1 - g.idx;
                const seed = glyphSeed(g.idx);
                const hot = age < 10;
                const opacity =
                  0.42 + (age < 44 ? ((44 - Math.max(age, 0)) / 44) * 0.58 : 0);
                const rot = (seed - 0.5) * (reduced ? 2 : 7);
                const cls = ["vc-glyph", `vc-${g.role}`];
                if (hot) cls.push("vc-hot");
                if (hot && g.role === "vowel" && !reduced) cls.push("vc-pulse");
                const gstyle = {
                  opacity,
                  // seeded, deterministic entrance (CSS vars feed the keyframe)
                  "--rot": `${rot}deg`,
                  "--dx": `${(seed - 0.5) * (reduced ? 3 : 10)}px`,
                } as CSSProperties;
                return (
                  <span key={g.idx} className={cls.join(" ")} style={gstyle}>
                    {g.ch === " " ? " " : g.ch}
                  </span>
                );
              })}
              {li === lines.length - 1 && (
                <span className={`vc-caret ${reduced ? "vc-caret-steady" : ""}`} />
              )}
            </div>
          ))}
        </div>

        {/* transparent capture surface — receives keystrokes; we draw glyphs */}
        <textarea
          ref={textareaRef}
          value=""
          onChange={() => {
            /* controlled-empty: model lives in textRef */
          }}
          onKeyDown={onKeyDown}
          onBeforeInput={onBeforeInput}
          onFocus={markActive}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          aria-label="Type here to compose"
          className="absolute inset-0 h-full w-full resize-none bg-transparent p-6 text-transparent caret-transparent outline-none sm:p-10"
        />
      </section>

      {/* legend */}
      <footer className="z-10 flex flex-wrap items-center gap-x-5 gap-y-1 px-6 pb-16 pt-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground sm:px-10">
        <span>
          <span className="vc-key-vowel">vowel</span> = held pitch
        </span>
        <span>
          <span className="vc-key-cons">consonant</span> = attack
        </span>
        <span>
          <span className="vc-key-punct">. , ? !</span> = cadence / rest
        </span>
        <span>line break = new register</span>
      </footer>

      {/* notes overlay */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">
              VerseCast — design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                The question: <em>what if the words you type were the score</em>
                {" "}— each keystroke a voice, the sentence a polyphony, and the
                typography itself the only picture?
              </p>
              <p>
                Every character is analysed and sonified the instant you press
                it. Vowels open sustained pitches drawn from a warm minor
                scale; consonants are transient attacks (voiced letters pluck,
                unvoiced letters click); punctuation resolves into soft
                cadences and rests; a line break shifts the register so stacked
                lines voice as interlocking parts. The word you are in sets each
                held note&apos;s phrase length. Backspace silences the most
                recent voice.
              </p>
              <p>
                There is no canvas and no WebGL here: the picture is real HTML —
                each glyph a <code>&lt;span&gt;</code> animated purely with CSS
                transforms, opacity and transitions. The text you write is at
                once the composition and its notation.
              </p>
              <p>
                Reference: Apollinaire&apos;s <em>Calligrammes</em> and the
                concrete-poetry tradition, where the arrangement of type <em>is</em>
                {" "}the artwork — kin to the 2026 wave of type-to-compose tools.
              </p>
              <p className="text-muted-foreground/70">
                Reviewed on a muted phone? A seeded ghost writer starts
                composing on its own within a second, then yields the moment you
                touch the field.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["8264-versecast"]} />
    </main>
  );
}

const styles = `
.vc-field {
  position: absolute;
  inset: 0;
  padding: 1.5rem;
  overflow: auto;
  font-family: var(--font-sans), system-ui, sans-serif;
  font-size: clamp(1.4rem, 3.4vw, 2.6rem);
  line-height: 1.5;
  letter-spacing: 0.01em;
  animation: vc-breathe 9s ease-in-out infinite;
  transform-origin: 50% 30%;
}
@media (min-width: 640px) { .vc-field { padding: 2.5rem; } }
.vc-line {
  display: block;
  animation: vc-sway 11s ease-in-out infinite;
  will-change: transform;
}
.vc-glyph {
  display: inline-block;
  white-space: pre;
  transform: translate(var(--dx, 0), 0) rotate(var(--rot, 0deg));
  transition: opacity 1.2s ease, color 1.2s ease, text-shadow 1.2s ease;
  animation: vc-in 0.55s cubic-bezier(0.2, 0.9, 0.25, 1) both;
}
.vc-vowel { color: oklch(0.86 0.09 300); }
.vc-consonant { color: oklch(0.9 0.02 90); }
.vc-punct { color: oklch(0.7 0.06 300); }
.vc-space { color: transparent; }
.vc-newline { color: transparent; }
.vc-hot.vc-vowel {
  color: oklch(0.93 0.13 300);
  text-shadow: 0 0 18px oklch(0.72 0.2 300 / 0.65), 0 0 4px oklch(0.85 0.15 300 / 0.7);
}
.vc-hot.vc-consonant {
  color: oklch(0.97 0.03 85);
  text-shadow: 0 0 12px oklch(0.85 0.06 85 / 0.35);
}
.vc-hot.vc-punct {
  color: oklch(0.82 0.1 300);
  text-shadow: 0 0 12px oklch(0.7 0.14 300 / 0.4);
}
.vc-pulse { animation: vc-in 0.55s cubic-bezier(0.2,0.9,0.25,1) both, vc-vowelpulse 2.1s ease-in-out 0.55s infinite; }
.vc-caret {
  display: inline-block;
  width: 0.12em;
  height: 1.05em;
  vertical-align: -0.14em;
  margin-left: 0.04em;
  background: oklch(0.75 0.2 300);
  box-shadow: 0 0 12px oklch(0.72 0.2 300 / 0.7);
  animation: vc-blink 1.05s steps(1, end) infinite;
}
.vc-caret-steady { animation: none; opacity: 0.85; }
.vc-key-vowel { color: oklch(0.86 0.09 300); }
.vc-key-cons { color: oklch(0.9 0.02 90); }
.vc-key-punct { color: oklch(0.7 0.06 300); }

@keyframes vc-in {
  from { opacity: 0; transform: translate(var(--dx, 0), 0.7em) rotate(calc(var(--rot, 0deg) * 2.2)) scale(0.7); }
  to   { transform: translate(var(--dx, 0), 0) rotate(var(--rot, 0deg)) scale(1); }
}
@keyframes vc-vowelpulse {
  0%, 100% { transform: translate(var(--dx,0),0) rotate(var(--rot,0deg)) scale(1); }
  50% { transform: translate(var(--dx,0), -0.06em) rotate(var(--rot,0deg)) scale(1.08); }
}
@keyframes vc-breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.014); }
}
@keyframes vc-sway {
  0%, 100% { transform: translateX(0); }
  50% { transform: translateX(0.5%); }
}
@keyframes vc-blink { 0%, 55% { opacity: 1; } 56%, 100% { opacity: 0; } }

.vc-reduced { animation: none; }
.vc-reduced .vc-line { animation: none; }
@media (prefers-reduced-motion: reduce) {
  .vc-field, .vc-line { animation: none !important; }
  .vc-glyph { animation-duration: 0.2s; transition-duration: 0.3s; }
  .vc-pulse { animation: vc-in 0.2s both; }
  .vc-caret { animation: none; opacity: 0.85; }
}
`;
